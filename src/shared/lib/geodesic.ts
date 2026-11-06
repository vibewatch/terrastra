import type { CatalogueItem } from '../data/types.ts';
import { bearingDeg, haversineKm, slerpLatLon } from './geo.ts';

const EARTH_CIRCUMFERENCE_KM = 40075;
const DIRS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type CompassDir8 = typeof DIRS_8[number];

export function wrapLon(lon: number): number {
  const raw = ((((lon + 180) % 360) + 360) % 360) - 180;
  const w = Math.round(raw * 1e9) / 1e9;
  return Object.is(w, -0) ? 0 : w === -180 && lon > 0 ? 180 : w;
}

/** Exact antipode (diametrically opposite point on Earth's sphere). */
export function antipodeOf(lat: number, lon: number): [number, number] {
  const aLat = Object.is(-lat, -0) ? 0 : -lat;
  return [aLat, wrapLon(lon + 180)];
}

/** Shortest longitudinal solar-time offset from A to B in hours (-12..+12). */
export function solarTimeOffsetHours(lonA: number, lonB: number): number {
  const dLon = wrapLon(lonB - lonA);
  const hrs = Math.round((dLon / 15) * 10) / 10;
  return Object.is(hrs, -0) ? 0 : hrs;
}

export function compassDir8(deg: number): CompassDir8 {
  const norm = ((deg % 360) + 360) % 360;
  return DIRS_8[Math.round(norm / 45) % 8];
}

export interface GreatCircleSummary {
  distanceKm: number;
  circumferencePct: number;
  bearingDeg: number;
  compassDir: CompassDir8;
  midpoint: [number, number];
  solarOffsetHours: number;
  travelHours: {
    walk: number;
    train: number;
    jet: number;
    seismicP: number;
    iss: number;
  };
  lightMs: number;
}

export function greatCircleSummary(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): GreatCircleSummary {
  const distanceKm = haversineKm(a.lat, a.lon, b.lat, b.lon);
  const brg = distanceKm < 0.01 ? 0 : bearingDeg(a.lat, a.lon, b.lat, b.lon);
  return {
    distanceKm,
    circumferencePct: (distanceKm / EARTH_CIRCUMFERENCE_KM) * 100,
    bearingDeg: brg,
    compassDir: compassDir8(brg),
    midpoint: slerpLatLon([a.lat, a.lon], [b.lat, b.lon], 0.5),
    solarOffsetHours: solarTimeOffsetHours(a.lon, b.lon),
    travelHours: {
      walk: distanceKm / 5,
      train: distanceKm / 300,
      jet: distanceKm / 900,
      seismicP: distanceKm / 21600,
      iss: distanceKm / 27600,
    },
    lightMs: (distanceKm / 299792.458) * 1000,
  };
}

export function nearestCatalogueItem(
  lat: number,
  lon: number,
  items: readonly CatalogueItem[],
  excludeKey?: string,
): { item: CatalogueItem; distanceKm: number } | null {
  let best: CatalogueItem | null = null;
  let bestKm = Infinity;
  for (const it of items) {
    if (it.key === excludeKey) continue;
    if (it.route) continue;
    if (!Number.isFinite(it.lat) || !Number.isFinite(it.lon)) continue;
    const km = haversineKm(lat, lon, it.lat, it.lon);
    if (km < bestKm) {
      bestKm = km;
      best = it;
    }
  }
  return best ? { item: best, distanceKm: bestKm } : null;
}

export function formatCoordPair(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(1)}°${ns}, ${Math.abs(lon).toFixed(1)}°${ew}`;
}

export interface AltitudePhysics {
  pressurePct: number;
  tempDropC: number;
  boilingPointC: number;
}

/**
 * Standard ISA tropospheric physics at elevation `heightM` (meters above sea level):
 * - `pressurePct`: barometric pressure as % of sea-level standard atmosphere
 * - `tempDropC`: standard environmental lapse-rate cooling (6.5 °C / 1000 m)
 * - `boilingPointC`: water boiling point (°C) from Clausius–Clapeyron relation
 */
export function altitudePhysics(heightM: number): AltitudePhysics {
  const h = Math.max(0, Math.min(11000, Number.isFinite(heightM) ? heightM : 0));
  const ratio = Math.pow(1 - 2.25577e-5 * h, 5.25588);
  const pressurePct = Math.round(ratio * 1000) / 10;
  const tempDropC = Math.round((h / 1000) * 6.5 * 10) / 10;
  const invTb = (1 / 373.15) - 2.04487e-4 * Math.log(Math.max(0.05, ratio));
  const boilingPointC = Math.round(((1 / invTb) - 273.15) * 10) / 10;
  return { pressurePct, tempDropC, boilingPointC };
}
