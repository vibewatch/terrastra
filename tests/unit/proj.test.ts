import { describe, expect, it } from 'vitest';
import { EXTENT, MERC_MAX, PROJ_IDS, forward, inverse, wrapPi, xScale, yOf } from '../../src/client/map/proj.ts';

const D = Math.PI / 180;

describe('map projections', () => {
  it('inverse undoes forward everywhere on the map', () => {
    for (const p of PROJ_IDS) {
      for (let la = -84; la <= 84; la += 7) {
        for (let lo = -179; lo <= 179; lo += 23) {
          const [x, y] = forward(p, lo * D, la * D);
          const back = inverse(p, x, y);
          expect(back, `${p} ${la},${lo}`).not.toBeNull();
          expect(back![0] / D).toBeCloseTo(lo, 6);
          expect(back![1] / D).toBeCloseTo(la, 6);
        }
      }
    }
  });

  it('equal earth keeps its published 2.0546 aspect and is equal-area', () => {
    const [hw, hh] = EXTENT.equalearth;
    expect(hw / hh).toBeCloseTo(2.0546, 3);
    // area element (dx/dλ)(dy/dφ) ∝ cos φ
    const k = (phi: number) => (xScale('equalearth', phi) * (yOf('equalearth', phi + 1e-5) - yOf('equalearth', phi - 1e-5))) / 2e-5 / Math.cos(phi);
    for (const la of [0, 20, 45, 70, 85]) expect(k(la * D)).toBeCloseTo(k(0), 4);
  });

  it('keeps points outside the oval and beyond the poles off the map', () => {
    expect(inverse('equalearth', EXTENT.equalearth[0] * 0.99, EXTENT.equalearth[1] * 0.9)).toBeNull();
    for (const p of PROJ_IDS) expect(inverse(p, 0, EXTENT[p][1] * 1.01)).toBeNull();
  });

  it('cuts Mercator off at 85.05° where the map is square', () => {
    expect(MERC_MAX / D).toBeCloseTo(85.0511, 3);
    expect(yOf('mercator', MERC_MAX)).toBeCloseTo(Math.PI, 9);
    expect(yOf('mercator', Math.PI / 2)).toBeCloseTo(Math.PI, 9);
  });

  it('wraps longitudes into -π…π', () => {
    expect(wrapPi(3 * Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 12);
    expect(wrapPi(-7 * Math.PI / 4)).toBeCloseTo(Math.PI / 4, 12);
  });
});
