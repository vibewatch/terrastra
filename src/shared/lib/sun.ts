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

export interface EarthSolarSummary {
  subsolarLat: number;
  subsolarLon: number;
  antisolarLat: number;
  antisolarLon: number;
  declinationDeg: number;
  polarDayLat: number;
  polarDayHemisphere: 'N' | 'S' | null;
}

/**
 * Global solar illumination summary at UTC timestamp `ms`:
 * subsolar zenith point, antisolar midnight point, solar declination,
 * and the latitude threshold of 24-hour polar daylight.
 */
export function earthSolarSummary(ms: number): EarthSolarSummary {
  const [subsolarLat, subsolarLon] = subsolar(ms);
  const antisolarLat = -subsolarLat;
  const antisolarLon = ((subsolarLon + 540) % 360) - 180;
  const declinationDeg = Math.round(subsolarLat * 10) / 10;
  const absDecl = Math.abs(subsolarLat);
  const polarDayHemisphere: 'N' | 'S' | null = absDecl >= 0.85 ? (subsolarLat > 0 ? 'N' : 'S') : null;
  const polarDayLat = Math.round(Math.max(66.5, 90 - absDecl) * 10) / 10;
  return {
    subsolarLat,
    subsolarLon,
    antisolarLat,
    antisolarLon,
    declinationDeg,
    polarDayLat,
    polarDayHemisphere,
  };
}

