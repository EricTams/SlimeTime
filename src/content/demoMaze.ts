import { cellIndex, cellCenter } from '../sim/maze';
import { SeededRandom } from '../sim/rng';
import type { MazeGrid, SlimeUnit } from '../sim/types';

const DEMO_SLIME_BASE_RADIUS = 12;
export const DEMO_MAZE_CELL_SIZE = 48;
export const DEMO_MAZE_BLOCK_SIZE = DEMO_MAZE_CELL_SIZE;

const PASSAGE_CELLS = 1;
const WALL_CELLS = 1;
const ROOM_SPACING = WALL_CELLS + PASSAGE_CELLS;
const ROOM_COLUMNS = 11;
const ROOM_ROWS = 7;
const ROOM_OFFSET = WALL_CELLS;

interface MazeRoom {
  x: number;
  y: number;
}

export function createDemoMaze(): MazeGrid {
  const tileSize = DEMO_MAZE_CELL_SIZE;
  const width = 24;
  const height = 16;
  const walls = new Uint8Array(width * height);
  walls.fill(1);

  carveClassicMaze(walls, width, height);

  const entranceRoom = roomToCell({ x: 0, y: 3 });
  const exitRoom = roomToCell({ x: ROOM_COLUMNS - 1, y: ROOM_ROWS - 1 });
  const entrance = { x: 0, y: entranceRoom.y };
  const exit = { x: width - 1, y: exitRoom.y };
  carveHorizontalPassage(walls, width, height, entrance.x, entranceRoom.x, entrance.y);
  carveHorizontalPassage(walls, width, height, exitRoom.x, exit.x, exit.y);

  return {
    width,
    height,
    tileSize,
    walls,
    entrance,
    exit,
    goals: [exit],
  };
}

function carveClassicMaze(walls: Uint8Array, width: number, height: number): void {
  const rng = new SeededRandom(0x5eed);
  const visited = new Uint8Array(ROOM_COLUMNS * ROOM_ROWS);

  const visit = (room: MazeRoom): void => {
    visited[roomIndex(room)] = 1;
    carveRoom(walls, width, height, room);

    for (const direction of shuffledDirections(rng)) {
      const next = { x: room.x + direction.x, y: room.y + direction.y };
      if (next.x < 0 || next.y < 0 || next.x >= ROOM_COLUMNS || next.y >= ROOM_ROWS) {
        continue;
      }
      if (visited[roomIndex(next)] === 1) {
        continue;
      }

      carveBetweenRooms(walls, width, height, room, next);
      visit(next);
    }
  };

  visit({ x: 0, y: 4 });
}

function roomIndex(room: MazeRoom): number {
  return room.y * ROOM_COLUMNS + room.x;
}

function roomToCell(room: MazeRoom): MazeRoom {
  return {
    x: ROOM_OFFSET + room.x * ROOM_SPACING,
    y: ROOM_OFFSET + room.y * ROOM_SPACING,
  };
}

function carveRoom(walls: Uint8Array, width: number, height: number, room: MazeRoom): void {
  const cell = roomToCell(room);
  carveCell(walls, width, height, cell.x, cell.y);
}

function carveBetweenRooms(walls: Uint8Array, width: number, height: number, from: MazeRoom, to: MazeRoom): void {
  const start = roomToCell(from);
  const end = roomToCell(to);

  if (start.y === end.y) {
    carveHorizontalPassage(walls, width, height, start.x, end.x, start.y);
    return;
  }

  carveVerticalPassage(walls, width, height, start.y, end.y, start.x);
}

function carveHorizontalPassage(
  walls: Uint8Array,
  width: number,
  height: number,
  fromX: number,
  toX: number,
  y: number,
): void {
  for (let x = Math.min(fromX, toX); x <= Math.max(fromX, toX); x += 1) {
    carveCell(walls, width, height, x, y);
  }
}

function carveVerticalPassage(
  walls: Uint8Array,
  width: number,
  height: number,
  fromY: number,
  toY: number,
  x: number,
): void {
  for (let y = Math.min(fromY, toY); y <= Math.max(fromY, toY); y += 1) {
    carveCell(walls, width, height, x, y);
  }
}

function carveCell(walls: Uint8Array, width: number, height: number, x: number, y: number): void {
  walls[cellIndex({ width, height }, x, y)] = 0;
}

function shuffledDirections(rng: SeededRandom): MazeRoom[] {
  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  for (let index = directions.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng.next() * (index + 1));
    [directions[index], directions[swapIndex]] = [directions[swapIndex], directions[index]];
  }

  return directions;
}

export function createDemoSlimes(maze: MazeGrid, count = 130, seed = 42, slimeSizeMultiplier = 1): SlimeUnit[] {
  const rng = new SeededRandom(seed);
  const units: SlimeUnit[] = [];

  for (let index = 0; index < count; index += 1) {
    units.push(createDemoSlime(maze, index + 1, rng, slimeSizeMultiplier));
  }

  return units;
}

export function createDemoSlime(maze: MazeGrid, id: number, rng: SeededRandom, slimeSizeMultiplier = 1): SlimeUnit {
  const colors = [0x7bd34f, 0x54c7ff, 0xf48bcb, 0xffd166];
  const center = cellCenter(maze, maze.entrance.x, maze.entrance.y);
  const baseRadius = DEMO_SLIME_BASE_RADIUS;

  return {
    id,
    position: {
      x: center.x + rng.centered() * maze.tileSize * 0.18,
      y: center.y + rng.centered() * maze.tileSize * 0.18,
    },
    velocity: { x: 0, y: 0 },
    baseRadius,
    radius: baseRadius * slimeSizeMultiplier,
    maxSpeed: rng.range(28, 48),
    health: 10,
    color: colors[(id - 1) % colors.length],
    lastDamagedAt: -999,
    alive: true,
  };
}
