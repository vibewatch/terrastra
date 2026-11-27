import { BY_KEY } from '../data/catalogue.ts';
import { CONTINENT_NAMES, type Continent } from '../data/iso.ts';
import { PASSPORTS, bookProgress } from '../data/passports.ts';
import { tr, type CatalogueItem } from '../data/types.ts';
import { haversineKm, latLonToVec } from './geo.ts';
import { formatCoordPair } from './geodesic.ts';
import { isLessonJournal, type LessonJournal } from './journal.ts';
import type { Progress } from './progress.ts';

const VALID_CONTINENTS = new Set<Continent>([
  'africa',
  'europe',
  'asia',
  'north-america',
  'south-america',
  'oceania',
  'antarctica',
]);

export interface ExplorerStats {
  stampsCount: number;
  continentsVisited: Continent[];
  countriesVisited: string[];
  northernmost: CatalogueItem | null;
  southernmost: CatalogueItem | null;
  highestPeak: CatalogueItem | null;
  deepestSpot: CatalogueItem | null;
  antipodalSpanKm: number;
  antipodalPair: [CatalogueItem, CatalogueItem] | null;
  dexCount: number;
  logsCount: number;
  foundCount: number;
  stickersCount: number;
  lessonsCompleted: number;
  quizAnswered: number;
  quizAccuracyPct: number | null;
  dailyPlayed: number;
  dailyMaxStreak: number;
}

export function computeExplorerStats(
  progress: Progress,
  journal?: LessonJournal,
  lessonsDone?: readonly string[],
): ExplorerStats {
  const continents = new Set<Continent>();
  const countries = new Set<string>();
  let northernmost: CatalogueItem | null = null;
  let southernmost: CatalogueItem | null = null;
  let highestPeak: CatalogueItem | null = null;
  let deepestSpot: CatalogueItem | null = null;
  const fixedPts: { it: CatalogueItem; v: [number, number, number] }[] = [];

  for (const key of Object.keys(progress.seen)) {
    const it = BY_KEY.get(key);
    if (!it) continue;
    if (VALID_CONTINENTS.has(it.continent as Continent)) {
      continents.add(it.continent as Continent);
    }
    if (it.country) {
      countries.add(it.country);
    }
    if (!it.route && Number.isFinite(it.lat) && Number.isFinite(it.lon)) {
      if (!northernmost || it.lat > northernmost.lat) northernmost = it;
      if (!southernmost || it.lat < southernmost.lat) southernmost = it;
      const h = it.facts?.heightM;
      if (typeof h === 'number' && h > 0 && (!highestPeak || h > (highestPeak.facts?.heightM ?? 0))) {
        highestPeak = it;
      }
      const d = it.facts?.depthM;
      if (typeof d === 'number' && d > 0 && (!deepestSpot || d > (deepestSpot.facts?.depthM ?? 0))) {
        deepestSpot = it;
      }
      fixedPts.push({ it, v: latLonToVec(it.lat, it.lon) });
    }
  }

  let antipodalSpanKm = 0;
  let antipodalPair: [CatalogueItem, CatalogueItem] | null = null;
  if (fixedPts.length >= 2) {
    let minDot = Infinity;
    let bestI = 0;
    let bestJ = 1;
    for (let i = 0; i < fixedPts.length; i++) {
      const [ax, ay, az] = fixedPts[i].v;
      for (let j = i + 1; j < fixedPts.length; j++) {
        const [bx, by, bz] = fixedPts[j].v;
        const dot = ax * bx + ay * by + az * bz;
        if (dot < minDot) {
          minDot = dot;
          bestI = i;
          bestJ = j;
        }
      }
    }
    const a = fixedPts[bestI].it;
    const b = fixedPts[bestJ].it;
    antipodalPair = [a, b];
    antipodalSpanKm = Math.round(haversineKm(a.lat, a.lon, b.lat, b.lon));
  }

  const completedSet = new Set<string>();
  if (journal && isLessonJournal(journal)) {
    for (const e of Object.values(journal)) {
      if (e.completedAt !== null) completedSet.add(e.id);
    }
  }
  if (Array.isArray(lessonsDone)) {
    for (const id of lessonsDone) {
      if (typeof id === 'string' && id.length > 0 && id.length <= 64) completedSet.add(id);
    }
  }
  const lessonsCompleted = completedSet.size;

  const quizAnswered = Math.max(0, progress.quiz?.answered ?? 0);
  const quizCorrect = Math.min(quizAnswered, Math.max(0, progress.quiz?.correct ?? 0));
  const quizAccuracyPct = quizAnswered > 0 ? Math.round((quizCorrect / quizAnswered) * 100) : null;
  const dailyPlayed = Math.max(0, progress.daily?.played ?? 0);
  const dailyMaxStreak = Math.max(0, progress.daily?.maxStreak ?? 0);

  return {
    stampsCount: Object.keys(progress.seen).length,
    continentsVisited: [...continents],
    countriesVisited: [...countries].sort(),
    northernmost,
    southernmost,
    highestPeak,
    deepestSpot,
    antipodalSpanKm,
    antipodalPair,
    dexCount: Object.keys(progress.dex).length,
    logsCount: Object.keys(progress.logs).length,
    foundCount: Object.keys(progress.found).length,
    stickersCount: Object.keys(progress.stickers).length,
    lessonsCompleted,
    quizAnswered,
    quizAccuracyPct,
    dailyPlayed,
    dailyMaxStreak,
  };
}

export function formatFieldLogMarkdown(
  progress: Progress,
  journal: LessonJournal | undefined,
  lang: 'en' | 'zh',
  nowMs = Date.now(),
  lessonsDone?: readonly string[],
): string {
  const stats = computeExplorerStats(progress, journal, lessonsDone);
  const dateStr = new Date(nowMs).toISOString().slice(0, 10);
  const isZh = lang === 'zh';
  const lines: string[] = [];

  lines.push(isZh ? `# 寰星探索者野外日志 (${dateStr})` : `# Terrastra Explorer Field Log (${dateStr})`);
  lines.push('');
  lines.push(isZh ? '## 探索概览' : '## Explorer Summary');
  const contNames = stats.continentsVisited.map(c => CONTINENT_NAMES[c]?.[lang] ?? c).join(', ') || '—';
  lines.push(isZh
    ? `- **大洲足迹**: ${stats.continentsVisited.length} / 7 (${contNames})`
    : `- **Continents visited**: ${stats.continentsVisited.length} / 7 (${contNames})`);
  lines.push(isZh
    ? `- **国家/地区**: ${stats.countriesVisited.length}`
    : `- **Countries/regions**: ${stats.countriesVisited.length}`);
  lines.push(isZh
    ? `- **护照印章**: ${stats.stampsCount}`
    : `- **Passport stamps**: ${stats.stampsCount}`);
  lines.push(isZh
    ? `- **图鉴收集**: 动物 ${stats.dexCount} · 发现 ${stats.logsCount} · 物品 ${stats.foundCount} · 贴纸 ${stats.stickersCount}`
    : `- **Collections**: ${stats.dexCount} animals · ${stats.logsCount} discoveries · ${stats.foundCount} items · ${stats.stickersCount} stickers`);
  lines.push(isZh
    ? `- **已完成课程**: ${stats.lessonsCompleted}`
    : `- **Lessons completed**: ${stats.lessonsCompleted}`);

  if (stats.northernmost && stats.southernmost) {
    lines.push('');
    lines.push(isZh ? '## 地理跨度' : '## Geographic Reach');
    lines.push(isZh
      ? `- **最北足迹**: ${stats.northernmost.emoji} ${tr(stats.northernmost.name, lang)} (${formatCoordPair(stats.northernmost.lat, stats.northernmost.lon)})`
      : `- **Northernmost**: ${stats.northernmost.emoji} ${tr(stats.northernmost.name, lang)} (${formatCoordPair(stats.northernmost.lat, stats.northernmost.lon)})`);
    lines.push(isZh
      ? `- **最南足迹**: ${stats.southernmost.emoji} ${tr(stats.southernmost.name, lang)} (${formatCoordPair(stats.southernmost.lat, stats.southernmost.lon)})`
      : `- **Southernmost**: ${stats.southernmost.emoji} ${tr(stats.southernmost.name, lang)} (${formatCoordPair(stats.southernmost.lat, stats.southernmost.lon)})`);
    if (stats.highestPeak && typeof stats.highestPeak.facts?.heightM === 'number') {
      lines.push(isZh
        ? `- **最高海拔**: ${stats.highestPeak.emoji} ${tr(stats.highestPeak.name, lang)} (${Math.round(stats.highestPeak.facts.heightM).toLocaleString()} m)`
        : `- **Highest elevation**: ${stats.highestPeak.emoji} ${tr(stats.highestPeak.name, lang)} (${Math.round(stats.highestPeak.facts.heightM).toLocaleString()} m)`);
    }
    if (stats.deepestSpot && typeof stats.deepestSpot.facts?.depthM === 'number') {
      lines.push(isZh
        ? `- **最深足迹**: ${stats.deepestSpot.emoji} ${tr(stats.deepestSpot.name, lang)} (${Math.round(stats.deepestSpot.facts.depthM).toLocaleString()} m)`
        : `- **Deepest spot**: ${stats.deepestSpot.emoji} ${tr(stats.deepestSpot.name, lang)} (${Math.round(stats.deepestSpot.facts.depthM).toLocaleString()} m)`);
    }
    if (stats.antipodalPair && stats.antipodalSpanKm > 0) {
      const [pa, pb] = stats.antipodalPair;
      lines.push(isZh
        ? `- **最大大圆跨度**: ${stats.antipodalSpanKm.toLocaleString()} km (${pa.emoji} ${tr(pa.name, lang)} ↔ ${pb.emoji} ${tr(pb.name, lang)})`
        : `- **Farthest span**: ${stats.antipodalSpanKm.toLocaleString()} km (${pa.emoji} ${tr(pa.name, lang)} ↔ ${pb.emoji} ${tr(pb.name, lang)})`);
    }
  }

  if (stats.quizAccuracyPct !== null || stats.dailyMaxStreak > 0) {
    lines.push('');
    lines.push(isZh ? '## 挑战掌握度' : '## Challenge Mastery');
    if (stats.quizAccuracyPct !== null) {
      lines.push(isZh
        ? `- **知识问答正确率**: ${stats.quizAccuracyPct}% (${stats.quizAnswered} 题)`
        : `- **Quiz accuracy**: ${stats.quizAccuracyPct}% (${stats.quizAnswered} answered)`);
    }
    if (stats.dailyMaxStreak > 0) {
      lines.push(isZh
        ? `- **每日挑战最高连胜**: ${stats.dailyMaxStreak} 天 (累计参与 ${stats.dailyPlayed} 局)`
        : `- **Daily challenge max streak**: ${stats.dailyMaxStreak}d (${stats.dailyPlayed} played)`);
    }
  }

  lines.push('');
  lines.push(isZh ? '## 护照册进度' : '## Passport Books');
  for (const b of PASSPORTS) {
    const got = bookProgress(b, progress.seen);
    lines.push(`- ${b.emoji} **${tr(b.name, lang)}**: ${got} / ${b.keys.length}`);
  }

  const stamped = Object.entries(progress.seen)
    .map(([k, ts]) => ({ it: BY_KEY.get(k), ts }))
    .filter((x): x is { it: CatalogueItem; ts: number } => Boolean(x.it))
    .sort((a, b) => b.ts - a.ts);

  if (stamped.length > 0) {
    lines.push('');
    lines.push(isZh ? '## 印章记录' : '## Stamp Log');
    for (const { it, ts } of stamped.slice(0, 50)) {
      const d = ts > 0 ? new Date(ts).toISOString().slice(0, 10) : '—';
      lines.push(`- ${it.emoji} **${tr(it.name, lang)}** (${formatCoordPair(it.lat, it.lon)}) — ${d}`);
    }
  }

  return lines.join('\n') + '\n';
}
