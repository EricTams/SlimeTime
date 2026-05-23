import type { ArchetypeId } from './archetypes';
import type { EconomyUpgradeMods } from './upgradeTree';

export const CURRENCY_LABELS = {
  goo: 'Goo',
  cores: 'Cores',
} as const;

export type CurrencyId = keyof typeof CURRENCY_LABELS;

export const ARCHETYPE_GOO_VALUES: Record<ArchetypeId, number> = {
  horde: 1,
  armored: 2,
  blocker: 3,
  corrupter: 2,
  hopper: 2,
  healer: 3,
  gremlin: 2,
  cocoon: 3,
  sprint: 2,
  king: 6,
  wallBreaker: 4,
};

export const PAYOUT_TUNING = {
  gooPerWaveCleared: 10,
  gooPerWaveScaling: 0.2,
  gooWinBonus: 50,
  gooBonusObjective: 25,
  gooLeakPenaltyPerSlime: 1,
  goalLeakBudgetCushion: 5,
  diminishingReplayMultipliers: [1, 0.5, 0.25, 0.1, 0.0] as const,
  coresFirstClear: 1,
  coresSubsequentClear: 0,
  coresBonusObjective: 0,
  coresWinForLevelZero: 1,
  sellRefundFraction: 0.5,
} as const;

export interface RunStats {
  slimesKilled: Partial<Record<ArchetypeId, number>>;
  wavesCleared: number;
  totalWaves: number;
  leaks: number;
  leakBudget: number;
  bonusObjectiveAchieved: boolean;
}

export interface RunPayout {
  goo: number;
  cores: number;
  diminishingMultiplier: number;
  breakdown: Array<{ source: string; goo: number; cores: number }>;
}

export interface RunOutcome {
  win: boolean;
  stats: RunStats;
  payout: RunPayout;
}

export function emptyRunStats(totalWaves: number, leakBudget: number): RunStats {
  return {
    slimesKilled: {},
    wavesCleared: 0,
    totalWaves,
    leaks: 0,
    leakBudget,
    bonusObjectiveAchieved: false,
  };
}

export function recordKill(stats: RunStats, archetype: ArchetypeId): void {
  stats.slimesKilled[archetype] = (stats.slimesKilled[archetype] ?? 0) + 1;
}

export function totalKills(stats: RunStats): number {
  let total = 0;
  for (const archetype of Object.keys(stats.slimesKilled) as ArchetypeId[]) {
    total += stats.slimesKilled[archetype] ?? 0;
  }
  return total;
}

export function computePayout(args: {
  win: boolean;
  stats: RunStats;
  isLevelZero: boolean;
  priorClears: number;
  economyMods?: EconomyUpgradeMods;
}): RunPayout {
  const { win, stats, isLevelZero, priorClears, economyMods } = args;
  const breakdown: Array<{ source: string; goo: number; cores: number }> = [];

  let killGoo = 0;
  for (const archetype of Object.keys(stats.slimesKilled) as ArchetypeId[]) {
    const killCount = stats.slimesKilled[archetype] ?? 0;
    const value = (ARCHETYPE_GOO_VALUES[archetype] ?? 1) + (economyMods?.archetypeGooAdded?.[archetype] ?? 0);
    killGoo += killCount * value;
  }
  killGoo = Math.floor(killGoo * (economyMods?.killGooMultiplier ?? 1));
  if (killGoo > 0) {
    breakdown.push({ source: 'kills', goo: killGoo, cores: 0 });
  }

  let waveGoo = 0;
  for (let waveIndex = 0; waveIndex < stats.wavesCleared; waveIndex += 1) {
    waveGoo += PAYOUT_TUNING.gooPerWaveCleared * (1 + waveIndex * PAYOUT_TUNING.gooPerWaveScaling);
  }
  waveGoo = Math.floor(waveGoo);
  if (waveGoo > 0) {
    breakdown.push({ source: 'waves', goo: waveGoo, cores: 0 });
  }

  const winGoo = win ? PAYOUT_TUNING.gooWinBonus : 0;
  if (winGoo > 0) {
    breakdown.push({ source: 'win-bonus', goo: winGoo, cores: 0 });
  }

  const bonusGoo = stats.bonusObjectiveAchieved
    ? Math.floor(PAYOUT_TUNING.gooBonusObjective * (economyMods?.bonusObjectiveGooMultiplier ?? 1))
    : 0;
  if (bonusGoo > 0) {
    breakdown.push({ source: 'bonus-objective', goo: bonusGoo, cores: 0 });
  }

  const leaklessGoo = stats.leaks === 0 ? Math.floor((economyMods?.leaklessWaveGoo ?? 0) * stats.wavesCleared) : 0;
  if (leaklessGoo > 0) {
    breakdown.push({ source: 'leakless-waves', goo: leaklessGoo, cores: 0 });
  }

  const leakPenalty = Math.min(stats.leaks, stats.leakBudget) * PAYOUT_TUNING.gooLeakPenaltyPerSlime;
  if (leakPenalty > 0) {
    breakdown.push({ source: 'leak-penalty', goo: -leakPenalty, cores: 0 });
  }

  const diminishingMultiplier = diminishingMultiplierFor(priorClears);
  const firstClearMultiplier = win && priorClears === 0 ? (economyMods?.firstClearGooMultiplier ?? 1) : 1;
  const rawGoo = Math.max(0, killGoo + waveGoo + winGoo + bonusGoo + leaklessGoo - leakPenalty);
  const finalGoo = Math.floor(rawGoo * firstClearMultiplier * (economyMods?.totalGooMultiplier ?? 1) * diminishingMultiplier);

  let cores = 0;
  if (win) {
    if (isLevelZero) {
      cores = PAYOUT_TUNING.coresWinForLevelZero;
      breakdown.push({ source: 'tutorial-clear', goo: 0, cores });
    } else if (priorClears === 0) {
      cores = PAYOUT_TUNING.coresFirstClear;
      breakdown.push({ source: 'first-clear', goo: 0, cores });
    } else {
      cores = PAYOUT_TUNING.coresSubsequentClear;
    }
  }

  return {
    goo: finalGoo,
    cores,
    diminishingMultiplier,
    breakdown,
  };
}

export function diminishingMultiplierFor(priorClears: number): number {
  const table = PAYOUT_TUNING.diminishingReplayMultipliers;
  if (priorClears < 0) {
    return 1;
  }
  if (priorClears >= table.length) {
    return table[table.length - 1];
  }
  return table[priorClears];
}

export function formatCurrency(value: number, currency: CurrencyId): string {
  const label = CURRENCY_LABELS[currency];
  return `${Math.floor(value)} ${label}`;
}
