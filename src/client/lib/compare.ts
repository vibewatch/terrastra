/**
 * The compare bench: two things of the same kind, one measurement with a reliable unit. Each group has exactly one
 * measure (bodies: diameter, never radius; buildings and trees: height; animals and dinosaurs: body length; animals and
 * vehicles: speed in km/h), so the
 * bench can never set a radius next to a diameter or a height next to a wingspan.
 */
import { BODIES } from '../../shared/data/solar.ts';
import { BY_KEY, CATALOGUE } from '../../shared/data/catalogue.ts';
import { GAZETTEER } from '../../shared/data/gazetteer.ts';
import type { CatalogueItem, I18n } from '../../shared/data/types.ts';
import { resolvePlaceByKey, type SearchPlaces } from './search.ts';

export interface DistPlace {
  key: string;
  emoji: string;
  name: { en: string; zh?: string };
  lat: number;
  lon: number;
}

export function earthPlaces(ensureKeys: string[], searchPlaces?: SearchPlaces): DistPlace[] {
  const seen = new Set<string>();
  const list: DistPlace[] = [];
  for (const it of CATALOGUE) {
    if (it.route || (it.tier > 2 && !ensureKeys.includes(it.key))) continue;
    seen.add(it.key);
    list.push({ key: it.key, emoji: it.emoji, name: it.name, lat: it.lat, lon: it.lon });
  }
  for (const gz of GAZETTEER) {
    const isMajor = gz.labelZoom === 0 || gz.labelZoom <= 5.2;
    if (!isMajor && !ensureKeys.includes(gz.key)) continue;
    seen.add(gz.key);
    list.push({ key: gz.key, emoji: gz.emoji, name: gz.name, lat: gz.lat, lon: gz.lon });
  }
  for (const k of ensureKeys) {
    if (!k || seen.has(k)) continue;
    const it = BY_KEY.get(k);
    if (it) {
      seen.add(k);
      list.push({ key: it.key, emoji: it.emoji, name: it.name, lat: it.lat, lon: it.lon });
      continue;
    }
    const pl = resolvePlaceByKey(k, searchPlaces);
    if (pl) {
      seen.add(k);
      list.push({ key: pl.key, emoji: pl.emoji, name: pl.name, lat: pl.lat, lon: pl.lon });
    }
  }
  return list;
}

export type GroupId = 'bodies' | 'tall' | 'peaks' | 'long' | 'fast';
export interface Thing { id: string; name: I18n; emoji: string; /** in the group's unit: km for bodies, km/h for speed, metres otherwise */ size: number }
export interface Group { id: GroupId; unit: 'km' | 'm' | 'kmh'; things: Thing[]; /** default pair (ids; English names until resolved) */ pair: [string, string] }

/** Heights here are of the structure or tree itself, not the ground it stands on. */
const TALL_SUBS = new Set(['skyscraper', 'tower', 'statue', 'pyramid', 'minaret', 'stupa', 'cathedral', 'church', 'mosque', 'monument', 'religious', 'tree']);
/** Summit elevations above sea level for mountains and volcanoes. */
const PEAK_SUBS = new Set(['mountain', 'volcano']);
/** Facts that measure something else: elevation of a whole hill, a carving on a cliff, a wingspan. */
const SKIP = new Set(['Mont-Saint-Michel', 'Mount Rushmore', 'Hanging Temple', 'Rock Churches of Lalibela', 'Itsukushima Shrine', 'Quetzalcoatlus']);
const WALKER: Thing = { id: 'walker', name: { en: 'A person walking', zh: '一个人走路' }, emoji: '🚶', size: 5 };
const CHILD: Thing = { id: 'child', name: { en: 'A child', zh: '一个小朋友' }, emoji: '🧒', size: 1.3 };

const fromItems = (pick: (i: CatalogueItem) => number | undefined): Thing[] =>
  CATALOGUE.flatMap(i => {
    const v = SKIP.has(i.name.en) ? undefined : pick(i);
    return v ? [{ id: i.key, name: i.name, emoji: i.emoji, size: v }] : [];
  });

let groups: Group[] | null = null;
export function compareGroups(): Group[] {
  return groups ??= [
    { id: 'bodies', unit: 'km', pair: ['Earth', 'Moon'],
      things: BODIES.map(b => ({ id: b.id, name: b.name, emoji: b.emoji, size: Math.round(b.radiusKm * 2) })) },
    { id: 'tall', unit: 'm', pair: ['Burj Khalifa', 'Eiffel Tower'],
      things: [CHILD, ...fromItems(i => (i.type === 'landmark' || i.type === 'plant') && TALL_SUBS.has(i.sub) ? i.facts?.heightM : undefined)] },
    { id: 'peaks', unit: 'm', pair: ['Mount Everest', 'Mount Fuji'],
      things: fromItems(i => (i.type === 'volcano' || (i.type === 'landmark' && PEAK_SUBS.has(i.sub))) && (i.facts?.heightM ?? 0) >= 300 ? i.facts?.heightM : undefined) },
    { id: 'long', unit: 'm', pair: ['Blue whale', 'Tyrannosaurus rex'],
      things: [CHILD, ...fromItems(i => (i.type === 'animal' || i.type === 'dino') ? i.facts?.lengthM : undefined)] },
    // animals: top speed in a short dash; vehicles: their usual cruising or operating speed (dinosaur speeds are guesses, so none)
    { id: 'fast', unit: 'kmh', pair: ['Cheetah', 'Bullet train'],
      things: [WALKER, ...fromItems(i => (i.type === 'animal' || i.type === 'vehicle') ? i.facts?.speedKmh : undefined)] },
  ].map(g => {
    g.things.sort((a, b) => b.size - a.size);
    const byName = (en: string) => g.things.find(t => t.name.en === en)?.id;
    g.pair = [byName(g.pair[0]) ?? g.things[0].id, byName(g.pair[1]) ?? g.things[1].id];
    return g as Group;
  });
}

/** The group (and thing) a catalogue key or body id belongs to, for opening the bench from a card. */
export function groupOf(id: string): Group | undefined {
  return id === 'child' || id === 'walker' ? undefined : compareGroups().find(g => g.things.some(t => t.id === id));
}

/** How many times bigger the larger is, rounded for reading aloud: 1 decimal under 10, whole numbers above. */
export function ratio(a: number, b: number): { big: 0 | 1; times: number } {
  const big = a >= b ? 0 : 1;
  const r = big === 0 ? a / b : b / a;
  return { big, times: r < 10 ? Math.round(r * 10) / 10 : Math.round(r) };
}

/**
 * Drawn sizes in pixels for a frame whose largest side is `max`. True scale keeps one ruler for both (the smaller may be
 * under a pixel and is then flagged); "enlarged" draws both at the same size and reports how much the smaller grew.
 */
export function drawn(a: number, b: number, max: number, scale: 'true' | 'zoom'): { px: [number, number]; tiny: [boolean, boolean]; zoom: number } {
  const top = Math.max(a, b);
  if (scale === 'zoom') return { px: [max, max], tiny: [false, false], zoom: top / Math.min(a, b) };
  const px: [number, number] = [a / top * max, b / top * max];
  return { px, tiny: [px[0] < 2, px[1] < 2], zoom: 1 };
}
