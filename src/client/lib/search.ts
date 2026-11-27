/** Ranked search across the globe catalogue, textbook physical-geography gazetteer, administrative places, world cities and space. */
import { CATALOGUE } from '../../shared/data/catalogue.ts';
import { SUB_ZH } from '../../shared/data/subs.ts';
import { ALIASES } from '../../shared/data/aliases.ts';
import { CHINA_CAPITALS } from '../../shared/data/china-capitals.ts';
import { CITIES, CITY_ZH } from '../../shared/data/cities.ts';
import { GAZETTEER, GAZETTEER_BY_KEY, type GeoKind } from '../../shared/data/gazetteer.ts';
import { CONTINENT_NAMES, ISO, type Continent } from '../../shared/data/iso.ts';
import { matchedAlias, norm, parseCoordinateQuery, queryTokens, scoreTerms } from '../../shared/lib/search.ts';
import type { CatalogueItem, Lang } from '../../shared/data/types.ts';
import type { SpaceHit } from '../solar/space-index.ts';
import type { CountryInfo } from '../globe/painter.ts';
import { adminName, type AdminArea } from '../globe/admin.ts';
import { countryName } from './i18n.ts';

export type PlaceKind = 'country' | 'state' | 'capital' | 'city' | 'coord' | GeoKind;

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

const ISO_CONTINENT_BY_A2: ReadonlyMap<string, Continent> = new Map(
  Object.values(ISO).map(([a2, cont]) => [a2, cont]),
);

const COUNTRY_ALIASES: Record<string, readonly string[]> = {
  GB: ['UK', 'Britain', 'Great Britain', 'England', '英国', '大不列颠', '英格兰'],
  US: ['USA', 'America', 'United States of America', '美国', '美利坚', '花旗国'],
  AE: ['UAE', 'Emirates', '阿联酋', '阿拉伯联合酋长国'],
  NL: ['Holland', 'Nederland', '荷兰', '尼德兰'],
  CH: ['Swiss', 'Schweiz', 'Helvetia', '瑞士'],
  NZ: ['Aotearoa', '新西兰', '纽西兰'],
  KR: ['ROK', 'South Korea', 'Korea', '韩国', '南韩'],
  KP: ['DPRK', 'North Korea', '朝鲜', '北韩'],
  CN: ['PRC', 'Zhongguo', '中国', '中华'],
  JP: ['Nippon', 'Nihon', '日本', '东瀛'],
  ZA: ['RSA', '南非'],
  AU: ['Aussie', 'Oz', '澳洲', '澳大利亚'],
  RU: ['Russian Federation', '俄罗斯', '俄国'],
  DE: ['Deutschland', '德国', '德意志'],
  FR: ['法国', '法兰西'],
  ES: ['España', '西班牙'],
  IT: ['Italia', '意大利', '义大利'],
  GR: ['Hellas', '希腊'],
  TR: ['Türkiye', 'Turkey', '土耳其'],
  IR: ['Persia', '波斯', '伊朗'],
  MM: ['Burma', '缅甸'],
  TH: ['Siam', '暹罗', '泰国'],
  SG: ['狮城', '星洲', '新加坡'],
  MY: ['大马', '马来西亚'],
  IN: ['Bharat', '印度', '天竺'],
  EG: ['Misr', '埃及'],
  SA: ['KSA', '沙特', '沙特阿拉伯', '沙乌地阿拉伯'],
  MV: ['马尔代夫', '马尔地夫'],
  CZ: ['Czech Republic', '捷克'],
  CI: ['Ivory Coast', '象牙海岸', '科特迪瓦'],
  CD: ['DRC', '刚果金', '民主刚果'],
  CG: ['刚果布'],
  VA: ['Holy See', '梵蒂冈'],
};

const CHINA_CAP_ALIASES: Record<string, readonly string[]> = {
  'CN-GD': ['羊城', '花城', 'Canton'],
  'CN-SC': ['蓉城', '锦官城'],
  'CN-YN': ['春城'],
  'CN-HL': ['冰城'],
  'CN-SD': ['泉城'],
  'CN-HB': ['江城'],
  'CN-JS': ['金陵', '石头城'],
  'CN-SN': ['长安', 'Xian'],
  'CN-ZJ': ['钱塘', '临安'],
  'CN-XZ': ['日光城'],
  'CN-HN': ['星城'],
  'CN-FJ': ['榕城'],
  'CN-LN': ['盛京', '奉天'],
};

const CITY_ALIASES: Record<string, readonly string[]> = {
  'Beijing': ['Peking', '北平', '燕京'],
  'Shanghai': ['申城', '魔都', '沪'],
  'Hong Kong': ['HK', '香江'],
  'New York': ['NYC', 'New York City', 'Big Apple'],
  'Los Angeles': ['LA'],
  'San Francisco': ['SF', '三藩市', '圣弗朗西斯科'],
  'Washington': ['Washington D.C.', 'DC', '华盛顿哥伦比亚特区'],
  'Honolulu': ['火奴鲁鲁'],
  'Vladivostok': ['海参崴'],
  'Murmansk': ['不冻港', '终年不冻港'],
  'Yakutsk': ['北半球寒极'],
  'Saint Petersburg': ['Leningrad', '列宁格勒', '圣彼得堡'],
  'Istanbul': ['Constantinople', '君士坦丁堡'],
  'Ho Chi Minh City': ['Saigon', '西贡'],
  'Mumbai': ['Bombay'],
  'Kolkata': ['Calcutta'],
  'Chennai': ['Madras'],
  'Bengaluru': ['Bangalore', '印度硅谷'],
  'Yangon': ['Rangoon'],
  'Seoul': ['汉城'],
};

const CN_TZ_NUMS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一'];

export function coordToPlaceHit(lat: number, lon: number): PlaceHit {
  const latStr = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
  const labelEn = `${latStr}, ${lonStr}`;
  const labelZh = `${lat >= 0 ? '北纬' : '南纬'} ${Math.abs(lat).toFixed(2)}°，${lon >= 0 ? '东经' : '西经'} ${Math.abs(lon).toFixed(2)}°`;
  const hemNS = lat >= 0 ? ['Northern Hemisphere', '北半球'] : ['Southern Hemisphere', '南半球'];
  // Textbook East/West Hemisphere boundary: 20°W to 160°E is Eastern Hemisphere!
  const isEastHem = lon >= -20 && lon <= 160;
  const hemEW = isEastHem ? ['Eastern Hemisphere', '东半球'] : ['Western Hemisphere', '西半球'];
  const absLat = Math.abs(lat);
  const zone = absLat <= 23.44
    ? ['Tropical (Torrid) Zone', '热带']
    : absLat <= 66.56
      ? (lat >= 0 ? ['North Temperate Zone', '北温带'] : ['South Temperate Zone', '南温带'])
      : (lat >= 0 ? ['North Frigid Zone', '北寒带'] : ['South Frigid Zone', '南寒带']);
  const latBand = absLat <= 30
    ? ['Low Latitudes (0°–30°)', '低纬度地区（0°–30°）']
    : absLat <= 60
      ? ['Middle Latitudes (30°–60°)', '中纬度地区（30°–60°）']
      : ['High Latitudes (60°–90°)', '高纬度地区（60°–90°）'];
  const rawTz = Math.round(lon / 15);
  const tz = rawTz === 0 ? 0 : rawTz;
  const absTz = Math.abs(tz);
  const tzEn = tz === 0
    ? 'UTC±0 (Zero Zone)'
    : absTz === 12
      ? 'UTC±12 (East/West 12th Zone)'
      : `UTC${tz > 0 ? '+' : ''}${tz} (${absTz}${tz > 0 ? 'E' : 'W'} Zone)`;
  const tzZh = tz === 0
    ? '中时区（零时区，UTC±0）'
    : absTz === 12
      ? '东西十二区（UTC±12）'
      : `${tz > 0 ? '东' : '西'}${CN_TZ_NUMS[absTz]}区（UTC${tz > 0 ? '+' : ''}${tz}）`;
  return {
    key: `coord:${lat.toFixed(4)},${lon.toFixed(4)}`,
    placeKind: 'coord',
    emoji: '🎯',
    name: { en: labelEn, zh: labelZh },
    sub: { en: `${hemNS[0]} · ${hemEW[0]}`, zh: `${hemNS[1]} · ${hemEW[1]}` },
    lat,
    lon,
    h: 0.65,
    isGeo: true,
    desc: {
      en: `Custom geographic coordinate in the ${hemNS[0]}, ${hemEW[0]} (20°W–160°E rule), and ${zone[0]}.`,
      zh: `自定义经纬度坐标点：位于${hemNS[1]}、${hemEW[1]}（按 20°W—160°E 东西半球划分），属于五带中的${zone[1]}。`,
    },
    fact: {
      en: `Latitude band: ${latBand[0]} · Theoretical nautical time zone: ${tzEn}.`,
      zh: `纬度带：${latBand[1]} · 理论时区：${tzZh}。`,
    },
  };
}

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
  const lower = key.toLowerCase();
  if (lower.startsWith('coord:')) {
    const c = parseCoordinateQuery(key.slice('coord:'.length));
    return c ? coordToPlaceHit(c.lat, c.lon) : null;
  }
  if (lower.startsWith('geo:')) {
    const g = GAZETTEER_BY_KEY.get(lower);
    return g ? gazetteerToPlaceHit(g) : null;
  }
  if (lower.startsWith('capital:')) {
    const code = key.slice('capital:'.length).toUpperCase();
    const cap = CHINA_CAPITALS.find(c => c.code === code);
    return cap ? chinaCapitalToPlaceHit(cap) : null;
  }
  if (lower.startsWith('city:')) {
    const slug = norm(key.slice('city:'.length));
    const city = CITIES.find(c => !CHINA_CAP_NORMS.has(norm(c[0])) && norm(c[0]) === slug);
    return city ? cityToPlaceHit(city) : null;
  }
  if (lower.startsWith('country:')) {
    const rawCode = key.slice('country:'.length).trim();
    const upper = rawCode.toUpperCase();
    const c = (places?.countries ?? []).find(x =>
      (x.a2 && x.a2.toUpperCase() === upper) || x.name.toLowerCase() === rawCode.toLowerCase(),
    );
    if (c) return countryToPlaceHit(c);
    const cont = ISO_CONTINENT_BY_A2.get(upper);
    if (cont) {
      const capCity = CITIES.find(ct => ct[1] === upper && ct[5]) ?? CITIES.find(ct => ct[1] === upper);
      const en = countryName(upper, 'en');
      const zh = countryName(upper, 'zh') || en;
      if (capCity && en) {
        return {
          key: 'country:' + upper,
          placeKind: 'country',
          emoji: '🧭',
          name: { en, zh },
          sub: CONTINENT_NAMES[cont] ?? { en: 'Earth', zh: '地球' },
          lat: capCity[2],
          lon: capCity[3],
          h: 0.45,
          wiki: [en, zh],
        };
      }
    }
    return null;
  }
  if (lower.startsWith('state:')) {
    const code = key.slice('state:'.length).toUpperCase();
    const area = (places?.regions ?? []).find(a => a.code.toUpperCase() === code);
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
  const tokens = query ? queryTokens(query) : [];
  const out: SearchHit[] = [];
  if (query && (filter === 'all' || filter === 'geo')) {
    const coord = parseCoordinateQuery(query);
    if (coord) {
      out.push({ kind: 'place', score: 120, hit: coordToPlaceHit(coord.lat, coord.lon) });
    }
  }
  if (filter !== 'space' && filter !== 'geo') {
    for (const item of CATALOGUE) {
      if (filter !== 'all' && item.type !== filter) continue;
      const aliases = ALIASES[item.key];
      const names = [item.name.en, item.name.zh ?? ''];
      const baseScore = q ? scoreTerms(q, {
        names,
        aliases,
        other: [countryName(item.country, l), countryName(item.country, 'en'), item.sub, SUB_ZH[item.sub] ?? ''],
      }, tokens) : 1;
      if (baseScore > 0) {
        const tierTie = q ? (3 - item.tier) * 0.01 : 0;
        out.push({ kind: 'item', item, score: baseScore + tierTie, alias: q ? matchedAlias(q, names, aliases, tokens) : undefined });
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
      }, tokens) : 1;
      if (score > 0) {
        out.push({
          kind: 'place',
          score: q ? score - 0.05 : 1,
          alias: q ? matchedAlias(q, names, g.aliases, tokens) : undefined,
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
      const names = [hit.name.en, hit.name.zh, c.name];
      const aliases = c.a2 ? [c.a2, ...(COUNTRY_ALIASES[c.a2] ?? [])] : undefined;
      const score = scoreTerms(q, { names, aliases }, tokens);
      if (score > 0) {
        out.push({ kind: 'place', score: score - 0.1, alias: matchedAlias(q, names, aliases, tokens), hit });
      }
    }
    for (const area of places?.regions ?? []) {
      const hit = adminToPlaceHit(area);
      const score = scoreTerms(q, { names: [hit.name.en, hit.name.zh], aliases: area.code ? [area.code] : undefined }, tokens);
      if (score > 0) out.push({ kind: 'place', score: score - 0.2, hit });
    }
    for (const cap of CHINA_CAPITALS) {
      const names = [cap.en, cap.zh];
      const aliases = CHINA_CAP_ALIASES[cap.code];
      const score = scoreTerms(q, { names, aliases }, tokens);
      if (score > 0) {
        out.push({ kind: 'place', score: score - 0.15, alias: matchedAlias(q, names, aliases, tokens), hit: chinaCapitalToPlaceHit(cap) });
      }
    }
    for (const city of CITIES) {
      const cEn = city[0];
      if (CHINA_CAP_NORMS.has(norm(cEn))) continue;
      const cZh = CITY_ZH[cEn] ?? cEn;
      const names = [cEn, cZh];
      const aliases = CITY_ALIASES[cEn];
      const score = scoreTerms(q, { names, aliases }, tokens);
      if (score > 0) {
        const popBonus = Math.min(0.025, Math.max(0, city[4]) * 0.0005);
        out.push({
          kind: 'place',
          score: score - 0.18 + popBonus,
          alias: matchedAlias(q, names, aliases, tokens),
          hit: cityToPlaceHit(city),
        });
      }
    }
  }
  if (space && (filter === 'space' || (filter === 'all' && q))) {
    for (const hit of space) {
      const aliases = ALIASES[hit.key];
      const names = [hit.name.en, hit.name.zh ?? ''];
      const score = q ? scoreTerms(q, { names, aliases }, tokens) : 1;
      if (score > 0) out.push({ kind: 'space', hit, score, alias: q ? matchedAlias(q, names, aliases, tokens) : undefined });
    }
  }
  // Stable: equal scores keep catalogue order, globe before space.
  return q ? out.sort((a, b) => b.score - a.score) : out;
}
