import type { RenderSnapshot, SlimeUnit, Vector2 } from '../sim/types';

export function countLiveUnits(snapshot: RenderSnapshot): number {
  return snapshot.units.length;
}

export function toRenderUnitIds(snapshot: RenderSnapshot): number[] {
  return snapshot.units.map((unit) => unit.id);
}

export function createUnitRenderData(
  units: readonly SlimeUnit[],
  time: number,
  crowdingAt: (unit: SlimeUnit) => number = () => 0,
  pathDirectionAt: (unit: SlimeUnit) => Vector2 = () => ({ x: 0, y: 0 }),
): RenderSnapshot['units'] {
  return units
    .filter((unit) => unit.alive)
    .map((unit) => ({
      id: unit.id,
      x: unit.position.x,
      y: unit.position.y,
      radius: unit.radius,
      color: unit.color,
      pathDirection: pathDirectionAt(unit),
      crowding: crowdingAt(unit),
      hitFlash: Math.max(0, 1 - (time - unit.lastDamagedAt) / 0.25),
      archetype: unit.archetype,
    }));
}
