/**
 * Earth radio: thousands of live stations as glowing dots on the globe. Tap one to listen.
 * Loaded on first use (station list, the dot layer, the dock and the audio engine).
 */
import type { Globe } from '../globe/scene.ts';
import { DEFAULT_H } from '../globe/scene.ts';
import { StationDots } from '../globe/stations.ts';
import { RadioEngine, type RadioStatus } from '../lib/radio.ts';
import { music } from '../lib/music.ts';
import { t, countryName, fmtNum, onLang, lang } from '../lib/i18n.ts';
import { url } from '../lib/env.ts';
import { load, save } from '../lib/storage.ts';
import { h, toast, openModal, closeModal } from './dom.ts';
import { icon } from './icons.ts';
import { sfx } from '../lib/sfx.ts';
import * as THREE from 'three';
import { latLonToVec } from '../../shared/lib/geo.ts';

// Station tags are free text in many languages; in Chinese show only the ones that map to a known genre.
const GENRE_ZH: [RegExp, string][] = [
  [/christmas|navidad/, '圣诞音乐'], [/anime|j-?pop|k-?pop/, '日韩流行'], [/bollywood|hindi|bhojpuri|tamil|bangla|south india/, '印度音乐'],
  [/arab|middle east|quran/, '阿拉伯音乐'], [/afro|african/, '非洲音乐'],
  [/christian|gospel|catholic|bible|religio|islam|orthodox|cristian|evangel|worship/, '宗教'],
  [/sport|soccer|football|futebol|deporte/, '体育'], [/business|econom|financ/, '财经'],
  [/news|noticia|notícia|новости|actualidad|information|información|\binfo\b|politic|политика/, '新闻'],
  [/talk|speech|entrevista|interview/, '谈话'], [/comedy|humor|humour/, '喜剧'],
  [/classical|opera|choral|baroque|symphon|clásica|klassik/, '古典'], [/jazz|bebop|big band|swing/, '爵士'], [/blues/, '蓝调'],
  [/metal|punk|hardcore|grunge/, '重金属'], [/rock/, '摇滚'], [/hip.?hop|\brap\b|trap|urban|urbano/, '嘻哈'], [/r&b|rnb|soul|funk/, '节奏布鲁斯'],
  [/reggae|dancehall|ska/, '雷鬼'],
  [/latin|salsa|cumbia|merengue|bachata|reggaet|raggaet|bolero|vallenato|balada|bossa|sertanejo|\bmpb\b|tropical|tango|español/, '拉丁'],
  [/country/, '乡村'], [/folk|traditional|tradicional/, '民谣'],
  [/dance|edm|house|techno|trance|club|electro|dnb|drum|hardstyle|breakbeat|disco|dj/, '电子舞曲'],
  [/ambient|chill|lounge|relax|downtempo|meditation|easy listening|smooth|instrumental|acoustic|nature|sleep/, '轻音乐'],
  [/[0-9]0'?s|[0-9]0er|19[0-9]0|oldies|retro|classic|decades|flashback|nostalgi|old time|clasico/, '怀旧金曲'],
  [/hits|top ?40|\btop\b|contemporary|mainstream|chart/, '热门金曲'], [/indie|alternative/, '独立音乐'], [/pop/, '流行'],
  [/film|movie|soundtrack|cinema/, '电影原声'], [/kids|children|infantil/, '儿童'],
  [/cultur|education|documentar|science|history/, '文化'], [/entertain|entreten|variety|eclectic|general/, '综合'],
  [/world|international|multicultural/, '世界音乐'], [/public|community|local|regional|national|pública/, '公共电台'],
];
/** Shuffle only lands on stations tagged as music (no news, talk, religion or sport); the whole map is still there to explore. */
const MUSIC = /music|classical|jazz|ambient|chill|lounge|instrumental|piano|kids|children|infantil|pop|hits|oldies|dance|folk|country|latin|world|soundtrack|easy listening|relax|smooth|acoustic|blues|soul|reggae/;
const NOT_MUSIC = /news|talk|politic|religio|christian|islam|quran|gospel|church|bible|sport|football|soccer|adult|erotic|comedy|humor|conservative|noticia|notícia|новости/;
export function musicOnly(tags: string[]): boolean {
  return tags.some(tg => MUSIC.test(tg)) && !tags.some(tg => NOT_MUSIC.test(tg));
}

function genres(tags: string[]): string[] {
  if (lang() !== 'zh') return tags;
  const out: string[] = [];
  for (const tg of tags) { const g = GENRE_ZH.find(([re]) => re.test(tg))?.[1]; if (g && !out.includes(g)) out.push(g); }
  return out;
}

interface Station { name: string; cc: string; lat: number; lon: number; url: string; hls: boolean; approx: boolean; codec: string; kbps: number; tags: string[] }
type Row = [string, string, number, number, string, number, string, number, number[]];

const FAV_KEY = 'radio.fav';
const VOL_KEY = 'radio.vol';
const LAST_KEY = 'radio.last';
const OK_KEY = 'radio.ok';
const HIDE_KEY = 'radio.hidden';
const D2R = Math.PI / 180;


function angle(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const s = Math.sin(((bLat - aLat) * D2R) / 2) ** 2 + Math.cos(aLat * D2R) * Math.cos(bLat * D2R) * Math.sin(((bLon - aLon) * D2R) / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}

export class Radio {
  readonly el: HTMLDivElement;
  private tip = h('div', { class: 'globe-tip radio-tip hidden', 'aria-hidden': 'true' });
  private nameEl = h('strong', { class: 'radio-name' });
  private subEl = h('span', { class: 'radio-sub' });
  private eq = h('div', { class: 'radio-eq', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'));
  private playBtn: HTMLButtonElement;
  private favBtn: HTMLButtonElement;
  private dots: StationDots;
  private engine = new RadioEngine();
  private cur = -1;
  private history: number[] = [];
  private favs: Set<string>;
  private on = false;
  private parked = false;
  private wasPlaying = false;
  private raf = 0;
  private countries: number;
  private hidden: Set<string>;
  private pool: number[];

  constructor(private globe: Globe, private st: Station[], private snapshot = '') {
    this.favs = new Set(load<string[]>(FAV_KEY, []));
    this.hidden = new Set(load<string[]>(HIDE_KEY, []));
    this.pool = st.flatMap((s, i) => musicOnly(s.tags) ? [i] : []);
    this.countries = new Set(st.map(s => s.cc)).size;
    this.dots = new StationDots(Float32Array.from(st, s => s.lat), Float32Array.from(st, s => s.lon));
    this.dots.setFavourites(i => this.favs.has(st[i].url));
    this.engine.setVolume(load<number>(VOL_KEY, 0.8));
    const btn = (cls: string, ico: Parameters<typeof icon>[0], key: string, fn: () => void, test?: string) =>
      h('button', { class: 'radio-btn ' + cls, 'aria-label': t(key), title: t(key), 'data-key': key, 'data-testid': test, html: icon(ico, 18), onclick: () => { fn(); } });
    this.playBtn = btn('radio-play', 'play', 'radioPlay', () => this.togglePlay(), 'radio-play');
    this.favBtn = btn('radio-fav', 'star', 'radioFav', () => this.toggleFav());
    const vol = h('input', { type: 'range', class: 'radio-vol', min: '0', max: '1', step: '0.05', value: String(this.engine.volume), 'aria-label': t('radioVolume'), title: t('radioVolume') });
    vol.addEventListener('input', () => { this.engine.setVolume(Number(vol.value)); save(VOL_KEY, this.engine.volume); });
    this.el = h('div', { class: 'radio-bar hidden', 'data-testid': 'radio-bar', role: 'group', 'aria-label': t('radio') },
      this.eq,
      h('div', { class: 'radio-meta', 'aria-live': 'polite' }, this.nameEl, this.subEl),
      h('div', { class: 'radio-ctl' },
        this.favBtn, this.playBtn,
        btn('radio-next', 'skip', 'radioNext', () => this.step(), 'radio-next'),
        btn('radio-rand', 'shuffle', 'radioRandom', () => this.random()),
        btn('radio-hide', 'flag', 'radioHide', () => this.hideCurrent(), 'radio-hide'),
        vol,
        btn('radio-x', 'close', 'radioClose', () => this.toggle(false))));
    this.engine.onStatus = s => this.status(s);
    const last = load<string>(LAST_KEY, '');
    this.cur = last ? st.findIndex(s => s.url === last) : -1;
    onLang(() => this.relabel());
    this.render();
  }

  get active(): boolean { return this.on; }

  toggle(want = !this.on): void {
    if (want === this.on) return;
    this.on = want;
    this.el.classList.toggle('hidden', !want);
    document.body.classList.toggle('radio-on', want);
    if (want) {
      this.globe.setStations(this.dots);
      this.globe.ev.onStation = i => { sfx.tap(); void this.tune(i); };
      this.globe.ev.onStationHover = (i, scr) => this.hover(i, scr);
      this.loop();
    } else {
      this.engine.stop();
      this.globe.setStations(null);
      this.globe.ev.onStation = this.globe.ev.onStationHover = undefined;
      this.hover(-1, null);
      cancelAnimationFrame(this.raf);
    }
    this.render();
  }

  /** Leaving the Earth (Solar System, sky theatre): stop the sound; pick it up again on the way back. */
  suspend(away: boolean): void {
    if (away === this.parked) return;
    this.parked = away;
    if (away) {
      this.wasPlaying = this.busy();
      if (this.wasPlaying) this.engine.stop();
    } else if (this.wasPlaying && this.on && this.cur >= 0) {
      this.wasPlaying = false;
      void this.tune(this.cur);
    }
  }

  /** Live radio is other people's content: ask once before the first stream (declining makes no request). */
  private consent(): Promise<boolean> {
    if (load<boolean>(OK_KEY, false)) return Promise.resolve(true);
    return new Promise(res => {
      let done = false;
      const answer = (ok: boolean) => { if (done) return; done = true; if (ok) save(OK_KEY, true); closeModal('radio-consent'); res(ok); };
      openModal('radio-consent', t('radioAskT'), h('div', { class: 'radio-ask' },
        h('p', {}, t('radioAsk1')), h('p', { class: 'muted' }, t('radioAsk2')),
        h('div', { class: 'row' },
          h('button', { class: 'cta', 'data-testid': 'radio-ok', onclick: () => answer(true) }, t('radioAskYes')),
          h('button', { class: 'pill', 'data-testid': 'radio-no', onclick: () => answer(false) }, t('radioAskNo')))),
      { onClose: () => answer(false) });
    });
  }

  private async tune(i: number, auto = 0): Promise<void> {
    if (i < 0 || i >= this.st.length) return;
    if (!(await this.consent())) { this.render(); return; }
    this.cur = i;
    this.history = [i, ...this.history.filter(x => x !== i)].slice(0, 16);
    save(LAST_KEY, this.st[i].url);
    this.dots.playing = i;
    const p = latLonToVec(this.st[i].lat, this.st[i].lon);
    this.globe.beacon = new THREE.Vector3(...p);
    this.globe.markDirty();
    this.render();
    const ok = await this.engine.play(this.st[i].url, this.st[i].hls);
    if (ok || this.cur !== i || this.engine.status !== 'error') return;
    if (auto < 2) {
      toast(t('radioOff'), 1800);
      void this.tune(this.nearest(i), auto + 1);
    } else toast(t('radioFail'));
  }

  private togglePlay(): void {
    sfx.tap();
    if (this.busy()) { this.engine.stop(); return; }
    void this.tune(this.cur >= 0 ? this.cur : this.nearestTo(this.globe.lat, this.globe.lon));
  }

  private step(): void {
    sfx.tap();
    const i = this.cur >= 0 ? this.nearest(this.cur) : this.nearestTo(this.globe.lat, this.globe.lon);
    this.fly(i, false);
    void this.tune(i);
  }

  private random(): void {
    sfx.tap();
    const pool = this.pool.filter(k => !this.hidden.has(this.st[k].url));
    const from = pool.length ? pool : this.st.map((_, k) => k);
    let i = 0;
    for (let k = 0; k < 8; k++) { i = from[Math.floor(Math.random() * from.length)]; if (!this.history.includes(i)) break; }
    this.fly(i, true);
    void this.tune(i);
  }

  /** “Not for me”: stop it, hide it on this device and move on to a station nearby. Nothing is sent anywhere. */
  private hideCurrent(): void {
    if (this.cur < 0) return;
    sfx.tap();
    const u = this.st[this.cur].url;
    this.hidden.add(u); this.favs.delete(u);
    save(HIDE_KEY, [...this.hidden]); save(FAV_KEY, [...this.favs]);
    this.engine.stop();
    toast(t('radioHidden'));
    this.step();
  }

  private toggleFav(): void {
    if (this.cur < 0) return;
    sfx.pop();
    const u = this.st[this.cur].url;
    if (this.favs.has(u)) this.favs.delete(u); else this.favs.add(u);
    save(FAV_KEY, [...this.favs]);
    this.dots.setFavourites(i => this.favs.has(this.st[i].url));
    this.render();
  }

  private fly(i: number, far: boolean): void {
    const s = this.st[i];
    this.globe.flyTo(s.lat, s.lon, far ? Math.max(this.globe.h, DEFAULT_H * 0.8) : this.globe.h, far ? 1600 : 900);
  }

  /** The nearest station to station i that hasn't played lately. */
  private nearest(i: number): number {
    return this.nearestTo(this.st[i].lat, this.st[i].lon, new Set(this.history));
  }

  private nearestTo(lat: number, lon: number, skip = new Set<number>()): number {
    let best = 0, bd = Infinity;
    for (let k = 0; k < this.st.length; k++) {
      if (skip.has(k) || this.hidden.has(this.st[k].url)) continue;
      const d = angle(lat, lon, this.st[k].lat, this.st[k].lon);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  private hover(i: number, scr: { x: number; y: number } | null): void {
    if (i < 0 || !scr) { this.tip.classList.add('hidden'); return; }
    const s = this.st[i];
    this.tip.replaceChildren(h('span', { class: 'tip-emoji' }, '📻'),
      h('span', { class: 'tip-name' }, s.name), h('span', { class: 'tip-sub' }, [countryName(s.cc), ...genres(s.tags).slice(0, 1), s.approx ? t('radioApprox') : ''].filter(Boolean).join(' · ')));
    this.tip.style.transform = `translate(${scr.x.toFixed(1)}px, ${(scr.y - 14).toFixed(1)}px) translate(-50%, -100%)`;
    this.tip.classList.remove('hidden');
  }

  /** Sound is on its way or playing (connecting, playing, catching up). */
  private busy(): boolean { const s = this.engine.status; return s === 'playing' || s === 'connecting' || s === 'buffering'; }

  private status(s: RadioStatus): void {
    music.duck(this.busy());
    if (s === 'error' && this.engine.dropped && !this.parked) toast(t('radioDropped'));
    if (!this.busy() && !this.parked) { this.dots.playing = -1; this.globe.beacon = null; }
    else if (this.cur >= 0) this.dots.playing = this.cur;
    this.globe.markDirty();
    this.render();
  }

  private render(): void {
    const s = this.engine.status, st = this.cur >= 0 ? this.st[this.cur] : null;
    this.el.dataset.state = s;
    const busy = this.busy();
    this.eq.title = s === 'playing' && !this.engine.analysed ? t('radioBeat') : '';
    this.playBtn.innerHTML = icon(busy ? 'pause' : 'play', 18);
    this.playBtn.setAttribute('aria-label', t(busy ? 'radioPause' : 'radioPlay'));
    this.playBtn.title = t(busy ? 'radioPause' : 'radioPlay');
    this.favBtn.disabled = !st;
    (this.el.querySelector('.radio-hide') as HTMLButtonElement).disabled = !st;
    const fav = !!st && this.favs.has(st.url);
    this.favBtn.classList.toggle('on', fav);
    this.favBtn.setAttribute('aria-pressed', String(fav));
    this.favBtn.title = t(fav ? 'radioUnfav' : 'radioFav');
    if (!st) {
      this.nameEl.textContent = t('radioHint');
      this.subEl.textContent = t('radioCount', { n: fmtNum(this.st.length), c: fmtNum(this.countries) }) + (this.snapshot ? ' · ' + t('radioAsOf', { d: this.snapshot }) : '');
      return;
    }
    this.nameEl.textContent = st.name;
    if (s === 'connecting') { this.subEl.textContent = t('radioTuning'); return; }
    if (s === 'buffering') { this.subEl.textContent = t('radioBuffering'); return; }
    const bits = [countryName(st.cc), ...genres(st.tags).slice(0, 2)];
    if (st.kbps) bits.push(`${st.kbps} kbps`);
    if (st.approx) bits.push(t('radioApprox'));
    this.subEl.replaceChildren(s === 'playing' ? h('em', { class: 'radio-live' }, t('radioLive')) : '', h('b', { class: 'radio-cc' }, st.cc), bits.join(' · '));
  }

  private relabel(): void {
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('button[data-key]')) {
      const k = b.dataset.key!;
      b.setAttribute('aria-label', t(k)); b.title = t(k);
    }
    this.el.setAttribute('aria-label', t('radio'));
    this.render();
  }

  private loop = (): void => {
    if (!this.on) return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.parked) return;
    const [b, m, hi] = this.engine.levels(performance.now() / 1000);
    this.globe.setAudio(b, m, hi);
    const bars = this.eq.children;
    const v = [b, m, (m + hi) / 2, hi];
    for (let k = 0; k < 4; k++) (bars[k] as HTMLElement).style.transform = `scaleY(${(0.18 + v[k] * 0.82).toFixed(3)})`;
  };

  mount(root: HTMLElement): void { root.append(this.el, this.tip); }
}

let inst: Promise<Radio> | null = null;

/** Loads the station list once and builds the radio. */
export function getRadio(globe: Globe, root: HTMLElement): Promise<Radio> {
  return inst ??= fetch(url('data/radio/stations.json')).then(r => {
    if (!r.ok) throw new Error(`stations: HTTP ${r.status}`);
    return r.json() as Promise<{ tags: string[]; s: Row[]; at?: string }>;
  }).then(d => {
    const st: Station[] = d.s.map(([name, cc, lat, lon, u, f, codec, kbps, tg]) => ({
      name, cc, lat, lon, url: u, hls: !!(f & 1), approx: !!(f & 2), codec, kbps, tags: tg.map(i => d.tags[i]),
    }));
    const r = new Radio(globe, st, d.at ?? '');
    r.mount(root);
    return r;
  }).catch((e: unknown) => { inst = null; throw e; });
}
