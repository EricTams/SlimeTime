import { describe, expect, it } from 'vitest';
import { fixtureUnit } from '../../test/fixtures/simpleMaze';
import { SpatialHash } from './spatialHash';

describe('SpatialHash', () => {
  it('matches brute force circle query results', () => {
    const units = [
      fixtureUnit(1, 10, 10),
      fixtureUnit(2, 14, 10),
      fixtureUnit(3, 40, 40),
    ];
    const hash = new SpatialHash(8);
    hash.rebuild(units);

    const result = hash.queryCircle({ x: 10, y: 10 }, 5).map((unit) => unit.id);
    const bruteForce = units
      .filter((unit) => Math.hypot(unit.position.x - 10, unit.position.y - 10) <= 5 + unit.radius)
      .map((unit) => unit.id);

    expect(result.sort()).toEqual(bruteForce.sort());
  });

  it('includes large units that overlap a circle even when their centers are outside it', () => {
    const overlapping = fixtureUnit(1, 16, 0);
    overlapping.radius = 12;
    const outside = fixtureUnit(2, 30, 0);
    outside.radius = 2;
    const hash = new SpatialHash(8);
    hash.rebuild([overlapping, outside]);

    expect(hash.queryCircle({ x: 0, y: 0 }, 5).map((unit) => unit.id)).toEqual([1]);
  });

  it('returns the closest unit hit by a ray', () => {
    const near = fixtureUnit(1, 20, 10);
    const far = fixtureUnit(2, 35, 10);
    const hash = new SpatialHash(8);
    hash.rebuild([far, near]);

    expect(hash.raycast({ x: 5, y: 10 }, { x: 1, y: 0 }, 50)?.id).toBe(1);
  });

  it('uses separation candidates from the full narrowphase interaction distance', () => {
    const unit = fixtureUnit(1, 20, 0);
    unit.radius = 10;
    const other = fixtureUnit(2, 0, 0);
    other.radius = 10;
    const hash = new SpatialHash(8);
    hash.rebuild([unit, other]);

    expect(hash.separationFor(unit, 13.5).x).toBeGreaterThan(0);
  });

  it('ramps separation to zero at the outer interaction distance', () => {
    const unit = fixtureUnit(1, 40, 0);
    unit.radius = 10;
    const other = fixtureUnit(2, 0, 0);
    other.radius = 10;
    const hash = new SpatialHash(8);
    hash.rebuild([unit, other]);

    expect(hash.separationFor(unit, 13.5)).toEqual({ x: 0, y: 0 });

    unit.position.x = 30;
    hash.rebuild([unit, other]);

    expect(hash.separationFor(unit, 13.5).x).toBeGreaterThan(0);
  });
});
