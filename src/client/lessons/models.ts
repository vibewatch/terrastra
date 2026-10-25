/**
 * Small physical-geography models shared by the lessons (server) and the 3D kits (client): vertical natural belts and
 * eroded folds. No lesson text here, so the client can import it without pulling in lesson content.
 */
import type { Pair } from '../../shared/lessons/wire.ts';

// ── Vertical natural belts (shared with the `mountain` kit) ──────────────────────────────────────────────────────
export type BeltId = 'rainforest' | 'evergreen' | 'deciduous' | 'mixed' | 'conifer' | 'shrub' | 'meadow' | 'steppe' | 'colddesert' | 'snow' | 'tundra';
/** a belt from `from` to `to` metres above sea level */
export interface Belt { id: BeltId; from: number; to: number }
export const BELT_NAME: Record<BeltId, Pair> = {
  rainforest: ['Tropical rainforest', '热带雨林带'], evergreen: ['Evergreen broadleaf forest', '常绿阔叶林带'],
  deciduous: ['Deciduous broadleaf forest', '落叶阔叶林带'], mixed: ['Mixed forest', '针阔叶混交林带'],
  conifer: ['Coniferous forest', '针叶林带'], shrub: ['Alpine shrub', '高山灌丛带'], meadow: ['Alpine meadow', '高山草甸带'],
  steppe: ['Alpine steppe', '高山草原带'], colddesert: ['Alpine cold desert', '高山寒漠带'], snow: ['Ice and snow', '冰雪带'], tundra: ['Tundra', '苔原带'],
};
const FOOT: [number, number][] = [[0, 27], [10, 27], [20, 25], [30, 20], [40, 14], [50, 7], [60, 1], [70, -10], [90, -25]];
/** a typical (humid) mean annual temperature at sea level, °C */
export function footTemp(lat: number): number {
  const a = Math.min(90, Math.abs(lat));
  for (let i = 1; i < FOOT.length; i++) {
    const [x0, y0] = FOOT[i - 1], [x1, y1] = FOOT[i];
    if (a <= x1) return y0 + ((a - x0) / (x1 - x0)) * (y1 - y0);
  }
  return FOOT[FOOT.length - 1][1];
}
/** the air cools 0.6 °C per 100 m */
export const LAPSE = 0.006;
function beltAt(lat: number, h: number): BeltId {
  const T = footTemp(lat) - LAPSE * h, S = T + 0.22 * Math.abs(lat);
  if (S < -3) return 'snow';
  if (S < 0) return 'colddesert';
  if (S < 4) return 'meadow';
  if (S < 7) return 'shrub';
  return T >= 24 ? 'rainforest' : T >= 15 ? 'evergreen' : T >= 8 ? 'deciduous' : T >= 5 ? 'mixed' : 'conifer';
}
/** The belts of a humid mountain whose foot is at sea level at latitude `lat`, `height` metres high. */
export function beltsOf(lat: number, height: number): Belt[] {
  const out: Belt[] = [];
  for (let h = 0; h < height; h += 10) {
    const id = beltAt(lat, h), last = out[out.length - 1];
    if (last && last.id === id) last.to = Math.min(height, h + 10);
    else out.push({ id, from: h, to: Math.min(height, h + 10) });
  }
  // treeless cold at sea level is the tundra zone, not an alpine belt
  if (out.length && (out[0].id === 'shrub' || out[0].id === 'meadow' || out[0].id === 'colddesert')) out[0].id = 'tundra';
  return out;
}
/** Qomolangma (Mount Everest): the wet south slope and the dry north slope (from the Tibetan Plateau). */
export const EVEREST: { south: Belt[]; north: Belt[] } = {
  south: [
    { id: 'evergreen', from: 1000, to: 2500 }, { id: 'mixed', from: 2500, to: 3100 }, { id: 'conifer', from: 3100, to: 3900 },
    { id: 'shrub', from: 3900, to: 4700 }, { id: 'meadow', from: 4700, to: 5200 }, { id: 'colddesert', from: 5200, to: 5500 }, { id: 'snow', from: 5500, to: 8848 },
  ],
  north: [{ id: 'steppe', from: 4300, to: 5000 }, { id: 'meadow', from: 5000, to: 5500 }, { id: 'colddesert', from: 5500, to: 6000 }, { id: 'snow', from: 6000, to: 8848 }],
};

// ── Folds (shared with the `strata` kit) ─────────────────────────────────────────────────────────────────────────
/** squeeze and erosion (0 … 100) → fold amplitude `A`, erosion depth `E` and how much harder the cracked crest wears (`b`) */
export function foldModel(sq: number, er: number): { A: number; E: number; a: number; b: number } {
  const A = (1.1 * sq) / 100;
  return { A, E: er / 100, a: 0.4, b: 2.8 * Math.min(1, A / 0.55) };
}
/** has erosion turned the anticline into a valley (lower than the syncline)? */
export function foldInverted(sq: number, er: number): boolean {
  const { A, E, b } = foldModel(sq, er);
  return sq >= 30 && 2 * A - b * E < -0.15;
}
