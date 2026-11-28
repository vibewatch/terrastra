import { describe, it, expect } from 'vitest';
import { tonight, activeOn, foldIcsLine } from '../../src/shared/lib/astro/tonight.ts';
import { lunarPhaseStage, planetVisualMag, refractionArcmin, opticalAirMass, topocentric } from '../../src/shared/lib/astro/ephem.ts';
import { nearestSite } from '../../src/client/sky/text.ts';
import { buildObservingIcs, formatTonightPlanMarkdown } from '../../src/client/ui/tonight.ts';

const BEIJING = { lat: 39.9, lon: 116.4 };
describe('tonight from a city', () => {
  it('finds the night and the darkness, and knows when it never gets dark', () => {
    const r = tonight(BEIJING, Date.parse('2026-12-13T12:00:00Z'));
    expect(r.dark![0]).toBeGreaterThan(r.night![0]);
    expect(r.dark![1]).toBeLessThan(r.night![1]);
    expect(r.moon.distKm).toBeGreaterThan(350_000);
    expect(r.moon.distKm).toBeLessThan(410_000);
    expect(r.moon.ageDays).toBeGreaterThanOrEqual(0);
    expect(r.constellations.length).toBeGreaterThan(0);
    expect(r.constellations[0].alt).toBeGreaterThanOrEqual(25);
    for (const p of r.planets) {
      expect(Number.isFinite(p.mag)).toBe(true);
      expect(p.mag).toBeGreaterThan(-5);
      expect(p.mag).toBeLessThan(4);
    }
    const ice = tonight({ lat: 64.15, lon: -21.94 }, Date.parse('2026-06-21T12:00:00Z'));
    expect(ice.dark).toBeNull();
    const svalbard = tonight({ lat: 78.2, lon: 15.6 }, Date.parse('2026-06-21T12:00:00Z'));
    expect(svalbard.polar).toBe('day');
    expect(svalbard.constellations).toEqual([]);
  });
  it('keeps a peak apart from whether this place can see it and attenuates meteors under moonlight', () => {
    const r = tonight(BEIJING, Date.parse('2026-08-11T12:00:00Z'));
    const per = r.showers.find(s => s.key === 'perseids')!;
    expect(per.daysToPeak).toBeGreaterThan(1);
    expect(per.radiantAlt).toBeGreaterThan(40);
    expect(per.moonlitRate).toBeLessThanOrEqual(per.rate);
    // the 28 Aug 2026 lunar eclipse happens in Beijing's daytime: the Moon is below the horizon there
    expect(r.events.find(e => e.ev.kind === 'lunar-eclipse')?.here).toBe('below');
    expect(r.events.find(e => e.ev.kind === 'solar-eclipse')?.here).toBe('none');
  });
  it('handles activity windows that wrap the new year', () => {
    expect(activeOn('Dec 28', 'Jan 12', Date.parse('2027-01-03T00:00:00Z'))).toBe(true);
    expect(activeOn('Dec 28', 'Jan 12', Date.parse('2027-02-03T00:00:00Z'))).toBe(false);
    expect(activeOn('Jul 17', 'Aug 24', Date.parse('2026-08-12T00:00:00Z'))).toBe(true);
  });
  it('classifies 8 lunar phases, apparent planet magnitudes, refraction, air mass, nearest site, and RFC 5545 folding', () => {
    expect(lunarPhaseStage(0.01, true)).toBe('new');
    expect(lunarPhaseStage(0.25, true)).toBe('waxingCrescent');
    expect(lunarPhaseStage(0.50, true)).toBe('firstQuarter');
    expect(lunarPhaseStage(0.80, true)).toBe('waxingGibbous');
    expect(lunarPhaseStage(0.99, false)).toBe('full');
    expect(lunarPhaseStage(0.75, false)).toBe('waningGibbous');
    expect(lunarPhaseStage(0.50, false)).toBe('lastQuarter');
    expect(lunarPhaseStage(0.15, false)).toBe('waningCrescent');

    const venusMag = planetVisualMag('venus', Date.parse('2026-08-15T00:00:00Z'));
    expect(venusMag).toBeLessThan(-3.5);
    const saturnMag = planetVisualMag('saturn', Date.parse('2026-09-25T00:00:00Z'));
    expect(saturnMag).toBeGreaterThan(-0.8);
    expect(saturnMag).toBeLessThan(1.6);

    expect(refractionArcmin(0)).toBeGreaterThan(30);
    expect(refractionArcmin(90)).toBe(0);
    expect(opticalAirMass(90)).toBeCloseTo(1, 2);
    expect(opticalAirMass(0)).toBeGreaterThan(30);
    expect(opticalAirMass(-5)).toBe(Infinity);

    expect(nearestSite(69.6, 19.0).id).toBe('tromso');
    expect(nearestSite(-1.3, 36.8).id).toBe('nairobi');
    expect(nearestSite(-33.4, -70.6).id).toBe('santiago');

    const longLine = 'DESCRIPTION:' + '寰星观星之夜 · Orion & Sirius '.repeat(6);
    const folded = foldIcsLine(longLine);
    for (const physical of folded.split('\r\n')) {
      expect(new TextEncoder().encode(physical).length).toBeLessThanOrEqual(75);
    }

    const ics = buildObservingIcs({
      city: 'Beijing',
      lat: 39.9,
      lon: 116.4,
      startMs: Date.parse('2026-12-13T13:00:00Z'),
      endMs: Date.parse('2026-12-13T17:00:00Z'),
      summary: 'Terrastra Stargazing · Beijing',
      description: 'Best window: 21:00–01:00. ' + 'Clear skies expected. '.repeat(5),
      nowMs: Date.parse('2026-12-13T10:00:00Z'),
    });
    expect(ics).toContain('GEO:39.9000;116.4000');
    for (const physical of ics.trim().split('\r\n')) {
      expect(new TextEncoder().encode(physical).length).toBeLessThanOrEqual(75);
    }

    const r = tonight(BEIJING, Date.parse('2026-12-13T12:00:00Z'));
    const md = formatTonightPlanMarkdown({
      city: 'Beijing',
      dateStr: '2026-12-13',
      winLabel: '20:00–04:00',
      skySummary: 'Dark skies.',
      moonSummary: '15% waxing crescent.',
      data: r,
      hm: () => '22:00',
    });
    expect(md).toContain('# Beijing');
    expect(md).toContain('20:00–04:00');
    expect(md).toContain('M42');
  });

  it('separates civil, nautical, and astronomical twilight, bisects moonrise/moonset, and ranks Messier targets', () => {
    const r = tonight(BEIJING, Date.parse('2026-12-13T10:00:00Z'));
    expect(r.night).not.toBeNull();
    expect(r.civilDark).not.toBeNull();
    expect(r.dark).not.toBeNull();
    expect(r.astroDark).not.toBeNull();
    expect(r.civilDark![0]).toBeGreaterThanOrEqual(r.night![0]);
    expect(r.dark![0]).toBeGreaterThanOrEqual(r.civilDark![0]);
    expect(r.astroDark![0]).toBeGreaterThanOrEqual(r.dark![0]);
    expect(r.astroDark![1]).toBeLessThanOrEqual(r.dark![1]);
    expect(r.dark![1]).toBeLessThanOrEqual(r.civilDark![1]);
    expect(r.civilDark![1]).toBeLessThanOrEqual(r.night![1]);

    // London near June solstice gets nautical darkness (-12 deg) but never true astronomical darkness (-18 deg)
    const londonJune = tonight({ lat: 51.5, lon: -0.12 }, Date.parse('2026-06-21T12:00:00Z'));
    expect(londonJune.dark).not.toBeNull();
    expect(londonJune.astroDark).toBeNull();

    // Moon telemetry: apparent diameter ~29–34′, constellation ID, and accurate upper-limb rise/set crossing
    expect(r.moon.diamArcmin).toBeGreaterThan(28.5);
    expect(r.moon.diamArcmin).toBeLessThan(34.5);
    expect(r.moon.constellationId.length).toBeGreaterThanOrEqual(3);
    if (r.moon.riseMs !== null) {
      expect(Math.abs(topocentric(r.moon.riseMs, BEIJING).moon.alt - (-0.30))).toBeLessThan(0.05);
    }
    if (r.moon.setMs !== null) {
      expect(Math.abs(topocentric(r.moon.setMs, BEIJING).moon.alt - (-0.30))).toBeLessThan(0.05);
    }

    // Planet telescope telemetry & winter Messier deep-sky targets (M42 Orion Nebula / M45 Pleiades)
    expect(r.planets.length).toBeGreaterThan(0);
    for (const p of r.planets) {
      expect(p.constellationId.length).toBeGreaterThanOrEqual(3);
      expect(p.elongDeg).toBeGreaterThanOrEqual(0);
      expect(p.elongDeg).toBeLessThanOrEqual(180);
      expect(p.diskArcsec).toBeGreaterThan(2);
    }
    expect(r.deepSky.length).toBeGreaterThan(0);
    expect(r.deepSky.every(d => d.alt >= 25)).toBe(true);
    const messierNums = r.deepSky.map(d => d.messier);
    expect(messierNums.some(n => n === 42 || n === 45 || n === 31)).toBe(true);
  });
});
