import type { MazeGrid } from '../sim/types';
import type { ArchetypeId } from './archetypes';
import {
  buildMaze,
  chamberChainMaze,
  crossroadsMaze,
  drainpipeMaze,
  hopYardMaze,
  pinchMaze,
  resurrectionRowMaze,
  shieldWallMaze,
  throneRoomMaze,
  tutorialCorridor,
  windTunnelMaze,
  workshopMaze,
} from './mazeGenerators';

export type BonusObjectiveKind =
  | 'noLeaks'
  | 'noStructureLost'
  | 'noSell'
  | 'underTime'
  | 'killAllShells';

export interface BonusObjective {
  kind: BonusObjectiveKind;
  /** Optional numeric param (e.g. underTime seconds). */
  value?: number;
  description: string;
}

export interface WaveSlot {
  archetype: ArchetypeId;
  count: number;
  /** Seconds between spawns of this archetype within the wave. */
  intervalSeconds: number;
  /** Additional delay before this slot starts spawning (relative to wave start). */
  delaySeconds?: number;
}

export interface WaveDefinition {
  slots: WaveSlot[];
  /** Pause after the wave completes spawning before the next wave starts. */
  gapAfterSeconds: number;
}

export interface LevelDefinition {
  id: string;
  index: number;
  label: string;
  description: string;
  twist: string;
  teaches: string;
  /** Maze creation. */
  buildMaze: () => MazeGrid;
  waves: WaveDefinition[];
  leakBudget: number;
  bonus: BonusObjective;
  /** Optional pre-deployment requirement (e.g. tutorial: place a Pinpricker first). */
  prePlacementToolId?: string;
  prePlacementInstruction?: string;
  /** True if the player gets the Pinpricker as a free deployment for the run. */
  giftPinpricker?: boolean;
  /** ID of prerequisite level. */
  prerequisiteId?: string;
  /** Level 0 (tutorial) is special and always available. */
  isTutorial?: boolean;
}

const LEVEL_0_TUTORIAL: LevelDefinition = {
  id: 'tutorial',
  index: 0,
  label: 'Level 0 - Tutorial',
  description: 'Place a Pinpricker before the wave starts. One well-placed turret clears the run.',
  twist: 'You must place a Pinpricker before slimes spawn.',
  teaches: 'Click-to-place. Winning is possible.',
  buildMaze: () => buildMaze(tutorialCorridor()),
  waves: [
    {
      slots: [{ archetype: 'horde', count: 6, intervalSeconds: 1.2 }],
      gapAfterSeconds: 0,
    },
  ],
  leakBudget: 2,
  bonus: { kind: 'noLeaks', description: 'No leaks.' },
  prePlacementToolId: 'pinpricker',
  prePlacementInstruction: 'Place the Pinpricker on a corridor tile to begin.',
  giftPinpricker: true,
  isTutorial: true,
};

const LEVEL_1: LevelDefinition = {
  id: 'level-1',
  index: 1,
  label: 'Level 1 - Drainpipe',
  description: 'A clean early run. Add Poke from the upgrade tree when you want click damage in clean shooting lanes.',
  twist: 'No twist - build from your Pinpricker foundation.',
  teaches: 'Reading corridors and choosing your first ability unlock.',
  buildMaze: () => buildMaze(drainpipeMaze()),
  waves: [
    { slots: [{ archetype: 'horde', count: 8, intervalSeconds: 1.1 }], gapAfterSeconds: 4 },
    { slots: [{ archetype: 'horde', count: 12, intervalSeconds: 0.9 }], gapAfterSeconds: 4 },
    {
      slots: [{ archetype: 'horde', count: 16, intervalSeconds: 0.7 }],
      gapAfterSeconds: 0,
    },
  ],
  leakBudget: 8,
  bonus: { kind: 'noLeaks', description: 'No leaks.' },
  prerequisiteId: 'tutorial',
};

const LEVEL_2: LevelDefinition = {
  id: 'level-2',
  index: 2,
  label: 'Level 2 - Crossroads',
  description: 'Two entrances merge into one corridor. Sprints chase the gaps.',
  twist: 'Sprint slimes ignored on one branch are nearly impossible to catch on the merged corridor.',
  teaches: 'Splash Cannon + corridor placement.',
  buildMaze: () => buildMaze(crossroadsMaze()),
  waves: [
    { slots: [{ archetype: 'horde', count: 10, intervalSeconds: 0.9 }], gapAfterSeconds: 5 },
    {
      slots: [
        { archetype: 'horde', count: 12, intervalSeconds: 0.8 },
        { archetype: 'sprint', count: 3, intervalSeconds: 1.5, delaySeconds: 1 },
      ],
      gapAfterSeconds: 5,
    },
    {
      slots: [
        { archetype: 'horde', count: 16, intervalSeconds: 0.6 },
        { archetype: 'sprint', count: 6, intervalSeconds: 1.0, delaySeconds: 0.5 },
      ],
      gapAfterSeconds: 0,
    },
  ],
  leakBudget: 12,
  bonus: { kind: 'noLeaks', description: 'No leaks.' },
  prerequisiteId: 'level-1',
};

const LEVEL_3: LevelDefinition = {
  id: 'level-3',
  index: 3,
  label: 'Level 3 - The Pinch',
  description: 'A long corridor with a 1-tile choke. Blockers stall the wave; goo piles up.',
  twist: 'A Blocker in the choke stalls the wave. Crowd density spikes.',
  teaches: 'Press + Barricade.',
  buildMaze: () => buildMaze(pinchMaze()),
  waves: [
    { slots: [{ archetype: 'horde', count: 14, intervalSeconds: 0.8 }], gapAfterSeconds: 5 },
    {
      slots: [
        { archetype: 'horde', count: 14, intervalSeconds: 0.7 },
        { archetype: 'blocker', count: 1, intervalSeconds: 1, delaySeconds: 4 },
      ],
      gapAfterSeconds: 5,
    },
    {
      slots: [
        { archetype: 'horde', count: 18, intervalSeconds: 0.6 },
        { archetype: 'blocker', count: 2, intervalSeconds: 6, delaySeconds: 2 },
      ],
      gapAfterSeconds: 0,
    },
  ],
  leakBudget: 14,
  bonus: { kind: 'noLeaks', description: 'No leaks at all.' },
  prerequisiteId: 'level-2',
};

const LEVEL_4: LevelDefinition = {
  id: 'level-4',
  index: 4,
  label: 'Level 4 - Hibernation Hall',
  description: 'A chain of small chambers connected by tunnels. Cocoons commit you to a kill.',
  twist: 'Cocoons harden when damaged; if you cannot burst the shell, the wave catches up while it ticks.',
  teaches: 'AOE Freeze + Press to commit damage during the shell timer.',
  buildMaze: () => buildMaze(chamberChainMaze()),
  waves: [
    { slots: [{ archetype: 'horde', count: 12, intervalSeconds: 0.9 }], gapAfterSeconds: 5 },
    {
      slots: [
        { archetype: 'horde', count: 14, intervalSeconds: 0.8 },
        { archetype: 'cocoon', count: 2, intervalSeconds: 4, delaySeconds: 3 },
      ],
      gapAfterSeconds: 5,
    },
    {
      slots: [
        { archetype: 'horde', count: 16, intervalSeconds: 0.7 },
        { archetype: 'cocoon', count: 4, intervalSeconds: 3, delaySeconds: 2 },
      ],
      gapAfterSeconds: 0,
    },
  ],
  leakBudget: 14,
  bonus: { kind: 'killAllShells', description: 'Pop every Cocoon shell before its timer.' },
  prerequisiteId: 'level-3',
};

const LEVEL_5: LevelDefinition = {
  id: 'level-5',
  index: 5,
  label: 'Level 5 - Shield Wall',
  description: 'Long sightlines, sparse cover. Armored slimes shield the soft slimes packed behind them.',
  twist: 'Armored slimes block the rays you have been relying on.',
  teaches: 'Meteors / Splash Cannon as the AoE answer.',
  buildMaze: () => buildMaze(shieldWallMaze()),
  waves: [
    { slots: [{ archetype: 'horde', count: 14, intervalSeconds: 0.8 }], gapAfterSeconds: 5 },
    {
      slots: [
        { archetype: 'horde', count: 14, intervalSeconds: 0.7 },
        { archetype: 'armored', count: 4, intervalSeconds: 2.5, delaySeconds: 2 },
      ],
      gapAfterSeconds: 5,
    },
    {
      slots: [
        { archetype: 'horde', count: 16, intervalSeconds: 0.6 },
        { archetype: 'armored', count: 6, intervalSeconds: 2, delaySeconds: 1 },
      ],
      gapAfterSeconds: 0,
    },
  ],
  leakBudget: 16,
  bonus: { kind: 'noStructureLost', description: 'Do not lose a structure to Gremlins.' },
  prerequisiteId: 'level-4',
};

const LEVEL_6: LevelDefinition = {
  id: 'level-6',
  index: 6,
  label: 'Level 6 - Hop Yard',
  description: 'A tight zig-zag maze. Hoppers vault the kill funnels you build with Barricades.',
  twist: 'Hoppers leap over walls and your Barricades.',
  teaches: 'AOE Freeze + predictive AoE.',
  buildMaze: () => buildMaze(hopYardMaze()),
  waves: [
    { slots: [{ archetype: 'horde', count: 14, intervalSeconds: 0.7 }], gapAfterSeconds: 5 },
    {
      slots: [
        { archetype: 'horde', count: 16, intervalSeconds: 0.7 },
        { archetype: 'hopper', count: 4, intervalSeconds: 2, delaySeconds: 2 },
      ],
      gapAfterSeconds: 5,
    },
    {
      slots: [
        { archetype: 'horde', count: 18, intervalSeconds: 0.6 },
        { archetype: 'hopper', count: 8, intervalSeconds: 1.5, delaySeconds: 1 },
      ],
      gapAfterSeconds: 0,
    },
  ],
  leakBudget: 16,
  bonus: { kind: 'noLeaks', description: 'No leaks.' },
  prerequisiteId: 'level-5',
};

const LEVEL_7: LevelDefinition = {
  id: 'level-7',
  index: 7,
  label: 'Level 7 - Resurrection Row',
  description: 'Wide chambers with limited cover. Healers undo your chip damage.',
  twist: 'You need burst windows; chip is wasted.',
  teaches: 'Backlash + Meteors for burst priority.',
  buildMaze: () => buildMaze(resurrectionRowMaze()),
  waves: [
    { slots: [{ archetype: 'horde', count: 16, intervalSeconds: 0.7 }], gapAfterSeconds: 5 },
    {
      slots: [
        { archetype: 'horde', count: 18, intervalSeconds: 0.6 },
        { archetype: 'healer', count: 3, intervalSeconds: 3, delaySeconds: 2 },
      ],
      gapAfterSeconds: 5,
    },
    {
      slots: [
        { archetype: 'horde', count: 20, intervalSeconds: 0.5 },
        { archetype: 'healer', count: 5, intervalSeconds: 2.5, delaySeconds: 1 },
        { archetype: 'armored', count: 2, intervalSeconds: 4, delaySeconds: 6 },
      ],
      gapAfterSeconds: 0,
    },
  ],
  leakBudget: 18,
  bonus: { kind: 'noLeaks', description: 'No leaks.' },
  prerequisiteId: 'level-6',
};

const LEVEL_8: LevelDefinition = {
  id: 'level-8',
  index: 8,
  label: 'Level 8 - Workshop',
  description: 'An open maze with lots of structure-friendly tile real estate. Gremlins disable your turrets.',
  twist: 'Gremlins force you to click structures to shoo them, pulling your attention off the wave.',
  teaches: 'Tool prioritization, click economy.',
  buildMaze: () => buildMaze(workshopMaze()),
  waves: [
    { slots: [{ archetype: 'horde', count: 16, intervalSeconds: 0.6 }], gapAfterSeconds: 5 },
    {
      slots: [
        { archetype: 'horde', count: 18, intervalSeconds: 0.6 },
        { archetype: 'gremlin', count: 5, intervalSeconds: 2, delaySeconds: 2 },
      ],
      gapAfterSeconds: 5,
    },
    {
      slots: [
        { archetype: 'horde', count: 20, intervalSeconds: 0.5 },
        { archetype: 'gremlin', count: 8, intervalSeconds: 1.5, delaySeconds: 1 },
        { archetype: 'sprint', count: 4, intervalSeconds: 2, delaySeconds: 4 },
      ],
      gapAfterSeconds: 0,
    },
  ],
  leakBudget: 18,
  bonus: { kind: 'noStructureLost', description: 'Do not lose a structure to Gremlins.' },
  prerequisiteId: 'level-7',
};

const LEVEL_9: LevelDefinition = {
  id: 'level-9',
  index: 9,
  label: 'Level 9 - Wind Tunnel',
  description: 'A wind tunnel with directional bias zones. Corrupters snowball any clump the wind creates.',
  twist: 'Wind shoves slimes; Corrupters spread inside any clump.',
  teaches: 'Punt timed with wind + AoE prioritization.',
  buildMaze: () => buildMaze(windTunnelMaze()),
  waves: [
    { slots: [{ archetype: 'horde', count: 18, intervalSeconds: 0.6 }], gapAfterSeconds: 5 },
    {
      slots: [
        { archetype: 'horde', count: 20, intervalSeconds: 0.5 },
        { archetype: 'corrupter', count: 3, intervalSeconds: 4, delaySeconds: 2 },
      ],
      gapAfterSeconds: 5,
    },
    {
      slots: [
        { archetype: 'horde', count: 24, intervalSeconds: 0.4 },
        { archetype: 'corrupter', count: 6, intervalSeconds: 3, delaySeconds: 1 },
      ],
      gapAfterSeconds: 0,
    },
  ],
  leakBudget: 20,
  bonus: { kind: 'underTime', value: 180, description: 'Clear the level in under 3 minutes.' },
  prerequisiteId: 'level-8',
};

const LEVEL_10: LevelDefinition = {
  id: 'level-10',
  index: 10,
  label: 'Level 10 - Throne Room',
  description: 'A large multi-room arena. The full roster of slimes attacks at once.',
  twist: 'King speeds up sub-crowds; Wall-breakers reshape the maze mid-run.',
  teaches: 'Full-toolkit synergy under chaos.',
  buildMaze: () => buildMaze(throneRoomMaze()),
  waves: [
    {
      slots: [
        { archetype: 'horde', count: 18, intervalSeconds: 0.6 },
        { archetype: 'sprint', count: 3, intervalSeconds: 2, delaySeconds: 2 },
      ],
      gapAfterSeconds: 5,
    },
    {
      slots: [
        { archetype: 'horde', count: 20, intervalSeconds: 0.5 },
        { archetype: 'armored', count: 4, intervalSeconds: 2.5, delaySeconds: 2 },
        { archetype: 'wallBreaker', count: 2, intervalSeconds: 5, delaySeconds: 4 },
      ],
      gapAfterSeconds: 5,
    },
    {
      slots: [
        { archetype: 'horde', count: 22, intervalSeconds: 0.4 },
        { archetype: 'cocoon', count: 4, intervalSeconds: 3, delaySeconds: 2 },
        { archetype: 'gremlin', count: 4, intervalSeconds: 2, delaySeconds: 3 },
      ],
      gapAfterSeconds: 5,
    },
    {
      slots: [
        { archetype: 'king', count: 1, intervalSeconds: 0, delaySeconds: 0 },
        { archetype: 'horde', count: 24, intervalSeconds: 0.4, delaySeconds: 1 },
        { archetype: 'corrupter', count: 4, intervalSeconds: 3, delaySeconds: 4 },
      ],
      gapAfterSeconds: 0,
    },
  ],
  leakBudget: 25,
  bonus: { kind: 'noLeaks', description: 'No leaks against the full roster.' },
  prerequisiteId: 'level-9',
};

export const CAMPAIGN_LEVELS: LevelDefinition[] = [
  LEVEL_0_TUTORIAL,
  LEVEL_1,
  LEVEL_2,
  LEVEL_3,
  LEVEL_4,
  LEVEL_5,
  LEVEL_6,
  LEVEL_7,
  LEVEL_8,
  LEVEL_9,
  LEVEL_10,
];

export function levelById(id: string): LevelDefinition | undefined {
  return CAMPAIGN_LEVELS.find((level) => level.id === id);
}

export function levelByIndex(index: number): LevelDefinition | undefined {
  return CAMPAIGN_LEVELS.find((level) => level.index === index);
}

export function totalSlimesIn(level: LevelDefinition): number {
  let total = 0;
  for (const wave of level.waves) {
    for (const slot of wave.slots) {
      total += slot.count;
    }
  }
  return total;
}
