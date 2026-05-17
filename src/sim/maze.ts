import type { MazeGrid } from './types';
import { clamp } from './vector';

export function cellIndex(maze: Pick<MazeGrid, 'width' | 'height'>, x: number, y: number): number {
  return y * maze.width + x;
}

export function isInsideMaze(maze: Pick<MazeGrid, 'width' | 'height'>, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < maze.width && y < maze.height;
}

export function isWallCell(maze: MazeGrid, x: number, y: number): boolean {
  if (!isInsideMaze(maze, x, y)) {
    return true;
  }
  return maze.walls[cellIndex(maze, x, y)] === 1;
}

export function worldToCell(maze: MazeGrid, value: number): number {
  return Math.floor(value / maze.tileSize);
}

export function positionToCell(maze: MazeGrid, x: number, y: number): { x: number; y: number } {
  return {
    x: clamp(worldToCell(maze, x), 0, maze.width - 1),
    y: clamp(worldToCell(maze, y), 0, maze.height - 1),
  };
}

export function cellCenter(maze: MazeGrid, x: number, y: number): { x: number; y: number } {
  return {
    x: x * maze.tileSize + maze.tileSize / 2,
    y: y * maze.tileSize + maze.tileSize / 2,
  };
}

export function isWallAtWorld(maze: MazeGrid, x: number, y: number): boolean {
  const cell = positionToCell(maze, x, y);
  return isWallCell(maze, cell.x, cell.y);
}
