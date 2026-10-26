import type { I18n, ItemType } from './types.ts';

/** Settings key that toggles a catalogue type on the globe. */
export type LayerKey = 'landmarks' | 'animals' | 'discoveries' | 'vehicles' | 'dinos' | 'foods' | 'festivals'
  | 'space' | 'plants' | 'sports' | 'volcanoes' | 'migrations' | 'voyages' | 'people';

interface TypeMeta {
  layer: LayerKey;
  /** encyclopedia directory ('' = no pages) */
  section: string;
  one: I18n;
  many: I18n;
  /** short sentence for the collection hub card */
  hint: I18n;
  emoji: string;
  /** accent colour used for plinth rims, chips and route lines */
  color: string;
  /** zoom = zoom in close to collect (animals), log = tap (discoveries), found = tap into progress.found, null = not collectable */
  collect: 'zoom' | 'log' | 'found' | null;
  /** base model scale on the globe */
  scale: number;
  /** plinth radius (0 = none) */
  plinth: number;
}

export const TYPE_META: Record<ItemType, TypeMeta> = {
  landmark: { layer: 'landmarks', section: 'landmarks', one: { en: 'Landmark', zh: '地标' }, many: { en: 'Landmarks', zh: '地标' },
    hint: { en: 'Famous places around the world', zh: '世界各地的著名地方' }, emoji: '🏛️', color: '#38bdf8', collect: null, scale: 0.075, plinth: 0.42 },
  animal: { layer: 'animals', section: 'animals', one: { en: 'Animal', zh: '动物' }, many: { en: 'Animals', zh: '动物' },
    hint: { en: 'Find animals and zoom in close to collect them', zh: '找到动物并放大靠近来收集它们' }, emoji: '🦁', color: '#34d399', collect: 'zoom', scale: 0.055, plinth: 0.34 },
  discovery: { layer: 'discoveries', section: 'discover', one: { en: 'Discovery', zh: '发现' }, many: { en: 'Discoveries', zh: '发现' },
    hint: { en: 'Find wrecks, mysteries and legends, tap to log them', zh: '寻找沉船、谜团和传说，点击即可记录' }, emoji: '🔍', color: '#f59e0b', collect: 'log', scale: 0.075, plinth: 0.34 },
  vehicle: { layer: 'vehicles', section: '', one: { en: 'Vehicle', zh: '交通工具' }, many: { en: 'Ships, planes & trains', zh: '船、飞机和火车' },
    hint: { en: 'Ride along on ships, planes and trains', zh: '搭乘轮船、飞机和火车' }, emoji: '🚢', color: '#94a3b8', collect: null, scale: 0.048, plinth: 0 },
  dino: { layer: 'dinos', section: 'dinosaurs', one: { en: 'Dinosaur', zh: '恐龙' }, many: { en: 'Dinosaurs', zh: '恐龙' },
    hint: { en: 'Dig up dinosaurs where their fossils were found', zh: '在化石出土的地方挖出恐龙' }, emoji: '🦖', color: '#a3e635', collect: 'found', scale: 0.07, plinth: 0.38 },
  food: { layer: 'foods', section: 'foods', one: { en: 'Food', zh: '美食' }, many: { en: 'Foods of the world', zh: '世界美食' },
    hint: { en: 'Taste famous dishes from every country', zh: '品尝各国的招牌美食' }, emoji: '🍜', color: '#fb923c', collect: 'found', scale: 0.06, plinth: 0.34 },
  festival: { layer: 'festivals', section: 'festivals', one: { en: 'Festival', zh: '节日' }, many: { en: 'Festivals', zh: '节日' },
    hint: { en: 'Celebrate festivals around the year', zh: '一年四季的节日庆典' }, emoji: '🎉', color: '#f472b6', collect: 'found', scale: 0.065, plinth: 0.36 },
  space: { layer: 'space', section: 'space', one: { en: 'Space & science', zh: '太空与科学' }, many: { en: 'Space & science', zh: '太空与科学' },
    hint: { en: 'Rockets, telescopes and great science sites', zh: '火箭、望远镜和科学圣地' }, emoji: '🚀', color: '#818cf8', collect: 'found', scale: 0.07, plinth: 0.38 },
  plant: { layer: 'plants', section: 'plants', one: { en: 'Plant', zh: '植物' }, many: { en: 'Plants & forests', zh: '植物与森林' },
    hint: { en: 'Giant trees, strange flowers and wild forests', zh: '巨树、奇花和原始森林' }, emoji: '🌳', color: '#4ade80', collect: 'found', scale: 0.065, plinth: 0.36 },
  sport: { layer: 'sports', section: 'sports', one: { en: 'Sports venue', zh: '体育场馆' }, many: { en: 'Sports', zh: '体育' },
    hint: { en: 'Famous stadiums and sporting places', zh: '著名的体育场和运动胜地' }, emoji: '🏟️', color: '#facc15', collect: 'found', scale: 0.07, plinth: 0.4 },
  volcano: { layer: 'volcanoes', section: 'volcanoes', one: { en: 'Volcano', zh: '火山' }, many: { en: 'Volcanoes', zh: '火山' },
    hint: { en: 'Fiery mountains along the Ring of Fire', zh: '环太平洋火山带上的火焰之山' }, emoji: '🌋', color: '#ef4444', collect: 'found', scale: 0.07, plinth: 0.4 },
  migration: { layer: 'migrations', section: 'migrations', one: { en: 'Migration', zh: '动物迁徙' }, many: { en: 'Animal migrations', zh: '动物迁徙' },
    hint: { en: 'Follow animals on their great journeys', zh: '跟随动物踏上伟大的旅程' }, emoji: '🦋', color: '#2dd4bf', collect: 'found', scale: 0.05, plinth: 0 },
  voyage: { layer: 'voyages', section: 'voyages', one: { en: 'Voyage', zh: '历史航线' }, many: { en: 'Great voyages', zh: '伟大航程' },
    hint: { en: 'Sail along famous journeys from history', zh: '沿着历史上的著名航线航行' }, emoji: '⛵', color: '#e8b04a', collect: 'found', scale: 0.052, plinth: 0 },
  person: { layer: 'people', section: 'people', one: { en: 'Famous person', zh: '名人' }, many: { en: 'Famous people', zh: '历史名人' },
    hint: { en: 'Meet great thinkers, artists and explorers where they lived', zh: '在他们生活过的地方认识伟大的思想家、艺术家和探险家' }, emoji: '🧑‍🎨', color: '#c084fc', collect: 'found', scale: 0.062, plinth: 0.34 },
};

export const TYPE_ORDER: ItemType[] = ['landmark', 'animal', 'discovery', 'vehicle', 'dino', 'food', 'festival', 'space', 'plant', 'sport', 'volcano', 'migration', 'voyage', 'person'];
