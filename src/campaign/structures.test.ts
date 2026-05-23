import { describe, expect, it } from 'vitest';
import { createOpenFixtureMaze } from '../../test/fixtures/simpleMaze';
import { cellIndex } from '../sim/maze';
import { World } from '../sim/world';
import { spawnSlime } from './spawnSlime';
import {
  STRUCTURE_DEFINITIONS,
  bestSightlineLength,
  canPlaceStructure,
  createStructureInstance,
  flowBiasSourcesFor,
  tickStructures,
} from './structures';
import type { DamageEvent, ProjectileSpawnSpec } from '../sim/types';

describe('structure placement', () => {
  it('rejects placing a Pinpricker on a floor tile', () => {
    const maze = createOpenFixtureMaze();
    const result = canPlaceStructure(STRUCTURE_DEFINITIONS.pinpricker, maze, { x: 2, y: 2 }, []);
    expect(result.ok).toBe(false);
  });

  it('rejects placing a Pinpricker on a border wall tile', () => {
    const maze = createOpenFixtureMaze();
    const result = canPlaceStructure(STRUCTURE_DEFINITIONS.pinpricker, maze, { x: 0, y: 1 }, []);
    expect(result.ok).toBe(false);
  });

  it('accepts a Pinpricker on a non-border wall tile', () => {
    const maze = createOpenFixtureMaze();
    maze.walls[cellIndex(maze, 2, 2)] = 1;
    const result = canPlaceStructure(STRUCTURE_DEFINITIONS.pinpricker, maze, { x: 2, y: 2 }, []);
    expect(result.ok).toBe(true);
  });

  it('rejects a Wall-Blade on a floor tile', () => {
    const maze = createOpenFixtureMaze();
    const result = canPlaceStructure(STRUCTURE_DEFINITIONS.wallBlade, maze, { x: 2, y: 2 }, []);
    expect(result.ok).toBe(false);
  });

  it('rejects a Wall-Blade on a border wall tile', () => {
    const maze = createOpenFixtureMaze();
    const result = canPlaceStructure(STRUCTURE_DEFINITIONS.wallBlade, maze, { x: 0, y: 1 }, []);
    expect(result.ok).toBe(false);
  });

  it('rejects a Press in an open chamber and accepts it in a corridor', () => {
    const maze = createOpenFixtureMaze();
    const open = canPlaceStructure(STRUCTURE_DEFINITIONS.press, maze, { x: 2, y: 2 }, []);
    expect(open.ok).toBe(false);

    maze.walls[cellIndex(maze, 2, 2)] = 1;
    maze.walls[cellIndex(maze, 4, 2)] = 1;
    const corridor = canPlaceStructure(STRUCTURE_DEFINITIONS.press, maze, { x: 3, y: 2 }, []);
    expect(corridor.ok).toBe(true);
  });

  it('rejects a Sniper without a long enough sightline', () => {
    const maze = createOpenFixtureMaze();
    const longLine = bestSightlineLength(maze, { x: 1, y: 1 });
    expect(longLine).toBeLessThan(STRUCTURE_DEFINITIONS.sniper.placement.kind === 'lineOfSight'
      ? STRUCTURE_DEFINITIONS.sniper.placement.minLength
      : 0);
    const result = canPlaceStructure(STRUCTURE_DEFINITIONS.sniper, maze, { x: 1, y: 1 }, []);
    expect(result.ok).toBe(false);
  });

  it('rejects placing on a tile that already has a structure', () => {
    const maze = createOpenFixtureMaze();
    maze.walls[cellIndex(maze, 2, 2)] = 1;
    const existing = createStructureInstance(
      STRUCTURE_DEFINITIONS.pinpricker,
      { x: 2, y: 2 },
      maze,
      STRUCTURE_DEFINITIONS.pinpricker.baseStats,
      'p1',
    );
    const result = canPlaceStructure(STRUCTURE_DEFINITIONS.pinpricker, maze, { x: 2, y: 2 }, [existing]);
    expect(result.ok).toBe(false);
  });
});

describe('structure ticking', () => {
  it('Pinpricker spawns an arrow projectile at the closest slime', () => {
    const maze = createOpenFixtureMaze();
    const structure = createStructureInstance(
      STRUCTURE_DEFINITIONS.pinpricker,
      { x: 2, y: 2 },
      maze,
      STRUCTURE_DEFINITIONS.pinpricker.baseStats,
      'p1',
    );
    const slime = spawnSlime({ archetype: 'horde', id: 1, position: { x: 30, y: 25 } });
    const events: DamageEvent[] = [];
    const spawned: ProjectileSpawnSpec[] = [];
    tickStructures([structure], {
      maze,
      units: [slime],
      dt: 0.1,
      events,
      spawnProjectile: (spec) => spawned.push(spec),
    });
    expect(spawned).toHaveLength(1);
    expect(spawned[0].kind).toBe('arrow');
  });

  it('Pulser produces a shove event with wall impact on cooldown reset', () => {
    const maze = createOpenFixtureMaze();
    const structure = createStructureInstance(
      STRUCTURE_DEFINITIONS.pulser,
      { x: 2, y: 2 },
      maze,
      STRUCTURE_DEFINITIONS.pulser.baseStats,
      's1',
    );
    const slime = spawnSlime({ archetype: 'horde', id: 1, position: { x: 28, y: 25 } });
    const events: DamageEvent[] = [];
    tickStructures([structure], { maze, units: [slime], dt: 0.5, events });
    expect(events.some((event) => event.type === 'shove')).toBe(true);
  });

  it('Press emits both percentHp and squish events', () => {
    const maze = createOpenFixtureMaze();
    const structure = createStructureInstance(
      STRUCTURE_DEFINITIONS.press,
      { x: 2, y: 2 },
      maze,
      STRUCTURE_DEFINITIONS.press.baseStats,
      's1',
    );
    const slime = spawnSlime({ archetype: 'blocker', id: 1, position: { x: 25, y: 25 } });
    const events: DamageEvent[] = [];
    tickStructures([structure], { maze, units: [slime], dt: 0.1, events });
    expect(events.some((event) => event.type === 'percentHp')).toBe(true);
    expect(events.some((event) => event.type === 'squish')).toBe(true);
  });

  it('Lure exposes a flow bias source via flowBiasSourcesFor', () => {
    const maze = createOpenFixtureMaze();
    const structure = createStructureInstance(
      STRUCTURE_DEFINITIONS.lure,
      { x: 2, y: 2 },
      maze,
      STRUCTURE_DEFINITIONS.lure.baseStats,
      's1',
    );
    expect(flowBiasSourcesFor([structure])).toHaveLength(1);
  });

  it('Barricade pressure depletes when slimes push on it', () => {
    const maze = createOpenFixtureMaze();
    const structure = createStructureInstance(
      STRUCTURE_DEFINITIONS.barricade,
      { x: 2, y: 2 },
      maze,
      STRUCTURE_DEFINITIONS.barricade.baseStats,
      's1',
    );
    const slime = spawnSlime({ archetype: 'horde', id: 1, position: { x: 25, y: 25 } });
    const events: DamageEvent[] = [];
    for (let i = 0; i < 200 && structure.alive; i += 1) {
      tickStructures([structure], { maze, units: [slime], dt: 0.1, events });
    }
    expect(structure.alive).toBe(false);
  });

  it('Splash Cannon fires AoE at a clump of slimes', () => {
    const maze = createOpenFixtureMaze();
    const structure = createStructureInstance(
      STRUCTURE_DEFINITIONS.splashCannon,
      { x: 2, y: 2 },
      maze,
      STRUCTURE_DEFINITIONS.splashCannon.baseStats,
      's1',
    );
    const slimes = [
      spawnSlime({ archetype: 'horde', id: 1, position: { x: 28, y: 25 } }),
      spawnSlime({ archetype: 'horde', id: 2, position: { x: 30, y: 25 } }),
    ];
    const events: DamageEvent[] = [];
    tickStructures([structure], { maze, units: slimes, dt: 0.1, events });
    expect(events.some((event) => event.type === 'aoe')).toBe(true);
  });

  it('damages real slimes via World when fired at them', () => {
    const maze = createOpenFixtureMaze();
    const structure = createStructureInstance(
      STRUCTURE_DEFINITIONS.pinpricker,
      { x: 2, y: 2 },
      maze,
      STRUCTURE_DEFINITIONS.pinpricker.baseStats,
      's1',
    );
    const slime = spawnSlime({ archetype: 'horde', id: 1, position: { x: 30, y: 25 } });
    slime.health = 4;
    slime.maxHealth = 4;
    const world = new World({
      maze,
      units: [slime],
      seed: 1,
      config: { jitterStrength: 0, flowWeight: 0, separationWeight: 0, densityWeight: 0 },
    });
    const events: DamageEvent[] = [];
    tickStructures([structure], {
      maze,
      units: [slime],
      dt: 0.1,
      events,
      spawnProjectile: (spec) => world.spawnProjectile(spec),
    });
    for (let i = 0; i < 30 && slime.alive; i += 1) {
      world.step(0.05, events);
    }
    expect(slime.alive).toBe(false);
  });
});
