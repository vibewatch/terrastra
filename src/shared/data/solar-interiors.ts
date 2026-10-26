/**
 * What is inside each world, for the cutaway view: layers from the centre outwards, each with its outer radius as a
 * fraction of the body's mean radius. Rounded from NASA fact sheets and mission results (seismology for Earth, the
 * Moon and Mars from Apollo and InSight; gravity fields from Juno, Cassini, Galileo, Dawn and New Horizons).
 * `maybe` marks layers that are a leading model, not a measurement (e.g. hidden oceans).
 */
import type { I18n } from './types.ts';
import type { BodyId } from './solar.ts';

export type LayerState = 'solid' | 'liquid' | 'gas' | 'plasma' | 'mixed';

export interface InteriorLayer {
  /** Outer edge, as a fraction of the mean radius (the last layer ends at 1). */
  r: number;
  name: I18n;
  color: string;
  state: LayerState;
  maybe?: boolean;
}

const L = (r: number, en: string, zh: string, color: string, state: LayerState, maybe?: boolean): InteriorLayer =>
  ({ r, name: { en, zh }, color, state, ...(maybe ? { maybe } : {}) });

const IRON_IN = '#fff1b8', IRON = '#ffb547', MANTLE = '#d9622b', ROCK = '#9a5b3c', CRUST = '#6b4a3a';
const OCEAN = '#2f7dd1', ICE = '#bfe6f5', MH = '#7c8aa5', H2 = '#d8b98a', GAS = '#e8d3a8';

export const INTERIORS: Partial<Record<BodyId, InteriorLayer[]>> = {
  sun: [
    L(0.25, 'Core', '核心', '#fffbe6', 'plasma'),
    L(0.7, 'Radiative zone', '辐射区', '#ffd166', 'plasma'),
    L(1, 'Convective zone', '对流区', '#ff8a2a', 'plasma'),
  ],
  mercury: [
    L(0.83, 'Iron core', '铁核', IRON, 'mixed'),
    L(0.985, 'Rocky mantle', '岩石地幔', MANTLE, 'solid'),
    L(1, 'Crust', '地壳', CRUST, 'solid'),
  ],
  venus: [
    L(0.53, 'Iron core', '铁核', IRON, 'mixed'),
    L(0.995, 'Rocky mantle', '岩石地幔', MANTLE, 'solid'),
    L(1, 'Crust', '地壳', CRUST, 'solid'),
  ],
  earth: [
    L(0.192, 'Inner core', '内核', IRON_IN, 'solid'),
    L(0.546, 'Outer core', '外核', IRON, 'liquid'),
    L(0.896, 'Lower mantle', '下地幔', MANTLE, 'solid'),
    L(0.995, 'Upper mantle', '上地幔', '#c0502a', 'solid'),
    L(1, 'Crust', '地壳', CRUST, 'solid'),
  ],
  moon: [
    L(0.14, 'Inner core', '内核', IRON_IN, 'solid'),
    L(0.19, 'Outer core', '外核', IRON, 'liquid'),
    L(0.977, 'Rocky mantle', '岩石月幔', '#8f6d5a', 'solid'),
    L(1, 'Crust', '月壳', '#6e6a66', 'solid'),
  ],
  mars: [
    L(0.54, 'Liquid iron core', '液态铁核', IRON, 'liquid'),
    L(0.985, 'Rocky mantle', '岩石地幔', MANTLE, 'solid'),
    L(1, 'Crust', '地壳', '#8a4a32', 'solid'),
  ],
  jupiter: [
    L(0.2, 'Fuzzy core of rock and ice', '岩石和冰的模糊核心', ROCK, 'mixed', true),
    L(0.78, 'Metallic hydrogen', '金属氢', MH, 'liquid'),
    L(0.99, 'Liquid hydrogen', '液态氢', H2, 'liquid'),
    L(1, 'Cloudy atmosphere', '云层大气', GAS, 'gas'),
  ],
  io: [
    L(0.52, 'Iron core', '铁核', IRON, 'mixed'),
    L(0.98, 'Hot rocky mantle', '炽热的岩石幔', '#e0782f', 'mixed'),
    L(1, 'Crust', '外壳', '#c9a640', 'solid'),
  ],
  europa: [
    L(0.4, 'Iron core', '铁核', IRON, 'mixed'),
    L(0.91, 'Rocky mantle', '岩石幔', ROCK, 'solid'),
    L(0.985, 'Salty ocean', '咸水海洋', OCEAN, 'liquid'),
    L(1, 'Ice shell', '冰壳', ICE, 'solid'),
  ],
  ganymede: [
    L(0.27, 'Iron core', '铁核', IRON, 'mixed'),
    L(0.55, 'Rocky mantle', '岩石幔', ROCK, 'solid'),
    L(0.87, 'Deep ice', '深层冰', '#8fb7cc', 'solid'),
    L(0.94, 'Salty ocean', '咸水海洋', OCEAN, 'liquid'),
    L(1, 'Ice crust', '冰壳', ICE, 'solid'),
  ],
  saturn: [
    L(0.2, 'Fuzzy core of rock and ice', '岩石和冰的模糊核心', ROCK, 'mixed', true),
    L(0.5, 'Metallic hydrogen', '金属氢', MH, 'liquid'),
    L(0.99, 'Liquid hydrogen', '液态氢', H2, 'liquid'),
    L(1, 'Cloudy atmosphere', '云层大气', GAS, 'gas'),
  ],
  enceladus: [
    L(0.73, 'Rocky core', '岩石核心', ROCK, 'solid'),
    L(0.92, 'Global ocean', '全球海洋', OCEAN, 'liquid'),
    L(1, 'Ice shell', '冰壳', ICE, 'solid'),
  ],
  titan: [
    L(0.77, 'Rocky core', '岩石核心', ROCK, 'solid'),
    L(0.89, 'High-pressure ice', '高压冰', '#8fb7cc', 'solid', true),
    L(0.96, 'Salty ocean', '咸水海洋', OCEAN, 'liquid', true),
    L(1, 'Ice crust', '冰壳', ICE, 'solid'),
  ],
  uranus: [
    L(0.2, 'Rocky core', '岩石核心', ROCK, 'solid'),
    L(0.75, 'Icy mantle (water, ammonia, methane)', '冰质地幔（水、氨、甲烷）', '#4fb3c8', 'liquid'),
    L(1, 'Hydrogen and helium', '氢和氦', '#bfe9ee', 'gas'),
  ],
  neptune: [
    L(0.25, 'Rocky core', '岩石核心', ROCK, 'solid'),
    L(0.8, 'Icy mantle (water, ammonia, methane)', '冰质地幔（水、氨、甲烷）', '#3a6fd8', 'liquid'),
    L(1, 'Hydrogen and helium', '氢和氦', '#9cc0f5', 'gas'),
  ],
  pluto: [
    L(0.72, 'Rocky core', '岩石核心', ROCK, 'solid'),
    L(0.8, 'Hidden ocean', '隐藏的海洋', OCEAN, 'liquid', true),
    L(1, 'Ice shell', '冰壳', ICE, 'solid'),
  ],
};

export const interiorOf = (id: BodyId): InteriorLayer[] | null => INTERIORS[id] ?? null;

/**
 * Radii for drawing: real fractions, except that every layer keeps at least `min` (of the radius) so a thin crust
 * stays visible. Thin layers grow inward, eating into the ones below.
 */
export function drawRadii(layers: InteriorLayer[], min = 0.018): number[] {
  const out = layers.map(l => l.r);
  for (let i = out.length - 1; i > 0; i--) out[i - 1] = Math.min(out[i - 1], out[i] - min);
  return out;
}
