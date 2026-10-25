/**
 * The astronomy board: a full-screen WebGL canvas over the (paused) globe and under the lesson card. Each step runs
 * one kit (see `types.ts`); the board owns the renderer, the orbit camera, the HTML labels, the lesson clock and the
 * "pick it" taps, and frames everything in the free area beside the card.
 */
import type { CountryInfo } from '../../globe/painter.ts';
import * as THREE from 'three';
import { OrbitControls } from '../../sky/controls.ts';
import { releaseShared } from '../../sky/common.ts';
import { KITS } from './kits.ts';
import { disposeTree, v3 } from './draw.ts';
import type { AstroClock, AstroScene, BoardScene, KitCtx, KitRun, Label, LabelOpts, Pair, V3 } from './types.ts';

export interface AstroOpts {
  low: boolean;
  lang: () => 'en' | 'zh';
  /** the free screen area beside the lesson card (null: the whole screen) */
  frame: () => { left: number; top: number; width: number; height: number } | null;
  /** called when the board takes over the screen / gives it back (pause or resume the globe) */
  onActive: (on: boolean) => void;
  /** the globe's country shapes (for maps drawn by kits) */
  countries?: () => readonly CountryInfo[];
}

interface LiveLabel extends Label { obj?: THREE.Object3D; text: Pair | string; o: LabelOpts }

const DAY = 864e5;
/** Seconds before the clock starts (the camera settles first). */
const LEAD = 0.9;

export class AstroStage {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.01, 20000);
  private orbit: OrbitControls;
  private root = new THREE.Group();
  private labelsEl: HTMLDivElement;
  private labels: LiveLabel[] = [];
  private picks: { obj: THREE.Object3D; tag: string }[] = [];
  private kit: KitRun | null = null;
  private cur: BoardScene | null = null;
  private seq = 0;
  private raf = 0;
  private last = 0;
  private elapsed = 0;
  private fitK = 1;
  private ro: ResizeObserver;
  private active = false;
  /** Lesson clock: fraction of the span played (0 … 1), and whether it runs. */
  frac = 0;
  playing = true;
  onClock: (() => void) | null = null;
  /** Lab sliders' values (see `AstroScene.params`). */
  readonly params: Record<string, number> = {};
  /** A tap on the scene (not a drag): the tag of the pickable object under it, or null. */
  onPick: ((tag: string | null, x: number, y: number) => void) | null = null;

  constructor(private opts: AstroOpts) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'astro-board';
    this.canvas.dataset.testid = 'astro-board';
    this.canvas.hidden = true;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !opts.low, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, opts.low ? 1 : 2));
    this.renderer.setClearColor(0x02040a);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.orbit = new OrbitControls(this.canvas, this.camera);
    this.labelsEl = document.createElement('div');
    this.labelsEl.className = 'lesson-marks astro-marks';
    this.labelsEl.setAttribute('aria-hidden', 'true');
    this.labelsEl.hidden = true;
    this.scene.add(this.root);
    this.scene.add(this.camera);
    document.body.append(this.canvas, this.labelsEl);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(document.documentElement);
    this.bindTaps();
  }

  get clock(): AstroClock | undefined { return this.cur?.clock; }
  /** The clock's value now (UTC ms for dates). */
  get value(): number {
    const c = this.cur?.clock;
    return c ? c.from + (c.to - c.from) * this.frac : 0;
  }
  /** Which kit runs (tests). */
  get kitId(): string | null { return this.kit ? this.cur?.kit ?? null : null; }
  get shown(): boolean { return this.active; }
  /** Camera distance and the zoom bounds of the current view (tests). */
  get zoom(): { dist: number; min: number; max: number } { return { dist: this.orbit.dist, min: this.orbit.minDist, max: this.orbit.maxDist }; }

  /** Shows one scene (a lesson step or a quiz question). The kit module loads on first use. */
  async show(s: BoardScene): Promise<void> {
    const seq = ++this.seq;
    this.setActive(true);
    this.clear();
    this.cur = s;
    for (const k of Object.keys(this.params)) delete this.params[k];
    for (const p of s.params ?? []) this.params[p.id] = p.value;
    this.frac = s.clock?.at ?? 0;
    this.playing = !s.clock?.hold;
    this.elapsed = 0;
    this.onClock?.();
    const factory = (await KITS[s.kit]()).default as (ctx: KitCtx, o: AstroScene) => KitRun;
    if (seq !== this.seq) return;
    this.resize();
    this.kit = factory(this.ctx(), s as AstroScene);
    if (s.cam) this.ctx().view(s.cam.from, s.cam.dist, s.cam.target, true);
    this.orbit.settle();
    this.kit.update(this.value, 0, 0);
  }

  /** Give the screen back to the globe (a globe step or the end of the lesson). */
  hide(): void {
    this.seq++;
    this.clear();
    this.cur = null;
    this.setActive(false);
  }

  relabel(): void {
    for (const l of this.labels) this.writeLabel(l);
    this.onClock?.();
  }

  /** The scene's lab sliders and tasks. */
  get lab(): { params: NonNullable<AstroScene['params']>; tasks: { text: Pair }[] } | null {
    const s = this.cur;
    return s?.params?.length || s?.tasks?.length ? { params: s.params ?? [], tasks: s.tasks ?? [] } : null;
  }
  /** Moves a lab slider. */
  setParam(id: string, v: number): void {
    if (!(id in this.params)) return;
    this.params[id] = v;
    this.kit?.update(this.value, 0, this.elapsed);
    this.onClock?.();
  }

  seek(frac: number): void {
    this.frac = Math.max(0, Math.min(1, frac));
    this.kit?.update(this.value, 0, this.elapsed);
    this.onClock?.();
  }

  clockText(): string {
    const c = this.cur?.clock;
    if (!c) return '';
    const zh = this.opts.lang() === 'zh', v = this.value;
    let s: string;
    if (c.fmt) s = c.fmt[zh ? 1 : 0].replace('{v}', fmtNum(v, c.dp ?? 0, zh));
    else switch (c.unit) {
      case 'date': s = new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(v); break;
      case 'hour': s = zh ? `${fmtNum(v, c.dp ?? 0, zh)} 小时` : `${fmtNum(v, c.dp ?? 0, zh)} h`; break;
      case 'day': s = zh ? `第 ${Math.floor(v)} 天` : `Day ${Math.floor(v)}`; break;
      case 'year': s = zh ? `${fmtNum(v, c.dp ?? 1, zh)} 年` : `${fmtNum(v, c.dp ?? 1, zh)} yr`; break;
      case 'myr': s = zh ? `${fmtNum(v * 100, c.dp ?? 0, zh)} 万年` : `${fmtNum(v, c.dp ?? 1, zh)} million yr`; break;
      case 'gyr': s = zh ? `${fmtNum(v * 10, c.dp ?? 1, zh)} 亿年` : `${fmtNum(v, c.dp ?? 2, zh)} billion yr`; break;
      case 'deg': s = `${fmtNum(v, c.dp ?? 0, zh)}°`; break;
      case 'lat': s = v === 0 ? (zh ? '赤道' : 'Equator') : zh ? `${v > 0 ? '北纬' : '南纬'} ${fmtNum(Math.abs(v), c.dp ?? 0, zh)}°` : `${fmtNum(Math.abs(v), c.dp ?? 0, zh)}° ${v > 0 ? 'N' : 'S'}`; break;
      case 'kms': s = `${fmtNum(v, c.dp ?? 1, zh)} km/s`; break;
      default: s = fmtNum(v, c.dp ?? 0, zh);
    }
    const r = this.kit?.readout?.(v);
    return r ? `${s} · ${typeof r === 'string' ? r : r[zh ? 1 : 0]}` : s;
  }

  dispose(): void {
    this.hide();
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.orbit.dispose();
    releaseShared();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
    this.labelsEl.remove();
  }

  // ------------------------------------------------------------------------------------------------ internals

  private setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    this.canvas.hidden = !on;
    this.labelsEl.hidden = !on;
    document.body.classList.toggle('astro-on', on);
    this.opts.onActive(on);
    if (on) { this.last = performance.now(); this.raf = requestAnimationFrame(this.loop); this.resize(); }
    else cancelAnimationFrame(this.raf);
  }

  private clear(): void {
    try { this.kit?.dispose?.(); } catch { /* a kit's own cleanup must not stop the lesson */ }
    this.kit = null;
    for (const c of [...this.root.children]) { this.root.remove(c); disposeTree(c); }
    for (const l of this.labels) l.el.remove();
    this.labels = [];
    this.picks = [];
    this.scene.background = null;
    this.scene.fog = null;
    this.camera.up.set(0, 0, 1);
    this.orbit.enabled = true;
    this.orbit.up.set(0, 0, 1);
    this.orbit.target.set(0, 0, 0);
    this.orbit.minDist = 0.05; this.orbit.maxDist = 20000;
  }

  private ctx(): KitCtx {
    const zh = () => this.opts.lang() === 'zh';
    return {
      root: this.root, scene: this.scene, camera: this.camera, orbit: this.orbit, renderer: this.renderer, low: this.opts.low,
      countries: () => this.opts.countries?.() ?? [],
      zh, L: (p: Pair) => p[zh() ? 1 : 0],
      view: (from: V3, dist: number, target: V3 = [0, 0, 0], snap = false) => {
        const d = dist * this.fitK;
        // each view bounds the zoom around its framing, so the scene can't be lost off-screen or zoomed through
        this.orbit.minDist = d * 0.4; this.orbit.maxDist = d * 2.5;
        this.orbit.target.copy(v3(target));
        this.orbit.place(v3(from), d, snap);
      },
      label: (at: THREE.Vector3 | THREE.Object3D, text: Pair | string, o: LabelOpts = {}) => {
        const el = document.createElement('div');
        el.className = 'lesson-mark astro-mark' + (o.big ? ' big' : '') + (o.dot ? ' dot' : '');
        if (o.c) el.style.setProperty('--c', o.c);
        el.style.visibility = 'hidden';
        const obj = at instanceof THREE.Object3D ? at : undefined;
        const L: LiveLabel = {
          el, obj, text, o, on: true,
          pos: obj ? new THREE.Vector3() : (at as THREE.Vector3).clone(),
          set: (t: Pair | string) => { L.text = t; this.writeLabel(L); },
        };
        this.writeLabel(L);
        this.labels.push(L);
        this.labelsEl.append(el);
        return L;
      },
      pickable: (obj: THREE.Object3D, tag: string) => { this.picks.push({ obj, tag }); },
      param: (id: string) => this.params[id] ?? NaN,
    };
  }

  private writeLabel(l: LiveLabel): void {
    l.el.textContent = typeof l.text === 'string' ? l.text : l.text[this.opts.lang() === 'zh' ? 1 : 0];
  }

  /** Size the canvas to the window and centre the projection on the free area beside the card. */
  private resize(): void {
    const W = innerWidth, H = innerHeight;
    if (!W || !H) return;
    this.renderer.setSize(W, H, false);
    const f = this.opts.frame();
    const fw = f && f.width > 80 ? f.width : W, fh = f && f.height > 80 ? f.height : H;
    const cx = f && f.width > 80 ? f.left + f.width / 2 : W / 2, cy = f && f.height > 80 ? f.top + f.height / 2 : H / 2;
    this.camera.aspect = W / H;
    this.camera.setViewOffset(W, H, Math.round(W / 2 - cx), Math.round(H / 2 - cy), W, H);
    this.camera.updateProjectionMatrix();
    // a scene framed for a 16:10 screen at distance d fits the free area at d·k
    const k = Math.max((1.6 * H) / fw, H / fh, 1);
    if (this.kit && Math.abs(k - this.fitK) > 0.02) {
      const f = k / this.fitK;
      this.orbit.minDist *= f; this.orbit.maxDist *= f;
      this.orbit.zoom(f);
    }
    this.fitK = k;
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (document.hidden) return;
    this.elapsed += dt;
    const c = this.cur?.clock;
    if (c && this.playing && c.rate && this.elapsed > LEAD) {
      const span = (c.to - c.from) || 1, step = (c.rate * (c.unit === 'date' ? DAY : 1) * dt) / span;
      let f = this.frac + step;
      if (f > 1) { if (c.once) { f = 1; this.playing = false; } else f = 0; }
      this.frac = f;
      this.onClock?.();
    }
    this.orbit.update(dt);
    try { this.kit?.update(this.value, dt, this.elapsed); }
    catch (e) { console.error('astro kit', e); this.kit = null; }
    this.placeLabels();
    this.renderer.render(this.scene, this.camera);
  };

  private placeLabels(): void {
    const W = innerWidth, H = innerHeight, v = new THREE.Vector3();
    this.camera.updateMatrixWorld();
    const card = document.querySelector('.lesson-card')?.getBoundingClientRect();
    for (const l of this.labels) {
      if (l.obj) l.obj.getWorldPosition(l.pos);
      const shown = l.on && (l.o.t ?? 0) <= this.elapsed && (!l.obj || isVisible(l.obj));
      v.copy(l.pos).project(this.camera);
      const x = ((v.x + 1) / 2) * W + (l.o.dx ?? 0), y = ((1 - v.y) / 2) * H + (l.o.dy ?? 0);
      const inside = v.z < 1 && x > -40 && x < W + 40 && y > -20 && y < H + 20;
      const covered = card && x > card.left && x < card.right && y > card.top && y < card.bottom;
      const ok = shown && inside && !covered;
      l.el.style.visibility = ok ? 'visible' : 'hidden';
      if (ok) l.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(${l.o.dot ? '-6px' : '-50%'}, -50%)`;
    }
  }

  /** Taps (pointer down and up without much movement) pick the nearest pickable object. */
  private bindTaps(): void {
    let down: { x: number; y: number } | null = null;
    this.canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
    this.canvas.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 || !this.onPick) { down = null; return; }
      down = null;
      this.onPick(this.pickAt(e.clientX, e.clientY), e.clientX, e.clientY);
    });
  }

  /** The tag under a screen point: a raycast hit on a pickable mesh, else the nearest pickable centre within 40 px. */
  pickAt(x: number, y: number): string | null {
    const W = innerWidth, H = innerHeight;
    const ndc = new THREE.Vector2((x / W) * 2 - 1, -(y / H) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const meshes = this.picks.filter(p => isVisible(p.obj));
    const hits = ray.intersectObjects(meshes.map(p => p.obj), true).filter(h => !(h.object instanceof THREE.Sprite) && !(h.object instanceof THREE.Points) && !(h.object instanceof THREE.Line));
    if (hits.length) {
      for (const p of meshes) { let o: THREE.Object3D | null = hits[0].object; while (o) { if (o === p.obj) return p.tag; o = o.parent; } }
    }
    let best: string | null = null, bd = 40;
    const v = new THREE.Vector3();
    for (const p of meshes) {
      p.obj.getWorldPosition(v).project(this.camera);
      if (v.z > 1) continue;
      const d = Math.hypot(((v.x + 1) / 2) * W - x, ((1 - v.y) / 2) * H - y);
      if (d < bd) { bd = d; best = p.tag; }
    }
    return best;
  }

  /** Label a pickable object (the answer to a "pick it" question, or the user's pick). */
  flag(tag: string, text: Pair, c: string): void {
    const p = this.picks.find(q => q.tag === tag);
    if (p) this.ctx().label(p.obj, text, { c, dot: true, big: true });
  }

  /** Screen position of a pickable (tests). */
  pickScreen(tag: string): { x: number; y: number } | null {
    const p = this.picks.find(q => q.tag === tag);
    if (!p) return null;
    const v = p.obj.getWorldPosition(new THREE.Vector3()).project(this.camera);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  }
}

function isVisible(o: THREE.Object3D): boolean {
  for (let x: THREE.Object3D | null = o; x; x = x.parent) if (!x.visible) return false;
  return true;
}

function fmtNum(v: number, dp: number, zh: boolean): string {
  const r = Math.round(v * 10 ** dp) / 10 ** dp;
  return (r === 0 ? 0 : r).toLocaleString(zh ? 'zh-CN' : 'en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
