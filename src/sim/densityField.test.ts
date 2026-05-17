import { describe, expect, it } from 'vitest';
import { createOpenFixtureMaze, fixtureUnit } from '../../test/fixtures/simpleMaze';
import { DensityField } from './densityField';

describe('DensityField', () => {
  it('double-buffers density so reads do not change until commit', () => {
    const maze = createOpenFixtureMaze();
    const density = new DensityField(maze);
    const units = [fixtureUnit(1, 25, 25), fixtureUnit(2, 26, 25)];

    density.updateFromUnits(units);

    expect(density.densityAtWorld({ x: 25, y: 25 })).toBe(0);

    density.commit();

    expect(density.densityAtWorld({ x: 25, y: 25 })).toBeGreaterThan(0);
  });

  it('points escape gradients away from crowded neighbors', () => {
    const maze = createOpenFixtureMaze();
    const density = new DensityField(maze);
    density.updateFromUnits([
      fixtureUnit(1, 15, 25),
      fixtureUnit(2, 15, 25),
      fixtureUnit(3, 15, 25),
    ]);
    density.commit();

    expect(density.escapeGradientAtWorld({ x: 25, y: 25 }).x).toBeGreaterThan(0);
  });
});
