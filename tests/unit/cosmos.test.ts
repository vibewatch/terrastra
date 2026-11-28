import { describe, it, expect } from 'vitest';
import { radecToGal, galToRadec, angularSepDeg, fmtRadec, eclToGal, galToEcl, galVec } from '../../src/shared/lib/sky.ts';
import { DEEP_OBJECTS, MESSIER, SCALE_INFO, SCALES, hubbleFlowKms } from '../../src/shared/data/cosmos.ts';
import { messierGroup } from '../../src/shared/data/messier.ts';
import { SOLAR_SITES } from '../../src/shared/data/solar-sites.ts';
import { BODY } from '../../src/shared/data/solar.ts';
import { WIKI } from '../../src/shared/data/wiki.ts';
import { hasKey } from '../../src/client/lib/i18n.ts';
import { starClass, starTempK } from '../../src/shared/data/nearby-stars.ts';
import { LEVELS } from '../../src/client/solar/deep.ts';
import { fmtParsec } from '../../src/client/solar/fmt.ts';
import { CONSTELLATIONS } from '../../src/shared/data/constellations.ts';
import { constellationLatBand } from '../../src/client/solar/constellations.ts';

const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('sky frames', () => {
  it('converts RA/Dec to galactic coordinates', () => {
    const [l1, b1] = radecToGal(266.41683, -29.00781); // Sgr A*
    expect(angDiff(l1, 359.944)).toBeLessThan(0.05);
    expect(b1).toBeCloseTo(-0.046, 1);
    const [l2, b2] = radecToGal(10.6847, 41.2690); // M31
    expect(angDiff(l2, 121.17)).toBeLessThan(0.05);
    expect(b2).toBeCloseTo(-21.57, 1);
  });

  it('round-trips ecliptic ↔ galactic', () => {
    const v = galVec(77, -33);
    const back = eclToGal(galToEcl(v));
    for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(v[i], 9);
  });

  it('round-trips RA/Dec ↔ galactic and computes angular separation & sky format', () => {
    for (const [ra, dec] of [[266.4168, -29.0078], [83.8221, -5.3911], [10.6847, 41.269]] as const) {
      const [l, b] = radecToGal(ra, dec);
      const [ra2, dec2] = galToRadec(l, b);
      expect(angDiff(ra, ra2)).toBeLessThan(1e-6);
      expect(dec2).toBeCloseTo(dec, 6);
    }
    expect(angularSepDeg([1, 0, 0], [0, 1, 0])).toBeCloseTo(90, 9);
    expect(angularSepDeg([1, 0, 0], [-1, 0, 0])).toBeCloseTo(180, 9);
    expect(fmtRadec(83.8221, -5.3911)).toBe('05h 35m · −5.4°');
  });
});

describe('deep-space content', () => {
  it('has well-formed, unique objects on every deep scale', () => {
    const keys = new Set<string>();
    for (const o of DEEP_OBJECTS) {
      expect(o.key).toMatch(/^dp_[a-z0-9_]+$/);
      expect(keys.has(o.key), o.key).toBe(false);
      keys.add(o.key);
      expect(SCALES).toContain(o.scale);
      expect(o.l).toBeGreaterThanOrEqual(0); expect(o.l).toBeLessThan(360);
      expect(Math.abs(o.b)).toBeLessThanOrEqual(90);
      expect(o.distLy).toBeGreaterThan(0);
      expect(o.name.en && o.name.zh && o.desc.en && o.desc.zh && o.wiki, o.key).toBeTruthy();
      expect(hasKey('dk_' + o.kind, 'zh') && hasKey('dk_' + o.kind, 'en'), o.kind).toBe(true);
    }
    for (const s of ['galaxy', 'group', 'laniakea', 'universe'] as const) expect(DEEP_OBJECTS.filter(o => o.scale === s).length, s).toBeGreaterThanOrEqual(12);
    for (const s of SCALES) {
      expect(SCALE_INFO[s]?.name.zh, s).toBeTruthy();
      expect(hasKey('sc_' + s, 'zh') && hasKey('sc_' + s, 'en')).toBe(true);
    }
  });

  it('maps the nearest stars at their real distances', () => {
    const near = DEEP_OBJECTS.filter(o => o.scale === 'stars');
    expect(near.length).toBeGreaterThanOrEqual(30);
    for (const o of near) {
      expect(o.kind, o.key).toBe('star');
      expect(o.spec, o.key).toMatch(/^[OBAFGKMLTD]/);
      expect(o.distLy, o.key).toBeLessThan(LEVELS.stars.upLy / 4);
      expect(hasKey('stc_' + starClass(o.spec!), 'en') && hasKey('stc_' + starClass(o.spec!), 'zh'), o.key).toBe(true);
    }
    // the closest is Proxima Centauri, beside Alpha Centauri A/B
    const [first] = [...near].sort((a, b) => a.distLy - b.distLy);
    expect(first.key).toBe('dp_proxima_centauri');
    expect(starClass('M5.5V')).toBe('red_dwarf');
    expect(starClass('K1.5III')).toBe('giant');
    expect(starClass('F5IV')).toBe('white_star');
    expect(starClass('DZ8')).toBe('white_dwarf');
    expect(starTempK('G2V')).toBe(5800);
    expect(starTempK('A1V')!).toBeGreaterThan(9500);
    expect(starTempK('M5.5V')!).toBeLessThan(3200);
    expect(starTempK('DA2')).toBe(25200);
  });

  it('lists all 110 Messier objects, each once, on the scale its distance puts it', () => {
    expect(MESSIER.map(o => o.messier)).toEqual(Array.from({ length: 110 }, (_, i) => i + 1));
    const count = (g: string) => MESSIER.filter(o => messierGroup(o.kind) === g).length;
    expect(count('globular')).toBe(29);
    expect(count('galaxy')).toBe(40);
    for (const o of MESSIER) {
      const want = o.distLy < 1e5 ? 'galaxy' : o.distLy < 1e7 ? 'group' : 'laniakea';
      expect(o.scale, o.key).toBe(want);
    }
    // the generated ones land where the sky puts them: M2 (globular in Aquarius), M81 (Bode's Galaxy)
    const m = (n: number) => MESSIER[n - 1];
    expect(m(2).l).toBeCloseTo(53.4, 0);
    expect(m(2).b).toBeCloseTo(-35.8, 0);
    expect(m(81).l).toBeCloseTo(142.1, 0);
    expect(m(81).b).toBeCloseTo(40.9, 0);
    expect(m(42).key).toBe('dp_orion_nebula');
  });

  it('places Andromeda ~2.5 million light-years out', () => {
    const m31 = DEEP_OBJECTS.find(o => /m31|andromeda/.test(o.key))!;
    expect(m31.scale).toBe('group');
    expect(m31.distLy).toBeGreaterThan(2.3e6);
    expect(m31.distLy).toBeLessThan(2.7e6);
    expect(hubbleFlowKms(m31.distLy)).toBeNull(); // Local Group is gravitationally bound
    expect(hubbleFlowKms(53.8e6)!).toBeCloseTo(1150, -2); // Virgo Cluster ~1,150 km/s
    expect(fmtParsec(4.246, 'en')).toBe('1.3 pc');
    expect(fmtParsec(26_670, 'en')).toBe('8.18 kpc');
    expect(fmtParsec(53.8e6, 'en')).toBe('16.5 Mpc');

    const crux = CONSTELLATIONS.find(c => c.id === 'cru')!;
    const umi = CONSTELLATIONS.find(c => c.id === 'umi')!;
    const [cruS, cruN] = constellationLatBand(crux);
    const [umiS, umiN] = constellationLatBand(umi);
    expect(cruS).toBe(-90);
    expect(cruN).toBeGreaterThan(15);
    expect(cruN).toBeLessThan(30);
    expect(umiN).toBe(90);
    expect(umiS).toBeGreaterThanOrEqual(0);
  });

  it('computes stellar luminosity, habitable zones, exoplanet counts, cosmic redshift & angular span', async () => {
    const { starLuminositySun, habitableZoneAu } = await import('../../src/shared/data/nearby-stars.ts');
    const { cosmicRedshiftZ, deepAngularArcmin } = await import('../../src/shared/data/cosmos.ts');

    // Sun-twin G2V has ~1 L☉ and ~0.95–1.67 AU Kopparapu conservative habitable zone
    expect(starLuminositySun('G2V')).toBeCloseTo(1.0, 1);
    expect(habitableZoneAu('G2V')).toEqual([0.95, 1.67]);
    // Sirius A1V is ~20–25 L☉; TRAPPIST-1 M8V is ultra-dim (<0.001 L☉) with a tight <0.05 AU HZ
    expect(starLuminositySun('A1V')!).toBeGreaterThan(15);
    expect(starLuminositySun('M8V')!).toBeLessThan(0.001);
    expect(habitableZoneAu('M8V')![1]).toBeLessThan(0.05);
    expect(habitableZoneAu('DA2')).toBeNull();

    // Confirmed nearby exoplanet counts
    expect(DEEP_OBJECTS.find(o => o.key === 'dp_trappist_1')?.planets).toBe(7);
    expect(DEEP_OBJECTS.find(o => o.key === 'dp_proxima_centauri')?.planets).toBe(2);
    expect(DEEP_OBJECTS.find(o => o.key === 'dp_tau_ceti')?.planets).toBe(4);

    // Cosmological redshift z & angular diameter
    const m31 = DEEP_OBJECTS.find(o => o.key === 'dp_m31')!;
    expect(cosmicRedshiftZ(m31)).toBeNull(); // gravitationally bound
    // M31 spans ~3.4° (~206 arcmin, >6 Full Moons across!)
    expect(deepAngularArcmin(m31)!).toBeGreaterThan(180);
    expect(deepAngularArcmin(m31)!).toBeLessThan(240);

    const virgo = DEEP_OBJECTS.find(o => o.key === 'dp_virgo_cluster')!;
    expect(cosmicRedshiftZ(virgo)!).toBeCloseTo(0.0038, 3);
    const jades = DEEP_OBJECTS.find(o => o.key === 'dp_jades_gs_z14_0')!;
    expect(cosmicRedshiftZ(jades)).toBe(14.32);
    const cmb = DEEP_OBJECTS.find(o => o.key === 'dp_cmb')!;
    expect(cosmicRedshiftZ(cmb)).toBe(1089);
    expect(deepAngularArcmin(cmb)).toBeNull();
  });
});

describe('explorer sites', () => {
  it('are well-formed and sit on real worlds', () => {
    const keys = new Set<string>();
    for (const s of SOLAR_SITES) {
      expect(s.key).toMatch(/^ss_[a-z0-9_]+$/);
      expect(keys.has(s.key), s.key).toBe(false);
      keys.add(s.key);
      expect(BODY[s.body], s.key).toBeTruthy();
      expect(Math.abs(s.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(s.lon)).toBeLessThanOrEqual(180);
      expect(s.name.en && s.name.zh && s.desc.zh && s.wiki, s.key).toBeTruthy();
      expect(hasKey('sk_' + s.kind, 'zh') && hasKey('sk_' + s.kind, 'en'), s.kind).toBe(true);
      if (s.helio) expect(s.body).toBe('sun');
    }
    expect(SOLAR_SITES.filter(s => s.body === 'moon').length).toBeGreaterThanOrEqual(5);
    expect(SOLAR_SITES.filter(s => s.body === 'mars').length).toBeGreaterThanOrEqual(5);
  });

  it('have Wikipedia titles for the reader', () => {
    for (const k of [...SOLAR_SITES.map(s => s.key), ...DEEP_OBJECTS.map(o => o.key)]) expect(WIKI[k], k).toBeTruthy();
  });
});
