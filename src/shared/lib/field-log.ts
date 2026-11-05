import { BY_KEY } from '../data/catalogue.ts';
import { CONTINENT_NAMES, type Continent } from '../data/iso.ts';
import { PASSPORTS, bookProgress } from '../data/passports.ts';
import { tr, type CatalogueItem } from '../data/types.ts';
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
  dexCount: number;
  logsCount: number;
  foundCount: number;
  stickersCount: number;
  lessonsCompleted: number;
}

export function computeExplorerStats(progress: Progress, journal?: LessonJournal): ExplorerStats {
  const continents = new Set<Continent>();
  const countries = new Set<string>();
  let northernmost: CatalogueItem | null = null;
  let southernmost: CatalogueItem | null = null;

  for (const key of Object.keys(progress.seen)) {
    const it = BY_KEY.get(key);
    if (!it) continue;
    if (VALID_CONTINENTS.has(it.continent as Continent)) {
      continents.add(it.continent as Continent);
    }
    if (it.country) {
      countries.add(it.country);
    }
    if (!it.route && Number.isFinite(it.lat)) {
      if (!northernmost || it.lat > northernmost.lat) northernmost = it;
      if (!southernmost || it.lat < southernmost.lat) southernmost = it;
    }
  }

  const lessonsCompleted = journal && isLessonJournal(journal)
    ? Object.values(journal).filter(e => e.completedAt !== null).length
    : 0;

  return {
    stampsCount: Object.keys(progress.seen).length,
    continentsVisited: [...continents],
    countriesVisited: [...countries].sort(),
    northernmost,
    southernmost,
    dexCount: Object.keys(progress.dex).length,
    logsCount: Object.keys(progress.logs).length,
    foundCount: Object.keys(progress.found).length,
    stickersCount: Object.keys(progress.stickers).length,
    lessonsCompleted,
  };
}

export function formatFieldLogMarkdown(
  progress: Progress,
  journal: LessonJournal | undefined,
  lang: 'en' | 'zh',
  nowMs = Date.now(),
): string {
  const stats = computeExplorerStats(progress, journal);
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
