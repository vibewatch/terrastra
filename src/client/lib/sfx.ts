// Tiny WebAudio synth: no audio files needed.
let ctx: AudioContext | null = null;
let enabled = true;

/** The one shared AudioContext (sound effects, music and radio static). */
export function audioCtx(): AudioContext | null { return ac(); }

/** Browsers refuse to start audio before the first gesture (and warn on every try). */
export function audioAllowed(): boolean { return navigator.userActivation?.hasBeenActive ?? true; }

function ac(): AudioContext | null {
  if (typeof AudioContext === 'undefined' || !audioAllowed()) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended' && !document.hidden) void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.08, when = 0): void {
  const a = ac(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = freq;
  const t = a.currentTime + when;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}

/** Shaped oscillator: frequency follows a list of [time, Hz] points, optional vibrato and lowpass. */
function voice(o: { pts: [number, number][]; dur: number; type?: OscillatorType; vol?: number; when?: number; vib?: [rate: number, depth: number]; lp?: number; attack?: number }): void {
  const a = ac(); if (!a) return;
  const t = a.currentTime + (o.when ?? 0);
  const osc = a.createOscillator(), g = a.createGain();
  osc.type = o.type ?? 'sawtooth';
  osc.frequency.setValueAtTime(o.pts[0][1], t);
  for (const [dt, f] of o.pts.slice(1)) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f), t + dt);
  let node: AudioNode = osc;
  if (o.vib) {
    const lfo = a.createOscillator(), lg = a.createGain();
    lfo.frequency.value = o.vib[0]; lg.gain.value = o.vib[1];
    lfo.connect(lg).connect(osc.frequency); lfo.start(t); lfo.stop(t + o.dur + 0.05);
  }
  if (o.lp) { const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
  const vol = o.vol ?? 0.1;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + (o.attack ?? 0.03));
  g.gain.setValueAtTime(vol, t + o.dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  node.connect(g).connect(a.destination); osc.start(t); osc.stop(t + o.dur + 0.05);
}

/** Filtered noise burst (breath, growl texture, splash, wings). */
function noise(dur: number, freq: number, q = 1, vol = 0.08, when = 0, type: BiquadFilterType = 'bandpass'): void {
  const a = ac(); if (!a) return;
  const t = a.currentTime + when;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination); src.start(t);
}

type CallKind = 'roar' | 'trumpet' | 'whale' | 'chirp' | 'honk' | 'growl' | 'bleat' | 'squeak' | 'click' | 'flutter' | 'bubble' | 'bellow' | 'screech';

const CALLS: Record<CallKind, () => void> = {
  roar: () => { voice({ pts: [[0, 90], [0.25, 140], [1.1, 70]], dur: 1.2, vol: 0.14, lp: 700, vib: [28, 14] }); noise(1.1, 300, 0.8, 0.07); },
  bellow: () => { voice({ pts: [[0, 70], [0.4, 95], [1.4, 60]], dur: 1.5, vol: 0.14, lp: 400, vib: [6, 4] }); noise(1.3, 160, 0.6, 0.04); },
  trumpet: () => { voice({ pts: [[0, 380], [0.15, 620], [0.7, 560], [0.9, 420]], dur: 0.95, vol: 0.1, lp: 2400, vib: [9, 18], attack: 0.06 }); noise(0.9, 1200, 2, 0.03); },
  whale: () => { voice({ pts: [[0, 180], [0.9, 420], [1.8, 260], [2.6, 140]], dur: 2.7, type: 'sine', vol: 0.12, vib: [3, 10], attack: 0.4 }); voice({ pts: [[0, 90], [1.3, 210], [2.4, 120]], dur: 2.5, type: 'triangle', vol: 0.05, when: 0.2, attack: 0.5 }); },
  chirp: () => { for (let i = 0; i < 3; i++) voice({ pts: [[0, 2400], [0.07, 3600], [0.12, 2600]], dur: 0.14, type: 'sine', vol: 0.06, when: i * 0.16, attack: 0.005 }); },
  screech: () => { voice({ pts: [[0, 1800], [0.2, 2500], [0.7, 1400]], dur: 0.75, type: 'sawtooth', vol: 0.05, lp: 3500, vib: [40, 60] }); },
  honk: () => { for (let i = 0; i < 2; i++) voice({ pts: [[0, 330], [0.18, 300]], dur: 0.22, type: 'square', vol: 0.05, lp: 1400, when: i * 0.28 }); },
  growl: () => { voice({ pts: [[0, 75], [0.5, 95], [0.9, 65]], dur: 1.0, vol: 0.13, lp: 500, vib: [32, 10] }); noise(0.9, 220, 1, 0.06); },
  bleat: () => { voice({ pts: [[0, 420], [0.5, 380]], dur: 0.6, type: 'sawtooth', vol: 0.06, lp: 1800, vib: [14, 30] }); },
  squeak: () => { for (let i = 0; i < 2; i++) voice({ pts: [[0, 1400], [0.08, 1900]], dur: 0.12, type: 'triangle', vol: 0.06, when: i * 0.18, attack: 0.005 }); },
  click: () => { for (let i = 0; i < 8; i++) noise(0.025, 4000, 4, 0.12, i * 0.05, 'highpass'); voice({ pts: [[0, 2600], [0.4, 3800]], dur: 0.45, type: 'sine', vol: 0.04, when: 0.45 }); },
  flutter: () => { for (let i = 0; i < 6; i++) noise(0.05, 900, 1.5, 0.06, i * 0.07); },
  bubble: () => { for (let i = 0; i < 5; i++) voice({ pts: [[0, 300 + Math.random() * 300], [0.08, 900 + Math.random() * 400]], dur: 0.1, type: 'sine', vol: 0.06, when: i * 0.11, attack: 0.005 }); },
};

/** Picks a call for a creature from its catalogue key/type (null for things that don't make a sound). */
export function callFor(it: { key: string; type: string; diet?: string }): CallKind | null {
  const k = it.key;
  const rules: [RegExp, CallKind][] = [
    [/lion|tiger|jaguar|leopard|trex|spino|allosaur|carno|giganot/, 'roar'],
    [/elephant|mammoth/, 'trumpet'], [/whale|humpback|orca/, 'whale'], [/dolphin/, 'click'],
    [/eagle|ptera|pteran|archaeo|hawk/, 'screech'], [/puffin|kiwi|tern|godwit|bird|flamingo|stork|crane|swallow/, 'chirp'],
    [/penguin|goose|parasaur|lambeo/, 'honk'], [/bear|grizzly|panda|gorilla|hippo|croc|komodo|bison|raptor|velocir/, 'growl'],
    [/camel|llama|reindeer|caribou|zebra|giraffe|wildebeest|goat|sheep/, 'bleat'], [/koala|sloth|orangutan|redpanda|kangaroo|monkey|lemur/, 'squeak'],
    [/butterfl|monarch|moth|bee/, 'flutter'], [/turtle|octopus|shark|salmon|crab|fish|plesio|ichthyo|mosa/, 'bubble'],
  ];
  for (const [re, c] of rules) if (re.test(k)) return c;
  if (it.type === 'dino') return it.diet === 'carnivore' ? 'roar' : 'bellow';
  if (it.type === 'animal' || it.type === 'migration') return 'chirp';
  return null;
}

let speaking = false;
/** Says a short phrase with the browser's speech engine; returns false if speech is unavailable. */
export function speak(text: string, lang: string): boolean {
  if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return false;
  if (speaking) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang; u.rate = 0.85; u.pitch = 1.1;
  const v = speechSynthesis.getVoices().find(x => x.lang.toLowerCase() === lang.toLowerCase())
    ?? speechSynthesis.getVoices().find(x => x.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  if (v) u.voice = v;
  speaking = true; u.onend = () => (speaking = false);
  speechSynthesis.speak(u);
  return true;
}

export const sfx = {
  setEnabled(v: boolean) { enabled = v; },
  tap() { if (enabled) tone(660, 0.08, 'triangle'); },
  pop() { if (enabled) { tone(520, 0.06, 'sine'); tone(880, 0.1, 'sine', 0.06, 0.05); } },
  good() { if (enabled) [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.07, i * 0.09)); },
  bad() { if (enabled) { tone(300, 0.15, 'sawtooth', 0.04); tone(220, 0.2, 'sawtooth', 0.04, 0.12); } },
  shutter() { if (enabled) { tone(1800, 0.03, 'square', 0.03); tone(900, 0.05, 'square', 0.03, 0.04); } },
  call(kind: CallKind) { CALLS[kind](); },
  fanfare() { if (enabled) [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.07, i * 0.12)); },
};
