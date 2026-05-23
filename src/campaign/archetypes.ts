export type ArchetypeId =
  | 'horde'
  | 'armored'
  | 'blocker'
  | 'corrupter'
  | 'hopper'
  | 'healer'
  | 'gremlin'
  | 'cocoon'
  | 'sprint'
  | 'king'
  | 'wallBreaker';

export interface ArchetypeStats {
  id: ArchetypeId;
  label: string;
  baseHealth: number;
  baseSpeed: number;
  baseRadius: number;
  color: number;
  description: string;
}

export const ARCHETYPES: Record<ArchetypeId, ArchetypeStats> = {
  horde: {
    id: 'horde',
    label: 'Horde',
    baseHealth: 10,
    baseSpeed: 36,
    baseRadius: 12,
    color: 0x7bd34f,
    description: 'Baseline slime. The mass everyone else is shaped around.',
  },
  armored: {
    id: 'armored',
    label: 'Armored',
    baseHealth: 24,
    baseSpeed: 28,
    baseRadius: 14,
    color: 0x9aa6b2,
    description: 'Body absorbs raycasts; rays stop on it instead of passing through.',
  },
  blocker: {
    id: 'blocker',
    label: 'Blocker',
    baseHealth: 32,
    baseSpeed: 22,
    baseRadius: 22,
    color: 0x6d8a4f,
    description: 'Large radius; body-blocks corridors. Wave queues behind it.',
  },
  corrupter: {
    id: 'corrupter',
    label: 'Corrupter',
    baseHealth: 18,
    baseSpeed: 40,
    baseRadius: 13,
    color: 0xb24bf3,
    description: 'On sustained contact with a Horde, converts it into another Corrupter.',
  },
  hopper: {
    id: 'hopper',
    label: 'Hopper',
    baseHealth: 12,
    baseSpeed: 38,
    baseRadius: 11,
    color: 0xff8a3d,
    description: 'Periodically leaps over a wall tile, briefly bypassing maze constraints.',
  },
  healer: {
    id: 'healer',
    label: 'Healer',
    baseHealth: 16,
    baseSpeed: 32,
    baseRadius: 12,
    color: 0xff7bb6,
    description: 'Periodically heals nearby slimes in a small radius.',
  },
  gremlin: {
    id: 'gremlin',
    label: 'Gremlin',
    baseHealth: 14,
    baseSpeed: 44,
    baseRadius: 10,
    color: 0xffd166,
    description: 'Leaps onto a structure and disables it. Click the structure to shoo it.',
  },
  cocoon: {
    id: 'cocoon',
    label: 'Cocoon',
    baseHealth: 14,
    baseSpeed: 30,
    baseRadius: 12,
    color: 0xc6efff,
    description: 'On taking damage, hardens into an immobile shell. Kill it before the timer.',
  },
  sprint: {
    id: 'sprint',
    label: 'Sprint',
    baseHealth: 10,
    baseSpeed: 60,
    baseRadius: 11,
    color: 0xff4d4d,
    description: 'Moves faster than baseline until it takes damage, then drops to normal speed.',
  },
  king: {
    id: 'king',
    label: 'King',
    baseHealth: 60,
    baseSpeed: 28,
    baseRadius: 18,
    color: 0xfff7a0,
    description: 'While alive, all slimes within its radius move faster.',
  },
  wallBreaker: {
    id: 'wallBreaker',
    label: 'Wall-breaker',
    baseHealth: 40,
    baseSpeed: 24,
    baseRadius: 14,
    color: 0xc88c4d,
    description: 'Destroys wall tiles it contacts. The flow field has to recompute.',
  },
};

export const ARCHETYPE_IDS: ArchetypeId[] = Object.keys(ARCHETYPES) as ArchetypeId[];

export interface ArchetypeRuntimeState {
  // Armored: ray-blocking
  blocksRays?: boolean;
  // Corrupter: progress toward conversion of a current target
  conversionTimer?: number;
  conversionTargetId?: number;
  // Hopper: cooldown to next leap, and "in air" state
  hopCooldown?: number;
  hopRemainingTime?: number;
  hopVelocity?: { x: number; y: number };
  // Healer: pulse cooldown
  healCooldown?: number;
  healPulseTime?: number;
  // Gremlin: which structure they are sabotaging, and timer until it is destroyed
  attachedStructureId?: string;
  attachTimer?: number;
  // Cocoon: shell state
  shelled?: boolean;
  shellHealth?: number;
  shellTimer?: number;
  // Sprint: still in sprint mode
  sprintActive?: boolean;
  // King: aura radius (cells)
  auraRadiusCells?: number;
  // Wall-breaker: wall destroy timer / progress
  wallBreakProgress?: number;
}
