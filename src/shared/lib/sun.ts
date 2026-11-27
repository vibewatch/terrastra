/**
 * Sub-solar point (where the Sun is straight overhead) from a UTC instant, with the equation of time.
 * NOAA's low-precision fit: about ±0.3° in latitude, good enough for a globe and for lessons on the seasons.
 */
export function subsolar(ms: number): [lat: number, lon: number] {
  const now = new Date(ms);
  const doy = (ms - Date.UTC(now.getUTCFullYear(), 0, 0)) / 864e5;
  const g = ((2 * Math.PI) / 365) * (doy - 1);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60;
  let lon = (720 - utcMins - eqTime) / 4;
  lon = ((lon + 540) % 360) - 180;
  return [(decl * 180) / Math.PI, lon];
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const SUNRISE_ALT_RAD = -0.833 * DEG2RAD;

/**
 * Peak solar elevation angle (in degrees above/below horizon) at local solar noon
 * for observer latitude `latDeg` and solar declination `declDeg`.
 */
export function solarNoonAltitudeDeg(latDeg: number, declDeg: number): number {
  const raw = 90 - Math.abs(latDeg - declDeg);
  return Math.max(-90, Math.min(90, Math.round(raw * 10) / 10));
}

/**
 * Daylight duration in hours at observer latitude `latDeg` when solar declination is `declDeg`,
 * accounting for standard atmospheric refraction (-0.833°).
 */
export function dayLengthHours(
  latDeg: number,
  declDeg: number,
): { hours: number; polar: 'day' | 'night' | null } {
  const phi = Math.max(-89.99, Math.min(89.99, latDeg)) * DEG2RAD;
  const delta = Math.max(-23.5, Math.min(23.5, declDeg)) * DEG2RAD;
  const denom = Math.cos(phi) * Math.cos(delta);
  if (Math.abs(denom) < 1e-6) {
    const sameHem = latDeg * declDeg >= 0;
    return sameHem ? { hours: 24, polar: 'day' } : { hours: 0, polar: 'night' };
  }
  const cosOmega = (Math.sin(SUNRISE_ALT_RAD) - Math.sin(phi) * Math.sin(delta)) / denom;
  if (cosOmega <= -1) return { hours: 24, polar: 'day' };
  if (cosOmega >= 1) return { hours: 0, polar: 'night' };
  const omega = Math.acos(cosOmega);
  const hours = (2 * omega * RAD2DEG) / 15;
  return { hours, polar: null };
}

/**
 * Equation of Time in minutes (`sundial − mean clock`, roughly -14.3 .. +16.4 min)
 * from NOAA's fractional-year Fourier fit.
 */
export function equationOfTimeMinutes(ms: number): number {
  const now = new Date(ms);
  const doy = (ms - Date.UTC(now.getUTCFullYear(), 0, 0)) / 864e5;
  const g = ((2 * Math.PI) / 365) * (doy - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const rounded = Math.round(eq * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export type CardinalSolarTerm = 'marchEquinox' | 'juneSolstice' | 'septemberEquinox' | 'decemberSolstice';

/** Returns the next astronomical equinox/solstice relative to `ms` and whole/fractional days remaining. */
export function nextSolarTerm(ms: number): { term: CardinalSolarTerm; daysUntil: number } {
  const y = new Date(ms).getUTCFullYear();
  const candidates: [CardinalSolarTerm, number][] = [
    ['marchEquinox', Date.UTC(y, 2, 20, 9, 0)],
    ['juneSolstice', Date.UTC(y, 5, 21, 3, 0)],
    ['septemberEquinox', Date.UTC(y, 8, 22, 19, 0)],
    ['decemberSolstice', Date.UTC(y, 11, 21, 15, 0)],
    ['marchEquinox', Date.UTC(y + 1, 2, 20, 15, 0)],
  ];
  for (const [term, atMs] of candidates) {
    if (atMs >= ms - 6 * 3600_000) {
      return { term, daysUntil: Math.max(0, Math.round(((atMs - ms) / 864e5) * 10) / 10) };
    }
  }
  return { term: 'marchEquinox', daysUntil: 0 };
}

export interface EarthSolarSummary {
  subsolarLat: number;
  subsolarLon: number;
  antisolarLat: number;
  antisolarLon: number;
  declinationDeg: number;
  equationOfTimeMin: number;
  polarDayLat: number;
  polarDayHemisphere: 'N' | 'S' | null;
}

/**
 * Global solar illumination summary at UTC timestamp `ms`:
 * subsolar zenith point, antisolar midnight point, solar declination,
 * equation of time (min), and the latitude threshold of 24-hour polar daylight.
 */
export function earthSolarSummary(ms: number): EarthSolarSummary {
  const [subsolarLat, subsolarLon] = subsolar(ms);
  const antisolarLat = -subsolarLat;
  const antisolarLon = ((subsolarLon + 540) % 360) - 180;
  const declinationDeg = Math.round(subsolarLat * 10) / 10;
  const equationOfTimeMin = equationOfTimeMinutes(ms);
  const absDecl = Math.abs(subsolarLat);
  const polarDayHemisphere: 'N' | 'S' | null = absDecl >= 0.85 ? (subsolarLat > 0 ? 'N' : 'S') : null;
  const polarDayLat = Math.round(Math.max(66.5, 90 - absDecl) * 10) / 10;
  return {
    subsolarLat,
    subsolarLon,
    antisolarLat,
    antisolarLon,
    declinationDeg,
    equationOfTimeMin,
    polarDayLat,
    polarDayHemisphere,
  };
}

/**
 * Apparent geocentric solar ecliptic longitude `λ☉` in degrees `[0, 360)` at UTC timestamp `ms`
 * (Meeus low-precision J2000 expansion, accurate to ~0.02°).
 * `0°` = March Equinox (`春分`), `90°` = June Solstice (`夏至`), `180°` = September Equinox (`秋分`), `270°` = December Solstice (`冬至`).
 */
export function solarLongitudeDeg(ms: number): number {
  const T = (ms / 864e5 - 10957.5) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * DEG2RAD;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M)
    + (0.019993 - 0.000101 * T) * Math.sin(2 * M)
    + 0.000289 * Math.sin(3 * M);
  return (((L0 + C) % 360) + 360) % 360;
}

/** The 24 Traditional East Asian Solar Terms (`二十四节气`), ordered by 15° steps of apparent solar longitude `λ☉` starting at `0°` (`春分`). */
export const SOLAR_TERMS_24: readonly { lon: number; en: string; zh: string }[] = [
  { lon: 0, en: 'Spring Equinox', zh: '春分' },
  { lon: 15, en: 'Pure Brightness', zh: '清明' },
  { lon: 30, en: 'Grain Rain', zh: '谷雨' },
  { lon: 45, en: 'Start of Summer', zh: '立夏' },
  { lon: 60, en: 'Grain Buds', zh: '小满' },
  { lon: 75, en: 'Grain in Ear', zh: '芒种' },
  { lon: 90, en: 'Summer Solstice', zh: '夏至' },
  { lon: 105, en: 'Minor Heat', zh: '小暑' },
  { lon: 120, en: 'Major Heat', zh: '大暑' },
  { lon: 135, en: 'Start of Autumn', zh: '立秋' },
  { lon: 150, en: 'End of Heat', zh: '处暑' },
  { lon: 165, en: 'White Dew', zh: '白露' },
  { lon: 180, en: 'Autumn Equinox', zh: '秋分' },
  { lon: 195, en: 'Cold Dew', zh: '寒露' },
  { lon: 210, en: 'Frost Descent', zh: '霜降' },
  { lon: 225, en: 'Start of Winter', zh: '立冬' },
  { lon: 240, en: 'Minor Snow', zh: '小雪' },
  { lon: 255, en: 'Major Snow', zh: '大雪' },
  { lon: 270, en: 'Winter Solstice', zh: '冬至' },
  { lon: 285, en: 'Minor Cold', zh: '小寒' },
  { lon: 300, en: 'Major Cold', zh: '大寒' },
  { lon: 315, en: 'Start of Spring', zh: '立春' },
  { lon: 330, en: 'Rain Water', zh: '雨水' },
  { lon: 345, en: 'Awakening of Insects', zh: '惊蛰' },
];

export interface SolarTerm24Status {
  /** Index `0..23` in `SOLAR_TERMS_24` (`0` = `春分` at `0°`). */
  index: number;
  longitudeDeg: number;
  current: { en: string; zh: string };
  next: { en: string; zh: string };
  degToNext: number;
  approxDaysToNext: number;
}

/** Identifies the active 15° Solar Term (`二十四节气`) and days remaining until the next term. */
export function currentSolarTerm24(ms: number): SolarTerm24Status {
  const lon = solarLongitudeDeg(ms);
  const idx = Math.floor(lon / 15) % 24;
  const nextIdx = (idx + 1) % 24;
  const degToNext = Math.max(0, (idx + 1) * 15 - lon);
  return {
    index: idx,
    longitudeDeg: Math.round(lon * 10) / 10,
    current: { en: SOLAR_TERMS_24[idx].en, zh: SOLAR_TERMS_24[idx].zh },
    next: { en: SOLAR_TERMS_24[nextIdx].en, zh: SOLAR_TERMS_24[nextIdx].zh },
    degToNext: Math.round(degToNext * 10) / 10,
    approxDaysToNext: Math.round((degToNext / 0.9856) * 10) / 10,
  };
}

export interface EarthOrbitalSummary {
  /** Heliocentric Earth–Sun distance in Astronomical Units (`~0.9833..1.0167 AU`). */
  distanceAu: number;
  /** Instantaneous Keplerian heliocentric orbital speed in km/s (`~29.29..30.29 km/s`, fastest at Jan perihelion). */
  orbitalSpeedKms: number;
  /** Top-of-atmosphere normal solar irradiance in W/m² (`S0 / r²`, `~1316..1408 W/m²`). */
  toaIrradianceWm2: number;
  apsis: 'perihelion' | 'aphelion' | 'mean';
}

/**
 * Computes Earth's heliocentric distance (`AU`), Keplerian orbital speed (`km/s` — Kepler's 2nd Law),
 * and top-of-atmosphere solar irradiance (`W/m²`) at UTC timestamp `ms`.
 */
export function earthOrbitalSummary(ms: number): EarthOrbitalSummary {
  const T = (ms / 864e5 - 10957.5) / 36525;
  const e = 0.016708634 - 0.000042037 * T;
  const M = (357.52911 + 35999.05029 * T) * DEG2RAD;
  const nu = M + (2 * e) * Math.sin(M) + 1.25 * e * e * Math.sin(2 * M);
  const r = (1 - e * e) / (1 + e * Math.cos(nu));
  const v = 29.7847 * Math.sqrt(Math.max(0.5, 2 / r - 1));
  const toa = 1361 / (r * r);
  const apsis: EarthOrbitalSummary['apsis'] = r <= 0.9855 ? 'perihelion' : r >= 1.0145 ? 'aphelion' : 'mean';
  return {
    distanceAu: Math.round(r * 10000) / 10000,
    orbitalSpeedKms: Math.round(v * 100) / 100,
    toaIrradianceWm2: Math.round(toa),
    apsis,
  };
}

