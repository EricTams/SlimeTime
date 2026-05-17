import { cellCenter, cellIndex, isInsideMaze, isWallCell, positionToCell } from './maze';
import type { MazeGrid, Vector2 } from './types';
import { normalize, subtract, vec } from './vector';

const CARDINAL_COST = 1_000;
const DIAGONAL_COST = 1_414;
const DISPLAY_DISTANCE_SCALE = 1 / CARDINAL_COST;
const UNREACHABLE_DISTANCE = 0xffffffff;

const MOVEMENT_DIRS = [
  { x: 1, y: 0, cost: CARDINAL_COST },
  { x: -1, y: 0, cost: CARDINAL_COST },
  { x: 0, y: 1, cost: CARDINAL_COST },
  { x: 0, y: -1, cost: CARDINAL_COST },
  { x: 1, y: 1, cost: DIAGONAL_COST },
  { x: 1, y: -1, cost: DIAGONAL_COST },
  { x: -1, y: 1, cost: DIAGONAL_COST },
  { x: -1, y: -1, cost: DIAGONAL_COST },
] as const;

interface QueueNode extends Vector2 {
  distance: number;
}

export class FlowField {
  readonly distances: Uint32Array;
  private readonly directions: Vector2[];

  constructor(private readonly maze: MazeGrid) {
    this.distances = new Uint32Array(maze.width * maze.height);
    this.directions = Array.from({ length: maze.width * maze.height }, () => vec());
    this.rebuild();
  }

  rebuild(): void {
    this.distances.fill(UNREACHABLE_DISTANCE);
    const queue: QueueNode[] = [];

    for (const goal of this.maze.goals) {
      const gx = Math.floor(goal.x);
      const gy = Math.floor(goal.y);
      if (!isInsideMaze(this.maze, gx, gy) || isWallCell(this.maze, gx, gy)) {
        continue;
      }
      this.distances[cellIndex(this.maze, gx, gy)] = 0;
      queue.push({ x: gx, y: gy, distance: 0 });
    }

    while (queue.length > 0) {
      const current = queue.splice(this.nextQueueIndex(queue), 1)[0];
      const currentDistance = this.distances[cellIndex(this.maze, current.x, current.y)];
      if (current.distance > currentDistance) {
        continue;
      }

      for (const dir of MOVEMENT_DIRS) {
        const nx = current.x + dir.x;
        const ny = current.y + dir.y;
        if (!this.canMoveBetween(current.x, current.y, nx, ny)) {
          continue;
        }

        const nextIndex = cellIndex(this.maze, nx, ny);
        const nextDistance = currentDistance + dir.cost;
        if (this.distances[nextIndex] <= nextDistance) {
          continue;
        }

        this.distances[nextIndex] = nextDistance;
        queue.push({ x: nx, y: ny, distance: nextDistance });
      }
    }

    this.rebuildDirections();
  }

  directionAtWorld(position: Vector2): Vector2 {
    const cell = positionToCell(this.maze, position.x, position.y);
    return this.directions[cellIndex(this.maze, cell.x, cell.y)];
  }

  distanceAtCell(x: number, y: number): number {
    if (!isInsideMaze(this.maze, x, y)) {
      return Number.POSITIVE_INFINITY;
    }
    const distance = this.distances[cellIndex(this.maze, x, y)];
    return distance === UNREACHABLE_DISTANCE ? Number.POSITIVE_INFINITY : distance * DISPLAY_DISTANCE_SCALE;
  }

  private rebuildDirections(): void {
    for (let y = 0; y < this.maze.height; y += 1) {
      for (let x = 0; x < this.maze.width; x += 1) {
        const index = cellIndex(this.maze, x, y);
        if (isWallCell(this.maze, x, y) || this.distances[index] === UNREACHABLE_DISTANCE) {
          this.directions[index] = vec();
          continue;
        }

        let best = { x, y };
        let bestCost = Number.POSITIVE_INFINITY;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const dir of MOVEMENT_DIRS) {
          const nx = x + dir.x;
          const ny = y + dir.y;
          if (!this.canMoveBetween(x, y, nx, ny)) {
            continue;
          }
          const neighborDistance = this.distanceAtCellRaw(nx, ny);
          const candidate = neighborDistance + dir.cost;
          const isBetterTie = candidate === bestCost && neighborDistance < bestDistance;
          if (candidate <= this.distances[index] && (candidate < bestCost || isBetterTie)) {
            bestCost = candidate;
            bestDistance = neighborDistance;
            best = { x: nx, y: ny };
          }
        }

        this.directions[index] =
          best.x === x && best.y === y
            ? vec()
            : normalize(subtract(cellCenter(this.maze, best.x, best.y), cellCenter(this.maze, x, y)));
      }
    }
  }

  private distanceAtCellRaw(x: number, y: number): number {
    if (!isInsideMaze(this.maze, x, y)) {
      return UNREACHABLE_DISTANCE;
    }
    return this.distances[cellIndex(this.maze, x, y)];
  }

  private nextQueueIndex(queue: readonly QueueNode[]): number {
    let bestIndex = 0;
    let bestDistance = queue[0].distance;
    for (let index = 1; index < queue.length; index += 1) {
      if (queue[index].distance < bestDistance) {
        bestIndex = index;
        bestDistance = queue[index].distance;
      }
    }
    return bestIndex;
  }

  private canMoveBetween(x: number, y: number, nx: number, ny: number): boolean {
    if (!isInsideMaze(this.maze, nx, ny) || isWallCell(this.maze, nx, ny)) {
      return false;
    }

    const dx = nx - x;
    const dy = ny - y;
    if (Math.abs(dx) !== 1 || Math.abs(dy) !== 1) {
      return true;
    }

    return !isWallCell(this.maze, x + dx, y) && !isWallCell(this.maze, x, y + dy);
  }
}
