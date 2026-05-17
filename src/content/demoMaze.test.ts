import { describe, expect, it } from 'vitest';
import { isWallCell, positionToCell } from '../sim/maze';
import { createDemoMaze, createDemoSlimes, DEMO_MAZE_BLOCK_SIZE, DEMO_MAZE_CELL_SIZE } from './demoMaze';

describe('demo maze portals', () => {
  it('places passable entrance and exit cells on the arena boundary', () => {
    const maze = createDemoMaze();

    expect(maze.entrance.x).toBe(0);
    expect(maze.exit.x).toBe(maze.width - 1);
    expect(isWallCell(maze, maze.entrance.x, maze.entrance.y)).toBe(false);
    expect(isWallCell(maze, maze.exit.x, maze.exit.y)).toBe(false);
    expect(maze.goals).toEqual([maze.exit]);
  });

  it('starts demo slimes inside the hidden entrance cell', () => {
    const maze = createDemoMaze();
    const slimes = createDemoSlimes(maze, 12);

    expect(slimes).toHaveLength(12);
    for (const slime of slimes) {
      expect(positionToCell(maze, slime.position.x, slime.position.y)).toEqual(maze.entrance);
    }
  });

  it('uses the same thickness for walls and paths', () => {
    const maze = createDemoMaze();

    expect(maze.tileSize).toBe(DEMO_MAZE_CELL_SIZE);
    expect(DEMO_MAZE_BLOCK_SIZE).toBe(DEMO_MAZE_CELL_SIZE);
  });

  it('carves a classic one-cell-wide maze', () => {
    const maze = createDemoMaze();

    for (let y = 0; y < maze.height - 1; y += 1) {
      for (let x = 0; x < maze.width - 1; x += 1) {
        const passableCells = [
          isWallCell(maze, x, y),
          isWallCell(maze, x + 1, y),
          isWallCell(maze, x, y + 1),
          isWallCell(maze, x + 1, y + 1),
        ].filter((isWall) => !isWall).length;

        expect(passableCells).toBeLessThan(4);
      }
    }
  });
});
