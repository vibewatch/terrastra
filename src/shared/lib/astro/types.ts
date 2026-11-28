/**
 * Shared types for the sky-events engine (`src/shared/lib/astro/`). Times are UTC milliseconds; angles in degrees;
 * longitudes east-positive in [-180, 180). "ECEF" vectors are Earth-fixed: +x toward (lat 0, lon 0), +y toward
 * (lat 0, lon 90°E), +z toward the North Pole.
 */
export type Vec3 = [number, number, number];

export interface GeoPoint { lat: number; lon: number }

export type SolarEclipseType = 'total' | 'annular' | 'hybrid' | 'partial';
export type LunarEclipseType = 'total' | 'partial' | 'penumbral';

export interface SolarEclipse {
  kind: 'solar';
  type: SolarEclipseType;
  /** Time of greatest eclipse (UTC ms). */
  t: number;
  /** Least distance of the shadow axis from Earth's centre, in Earth radii (signed: + north). */
  gamma: number;
  /** Eclipse magnitude at greatest eclipse (fraction of the Sun's diameter covered). */
  magnitude: number;
  /** Where on Earth the eclipse is greatest. */
  greatest: GeoPoint;
  /** Length of totality / annularity on the central line at greatest eclipse (s); central eclipses only. */
  durationS?: number;
  /** Width of the path of totality / annularity at greatest eclipse (km); central eclipses only. */
  pathWidthKm?: number;
  /** First and last contact of the penumbra with the Earth (UTC ms). */
  p1: number;
  p4: number;
  /** NASA / van den Bergh Saros series number (e.g. 139 for 2024-04-08, 126 for 2026-08-12). */
  saros?: number;
}

export interface LunarEclipse {
  kind: 'lunar';
  type: LunarEclipseType;
  /** Time of greatest eclipse (UTC ms). */
  t: number;
  /** Least distance of the Moon's centre from the shadow axis, in Earth radii (signed: + north). */
  gamma: number;
  umbralMagnitude: number;
  penumbralMagnitude: number;
  /** Contact times (UTC ms): penumbral P1/P4, partial U1/U4, total U2/U3 (absent when that phase doesn't happen). */
  p1: number; u1?: number; u2?: number; u3?: number; u4?: number; p4: number;
  /** Point where the Moon is at the zenith at greatest eclipse (centre of the hemisphere that sees it). */
  subMoon: GeoPoint;
  /** NASA / van den Bergh Lunar Saros series number (e.g. 133 for 2026-03-03). */
  saros?: number;
  /** Estimated Danjon luminosity scale L (1..4) for umbral lunar eclipses, or undefined for penumbral-only. */
  danjonL?: 1 | 2 | 3 | 4;
}

/** One sample along a central solar eclipse's path. */
export interface PathPoint { t: number; center: GeoPoint; north: GeoPoint | null; south: GeoPoint | null }

/** What one observer sees of a solar eclipse. All times UTC ms; absent when that contact isn't seen. */
export interface LocalSolar {
  /** Partial phase visible at all (above the horizon at some point during it). */
  visible: boolean;
  c1?: number; c2?: number; max: number; c3?: number; c4?: number;
  /** Fraction of the Sun's diameter covered at maximum, and fraction of its disc area. */
  magnitude: number;
  obscuration: number;
  /** Sun altitude at maximum. */
  sunAlt: number;
  /** Local type: what this observer sees. */
  type: 'total' | 'annular' | 'partial' | 'none';
}

/** The Sun and Moon as seen by an observer at an instant. */
export interface TopoSunMoon {
  sun: { alt: number; az: number; radius: number; distKm: number };
  moon: { alt: number; az: number; radius: number; distKm: number };
  /** Angular distance between their centres. */
  sep: number;
  /** Position angle of the Moon's centre measured from the Sun's centre (from celestial north through east). */
  pa: number;
  /** Parallactic angle of the Sun (to turn "celestial north" into "up" on the sky). */
  parallactic: number;
}

export type SkyEventKind =
  | 'solar-eclipse' | 'lunar-eclipse' | 'full-moon' | 'new-moon' | 'supermoon' | 'meteor-shower'
  | 'equinox' | 'solstice' | 'opposition' | 'conjunction' | 'elongation' | 'transit';

export interface SkyEvent {
  /** Stable id, e.g. `solar-eclipse-2026-08-12`. */
  id: string;
  kind: SkyEventKind;
  /** Peak / exact time (UTC ms). */
  t: number;
  /** Body ids from `src/shared/data/solar.ts` involved, e.g. ['mars'] for an opposition, ['venus', 'jupiter']. */
  bodies?: string[];
  /** Kind-specific details. */
  solar?: SolarEclipse;
  lunar?: LunarEclipse;
  /** Meteor shower key (see `src/shared/data/showers.ts`). */
  shower?: string;
  /** equinox/solstice: which one. */
  season?: 'march' | 'june' | 'september' | 'december';
  /** Angular separation (conjunctions), elongation angle (elongations), Earth–Moon distance in km (supermoon / full / new moon). */
  value?: number;
  /** elongation: 'east' (evening sky) | 'west' (morning sky). */
  side?: 'east' | 'west';
}
