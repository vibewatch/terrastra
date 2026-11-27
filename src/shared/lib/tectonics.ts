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
  return {
    boundaryKind: boundaryDistanceKm > INTRAPLATE_THRESHOLD_KM ? 'intraplate' : bestKind,
    boundaryName: bestName,
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
}

/** Computes aggregate seismic energy, TNT equivalent, peak magnitude, and plate-boundary ratio for a feed. */
export function summarizeQuakeFeed(
  events: readonly { mag: number; lat: number; lon: number }[],
): QuakeFeedSummary | null {
  if (!events.length) return null;
  let maxMag = -Infinity;
  let totalEnergyJoules = 0;
  let boundaryCount = 0;
  for (const q of events) {
    if (q.mag > maxMag) maxMag = q.mag;
    totalEnergyJoules += quakeEnergyJoules(q.mag);
    const tec = analyzeQuakeTectonics(q.lat, q.lon);
    if (tec.boundaryKind !== 'intraplate') boundaryCount++;
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
        `- **地震统计（共 ${sum.count} 次）**：最大 M${sum.maxMag.toFixed(1)} · 总辐射能量 ${sum.energyLabel}（约 ${sum.tntTons.toLocaleString('zh-CN')} 吨 TNT）· ${sum.plateBoundaryPct}% 位于板块边界带`,
      );
      lines.push('', '## 显著地震事件');
      for (const q of top) {
        const tec = analyzeQuakeTectonics(q.lat, q.lon);
        const tag = isSubductionMegathrustCandidate(q.mag, q.depthKm, tec.boundaryKind) ? ' · 🌊 浅源俯冲带警示' : '';
        lines.push(`- **M${q.mag.toFixed(1)}** ${q.place}（震源深度 ${Math.round(q.depthKm)} km · ${tec.boundaryName}${tag}）`);
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
      `- **Seismic feed (${sum.count} events)**: Peak M${sum.maxMag.toFixed(1)} · Radiated energy ${sum.energyLabel} (~${sum.tntTons.toLocaleString('en-US')} t TNT) · ${sum.plateBoundaryPct}% near plate boundaries`,
    );
    lines.push('', '## Notable Seismic Events');
    for (const q of top) {
      const tec = analyzeQuakeTectonics(q.lat, q.lon);
      const tag = isSubductionMegathrustCandidate(q.mag, q.depthKm, tec.boundaryKind) ? ' · 🌊 Shallow subduction zone' : '';
      lines.push(`- **M${q.mag.toFixed(1)}** ${q.place} (depth ${Math.round(q.depthKm)} km · ${tec.boundaryName}${tag})`);
    }
  }
  return lines.join('\n');
}

