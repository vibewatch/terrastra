/**
 * 3D content on other worlds (the Solar System's "landmarks"): landers, rovers and crewed sites on the surface,
 * orbiters circling their world, active plumes, and spacecraft far out in the Solar System. Only the focused world's
 * sites are built (one model per frame, via the shared worker-backed model library), so the overview stays cheap.
 */
import * as THREE from 'three';
import { textW, underUI } from '../ui/occluders.ts';
import type { BodyId } from '../../shared/data/solar.ts';
import { SOLAR_SITES, type SolarSite } from '../../shared/data/solar-sites.ts';
import { latLonToVec } from '../../shared/lib/geo.ts';
import { displayOrbit, type Vec3 } from '../../shared/lib/orbits.ts';
import { tr } from '../../shared/data/types.ts';
import { lang } from '../lib/i18n.ts';
import { buildModel, whenModelReady } from '../models/library.ts';

const BY_BODY = new Map<BodyId, SolarSite[]>();
for (const s of SOLAR_SITES) {
  if (s.helio) continue;
  const list = BY_BODY.get(s.body) ?? [];
  list.push(s);
  BY_BODY.set(s.body, list);
}
/** Sites on / around a world (not the deep-space craft). */
export const sitesOf = (id: BodyId): SolarSite[] => BY_BODY.get(id) ?? [];
const FAR_CRAFT = SOLAR_SITES.filter(s => s.helio);

/** Where a deep-space craft is (AU) for a date: its 2026-01-01 spot moved outward at its cruise speed. */
export function helioAU(s: SolarSite, ms: number): number {
  const h = s.helio!;
  return Math.max(1, h.au + h.auPerYear * ((ms - Date.UTC(2026, 0, 1)) / 3.15576e10));
}

/** Is point `p` hidden from the camera by the world's disc (centre `o`, radius `R`)? */
export function behindWorld(p: THREE.Vector3, cam: THREE.Vector3, o: THREE.Vector3, R: number): boolean {
  const dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - cam.z;
  const len = Math.hypot(dx, dy, dz);
  const ox = o.x - cam.x, oy = o.y - cam.y, oz = o.z - cam.z;
  const t = (ox * dx + oy * dy + oz * dz) / len;
  if (t <= 0 || t >= len) return false;
  return ox * ox + oy * oy + oz * oz - t * t < R * R;
}

/** A world as the site layer needs it. */
interface SiteBody { id: BodyId; R: number; pos: THREE.Vector3; tilt: THREE.Object3D; spin: THREE.Object3D }

interface SiteRT {
  s: SolarSite;
  holder: THREE.Group;
  pivot: THREE.Group;
  obj: THREE.Object3D | null;
  label: HTMLButtonElement;
  plume: THREE.Points | null;
  requested: boolean;
  /** Frames the label's soft show/hide answer has disagreed with its current state. */
  hold: number;
}

const PLUME_VS = /* glsl */ `
attribute vec3 aSeed; uniform float uTime; uniform float uH; uniform float uPx;
varying float vA;
void main() {
  float t = fract(aSeed.x + uTime * (0.18 + 0.12 * aSeed.y));
  float r = uH * 0.45 * t * aSeed.z;
  float ang = aSeed.y * 6.2831 + aSeed.x * 17.0;
  vec3 p = vec3(cos(ang) * r, uH * (t - 0.55 * t * t) * (0.7 + 0.6 * aSeed.z), sin(ang) * r);
  vA = (1.0 - t) * smoothstep(0.0, 0.08, t);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(uPx * uH * 0.06 / -mv.z, 1.5, 24.0);
  gl_Position = projectionMatrix * mv;
}`;
const PLUME_FS = /* glsl */ `
uniform vec3 uColor; varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5; float d = dot(c, c);
  if (d > 0.25) discard;
  float a = vA * (1.0 - d * 4.0) * 0.55;
  gl_FragColor = vec4(uColor * a, a);
}`;

export class SiteLayer {
  sel: SolarSite | null = null;
  private rt = new Map<string, SiteRT>();
  private body: BodyId | null = null;
  private ready: SiteRT[] = [];
  private far: SiteRT[] = [];
  private uTime = { value: 0 };
  private uPx = { value: 800 };

  constructor(private scene: THREE.Scene, private nearEl: HTMLElement, private farEl: HTMLElement, private pick: (s: SolarSite) => void) {}

  private make(s: SolarSite, parent: HTMLElement): SiteRT {
    let r = this.rt.get(s.key);
    if (r) return r;
    const label = document.createElement('button');
    label.className = 'sf-label site kind-' + s.kind + (s.future ? ' future' : '');
    label.dataset.testid = s.key;
    label.innerHTML = '<b></b><span></span>';
    label.querySelector('b')!.textContent = s.emoji;
    label.querySelector('span')!.textContent = tr(s.name, lang());
    label.hidden = true;
    label.onclick = () => this.pick(s);
    parent.append(label);
    const holder = new THREE.Group(), pivot = new THREE.Group();
    holder.add(pivot);
    r = { s, holder, pivot, obj: null, label, plume: null, requested: false, hold: 0 };
    this.rt.set(s.key, r);
    return r;
  }

  private load(r: SiteRT, size: number): void {
    if (r.requested || !r.s.model) return;
    r.requested = true;
    // The focused world's models jump the globe's build queue; far craft can wait.
    void whenModelReady(r.s.model, !r.s.helio).then(() => { r.holder.userData.size = size; this.ready.push(r); }).catch(() => {});
  }

  /** Builds the focused world's sites (or tears them down when you leave it). */
  sync(b: SiteBody | null): void {
    const id = b?.id ?? null;
    if (id === this.body) return;
    for (const r of this.rt.values()) if (!r.s.helio) { r.holder.removeFromParent(); r.label.hidden = true; }
    this.body = id;
    if (!b) return;
    for (const s of sitesOf(b.id)) {
      const r = this.make(s, this.nearEl);
      const size = b.R * 0.075 * (s.scale ?? 1);
      if (s.orbit) {
        r.holder.rotation.set(0, (s.lon * Math.PI) / 180, (s.orbit.inclDeg * Math.PI) / 180);
        const rad = b.R * (1 + s.orbit.altR);
        if (!r.holder.userData.ring) {
          const pts: THREE.Vector3[] = [];
          for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * rad, 0, Math.sin(a) * rad)); }
          const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.22, depthWrite: false }));
          r.holder.add(ring);
          r.holder.userData.ring = ring;
        }
        r.holder.userData.rad = rad;
        b.tilt.add(r.holder);
      } else {
        const n = new THREE.Vector3(...latLonToVec(s.lat, s.lon));
        r.holder.position.copy(n).multiplyScalar(b.R * 0.998);
        r.holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
        b.spin.add(r.holder);
      }
      if (s.fx && !r.plume) r.plume = this.plume(r, b.R * s.fx.height, s.fx.color);
      this.load(r, size);
    }
  }

  private plume(r: SiteRT, H: number, color: string): THREE.Points {
    const n = 420, seed = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) seed[i] = Math.random();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, H / 2, 0), H);
    const m = new THREE.ShaderMaterial({ vertexShader: PLUME_VS, fragmentShader: PLUME_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: this.uTime, uPx: this.uPx, uH: { value: H }, uColor: { value: new THREE.Color(color) } } });
    const p = new THREE.Points(g, m);
    r.pivot.add(p);
    return p;
  }

  /** Spacecraft far out in the Solar System, shown in the overview. */
  private ensureFar(): void {
    if (this.far.length || !FAR_CRAFT.length) return;
    for (const s of FAR_CRAFT) {
      const r = this.make(s, this.farEl);
      this.scene.add(r.holder);
      this.far.push(r);
      this.load(r, 1.6 * (s.scale ?? 1));
    }
  }

  /** Animates orbiters/plumes, places the far craft for the date, builds one waiting model, moves the labels. */
  update(now: number, simMs: number, cam: THREE.PerspectiveCamera, W: number, H: number, focus: SiteBody, overview: boolean, placed: [number, number][]): void {
    this.ensureFar();
    this.uTime.value = now / 1000;
    this.uPx.value = H / (2 * Math.tan((cam.fov * Math.PI) / 360));
    const r0 = this.ready.shift();
    if (r0 && r0.s.model) {
      const obj = buildModel(r0.s.model);
      const rad = (obj.userData.radius as number | undefined) ?? 0.6;
      obj.scale.setScalar(((r0.holder.userData.size as number) * 0.6) / rad);
      r0.obj = obj;
      r0.pivot.add(obj);
    }
    const tmp = new THREE.Vector3(), p = new THREE.Vector3();
    const toCam = cam.position.clone().sub(focus.pos);
    const dc = toCam.length();
    toCam.divideScalar(dc);
    const near = this.body === focus.id && dc < focus.R * 7;
    focus.spin.updateWorldMatrix(true, false);
    const max = W < 700 ? 6 : 12;
    let shown = 0;
    for (const r of this.rt.values()) {
      const s = r.s;
      if (s.orbit && r.holder.parent) {
        const a = ((now / 1000) / s.orbit.periodS) * Math.PI * 2;
        const rad = r.holder.userData.rad as number;
        r.pivot.position.set(Math.cos(a) * rad, 0, -Math.sin(a) * rad);
        r.pivot.rotation.y = a;
      }
      if (s.helio) {
        const au = helioAU(s, simMs), la = (s.helio.lat * Math.PI) / 180, lo = (s.helio.lon * Math.PI) / 180;
        const e: Vec3 = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
        r.holder.position.set(e[0], e[2], -e[1]).multiplyScalar(displayOrbit(au));
        r.holder.visible = overview;
      }
      // label
      let show = false, soft = false;
      if (s.helio) show = overview;
      else if (near && r.holder.parent && (shown < max || s === this.sel)) {
        r.pivot.getWorldPosition(tmp);
        const n = tmp.clone().sub(focus.pos).normalize();
        show = s.orbit ? !behindWorld(tmp, cam.position, focus.pos, focus.R) : n.dot(toCam) > focus.R / dc + 0.08;
      }
      if (show) {
        if (s.helio) r.holder.getWorldPosition(tmp);
        p.copy(tmp).project(cam);
        const sx = (p.x + 1) / 2 * W, sy = (1 - p.y) / 2 * H;
        show = p.z < 1 && sx > 8 && sy > 8 && sx < W - 8 && sy < H - 8;
        if (show) {
          soft = true;
          // Clashes with the chrome or another label are soft: one moving across such an edge would blink every frame,
          // so the label only changes state once the new answer has held for a few frames.
          let free = s === this.sel || (!underUI(sx - 10, sy - 10, textW(r.label.textContent ?? '', 7.5) + 30, 20)
            && !placed.some(([x, y]) => Math.abs(x - sx) < 80 && Math.abs(y - sy) < 20));
          if (free === r.label.hidden) { if (++r.hold < 4) free = !free; else r.hold = 0; } else r.hold = 0;
          show = free;
        }
        if (show) {
          placed.push([sx, sy]);
          if (!s.helio) shown++;
          r.label.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
        }
      }
      if (!soft) r.hold = 0;
      if (r.label.hidden === show) r.label.hidden = !show;
      r.label.classList.toggle('on', s === this.sel);
    }
  }

  relabel(): void {
    const l = lang();
    for (const r of this.rt.values()) r.label.querySelector('span')!.textContent = tr(r.s.name, l);
  }
}
