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
  chordKm: number;
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
  const centralAngleRad = Math.min(Math.PI, distanceKm / 6371);
  const chordKm = 2 * 6371 * Math.sin(centralAngleRad / 2);
  const brg = distanceKm < 0.01 ? 0 : bearingDeg(a.lat, a.lon, b.lat, b.lon);
  return {
    distanceKm,
    chordKm,
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

export interface GeodesicBriefInput {
  nameA: string;
  coordA: [number, number];
  nameB: string;
  coordB: [number, number];
  summary: GreatCircleSummary;
  lang: 'en' | 'zh';
}

/** Formats a bilingual Markdown geodesic & antipode lab brief for teachers and students. */
export function formatGeodesicBriefMarkdown(input: GeodesicBriefInput): string {
  const { nameA, coordA, nameB, coordB, summary, lang: l } = input;
  const [antiLat, antiLon] = antipodeOf(coordA[0], coordA[1]);
  const km = Math.round(summary.distanceKm).toLocaleString(l === 'zh' ? 'zh-CN' : 'en-US');
  const chord = Math.round(summary.chordKm).toLocaleString(l === 'zh' ? 'zh-CN' : 'en-US');
  const solar = (summary.solarOffsetHours >= 0 ? '+' : '') + summary.solarOffsetHours.toFixed(1);
  if (l === 'zh') {
    return [
      `# 大圆测距与对跖点实验简报`,
      `- **起点 (A)**：${nameA}（${formatCoordPair(coordA[0], coordA[1])}）`,
      `- **终点 (B)**：${nameB}（${formatCoordPair(coordB[0], coordB[1])}）`,
      `- **球面大圆距离**：${km} km（占地球周长 ${summary.circumferencePct.toFixed(1)}%）`,
      `- **地壳内部直线弦长**：${chord} km`,
      `- **初始方位角**：${Math.round(summary.bearingDeg)}° ${summary.compassDir} · **地方太阳时差**：${solar} 小时`,
      `- **球面大圆中点**：${formatCoordPair(summary.midpoint[0], summary.midpoint[1])}`,
      `- **${nameA} 的对跖点**：${formatCoordPair(antiLat, antiLon)}`,
    ].join('\n');
  }
  return [
    `# Great-Circle & Antipode Lab Brief`,
    `- **Origin (A)**: ${nameA} (${formatCoordPair(coordA[0], coordA[1])})`,
    `- **Destination (B)**: ${nameB} (${formatCoordPair(coordB[0], coordB[1])})`,
    `- **Great-circle surface distance**: ${km} km (${summary.circumferencePct.toFixed(1)}% of Earth's circumference)`,
    `- **Straight interior chord**: ${chord} km`,
    `- **Initial bearing**: ${Math.round(summary.bearingDeg)}° ${summary.compassDir} · **Solar time offset**: ${solar} h`,
    `- **Spherical midpoint**: ${formatCoordPair(summary.midpoint[0], summary.midpoint[1])}`,
    `- **Antipode of ${nameA}**: ${formatCoordPair(antiLat, antiLon)}`,
  ].join('\n');
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

export interface OceanDepthPhysics {
  pressureAtm: number;
  pressureMPa: number;
  lightZone: 'epipelagic' | 'mesopelagic' | 'bathypelagic' | 'abyssopelagic' | 'hadal';
}

/**
 * Hydrostatic seawater pressure and pelagic light zone at `depthM` meters below sea level:
 * - `pressureAtm`: total ambient pressure in standard atmospheres (~1 atm per 10.06 m seawater + 1 atm surface)
 * - `pressureMPa`: ambient pressure in megapascals (MPa)
 * - `lightZone`: standard oceanography pelagic depth zone
 */
export function oceanDepthPhysics(depthM: number): OceanDepthPhysics {
  const d = Math.max(0, Math.min(12000, Number.isFinite(depthM) ? depthM : 0));
  const pressureAtm = Math.round((1 + d / 10.06) * 10) / 10;
  const pressureMPa = Math.round(pressureAtm * 0.101325 * 10) / 10;
  const lightZone: OceanDepthPhysics['lightZone'] =
    d < 200 ? 'epipelagic'
    : d < 1000 ? 'mesopelagic'
    : d < 4000 ? 'bathypelagic'
    : d < 6000 ? 'abyssopelagic'
    : 'hadal';
  return { pressureAtm, pressureMPa, lightZone };
}

export interface EarthRotationPhysics {
  linearSpeedKmh: number;
  coriolisPerSec: number;
  deflection: 'right' | 'left' | 'none';
}

/**
 * Earth's rotational linear surface speed (`1674.4 · cos φ km/h`) and Coriolis parameter (`2Ω sin φ`)
 * at geographic latitude `latDeg`.
 */
export function earthRotationPhysics(latDeg: number): EarthRotationPhysics {
  const clamped = Math.max(-90, Math.min(90, Number.isFinite(latDeg) ? latDeg : 0));
  const rad = (clamped * Math.PI) / 180;
  const linearSpeedKmh = Math.max(0, Math.round(1674.4 * Math.cos(rad)));
  const coriolisPerSec = Math.round(2 * 7.2921159e-5 * Math.sin(rad) * 1e7) / 1e7;
  const deflection: EarthRotationPhysics['deflection'] =
    clamped > 0.5 ? 'right' : clamped < -0.5 ? 'left' : 'none';
  return { linearSpeedKmh, coriolisPerSec, deflection };
}

