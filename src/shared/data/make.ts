import type { CatalogueItem, Facts, ItemType, ModelRecipe, Route } from './types.ts';
import type { Continent } from './iso.ts';

type N2 = [en: string, zh: string];

/** Compact spec for catalogue items that keep their English and Chinese text side by side. */
interface ItemSpec {
  key: string;
  slug: string;
  name: N2;
  lat: number;
  lon: number;
  continent: Continent | 'ocean';
  country?: string;
  tier?: 1 | 2 | 3;
  emoji: string;
  /** grouping inside the collection dex (short lowercase word) */
  sub: string;
  model: ModelRecipe;
  facts?: Facts;
  desc: N2;
  fun?: N2;
  habitat?: N2;
  diet?: CatalogueItem['diet'];
  status?: CatalogueItem['status'];
  route?: Route;
  area?: number;
  season?: CatalogueItem['season'];
  /** exact English Wikipedia article title, if it differs from name[0] */
  wiki?: string;
}

const n = ([en, zh]: N2) => ({ en, zh });

export function make(type: ItemType, s: ItemSpec): CatalogueItem {
  const [lat, lon] = s.route ? s.route.pts[0] : [s.lat, s.lon];
  return {
    key: s.key, slug: s.slug, type, name: n(s.name), country: s.country, continent: s.continent, lat, lon,
    tier: s.tier ?? 2, emoji: s.emoji, sub: s.sub, model: s.model, facts: s.facts, desc: n(s.desc),
    funFact: s.fun && n(s.fun), habitat: s.habitat && n(s.habitat), diet: s.diet, status: s.status,
    route: s.route, area: s.area, season: s.season, wiki: s.wiki,
  };
}

/** Builds a list of one type, e.g. `export const DINOS = many('dino', [...])`. */
export const many = (type: ItemType, specs: ItemSpec[]): CatalogueItem[] => specs.map(s => make(type, s));
