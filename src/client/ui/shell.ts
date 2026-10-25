import { h, closeModal, openModal, toast, $ } from './dom.ts';
import { Select } from './select.ts';
import { t, lang, setLang, countryName, fmtNum, onLang } from '../lib/i18n.ts';
import { store, updateProgress, updateSettings, resetSettings, subscribe } from '../store.ts';
import { isOn } from '../../shared/lib/progress.ts';
import { tr, LANGS, type CatalogueItem, type Lang } from '../../shared/data/types.ts';
import { CATALOGUE, BY_TYPE } from '../../shared/data/catalogue.ts';
import { TYPE_META, TYPE_ORDER } from '../../shared/data/typemeta.ts';
import { CONTINENT_NAMES } from '../../shared/data/iso.ts';
import { AURA_PRESETS, type AuraPreset, type SurfaceMode, type Globe, type Settings } from '../globe/scene.ts';
import { createModelPreview } from '../models/preview.ts';
import { foldable, foldButton } from './fold.ts';
import { invalidateUI } from './occluders.ts';
import { icon, TYPE_ICON, type IconName } from './icons.ts';
import { sfx, callFor, speak } from '../lib/sfx.ts';
import { music } from '../lib/music.ts';
import type { GREETINGS as Greetings } from '../../shared/data/greetings.ts';
// fetched next to the entry instead of inside it: only the "Say hello" button needs it
let GREETINGS: typeof Greetings | null = null;
const greetingsReady = import('../../shared/data/greetings.ts').then(m => { GREETINGS = m.GREETINGS; }, () => {});
import { TimeMachine } from './timemachine.ts';
import { api } from '../lib/api.ts';
import { HAS_API, url } from '../lib/env.ts';
import { sessionOnly } from '../lib/storage.ts';
import type { SpaceHit } from '../solar/space-index.ts';
import { searchAll, type SearchFilter } from '../lib/search.ts';
import { groupOf } from '../lib/compare.ts';
import { narrate, narrationSupported, splitSentences, stopNarration, type Narration } from '../lib/narrate.ts';
import { classroom, setClassroom, setStill, motion, onClassroom } from '../lib/classroom.ts';
import { renderHub, hubTab, type HubTab } from './hub.ts';

export const DEX_ZOOM = 10;
const LANG_LABEL: Record<Lang, string> = { en: 'English', zh: '中文' };
const typeName = (ty: CatalogueItem['type']) => tr(TYPE_META[ty].one, lang());
const AURA_ORDER: AuraPreset[] = ['waves', 'aurora', 'ember', 'dusk', 'sculpture'];

export interface ShellHooks {
  openPhoto: () => void; openCollection: () => void; openGame: (kind: 'daily' | 'placeit' | 'quiz') => void; openPassport: () => void; openAlbum: () => void; openTutorial: () => void; openTours: () => void; openLessons: () => void; openAstro: () => void; openSsbs: () => void; openBookmarks: () => void; openCompare: (id?: string) => void; openTonight: () => void;
  openAccount: () => void; openGuestbook: () => void;
  openSolar: () => void;
  openSky: () => void;
  /** Earth radio on/off. */
  openRadio?: () => void;
  /** In space: a picked Earth item first takes you home (true = handled, the shell does nothing more). */
  toEarth?: (it: CatalogueItem) => boolean;
  /** In space the +/−/overview buttons drive the space view (true = handled). */
  zoom?: (inward: boolean) => boolean;
  overview?: () => void;
  /** From space, back to the globe (the hub's globe-only shelves). */
  toHome?: () => void;
  /** Flat world map on/off. */
  toggleMap?: () => void;
  /** Something needs the 3D globe itself (a ride): leave the flat map. */
  toGlobe?: () => void;
  /** The selected item changed (null = none). */
  onSelect?: (it: CatalogueItem | null) => void;
  /** Last in line for Escape (true = handled). */
  escape?: () => boolean;
}

export class Shell {
  private zoomEl = h('span', { class: 'zoom-readout', 'data-testid': 'zoom' }, '×4.0');
  private coordLat = h('b', {}, '');
  private coordLon = h('b', {}, '');
  private coordEl = h('div', { class: 'coord-readout', 'aria-hidden': 'true' }, h('i', { class: 'coord-reticle' }), this.coordLat, h('span', { class: 'coord-sep' }), this.coordLon);
  private infoMain = h('div', { class: 'info-main', 'aria-live': 'polite' });
  private info = h('aside', { id: 'info', class: 'info hidden', 'data-occludes': true, 'data-testid': 'info' }, this.infoMain);
  private reader: import('./reader.ts').Reader | null = null;
  private readerOpen = false;
  private menu = h('div', { id: 'menu', class: 'menu hidden', 'data-occludes': true, role: 'dialog', 'aria-label': t('settings') });
  /** The Explore hub: lessons, tours, sky, games and your collection, on four shelves. */
  private hub = h('div', { id: 'hub', class: 'menu hub hidden', 'data-occludes': true, role: 'dialog', 'aria-label': t('hub'), 'data-testid': 'hub' });
  private tab: HubTab = hubTab();
  private hints = h('div', { class: 'hints hidden', id: 'hints' });
  private rideBar = h('div', { class: 'ride-bar hidden', 'data-testid': 'ride-bar' });
  private tipEl = h('div', { id: 'tip', class: 'globe-tip hidden', 'aria-hidden': 'true' });
  /** Holds the level switcher (Earth, Solar System … Universe), next to the brand on every level. */
  readonly levelSlot = h('div', { class: 'level-slot' });
  private space = false;
  current: CatalogueItem | null = null;
  readonly time: TimeMachine;

  constructor(private root: HTMLElement, private globe: Globe, private hooks: ShellHooks) {
    this.time = new TimeMachine(globe, it => this.showItem(it));
  }

  mount(): void {
    const tool = (id: string, ico: IconName, key: string, fn: () => void, cls = '') =>
      h('button', { class: 'tool' + (cls ? ' ' + cls : ''), id, 'data-testid': id, title: t(key), html: icon(ico, 19), onclick: () => { sfx.tap(); fn(); } },
        h('span', { class: 'sr-only', 'data-i18n': key }, t(key)));
    const top = h('header', { class: 'topbar' },
      h('div', { class: 'top-left' },
        h('div', { class: 'brand', 'data-occludes': true },
          h('span', { class: 'brand-mark', 'aria-hidden': 'true' }),
          h('h1', { 'data-i18n': 'title' }, t('title')),
          h('span', { class: 'class-badge', 'data-testid': 'class-badge', 'data-i18n': 'classroom' }, t('classroom'))),
        this.levelSlot),
      // Scene tools (only where they make sense) come first, then the tools every level shares, then the menu.
      h('nav', { class: 'tools', 'data-occludes': true, 'aria-label': t('tools') },
        tool('btn-search', 'search', 'searchKbd', () => this.openSearch()),
        tool('btn-photo', 'camera', 'photo', this.hooks.openPhoto),
        this.mapBtn = tool('btn-map', 'map', 'flatMap', () => this.hooks.toggleMap?.(), 'earth-only'),
        h('span', { class: 'tools-sep', 'aria-hidden': 'true' }),
        tool('btn-hub', 'collection', 'hub', () => this.toggleHub(), 'tool-hub'),
        tool('btn-menu', 'sliders', 'settings', () => this.toggleMenu())));
    const bottomLeft = h('div', { class: 'bl', 'data-occludes': true }, this.hints,
      h('button', { class: 'round-btn help', id: 'btn-help', 'aria-label': t('help'), 'aria-expanded': 'false', html: icon('help', 19), onclick: () => this.toggleHints() }));
    const zoom = (inward: boolean) => { if (!this.hooks.zoom?.(inward)) this.globe.zoomBy(inward ? 1.6 : 1 / 1.6); };
    const bottomRight = h('div', { class: 'br', 'data-occludes': true },
      h('button', { class: 'round-btn', 'aria-label': t('fullscreen'), title: t('fullscreen'), html: icon('expand', 17), onclick: () => this.fullscreen() }),
      h('button', { class: 'round-btn space-only', 'data-testid': 'btn-overview', 'aria-label': t('overviewScale'), title: t('overviewScale'), html: icon('sun', 17), onclick: () => { sfx.tap(); this.hooks.overview?.(); } }),
      h('div', { class: 'zoom-ctl' },
        h('button', { id: 'btn-zoom-in', 'aria-label': t('zoomIn'), html: icon('plus', 17), onclick: () => zoom(true) }),
        this.zoomEl,
        h('button', { id: 'btn-zoom-out', 'aria-label': t('zoomOut'), html: icon('minus', 17), onclick: () => zoom(false) })));
    foldable(this.info);
    this.root.append(top, bottomLeft, bottomRight, this.coordEl, this.info, this.hub, this.menu, this.rideBar, this.time.el, this.tipEl, this.immersiveExit);
    this.renderHints();
    this.renderMenu();
    const refresh = () => { if (!this.menu.classList.contains('hidden')) this.renderMenu(); if (!this.hub.classList.contains('hidden')) this.renderHub(); };
    onClassroom(refresh);
    subscribe(() => { if (this.current) this.renderInfo(this.current); refresh(); });
    onLang(() => { this.relabel(); this.reader?.relang(); });
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.openSearch();
        return;
      }
      const typing = (e.target as Element | null)?.closest?.('input, textarea, .xsel, [contenteditable]');
      if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'h' && !document.querySelector('.sky, .modal:not(.hidden)')) { this.setImmersive(!this.immersive); return; }
      if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'm' && !this.space && !document.querySelector('.sky, .modal:not(.hidden)')) { this.hooks.toggleMap?.(); return; }
      if (e.key !== 'Escape') return;
      if (closeModal()) return;
      if (this.immersive) { this.setImmersive(false); return; }
      if (!this.menu.classList.contains('hidden')) { this.toggleMenu(false); return; }
      if (!this.hub.classList.contains('hidden')) { this.toggleHub(false); return; }
      if (this.globe.ride) { this.exitRide(); return; }
      if (this.readerOpen) { this.toggleReader(false); return; }
      if (this.current) { this.showItem(null); return; }
      if (this.time.open) { this.time.toggle(false); return; }
      this.hooks.escape?.();
    });
    document.addEventListener('pointerdown', e => {
      const tgt = e.target as Node;
      if (!this.menu.classList.contains('hidden') && !this.menu.contains(tgt) && !$('#btn-menu').contains(tgt)) this.toggleMenu(false);
      if (!this.hub.classList.contains('hidden') && !this.hub.contains(tgt) && !$('#btn-hub').contains(tgt)) this.toggleHub(false);
    });
  }

  /** Immersive view: every control steps aside and the scene gets the whole screen; one small button (or H / Esc) brings them back. */
  private immersiveExit = h('button', { class: 'immersive-exit', 'data-testid': 'immersive-exit', html: icon('eye', 16), onclick: () => this.setImmersive(false) },
    h('span', {}, t('showUi')));
  get immersive(): boolean { return document.body.classList.contains('immersive'); }
  setImmersive(on: boolean): void {
    if (on) this.toggleMenu(false);
    document.body.classList.toggle('immersive', on);
    invalidateUI();
    if (on) toast(t('hideUiToast'));
    else this.immersiveExit.blur();
  }

  showHover(item: CatalogueItem | null, screen: { x: number; y: number } | null): void {
    if (!item || !screen || this.globe.gameMode || this.globe.ride) {
      this.tipEl.classList.add('hidden');
      return;
    }
    const l = lang();
    const where = item.route?.kind === 'orbit' ? t('inOrbit') : countryName(item.country, l) || (CONTINENT_NAMES[item.continent]?.[l] ?? '');
    this.tipEl.replaceChildren(
      h('span', { class: 'tip-emoji' }, item.emoji),
      h('span', { class: 'tip-name' }, tr(item.name, l)),
      ...(where ? [h('span', { class: 'tip-sub' }, where)] : []),
    );
    this.tipEl.style.transform = `translate(${screen.x.toFixed(1)}px, ${(screen.y - 26).toFixed(1)}px) translate(-50%, -100%)`;
    this.tipEl.classList.remove('hidden');
  }

  private randomHop(): void {
    const pool = CATALOGUE.filter(i => i.type !== 'vehicle' && i.key !== this.current?.key);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) this.showItem(pick, true);
  }

  private openSearch(): void {
    const l = lang();
    let query = '';
    let filter: SearchFilter = 'all';
    const listEl = h('div', { class: 'dex-grid search-grid' });
    let space: SpaceHit[] | null = null;
    void import('../solar/space-index.ts').then(m => { space = m.spaceIndex(); if (query.trim() || filter === 'space') renderList(); });
    const renderList = () => {
      const hits = searchAll(query, l, space, filter);
      if (!hits.length) {
        listEl.replaceChildren(h('p', { class: 'muted' }, filter === 'space' && !space ? '…' : t('notFound')));
        return;
      }
      // Each result says where it lives (level) and what it is (type).
      listEl.replaceChildren(...hits.slice(0, 400).map(r => r.kind === 'item'
        ? h('button', { class: 'dex-card unlocked', onclick: () => { closeModal(); this.showItem(r.item, true); } },
          h('span', { class: 'dex-emoji' }, r.item.emoji),
          h('strong', {}, tr(r.item.name, l)),
          h('small', {}, [t('lvEarth'), typeName(r.item.type), countryName(r.item.country, l)].filter(Boolean).join(' · ')))
        : h('button', { class: 'dex-card unlocked', onclick: () => { closeModal(); location.hash = '#' + r.hit.hash; } },
          h('span', { class: 'dex-emoji' }, r.hit.emoji),
          h('strong', {}, tr(r.hit.name, l)),
          h('small', {}, r.hit.kind === 'scaleIs' ? t('scaleIs') : tr(r.hit.level, l) + ' · ' + t(r.hit.kind)))));
    };
    const input = h('input', {
      type: 'search',
      class: 'input',
      placeholder: t('searchPlaceholder'),
      oninput: () => { query = input.value; renderList(); },
    });
    const filterBar = h('div', { class: 'seg-row' },
      ...(['all', 'space', ...TYPE_ORDER.filter(ty => BY_TYPE[ty].length)] as const).map(f =>
        h('button', {
          class: 'pill' + (filter === f ? ' active' : ''),
          onclick: e => {
            filter = f;
            (e.currentTarget as HTMLElement).parentElement?.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
            (e.currentTarget as HTMLElement).classList.add('active');
            renderList();
          },
        }, f === 'all' ? t('filterAll') : f === 'space' ? t('filterSpace') : typeName(f))
      )
    );
    renderList();
    const random = h('button', { class: 'pill search-random', 'data-testid': 'btn-random', title: t('randomHop'), html: icon('shuffle', 15), onclick: () => { sfx.tap(); closeModal(); this.randomHop(); } }, h('span', {}, t('randomHop')));
    openModal('search', t('search'), h('div', { class: 'search-modal' }, h('div', { class: 'search-row' }, input, random), filterBar, listEl), { wide: true });
    setTimeout(() => input.focus(), 40);
  }

  private relabel(): void {
    this.immersiveExit.querySelector('span')!.textContent = t('showUi');
    document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => (el.textContent = t(el.dataset.i18n!)));
    document.title = t('title');
    this.renderHints();
    if (this.mapBtn) this.mapBtn.title = t(this.mapBtn.getAttribute('aria-pressed') === 'true' ? 'backToGlobe' : 'flatMap');
    this.globe.lang = lang(); this.globe.markDirty();
    if (!this.menu.classList.contains('hidden')) this.renderMenu();
    if (this.current) this.renderInfo(this.current);
  }

  private dexClose: boolean | null = null;
  /** The zoom and centre readouts only (the flat map reports here too). */
  setReadout(z: number, lat: number, lon: number): void {
    this.zoomEl.textContent = '×' + z.toFixed(1);
    const ln = ((lon + 540) % 360) - 180;
    this.coordLat.textContent = `${Math.abs(lat).toFixed(2).padStart(5, '0')}°${lat >= 0 ? 'N' : 'S'}`;
    this.coordLon.textContent = `${Math.abs(ln).toFixed(2).padStart(6, '0')}°${ln >= 0 ? 'E' : 'W'}`;
  }
  setZoom(z: number, lat = 0, lon = 0): void {
    this.setReadout(z, lat, lon);
    // onView fires on every dirty frame; only rebuild the dex row when crossing the collect threshold
    const close = z >= DEX_ZOOM;
    if (this.current?.type === 'animal' && close !== this.dexClose) this.renderDexRow();
  }

  private mapBtn: HTMLButtonElement | null = null;
  /** Marks the toolbar's map button as on (the map is showing) or off. */
  setMapOpen(on: boolean): void {
    const b = this.mapBtn;
    if (!b) return;
    const key = on ? 'backToGlobe' : 'flatMap';
    b.setAttribute('aria-pressed', String(on));
    b.title = t(key);
    b.querySelector('.ico')?.remove();
    b.insertAdjacentHTML('afterbegin', icon(on ? 'globe' : 'map', 19));
    const sr = b.querySelector<HTMLElement>('.sr-only');
    if (sr) { sr.dataset.i18n = key; sr.textContent = t(key); }
  }

  /** Switches the global chrome between the globe and the space levels. */
  setSpace(on: boolean): void {
    if (this.space === on) return;
    this.space = on;
    this.toggleHints(false);
    this.toggleMenu(false);
    this.toggleHub(false);
    this.renderHints();
  }

  private renderHints(): void {
    const keys = this.space ? ['hintSpaceDrag', 'hintSpaceZoom', 'hintSpaceTap', 'hintSpaceRail'] : ['hintDrag', 'hintZoom', 'hintTap'];
    this.hints.replaceChildren(
      ...keys.map(k => h('p', { html: t(k) })),
      h('div', { class: 'row' },
        h('button', { class: 'chip', id: 'btn-tutorial', onclick: () => { this.toggleHints(false); this.hooks.openTutorial(); } }, t('tutorialAgain'))));
  }
  toggleHints(force?: boolean): void {
    const show = force ?? this.hints.classList.contains('hidden');
    this.hints.classList.toggle('hidden', !show);
    $('#btn-help').setAttribute('aria-expanded', String(show));
  }

  /** Opens or closes the Explore hub (on the shelf used last). */
  toggleHub(force?: boolean): void {
    const show = force ?? this.hub.classList.contains('hidden');
    if (show) { this.toggleMenu(false); this.toggleHints(false); this.renderHub(); }
    this.hub.classList.toggle('hidden', !show);
    $('#btn-hub')?.classList.toggle('active', show);
    $('#btn-hub')?.setAttribute('aria-expanded', String(show));
  }

  private renderHub(): void {
    const hk = this.hooks;
    this.hub.replaceChildren(...renderHub(this.tab, this.space, {
      lessons: hk.openLessons, astro: hk.openAstro, ssbs: hk.openSsbs, tours: hk.openTours,
      sky: hk.openSky, tonight: hk.openTonight, time: () => this.time.toggle(), compare: () => hk.openCompare(), bookmarks: hk.openBookmarks, radio: () => hk.openRadio?.(),
      game: hk.openGame, passport: hk.openPassport, collection: hk.openCollection, album: hk.openAlbum, account: hk.openAccount, guestbook: hk.openGuestbook,
      toEarth: () => this.hooks.toHome?.(),
    }, tab => { this.tab = tab; this.renderHub(); }, () => this.toggleHub(false)));
  }

  toggleMenu(force?: boolean): void {
    const show = force ?? this.menu.classList.contains('hidden');
    if (show) { this.toggleHub(false); this.renderMenu(); }
    this.menu.classList.toggle('hidden', !show);
    $('#btn-menu').classList.toggle('active', show);
    $('#btn-menu').setAttribute('aria-expanded', String(show));
  }

  private renderMenu(): void {
    const s = store.settings;
    const sw = (key: keyof Settings, ic: IconName) => {
      const input = h('input', { type: 'checkbox', role: 'switch', 'data-testid': 'set-' + key, checked: Boolean(s[key]) });
      input.addEventListener('change', () => {
        sfx.tap();
        updateSettings({ [key]: input.checked });
      });
      return h('label', { class: 'switch-card sw-chip' }, input, h('span', { class: 'sw-emoji', html: icon(ic, 15) }), h('span', { class: 'sw-label' }, t(key)));
    };
    /** A switch that is not a globe setting (classroom mode, pause motion). */
    const flag = (id: string, ic: IconName, label: string, val: boolean, set: (v: boolean) => void, tip?: string) => {
      const input = h('input', { type: 'checkbox', role: 'switch', 'data-testid': id, checked: val });
      input.addEventListener('change', () => { sfx.tap(); set(input.checked); });
      return h('label', { class: 'switch-card sw-chip', title: tip }, input, h('span', { class: 'sw-emoji', html: icon(ic, 15) }), h('span', { class: 'sw-label' }, t(label)));
    };
    const curMode = s.surfaceMode;
    const modeRow = h('div', { class: 'seg-row' },
      ...([
        ['realistic', t('modeSat')],
        ['minimal', t('modeVec')],
        ['political', t('modePol')],
      ] as const).map(([m, label]) =>
        h('button', {
          class: 'pill' + (curMode === m ? ' active' : ''),
          'data-testid': 'mode-' + m,
          onclick: () => { sfx.tap(); updateSettings({ surfaceMode: m as SurfaceMode }); },
        }, label)
      )
    );
    const curAura = s.auraPreset;
    const auraRow = h('div', { class: 'seg-row aura-row' },
      ...AURA_ORDER.map(p =>
        h('button', {
          class: 'pill aura-pill' + (curAura === p ? ' active' : ''),
          'data-testid': 'aura-' + p,
          onclick: () => { sfx.tap(); updateSettings({ auraPreset: p }); },
        },
          h('span', { class: 'aura-dot' }),
          t(AURA_PRESETS[p].label),
        )
      )
    );
    const sel = new Select({ label: t('language'), testid: 'lang-select', value: lang(), options: LANGS.map(l => ({ value: l, label: LANG_LABEL[l] })), onChange: v => setLang(v as Lang) }).el;
    // Globe options belong to the Earth scene only; in space the menu keeps just the app-wide settings.
    const earth = this.space ? [] : [
      h('h3', {}, t('surfaceMode')), modeRow,
      h('h3', {}, t('auraPreset')), auraRow,
      h('h3', {}, t('mLayers')), h('div', { class: 'chip-wrap' }, sw('names', 'tag'), sw('borders', 'globe'), sw('graticule', 'grid'), sw('shadows', 'contrast'), sw('clouds', 'cloud'), sw('aurora', 'aurora'), sw('tectonics', 'plates')),
      h('h3', {}, t('mGlobe')), h('div', { class: 'chip-wrap' }, ...TYPE_ORDER.filter(ty => BY_TYPE[ty].length).map(ty => sw(TYPE_META[ty].layer, TYPE_ICON[ty]))),
    ];
    this.menu.classList.toggle('menu-space', this.space);
    const small = (id: string, ic: IconName, label: string, fn: () => void) =>
      h('button', { class: 'pill pill-sm', 'data-testid': id, html: icon(ic, 14), onclick: fn }, h('span', {}, label));
    this.menu.replaceChildren(
      ...earth,
      h('h3', {}, t('mSettings')),
      h('div', { class: 'chip-wrap' }, sw('sfx', 'sound'), sw('bgm', 'music'),
        flag('set-classroom', 'bulb', 'classroom', classroom(), v => { setClassroom(v); if (v) this.toggleReader(false); }, t('classroomNote')),
        ...(classroom() ? [flag('set-still', 'pause', 'pauseMotion', motion.still, setStill)] : [])),
      h('div', { class: 'menu-line' }, h('span', { class: 'sw-emoji', html: icon('language', 15) }), h('span', { class: 'grow' }, t('language')), sel),
      h('div', { class: 'menu-line' }, h('span', { class: 'sw-emoji', html: icon('download', 15) }), h('span', { class: 'grow' }, t('backup')),
        small('backup-export', 'download', t('backupExport'), () => void import('./backup.ts').then(m => m.exportProgress(), () => toast('⚠️ ' + t('loadFail', { s: t('backup') })))),
        small('backup-import', 'upload', t('backupImport'), () => void import('./backup.ts').then(m => m.importProgress(), () => toast('⚠️ ' + t('loadFail', { s: t('backup') }))))),
      ...(sessionOnly() ? [h('p', { class: 'menu-warn', role: 'status' }, t('sessionOnly'))] : []),
      h('div', { class: 'menu-line' }, h('span', { class: 'sw-emoji', html: icon('reset', 15) }), h('span', { class: 'grow' }, t('reset')),
        small('reset', 'reset', t('resetBtn'), () => { if (confirm(t('resetConfirm'))) { resetSettings(); this.globe.flyTo(25, 40, 2.2); } })),
      h('div', { class: 'menu-line' }, h('span', { class: 'sw-emoji', html: icon('eye', 15) }), h('span', { class: 'grow' }, t('hideUi') + ' · H'),
        small('menu-immersive', 'eye', t('hideUiGo'), () => { this.toggleMenu(false); this.setImmersive(true); })),
      h('footer', { class: 'menu-links' },
        ...([['about/', 'about', 'bulb'], ['privacy/', 'privacy', 'eye']] as const).map(([href, key, ic]) =>
          h('a', { href: url(href), 'data-testid': 'menu-link-' + key }, h('span', { class: 'ml-ico', html: icon(ic, 15) }), h('span', {}, t(key))))));
  }

  applySettings(s: Settings): void {
    this.globe.applySettings(s);
    sfx.setEnabled(s.sfx);
    music.setOn(s.bgm);
  }

  // ---------- info card ----------
  showItem(item: CatalogueItem | null, fly = true): void {
    if (item && this.hooks.toEarth?.(item)) return;
    const prev = this.current;
    this.current = item;
    this.globe.select(item?.key ?? null);
    this.hooks.onSelect?.(item);
    if (!item) {
      stopNarration();
      this.toggleReader(false);
      this.info.classList.add('hidden');
      if (prev && decodeURIComponent(location.hash.slice(1)) === prev.key) history.replaceState(null, '', location.pathname + location.search);
      return;
    }
    sfx.pop();
    history.replaceState(null, '', '#' + item.key);
    if (fly) {
      const minZoomH = item.type === 'animal'
        ? (item.tier === 3 ? 1.5 : item.tier === 2 ? 1.9 : this.globe.h)
        : (item.tier === 3 ? 1.45 : 1.75);
      this.globe.flyTo(item.lat, item.lon, Math.min(this.globe.h, minZoomH));
    }
    // Passport stamp; the store update re-renders the open card through the subscription.
    if (!(item.key in store.progress.seen)) updateProgress(pp => { pp.seen[item.key] = Date.now(); });
    else this.renderInfo(item);
    this.info.classList.remove('hidden');
    if (this.readerOpen) this.reader?.show(item);
  }

  /** Expands the info card sideways into the Wikipedia reader (lazy-loaded) or folds it back. */
  async toggleReader(open = !this.readerOpen): Promise<void> {
    if (open === this.readerOpen || (open && (!this.current || classroom()))) return;
    this.readerOpen = open;
    this.info.classList.toggle('expanded', open);
    const btn = this.infoMain.querySelector('.read-more');
    btn?.setAttribute('aria-expanded', String(open));
    if (btn?.firstChild) btn.firstChild.textContent = open ? t('readerClose') : t('readMore');
    if (!open) return;
    if (!this.reader) {
      let Reader: typeof import('./reader.ts').Reader;
      try { ({ Reader } = await import('./reader.ts')); } catch { toast(t('loadFail', { s: t('readMore') })); void this.toggleReader(false); return; }
      this.reader ??= new Reader({ close: () => void this.toggleReader(false), pick: it => this.showItem(it) });
    }
    if (!this.readerOpen || !this.current) return;
    if (!this.reader.el.isConnected) this.info.append(this.reader.el);
    this.reader.show(this.current);
  }

  private dexRow = h('div', { class: 'dex-row' });
  private narration: Narration | null = null;

  /** Reads the name, description and fun fact aloud on request, highlighting each sentence as it is spoken. */
  private toggleNarration(it: CatalogueItem, btn: HTMLButtonElement, segs: { el: HTMLElement; text: string; lead: Node[] }[]): void {
    if (this.narration) { this.narration.stop(); return; }
    const l = lang();
    const spans: HTMLElement[] = [];
    for (const seg of segs) {
      const parts = splitSentences(seg.text).map(x => h('span', { class: 'say' }, x + (l === 'zh' ? '' : ' ')));
      seg.el.replaceChildren(...seg.lead, ...parts);
      spans.push(...parts);
    }
    const set = (on: boolean) => {
      btn.setAttribute('aria-pressed', String(on));
      btn.replaceChildren(h('span', { html: icon(on ? 'pause' : 'sound', 14) }), on ? t('listenStop') : t('listen'));
    };
    const name = tr(it.name, l);
    this.narration = narrate([name + (l === 'zh' ? '。' : '.'), ...spans.map(x => x.textContent!.trim())], l, {
      sentence: i => spans.forEach((x, j) => {
        x.classList.toggle('now', j === i - 1);
        if (j === i - 1) { x.closest('details')?.setAttribute('open', ''); x.scrollIntoView({ block: 'nearest' }); }
      }),
      end: () => { this.narration = null; spans.forEach(x => x.classList.remove('now')); set(false); },
    });
    if (this.narration) set(true); else toast(t('noSpeech'));
  }

  private renderDexRow(): void {
    const it = this.current;
    this.dexClose = this.globe.zoom >= DEX_ZOOM;
    if (!it) return;
    const p = store.progress;
    if (it.type === 'animal') {
      const have = it.key in p.dex;
      const close = this.globe.zoom >= DEX_ZOOM;
      this.dexRow.replaceChildren(have ? h('span', { class: 'ok' }, t('collected'))
        : close ? h('button', { class: 'cta', 'data-testid': 'add-dex', onclick: () => { updateProgress(pp => { pp.dex[it.key] = Date.now(); }); sfx.good(); toast('📖 ' + tr(it.name, lang())); } }, t('addDex'))
          : h('span', { class: 'muted' }, t('collectHint', { z: DEX_ZOOM }), ' ', h('button', { class: 'pill pill-sm', 'data-testid': 'zoom-close', 'aria-label': t('zoomClose'), html: icon('zoom', 15), onclick: () => this.globe.flyTo(it.lat, it.lon, 0.8) })));
    } else if (it.type === 'discovery') {
      const have = it.key in p.logs;
      this.dexRow.replaceChildren(have ? h('span', { class: 'ok' }, t('logged'))
        : h('button', { class: 'cta', 'data-testid': 'log-discovery', onclick: () => { updateProgress(pp => { pp.logs[it.key] = Date.now(); }); sfx.good(); } }, t('logIt')));
    } else if (TYPE_META[it.type].collect === 'found') {
      const have = it.key in p.found;
      this.dexRow.replaceChildren(have ? h('span', { class: 'ok' }, t('foundIt'))
        : h('button', { class: 'cta', 'data-testid': 'collect-found', onclick: () => { updateProgress(pp => { pp.found[it.key] = Date.now(); }); sfx.good(); toast(it.emoji + ' ' + tr(it.name, lang())); } }, t('collectIt')));
    } else this.dexRow.replaceChildren();
  }

  private renderInfo(it: CatalogueItem): void {
    const l = lang();
    const f = it.facts ?? {};
    const nf = (n: number, unit: string) => fmtNum(n) + unit;
    const chips: [string, string][] = [];
    if (f.built !== undefined) chips.push([t('built'), f.built < 0 ? t('bce', { n: -f.built }) : String(f.built)]);
    if (f.year !== undefined) chips.push([t('year'), f.year < 0 ? t('bce', { n: -f.year }) : String(f.year)]);
    if (f.born !== undefined) chips.push([t('born'), f.born < 0 ? t('bce', { n: -f.born }) : String(f.born)]);
    if (f.died !== undefined) chips.push([t('died'), f.died < 0 ? t('bce', { n: -f.died }) : String(f.died)]);
    if (f.mya !== undefined) chips.push([t('lived'), t('myaAgo', { n: fmtNum(f.mya), w: fmtNum(Math.round(f.mya * 100)) })]);
    if (it.season) chips.push([t('when'), new Intl.DateTimeFormat(l, { month: 'long', day: 'numeric' }).format(new Date(2024, it.season.month - 1, it.season.day))]);
    if (f.heightM) chips.push([t('height'), nf(f.heightM, ' m')]);
    if (f.lengthM) chips.push([t('length'), f.lengthM >= 10000 ? nf(Math.round(f.lengthM / 1000), ' km') : nf(f.lengthM, ' m')]);
    if (f.depthM) chips.push([t('depth'), nf(f.depthM, ' m')]);
    if (f.weightKg) chips.push([t('weight'), f.weightKg >= 1000 ? nf(Math.round(f.weightKg / 100) / 10, ' t') : nf(f.weightKg, ' kg')]);
    if (f.speedKmh) chips.push([t(it.type === 'vehicle' ? 'speedUsual' : 'speed'), nf(f.speedKmh, ' km/h')]);
    if (f.lifespanY) chips.push([t('lifespan'), nf(f.lifespanY, l === 'en' ? ' yrs' : '')]);
    if (it.diet) chips.push([t('diet'), t(it.diet)]);
    if (it.status) chips.push([t('status'), t(it.status)]);
    const where = it.route?.kind === 'orbit' ? t('inOrbit') : [countryName(it.country, l), CONTINENT_NAMES[it.continent]?.[l]].filter(Boolean).join(' · ');
    const coordStr = `${Math.abs(it.lat).toFixed(1)}°${it.lat >= 0 ? 'N' : 'S'} · ${Math.abs(it.lon).toFixed(1)}°${it.lon >= 0 ? 'E' : 'W'}`;
    const p = store.progress;
    const react = (kind: 'like' | 'visited', ico: IconName) => {
      const on = isOn(kind === 'like' ? p.likes : p.visited, it.key);
      const count = h('span', { class: 'count', 'data-count': kind });
      return h('button', { class: 'react' + (on ? ' on' : ''), 'aria-pressed': String(on), 'data-testid': 'react-' + kind, title: t(kind), html: icon(ico, 16),
        onclick: () => {
          const now = !on;
          updateProgress(pp => { const m = kind === 'like' ? pp.likes : pp.visited; m[it.key] = now ? Date.now() : -Date.now(); });
          if (store.me) void api.react(it.key, kind, now).then(r => this.setCounts(r)).catch(() => {});
        } }, h('span', { class: 'react-label' }, t(kind)), count);
    };
    const key = chips.slice(0, 3), extra = chips.slice(3);
    if (!it.route) extra.push([t('latitude'), coordStr]);
    const hasMore = true;
    this.renderDexRow();
    stopNarration();
    const descP = h('p', { class: 'desc', 'data-testid': 'info-desc' }, tr(it.desc, l));
    const funLead = (): Node[] => [h('b', {}, t('funFact')), document.createTextNode(' ')];
    const funP = it.funFact ? h('p', { class: 'fun' }, ...funLead(), tr(it.funFact, l)) : null;
    const listen: HTMLButtonElement | null = narrationSupported() ? h('button', { class: 'pill pill-sm info-listen', 'data-testid': 'info-listen', 'aria-pressed': 'false',
      onclick: () => this.toggleNarration(it, listen!, [{ el: descP, text: tr(it.desc, l), lead: [] }, ...(funP ? [{ el: funP, text: tr(it.funFact, l), lead: funLead() }] : [])]) },
      h('span', { html: icon('sound', 14) }), t('listen')) : null;
    this.infoMain.replaceChildren(
      h('div', { class: 'info-hero', 'data-type': it.type },
        createModelPreview(it, { width: 360, height: 208, id: 'info-preview' }),
        h('span', { class: 'type-chip t-' + it.type }, typeName(it.type)),
        h('span', { class: 'info-serial', 'aria-hidden': 'true' }, `#${String(CATALOGUE.indexOf(it) + 1).padStart(4, '0')}`, h('small', {}, ` / ${CATALOGUE.length}`)),
        foldButton(this.info),
        h('button', { class: 'icon-btn info-x', 'aria-label': t('close'), 'data-testid': 'info-close', html: icon('close', 16), onclick: () => this.showItem(null) }),
        this.heroActions(it),
        it.type !== 'animal' && !it.route ? h('button', { class: 'hero-btn info-zoom-btn', title: t('zoomClose'), html: icon('zoom', 15), onclick: () => this.globe.flyTo(it.lat, it.lon, 0.25) }, h('span', {}, t('zoomClose'))) : null,
      ),
      h('div', { class: 'info-body' },
        where ? h('p', { class: 'eyebrow', html: icon('pin', 13) }, h('span', {}, where)) : null,
        h('h2', { 'data-testid': 'info-name' }, tr(it.name, l)),
        descP,
        listen,
        key.length ? h('dl', { class: 'stats-row' }, ...key.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))) : null,
        groupOf(it.key) ? h('button', { class: 'pill cmp-open', 'data-testid': 'info-compare', onclick: () => this.hooks.openCompare(it.key) }, h('span', { html: icon('ruler', 14) }), t('cmpThis')) : null,
        this.dexRow,
        hasMore ? h('details', { class: 'more' },
          h('summary', { html: icon('chevron', 14) }, h('span', {}, t('moreDetails'))),
          funP,
          it.how ? h('p', { class: 'fun how', 'data-testid': 'info-how' }, h('b', {}, t('howMoves')), ' ', tr(it.how, l)) : null,
          it.habitat ? h('p', { class: 'meta' }, t('habitat') + ': ' + tr(it.habitat, l)) : null,
          extra.length ? h('dl', { class: 'facts' }, ...extra.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))) : null,
          h('p', { class: 'meta prov', 'data-testid': 'provenance' }, t('modelNote') + ' ' + t(it.route ? (it.route.line === 'demo' ? 'routeDemo' : 'routeNote') : it.type === 'animal' ? 'rangeNote' : ['landmark', 'volcano', 'space', 'discovery'].includes(it.type) ? 'placeNote' : 'repNote'))) : null,
        h('div', { class: 'info-footer' },
          it.type !== 'vehicle' ? h('div', { class: 'reactions' }, react('like', 'heart'), react('visited', 'flag')) : null,
          it.route ? h('button', { class: 'cta cta-sm', 'data-testid': 'ride', html: icon('ride', 16), onclick: () => void this.startRide(it) }, h('span', {}, t('ride'))) : null,
          h('button', { class: 'read-more', 'data-testid': 'read-more', 'aria-expanded': String(this.readerOpen), onclick: () => { sfx.tap(); void this.toggleReader(); } },
            h('span', {}, this.readerOpen ? t('readerClose') : t('readMore')), h('span', { html: icon('book', 14) })))));
    if (HAS_API && it.type !== 'vehicle') void api.reactions(it.key).then(r => this.setCounts(r)).catch(() => {});
  }

  /** "Say hello" (local greeting via speech) and "Hear it" (procedural animal call) buttons over the model. */
  private heroActions(it: CatalogueItem): HTMLElement | null {
    const l = lang();
    const greets = !!it.country && it.type !== 'animal' && it.type !== 'dino' && it.type !== 'migration';
    if (greets && !GREETINGS) {
      const slot = h('div', { hidden: true });
      void greetingsReady.then(() => { if (slot.isConnected && GREETINGS) slot.replaceWith(this.heroActions(it) ?? ''); });
      return slot;
    }
    const g = greets ? GREETINGS?.[it.country!] : undefined;
    const call = callFor(it);
    if (!g && !call) return null;
    const btn = (id: string, ic: IconName, label: string, fn: () => void) =>
      h('button', { class: 'hero-btn', 'data-testid': id, title: label, onclick: fn, html: icon(ic, 16) }, h('span', {}, label));
    return h('div', { class: 'hero-acts' },
      g ? btn('say-hello', 'hand', t('sayHello'), () => {
        const langName = new Intl.DisplayNames([l], { type: 'language' }).of(g[1].split('-')[0]) ?? g[1];
        const ok = speak(g[0], g[1]);
        toast(t('helloIn', { lang: langName, say: g[2] }) + (ok ? '' : ' ' + t('noSpeech')), 4200);
      }) : null,
      call ? btn('hear-it', 'sound', t('hearIt'), () => sfx.call(call)) : null);
  }

  private setCounts(r: { like: number; visited: number }): void {
    this.info.querySelectorAll<HTMLElement>('[data-count]').forEach(el => { const n = r[el.dataset.count as 'like' | 'visited']; el.textContent = n ? ' ' + fmtNum(n) : ''; });
  }

  // ---------- ride ----------
  async startRide(it: CatalogueItem): Promise<void> {
    this.hooks.toGlobe?.();
    if (!(await this.globe.prepare(it.key)) || !this.globe.startRide(it.key)) return;
    this.info.classList.add('hidden');
    document.body.classList.add('riding');
    let first = false;
    const viewBtn = h('button', { class: 'pill', 'data-testid': 'ride-view', onclick: () => { first = !first; this.globe.setRideView(first); viewBtn.textContent = first ? '🎥 3rd' : '👀 1st'; } }, '👀 1st');
    this.rideBar.replaceChildren(h('strong', {}, it.emoji + ' ' + tr(it.name, lang())), viewBtn,
      h('button', { class: 'pill danger', 'data-testid': 'ride-exit', onclick: () => this.exitRide() }, t('exitRide')), h('span', { class: 'tip' }, t('rideTip')));
    this.rideBar.classList.remove('hidden');
  }
  exitRide(): void {
    this.globe.stopRide();
    document.body.classList.remove('riding');
    this.rideBar.classList.add('hidden');
    if (this.current) this.info.classList.remove('hidden');
  }

  private fullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => toast('Fullscreen is not available here'));
  }
}
