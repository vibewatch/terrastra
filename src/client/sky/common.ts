/**
 * Shared pieces of the sky theatre: frames (Earth-fixed ↔ local horizon), observer geometry, and the GLSL that
 * makes eclipses "fall out" of geometry: every lit surface asks how much of the Sun's disc is hidden by an occluder
 * (the Moon for Earth, Earth for the Moon) as seen from that very point, so umbra, penumbra, antumbra and the
 * shadow's shape and speed are exact rather than painted.
 */
import * as THREE from 'three';
import type { GeoPoint, Vec3 } from '../../shared/lib/astro/types.ts';
import type { BodyId } from '../../shared/data/solar.ts';

export const D2R = Math.PI / 180;
export const R_EARTH = 6378.137;
export const R_MOON = 1737.4;
export const R_SUN = 696_000;
/** Earth's shadow is ~1.2% larger than Earth because of the atmosphere (Danjon's rule, 1/85). */
export const R_SHADOW = R_EARTH * (1 + 1 / 85);

/** Observer on the WGS-84 ellipsoid → Earth-fixed km. */
export function obsEcef(o: GeoPoint, hKm = 0): Vec3 {
  const f = 1 / 298.257223563, e2 = f * (2 - f), la = o.lat * D2R, lo = o.lon * D2R;
  const N = R_EARTH / Math.sqrt(1 - e2 * Math.sin(la) ** 2);
  return [(N + hKm) * Math.cos(la) * Math.cos(lo), (N + hKm) * Math.cos(la) * Math.sin(lo), (N * (1 - e2) + hKm) * Math.sin(la)];
}

/**
 * Rotation into the local horizon frame used by every ground view: +x east, +y up (zenith), -z north. With `rotDeg`
 * = the observer's longitude it takes Earth-fixed vectors; with the local sidereal time it takes equatorial ones.
 */
export function horizonMatrix(rotDeg: number, latDeg: number, m = new THREE.Matrix4()): THREE.Matrix4 {
  const L = rotDeg * D2R, p = latDeg * D2R, sL = Math.sin(L), cL = Math.cos(L), sp = Math.sin(p), cp = Math.cos(p);
  return m.set(
    -sL, cL, 0, 0,
    cp * cL, cp * sL, sp, 0,
    sp * cL, sp * sL, -cp, 0,
    0, 0, 0, 1);
}

/** Earth-fixed position (km) → local horizon vector (km) for an observer. Pure JS doubles: keeps eclipse precision. */
export function toHorizon(p: Vec3, o: GeoPoint, at: Vec3): Vec3 {
  const L = o.lon * D2R, ph = o.lat * D2R, sL = Math.sin(L), cL = Math.cos(L), sp = Math.sin(ph), cp = Math.cos(ph);
  const x = p[0] - at[0], y = p[1] - at[1], z = p[2] - at[2];
  return [-sL * x + cL * y, cp * cL * x + cp * sL * y + sp * z, sp * cL * x + sp * sL * y - cp * z];
}

export const altOf = (v: Vec3) => Math.asin(v[1] / Math.hypot(v[0], v[1], v[2])) / D2R;
export const azOf = (v: Vec3) => ((Math.atan2(v[0], -v[2]) / D2R) + 360) % 360;
export const norm = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
export const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Angle between two directions (radians), precise for tiny angles. */
export const angle = (a: Vec3, b: Vec3) => Math.atan2(len(cross(a, b)), dot(a, b));

/** Fraction of a disc of angular radius rs hidden by a disc of radius ro whose centre is d away (same units). */
export function overlap(rs: number, ro: number, d: number): number {
  if (d >= rs + ro) return 0;
  if (d <= Math.abs(ro - rs)) return ro >= rs ? 1 : (ro * ro) / (rs * rs);
  const r1 = rs * rs, r2 = ro * ro;
  const a1 = Math.acos(Math.max(-1, Math.min(1, (d * d + r1 - r2) / (2 * d * rs))));
  const a2 = Math.acos(Math.max(-1, Math.min(1, (d * d + r2 - r1) / (2 * d * ro))));
  const k = Math.sqrt(Math.max(0, (-d + rs + ro) * (d + rs - ro) * (d - rs + ro) * (d + rs + ro)));
  return (r1 * a1 + r2 * a2 - 0.5 * k) / (Math.PI * r1);
}

/** Equatorial RA/Dec (deg) → unit vector (x → RA 0, z → north celestial pole). */
export function eqVec(ra: number, dec: number): Vec3 {
  const cd = Math.cos(dec * D2R);
  return [cd * Math.cos(ra * D2R), cd * Math.sin(ra * D2R), Math.sin(dec * D2R)];
}

/** Precess J2000 RA/Dec roughly to a given year (good to arc-seconds over decades; enough to keep stars and planets aligned). */
export function precess(ra: number, dec: number, year: number): [number, number] {
  const y = year - 2000, m = 46.1 / 3600 * y, n = 20.04 / 3600 * y;
  return [ra + m + n * Math.sin(ra * D2R) * Math.tan(dec * D2R), dec + n * Math.cos(ra * D2R)];
}

/** GLSL: the fraction of the Sun still visible from point p (all km, any common origin). */
export const OCCLUSION_GLSL = /* glsl */ `
float discOverlap(float rs, float ro, float d) {
  if (d >= rs + ro) return 0.0;
  if (d <= abs(ro - rs)) return ro >= rs ? 1.0 : (ro * ro) / (rs * rs);
  float r1 = rs * rs, r2 = ro * ro;
  float a1 = acos(clamp((d * d + r1 - r2) / (2.0 * d * rs), -1.0, 1.0));
  float a2 = acos(clamp((d * d + r2 - r1) / (2.0 * d * ro), -1.0, 1.0));
  float k = sqrt(max(0.0, (-d + rs + ro) * (d + rs - ro) * (d - rs + ro) * (d + rs + ro)));
  return (r1 * a1 + r2 * a2 - 0.5 * k) / (3.14159265 * r1);
}
/** x: fraction of the Sun visible; y: depth inside the umbra (0 at its edge, 1 on the axis), or -1 outside it. */
vec2 sunSeen(vec3 p, vec3 sun, float sunR, vec3 occ, float occR) {
  vec3 a = sun - p, b = occ - p;
  float lb = length(b);
  if (dot(a, b) <= 0.0) return vec2(1.0, -1.0);
  float rs = sunR / length(a), ro = asin(min(1.0, occR / lb));
  float d = atan(length(cross(a, b)), dot(a, b));
  float vis = 1.0 - discOverlap(rs, ro, d);
  float u = ro > rs ? (ro - rs - d) / max(ro - rs, 1e-6) : -1.0;
  return vec2(vis, u >= 0.0 ? u : -1.0);
}`;

/** A soft round sprite texture (for glows, planets and the diamond ring). */
let glowTex: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const S = 128, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!, gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.08, 'rgba(255,255,255,0.75)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  glowTex = new THREE.CanvasTexture(cv);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

/** A body's surface map (equirectangular, lon -180 at u = 0), painted off the main thread by the Solar System's painter. */
const maps = new Map<string, Promise<THREE.DataTexture>>();
const loaded = new Set<THREE.Texture>();

/**
 * Detach the cached textures from a renderer that is about to be disposed. three's renderer listens for each texture's
 * `dispose` event and never removes that listener itself, so a cached texture would keep every closed theatre's or
 * lesson board's renderer alive. The textures keep their pixels, and the next renderer uploads them again.
 */
export function releaseShared(): void {
  glowTex?.dispose();
  for (const t of loaded) t.dispose();
}
export function bodyTexture(id: BodyId, w = 1024): Promise<THREE.DataTexture> {
  const key = id + w;
  let p = maps.get(key);
  if (p) return p;
  p = new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../solar/solar.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ w: number; h: number; color: Uint8ClampedArray }>) => {
      const { w: W, h: H, color } = e.data;
      const tex = new THREE.DataTexture(new Uint8Array(color.buffer), W, H, THREE.RGBAFormat);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.flipY = true;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      worker.terminate();
      loaded.add(tex);
      resolve(tex);
    };
    worker.onerror = err => { worker.terminate(); maps.delete(key); reject(err); };
    worker.postMessage({ seq: 1, id, w, rings: false });
  });
  maps.set(key, p);
  return p;
}

/** UTC offset (hours) of an IANA time zone at a moment, daylight saving included. */
export function zoneOffset(zone: string, ms: number): number {
  try {
    const v = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(ms).find(p => p.type === 'timeZoneName')?.value ?? '';
    const m = /GMT([+\-\u2212])(\d{1,2})(?::(\d\d))?/.exec(v);
    return m ? (m[1] === '+' ? 1 : -1) * (+m[2] + +(m[3] ?? 0) / 60) : 0;
  } catch { return 0; }
}

const offLabel = (off: number) => {
  const a = Math.abs(off), h = Math.floor(a + 1e-9), m = Math.round((a - h) * 60);
  return `UTC${off >= 0 ? '+' : '−'}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
};

/** Clock time at a UTC offset (hours), as "HH:MM (UTC+8)", optionally with the date; `est` marks a sun-time guess ("≈UTC+8"), not a legal zone. */
export function localClock(ms: number, off: number, withDate = false, l: 'en' | 'zh' = 'en', est = false): string {
  const d = new Date(ms + off * 3600_000);
  const hh = String(d.getUTCHours()).padStart(2, '0'), mm = String(d.getUTCMinutes()).padStart(2, '0');
  const tz = (est ? '≈' : '') + offLabel(off);
  if (!withDate) return `${hh}:${mm} (${tz})`;
  const date = l === 'zh' ? `${d.getUTCMonth() + 1}月${d.getUTCDate()}日` : d.toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${date} ${hh}:${mm} (${tz})`;
}

/** A place's clock: real zones follow daylight saving at that moment; places without one show an estimated sun time. */
export function siteClock(ms: number, site: { tz: number; zone?: string; est?: boolean }, withDate = false, l: 'en' | 'zh' = 'en'): string {
  return localClock(ms, site.zone ? zoneOffset(site.zone, ms) : site.tz, withDate, l, !site.zone && !!site.est);
}
