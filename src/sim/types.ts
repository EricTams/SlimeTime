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
  baseMaxSpeed?: number;
  health: number;
  maxHealth?: number;
  color: number;
  lastDamagedAt: number;
  alive: boolean;
  archetype?: import('../campaign/archetypes').ArchetypeId;
  archetypeState?: import('../campaign/archetypes').ArchetypeRuntimeState;
  /**
   * Active modifiers (computed each step from auras/effects). 1.0 = no change.
   */
  speedMultiplier?: number;
  /**
   * Frozen until simulation time. While frozen, the unit's velocity is forced to zero.
   */
  frozenUntil?: number;
  /**
   * Per-step short-lived impulse applied during `applyEffects`. Cleared after integration.
   */
  pendingImpulse?: Vector2;
  /**
   * If true, the unit ignores wall collisions for its current step (e.g. mid-leap).
   */
  ignoresWalls?: boolean;
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

export interface AoEDamageEvent {
  type: 'aoe';
  origin: Vector2;
  radius: number;
  damage: number;
}

export interface RayDamageEvent {
  type: 'ray';
  origin: Vector2;
  direction: Vector2;
  range: number;
  damage: number;
  /**
   * Number of additional targets the ray can pass through after the first hit.
   * 0 = stops on the first target (default).
   * Armored slimes always block rays even when piercing.
   */
  pierce?: number;
}

export interface LineDamageEvent {
  type: 'line';
  origin: Vector2;
  direction: Vector2;
  range: number;
  width: number;
  damage: number;
}

export interface ShoveDamageEvent {
  type: 'shove';
  origin: Vector2;
  radius: number;
  strength: number;
  damage?: number;
  /** Optional fixed direction; if absent, shove pushes radially away from origin. */
  direction?: Vector2;
  /** If true, slimes that hit a wall during the shove take additional impact damage. */
  wallImpact?: number;
}

export interface FreezeEvent {
  type: 'freeze';
  origin: Vector2;
  radius: number;
  duration: number;
  damage?: number;
}

export interface SquishEvent {
  type: 'squish';
  origin: Vector2;
  radius: number;
  damage: number;
  shrinkFraction: number;
  duration: number;
}

export interface PercentHpDamageEvent {
  type: 'percentHp';
  origin: Vector2;
  radius: number;
  fraction: number;
}

export interface DotEvent {
  type: 'dot';
  origin: Vector2;
  radius: number;
  damage: number;
}

export interface FlowBiasEvent {
  type: 'flowBias';
  origin: Vector2;
  radius: number;
  duration: number;
}

export interface HealEvent {
  type: 'heal';
  origin: Vector2;
  radius: number;
  amount: number;
}

export type DamageEvent =
  | AoEDamageEvent
  | RayDamageEvent
  | LineDamageEvent
  | ShoveDamageEvent
  | FreezeEvent
  | SquishEvent
  | PercentHpDamageEvent
  | DotEvent
  | FlowBiasEvent
  | HealEvent;

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
  archetype?: import('../campaign/archetypes').ArchetypeId;
}

export interface VectorFieldSample {
  x: number;
  y: number;
  dx: number;
  dy: number;
  strength: number;
}

export interface RenderStructure {
  instanceId: string;
  kind: string;
  cell: Vector2;
  position: Vector2;
  alive: boolean;
  pressureRemaining?: number;
  pressureCapacity?: number;
  attached: boolean;
  cooldown: number;
  color: number;
  icon: string;
}

export interface RenderAbilityEffect {
  kind: 'swarm' | 'meteor';
  position: Vector2;
  radius: number;
  expiresAt?: number;
  triggerAt?: number;
}

export interface RenderHover {
  cell: Vector2;
  valid: boolean;
  toolId: string;
}

export type ShotEffectKind = 'beam' | 'shell' | 'aoePop' | 'slash' | 'pulse' | 'snipe';

export interface RenderShotEffect {
  kind: ShotEffectKind;
  origin: Vector2;
  target: Vector2;
  radius: number;
  startedAt: number;
  duration: number;
  color: number;
}

export type ProjectileKind = 'arrow';

export interface RenderProjectile {
  id: number;
  kind: ProjectileKind;
  position: Vector2;
  direction: Vector2;
  color: number;
}

export interface ProjectileSpawnSpec {
  kind: ProjectileKind;
  origin: Vector2;
  direction: Vector2;
  speed: number;
  range: number;
  damage: number;
  pierce: number;
  color: number;
  /** True if armored (unshelled) slimes stop the projectile. Defaults to true. */
  armoredBlocks?: boolean;
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
  structures?: RenderStructure[];
  abilityEffects?: RenderAbilityEffect[];
  shotEffects?: RenderShotEffect[];
  projectiles?: RenderProjectile[];
  hover?: RenderHover;
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
