import type { CatalogueItem, I18n } from '../data/types.ts';

/** Time-machine stops: 'dino' is the age of dinosaurs, 'now' shows everything; numbers are years (negative = BCE). */
export type Stop = 'dino' | number | 'now';
export const STOPS: Stop[] = ['dino', -3000, -500, 1, 1000, 1500, 1800, 1900, 1950, 2000, 'now'];

const ERA_NOTES: Record<string, I18n> = {
  dino: {
    en: 'Mesozoic Era (250–66 MYA) — Dinosaurs roam fragmenting supercontinents while active volcanic arcs shape ancient seas.',
    zh: '中生代（距今 2.5 亿–6600 万年）——恐龙漫步于分裂中的超大陆，活跃的火山弧塑造着远古海洋。',
  },
  '-3000': {
    en: 'Bronze Age Dawn (3000 BCE) — Early river-valley civilizations, megalithic circles, and the first monumental pyramids.',
    zh: '青铜时代黎明（公元前 3000 年）——早期大河流域文明、巨石阵与最早的纪念性金字塔相继诞生。',
  },
  '-500': {
    en: 'Classical Antiquity (500 BCE) — Philosophy, early astronomy, and stone temples flourish across Eurasia and the Mediterranean.',
    zh: '古典时代（公元前 500 年）——哲学、早期天文学与石构神庙在欧亚大陆与地中海沿岸蓬勃发展。',
  },
  '1': {
    en: 'Ancient Empires (1 CE) — Maritime and Silk Road trade networks connect Rome, Parthia, India, and Han China.',
    zh: '古典帝国时期（公元 1 年）——丝绸之路与海上航线将罗马、帕提亚、印度与汉朝连接在一起。',
  },
  '1000': {
    en: 'Medieval Golden Age (1000 CE) — Cathedrals, castles, pagodas, and astronomical observatories rise across continents.',
    zh: '中世纪盛期（公元 1000 年）——大教堂、城堡、宝塔与古天文台在各大洲拔地而起。',
  },
  '1500': {
    en: 'Renaissance & Age of Sail (1500 CE) — Oceanic voyages link the globe as citadel cities and imperial palaces reach their peak.',
    zh: '文艺复兴与大航海时代（公元 1500 年）——远洋航线连通全球，印加山城与帝国宫殿达到鼎盛。',
  },
  '1800': {
    en: 'Industrial Dawn (1800 CE) — Steam power, botanical expeditions, and precision cartography reshape global travel.',
    zh: '工业革命黎明（公元 1800 年）——蒸汽动力、科学考察与精密测绘重塑了全球探索。',
  },
  '1900': {
    en: 'Steel & Electric Age (1900 CE) — Suspension bridges, iron towers, transcontinental railways, and polar expeditions.',
    zh: '钢铁与电气时代（公元 1900 年）——悬索大桥、钢铁高塔、跨大陆铁路与极地探险遍布世界。',
  },
  '1950': {
    en: 'Mid-20th Century (1950 CE) — Global aviation, modern observatories, and international nature reserves expand worldwide.',
    zh: '二十世纪中叶（公元 1950 年）——全球航空网、现代天文台与自然保护区在世界各地扩展。',
  },
  '2000': {
    en: 'Turn of the Millennium (2000 CE) — Megastructures, particle accelerators, and permanent human presence in orbit.',
    zh: '千禧纪元（公元 2000 年）——现代巨型建筑、粒子加速器与人类常驻太空轨道的新纪元。',
  },
  now: {
    en: 'Living Planet Today — All geological wonders, historical monuments, modern landmarks, and active spacecraft.',
    zh: '今日脉动地球——汇聚地质奇观、历史遗迹、现代地标与实时在轨航天器。',
  },
};

/** Historical/geological summary for a time-machine stop. */
export function eraNote(stop: Stop): I18n {
  return ERA_NOTES[String(stop)] ?? ERA_NOTES.now;
}

/** Year an item appeared (built / happened), if known. */
export function dateOf(it: CatalogueItem): number | undefined {
  return it.facts?.built ?? it.facts?.year ?? it.facts?.born;
}

/** Whether an item exists on the globe at a given time-machine stop. */
export function visibleAt(it: CatalogueItem, stop: Stop): boolean {
  if (stop === 'now') return true;
  if (stop === 'dino') return it.facts?.mya !== undefined || it.type === 'volcano';
  if (it.facts?.mya !== undefined || it.type === 'vehicle') return false;
  const d = dateOf(it);
  return d === undefined || d <= stop;
}

/** Items that first appear at this stop (dated after the previous stop), newest first. */
export function appearingAt(items: CatalogueItem[], idx: number): CatalogueItem[] {
  const stop = STOPS[idx];
  if (typeof stop !== 'number') return stop === 'dino' ? items.filter(i => i.facts?.mya !== undefined) : [];
  const prev = typeof STOPS[idx - 1] === 'number' ? (STOPS[idx - 1] as number) : -Infinity;
  return items.filter(i => { const d = dateOf(i); return i.facts?.mya === undefined && d !== undefined && d > prev && d <= stop; })
    .sort((a, b) => dateOf(b)! - dateOf(a)!);
}
