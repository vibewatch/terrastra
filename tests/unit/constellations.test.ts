import { describe, it, expect } from 'vitest';
import { CONSTELLATIONS } from '../../src/shared/data/constellations.ts';

const D2R = Math.PI / 180;
const sep = (a: number[], b: number[]) => Math.acos(Math.min(1, Math.sin(a[1] * D2R) * Math.sin(b[1] * D2R) + Math.cos(a[1] * D2R) * Math.cos(b[1] * D2R) * Math.cos((a[0] - b[0]) * D2R))) / D2R;
const ZODIAC = ['ari', 'tau', 'gem', 'cnc', 'leo', 'vir', 'lib', 'sco', 'sgr', 'cap', 'aqr', 'psc'];
const OTHERS = ['ori', 'uma', 'umi', 'cas', 'cyg', 'lyr', 'aql', 'cma', 'cmi', 'per', 'and', 'peg', 'boo', 'aur', 'cru', 'cen', 'car', 'crb', 'her', 'dra', 'cep', 'lup', 'eri', 'crv', 'hya', 'oph'];

describe('constellations data', () => {
  it('has all 88 IAU constellations with unique ids, including the zodiac and the classic figures', () => {
    const ids = CONSTELLATIONS.map((c) => c.id);
    expect(ids.length).toBe(88);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [...ZODIAC, ...OTHERS]) expect(ids).toContain(id);
  });

  it('has valid names, coordinates and line indices', () => {
    for (const c of CONSTELLATIONS) {
      expect(c.name.en.trim(), c.id).not.toBe('');
      expect(c.name.zh.trim(), c.id).not.toBe('');
      expect(c.lines.length, c.id).toBeGreaterThan(0);
      for (const [ra, dec, mag] of c.stars) {
        expect(ra >= 0 && ra < 360, `${c.id} ra ${ra}`).toBe(true);
        expect(dec >= -90 && dec <= 90, `${c.id} dec ${dec}`).toBe(true);
        expect(mag > -2 && mag < 7, `${c.id} mag ${mag}`).toBe(true);
      }
      for (const [i, j] of c.lines) {
        for (const k of [i, j]) expect(Number.isInteger(k) && k >= 0 && k < c.stars.length, `${c.id} line ${i}-${j}`).toBe(true);
        expect(i, c.id).not.toBe(j);
      }
      for (const [k, n] of Object.entries(c.named ?? {})) {
        expect(Number(k) < c.stars.length && n.en !== '' && n.zh !== '', `${c.id} named ${k}`).toBe(true);
      }
    }
  });

  it('keeps every figure compact (catches RA given in hours)', () => {
    for (const c of CONSTELLATIONS) {
      for (const a of c.stars) for (const b of c.stars) expect(sep(a, b), c.id).toBeLessThan(60);
    }
  });

  it('places the famous stars correctly', () => {
    const named = new Map(CONSTELLATIONS.flatMap((c) => Object.entries(c.named ?? {}).map(([k, n]) => [n.en, c.stars[Number(k)]] as const)));
    expect(named.size).toBeGreaterThanOrEqual(40);
    const expected: Record<string, [number, number, number]> = {
      Betelgeuse: [88.79, 7.41, 0.5], Rigel: [78.63, -8.2, 0.13], Polaris: [37.95, 89.26, 2.0], Sirius: [101.29, -16.72, -1.46], Vega: [279.23, 38.78, 0.03],
    };
    for (const [name, [ra, dec, mag]] of Object.entries(expected)) {
      const s = named.get(name)!;
      expect(s, name).toBeDefined();
      expect(sep(s, [ra, dec]), name).toBeLessThan(0.1);
      expect(Math.abs(s[2] - mag), name).toBeLessThan(0.15);
    }
    const ori = CONSTELLATIONS.find((c) => c.id === 'ori')!;
    const brightest = ori.stars.reduce((a, b) => (b[2] < a[2] ? b : a));
    expect(Math.min(sep(brightest, [88.79, 7.41]), sep(brightest, [78.63, -8.2]))).toBeLessThan(0.2);
  });
});
