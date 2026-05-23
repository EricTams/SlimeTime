import { describe, expect, it } from 'vitest';
import { ChargeSystem, buildRuntimeState, defaultToolMods, type ToolDefinition } from './chargeSystem';

const TOOL: ToolDefinition = {
  id: 'pinpricker',
  category: 'structure',
  label: 'Pinpricker',
  baseChargeTime: 4,
  baseMaxCharges: 3,
  baseStats: { damage: 4, range: 200, rate: 1.2 },
  unlockCurrency: 'cores',
  unlockCost: 1,
  description: 'Cheap, fast, single-target raycast.',
};

const ABILITY_TOOL: ToolDefinition = {
  id: 'poke',
  category: 'ability',
  label: 'Poke',
  baseChargeTime: 4,
  baseMaxCharges: 2,
  baseStats: { damage: 10, radius: 14 },
  unlockCurrency: 'cores',
  unlockCost: 1,
  description: 'Starter ability.',
};

describe('ChargeSystem', () => {
  it('starts structures with charges full when unlocked', () => {
    const system = new ChargeSystem();
    system.registerTool(buildRuntimeState(TOOL, defaultToolMods(), true));
    expect(system.canSpend('pinpricker')).toBe(true);
    expect(system.tools.get('pinpricker')?.charges).toBe(TOOL.baseMaxCharges);
  });

  it('starts abilities with zero charges even when unlocked', () => {
    const system = new ChargeSystem();
    system.registerTool(buildRuntimeState(ABILITY_TOOL, defaultToolMods(), true));
    expect(system.canSpend('poke')).toBe(false);
    expect(system.tools.get('poke')?.charges).toBe(0);
    // After one full chargeTime, exactly one charge should be available.
    system.tick(ABILITY_TOOL.baseChargeTime);
    expect(system.tools.get('poke')?.charges).toBe(1);
  });

  it('refills a single charge after one chargeTime', () => {
    const system = new ChargeSystem();
    system.registerTool(buildRuntimeState(TOOL, defaultToolMods(), true));
    for (let i = 0; i < TOOL.baseMaxCharges; i += 1) {
      system.spend('pinpricker');
    }
    expect(system.canSpend('pinpricker')).toBe(false);
    system.tick(TOOL.baseChargeTime);
    expect(system.tools.get('pinpricker')?.charges).toBe(1);
  });

  it('clamps to maxCharges and resets progress when full', () => {
    const system = new ChargeSystem();
    system.registerTool(buildRuntimeState(TOOL, { ...defaultToolMods(), maxChargesAdded: 0 }, true));
    system.tick(20);
    expect(system.tools.get('pinpricker')?.charges).toBe(3);
    expect(system.tools.get('pinpricker')?.chargeProgress).toBe(0);
  });

  it('grants kill momentum to under-capped tools', () => {
    const system = new ChargeSystem();
    system.registerTool(buildRuntimeState(TOOL, defaultToolMods(), true));
    system.spend('pinpricker');
    system.applyKillMomentum(5);
    const charges = system.tools.get('pinpricker')?.charges ?? 0;
    expect(charges).toBeGreaterThan(0);
    expect(charges).toBeLessThanOrEqual(3);
  });

  it('refunds half a charge on recall by default', () => {
    const system = new ChargeSystem();
    system.registerTool(buildRuntimeState(TOOL, defaultToolMods(), true));
    for (let i = 0; i < TOOL.baseMaxCharges; i += 1) {
      system.spend('pinpricker');
    }
    system.refundFraction('pinpricker');
    expect(system.tools.get('pinpricker')?.charges).toBeCloseTo(0.5);
  });

  it('refuses to spend a locked tool', () => {
    const system = new ChargeSystem();
    system.registerTool(buildRuntimeState(TOOL, defaultToolMods(), false));
    expect(system.canSpend('pinpricker')).toBe(false);
    expect(system.spend('pinpricker')).toBe(false);
  });

  it('scales charge time with chargeTimeMultiplier', () => {
    const system = new ChargeSystem();
    system.registerTool(buildRuntimeState(TOOL, { ...defaultToolMods(), chargeTimeMultiplier: 0.5 }, true));
    expect(system.tools.get('pinpricker')?.chargeTime).toBe(2);
  });

  it('applies stat overrides', () => {
    const system = new ChargeSystem();
    system.registerTool(
      buildRuntimeState(TOOL, { ...defaultToolMods(), damageMultiplier: 2, statOverrides: { range: 320 } }, true),
    );
    expect(system.tools.get('pinpricker')?.stats.damage).toBe(8);
    expect(system.tools.get('pinpricker')?.stats.range).toBe(320);
  });
});
