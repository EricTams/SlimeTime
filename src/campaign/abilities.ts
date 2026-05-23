import { positionToCell } from '../sim/maze';
import type { DamageEvent, MazeGrid, Vector2 } from '../sim/types';
import { add, length, normalize, scale, subtract, vec } from '../sim/vector';
import type { ToolDefinition } from './chargeSystem';
import { FlowField } from '../sim/flowField';

export type AbilityKind = 'poke' | 'aoeFreeze' | 'swarm' | 'punt' | 'backlash' | 'meteors';

export interface AbilityDefinition extends ToolDefinition {
  category: 'ability';
  kind: AbilityKind;
  color: number;
  icon: string;
}

export const ABILITY_DEFINITIONS: Record<AbilityKind, AbilityDefinition> = {
  poke: {
    id: 'poke',
    category: 'ability',
    label: 'Poke',
    description: 'Pinpoint single-target damage at the click point.',
    icon: '!',
    color: 0xfff37d,
    kind: 'poke',
    baseChargeTime: 4,
    baseMaxCharges: 2,
    unlockCurrency: 'cores',
    unlockCost: 1,
    baseStats: {
      damage: 10,
      radius: 14,
    },
  },
  aoeFreeze: {
    id: 'aoeFreeze',
    category: 'ability',
    label: 'AOE Freeze',
    description: 'Freezes slimes in a small area for a few seconds.',
    icon: '*',
    color: 0x9ed8ff,
    kind: 'aoeFreeze',
    baseChargeTime: 16,
    baseMaxCharges: 1,
    unlockCurrency: 'cores',
    unlockCost: 1,
    baseStats: {
      radius: 80,
      duration: 3,
      damage: 1,
    },
  },
  swarm: {
    id: 'swarm',
    category: 'ability',
    label: 'Swarm',
    description: 'Releases a flowing aerial swarm that damages slimes it passes over.',
    icon: '~',
    color: 0xffd166,
    kind: 'swarm',
    baseChargeTime: 18,
    baseMaxCharges: 1,
    unlockCurrency: 'cores',
    unlockCost: 1,
    baseStats: {
      damage: 1.2,
      radius: 36,
      duration: 4.5,
      speed: 70,
      tickInterval: 0.18,
    },
  },
  punt: {
    id: 'punt',
    category: 'ability',
    label: 'Punt',
    description: 'Knocks slimes backward through the maze toward earlier points.',
    icon: '<',
    color: 0xff7e54,
    kind: 'punt',
    baseChargeTime: 12,
    baseMaxCharges: 1,
    unlockCurrency: 'cores',
    unlockCost: 1,
    baseStats: {
      radius: 90,
      strength: 360,
      damage: 0,
    },
  },
  backlash: {
    id: 'backlash',
    category: 'ability',
    label: 'Backlash',
    description: 'Lashes a damage line from click point toward the nearest spawn.',
    icon: '/',
    color: 0xff5e9a,
    kind: 'backlash',
    baseChargeTime: 18,
    baseMaxCharges: 1,
    unlockCurrency: 'cores',
    unlockCost: 1,
    baseStats: {
      damage: 6,
      width: 22,
      cellRange: 20,
    },
  },
  meteors: {
    id: 'meteors',
    category: 'ability',
    label: 'Meteors',
    description: 'Drops 3 staggered meteors near the cursor.',
    icon: '^',
    color: 0xff4d4d,
    kind: 'meteors',
    baseChargeTime: 28,
    baseMaxCharges: 1,
    unlockCurrency: 'cores',
    unlockCost: 1,
    baseStats: {
      damage: 16,
      radius: 60,
      meteorCount: 3,
      spread: 90,
      delay: 0.45,
    },
  },
};

export const ABILITY_KINDS = Object.keys(ABILITY_DEFINITIONS) as AbilityKind[];

export interface AbilityActivation {
  kind: AbilityKind;
  point: Vector2;
  /** Optional aim point used by directional abilities (e.g. Punt). */
  aim?: Vector2;
}

interface ActiveSwarm {
  kind: 'swarm';
  position: Vector2;
  velocity: Vector2;
  expiresAt: number;
  nextTickAt: number;
  damage: number;
  radius: number;
  tickInterval: number;
}

interface PendingMeteor {
  kind: 'meteor';
  triggerAt: number;
  position: Vector2;
  damage: number;
  radius: number;
}

type ActiveEffect = ActiveSwarm | PendingMeteor;

export interface AbilityActivationContext {
  maze: MazeGrid;
  /** Per-tool stats from the ChargeSystem. */
  stats: Record<string, number>;
  currentTime: number;
  flowField: FlowField;
  pressFreezeBonus?: boolean;
}

export interface AbilityActivationResult {
  /** Damage events to apply this step. */
  immediateEvents: DamageEvent[];
}

export class AbilitySystem {
  private effects: ActiveEffect[] = [];

  /** Trigger an ability. Returns immediate damage events to apply this step. */
  activate(
    activation: AbilityActivation,
    context: AbilityActivationContext,
  ): AbilityActivationResult {
    const events: DamageEvent[] = [];
    const stats = context.stats;
    const point = clampToMaze(activation.point, context.maze);

    switch (activation.kind) {
      case 'poke': {
        events.push({
          type: 'aoe',
          origin: point,
          radius: stats.radius ?? 14,
          damage: stats.damage ?? 10,
        });
        break;
      }
      case 'aoeFreeze': {
        events.push({
          type: 'freeze',
          origin: point,
          radius: stats.radius ?? 80,
          duration: stats.duration ?? 3,
          damage: stats.damage ?? 1,
        });
        break;
      }
      case 'swarm': {
        const direction = activation.aim
          ? normalize(subtract(activation.aim, point))
          : { x: 1, y: 0 };
        const speed = stats.speed ?? 70;
        const duration = stats.duration ?? 4.5;
        this.effects.push({
          kind: 'swarm',
          position: { ...point },
          velocity: scale(direction.x === 0 && direction.y === 0 ? { x: 1, y: 0 } : direction, speed),
          expiresAt: context.currentTime + duration,
          nextTickAt: context.currentTime,
          damage: stats.damage ?? 1.2,
          radius: stats.radius ?? 36,
          tickInterval: stats.tickInterval ?? 0.18,
        });
        break;
      }
      case 'punt': {
        const direction = puntDirection(point, context);
        events.push({
          type: 'shove',
          origin: point,
          direction,
          radius: stats.radius ?? 90,
          strength: stats.strength ?? 360,
          damage: stats.damage ?? 0,
        });
        break;
      }
      case 'backlash': {
        const cellRange = stats.cellRange ?? 20;
        const cell = positionToCell(context.maze, point.x, point.y);
        const path = traceFlowFieldUpstream(context.maze, context.flowField, cell, cellRange);
        for (const segment of path) {
          events.push({
            type: 'line',
            origin: segment.from,
            direction: subtract(segment.to, segment.from),
            range: length(subtract(segment.to, segment.from)),
            width: stats.width ?? 22,
            damage: stats.damage ?? 6,
          });
        }
        break;
      }
      case 'meteors': {
        const count = Math.max(1, Math.floor(stats.meteorCount ?? 3));
        const spread = stats.spread ?? 90;
        const delay = stats.delay ?? 0.45;
        for (let i = 0; i < count; i += 1) {
          const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
          const offset = vec(Math.cos(angle) * spread, Math.sin(angle) * spread);
          this.effects.push({
            kind: 'meteor',
            triggerAt: context.currentTime + delay * (i + 1),
            position: clampToMaze(add(point, offset), context.maze),
            damage: stats.damage ?? 16,
            radius: stats.radius ?? 60,
          });
        }
        break;
      }
    }
    return { immediateEvents: events };
  }

  /** Tick active effects forward, returning damage events for the current step. */
  tick(dt: number, currentTime: number): DamageEvent[] {
    const events: DamageEvent[] = [];
    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const effect = this.effects[i];
      if (effect.kind === 'swarm') {
        effect.position = add(effect.position, scale(effect.velocity, dt));
        while (currentTime >= effect.nextTickAt && currentTime < effect.expiresAt) {
          events.push({
            type: 'dot',
            origin: { ...effect.position },
            radius: effect.radius,
            damage: effect.damage,
          });
          effect.nextTickAt += effect.tickInterval;
        }
        if (currentTime >= effect.expiresAt) {
          this.effects.splice(i, 1);
        }
      } else if (effect.kind === 'meteor') {
        if (currentTime >= effect.triggerAt) {
          events.push({
            type: 'aoe',
            origin: effect.position,
            radius: effect.radius,
            damage: effect.damage,
          });
          this.effects.splice(i, 1);
        }
      }
    }
    return events;
  }

  /** Visual data for active effects (consumed by the renderer). */
  snapshot(): Array<
    | { kind: 'swarm'; position: Vector2; radius: number; expiresAt: number }
    | { kind: 'meteor'; position: Vector2; triggerAt: number; radius: number }
  > {
    return this.effects.map((effect) =>
      effect.kind === 'swarm'
        ? { kind: 'swarm', position: { ...effect.position }, radius: effect.radius, expiresAt: effect.expiresAt }
        : { kind: 'meteor', position: { ...effect.position }, triggerAt: effect.triggerAt, radius: effect.radius },
    );
  }

  reset(): void {
    this.effects = [];
  }
}

function clampToMaze(point: Vector2, maze: MazeGrid): Vector2 {
  const margin = maze.tileSize * 0.5;
  return {
    x: Math.min(maze.width * maze.tileSize - margin, Math.max(margin, point.x)),
    y: Math.min(maze.height * maze.tileSize - margin, Math.max(margin, point.y)),
  };
}

function puntDirection(point: Vector2, context: AbilityActivationContext): Vector2 {
  const flow = context.flowField.directionAtWorld(point);
  if (flow.x === 0 && flow.y === 0) {
    return { x: -1, y: 0 };
  }
  return { x: -flow.x, y: -flow.y };
}

interface BacklashSegment {
  from: Vector2;
  to: Vector2;
}

function traceFlowFieldUpstream(
  maze: MazeGrid,
  flow: FlowField,
  startCell: Vector2,
  maxCells: number,
): BacklashSegment[] {
  const segments: BacklashSegment[] = [];
  let currentCell = { x: startCell.x, y: startCell.y };
  for (let i = 0; i < maxCells; i += 1) {
    const center = { x: currentCell.x * maze.tileSize + maze.tileSize / 2, y: currentCell.y * maze.tileSize + maze.tileSize / 2 };
    const direction = flow.directionAtWorld(center);
    if (direction.x === 0 && direction.y === 0) {
      break;
    }
    const reverse = { x: -direction.x, y: -direction.y };
    const stepX = Math.round(reverse.x);
    const stepY = Math.round(reverse.y);
    const nextCell = { x: currentCell.x + stepX, y: currentCell.y + stepY };
    if (nextCell.x === currentCell.x && nextCell.y === currentCell.y) {
      break;
    }
    if (
      nextCell.x < 0 ||
      nextCell.y < 0 ||
      nextCell.x >= maze.width ||
      nextCell.y >= maze.height
    ) {
      break;
    }
    const nextCenter = {
      x: nextCell.x * maze.tileSize + maze.tileSize / 2,
      y: nextCell.y * maze.tileSize + maze.tileSize / 2,
    };
    segments.push({ from: center, to: nextCenter });
    currentCell = nextCell;
  }
  return segments;
}
