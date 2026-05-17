import { cellIndex, isInsideMaze, positionToCell } from './maze';
import type { MazeGrid, SlimeUnit, Vector2 } from './types';
import { vec } from './vector';

export class DensityField {
  private readBuffer: Float32Array;
  private writeBuffer: Float32Array;
  private scratch: Float32Array;

  constructor(private readonly maze: MazeGrid) {
    const size = maze.width * maze.height;
    this.readBuffer = new Float32Array(size);
    this.writeBuffer = new Float32Array(size);
    this.scratch = new Float32Array(size);
  }

  updateFromUnits(units: readonly SlimeUnit[]): void {
    this.writeBuffer.fill(0);
    this.scratch.fill(0);

    for (const unit of units) {
      if (!unit.alive) {
        continue;
      }
      const cell = positionToCell(this.maze, unit.position.x, unit.position.y);
      this.scratch[cellIndex(this.maze, cell.x, cell.y)] += 1;
    }

    for (let y = 0; y < this.maze.height; y += 1) {
      for (let x = 0; x < this.maze.width; x += 1) {
        let total = 0;
        let count = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            const nx = x + ox;
            const ny = y + oy;
            if (!isInsideMaze(this.maze, nx, ny)) {
              continue;
            }
            total += this.scratch[cellIndex(this.maze, nx, ny)];
            count += 1;
          }
        }
        this.writeBuffer[cellIndex(this.maze, x, y)] = total / count;
      }
    }
  }

  commit(): void {
    const previousRead = this.readBuffer;
    this.readBuffer = this.writeBuffer;
    this.writeBuffer = previousRead;
  }

  densityAtCell(x: number, y: number): number {
    if (!isInsideMaze(this.maze, x, y)) {
      return 0;
    }
    return this.readBuffer[cellIndex(this.maze, x, y)];
  }

  densityAtWorld(position: Vector2): number {
    const cell = positionToCell(this.maze, position.x, position.y);
    return this.densityAtCell(cell.x, cell.y);
  }

  escapeGradientAtWorld(position: Vector2): Vector2 {
    const cell = positionToCell(this.maze, position.x, position.y);
    const center = this.densityAtCell(cell.x, cell.y);
    const right = this.densityAtCell(cell.x + 1, cell.y);
    const left = this.densityAtCell(cell.x - 1, cell.y);
    const down = this.densityAtCell(cell.x, cell.y + 1);
    const up = this.densityAtCell(cell.x, cell.y - 1);

    return vec(left - right + (center - right) * 0.1, up - down + (center - down) * 0.1);
  }

  snapshot(): Float32Array {
    return new Float32Array(this.readBuffer);
  }
}
