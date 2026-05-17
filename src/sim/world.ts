import { DensityField } from './densityField';
import { FlowField } from './flowField';
import { cellCenter, isWallAtWorld, isWallCell, positionToCell } from './maze';
import { SeededRandom } from './rng';
import { SpatialHash } from './spatialHash';
import type {
  DamageEvent,
  GooSplat,
  MazeGrid,
  RenderSnapshot,
  SimConfig,
  SlimeUnit,
  Vector2,
  VectorFieldSample,
} from './types';
import { DEFAULT_SIM_CONFIG } from './types';
import { add, clamp, length, normalize, scale, vec } from './vector';

export interface WorldOptions {
  maze: MazeGrid;
  units: SlimeUnit[];
  config?: Partial<SimConfig>;
  seed?: number;
}

export class World {
  readonly maze: MazeGrid;
  readonly units: SlimeUnit[];
  readonly flowField: FlowField;
  readonly densityField: DensityField;
  readonly spatialHash: SpatialHash;
  readonly config: SimConfig;
  private readonly rng: SeededRandom;
  private time = 0;
  private exitedCount = 0;
  private pendingGooSplats: GooSplat[] = [];

  constructor(options: WorldOptions) {
    this.maze = options.maze;
    this.units = options.units;
    this.config = { ...DEFAULT_SIM_CONFIG, ...options.config };
    this.rng = new SeededRandom(options.seed ?? 1);
    this.flowField = new FlowField(this.maze);
    this.densityField = new DensityField(this.maze);
    this.applySlimeSizeMultiplierToUnits();
    const averageRadius = this.units.length
      ? this.units.reduce((total, unit) => total + unit.radius, 0) / this.units.length
      : this.maze.tileSize / 4;
    this.spatialHash = new SpatialHash(Math.max(averageRadius * 2, this.maze.tileSize / 2));
    this.spatialHash.rebuild(this.units);
  }

  step(dt: number, damageEvents: readonly DamageEvent[] = []): RenderSnapshot {
    this.time += dt;
    this.pendingGooSplats = [];

    this.spatialHash.rebuild(this.units);
    this.densityField.updateFromUnits(this.units);
    this.densityField.commit();

    for (const unit of this.units) {
      if (!unit.alive) {
        continue;
      }

      unit.velocity = this.applyAcceleration(unit, this.computeAcceleration(unit), dt);
      this.integrate(unit, dt);
    }

    this.spatialHash.rebuild(this.units);
    this.removeExitedUnits();
    this.spatialHash.rebuild(this.units);
    this.applyDamage(damageEvents);
    this.removeDeadUnits();

    return this.createSnapshot();
  }

  createSnapshot(): RenderSnapshot {
    return {
      units: this.units
        .filter((unit) => unit.alive)
        .map((unit) => ({
          id: unit.id,
          x: unit.position.x,
          y: unit.position.y,
          radius: unit.radius,
          color: unit.color,
          pathDirection: this.flowField.directionAtWorld(unit.position),
          crowding: this.densityField.densityAtWorld(unit.position),
          hitFlash: Math.max(0, 1 - (this.time - unit.lastDamagedAt) / 0.25),
        })),
      gooSplats: [...this.pendingGooSplats],
      mazeSolvingField: this.createMazeSolvingFieldSnapshot(),
      tooCrowdedField: this.createTooCrowdedFieldSnapshot(),
      walls: this.maze.walls,
      entrance: this.maze.entrance,
      exit: this.maze.exit,
      mazeWidth: this.maze.width,
      mazeHeight: this.maze.height,
      tileSize: this.maze.tileSize,
      time: this.time,
      exitedCount: this.exitedCount,
    };
  }

  setSlimeSizeMultiplier(multiplier: number): void {
    this.config.slimeSizeMultiplier = multiplier;
    this.applySlimeSizeMultiplierToUnits();
    this.spatialHash.rebuild(this.units);
  }

  private computeAcceleration(unit: SlimeUnit): Vector2 {
    const flow = this.flowField.directionAtWorld(unit.position);
    const density = normalize(this.crowdEscapeGradientAtWorld(unit.position));
    const separation = this.spatialHash.separationFor(
      unit,
      unit.radius * this.config.separationRadiusMultiplier,
    );
    const wallSeparation = this.wallSeparationFor(unit);
    const jitter = vec(this.rng.centered() * this.config.jitterStrength, this.rng.centered() * this.config.jitterStrength);

    return add(
      add(scale(flow, this.config.flowWeight), scale(density, this.config.densityWeight)),
      add(scale(add(separation, wallSeparation), this.config.separationWeight), jitter),
    );
  }

  private createMazeSolvingFieldSnapshot(): VectorFieldSample[] {
    const samples: VectorFieldSample[] = [];

    for (let y = 0; y < this.maze.height; y += 1) {
      for (let x = 0; x < this.maze.width; x += 1) {
        if (isWallCell(this.maze, x, y)) {
          continue;
        }
        if (!Number.isFinite(this.flowField.distanceAtCell(x, y))) {
          continue;
        }

        const center = cellCenter(this.maze, x, y);
        const flow = this.flowField.directionAtWorld(center);
        const strength = length(flow);

        samples.push({
          x: center.x,
          y: center.y,
          dx: flow.x,
          dy: flow.y,
          strength: clamp(strength * this.config.flowWeight, 0, 1),
        });
      }
    }

    return samples;
  }

  private createTooCrowdedFieldSnapshot(): VectorFieldSample[] {
    const samples: VectorFieldSample[] = [];

    for (let y = 0; y < this.maze.height; y += 1) {
      for (let x = 0; x < this.maze.width; x += 1) {
        if (isWallCell(this.maze, x, y)) {
          continue;
        }

        const center = cellCenter(this.maze, x, y);
        const density = this.crowdEscapeGradientAtWorld(center);
        const strength = length(density);
        if (strength <= 0) {
          continue;
        }

        const direction = scale(density, 1 / strength);
        samples.push({
          x: center.x,
          y: center.y,
          dx: direction.x,
          dy: direction.y,
          strength: clamp(strength * this.config.densityWeight, 0, 1),
        });
      }
    }

    return samples;
  }

  private applyAcceleration(unit: SlimeUnit, acceleration: Vector2, dt: number): Vector2 {
    const velocity = add(unit.velocity, scale(acceleration, unit.maxSpeed * this.config.accelerationMultiplier * dt));
    return this.clampVelocityForCrowding(unit, velocity);
  }

  private clampVelocityForCrowding(unit: SlimeUnit, velocity: Vector2): Vector2 {
    const speed = length(velocity);
    if (speed <= 0) {
      return velocity;
    }

    const direction = scale(velocity, 1 / speed);
    const crowdEscapeVector = this.crowdEscapeGradientAtWorld(unit.position);
    const crowdStrength = clamp(length(crowdEscapeVector), 0, 1);
    const crowdEscape = normalize(crowdEscapeVector);
    const crowdAlignment = direction.x * crowdEscape.x + direction.y * crowdEscape.y;
    const speedRatio = clamp(
      1 + crowdAlignment * crowdStrength * this.config.densitySlowdown,
      this.config.minSpeedRatio,
      this.config.maxSpeedRatio,
    );
    const maxSpeed = unit.maxSpeed * this.config.maxSpeedMultiplier * speedRatio;
    if (speed <= maxSpeed) {
      return velocity;
    }

    return scale(direction, maxSpeed);
  }

  private crowdEscapeGradientAtWorld(position: Vector2): Vector2 {
    const cell = positionToCell(this.maze, position.x, position.y);
    const center = this.thresholdCrowding(this.densityField.densityAtCell(cell.x, cell.y));
    const right = this.thresholdCrowding(this.densityField.densityAtCell(cell.x + 1, cell.y));
    const left = this.thresholdCrowding(this.densityField.densityAtCell(cell.x - 1, cell.y));
    const down = this.thresholdCrowding(this.densityField.densityAtCell(cell.x, cell.y + 1));
    const up = this.thresholdCrowding(this.densityField.densityAtCell(cell.x, cell.y - 1));

    return vec(left - right + (center - right) * 0.1, up - down + (center - down) * 0.1);
  }

  private thresholdCrowding(density: number): number {
    return Math.max(0, density - this.config.crowdingThreshold);
  }

  private wallSeparationFor(unit: SlimeUnit): Vector2 {
    const desiredDistance = unit.radius * this.config.separationRadiusMultiplier;
    const outerDistance = desiredDistance * 2;
    const cell = positionToCell(this.maze, unit.position.x, unit.position.y);
    const searchCells = Math.ceil(outerDistance / this.maze.tileSize) + 1;
    let x = 0;
    let y = 0;

    for (let cellY = cell.y - searchCells; cellY <= cell.y + searchCells; cellY += 1) {
      for (let cellX = cell.x - searchCells; cellX <= cell.x + searchCells; cellX += 1) {
        if (!isWallCell(this.maze, cellX, cellY)) {
          continue;
        }

        const left = cellX * this.maze.tileSize;
        const top = cellY * this.maze.tileSize;
        const right = left + this.maze.tileSize;
        const bottom = top + this.maze.tileSize;

        if (!isWallCell(this.maze, cellX - 1, cellY)) {
          const separation = wallFaceSeparationFor(unit.position, desiredDistance, outerDistance, {
            start: { x: left, y: top },
            end: { x: left, y: bottom },
            normal: { x: -1, y: 0 },
          });
          x += separation.x;
          y += separation.y;
        }
        if (!isWallCell(this.maze, cellX + 1, cellY)) {
          const separation = wallFaceSeparationFor(unit.position, desiredDistance, outerDistance, {
            start: { x: right, y: top },
            end: { x: right, y: bottom },
            normal: { x: 1, y: 0 },
          });
          x += separation.x;
          y += separation.y;
        }
        if (!isWallCell(this.maze, cellX, cellY - 1)) {
          const separation = wallFaceSeparationFor(unit.position, desiredDistance, outerDistance, {
            start: { x: left, y: top },
            end: { x: right, y: top },
            normal: { x: 0, y: -1 },
          });
          x += separation.x;
          y += separation.y;
        }
        if (!isWallCell(this.maze, cellX, cellY + 1)) {
          const separation = wallFaceSeparationFor(unit.position, desiredDistance, outerDistance, {
            start: { x: left, y: bottom },
            end: { x: right, y: bottom },
            normal: { x: 0, y: 1 },
          });
          x += separation.x;
          y += separation.y;
        }
      }
    }

    return { x, y };
  }

  private applySlimeSizeMultiplierToUnits(): void {
    for (const unit of this.units) {
      unit.radius = unit.baseRadius * this.config.slimeSizeMultiplier;
    }
  }

  private integrate(unit: SlimeUnit, dt: number): void {
    const nextX = unit.position.x + unit.velocity.x * dt;
    const nextY = unit.position.y + unit.velocity.y * dt;

    if (!isWallAtWorld(this.maze, nextX, unit.position.y)) {
      unit.position.x = clamp(nextX, unit.radius, this.maze.width * this.maze.tileSize - unit.radius);
    } else {
      unit.velocity.x = 0;
    }

    if (!isWallAtWorld(this.maze, unit.position.x, nextY)) {
      unit.position.y = clamp(nextY, unit.radius, this.maze.height * this.maze.tileSize - unit.radius);
    } else {
      unit.velocity.y = 0;
    }
  }

  private applyDamage(events: readonly DamageEvent[]): void {
    for (const event of events) {
      const targets =
        event.type === 'aoe'
          ? this.spatialHash.queryCircle(event.origin, event.radius ?? 0)
          : event.direction
            ? [this.spatialHash.raycast(event.origin, event.direction, event.range ?? 0)].filter(
                (unit): unit is SlimeUnit => Boolean(unit),
              )
            : [];

      for (const target of targets) {
        target.health -= event.damage;
        target.lastDamagedAt = this.time;
        if (target.health <= 0) {
          target.alive = false;
        }
      }
    }
  }

  private removeExitedUnits(): void {
    for (let index = this.units.length - 1; index >= 0; index -= 1) {
      const unit = this.units[index];
      const cell = positionToCell(this.maze, unit.position.x, unit.position.y);
      if (cell.x !== this.maze.exit.x || cell.y !== this.maze.exit.y) {
        continue;
      }

      this.exitedCount += 1;
      this.units.splice(index, 1);
    }
  }

  private removeDeadUnits(): void {
    for (let index = this.units.length - 1; index >= 0; index -= 1) {
      const unit = this.units[index];
      if (unit.alive) {
        continue;
      }
      this.pendingGooSplats.push({
        position: { ...unit.position },
        radius: unit.radius * 1.5,
        color: unit.color,
      });
      this.units.splice(index, 1);
    }
  }
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

interface WallFace {
  start: Vector2;
  end: Vector2;
  normal: Vector2;
}

function wallFaceSeparationFor(position: Vector2, desiredDistance: number, outerDistance: number, face: WallFace): Vector2 {
  const closestX = clamp(position.x, Math.min(face.start.x, face.end.x), Math.max(face.start.x, face.end.x));
  const closestY = clamp(position.y, Math.min(face.start.y, face.end.y), Math.max(face.start.y, face.end.y));
  let awayX = position.x - closestX;
  let awayY = position.y - closestY;
  let distSq = awayX * awayX + awayY * awayY;

  if (distSq <= 0.0001) {
    awayX = face.normal.x;
    awayY = face.normal.y;
    distSq = 0.0001;
  }

  if (awayX * face.normal.x + awayY * face.normal.y < 0) {
    return vec();
  }

  const distance = Math.sqrt(distSq);
  if (distance >= outerDistance) {
    return vec();
  }

  const falloff = 1 - smoothstep(desiredDistance, outerDistance, distance);
  const strength = (desiredDistance / distSq) * falloff;
  return { x: awayX * strength, y: awayY * strength };
}
