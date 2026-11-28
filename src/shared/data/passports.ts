import type { CatalogueItem, I18n, ItemType } from './types.ts';
import { CATALOGUE, BY_KEY } from './catalogue.ts';
import { TYPE_META } from './typemeta.ts';
import { haversineKm } from '../lib/geo.ts';

/** A passport book: a themed set of places that get stamped when their info card is opened. */
export interface PassportBook { id: string; emoji: string; name: I18n; keys: string[] }

const WONDERS = ['greatwall', 'petra', 'redeemer', 'machupicchu', 'chichenitza', 'colosseum', 'taj', 'pyramids'];

const book = (id: string, emoji: string, name: I18n, test: (it: CatalogueItem) => boolean): PassportBook =>
  ({ id, emoji, name, keys: CATALOGUE.filter(test).map(i => i.key) });
const landmarksIn = (...cs: CatalogueItem['continent'][]) => (it: CatalogueItem) => it.type === 'landmark' && cs.includes(it.continent);
const ofType = (ty: ItemType) => book(ty, TYPE_META[ty].emoji, TYPE_META[ty].many, it => it.type === ty);

export const PASSPORTS: PassportBook[] = [
  book('wonders', '🌟', { en: 'Wonders of the World', zh: '世界奇迹' }, it => WONDERS.includes(it.key)),
  book('china', '🇨🇳', { en: 'Discover China', zh: '发现中国' }, it => it.country === 'CN' || it.country === 'TW'),
  book('asia', '🏯', { en: 'Asia', zh: '亚洲' }, landmarksIn('asia')),
  book('europe', '🏰', { en: 'Europe', zh: '欧洲' }, landmarksIn('europe')),
  book('africa', '🌍', { en: 'Africa', zh: '非洲' }, landmarksIn('africa')),
  book('americas', '🗽', { en: 'The Americas', zh: '美洲' }, landmarksIn('north-america', 'south-america')),
  book('oceania', '🦘', { en: 'Oceania & poles', zh: '大洋洲与极地' }, landmarksIn('oceania', 'antarctica', 'ocean')),
  book('animal', '🦁', { en: 'Animal safari', zh: '动物探险' }, it => it.type === 'animal'),
  ...(['dino', 'food', 'festival', 'space', 'plant', 'sport', 'volcano', 'migration', 'voyage', 'person'] as const).map(ofType),
].filter(b => b.keys.length > 0);

export const bookProgress = (b: PassportBook, seen: Record<string, number>) => b.keys.filter(k => k in seen).length;
export const bookDone = (b: PassportBook, seen: Record<string, number>) => bookProgress(b, seen) === b.keys.length;

export interface PassportRouteLeg {
  item: CatalogueItem;
  legKm: number;
}

/** Greedy nearest-neighbour expedition route visiting all unstamped stops in `book` starting from `start`. */
export function planPassportRoute(
  book: PassportBook,
  seen: Record<string, number>,
  start: readonly [number, number],
): { stops: PassportRouteLeg[]; totalKm: number } {
  const remaining = book.keys
    .filter(k => !(k in seen))
    .map(k => BY_KEY.get(k))
    .filter((x): x is CatalogueItem => !!x);
  const stops: PassportRouteLeg[] = [];
  let curLat = start[0];
  let curLon = start[1];
  let totalKm = 0;
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestKm = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(curLat, curLon, remaining[i].lat, remaining[i].lon);
      if (d < bestKm) {
        bestKm = d;
        bestIdx = i;
      }
    }
    const [picked] = remaining.splice(bestIdx, 1);
    const legKm = Math.round(bestKm);
    stops.push({ item: picked, legKm });
    totalKm += legKm;
    curLat = picked.lat;
    curLon = picked.lon;
  }
  return { stops, totalKm };
}
