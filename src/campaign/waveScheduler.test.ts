import { describe, expect, it } from 'vitest';
import { CAMPAIGN_LEVELS, levelById, totalSlimesIn } from './levels';
import { WaveScheduler, summarizeWave } from './waveScheduler';

describe('WaveScheduler', () => {
  it('previews the first wave by default', () => {
    const level = levelById('level-1')!;
    const scheduler = new WaveScheduler({ level, maze: level.buildMaze(), preWaveCountdownSeconds: 1 });
    const preview = scheduler.preview();
    expect(preview).toBeDefined();
    expect(preview?.index).toBe(0);
    expect(preview?.totalSlimes).toBeGreaterThan(0);
  });

  it('starts spawning after countdown elapses', () => {
    const level = levelById('level-1')!;
    let spawnCount = 0;
    const scheduler = new WaveScheduler({
      level,
      maze: level.buildMaze(),
      preWaveCountdownSeconds: 1,
      events: { onSpawn: () => (spawnCount += 1) },
    });
    expect(scheduler.phaseLabel).toBe('preWaveCountdown');
    for (let i = 0; i < 30; i += 1) {
      scheduler.step(0.1, spawnCount);
    }
    expect(spawnCount).toBeGreaterThan(0);
  });

  it('spawns the entire wave roster across the wave', () => {
    const level = levelById('level-2')!;
    const totalForLevel = totalSlimesIn(level);
    let spawnCount = 0;
    const scheduler = new WaveScheduler({
      level,
      maze: level.buildMaze(),
      preWaveCountdownSeconds: 1,
      events: { onSpawn: () => (spawnCount += 1) },
    });
    for (let i = 0; i < 4000 && !scheduler.isComplete(); i += 1) {
      scheduler.step(0.1, 0);
    }
    expect(scheduler.isComplete()).toBe(true);
    expect(spawnCount).toBe(totalForLevel);
  });

  it('summarizeWave aggregates archetype counts', () => {
    const level = levelById('level-3')!;
    const summary = summarizeWave(level.waves[1], 1);
    expect(summary.totalSlimes).toBeGreaterThan(0);
    expect(summary.archetypes.horde).toBeGreaterThan(0);
    expect(summary.archetypes.blocker).toBeGreaterThan(0);
  });

  it('every campaign level can be scheduled to completion', () => {
    for (const level of CAMPAIGN_LEVELS) {
      const scheduler = new WaveScheduler({
        level,
        maze: level.buildMaze(),
        preWaveCountdownSeconds: 0.1,
      });
      for (let i = 0; i < 6000 && !scheduler.isComplete(); i += 1) {
        scheduler.step(0.1, 0);
      }
      expect(scheduler.isComplete()).toBe(true);
    }
  });
});
