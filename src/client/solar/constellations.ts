import { textW, underUI, uiRects, uiVersion } from '../ui/occluders.ts';
import * as THREE from 'three';
import { CONSTELLATIONS, type Constellation } from '../../shared/data/constellations.ts';
import { eqToEcl } from '../../shared/lib/sky.ts';
import { tr } from '../../shared/data/types.ts';
import { lang } from '../lib/i18n.ts';
import { starTint } from '../lib/starfield.ts';
import { cssFont } from '../lib/fonts.ts';

const D2R = Math.PI / 180;
/** Just inside the background starfield (radius 120) so figures sit on the same sky. */
const R = 118;
/** Gap left between a stick line and the star dot it ends on. */
const GAP = 0.7 * D2R;
const STAR_LABEL_COS = Math.cos(25 * D2R);
const MAX_STAR_LABELS = 8;
const MAX_SMALL_LABELS = 14;

const POINT_VS = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
uniform float uPr;
varying vec3 vColor;
void main() {
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPr;
}`;
const POINT_FS = /* glsl */ `
varying vec3 vColor;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = length(q);
  if (d > 1.0) discard;
  // A crisp hot core inside a soft coloured glow, added onto the sky.
  float core = 1.0 - smoothstep(0.18, 0.36, d), halo = pow(1.0 - d, 1.8);
  gl_FragColor = vec4(vColor * (core + 0.75 * halo) + 0.4 * core, 1.0);
}`;

/** Equatorial RA / Dec (degrees) → unit vector in the three.js scene frame (ecliptic XZ plane, ecliptic north +Y). */
function skyDir(ra: number, dec: number, out = new THREE.Vector3()): THREE.Vector3 {
  const cd = Math.cos(dec * D2R);
  const e = eqToEcl([cd * Math.cos(ra * D2R), cd * Math.sin(ra * D2R), Math.sin(dec * D2R)]);
  return out.set(e[0], e[2], -e[1]).normalize();
}

/** A body's disc on screen: centre x, y and radius in px. */
export type Disc = [x: number, y: number, r: number];

interface Figure {
  c: Constellation;
  dir: THREE.Vector3;
  el: HTMLButtonElement;
  shown: boolean;
}

interface StarTag {
  fig: Figure;
  dir: THREE.Vector3;
  mag: number;
  name: { en: string; zh: string };
  el: HTMLSpanElement;
  shown: boolean;
}

export class ConstellationLayer {
  private group = new THREE.Group();
  private root: HTMLDivElement;
  private figs: Figure[] = [];
  private tags: StarTag[] = [];
  private on = true;
  private lastKey = '';
  private v = new THREE.Vector3();
  private fwd = new THREE.Vector3();

  constructor(private scene: THREE.Scene, labelsEl: HTMLElement, private opts: { onPick?: (c: Constellation) => void } = {}) {
    this.root = document.createElement('div');
    this.root.className = 'cst-labels';
    this.root.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
    labelsEl.appendChild(this.root);

    let nStars = 0, nSegs = 0;
    for (const c of CONSTELLATIONS) { nStars += c.stars.length; nSegs += c.lines.length; }
    const sPos = new Float32Array(nStars * 3), sCol = new Float32Array(nStars * 3), sSize = new Float32Array(nStars);
    const lPos = new Float32Array(nSegs * 6);
    let si = 0, li = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), p = new THREE.Vector3();

    for (const c of CONSTELLATIONS) {
      const dirs = c.stars.map(([ra, dec]) => skyDir(ra, dec));
      const centre = new THREE.Vector3();
      dirs.forEach((d, i) => {
        centre.add(d);
        const mag = c.stars[i][2];
        const k = THREE.MathUtils.clamp(1.2 - 0.11 * mag, 0.62, 1);
        const [cr, cg, cb] = starTint(c.stars[i][0], c.stars[i][1]);
        sPos.set([d.x * R, d.y * R, d.z * R], si * 3);
        sCol.set([cr * k, cg * k, cb * k], si * 3);
        sSize[si++] = THREE.MathUtils.clamp(18 - 2.4 * mag, 8, 24);
      });
      for (const [i, j] of c.lines) {
        a.copy(dirs[i]); b.copy(dirs[j]);
        const ang = a.angleTo(b);
        const t = ang > GAP * 3 ? GAP / ang : 0;
        p.copy(a).lerp(b, t).setLength(R);
        lPos.set([p.x, p.y, p.z], li * 6);
        p.copy(a).lerp(b, 1 - t).setLength(R);
        lPos.set([p.x, p.y, p.z], li * 6 + 3);
        li++;
      }
      centre.normalize();

      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'cst-label';
      el.dataset.testid = `cst-${c.id}`;
      el.style.cssText = 'position:absolute;left:0;top:0;pointer-events:auto;display:none';
      el.addEventListener('click', (e) => { e.stopPropagation(); this.opts.onPick?.(c); });
      this.root.appendChild(el);
      const fig: Figure = { c, dir: centre, el, shown: false };
      this.figs.push(fig);

      for (const [k, name] of Object.entries(c.named ?? {})) {
        const i = Number(k);
        const s = document.createElement('span');
        s.className = 'cst-star';
        s.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;display:none';
        this.root.appendChild(s);
        this.tags.push({ fig, dir: dirs[i], mag: c.stars[i][2], name, el: s, shown: false });
      }
    }
    this.tags.sort((x, y) => x.mag - y.mag);

    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(lPos, 3));
    const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x4a7fa8, depthTest: false, depthWrite: false }));
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    sg.setAttribute('aColor', new THREE.BufferAttribute(sCol, 3));
    sg.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1));
    const mat = new THREE.ShaderMaterial({ uniforms: { uPr: { value: 1 } }, vertexShader: POINT_VS, fragmentShader: POINT_FS, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
    const pts = new THREE.Points(sg, mat);
    pts.onBeforeRender = (renderer) => { mat.uniforms.uPr.value = renderer.getPixelRatio(); };
    for (const o of [lines, pts]) {
      o.renderOrder = -9;
      o.frustumCulled = false;
      this.group.add(o);
    }
    this.scene.add(this.group);
    this.relabel();
  }

  get visible(): boolean { return this.on; }
  set visible(v: boolean) {
    this.on = v;
    this.group.visible = v;
    this.root.style.display = v ? '' : 'none';
    this.lastKey = '';
  }

  relabel(): void {
    const l = lang();
    for (const f of this.figs) f.el.textContent = tr(f.c.name, l);
    for (const t of this.tags) t.el.textContent = tr(t.name, l);
    this.lastKey = '';
  }

  /** Keeps the sky centred on the camera (like a skybox) and places the name labels; `discs` are bodies on screen. */
  update(camera: THREE.PerspectiveCamera, W: number, H: number, discs: Disc[] = []): void {
    if (!this.on) return;
    this.group.position.copy(camera.position);
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    uiRects();
    const key = `${uiVersion}|${W}|${H}|${camera.fov}|${e[0].toFixed(5)}|${e[1].toFixed(5)}|${e[2].toFixed(5)}|${e[8].toFixed(5)}|${e[9].toFixed(5)}|${e[10].toFixed(5)}|`
      + discs.map(d => `${d[0].toFixed(0)},${d[1].toFixed(0)},${d[2].toFixed(0)}`).join(';');
    if (key === this.lastKey) return;
    this.lastKey = key;
    camera.getWorldDirection(this.fwd);

    // Constellation names: nearest the view centre win when labels would overlap or the screen is small.
    const cand: { f: Figure; x: number; y: number; d: number }[] = [];
    for (const f of this.figs) {
      const s = this.project(f.dir, camera, W, H);
      if (s) cand.push({ f, x: s[0], y: s[1], d: (s[0] - W / 2) ** 2 + (s[1] - H / 2) ** 2 });
    }
    cand.sort((p, q) => p.d - q.d);
    const max = W < 700 ? MAX_SMALL_LABELS : Infinity;
    // Planet and Sun discs hide the sky behind them, names included.
    const boxes: [number, number, number, number][] = [];
    const behind = (x0: number, x1: number, y0: number, y1: number) => discs.some(([cx, cy, r]) => {
      const dx = cx - Math.max(x0, Math.min(cx, x1)), dy = cy - Math.max(y0, Math.min(cy, y1));
      return dx * dx + dy * dy < r * r;
    });
    const show = new Set<Figure>();
    for (const c of cand) {
      if (show.size >= max) break;
      const w = Math.max(40, textW(c.f.el.textContent!, 7)) / 2, x0 = c.x - w, x1 = c.x + w, y0 = c.y, y1 = c.y + 18;
      if (x0 < 4 || x1 > W - 4 || behind(x0, x1, y0, y1) || underUI(x0, y0, x1 - x0, 18) || boxes.some(([a0, a1, b0, b1]) => x0 < a1 && x1 > a0 && y0 < b1 && y1 > b0)) continue;
      boxes.push([x0, x1, y0, y1]);
      show.add(c.f);
      c.f.el.style.transform = `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px) translateX(-50%)`;
    }
    for (const f of this.figs) this.toggle(f, show.has(f));

    // Famous star names, only for figures close to the middle of the view.
    let n = 0;
    for (const t of this.tags) {
      let s: [number, number] | null = null;
      if (n < MAX_STAR_LABELS && t.fig.dir.dot(this.fwd) > STAR_LABEL_COS) s = this.project(t.dir, camera, W, H);
      if (s && behind(s[0], s[0], s[1], s[1])) s = null;
      if (s) {
        const w = textW(t.el.textContent!, 6), y0 = s[1] - 7, y1 = s[1] + 7;
        const free = (x0: number) => x0 > 4 && x0 + w < W - 4 && !behind(x0, x0 + w, y0, y1) && !underUI(x0, y0, w, 14) && !boxes.some(([a0, a1, b0, b1]) => x0 < a1 && x0 + w > a0 && y0 < b1 && y1 > b0);
        const x0 = free(s[0] + 6) ? s[0] + 6 : free(s[0] - 6 - w) ? s[0] - 6 - w : null;
        if (x0 === null) s = null;
        else { boxes.push([x0, x0 + w, y0, y1]); s = [x0, s[1]]; }
      }
      if (s) {
        n++;
        t.el.style.transform = `translate(${s[0].toFixed(1)}px, ${(s[1] - 7).toFixed(1)}px)`;
      }
      this.toggle(t, !!s);
    }
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o instanceof THREE.LineSegments || o instanceof THREE.Points) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.root.remove();
  }

  private toggle(o: { el: HTMLElement; shown: boolean }, v: boolean): void {
    if (o.shown === v) return;
    o.shown = v;
    o.el.style.display = v ? '' : 'none';
  }

  /** Screen position (px) of a sky direction, or null when it is behind the camera or off-screen. */
  private project(dir: THREE.Vector3, camera: THREE.PerspectiveCamera, W: number, H: number): [number, number] | null {
    if (dir.dot(this.fwd) < 0.05) return null;
    this.v.copy(dir).multiplyScalar(R).add(camera.position).project(camera);
    const x = (this.v.x + 1) / 2 * W, y = (1 - this.v.y) / 2 * H;
    if (x < -20 || x > W + 20 || y < -10 || y > H + 10) return null;
    return [x, y];
  }
}

/** A little star chart of one figure (north up, east left) for the card hero. */
export function drawConstellation(cv: HTMLCanvasElement, c: Constellation): void {
  const ctx = cv.getContext('2d')!, W = cv.width, H = cv.height;
  const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.7);
  g.addColorStop(0, '#0b1a2e'); g.addColorStop(1, '#03060c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  let s = c.id.charCodeAt(0) * 7 + c.id.charCodeAt(1) * 13 + c.id.charCodeAt(2);
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(200,220,255,${0.15 + rnd() * 0.45})`;
    ctx.fillRect(rnd() * W, rnd() * H, rnd() < 0.1 ? 2 : 1, rnd() < 0.1 ? 2 : 1);
  }
  const v = c.stars.map(([ra, dec]) => [Math.cos(dec * D2R) * Math.cos(ra * D2R), Math.cos(dec * D2R) * Math.sin(ra * D2R), Math.sin(dec * D2R)]);
  const c0 = v.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0]);
  const l0 = Math.hypot(...c0);
  c0.forEach((_, i) => (c0[i] /= l0));
  const e = [-c0[1], c0[0], 0], le = Math.hypot(...e) || 1;
  e.forEach((_, i) => (e[i] /= le));
  const n = [c0[1] * e[2] - c0[2] * e[1], c0[2] * e[0] - c0[0] * e[2], c0[0] * e[1] - c0[1] * e[0]];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const xy = v.map(p => { const z = dot(p, c0); return [-dot(p, e) / z, -dot(p, n) / z]; });
  const xs = xy.map(p => p[0]), ys = xy.map(p => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min((W * 0.78) / Math.max(1e-3, x1 - x0), (H * 0.72) / Math.max(1e-3, y1 - y0));
  const P = xy.map(([x, y]) => [W / 2 + (x - (x0 + x1) / 2) * k, H / 2 + (y - (y0 + y1) / 2) * k]);
  ctx.strokeStyle = 'rgba(103,232,249,0.55)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (const [i, j] of c.lines) { ctx.moveTo(P[i][0], P[i][1]); ctx.lineTo(P[j][0], P[j][1]); }
  ctx.stroke();
  c.stars.forEach(([, , mag], i) => {
    const r = Math.max(2.2, 9 - 1.6 * mag), [x, y] = P[i];
    const gl = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
    gl.addColorStop(0, 'rgba(220,235,255,0.55)'); gl.addColorStop(1, 'rgba(220,235,255,0)');
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f4f8ff';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  });
  ctx.font = `600 22px ${cssFont('--font-hud')}`;
  ctx.fillStyle = 'rgba(186,230,253,0.9)';
  const l = lang();
  for (const [i, name] of Object.entries(c.named ?? {})) {
    const [x, y] = P[Number(i)];
    const text = tr(name, l), w = ctx.measureText(text).width;
    ctx.fillText(text, x + 14 + w > W - 8 ? x - 14 - w : x + 14, y + 7);
  }
}

/** Card text for a figure, made from its data (both languages). */
export function constellationText(c: Constellation): { desc: { en: string; zh: string }; brightest: { en: string; zh: string } | null } {
  let bi = 0;
  c.stars.forEach((s, i) => { if (s[2] < c.stars[bi][2]) bi = i; });
  const b = c.named?.[bi] ?? null;
  return {
    brightest: b,
    desc: {
      en: `${c.name.en} is a pattern of ${c.stars.length} bright stars in the night sky. Joining the dots, people long ago saw a picture here and gave it a name.`
        + (b ? ` Its brightest star is ${b.en}.` : ''),
      zh: `${c.name.zh}是夜空中由 ${c.stars.length} 颗亮星连成的图案。很久以前，人们把这些星星连起来，看成一幅画，并给它起了名字。` + (b ? `其中最亮的星叫${b.zh}。` : ''),
    },
  };
}

/**
 * Earth latitude band `[southLat, northLat]` (degrees, −90..+90) from which the entire constellation figure
 * clears at least 5° above the horizon at culmination.
 */
export function constellationLatBand(c: Constellation): [number, number] {
  if (!c.stars.length) return [-90, 90];
  let minDec = 90, maxDec = -90;
  for (const [, dec] of c.stars) {
    if (dec < minDec) minDec = dec;
    if (dec > maxDec) maxDec = dec;
  }
  const south = Math.max(-90, Math.min(90, Math.round(maxDec - 85)));
  const north = Math.max(-90, Math.min(90, Math.round(minDec + 85)));
  return south <= north ? [south, north] : [Math.round((south + north) / 2), Math.round((south + north) / 2)];
}
