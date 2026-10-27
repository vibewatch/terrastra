/**
 * UI for everything beyond the globe: the dock (planets, or a scale's key objects), time
 * controls, and one card for bodies, surface features, explorer sites, deep-space objects and whole scales (same card
 * and Wikipedia reader as on the globe). Lazily loaded together with the view on first entry.
 */
import { classroom } from '../lib/classroom.ts';
import { h, toast } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';
import { Select } from '../ui/select.ts';
import { t, lang, onLang, fmtNum } from '../lib/i18n.ts';
import { sfx } from '../lib/sfx.ts';
import { load, save } from '../lib/storage.ts';
import { tr, type Lang } from '../../shared/data/types.ts';
import { BODIES, BODY, type BodyId, type SolarBody } from '../../shared/data/solar.ts';
import { BODY_TEXT } from '../../shared/data/solar-text.ts';
import { SOLAR_FEATURES } from '../../shared/data/solar-features.ts';
import { AU_KM, LIGHT_KMS, daysJ2000, distanceKm, relativePosition } from '../../shared/lib/orbits.ts';
import type { Quality } from '../globe/quality.ts';
import type { Reader, Readable } from '../ui/reader.ts';
import { SolarView, SPEEDS, featuresOf, type SolarSelection } from './view.ts';
import { sitesOf, helioAU } from './sites.ts';
import { deepThumb } from './deep.ts';
import { fmtLy, fmtYears } from './fmt.ts';
import { invalidateUI } from '../ui/occluders.ts';
import { foldable, foldButton } from '../ui/fold.ts';
import { drawConstellation, constellationText } from './constellations.ts';
import { SOLAR_SITES } from '../../shared/data/solar-sites.ts';
import { starClass } from '../../shared/data/nearby-stars.ts';
import { DEEP_OBJECTS, MESSIER, SCALE_INFO, type DeepObject, type DeepKind, type DeepScale, type ScaleId } from '../../shared/data/cosmos.ts';
import { messierGroup, type MessierGroup } from '../../shared/data/messier.ts';
import type { CatalogueItem } from '../../shared/data/types.ts';

type Sel = SolarSelection | { kind: 'deep'; o: DeepObject } | { kind: 'scale'; id: ScaleId };

/** URL fragment per scale (`#milkyway/dp_sgr_a`). */
const SCALE_HASH: Record<ScaleId, string> = { universe: 'universe', laniakea: 'laniakea', group: 'localgroup', galaxy: 'milkyway', stars: 'nearbystars', solar: 'solar' };
const SCALE_THUMB: Record<ScaleId, DeepKind> = { universe: 'deepfield', laniakea: 'supercluster', group: 'group', galaxy: 'arm', stars: 'star', solar: 'star' };
/** What sits at the middle of each deep scale (the meter's "home" end). */
const DEEP_HOME: Record<DeepScale, string> = { stars: 'meterHome', galaxy: 'meterHome', group: 'sc_galaxy', laniakea: 'sc_group', universe: 'sc_laniakea' };
const LY_KM = 9.4607e12;
/** True straight-line distance (ly) between two deep objects; a missing one is us, at the origin. */
function sepLy(a?: DeepObject, b?: DeepObject): number {
  const v = (o?: DeepObject): [number, number, number] => {
    if (!o) return [0, 0, 0];
    const l = o.l * Math.PI / 180, bb = o.b * Math.PI / 180;
    return [Math.cos(bb) * Math.cos(l) * o.distLy, Math.cos(bb) * Math.sin(l) * o.distLy, Math.sin(bb) * o.distLy];
  };
  const p = v(a), q = v(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

export interface SolarHost {
  quality: Quality;
  earthCanvas: () => HTMLCanvasElement;
  /** Leave for the globe, looking down at lat/lon. */
  exit: (lat: number, lon: number) => void;
  /** The scale on screen changed (keeps the global scale rail in sync). */
  onScale?: (s: ScaleId) => void;
  /** Open the sky-events theatre. */
  openSky?: () => void;
  /** The distance meter opened or closed (its button lives in the shared toolbar). */
  onMeter?: (on: boolean) => void;
}

const DOCK: BodyId[] = ['sun', 'mercury', 'venus', 'earth', 'mars', 'ceres', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'haumea', 'makemake', 'eris'];
const SPEED_KEYS = ['spPause', 'spReal', 'spHour', 'spDay', 'spMonth', 'spYear'];
const DOT: Partial<Record<BodyId, string>> = { mercury: '#a8a29e', ceres: '#8b857d', moon: '#c9c5bd', io: '#e8d36a', europa: '#d9cbb0', ganymede: '#a39a8c', callisto: '#6f665c', enceladus: '#eef4f8', triton: '#d8c8c0', charon: '#a99f97',
  phobos: '#7a6e64', deimos: '#9a8c7c', mimas: '#d4d2cc', tethys: '#e6e4de', dione: '#d8d6d0', rhea: '#cfccc4', iapetus: '#9a8f80',
  miranda: '#bdbab4', ariel: '#c9c6c0', umbriel: '#6e6a66', titania: '#b5aca2', oberon: '#a29488',
  amalthea: '#9a5a44', hyperion: '#b8a68e', phoebe: '#5c5853', proteus: '#77726c', nereid: '#a8a49e', nix: '#c8c4c0', hydra: '#e2e2e2', haumea: '#e8e8ec', makemake: '#d6b08c', eris: '#eeeeee' };
/** Dock icon sizes: a rough size ladder (not to scale) so the worlds stay recognisable without their names. */
const DOT_PX: Partial<Record<BodyId, number>> = { sun: 20, jupiter: 18, saturn: 15, uranus: 13, neptune: 13, earth: 12, venus: 12, mars: 10, mercury: 8, ceres: 6, pluto: 6, haumea: 6, makemake: 5, eris: 6 };
const dotColor = (b: SolarBody) => DOT[b.id] ?? b.glow ?? '#9ca3af';
const EMPTY = { en: '', zh: '' };

/** "227.9 million km" / "2.28 亿公里". */
export function fmtKm(km: number, l: Lang): string {
  if (l === 'zh') {
    if (km >= 1e8) return `${(km / 1e8).toFixed(2)} 亿公里`;
    if (km >= 1e4) return `${fmtNum(Math.round(km / 1e4), l)} 万公里`;
    return `${fmtNum(Math.round(km), l)} 公里`;
  }
  if (km >= 1e9) return `${(km / 1e9).toFixed(2)} billion km`;
  if (km >= 1e6) return `${(km / 1e6).toFixed(1)} million km`;
  return `${fmtNum(Math.round(km), l)} km`;
}

/** Duration in hours → "9.9 h" / "58.6 days" / "11.9 years". */
export function fmtDur(hours: number): string {
  const a = Math.abs(hours);
  if (a < 48) return t('hoursN', { n: +a.toFixed(1) });
  if (a < 24 * 1000) return t('daysN', { n: fmtNum(+(a / 24).toFixed(a < 24 * 100 ? 1 : 0)) });
  return t('yearsN', { n: fmtNum(+(a / 24 / 365.25).toFixed(1)) });
}

export class SolarUI {
  readonly view: SolarView;
  readonly el: HTMLElement;
  private infoMain = h('div', { class: 'info-main', 'aria-live': 'polite' });
  private info = h('aside', { class: 'info solar-info hidden', 'data-occludes': true, 'data-testid': 'solar-info' }, this.infoMain);
  /** The chips scroll on phones; the tools at the end of the dock stay put. */
  private dock = h('div', { class: 'dock-list' });
  private dockTools = h('div', { class: 'dock-tools' });
  private dockBar = h('div', { class: 'solar-dock', role: 'toolbar', 'aria-label': t('dockLabel') }, this.dock, this.dockTools);
  private dateEl = h('span', { class: 'solar-date', 'data-testid': 'solar-date' });
  private speedEl = h('span', { class: 'solar-speed', 'data-testid': 'solar-speed' });
  private playBtn = h('button', { class: 'icon-btn', 'data-testid': 'solar-play' });
  private cstBtn = h('button', { class: 'icon-btn cst-toggle', 'data-testid': 'solar-cst', 'data-i18n-tip': 'cst_toggle', title: t('cst_toggle'), html: icon('sparkle', 15) });
  private orbitsBtn = h('button', { class: 'icon-btn cst-toggle', 'data-testid': 'solar-orbits', 'data-i18n-tip': 'orbitsToggle', title: t('orbitsToggle'), html: icon('planet', 15) });
  private namesBtn = h('button', { class: 'icon-btn cst-toggle', 'data-testid': 'solar-names', 'data-i18n-tip': 'namesToggle', title: t('namesToggle'), html: icon('tag', 15) });
  private hint = h('p', { class: 'solar-hint' });
  private meterA = new Select({ testid: 'meter-a', label: t('meterFrom'), className: 'meter-sel', value: 'earth', options: [], onChange: () => this.applyMeter() });
  private meterB = new Select({ testid: 'meter-b', label: t('meterTo'), className: 'meter-sel', value: 'mars', options: [], onChange: () => this.applyMeter() });
  private meterOut = h('dl', { class: 'meter-out', 'data-testid': 'meter-out', 'aria-live': 'polite' });
  private meterEl = h('div', { class: 'solar-meter hidden', role: 'group', 'data-testid': 'solar-meter', 'data-occludes': true },
    h('div', { class: 'meter-row' },
      this.meterA.el,
      h('button', { class: 'icon-btn meter-swap', 'data-testid': 'meter-swap', 'data-i18n-tip': 'meterSwap', title: t('meterSwap'), html: icon('shuffle', 14),
        onclick: () => { sfx.tap(); [this.meterA.value, this.meterB.value] = [this.meterB.value, this.meterA.value]; this.applyMeter(); } }),
      this.meterB.el,
      h('button', { class: 'icon-btn', 'data-testid': 'meter-close', 'aria-label': t('close'), html: icon('close', 14), onclick: () => this.setMeter(false) })),
    this.meterOut,
    h('p', { class: 'meter-note', 'data-i18n': 'meterNote' }, t('meterNote')));
  private messierBtn = h('button', { class: 'icon-btn cst-toggle', 'data-testid': 'solar-messier', 'data-i18n-tip': 'messier', title: t('messier'), 'aria-pressed': 'false', html: icon('telescope', 15) });
  private messierEl = h('div', { class: 'solar-messier hidden', role: 'group', 'data-testid': 'messier-panel', 'data-occludes': true });
  private mFilter: MessierGroup | 'all' = 'all';
  /** Telemetry in the HUD corner: target, coordinates/field of view, range. */
  private readout = h('dl', { class: 'hud-readout', 'data-occludes': true, 'aria-hidden': 'true' });
  private sel: Sel | null = null;
  private speedIdx = 2;
  private reader: Reader | null = null;
  private readerOpen = false;

  constructor(root: HTMLElement, private host: SolarHost) {
    foldable(this.info);
    this.view = new SolarView(root, {
      onSelect: s => this.showCard(s),
      onDeepSelect: o => this.showCard(o ? { kind: 'deep', o } : null),
      onScale: s => this.scaleChanged(s),
      onView: () => this.syncDock(),
      onEnterEarth: (lat, lon) => this.host.exit(lat, lon),
      onTime: ms => this.renderDate(ms),
      onTexture: id => { if (this.sel && this.bodyOf(this.sel) === id) this.drawHero(); },
    }, host.quality);
    this.view.root.querySelector('canvas')?.setAttribute('aria-label', t('solarLabel'));
    this.el = h('div', { class: 'solar-ui hidden', 'data-testid': 'solar-ui' },
      this.info,
      h('div', { class: 'solar-bottom', 'data-occludes': true },
        h('div', { class: 'solar-time', role: 'group', 'aria-label': t('timeSpeed') },
          this.playBtn,
          h('button', { class: 'icon-btn', 'data-testid': 'solar-slower', 'data-i18n-tip': 'slower', title: t('slower'), html: icon('collapse', 15), onclick: () => this.setSpeed(Math.max(1, this.speedIdx - 1)) }),
          this.speedEl,
          h('button', { class: 'icon-btn', 'data-testid': 'solar-faster', 'data-i18n-tip': 'faster', title: t('faster'), html: icon('chevron', 15), onclick: () => this.setSpeed(Math.min(SPEEDS.length - 1, this.speedIdx + 1)) }),
          this.dateEl,
          h('button', { class: 'icon-btn', 'data-testid': 'solar-now', 'data-i18n-tip': 'now', title: t('now'), html: icon('reset', 15), onclick: () => { this.view.resetTime(); this.renderDate(this.view.simMs); } }),
          this.cstBtn,
          this.orbitsBtn,
          this.namesBtn),
        this.dockBar),
      this.meterEl,
      this.messierEl,
      this.hint,
      h('div', { class: 'hud-frame', 'aria-hidden': 'true' },
        h('i', { class: 'hc c-tl' }), h('i', { class: 'hc c-tr' }), h('i', { class: 'hc c-bl' }), h('i', { class: 'hc c-br' }),
        h('i', { class: 'hud-cross' }), this.readout));
    root.append(this.el);
    const bottom = this.el.querySelector<HTMLElement>('.solar-bottom')!;
    new ResizeObserver(() => {
      document.body.style.setProperty('--space-dock', bottom.offsetHeight + 'px');
      invalidateUI();
      this.dockEdges();
    }).observe(bottom);
    this.dock.addEventListener('scroll', () => this.dockEdges(), { passive: true });
    window.setInterval(() => { if (this.view.isActive && !document.hidden) this.renderReadout(); }, 250);
    this.playBtn.onclick = () => this.setSpeed(this.speedIdx === 0 ? 2 : 0);
    this.cstBtn.onclick = () => { sfx.tap(); this.setCst(!this.view.cst.visible); };
    this.orbitsBtn.onclick = () => { sfx.tap(); this.setOption('orbits', !this.view.orbits); };
    this.namesBtn.onclick = () => { sfx.tap(); this.setOption('names', !this.view.names); };
    this.messierBtn.onclick = () => { sfx.tap(); this.setMessier(this.messierEl.classList.contains('hidden')); };
    this.dockTools.append(this.messierBtn);
    this.fillMeter();
    this.setCst(Boolean(load('cst', true)));
    this.setOption('orbits', load('solarOrbits', true));
    this.setOption('names', load('solarNames', true));
    this.renderDock();
    this.setSpeed(2);
    this.view.setEarthCanvas(host.earthCanvas());
    onLang(() => this.relabel());
    document.addEventListener('keydown', e => {
      if (!this.view.isActive || e.key !== 'Escape') return;
      if (this.readerOpen) void this.toggleReader(false);
      else if (this.sel) this.showCard(null);
      else this.overview();
    });
  }

  private setCst(on: boolean): void {
    this.view.cst.visible = on;
    this.cstBtn.setAttribute('aria-pressed', String(on));
    this.cstBtn.classList.toggle('on', on);
    save('cst', on);
    if (!on && this.sel?.kind === 'cst') this.showCard(null);
  }

  /** Display options (remembered): orbit lines, and names on everything you can tap. */
  private setOption(k: 'orbits' | 'names', on: boolean): void {
    this.view[k] = on;
    const b = k === 'orbits' ? this.orbitsBtn : this.namesBtn;
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('on', on);
    save(k === 'orbits' ? 'solarOrbits' : 'solarNames', on);
  }

  // ---------- distance meter ----------
  /** The meter measures between worlds in the Solar System, and between the named objects of a deep scale (in light-years). */
  private fillMeter(): void {
    const l = lang(), sc = this.view.scale;
    let opts: { value: string; label: string }[], defA: string, defB: string;
    if (sc === 'solar') {
      opts = BODIES.map(x => ({ value: x.id, label: `${x.emoji} ${tr(x.name, l)}` }));
      defA = 'earth'; defB = 'mars';
    } else {
      const objs = this.view.deep.objectsOf(sc).filter(o => o.kind !== 'cmb' && o.kind !== 'void' && o.kind !== 'arm');
      opts = [{ value: 'home', label: `🏠 ${sc === 'stars' || sc === 'galaxy' ? t('meterHome') : t(DEEP_HOME[sc])}` },
        ...objs.map(o => ({ value: o.key, label: `${o.emoji} ${tr(o.name, l)}` }))];
      defA = 'home';
      defB = this.sel?.kind === 'deep' && this.sel.o.scale === sc ? this.sel.o.key : (objs.find(o => (o.rank ?? 1) >= 2) ?? objs[0]).key;
    }
    const has = (v: string) => opts.some(o => o.value === v);
    for (const [sel, key, def] of [[this.meterA, 'meterFrom', defA], [this.meterB, 'meterTo', defB]] as const) {
      sel.setOptions(opts, has(sel.value) ? sel.value : def);
      sel.el.querySelectorAll('[aria-label]').forEach(e => e.setAttribute('aria-label', t(key)));
    }
    this.meterEl.setAttribute('aria-label', t('meter'));
    const note = this.meterEl.querySelector<HTMLElement>('.meter-note')!;
    note.dataset.i18n = sc === 'solar' ? 'meterNote' : 'meterNoteDeep';
    note.textContent = t(note.dataset.i18n);
  }

  /** The toolbar's ruler button. */
  toggleMeter(): void { this.setMeter(this.meterEl.classList.contains('hidden')); }

  private setMeter(on: boolean): void {
    this.meterEl.classList.toggle('hidden', !on);
    this.host.onMeter?.(on);
    if (on) {
      this.setMessier(false);
      this.fillMeter();
      // measure from Earth (or us) to whatever is picked
      const cur = this.sel ? this.bodyOf(this.sel) ?? (this.sel.kind === 'deep' ? this.sel.o.key : null) : null;
      if (cur && cur !== this.meterA.value) this.meterB.value = cur;
      // phones: the sheet and the card share the bottom of the screen, so the card makes way
      if (cur && matchMedia('(max-width: 760px)').matches) this.showCard(null);
    }
    this.applyMeter();
  }

  private applyMeter(): void {
    const on = !this.meterEl.classList.contains('hidden'), solar = this.view.scale === 'solar';
    this.view.setMeasure(on && solar ? [this.meterA.value as BodyId, this.meterB.value as BodyId] : null);
    this.view.deep.setMeasure(on && !solar ? [this.meterA.value, this.meterB.value] : null);
    this.renderMeter();
  }

  /** Live numbers: true distance, AU, light travel time and how long a car would take. */
  private renderMeter(): void {
    if (this.meterEl.classList.contains('hidden')) { this.view.meterLabel.textContent = this.view.deep.meterLabel.textContent = ''; return; }
    if (this.view.scale !== 'solar') { this.renderDeepMeter(); return; }
    const l = lang(), a = this.meterA.value as BodyId, b = this.meterB.value as BodyId;
    const km = a === b ? 0 : distanceKm(a, b, daysJ2000(this.view.simMs));
    const sec = km / LIGHT_KMS, carH = km / 100;
    const light = sec < 90 ? t('secondsN', { n: fmtNum(+sec.toFixed(sec < 10 ? 2 : 0)) }) : sec < 5400 ? t('minutesN', { n: fmtNum(+(sec / 60).toFixed(1)) }) : t('hoursN', { n: +(sec / 3600).toFixed(1) });
    const rows: [string, string][] = [
      [t('meterDist'), fmtKm(km, l)],
      [t('meterAU'), (km / AU_KM).toFixed(km / AU_KM < 0.1 ? 4 : 2) + ' AU'],
      [t('meterLight'), light],
      [t('meterCar'), fmtDur(carH)],
    ];
    const sig = rows.flat().join('|');
    if (this.meterOut.dataset.sig !== sig) {
      this.meterOut.dataset.sig = sig;
      this.meterOut.replaceChildren(...rows.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))));
    }
    this.view.meterLabel.textContent = a === b ? '' : fmtKm(km, l);
  }

  /** Light-years between two deep objects, light travel time, and how long Voyager 1 (17 km/s) or a car would take. */
  private renderDeepMeter(): void {
    const l = lang(), a = this.meterA.value, b = this.meterB.value;
    const ly = a === b ? 0 : sepLy(DEEP_OBJECTS.find(o => o.key === a), DEEP_OBJECTS.find(o => o.key === b));
    const rows: [string, string][] = [
      [t('meterDist'), fmtLy(ly, l)],
      [t('meterLight'), fmtYears(ly, l)],
      [t('meterProbe'), fmtYears(ly * LIGHT_KMS / 17, l)],
      [t('meterCar'), fmtYears(ly * LY_KM / 100 / 8766, l)],
    ];
    const sig = rows.flat().join('|');
    if (this.meterOut.dataset.sig !== sig) {
      this.meterOut.dataset.sig = sig;
      this.meterOut.replaceChildren(...rows.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))));
    }
    this.view.deep.meterLabel.textContent = a === b ? '' : fmtLy(ly, l);
  }

  // ---------- Messier list ----------
  private setMessier(on: boolean): void {
    if (on === !this.messierEl.classList.contains('hidden')) return;
    if (on) this.setMeter(false);
    this.messierEl.classList.toggle('hidden', !on);
    this.messierBtn.classList.toggle('on', on);
    this.messierBtn.setAttribute('aria-pressed', String(on));
    this.view.deep.boostMessier = on;
    if (on) this.renderMessier();
  }

  private renderMessier(): void {
    if (this.messierEl.classList.contains('hidden')) return;
    const l = lang(), f = this.mFilter;
    const list = MESSIER.filter(o => f === 'all' || messierGroup(o.kind) === f);
    const groups: (MessierGroup | 'all')[] = ['all', 'galaxy', 'nebula', 'open', 'globular'];
    const short = (o: DeepObject) => {
      const n = tr(o.name, l).replace(/ ?[(（]M\d+[)）]$/, '');
      return /^(Messier |梅西耶)\d+$/.test(n) ? t('dk_' + o.kind) : n;
    };
    this.messierEl.setAttribute('aria-label', t('messier'));
    this.messierEl.replaceChildren(
      h('div', { class: 'messier-head' },
        h('b', {}, t('messier')),
        h('span', { class: 'messier-n', 'data-testid': 'messier-count' }, String(list.length)),
        h('button', { class: 'icon-btn', 'data-testid': 'messier-close', 'aria-label': t('close'), html: icon('close', 14), onclick: () => this.setMessier(false) })),
      h('div', { class: 'messier-filters', role: 'radiogroup' }, ...groups.map(g => h('button', {
        class: 'tag-chip' + (g === f ? ' on' : ''), role: 'radio', 'aria-checked': String(g === f), 'data-testid': 'mf-' + g,
        onclick: () => { sfx.tap(); this.mFilter = g; this.renderMessier(); } }, g === 'all' ? t('messierAll') : t('mg_' + g)))),
      h('div', { class: 'messier-list', role: 'list' }, ...list.map(o => h('button', {
        class: 'messier-item', role: 'listitem', 'data-testid': 'mx-' + o.messier, 'data-key': o.key, title: tr(o.name, l),
        onclick: () => { sfx.tap(); this.goTo(o.key); } },
        h('b', {}, 'M' + o.messier), h('span', { class: 'chip-emoji', 'aria-hidden': 'true' }, o.emoji), h('span', {}, short(o))))),
      h('p', { class: 'messier-note' }, t('messierNote')));
    this.syncMessier();
  }

  /** Marks the picked object in the Messier list (and scrolls it into view). */
  private syncMessier(): void {
    if (this.messierEl.classList.contains('hidden')) return;
    const key = this.sel?.kind === 'deep' ? this.sel.o.key : '';
    for (const b of this.messierEl.querySelectorAll<HTMLElement>('.messier-item')) {
      const on = b.dataset.key === key;
      b.classList.toggle('on', on);
      if (on) b.scrollIntoView({ block: 'nearest' });
    }
  }

  private bodyOf(s: Sel): BodyId | null {
    return s.kind === 'body' ? s.id : s.kind === 'feature' ? s.f.body : s.kind === 'site' ? s.s.body : null;
  }

  private scaleChanged(s: ScaleId): void {
    this.el.classList.toggle('deep', s !== 'solar');
    this.el.dataset.scale = s;
    // Out in deep space the clock means nothing, so its bar goes and the names toggle joins the dock's tools.
    if (s === 'solar') this.orbitsBtn.after(this.namesBtn);
    else this.dockTools.prepend(this.namesBtn);
    this.showHint();
    this.renderDock();
    if (!this.meterEl.classList.contains('hidden')) { this.fillMeter(); this.applyMeter(); }
    // Arriving at a scale shows what it is (unless something there is already picked).
    // On phones the sheet would hide the view, so the card waits for a tap on the scale's name.
    if (s !== 'solar' && !matchMedia('(max-width: 760px)').matches) this.showCard({ kind: 'scale', id: s });
    else this.showCard(null);
    this.host.onScale?.(s);
  }

  private showHint(): void {
    this.hint.textContent = t(this.view.scale === 'solar' ? 'solarHint' : matchMedia('(pointer: coarse)').matches ? 'deepHintTouch' : 'deepHint');
    this.hint.classList.remove('gone');
    clearTimeout(this.hintT);
    this.hintT = window.setTimeout(() => this.hint.classList.add('gone'), 6000);
  }
  private hintT = 0;

  /** Switch scale from outside (the scale rail). */
  goScale(s: ScaleId): void {
    if (this.view.scale === s) { this.overview(); return; }
    this.view.goScale(s, 'jump');
  }

  enter(opts: { from?: { lat: number; lon: number }; focus?: string; scale?: ScaleId } = {}): void {
    this.el.classList.remove('hidden');
    if (opts.from || !opts.scale || opts.scale === 'solar') this.view.resetScale();
    this.el.classList.toggle('deep', this.view.scale !== 'solar');
    this.showHint();
    if (opts.from) { this.view.show({ from: opts.from }); this.showCard(null); }
    else { this.view.show(); this.goTo(opts.focus ?? '', opts.scale); }
    this.renderDock();
    this.syncDock();
    this.renderDate(this.view.simMs);
    this.host.onScale?.(this.view.scale);
  }

  /**
   * Jump to a body, feature, explorer site (`ss_…`), deep object (`dp_…`) or a scale's overview while the view is
   * open (e.g. a #solar/… or #milkyway/… link).
   */
  goTo(focus: string, scale?: ScaleId): void {
    const v = this.view;
    const site = focus.startsWith('ss_') ? SOLAR_SITES.find(x => x.key === focus) : undefined;
    const feat = SOLAR_FEATURES.find(x => x.key === focus);
    const deep = focus.startsWith('dp_') ? DEEP_OBJECTS.find(x => x.key === focus) : undefined;
    const want: ScaleId = deep?.scale ?? (site || feat || focus in BODY ? 'solar' : scale ?? 'solar');
    if (v.scale !== want) v.goScale(want, 'jump');
    if (deep) { if (!v.selectDeep(deep.key)) this.showCard({ kind: 'scale', id: want }); }
    else if (site) v.selectSite(site);
    else if (feat) v.selectFeature(feat);
    else if (focus in BODY) v.select(focus as BodyId);
    else if (want === 'solar') this.overview();
    this.syncDock();
  }

  /** Show the system at a given instant (sky-theatre hand-off), time paused so the alignment stays put. */
  showAt(ms: number, focus?: string): void {
    this.view.simMs = ms;
    this.setSpeed(0);
    if (focus && this.view.isActive) this.goTo(focus);
    this.renderDate(ms);
  }

  leave(): void {
    void this.toggleReader(false);
    this.view.hide();
    this.el.classList.add('hidden');
  }

  private backToEarth(): void {
    const [lat, lon] = this.view.scale === 'solar' && this.view.focusId === 'earth' ? this.view.earthLatLon() : [20, 10];
    this.host.exit(lat, lon);
  }

  /** The global +/− buttons while in space. */
  zoom(inward: boolean): void { this.view.zoomBy(inward ? 0.55 : 1.8); }

  overview(): void {
    if (this.view.scale === 'solar') { this.showCard(null); this.view.overview(); }
    else { this.view.deep.select(null, false); this.view.home(); this.showCard({ kind: 'scale', id: this.view.scale }); }
  }

  private setSpeed(i: number): void {
    this.speedIdx = i;
    this.view.setSpeed(SPEEDS[i]);
    this.speedEl.textContent = t(SPEED_KEYS[i]);
    this.speedEl.dataset.idx = String(i);
    this.playBtn.innerHTML = icon(i === 0 ? 'play' : 'pause', 15);
    this.playBtn.title = i === 0 ? t('spDay') : t('spPause');
    this.renderDate(this.view.simMs);
  }

  private renderDate(ms: number): void {
    const l = lang();
    const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
    // Phones: the clock or the year, not both, so the time bar stays on one line.
    if (SPEEDS[this.speedIdx] <= 3600) { opts.hour = '2-digit'; opts.minute = '2-digit'; if (matchMedia('(max-width: 520px)').matches) delete opts.year; }
    this.dateEl.textContent = new Intl.DateTimeFormat(l === 'zh' ? 'zh-CN' : 'en', opts).format(new Date(ms));
    this.renderMeter();
  }

  private renderDock(): void {
    const l = lang();
    const sc = this.view.scale;
    if (sc !== 'solar') {
      const objs = this.view.deep.objectsOf(sc).filter(o => (o.rank ?? 1) >= 2).sort((a, b) => (b.rank ?? 1) - (a.rank ?? 1)).slice(0, 12);
      this.dock.replaceChildren(...objs.map(o => h('button', { class: 'solar-chip' + (this.sel?.kind === 'deep' && this.sel.o === o ? ' on' : ''), 'data-testid': 'dc-' + o.key, title: tr(o.name, l), 'aria-label': tr(o.name, l),
        'aria-pressed': String(this.sel?.kind === 'deep' && this.sel.o === o),
        onclick: () => { sfx.tap(); this.view.selectDeep(o.key); } },
        h('span', { class: 'chip-emoji', 'aria-hidden': 'true' }, o.emoji))));
      return;
    }
    this.dock.replaceChildren(...DOCK.map(id => {
      const b = BODY[id];
      return h('button', { class: 'solar-chip' + (this.view.focusId === id ? ' on' : ''), 'data-testid': 'sp-' + id, title: tr(b.name, l), 'aria-label': tr(b.name, l),
        'aria-pressed': String(this.view.focusId === id),
        onclick: () => { sfx.tap(); this.view.select(id); } },
        h('i', { class: 'dot', style: `--c:${dotColor(b)};--s:${DOT_PX[id] ?? 10}px` + (b.rings ? ';--ring:1' : '') }));
    }));
  }

  /** Fading edges show that the (phone) dock scrolls; the selected chip is kept in view. */
  private dockEdges(reveal = false): void {
    const d = this.dock, over = d.scrollWidth - d.clientWidth > 1;
    d.classList.toggle('more-l', over && d.scrollLeft > 2);
    d.classList.toggle('more-r', over && d.scrollLeft < d.scrollWidth - d.clientWidth - 2);
    if (reveal && over) {
      const on = d.querySelector<HTMLElement>('.on');
      if (on) d.scrollTo({ left: on.offsetLeft - (d.clientWidth - on.offsetWidth) / 2, behavior: 'smooth' });
    }
  }

  /** Highlights the dock chip of whatever is in focus. */
  private syncDock(): void {
    const sc = this.view.scale;
    for (const c of this.dock.children) {
      const id = (c as HTMLElement).dataset.testid;
      const on = sc === 'solar' ? id === 'sp-' + this.view.focusId : this.sel?.kind === 'deep' && id === 'dc-' + this.sel.o.key;
      c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on));
    }
    this.dockEdges(true);
  }

  private relabel(): void {
    this.view.relabel();
    for (const el of this.el.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = t(el.dataset.i18n!);
    for (const el of this.el.querySelectorAll<HTMLElement>('[data-i18n-tip]')) el.title = t(el.dataset.i18nTip!);
    this.dockBar.setAttribute('aria-label', t('dockLabel'));
    this.el.querySelector('.solar-time')?.setAttribute('aria-label', t('timeSpeed'));
    this.view.root.querySelector('canvas')?.setAttribute('aria-label', t('solarLabel'));
    this.renderDock();
    this.syncDock();
    this.fillMeter();
    this.renderMeter();
    this.renderMessier();
    this.setSpeed(this.speedIdx);
    if (this.sel) this.renderCard();
    this.reader?.relang();
  }

  // ---------- card ----------
  private showCard(sel: Sel | null): void {
    this.sel = sel;
    this.syncDock();
    const base = '#' + SCALE_HASH[this.view.scale];
    if (!sel) {
      void this.toggleReader(false);
      this.info.classList.add('hidden');
      history.replaceState(null, '', base);
      return;
    }
    if (sel.kind !== 'scale') sfx.pop();
    const picked = this.bodyOf(sel);
    const toMeasure = picked ?? (sel.kind === 'deep' ? sel.o.key : null);
    if (toMeasure && !this.meterEl.classList.contains('hidden') && toMeasure !== this.meterA.value && toMeasure !== this.meterB.value) {
      this.meterB.value = toMeasure;
      this.applyMeter();
    }
    this.syncMessier();
    const key = sel.kind === 'body' ? sel.id : sel.kind === 'feature' ? sel.f.key : sel.kind === 'site' ? sel.s.key : sel.kind === 'deep' ? sel.o.key : '';
    history.replaceState(null, '', key ? base + '/' + key : base);
    this.renderCard();
    this.info.classList.remove('hidden');
    if (this.readerOpen) this.reader?.show(this.readable());
  }

  private readable(): Readable {
    const s = this.sel!;
    if (s.kind === 'feature') return { key: s.f.key, name: s.f.name, desc: s.f.desc, wiki: s.f.wiki, funFact: s.f.funFact };
    if (s.kind === 'site') return { key: s.s.key, name: s.s.name, desc: s.s.desc, wiki: s.s.wiki, funFact: s.s.funFact };
    if (s.kind === 'cst') return { key: 'cst_' + s.c.id, name: s.c.name, desc: constellationText(s.c).desc, wiki: s.c.name.en + ' (constellation)' };
    if (s.kind === 'deep') return { key: s.o.key, name: s.o.name, desc: s.o.desc, wiki: s.o.wiki, funFact: s.o.funFact };
    if (s.kind === 'scale') { const i = SCALE_INFO[s.id]; return { key: 'sc_' + s.id, name: i.name, desc: i.desc, wiki: i.wiki, funFact: i.funFact }; }
    const b = BODY[s.id], tx = BODY_TEXT[s.id];
    return { key: 'sb_' + s.id, name: b.name, desc: tx?.desc ?? EMPTY, wiki: b.wiki, funFact: tx?.funFact };
  }

  private hero = h('canvas', { class: 'solar-map', width: 720, height: 360 });

  /** The body's surface map as the card hero (with a marker for a feature). */
  private drawHero(): void {
    const s = this.sel;
    if (!s || s.kind === 'site') return;
    if (s.kind === 'cst') { drawConstellation(this.hero, s.c); return; }
    if (s.kind === 'deep' || s.kind === 'scale') {
      const o = s.kind === 'deep' ? s.o : ({ key: 'sc_' + s.id, kind: SCALE_THUMB[s.id] } as DeepObject);
      const src = deepThumb(o, () => this.view.deep.milkyWayCanvas());
      this.hero.getContext('2d')!.drawImage(src, 0, 0, this.hero.width, this.hero.height);
      return;
    }
    const id = s.kind === 'body' ? s.id : s.f.body;
    const src = this.view.mapImage(id);
    const cv = this.hero, ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#0d0d11';
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (src) ctx.drawImage(src, 0, 0, cv.width, cv.height);
    if (s.kind === 'feature') {
      const x = ((s.f.lon + 180) / 360) * cv.width, y = ((90 - s.f.lat) / 180) * cv.height;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 28, y); ctx.lineTo(x - 20, y); ctx.moveTo(x + 20, y); ctx.lineTo(x + 28, y);
      ctx.moveTo(x, y - 28); ctx.lineTo(x, y - 20); ctx.moveTo(x, y + 20); ctx.lineTo(x, y + 28); ctx.stroke();
    }
  }

  private renderReadout(): void {
    const l = lang(), v = this.view, s = this.sel;
    const name = !s ? null : s.kind === 'deep' ? tr(s.o.name, l) : s.kind === 'site' ? tr(s.s.name, l) : s.kind === 'feature' ? tr(s.f.name, l)
      : s.kind === 'body' ? tr(BODY[s.id].name, l) : s.kind === 'cst' ? tr(s.c.name, l) : null;
    const rows: [string, string][] = [];
    if (v.scale === 'solar') {
      const { lat, lon, radii } = v.viewInfo();
      rows.push([t('hud_target'), name ?? tr(BODY[v.focusId].name, l)]);
      rows.push([t('hud_coord'), `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`]);
      rows.push([t('hud_range'), t('hud_radii', { n: radii < 10 ? radii.toFixed(2) : radii.toFixed(0) })]);
    } else {
      rows.push([t('hud_scale'), tr(SCALE_INFO[v.scale].name, l)]);
      rows.push([t('hud_span'), fmtLy(v.deep.spanLy(), l)]);
      if (name) rows.push([t('hud_target'), name]);
    }
    const sig = rows.flat().join('|');
    if (this.readout.dataset.sig === sig) return;
    this.readout.dataset.sig = sig;
    this.readout.replaceChildren(...rows.flatMap(([k, val]) => [h('dt', {}, k), h('dd', {}, val)]));
  }

  private renderCard(): void {
    // Restart the "scan" sweep across the card each time it shows something new.
    this.info.classList.remove('scan');
    void this.info.offsetWidth;
    this.info.classList.add('scan');
    const s = this.sel!;
    if (s.kind === 'deep' || s.kind === 'scale' || s.kind === 'site' || s.kind === 'cst') { this.renderOtherCard(); return; }
    const l = lang();
    const body = BODY[s.kind === 'body' ? s.id : s.f.body];
    const it = this.readable();
    const stat = (k: string, v: string) => h('div', {}, h('dt', {}, k), h('dd', {}, v));
    let eyebrow: string, key: [string, string][], extra: [string, string][] = [];
    if (s.kind === 'body') {
      const f = body.facts, pName = body.parent ? tr(BODY[body.parent].name, l) : '';
      eyebrow = body.kind === 'moon' ? t('moonOf', { p: pName }) : t('bk_' + body.kind);
      key = [[t('diameter'), fmtNum(Math.round(body.radiusKm * 2)) + (l === 'zh' ? ' 公里' : ' km')]];
      if (body.locked && body.parent) key.push([t('dayLen'), t('lockedDay', { p: pName })]);
      else if (f.dayH) key.push([t('dayLen'), fmtDur(f.dayH)]);
      if (f.yearD) key.push([t('yearLen'), fmtDur(f.yearD * 24)]);
      else if (body.moon) key.push([t('orbitLen'), fmtDur(Math.abs(body.moon.periodD) * 24)]);
      const d = daysJ2000(this.view.simMs);
      const sunAU = (id: BodyId) => { const p = relativePosition(id, d); return Math.hypot(p[0], p[1], p[2]); };
      if (body.kepler) {
        const au = sunAU(body.id);
        extra.push([t('fromSun'), fmtKm(au * AU_KM, l)]);
        extra.push([t('sunlight'), t('minutesN', { n: fmtNum(Math.round((au * AU_KM) / 299_792.458 / 60)) })]);
        if (body.id !== 'earth') {
          const a = relativePosition(body.id, d), e = relativePosition('earth', d);
          extra.push([t('fromEarth'), fmtKm(Math.hypot(a[0] - e[0], a[1] - e[1], a[2] - e[2]) * AU_KM, l)]);
        }
      } else if (body.moon) { const p = relativePosition(body.id, d); extra.push([t('fromParent', { p: pName }), fmtKm(Math.hypot(p[0], p[1], p[2]), l)]); }
      if (f.moons !== undefined && body.kind !== 'star') extra.push([t('moonsN'), fmtNum(f.moons)]);
      if (f.gravity !== undefined) extra.push([t('gravity'), t('xEarth', { n: f.gravity })]);
      if (f.tempC) extra.push([t('temperature'), f.tempC[0] === f.tempC[1] ? `${fmtNum(f.tempC[0])} °C` : `${fmtNum(f.tempC[0])} ~ ${fmtNum(f.tempC[1])} °C`]);
    } else {
      const f = s.f;
      eyebrow = `${t('fk_' + f.kind)} · ${tr(body.name, l)}`;
      key = [];
      if (f.sizeKm) key.push([t('size'), fmtNum(f.sizeKm) + (l === 'zh' ? ' 公里' : ' km')]);
      key.push([t('where'), `${Math.abs(f.lat).toFixed(1)}°${f.lat >= 0 ? 'N' : 'S'} · ${Math.abs(f.lon).toFixed(1)}°${f.lon >= 0 ? 'E' : 'W'}`]);
    }
    const feats = s.kind === 'body' ? featuresOf(s.id) : [];
    const moons = s.kind === 'body' ? BODIES.filter(b => b.parent === s.id && b.kind === 'moon') : [];
    const sites = s.kind === 'body' ? sitesOf(s.id) : [];
    const hasMore = extra.length > 0 || Boolean(it.funFact?.en);
    this.drawHero();
    this.infoMain.replaceChildren(
      h('div', { class: 'info-hero solar-hero' },
        this.hero,
        h('span', { class: 'type-chip' }, (s.kind === 'body' ? t('bk_' + body.kind) : t('fk_' + s.f.kind))),
        foldButton(this.info),
        h('button', { class: 'icon-btn info-x', 'aria-label': t('close'), 'data-testid': 'solar-info-close', html: icon('close', 16), onclick: () => this.showCard(null) })),
      h('div', { class: 'info-body' },
        h('p', { class: 'eyebrow', html: icon(s.kind === 'body' ? 'planet' : 'pin', 13) }, h('span', {}, eyebrow)),
        h('h2', { 'data-testid': 'solar-name' }, tr(it.name, l)),
        h('p', { class: 'desc' }, tr(it.desc, l)),
        key.length ? h('dl', { class: 'stats-row' }, ...key.map(([k, v]) => stat(k, v))) : null,
        hasMore ? h('details', { class: 'more' },
          h('summary', { html: icon('chevron', 14) }, h('span', {}, t('moreDetails'))),
          it.funFact?.en ? h('p', { class: 'fun' }, h('b', {}, t('funFact')), ' ', tr(it.funFact, l)) : null,
          extra.length ? h('dl', { class: 'facts' }, ...extra.map(([k, v]) => stat(k, v))) : null) : null,
        feats.length ? h('div', { class: 'solar-list' },
          h('h3', {}, t('surface')),
          h('div', { class: 'solar-tags' }, ...feats.map(f => h('button', { class: 'tag-chip', 'data-testid': 'feat-' + f.key, onclick: () => { sfx.tap(); this.view.selectFeature(f); } },
            h('span', { class: 'chip-emoji', 'aria-hidden': 'true' }, f.emoji), h('span', {}, tr(f.name, l)))))) : null,
        sites.length ? h('div', { class: 'solar-list' },
          h('h3', {}, t('explorers')),
          h('div', { class: 'solar-tags' }, ...sites.map(x => h('button', { class: 'tag-chip', 'data-testid': 'site-' + x.key, onclick: () => { sfx.tap(); this.view.selectSite(x); } },
            h('span', { class: 'chip-emoji', 'aria-hidden': 'true' }, x.emoji), h('span', {}, tr(x.name, l)))))) : null,
        moons.length ? h('div', { class: 'solar-list' },
          h('h3', {}, t('moonsList')),
          h('div', { class: 'solar-tags' }, ...moons.map(m => h('button', { class: 'tag-chip', 'data-testid': 'moon-' + m.id, onclick: () => { sfx.tap(); this.view.select(m.id); } },
            h('i', { class: 'dot', style: `--c:${dotColor(m)}` }), h('span', {}, tr(m.name, l)))))) : null,
        h('div', { class: 'info-footer' },
          s.kind === 'feature' ? h('button', { class: 'pill pill-sm', 'data-testid': 'solar-back-body', onclick: () => this.view.select(body.id) }, t('backTo', { p: tr(body.name, l) })) : null,
          s.kind === 'body' && body.parent && body.parent !== 'sun' ? h('button', { class: 'pill pill-sm', 'data-testid': 'solar-back-body', onclick: () => this.view.select(body.parent!) }, t('backTo', { p: tr(BODY[body.parent].name, l) })) : null,
          s.kind === 'body' && s.id === 'earth' ? h('button', { class: 'cta cta-sm', 'data-testid': 'solar-enter-earth', html: icon('globe', 16), onclick: () => this.backToEarth() }, h('span', {}, t('enterEarth'))) : null,
          h('button', { class: 'read-more', 'data-testid': 'solar-read-more', 'aria-expanded': String(this.readerOpen), onclick: () => { sfx.tap(); void this.toggleReader(); } },
            h('span', {}, this.readerOpen ? t('readerClose') : t('readMore')), h('span', { html: icon('book', 14) })))));
  }

  private readBtn(): HTMLElement {
    return h('button', { class: 'read-more', 'data-testid': 'solar-read-more', 'aria-expanded': String(this.readerOpen), onclick: () => { sfx.tap(); void this.toggleReader(); } },
      h('span', {}, this.readerOpen ? t('readerClose') : t('readMore')), h('span', { html: icon('book', 14) }));
  }

  /** Cards for explorer sites, deep-space objects and whole scales. */
  private renderOtherCard(): void {
    const s = this.sel!, l = lang(), it = this.readable();
    const stat = (k: string, v: string) => h('div', {}, h('dt', {}, k), h('dd', {}, v));
    const key: [string, string][] = [], extra: [string, string][] = [];
    let eyebrow = '', chip = '', hero: HTMLElement = this.hero, footer: (HTMLElement | null)[] = [], list: HTMLElement | null = null;
    if (s.kind === 'site') {
      const x = s.s, body = BODY[x.body];
      eyebrow = t('sk_' + x.kind) + (x.helio ? '' : ' · ' + tr(body.name, l));
      chip = t('sk_' + x.kind);
      if (x.year) key.push([t(x.future ? 'planned' : 'arrived'), String(x.year)]);
      if (x.agency) key.push([t('agency'), x.agency]);
      if (x.helio) key.push([t('fromSun'), t('fromSunAU', { n: fmtNum(Math.round(helioAU(x, this.view.simMs))) })]);
      else if (!x.orbit) key.push([t('where'), `${Math.abs(x.lat).toFixed(1)}°${x.lat >= 0 ? 'N' : 'S'} · ${Math.abs(x.lon).toFixed(1)}°${x.lon >= 0 ? 'E' : 'W'}`]);
      hero = h('div', { class: 'site-hero' });
      if (x.model) {
        const recipe = x.model;
        void import('../models/preview.ts').then(({ createModelPreview }) => {
          if (this.sel === s) hero.replaceChildren(createModelPreview({ key: x.key, model: recipe, emoji: x.emoji } as unknown as CatalogueItem, { id: x.key }));
        });
      } else hero.append(h('span', { class: 'site-emoji' }, x.emoji));
      if (!x.helio) footer.push(h('button', { class: 'pill pill-sm', 'data-testid': 'solar-back-body', onclick: () => this.view.select(x.body) }, t('backTo', { p: tr(body.name, l) })));
    } else if (s.kind === 'cst') {
      const b = constellationText(s.c).brightest;
      eyebrow = t('cst_kind');
      chip = t('cst_kind');
      key.push([t('cst_stars'), fmtNum(s.c.stars.length)]);
      if (b) key.push([t('cst_brightest'), tr(b, l)]);
    } else if (s.kind === 'deep') {
      const o = s.o;
      eyebrow = t('dk_' + o.kind) + (o.morph && o.kind !== 'dwarf' ? ' · ' + t('mo_' + o.morph) : '');
      chip = t('dk_' + o.kind);
      key.push([t('lightYears'), fmtLy(o.distLy, l)]);
      if (o.spec) key.push([t('starType'), t('stc_' + starClass(o.spec))]);
      if (o.messier) key.push([t('messierNo'), 'M' + o.messier]);
      if (o.sizeLy) key.push([t('across'), fmtLy(o.sizeLy, l)]);
      if (o.distLy >= 1 && o.distLy < 1e9) extra.push([t('lookback'), t('yearsAgo', { n: fmtLy(o.distLy, l).replace(/ ?(light-years|光年)$/, '') })]);
      extra.push([t('scaleIs'), t('sc_' + o.scale)]);
    } else if (s.kind === 'scale') {
      const i = SCALE_INFO[s.id];
      eyebrow = t('scaleIs');
      chip = t('sc_' + s.id);
      key.push([t('across'), fmtLy(i.sizeLy, l)]);
      if (s.id !== 'solar') {
        const objs = this.view.deep.objectsOf(s.id as DeepScale).filter(o => (o.rank ?? 1) >= 2).slice(0, 10);
        if (objs.length) list = h('div', { class: 'solar-list' }, h('h3', {}, t('highlights')),
          h('div', { class: 'solar-tags' }, ...objs.map(o => h('button', { class: 'tag-chip', 'data-testid': 'hl-' + o.key, onclick: () => { sfx.tap(); this.view.selectDeep(o.key); } },
            h('span', { class: 'chip-emoji', 'aria-hidden': 'true' }, o.emoji), h('span', {}, tr(o.name, l))))));
      }
    }
    if (hero === this.hero) this.drawHero();
    const hasMore = extra.length > 0 || Boolean(it.funFact?.en);
    this.infoMain.replaceChildren(
      h('div', { class: 'info-hero solar-hero' + (s.kind === 'site' ? ' is-model' : '') },
        hero,
        h('span', { class: 'type-chip' }, chip),
        foldButton(this.info),
        h('button', { class: 'icon-btn info-x', 'aria-label': t('close'), 'data-testid': 'solar-info-close', html: icon('close', 16), onclick: () => this.showCard(null) })),
      h('div', { class: 'info-body' },
        h('p', { class: 'eyebrow', html: icon(s.kind === 'site' ? 'pin' : 'planet', 13) }, h('span', {}, eyebrow)),
        h('h2', { 'data-testid': 'solar-name' }, tr(it.name, l)),
        h('p', { class: 'desc' }, tr(it.desc, l)),
        key.length ? h('dl', { class: 'stats-row' }, ...key.map(([k, v]) => stat(k, v))) : null,
        hasMore ? h('details', { class: 'more' },
          h('summary', { html: icon('chevron', 14) }, h('span', {}, t('moreDetails'))),
          it.funFact?.en ? h('p', { class: 'fun' }, h('b', {}, t('funFact')), ' ', tr(it.funFact, l)) : null,
          extra.length ? h('dl', { class: 'facts' }, ...extra.map(([k, v]) => stat(k, v))) : null) : null,
        list,
        h('div', { class: 'info-footer' }, ...footer, this.readBtn())));
  }

  private async toggleReader(open = !this.readerOpen): Promise<void> {
    if (open === this.readerOpen || (open && (!this.sel || classroom()))) return;
    this.readerOpen = open;
    this.info.classList.toggle('expanded', open);
    const btn = this.infoMain.querySelector('.read-more');
    btn?.setAttribute('aria-expanded', String(open));
    if (btn?.firstChild) btn.firstChild.textContent = open ? t('readerClose') : t('readMore');
    if (!open) return;
    if (!this.reader) {
      let Reader: typeof import('../ui/reader.ts').Reader;
      try { ({ Reader } = await import('../ui/reader.ts')); } catch { toast(t('loadFail', { s: t('readMore') })); void this.toggleReader(false); return; }
      this.reader ??= new Reader({ close: () => void this.toggleReader(false), pick: () => {} });
    }
    if (!this.readerOpen || !this.sel) return;
    if (!this.reader.el.isConnected) this.info.append(this.reader.el);
    this.reader.show(this.readable());
  }
}
