/**
 * The sky theatre: one full-screen stage that plays a sky event. It owns the renderer, the clock and the chrome;
 * scenes (ground / space) draw, acts decide what to show and say.
 */
import * as THREE from 'three';
import type { SkyEvent } from '../../shared/lib/astro/index.ts';
import { tr } from '../../shared/data/types.ts';
import { h, trapTab } from '../ui/dom.ts';
import { Select } from '../ui/select.ts';
import { icon } from '../ui/icons.ts';
import { lang } from '../lib/i18n.ts';
import { s, SITES, type SkyKey } from './text.ts';
import { releaseShared, siteClock, zoneOffset } from './common.ts';
import { GroundSky } from './ground.ts';
import { SpaceScene } from './space.ts';
import { ModelScene } from './model.ts';
import { LookControls, OrbitControls } from './controls.ts';
import { buildAct, bodyName, type Act, type Ctx, type Frame, type Site, type Timing, type View } from './acts.ts';
import { Calendar, findEvent, nextHighlight, countdown } from './panel.ts';
import { AdaptiveResolution } from '../globe/quality.ts';

export interface TheatreOpts {
  id?: string;
  /** Where the globe was facing (offered as a site). */
  globe?: { lat: number; lon: number };
  lowfx?: boolean;
  /** Device quality: pixel-ratio ceiling and whether to antialias. */
  dprMax?: number;
  msaa?: boolean;
  onClose: () => void;
  onSolar?: (focus: string, ms: number) => void;
  /** Open the camera on this view. */
  onPhoto?: () => void;
}

const SITE_KEY = 'pp.skyObs';
const RATES = [1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8];
const VIEW_KEY: Record<View, SkyKey> = { model: 'model', ground: 'ground', space: 'space', moon: 'fromMoon' };
/** Idle drift of the model camera (rad/s). */
const DRIFT = 0.022;

export class Theatre {
  readonly el: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private ground: GroundSky;
  private space: SpaceScene;
  private model: ModelScene;
  private ctx: Ctx;
  /** The clock of the current view (the model view may run on its own). */
  private tm!: Timing;
  private cal: Calendar;
  private act!: Act;
  private ev!: SkyEvent;
  private adapt: AdaptiveResolution | null = null;
  private view: View = 'ground';
  private t = 0;
  private playing = true;
  private rateIx = 3;
  private raf = 0;
  private last = 0;
  private uiAcc = 1;
  /** Next frame is a cut: put the camera on its target instead of easing there. */
  private cut = true;
  private siteId: string;
  private ro: ResizeObserver;

  // chrome
  private cv: HTMLCanvasElement;
  private labels = h('div', { class: 'sky-labels', 'aria-hidden': 'true' });
  private titleEl = h('h2', { class: 'sky-title', id: 'sky-title' });
  private dateEl = h('small', { class: 'sky-date' });
  private viewsEl = h('div', { class: 'sky-views', role: 'tablist' });
  private siteSel!: Select;
  private readEl = h('dl', { class: 'sky-read' });
  private capEl = h('p', { class: 'sky-cap', 'aria-live': 'polite' });
  private noteEl = h('p', { class: 'sky-note' });
  private hintEl = h('div', { class: 'sky-hint' });
  private noticeEl = h('p', { class: 'sky-notice' });
  private zoomEl = h('div', { class: 'sky-zoom' });
  private solarBtn: HTMLButtonElement;
  private playBtn: HTMLButtonElement;
  private rateEl = h('b', { class: 'sky-rate' });
  private range = h('input', { class: 'sky-range', type: 'range', min: '0', max: '1000', step: '1', 'aria-label': s('timeline') });
  private marksEl = h('div', { class: 'sky-marks' });
  private fillEl = h('i', { class: 'sky-fill' });
  private clockEl = h('output', { class: 'sky-clock' });
  private calBtn: HTMLButtonElement;

  private shot: ((url: string) => void) | null = null;
  /** The next rendered frame as a JPEG data URL. */
  capture(): Promise<string> { return new Promise(res => { this.shot = res; }); }
  /** What a photo of the current view shows, and how faithful the view is. */
  caption(): { title: string; level: string; note: string } {
    const date = this.ev ? new Date(this.ev.t).toLocaleDateString(lang() === 'zh' ? 'zh-CN' : 'en', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    return {
      title: [this.titleEl.textContent, date].filter(Boolean).join(' · '),
      level: s('theatre') + ' · ' + (VIEW_KEY[this.view] ? s(VIEW_KEY[this.view]) : ''),
      note: s(this.view === 'ground' ? 'photoNoteGround' : 'photoNoteModel'),
    };
  }

  constructor(host: HTMLElement, private opts: TheatreOpts) {
    this.siteId = localStorage.getItem(SITE_KEY) ?? 'best';
    this.cv = h('canvas', { class: 'sky-cv', 'data-testid': 'sky-canvas' });
    this.renderer = new THREE.WebGLRenderer({ canvas: this.cv, antialias: opts.msaa ?? !opts.lowfx, powerPreference: 'high-performance' });
    this.renderer.debug.checkShaderErrors = import.meta.env.DEV;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, opts.dprMax ?? 1.75, opts.lowfx ? 1 : 2));
    // the same frame-time budget as the Earth and the Solar System: drop resolution on a struggling phone, win it back later
    if (!opts.lowfx) this.adapt = new AdaptiveResolution(Math.min(0.75, this.renderer.getPixelRatio()), this.renderer.getPixelRatio());
    this.renderer.setClearColor(0x000000);
    this.ground = new GroundSky(this.labels);
    this.space = new SpaceScene();
    this.model = new ModelScene();
    const look = new LookControls(this.cv, this.ground.camera);
    const orbit = new OrbitControls(this.cv, this.space.camera);
    const morbit = new OrbitControls(this.cv, this.model.camera);
    this.ctx = { ground: this.ground, space: this.space, model: this.model, look, orbit, morbit, user: false };
    look.onUser = orbit.onUser = morbit.onUser = () => { this.ctx.user = true; };

    this.solarBtn = h('button', { class: 'sky-btn sky-solar', 'data-testid': 'sky-solar', onclick: () => this.toSolar() },
      h('span', { html: icon('planet', 18) }), h('span', {}, s('openSolar')));
    this.playBtn = h('button', { class: 'sky-btn sky-btn-sq sky-play', 'data-testid': 'sky-play', onclick: () => this.setPlaying(!this.playing) });
    this.calBtn = h('button', {
      class: 'sky-btn sky-btn-sq sky-calbtn', 'data-testid': 'sky-cal', 'aria-expanded': 'false', title: s('list'), html: icon('calendar', 18), onclick: () => this.toggleCal(),
    });
    this.cal = new Calendar(() => this.pick(), e => { this.load(e); if (matchMedia('(max-width: 820px)').matches) this.toggleCal(false); });

    const sites = [
      { value: 'best', label: s('bestSpot') },
      ...(opts.globe ? [{ value: 'globe', label: s('globeSpot') }] : []),
      ...SITES.map(x => ({ value: x.id, label: tr(x.name, lang()) }))];
    if (!sites.some(o => o.value === this.siteId)) this.siteId = 'best';
    this.siteSel = new Select({ label: s('where'), testid: 'sky-site', icon: 'pin', className: 'sky-select', value: this.siteId, options: sites, onChange: v => {
      this.siteId = v;
      try { localStorage.setItem(SITE_KEY, this.siteId); } catch { /* private mode */ }
      this.cal.render();
      this.load(this.ev, true);
    } });

    this.range.addEventListener('input', () => {
      const a = this.tm;
      this.t = a.t0 + (a.t1 - a.t0) * Number(this.range.value) / 1000;
      this.uiAcc = 1;
      if (!this.ctx.user) this.cut = true;
    });

    const back = h('button', { class: 'sky-btn sky-btn-sq sky-back', 'data-testid': 'sky-close', title: s('close'), html: icon('close', 20), onclick: () => this.close() });
    const head = h('header', { class: 'sky-head' },
      back,
      h('div', { class: 'sky-titles' },
        h('span', { class: 'sky-kicker' }, h('i', { 'aria-hidden': 'true' }), s('theatre'), lang() === 'zh' ? null : h('em', {}, 'SKY·THEATRE')),
        this.titleEl, this.dateEl),
      h('div', { class: 'sky-headr' },
        this.viewsEl,
        h('div', { class: 'sky-site' }, this.siteSel.el),
        ...(opts.onPhoto ? [h('button', { class: 'sky-btn sky-btn-sq sky-photo', 'data-testid': 'sky-photo', title: s('photo'), 'aria-label': s('photo'), html: icon('camera', 18), onclick: () => opts.onPhoto!() })] : []),
        this.calBtn));
    const side = h('div', { class: 'sky-side' },
      h('div', { class: 'sky-card' }, h('span', { class: 'sky-card-k' }, s('telemetry')), this.readEl),
      this.solarBtn);
    const story = h('div', { class: 'sky-story' }, this.noticeEl, this.capEl, this.noteEl);
    const time = h('footer', { class: 'sky-time' },
      this.playBtn,
      h('div', { class: 'sky-speed', role: 'group', 'aria-label': s('simSpeed') },
        h('button', { class: 'sky-btn sky-btn-sq', title: s('slower'), html: icon('minus', 16), onclick: () => this.setRate(-1) }),
        this.rateEl,
        h('button', { class: 'sky-btn sky-btn-sq', title: s('faster'), html: icon('plus', 16), onclick: () => this.setRate(1) })),
      h('div', { class: 'sky-track' }, h('div', { class: 'sky-rail' }, this.fillEl), this.marksEl, this.range),
      this.clockEl);
    const frame = h('div', { class: 'sky-frame', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'));
    this.el = h('section', { class: 'sky', 'data-testid': 'sky', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sky-title' },
      this.cv, this.labels, this.model.labelHost, frame, this.hintEl,
      head, side, this.zoomEl, story, time, this.cal.el);
    host.append(this.el);
    addEventListener('keydown', this.onKey, true);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
    this.resize();

    const ev = (opts.id && findEvent(opts.id)) || nextHighlight();
    if (ev) this.load(ev);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    requestAnimationFrame(() => this.el.classList.add('in'));
  }

  // ------------------------------------------------------------------------------------------------ state

  /** The chosen site, with its UTC offset as it is at `at` (daylight saving included). */
  private pick(at = this.ev?.t ?? Date.now()): Site | null {
    if (this.siteId === 'globe' && this.opts.globe) {
      const g = this.opts.globe;
      // an arbitrary point has no known legal time zone: sun time, marked as an estimate
      return { id: 'globe', name: s('globeSpot'), lat: g.lat, lon: g.lon, tz: Math.round(g.lon / 15), est: true };
    }
    const x = SITES.find(y => y.id === this.siteId);
    return x ? { id: x.id, name: tr(x.name, lang()), lat: x.lat, lon: x.lon, tz: zoneOffset(x.zone, at), zone: x.zone } : null;
  }

  /** Stage an event (`keep` = same event, new site: keep the moment and the view if possible). */
  load(ev: SkyEvent, keep = false): void {
    const prevT = this.t, prevView = this.view;
    this.ev = ev;
    this.ground.reset();
    this.act = buildAct(ev, this.pick(ev.t));
    const a = this.act;
    this.ground.obs = { lat: a.site.lat, lon: a.site.lon };
    if (a.model) {
      const names: Record<string, string> = { earth: s('earth'), moon: bodyName('moon'), sun: bodyName('sun'), ...a.model.names };
      for (const id of [...(a.model.setup.planets ?? []), ...(a.model.setup.sight ?? [])]) names[id] ??= bodyName(id);
      this.model.configure({ ...a.model.setup, lowfx: this.opts.lowfx }, names);
    }
    const view = keep && a.views.includes(prevView) ? prevView : a.view;
    this.tm = this.timing(view);
    this.t = keep && prevT >= this.tm.t0 && prevT <= this.tm.t1 ? prevT : this.tm.start;
    this.cal.active = ev.id;
    this.cal.showYear(new Date(ev.t).getFullYear());
    this.cal.render();
    this.titleEl.textContent = a.title;
    const d = new Date(ev.t);
    this.dateEl.textContent = `${d.toLocaleDateString(lang() === 'zh' ? 'zh-CN' : 'en', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })} · ${countdown(ev.t)}`;
    this.noticeEl.textContent = a.notice ?? '';
    this.noticeEl.hidden = !a.notice;
    this.solarBtn.hidden = !a.solar || !this.opts.onSolar;
    this.viewsEl.replaceChildren(...a.views.map(v => h('button', {
      class: 'sky-seg', role: 'tab', 'data-view': v, 'data-testid': `sky-view-${v}`, onclick: () => this.setView(v),
    }, s(VIEW_KEY[v]))));
    this.viewsEl.hidden = a.views.length < 2;
    this.zoomEl.replaceChildren(
      h('button', { class: 'sky-btn sky-btn-sq sky-zbtn', 'data-z': 'tele', title: s('tele'), html: icon('telescope', 18), onclick: () => this.zoomTo('tele') }),
      h('button', { class: 'sky-btn sky-btn-sq sky-zbtn', 'data-z': 'eye', title: s('eye'), html: icon('eye', 18), onclick: () => this.zoomTo('eye') }));
    this.buildMarks();
    this.rateIx = 3;
    this.setRate(0);
    this.setPlaying(true);
    this.setView(view, !keep);
    history.replaceState(null, '', '#sky/' + encodeURIComponent(ev.id));
  }

  /** The clock a view runs on: the act's, or the model's own (days around the event instead of minutes). */
  private timing(v: View): Timing {
    const a = this.act;
    const base: Timing = { t0: a.t0, t1: a.t1, start: a.start, rate: a.rate, marks: a.marks, days: a.days, slow: a.slow, at: a.at };
    return v === 'model' && a.model?.timing ? { ...base, ...a.model.timing } : base;
  }

  private buildMarks(): void {
    const a = this.tm, span = a.t1 - a.t0;
    this.marksEl.replaceChildren(...a.marks.map(m => h('button', {
      class: 'sky-mark' + (m.major ? ' major' : ''), style: `left:${((m.t - a.t0) / span) * 100}%`,
      title: s('jumpTo', { m: m.label }), 'aria-label': s('jumpTo', { m: m.label }),
      onclick: () => { this.t = Math.max(a.t0, m.t - span * 0.004); this.setPlaying(true); if (!this.ctx.user) this.cut = true; },
    }, h('span', {}, m.label))));
    this.declutter();
  }

  /** Contact marks bunch up (C2 / max / C3 sit minutes apart in a 3-hour act): keep labels apart, majors first. */
  private declutter(): void {
    const a = this.tm, w = Math.max(200, this.marksEl.clientWidth || this.el.clientWidth * 0.6);
    const order = a.marks.map((m, i) => ({ m, i })).sort((x, y) => Number(!!y.m.major) - Number(!!x.m.major) || x.i - y.i);
    const kept: { x: number; half: number }[] = [];
    for (const { m, i } of order) {
      const x = ((m.t - a.t0) / (a.t1 - a.t0)) * w, half = [...m.label].reduce((n, c) => n + (c.charCodeAt(0) > 0x2e80 ? 11 : 6.8), 0) / 2 + 8;
      const free = kept.every(k => Math.abs(k.x - x) > k.half + half);
      if (free) kept.push({ x, half });
      this.marksEl.children[i]?.classList.toggle('mute', !free);
    }
  }

  /** Current act's span and contact marks (for tests and deep links). */
  get info(): { id: string; view: View; t0: number; t1: number; t: number; marks: { t: number; label: string }[] } {
    const a = this.tm;
    return { id: this.ev.id, view: this.view, t0: a.t0, t1: a.t1, t: this.t, marks: a.marks.map(m => ({ t: m.t, label: m.label })) };
  }

  /** Jump the clock (paused unless `play`). */
  seek(t: number, play = false): void {
    this.t = Math.max(this.tm.t0, Math.min(this.tm.t1, t));
    this.setPlaying(play);
    if (!this.ctx.user) this.cut = true;
  }

  show(v: View): void { if (this.act.views.includes(v)) this.setView(v); }

  private setView(v: View, fovPreset = true): void {
    const was = this.view;
    this.view = v;
    const a = this.act, { look, orbit, morbit } = this.ctx;
    const tm = this.timing(v);
    if (tm.t0 !== this.tm.t0 || tm.t1 !== this.tm.t1 || was !== v) {
      const changed = tm.t0 !== this.tm.t0 || tm.t1 !== this.tm.t1;
      this.tm = tm;
      if (changed) {
        // the model runs over days, the sky over minutes: keep the moment when it fits, else start over
        if (this.t < tm.t0 || this.t > tm.t1) this.t = tm.start;
        this.buildMarks();
        this.setPlaying(true);
      }
    }
    this.ctx.user = false;
    look.enabled = v === 'ground';
    orbit.enabled = v === 'space' || v === 'moon';
    morbit.enabled = v === 'model';
    this.labels.hidden = v !== 'ground';
    this.model.labelHost.hidden = v !== 'model';
    this.hintEl.textContent = s(v === 'model' ? 'modelHint' : 'dragHint');
    this.hintEl.style.animation = 'none'; void this.hintEl.offsetWidth; this.hintEl.style.animation = '';
    this.zoomEl.hidden = v !== 'ground' || a.fov.tele === a.fov.eye;
    this.el.dataset.view = v;
    for (const b of this.viewsEl.querySelectorAll<HTMLElement>('.sky-seg')) {
      const on = b.dataset.view === v;
      b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on));
    }
    if (v === 'ground') {
      if (fovPreset) look.aim(look.az, look.alt, a.fov[a.fov.start], true);
      this.markZoom();
    } else {
      this.space.camera.fov = 40;
      this.space.camera.updateProjectionMatrix();
    }
    a.enter(v, this.ctx);
    this.uiAcc = 1;
    this.cut = true;
  }

  private zoomTo(z: 'tele' | 'eye'): void {
    const look = this.ctx.look;
    look.aim(look.az, look.alt, this.act.fov[z]);
    this.markZoom(z);
  }

  private markZoom(z?: 'tele' | 'eye'): void {
    const f = this.ctx.look.targetFov, a = this.act;
    const cur = z ?? (Math.abs(Math.log(f / a.fov.tele)) < Math.abs(Math.log(f / a.fov.eye)) ? 'tele' : 'eye');
    for (const b of this.zoomEl.querySelectorAll<HTMLElement>('.sky-zbtn')) { b.classList.toggle('on', b.dataset.z === cur); b.setAttribute('aria-pressed', String(b.dataset.z === cur)); }
  }

  private setPlaying(on: boolean): void {
    if (on && this.tm && this.t >= this.tm.t1 - 1) this.t = this.tm.t0;
    this.playing = on;
    this.playBtn.innerHTML = icon(on ? 'pause' : 'play', 20);
    this.playBtn.setAttribute('aria-label', s(on ? 'pause' : 'play'));
    this.el.classList.toggle('paused', !on);
  }

  private setRate(d: number): void {
    this.rateIx = Math.max(0, Math.min(RATES.length - 1, this.rateIx + d));
    const r = RATES[this.rateIx];
    this.rateEl.textContent = r >= 1 ? `×${r}` : `×1/${1 / r}`;
  }

  private toggleCal(on?: boolean): void {
    const open = on ?? !this.el.classList.contains('cal-open');
    this.el.classList.toggle('cal-open', open);
    this.calBtn.setAttribute('aria-expanded', String(open));
    if (open) this.cal.render();
  }

  private toSolar(): void {
    const sol = this.act.solar;
    if (!sol || !this.opts.onSolar) return;
    const cb = this.opts.onSolar;
    this.close();
    cb(sol.focus, sol.ms);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (document.querySelector('.modal')) return;
    // the globe and Solar System listen on document: keep keys meant for the theatre away from them
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.stopPropagation(); return; }
    if (e.key === 'Tab') { trapTab(e, this.el); return; }
    if ((e.target as Element | null)?.closest?.('.xsel')) return;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (this.el.classList.contains('cal-open')) this.toggleCal(false); else this.close();
      return;
    }
    if (e.target instanceof HTMLButtonElement) return;
    if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); this.setPlaying(!this.playing); }
    else if (e.key === '+' || e.key === '=') { e.stopPropagation(); this.setRate(1); }
    else if (e.key === '-') { e.stopPropagation(); this.setRate(-1); }
  };

  // ------------------------------------------------------------------------------------------------ loop

  private resize(): void {
    const w = Math.max(1, this.el.clientWidth), hh = Math.max(1, this.el.clientHeight);
    this.renderer.setSize(w, hh, false);
    // the model is framed a little high: the caption and timeline cover the bottom
    this.model.camera.setViewOffset(w, hh, 0, Math.round(hh * (w < 720 ? -0.03 : 0.06)), w, hh);
    for (const c of [this.ground.camera, this.space.camera, this.model.camera]) { c.aspect = w / hh; c.updateProjectionMatrix(); }
    this.ground.rendererH = hh * this.renderer.getPixelRatio();
    this.el.classList.toggle('narrow', w < 720);
    if (this.act) this.declutter();
  }

  private loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    const frameMs = now - this.last;
    const dt = Math.min(0.1, frameMs / 1000);
    this.last = now;
    const dpr = this.adapt?.sample(frameMs);
    if (dpr) { this.renderer.setPixelRatio(dpr); this.resize(); }
    const a = this.tm;
    if (!a) return;
    let rate = 0;
    if (this.playing) {
      rate = a.rate * RATES[this.rateIx] * (a.slow?.(this.t) ?? 1);
      this.t += dt * 1000 * rate;
      if (this.t >= a.t1) { this.t = a.t1; this.setPlaying(false); }
    }
    const ms = a.at?.(this.t) ?? this.t;
    const simRate = a.at ? 0 : rate;
    let fr;
    const act = this.act;
    if (this.view === 'model') {
      const o = this.ctx.morbit;
      this.model.update(ms, dt);
      fr = act.frame(ms, 'model', this.ctx);
      if (this.cut) o.settle();
      if (!this.ctx.user) o.spin(DRIFT * dt);
      o.update(dt);
      this.model.placeLabels(this.el.clientWidth, this.el.clientHeight, this.uiRects);
      this.model.render(this.renderer);
    } else if (this.view === 'ground') {
      this.ground.update(ms, dt, simRate);
      fr = act.frame(ms, 'ground', this.ctx);
      if (this.cut) this.ctx.look.settle();
      this.ctx.look.update(dt);
      this.ground.placeLabels(this.el.clientWidth, this.el.clientHeight);
      this.ground.render(this.renderer);
    } else {
      this.space.update(ms, dt);
      fr = act.frame(ms, this.view, this.ctx);
      if (this.cut) this.ctx.orbit.settle();
      this.ctx.orbit.update(dt);
      this.space.render(this.renderer);
    }
    if (this.shot) { const f = this.shot; this.shot = null; f(this.renderer.domElement.toDataURL('image/jpeg', 0.9)); }
    if (this.cut) { this.cut = false; this.uiAcc = 1; }
    this.uiAcc += dt;
    if (this.uiAcc >= 0.12) {
      this.uiAcc = 0;
      this.paintUi(ms, fr);
    }
  };

  /** Panels that model labels must not show through (refreshed with the UI). */
  private uiRects: DOMRect[] = [];

  private paintUi(ms: number, fr: Frame): void {
    if (this.view === 'model') {
      const o = this.el.getBoundingClientRect();
      this.uiRects = [...this.el.querySelectorAll<HTMLElement>('.sky-head, .sky-card, .sky-solar, .sky-cap, .sky-note, .sky-notice, .sky-time, .skycal')]
        .filter(e => e.offsetParent !== null)
        .map(e => { const r = e.getBoundingClientRect(); return new DOMRect(r.left - o.left - 4, r.top - o.top - 4, r.width + 8, r.height + 8); });
    }
    const a = this.tm, k = (this.t - a.t0) / (a.t1 - a.t0);
    if (document.activeElement !== this.range) this.range.value = String(Math.round(k * 1000));
    this.fillEl.style.width = `${k * 100}%`;
    const site = this.act.site;
    this.clockEl.textContent = siteClock(ms, site, !!a.days, lang());
    if (this.capEl.textContent !== fr.caption) {
      this.capEl.textContent = fr.caption;
      this.capEl.classList.remove('flash'); void this.capEl.offsetWidth; this.capEl.classList.add('flash');
    }
    const note = fr.note ?? '';
    if (this.noteEl.textContent !== note) this.noteEl.textContent = note;
    const rows = fr.read;
    if (this.readEl.childElementCount !== rows.length * 2) this.readEl.replaceChildren(...rows.flatMap(() => [h('dt'), h('dd')]));
    rows.forEach(([key, v], i) => {
      const dt = this.readEl.children[i * 2] as HTMLElement, dd = this.readEl.children[i * 2 + 1] as HTMLElement;
      if (dt.textContent !== key) dt.textContent = key;
      if (dd.textContent !== v) dd.textContent = v;
    });
    if (this.view === 'ground') this.markZoom();
  }

  close(): void {
    if (!this.el.isConnected) return;
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this.onKey, true);
    this.ro.disconnect();
    this.ctx.look.dispose(); this.ctx.orbit.dispose(); this.ctx.morbit.dispose();
    this.ground.dispose(); this.space.dispose(); this.model.dispose();
    releaseShared();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.el.remove();
    if (location.hash.startsWith('#sky')) history.replaceState(null, '', location.pathname + location.search);
    this.opts.onClose();
  }
}
