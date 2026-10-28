/**
 * Live radio playback. Tries the stream with CORS first so it can run through WebAudio (levels for the
 * audio-reactive globe); if the station doesn't allow that, plays it as a plain <audio> element instead.
 * HLS streams use the browser's own player where there is one, else hls.js (loaded on demand).
 * While a station connects, soft tuning static plays.
 */
import { audioCtx } from './sfx.ts';

/** `buffering` = was playing, the stream is catching up; `error` after `playing` means the station dropped (see `dropped`). */
export type RadioStatus = 'idle' | 'connecting' | 'playing' | 'buffering' | 'error';

const CORS_WAIT = 8500;
const PLAIN_WAIT = 12000;
/** A stream stuck this long while playing is reconnected; this many times before giving up. */
const STALL_WAIT = 15000;
const RECONNECTS = 2;

type HlsLike = { destroy(): void; loadSource(u: string): void; attachMedia(m: HTMLMediaElement): void; on(ev: string, fn: (e: unknown, d: { fatal?: boolean }) => void): void };

export class RadioEngine {
  status: RadioStatus = 'idle';
  /** True when levels come from the real signal (CORS stream through WebAudio). */
  analysed = false;
  /** The last `error` came from a station that had been playing and then dropped out. */
  dropped = false;
  onStatus: (s: RadioStatus) => void = () => {};
  private el: HTMLAudioElement | null = null;
  private node: MediaElementAudioSourceNode | null = null;
  private hls: HlsLike | null = null;
  private analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  private bins: Uint8Array<ArrayBuffer> | null = null;
  private token = 0;
  private vol = 0.8;
  private hiss: { src: AudioBufferSourceNode; g: GainNode } | null = null;
  private smooth = [0, 0, 0];
  private stall = 0;

  get volume(): number { return this.vol; }
  setVolume(v: number): void {
    this.vol = Math.max(0, Math.min(1, v));
    const a = audioCtx();
    if (this.gain && a) this.gain.gain.setTargetAtTime(this.vol, a.currentTime, 0.02);
    if (this.el && !this.node) this.el.volume = this.vol;
    if (this.hiss && a) this.hiss.g.gain.setTargetAtTime(this.vol * 0.05, a.currentTime, 0.05);
  }

  /** Tunes in. Resolves true once audio is actually playing, false on failure or if another tune() took over. */
  play(url: string, hls: boolean): Promise<boolean> {
    return this.connect(++this.token, url, hls, 0);
  }

  private async connect(my: number, url: string, hls: boolean, retry: number): Promise<boolean> {
    this.teardown();
    this.dropped = false;
    this.set('connecting');
    this.startHiss();
    const isHls = hls || /\.m3u8(\?|$)/i.test(url);
    let ok = await this.attempt(my, url, isHls, true);
    // hls.js needs CORS anyway; for plain streams, retry without it
    if (!ok && my === this.token && !(isHls && !this.nativeHls())) ok = await this.attempt(my, url, isHls, false);
    if (my !== this.token) return false;
    this.stopHiss();
    if (!ok) { this.teardown(); this.dropped = retry > 0; this.set('error'); return false; }
    this.set('playing');
    this.watch(my, url, hls, retry);
    return true;
  }

  /** Keeps following a stream after it started: buffering, stalls, drop-outs and the end of the stream. */
  private watch(my: number, url: string, hls: boolean, retry: number): void {
    const el = this.el;
    if (!el) return;
    const live = () => my === this.token && this.el === el;
    const clear = () => { window.clearTimeout(this.stall); this.stall = 0; };
    const drop = () => {
      if (!live()) return;
      clear();
      // the user stopping (token bump) always wins over a pending reconnect
      if (retry < RECONNECTS) void this.connect(my, url, hls, retry + 1);
      else { this.teardown(); this.dropped = true; this.set('error'); }
    };
    const wait = () => {
      if (!live() || this.status !== 'playing') return;
      this.set('buffering');
      clear();
      this.stall = window.setTimeout(drop, STALL_WAIT);
    };
    const resume = () => { if (!live()) return; clear(); this.set('playing'); };
    el.addEventListener('waiting', wait);
    el.addEventListener('stalled', wait);
    el.addEventListener('playing', resume);
    el.addEventListener('error', drop);
    el.addEventListener('ended', drop);
    // the browser paused it by itself (another app took the audio, a headset was unplugged…)
    el.addEventListener('pause', () => { if (live() && this.status !== 'idle') { clear(); this.set('buffering'); this.stall = window.setTimeout(drop, STALL_WAIT); } });
  }

  stop(): void {
    this.token++;
    window.clearTimeout(this.stall);
    this.dropped = false;
    this.stopHiss();
    this.teardown();
    this.set('idle');
  }

  /** Bass / mid / treble, 0..1, smoothed. Without a real signal, a gentle made-up pulse while playing. */
  levels(t: number): [number, number, number] {
    let b = 0, m = 0, h = 0;
    if (this.status === 'playing' || this.status === 'buffering') {
      if (this.analyser && this.bins) {
        this.analyser.getByteFrequencyData(this.bins);
        const avg = (lo: number, hi: number) => { let s = 0; for (let i = lo; i < hi; i++) s += this.bins![i]; return s / ((hi - lo) * 255); };
        b = Math.min(1, avg(1, 8) * 1.3); m = Math.min(1, avg(8, 60) * 1.6); h = Math.min(1, avg(60, 200) * 2.2);
      } else {
        b = 0.35 + 0.25 * Math.max(0, Math.sin(t * 7.5)) ** 4; m = 0.3 + 0.1 * Math.sin(t * 2.3); h = 0.2 + 0.08 * Math.sin(t * 5.1);
      }
    }
    const s = this.smooth, k = 0.25;
    s[0] += (b - s[0]) * k; s[1] += (m - s[1]) * k; s[2] += (h - s[2]) * k;
    return [s[0], s[1], s[2]];
  }

  private set(s: RadioStatus): void {
    if (s === this.status) return;
    this.status = s;
    this.onStatus(s);
  }

  private nativeHls(): boolean {
    return !!document.createElement('audio').canPlayType('application/vnd.apple.mpegurl');
  }

  private attempt(my: number, url: string, isHls: boolean, cors: boolean): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      this.teardown();
      const el = new Audio();
      el.preload = 'none';
      if (cors) el.crossOrigin = 'anonymous';
      this.el = el;
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        el.removeEventListener('playing', onPlay); el.removeEventListener('error', onErr);
        resolve(ok && my === this.token);
      };
      const onPlay = () => finish(true);
      const onErr = () => finish(false);
      const timer = window.setTimeout(() => finish(false), cors ? CORS_WAIT : PLAIN_WAIT);
      el.addEventListener('playing', onPlay); el.addEventListener('error', onErr);
      const a = cors ? audioCtx() : null;
      if (a) {
        try {
          this.node = a.createMediaElementSource(el);
          this.analyser = a.createAnalyser();
          this.analyser.fftSize = 512; this.analyser.smoothingTimeConstant = 0.7;
          this.bins = new Uint8Array(this.analyser.frequencyBinCount);
          this.gain = a.createGain(); this.gain.gain.value = this.vol;
          this.node.connect(this.analyser).connect(this.gain).connect(a.destination);
        } catch { this.node = null; }
      }
      if (!this.node) el.volume = this.vol;
      this.analysed = !!this.node;
      const start = () => { if (my === this.token && !done) el.play().catch(() => finish(false)); };
      if (isHls && !this.nativeHls()) {
        void import('hls.js/light').then(({ default: Hls }) => {
          if (my !== this.token || done) return;
          if (!Hls.isSupported()) { finish(false); return; }
          const hls = new Hls({ lowLatencyMode: false, backBufferLength: 30 }) as unknown as HlsLike;
          this.hls = hls;
          hls.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) finish(false); });
          hls.attachMedia(el);
          hls.loadSource(url);
          start();
        }, () => finish(false));
      } else {
        el.src = url;
        start();
      }
    });
  }

  private teardown(): void {
    window.clearTimeout(this.stall);
    this.hls?.destroy();
    this.hls = null;
    if (this.el) {
      this.el.pause();
      this.el.removeAttribute('src');
      try { this.el.load(); } catch { /* already gone */ }
    }
    this.el = null;
    try { this.node?.disconnect(); this.gain?.disconnect(); } catch { /* fine */ }
    this.node = null; this.analyser = null; this.gain = null; this.bins = null;
    this.analysed = false;
  }

  private startHiss(): void {
    this.stopHiss();
    const a = audioCtx();
    if (!a || this.vol <= 0) return;
    const n = a.sampleRate * 2, buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), wob = a.createOscillator(), wg = a.createGain();
    src.buffer = buf; src.loop = true;
    f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.9;
    // the band sweeps a little, like turning a dial
    wob.frequency.value = 0.7; wg.gain.value = 500; wob.connect(wg).connect(f.frequency); wob.start();
    g.gain.setValueAtTime(0, a.currentTime); g.gain.linearRampToValueAtTime(this.vol * 0.05, a.currentTime + 0.1);
    src.connect(f).connect(g).connect(a.destination);
    src.start();
    src.onended = () => wob.stop();
    this.hiss = { src, g };
  }

  private stopHiss(): void {
    const h = this.hiss, a = audioCtx();
    this.hiss = null;
    if (!h || !a) return;
    h.g.gain.setTargetAtTime(0, a.currentTime, 0.04);
    window.setTimeout(() => { try { h.src.stop(); h.src.disconnect(); } catch { /* stopped */ } }, 200);
  }
}
