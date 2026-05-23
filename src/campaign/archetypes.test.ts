import { describe, expect, it } from 'vitest';
import { createOpenFixtureMaze } from '../../test/fixtures/simpleMaze';
import { World } from '../sim/world';
import { ARCHETYPES } from './archetypes';
import { spawnSlime } from './spawnSlime';

const NO_JITTER = { jitterStrength: 0 };

describe('archetypes', () => {
  it('sprint slimes lose their speed buff after taking damage', () => {
    const maze = createOpenFixtureMaze();
    const sprint = spawnSlime({ archetype: 'sprint', id: 1, position: { x: 25, y: 25 } });
    const world = new World({ maze, units: [sprint], seed: 1, config: NO_JITTER });

    world.step(0.1);
    const buffedMultiplier = sprint.speedMultiplier ?? 1;
    expect(buffedMultiplier).toBeGreaterThan(1);

    world.step(0, [{ type: 'aoe', origin: { x: 25, y: 25 }, radius: 10, damage: 1 }]);
    world.step(0.1);

    expect(sprint.archetypeState?.sprintActive).toBe(false);
    expect(sprint.speedMultiplier).toBe(1);
  });

  it('king aura buffs nearby slimes', () => {
    const maze = createOpenFixtureMaze();
    const king = spawnSlime({ archetype: 'king', id: 1, position: { x: 25, y: 25 } });
    const minion = spawnSlime({ archetype: 'horde', id: 2, position: { x: 35, y: 25 } });
    const world = new World({ maze, units: [king, minion], seed: 1, config: NO_JITTER });

    world.step(0.05);

    expect(minion.speedMultiplier).toBeGreaterThan(1);
  });

  it('cocoon hardens into a shell after damage and dies if the shell is broken', () => {
    const maze = createOpenFixtureMaze();
    const cocoon = spawnSlime({ archetype: 'cocoon', id: 1, position: { x: 25, y: 25 } });
    cocoon.health = ARCHETYPES.cocoon.baseHealth;
    cocoon.maxHealth = ARCHETYPES.cocoon.baseHealth;
    const world = new World({ maze, units: [cocoon], seed: 1, config: NO_JITTER });

    world.step(0, [{ type: 'aoe', origin: { x: 25, y: 25 }, radius: 5, damage: 6 }]);
    expect(cocoon.archetypeState?.shelled).toBe(true);
    expect(cocoon.archetypeState?.shellHealth).toBeGreaterThan(0);

    world.step(0, [{ type: 'aoe', origin: { x: 25, y: 25 }, radius: 5, damage: 1000 }]);
    expect(cocoon.alive).toBe(false);
  });

  it('cocoon re-emerges with full HP if the shell timer expires', () => {
    const maze = createOpenFixtureMaze();
    const cocoon = spawnSlime({ archetype: 'cocoon', id: 1, position: { x: 25, y: 25 } });
    const world = new World({ maze, units: [cocoon], seed: 1, config: NO_JITTER });

    world.step(0, [{ type: 'aoe', origin: { x: 25, y: 25 }, radius: 5, damage: 6 }]);
    expect(cocoon.archetypeState?.shelled).toBe(true);

    for (let i = 0; i < 100; i += 1) {
      world.step(0.1);
    }

    expect(cocoon.archetypeState?.shelled).toBe(false);
    expect(cocoon.health).toBe(cocoon.maxHealth);
  });

  it('corrupter converts a Horde after sustained contact', () => {
    const maze = createOpenFixtureMaze();
    const corrupter = spawnSlime({ archetype: 'corrupter', id: 1, position: { x: 25, y: 25 } });
    const horde = spawnSlime({ archetype: 'horde', id: 2, position: { x: 27, y: 25 } });
    const world = new World({
      maze,
      units: [corrupter, horde],
      seed: 1,
      config: { ...NO_JITTER, flowWeight: 0, separationWeight: 0, densityWeight: 0 },
    });

    for (let i = 0; i < 40; i += 1) {
      world.step(0.05);
    }

    expect(horde.archetype).toBe('corrupter');
  });

  it('wall-breaker destroys an adjacent wall over time', () => {
    const maze = createOpenFixtureMaze();
    // Add an interior wall for the breaker to target (border walls are off-limits).
    maze.walls[1 * maze.width + 2] = 1;
    const wallBreaker = spawnSlime({
      archetype: 'wallBreaker',
      id: 1,
      position: { x: 15, y: 15 },
    });
    let brokenCell: { x: number; y: number } | undefined;
    const world = new World({
      maze,
      units: [wallBreaker],
      seed: 1,
      config: { ...NO_JITTER, flowWeight: 0, separationWeight: 0 },
      onWallBroken: (cell) => {
        brokenCell = cell;
      },
    });

    for (let i = 0; i < 100; i += 1) {
      world.step(0.1);
      if (brokenCell) {
        break;
      }
    }

    expect(brokenCell).toBeDefined();
  });

  it('healer regenerates nearby slimes', () => {
    const maze = createOpenFixtureMaze();
    const healer = spawnSlime({ archetype: 'healer', id: 1, position: { x: 25, y: 25 } });
    const wounded = spawnSlime({ archetype: 'horde', id: 2, position: { x: 30, y: 25 } });
    wounded.health = 1;
    healer.archetypeState!.healCooldown = 0;
    const world = new World({ maze, units: [healer, wounded], seed: 1, config: NO_JITTER });

    world.step(0.05);

    expect(wounded.health).toBeGreaterThan(1);
  });

  it('armored blocks piercing rays from reaching units behind it', () => {
    const maze = createOpenFixtureMaze();
    const armored = spawnSlime({ archetype: 'armored', id: 1, position: { x: 22, y: 25 } });
    armored.health = 100;
    armored.maxHealth = 100;
    const horde = spawnSlime({ archetype: 'horde', id: 2, position: { x: 32, y: 25 } });
    const world = new World({ maze, units: [armored, horde], seed: 1, config: NO_JITTER });

    world.step(0, [
      {
        type: 'ray',
        origin: { x: 14, y: 25 },
        direction: { x: 1, y: 0 },
        range: 40,
        damage: 4,
        pierce: 5,
      },
    ]);

    expect(armored.health).toBeLessThan(100);
    expect(horde.health).toBe(horde.maxHealth);
  });
});
