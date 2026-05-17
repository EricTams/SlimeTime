import { describe, expect, it } from 'vitest';
import { createDemoMaze } from '../content/demoMaze';
import { createOpenFixtureMaze } from '../../test/fixtures/simpleMaze';
import { FlowField } from './flowField';

describe('FlowField', () => {
  it('routes reachable cells toward the goal', () => {
    const maze = createOpenFixtureMaze();
    const field = new FlowField(maze);

    expect(field.distanceAtCell(4, 3)).toBe(0);
    expect(field.distanceAtCell(2, 3)).toBe(2);
    expect(field.directionAtWorld({ x: 25, y: 35 })).toEqual({ x: 1, y: 0 });
  });

  it('uses diagonal weighted paths when they are the shortest route', () => {
    const maze = createOpenFixtureMaze();
    const field = new FlowField(maze);

    expect(field.distanceAtCell(2, 2)).toBeCloseTo(1 + Math.SQRT2);
    expect(field.directionAtWorld({ x: 25, y: 25 }).x).toBeCloseTo(Math.SQRT1_2);
    expect(field.directionAtWorld({ x: 25, y: 25 }).y).toBeCloseTo(Math.SQRT1_2);
  });

  it('marks wall cells unreachable', () => {
    const maze = createOpenFixtureMaze();
    const field = new FlowField(maze);

    expect(field.distanceAtCell(0, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(field.directionAtWorld({ x: 5, y: 5 })).toEqual({ x: 0, y: 0 });
  });

  it('reaches the demo entrance and left arena from the exit', () => {
    const maze = createDemoMaze();
    const field = new FlowField(maze);

    expect(field.distanceAtCell(maze.entrance.x, maze.entrance.y)).toBeLessThan(Number.POSITIVE_INFINITY);
    expect(field.distanceAtCell(1, maze.entrance.y)).toBeLessThan(Number.POSITIVE_INFINITY);
    expect(field.distanceAtCell(maze.exit.x - 2, maze.exit.y)).toBeLessThan(Number.POSITIVE_INFINITY);
  });
});
