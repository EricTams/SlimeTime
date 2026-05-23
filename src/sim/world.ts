import { DensityField } from './densityField';
import { FlowField } from './flowField';
import {
  cellCenter,
  cellIndex,
  isInsideMaze,
  isWallAtWorld,
  isWallCell,
  positionToCell,
} from './maze';
import { SeededRandom } from './rng';
import { SpatialHash } from './spatialHash';
import type {
  AoEDamageEvent,
  DamageEvent,
  DotEvent,
  FlowBiasEvent,
  FreezeEvent,
  GooSplat,
  HealEvent,
  LineDamageEvent,
  MazeGrid,
  PercentHpDamageEvent,
  ProjectileKind,
  ProjectileSpawnSpec,
  RayDamageEvent,
  RenderProjectile,
  RenderSnapshot,
  ShoveDamageEvent,
  SimConfig,
  SlimeUnit,
  SquishEvent,
  Vector2,
  VectorFieldSample,
} from './types';
import { DEFAULT_SIM_CONFIG } from './types';
import { add, clamp, distanceSquared, length, normalize, scale, subtract, vec } from './vector';
import type { ArchetypeId } from '../campaign/archetypes';

export interface WorldKillEvent {
  unitId: number;
  archetype: ArchetypeId;
  position: Vector2;
  radius: number;
  color: number;
}

export interface WorldLeakEvent {
  unitId: number;
  archetype: ArchetypeId;
}

export interface WorldOptions {
  maze: MazeGrid;
  units: SlimeUnit[];
  config?: Partial<SimConfig>;
  seed?: number;
  onKill?: (event: WorldKillEvent) => void;
  onLeak?: (event: WorldLeakEvent) => void;
  onWallBroken?: (cell: Vector2) => void;
  onArchetypeMutated?: (unit: SlimeUnit, previous: ArchetypeId, next: ArchetypeId) => void;
  /** External flow-bias sources (e.g. Lure structures). Each is sampled per step. */
  flowBiasSources?: Array<{ origin: Vector2; radius: number }>;
}

const KING_AURA_RADIUS_CELLS = 2.5;
const KING_AURA_SPEED_BONUS = 1.4;
const SPRINT_SPEED_BONUS = 1.6;
const HOPPER_HOP_COOLDOWN = 6;
const HOPPER_HOP_DURATION = 0.55;
const HOPPER_HOP_SPEED_FACTOR = 1.8;
const CORRUPTER_CONVERT_TIME = 1.5;
const HEALER_PULSE_INTERVAL = 4;
const HEALER_PULSE_RADIUS_CELLS = 2;
const HEALER_PULSE_AMOUNT = 6;
const COCOON_SHELL_TIMER = 7;
const COCOON_SHELL_HP_FACTOR = 1.6;
const WALL_BREAK_PROGRESS_TARGET = 4;

interface Projectile {
  id: number;
  kind: ProjectileKind;
  position: Vector2;
  direction: Vector2;
  speed: number;
  rangeRemaining: number;
  damage: number;
  pierceRemaining: number;
  alreadyHit: Set<number>;
  color: number;
  armoredBlocks: boolean;
}

export class World {
  readonly maze: MazeGrid;
  readonly units: SlimeUnit[];
  readonly flowField: FlowField;
  readonly densityField: DensityField;
  readonly spatialHash: SpatialHash;
  readonly config: SimConfig;
  private readonly rng: SeededRandom;
  private time = 0;
  private exitedCount = 0;
  private pendingGooSplats: GooSplat[] = [];
  private flowBiasSources: Array<{ origin: Vector2; radius: number }>;
  private projectiles: Projectile[] = [];
  private nextProjectileId = 1;
  private readonly onKill?: (event: WorldKillEvent) => void;
  private readonly onLeak?: (event: WorldLeakEvent) => void;
  private readonly onWallBroken?: (cell: Vector2) => void;
  private readonly onArchetypeMutated?: (unit: SlimeUnit, previous: ArchetypeId, next: ArchetypeId) => void;

  constructor(options: WorldOptions) {
    this.maze = options.maze;
    this.units = options.units;
    this.config = { ...DEFAULT_SIM_CONFIG, ...options.config };
    this.rng = new SeededRandom(options.seed ?? 1);
    this.flowField = new FlowField(this.maze);
    this.densityField = new DensityField(this.maze);
    this.flowBiasSources = options.flowBiasSources ?? [];
    this.onKill = options.onKill;
    this.onLeak = options.onLeak;
    this.onWallBroken = options.onWallBroken;
    this.onArchetypeMutated = options.onArchetypeMutated;
    this.applySlimeSizeMultiplierToUnits();
    const averageRadius = this.units.length
      ? this.units.reduce((total, unit) => total + unit.radius, 0) / this.units.length
      : this.maze.tileSize / 4;
    this.spatialHash = new SpatialHash(Math.max(averageRadius * 2, this.maze.tileSize / 2));
    this.spatialHash.rebuild(this.units);
  }

  step(dt: number, damageEvents: readonly DamageEvent[] = []): RenderSnapshot {
    this.time += dt;
    this.pendingGooSplats = [];

    this.spatialHash.rebuild(this.units);
    this.densityField.updateFromUnits(this.units);
    this.densityField.commit();

    this.resetPerStepModifiers();
    this.updateArchetypes(dt);

    for (const unit of this.units) {
      if (!unit.alive) {
        continue;
      }

      if (unit.frozenUntil !== undefined && unit.frozenUntil > this.time) {
        unit.velocity = { x: 0, y: 0 };
      } else {
        unit.velocity = this.applyAcceleration(unit, this.computeAcceleration(unit), dt);
      }

      if (unit.pendingImpulse) {
        unit.velocity = add(unit.velocity, unit.pendingImpulse);
        unit.pendingImpulse = undefined;
      }

      this.integrate(unit, dt);
      unit.ignoresWalls = false;
    }

    this.spatialHash.rebuild(this.units);
    this.removeExitedUnits();
    this.spatialHash.rebuild(this.units);
    this.applyDamage(damageEvents);
    this.updateProjectiles(dt);
    this.removeDeadUnits();

    return this.createSnapshot();
  }

  spawnProjectile(spec: ProjectileSpawnSpec): void {
    const direction = normalize(spec.direction);
    if (direction.x === 0 && direction.y === 0) {
      return;
    }
    this.projectiles.push({
      id: this.nextProjectileId++,
      kind: spec.kind,
      position: { ...spec.origin },
      direction,
      speed: Math.max(1, spec.speed),
      rangeRemaining: Math.max(0, spec.range),
      damage: spec.damage,
      pierceRemaining: Math.max(0, Math.floor(spec.pierce)),
      alreadyHit: new Set<number>(),
      color: spec.color,
      armoredBlocks: spec.armoredBlocks ?? true,
    });
  }

  getProjectiles(): RenderProjectile[] {
    return this.projectiles.map((p) => ({
      id: p.id,
      kind: p.kind,
      position: { x: p.position.x, y: p.position.y },
      direction: { x: p.direction.x, y: p.direction.y },
      color: p.color,
    }));
  }

  private updateProjectiles(dt: number): void {
    if (this.projectiles.length === 0) {
      return;
    }
    const survivors: Projectile[] = [];
    for (const projectile of this.projectiles) {
      if (this.advanceProjectile(projectile, dt)) {
        survivors.push(projectile);
      }
    }
    this.projectiles = survivors;
  }

  private advanceProjectile(projectile: Projectile, dt: number): boolean {
    if (projectile.rangeRemaining <= 0) {
      return false;
    }
    const desiredTravel = projectile.speed * dt;
    const travelDistance = Math.min(desiredTravel, projectile.rangeRemaining);
    if (travelDistance <= 0) {
      return false;
    }
    const startX = projectile.position.x;
    const startY = projectile.position.y;
    const dirX = projectile.direction.x;
    const dirY = projectile.direction.y;
    const endX = startX + dirX * travelDistance;
    const endY = startY + dirY * travelDistance;

    const queryCenter = {
      x: startX + dirX * travelDistance * 0.5,
      y: startY + dirY * travelDistance * 0.5,
    };
    const queryRadius = travelDistance * 0.5 + this.maze.tileSize;
    const candidates = this.spatialHash.queryCircle(queryCenter, queryRadius);

    const hits: Array<{ unit: SlimeUnit; distance: number }> = [];
    for (const unit of candidates) {
      if (!unit.alive || projectile.alreadyHit.has(unit.id)) {
        continue;
      }
      const projected = (unit.position.x - startX) * dirX + (unit.position.y - startY) * dirY;
      if (projected < 0 || projected > travelDistance) {
        continue;
      }
      const closestX = startX + dirX * projected;
      const closestY = startY + dirY * projected;
      const dx = closestX - unit.position.x;
      const dy = closestY - unit.position.y;
      const radius = unit.radius;
      if (dx * dx + dy * dy <= radius * radius) {
        hits.push({ unit, distance: projected });
      }
    }
    hits.sort((a, b) => a.distance - b.distance);

    let stoppedAt: number | undefined;
    for (const hit of hits) {
      this.dealDamage(hit.unit, projectile.damage);
      projectile.alreadyHit.add(hit.unit.id);
      const isUnshelledArmored =
        projectile.armoredBlocks &&
        hit.unit.archetype === 'armored' &&
        !(hit.unit.archetypeState?.shelled);
      if (projectile.pierceRemaining <= 0 || isUnshelledArmored) {
        stoppedAt = hit.distance;
        break;
      }
      projectile.pierceRemaining -= 1;
    }

    if (stoppedAt !== undefined) {
      projectile.position.x = startX + dirX * stoppedAt;
      projectile.position.y = startY + dirY * stoppedAt;
      projectile.rangeRemaining = 0;
      return false;
    }

    projectile.position.x = endX;
    projectile.position.y = endY;
    projectile.rangeRemaining -= travelDistance;

    return projectile.rangeRemaining > 0;
  }

  setFlowBiasSources(sources: Array<{ origin: Vector2; radius: number }>): void {
    this.flowBiasSources = sources;
  }

  getCurrentTime(): number {
    return this.time;
  }

  destroyWallAt(cell: Vector2): boolean {
    if (!isInsideMaze(this.maze, cell.x, cell.y)) {
      return false;
    }
    const index = cellIndex(this.maze, cell.x, cell.y);
    if (this.maze.walls[index] !== 1) {
      return false;
    }
    this.maze.walls[index] = 0;
    this.flowField.rebuild();
    if (this.onWallBroken) {
      this.onWallBroken(cell);
    }
    return true;
  }

  createSnapshot(): RenderSnapshot {
    return {
      units: this.units
        .filter((unit) => unit.alive)
        .map((unit) => ({
          id: unit.id,
          x: unit.position.x,
          y: unit.position.y,
          radius: unit.radius,
          color: unit.color,
          pathDirection: this.flowField.directionAtWorld(unit.position),
          crowding: this.densityField.densityAtWorld(unit.position),
          hitFlash: Math.max(0, 1 - (this.time - unit.lastDamagedAt) / 0.25),
          archetype: unit.archetype,
        })),
      gooSplats: [...this.pendingGooSplats],
      mazeSolvingField: this.createMazeSolvingFieldSnapshot(),
      tooCrowdedField: this.createTooCrowdedFieldSnapshot(),
      walls: this.maze.walls,
      entrance: this.maze.entrance,
      exit: this.maze.exit,
      mazeWidth: this.maze.width,
      mazeHeight: this.maze.height,
      tileSize: this.maze.tileSize,
      time: this.time,
      exitedCount: this.exitedCount,
      projectiles: this.getProjectiles(),
    };
  }

  setSlimeSizeMultiplier(multiplier: number): void {
    this.config.slimeSizeMultiplier = multiplier;
    this.applySlimeSizeMultiplierToUnits();
    this.spatialHash.rebuild(this.units);
  }

  private resetPerStepModifiers(): void {
    for (const unit of this.units) {
      unit.speedMultiplier = 1;
    }
  }

  private updateArchetypes(dt: number): void {
    if (dt <= 0) {
      return;
    }
    for (const unit of this.units) {
      if (!unit.alive || !unit.archetype) {
        continue;
      }
      const state = unit.archetypeState;
      if (!state) {
        continue;
      }
      switch (unit.archetype) {
        case 'king':
          this.updateKingAura(unit);
          break;
        case 'sprint':
          if (state.sprintActive) {
            unit.speedMultiplier = (unit.speedMultiplier ?? 1) * SPRINT_SPEED_BONUS;
          }
          break;
        case 'hopper':
          this.updateHopper(unit, state, dt);
          break;
        case 'corrupter':
          this.updateCorrupter(unit, state, dt);
          break;
        case 'healer':
          this.updateHealer(unit, state, dt);
          break;
        case 'cocoon':
          this.updateCocoon(unit, state, dt);
          break;
        case 'wallBreaker':
          this.updateWallBreaker(unit, state, dt);
          break;
        default:
          break;
      }
    }
  }

  private updateKingAura(unit: SlimeUnit): void {
    const radius = (unit.archetypeState?.auraRadiusCells ?? KING_AURA_RADIUS_CELLS) * this.maze.tileSize;
    const targets = this.spatialHash.queryCircle(unit.position, radius);
    for (const target of targets) {
      if (target.id === unit.id) {
        continue;
      }
      target.speedMultiplier = (target.speedMultiplier ?? 1) * KING_AURA_SPEED_BONUS;
    }
  }

  private updateHopper(unit: SlimeUnit, state: NonNullable<SlimeUnit['archetypeState']>, dt: number): void {
    state.hopCooldown = Math.max(0, (state.hopCooldown ?? 0) - dt);
    if ((state.hopRemainingTime ?? 0) > 0) {
      state.hopRemainingTime = Math.max(0, (state.hopRemainingTime ?? 0) - dt);
      unit.ignoresWalls = true;
      if (state.hopVelocity) {
        unit.pendingImpulse = state.hopVelocity;
      }
      return;
    }
    if (state.hopCooldown > 0) {
      return;
    }
    const flow = this.flowField.directionAtWorld(unit.position);
    if (flow.x === 0 && flow.y === 0) {
      return;
    }
    const ahead = {
      x: unit.position.x + flow.x * this.maze.tileSize,
      y: unit.position.y + flow.y * this.maze.tileSize,
    };
    if (!isWallAtWorld(this.maze, ahead.x, ahead.y)) {
      return;
    }
    state.hopCooldown = HOPPER_HOP_COOLDOWN;
    state.hopRemainingTime = HOPPER_HOP_DURATION;
    state.hopVelocity = scale(flow, unit.maxSpeed * HOPPER_HOP_SPEED_FACTOR);
  }

  private updateCorrupter(unit: SlimeUnit, state: NonNullable<SlimeUnit['archetypeState']>, dt: number): void {
    const radius = unit.radius * 2.5;
    const candidates = this.spatialHash.queryCircle(unit.position, radius);
    let target: SlimeUnit | undefined;
    for (const candidate of candidates) {
      if (candidate.id === unit.id || !candidate.alive || candidate.archetype !== 'horde') {
        continue;
      }
      if (state.conversionTargetId === candidate.id) {
        target = candidate;
        break;
      }
      if (!target) {
        target = candidate;
      }
    }
    if (!target) {
      state.conversionTimer = 0;
      state.conversionTargetId = undefined;
      return;
    }
    state.conversionTargetId = target.id;
    state.conversionTimer = (state.conversionTimer ?? 0) + dt;
    if (state.conversionTimer >= CORRUPTER_CONVERT_TIME) {
      state.conversionTimer = 0;
      state.conversionTargetId = undefined;
      const previous = target.archetype ?? 'horde';
      target.archetype = 'corrupter';
      target.archetypeState = { conversionTimer: 0 };
      target.color = 0xb24bf3;
      target.maxSpeed = 40;
      target.health = Math.max(target.health, 18);
      target.maxHealth = 18;
      if (this.onArchetypeMutated) {
        this.onArchetypeMutated(target, previous, 'corrupter');
      }
    }
  }

  private updateHealer(unit: SlimeUnit, state: NonNullable<SlimeUnit['archetypeState']>, dt: number): void {
    state.healCooldown = (state.healCooldown ?? HEALER_PULSE_INTERVAL) - dt;
    if (state.healPulseTime !== undefined && state.healPulseTime > 0) {
      state.healPulseTime = Math.max(0, state.healPulseTime - dt);
    }
    if (state.healCooldown > 0) {
      return;
    }
    const radius = HEALER_PULSE_RADIUS_CELLS * this.maze.tileSize;
    for (const target of this.spatialHash.queryCircle(unit.position, radius)) {
      if (!target.alive || target.id === unit.id) {
        continue;
      }
      const max = target.maxHealth ?? target.health;
      target.health = Math.min(max, target.health + HEALER_PULSE_AMOUNT);
    }
    state.healCooldown = HEALER_PULSE_INTERVAL;
    state.healPulseTime = 0.4;
  }

  private updateCocoon(unit: SlimeUnit, state: NonNullable<SlimeUnit['archetypeState']>, dt: number): void {
    if (!state.shelled) {
      return;
    }
    unit.velocity = { x: 0, y: 0 };
    state.shellTimer = (state.shellTimer ?? 0) - dt;
    if (state.shellTimer <= 0) {
      state.shelled = false;
      state.shellHealth = 0;
      state.shellTimer = 0;
      unit.health = unit.maxHealth ?? unit.health;
    }
  }

  private updateWallBreaker(unit: SlimeUnit, state: NonNullable<SlimeUnit['archetypeState']>, dt: number): void {
    const wallCell = this.findClosestWallCell(unit.position, unit.radius * 2.5);
    if (!wallCell) {
      state.wallBreakProgress = 0;
      return;
    }
    state.wallBreakProgress = (state.wallBreakProgress ?? 0) + dt;
    if (state.wallBreakProgress >= WALL_BREAK_PROGRESS_TARGET) {
      if (this.destroyWallAt(wallCell)) {
        state.wallBreakProgress = 0;
      }
    }
  }

  private findClosestWallCell(position: Vector2, range: number): Vector2 | undefined {
    const cell = positionToCell(this.maze, position.x, position.y);
    const searchCells = Math.ceil(range / this.maze.tileSize) + 1;
    let best: Vector2 | undefined;
    let bestDistSq = range * range;
    for (let cellY = cell.y - searchCells; cellY <= cell.y + searchCells; cellY += 1) {
      for (let cellX = cell.x - searchCells; cellX <= cell.x + searchCells; cellX += 1) {
        if (!isInsideMaze(this.maze, cellX, cellY) || !isWallCell(this.maze, cellX, cellY)) {
          continue;
        }
        if (cellX === 0 || cellY === 0 || cellX === this.maze.width - 1 || cellY === this.maze.height - 1) {
          continue;
        }
        if (this.maze.entrance.x === cellX && this.maze.entrance.y === cellY) {
          continue;
        }
        if (this.maze.exit.x === cellX && this.maze.exit.y === cellY) {
          continue;
        }
        const center = cellCenter(this.maze, cellX, cellY);
        const dx = center.x - position.x;
        const dy = center.y - position.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          best = { x: cellX, y: cellY };
        }
      }
    }
    return best;
  }

  private computeAcceleration(unit: SlimeUnit): Vector2 {
    let flow = this.flowField.directionAtWorld(unit.position);
    flow = this.applyFlowBias(unit.position, flow);
    const density = normalize(this.crowdEscapeGradientAtWorld(unit.position));
    const separation = this.spatialHash.separationFor(
      unit,
      unit.radius * this.config.separationRadiusMultiplier,
    );
    const wallSeparation = this.wallSeparationFor(unit);
    const jitter = vec(this.rng.centered() * this.config.jitterStrength, this.rng.centered() * this.config.jitterStrength);

    return add(
      add(scale(flow, this.config.flowWeight), scale(density, this.config.densityWeight)),
      add(scale(add(separation, wallSeparation), this.config.separationWeight), jitter),
    );
  }

  private applyFlowBias(position: Vector2, flow: Vector2): Vector2 {
    if (this.flowBiasSources.length === 0) {
      return flow;
    }
    let biased = flow;
    let totalWeight = 1;
    for (const source of this.flowBiasSources) {
      const distSq = distanceSquared(position, source.origin);
      const radiusSq = source.radius * source.radius;
      if (distSq > radiusSq) {
        continue;
      }
      const falloff = 1 - Math.sqrt(distSq) / source.radius;
      const toSource = normalize(subtract(source.origin, position));
      biased = add(biased, scale(toSource, falloff * 1.5));
      totalWeight += falloff;
    }
    return scale(biased, 1 / totalWeight);
  }

  private createMazeSolvingFieldSnapshot(): VectorFieldSample[] {
    const samples: VectorFieldSample[] = [];

    for (let y = 0; y < this.maze.height; y += 1) {
      for (let x = 0; x < this.maze.width; x += 1) {
        if (isWallCell(this.maze, x, y)) {
          continue;
        }
        if (!Number.isFinite(this.flowField.distanceAtCell(x, y))) {
          continue;
        }

        const center = cellCenter(this.maze, x, y);
        const flow = this.flowField.directionAtWorld(center);
        const strength = length(flow);

        samples.push({
          x: center.x,
          y: center.y,
          dx: flow.x,
          dy: flow.y,
          strength: clamp(strength * this.config.flowWeight, 0, 1),
        });
      }
    }

    return samples;
  }

  private createTooCrowdedFieldSnapshot(): VectorFieldSample[] {
    const samples: VectorFieldSample[] = [];

    for (let y = 0; y < this.maze.height; y += 1) {
      for (let x = 0; x < this.maze.width; x += 1) {
        if (isWallCell(this.maze, x, y)) {
          continue;
        }

        const center = cellCenter(this.maze, x, y);
        const density = this.crowdEscapeGradientAtWorld(center);
        const strength = length(density);
        if (strength <= 0) {
          continue;
        }

        const direction = scale(density, 1 / strength);
        samples.push({
          x: center.x,
          y: center.y,
          dx: direction.x,
          dy: direction.y,
          strength: clamp(strength * this.config.densityWeight, 0, 1),
        });
      }
    }

    return samples;
  }

  private applyAcceleration(unit: SlimeUnit, acceleration: Vector2, dt: number): Vector2 {
    const speedMultiplier = unit.speedMultiplier ?? 1;
    const effectiveMaxSpeed = unit.maxSpeed * speedMultiplier;
    const velocity = add(
      unit.velocity,
      scale(acceleration, effectiveMaxSpeed * this.config.accelerationMultiplier * dt),
    );
    return this.clampVelocityForCrowding(unit, velocity);
  }

  private clampVelocityForCrowding(unit: SlimeUnit, velocity: Vector2): Vector2 {
    const speed = length(velocity);
    if (speed <= 0) {
      return velocity;
    }

    const direction = scale(velocity, 1 / speed);
    const crowdEscapeVector = this.crowdEscapeGradientAtWorld(unit.position);
    const crowdStrength = clamp(length(crowdEscapeVector), 0, 1);
    const crowdEscape = normalize(crowdEscapeVector);
    const crowdAlignment = direction.x * crowdEscape.x + direction.y * crowdEscape.y;
    const speedRatio = clamp(
      1 + crowdAlignment * crowdStrength * this.config.densitySlowdown,
      this.config.minSpeedRatio,
      this.config.maxSpeedRatio,
    );
    const speedMultiplier = unit.speedMultiplier ?? 1;
    const maxSpeed = unit.maxSpeed * this.config.maxSpeedMultiplier * speedRatio * speedMultiplier;
    if (speed <= maxSpeed) {
      return velocity;
    }

    return scale(direction, maxSpeed);
  }

  private crowdEscapeGradientAtWorld(position: Vector2): Vector2 {
    const cell = positionToCell(this.maze, position.x, position.y);
    const center = this.thresholdCrowding(this.densityField.densityAtCell(cell.x, cell.y));
    const right = this.thresholdCrowding(this.densityField.densityAtCell(cell.x + 1, cell.y));
    const left = this.thresholdCrowding(this.densityField.densityAtCell(cell.x - 1, cell.y));
    const down = this.thresholdCrowding(this.densityField.densityAtCell(cell.x, cell.y + 1));
    const up = this.thresholdCrowding(this.densityField.densityAtCell(cell.x, cell.y - 1));

    return vec(left - right + (center - right) * 0.1, up - down + (center - down) * 0.1);
  }

  private thresholdCrowding(density: number): number {
    return Math.max(0, density - this.config.crowdingThreshold);
  }

  private wallSeparationFor(unit: SlimeUnit): Vector2 {
    if (unit.ignoresWalls) {
      return { x: 0, y: 0 };
    }
    const desiredDistance = unit.radius * this.config.separationRadiusMultiplier;
    const outerDistance = desiredDistance * 2;
    const cell = positionToCell(this.maze, unit.position.x, unit.position.y);
    const searchCells = Math.ceil(outerDistance / this.maze.tileSize) + 1;
    let x = 0;
    let y = 0;

    for (let cellY = cell.y - searchCells; cellY <= cell.y + searchCells; cellY += 1) {
      for (let cellX = cell.x - searchCells; cellX <= cell.x + searchCells; cellX += 1) {
        if (!isWallCell(this.maze, cellX, cellY)) {
          continue;
        }

        const left = cellX * this.maze.tileSize;
        const top = cellY * this.maze.tileSize;
        const right = left + this.maze.tileSize;
        const bottom = top + this.maze.tileSize;

        if (!isWallCell(this.maze, cellX - 1, cellY)) {
          const separation = wallFaceSeparationFor(unit.position, desiredDistance, outerDistance, {
            start: { x: left, y: top },
            end: { x: left, y: bottom },
            normal: { x: -1, y: 0 },
          });
          x += separation.x;
          y += separation.y;
        }
        if (!isWallCell(this.maze, cellX + 1, cellY)) {
          const separation = wallFaceSeparationFor(unit.position, desiredDistance, outerDistance, {
            start: { x: right, y: top },
            end: { x: right, y: bottom },
            normal: { x: 1, y: 0 },
          });
          x += separation.x;
          y += separation.y;
        }
        if (!isWallCell(this.maze, cellX, cellY - 1)) {
          const separation = wallFaceSeparationFor(unit.position, desiredDistance, outerDistance, {
            start: { x: left, y: top },
            end: { x: right, y: top },
            normal: { x: 0, y: -1 },
          });
          x += separation.x;
          y += separation.y;
        }
        if (!isWallCell(this.maze, cellX, cellY + 1)) {
          const separation = wallFaceSeparationFor(unit.position, desiredDistance, outerDistance, {
            start: { x: left, y: bottom },
            end: { x: right, y: bottom },
            normal: { x: 0, y: 1 },
          });
          x += separation.x;
          y += separation.y;
        }
      }
    }

    return { x, y };
  }

  private applySlimeSizeMultiplierToUnits(): void {
    for (const unit of this.units) {
      unit.radius = unit.baseRadius * this.config.slimeSizeMultiplier;
    }
  }

  private integrate(unit: SlimeUnit, dt: number): void {
    const nextX = unit.position.x + unit.velocity.x * dt;
    const nextY = unit.position.y + unit.velocity.y * dt;

    if (unit.ignoresWalls) {
      unit.position.x = clamp(nextX, unit.radius, this.maze.width * this.maze.tileSize - unit.radius);
      unit.position.y = clamp(nextY, unit.radius, this.maze.height * this.maze.tileSize - unit.radius);
      return;
    }

    if (!isWallAtWorld(this.maze, nextX, unit.position.y)) {
      unit.position.x = clamp(nextX, unit.radius, this.maze.width * this.maze.tileSize - unit.radius);
    } else {
      unit.velocity.x = 0;
    }

    if (!isWallAtWorld(this.maze, unit.position.x, nextY)) {
      unit.position.y = clamp(nextY, unit.radius, this.maze.height * this.maze.tileSize - unit.radius);
    } else {
      unit.velocity.y = 0;
    }
  }

  private applyDamage(events: readonly DamageEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'aoe':
          this.handleAoe(event);
          break;
        case 'ray':
          this.handleRay(event);
          break;
        case 'line':
          this.handleLine(event);
          break;
        case 'shove':
          this.handleShove(event);
          break;
        case 'freeze':
          this.handleFreeze(event);
          break;
        case 'squish':
          this.handleSquish(event);
          break;
        case 'percentHp':
          this.handlePercentHp(event);
          break;
        case 'dot':
          this.handleDot(event);
          break;
        case 'flowBias':
          this.handleFlowBias(event);
          break;
        case 'heal':
          this.handleHeal(event);
          break;
      }
    }
  }

  private handleAoe(event: AoEDamageEvent): void {
    for (const target of this.spatialHash.queryCircle(event.origin, event.radius)) {
      this.dealDamage(target, event.damage);
    }
  }

  private handleRay(event: RayDamageEvent): void {
    const pierceCount = Math.max(0, Math.floor(event.pierce ?? 0));
    const targets = this.collectRayTargets(event.origin, event.direction, event.range);
    let hitsRemaining = 1 + pierceCount;
    for (const target of targets) {
      if (hitsRemaining <= 0) {
        break;
      }
      this.dealDamage(target, event.damage);
      hitsRemaining -= 1;
      if (target.archetype === 'armored' && !(target.archetypeState?.shelled)) {
        break;
      }
    }
  }

  private collectRayTargets(origin: Vector2, direction: Vector2, range: number): SlimeUnit[] {
    const normalized = normalize(direction);
    if (normalized.x === 0 && normalized.y === 0) {
      return [];
    }
    const reachables = this.spatialHash.queryCircle(
      { x: origin.x + normalized.x * range * 0.5, y: origin.y + normalized.y * range * 0.5 },
      range,
    );
    const hits: Array<{ unit: SlimeUnit; distance: number }> = [];
    for (const unit of reachables) {
      const projected = (unit.position.x - origin.x) * normalized.x + (unit.position.y - origin.y) * normalized.y;
      if (projected < 0 || projected > range) {
        continue;
      }
      const closestPoint = {
        x: origin.x + normalized.x * projected,
        y: origin.y + normalized.y * projected,
      };
      if (distanceSquared(closestPoint, unit.position) <= unit.radius * unit.radius) {
        hits.push({ unit, distance: projected });
      }
    }
    hits.sort((a, b) => a.distance - b.distance);
    return hits.map((hit) => hit.unit);
  }

  private handleLine(event: LineDamageEvent): void {
    const normalized = normalize(event.direction);
    if (normalized.x === 0 && normalized.y === 0) {
      return;
    }
    const center = {
      x: event.origin.x + normalized.x * event.range * 0.5,
      y: event.origin.y + normalized.y * event.range * 0.5,
    };
    const reachables = this.spatialHash.queryCircle(center, event.range);
    for (const unit of reachables) {
      const projected = (unit.position.x - event.origin.x) * normalized.x + (unit.position.y - event.origin.y) * normalized.y;
      if (projected < 0 || projected > event.range) {
        continue;
      }
      const closestPoint = {
        x: event.origin.x + normalized.x * projected,
        y: event.origin.y + normalized.y * projected,
      };
      const dx = closestPoint.x - unit.position.x;
      const dy = closestPoint.y - unit.position.y;
      if (dx * dx + dy * dy <= (event.width + unit.radius) * (event.width + unit.radius)) {
        this.dealDamage(unit, event.damage);
      }
    }
  }

  private handleShove(event: ShoveDamageEvent): void {
    for (const target of this.spatialHash.queryCircle(event.origin, event.radius)) {
      const direction = event.direction
        ? normalize(event.direction)
        : normalize(subtract(target.position, event.origin));
      if (direction.x === 0 && direction.y === 0) {
        continue;
      }
      target.pendingImpulse = scale(direction, event.strength);
      if (event.damage) {
        this.dealDamage(target, event.damage);
      }
      if (event.wallImpact) {
        const ahead = {
          x: target.position.x + direction.x * target.radius * 1.5,
          y: target.position.y + direction.y * target.radius * 1.5,
        };
        if (isWallAtWorld(this.maze, ahead.x, ahead.y)) {
          this.dealDamage(target, event.wallImpact);
        }
      }
    }
  }

  private handleFreeze(event: FreezeEvent): void {
    for (const target of this.spatialHash.queryCircle(event.origin, event.radius)) {
      target.frozenUntil = Math.max(target.frozenUntil ?? 0, this.time + event.duration);
      if (event.damage) {
        this.dealDamage(target, event.damage);
      }
    }
  }

  private handleSquish(event: SquishEvent): void {
    for (const target of this.spatialHash.queryCircle(event.origin, event.radius)) {
      const shrunkRadius = target.radius * (1 - event.shrinkFraction);
      target.radius = Math.max(target.baseRadius * 0.5, shrunkRadius);
      this.dealDamage(target, event.damage);
    }
  }

  private handlePercentHp(event: PercentHpDamageEvent): void {
    for (const target of this.spatialHash.queryCircle(event.origin, event.radius)) {
      const damage = target.health * event.fraction;
      this.dealDamage(target, damage);
    }
  }

  private handleDot(event: DotEvent): void {
    for (const target of this.spatialHash.queryCircle(event.origin, event.radius)) {
      this.dealDamage(target, event.damage);
    }
  }

  private handleFlowBias(event: FlowBiasEvent): void {
    this.flowBiasSources.push({ origin: event.origin, radius: event.radius });
  }

  private handleHeal(event: HealEvent): void {
    for (const target of this.spatialHash.queryCircle(event.origin, event.radius)) {
      const max = target.maxHealth ?? target.health;
      target.health = Math.min(max, target.health + event.amount);
    }
  }

  private dealDamage(target: SlimeUnit, damage: number): void {
    if (!target.alive || damage <= 0) {
      return;
    }
    target.lastDamagedAt = this.time;

    if (target.archetype === 'cocoon') {
      const state = target.archetypeState;
      if (state) {
        if (state.shelled) {
          state.shellHealth = Math.max(0, (state.shellHealth ?? 0) - damage);
          if (state.shellHealth <= 0) {
            target.alive = false;
          }
          return;
        }
        const max = target.maxHealth ?? target.health;
        target.health -= damage;
        if (target.health <= max * 0.6) {
          state.shelled = true;
          state.shellHealth = max * COCOON_SHELL_HP_FACTOR;
          state.shellTimer = COCOON_SHELL_TIMER;
        }
        if (target.health <= 0) {
          target.alive = false;
        }
        return;
      }
    }

    if (target.archetype === 'sprint' && target.archetypeState?.sprintActive) {
      target.archetypeState.sprintActive = false;
    }

    target.health -= damage;
    if (target.health <= 0) {
      target.alive = false;
    }
  }

  private removeExitedUnits(): void {
    for (let index = this.units.length - 1; index >= 0; index -= 1) {
      const unit = this.units[index];
      const cell = positionToCell(this.maze, unit.position.x, unit.position.y);
      if (cell.x !== this.maze.exit.x || cell.y !== this.maze.exit.y) {
        continue;
      }

      this.exitedCount += 1;
      if (this.onLeak) {
        this.onLeak({ unitId: unit.id, archetype: unit.archetype ?? 'horde' });
      }
      this.units.splice(index, 1);
    }
  }

  private removeDeadUnits(): void {
    for (let index = this.units.length - 1; index >= 0; index -= 1) {
      const unit = this.units[index];
      if (unit.alive) {
        continue;
      }
      this.pendingGooSplats.push({
        position: { ...unit.position },
        radius: unit.radius * 1.5,
        color: unit.color,
      });
      if (this.onKill) {
        this.onKill({
          unitId: unit.id,
          archetype: unit.archetype ?? 'horde',
          position: { ...unit.position },
          radius: unit.radius,
          color: unit.color,
        });
      }
      this.units.splice(index, 1);
    }
  }
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

interface WallFace {
  start: Vector2;
  end: Vector2;
  normal: Vector2;
}

function wallFaceSeparationFor(position: Vector2, desiredDistance: number, outerDistance: number, face: WallFace): Vector2 {
  const closestX = clamp(position.x, Math.min(face.start.x, face.end.x), Math.max(face.start.x, face.end.x));
  const closestY = clamp(position.y, Math.min(face.start.y, face.end.y), Math.max(face.start.y, face.end.y));
  let awayX = position.x - closestX;
  let awayY = position.y - closestY;
  let distSq = awayX * awayX + awayY * awayY;

  if (distSq <= 0.0001) {
    awayX = face.normal.x;
    awayY = face.normal.y;
    distSq = 0.0001;
  }

  if (awayX * face.normal.x + awayY * face.normal.y < 0) {
    return vec();
  }

  const distance = Math.sqrt(distSq);
  if (distance >= outerDistance) {
    return vec();
  }

  const falloff = 1 - smoothstep(desiredDistance, outerDistance, distance);
  const strength = (desiredDistance / distSq) * falloff;
  return { x: awayX * strength, y: awayY * strength };
}
