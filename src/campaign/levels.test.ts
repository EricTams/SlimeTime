import { describe, expect, it } from 'vitest';
import { isWallCell } from '../sim/maze';
import { CAMPAIGN_LEVELS, levelById, totalSlimesIn } from './levels';
import { FlowField } from '../sim/flowField';

describe('campaign levels', () => {
  it('contains exactly one tutorial plus ten campaign levels', () => {
    expect(CAMPAIGN_LEVELS).toHaveLength(11);
    expect(CAMPAIGN_LEVELS[0].isTutorial).toBe(true);
    expect(CAMPAIGN_LEVELS.slice(1).every((level) => level.isTutorial !== true)).toBe(true);
  });

  it.each(CAMPAIGN_LEVELS)('every level builds a navigable maze: %j', (level) => {
    const maze = level.buildMaze();
    expect(maze.width).toBeGreaterThan(0);
    expect(maze.height).toBeGreaterThan(0);
    expect(isWallCell(maze, maze.entrance.x, maze.entrance.y)).toBe(false);
    expect(isWallCell(maze, maze.exit.x, maze.exit.y)).toBe(false);
    const flowField = new FlowField(maze);
    const distance = flowField.distanceAtCell(maze.entrance.x, maze.entrance.y);
    expect(Number.isFinite(distance)).toBe(true);
  });

  it('Level 0 mandates Pinpricker pre-placement', () => {
    const level = levelById('tutorial')!;
    expect(level.prePlacementToolId).toBe('pinpricker');
    expect(level.giftPinpricker).toBe(true);
  });

  it('every campaign level (other than tutorial) has a prerequisite', () => {
    for (const level of CAMPAIGN_LEVELS) {
      if (level.isTutorial) {
        continue;
      }
      expect(level.prerequisiteId).toBeDefined();
    }
  });

  it('totalSlimesIn returns positive counts', () => {
    for (const level of CAMPAIGN_LEVELS) {
      expect(totalSlimesIn(level)).toBeGreaterThan(0);
    }
  });

  it('leak budget is reasonable per level', () => {
    for (const level of CAMPAIGN_LEVELS) {
      expect(level.leakBudget).toBeGreaterThan(0);
      expect(level.leakBudget).toBeLessThan(50);
    }
  });
});
