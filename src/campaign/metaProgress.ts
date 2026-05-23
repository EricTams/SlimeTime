import { STARTER_NODE_ID, aggregateMods, purchasedFlags, unlockedTools, type UpgradeNode } from './upgradeTree';
import type { CurrencyId } from './economy';

export interface SerializedMetaProgress {
  version: number;
  goo: number;
  cores: number;
  /** Set of purchased upgrade node ids. */
  purchased: string[];
  /** Map of levelId -> times cleared. */
  clears: Record<string, number>;
  /** Best run stats per level (lowest leak count, fastest, etc). Optional. */
  best?: Record<string, { leaks: number; bonusObjective: boolean }>;
  /** Whether the player has seen the day-one onboarding. */
  hasSeenIntro: boolean;
}

const STORAGE_KEY = 'slimegame.metaProgress.v1';
const VERSION = 1;

function defaultProgress(): SerializedMetaProgress {
  return {
    version: VERSION,
    goo: 0,
    cores: 1,
    purchased: [],
    clears: {},
    hasSeenIntro: false,
  };
}

export class MetaProgress {
  private state: SerializedMetaProgress;
  private readonly storage: Storage | null;

  constructor(storage: Storage | null = typeof localStorage === 'undefined' ? null : localStorage) {
    this.storage = storage;
    this.state = this.load();
  }

  private load(): SerializedMetaProgress {
    if (!this.storage) {
      return defaultProgress();
    }
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) {
        return defaultProgress();
      }
      const parsed = JSON.parse(raw) as SerializedMetaProgress;
      if (!parsed || parsed.version !== VERSION) {
        return defaultProgress();
      }
      const purchased = Array.isArray(parsed.purchased) ? [...parsed.purchased] : [];
      if (!purchased.includes(STARTER_NODE_ID)) {
        return {
          version: parsed.version,
          goo: Math.max(0, parsed.goo ?? 0),
          cores: Math.max(1, parsed.cores ?? 0),
          purchased: [],
          clears: {},
          best: undefined,
          hasSeenIntro: false,
        };
      }
      return {
        version: parsed.version,
        goo: Math.max(0, parsed.goo ?? 0),
        cores: Math.max(0, parsed.cores ?? 0),
        purchased,
        clears: parsed.clears && typeof parsed.clears === 'object' ? { ...parsed.clears } : {},
        best: parsed.best && typeof parsed.best === 'object' ? { ...parsed.best } : undefined,
        hasSeenIntro: Boolean(parsed.hasSeenIntro),
      };
    } catch {
      return defaultProgress();
    }
  }

  private persist(): void {
    if (!this.storage) {
      return;
    }
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Ignore quota errors silently.
    }
  }

  reset(): void {
    this.state = defaultProgress();
    this.persist();
  }

  // -- Read API --

  get goo(): number {
    return this.state.goo;
  }

  get cores(): number {
    return this.state.cores;
  }

  hasPurchased(nodeId: string): boolean {
    return this.state.purchased.includes(nodeId);
  }

  purchasedSet(): Set<string> {
    return new Set(this.state.purchased);
  }

  clearsForLevel(levelId: string): number {
    return this.state.clears[levelId] ?? 0;
  }

  hasSeenIntro(): boolean {
    return this.state.hasSeenIntro;
  }

  unlockedTools(): Set<string> {
    return unlockedTools(this.purchasedSet());
  }

  flags(): Set<string> {
    return purchasedFlags(this.purchasedSet());
  }

  aggregatedMods() {
    return aggregateMods(this.purchasedSet());
  }

  economyMods() {
    return aggregateMods(this.purchasedSet()).economy;
  }

  // -- Write API --

  awardGoo(amount: number): void {
    this.state.goo = Math.max(0, this.state.goo + Math.floor(amount));
    this.persist();
  }

  awardCores(amount: number): void {
    this.state.cores = Math.max(0, this.state.cores + Math.floor(amount));
    this.persist();
  }

  spend(currency: CurrencyId, amount: number): boolean {
    if (currency === 'goo' && this.state.goo >= amount) {
      this.state.goo -= amount;
      this.persist();
      return true;
    }
    if (currency === 'cores' && this.state.cores >= amount) {
      this.state.cores -= amount;
      this.persist();
      return true;
    }
    return false;
  }

  /** Try to purchase a node. Returns true on success. */
  tryPurchase(node: UpgradeNode): { ok: boolean; reason?: string } {
    if (this.hasPurchased(node.id)) {
      return { ok: false, reason: 'Already purchased.' };
    }
    const purchased = this.purchasedSet();
    if (!node.prerequisites.every((id) => purchased.has(id))) {
      return { ok: false, reason: 'Prerequisites not met.' };
    }
    if (!this.spend(node.currency, node.cost)) {
      return { ok: false, reason: `Not enough ${node.currency}.` };
    }
    this.state.purchased.push(node.id);
    this.persist();
    return { ok: true };
  }

  recordClear(levelId: string): void {
    this.state.clears[levelId] = (this.state.clears[levelId] ?? 0) + 1;
    this.persist();
  }

  markIntroSeen(): void {
    this.state.hasSeenIntro = true;
    this.persist();
  }

  setBestRun(levelId: string, leaks: number, bonusObjective: boolean): void {
    if (!this.state.best) {
      this.state.best = {};
    }
    const existing = this.state.best[levelId];
    if (!existing || leaks < existing.leaks || (leaks === existing.leaks && bonusObjective && !existing.bonusObjective)) {
      this.state.best[levelId] = { leaks, bonusObjective };
      this.persist();
    }
  }

  bestForLevel(levelId: string): { leaks: number; bonusObjective: boolean } | undefined {
    return this.state.best?.[levelId];
  }
}
