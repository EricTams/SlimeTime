import { describe, expect, it } from 'vitest';
import { createOpenFixtureMaze } from '../../test/fixtures/simpleMaze';
import { World } from '../sim/world';
import { ABILITY_DEFINITIONS, AbilitySystem } from './abilities';
import { spawnSlime } from './spawnSlime';
import { FlowField } from '../sim/flowField';
import type { DamageEvent } from '../sim/types';

describe('AbilitySystem', () => {
  it('Poke produces a tight aoe at the target', () => {
    const maze = createOpenFixtureMaze();
    const flowField = new FlowField(maze);
    const system = new AbilitySystem();
    const result = system.activate(
      { kind: 'poke', point: { x: 25, y: 25 } },
      { maze, flowField, currentTime: 0, stats: ABILITY_DEFINITIONS.poke.baseStats },
    );
    expect(result.immediateEvents.some((event) => event.type === 'aoe')).toBe(true);
  });

  it('AOE Freeze emits a freeze event with duration', () => {
    const maze = createOpenFixtureMaze();
    const flowField = new FlowField(maze);
    const system = new AbilitySystem();
    const result = system.activate(
      { kind: 'aoeFreeze', point: { x: 25, y: 25 } },
      { maze, flowField, currentTime: 0, stats: ABILITY_DEFINITIONS.aoeFreeze.baseStats },
    );
    const freeze = result.immediateEvents.find((event) => event.type === 'freeze');
    expect(freeze).toBeDefined();
    if (freeze && freeze.type === 'freeze') {
      expect(freeze.duration).toBeGreaterThan(0);
    }
  });

  it('Punt shoves slimes back along the flow', () => {
    const maze = createOpenFixtureMaze();
    const flowField = new FlowField(maze);
    const system = new AbilitySystem();
    const slime = spawnSlime({ archetype: 'horde', id: 1, position: { x: 25, y: 25 } });
    const result = system.activate(
      { kind: 'punt', point: { x: 25, y: 25 } },
      { maze, flowField, currentTime: 0, stats: ABILITY_DEFINITIONS.punt.baseStats },
    );
    const world = new World({ maze, units: [slime], seed: 1, config: { jitterStrength: 0 } });
    world.step(0, result.immediateEvents);
    // Impulses are applied on the following step; stepping again integrates them.
    world.step(0.05);
    const flowDir = flowField.directionAtWorld({ x: 25, y: 25 });
    expect(slime.velocity.x * flowDir.x + slime.velocity.y * flowDir.y).toBeLessThan(0);
  });

  it('Meteors trigger delayed AoE events on tick', () => {
    const maze = createOpenFixtureMaze();
    const flowField = new FlowField(maze);
    const system = new AbilitySystem();
    system.activate(
      { kind: 'meteors', point: { x: 25, y: 25 } },
      { maze, flowField, currentTime: 0, stats: ABILITY_DEFINITIONS.meteors.baseStats },
    );
    let events: DamageEvent[] = [];
    let elapsed = 0;
    while (elapsed < 5) {
      events = events.concat(system.tick(0.1, elapsed));
      elapsed += 0.1;
    }
    expect(events.filter((event) => event.type === 'aoe').length).toBeGreaterThanOrEqual(3);
  });

  it('Swarm emits DoT events as it moves', () => {
    const maze = createOpenFixtureMaze();
    const flowField = new FlowField(maze);
    const system = new AbilitySystem();
    system.activate(
      { kind: 'swarm', point: { x: 20, y: 25 }, aim: { x: 40, y: 25 } },
      { maze, flowField, currentTime: 0, stats: ABILITY_DEFINITIONS.swarm.baseStats },
    );
    let events: DamageEvent[] = [];
    let elapsed = 0;
    while (elapsed < 4) {
      events = events.concat(system.tick(0.1, elapsed));
      elapsed += 0.1;
    }
    expect(events.filter((event) => event.type === 'dot').length).toBeGreaterThan(0);
  });

  it('Backlash emits line events going upstream from the click point', () => {
    const maze = createOpenFixtureMaze();
    const flowField = new FlowField(maze);
    const system = new AbilitySystem();
    const result = system.activate(
      { kind: 'backlash', point: { x: 35, y: 25 } },
      { maze, flowField, currentTime: 0, stats: ABILITY_DEFINITIONS.backlash.baseStats },
    );
    expect(result.immediateEvents.some((event) => event.type === 'line')).toBe(true);
  });
});
