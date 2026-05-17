import { describe, expect, it } from 'vitest';
import { cellIndex, isWallAtWorld } from './maze';
import { createDemoMaze } from '../content/demoMaze';
import { createOpenFixtureMaze, fixtureUnit } from '../../test/fixtures/simpleMaze';
import { World } from './world';

describe('World', () => {
  it('keeps units out of wall cells while stepping', () => {
    const maze = createOpenFixtureMaze();
    const units = [fixtureUnit(1, 15, 15)];
    const world = new World({ maze, units, seed: 1, config: { jitterStrength: 0 } });

    for (let i = 0; i < 60; i += 1) {
      const snapshot = world.step(1 / 30);
      for (const unit of snapshot.units) {
        expect(isWallAtWorld(maze, unit.x, unit.y)).toBe(false);
      }
    }
  });

  it('applies AoE damage and emits goo for killed units', () => {
    const maze = createOpenFixtureMaze();
    const world = new World({
      maze,
      units: [fixtureUnit(1, 25, 25), fixtureUnit(2, 35, 25)],
      seed: 1,
      config: { jitterStrength: 0 },
    });

    const snapshot = world.step(0, [{ type: 'aoe', origin: { x: 25, y: 25 }, radius: 5, damage: 20 }]);

    expect(snapshot.units.map((unit) => unit.id)).toEqual([2]);
    expect(snapshot.gooSplats).toHaveLength(1);
    expect(snapshot.gooSplats[0].position).toEqual({ x: 25, y: 25 });
  });

  it('applies the slime size multiplier to existing units when the world is created', () => {
    const maze = createOpenFixtureMaze();
    const unit = fixtureUnit(1, 25, 25);
    const world = new World({
      maze,
      units: [unit],
      seed: 1,
      config: { slimeSizeMultiplier: 1.5 },
    });

    expect(unit.radius).toBe(3);
    expect(world.createSnapshot().units[0].radius).toBe(3);
  });

  it('updates live unit radii when the slime size multiplier changes', () => {
    const maze = createOpenFixtureMaze();
    const unit = fixtureUnit(1, 25, 25);
    const world = new World({ maze, units: [unit], seed: 1 });

    world.setSlimeSizeMultiplier(2);

    expect(unit.radius).toBe(4);
    expect(world.createSnapshot().units[0].radius).toBe(4);
  });

  it('uses scaled radii for separation reach', () => {
    const maze = createOpenFixtureMaze();
    const left = fixtureUnit(1, 20, 25);
    const right = fixtureUnit(2, 30, 25);
    const world = new World({
      maze,
      units: [left, right],
      seed: 1,
      config: {
        accelerationMultiplier: 1,
        densityWeight: 0,
        flowWeight: 0,
        jitterStrength: 0,
        separationWeight: 1,
        slimeSizeMultiplier: 2,
      },
    });

    world.step(0.1);

    expect(left.velocity.x).toBeLessThan(0);
    expect(right.velocity.x).toBeGreaterThan(0);
  });

  it('pushes units away from nearby walls', () => {
    const maze = createOpenFixtureMaze();
    const unit = fixtureUnit(1, 15, 25);
    const world = new World({
      maze,
      units: [unit],
      seed: 1,
      config: {
        accelerationMultiplier: 1,
        densityWeight: 0,
        flowWeight: 0,
        jitterStrength: 0,
        separationRadiusMultiplier: 3,
        separationWeight: 1,
      },
    });

    world.step(0.1);

    expect(unit.velocity.x).toBeGreaterThan(0);
    expect(unit.velocity.y).toBeCloseTo(0);
  });

  it('ignores hidden wall faces between adjacent wall tiles', () => {
    const maze = createOpenFixtureMaze();
    maze.walls[cellIndex(maze, 2, 1)] = 1;
    maze.walls[cellIndex(maze, 2, 2)] = 1;
    const unit = fixtureUnit(1, 30, 20);
    const world = new World({
      maze,
      units: [unit],
      seed: 1,
      config: {
        accelerationMultiplier: 1,
        densityWeight: 0,
        flowWeight: 0,
        jitterStrength: 0,
        separationRadiusMultiplier: 3,
        separationWeight: 1,
      },
    });

    world.step(0.1);

    expect(unit.velocity.x).toBeGreaterThan(0);
    expect(unit.velocity.y).toBeCloseTo(0);
  });

  it('uses scaled radii for damage queries and goo splats', () => {
    const maze = createOpenFixtureMaze();
    const unit = fixtureUnit(1, 25, 25);
    const world = new World({ maze, units: [unit], seed: 1, config: { jitterStrength: 0 } });

    world.setSlimeSizeMultiplier(4);
    const snapshot = world.step(0, [{ type: 'aoe', origin: { x: 35, y: 25 }, radius: 2, damage: 20 }]);

    expect(snapshot.units).toHaveLength(0);
    expect(snapshot.gooSplats[0].radius).toBe(12);
  });

  it('destroys units that reach the exit without creating goo', () => {
    const maze = createOpenFixtureMaze();
    const world = new World({
      maze,
      units: [fixtureUnit(1, 45, 35), fixtureUnit(2, 25, 25)],
      seed: 1,
      config: { jitterStrength: 0 },
    });

    const snapshot = world.step(0);

    expect(snapshot.units.map((unit) => unit.id)).toEqual([2]);
    expect(snapshot.gooSplats).toHaveLength(0);
    expect(snapshot.exitedCount).toBe(1);
  });

  it('accelerates units instead of snapping to target speed', () => {
    const maze = createOpenFixtureMaze();
    const unit = fixtureUnit(1, 25, 35);
    unit.maxSpeed = 10;
    const world = new World({
      maze,
      units: [unit],
      seed: 1,
      config: {
        accelerationMultiplier: 2,
        densityWeight: 0,
        jitterStrength: 0,
        maxSpeedMultiplier: 1,
        separationWeight: 0,
      },
    });

    world.step(0.1);

    expect(unit.velocity.x).toBeCloseTo(2);
    expect(unit.velocity.y).toBeCloseTo(0);
  });

  it('uses the max speed multiplier as a top speed control', () => {
    const maze = createOpenFixtureMaze();
    const unit = fixtureUnit(1, 25, 35);
    unit.maxSpeed = 10;
    unit.velocity = { x: 50, y: 0 };
    const world = new World({
      maze,
      units: [unit],
      seed: 1,
      config: {
        accelerationMultiplier: 0,
        densityWeight: 0,
        jitterStrength: 0,
        maxSpeedMultiplier: 2,
        separationWeight: 0,
      },
    });

    world.step(1);

    expect(unit.velocity.x).toBeCloseTo(20);
    expect(unit.velocity.y).toBeCloseTo(0);
  });

  it('does not use the max speed multiplier as an acceleration control', () => {
    const maze = createOpenFixtureMaze();
    const unit = fixtureUnit(1, 25, 35);
    unit.maxSpeed = 10;
    const world = new World({
      maze,
      units: [unit],
      seed: 1,
      config: {
        accelerationMultiplier: 2,
        densityWeight: 0,
        jitterStrength: 0,
        maxSpeedMultiplier: 4,
        separationWeight: 0,
      },
    });

    world.step(0.1);

    expect(unit.velocity.x).toBeCloseTo(2);
    expect(unit.velocity.y).toBeCloseTo(0);
  });

  it('limits velocity changes when a unit reverses direction', () => {
    const maze = createOpenFixtureMaze();
    const unit = fixtureUnit(1, 25, 35);
    unit.maxSpeed = 10;
    unit.velocity = { x: -10, y: 0 };
    const world = new World({
      maze,
      units: [unit],
      seed: 1,
      config: {
        accelerationMultiplier: 2,
        densityWeight: 0,
        jitterStrength: 0,
        maxSpeedMultiplier: 1,
        separationWeight: 0,
      },
    });

    world.step(0.1);

    expect(unit.velocity.x).toBeCloseTo(-8);
    expect(unit.velocity.y).toBeCloseTo(0);
  });

  it('slows units moving into crowd pressure and lets escaping units exceed base speed', () => {
    const maze = createOpenFixtureMaze();
    const movingIntoCrowd = fixtureUnit(1, 25, 25);
    const movingAwayFromCrowd = fixtureUnit(2, 25, 25);
    movingIntoCrowd.velocity = { x: -10, y: 0 };
    movingAwayFromCrowd.velocity = { x: 10, y: 0 };

    const intoWorld = new World({
      maze,
      units: [movingIntoCrowd, fixtureUnit(3, 15, 25), fixtureUnit(4, 15, 25), fixtureUnit(5, 15, 25)],
      seed: 1,
      config: {
        accelerationMultiplier: 8,
        crowdingThreshold: 0,
        densitySlowdown: 2,
        densityWeight: 1,
        flowWeight: 0,
        jitterStrength: 0,
        maxSpeedMultiplier: 1,
        maxSpeedRatio: 2,
        minSpeedRatio: 0.2,
        separationWeight: 0,
      },
    });
    const awayWorld = new World({
      maze,
      units: [movingAwayFromCrowd, fixtureUnit(6, 15, 25), fixtureUnit(7, 15, 25), fixtureUnit(8, 15, 25)],
      seed: 1,
      config: {
        accelerationMultiplier: 8,
        crowdingThreshold: 0,
        densitySlowdown: 2,
        densityWeight: 1,
        flowWeight: 0,
        jitterStrength: 0,
        maxSpeedMultiplier: 1,
        maxSpeedRatio: 2,
        minSpeedRatio: 0.2,
        separationWeight: 0,
      },
    });

    intoWorld.step(0.1);
    awayWorld.step(0.1);

    expect(Math.abs(movingIntoCrowd.velocity.x)).toBeLessThan(10);
    expect(movingAwayFromCrowd.velocity.x).toBeGreaterThan(10);
  });

  it('clamps units away from newly placed wall tiles', () => {
    const maze = createOpenFixtureMaze();
    maze.walls[cellIndex(maze, 2, 1)] = 1;
    const unit = fixtureUnit(1, 15, 15);
    unit.maxSpeed = 100;
    const world = new World({ maze, units: [unit], seed: 1, config: { jitterStrength: 0 } });

    world.step(1);

    expect(isWallAtWorld(maze, unit.position.x, unit.position.y)).toBe(false);
  });

  it('snapshots the maze solving field separately from crowding pressure', () => {
    const maze = createOpenFixtureMaze();
    const world = new World({ maze, units: [], seed: 1, config: { densityWeight: 0, jitterStrength: 0 } });

    const snapshot = world.createSnapshot();
    const sample = snapshot.mazeSolvingField.find((fieldSample) => fieldSample.x === 25 && fieldSample.y === 35);

    expect(sample).toEqual({
      x: 25,
      y: 35,
      dx: 1,
      dy: 0,
      strength: 1,
    });
    expect(snapshot.mazeSolvingField).toHaveLength(12);
    expect(snapshot.tooCrowdedField).toHaveLength(0);
  });

  it('includes each unit path direction from the maze solving field', () => {
    const maze = createOpenFixtureMaze();
    const world = new World({ maze, units: [fixtureUnit(1, 25, 35)], seed: 1, config: { jitterStrength: 0 } });

    const snapshot = world.createSnapshot();

    expect(snapshot.units[0].pathDirection).toEqual({ x: 1, y: 0 });
  });

  it('includes the exit tile in the maze solving field', () => {
    const maze = createOpenFixtureMaze();
    const world = new World({ maze, units: [], seed: 1 });

    expect(world.createSnapshot().mazeSolvingField).toContainEqual({
      x: 45,
      y: 35,
      dx: 0,
      dy: 0,
      strength: 0,
    });
  });

  it('fills every reachable non-wall tile in the demo maze solving field', () => {
    const maze = createDemoMaze();
    const world = new World({ maze, units: [], seed: 1 });
    const snapshot = world.createSnapshot();
    let reachableFloorTiles = 0;

    for (let y = 0; y < maze.height; y += 1) {
      for (let x = 0; x < maze.width; x += 1) {
        if (maze.walls[cellIndex(maze, x, y)] !== 1 && Number.isFinite(world.flowField.distanceAtCell(x, y))) {
          reachableFloorTiles += 1;
        }
      }
    }

    expect(snapshot.mazeSolvingField).toHaveLength(reachableFloorTiles);
  });

  it('snapshots crowding escape vectors separately from maze solving', () => {
    const maze = createOpenFixtureMaze();
    const world = new World({
      maze,
      units: [fixtureUnit(1, 15, 25), fixtureUnit(2, 15, 25), fixtureUnit(3, 15, 25)],
      seed: 1,
      config: { crowdingThreshold: 0, jitterStrength: 0 },
    });

    const snapshot = world.step(0);
    const sample = snapshot.tooCrowdedField.find((fieldSample) => fieldSample.x === 25 && fieldSample.y === 25);

    expect(sample?.dx).toBeGreaterThan(0);
    expect(sample?.dy).toBeCloseTo(0);
    expect(sample?.strength).toBeGreaterThan(0);
    const mazeSample = snapshot.mazeSolvingField.find((fieldSample) => fieldSample.x === 25 && fieldSample.y === 25);
    expect(mazeSample?.x).toBe(25);
    expect(mazeSample?.y).toBe(25);
    expect(mazeSample?.dx).toBeCloseTo(Math.SQRT1_2);
    expect(mazeSample?.dy).toBeCloseTo(Math.SQRT1_2);
    expect(mazeSample?.strength).toBeCloseTo(1);
  });

  it('ignores crowding below the configured crowded threshold', () => {
    const maze = createOpenFixtureMaze();
    const world = new World({
      maze,
      units: [fixtureUnit(1, 15, 25), fixtureUnit(2, 15, 25), fixtureUnit(3, 15, 25)],
      seed: 1,
      config: { crowdingThreshold: 1, jitterStrength: 0 },
    });

    const snapshot = world.step(0);

    expect(snapshot.tooCrowdedField).toHaveLength(0);
  });
});
