import { describe, it, expect } from 'vitest';
import {
  atmosphericExtinctionMag, deltaT, eclipsePath, findLunarEclipses, findSolarEclipses, gast, localSolar, lunarDanjonL, lunarSaros,
  moonEcef, moonGeo, moonPhase, planetDiskArcsec, planetGeo, skyEvents, solarSaros,
  sunEcef, sunGeo, topocentric, type GeoPoint, type SolarEclipse,
} from '../../src/shared/lib/astro/index.ts';
import { nearestConstellation } from '../../src/shared/lib/sky.ts';
import { SHOWERS } from '../../src/shared/data/showers.ts';

const D2R = Math.PI / 180;
/** UTC ms of a Terrestrial Time (TD) instant, using the engine's ΔT. */
const fromTD = (iso: string) => { const t = Date.parse(iso + 'Z'); return t - deltaT(t) * 1000; };
/** UTC ms of a JDE. */
const fromJDE = (jde: number) => { const t = (jde - 2440587.5) * 864e5; return t - deltaT(t) * 1000; };
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const MIN = 6e4;

describe('ephemerides (Meeus examples)', () => {
  it('reproduces the Moon of example 47.a (1992-04-12 0h TD)', () => {
    const m = moonGeo(fromJDE(2448724.5));
    expect(angDiff(m.lon, 133.167265)).toBeLessThan(1 / 3600);
    expect(m.lat).toBeCloseTo(-3.229126, 4);
    expect(m.distKm).toBeCloseTo(368409.7, 0);
    expect(angDiff(m.ra, 134.688470)).toBeLessThan(2 / 3600);
    expect(m.dec).toBeCloseTo(13.768368, 3);
  });

  it('reproduces the Sun of example 25.b (1992-10-13 0h TD) to ~1″', () => {
    const s = sunGeo(fromJDE(2448908.5));
    expect(angDiff(s.lon, 199.905989)).toBeLessThan(1 / 3600);
    expect(angDiff(s.ra, 198.378178)).toBeLessThan(2 / 3600);
    expect(Math.abs(s.dec + 7.783871)).toBeLessThan(2 / 3600);
    expect(s.distKm / 149_597_870.7).toBeCloseTo(0.99760853, 5);
  });

  it('keeps ΔT near the observed ~69–72 s in the 2020s', () => {
    for (const y of [2020, 2024, 2026, 2029]) {
      const dt = deltaT(Date.UTC(y, 0, 1));
      expect(dt).toBeGreaterThan(68.5);
      expect(dt).toBeLessThan(72.5);
    }
  });

  it('gives sensible topocentric Sun, Earth-fixed vectors and Moon phases', () => {
    const t = Date.UTC(2026, 5, 21, 12, 2), g: GeoPoint = { lat: 51.4769, lon: 0 };
    const s = topocentric(t, g);
    expect(s.sun.alt).toBeCloseTo(90 - 51.4769 + 23.436, 1);
    expect(angDiff(s.sun.az, 180)).toBeLessThan(1.5);
    // Sub-solar point from the Earth-fixed vector: latitude = declination, longitude = −(hour angle at Greenwich).
    const v = sunEcef(t), sun = sunGeo(t);
    expect(Math.asin(v[2] / Math.hypot(...v)) / D2R).toBeCloseTo(sun.dec, 6);
    expect(angDiff(Math.atan2(v[1], v[0]) / D2R, sun.ra - gast(t))).toBeLessThan(1e-6);
    expect(Math.hypot(...moonEcef(t))).toBeCloseTo(moonGeo(t).distKm, 3);
    const full = moonPhase(Date.UTC(2026, 2, 3, 11, 38)), fresh = moonPhase(Date.UTC(2026, 7, 13, 17, 37));
    expect(full.illumination).toBeGreaterThan(0.999);
    expect(fresh.waxing).toBe(true);
    expect(fresh.ageDays).toBeCloseTo(1, 1);
  });

  it('puts the planets in the right place', () => {
    // Mars at opposition (in longitude) 2027-02-19; Venus greatest eastern elongation 2026-08-15 (45.9°).
    const t = Date.UTC(2027, 1, 19, 16), mars = planetGeo('mars', t);
    expect(angDiff(mars.lon, sunGeo(t).lon + 180)).toBeLessThan(0.5);
    expect(mars.distAu).toBeCloseTo(0.678, 2);
    expect(planetGeo('venus', Date.UTC(2026, 7, 15, 6)).elong).toBeCloseTo(45.9, 0);
  });
});

/** NASA Five Millennium Canon (Espenak & Meeus): greatest eclipse (TD), gamma, magnitude, point, central duration. */
const SOLAR: [string, SolarEclipse['type'], string, number, number, number, number, number?][] = [
  ['2023-04-20', 'hybrid', '2023-04-20T04:17:56', -0.3952, 1.0132, -9.6, 125.8, 76],
  ['2024-04-08', 'total', '2024-04-08T18:18:29', 0.3431, 1.0566, 25.3, -104.1, 268],
  ['2025-03-29', 'partial', '2025-03-29T10:48:36', 1.0405, 0.9376, 61.1, -77.1],
  ['2026-02-17', 'annular', '2026-02-17T12:13:06', -0.9743, 0.963, -64.7, 86.8, 140],
  ['2026-08-12', 'total', '2026-08-12T17:47:06', 0.8977, 1.0386, 65.2, -25.2, 138],
  ['2027-08-02', 'total', '2027-08-02T10:07:50', 0.1421, 1.079, 25.5, 33.2, 383],
  ['2028-07-22', 'total', '2028-07-22T02:56:40', -0.6056, 1.056, -15.6, 126.7, 310],
];

describe('solar eclipses', () => {
  const all = findSolarEclipses(Date.UTC(2023, 0, 1), Date.UTC(2028, 11, 31, 23));
  const byDay = (d: string) => all.find((e) => day(e.t) === d)!;

  it('finds exactly the NASA list for 2024–2028', () => {
    const got = all.filter((e) => e.t >= Date.UTC(2024, 0, 1)).map((e) => `${day(e.t)} ${e.type}`);
    expect(got).toEqual([
      '2024-04-08 total', '2024-10-02 annular', '2025-03-29 partial', '2025-09-21 partial', '2026-02-17 annular',
      '2026-08-12 total', '2027-02-06 annular', '2027-08-02 total', '2028-01-26 annular', '2028-07-22 total',
    ]);
  });

  it.each(SOLAR)('matches NASA for %s (%s)', (d, type, ge, gamma, mag, lat, lon, dur) => {
    const e = byDay(d);
    expect(e.type).toBe(type);
    expect(Math.abs(e.t - fromTD(ge))).toBeLessThan(2 * MIN);
    expect(Math.abs(e.gamma - gamma)).toBeLessThan(0.01);
    expect(Math.abs(e.magnitude - mag)).toBeLessThan(0.01);
    expect(Math.abs(e.greatest.lat - lat)).toBeLessThan(1);
    expect(angDiff(e.greatest.lon, lon)).toBeLessThan(1);
    if (dur) expect(Math.abs(e.durationS! - dur)).toBeLessThan(10);
    else expect(e.durationS).toBeUndefined();
    expect(e.p1).toBeLessThan(e.t);
    expect(e.p4).toBeGreaterThan(e.t);
  });

  it('agrees with the topocentric view: at greatest eclipse the Moon is centred on the Sun', () => {
    const e = byDay('2024-04-08'), s = topocentric(e.t, e.greatest);
    expect(s.sep).toBeLessThan(0.01);
    expect(s.sun.alt).toBeCloseTo(70, 0);
    expect(byDay('2024-04-08').pathWidthKm).toBeCloseTo(198, -1);
  });

  /** Distance (deg, local equirectangular) from `g` to a polyline. */
  const toLine = (line: GeoPoint[], g: GeoPoint) => {
    const k = Math.cos(g.lat * D2R);
    let best = Infinity;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i], ax = (a.lon - g.lon) * k, ay = a.lat - g.lat, dx = (b.lon - g.lon) * k - ax, dy = b.lat - g.lat - ay;
      const u = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy)));
      best = Math.min(best, Math.hypot(ax + u * dx, ay + u * dy));
    }
    return best;
  };

  it('traces the 2024 path of totality over Texas as NASA does', () => {
    const path = eclipsePath(byDay('2024-04-08'));
    expect(path.length).toBeGreaterThan(100);
    expect(path.every((p) => (p.north && p.south ? p.north.lat > p.south.lat : true))).toBe(true);
    // NASA path table, 18:40–18:42 UT: central line, northern and southern limits.
    expect(toLine(path.map((p) => p.center), { lat: 31.72, lon: -97.37 })).toBeLessThan(0.1);
    expect(toLine(path.flatMap((p) => p.north ?? []), { lat: 32.96, lon: -97.343 })).toBeLessThan(0.1);
    expect(toLine(path.flatMap((p) => p.south ?? []), { lat: 31.61, lon: -96.06 })).toBeLessThan(0.1);
    // Dallas lies inside the path, ~40 km northwest of the central line (which runs through Waxahachie).
    expect(toLine(path.map((p) => p.center), { lat: 32.78, lon: -96.8 })).toBeLessThan(0.45);
    expect(eclipsePath(byDay('2025-03-29'))).toEqual([]);
  });

  it('computes local circumstances (Dallas total, Chicago partial)', () => {
    const e = byDay('2024-04-08');
    const dallas = localSolar(e, { lat: 32.78, lon: -96.8 });
    expect(dallas.type).toBe('total');
    expect(dallas.visible).toBe(true);
    expect(Math.abs((dallas.c3! - dallas.c2!) / 1000 - 230)).toBeLessThan(15);
    expect(dallas.c1!).toBeLessThan(dallas.c2!);
    expect(dallas.c4!).toBeGreaterThan(dallas.c3!);
    const chicago = localSolar(e, { lat: 41.88, lon: -87.63 });
    expect(chicago.type).toBe('partial');
    expect(chicago.magnitude).toBeCloseTo(0.94, 1);
    expect(Math.abs(chicago.magnitude - 0.94)).toBeLessThan(0.02);
    expect(chicago.c2).toBeUndefined();
    expect(localSolar(e, { lat: -34.6, lon: -58.4 }).type).toBe('none');
    expect(localSolar(e, { lat: -33.9, lon: 151.2 }).visible).toBe(false);
  });
});

/** NASA canon: greatest eclipse (TD), type, umbral & penumbral magnitudes, totality (min). */
const LUNAR: [string, 'total' | 'partial' | 'penumbral', string, number, number, number?][] = [
  ['2025-09-07', 'total', '2025-09-07T18:12:58', 1.3619, 2.344, 82.1],
  ['2026-03-03', 'total', '2026-03-03T11:34:52', 1.1507, 2.1838, 58.3],
  ['2026-08-28', 'partial', '2026-08-28T04:14:04', 0.9299, 1.9645],
  ['2027-02-20', 'penumbral', '2027-02-20T23:14:06', -0.0569, 0.9266],
];

describe('lunar eclipses', () => {
  const all = findLunarEclipses(Date.UTC(2025, 0, 1), Date.UTC(2027, 11, 31));

  it('finds the umbral eclipses of 2025–2026', () => {
    const got = all.filter((e) => e.type !== 'penumbral' && e.t < Date.UTC(2027, 0, 1)).map((e) => `${day(e.t)} ${e.type}`);
    expect(got).toEqual(['2025-03-14 total', '2025-09-07 total', '2026-03-03 total', '2026-08-28 partial']);
  });

  it.each(LUNAR)('matches NASA for %s (%s)', (d, type, ge, umb, pen, tot) => {
    const e = all.find((x) => day(x.t) === d)!;
    expect(e.type).toBe(type);
    expect(Math.abs(e.t - fromTD(ge))).toBeLessThan(2 * MIN);
    expect(Math.abs(e.umbralMagnitude - umb)).toBeLessThan(0.01);
    expect(Math.abs(e.penumbralMagnitude - pen)).toBeLessThan(0.01);
    if (tot) expect(Math.abs((e.u3! - e.u2!) / MIN - tot)).toBeLessThan(2);
    else expect(e.u2).toBeUndefined();
    expect(e.p1).toBeLessThan(e.t);
    if (e.u1) expect(e.u1).toBeGreaterThan(e.p1);
  });
});

describe('sky events', () => {
  it('scans three years quickly and in order', () => {
    const t0 = performance.now(), ev = skyEvents(Date.UTC(2026, 0, 1), Date.UTC(2028, 11, 31));
    expect(performance.now() - t0).toBeLessThan(1500);
    for (let i = 1; i < ev.length; i++) expect(ev[i].t).toBeGreaterThanOrEqual(ev[i - 1].t);
    const ids = new Set(ev.map((e) => e.id));
    expect(ids.size).toBe(ev.length);
    for (const id of ['solar-eclipse-2026-08-12', 'lunar-eclipse-2026-03-03', 'opposition-mars-2027-02-19', 'meteor-shower-perseids-2026']) expect(ids).toContain(id);
    const full = ev.filter((e) => e.kind === 'full-moon' || e.kind === 'supermoon');
    expect(full.length).toBeGreaterThan(35);
    expect(full.every((e) => (e.kind === 'supermoon') === e.value! < 361_000)).toBe(true);
    expect(ev.filter((e) => e.kind === 'conjunction').every((e) => e.value! < (e.bodies![0] === 'moon' ? 2 : 1.5))).toBe(true);
  });

  it('times the 2026 equinox and solstice to a few minutes', () => {
    const ev = skyEvents(Date.UTC(2026, 0, 1), Date.UTC(2027, 0, 1), { kinds: ['equinox', 'solstice'] });
    expect(ev.map((e) => e.season)).toEqual(['march', 'june', 'september', 'december']);
    expect(Math.abs(ev[0].t - Date.UTC(2026, 2, 20, 14, 46))).toBeLessThan(3 * MIN);
    expect(Math.abs(ev[1].t - Date.UTC(2026, 5, 21, 8, 24))).toBeLessThan(3 * MIN);
  });

  it('places the Perseids peak on Aug 12–13, 2026', () => {
    const [p] = skyEvents(Date.UTC(2026, 7, 1), Date.UTC(2026, 8, 1), { kinds: ['meteor-shower'] }).filter((e) => e.shower === 'perseids');
    expect(p.t).toBeGreaterThan(Date.UTC(2026, 7, 12));
    expect(p.t).toBeLessThan(Date.UTC(2026, 7, 14));
    expect(SHOWERS).toHaveLength(10);
  });

  it('finds Mars at opposition and Mercury/Venus at greatest elongation', () => {
    const ev = skyEvents(Date.UTC(2026, 6, 1), Date.UTC(2027, 5, 1), { kinds: ['opposition', 'elongation'] });
    const mars = ev.find((e) => e.bodies?.[0] === 'mars')!;
    expect(Math.abs(mars.t - Date.UTC(2027, 1, 19, 12))).toBeLessThan(864e5);
    const venus = ev.find((e) => e.id.startsWith('elongation-venus'))!;
    expect(day(venus.t)).toBe('2026-08-15');
    expect(venus.side).toBe('east');
  });

  it('finds the transits of Mercury in 2032 and 2039', () => {
    const ev = skyEvents(Date.UTC(2030, 0, 1), Date.UTC(2040, 0, 1), { kinds: ['transit'] });
    expect(ev.map((e) => e.id)).toEqual(['transit-mercury-2032-11-13', 'transit-mercury-2039-11-07']);
  });
});

describe('sky clocks', async () => {
  const { zoneOffset, siteClock } = await import('../../src/client/sky/common.ts');
  it('follows daylight saving, half-hour zones and date lines', () => {
    expect(zoneOffset('America/New_York', Date.parse('2026-01-15T12:00Z'))).toBe(-5);
    expect(zoneOffset('America/New_York', Date.parse('2026-07-15T12:00Z'))).toBe(-4);
    expect(zoneOffset('Asia/Kolkata', Date.parse('2026-07-15T12:00Z'))).toBe(5.5);
    expect(zoneOffset('Australia/Sydney', Date.parse('2026-01-15T12:00Z'))).toBe(11);
    // 23:30 UTC on 31 Dec is already New Year in Beijing
    expect(siteClock(Date.parse('2026-12-31T23:30Z'), { tz: 8, zone: 'Asia/Shanghai' }, true, 'en')).toBe('Jan 1 07:30 (UTC+8)');
    expect(siteClock(Date.parse('2026-07-01T12:00Z'), { tz: 5.5, zone: 'Asia/Kolkata' })).toBe('17:30 (UTC+5:30)');
    expect(siteClock(Date.parse('2026-07-01T12:00Z'), { tz: -6, est: true })).toBe('06:00 (≈UTC−6)');
  });
});

describe('Saros series, Danjon L scale, extinction, planet discs, constellations & calendar helpers', async () => {
  const { isVisibleAtSite, skyEventsToMarkdown } = await import('../../src/client/sky/panel.ts');

  it('assigns canonical NASA Saros series numbers and Danjon L values to solar and lunar eclipses', () => {
    const solar = findSolarEclipses(Date.UTC(2024, 0, 1), Date.UTC(2028, 0, 1));
    const s2024 = solar.find(e => day(e.t) === '2024-04-08')!;
    const s2026 = solar.find(e => day(e.t) === '2026-08-12')!;
    const s2027 = solar.find(e => day(e.t) === '2027-08-02')!;
    expect(s2024.saros).toBe(139);
    expect(s2026.saros).toBe(126);
    expect(s2027.saros).toBe(136);
    expect(solarSaros(s2024.t)).toBe(139);

    const lunar = findLunarEclipses(Date.UTC(2025, 0, 1), Date.UTC(2027, 0, 1));
    const l2025 = lunar.find(e => day(e.t) === '2025-09-07')!;
    const l2026Mar = lunar.find(e => day(e.t) === '2026-03-03')!;
    const l2026Aug = lunar.find(e => day(e.t) === '2026-08-28')!;
    expect(l2025.saros).toBe(128);
    expect(l2026Mar.saros).toBe(133);
    expect(lunarSaros(l2025.t)).toBe(128);
    expect(l2025.danjonL).toBe(2);
    expect(l2026Mar.danjonL).toBe(3);
    expect(l2026Aug.danjonL).toBeUndefined();
    expect(lunarDanjonL(0.95)).toBeNull();
    expect(lunarDanjonL(1.03)).toBe(4);
    expect(lunarDanjonL(1.15)).toBe(3);
    expect(lunarDanjonL(1.45)).toBe(2);
    expect(lunarDanjonL(1.75)).toBe(1);
  });

  it('computes V-band atmospheric extinction, planet disk arcseconds, and 88-IAU constellation nearest lookup', () => {
    expect(atmosphericExtinctionMag(90)).toBeCloseTo(0.2, 2);
    expect(atmosphericExtinctionMag(30)).toBeCloseTo(0.4, 1);
    expect(atmosphericExtinctionMag(-2)).toBe(Infinity);

    // Jupiter near opposition is ~44–49″; Mars at 2027 opposition is ~14″
    const jup = planetDiskArcsec('jupiter', Date.UTC(2026, 0, 10));
    expect(jup).toBeGreaterThan(43);
    expect(jup).toBeLessThan(50);
    const mars = planetDiskArcsec('mars', Date.UTC(2027, 1, 19));
    expect(mars).toBeGreaterThan(12.5);
    expect(mars).toBeLessThan(16);

    // Orion Nebula (RA 83.82°, Dec −5.39°), Polaris (RA 37.95°, Dec +89.26°), Andromeda M31 (RA 10.68°, Dec +41.27°)
    expect(nearestConstellation(83.82, -5.39).id).toBe('ori');
    expect(nearestConstellation(37.95, 89.26).id).toBe('umi');
    expect(nearestConstellation(10.68, 41.27).id).toBe('and');
  });

  it('filters site-visible sky events and exports Markdown ephemeris tables', () => {
    const ev2024 = skyEvents(Date.UTC(2024, 3, 1), Date.UTC(2024, 3, 15), { kinds: ['solar-eclipse'] });
    expect(ev2024.length).toBe(1);
    const dallas = { name: 'Dallas', lat: 32.78, lon: -96.8, tz: -5, zone: 'America/Chicago' };
    const sydney = { name: 'Sydney', lat: -33.87, lon: 151.21, tz: 10, zone: 'Australia/Sydney' };
    expect(isVisibleAtSite(ev2024[0], dallas)).toBe(true);
    expect(isVisibleAtSite(ev2024[0], sydney)).toBe(false);

    const md = skyEventsToMarkdown(ev2024, dallas, 2024);
    expect(md).toContain('2024 (Dallas)');
    expect(md).toContain('| 2024-04-08');
  });
});

