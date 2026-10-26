import { describe, it, expect } from 'vitest';
import { BODIES, BODY } from '../../src/shared/data/solar.ts';
import { BODY_TEXT } from '../../src/shared/data/solar-text.ts';
import { SOLAR_FEATURES } from '../../src/shared/data/solar-features.ts';
import { WIKI } from '../../src/shared/data/wiki.ts';
import { daysJ2000, displayMoonDist, displayOrbit, displayRadius, keplerPosition, relativePosition, subSolarLon } from '../../src/shared/lib/orbits.ts';
import { hasKey } from '../../src/client/lib/i18n.ts';

const lonOf = (v: number[]) => ((Math.atan2(v[1], v[0]) * 180) / Math.PI + 360) % 360;
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const r = (v: number[]) => Math.hypot(v[0], v[1], v[2]);

describe('solar orbits', () => {
  it('puts the planets where JPL has them at J2000', () => {
    const earth = keplerPosition(BODY.earth.kepler!, 0);
    expect(angDiff(lonOf(earth), 100.4)).toBeLessThan(0.5);
    expect(r(earth)).toBeCloseTo(0.983, 2);
    expect(r(relativePosition('mars', 0))).toBeCloseTo(1.391, 1);
    expect(r(relativePosition('jupiter', 0))).toBeCloseTo(4.965, 1);
  });

  it('gets the Moon phase right (full and new moon, January 2024)', () => {
    const full = daysJ2000(Date.UTC(2024, 0, 25, 17, 54)), nw = daysJ2000(Date.UTC(2024, 0, 11, 11, 57));
    // Full moon: Moon opposite the Sun as seen from Earth = same direction as Earth seen from the Sun.
    expect(angDiff(lonOf(relativePosition('moon', full)), lonOf(relativePosition('earth', full)))).toBeLessThan(5);
    expect(angDiff(lonOf(relativePosition('moon', nw)), lonOf(relativePosition('earth', nw)) + 180)).toBeLessThan(5);
    expect(r(relativePosition('moon', full))).toBeGreaterThan(356_000);
    expect(r(relativePosition('moon', full))).toBeLessThan(407_000);
  });

  it('has the sun over Greenwich around noon UTC', () => {
    expect(Math.abs(subSolarLon(Date.UTC(2024, 2, 20, 12)))).toBeLessThan(4);
    expect(Math.abs(subSolarLon(Date.UTC(2024, 2, 20, 18)) + 90)).toBeLessThan(4);
  });

  it('keeps display scales ordered: orbits by distance, moons outside their planet and in order', () => {
    const planets = BODIES.filter(b => b.kepler).sort((a, b) => a.kepler!.a[0] - b.kepler!.a[0]);
    for (let i = 1; i < planets.length; i++) expect(displayOrbit(planets[i].kepler!.a[0])).toBeGreaterThan(displayOrbit(planets[i - 1].kepler!.a[0]));
    expect(displayRadius('sun')).toBeLessThan(displayOrbit(BODY.mercury.kepler!.a[0]) * 0.5);
    for (const m of BODIES.filter(b => b.moon)) expect(displayMoonDist(m.id)).toBeGreaterThan(displayRadius(m.parent!) * 1.5);
    const jov = (['io', 'europa', 'ganymede', 'callisto'] as const).map(displayMoonDist);
    expect([...jov].sort((a, b) => a - b)).toEqual(jov);
  });
});

describe('solar content', () => {
  it('describes every body in both languages, with a Wikipedia article', () => {
    for (const b of BODIES) {
      const tx = BODY_TEXT[b.id];
      expect(tx?.desc.en && tx.desc.zh && tx.funFact.en && tx.funFact.zh, b.id).toBeTruthy();
      expect(b.name.en && b.name.zh, b.id).toBeTruthy();
      expect(WIKI['sb_' + b.id], b.id).toBeTruthy();
    }
  });

  it('has valid, unique surface features with text and articles', () => {
    const keys = new Set<string>();
    for (const f of SOLAR_FEATURES) {
      expect(keys.has(f.key), f.key).toBe(false);
      keys.add(f.key);
      expect(f.key.startsWith(`sf_${f.body}_`), f.key).toBe(true);
      expect(BODY[f.body], f.key).toBeTruthy();
      expect(Math.abs(f.lat) <= 90 && Math.abs(f.lon) <= 180, f.key).toBe(true);
      expect(f.name.en && f.name.zh && f.desc.en && f.desc.zh && f.wiki, f.key).toBeTruthy();
      expect(WIKI[f.key], f.key).toBeTruthy();
      expect(hasKey('fk_' + f.kind, 'en') && hasKey('fk_' + f.kind, 'zh'), f.kind).toBe(true);
    }
    expect(SOLAR_FEATURES.filter(f => f.body === 'moon').length).toBeGreaterThanOrEqual(12);
    expect(SOLAR_FEATURES.filter(f => f.body === 'mars').length).toBeGreaterThanOrEqual(12);
  });
});

describe('orbiter label occlusion', () => {
  it('hides a craft only while the world covers it, including orbits at exactly 1.6 R', async () => {
    const { Vector3 } = await import('three');
    const { behindWorld } = await import('../../src/client/solar/sites.ts');
    const o = new Vector3(), cam = new Vector3(0, 0, 10), R = 1;
    for (let i = 0; i < 50; i++) {
      // directly behind the planet on a 1.6 R orbit: always hidden, never a coin-flip
      const a = Math.PI + (i - 25) * 0.004;
      expect(behindWorld(new Vector3(Math.sin(a) * 1.6, 0, Math.cos(a) * 1.6), cam, o, R)).toBe(true);
    }
    expect(behindWorld(new Vector3(0, 0, 1.6), cam, o, R)).toBe(false);
    expect(behindWorld(new Vector3(1.6, 0, -0.2), cam, o, R)).toBe(false);
  });
});

describe('distance meter', () => {
  it('measures true centre-to-centre distances', async () => {
    const { distanceKm, helioKm, AU_KM } = await import('../../src/shared/lib/orbits.ts');
    const d = daysJ2000(Date.UTC(2026, 0, 3));   // near perihelion
    expect(distanceKm('earth', 'sun', d) / AU_KM).toBeCloseTo(0.983, 2);
    const moon = distanceKm('earth', 'moon', d);
    expect(moon).toBeGreaterThan(356_000);
    expect(moon).toBeLessThan(407_000);
    expect(distanceKm('mars', 'earth', d)).toBeCloseTo(distanceKm('earth', 'mars', d), 3);
    // a moon sits next to its planet: Io's distance from Jupiter is its orbit radius
    expect(distanceKm('io', 'jupiter', d)).toBeCloseTo(BODY.io.moon!.aKm, 0);
    expect(r(helioKm('sun', d))).toBe(0);
    // Earth–Mars always lies between its closest and widest values
    for (let y = 0; y < 3; y += 0.1) {
      const km = distanceKm('earth', 'mars', d + y * 365.25);
      expect(km).toBeGreaterThan(54e6);
      expect(km).toBeLessThan(402e6);
    }
  });
});
