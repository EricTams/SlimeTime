import { describe, expect, it } from 'vitest';
import {
  STARTER_NODE_ID,
  UPGRADE_NODE_INDEX,
  UPGRADE_NODES,
  aggregateMods,
  connectedNodeIds,
  isAvailable,
  modsForTool,
  unlockedTools,
  visibleUpgradeNodes,
} from './upgradeTree';
import { MetaProgress } from './metaProgress';

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

describe('upgrade tree', () => {
  it('starts with only the Pinpricker unlock visible', () => {
    const visible = visibleUpgradeNodes(new Set());
    expect(visible.map((node) => node.id)).toEqual([STARTER_NODE_ID]);
    expect(UPGRADE_NODE_INDEX.get(STARTER_NODE_ID)?.currency).toBe('cores');
  });

  it('reveals connected nodes after buying the starter node', () => {
    const visible = visibleUpgradeNodes(new Set([STARTER_NODE_ID])).map((node) => node.id);
    expect(visible).toContain(STARTER_NODE_ID);
    expect(visible).toContain('pinpricker.damage1');
    expect(visible).toContain('pinpricker.charge1');
    expect(visible).toContain('poke.unlock');
    expect(visible).not.toContain('pinpricker.damage3');
    expect(connectedNodeIds(STARTER_NODE_ID).has('pinpricker.damage1')).toBe(true);
  });

  it('uses Core nodes for tool unlocks and Goo nodes for stat upgrades', () => {
    const unlocks = UPGRADE_NODES.filter((node) => node.unlocksToolId);
    expect(unlocks.length).toBeGreaterThan(10);
    expect(unlocks.every((node) => node.currency === 'cores')).toBe(true);

    const statNodes = UPGRADE_NODES.filter((node) => node.toolMods || node.globalMods || node.economyMods);
    expect(statNodes.length).toBeGreaterThan(80);
    expect(statNodes.every((node) => node.currency === 'goo')).toBe(true);
  });

  it('has a large authored tree for the first pass', () => {
    expect(UPGRADE_NODES.length).toBeGreaterThanOrEqual(90);
    expect(UPGRADE_NODES.length).toBeLessThanOrEqual(120);
  });

  it('Poke requires Pinpricker', () => {
    const node = UPGRADE_NODE_INDEX.get('poke.unlock')!;
    expect(isAvailable(node, new Set())).toBe(false);
    expect(isAvailable(node, new Set([STARTER_NODE_ID]))).toBe(true);
  });

  it('Buying Pinpricker unlocks the tool but not Poke', () => {
    const tools = unlockedTools(new Set([STARTER_NODE_ID]));
    expect(tools.has('pinpricker')).toBe(true);
    expect(tools.has('poke')).toBe(false);
  });

  it('Damage rank stacks multiplicatively when both are bought', () => {
    const purchased = new Set(['pinpricker.damage1', 'pinpricker.damage2']);
    const aggregate = aggregateMods(purchased);
    const mods = modsForTool('pinpricker', aggregate);
    expect(mods.damageMultiplier).toBeCloseTo(1.12 * 1.12);
  });

  it('Goo income nodes aggregate economy modifiers', () => {
    const aggregate = aggregateMods(new Set(['economy.killGoo1', 'economy.killGoo2', 'economy.horde1']));
    expect(aggregate.economy.killGooMultiplier).toBeCloseTo(1.1 * 1.1);
    expect(aggregate.economy.archetypeGooAdded?.horde).toBe(1);
  });
});

describe('MetaProgress', () => {
  it('starts new saves with one Core for the starter node', () => {
    const meta = new MetaProgress(new MemoryStorage());
    expect(meta.cores).toBe(1);
    expect(meta.goo).toBe(0);
  });

  it('normalizes old Poke-start saves back to the Pinpricker root', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'slimegame.metaProgress.v1',
      JSON.stringify({
        version: 1,
        goo: 50,
        cores: 0,
        purchased: ['poke.unlock'],
        clears: { tutorial: 1 },
        hasSeenIntro: true,
      }),
    );

    const meta = new MetaProgress(storage);
    expect(meta.cores).toBe(1);
    expect(meta.goo).toBe(50);
    expect(meta.hasPurchased('poke.unlock')).toBe(false);
    expect(meta.hasPurchased(STARTER_NODE_ID)).toBe(false);
    expect(visibleUpgradeNodes(meta.purchasedSet()).map((node) => node.id)).toEqual([STARTER_NODE_ID]);
    expect(meta.unlockedTools().has('poke')).toBe(false);
  });

  it('persists Goo and Core balances across instances', () => {
    const storage = new MemoryStorage();
    const meta1 = new MetaProgress(storage);
    meta1.awardGoo(120);
    meta1.awardCores(2);
    const meta2 = new MetaProgress(storage);
    expect(meta2.goo).toBe(120);
    expect(meta2.cores).toBe(3);
  });

  it('refuses to purchase without prerequisites', () => {
    const meta = new MetaProgress(new MemoryStorage());
    meta.awardCores(1);
    const splash = UPGRADE_NODE_INDEX.get('splashCannon.unlock')!;
    expect(meta.tryPurchase(splash).ok).toBe(false);
  });

  it('purchases Pinpricker for exactly one Core', () => {
    const meta = new MetaProgress(new MemoryStorage());
    const starter = UPGRADE_NODE_INDEX.get(STARTER_NODE_ID)!;
    expect(meta.tryPurchase(starter).ok).toBe(true);
    expect(meta.cores).toBe(0);
    expect(meta.unlockedTools().has('pinpricker')).toBe(true);
  });

  it('records level clears for diminishing-returns lookups', () => {
    const meta = new MetaProgress(new MemoryStorage());
    meta.recordClear('level-1');
    meta.recordClear('level-1');
    expect(meta.clearsForLevel('level-1')).toBe(2);
  });
});
