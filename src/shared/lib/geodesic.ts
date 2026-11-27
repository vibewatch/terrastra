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

export interface RhumbLineSummary {
  /** Constant-compass-bearing (Mercator straight-line) distance in km. */
  rhumbKm: number;
  /** Constant compass bearing from A to B in degrees [0, 360). */
  rhumbBearingDeg: number;
  rhumbCompassDir: CompassDir8;
  /** Extra distance vs. shortest great-circle arc in km (>= 0). */
  detourKm: number;
}

/**
 * Constant-compass rhumb-line (loxodrome) distance & heading on a spherical Earth (R = 6,371 km).
 * A straight ruler line on a Mercator chart follows a rhumb line, which is ≥ the great-circle path.
 */
export function rhumbLineSummary(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): RhumbLineSummary {
  const distanceKm = haversineKm(a.lat, a.lon, b.lat, b.lon);
  if (distanceKm < 0.01) {
    return { rhumbKm: 0, rhumbBearingDeg: 0, rhumbCompassDir: 'N', detourKm: 0 };
  }
  const D = Math.PI / 180;
  const clampRad = (deg: number) => Math.max(-89.999, Math.min(89.999, deg)) * D;
  const p1 = clampRad(a.lat);
  const p2 = clampRad(b.lat);
  const dPhi = p2 - p1;
  const dLon = wrapLon(b.lon - a.lon) * D;
  const dPsi = Math.log(Math.tan(Math.PI / 4 + p2 / 2) / Math.tan(Math.PI / 4 + p1 / 2));
  const q = Math.abs(dPsi) > 1e-10 ? dPhi / dPsi : Math.cos(p1);
  const rhumbKm = Math.max(distanceKm, Math.hypot(dPhi, q * dLon) * 6371);
  const rhumbBearingDeg = ((Math.atan2(dLon, dPsi) / D) + 360) % 360;
  return {
    rhumbKm,
    rhumbBearingDeg,
    rhumbCompassDir: compassDir8(rhumbBearingDeg),
    detourKm: Math.max(0, rhumbKm - distanceKm),
  };
}

/** Signed latitude of the furthest poleward point reached along the shortest great-circle segment A→B. */
export function greatCirclePeakLatDeg(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const D = Math.PI / 180;
  const toVec = (p: { lat: number; lon: number }): [number, number, number] => {
    const la = p.lat * D, lo = p.lon * D;
    return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  };
  const u = toVec(a), v = toVec(b);
  const dot = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]));
  const omega = Math.acos(dot);
  if (omega < 1e-6 || omega > Math.PI - 1e-6) {
    return Math.abs(a.lat) >= Math.abs(b.lat) ? a.lat : b.lat;
  }
  const ex = v[0] - dot * u[0], ey = v[1] - dot * u[1], ez = v[2] - dot * u[2];
  const eLen = Math.hypot(ex, ey, ez);
  if (eLen < 1e-9) return Math.abs(a.lat) >= Math.abs(b.lat) ? a.lat : b.lat;
  const e2z = ez / eLen;
  let bestZ = Math.abs(u[2]) >= Math.abs(v[2]) ? u[2] : v[2];
  const thetaPeak = Math.atan2(e2z, u[2]);
  for (const cand of [thetaPeak, thetaPeak + Math.PI, thetaPeak - Math.PI]) {
    if (cand > 0 && cand < omega) {
      const z = u[2] * Math.cos(cand) + e2z * Math.sin(cand);
      if (Math.abs(z) > Math.abs(bestZ)) bestZ = z;
    }
  }
  return Math.asin(Math.max(-1, Math.min(1, bestZ))) / D;
}

export interface GreatCircleSummary {
  distanceKm: number;
  chordKm: number;
  circumferencePct: number;
  bearingDeg: number;
  compassDir: CompassDir8;
  midpoint: [number, number];
  solarOffsetHours: number;
  /** Signed latitude of the furthest poleward point along the shortest arc A→B. */
  peakLatDeg: number;
  crossesEquator: boolean;
  crossesDateLine: boolean;
  rhumb: RhumbLineSummary;
  travelHours: {
    walk: number;
    ship: number;
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
  const lonA = wrapLon(a.lon), lonB = wrapLon(b.lon);
  const crossesEquator = (a.lat > 0 && b.lat < 0) || (a.lat < 0 && b.lat > 0);
  const crossesDateLine = Math.abs(lonB - lonA) > 180;
  return {
    distanceKm,
    chordKm,
    circumferencePct: (distanceKm / EARTH_CIRCUMFERENCE_KM) * 100,
    bearingDeg: brg,
    compassDir: compassDir8(brg),
    midpoint: slerpLatLon([a.lat, a.lon], [b.lat, b.lon], 0.5),
    solarOffsetHours: solarTimeOffsetHours(a.lon, b.lon),
    peakLatDeg: greatCirclePeakLatDeg(a, b),
    crossesEquator,
    crossesDateLine,
    rhumb: rhumbLineSummary(a, b),
    travelHours: {
      walk: distanceKm / 5,
      ship: distanceKm / 40,
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
  const locale = l === 'zh' ? 'zh-CN' : 'en-US';
  const km = Math.round(summary.distanceKm).toLocaleString(locale);
  const chord = Math.round(summary.chordKm).toLocaleString(locale);
  const rhumbKm = Math.round(summary.rhumb.rhumbKm).toLocaleString(locale);
  const detourKm = Math.round(summary.rhumb.detourKm).toLocaleString(locale);
  const peakStr = `${Math.abs(summary.peakLatDeg).toFixed(1)}°${summary.peakLatDeg >= 0 ? 'N' : 'S'}`;
  const solar = (summary.solarOffsetHours >= 0 ? '+' : '') + summary.solarOffsetHours.toFixed(1);
  if (l === 'zh') {
    return [
      `# 大圆测距与对跖点实验简报`,
      `- **起点 (A)**：${nameA}（${formatCoordPair(coordA[0], coordA[1])}）`,
      `- **终点 (B)**：${nameB}（${formatCoordPair(coordB[0], coordB[1])}）`,
      `- **球面大圆距离**：${km} km（占地球周长 ${summary.circumferencePct.toFixed(1)}%）`,
      `- **墨卡托恒向线**：${rhumbKm} km${summary.rhumb.detourKm >= 1 ? `（比大圆多绕 ${detourKm} km）` : '（与大圆航线重合）'}`,
      `- **地壳内部直线弦长**：${chord} km`,
      `- **航线最高纬度**：${peakStr}`,
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
    `- **Mercator rhumb line**: ${rhumbKm} km${summary.rhumb.detourKm >= 1 ? ` (+${detourKm} km detour)` : ' (matches great circle)'}`,
    `- **Straight interior chord**: ${chord} km`,
    `- **Highest latitude on arc**: ${peakStr}`,
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

/**
 * Distance to the refracted sea-level horizon (`km`) from observer elevation `heightM` (meters),
 * accounting for standard terrestrial atmospheric refraction (`R_eff ≈ 7/6 · R_Earth` → `d ≈ 3.856 · √h`).
 */
export function geometricHorizonKm(heightM: number): number {
  const h = Math.max(0, Math.min(450_000, Number.isFinite(heightM) ? heightM : 0));
  if (h === 0) return 0;
  return Math.round(3.856 * Math.sqrt(h) * 10) / 10;
}

/**
 * WGS-84 Somigliana normal surface gravitational acceleration `g` (`m/s²`) at latitude `latDeg`
 * and elevation `heightM` (`m`), including centrifugal + oblate relief (`9.780 m/s²` at the Equator
 * vs. `9.832 m/s²` at the Poles) and free-air altitude gradient (`−3.086×10⁻⁶ · h`).
 */
export function normalGravityMps2(
  latDeg: number,
  heightM = 0,
): { gMps2: number; poleDeltaPct: number } {
  const phi = (Math.max(-90, Math.min(90, Number.isFinite(latDeg) ? latDeg : 0)) * Math.PI) / 180;
  const h = Math.max(0, Math.min(100_000, Number.isFinite(heightM) ? heightM : 0));
  const sin2 = Math.sin(phi) ** 2;
  const g0 = (9.7803253359 * (1 + 0.00193185265241 * sin2)) / Math.sqrt(1 - 0.00669437999014 * sin2);
  const g = g0 - 3.086e-6 * h;
  const gPole = 9.8321849378;
  const poleDeltaPct = Math.round(((g - gPole) / gPole) * 10000) / 100;
  return {
    gMps2: Math.round(g * 1000) / 1000,
    poleDeltaPct: Object.is(poleDeltaPct, -0) ? 0 : poleDeltaPct,
  };
}

