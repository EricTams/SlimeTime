import { ABILITY_DEFINITIONS, type AbilityKind } from './abilities';
import { defaultToolMods, type ToolUpgradeMods } from './chargeSystem';
import { STRUCTURE_DEFINITIONS, type StructureKind } from './structures';
import type { ArchetypeId } from './archetypes';
import type { CurrencyId } from './economy';

export type UpgradeTier = 0 | 1 | 2 | 3 | 4;

export interface UpgradePosition {
  x: number;
  y: number;
}

export interface EconomyUpgradeMods {
  killGooMultiplier?: number;
  totalGooMultiplier?: number;
  bonusObjectiveGooMultiplier?: number;
  firstClearGooMultiplier?: number;
  leaklessWaveGoo?: number;
  archetypeGooAdded?: Partial<Record<ArchetypeId, number>>;
}

export interface UpgradeNode {
  id: string;
  label: string;
  description: string;
  tier: UpgradeTier;
  currency: CurrencyId;
  cost: number;
  prerequisites: string[];
  cluster: string;
  position: UpgradePosition;
  icon: string;
  connections?: string[];
  /** Tool this upgrade applies to (when applicable). */
  toolId?: string;
  /** Whether this node unlocks a new tool (purchasing the node makes the tool available). */
  unlocksToolId?: string;
  /** Global tool modifiers applied to every tool. */
  globalMods?: ToolUpgradeMods;
  /** Mods applied to a specific tool when purchased. */
  toolMods?: ToolUpgradeMods;
  /** Meta-economy modifiers applied to run payouts. */
  economyMods?: EconomyUpgradeMods;
  /** Capstones / flag nodes (e.g. "Sustain", "Pulser Chain"). */
  flag?: string;
}

type UpgradeNodeInput = Omit<UpgradeNode, 'tier'> & { tier?: UpgradeTier };

export const STARTER_NODE_ID = 'pinpricker.unlock';

function node(input: UpgradeNodeInput): UpgradeNode {
  return {
    tier: 1,
    ...input,
    cost: Math.max(0, Math.floor(input.cost)),
    prerequisites: [...input.prerequisites],
    connections: input.connections ? [...input.connections] : undefined,
  };
}

function chain(args: {
  prefix: string;
  label: string;
  description: (rank: number) => string;
  icon: string;
  cluster: string;
  start: string;
  count: number;
  baseCost: number;
  growth?: number;
  startPosition: UpgradePosition;
  dx?: number;
  dy?: number;
  tier?: UpgradeTier;
  toolId?: string;
  globalMods?: (rank: number) => ToolUpgradeMods;
  toolMods?: (rank: number) => ToolUpgradeMods;
  economyMods?: (rank: number) => EconomyUpgradeMods;
  flag?: (rank: number) => string | undefined;
}): UpgradeNode[] {
  const result: UpgradeNode[] = [];
  const growth = args.growth ?? 1.14;
  for (let rank = 1; rank <= args.count; rank += 1) {
    const id = `${args.prefix}${rank}`;
    const previous = rank === 1 ? args.start : `${args.prefix}${rank - 1}`;
    result.push(
      node({
        id,
        label: `${args.label} ${roman(rank)}`,
        description: args.description(rank),
        tier: args.tier,
        currency: 'goo',
        cost: scaledCost(args.baseCost, rank, growth),
        prerequisites: [previous],
        cluster: args.cluster,
        position: {
          x: args.startPosition.x + (args.dx ?? 140) * (rank - 1),
          y: args.startPosition.y + (args.dy ?? 0) * (rank - 1),
        },
        icon: args.icon,
        toolId: args.toolId,
        globalMods: args.globalMods?.(rank),
        toolMods: args.toolMods?.(rank),
        economyMods: args.economyMods?.(rank),
        flag: args.flag?.(rank),
      }),
    );
  }
  return result;
}

function scaledCost(base: number, rank: number, growth: number): number {
  const raw = base * Math.pow(growth, rank - 1);
  return Math.ceil(raw / 5) * 5;
}

function roman(value: number): string {
  return ['I', 'II', 'III', 'IV', 'V', 'VI'][value - 1] ?? `${value}`;
}

function toolLabel(toolId: string): string {
  const structure = STRUCTURE_DEFINITIONS[toolId as StructureKind];
  if (structure) {
    return structure.label;
  }
  return ABILITY_DEFINITIONS[toolId as AbilityKind]?.label ?? toolId;
}

function unlockNode(args: {
  toolId: StructureKind | AbilityKind;
  prerequisites: string[];
  position: UpgradePosition;
  cluster: string;
  cost?: number;
  tier?: UpgradeTier;
}): UpgradeNode {
  const label = toolLabel(args.toolId);
  const structure = STRUCTURE_DEFINITIONS[args.toolId as StructureKind];
  const ability = ABILITY_DEFINITIONS[args.toolId as AbilityKind];
  const def = structure ?? ability;
  return node({
    id: `${args.toolId}.unlock`,
    label: `Unlock: ${label}`,
    description: def?.description ?? `Unlock ${label}.`,
    tier: args.tier ?? 1,
    currency: 'cores',
    cost: args.cost ?? 1,
    prerequisites: args.prerequisites,
    cluster: args.cluster,
    position: args.position,
    icon: def?.icon ?? '+',
    unlocksToolId: args.toolId,
  });
}

const CORE_NODES: UpgradeNode[] = [
  node({
    id: STARTER_NODE_ID,
    label: 'Unlock: Pinpricker',
    description: 'Your first turret. Mount it on a wall to fire arrows down corridors.',
    tier: 0,
    currency: 'cores',
    cost: 1,
    prerequisites: [],
    cluster: 'starter',
    position: { x: 0, y: 0 },
    icon: STRUCTURE_DEFINITIONS.pinpricker.icon,
    unlocksToolId: 'pinpricker',
  }),
  unlockNode({ toolId: 'poke', prerequisites: [STARTER_NODE_ID], position: { x: -180, y: 300 }, cluster: 'abilities' }),
  unlockNode({ toolId: 'splashCannon', prerequisites: ['pinpricker.damage3'], position: { x: 760, y: -180 }, cluster: 'splash' }),
  unlockNode({ toolId: 'barricade', prerequisites: ['pinpricker.capacity2'], position: { x: 560, y: 420 }, cluster: 'control' }),
  unlockNode({ toolId: 'press', prerequisites: ['barricade.unlock'], position: { x: 820, y: 500 }, cluster: 'control' }),
  unlockNode({ toolId: 'pulser', prerequisites: ['pinpricker.range3'], position: { x: 920, y: 180 }, cluster: 'control' }),
  unlockNode({ toolId: 'aoeFreeze', prerequisites: ['poke.damage2'], position: { x: -520, y: 520 }, cluster: 'abilities' }),
  unlockNode({ toolId: 'punt', prerequisites: ['poke.charge2'], position: { x: -80, y: 660 }, cluster: 'abilities' }),
  unlockNode({ toolId: 'wallBlade', prerequisites: ['pulser.radius3'], position: { x: 1340, y: 250 }, cluster: 'control' }),
  unlockNode({ toolId: 'sniper', prerequisites: ['pinpricker.pierce3'], position: { x: 1040, y: -470 }, cluster: 'precision' }),
  unlockNode({ toolId: 'lure', prerequisites: ['barricade.durability3'], position: { x: 1020, y: 720 }, cluster: 'control' }),
  unlockNode({ toolId: 'swarm', prerequisites: ['aoeFreeze.duration3'], position: { x: -860, y: 760 }, cluster: 'abilities' }),
  unlockNode({ toolId: 'backlash', prerequisites: ['punt.force3'], position: { x: 120, y: 900 }, cluster: 'abilities' }),
  unlockNode({ toolId: 'meteors', prerequisites: ['splashCannon.radius3'], position: { x: 1300, y: -180 }, cluster: 'splash', cost: 2 }),
];

const PINPRICKER_NODES: UpgradeNode[] = [
  ...chain({
    prefix: 'pinpricker.damage',
    label: 'Needle Damage',
    description: () => '+12% Pinpricker damage.',
    icon: 'D',
    cluster: 'pinpricker',
    start: STARTER_NODE_ID,
    count: 5,
    baseCost: 45,
    startPosition: { x: 180, y: -120 },
    toolId: 'pinpricker',
    toolMods: () => ({ damageMultiplier: 1.12 }),
  }),
  ...chain({
    prefix: 'pinpricker.charge',
    label: 'Wound Spring',
    description: () => 'Pinpricker charges 8% faster.',
    icon: 'C',
    cluster: 'pinpricker',
    start: STARTER_NODE_ID,
    count: 5,
    baseCost: 50,
    startPosition: { x: 180, y: 0 },
    toolId: 'pinpricker',
    toolMods: () => ({ chargeTimeMultiplier: 0.92 }),
  }),
  ...chain({
    prefix: 'pinpricker.capacity',
    label: 'Spare Stakes',
    description: (rank) => (rank === 3 ? 'Pinpricker gains +1 max charge.' : 'Pinpricker stockpiles charge more efficiently.'),
    icon: '+',
    cluster: 'pinpricker',
    start: STARTER_NODE_ID,
    count: 4,
    baseCost: 65,
    startPosition: { x: 180, y: 120 },
    toolId: 'pinpricker',
    toolMods: (rank) => (rank === 3 ? { maxChargesAdded: 1 } : { startingChargesAdded: 1 }),
  }),
  ...chain({
    prefix: 'pinpricker.range',
    label: 'Longer Limbs',
    description: () => '+10% Pinpricker range.',
    icon: 'R',
    cluster: 'pinpricker',
    start: 'pinpricker.charge2',
    count: 4,
    baseCost: 80,
    startPosition: { x: 520, y: 100 },
    toolId: 'pinpricker',
    toolMods: () => ({ rangeMultiplier: 1.1 }),
  }),
  ...chain({
    prefix: 'pinpricker.pierce',
    label: 'Skewering',
    description: () => 'Pinpricker arrows pierce one extra slime.',
    icon: '>',
    cluster: 'pinpricker',
    start: 'pinpricker.damage2',
    count: 4,
    baseCost: 95,
    startPosition: { x: 500, y: -300 },
    dx: 150,
    dy: -35,
    toolId: 'pinpricker',
    toolMods: () => ({ statAdditions: { pierce: 1 } }),
  }),
  ...chain({
    prefix: 'pinpricker.rate',
    label: 'Quicker String',
    description: () => '+8% Pinpricker firing rate.',
    icon: 'F',
    cluster: 'pinpricker',
    start: 'pinpricker.charge3',
    count: 4,
    baseCost: 100,
    startPosition: { x: 640, y: 0 },
    toolId: 'pinpricker',
    toolMods: () => ({ rateMultiplier: 1.08 }),
  }),
  node({
    id: 'pinpricker.notable.splitShot',
    label: 'Split Shot',
    description: 'Pinpricker gains +1 pierce and +8% firing rate.',
    tier: 3,
    currency: 'goo',
    cost: 260,
    prerequisites: ['pinpricker.pierce2', 'pinpricker.rate2'],
    cluster: 'pinpricker',
    position: { x: 920, y: -210 },
    icon: 'S',
    toolId: 'pinpricker',
    toolMods: { rateMultiplier: 1.08, statAdditions: { pierce: 1 } },
  }),
  node({
    id: 'pinpricker.notable.loadedRack',
    label: 'Loaded Rack',
    description: 'Pinpricker gains +1 max charge and charges 10% faster.',
    tier: 3,
    currency: 'goo',
    cost: 300,
    prerequisites: ['pinpricker.capacity4', 'pinpricker.charge4'],
    cluster: 'pinpricker',
    position: { x: 800, y: 220 },
    icon: 'L',
    toolId: 'pinpricker',
    toolMods: { maxChargesAdded: 1, chargeTimeMultiplier: 0.9 },
  }),
];

const ECONOMY_NODES: UpgradeNode[] = [
  ...chain({
    prefix: 'economy.killGoo',
    label: 'Goo Scraper',
    description: () => '+10% Goo from slime kills.',
    icon: '$',
    cluster: 'economy',
    start: STARTER_NODE_ID,
    count: 5,
    baseCost: 55,
    growth: 1.16,
    startPosition: { x: -160, y: -250 },
    dx: -140,
    dy: -25,
    economyMods: () => ({ killGooMultiplier: 1.1 }),
  }),
  ...chain({
    prefix: 'economy.horde',
    label: 'Horde Harvest',
    description: () => 'Horde slimes drop +1 Goo.',
    icon: 'H',
    cluster: 'economy',
    start: 'economy.killGoo2',
    count: 3,
    baseCost: 95,
    startPosition: { x: -560, y: -80 },
    dx: -130,
    dy: 25,
    economyMods: () => ({ archetypeGooAdded: { horde: 1 } }),
  }),
  ...chain({
    prefix: 'economy.objective',
    label: 'Clean Bonus',
    description: () => '+15% Goo from bonus objectives.',
    icon: 'B',
    cluster: 'economy',
    start: 'economy.killGoo3',
    count: 3,
    baseCost: 120,
    startPosition: { x: -620, y: -360 },
    dx: -130,
    dy: -10,
    economyMods: () => ({ bonusObjectiveGooMultiplier: 1.15 }),
  }),
  node({
    id: 'economy.leakless',
    label: 'Leakless Ledger',
    description: 'Each cleared wave grants +4 Goo if the run has no leaks.',
    tier: 2,
    currency: 'goo',
    cost: 190,
    prerequisites: ['economy.killGoo4'],
    cluster: 'economy',
    position: { x: -840, y: -230 },
    icon: '0',
    economyMods: { leaklessWaveGoo: 4 },
  }),
  node({
    id: 'economy.firstClear',
    label: 'Fresh Samples',
    description: '+20% Goo on first clears.',
    tier: 3,
    currency: 'goo',
    cost: 260,
    prerequisites: ['economy.objective2'],
    cluster: 'economy',
    position: { x: -980, y: -430 },
    icon: '1',
    economyMods: { firstClearGooMultiplier: 1.2 },
  }),
];

const POKE_NODES = [
  ...chain({
    prefix: 'poke.damage',
    label: 'Sharper Poke',
    description: () => '+15% Poke damage.',
    icon: 'D',
    cluster: 'poke',
    start: 'poke.unlock',
    count: 4,
    baseCost: 60,
    startPosition: { x: -360, y: 300 },
    dx: -140,
    toolId: 'poke',
    toolMods: () => ({ damageMultiplier: 1.15 }),
  }),
  ...chain({
    prefix: 'poke.charge',
    label: 'Twitch Reflex',
    description: () => 'Poke charges 10% faster.',
    icon: 'C',
    cluster: 'poke',
    start: 'poke.unlock',
    count: 4,
    baseCost: 70,
    startPosition: { x: -180, y: 460 },
    dx: 40,
    dy: 120,
    toolId: 'poke',
    toolMods: () => ({ chargeTimeMultiplier: 0.9 }),
  }),
];

const SPLASH_NODES = [
  ...chain({
    prefix: 'splashCannon.damage',
    label: 'Blast Powder',
    description: () => '+14% Splash Cannon damage.',
    icon: 'D',
    cluster: 'splash',
    start: 'splashCannon.unlock',
    count: 3,
    baseCost: 130,
    startPosition: { x: 920, y: -300 },
    dx: 150,
    dy: -30,
    toolId: 'splashCannon',
    toolMods: () => ({ damageMultiplier: 1.14 }),
  }),
  ...chain({
    prefix: 'splashCannon.radius',
    label: 'Wider Burst',
    description: () => '+12% Splash Cannon blast radius.',
    icon: 'O',
    cluster: 'splash',
    start: 'splashCannon.unlock',
    count: 3,
    baseCost: 140,
    startPosition: { x: 960, y: -80 },
    dx: 140,
    dy: 0,
    toolId: 'splashCannon',
    toolMods: () => ({ radiusMultiplier: 1.12 }),
  }),
];

const CONTROL_NODES = [
  ...chain({
    prefix: 'barricade.durability',
    label: 'Thicker Slats',
    description: () => 'Barricades gain +3 pressure capacity.',
    icon: '#',
    cluster: 'control',
    start: 'barricade.unlock',
    count: 3,
    baseCost: 110,
    startPosition: { x: 700, y: 600 },
    dx: 120,
    dy: 80,
    toolId: 'barricade',
    toolMods: () => ({ statAdditions: { pressureCapacity: 3 } }),
  }),
  ...chain({
    prefix: 'press.damage',
    label: 'Heavier Press',
    description: () => '+12% Press damage.',
    icon: 'V',
    cluster: 'control',
    start: 'press.unlock',
    count: 3,
    baseCost: 130,
    startPosition: { x: 980, y: 520 },
    dx: 140,
    dy: 30,
    toolId: 'press',
    toolMods: () => ({ damageMultiplier: 1.12 }),
  }),
  ...chain({
    prefix: 'pulser.radius',
    label: 'Bigger Pulse',
    description: () => '+10% Pulser radius.',
    icon: 'O',
    cluster: 'control',
    start: 'pulser.unlock',
    count: 3,
    baseCost: 125,
    startPosition: { x: 1080, y: 130 },
    dx: 130,
    dy: 35,
    toolId: 'pulser',
    toolMods: () => ({ radiusMultiplier: 1.1 }),
  }),
  ...chain({
    prefix: 'aoeFreeze.duration',
    label: 'Deep Chill',
    description: () => '+12% Freeze duration.',
    icon: '*',
    cluster: 'abilities',
    start: 'aoeFreeze.unlock',
    count: 3,
    baseCost: 130,
    startPosition: { x: -660, y: 620 },
    dx: -110,
    dy: 70,
    toolId: 'aoeFreeze',
    toolMods: () => ({ durationMultiplier: 1.12 }),
  }),
  ...chain({
    prefix: 'punt.force',
    label: 'Harder Punt',
    description: () => 'Punt shoves harder and charges faster.',
    icon: '<',
    cluster: 'abilities',
    start: 'punt.unlock',
    count: 3,
    baseCost: 125,
    startPosition: { x: 80, y: 720 },
    dx: 110,
    dy: 70,
    toolId: 'punt',
    toolMods: () => ({ chargeTimeMultiplier: 0.94, statAdditions: { strength: 35 } }),
  }),
];

const ELEMENTAL_NODES: UpgradeNode[] = [
  node({
    id: 'elemental.burningNeedles',
    label: 'Burning Needles',
    description: 'Pinpricker gains +10% damage and marks the fire branch.',
    tier: 4,
    currency: 'goo',
    cost: 360,
    prerequisites: ['pinpricker.notable.splitShot'],
    cluster: 'elemental',
    position: { x: 1160, y: -380 },
    icon: 'F',
    toolId: 'pinpricker',
    toolMods: { damageMultiplier: 1.1 },
    flag: 'pinpricker.burningNeedles',
  }),
  ...chain({
    prefix: 'elemental.fireRate',
    label: 'Kindled Volley',
    description: () => '+7% Pinpricker firing rate from fire tuning.',
    icon: 'f',
    cluster: 'elemental',
    start: 'elemental.burningNeedles',
    count: 4,
    baseCost: 390,
    growth: 1.18,
    startPosition: { x: 1320, y: -460 },
    dx: 140,
    dy: -40,
    tier: 4,
    toolId: 'pinpricker',
    toolMods: () => ({ rateMultiplier: 1.07 }),
  }),
  node({
    id: 'elemental.electricNeedles',
    label: 'Electric Needles',
    description: 'Pinpricker gains +1 pierce and marks the electricity branch.',
    tier: 4,
    currency: 'goo',
    cost: 380,
    prerequisites: ['pinpricker.notable.loadedRack'],
    cluster: 'elemental',
    position: { x: 1080, y: 320 },
    icon: 'E',
    toolId: 'pinpricker',
    toolMods: { statAdditions: { pierce: 1 } },
    flag: 'pinpricker.electricNeedles',
  }),
  ...chain({
    prefix: 'elemental.chain',
    label: 'Charged Chain',
    description: () => '+8% Pinpricker range from electric tuning.',
    icon: 'e',
    cluster: 'elemental',
    start: 'elemental.electricNeedles',
    count: 4,
    baseCost: 400,
    growth: 1.18,
    startPosition: { x: 1240, y: 380 },
    dx: 140,
    dy: 40,
    tier: 4,
    toolId: 'pinpricker',
    toolMods: () => ({ rangeMultiplier: 1.08 }),
  }),
  node({
    id: 'capstone.sustain',
    label: 'Capstone: Sustain',
    description: 'Charges never drop below 1 in any unlocked tool.',
    tier: 4,
    currency: 'goo',
    cost: 850,
    prerequisites: ['elemental.fireRate4', 'elemental.chain4'],
    cluster: 'elemental',
    position: { x: 1860, y: -40 },
    icon: 'S',
    flag: 'capstone.sustain',
  }),
];

const GLOBAL_NODES = [
  ...chain({
    prefix: 'global.charge',
    label: 'Shared Spark',
    description: () => 'All tools charge 5% faster.',
    icon: 'G',
    cluster: 'global',
    start: 'economy.killGoo1',
    count: 4,
    baseCost: 100,
    startPosition: { x: -120, y: -520 },
    dx: 140,
    dy: -40,
    globalMods: () => ({ chargeTimeMultiplier: 0.95 }),
  }),
  ...chain({
    prefix: 'global.momentum',
    label: 'Slime Momentum',
    description: () => 'Each kill gives more charge progress to all tools.',
    icon: 'M',
    cluster: 'global',
    start: 'pinpricker.charge2',
    count: 4,
    baseCost: 120,
    startPosition: { x: 420, y: -520 },
    dx: 140,
    dy: -20,
    globalMods: () => ({ killMomentumPerKill: 0.01 }),
  }),
  node({
    id: 'capstone.pressCombo',
    label: 'Capstone: Press Combo',
    description: 'Slimes hit by Press while Frozen or Squished take 3x damage.',
    tier: 4,
    currency: 'goo',
    cost: 650,
    prerequisites: ['press.damage3', 'aoeFreeze.duration2'],
    cluster: 'control',
    position: { x: 1320, y: 640 },
    icon: 'P',
    toolId: 'press',
    flag: 'capstone.pressCombo',
  }),
  node({
    id: 'pulser.wallImpact',
    label: 'Pulser Wall Impact',
    description: 'Pulser deals +50% wall impact damage.',
    tier: 3,
    currency: 'goo',
    cost: 280,
    prerequisites: ['pulser.radius2'],
    cluster: 'control',
    position: { x: 1270, y: 60 },
    icon: 'W',
    toolId: 'pulser',
    toolMods: { statAdditions: { wallImpact: 3 } },
    flag: 'pulser.wallImpactBoost',
  }),
];

function buildUpgradeNodes(): UpgradeNode[] {
  return [
    ...CORE_NODES,
    ...PINPRICKER_NODES,
    ...ECONOMY_NODES,
    ...POKE_NODES,
    ...SPLASH_NODES,
    ...CONTROL_NODES,
    ...ELEMENTAL_NODES,
    ...GLOBAL_NODES,
  ];
}

export const UPGRADE_NODES: UpgradeNode[] = buildUpgradeNodes();
export const UPGRADE_NODE_INDEX: Map<string, UpgradeNode> = new Map(UPGRADE_NODES.map((node) => [node.id, node]));

/** Returns true if all of node's prerequisites are present in `purchased`. */
export function isAvailable(node: UpgradeNode, purchased: ReadonlySet<string>): boolean {
  if (purchased.has(node.id)) {
    return false;
  }
  return node.prerequisites.every((id) => purchased.has(id));
}

export const isPurchasable = isAvailable;

export function connectedNodeIds(nodeId: string): Set<string> {
  const connected = new Set<string>();
  const node = UPGRADE_NODE_INDEX.get(nodeId);
  if (!node) {
    return connected;
  }
  for (const prerequisite of node.prerequisites) {
    connected.add(prerequisite);
  }
  for (const id of node.connections ?? []) {
    connected.add(id);
  }
  for (const candidate of UPGRADE_NODES) {
    if (candidate.prerequisites.includes(nodeId) || candidate.connections?.includes(nodeId)) {
      connected.add(candidate.id);
    }
  }
  return connected;
}

export function visibleUpgradeNodes(purchased: ReadonlySet<string>): UpgradeNode[] {
  if (purchased.size === 0) {
    return UPGRADE_NODES.filter((node) => node.id === STARTER_NODE_ID);
  }
  const visible = new Set<string>([STARTER_NODE_ID]);
  for (const id of purchased) {
    visible.add(id);
    for (const connected of connectedNodeIds(id)) {
      visible.add(connected);
    }
  }
  return UPGRADE_NODES.filter((node) => visible.has(node.id));
}

export function visibleUpgradeEdges(purchased: ReadonlySet<string>): Array<{ from: string; to: string }> {
  const visible = new Set(visibleUpgradeNodes(purchased).map((node) => node.id));
  const edges: Array<{ from: string; to: string }> = [];
  for (const node of UPGRADE_NODES) {
    if (!visible.has(node.id)) {
      continue;
    }
    for (const prerequisite of node.prerequisites) {
      if (visible.has(prerequisite)) {
        edges.push({ from: prerequisite, to: node.id });
      }
    }
    for (const connection of node.connections ?? []) {
      if (visible.has(connection) && node.id < connection) {
        edges.push({ from: node.id, to: connection });
      }
    }
  }
  return edges;
}

export function unlockedTools(purchased: ReadonlySet<string>): Set<string> {
  const tools = new Set<string>();
  for (const id of purchased) {
    const node = UPGRADE_NODE_INDEX.get(id);
    if (node?.unlocksToolId) {
      tools.add(node.unlocksToolId);
    }
  }
  return tools;
}

export function purchasedFlags(purchased: ReadonlySet<string>): Set<string> {
  const flags = new Set<string>();
  for (const id of purchased) {
    const node = UPGRADE_NODE_INDEX.get(id);
    if (node?.flag) {
      flags.add(node.flag);
    }
  }
  return flags;
}

function combineMods(into: ToolUpgradeMods, from: ToolUpgradeMods | undefined): ToolUpgradeMods {
  if (!from) {
    return into;
  }
  const result: ToolUpgradeMods = { ...into };
  if (from.chargeTimeMultiplier !== undefined) {
    result.chargeTimeMultiplier = (result.chargeTimeMultiplier ?? 1) * from.chargeTimeMultiplier;
  }
  if (from.maxChargesAdded !== undefined) {
    result.maxChargesAdded = (result.maxChargesAdded ?? 0) + from.maxChargesAdded;
  }
  if (from.startingChargesAdded !== undefined) {
    result.startingChargesAdded = (result.startingChargesAdded ?? 0) + from.startingChargesAdded;
  }
  if (from.damageMultiplier !== undefined) {
    result.damageMultiplier = (result.damageMultiplier ?? 1) * from.damageMultiplier;
  }
  if (from.rangeMultiplier !== undefined) {
    result.rangeMultiplier = (result.rangeMultiplier ?? 1) * from.rangeMultiplier;
  }
  if (from.radiusMultiplier !== undefined) {
    result.radiusMultiplier = (result.radiusMultiplier ?? 1) * from.radiusMultiplier;
  }
  if (from.rateMultiplier !== undefined) {
    result.rateMultiplier = (result.rateMultiplier ?? 1) * from.rateMultiplier;
  }
  if (from.durationMultiplier !== undefined) {
    result.durationMultiplier = (result.durationMultiplier ?? 1) * from.durationMultiplier;
  }
  if (from.killMomentumPerKill !== undefined) {
    result.killMomentumPerKill = (result.killMomentumPerKill ?? 0) + from.killMomentumPerKill;
  }
  if (from.spendCostMultiplier !== undefined) {
    result.spendCostMultiplier = (result.spendCostMultiplier ?? 1) * from.spendCostMultiplier;
  }
  if (from.statAdditions) {
    const statAdditions = { ...(result.statAdditions ?? {}) };
    for (const [key, value] of Object.entries(from.statAdditions)) {
      statAdditions[key] = (statAdditions[key] ?? 0) + value;
    }
    result.statAdditions = statAdditions;
  }
  if (from.statOverrides) {
    result.statOverrides = { ...(result.statOverrides ?? {}), ...from.statOverrides };
  }
  return result;
}

function combineEconomyMods(into: EconomyUpgradeMods, from: EconomyUpgradeMods | undefined): EconomyUpgradeMods {
  if (!from) {
    return into;
  }
  const result: EconomyUpgradeMods = { ...into };
  if (from.killGooMultiplier !== undefined) {
    result.killGooMultiplier = (result.killGooMultiplier ?? 1) * from.killGooMultiplier;
  }
  if (from.totalGooMultiplier !== undefined) {
    result.totalGooMultiplier = (result.totalGooMultiplier ?? 1) * from.totalGooMultiplier;
  }
  if (from.bonusObjectiveGooMultiplier !== undefined) {
    result.bonusObjectiveGooMultiplier =
      (result.bonusObjectiveGooMultiplier ?? 1) * from.bonusObjectiveGooMultiplier;
  }
  if (from.firstClearGooMultiplier !== undefined) {
    result.firstClearGooMultiplier = (result.firstClearGooMultiplier ?? 1) * from.firstClearGooMultiplier;
  }
  if (from.leaklessWaveGoo !== undefined) {
    result.leaklessWaveGoo = (result.leaklessWaveGoo ?? 0) + from.leaklessWaveGoo;
  }
  if (from.archetypeGooAdded) {
    result.archetypeGooAdded = { ...(result.archetypeGooAdded ?? {}) };
    for (const [archetype, value] of Object.entries(from.archetypeGooAdded) as Array<[ArchetypeId, number]>) {
      result.archetypeGooAdded[archetype] = (result.archetypeGooAdded[archetype] ?? 0) + value;
    }
  }
  return result;
}

/** Aggregate all purchased upgrades into combat and economy modifier bundles. */
export function aggregateMods(purchased: ReadonlySet<string>): {
  perTool: Map<string, ToolUpgradeMods>;
  global: ToolUpgradeMods;
  economy: EconomyUpgradeMods;
} {
  const perTool = new Map<string, ToolUpgradeMods>();
  let global: ToolUpgradeMods = defaultToolMods();
  let economy: EconomyUpgradeMods = {};

  for (const id of purchased) {
    const node = UPGRADE_NODE_INDEX.get(id);
    if (!node) {
      continue;
    }
    if (node.globalMods) {
      global = combineMods(global, node.globalMods);
    }
    if (node.toolMods && node.toolId) {
      const existing = perTool.get(node.toolId) ?? defaultToolMods();
      perTool.set(node.toolId, combineMods(existing, node.toolMods));
    }
    if (node.economyMods) {
      economy = combineEconomyMods(economy, node.economyMods);
    }
  }
  return { perTool, global, economy };
}

/** Compose the final mods for a specific tool by merging global with per-tool. */
export function modsForTool(
  toolId: string,
  aggregate: { perTool: Map<string, ToolUpgradeMods>; global: ToolUpgradeMods },
): ToolUpgradeMods {
  const tool = aggregate.perTool.get(toolId);
  if (!tool) {
    return aggregate.global;
  }
  return combineMods(aggregate.global, tool);
}
