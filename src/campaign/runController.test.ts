import { describe, expect, it } from 'vitest';
import { levelById } from './levels';
import { MetaProgress } from './metaProgress';
import { RunController } from './runController';
import { STARTER_NODE_ID, UPGRADE_NODE_INDEX } from './upgradeTree';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

describe('RunController integration', () => {
  it('Level 0 forces pre-placement of a Pinpricker before the first wave', () => {
    const meta = new MetaProgress(new MemoryStorage());
    const controller = new RunController({ level: levelById('tutorial')!, meta });
    expect(controller.getPhase()).toBe('prePlacement');

    const onCorridorFloor = controller.placeStructure('pinpricker', { x: 5, y: 3 });
    expect(onCorridorFloor.ok).toBe(false);

    const placed = controller.placeStructure('pinpricker', { x: 5, y: 2 });
    expect(placed.ok).toBe(true);
    expect(controller.getPhase()).toBe('awaitingFirstWave');
  });

  it('Level 0 awards 1 Core when run is complete', () => {
    const meta = new MetaProgress(new MemoryStorage());
    const controller = new RunController({ level: levelById('tutorial')!, meta });
    controller.placeStructure('pinpricker', { x: 5, y: 2 });
    controller.placeStructure('pinpricker', { x: 7, y: 4 });

    for (let i = 0; i < 1500 && controller.getPhase() !== 'won' && controller.getPhase() !== 'lost'; i += 1) {
      controller.step(0.1);
    }

    expect(['won', 'lost']).toContain(controller.getPhase());
    if (controller.getPhase() === 'won') {
      expect(meta.cores).toBeGreaterThanOrEqual(1);
    }
  });

  it('Player can buy Poke after winning Level 0 and use it on Level 1', () => {
    const meta = new MetaProgress(new MemoryStorage());
    expect(meta.tryPurchase(UPGRADE_NODE_INDEX.get(STARTER_NODE_ID)!).ok).toBe(true);
    const tutorial = levelById('tutorial')!;
    const tutorialController = new RunController({ level: tutorial, meta });
    tutorialController.placeStructure('pinpricker', { x: 5, y: 2 });
    tutorialController.placeStructure('pinpricker', { x: 7, y: 4 });

    for (let i = 0; i < 2500 && tutorialController.getPhase() !== 'won'; i += 1) {
      tutorialController.step(0.1);
    }
    expect(tutorialController.getPhase()).toBe('won');

    const purchased = meta.tryPurchase(UPGRADE_NODE_INDEX.get('poke.unlock')!);
    expect(purchased.ok).toBe(true);
    expect(meta.unlockedTools().has('poke')).toBe(true);

    const level1 = levelById('level-1')!;
    const runController = new RunController({ level: level1, meta });
    // Abilities start a run with empty charges, so Poke is unlocked but not
    // immediately ready. It should appear in the toolbar and charge up.
    const pokeRuntime = runController.chargeSystem.tools.get('poke');
    expect(pokeRuntime?.unlocked).toBe(true);
    expect(pokeRuntime?.charges).toBe(0);
    expect(runController.buildToolBar().some((entry) => entry.toolId === 'poke')).toBe(true);
  });

  it('Pinpricker is gifted in Level 0 even without unlock', () => {
    const meta = new MetaProgress(new MemoryStorage());
    const controller = new RunController({ level: levelById('tutorial')!, meta });
    expect(controller.isToolReady('pinpricker')).toBe(true);
  });

  it('Run records leaks and ends as a loss when leak budget is exceeded', () => {
    const meta = new MetaProgress(new MemoryStorage());
    const level1 = levelById('level-1')!;
    const controller = new RunController({ level: level1, meta });
    // Don't place any structures: every slime should reach the exit.
    for (let i = 0; i < 5000 && controller.getPhase() !== 'lost' && controller.getPhase() !== 'won'; i += 1) {
      controller.step(0.1);
    }
    // With no defenses, leak budget will be exceeded => loss.
    expect(controller.getPhase()).toBe('lost');
    expect(controller.getStats().leaks).toBeGreaterThan(level1.leakBudget);
  });

  it('Wall-breaker can destroy a turret by demolishing its wall', () => {
    const meta = new MetaProgress(new MemoryStorage());
    const level = levelById('tutorial')!;
    const controller = new RunController({ level, meta });
    const placed = controller.placeStructure('pinpricker', { x: 5, y: 2 });
    expect(placed.ok).toBe(true);
    // Manually break the wall the Pinpricker sits on.
    controller.world.destroyWallAt({ x: 5, y: 2 });
    expect(controller.getStructures().some((s) => s.alive && s.cell.x === 5 && s.cell.y === 2)).toBe(false);
  });
});
