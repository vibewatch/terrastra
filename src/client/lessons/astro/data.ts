/** The astronomy lessons, in course order, and the curricula they belong to. */
import { A_EARTHMOON } from './l-earthmoon.ts';
import { A_SOLAR } from './l-solar.ts';
import { A_SKY } from './l-sky.ts';
import { A_MOTION } from './l-motion.ts';
import { A_EARTHSUN } from './l-earthsun.ts';
import { A_STARS } from './l-stars.ts';
import { A_COSMOS } from './l-cosmos.ts';
import { A_EXTRA } from './l-extra.ts';
import type { AstroStrand, Lesson, Pair, Track } from '../kit.ts';

const ALL: Lesson[] = [...A_EARTHMOON, ...A_SOLAR, ...A_SKY, ...A_MOTION, ...A_EARTHSUN, ...A_STARS, ...A_COSMOS, ...A_EXTRA];
const STRAND_ORDER: AstroStrand[] = ['earthmoon', 'solar', 'sky', 'earthsun', 'motion', 'stars', 'cosmos'];
/** Grouped by theme, junior lessons before senior ones within a theme. */
export const ASTRO_LESSONS: Lesson[] = STRAND_ORDER.flatMap(s => ALL.filter(l => l.strand === s && l.level === 'jr').concat(ALL.filter(l => l.strand === s && l.level !== 'jr')));

export const ASTRO_STRANDS: Record<AstroStrand, Pair> = {
  earthmoon: ['Sun, Earth and Moon', '太阳、地球和月球'],
  solar: ['The Solar System', '太阳系'],
  sky: ['The night sky', '星空'],
  earthsun: ['Earth’s motions and the Sun', '地球运动和太阳'],
  motion: ['Gravity, orbits and spaceflight', '引力、轨道和航天'],
  stars: ['Stars and their planets', '恒星和行星系统'],
  cosmos: ['Galaxies and the universe', '星系和宇宙'],
};

export type AstroView = 'all' | 'cnj' | 'cns' | Track;
export const ASTRO_VIEWS: Record<AstroView, { name: Pair; note: Pair }> = {
  all: { name: ['All topics', '全部主题'], note: ['Every lesson, grouped by theme, junior before senior.', '所有课程，按主题分组，初中在前，高中在后。'] },
  cnj: { name: ['China · junior secondary', '中国 · 初中'], note: ['Science (Earth and the universe) and Geography grade 7: Sun, Moon, Solar System, the starry sky, spaceflight.', '初中科学《地球和宇宙》和七年级地理：日月、太阳系、星空、航天。'] },
  cns: { name: ['China · senior secondary', '中国 · 高中'], note: ['Geography (compulsory 1, elective 1, chapter 1) and Physics (compulsory 2: gravitation and spaceflight), plus extension topics on stars and cosmology.', '高中地理必修一、选择性必修一第一章，物理必修二《万有引力与宇宙航行》，以及恒星和宇宙学的拓展内容。'] },
  uk: { name: ['England · KS3 and GCSE', '英国 · KS3 和 GCSE'], note: ['KS3 Space physics (gravity, seasons, the Solar System, light years) and GCSE Space physics (orbits, the life cycle of stars, red-shift and the Big Bang).', 'KS3 空间物理（引力、季节、太阳系、光年）和 GCSE 空间物理（轨道、恒星的一生、红移和大爆炸）。'] },
  us: { name: ['USA · NGSS MS and HS', '美国 · NGSS 初中和高中'], note: ['MS-ESS1 Earth’s place in the universe (Sun–Earth–Moon, gravity, scale) and HS-ESS1 (the Sun, stars, the Big Bang, orbits).', 'MS-ESS1 地球在宇宙中的位置（日地月、引力、尺度）和 HS-ESS1（太阳、恒星、大爆炸、轨道运动）。'] },
  ib: { name: ['IB MYP and DP', 'IB 中学项目和大学预科'], note: ['MYP sciences (Earth and space) and DP Physics (gravitational fields, orbits, stellar evolution, cosmology).', 'MYP 科学（地球与空间）和 DP 物理（引力场、轨道、恒星演化、宇宙学）。'] },
  au: { name: ['Australia · years 7–10', '澳大利亚 · 7–10 年级'], note: ['Year 7 Sun–Earth–Moon (seasons, eclipses, tides) and year 10 the universe (the Big Bang, galaxies).', '7 年级日地月（季节、日食和月食、潮汐），10 年级宇宙（大爆炸、星系）。'] },
};

/** A curriculum's astronomy lessons, in groups by theme (the Chinese views keep only their level). */
export function astroCourse(view: AstroView): { name: Pair; lessons: Lesson[] }[] {
  const keep = (l: Lesson) => view === 'all' || (view === 'cnj' ? l.level === 'jr' : view === 'cns' ? l.level === 'sr' : l.tracks.includes(view));
  return STRAND_ORDER.map(s => ({ name: ASTRO_STRANDS[s], lessons: ASTRO_LESSONS.filter(l => l.strand === s && keep(l)) }))
    .filter(g => g.lessons.length > 0);
}
