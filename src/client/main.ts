import { classroom, onClassroom, apply as applyClassroom } from './lib/classroom.ts';
import { parseView, type Bookmark } from './lib/viewlink.ts';
import { ssbsOn } from './lib/ssbs.ts';
import './styles.css';
import './hud.css';
import './intro.css';
import type { Topology } from 'topojson-specification';
import { Globe } from './globe/scene.ts';
import type { SolarUI } from './solar/ui.ts';
import { detectQuality, lowFxFrom } from './globe/quality.ts';
import { DEFAULT_H, MAX_H } from './globe/scene.ts';
import { hasLand, loadCountries, paintEarth, paintedLand } from './globe/painter.ts';
import { paintOffThread } from './globe/paint-offthread.ts';
import { borderPositions, borderLonLat } from './globe/borders.ts';
import { CATALOGUE, BY_KEY } from '../shared/data/catalogue.ts';
import { Shell } from './ui/shell.ts';
import { h, toast, confetti } from './ui/dom.ts';
import { store, subscribe, setStickerHandler, setSyncer, setMe, replaceProgress } from './store.ts';
import { t, lang, onLang } from './lib/i18n.ts';
import { tr } from '../shared/data/types.ts';
import { STICKERS } from '../shared/lib/stickers.ts';
import { api } from './lib/api.ts';
import { HAS_API, url } from './lib/env.ts';
import { load, onSessionOnly } from './lib/storage.ts';
import { mergeProgress } from '../shared/lib/progress.ts';
import { sfx } from './lib/sfx.ts';
import { music } from './lib/music.ts';
import { openTutorial } from './ui/tutorial.ts';
import { ScaleRail, type RailLevel } from './ui/scales.ts';
import { initTooltips } from './ui/tooltip.ts';
import { lazy, withBusy, showLoadError } from './ui/lazy.ts';
import type { ScaleId } from '../shared/data/cosmos.ts';

/** Panels not needed for the first screen load on first use (their chunks stay out of the entry). */
const later = <M,>(load: () => Promise<M>, what: () => string) => {
  const get = lazy(load);
  return (use: (m: M) => void) => void withBusy(get()).then(use, () => toast('⚠️ ' + t('loadFail', { s: what() }) + (navigator.onLine ? '' : ' ' + t('offlineMissing')), navigator.onLine ? 2600 : 5000));
};
const gamesMod = later(() => import('./ui/games.ts'), () => t('game'));
const collectionMod = later(() => Promise.all([import('./ui/collection.ts'), import('./ui/passport.ts')]), () => t('collection'));
const photoMod = later(() => import('./ui/photo.ts'), () => t('photo'));
const accountMod = lazy(() => import('./ui/account.ts'));
const account = (use: (m: typeof import('./ui/account.ts')) => void) => void withBusy(accountMod()).then(use, () => toast('⚠️ ' + t('loadFail', { s: t('account') })));

declare global { interface Window { __pp?: { ready: boolean; globe: Globe; shell: Shell; itemScreen: (k: string) => { x: number; y: number } | null; solar: () => SolarUI | null; map: () => import('./map/flatmap.ts').FlatMap | null } } }

const params = new URLSearchParams(location.search);
/** `#solar/jupiter`, `#milkyway/dp_sgr_a`, `#universe` … */
const SCALE_ROUTES: Record<string, ScaleId> = { solar: 'solar', nearbystars: 'stars', milkyway: 'galaxy', localgroup: 'group', laniakea: 'laniakea', universe: 'universe' };
const lowfx = lowFxFrom(params, matchMedia('(prefers-reduced-motion: reduce)').matches);
const quality = detectQuality(params, lowfx);
const app = document.getElementById('app')!;
const loader = document.getElementById('loader');

async function boot(): Promise<void> {
  if (lowfx) document.body.classList.add('lowfx');
  applyClassroom();
  window.addEventListener('offline', () => toast('📴 ' + t('nowOffline'), 5000));
  document.body.classList.add('q-' + quality.tier);
  initTooltips();
  document.documentElement.lang = lang();
  document.title = t('title');
  // a deep link into another scene: fetch that scene's code alongside the Earth's, not after it
  const linkHead = location.hash.slice(1).split('/')[0];
  if (linkHead === 'sky') void import('./sky/index.ts').catch(() => {});
  else if (linkHead === 'map') void import('./map/flatmap.ts').catch(() => {});
  else if (SCALE_ROUTES[linkHead]) void import('./solar/ui.ts').catch(() => {});
  const topoRes = await fetch(url('data/countries-110m.json'));
  if (!topoRes.ok) throw new Error(`country map: HTTP ${topoRes.status}`);
  const topo = (await topoRes.json()) as Topology;
  const countries = loadCountries(topo);
  const texWidth = quality.mapW;
  const political = () => store.settings.surfaceMode === 'political';
  // the land fill and night lights paint in a worker while the page carries on setting up
  const landPainted = paintOffThread(topo, countries, { political: political(), width: texWidth, nightW: quality.nightW });
  await Promise.race([document.fonts?.ready, new Promise(r => setTimeout(r, 150))]);
  let fineTopo: Topology | undefined;
  /** Country shapes for hover/tap lookups: 1:110m, then 1:50m once loaded. */
  let shapes = countries;
  const paint = () => paintEarth(topo, countries, { political: political(), borders: store.settings.borders, width: texWidth, borderTopo: fineTopo });
  let paintSeq = 0;
  const repaint = async () => {
    const my = ++paintSeq;
    if (!hasLand(countries, political(), texWidth)) await paintOffThread(topo, countries, { political: political(), width: texWidth });
    if (my !== paintSeq) return;
    earthCv = paint(); globe.setEarthTexture(earthCv); solar?.view.setEarthCanvas(earthCv);
  };

  const globeEl = h('div', { id: 'globe' });
  app.append(globeEl);
  let shell!: Shell;
  const globe = new Globe(globeEl, {
    onPick: it => shell.showItem(it),
    onHover: (it, scr) => shell?.showHover(it, scr),
    onView: (z, la, lo) => shell.setZoom(z, la, lo),
    onBeyond: () => void enterSolar(),
  }, lowfx, quality);
  globe.lang = lang();
  globe.applySettings(store.settings);
  await landPainted;
  let earthCv = paint();
  if (!globe.init(earthCv, countries, CATALOGUE, borderPositions(topo))) {
    loader?.remove();
    app.replaceChildren(h('div', { class: 'fatal', role: 'alert' }, h('p', { class: 'big' }, '🌍'), h('p', {}, t('webglFail'))));
    return;
  }
  // finer borders (and the small states missing from 1:110m) after the opening fly-in, in idle-time steps so the
  // globe never stutters; the painted fills stay 1:110m
  const idle = () => new Promise<void>(ok => 'requestIdleCallback' in window ? requestIdleCallback(() => ok(), { timeout: 3000 }) : setTimeout(ok, 200));
  setTimeout(() => void (async () => {
    await idle();
    const r = await fetch(url('data/countries-50m.json'));
    if (!r.ok) return;
    const t50 = (await r.json()) as Topology;
    await idle();
    globe.setBorderPositions(borderPositions(t50));
    await idle();
    shapes = loadCountries(t50);
    globe.setCountryShapes(shapes);
    await idle();
    fineTopo = t50;
    if (store.settings.borders) void repaint();
  })().catch(() => { /* keep the 1:110m borders */ }), 4000);

  let gaming = false;
  // a geography lesson owns the globe's layers while it runs: anything that leaves the globe ends it
  const endLesson = () => { if (document.body.classList.contains('lessoning')) void import('./lessons/player.ts').then(m => m.stopLesson()); };
  const setGameMode = (on: boolean, names?: boolean) => {
    gaming = on;
    if (on) { navSeq++; endLesson(); closeMap(false); }
    globe.gameMode = on;
    if (on) { shell.showItem(null); shell.toggleMenu(false); shell.time.toggle(false); radio?.toggle(false); }
    document.body.classList.toggle('gaming', on);
    globe.applySettings(on && names === false ? { ...store.settings, names: false } : store.settings);
    if (!on) globe.ev.onGlobeTap = undefined;
  };
  const host = { globe, setGameMode };

  // ---- Earth radio (lazy): station dots on the globe + a player dock ----
  let radio: import('./ui/radio.ts').Radio | null = null;
  const loadRadio = lazy(() => import('./ui/radio.ts'));
  const toggleRadio = async () => {
    if (gaming || inSolar || classroom()) return;
    closeMap();
    // live radio can never work offline; say so instead of a failed connection
    if (!navigator.onLine && !radio?.active) { toast('📡 ' + t('radioOffline'), 4000); return; }
    try {
      const m = await withBusy(loadRadio());
      radio = await m.getRadio(globe, app);
    } catch { toast(t('radioLoadFail')); return; }
    if (gaming || inSolar || inSky) return;
    if (!radio.active) shell.time.toggle(false);
    radio.toggle();
  };

  // Classroom mode has no live streams: switching it on stops the radio.
  onClassroom(() => { if (classroom() && radio?.active) radio.toggle(false); });

  // ---- Solar System (lazy: its own renderer, loaded on first use) ----
  let solar: SolarUI | null = null;
  let inSolar = false;
  /** Bumped by every navigation, so a load that finishes after the user went elsewhere is dropped. */
  let navSeq = 0;
  let scaleNow: ScaleId = 'solar';
  // Background music follows the level the user is looking at.
  const tune = () => music.setLevel(inSky ? 'sky' : inSolar ? (scaleNow === 'stars' ? 'galaxy' : scaleNow) : 'earth');
  const loadSolarMod = lazy(() => import('./solar/ui.ts'));
  const loadSolar = async () => solar ??= new (await loadSolarMod()).SolarUI(app, { quality, earthCanvas: () => earthCv, exit: leaveSolar, onScale: s => { rail.set(s); scaleNow = s; tune(); }, openSky: () => void openSky(), onMeter: on => shell.setMeterOpen(on) });
  const routeOf = (o: { focus?: string; scale?: ScaleId }) => {
    const head = Object.keys(SCALE_ROUTES).find(k => SCALE_ROUTES[k] === (o.scale ?? 'solar'))!;
    return head + (o.focus && o.focus !== 'overview' ? '/' + o.focus : '');
  };
  const fade = (fn: () => void) => {
    document.body.classList.add('fading');
    setTimeout(() => { fn(); requestAnimationFrame(() => document.body.classList.remove('fading')); }, lowfx ? 0 : 230);
  };
  const enterSolar = async (opts: { focus?: string; scale?: ScaleId } = {}) => {
    if (inSolar || gaming) return;
    endLesson();
    const seq = ++navSeq;
    let ui: SolarUI;
    // its shaders compile in the background while the busy spinner shows, so the view opens without a stall
    try { ui = await withBusy(loadSolar().then(async u => { await u.view.warmed; return u; })); } catch (e) {
      console.error(e);
      if (seq === navSeq) showLoadError(t('solarSystem'), () => void enterSolar(opts), routeOf(opts));
      return;
    }
    // the user went elsewhere (back to Earth, a game, another load) while this was loading
    if (seq !== navSeq || inSolar || gaming) return;
    closeMap(false);
    inSolar = true;
    radio?.suspend(true);
    shell.showItem(null); shell.toggleMenu(false); shell.time.toggle(false);
    fade(() => {
      globe.paused = true;
      document.body.classList.add('solar');
      shell.setSpace(true);
      ui.enter(opts.focus || opts.scale ? opts : { from: { lat: globe.lat, lon: globe.lon } });
      tune();
    });
  };
  const leaveSolar = (lat: number, lon: number, then?: () => void) => {
    if (!inSolar) return;
    navSeq++;
    inSolar = false;
    tune();
    if (!inSky) radio?.suspend(false);
    fade(() => {
      solar?.leave();
      rail.set('earth');
      document.body.classList.remove('solar');
      shell.setSpace(false);
      globe.paused = false;
      globe.lat = lat; globe.lon = lon; globe.h = MAX_H;
      globe.flyTo(lat, lon, DEFAULT_H, 1400);
      history.replaceState(null, '', location.pathname + location.search);
      then?.();
    });
  };

  // ---- Sky theatre (lazy): eclipses, meteor showers, planets, played out over the globe or the Solar System ----
  const loadSky = lazy(() => import('./sky/index.ts'));
  let inSky = false;
  const openSky = async (id?: string): Promise<import('./sky/theatre.ts').Theatre | null> => {
    if (gaming) return null;
    const seq = ++navSeq;
    let m: typeof import('./sky/index.ts');
    try { m = await withBusy(loadSky()); } catch (e) {
      console.error(e);
      if (seq === navSeq) showLoadError(t('skyEvents'), () => void openSky(id), 'sky' + (id ? '/' + id : ''));
      return null;
    }
    if (seq !== navSeq || gaming) return null;
    closeMap(false);
    if (!inSky) { shell.toggleMenu(false); shell.time.toggle(false); }
    // replacing an open theatre runs its onClose first, so the "in the sky" state is set after the swap
    const th = m.openSky(document.body, {
      id, lowfx, dprMax: quality.dprMax, msaa: quality.msaa,
      globe: { lat: globe.lat, lon: globe.lon },
      onClose: () => {
        if (sky !== th) return;
        sky = null;
        inSky = false;
        tune();
        if (!inSolar) radio?.suspend(false);
        if (inSolar) solar?.view.suspend(false); else globe.paused = false;
      },
      onPhoto: () => openPhoto(),
      onSolar: (focus, ms) => {
        if (inSolar && solar) { solar.showAt(ms, focus); return; }
        void withBusy(loadSolar()).then(ui => { ui.showAt(ms); void enterSolar({ focus }); }, () => showLoadError(t('solarSystem'), () => void enterSolar({ focus }), 'solar/' + (focus ?? '')));
      },
    });
    sky = th;
    inSky = true;
    tune();
    radio?.suspend(true);
    globe.paused = true;
    solar?.view.suspend(true);
    return th;
  };

  // ---- flat world map (lazy: its own renderer): the globe pauses underneath it ----
  const loadMap = lazy(() => import('./map/flatmap.ts'));
  let flatMap: import('./map/flatmap.ts').FlatMap | null = null;
  let inMap = false;
  const openMap = async () => {
    if (inMap || gaming || inSolar || inSky) return;
    const seq = ++navSeq;
    let m: typeof import('./map/flatmap.ts');
    try { m = await withBusy(loadMap()); } catch (e) {
      console.error(e);
      if (seq === navSeq) showLoadError(t('flatMap'), () => void openMap(), 'map');
      return;
    }
    if (seq !== navSeq || inMap || gaming || inSolar || inSky) return;
    endLesson();
    flatMap ??= new m.FlatMap({
      globe, quality, lowfx,
      earthCanvas: () => paintedLand() ?? earthCv,
      borders: () => borderLonLat(fineTopo ?? topo),
      countries: () => countries,
      shapes: () => shapes,
      selected: () => shell.current,
      pick: it => shell.showItem(it, false),
      hover: (it, at) => shell.showHover(it, at),
      onView: (z, la, lo) => shell.setReadout(z, la, lo),
      learn: () => { closeMap(false); startLesson('projections'); },
    });
    if (!flatMap.el.isConnected) globeEl.after(flatMap.el);
    inMap = true;
    if (globe.ride) shell.exitRide();
    shell.time.toggle(false);
    shell.toggleMenu(false);
    radio?.suspend(true);
    globe.paused = true;
    document.body.classList.add('flatmap');
    flatMap.open(globe.lat, globe.lon);
    shell.setMapOpen(true);
  };
  /** Back to the globe; `follow` turns it to where the map was looking. */
  function closeMap(follow = true): void {
    if (!inMap || !flatMap) return;
    inMap = false;
    const [lat, lon] = flatMap.center();
    flatMap.close();
    document.body.classList.remove('flatmap');
    shell.setMapOpen(false);
    globe.paused = false;
    if (!inSky && !inSolar) radio?.suspend(false);
    if (follow) globe.flyTo(lat, lon, globe.h, 900);
  }

  // ---- guided tours (lazy): they drive the same navigation a user would ----
  const toursMod = later(() => import('./ui/tours.ts'), () => t('tours'));
  const navTo = (hash: string) => {
    if (inSky) sky?.close();
    if (location.hash === '#' + hash) route(); else location.hash = hash;
  };
  const tourHost: import('./ui/tours.ts').TourHost = {
    earth: (lat, lon, hh) => {
      if (gaming) return;
      if (inSky) sky?.close();
      closeMap(false);
      shell.showItem(null);
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      if (inSolar) leaveSolar(lat, lon, () => globe.flyTo(lat, lon, hh, 1400)); else globe.flyTo(lat, lon, hh, 1600);
    },
    go: hash => navTo(hash),
    sky: (id, view) => void openSky(id).then(th => { if (th && view) th.show(view); }),
    path: pts => { if (!inSolar && !inSky) pts.slice(1).forEach((p, i) => globe.showFlightArc(pts[i], p, i > 0)); },
    item: key => navTo(key),
    solarAt: (focus, ms) => {
      if (inSky) sky?.close();
      if (inSolar && solar) { solar.showAt(ms, focus); return; }
      void withBusy(loadSolar()).then(ui => { ui.showAt(ms); void enterSolar({ focus }); }, () => showLoadError(t('solarSystem'), () => void enterSolar({ focus }), 'solar/' + focus));
    },
  };
  const openTours = () => toursMod(m => m.openTours(tourHost));

  // ---- geography class (lazy): lessons drawn on the globe, with a quiz at the end ----
  const lessonsMod = later(() => import('./lessons/player.ts'), () => t('lessons'));
  const lessonHost: import('./lessons/player.ts').LessonHost = {
    globe, low: quality.tier === 'low',
    toEarth: then => {
      if (inSky) sky?.close();
      closeMap(false);
      shell.showItem(null); shell.toggleMenu(false);
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      if (inSolar) leaveSolar(globe.lat, globe.lon, then); else then();
    },
    sky: id => tourHost.sky(id, 'model'),
    blocked: () => gaming,
  };
  const openLessons = () => lessonsMod(m => m.openLessons(lessonHost));
  const openAstro = () => lessonsMod(m => m.openLessons(lessonHost, 'astro'));
  const openSsbs = () => lessonsMod(m => m.openLessons(lessonHost, 'ssbs'));
  const startLesson = (id: string) => lessonsMod(m => m.startLesson(id, lessonHost));

  // ---- saved views (F02) ----
  const tonightMod = later(() => import('./ui/tonight.ts'), () => t('tonight'));
  const cmpMod = later(() => import('./ui/compare.ts'), () => t('compare'));
  const bmMod = later(() => import('./ui/bookmarks.ts'), () => t('bookmarks'));
  const currentView = async (): Promise<Bookmark | null> => {
    if (gaming) return null;
    let route: string;
    try { route = parseView(decodeURIComponent(location.hash.slice(1)).trim()).route; } catch { return null; }
    const at = Date.now();
    if (inSky) {
      const id = route.split('/')[1];
      if (!id) return { route: 'sky', label: { en: t('skyEvents'), zh: t('skyEvents') }, at };
      const [{ findEvent }, { eventTitle }] = await Promise.all([import('./sky/panel.ts'), import('./sky/acts.ts')]);
      const ev = findEvent(id);
      if (!ev) return null;
      const name = `${eventTitle(ev)} · ${new Date(ev.t).toLocaleDateString(lang() === 'zh' ? 'zh-CN' : 'en')}`;
      return { route: 'sky/' + id, label: { en: name, zh: name }, at };
    }
    if (inSolar) {
      if (!route) return null;
      const { spaceIndex } = await import('./solar/space-index.ts');
      const hit = spaceIndex().find(x => x.hash === route);
      return { route, label: hit?.name ?? { en: route, zh: route }, at };
    }
    const [mlat, mlon] = inMap && flatMap ? flatMap.center() : [globe.lat, globe.lon];
    const cam = { lat: mlat, lon: mlon, h: globe.h };
    if (shell.current) return { route: shell.current.key, cam, label: shell.current.name, at };
    const where = `${Math.abs(cam.lat).toFixed(1)}°${cam.lat >= 0 ? 'N' : 'S'} ${Math.abs(cam.lon).toFixed(1)}°${cam.lon >= 0 ? 'E' : 'W'}`;
    return { route: '', cam, label: { en: 'Earth · ' + where, zh: '地球 · ' + where }, at };
  };
  // ---- photos from every scene (F06): each one captures its own canvas and says how faithful the view is ----
  const photoShot = (): import('./ui/photo.ts').Shot => {
    if (inSky && sky) { const th = sky; return { capture: () => th.capture(), caption: () => th.caption() }; }
    if (inSolar && solar) {
      const v = solar.view;
      return {
        capture: () => v.capture(),
        caption: async () => {
          const route = parseView(decodeURIComponent(location.hash.slice(1))).route;
          const { spaceIndex } = await import('./solar/space-index.ts');
          const all = spaceIndex(), hit = all.find(x => x.hash === route);
          const head = route.split('/')[0] || 'solar';
          const level = hit?.level ?? all.find(x => x.hash === head)?.name;
          const isLevel = !hit || hit.key.startsWith('scale_');
          return { title: isLevel ? '' : tr(hit!.name, lang()), level: level ? tr(level, lang()) : t('solarSystem'), note: t(head === 'solar' ? 'photoNoteSolar' : 'photoNoteDeep') };
        },
      };
    }
    if (inMap && flatMap) {
      const fm = flatMap;
      return { capture: async () => fm.capture(), caption: () => ({ title: shell.current ? tr(shell.current.name, lang()) : '', level: t('flatMap').replace(/\s*\(M\)$/, ''), note: t('photoNoteMap') }) };
    }
    return { capture: async () => globe.capture(), caption: () => ({ title: shell.current ? tr(shell.current.name, lang()) : '', level: t('lvEarth'), note: t('photoNoteEarth') }) };
  };
  const openPhoto = () => { if (!gaming) photoMod(m => m.openPhotoMode(photoShot())); };
  const openBookmarks = () => bmMod(m => m.openBookmarks({ current: currentView, open: navTo }));
  const startTour = (id: string) => { endLesson(); toursMod(m => m.startTour(id, tourHost)); };

  const showCollection = () => collectionMod(([{ openCollection }]) => openCollection(it => shell.showItem(it)));
  const showPassport = () => collectionMod(([, { openPassport }]) => openPassport({
    here: () => shell.current ? [shell.current.lat, shell.current.lon] : [globe.lat, globe.lon],
    travel: (it, from) => { shell.showItem(it); if (Math.abs(from[0] - it.lat) + Math.abs(from[1] - it.lon) > 2) globe.showFlightArc(from, [it.lat, it.lon]); },
  }));
  const openGame = (kind: 'daily' | 'placeit' | 'quiz') => { if (!gaming && !inSolar) gamesMod(m => m.startGame(host, kind)); };
  shell = new Shell(app, globe, {
    openPhoto,
    openCollection: showCollection,
    openGame, openPassport: showPassport, openAlbum: () => photoMod(m => void m.openAlbum()),
    openTutorial: () => openTutorial(openTours),
    openTours, openLessons, openAstro, openSsbs, openBookmarks,
    openCompare: (id?: string) => cmpMod(m => m.openCompare(id)),
    openTonight: () => tonightMod(m => m.openTonight(navTo)),
    openAccount: () => account(m => m.openAccount()), openGuestbook: () => account(m => void m.openGuestbook()),
    openSolar: () => void enterSolar(),
    openSky: () => void openSky(),
    openRadio: () => void toggleRadio(),
    toEarth: it => { if (!inSolar) return false; leaveSolar(it.lat, it.lon, () => shell.showItem(it)); return true; },
    zoom: inward => {
      if (inMap && flatMap) { flatMap.zoomBy(inward ? 1.6 : 1 / 1.6); return true; }
      if (!inSolar) return false;
      solar?.zoom(inward); return true;
    },
    toggleMap: () => { if (inMap) closeMap(); else void openMap(); },
    toggleMeter: () => solar?.toggleMeter(),
    toGlobe: () => closeMap(false),
    onSelect: it => { if (it && inMap) flatMap?.focus(it); },
    escape: () => { if (!inMap) return false; closeMap(); return true; },
    overview: () => solar?.overview(),
    toHome: () => { if (inSolar) leaveSolar(globe.lat, globe.lon); },
  });
  shell.mount();
  // One ladder for the whole system: universe → … → Solar System → Earth.
  const rail = new ScaleRail((l: RailLevel) => {
    if (l === 'earth') { navSeq++; if (inSolar) leaveSolar(20, 10); return; }
    if (!inSolar) void enterSolar({ scale: l });
    else solar?.goScale(l);
  });
  shell.levelSlot.append(rail.el);
  shell.applySettings(store.settings);

  let painted = { mode: store.settings.surfaceMode, borders: store.settings.borders };
  subscribe(() => {
    const s = store.settings;
    if (!gaming) shell.applySettings(s); else globe.applySettings({ ...s, names: globe.settings.names });
    if ((s.surfaceMode === 'political') !== (painted.mode === 'political') || s.borders !== painted.borders) {
      painted = { mode: s.surfaceMode, borders: s.borders };
      setTimeout(() => void repaint(), 0);
    }
  });
  onLang(l => { document.documentElement.lang = l; });

  setStickerHandler(id => {
    const st = STICKERS.find(s => s.id === id);
    if (!st) return;
    toast(t('sticker_unlocked', { s: `${st.emoji} ${tr(st.name, lang())}` }), 3500);
    confetti(30); sfx.good();
  });
  onSessionOnly(() => toast('⚠️ ' + t('sessionOnly'), 6000));
  setSyncer(async () => { await (await accountMod()).syncNow(true); });

  // ---- routing ----
  let sky: import('./sky/theatre.ts').Theatre | null = null;
  const route = () => {
    let hsh: string;
    try { hsh = decodeURIComponent(location.hash.slice(1)).trim(); } catch { hsh = '\u0000'; }
    // A saved view: route + versioned globe camera. A broken camera falls back to the route alone.
    const view = parseView(hsh);
    hsh = view.route;
    const cam = view.cam;
    if (view.bad) toast('🧭 ' + t('linkView'));
    if (!hsh) {
      // back/forward to the bare page: show the Earth
      if (inSky) sky?.close();
      if (cam) {
        closeMap(false);
        history.replaceState(null, '', location.pathname + location.search);
        const go = () => globe.flyTo(cam.lat, cam.lon, cam.h, 1400);
        if (inSolar) leaveSolar(cam.lat, cam.lon, go); else go();
      } else if (inSolar) leaveSolar(globe.lat, globe.lon);
      return;
    }
    const [head, rest = ''] = hsh.split('/');
    if (head === 'sky') { void openSky(rest || undefined); return; }
    if (head === 'map') { history.replaceState(null, '', location.pathname + location.search); void openMap(); return; }
    if (head === 'lesson') { if (rest) startLesson(rest); else openLessons(); history.replaceState(null, '', location.pathname + location.search); return; }
    if (head === 'ssbs') { if (ssbsOn()) openSsbs(); history.replaceState(null, '', location.pathname + location.search); return; }
    if (head === 'astro') { if (rest) startLesson(rest); else openAstro(); history.replaceState(null, '', location.pathname + location.search); return; }
    if (head === 'tour') { if (rest) startTour(rest); else openTours(); history.replaceState(null, '', location.pathname + location.search); return; }
    const scale = SCALE_ROUTES[head];
    if (scale) {
      const focus = rest || (scale === 'solar' ? 'overview' : '');
      if (!inSolar) void enterSolar({ focus, scale }); else solar?.goTo(focus, scale);
      return;
    }
    // one-shot notices from the sign-in redirect: clear them so a reload does not repeat them
    if (HAS_API && hsh === 'signed-in') { history.replaceState(null, '', location.pathname + location.search); toast('👋 ' + t('synced')); account(m => m.openAccount()); }
    else if (hsh === 'auth-error') { history.replaceState(null, '', location.pathname + location.search); toast('⚠️ ' + t('linkExpired')); }
    else {
      const it = BY_KEY.get(hsh);
      const show = () => { shell.showItem(it!, !cam); if (cam) globe.flyTo(cam.lat, cam.lon, cam.h, 1400); };
      if (it) { if (inSolar) leaveSolar(it.lat, it.lon, show); else show(); }
      else { toast('🧭 ' + t('linkUnknown')); history.replaceState(null, '', location.pathname + location.search); }
    }
  };
  window.addEventListener('hashchange', route);

  // the loader stays up while the globe's shaders finish compiling in the background
  await globe.warmed;
  // Opening: warp out of the star field while the globe flies in from deep space.
  if (loader && !lowfx) {
    if (!location.hash) { const lon = globe.lon; globe.h = MAX_H; globe.lon = lon - 70; globe.flyTo(globe.lat, lon, DEFAULT_H, 2600); }
    loader.classList.add('go');
    setTimeout(() => loader.remove(), 1300);
  } else loader?.remove();
  window.__pp = { ready: true, globe, shell, itemScreen: k => globe.itemScreen(k), solar: () => solar, map: () => flatMap };

  // ---- account (optional) ----
  void api.me().then(async me => {
    if (!me) return;
    setMe(me);
    try {
      const { progress } = await api.getProgress();
      if (progress) replaceProgress(mergeProgress(store.progress, progress));
      await (await accountMod()).syncNow(true);
    } catch { /* offline */ }
  });

  const deepLink = !!location.hash;
  route();
  if (!deepLink && load<string | null>('tutorial', null) !== 'done' && !params.has('notut')) setTimeout(() => openTutorial(openTours), 600);
}

boot().catch(err => {
  console.error(err);
  loader?.remove();
  app.replaceChildren(h('div', { class: 'fatal', role: 'alert' }, h('p', { class: 'big' }, '🌍'), h('p', {}, String(err))));
});
