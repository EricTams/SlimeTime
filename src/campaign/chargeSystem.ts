import { PAYOUT_TUNING } from './economy';

export type ToolCategory = 'structure' | 'ability';

export interface ToolDefinition {
  /** Unique identifier shared between hub, run, and persistence. */
  id: string;
  category: ToolCategory;
  label: string;
  baseChargeTime: number;
  baseMaxCharges: number;
  /** Tool-specific tunables (damage, range, radius, etc.) */
  baseStats: Record<string, number>;
  /** Currency type for the unlock node. */
  unlockCurrency: 'goo' | 'cores';
  /** Cost of the unlock node. */
  unlockCost: number;
  /** Brief blurb shown in the hub. */
  description: string;
}

export interface ToolStats {
  damage?: number;
  range?: number;
  radius?: number;
  rate?: number;
  duration?: number;
  width?: number;
  /** Generic catch-all for tool-specific knobs. */
  [key: string]: number | undefined;
}

export interface ToolUpgradeMods {
  chargeTimeMultiplier?: number;
  maxChargesAdded?: number;
  startingChargesAdded?: number;
  damageMultiplier?: number;
  rangeMultiplier?: number;
  radiusMultiplier?: number;
  rateMultiplier?: number;
  durationMultiplier?: number;
  /** Bonus to charge gained per kill (additive). 0 => no kill momentum. */
  killMomentumPerKill?: number;
  /** Multiplier applied to spend cost (used for "free first deploy" style perks; default 1). */
  spendCostMultiplier?: number;
  /** Tool-specific additive stat bonuses applied after multipliers. */
  statAdditions?: Record<string, number>;
  /** Tool-specific override map. Each entry overwrites the corresponding base stat. */
  statOverrides?: Record<string, number>;
}

export interface ToolRuntimeState {
  toolId: string;
  charges: number;
  chargeProgress: number;
  chargeTime: number;
  maxCharges: number;
  killMomentumPerKill: number;
  spendCostMultiplier: number;
  stats: ToolStats;
  unlocked: boolean;
}

export const DEFAULT_KILL_MOMENTUM = 0.04;
export const SELL_REFUND_FRACTION = PAYOUT_TUNING.sellRefundFraction;

export function defaultToolMods(): ToolUpgradeMods {
  return {
    chargeTimeMultiplier: 1,
    maxChargesAdded: 0,
    damageMultiplier: 1,
    rangeMultiplier: 1,
    radiusMultiplier: 1,
    rateMultiplier: 1,
    durationMultiplier: 1,
    killMomentumPerKill: DEFAULT_KILL_MOMENTUM,
    spendCostMultiplier: 1,
    statAdditions: {},
    statOverrides: {},
  };
}

export function buildRuntimeState(definition: ToolDefinition, mods: ToolUpgradeMods, unlocked: boolean): ToolRuntimeState {
  const overrides = mods.statOverrides ?? {};
  const additions = mods.statAdditions ?? {};
  const stats: ToolStats = {};
  for (const [key, baseValue] of Object.entries(definition.baseStats)) {
    let value = baseValue;
    if (key === 'damage' && mods.damageMultiplier !== undefined) {
      value *= mods.damageMultiplier;
    }
    if (key === 'range' && mods.rangeMultiplier !== undefined) {
      value *= mods.rangeMultiplier;
    }
    if (key === 'radius' && mods.radiusMultiplier !== undefined) {
      value *= mods.radiusMultiplier;
    }
    if (key === 'duration' && mods.durationMultiplier !== undefined) {
      value *= mods.durationMultiplier;
    }
    if (key === 'rate' && mods.rateMultiplier !== undefined) {
      value *= mods.rateMultiplier;
    }
    if (additions[key] !== undefined) {
      value += additions[key];
    }
    if (overrides[key] !== undefined) {
      value = overrides[key];
    }
    stats[key] = value;
  }
  for (const [key, addition] of Object.entries(additions)) {
    if (stats[key] === undefined) {
      stats[key] = addition;
    }
  }
  for (const [key, override] of Object.entries(overrides)) {
    if (stats[key] === undefined) {
      stats[key] = override;
    }
  }
  const maxCharges = definition.baseMaxCharges + (mods.maxChargesAdded ?? 0);
  // Structures start a run with their charge bank full so the player can
  // immediately deploy defenses, but abilities start empty: charging from
  // scratch is part of the cost of using one mid-run.
  const baseStartingCharges = definition.category === 'ability' ? 0 : maxCharges;
  const startingCharges = unlocked ? Math.min(maxCharges, baseStartingCharges + (mods.startingChargesAdded ?? 0)) : 0;
  return {
    toolId: definition.id,
    charges: startingCharges,
    chargeProgress: 0,
    chargeTime: definition.baseChargeTime * (mods.chargeTimeMultiplier ?? 1),
    maxCharges,
    killMomentumPerKill: mods.killMomentumPerKill ?? DEFAULT_KILL_MOMENTUM,
    spendCostMultiplier: mods.spendCostMultiplier ?? 1,
    stats,
    unlocked,
  };
}

export class ChargeSystem {
  readonly tools = new Map<string, ToolRuntimeState>();
  private globalChargeMultiplier = 1;

  registerTool(state: ToolRuntimeState): void {
    this.tools.set(state.toolId, state);
  }

  setGlobalChargeMultiplier(value: number): void {
    this.globalChargeMultiplier = Math.max(0.0001, value);
  }

  tick(dt: number): void {
    for (const tool of this.tools.values()) {
      if (!tool.unlocked || tool.charges >= tool.maxCharges || tool.chargeTime <= 0) {
        continue;
      }
      tool.chargeProgress += dt * this.globalChargeMultiplier;
      while (tool.chargeProgress >= tool.chargeTime && tool.charges < tool.maxCharges) {
        tool.chargeProgress -= tool.chargeTime;
        tool.charges += 1;
      }
      if (tool.charges >= tool.maxCharges) {
        tool.chargeProgress = 0;
      }
    }
  }

  /** Returns true if the tool was successfully spent. */
  spend(toolId: string): boolean {
    const tool = this.tools.get(toolId);
    if (!tool || !tool.unlocked) {
      return false;
    }
    const cost = Math.max(0.0001, tool.spendCostMultiplier);
    if (tool.charges < cost) {
      return false;
    }
    tool.charges -= cost;
    return true;
  }

  canSpend(toolId: string): boolean {
    const tool = this.tools.get(toolId);
    if (!tool || !tool.unlocked) {
      return false;
    }
    return tool.charges >= tool.spendCostMultiplier;
  }

  /** Refund part of a charge to a tool when a structure is sold (recall refund). */
  refundFraction(toolId: string, fraction: number = SELL_REFUND_FRACTION): void {
    const tool = this.tools.get(toolId);
    if (!tool || !tool.unlocked) {
      return;
    }
    const refund = Math.max(0, Math.min(1, fraction));
    tool.charges = Math.min(tool.maxCharges, tool.charges + refund);
  }

  /** Distribute a per-kill charge bonus to all tools, scaled by `multiplier`. */
  applyKillMomentum(multiplier: number = 1): void {
    for (const tool of this.tools.values()) {
      if (!tool.unlocked || tool.charges >= tool.maxCharges || tool.killMomentumPerKill <= 0) {
        continue;
      }
      tool.charges = Math.min(tool.maxCharges, tool.charges + tool.killMomentumPerKill * multiplier);
    }
  }
}
