import { describe, expect, it } from 'vitest';
import { fixtureUnit } from '../../test/fixtures/simpleMaze';
import { countLiveUnits, createUnitRenderData, toRenderUnitIds } from './renderSnapshot';

describe('render snapshot helpers', () => {
  it('filters dead units from render data', () => {
    const live = fixtureUnit(1, 10, 10);
    const dead = fixtureUnit(2, 12, 10);
    dead.alive = false;

    const units = createUnitRenderData([live, dead], 0);

    expect(units).toHaveLength(1);
    expect(units[0].id).toBe(1);
  });

  it('includes a path direction for each render unit', () => {
    const unit = fixtureUnit(1, 10, 10);

    const units = createUnitRenderData([unit], 0, () => 0, () => ({ x: 1, y: 0 }));

    expect(units[0].pathDirection).toEqual({ x: 1, y: 0 });
  });

  it('counts and lists render unit ids', () => {
    const snapshot = {
      units: createUnitRenderData([fixtureUnit(1, 10, 10), fixtureUnit(2, 20, 10)], 0),
      gooSplats: [],
      mazeSolvingField: [],
      tooCrowdedField: [],
      walls: new Uint8Array(),
      entrance: { x: 1, y: 1 },
      exit: { x: 4, y: 3 },
      mazeWidth: 0,
      mazeHeight: 0,
      tileSize: 0,
      time: 0,
      exitedCount: 0,
    };

    expect(countLiveUnits(snapshot)).toBe(2);
    expect(toRenderUnitIds(snapshot)).toEqual([1, 2]);
  });
});
