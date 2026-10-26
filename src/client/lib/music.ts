/**
 * Background music: a small generative ambient engine (WebAudio only, no files).
 * Each level of the app has its own mood: key, mode, chord loop, pace and timbre.
 * Moving between levels crossfades from one mood to the next. The radio ducks it.
 */
import { audioAllowed, audioCtx } from './sfx.ts';

type MusicLevel = 'earth' | 'sky' | 'solar' | 'galaxy' | 'group' | 'laniakea' | 'universe';

interface Mood {
  /** Tonic (Hz). */
  root: number;
  /** Melody scale (semitones in one octave). */
  scale: number[];
  /** Chord loop, in semitones from the tonic. */
  chords: number[][];
  /** Seconds per chord. */
  bar: number;
  pad: { type: OscillatorType; cut: number; vol: number; detune: number };
  /** Drone an octave under each chord (volume, 0 = none). */
  bass: number;
  /** Plucked melody: notes per bar, octave offset, decay (s), attack (s). */
  lead: { type: OscillatorType; vol: number; per: number; oct: number; decay: number; attack: number } | null;
  /** Chance per quarter-bar of a high bell. */
  bells: number;
  /** Reverb and echo sends. */
  verb: number;
  echo: number;
}

const MOODS: Record<MusicLevel, Mood> = {
  // home: warm, playful D major pentatonic on marimba-like plucks
  earth: {
    root: 146.83, scale: [0, 2, 4, 7, 9], bar: 4,
    chords: [[0, 7, 11, 16], [-3, 4, 7, 12], [5, 9, 12, 16], [7, 12, 14, 19]],
    pad: { type: 'triangle', cut: 1500, vol: 0.05, detune: 6 }, bass: 0.05,
    lead: { type: 'sine', vol: 0.07, per: 6, oct: 12, decay: 0.9, attack: 0.004 }, bells: 0.04, verb: 0.3, echo: 0.22,
  },
  // night watch: a G major music box
  sky: {
    root: 196, scale: [0, 2, 4, 7, 9], bar: 5,
    chords: [[0, 7, 14, 16], [-3, 4, 9, 12], [-7, 0, 5, 9], [-5, 2, 7, 11]],
    pad: { type: 'sine', cut: 1200, vol: 0.05, detune: 4 }, bass: 0.035,
    lead: { type: 'triangle', vol: 0.045, per: 4, oct: 24, decay: 1.8, attack: 0.003 }, bells: 0.1, verb: 0.45, echo: 0.3,
  },
  // the Solar System: bright C lydian shimmer
  solar: {
    root: 130.81, scale: [0, 2, 4, 6, 7, 9, 11], bar: 6,
    chords: [[0, 7, 11, 18], [2, 9, 14, 18], [4, 11, 16, 19], [-1, 6, 9, 14]],
    pad: { type: 'sawtooth', cut: 950, vol: 0.035, detune: 9 }, bass: 0.045,
    lead: { type: 'sine', vol: 0.05, per: 6, oct: 12, decay: 1.3, attack: 0.01 }, bells: 0.14, verb: 0.5, echo: 0.35,
  },
  // the Milky Way: A dorian, slow and deep
  galaxy: {
    root: 110, scale: [0, 2, 3, 5, 7, 9, 10], bar: 8,
    chords: [[0, 7, 10, 14, 15], [5, 9, 12, 15, 19], [-4, 3, 7, 12], [-2, 5, 9, 14]],
    pad: { type: 'sawtooth', cut: 720, vol: 0.032, detune: 12 }, bass: 0.055,
    lead: { type: 'sine', vol: 0.045, per: 3, oct: 12, decay: 3, attack: 0.05 }, bells: 0.18, verb: 0.62, echo: 0.4,
  },
  // the Local Group: E minor swells
  group: {
    root: 82.41, scale: [0, 2, 3, 7, 8, 10], bar: 10,
    chords: [[0, 7, 14, 15, 19], [-4, 3, 7, 11, 14], [3, 10, 14, 19], [-2, 5, 10, 14]],
    pad: { type: 'triangle', cut: 620, vol: 0.055, detune: 10 }, bass: 0.06,
    lead: { type: 'sine', vol: 0.04, per: 2, oct: 24, decay: 5, attack: 1.2 }, bells: 0.1, verb: 0.7, echo: 0.35,
  },
  // Laniakea: vast F lydian, no melody, distant bells
  laniakea: {
    root: 87.31, scale: [0, 2, 4, 6, 7, 9, 11], bar: 12,
    chords: [[0, 7, 16, 19, 26], [2, 9, 14, 18, 25], [-5, 4, 11, 14, 19]],
    pad: { type: 'sawtooth', cut: 520, vol: 0.03, detune: 14 }, bass: 0.055,
    lead: null, bells: 0.22, verb: 0.78, echo: 0.45,
  },
  // the whole universe: a low B♭ sus drone and rare far-off chimes
  universe: {
    root: 58.27, scale: [0, 2, 5, 7, 10], bar: 14,
    chords: [[0, 7, 14, 17, 24], [0, 5, 10, 14, 19], [-2, 5, 12, 17, 22]],
    pad: { type: 'triangle', cut: 430, vol: 0.06, detune: 16 }, bass: 0.07,
    lead: null, bells: 0.08, verb: 0.82, echo: 0.5,
  },
};

const FADE = 4;
const LOOKAHEAD = 1.2;
const VOLUME = 0.85;
/** Per-mood loudness trim (dB), measured so every level sits near -21 dBFS RMS. */
const TRIM: Record<MusicLevel, number> = { earth: 8.5, sky: 6, solar: 10, galaxy: 8, group: 4, laniakea: 8.5, universe: 3 };

const hz = (root: number, semi: number) => root * Math.pow(2, semi / 12);

/** One mood playing into its own bus (so two can crossfade). */
class Player {
  readonly bus: GainNode;
  private timer = 0;
  private next: number;
  private ix = 0;
  private deg = 0;

  constructor(private a: AudioContext, readonly level: MusicLevel, private out: { dry: AudioNode; verb: AudioNode; echo: AudioNode }) {
    const m = MOODS[level];
    this.bus = a.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(out.dry);
    const vs = a.createGain(); vs.gain.value = m.verb; this.bus.connect(vs).connect(out.verb);
    this.next = a.currentTime + 0.1;
    this.bus.gain.setTargetAtTime(Math.pow(10, TRIM[level] / 20), a.currentTime, FADE / 3);
    this.tick();
    this.timer = window.setInterval(() => this.tick(), 300);
  }

  stop(): void {
    const t = this.a.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(this.bus.gain.value, t);
    this.bus.gain.setTargetAtTime(0, t, FADE / 4);
    window.clearInterval(this.timer);
    window.setTimeout(() => this.bus.disconnect(), (FADE + 8) * 1000);
  }

  private tick(): void {
    while (this.next < this.a.currentTime + LOOKAHEAD) {
      this.bar(this.next);
      this.next += MOODS[this.level].bar;
    }
  }

  private bar(t: number): void {
    const a = this.a, m = MOODS[this.level], chord = m.chords[this.ix++ % m.chords.length];
    // pad: two detuned oscillators per chord tone, a filter that opens through the bar, long overlapping tails
    const n = chord.length;
    for (const semi of chord) {
      const f = a.createBiquadFilter(), g = a.createGain();
      f.type = 'lowpass'; f.Q.value = 0.7;
      f.frequency.setValueAtTime(m.pad.cut * 0.55, t);
      f.frequency.linearRampToValueAtTime(m.pad.cut, t + m.bar * 0.6);
      f.frequency.linearRampToValueAtTime(m.pad.cut * 0.7, t + m.bar * 1.5);
      const v = m.pad.vol / Math.sqrt(n);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + m.bar * 0.4);
      g.gain.setValueAtTime(v, t + m.bar * 0.9);
      g.gain.linearRampToValueAtTime(0, t + m.bar * 1.55);
      f.connect(g).connect(this.bus);
      for (const d of [-m.pad.detune, m.pad.detune]) {
        const o = a.createOscillator();
        o.type = m.pad.type; o.frequency.value = hz(m.root, semi); o.detune.value = d;
        o.connect(f); o.start(t); o.stop(t + m.bar * 1.6);
      }
    }
    // drone under the chord
    if (m.bass) {
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine'; o.frequency.value = hz(m.root, Math.min(...chord) - 12);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(m.bass, t + m.bar * 0.3);
      g.gain.setValueAtTime(m.bass, t + m.bar * 0.85); g.gain.linearRampToValueAtTime(0, t + m.bar * 1.3);
      o.connect(g).connect(this.bus); o.start(t); o.stop(t + m.bar * 1.35);
    }
    // melody: a gentle random walk on the scale, leaning on chord tones, with rests
    if (m.lead) {
      const L = m.lead, step = m.bar / L.per;
      for (let i = 0; i < L.per; i++) {
        if (Math.random() < 0.38) continue;
        this.deg = Math.max(-2, Math.min(m.scale.length * 2 - 1, this.deg + Math.round((Math.random() - 0.5) * 3)));
        let semi = m.scale[((this.deg % m.scale.length) + m.scale.length) % m.scale.length] + 12 * Math.floor(this.deg / m.scale.length);
        if (i === 0) semi = (((chord[1] ?? chord[0]) % 12) + 12) % 12;
        this.pluck(hz(m.root, semi + L.oct), t + i * step + (Math.random() - 0.5) * 0.04, L.decay, L.attack, L.vol, L.type);
      }
    }
    // bells: high chord tones, mostly heard through the reverb
    for (let q = 0; q < 4; q++) {
      if (Math.random() >= m.bells) continue;
      const semi = chord[Math.floor(Math.random() * chord.length)] + (Math.random() < 0.5 ? 24 : 36);
      this.pluck(hz(m.root, semi), t + (q * m.bar) / 4 + Math.random() * 0.3, 3.2, 0.004, 0.022, 'sine', true);
    }
  }

  private pluck(freq: number, t: number, decay: number, attack: number, vol: number, type: OscillatorType, bell = false): void {
    const a = this.a, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = Math.min(freq, 6000);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g);
    g.connect(this.bus);
    const es = a.createGain(); es.gain.value = MOODS[this.level].echo; g.connect(es).connect(this.out.echo);
    if (bell) {
      // a slightly inharmonic partial makes it ring like a bell
      const o2 = a.createOscillator(), g2 = a.createGain();
      o2.frequency.value = Math.min(freq * 2.76, 9000);
      g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(vol * 0.35, t + attack); g2.gain.exponentialRampToValueAtTime(0.0001, t + decay * 0.4);
      o2.connect(g2).connect(this.bus); o2.start(t); o2.stop(t + decay * 0.45);
    }
    o.start(t); o.stop(t + attack + decay + 0.05);
  }
}

function impulse(a: AudioContext, secs: number): AudioBuffer {
  const n = Math.floor(a.sampleRate * secs), b = a.createBuffer(2, n, a.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2);
  }
  return b;
}

let on = false;
let level: MusicLevel = 'earth';
let ducked = false;
let player: Player | null = null;
let graph: { a: AudioContext; master: GainNode; duck: GainNode; dry: AudioNode; verb: AudioNode; echo: AudioNode } | null = null;
let unlockArmed = false;

function build(): typeof graph {
  const a = audioCtx();
  if (!a) return null;
  if (graph?.a === a) return graph;
  const master = a.createGain(), duck = a.createGain();
  master.gain.value = 0;
  duck.gain.value = ducked ? 0 : 1;
  duck.connect(master).connect(a.destination);
  // shared space: a 4.5 s reverb and a dotted echo
  const conv = a.createConvolver(); conv.buffer = impulse(a, 4.5);
  const wet = a.createGain(); wet.gain.value = 0.9;
  conv.connect(wet).connect(duck);
  const delay = a.createDelay(2), fb = a.createGain(), lp = a.createBiquadFilter();
  delay.delayTime.value = 0.42; fb.gain.value = 0.38; lp.type = 'lowpass'; lp.frequency.value = 2400;
  delay.connect(lp).connect(fb).connect(delay);
  lp.connect(duck); lp.connect(conv);
  graph = { a, master, duck, dry: duck, verb: conv, echo: delay };
  document.addEventListener('visibilitychange', () => {
    if (!graph) return;
    if (document.hidden) void graph.a.suspend();
    else if (on) void graph.a.resume();
  });
  return graph;
}

/** Browsers start audio only after a gesture: build or resume on the first one. */
const UNLOCK = ['pointerdown', 'pointerup', 'keydown', 'click'] as const;
function armUnlock(): void {
  if (unlockArmed) return;
  unlockArmed = true;
  const go = () => {
    // a touch's pointerdown does not count as a gesture yet; its pointerup does
    if (!audioAllowed()) return;
    for (const e of UNLOCK) removeEventListener(e, go, true);
    unlockArmed = false;
    if (!on) return;
    if (graph && graph.a.state === 'suspended') void graph.a.resume(); else sync();
  };
  for (const e of UNLOCK) addEventListener(e, go, true);
}

function sync(): void {
  if (!on) {
    if (graph) {
      const g = graph.master.gain, t = graph.a.currentTime;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(0, t, 0.5);
      // the old player always stops after the fade; turning music back on starts a fresh one
      const p = player;
      player = null;
      if (p) window.setTimeout(() => p.stop(), 1500);
    }
    return;
  }
  const gr = build();
  if (!gr) { if (typeof AudioContext !== 'undefined') armUnlock(); return; }
  if (gr.a.state === 'suspended') armUnlock();
  const g = gr.master.gain, t = gr.a.currentTime;
  g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(VOLUME, t, 0.8);
  if (player?.level === level) return;
  player?.stop();
  player = new Player(gr.a, level, gr);
}

export const music = {
  /** The `bgm` setting. */
  setOn(v: boolean): void { if (v === on) return; on = v; sync(); },
  /** Where the user is: each level has its own mood. */
  setLevel(l: MusicLevel): void { if (l === level) return; level = l; if (on) sync(); },
  /** Something else is playing (the radio): fade the music right out, and back after. */
  duck(v: boolean): void {
    ducked = v;
    if (!graph) return;
    const g = graph.duck.gain, t = graph.a.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(v ? 0 : 1, t, v ? 0.25 : 1.2);
  },
  get level(): MusicLevel { return level; },
  get on(): boolean { return on; },
};
