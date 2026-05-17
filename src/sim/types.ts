export interface Vector2 {
  x: number;
  y: number;
}

export interface MazeGrid {
  width: number;
  height: number;
  tileSize: number;
  walls: Uint8Array;
  entrance: Vector2;
  exit: Vector2;
  goals: Vector2[];
}

export interface SlimeUnit {
  id: number;
  position: Vector2;
  velocity: Vector2;
  baseRadius: number;
  radius: number;
  maxSpeed: number;
  health: number;
  color: number;
  lastDamagedAt: number;
  alive: boolean;
}

export interface SimConfig {
  flowWeight: number;
  densityWeight: number;
  crowdingThreshold: number;
  separationWeight: number;
  densitySlowdown: number;
  minSpeedRatio: number;
  maxSpeedRatio: number;
  maxSpeedMultiplier: number;
  separationRadiusMultiplier: number;
  slimeSizeMultiplier: number;
  accelerationMultiplier: number;
  jitterStrength: number;
}

export interface DamageEvent {
  type: 'aoe' | 'ray';
  origin: Vector2;
  radius?: number;
  direction?: Vector2;
  range?: number;
  damage: number;
}

export interface GooSplat {
  position: Vector2;
  radius: number;
  color: number;
}

export interface RenderUnit {
  id: number;
  x: number;
  y: number;
  radius: number;
  color: number;
  pathDirection: Vector2;
  crowding: number;
  hitFlash: number;
}

export interface VectorFieldSample {
  x: number;
  y: number;
  dx: number;
  dy: number;
  strength: number;
}

export interface RenderSnapshot {
  units: RenderUnit[];
  gooSplats: GooSplat[];
  mazeSolvingField: VectorFieldSample[];
  tooCrowdedField: VectorFieldSample[];
  walls: Uint8Array;
  entrance: Vector2;
  exit: Vector2;
  mazeWidth: number;
  mazeHeight: number;
  tileSize: number;
  time: number;
  exitedCount: number;
}

export const DEFAULT_SIM_CONFIG: SimConfig = {
  flowWeight: 1,
  densityWeight: 0.35,
  crowdingThreshold: 0.35,
  separationWeight: 0.48,
  densitySlowdown: 0.24,
  minSpeedRatio: 0.1,
  maxSpeedRatio: 1.35,
  maxSpeedMultiplier: 3,
  separationRadiusMultiplier: 1.35,
  slimeSizeMultiplier: 0.6,
  accelerationMultiplier: 8,
  jitterStrength: 0.015,
};
