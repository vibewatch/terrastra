/**
 * Map projections for the flat world map. Coordinates are radians; `lam` is the longitude relative to the central
 * meridian (−π…π). Every projection here is linear in `lam` at a given latitude, which lets the map pan sideways by
 * turning the central meridian. `PROJ_GLSL` mirrors these functions for the GPU.
 */
export type ProjId = 'equalearth' | 'mercator' | 'plate';
export const PROJ_IDS: ProjId[] = ['equalearth', 'mercator', 'plate'];
export const PROJ_INDEX: Record<ProjId, number> = { equalearth: 0, mercator: 1, plate: 2 };

const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796;
const M = Math.sqrt(3) / 2;
/** Mercator stops at ±85.05°, where the map is square (the usual web-map cut-off). */
export const MERC_MAX = 2 * Math.atan(Math.exp(Math.PI)) - Math.PI / 2;

const eeY = (th: number) => { const t2 = th * th, t6 = t2 * t2 * t2; return th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)); };
const eeDY = (th: number) => { const t2 = th * th, t6 = t2 * t2 * t2; return A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2); };

/** Half width and half height of the whole map. */
export const EXTENT: Record<ProjId, [number, number]> = {
  equalearth: [(Math.PI * 2 * Math.sqrt(3)) / (3 * A1), eeY(Math.PI / 3)],
  mercator: [Math.PI, Math.PI],
  plate: [Math.PI, Math.PI / 2],
};

/** x per radian of longitude at latitude `phi` (x = lam · xScale). */
export function xScale(p: ProjId, phi: number): number {
  if (p !== 'equalearth') return 1;
  const th = Math.asin(M * Math.sin(phi));
  return (2 * Math.sqrt(3) * Math.cos(th)) / (3 * eeDY(th));
}

export function yOf(p: ProjId, phi: number): number {
  if (p === 'plate') return phi;
  if (p === 'mercator') { const f = Math.max(-MERC_MAX, Math.min(MERC_MAX, phi)); return Math.log(Math.tan(Math.PI / 4 + f / 2)); }
  return eeY(Math.asin(M * Math.sin(phi)));
}

export function forward(p: ProjId, lam: number, phi: number): [number, number] {
  return [lam * xScale(p, phi), yOf(p, phi)];
}

/** Latitude at map height `y` (clamped to the map). */
export function phiOf(p: ProjId, y: number): number {
  if (p === 'plate') return Math.max(-Math.PI / 2, Math.min(Math.PI / 2, y));
  if (p === 'mercator') return 2 * Math.atan(Math.exp(Math.max(-Math.PI, Math.min(Math.PI, y)))) - Math.PI / 2;
  const ym = EXTENT.equalearth[1];
  const yy = Math.max(-ym, Math.min(ym, y));
  let th = yy / A1;
  for (let i = 0; i < 8; i++) th -= (eeY(th) - yy) / eeDY(th);
  return Math.asin(Math.max(-1, Math.min(1, Math.sin(th) / M)));
}

/** [lam, phi] of map point (x, y), or null off the map (outside the equal-earth oval, beyond the poles). */
export function inverse(p: ProjId, x: number, y: number): [number, number] | null {
  if (Math.abs(y) > EXTENT[p][1]) return null;
  const phi = phiOf(p, y);
  const lam = x / xScale(p, phi);
  if (p === 'equalearth' && !(Math.abs(lam) <= Math.PI + 1e-9)) return null;
  return [lam, phi];
}

/** Cylindrical maps repeat sideways forever; the equal-earth oval is drawn once. */
export const wraps = (p: ProjId) => p !== 'equalearth';

export const wrapPi = (a: number) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

const f = (v: number) => v.toFixed(8);
/** GLSL `xScale(phi)`, `projF(lam, phi)` and `phiOf(y)`, switched by `uniform int uProj` (0 equal earth, 1 Mercator, 2 plate carrée). */
export const PROJ_GLSL = /* glsl */ `
  uniform int uProj;
  const float PI = 3.14159265359;
  const float EE_YM = ${f(EXTENT.equalearth[1])};
  float eeY(float t) { float t2 = t * t, t6 = t2 * t2 * t2; return t * (${f(A1)} + (${f(A2)}) * t2 + t6 * (${f(A3)} + ${f(A4)} * t2)); }
  float eeDY(float t) { float t2 = t * t, t6 = t2 * t2 * t2; return ${f(A1)} + 3.0 * (${f(A2)}) * t2 + t6 * (7.0 * ${f(A3)} + 9.0 * ${f(A4)} * t2); }
  float xScale(float phi) {
    if (uProj != 0) return 1.0;
    float th = asin(0.86602540378 * sin(phi));
    return 3.46410161514 * cos(th) / (3.0 * eeDY(th));
  }
  vec2 projF(float lam, float phi) {
    if (uProj == 2) return vec2(lam, phi);
    if (uProj == 1) { float g = clamp(phi, -${f(MERC_MAX)}, ${f(MERC_MAX)}); return vec2(lam, log(tan(PI / 4.0 + g / 2.0))); }
    float th = asin(0.86602540378 * sin(phi));
    return vec2(lam * 3.46410161514 * cos(th) / (3.0 * eeDY(th)), eeY(th));
  }
  float halfH() { return uProj == 0 ? EE_YM : uProj == 1 ? PI : PI / 2.0; }
  float wrapPi(float a) { return a - 2.0 * PI * floor((a + PI) / (2.0 * PI)); }
  float phiOf(float y) {
    if (uProj == 2) return clamp(y, -PI / 2.0, PI / 2.0);
    if (uProj == 1) return 2.0 * atan(exp(clamp(y, -PI, PI))) - PI / 2.0;
    float yy = clamp(y, -EE_YM, EE_YM);
    float th = yy / ${f(A1)};
    for (int i = 0; i < 6; i++) th -= (eeY(th) - yy) / eeDY(th);
    return asin(clamp(sin(th) / 0.86602540378, -1.0, 1.0));
  }
`;
