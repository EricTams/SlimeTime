import { cellCenter, isInsideMaze, isWallCell, positionToCell } from '../sim/maze';
import type {
  DamageEvent,
  MazeGrid,
  ProjectileSpawnSpec,
  ShotEffectKind,
  SlimeUnit,
  Vector2,
} from '../sim/types';
import { distanceSquared, normalize, subtract } from '../sim/vector';
import type { ToolDefinition } from './chargeSystem';

export interface StructureShot {
  kind: ShotEffectKind;
  origin: Vector2;
  target: Vector2;
  radius: number;
  color: number;
  duration: number;
}

export type StructureKind =
  | 'pinpricker'
  | 'splashCannon'
  | 'barricade'
  | 'press'
  | 'pulser'
  | 'wallBlade'
  | 'lure'
  | 'sniper';

export type PlacementConstraint =
  | { kind: 'floor' }
  | { kind: 'corridor' }
  | { kind: 'wall' }
  | { kind: 'lineOfSight'; minLength: number };

export interface StructureDefinition extends ToolDefinition {
  category: 'structure';
  kind: StructureKind;
  placement: PlacementConstraint;
  /** Optional: structures that subtract from charges differently (e.g. barricade is super cheap). */
  recallRefundOverride?: number;
  color: number;
  icon: string;
}

export const STRUCTURE_DEFINITIONS: Record<StructureKind, StructureDefinition> = {
  pinpricker: {
    id: 'pinpricker',
    category: 'structure',
    label: 'Pinpricker',
    description: 'Cheap, fast turret that fires arrows. Pierce upgrades let arrows pass through extra slimes.',
    icon: '·',
    color: 0xb7d98f,
    kind: 'pinpricker',
    placement: { kind: 'wall' },
    baseChargeTime: 5,
    baseMaxCharges: 3,
    unlockCurrency: 'cores',
    unlockCost: 0,
    baseStats: {
      damage: 4,
      range: 130,
      rate: 1.6,
      pierce: 0,
    },
  },
  splashCannon: {
    id: 'splashCannon',
    category: 'structure',
    label: 'Splash Cannon',
    description: 'AoE projectile. Slow rate of fire. Mounts on a wall tile.',
    icon: '*',
    color: 0xf9a03f,
    kind: 'splashCannon',
    placement: { kind: 'wall' },
    baseChargeTime: 9,
    baseMaxCharges: 2,
    unlockCurrency: 'cores',
    unlockCost: 1,
    baseStats: {
      damage: 9,
      range: 110,
      radius: 60,
      rate: 0.55,
    },
  },
  barricade: {
    id: 'barricade',
    category: 'structure',
    label: 'Barricade',
    description: 'Quick obstacle that breaks under sustained pushing.',
    icon: '#',
    color: 0xa48458,
    kind: 'barricade',
    placement: { kind: 'floor' },
    baseChargeTime: 2.5,
    baseMaxCharges: 4,
    unlockCurrency: 'cores',
    unlockCost: 1,
    baseStats: {
      pressureCapacity: 8,
      pressureDecayPerSecond: 1,
    },
  },
  press: {
    id: 'press',
    category: 'structure',
    label: 'Press',
    description: 'Slams down in a 1-tile corridor for percent-HP and squish.',
    icon: 'V',
    color: 0xc8c8c8,
    kind: 'press',
    placement: { kind: 'corridor' },
    baseChargeTime: 12,
    baseMaxCharges: 2,
    unlockCurrency: 'cores',
    unlockCost: 1,
    baseStats: {
      fraction: 0.45,
      damage: 4,
      radius: 28,
      rate: 0.6,
      shrinkFraction: 0.3,
      shrinkDuration: 1,
    },
  },
  pulser: {
    id: 'pulser',
    category: 'structure',
    label: 'Pulser',
    description: 'Shoves slimes outward; wall impacts deal extra damage.',
    icon: 'O',
    color: 0x7adfff,
    kind: 'pulser',
    placement: { kind: 'floor' },
    baseChargeTime: 11,
    baseMaxCharges: 2,
    unlockCurrency: 'cores',
    unlockCost: 1,
    baseStats: {
      damage: 1,
      radius: 70,
      rate: 0.7,
      strength: 220,
      wallImpact: 6,
    },
  },
  wallBlade: {
    id: 'wallBlade',
    category: 'structure',
    label: 'Wall-Blade',
    description: 'Mounts on a wall tile; cuts slimes that touch the wall.',
    icon: 'X',
    color: 0xff5e5e,
    kind: 'wallBlade',
    placement: { kind: 'wall' },
    baseChargeTime: 8,
    baseMaxCharges: 2,
    unlockCurrency: 'cores',
    unlockCost: 1,
    baseStats: {
      damage: 5,
      radius: 22,
      rate: 1.4,
    },
  },
  lure: {
    id: 'lure',
    category: 'structure',
    label: 'Lure',
    description: 'Locally biases the flow field toward itself.',
    icon: '@',
    color: 0xdc8dff,
    kind: 'lure',
    placement: { kind: 'floor' },
    baseChargeTime: 14,
    baseMaxCharges: 1,
    unlockCurrency: 'cores',
    unlockCost: 1,
    baseStats: {
      radius: 110,
    },
  },
  sniper: {
    id: 'sniper',
    category: 'structure',
    label: 'Sniper',
    description: 'Long-range raycast on a wall tile with a 4+ corridor sightline.',
    icon: '|',
    color: 0xfff37d,
    kind: 'sniper',
    placement: { kind: 'lineOfSight', minLength: 4 },
    baseChargeTime: 14,
    baseMaxCharges: 1,
    unlockCurrency: 'cores',
    unlockCost: 1,
    baseStats: {
      damage: 22,
      range: 480,
      rate: 0.3,
      pierce: 1,
    },
  },
};

export const STRUCTURE_KINDS = Object.keys(STRUCTURE_DEFINITIONS) as StructureKind[];

export interface StructureInstance {
  instanceId: string;
  kind: StructureKind;
  toolId: string;
  cell: { x: number; y: number };
  position: Vector2;
  stats: Record<string, number>;
  cooldown: number;
  alive: boolean;
  pressureRemaining?: number;
  attachedGremlinId?: number;
  immuneSlimeIds?: Set<number>;
  /** Sniper: the validated direction (unit vector along the corridor). */
  direction?: Vector2;
}

export interface PlacementResult {
  ok: boolean;
  reason?: string;
}

export function canPlaceStructure(
  definition: StructureDefinition,
  maze: MazeGrid,
  cell: Vector2,
  existing: readonly StructureInstance[],
): PlacementResult {
  if (!isInsideMaze(maze, cell.x, cell.y)) {
    return { ok: false, reason: 'Outside the maze.' };
  }
  if (cell.x === maze.entrance.x && cell.y === maze.entrance.y) {
    return { ok: false, reason: 'Cannot place on the entrance.' };
  }
  if (cell.x === maze.exit.x && cell.y === maze.exit.y) {
    return { ok: false, reason: 'Cannot place on the exit.' };
  }
  for (const structure of existing) {
    if (structure.alive && structure.cell.x === cell.x && structure.cell.y === cell.y) {
      return { ok: false, reason: 'A structure already occupies this tile.' };
    }
  }

  switch (definition.placement.kind) {
    case 'floor':
      if (isWallCell(maze, cell.x, cell.y)) {
        return { ok: false, reason: 'Must be placed on an open tile.' };
      }
      break;
    case 'corridor': {
      if (isWallCell(maze, cell.x, cell.y)) {
        return { ok: false, reason: 'Must be placed on an open tile.' };
      }
      const horizontal =
        isWallCell(maze, cell.x, cell.y - 1) && isWallCell(maze, cell.x, cell.y + 1);
      const vertical =
        isWallCell(maze, cell.x - 1, cell.y) && isWallCell(maze, cell.x + 1, cell.y);
      if (!horizontal && !vertical) {
        return { ok: false, reason: 'Press must be in a 1-tile-wide corridor.' };
      }
      break;
    }
    case 'wall':
      if (!isWallCell(maze, cell.x, cell.y)) {
        return { ok: false, reason: 'Must be placed on a wall tile.' };
      }
      if (isBorderCell(maze, cell.x, cell.y)) {
        return { ok: false, reason: 'Border walls cannot host structures.' };
      }
      break;
    case 'lineOfSight': {
      if (!isWallCell(maze, cell.x, cell.y)) {
        return { ok: false, reason: 'Must be placed on a wall tile.' };
      }
      if (isBorderCell(maze, cell.x, cell.y)) {
        return { ok: false, reason: 'Border walls cannot host structures.' };
      }
      const sightline = bestSightlineLength(maze, cell);
      if (sightline < definition.placement.minLength) {
        return {
          ok: false,
          reason: `Sniper needs a clear corridor of at least ${definition.placement.minLength} tiles.`,
        };
      }
      break;
    }
  }
  return { ok: true };
}

function isBorderCell(maze: MazeGrid, x: number, y: number): boolean {
  return x === 0 || y === 0 || x === maze.width - 1 || y === maze.height - 1;
}

export function bestSightlineLength(maze: MazeGrid, cell: Vector2): number {
  const directions = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];
  let best = 0;
  for (const direction of directions) {
    let length = 0;
    let x = cell.x + direction.dx;
    let y = cell.y + direction.dy;
    while (isInsideMaze(maze, x, y) && !isWallCell(maze, x, y)) {
      length += 1;
      x += direction.dx;
      y += direction.dy;
    }
    if (length > best) {
      best = length;
    }
  }
  return best;
}

export function bestSightlineDirection(maze: MazeGrid, cell: Vector2): Vector2 {
  const directions = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];
  let best = { dx: 1, dy: 0 };
  let bestLength = -1;
  for (const direction of directions) {
    let length = 0;
    let x = cell.x + direction.dx;
    let y = cell.y + direction.dy;
    while (isInsideMaze(maze, x, y) && !isWallCell(maze, x, y)) {
      length += 1;
      x += direction.dx;
      y += direction.dy;
    }
    if (length > bestLength) {
      bestLength = length;
      best = direction;
    }
  }
  return { x: best.dx, y: best.dy };
}

export function createStructureInstance(
  definition: StructureDefinition,
  cell: Vector2,
  maze: MazeGrid,
  stats: Record<string, number>,
  instanceId: string,
): StructureInstance {
  const position = cellCenter(maze, cell.x, cell.y);
  const instance: StructureInstance = {
    instanceId,
    kind: definition.kind,
    toolId: definition.id,
    cell: { x: cell.x, y: cell.y },
    position,
    stats: { ...stats },
    cooldown: 0,
    alive: true,
  };
  if (definition.kind === 'barricade') {
    instance.pressureRemaining = stats.pressureCapacity ?? 8;
    instance.immuneSlimeIds = new Set();
  }
  if (definition.kind === 'sniper') {
    instance.direction = bestSightlineDirection(maze, cell);
  }
  return instance;
}

export interface StructureTickContext {
  maze: MazeGrid;
  units: readonly SlimeUnit[];
  dt: number;
  /** Damage and effect events the world should apply this step. */
  events: DamageEvent[];
  /** Visual shot effects to render this frame (beams, shell pops, etc.). */
  shots?: StructureShot[];
  /** Spawn live projectiles in the world (true projectile collisions). */
  spawnProjectile?: (spec: ProjectileSpawnSpec) => void;
  /** Multipliers that capstones can apply (e.g. squish bonus). */
  pressFrozenSquishedMultiplier?: number;
}

export function tickStructures(
  structures: readonly StructureInstance[],
  context: StructureTickContext,
): void {
  for (const structure of structures) {
    if (!structure.alive) {
      continue;
    }
    if (structure.attachedGremlinId !== undefined) {
      continue;
    }
    structure.cooldown = Math.max(0, structure.cooldown - context.dt);

    switch (structure.kind) {
      case 'pinpricker':
        tickPinpricker(structure, context);
        break;
      case 'splashCannon':
        tickSplashCannon(structure, context);
        break;
      case 'barricade':
        tickBarricade(structure, context);
        break;
      case 'press':
        tickPress(structure, context);
        break;
      case 'pulser':
        tickPulser(structure, context);
        break;
      case 'wallBlade':
        tickWallBlade(structure, context);
        break;
      case 'lure':
        // Passive; flow bias sources are computed elsewhere.
        break;
      case 'sniper':
        tickSniper(structure, context);
        break;
    }
  }
}

function rateInterval(structure: StructureInstance, fallback = 1): number {
  const rate = structure.stats.rate;
  if (!rate || rate <= 0) {
    return fallback;
  }
  return 1 / rate;
}

function pickClosestAliveSlime(
  position: Vector2,
  range: number,
  units: readonly SlimeUnit[],
): SlimeUnit | undefined {
  let best: SlimeUnit | undefined;
  let bestDistSq = range * range;
  for (const unit of units) {
    if (!unit.alive) {
      continue;
    }
    const distSq = distanceSquared(unit.position, position);
    if (distSq <= bestDistSq) {
      bestDistSq = distSq;
      best = unit;
    }
  }
  return best;
}

function pickDensestPoint(
  position: Vector2,
  range: number,
  units: readonly SlimeUnit[],
): Vector2 | undefined {
  let best: SlimeUnit | undefined;
  let bestScore = -1;
  for (const candidate of units) {
    if (!candidate.alive) {
      continue;
    }
    const distSq = distanceSquared(candidate.position, position);
    if (distSq > range * range) {
      continue;
    }
    let neighbors = 0;
    for (const other of units) {
      if (!other.alive) {
        continue;
      }
      if (distanceSquared(candidate.position, other.position) <= 60 * 60) {
        neighbors += 1;
      }
    }
    if (neighbors > bestScore) {
      bestScore = neighbors;
      best = candidate;
    }
  }
  return best?.position;
}

const PINPRICKER_ARROW_SPEED = 720;

function tickPinpricker(structure: StructureInstance, context: StructureTickContext): void {
  if (structure.cooldown > 0) {
    return;
  }
  const range = structure.stats.range ?? 130;
  const target = pickClosestAliveSlime(structure.position, range, context.units);
  if (!target) {
    return;
  }
  const direction = normalize(subtract(target.position, structure.position));
  if (direction.x === 0 && direction.y === 0) {
    return;
  }
  const pierce = Math.max(0, Math.floor(structure.stats.pierce ?? 0));
  context.spawnProjectile?.({
    kind: 'arrow',
    origin: { ...structure.position },
    direction,
    speed: PINPRICKER_ARROW_SPEED,
    range,
    damage: structure.stats.damage ?? 4,
    pierce,
    color: STRUCTURE_DEFINITIONS.pinpricker.color,
    armoredBlocks: true,
  });
  structure.cooldown = rateInterval(structure, 1);
}

function tickSplashCannon(structure: StructureInstance, context: StructureTickContext): void {
  if (structure.cooldown > 0) {
    return;
  }
  const range = structure.stats.range ?? 110;
  const target = pickDensestPoint(structure.position, range, context.units);
  if (!target) {
    return;
  }
  const radius = structure.stats.radius ?? 60;
  context.events.push({
    type: 'aoe',
    origin: target,
    radius,
    damage: structure.stats.damage ?? 9,
  });
  context.shots?.push({
    kind: 'shell',
    origin: { ...structure.position },
    target: { ...target },
    radius,
    color: STRUCTURE_DEFINITIONS.splashCannon.color,
    duration: 0.45,
  });
  structure.cooldown = rateInterval(structure, 2);
}

function tickBarricade(structure: StructureInstance, context: StructureTickContext): void {
  const radius = context.maze.tileSize * 0.6;
  let pressure = 0;
  const stillTouching = new Set<number>();
  for (const unit of context.units) {
    if (!unit.alive) {
      continue;
    }
    const distSq = distanceSquared(unit.position, structure.position);
    if (distSq > radius * radius) {
      continue;
    }
    stillTouching.add(unit.id);
    if (structure.immuneSlimeIds && structure.immuneSlimeIds.has(unit.id)) {
      continue;
    }
    pressure += 1;
  }
  if (structure.immuneSlimeIds) {
    for (const id of [...structure.immuneSlimeIds]) {
      if (!stillTouching.has(id)) {
        structure.immuneSlimeIds.delete(id);
      }
    }
  }
  if (structure.pressureRemaining !== undefined) {
    structure.pressureRemaining -= pressure * context.dt;
    if (structure.pressureRemaining <= 0) {
      structure.alive = false;
    }
  }
}

function tickPress(structure: StructureInstance, context: StructureTickContext): void {
  if (structure.cooldown > 0) {
    return;
  }
  const radius = structure.stats.radius ?? 28;
  const fraction = structure.stats.fraction ?? 0.45;
  const damage = structure.stats.damage ?? 4;
  context.events.push({
    type: 'percentHp',
    origin: structure.position,
    radius,
    fraction,
  });
  context.events.push({
    type: 'squish',
    origin: structure.position,
    radius,
    damage,
    shrinkFraction: structure.stats.shrinkFraction ?? 0.3,
    duration: structure.stats.shrinkDuration ?? 1,
  });
  context.shots?.push({
    kind: 'slash',
    origin: { ...structure.position },
    target: { ...structure.position },
    radius,
    color: STRUCTURE_DEFINITIONS.press.color,
    duration: 0.32,
  });
  structure.cooldown = rateInterval(structure, 2);
}

function tickPulser(structure: StructureInstance, context: StructureTickContext): void {
  if (structure.cooldown > 0) {
    return;
  }
  const radius = structure.stats.radius ?? 70;
  context.events.push({
    type: 'shove',
    origin: structure.position,
    radius,
    strength: structure.stats.strength ?? 220,
    damage: structure.stats.damage ?? 1,
    wallImpact: structure.stats.wallImpact ?? 6,
  });
  context.shots?.push({
    kind: 'pulse',
    origin: { ...structure.position },
    target: { ...structure.position },
    radius,
    color: STRUCTURE_DEFINITIONS.pulser.color,
    duration: 0.5,
  });
  structure.cooldown = rateInterval(structure, 1.5);
}

function tickWallBlade(structure: StructureInstance, context: StructureTickContext): void {
  if (structure.cooldown > 0) {
    return;
  }
  const radius = structure.stats.radius ?? 22;
  context.events.push({
    type: 'aoe',
    origin: structure.position,
    radius,
    damage: structure.stats.damage ?? 5,
  });
  context.shots?.push({
    kind: 'slash',
    origin: { ...structure.position },
    target: { ...structure.position },
    radius,
    color: STRUCTURE_DEFINITIONS.wallBlade.color,
    duration: 0.18,
  });
  structure.cooldown = rateInterval(structure, 0.7);
}

function tickSniper(structure: StructureInstance, context: StructureTickContext): void {
  if (structure.cooldown > 0) {
    return;
  }
  if (!structure.direction) {
    return;
  }
  const range = structure.stats.range ?? 480;
  context.events.push({
    type: 'ray',
    origin: structure.position,
    direction: structure.direction,
    range,
    damage: structure.stats.damage ?? 22,
    pierce: Math.max(0, Math.floor(structure.stats.pierce ?? 0)),
  });
  context.shots?.push({
    kind: 'snipe',
    origin: { ...structure.position },
    target: {
      x: structure.position.x + structure.direction.x * range,
      y: structure.position.y + structure.direction.y * range,
    },
    radius: 3,
    color: STRUCTURE_DEFINITIONS.sniper.color,
    duration: 0.35,
  });
  structure.cooldown = rateInterval(structure, 3.5);
}

export function flowBiasSourcesFor(structures: readonly StructureInstance[]): Array<{
  origin: Vector2;
  radius: number;
}> {
  const sources: Array<{ origin: Vector2; radius: number }> = [];
  for (const structure of structures) {
    if (!structure.alive || structure.kind !== 'lure') {
      continue;
    }
    sources.push({ origin: structure.position, radius: structure.stats.radius ?? 110 });
  }
  return sources;
}

export function attachGremlinIfPossible(
  structures: readonly StructureInstance[],
  unit: SlimeUnit,
  range: number,
): StructureInstance | undefined {
  if (unit.archetype !== 'gremlin') {
    return undefined;
  }
  if (unit.archetypeState?.attachedStructureId) {
    return structures.find((s) => s.instanceId === unit.archetypeState?.attachedStructureId && s.alive);
  }
  let closest: StructureInstance | undefined;
  let closestDistSq = range * range;
  for (const structure of structures) {
    if (!structure.alive || structure.attachedGremlinId !== undefined) {
      continue;
    }
    if (structure.kind === 'barricade' || structure.kind === 'wallBlade') {
      continue;
    }
    const distSq = distanceSquared(unit.position, structure.position);
    if (distSq < closestDistSq) {
      closestDistSq = distSq;
      closest = structure;
    }
  }
  if (!closest) {
    return undefined;
  }
  closest.attachedGremlinId = unit.id;
  if (unit.archetypeState) {
    unit.archetypeState.attachedStructureId = closest.instanceId;
    unit.archetypeState.attachTimer = 6;
  }
  unit.position = { ...closest.position };
  unit.velocity = { x: 0, y: 0 };
  return closest;
}

export function shooGremlinFromStructure(
  structures: readonly StructureInstance[],
  cellPosition: Vector2,
  units: readonly SlimeUnit[],
  maze: MazeGrid,
): boolean {
  const cell = positionToCell(maze, cellPosition.x, cellPosition.y);
  const structure = structures.find(
    (candidate) => candidate.alive && candidate.cell.x === cell.x && candidate.cell.y === cell.y,
  );
  if (!structure || structure.attachedGremlinId === undefined) {
    return false;
  }
  const gremlinId = structure.attachedGremlinId;
  const gremlin = units.find((unit) => unit.id === gremlinId);
  if (gremlin && gremlin.archetypeState) {
    gremlin.archetypeState.attachedStructureId = undefined;
    gremlin.archetypeState.attachTimer = 0;
  }
  structure.attachedGremlinId = undefined;
  return true;
}

export function progressGremlinAttacks(
  structures: readonly StructureInstance[],
  units: readonly SlimeUnit[],
  dt: number,
): void {
  for (const structure of structures) {
    if (!structure.alive || structure.attachedGremlinId === undefined) {
      continue;
    }
    const gremlin = units.find((unit) => unit.id === structure.attachedGremlinId);
    if (!gremlin || !gremlin.alive) {
      structure.attachedGremlinId = undefined;
      continue;
    }
    const state = gremlin.archetypeState;
    if (!state) {
      continue;
    }
    state.attachTimer = (state.attachTimer ?? 0) - dt;
    if (state.attachTimer <= 0) {
      structure.alive = false;
      state.attachedStructureId = undefined;
    }
  }
}
