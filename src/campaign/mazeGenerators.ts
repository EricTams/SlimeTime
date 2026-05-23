import { cellIndex } from '../sim/maze';
import type { MazeGrid, Vector2 } from '../sim/types';

export interface MazeGenSpec {
  width: number;
  height: number;
  tileSize: number;
  /** Tile coordinates of the entrance and exit. */
  entrance: Vector2;
  exit: Vector2;
  /** Cells to carve open (1 = wall, 0 = floor). */
  carve: Vector2[];
}

export function buildMaze(spec: MazeGenSpec): MazeGrid {
  const walls = new Uint8Array(spec.width * spec.height);
  walls.fill(1);
  for (const cell of spec.carve) {
    if (cell.x < 0 || cell.y < 0 || cell.x >= spec.width || cell.y >= spec.height) {
      continue;
    }
    walls[cellIndex(spec, cell.x, cell.y)] = 0;
  }
  return {
    width: spec.width,
    height: spec.height,
    tileSize: spec.tileSize,
    walls,
    entrance: spec.entrance,
    exit: spec.exit,
    goals: [spec.exit],
  };
}

export function carveLine(start: Vector2, end: Vector2): Vector2[] {
  const cells: Vector2[] = [];
  const dx = Math.sign(end.x - start.x);
  const dy = Math.sign(end.y - start.y);
  let x = start.x;
  let y = start.y;
  cells.push({ x, y });
  while (x !== end.x || y !== end.y) {
    if (x !== end.x) {
      x += dx;
      cells.push({ x, y });
    }
    if (y !== end.y) {
      y += dy;
      cells.push({ x, y });
    }
  }
  return cells;
}

export function carveRect(top: number, left: number, bottom: number, right: number): Vector2[] {
  const cells: Vector2[] = [];
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      cells.push({ x, y });
    }
  }
  return cells;
}

/** Tutorial: a short straight corridor. */
export function tutorialCorridor(): MazeGenSpec {
  const width = 14;
  const height = 6;
  const y = 3;
  const carve: Vector2[] = [];
  for (let x = 1; x < width - 1; x += 1) {
    carve.push({ x, y });
  }
  return {
    width,
    height,
    tileSize: 48,
    entrance: { x: 0, y },
    exit: { x: width - 1, y },
    carve: [...carve, { x: 0, y }, { x: width - 1, y }],
  };
}

/** Drainpipe: straight with a gentle bend. */
export function drainpipeMaze(): MazeGenSpec {
  const width = 18;
  const height = 9;
  const carve: Vector2[] = [];
  for (let x = 1; x < 7; x += 1) {
    carve.push({ x, y: 3 });
  }
  for (let y = 3; y <= 6; y += 1) {
    carve.push({ x: 7, y });
  }
  for (let x = 7; x < width - 1; x += 1) {
    carve.push({ x, y: 6 });
  }
  return {
    width,
    height,
    tileSize: 48,
    entrance: { x: 0, y: 3 },
    exit: { x: width - 1, y: 6 },
    carve: [...carve, { x: 0, y: 3 }, { x: width - 1, y: 6 }],
  };
}

/** X-shaped maze with two entrances merging. */
export function crossroadsMaze(): MazeGenSpec {
  const width = 19;
  const height = 13;
  const carve: Vector2[] = [];
  for (let x = 1; x < 8; x += 1) {
    carve.push({ x, y: 3 });
    carve.push({ x, y: 9 });
  }
  for (let y = 3; y <= 9; y += 1) {
    carve.push({ x: 8, y });
  }
  for (let x = 8; x < width - 1; x += 1) {
    carve.push({ x, y: 6 });
  }
  return {
    width,
    height,
    tileSize: 48,
    entrance: { x: 0, y: 3 },
    exit: { x: width - 1, y: 6 },
    carve: [...carve, { x: 0, y: 3 }, { x: 0, y: 9 }, { x: width - 1, y: 6 }],
  };
}

/** Long corridor with a single 1-tile choke. */
export function pinchMaze(): MazeGenSpec {
  const width = 22;
  const height = 7;
  const carve: Vector2[] = [];
  for (let x = 1; x < width - 1; x += 1) {
    if (x === 11) {
      carve.push({ x, y: 3 });
    } else {
      carve.push({ x, y: 2 });
      carve.push({ x, y: 3 });
      carve.push({ x, y: 4 });
    }
  }
  return {
    width,
    height,
    tileSize: 48,
    entrance: { x: 0, y: 3 },
    exit: { x: width - 1, y: 3 },
    carve: [...carve, { x: 0, y: 3 }, { x: width - 1, y: 3 }],
  };
}

/** Chain of small chambers connected by short tunnels. */
export function chamberChainMaze(): MazeGenSpec {
  const width = 24;
  const height = 10;
  const carve: Vector2[] = [];
  for (const cx of [3, 9, 15]) {
    for (let y = 2; y <= 7; y += 1) {
      for (let x = cx - 2; x <= cx + 2; x += 1) {
        carve.push({ x, y });
      }
    }
  }
  for (let x = 1; x < width - 1; x += 1) {
    carve.push({ x, y: 5 });
  }
  return {
    width,
    height,
    tileSize: 48,
    entrance: { x: 0, y: 5 },
    exit: { x: width - 1, y: 5 },
    carve: [...carve, { x: 0, y: 5 }, { x: width - 1, y: 5 }],
  };
}

/** Long sightlines, sparse cover. */
export function shieldWallMaze(): MazeGenSpec {
  const width = 24;
  const height = 9;
  const carve: Vector2[] = [];
  for (let x = 1; x < width - 1; x += 1) {
    for (let y = 2; y <= 6; y += 1) {
      carve.push({ x, y });
    }
  }
  for (const wallX of [6, 12, 18]) {
    for (let y = 2; y <= 6; y += 1) {
      const isGap = y === 4;
      if (!isGap) {
        const idx = carve.findIndex((c) => c.x === wallX && c.y === y);
        if (idx !== -1) {
          carve.splice(idx, 1);
        }
      }
    }
  }
  return {
    width,
    height,
    tileSize: 48,
    entrance: { x: 0, y: 4 },
    exit: { x: width - 1, y: 4 },
    carve: [...carve, { x: 0, y: 4 }, { x: width - 1, y: 4 }],
  };
}

/** Tight zig-zag with thin walls. */
export function hopYardMaze(): MazeGenSpec {
  const width = 20;
  const height = 11;
  const carve: Vector2[] = [];
  for (let x = 1; x < width - 1; x += 1) {
    carve.push({ x, y: 2 });
    carve.push({ x, y: 5 });
    carve.push({ x, y: 8 });
  }
  for (const x of [5, 14]) {
    for (let y = 2; y <= 5; y += 1) {
      carve.push({ x, y });
    }
  }
  for (const x of [9]) {
    for (let y = 5; y <= 8; y += 1) {
      carve.push({ x, y });
    }
  }
  return {
    width,
    height,
    tileSize: 48,
    entrance: { x: 0, y: 2 },
    exit: { x: width - 1, y: 8 },
    carve: [...carve, { x: 0, y: 2 }, { x: width - 1, y: 8 }],
  };
}

/** Wide chambers with limited cover. */
export function resurrectionRowMaze(): MazeGenSpec {
  const width = 22;
  const height = 11;
  const carve: Vector2[] = [];
  for (let x = 1; x < width - 1; x += 1) {
    for (let y = 2; y <= 8; y += 1) {
      carve.push({ x, y });
    }
  }
  for (const x of [7, 14]) {
    for (let y = 2; y <= 8; y += 1) {
      if (y === 5) continue;
      const idx = carve.findIndex((c) => c.x === x && c.y === y);
      if (idx !== -1) {
        carve.splice(idx, 1);
      }
    }
  }
  return {
    width,
    height,
    tileSize: 48,
    entrance: { x: 0, y: 5 },
    exit: { x: width - 1, y: 5 },
    carve: [...carve, { x: 0, y: 5 }, { x: width - 1, y: 5 }],
  };
}

/** Open maze with lots of structure-friendly tile real estate. */
export function workshopMaze(): MazeGenSpec {
  const width = 22;
  const height = 13;
  const carve: Vector2[] = [];
  for (let x = 1; x < width - 1; x += 1) {
    for (let y = 1; y < height - 1; y += 1) {
      carve.push({ x, y });
    }
  }
  for (const blockX of [6, 11, 16]) {
    for (const blockY of [4, 8]) {
      const idx = carve.findIndex((c) => c.x === blockX && c.y === blockY);
      if (idx !== -1) carve.splice(idx, 1);
      const idx2 = carve.findIndex((c) => c.x === blockX + 1 && c.y === blockY);
      if (idx2 !== -1) carve.splice(idx2, 1);
    }
  }
  return {
    width,
    height,
    tileSize: 48,
    entrance: { x: 0, y: 6 },
    exit: { x: width - 1, y: 6 },
    carve: [...carve, { x: 0, y: 6 }, { x: width - 1, y: 6 }],
  };
}

/** Wind tunnel with directional bias zones. */
export function windTunnelMaze(): MazeGenSpec {
  const width = 24;
  const height = 9;
  const carve: Vector2[] = [];
  for (let x = 1; x < width - 1; x += 1) {
    for (let y = 2; y <= 6; y += 1) {
      carve.push({ x, y });
    }
  }
  return {
    width,
    height,
    tileSize: 48,
    entrance: { x: 0, y: 4 },
    exit: { x: width - 1, y: 4 },
    carve: [...carve, { x: 0, y: 4 }, { x: width - 1, y: 4 }],
  };
}

/** Throne room: large multi-room arena with multiple entrances. */
export function throneRoomMaze(): MazeGenSpec {
  const width = 26;
  const height = 15;
  const carve: Vector2[] = [];
  for (let x = 1; x < width - 1; x += 1) {
    for (let y = 1; y < height - 1; y += 1) {
      carve.push({ x, y });
    }
  }
  for (const wallX of [7, 13, 19]) {
    for (let y = 2; y <= height - 3; y += 1) {
      if (y === 4 || y === 7 || y === 10) continue;
      const idx = carve.findIndex((c) => c.x === wallX && c.y === y);
      if (idx !== -1) carve.splice(idx, 1);
    }
  }
  return {
    width,
    height,
    tileSize: 48,
    entrance: { x: 0, y: 7 },
    exit: { x: width - 1, y: 7 },
    carve: [
      ...carve,
      { x: 0, y: 3 },
      { x: 0, y: 7 },
      { x: 0, y: 11 },
      { x: width - 1, y: 7 },
    ],
  };
}
