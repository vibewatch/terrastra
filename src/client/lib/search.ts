/** Ranked search across the globe catalogue, textbook physical-geography gazetteer, administrative places, world cities and space. */
import { CATALOGUE } from '../../shared/data/catalogue.ts';
import { SUB_ZH } from '../../shared/data/subs.ts';
import { ALIASES } from '../../shared/data/aliases.ts';
import { CHINA_CAPITALS } from '../../shared/data/china-capitals.ts';
import { CITIES, CITY_ZH } from '../../shared/data/cities.ts';
import { GAZETTEER, GAZETTEER_BY_KEY, type GeoKind } from '../../shared/data/gazetteer.ts';
import { CONTINENT_NAMES } from '../../shared/data/iso.ts';
import { matchedAlias, norm, scoreTerms } from '../../shared/lib/search.ts';
import type { CatalogueItem, Lang } from '../../shared/data/types.ts';
import type { SpaceHit } from '../solar/space-index.ts';
import type { CountryInfo } from '../globe/painter.ts';
import { adminName, type AdminArea } from '../globe/admin.ts';
import { countryName } from './i18n.ts';

export type PlaceKind = 'country' | 'state' | 'capital' | 'city' | GeoKind;

export interface PlaceHit {
  key: string;
  placeKind: PlaceKind;
  emoji: string;
  name: { en: string; zh: string };
  sub: { en: string; zh: string };
  lat: number;
  lon: number;
  h: number;
  needsStates?: boolean;
  isGeo?: boolean;
  desc?: { en: string; zh: string };
  fact?: { en: string; zh: string };
  wiki?: readonly [string, string];
}

export type SearchHit =
  | { kind: 'item'; item: CatalogueItem; score: number; alias?: string }
  | { kind: 'space'; hit: SpaceHit; score: number; alias?: string }
  | { kind: 'place'; hit: PlaceHit; score: number; alias?: string };

export type SearchFilter = 'all' | 'geo' | 'space' | CatalogueItem['type'];

export interface SearchPlaces {
  countries?: readonly CountryInfo[];
  regions?: readonly AdminArea[];
}

const CHINA_CAP_NORMS = new Set(CHINA_CAPITALS.flatMap(c => [norm(c.en), norm(c.zh)]));

export function gazetteerToPlaceHit(g: (typeof GAZETTEER)[number]): PlaceHit {
  return {
    key: g.key,
    placeKind: g.kind,
    emoji: g.emoji,
    name: g.name,
    sub: g.region,
    lat: g.lat,
    lon: g.lon,
    h: g.h,
    isGeo: true,
    desc: g.desc,
    fact: g.fact,
    wiki: g.wiki ?? [g.name.en, g.name.zh],
  };
}

export function countryToPlaceHit(c: CountryInfo): PlaceHit {
  const key = c.a2 || c.name;
  const en = c.a2 && c.a2 !== 'XK' ? countryName(c.a2, 'en') || c.name : c.name;
  const zh = c.a2 && c.a2 !== 'XK' ? countryName(c.a2, 'zh') || c.name : c.name;
  const cont = CONTINENT_NAMES[c.continent] ?? { en: 'Earth', zh: '地球' };
  const h = Math.max(0.28, Math.min(1.15, Math.sqrt(Math.max(1, c.area)) * 0.032));
  return {
    key: 'country:' + key,
    placeKind: 'country',
    emoji: '🧭',
    name: { en, zh },
    sub: cont,
    lat: c.lat,
    lon: c.lon,
    h,
    wiki: [en, zh],
  };
}

export function adminToPlaceHit(area: AdminArea): PlaceHit {
  const en = adminName(area, 'en') ?? '';
  const zh = adminName(area, 'zh') || en;
  const cEn = countryName(area.country, 'en') || area.country;
  const cZh = countryName(area.country, 'zh') || area.country;
  const h = Math.max(0.12, Math.min(0.55, Math.sqrt(Math.max(0.5, area.area)) * 0.04));
  return {
    key: 'state:' + area.code,
    placeKind: 'state',
    emoji: '🗺️',
    name: { en, zh },
    sub: { en: cEn, zh: cZh },
    lat: area.lat,
    lon: area.lon,
    h,
    needsStates: true,
    wiki: [en, zh],
  };
}

export function chinaCapitalToPlaceHit(cap: (typeof CHINA_CAPITALS)[number]): PlaceHit {
  return {
    key: 'capital:' + cap.code,
    placeKind: 'capital',
    emoji: '🏛️',
    name: { en: cap.en, zh: cap.zh },
    sub: { en: 'China', zh: '中国' },
    lat: cap.lat,
    lon: cap.lon,
    h: 0.32,
    needsStates: true,
    wiki: [cap.en, cap.zh],
  };
}

export function cityToPlaceHit([cEn, a2, lat, lon, popM, isCap]: (typeof CITIES)[number]): PlaceHit {
  const cZh = CITY_ZH[cEn] ?? cEn;
  const ctryEn = countryName(a2, 'en') || a2;
  const ctryZh = countryName(a2, 'zh') || a2;
  return {
    key: 'city:' + norm(cEn),
    placeKind: isCap ? 'capital' : 'city',
    emoji: isCap ? '🏛️' : '🏙️',
    name: { en: cEn, zh: cZh },
    sub: { en: ctryEn, zh: ctryZh },
    lat,
    lon,
    h: 0.32,
    desc: isCap
      ? {
          en: `National capital of ${ctryEn} (metropolitan population ~${popM} million).`,
          zh: `${ctryZh}首都（都会区人口约 ${Math.round(popM * 100).toLocaleString('en')} 万）。`,
        }
      : {
          en: `Major metropolis in ${ctryEn} (metropolitan population ~${popM} million).`,
          zh: `${ctryZh}重要城市（都会区人口约 ${Math.round(popM * 100).toLocaleString('en')} 万）。`,
        },
    wiki: [cEn, cZh],
  };
}

export function resolvePlaceByKey(key: string, places?: SearchPlaces): PlaceHit | null {
  if (key.startsWith('geo:')) {
    const g = GAZETTEER_BY_KEY.get(key);
    return g ? gazetteerToPlaceHit(g) : null;
  }
  if (key.startsWith('capital:')) {
    const code = key.slice('capital:'.length);
    const cap = CHINA_CAPITALS.find(c => c.code === code);
    return cap ? chinaCapitalToPlaceHit(cap) : null;
  }
  if (key.startsWith('city:')) {
    const slug = key.slice('city:'.length);
    const city = CITIES.find(c => !CHINA_CAP_NORMS.has(norm(c[0])) && norm(c[0]) === slug);
    return city ? cityToPlaceHit(city) : null;
  }
  if (key.startsWith('country:')) {
    const code = key.slice('country:'.length);
    const c = (places?.countries ?? []).find(x => (x.a2 || x.name) === code);
    return c ? countryToPlaceHit(c) : null;
  }
  if (key.startsWith('state:')) {
    const code = key.slice('state:'.length);
    const area = (places?.regions ?? []).find(a => a.code === code);
    return area ? adminToPlaceHit(area) : null;
  }
  return null;
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
  if (filter !== 'space' && filter !== 'geo') {
    for (const item of CATALOGUE) {
      if (filter !== 'all' && item.type !== filter) continue;
      const aliases = ALIASES[item.key];
      const names = [item.name.en, item.name.zh ?? ''];
      const score = q ? scoreTerms(q, {
        names,
        aliases,
        other: [countryName(item.country, l), countryName(item.country, 'en'), item.sub, SUB_ZH[item.sub] ?? ''],
      }) : 1;
      if (score > 0) {
        out.push({ kind: 'item', item, score, alias: q ? matchedAlias(q, names, aliases) : undefined });
      }
    }
  }
  if (filter === 'geo' || (filter === 'all' && q)) {
    for (const g of GAZETTEER) {
      const names = [g.name.en, g.name.zh];
      const score = q ? scoreTerms(q, {
        names,
        aliases: g.aliases,
        other: [g.region.en, g.region.zh],
      }) : 1;
      if (score > 0) {
        out.push({
          kind: 'place',
          score: q ? score - 0.05 : 1,
          alias: q ? matchedAlias(q, names, g.aliases) : undefined,
          hit: gazetteerToPlaceHit(g),
        });
      }
    }
  }
  if (filter === 'all' && q) {
    const seenCountries = new Set<string>();
    for (const c of places?.countries ?? []) {
      const key = c.a2 || c.name;
      if (!key || seenCountries.has(key)) continue;
      seenCountries.add(key);
      const hit = countryToPlaceHit(c);
      const aliases = c.a2 ? [c.a2] : undefined;
      const score = scoreTerms(q, { names: [hit.name.en, hit.name.zh, c.name], aliases });
      if (score > 0) out.push({ kind: 'place', score: score - 0.1, hit });
    }
    for (const area of places?.regions ?? []) {
      const hit = adminToPlaceHit(area);
      const score = scoreTerms(q, { names: [hit.name.en, hit.name.zh], aliases: area.code ? [area.code] : undefined });
      if (score > 0) out.push({ kind: 'place', score: score - 0.2, hit });
    }
    for (const cap of CHINA_CAPITALS) {
      const score = scoreTerms(q, { names: [cap.en, cap.zh] });
      if (score > 0) out.push({ kind: 'place', score: score - 0.15, hit: chinaCapitalToPlaceHit(cap) });
    }
    for (const city of CITIES) {
      const cEn = city[0];
      if (CHINA_CAP_NORMS.has(norm(cEn))) continue;
      const cZh = CITY_ZH[cEn] ?? cEn;
      const score = scoreTerms(q, { names: [cEn, cZh] });
      if (score > 0) out.push({ kind: 'place', score: score - 0.18, hit: cityToPlaceHit(city) });
    }
  }
  if (space && (filter === 'space' || (filter === 'all' && q))) {
    for (const hit of space) {
      const aliases = ALIASES[hit.key];
      const names = [hit.name.en, hit.name.zh ?? ''];
      const score = q ? scoreTerms(q, { names, aliases }) : 1;
      if (score > 0) out.push({ kind: 'space', hit, score, alias: q ? matchedAlias(q, names, aliases) : undefined });
    }
  }
  // Stable: equal scores keep catalogue order, globe before space.
  return q ? out.sort((a, b) => b.score - a.score) : out;
}
