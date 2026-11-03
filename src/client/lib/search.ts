/** Ranked search across the globe catalogue, geographic places (countries, states/provinces, capitals) and space. */
import { CATALOGUE } from '../../shared/data/catalogue.ts';
import { SUB_ZH } from '../../shared/data/subs.ts';
import { ALIASES } from '../../shared/data/aliases.ts';
import { CHINA_CAPITALS } from '../../shared/data/china-capitals.ts';
import { CONTINENT_NAMES } from '../../shared/data/iso.ts';
import { norm, scoreTerms } from '../../shared/lib/search.ts';
import type { CatalogueItem, Lang } from '../../shared/data/types.ts';
import type { SpaceHit } from '../solar/space-index.ts';
import type { CountryInfo } from '../globe/painter.ts';
import { adminName, type AdminArea } from '../globe/admin.ts';
import { countryName } from './i18n.ts';

export interface PlaceHit {
  key: string;
  placeKind: 'country' | 'state' | 'capital';
  emoji: string;
  name: { en: string; zh: string };
  sub: { en: string; zh: string };
  lat: number;
  lon: number;
  h: number;
  needsStates?: boolean;
}

export type SearchHit =
  | { kind: 'item'; item: CatalogueItem; score: number }
  | { kind: 'space'; hit: SpaceHit; score: number }
  | { kind: 'place'; hit: PlaceHit; score: number };

export type SearchFilter = 'all' | 'space' | CatalogueItem['type'];

export interface SearchPlaces {
  countries?: readonly CountryInfo[];
  regions?: readonly AdminArea[];
}

export function searchAll(
  query: string,
  l: Lang,
  space: SpaceHit[] | null,
  filter: SearchFilter = 'all',
  places?: SearchPlaces,
): SearchHit[] {
  const q = norm(query);
  const out: SearchHit[] = [];
  if (filter !== 'space') {
    for (const item of CATALOGUE) {
      if (filter !== 'all' && item.type !== filter) continue;
      const score = q ? scoreTerms(q, {
        names: [item.name.en, item.name.zh ?? ''],
        aliases: ALIASES[item.key],
        other: [countryName(item.country, l), countryName(item.country, 'en'), item.sub, SUB_ZH[item.sub] ?? ''],
      }) : 1;
      if (score > 0) out.push({ kind: 'item', item, score });
    }
  }
  if (filter === 'all' && q) {
    const seenCountries = new Set<string>();
    for (const c of places?.countries ?? []) {
      const key = c.a2 || c.name;
      if (!key || seenCountries.has(key)) continue;
      seenCountries.add(key);
      const en = c.a2 && c.a2 !== 'XK' ? countryName(c.a2, 'en') || c.name : c.name;
      const zh = c.a2 && c.a2 !== 'XK' ? countryName(c.a2, 'zh') || c.name : c.name;
      const score = scoreTerms(q, { names: [en, zh, c.name], aliases: c.a2 ? [c.a2] : undefined });
      if (score > 0) {
        const cont = CONTINENT_NAMES[c.continent] ?? { en: 'Earth', zh: '地球' };
        const h = Math.max(0.28, Math.min(1.15, Math.sqrt(Math.max(1, c.area)) * 0.032));
        out.push({
          kind: 'place',
          score: score - 0.1,
          hit: { key: 'country:' + key, placeKind: 'country', emoji: '🧭', name: { en, zh }, sub: cont, lat: c.lat, lon: c.lon, h },
        });
      }
    }
    for (const area of places?.regions ?? []) {
      const en = adminName(area, 'en') ?? '', zh = adminName(area, 'zh') || en;
      const score = scoreTerms(q, { names: [en, zh], aliases: area.code ? [area.code] : undefined });
      if (score > 0) {
        const cEn = countryName(area.country, 'en') || area.country;
        const cZh = countryName(area.country, 'zh') || area.country;
        const h = Math.max(0.12, Math.min(0.55, Math.sqrt(Math.max(0.5, area.area)) * 0.04));
        out.push({
          kind: 'place',
          score: score - 0.2,
          hit: { key: 'state:' + area.code, placeKind: 'state', emoji: '🗺️', name: { en, zh }, sub: { en: cEn, zh: cZh }, lat: area.lat, lon: area.lon, h, needsStates: true },
        });
      }
    }
    for (const cap of CHINA_CAPITALS) {
      const score = scoreTerms(q, { names: [cap.en, cap.zh] });
      if (score > 0) {
        out.push({
          kind: 'place',
          score: score - 0.15,
          hit: {
            key: 'capital:' + cap.code,
            placeKind: 'capital',
            emoji: '🏛️',
            name: { en: cap.en, zh: cap.zh },
            sub: { en: 'China', zh: '中国' },
            lat: cap.lat,
            lon: cap.lon,
            h: 0.32,
            needsStates: true,
          },
        });
      }
    }
  }
  if (space && (filter === 'space' || (filter === 'all' && q))) {
    for (const hit of space) {
      const score = q ? scoreTerms(q, { names: [hit.name.en, hit.name.zh ?? ''], aliases: ALIASES[hit.key] }) : 1;
      if (score > 0) out.push({ kind: 'space', hit, score });
    }
  }
  // Stable: equal scores keep catalogue order, globe before space.
  return q ? out.sort((a, b) => b.score - a.score) : out;
}
