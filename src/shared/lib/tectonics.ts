import { PLATE_BOUNDARIES } from '../data/plates.ts';
import { CATALOGUE } from '../data/catalogue.ts';
import type { CatalogueItem } from '../data/types.ts';
import { haversineKm, latLonToVec } from './geo.ts';

const R_KM = 6371;
const INTRAPLATE_THRESHOLD_KM = 650;
const VOLCANO_RADIUS_KM = 700;
const VOLCANOES = CATALOGUE.filter(v => v.type === 'volcano' || v.sub === 'volcano');

export type TectonicSettingKind = 'trench' | 'ridge' | 'collision' | 'transform' | 'rift' | 'intraplate';

export interface QuakeTectonicContext {
  boundaryKind: TectonicSettingKind;
  boundaryName: string;
  boundaryNameZh: string;
  rateMmYr?: number;
  boundaryDistanceKm: number;
  nearestVolcano: { item: CatalogueItem; distanceKm: number } | null;
}

/** Great-circle distance in km from point P(lat, lon) to great-circle segment AB. */
export function pointToSegmentKm(
  lat: number,
  lon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const p = latLonToVec(lat, lon);
  const a = latLonToVec(aLat, aLon);
  const b = latLonToVec(bLat, bLon);
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const abLen2 = abx * abx + aby * aby + abz * abz;
  let t = 0;
  if (abLen2 > 1e-12) {
    const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
    t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / abLen2));
  }
  const cx = a[0] + t * abx, cy = a[1] + t * aby, cz = a[2] + t * abz;
  const cLen = Math.hypot(cx, cy, cz) || 1;
  const dot = Math.max(-1, Math.min(1, (p[0] * cx + p[1] * cy + p[2] * cz) / cLen));
  return R_KM * Math.acos(dot);
}

export function analyzeQuakeTectonics(lat: number, lon: number): QuakeTectonicContext {
  let bestKind: Exclude<TectonicSettingKind, 'intraplate'> = 'trench';
  let bestName = PLATE_BOUNDARIES[0]?.name ?? 'Plate boundary';
  let bestNameZh = PLATE_BOUNDARIES[0]?.nameZh ?? '板块边界';
  let bestRate: number | undefined = PLATE_BOUNDARIES[0]?.rateMmYr;
  let bestKm = Infinity;

  for (const b of PLATE_BOUNDARIES) {
    const pts = b.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const [aLat, aLon] = pts[i];
      const [bLat, bLon] = pts[i + 1];
      const d = pointToSegmentKm(lat, lon, aLat, aLon, bLat, bLon);
      if (d < bestKm) {
        bestKm = d;
        bestKind = b.kind;
        bestName = b.name;
        bestNameZh = b.nameZh;
        bestRate = b.rateMmYr;
      }
    }
  }

  let nearVolcano: { item: CatalogueItem; distanceKm: number } | null = null;
  let bestVolcKm = VOLCANO_RADIUS_KM;
  for (const v of VOLCANOES) {
    const d = haversineKm(lat, lon, v.lat, v.lon);
    if (d <= bestVolcKm) {
      bestVolcKm = d;
      nearVolcano = { item: v, distanceKm: Math.round(d) };
    }
  }

  const boundaryDistanceKm = Math.round(bestKm);
  const isIntraplate = boundaryDistanceKm > INTRAPLATE_THRESHOLD_KM;
  return {
    boundaryKind: isIntraplate ? 'intraplate' : bestKind,
    boundaryName: bestName,
    boundaryNameZh: bestNameZh,
    rateMmYr: isIntraplate ? undefined : bestRate,
    boundaryDistanceKm,
    nearestVolcano: nearVolcano,
  };
}

const JOULES_PER_TON_TNT = 4.184e9;

/** Gutenberg–Richter radiated seismic energy in Joules: E = 10^(4.8 + 1.5 * M). */
export function quakeEnergyJoules(mag: number): number {
  const m = Math.max(-2, Math.min(10, mag));
  return Math.pow(10, 4.8 + 1.5 * m);
}

/** Formats an energy in Joules using SI prefixes (MJ, GJ, TJ, PJ). */
export function formatEnergyJoules(joules: number): string {
  if (joules >= 1e15) return `${(joules / 1e15).toFixed(1)} PJ`;
  if (joules >= 1e12) return `${(joules / 1e12).toFixed(1)} TJ`;
  if (joules >= 1e9) return `${(joules / 1e9).toFixed(1)} GJ`;
  return `${Math.max(1, Math.round(joules / 1e6))} MJ`;
}

export interface QuakeFeedSummary {
  count: number;
  maxMag: number;
  totalEnergyJoules: number;
  energyLabel: string;
  tntTons: number;
  plateBoundaryPct: number;
  shallowCount: number;
  intermediateCount: number;
  deepCount: number;
  megathrustCount: number;
}

/** Computes aggregate seismic energy, TNT equivalent, peak magnitude, depth-band counts, and plate-boundary ratio for a feed. */
export function summarizeQuakeFeed(
  events: readonly { mag: number; lat: number; lon: number; depthKm?: number }[],
): QuakeFeedSummary | null {
  if (!events.length) return null;
  let maxMag = -Infinity;
  let totalEnergyJoules = 0;
  let boundaryCount = 0;
  let shallowCount = 0;
  let intermediateCount = 0;
  let deepCount = 0;
  let megathrustCount = 0;
  for (const q of events) {
    if (q.mag > maxMag) maxMag = q.mag;
    totalEnergyJoules += quakeEnergyJoules(q.mag);
    const d = q.depthKm ?? 15;
    if (d < 70) shallowCount++;
    else if (d <= 300) intermediateCount++;
    else deepCount++;
    const tec = analyzeQuakeTectonics(q.lat, q.lon);
    if (tec.boundaryKind !== 'intraplate') boundaryCount++;
    if (isSubductionMegathrustCandidate(q.mag, d, tec.boundaryKind)) megathrustCount++;
  }
  const tntTons = Math.max(0.1, Math.round((totalEnergyJoules / JOULES_PER_TON_TNT) * 10) / 10);
  const plateBoundaryPct = Math.round((boundaryCount / events.length) * 100);
  return {
    count: events.length,
    maxMag: Math.round(maxMag * 10) / 10,
    totalEnergyJoules,
    energyLabel: formatEnergyJoules(totalEnergyJoules),
    tntTons,
    plateBoundaryPct,
    shallowCount,
    intermediateCount,
    deepCount,
    megathrustCount,
  };
}

export type FocalDepthRegime = 'crustal' | 'upperMantleSlab' | 'transitionZoneSlab';

/** Classifies earthquake focal depth into lithospheric crust (<70 km), Wadati–Benioff upper-mantle slab (70–300 km), or mantle transition-zone slab (>300 km). */
export function focalDepthRegime(depthKm: number): FocalDepthRegime {
  const d = Math.max(0, Number.isFinite(depthKm) ? depthKm : 0);
  if (d < 70) return 'crustal';
  if (d <= 300) return 'upperMantleSlab';
  return 'transitionZoneSlab';
}

/**
 * Long-wavelength shallow-water tsunami phase speed `c = √(g·h)` at ocean depth `oceanDepthM` (meters).
 * Over a typical 4,000 m abyssal plain, a tsunami races at ~198 m/s (~713 km/h), comparable to a commercial jetliner.
 */
export function tsunamiWaveSpeedKmh(oceanDepthM = 4000): { speedMs: number; speedKmh: number } {
  const h = Math.max(10, Math.min(11000, Number.isFinite(oceanDepthM) ? oceanDepthM : 4000));
  const speedMs = Math.sqrt(9.80665 * h);
  return {
    speedMs: Math.round(speedMs * 10) / 10,
    speedKmh: Math.round(speedMs * 3.6),
  };
}

/**
 * Identifies shallow (<= 70 km), strong (M >= 6.0) oceanic-trench events —
 * the textbook subduction megathrust setting associated with seafloor uplift and tsunami hazard.
 */
export function isSubductionMegathrustCandidate(
  mag: number,
  depthKm: number,
  boundaryKind: TectonicSettingKind,
): boolean {
  return boundaryKind === 'trench' && mag >= 6.0 && depthKm <= 70;
}

const MMI_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X+'] as const;
export type MmiRoman = typeof MMI_ROMAN[number];

/**
 * Estimates epicentral Modified Mercalli Intensity (`MMI I`..`X+`) from magnitude `mag`
 * and focal depth `depthKm` using hypocentral geometric spreading (`R = hypot(depthKm, 10)`).
 */
export function estimateEpicentralMmi(mag: number, depthKm: number): { mmi: number; roman: MmiRoman } {
  const m = Math.max(0, Math.min(10, Number.isFinite(mag) ? mag : 0));
  const d = Math.max(1, Math.min(800, Number.isFinite(depthKm) ? depthKm : 10));
  const hypKm = Math.hypot(d, 10);
  const raw = 1.5 * m - 3.5 * Math.log10(hypKm) + 3.0;
  const mmi = Math.max(1, Math.min(10, Math.round(raw)));
  return { mmi, roman: MMI_ROMAN[mmi - 1] };
}

/**
 * Estimates crustal/upper-mantle P-wave (`~6.2 km/s`) and S-wave (`~3.6 km/s`) travel times
 * and `S−P` arrival lag in seconds for epicentral surface distance `distanceKm` and `depthKm`.
 */
export function seismicWaveArrivalSec(
  distanceKm: number,
  depthKm = 15,
): { pSec: number; sSec: number; spLagSec: number } {
  const hypKm = Math.hypot(Math.max(0, distanceKm), Math.max(0, depthKm));
  const pSec = Math.round((hypKm / 6.2) * 10) / 10;
  const sSec = Math.round((hypKm / 3.6) * 10) / 10;
  const spLagSec = Math.round((sSec - pSec) * 10) / 10;
  return { pSec, sSec, spLagSec };
}

export interface LiveEarthBriefInput {
  lang: 'en' | 'zh';
  kp: number;
  issCoord: string;
  issVelocityKmh: number;
  subsolarCoord: string;
  declinationDeg: number;
  events: readonly { mag: number; depthKm: number; place: string; lat: number; lon: number }[];
}

/** Formats a bilingual Markdown classroom lab briefing from Live Earth telemetry. */
export function formatLiveEarthBriefMarkdown(input: LiveEarthBriefInput): string {
  const { lang: l, kp, issCoord, issVelocityKmh, subsolarCoord, declinationDeg, events } = input;
  const sum = summarizeQuakeFeed(events);
  const decl = (declinationDeg >= 0 ? '+' : '') + declinationDeg.toFixed(1) + '°';
  const top = [...events].sort((a, b) => b.mag - a.mag).slice(0, 5);
  if (l === 'zh') {
    const lines = [
      '# 实时地球科学监测简报',
      `- **行星地磁 Kp 指数**：Kp ${kp.toFixed(1)}`,
      `- **国际空间站 (ISS)**：${issCoord}（${Math.round(issVelocityKmh).toLocaleString('zh-CN')} km/h）`,
      `- **太阳直射点**：${subsolarCoord}（赤纬 ${decl}）`,
    ];
    if (sum) {
      lines.push(
        `- **地震统计（共 ${sum.count} 次）**：最大 M${sum.maxMag.toFixed(1)} · 总辐射能量 ${sum.energyLabel}（约 ${sum.tntTons.toLocaleString('zh-CN')} 吨 TNT）· ${sum.plateBoundaryPct}% 位于板块边界带（浅源 ${sum.shallowCount} / 中源 ${sum.intermediateCount} / 深源 ${sum.deepCount}）`,
      );
      lines.push('', '## 显著地震事件');
      for (const q of top) {
        const tec = analyzeQuakeTectonics(q.lat, q.lon);
        const mmi = estimateEpicentralMmi(q.mag, q.depthKm);
        const rateTxt = tec.rateMmYr ? ` ~${tec.rateMmYr} mm/年` : '';
        const tsu = isSubductionMegathrustCandidate(q.mag, q.depthKm, tec.boundaryKind)
          ? ` · 🌊 浅源俯冲带警示（深海海啸波速约 ${tsunamiWaveSpeedKmh(4000).speedKmh} km/h）`
          : '';
        lines.push(`- **M${q.mag.toFixed(1)}**（震中烈度 MMI ${mmi.roman}）${q.place}（震源深度 ${Math.round(q.depthKm)} km · ${tec.boundaryNameZh}${rateTxt}${tsu}）`);
      }
    }
    return lines.join('\n');
  }
  const lines = [
    '# Live Earth Telemetry Briefing',
    `- **Planetary geomagnetic index**: Kp ${kp.toFixed(1)}`,
    `- **ISS orbital position**: ${issCoord} (${Math.round(issVelocityKmh).toLocaleString('en-US')} km/h)`,
    `- **Subsolar zenith**: ${subsolarCoord} (declination ${decl})`,
  ];
  if (sum) {
    lines.push(
      `- **Seismic feed (${sum.count} events)**: Peak M${sum.maxMag.toFixed(1)} · Radiated energy ${sum.energyLabel} (~${sum.tntTons.toLocaleString('en-US')} t TNT) · ${sum.plateBoundaryPct}% near plate boundaries (${sum.shallowCount} shallow / ${sum.intermediateCount} inter. / ${sum.deepCount} deep)`,
    );
    lines.push('', '## Notable Seismic Events');
    for (const q of top) {
      const tec = analyzeQuakeTectonics(q.lat, q.lon);
      const mmi = estimateEpicentralMmi(q.mag, q.depthKm);
      const rateTxt = tec.rateMmYr ? ` ~${tec.rateMmYr} mm/yr` : '';
      const tsu = isSubductionMegathrustCandidate(q.mag, q.depthKm, tec.boundaryKind)
        ? ` · 🌊 Shallow subduction zone (abyssal tsunami ~${tsunamiWaveSpeedKmh(4000).speedKmh} km/h)`
        : '';
      lines.push(`- **M${q.mag.toFixed(1)}** (MMI ${mmi.roman}) ${q.place} (depth ${Math.round(q.depthKm)} km · ${tec.boundaryName}${rateTxt}${tsu})`);
    }
  }
  return lines.join('\n');
}

