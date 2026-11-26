/**
 * Lightweight lesson catalog metadata and lazy Pro loader.
 * Renders the curriculum browser immediately while keeping Pro lesson bodies & question banks
 * inside server-gated `pro-lessons-*.js` chunks until unlocked.
 */
import rawCatalog from './catalog-meta.json';
import { SSBS_LESSONS, SSBS_VIEWS, ssbsCourse } from './ssbs/index.ts';
import { ssbsOn } from '../lib/ssbs.ts';
import { freeLessonById, findFreeCanonicalQuiz } from './free-bundle.ts';
import { isFreeLesson } from '../../shared/lib/entitlements.ts';
import type { AstroStrand, Grade, Lesson, Level, Pair, Quiz, Strand, Track } from './kit.ts';

export type { Lesson, Quiz, Step, Track } from './kit.ts';

export interface LessonMeta {
  id: string;
  strand: Strand | AstroStrand;
  level?: Level;
  grade?: Grade;
  tracks: Track[];
  unit: Pair;
  title: Pair;
  blurb: Pair;
  icon: string;
  minutes: number;
  exam?: boolean;
}

export type Subject = 'geo' | 'astro' | 'ssbs';
export const subjectOf = (id: string): Subject => (id.startsWith('a-') ? 'astro' : id.startsWith('ssbs-') ? 'ssbs' : 'geo');

export type View = 'all' | 'cn' | 'cns' | Track;
export type AstroView = 'all' | 'cnj' | 'cns' | Track;

export const GRADES: Record<Grade, Pair> = {
  g7a: ['Grade 7 · Term 1', '七年级上册'],
  g7b: ['Grade 7 · Term 2', '七年级下册'],
  g8a: ['Grade 8 · Term 1', '八年级上册'],
  g8b: ['Grade 8 · Term 2', '八年级下册'],
  h1: ['Senior · Compulsory 1', '高中 · 必修第一册'],
  h2: ['Senior · Elective 1 (physical geography)', '高中 · 选择性必修 1 自然地理基础'],
};
const JUNIOR: Grade[] = ['g7a', 'g7b', 'g8a', 'g8b'];
const SENIOR: Grade[] = ['h1', 'h2'];
const STRAND_ORDER: Strand[] = ['maps', 'physical', 'climate', 'human', 'world', 'china'];
export const STRANDS: Record<Strand, Pair> = {
  maps: ['The Earth, maps and time', '地球、地图与时间'],
  physical: ['Landforms, rocks and water', '地貌、岩石与水'],
  climate: ['Weather, climate and biomes', '天气、气候与生物群落'],
  human: ['People, cities and the economy', '人口、城市与经济'],
  world: ['Regions and countries', '世界的地区和国家'],
  china: ['China', '中国地理'],
};
export const VIEWS: Record<View, { name: Pair; note: Pair }> = {
  all: { name: ['All topics', '全部主题'], note: ['Every lesson, grouped by theme.', '所有课程，按主题分组。'] },
  cn: { name: ['China · PEP grades 7–8', '中国 · 人教版初中地理'], note: ['The four volumes of the Chinese middle-school textbook, in order.', '按人教版初中地理七上、七下、八上、八下四册的顺序。'] },
  cns: { name: ['China · PEP senior high', '中国 · 人教版高中地理'], note: ['Senior physical geography: the Earth\'s layers and history, the atmosphere and its circulation, ocean currents, landforms and natural zones.', '高中自然地理：地球的圈层与演化、大气受热与大气环流、洋流、地貌的塑造、自然环境的整体性与差异性。'] },
  uk: { name: ['England · Key Stage 3', '英国 · 英格兰 KS3'], note: ['National Curriculum: locational and place knowledge (Africa, Russia, Asia with China and India, the Middle East), physical and human geography, map skills.', '英格兰国家课程：区位和地方知识（非洲、俄罗斯、亚洲中的中国和印度、中东），自然与人文地理，地图技能。'] },
  us: { name: ['USA · grades 6–8', '美国 · 6–8 年级'], note: ['National Geography Standards and C3: the world in spatial terms, places and regions, physical systems, human systems, environment and society.', '美国国家地理标准与 C3 框架：空间视角、地方与区域、自然系统、人文系统、环境与社会。'] },
  ib: { name: ['IB MYP · Cambridge', 'IB 中学项目 · 剑桥国际'], note: ['Concept-based courses for international schools: systems, global interactions, sustainability and development.', '国际学校的概念式课程：系统、全球互动、可持续发展与发展。'] },
  au: { name: ['Australia · years 7–8', '澳大利亚 · 7–8 年级'], note: ['Australian Curriculum: water in the world, place and liveability, landforms and landscapes, changing nations.', '澳大利亚国家课程：世界的水、地方与宜居性、地貌与景观、变化中的国家。'] },
};

const ASTRO_STRAND_ORDER: AstroStrand[] = ['earthmoon', 'solar', 'sky', 'earthsun', 'motion', 'stars', 'cosmos'];
export const ASTRO_STRANDS: Record<AstroStrand, Pair> = {
  earthmoon: ['Sun, Earth and Moon', '太阳、地球和月球'],
  solar: ['The Solar System', '太阳系'],
  sky: ['The night sky', '星空'],
  earthsun: ['Earth’s motions and the Sun', '地球运动和太阳'],
  motion: ['Gravity, orbits and spaceflight', '引力、轨道和航天'],
  stars: ['Stars and their planets', '恒星和行星系统'],
  cosmos: ['Galaxies and the universe', '星系和宇宙'],
};
export const ASTRO_VIEWS: Record<AstroView, { name: Pair; note: Pair }> = {
  all: { name: ['All topics', '全部主题'], note: ['Every lesson, grouped by theme, junior before senior.', '所有课程，按主题分组，初中在前，高中在后。'] },
  cnj: { name: ['China · junior secondary', '中国 · 初中'], note: ['Science (Earth and the universe) and Geography grade 7: Sun, Moon, Solar System, the starry sky, spaceflight.', '初中科学《地球和宇宙》和七年级地理：日月、太阳系、星空、航天。'] },
  cns: { name: ['China · senior secondary', '中国 · 高中'], note: ['Geography (compulsory 1, elective 1, chapter 1) and Physics (compulsory 2: gravitation and spaceflight), plus extension topics on stars and cosmology.', '高中地理必修一、选择性必修一第一章，物理必修二《万有引力与宇宙航行》，以及恒星和宇宙学的拓展内容。'] },
  uk: { name: ['England · KS3 and GCSE', '英国 · KS3 和 GCSE'], note: ['KS3 Space physics (gravity, seasons, the Solar System, light years) and GCSE Space physics (orbits, the life cycle of stars, red-shift and the Big Bang).', 'KS3 空间物理（引力、季节、太阳系、光年）和 GCSE 空间物理（轨道、恒星的一生、红移和大爆炸）。'] },
  us: { name: ['USA · NGSS MS and HS', '美国 · NGSS 初中和高中'], note: ['MS-ESS1 Earth’s place in the universe (Sun–Earth–Moon, gravity, scale) and HS-ESS1 (the Sun, stars, the Big Bang, orbits).', 'MS-ESS1 地球在宇宙中的位置（日地月、引力、尺度）和 HS-ESS1（太阳、恒星、大爆炸、轨道运动）。'] },
  ib: { name: ['IB MYP and DP', 'IB 中学项目和大学预科'], note: ['MYP sciences (Earth and space) and DP Physics (gravitational fields, orbits, stellar evolution, cosmology).', 'MYP 科学（地球与空间）和 DP 物理（引力场、轨道、恒星演化、宇宙学）。'] },
  au: { name: ['Australia · years 7–10', '澳大利亚 · 7–10 年级'], note: ['Year 7 Sun–Earth–Moon (seasons, eclipses, tides) and year 10 the universe (the Big Bang, galaxies).', '7 年级日地月（季节、日食和月食、潮汐），10 年级宇宙（大爆炸、星系）。'] },
};

const GEO_META = rawCatalog.geo as unknown as LessonMeta[];
const ASTRO_META = rawCatalog.astro as unknown as LessonMeta[];
const GEO_BY_ID = new Map(GEO_META.map(l => [l.id, l]));
const CN_META_ORDER: LessonMeta[] = rawCatalog.cnOrderIds
  .map(id => GEO_BY_ID.get(id))
  .filter((l): l is LessonMeta => Boolean(l));

const toLessonMeta = (l: Lesson): LessonMeta => ({
  id: l.id, strand: l.strand, level: l.level, grade: l.grade, tracks: l.tracks,
  unit: l.unit, title: l.title, blurb: l.blurb, icon: l.icon, minutes: l.minutes, exam: l.exam,
});
const ssbsMeta = (): LessonMeta[] => SSBS_LESSONS.map(toLessonMeta);

export function geoCourseMeta(view: View): { name: Pair; lessons: LessonMeta[] }[] {
  if (view === 'cn' || view === 'cns') {
    return (view === 'cn' ? JUNIOR : SENIOR).map(g => ({ name: GRADES[g], lessons: CN_META_ORDER.filter(l => l.grade === g) }));
  }
  return STRAND_ORDER.map(s => ({
    name: STRANDS[s],
    lessons: GEO_META.filter(l => l.strand === s && (view === 'all' || l.tracks.includes(view as Track))),
  })).filter(g => g.lessons.length > 0);
}

export function astroCourseMeta(view: AstroView): { name: Pair; lessons: LessonMeta[] }[] {
  const keep = (l: LessonMeta) => view === 'all' || (view === 'cnj' ? l.level === 'jr' : view === 'cns' ? l.level === 'sr' : l.tracks.includes(view));
  return ASTRO_STRAND_ORDER.map(s => ({
    name: ASTRO_STRANDS[s],
    lessons: ASTRO_META.filter(l => l.strand === s && keep(l)),
  })).filter(g => g.lessons.length > 0);
}

export function ssbsCourseMeta(): { name: Pair; lessons: LessonMeta[] }[] {
  return ssbsCourse().map(g => ({ name: g.name, lessons: g.lessons.map(toLessonMeta) }));
}

interface MetaCatalog {
  views: Record<string, { name: Pair; note: Pair }>;
  course(v: string): { name: Pair; lessons: LessonMeta[] }[];
  key: string;
  def(zh: boolean): string;
}

export const META_CATALOGS: Record<Subject, MetaCatalog> = {
  geo: { views: VIEWS, course: v => geoCourseMeta(v as View), key: 'lessonTrack', def: zh => (zh ? 'cn' : 'all') },
  astro: { views: ASTRO_VIEWS, course: v => astroCourseMeta(v as AstroView), key: 'astroTrack', def: zh => (zh ? 'cnj' : 'all') },
  ssbs: { views: SSBS_VIEWS, course: () => ssbsCourseMeta(), key: 'ssbsTrack', def: () => 'ssbs' },
};

export function lessonMetaById(id: string): LessonMeta | undefined {
  return GEO_BY_ID.get(id)
    ?? ASTRO_META.find(l => l.id === id)
    ?? (ssbsOn() ? ssbsMeta().find(l => l.id === id) : undefined);
}

export function nextLessonMeta(id: string, view: string): LessonMeta | undefined {
  const flat = META_CATALOGS[subjectOf(id)].course(view).flatMap(g => g.lessons);
  const i = flat.findIndex(l => l.id === id);
  return i >= 0 ? flat[i + 1] : undefined;
}

export const ALL_GEO_META: readonly LessonMeta[] = GEO_META;
export const ALL_ASTRO_META: readonly LessonMeta[] = ASTRO_META;

/** Loads a full Lesson object; free starter lessons resolve from the public bundle, Pro lessons lazy-load from `pro-lessons-*.js`. */
export async function loadLessonById(id: string): Promise<Lesson | undefined> {
  if (isFreeLesson(id)) return freeLessonById(id);
  if (id.startsWith('a-')) {
    const astro = await import('./pro-astro-bundle.ts');
    return astro.proAstroLessonById(id);
  }
  const pro = await import('./pro-bundle.ts');
  return pro.proLessonById(id);
}

/** Loads a canonical Quiz object for Mistake Notebook review; checks free lessons first, then the matching Pro bundle if accessible. */
export async function loadCanonicalQuiz(lessonId: string, qEn: string, allowPro: boolean): Promise<Quiz | undefined> {
  const free = findFreeCanonicalQuiz(lessonId, qEn);
  if (free || !allowPro) return free;
  try {
    if (lessonId.startsWith('a-')) {
      const astro = await import('./pro-astro-bundle.ts');
      const hit = astro.proFindAstroCanonicalQuiz(lessonId, qEn);
      if (hit) return hit;
    }
    const pro = await import('./pro-bundle.ts');
    const geoHit = pro.proFindCanonicalQuiz(lessonId, qEn);
    if (geoHit) return geoHit;
    if (!lessonId.startsWith('a-')) {
      const astro = await import('./pro-astro-bundle.ts');
      return astro.proFindAstroCanonicalQuiz(lessonId, qEn);
    }
    return undefined;
  } catch {
    return undefined;
  }
}
