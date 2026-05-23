import { cellCenter } from '../sim/maze';
import type { SeededRandom } from '../sim/rng';
import type { MazeGrid, SlimeUnit, Vector2 } from '../sim/types';
import { ARCHETYPES, type ArchetypeId, type ArchetypeRuntimeState } from './archetypes';

export interface SpawnSlimeOptions {
  archetype: ArchetypeId;
  id: number;
  position: Vector2;
  /** Optional override for slime size multiplier (defaults to 1). */
  slimeSizeMultiplier?: number;
}

export function spawnSlime(options: SpawnSlimeOptions): SlimeUnit {
  const stats = ARCHETYPES[options.archetype];
  const sizeMultiplier = options.slimeSizeMultiplier ?? 1;
  const baseRadius = stats.baseRadius;
  const archetypeState = createArchetypeState(options.archetype);

  return {
    id: options.id,
    position: { ...options.position },
    velocity: { x: 0, y: 0 },
    baseRadius,
    radius: baseRadius * sizeMultiplier,
    maxSpeed: stats.baseSpeed,
    baseMaxSpeed: stats.baseSpeed,
    health: stats.baseHealth,
    maxHealth: stats.baseHealth,
    color: stats.color,
    lastDamagedAt: -999,
    alive: true,
    archetype: options.archetype,
    archetypeState,
    speedMultiplier: 1,
  };
}

function createArchetypeState(archetype: ArchetypeId): ArchetypeRuntimeState {
  switch (archetype) {
    case 'armored':
      return { blocksRays: true };
    case 'corrupter':
      return { conversionTimer: 0 };
    case 'hopper':
      return { hopCooldown: 2, hopRemainingTime: 0 };
    case 'healer':
      return { healCooldown: 4, healPulseTime: 0 };
    case 'gremlin':
      return { attachTimer: 0 };
    case 'cocoon':
      return { shelled: false, shellHealth: 0, shellTimer: 0 };
    case 'sprint':
      return { sprintActive: true };
    case 'king':
      return { auraRadiusCells: 2.5 };
    case 'wallBreaker':
      return { wallBreakProgress: 0 };
    default:
      return {};
  }
}

export function entranceSpawnPosition(maze: MazeGrid, rng: SeededRandom): Vector2 {
  const center = cellCenter(maze, maze.entrance.x, maze.entrance.y);
  return {
    x: center.x + rng.centered() * maze.tileSize * 0.18,
    y: center.y + rng.centered() * maze.tileSize * 0.18,
  };
}
