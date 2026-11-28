import { describe, it, expect } from 'vitest';
import { compareGroups, earthPlaces, groupOf, ratio, volumeRatio, drawn } from '../../src/client/lib/compare.ts';
import { BODY } from '../../src/shared/data/solar.ts';
import { BY_KEY } from '../../src/shared/data/catalogue.ts';

describe('compare bench', () => {
  const g = Object.fromEntries(compareGroups().map(x => [x.id, x]));
  it('compares bodies by diameter, never radius', () => {
    const earth = g.bodies.things.find(t => t.id === 'earth')!;
    expect(earth.size).toBe(Math.round(BODY.earth.radiusKm * 2));
    expect(g.bodies.unit).toBe('km');
  });
  it('keeps each group to one measure and drops facts that measure something else', () => {
    const names = (id: string) => g[id].things.map(t => t.name.en);
    expect(names('long')).not.toContain('Quetzalcoatlus');
    expect(names('tall')).not.toContain('Mount Rushmore');
    expect(names('tall')).toContain('Burj Khalifa');
    expect(names('long')).toContain('Blue whale');
    for (const x of compareGroups()) expect(new Set(x.pair).size).toBe(2);
    expect(groupOf('earth')?.id).toBe('bodies');
    expect(groupOf('child')).toBeUndefined();
  });
  it('rounds ratios and flags sub-pixel sizes at true scale', () => {
    expect(ratio(12742, 3475)).toEqual({ big: 0, times: 3.7 });
    expect(ratio(1.3, 828)).toEqual({ big: 1, times: 637 });
    const d = drawn(1392684, 2377, 200, 'true');
    expect(d.tiny).toEqual([false, true]);
    expect(drawn(1392684, 2377, 200, 'zoom').px).toEqual([200, 200]);
  });

  it('speed puts animals next to vehicles in km/h, and leaves out guessed dinosaur speeds', () => {
    const g = compareGroups().find(x => x.id === 'fast')!;
    expect(g.unit).toBe('kmh');
    expect(g.pair).toEqual(['an_cheetah', 'vh_bullet']);
    const ids = g.things.map(x => x.id);
    expect(ids).toContain('vh_jumbo');
    expect(ids.filter(id => id !== 'walker').map(id => BY_KEY.get(id)?.type).every(ty => ty === 'animal' || ty === 'vehicle')).toBe(true);
    expect(groupOf('vh_balloon')).toBeUndefined();
    expect(groupOf('vh_ktx')?.id).toBe('fast');
  });

  it('includes major physical-geography features and resolved place keys in earthPlaces', () => {
    const places = earthPlaces(['city:tokyo', 'country:FR'], {
      countries: [{ id: '250', a2: 'FR', name: 'France', continent: 'europe', lat: 46.2, lon: 2.2, area: 64 }] as any,
    });
    const keys = new Set(places.map(p => p.key));
    expect(keys.has('geo:mariana-trench')).toBe(true);
    expect(keys.has('geo:andes')).toBe(true);
    expect(keys.has('city:tokyo')).toBe(true);
    expect(keys.has('country:FR')).toBe(true);
  });

  it('includes peaks & volcanoes summit elevation group separated from structural heights', () => {
    const peaks = compareGroups().find(x => x.id === 'peaks')!;
    expect(peaks.unit).toBe('m');
    expect(peaks.pair).toEqual(['everest', 'fuji']);
    expect(peaks.things[0].id).toBe('everest');
    expect(peaks.things[0].size).toBe(8849);
    expect(groupOf('everest')?.id).toBe('peaks');
    expect(groupOf('vo_etna')?.id).toBe('peaks');
    expect(groupOf('burj')?.id).toBe('tall');
  });

  it('includes Ocean Depths & Trenches group and computes spherical volume ratios for celestial bodies', () => {
    const deep = compareGroups().find(x => x.id === 'deep')!;
    expect(deep.unit).toBe('m');
    expect(deep.pair).toEqual(['dc_challenger', 'dc_titanic']);
    expect(deep.things[0].id).toBe('dc_challenger');
    expect(deep.things[0].size).toBeGreaterThanOrEqual(10900);
    expect(deep.things.some(t => t.id === 'scuba' && t.size === 40)).toBe(true);
    expect(groupOf('dc_challenger')?.id).toBe('deep');
    expect(groupOf('dc_titanic')?.id).toBe('deep');

    // Earth (12,742 km) vs Moon (3,475 km) => (12742 / 3475)^3 ≈ 49 Moons fit inside Earth
    const em = volumeRatio(12742, 3475);
    expect(em.big).toBe(0);
    expect(em.times).toBe(49);

    // Earth (12,742 km) vs Mars (6,779 km) => (12742 / 6779)^3 ≈ 6.6 Marses fit inside Earth
    expect(volumeRatio(12742, 6779)).toEqual({ big: 0, times: 6.6 });

    // Earth (12,742 km) vs Jupiter (139,820 km) => ~1,321 Earths fit inside Jupiter
    const ej = volumeRatio(12742, 139820);
    expect(ej.big).toBe(1);
    expect(ej.times).toBeGreaterThan(1300);
    expect(ej.times).toBeLessThan(1350);
  });
});
