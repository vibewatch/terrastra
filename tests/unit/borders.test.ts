import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Topology } from 'topojson-specification';
import { borderPositions, countryAt, outlinePositions } from '../../src/client/globe/borders.ts';
import { loadCountries } from '../../src/client/globe/painter.ts';
import { vecToLatLon } from '../../src/shared/lib/geo.ts';

const topo = (res: string) => JSON.parse(readFileSync(`public/data/countries-${res}.json`, 'utf8')) as Topology;
const t110 = topo('110m'), t50 = topo('50m');
const c110 = loadCountries(t110), c50 = loadCountries(t50);

describe('country borders', () => {
  it('draws land borders only (no coastlines) in short steps that stay above the surface', () => {
    const p = borderPositions(t110);
    expect(p.length % 6).toBe(0);
    let maxStep = 0;
    for (let i = 0; i < p.length; i += 6) {
      const [la, lo] = vecToLatLon(p[i], p[i + 1], p[i + 2]);
      // Australia and Iceland have no land borders, so no border vertex lies on them
      expect(la > -39 && la < -12 && lo > 114 && lo < 153).toBe(false);
      expect(la > 63.5 && la < 66.5 && lo > -24 && lo < -13.5).toBe(false);
      const dot = (p[i] * p[i + 3] + p[i + 1] * p[i + 4] + p[i + 2] * p[i + 5]) / 1.0015 ** 2;
      maxStep = Math.max(maxStep, Math.acos(Math.min(1, dot)) * 180 / Math.PI);
    }
    expect(maxStep).toBeLessThan(1.5);
    expect(borderPositions(t110)).toBe(p);
  });

  it('outlines a whole country, coast included', () => {
    const is = c110.find(c => c.a2 === 'IS')!;
    expect(outlinePositions(is.feature).length).toBeGreaterThan(60);
  });

  it('finds the country under a point, enclaves and small states included', () => {
    expect(countryAt(c110, 48.86, 2.35)?.a2).toBe('FR');
    expect(countryAt(c110, -29.31, 27.48)?.a2).toBe('LS');
    expect(countryAt(c110, 39.9, 116.4)?.a2).toBe('CN');
    expect(countryAt(c110, 0, -30)).toBeNull();
    expect(countryAt(c50, 1.35, 103.82)?.a2).toBe('SG');
    expect(countryAt(c50, 41.902, 12.435)?.a2).toBe('VA');
    expect(countryAt(c50, 43.94, 12.45)?.a2).toBe('SM');
  });

  it('knows the alpha-2 code of every 1:50m country except unnamed fragments', () => {
    expect(c50.filter(c => !c.a2).map(c => c.name).sort()).toEqual(['Indian Ocean Ter.', 'Siachen Glacier']);
  });
});
