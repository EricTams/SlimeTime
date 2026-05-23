import type {
  DamageEvent,
  MazeGrid,
  RenderShotEffect,
  RenderSnapshot,
  SlimeUnit,
  Vector2,
} from '../sim/types';
import { World } from '../sim/world';
import { ABILITY_DEFINITIONS, AbilitySystem, type AbilityKind } from './abilities';
import {
  ARCHETYPES,
  type ArchetypeId,
} from './archetypes';
import {
  ChargeSystem,
  buildRuntimeState,
  defaultToolMods,
  type ToolDefinition,
  type ToolUpgradeMods,
} from './chargeSystem';
import {
  computePayout,
  emptyRunStats,
  recordKill,
  type RunPayout,
  type RunStats,
} from './economy';
import type { LevelDefinition } from './levels';
import {
  STRUCTURE_DEFINITIONS,
  attachGremlinIfPossible,
  bestSightlineDirection,
  canPlaceStructure,
  createStructureInstance,
  flowBiasSourcesFor,
  progressGremlinAttacks,
  shooGremlinFromStructure,
  tickStructures,
  type StructureDefinition,
  type StructureInstance,
  type StructureShot,
} from './structures';
import { WaveScheduler } from './waveScheduler';
import type { MetaProgress } from './metaProgress';
import { modsForTool } from './upgradeTree';
import { positionToCell } from '../sim/maze';

export type RunPhase =
  | 'prePlacement'
  | 'awaitingFirstWave'
  | 'inWave'
  | 'paused'
  | 'won'
  | 'lost';

export interface RunStateSnapshot {
  phase: RunPhase;
  level: LevelDefinition;
  stats: RunStats;
  alive: number;
  exited: number;
  wave: number;
  totalWaves: number;
  countdown: number;
  outcome?: { win: boolean; payout: RunPayout };
}

export interface ToolBarEntry {
  toolId: string;
  category: 'structure' | 'ability';
  label: string;
  icon: string;
  color: number;
  charges: number;
  maxCharges: number;
  chargeProgress: number;
  chargeTime: number;
  unlocked: boolean;
}

export interface RunControllerOptions {
  level: LevelDefinition;
  meta: MetaProgress;
  /** Optional override for unlocked tools (used in tutorials). */
  forceUnlocked?: ReadonlySet<string>;
  /** Optional pre-placement requirement override. */
  prePlacementToolId?: string;
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  ...Object.values(STRUCTURE_DEFINITIONS),
  ...Object.values(ABILITY_DEFINITIONS),
];

const TOOL_DEFINITION_INDEX: Map<string, ToolDefinition> = new Map(TOOL_DEFINITIONS.map((def) => [def.id, def]));

export class RunController {
  readonly level: LevelDefinition;
  readonly maze: MazeGrid;
  readonly world: World;
  readonly chargeSystem: ChargeSystem;
  readonly abilitySystem: AbilitySystem;
  private readonly waveScheduler: WaveScheduler;
  private readonly meta: MetaProgress;
  private readonly stats: RunStats;
  private structures: StructureInstance[] = [];
  private nextStructureId = 1;
  private shotEffects: RenderShotEffect[] = [];
  private phase: RunPhase = 'prePlacement';
  private placementSatisfied = false;
  private snapshot: RenderSnapshot;
  private structureLostFlag = false;
  private soldStructureFlag = false;
  private elapsedSeconds = 0;
  private totalShellCount = 0;
  private shellPoppedCount = 0;
  private outcome?: { win: boolean; payout: RunPayout };
  private readonly flags: ReadonlySet<string>;
  private readonly unlocked: Set<string>;

  constructor(options: RunControllerOptions) {
    this.level = options.level;
    this.maze = options.level.buildMaze();
    this.meta = options.meta;
    this.flags = options.meta.flags();
    this.stats = emptyRunStats(options.level.waves.length, options.level.leakBudget);

    this.unlocked = new Set(options.forceUnlocked ?? options.meta.unlockedTools());
    if (options.level.giftPinpricker) {
      this.unlocked.add('pinpricker');
    }

    this.world = new World({
      maze: this.maze,
      units: [],
      seed: 7,
      onKill: (event) => this.handleKill(event),
      onLeak: () => this.handleLeak(),
      onWallBroken: (cell) => this.handleWallBroken(cell),
      onArchetypeMutated: () => undefined,
    });

    this.chargeSystem = new ChargeSystem();
    const aggregate = options.meta.aggregatedMods();
    for (const def of TOOL_DEFINITIONS) {
      const isUnlocked = this.unlocked.has(def.id);
      const mods: ToolUpgradeMods = isUnlocked ? modsForTool(def.id, aggregate) : defaultToolMods();
      this.chargeSystem.registerTool(buildRuntimeState(def, mods, isUnlocked));
    }

    this.abilitySystem = new AbilitySystem();
    this.waveScheduler = new WaveScheduler({
      level: options.level,
      maze: this.maze,
      preWaveCountdownSeconds: 6,
      events: {
        onSpawn: (unit) => {
          this.world.units.push(unit);
          if (unit.archetype === 'cocoon') {
            this.totalShellCount += 1;
          }
        },
        onWaveStarted: () => {
          this.phase = 'inWave';
        },
        onWaveCompleted: (waveIndex) => {
          this.stats.wavesCleared = Math.max(this.stats.wavesCleared, waveIndex + 1);
          this.checkWinCondition();
        },
        onAllWavesCompleted: () => {
          // Win condition is verified by `checkWinCondition` once the field is empty.
        },
      },
    });

    if (options.level.prePlacementToolId) {
      this.phase = 'prePlacement';
      this.placementSatisfied = false;
    } else {
      this.phase = 'awaitingFirstWave';
      this.placementSatisfied = true;
    }
    this.snapshot = this.world.createSnapshot();
  }

  step(dt: number): void {
    if (this.phase === 'won' || this.phase === 'lost' || this.phase === 'paused') {
      this.snapshot = this.world.createSnapshot();
      return;
    }
    this.elapsedSeconds += dt;

    if (this.phase === 'prePlacement') {
      // Hold the simulation while the player completes pre-placement.
      this.snapshot = this.world.createSnapshot();
      return;
    }

    this.chargeSystem.tick(dt);

    if (this.placementSatisfied && this.phase === 'awaitingFirstWave') {
      this.phase = 'inWave';
    }

    this.waveScheduler.step(dt, this.world.units.length);

    progressGremlinAttacks(this.structures, this.world.units, dt);
    this.handleGremlinAttachments();

    const events: DamageEvent[] = [];
    const shots: StructureShot[] = [];
    const pressFreezeBonus = this.flags.has('capstone.pressCombo');
    tickStructures(this.structures, {
      maze: this.maze,
      units: this.world.units,
      dt,
      events,
      shots,
      spawnProjectile: (spec) => this.world.spawnProjectile(spec),
      pressFrozenSquishedMultiplier: pressFreezeBonus ? 3 : 1,
    });
    this.recordShotEffects(shots);
    const abilityEvents = this.abilitySystem.tick(dt, this.world.getCurrentTime());
    events.push(...abilityEvents);

    this.world.setFlowBiasSources(flowBiasSourcesFor(this.structures));
    this.snapshot = this.world.step(dt, events);

    this.applySustainCapstone();

    this.removeDeadStructures();
    if (this.waveScheduler.isComplete() && this.world.units.length === 0) {
      this.checkWinCondition();
    }
    if (this.stats.leaks > this.level.leakBudget) {
      this.completeRun(false);
    }
  }

  private applySustainCapstone(): void {
    if (!this.flags.has('capstone.sustain')) {
      return;
    }
    for (const tool of this.chargeSystem.tools.values()) {
      if (tool.unlocked && tool.charges < 1) {
        tool.charges = 1;
      }
    }
  }

  private handleGremlinAttachments(): void {
    for (const unit of this.world.units) {
      if (unit.archetype !== 'gremlin') {
        continue;
      }
      attachGremlinIfPossible(this.structures, unit, this.maze.tileSize);
    }
  }

  private handleKill(event: { archetype: ArchetypeId; unitId: number }): void {
    recordKill(this.stats, event.archetype);
    this.chargeSystem.applyKillMomentum();
    if (event.archetype === 'cocoon') {
      this.shellPoppedCount += 1;
    }
  }

  private handleLeak(): void {
    this.stats.leaks += 1;
  }

  private handleWallBroken(cell: { x: number; y: number }): void {
    for (const structure of this.structures) {
      if (structure.alive && structure.cell.x === cell.x && structure.cell.y === cell.y) {
        structure.alive = false;
      }
    }
  }

  private recordShotEffects(shots: readonly StructureShot[]): void {
    if (shots.length === 0 && this.shotEffects.length === 0) {
      return;
    }
    const now = this.world.getCurrentTime();
    for (const shot of shots) {
      this.shotEffects.push({
        kind: shot.kind,
        origin: shot.origin,
        target: shot.target,
        radius: shot.radius,
        color: shot.color,
        startedAt: now,
        duration: shot.duration,
      });
    }
    this.shotEffects = this.shotEffects.filter((effect) => effect.startedAt + effect.duration > now);
  }

  private removeDeadStructures(): void {
    for (let i = this.structures.length - 1; i >= 0; i -= 1) {
      if (!this.structures[i].alive) {
        this.structureLostFlag = true;
        this.structures.splice(i, 1);
      }
    }
  }

  private checkWinCondition(): void {
    if (this.phase === 'won' || this.phase === 'lost') {
      return;
    }
    if (this.waveScheduler.isComplete() && this.world.units.length === 0) {
      this.completeRun(true);
    }
  }

  private completeRun(win: boolean): void {
    if (this.phase === 'won' || this.phase === 'lost') {
      return;
    }
    this.evaluateBonusObjective(win);
    const payout = computePayout({
      win,
      stats: this.stats,
      isLevelZero: this.level.isTutorial === true,
      priorClears: this.meta.clearsForLevel(this.level.id),
      economyMods: this.meta.economyMods(),
    });
    if (win) {
      this.meta.recordClear(this.level.id);
      this.meta.setBestRun(this.level.id, this.stats.leaks, this.stats.bonusObjectiveAchieved);
    }
    this.meta.awardGoo(payout.goo);
    this.meta.awardCores(payout.cores);
    if (this.level.isTutorial) {
      this.meta.markIntroSeen();
    }
    this.outcome = { win, payout };
    this.phase = win ? 'won' : 'lost';
  }

  private evaluateBonusObjective(win: boolean): void {
    if (!win) {
      this.stats.bonusObjectiveAchieved = false;
      return;
    }
    switch (this.level.bonus.kind) {
      case 'noLeaks':
        this.stats.bonusObjectiveAchieved = this.stats.leaks === 0;
        break;
      case 'noStructureLost':
        this.stats.bonusObjectiveAchieved = !this.structureLostFlag;
        break;
      case 'noSell':
        this.stats.bonusObjectiveAchieved = !this.soldStructureFlag;
        break;
      case 'underTime':
        this.stats.bonusObjectiveAchieved = this.elapsedSeconds <= (this.level.bonus.value ?? 999);
        break;
      case 'killAllShells':
        this.stats.bonusObjectiveAchieved = this.totalShellCount > 0 && this.shellPoppedCount >= this.totalShellCount;
        break;
    }
  }

  // ---- Player actions ----

  /** Try to place a structure at the given tile cell. */
  placeStructure(toolId: string, cell: Vector2): { ok: boolean; reason?: string } {
    const def = TOOL_DEFINITION_INDEX.get(toolId) as StructureDefinition | undefined;
    if (!def || def.category !== 'structure') {
      return { ok: false, reason: 'Not a structure.' };
    }
    if (!this.unlocked.has(toolId)) {
      return { ok: false, reason: 'Tool is locked.' };
    }
    if (!this.chargeSystem.canSpend(toolId)) {
      return { ok: false, reason: 'Out of charges.' };
    }
    const placement = canPlaceStructure(def, this.maze, cell, this.structures);
    if (!placement.ok) {
      return placement;
    }
    if (!this.chargeSystem.spend(toolId)) {
      return { ok: false, reason: 'Could not consume charge.' };
    }
    const tool = this.chargeSystem.tools.get(toolId)!;
    const instance = createStructureInstance(
      def,
      cell,
      this.maze,
      tool.stats as Record<string, number>,
      `s-${this.nextStructureId++}`,
    );
    if (def.kind === 'sniper') {
      instance.direction = bestSightlineDirection(this.maze, cell);
    }
    this.structures.push(instance);

    if (this.phase === 'prePlacement' && this.level.prePlacementToolId === toolId) {
      this.placementSatisfied = true;
      this.phase = 'awaitingFirstWave';
    }
    return { ok: true };
  }

  /** Sell a structure for a partial charge refund. */
  sellStructure(instanceId: string): boolean {
    const index = this.structures.findIndex((s) => s.instanceId === instanceId);
    if (index === -1) {
      return false;
    }
    const structure = this.structures[index];
    this.chargeSystem.refundFraction(structure.toolId);
    this.soldStructureFlag = true;
    this.structures.splice(index, 1);
    return true;
  }

  /** Sell whichever structure occupies the given cell, if any. */
  sellStructureAtCell(cell: Vector2): boolean {
    const structure = this.structures.find(
      (s) => s.alive && s.cell.x === cell.x && s.cell.y === cell.y,
    );
    if (!structure) {
      return false;
    }
    return this.sellStructure(structure.instanceId);
  }

  /** Click a structure to shoo a gremlin off it (returns true if shooed). */
  shooGremlinAtCell(cell: Vector2): boolean {
    const cellPosition = {
      x: cell.x * this.maze.tileSize + this.maze.tileSize / 2,
      y: cell.y * this.maze.tileSize + this.maze.tileSize / 2,
    };
    return shooGremlinFromStructure(this.structures, cellPosition, this.world.units, this.maze);
  }

  /** Trigger an ability at the given world position. */
  triggerAbility(toolId: string, target: Vector2, aim?: Vector2): { ok: boolean; reason?: string } {
    const def = ABILITY_DEFINITIONS[toolId as AbilityKind];
    if (!def) {
      return { ok: false, reason: 'Not an ability.' };
    }
    if (!this.unlocked.has(toolId)) {
      return { ok: false, reason: 'Tool is locked.' };
    }
    if (!this.chargeSystem.canSpend(toolId)) {
      return { ok: false, reason: 'Out of charges.' };
    }
    if (!this.chargeSystem.spend(toolId)) {
      return { ok: false, reason: 'Could not consume charge.' };
    }
    const tool = this.chargeSystem.tools.get(toolId)!;
    const result = this.abilitySystem.activate(
      { kind: def.kind, point: target, aim },
      {
        maze: this.maze,
        flowField: this.world.flowField,
        currentTime: this.world.getCurrentTime(),
        stats: tool.stats as Record<string, number>,
      },
    );
    this.world.step(0, result.immediateEvents);
    return { ok: true };
  }

  pause(): void {
    if (this.phase !== 'won' && this.phase !== 'lost') {
      this.phase = 'paused';
    }
  }

  resume(): void {
    if (this.phase === 'paused') {
      this.phase = this.placementSatisfied ? (this.world.units.length > 0 ? 'inWave' : 'awaitingFirstWave') : 'prePlacement';
    }
  }

  // ---- Read-only views ----

  getSnapshot(): RenderSnapshot {
    return this.snapshot;
  }

  getPhase(): RunPhase {
    return this.phase;
  }

  getStats(): RunStats {
    return this.stats;
  }

  getOutcome(): { win: boolean; payout: RunPayout } | undefined {
    return this.outcome;
  }

  getStructures(): readonly StructureInstance[] {
    return this.structures;
  }

  getActiveAbilityVisuals() {
    return this.abilitySystem.snapshot();
  }

  getShotEffects(): readonly RenderShotEffect[] {
    return this.shotEffects;
  }

  buildToolBar(): ToolBarEntry[] {
    const entries: ToolBarEntry[] = [];
    for (const def of TOOL_DEFINITIONS) {
      const runtime = this.chargeSystem.tools.get(def.id);
      if (!runtime || !runtime.unlocked) {
        continue;
      }
      entries.push({
        toolId: def.id,
        category: def.category,
        label: def.label,
        icon: 'icon' in def ? (def as { icon: string }).icon : '?',
        color: 'color' in def ? (def as { color: number }).color : 0xffffff,
        charges: runtime.charges,
        maxCharges: runtime.maxCharges,
        chargeProgress: runtime.chargeProgress,
        chargeTime: runtime.chargeTime,
        unlocked: runtime.unlocked,
      });
    }
    return entries;
  }

  getRunStateSnapshot(): RunStateSnapshot {
    return {
      phase: this.phase,
      level: this.level,
      stats: this.stats,
      alive: this.world.units.length,
      exited: this.snapshot.exitedCount,
      wave: this.waveScheduler.currentWaveNumber,
      totalWaves: this.waveScheduler.totalWaves,
      countdown: this.waveScheduler.countdownRemaining,
      outcome: this.outcome,
    };
  }

  /** Convenience: convert world position to cell coordinates. */
  worldToCell(point: Vector2): Vector2 {
    return positionToCell(this.maze, point.x, point.y);
  }

  /** Confirms tool is currently usable (unlocked + has charge). */
  isToolReady(toolId: string): boolean {
    const tool = this.chargeSystem.tools.get(toolId);
    if (!tool) {
      return false;
    }
    return tool.unlocked && tool.charges >= tool.spendCostMultiplier;
  }

  /** Returns the archetype display info, used by the HUD wave preview. */
  archetypeLabel(archetype: ArchetypeId): string {
    return ARCHETYPES[archetype].label;
  }

  /** Returns a preview of an upcoming wave (offset 0 = current/next). */
  previewWave(offset = 0) {
    return this.waveScheduler.preview(offset);
  }
}
