import type { GeoKind } from '../data/gazetteer.ts';
import type { CatalogueItem } from '../data/types.ts';

/** Accent-insensitive, whitespace-collapsed lowercase search normalization shared by static encyclopedia pages and unit tests. */
export function foldEncyclopediaText(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Multi-token & optional category-tag matcher used by static encyclopedia filter bars. */
export function matchesEncyclopediaQuery(
  foldedHaystack: string,
  rawQuery: string,
  itemTag = '',
  activeTag = '',
): boolean {
  if (activeTag && itemTag !== activeTag) return false;
  const q = foldEncyclopediaText(rawQuery);
  if (!q) return true;
  const tokens = q.split(' ').filter(Boolean);
  return tokens.every(tok => foldedHaystack.includes(tok));
}

/** Maps a physical-geography GeoKind to its most specific Schema.org Place/Landform/BodyOfWater subtype. */
export function geoSchemaType(kind: GeoKind): string {
  switch (kind) {
    case 'continent': return 'Continent';
    case 'ocean':
    case 'sea':
    case 'strait': return 'BodyOfWater';
    case 'river': return 'RiverBodyOfWater';
    case 'lake': return 'LakeBodyOfWater';
    case 'canal': return 'Canal';
    case 'mountain': return 'Mountain';
    case 'trench':
    case 'plateau':
    case 'plain':
    case 'basin':
    case 'desert':
    case 'rift':
    case 'peninsula':
    case 'island': return 'Landform';
    case 'line': return 'Place';
  }
}

/** Maps a catalogue item type to its most specific Schema.org type. */
export function itemSchemaType(type: CatalogueItem['type'], isRoute: boolean): string {
  if (type === 'landmark') return 'LandmarksOrHistoricalBuildings';
  if (type === 'person') return 'Person';
  if (type === 'festival') return 'Event';
  if (!isRoute && type === 'volcano') return 'Volcano';
  if (!isRoute && type === 'discovery') return 'Place';
  return 'Thing';
}

export interface LlmsSectionInfo {
  dir: string;
  titleEn: string;
  titleZh?: string;
  hintEn: string;
  count: number;
}

export interface LlmsLessonInfo {
  id: string;
  kind: 'geo' | 'astro';
  titleEn: string;
  titleZh: string;
  free: boolean;
}

/** Builds a clean, structured `/llms.txt` index describing Terrastra's bilingual encyclopedia & interactive 3D curriculum. */
export function buildLlmsTxt(opts: {
  site: string;
  totalItems: number;
  geoCount: number;
  sections: readonly LlmsSectionInfo[];
  lessons: readonly LlmsLessonInfo[];
}): string {
  const site = opts.site.replace(/\/$/, '');
  const allCount = opts.totalItems + opts.geoCount;
  const lines: string[] = [
    '# Terrastra · 寰星',
    '',
    `> Terrastra (${site}/) is a bilingual (English / Simplified Chinese) interactive 3D Earth globe, Solar System & deep-cosmos explorer, Sky Theatre ephemeris simulator, 2D map projection laboratory, and interactive school geography & astronomy classroom with ${allCount} crawlable encyclopedia entries.`,
    '',
    '## Core Interactive Views',
    `- [Interactive 3D Globe](${site}/): Spin Earth, inspect 3D procedural landmarks, animals, volcanoes, tectonic plates, live earthquakes, ISS telemetry, and world radio.`,
    `- [2D World Map & Projection Lab](${site}/#map): Compare Equal Earth, Mercator, and Plate Carrée projections with live Tissot distortion and geodesic vs. rhumb-line measurement.`,
    `- [Solar System to Cosmic Web](${site}/#solar): Continuous scale ladder from planets and moons to nearby stars, the Milky Way, Local Group, Laniakea, and the observable universe.`,
    `- [Sky Theatre](${site}/#sky): Accurate solar/lunar eclipses, meteor showers, planetary conjunctions, twilight & Messier deep-sky planner.`,
    `- [About & Data Credits](${site}/about/)`,
    `- [Privacy Policy](${site}/privacy/)`,
    '',
    '## Bilingual Encyclopedia Sections',
    `- [Encyclopedia Hub](${site}/encyclopedia/): Cross-catalogue index (${allCount} entries in English & Simplified Chinese).`,
    ...opts.sections.map(s =>
      `- [${s.titleEn}${s.titleZh ? ` · ${s.titleZh}` : ''}](${site}/${s.dir}/): ${s.count} entries — ${s.hintEn}`,
    ),
    `- [Physical Geography · 自然地理](${site}/geography/): ${opts.geoCount} entries — Continents, oceans, seas, trenches, straits, mountain ranges, plateaus, plains, basins, deserts, rift valleys, major rivers, and lakes.`,
  ];

  if (opts.lessons.length) {
    const freeLessons = opts.lessons.filter(l => l.free);
    const proLessons = opts.lessons.filter(l => !l.free);
    lines.push('', `## Interactive 3D Geography & Astronomy Lessons (${opts.lessons.length} lessons; ${freeLessons.length} free, ${proLessons.length} Pro)`);
    for (const ls of opts.lessons) {
      const route = ls.kind === 'astro' ? `#astro/${ls.id}` : `#lesson/${ls.id}`;
      lines.push(`- [${ls.titleEn} · ${ls.titleZh}](${site}/${route}) (${ls.free ? 'Free' : 'Explorer Pro'})`);
    }
  }

  lines.push('', `## Sitemap`, `- [XML Sitemap](${site}/sitemap.xml)`, '');
  return lines.join('\n');
}
