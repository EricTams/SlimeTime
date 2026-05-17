import type { SlimeUnit, Vector2 } from './types';
import { distanceSquared, normalize, subtract } from './vector';

export class SpatialHash {
  private readonly buckets = new Map<string, SlimeUnit[]>();
  private maxUnitRadius = 0;

  constructor(readonly cellSize: number) {}

  rebuild(units: readonly SlimeUnit[]): void {
    this.buckets.clear();
    this.maxUnitRadius = 0;
    for (const unit of units) {
      if (!unit.alive) {
        continue;
      }
      this.maxUnitRadius = Math.max(this.maxUnitRadius, unit.radius);
      const key = this.keyForWorld(unit.position);
      const bucket = this.buckets.get(key);
      if (bucket) {
        bucket.push(unit);
      } else {
        this.buckets.set(key, [unit]);
      }
    }
  }

  nearby(position: Vector2, radius: number): SlimeUnit[] {
    const candidateRadius = radius + this.maxUnitRadius;
    const min = this.cellForWorld({ x: position.x - candidateRadius, y: position.y - candidateRadius });
    const max = this.cellForWorld({ x: position.x + candidateRadius, y: position.y + candidateRadius });
    const result: SlimeUnit[] = [];

    for (let y = min.y; y <= max.y; y += 1) {
      for (let x = min.x; x <= max.x; x += 1) {
        const bucket = this.buckets.get(this.key(x, y));
        if (bucket) {
          result.push(...bucket);
        }
      }
    }

    return result;
  }

  queryCircle(origin: Vector2, radius: number): SlimeUnit[] {
    const radiusSquared = radius * radius;
    return this.nearby(origin, radius).filter((unit) => {
      const reach = radius + unit.radius;
      return distanceSquared(unit.position, origin) <= Math.max(radiusSquared, reach * reach);
    });
  }

  raycast(origin: Vector2, direction: Vector2, range: number): SlimeUnit | undefined {
    const normalized = normalize(direction);
    if (normalized.x === 0 && normalized.y === 0) {
      return undefined;
    }

    const stepSize = Math.max(2, this.cellSize / 2);
    let closest: SlimeUnit | undefined;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (let travelled = 0; travelled <= range; travelled += stepSize) {
      const point = {
        x: origin.x + normalized.x * travelled,
        y: origin.y + normalized.y * travelled,
      };
      for (const unit of this.nearby(point, this.cellSize)) {
        const projected = (unit.position.x - origin.x) * normalized.x + (unit.position.y - origin.y) * normalized.y;
        if (projected < 0 || projected > range || projected >= closestDistance) {
          continue;
        }

        const closestPoint = {
          x: origin.x + normalized.x * projected,
          y: origin.y + normalized.y * projected,
        };
        if (distanceSquared(closestPoint, unit.position) <= unit.radius * unit.radius) {
          closest = unit;
          closestDistance = projected;
        }
      }
    }

    return closest;
  }

  separationFor(unit: SlimeUnit, radius: number): Vector2 {
    let x = 0;
    let y = 0;
    const interactionRadius = Math.max(radius, 2 * (unit.radius + this.maxUnitRadius));
    for (const other of this.nearby(unit.position, interactionRadius)) {
      if (other.id === unit.id) {
        continue;
      }
      const away = subtract(unit.position, other.position);
      const distSq = Math.max(distanceSquared(unit.position, other.position), 0.0001);
      const distance = Math.sqrt(distSq);
      const desiredDistance = unit.radius + other.radius;
      const outerDistance = desiredDistance * 2;
      if (distance >= outerDistance) {
        continue;
      }
      const falloff = 1 - smoothstep(desiredDistance, outerDistance, distance);
      const strength = (desiredDistance / distSq) * falloff;
      x += away.x * strength;
      y += away.y * strength;
    }
    return { x, y };
  }

  private keyForWorld(position: Vector2): string {
    const cell = this.cellForWorld(position);
    return this.key(cell.x, cell.y);
  }

  private cellForWorld(position: Vector2): Vector2 {
    return {
      x: Math.floor(position.x / this.cellSize),
      y: Math.floor(position.y / this.cellSize),
    };
  }

  private key(x: number, y: number): string {
    return `${x},${y}`;
  }
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
