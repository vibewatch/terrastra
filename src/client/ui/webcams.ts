/**
 * Global Public Live Cams (CCTV, observatories, volcanoes, wildlife waterholes, and ISS Earth view).
 * Renders interactive cyan/coral markers on the globe, filters by local solar phase (Day / Twilight / Night)
 * and category, and displays a Picture-in-Picture live stream dock with local weather telemetry.
 */
import * as THREE from 'three';
import { WEBCAMS, type WebcamCat, type WebcamStream } from '../../shared/data/webcams.ts';
import { latLonToVec } from '../../shared/lib/geo.ts';
import type { Globe } from '../globe/scene.ts';
import { StationDots } from '../globe/stations.ts';
import { propagateIss } from '../lib/iss.ts';
import { lang, onLang, t } from '../lib/i18n.ts';
import { sfx } from '../lib/sfx.ts';
import { describeWmoCode, fetchLocalWeather, solarStatusAt, type SolarPhase } from '../lib/weather.ts';
import { h } from './dom.ts';
import { icon } from './icons.ts';

type SolarFilter = 'all' | SolarPhase;
type CatFilter = 'all' | WebcamCat;

const CAT_KEYS: Record<CatFilter, string> = {
  all: 'cam.cat.all',
  space: 'cam.cat.space',
  volcano: 'cam.cat.volcano',
  wildlife: 'cam.cat.wildlife',
  city: 'cam.cat.city',
  nature: 'cam.cat.nature',
};

const SOLAR_KEYS: Record<SolarFilter, string> = {
  all: 'cam.solar.all',
  day: 'solar.day',
  twilight: 'solar.twilight',
  night: 'solar.night',
};

export class Webcams {
  private globe: Globe;
  private onAstronautView?: () => void;
  private onOpenChange?: (open: boolean) => void;
  private dots: StationDots | null = null;
  private dock: HTMLElement | null = null;
  private tip: HTMLElement | null = null;
  private snapshotTimer = 0;
  private issSyncTimer = 0;
  open = false;
  activeIdx = -1;
  collapsed = false;
  minimized = false;
  private catFilter: CatFilter = 'all';
  private solarFilter: SolarFilter = 'all';
  private weatherText = '';

  constructor(
    globe: Globe,
    opts: { onAstronautView?: () => void; onOpenChange?: (open: boolean) => void } = {},
  ) {
    this.globe = globe;
    this.onAstronautView = opts.onAstronautView;
    this.onOpenChange = opts.onOpenChange;
    onLang(() => {
      if (this.open) this.renderDock();
    });
  }

  get isActive(): boolean {
    return this.open;
  }

  openById(camId: string): void {
    this.toggle(true, camId);
  }

  suspend(on = true): void {
    if (!this.open || !this.dock) return;
    this.dock.classList.toggle('hidden', on);
  }

  private nowMs(): number {
    return this.globe.simTime ?? Date.now();
  }

  private ensureDots(): StationDots {
    if (this.dots) return this.dots;
    const lat = new Float32Array(WEBCAMS.length);
    const lon = new Float32Array(WEBCAMS.length);
    const iss = propagateIss(this.nowMs());
    for (let i = 0; i < WEBCAMS.length; i++) {
      const c = WEBCAMS[i];
      lat[i] = c.tracksIss ? iss.lat : c.lat;
      lon[i] = c.tracksIss ? iss.lon : c.lon;
    }
    this.dots = new StationDots(lat, lon, {
      color: '#38bdf8',
      favColor: '#fb7185',
      size: 0.012,
    });
    this.dots.setFavourites(i => WEBCAMS[i].cat === 'volcano' || WEBCAMS[i].cat === 'space');
    return this.dots;
  }

  private camCoords(cam: WebcamStream): { lat: number; lon: number } {
    if (cam.tracksIss) {
      const iss = propagateIss(this.nowMs());
      return { lat: iss.lat, lon: iss.lon };
    }
    return { lat: cam.lat, lon: cam.lon };
  }

  private camName(cam: WebcamStream): string {
    return lang() === 'zh' ? cam.nameZh : cam.name;
  }

  private camPlace(cam: WebcamStream): string {
    return lang() === 'zh' ? cam.placeZh : cam.place;
  }

  private camDesc(cam: WebcamStream): string {
    return lang() === 'zh' ? cam.descZh : cam.desc;
  }

  toggle(on?: boolean, initialCamId?: string): void {
    const next = on ?? !this.open;
    if (next === this.open && !initialCamId) return;
    this.open = next;
    document.body.classList.toggle('cam-on', this.open);
    this.onOpenChange?.(this.open);
    if (!this.open) {
      this.clearTimers();
      this.globe.setStations(null);
      this.globe.ev.onStation = undefined;
      this.globe.ev.onStationHover = undefined;
      this.dock?.remove();
      this.dock = null;
      this.tip?.remove();
      this.tip = null;
      return;
    }

    const dots = this.ensureDots();
    this.syncIssMarker();
    this.issSyncTimer = window.setInterval(() => this.syncIssMarker(), 3000);

    this.globe.setStations(dots);
    this.globe.setAudio(0.35, 0.25, 0.2);
    this.globe.ev.onStation = i => {
      sfx.tap();
      this.select(i, true);
    };
    this.globe.ev.onStationHover = (i, scr) => this.showTip(i, scr);

    this.mountDock();
    if (initialCamId) {
      const idx = WEBCAMS.findIndex(c => c.id === initialCamId);
      if (idx >= 0) {
        this.select(idx, true);
        return;
      }
    }
    if (this.activeIdx < 0) {
      const now = this.nowMs();
      const dayIdx = WEBCAMS.findIndex(c => !c.tracksIss && solarStatusAt(c.lat, c.lon, now).phase === 'day');
      this.select(dayIdx >= 0 ? dayIdx : 0, true);
    } else {
      this.select(this.activeIdx, false);
    }
  }

  private syncIssMarker(): void {
    if (!this.dots) return;
    const issIdx = WEBCAMS.findIndex(c => c.tracksIss);
    if (issIdx >= 0) {
      const iss = propagateIss(this.nowMs());
      this.dots.setCoord(issIdx, iss.lat, iss.lon);
      if (this.activeIdx === issIdx) {
        this.globe.beacon = new THREE.Vector3(...latLonToVec(iss.lat, iss.lon));
      }
      this.globe.markDirty();
    }
  }

  private clearTimers(): void {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = 0;
    }
    if (this.issSyncTimer) {
      clearInterval(this.issSyncTimer);
      this.issSyncTimer = 0;
    }
  }

  private filteredIndices(): number[] {
    const now = this.nowMs();
    const out: number[] = [];
    for (let i = 0; i < WEBCAMS.length; i++) {
      const c = WEBCAMS[i];
      if (this.catFilter !== 'all' && c.cat !== this.catFilter) continue;
      if (this.solarFilter !== 'all') {
        const coords = this.camCoords(c);
        const phase = solarStatusAt(coords.lat, coords.lon, now).phase;
        if (phase !== this.solarFilter) continue;
      }
      out.push(i);
    }
    return out.length > 0 ? out : WEBCAMS.map((_, i) => i);
  }

  select(index: number, fly = true): void {
    if (index < 0 || index >= WEBCAMS.length) return;
    this.activeIdx = index;
    this.minimized = false;
    if (this.dots) this.dots.playing = index;
    const cam = WEBCAMS[index];
    const coords = this.camCoords(cam);
    this.globe.beacon = new THREE.Vector3(...latLonToVec(coords.lat, coords.lon));
    this.globe.markDirty();
    if (fly) {
      this.globe.flyTo(coords.lat, coords.lon, cam.tracksIss ? 2.15 : 1.75, 1100);
    }
    this.weatherText = '';
    this.renderDock();
    void fetchLocalWeather(coords.lat, coords.lon).then(w => {
      if (!w || this.activeIdx !== index) return;
      const wmo = describeWmoCode(w.code, w.isDay);
      this.weatherText = `${wmo.icon} ${w.tempC}°C · ${t(wmo.labelKey)} · ${t('weather.wind', { kmh: w.windKmh })}`;
      const weatherEl = this.dock?.querySelector('.cam-weather-pill');
      if (weatherEl) weatherEl.textContent = this.weatherText;
    });
  }

  step(delta: 1 | -1): void {
    sfx.tap();
    const pool = this.filteredIndices();
    const cur = pool.indexOf(this.activeIdx);
    const next = pool[(cur + delta + pool.length) % pool.length];
    this.select(next, true);
  }

  randomCam(): void {
    sfx.tap();
    const pool = this.filteredIndices();
    if (pool.length <= 1) {
      this.select(pool[0] ?? 0, true);
      return;
    }
    let pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick === this.activeIdx) pick = pool[(pool.indexOf(pick) + 1) % pool.length];
    this.select(pick, true);
  }

  private showTip(index: number, scr: { x: number; y: number } | null): void {
    if (index < 0 || !scr) {
      if (this.tip) this.tip.classList.add('hidden');
      return;
    }
    if (!this.tip) {
      this.tip = h('div', { class: 'globe-tip radio-tip' });
      document.body.append(this.tip);
    }
    const cam = WEBCAMS[index];
    const coords = this.camCoords(cam);
    const solar = solarStatusAt(coords.lat, coords.lon, this.nowMs());
    const solarIcon = solar.phase === 'day' ? '☀️' : solar.phase === 'twilight' ? '🌅' : '🌙';
    this.tip.textContent = `📹 ${this.camName(cam)} · ${this.camPlace(cam)} (${solarIcon} ${solar.localTimeStr})`;
    this.tip.classList.remove('hidden');
    this.tip.style.left = `${scr.x}px`;
    this.tip.style.top = `${scr.y - 16}px`;
  }

  private mountDock(): void {
    this.dock?.remove();
    this.dock = h('aside', {
      class: 'cam-dock',
      'data-testid': 'cam-dock',
      role: 'region',
      'aria-label': t('cam.title'),
    });
    document.body.append(this.dock);
    this.renderDock();
  }

  renderDock(): void {
    if (!this.dock) return;
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = 0;
    }
    this.dock.classList.toggle('collapsed', this.collapsed);
    if (this.collapsed) {
      const cam = WEBCAMS[this.activeIdx] ?? WEBCAMS[0];
      this.dock.replaceChildren(
        h(
          'button',
          {
            class: 'radio-pill',
            title: t('cam.expand'),
            onclick: () => {
              this.collapsed = false;
              this.renderDock();
            },
          },
          h('span', { class: 'cam-live-dot' }),
          h('span', { class: 'radio-pill-name' }, this.camName(cam)),
        ),
      );
      return;
    }

    const cam = WEBCAMS[this.activeIdx] ?? WEBCAMS[0];
    const coords = this.camCoords(cam);
    const solar = solarStatusAt(coords.lat, coords.lon, this.nowMs());
    const solarEmoji = solar.phase === 'day' ? '☀️' : solar.phase === 'twilight' ? '🌅' : '🌙';
    const solarLabel = t(SOLAR_KEYS[solar.phase]);

    const solarRow = h(
      'div',
      { class: 'cam-filter-row' },
      ...(['all', 'day', 'twilight', 'night'] as const).map(sf =>
        h(
          'button',
          {
            class: `chip cam-chip ${this.solarFilter === sf ? 'active' : ''}`,
            onclick: () => {
              this.solarFilter = sf;
              const pool = this.filteredIndices();
              if (!pool.includes(this.activeIdx)) this.select(pool[0], true);
              else this.renderDock();
            },
          },
          sf === 'day'
            ? `☀️ ${t(SOLAR_KEYS[sf])}`
            : sf === 'twilight'
              ? `🌅 ${t(SOLAR_KEYS[sf])}`
              : sf === 'night'
                ? `🌙 ${t(SOLAR_KEYS[sf])}`
                : t(SOLAR_KEYS[sf]),
        ),
      ),
    );

    const catRow = h(
      'div',
      { class: 'cam-filter-row' },
      ...(['all', 'space', 'volcano', 'wildlife', 'city', 'nature'] as const).map(cf =>
        h(
          'button',
          {
            class: `chip cam-chip ${this.catFilter === cf ? 'active' : ''}`,
            onclick: () => {
              this.catFilter = cf;
              const pool = this.filteredIndices();
              if (!pool.includes(this.activeIdx)) this.select(pool[0], true);
              else this.renderDock();
            },
          },
          t(CAT_KEYS[cf]),
        ),
      ),
    );

    const viewport = h('div', { class: `cam-viewport ${this.minimized ? 'hidden' : ''}` });
    if (!this.minimized) {
      viewport.append(this.buildViewportMedia(cam, solar));
    }

    const head = h(
      'div',
      { class: 'cam-head' },
      h(
        'div',
        { class: 'cam-meta' },
        h(
          'div',
          { class: 'cam-title-row' },
          h('span', { class: 'cam-live-badge' }, h('span', { class: 'cam-live-dot' }), t('cam.live')),
          h('strong', { class: 'cam-name' }, this.camName(cam)),
        ),
        h(
          'div',
          { class: 'cam-sub-row' },
          h('span', {}, `${this.camPlace(cam)} · ${solarEmoji} ${solarLabel} (${solar.localTimeStr})`),
          h('span', { class: 'cam-weather-pill' }, this.weatherText),
        ),
      ),
      h(
        'div',
        { class: 'cam-ctl' },
        h('button', {
          class: 'radio-btn',
          title: t('cam.prev'),
          'aria-label': t('cam.prev'),
          html: icon('collapse', 16),
          onclick: () => this.step(-1),
        }),
        h('button', {
          class: 'radio-btn',
          title: t('cam.random'),
          'aria-label': t('cam.random'),
          html: icon('shuffle', 16),
          onclick: () => this.randomCam(),
        }),
        h('button', {
          class: 'radio-btn',
          title: t('cam.next'),
          'aria-label': t('cam.next'),
          html: icon('chevron', 16),
          onclick: () => this.step(1),
        }),
        h('button', {
          class: 'radio-btn',
          title: this.minimized ? t('cam.showVideo') : t('cam.hideVideo'),
          'aria-label': this.minimized ? t('cam.showVideo') : t('cam.hideVideo'),
          html: icon('eye', 16),
          onclick: () => {
            this.minimized = !this.minimized;
            this.renderDock();
          },
        }),
        h('button', {
          class: 'radio-btn',
          title: t('cam.close'),
          'aria-label': t('cam.close'),
          html: icon('close', 16),
          onclick: () => this.toggle(false),
        }),
      ),
    );

    const pool = this.filteredIndices();
    const strip = h(
      'div',
      { class: 'cam-strip' },
      ...pool.map(idx => {
        const item = WEBCAMS[idx];
        const cCoords = this.camCoords(item);
        const cSolar = solarStatusAt(cCoords.lat, cCoords.lon, this.nowMs());
        const dot = cSolar.phase === 'day' ? '☀️' : cSolar.phase === 'twilight' ? '🌅' : '🌙';
        return h(
          'button',
          {
            class: `cam-pill-btn ${idx === this.activeIdx ? 'active' : ''}`,
            onclick: () => this.select(idx, true),
          },
          `${dot} ${this.camName(item)}`,
        );
      }),
    );

    const actionsRow = h(
      'div',
      { class: 'cam-actions-row' },
      h('p', { class: 'cam-desc' }, this.camDesc(cam)),
      h(
        'div',
        { class: 'cam-action-btns' },
        ...(cam.tracksIss && this.onAstronautView
          ? [
              h(
                'button',
                {
                  class: 'pill cam-act-btn primary',
                  onclick: () => this.onAstronautView?.(),
                },
                `🧑‍🚀 ${t('iss.astronautView')}`,
              ),
            ]
          : []),
        h(
          'a',
          {
            class: 'pill cam-act-btn',
            href: cam.externalUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          `${t('cam.openSource')} ↗`,
        ),
      ),
    );

    this.dock.replaceChildren(head, solarRow, catRow, viewport, actionsRow, strip);
  }

  private buildViewportMedia(cam: WebcamStream, solar: ReturnType<typeof solarStatusAt>): HTMLElement {
    const wrap = h('div', { class: `cam-media-wrap phase-${solar.phase}` });
    if (cam.kind === 'youtube') {
      const iframe = document.createElement('iframe');
      iframe.className = 'cam-iframe';
      iframe.src = cam.url;
      iframe.title = this.camName(cam);
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      wrap.append(iframe);
      return wrap;
    }

    if (cam.kind === 'hls') {
      const video = document.createElement('video');
      video.className = 'cam-video';
      video.src = cam.url;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.controls = true;
      wrap.append(video);
      return wrap;
    }

    const img = document.createElement('img');
    img.className = 'cam-snapshot';
    img.alt = this.camName(cam);
    img.referrerPolicy = 'no-referrer';
    const stampBadge = h('span', { class: 'cam-snapshot-stamp' }, t('cam.snapshotLive'));

    const loadSnap = () => {
      const sep = cam.url.includes('?') ? '&' : '?';
      img.src = `${cam.url}${sep}_t=${Math.floor(Date.now() / 20_000)}`;
    };
    img.onerror = () => {
      img.hidden = true;
      stampBadge.textContent = t('cam.snapshotFallback');
    };
    loadSnap();
    this.snapshotTimer = window.setInterval(loadSnap, 20_000);

    const fallbackBackdrop = h(
      'div',
      { class: 'cam-atmo-backdrop' },
      h('div', { class: 'cam-atmo-orb' }),
      h('div', { class: 'cam-atmo-coords' }, `${cam.lat.toFixed(2)}°, ${cam.lon.toFixed(2)}° · ${solar.localTimeStr}`),
    );
    wrap.append(fallbackBackdrop, img, stampBadge);
    return wrap;
  }
}

