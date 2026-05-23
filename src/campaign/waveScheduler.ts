import { SeededRandom } from '../sim/rng';
import type { MazeGrid, SlimeUnit } from '../sim/types';
import type { ArchetypeId } from './archetypes';
import type { LevelDefinition, WaveDefinition } from './levels';
import { entranceSpawnPosition, spawnSlime } from './spawnSlime';

interface SlotState {
  archetype: ArchetypeId;
  remaining: number;
  intervalSeconds: number;
  delaySeconds: number;
  elapsed: number;
  spawned: number;
}

export interface WavePreview {
  index: number;
  totalSlimes: number;
  archetypes: Record<ArchetypeId, number> | Partial<Record<ArchetypeId, number>>;
  description: string;
}

export type WaveSchedulerPhase = 'preWaveCountdown' | 'spawning' | 'waitingForClear' | 'gap' | 'completed';

export interface SchedulerEvents {
  onWaveStarted?: (waveIndex: number) => void;
  onWaveCompleted?: (waveIndex: number) => void;
  onAllWavesCompleted?: () => void;
  /** Notified for each spawned slime so the run can register it with World. */
  onSpawn?: (unit: SlimeUnit) => void;
}

export interface WaveSchedulerOptions {
  level: LevelDefinition;
  maze: MazeGrid;
  rngSeed?: number;
  /** Seconds between wave end and the next wave start. */
  preWaveCountdownSeconds?: number;
  events?: SchedulerEvents;
}

export class WaveScheduler {
  readonly level: LevelDefinition;
  readonly maze: MazeGrid;
  private readonly rng: SeededRandom;
  private readonly preWaveCountdownSeconds: number;
  private readonly events: SchedulerEvents;
  private currentWaveIndex = -1;
  private slotStates: SlotState[] = [];
  private phase: WaveSchedulerPhase = 'gap';
  private phaseTimer = 0;
  private nextSlimeId = 1;
  private waveSpawnedCount = 0;

  constructor(options: WaveSchedulerOptions) {
    this.level = options.level;
    this.maze = options.maze;
    this.rng = new SeededRandom(options.rngSeed ?? 1234);
    this.preWaveCountdownSeconds = options.preWaveCountdownSeconds ?? 6;
    this.events = options.events ?? {};
    this.advanceToNextWave();
  }

  get phaseLabel(): WaveSchedulerPhase {
    return this.phase;
  }

  get countdownRemaining(): number {
    if (this.phase === 'preWaveCountdown' || this.phase === 'gap') {
      return this.phaseTimer;
    }
    return 0;
  }

  get currentWaveNumber(): number {
    return this.currentWaveIndex + 1;
  }

  get totalWaves(): number {
    return this.level.waves.length;
  }

  isComplete(): boolean {
    return this.phase === 'completed';
  }

  preview(waveIndexOffset = 0): WavePreview | undefined {
    const waveIndex = this.currentWaveIndex + waveIndexOffset;
    const wave = this.level.waves[waveIndex];
    if (!wave) {
      return undefined;
    }
    return summarizeWave(wave, waveIndex);
  }

  step(dt: number, aliveUnitCount: number): void {
    if (this.phase === 'completed') {
      return;
    }
    this.phaseTimer = Math.max(0, this.phaseTimer - dt);

    switch (this.phase) {
      case 'preWaveCountdown': {
        if (this.phaseTimer <= 0) {
          this.phase = 'spawning';
          this.events.onWaveStarted?.(this.currentWaveIndex);
        }
        break;
      }
      case 'spawning': {
        for (const slot of this.slotStates) {
          slot.elapsed += dt;
          while (slot.remaining > 0 && slot.elapsed >= slot.delaySeconds) {
            const interval = slot.intervalSeconds || 0.001;
            slot.elapsed -= interval;
            slot.delaySeconds = 0;
            slot.remaining -= 1;
            slot.spawned += 1;
            this.spawnFromSlot(slot.archetype);
          }
        }
        if (this.slotStates.every((slot) => slot.remaining <= 0)) {
          this.phase = 'waitingForClear';
        }
        break;
      }
      case 'waitingForClear': {
        if (aliveUnitCount === 0) {
          this.events.onWaveCompleted?.(this.currentWaveIndex);
          const wave = this.level.waves[this.currentWaveIndex];
          this.phaseTimer = wave?.gapAfterSeconds ?? 0;
          this.phase = 'gap';
        }
        break;
      }
      case 'gap': {
        if (this.phaseTimer <= 0) {
          this.advanceToNextWave();
        }
        break;
      }
    }
  }

  /** Skip the current pre-wave countdown so the next wave starts immediately. */
  skipCountdown(): void {
    if (this.phase === 'preWaveCountdown') {
      this.phaseTimer = 0;
      this.phase = 'spawning';
      this.events.onWaveStarted?.(this.currentWaveIndex);
    } else if (this.phase === 'gap') {
      this.phaseTimer = 0;
      this.advanceToNextWave();
    }
  }

  private advanceToNextWave(): void {
    this.currentWaveIndex += 1;
    if (this.currentWaveIndex >= this.level.waves.length) {
      this.phase = 'completed';
      this.events.onAllWavesCompleted?.();
      return;
    }
    const wave = this.level.waves[this.currentWaveIndex];
    this.slotStates = wave.slots.map((slot) => ({
      archetype: slot.archetype,
      remaining: slot.count,
      intervalSeconds: slot.intervalSeconds,
      delaySeconds: slot.delaySeconds ?? 0,
      elapsed: 0,
      spawned: 0,
    }));
    this.waveSpawnedCount = 0;
    this.phase = 'preWaveCountdown';
    this.phaseTimer = this.currentWaveIndex === 0 ? this.preWaveCountdownSeconds : Math.max(2, this.preWaveCountdownSeconds * 0.6);
  }

  private spawnFromSlot(archetype: ArchetypeId): void {
    const position = entranceSpawnPosition(this.maze, this.rng);
    const id = this.nextSlimeId;
    this.nextSlimeId += 1;
    const unit = spawnSlime({ archetype, id, position });
    this.events.onSpawn?.(unit);
    this.waveSpawnedCount += 1;
  }
}

export function summarizeWave(wave: WaveDefinition, waveIndex: number): WavePreview {
  const archetypes: Partial<Record<ArchetypeId, number>> = {};
  let total = 0;
  for (const slot of wave.slots) {
    archetypes[slot.archetype] = (archetypes[slot.archetype] ?? 0) + slot.count;
    total += slot.count;
  }
  const summary = Object.entries(archetypes)
    .map(([archetype, count]) => `${count}x ${archetype}`)
    .join(', ');
  return {
    index: waveIndex,
    totalSlimes: total,
    archetypes,
    description: summary,
  };
}
