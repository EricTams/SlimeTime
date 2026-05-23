import { describe, expect, it } from 'vitest';
import {
  computePayout,
  diminishingMultiplierFor,
  emptyRunStats,
  PAYOUT_TUNING,
  recordKill,
} from './economy';

describe('economy', () => {
  it('awards no Cores for a loss', () => {
    const stats = emptyRunStats(3, 20);
    stats.wavesCleared = 1;
    recordKill(stats, 'horde');
    const payout = computePayout({ win: false, stats, isLevelZero: false, priorClears: 0 });
    expect(payout.cores).toBe(0);
    expect(payout.goo).toBeGreaterThan(0);
  });

  it('awards exactly one Core for the Level 0 tutorial win', () => {
    const stats = emptyRunStats(1, 5);
    stats.wavesCleared = 1;
    recordKill(stats, 'horde');
    const payout = computePayout({ win: true, stats, isLevelZero: true, priorClears: 0 });
    expect(payout.cores).toBe(PAYOUT_TUNING.coresWinForLevelZero);
  });

  it('awards Cores only on first clear, not repeats', () => {
    const stats = emptyRunStats(3, 20);
    stats.wavesCleared = 3;
    recordKill(stats, 'horde');
    expect(computePayout({ win: true, stats, isLevelZero: false, priorClears: 0 }).cores).toBe(
      PAYOUT_TUNING.coresFirstClear,
    );
    expect(computePayout({ win: true, stats, isLevelZero: false, priorClears: 1 }).cores).toBe(
      PAYOUT_TUNING.coresSubsequentClear,
    );
  });

  it('applies diminishing returns to repeated clears of the same level', () => {
    const stats = emptyRunStats(3, 20);
    stats.wavesCleared = 3;
    for (let i = 0; i < 10; i += 1) {
      recordKill(stats, 'horde');
    }
    const first = computePayout({ win: true, stats, isLevelZero: false, priorClears: 0 });
    const second = computePayout({ win: true, stats, isLevelZero: false, priorClears: 1 });
    const fifth = computePayout({ win: true, stats, isLevelZero: false, priorClears: 4 });

    expect(second.goo).toBeLessThan(first.goo);
    expect(fifth.goo).toBe(0);
    expect(diminishingMultiplierFor(0)).toBe(1);
    expect(diminishingMultiplierFor(4)).toBe(0);
  });

  it('penalizes leaks against the Goo payout', () => {
    const cleanStats = emptyRunStats(3, 20);
    cleanStats.wavesCleared = 2;
    recordKill(cleanStats, 'horde');
    const leakyStats = { ...cleanStats, leaks: 8 };

    const cleanPayout = computePayout({ win: false, stats: cleanStats, isLevelZero: false, priorClears: 0 });
    const leakyPayout = computePayout({ win: false, stats: leakyStats, isLevelZero: false, priorClears: 0 });

    expect(leakyPayout.goo).toBeLessThan(cleanPayout.goo);
  });

  it('applies Goo income upgrades to kill and objective payouts', () => {
    const stats = emptyRunStats(3, 20);
    stats.wavesCleared = 3;
    stats.bonusObjectiveAchieved = true;
    recordKill(stats, 'horde');
    recordKill(stats, 'horde');

    const base = computePayout({ win: true, stats, isLevelZero: false, priorClears: 0 });
    const boosted = computePayout({
      win: true,
      stats,
      isLevelZero: false,
      priorClears: 0,
      economyMods: {
        killGooMultiplier: 1.5,
        bonusObjectiveGooMultiplier: 1.5,
        firstClearGooMultiplier: 1.2,
        leaklessWaveGoo: 4,
        archetypeGooAdded: { horde: 1 },
      },
    });

    expect(boosted.goo).toBeGreaterThan(base.goo);
    expect(boosted.breakdown.some((entry) => entry.source === 'leakless-waves')).toBe(true);
  });
});
