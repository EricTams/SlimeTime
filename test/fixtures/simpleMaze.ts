import { cellIndex } from '../../src/sim/maze';
import type { MazeGrid, SlimeUnit } from '../../src/sim/types';

export function createOpenFixtureMaze(): MazeGrid {
  const width = 6;
  const height = 5;
  const tileSize = 10;
  const walls = new Uint8Array(width * height);

  for (let x = 0; x < width; x += 1) {
    walls[cellIndex({ width, height }, x, 0)] = 1;
    walls[cellIndex({ width, height }, x, height - 1)] = 1;
  }
  for (let y = 0; y < height; y += 1) {
    walls[cellIndex({ width, height }, 0, y)] = 1;
    walls[cellIndex({ width, height }, width - 1, y)] = 1;
  }

  return {
    width,
    height,
    tileSize,
    walls,
    entrance: { x: 1, y: 1 },
    exit: { x: 4, y: 3 },
    goals: [{ x: 4, y: 3 }],
  };
}

export function fixtureUnit(id: number, x: number, y: number): SlimeUnit {
  return {
    id,
    position: { x, y },
    velocity: { x: 0, y: 0 },
    baseRadius: 2,
    radius: 2,
    maxSpeed: 10,
    health: 10,
    color: 0x7bd34f,
    lastDamagedAt: -999,
    alive: true,
  };
}
