import type { Vec3 } from './astro/types.ts';

// Small 3-vector helpers shared by the orbit maths, the sky view and the procedural nebula/galaxy painters.

export const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Unit vector along v (a zero vector stays zero). */
export const norm = (v: Vec3): Vec3 => { const l = len(v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
