/**
 * On-demand narration with the browser's own speech engine: nothing leaves the device. One utterance per sentence, so
 * the on-screen text can follow along (and Chrome does not cut long utterances short).
 */
import { load, save } from './storage.ts';

export const NARRATION_RATES = [0.8, 1, 1.25] as const;
export type NarrationRate = (typeof NARRATION_RATES)[number];

export function getNarrationRate(): number {
  const v = load<number>('narrationRate', 1);
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(2, Math.max(0.5, v)) : 1;
}

export function setNarrationRate(rate: number): number {
  const clean = Number.isFinite(rate) ? Math.round(Math.min(2, Math.max(0.5, rate)) * 100) / 100 : 1;
  save('narrationRate', clean);
  return clean;
}

/** Advances through preset narration rates (`0.8×` → `1×` → `1.25×` → `0.8×`) and persists the choice. */
export function cycleNarrationRate(cur = getNarrationRate()): NarrationRate {
  const idx = NARRATION_RATES.findIndex(r => Math.abs(r - cur) < 0.05);
  const next = NARRATION_RATES[(idx + 1) % NARRATION_RATES.length];
  setNarrationRate(next);
  return next;
}

export function narrationSupported(): boolean {
  return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
}

const ABBREV_DOT_RE = /\b(?:Dr|Mr|Mrs|Ms|Prof|Mt|St|Jr|Sr|vs|etc|approx|ca|al|sp|spp|elev|lat|lon|max|avg|est|dept|ed|eds|pp|No|Fig|Vol|Ch|km|mi|ft|hr|min|sec|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|e\.g|i\.e|U\.S|U\.K|B\.C|A\.D|B\.C\.E|C\.E|Ph\.D)\./gi;
const INITIAL_DOT_RE = /(?:^|[\s(])([A-Z])\.(?=\s+[A-Z])/g;
const DOT_TOKEN = '\uE000';

/** Sentences for reading and highlighting; keeps abbreviations intact and end punctuation with each sentence. */
export function splitSentences(text: string): string[] {
  if (!text) return [];
  const shielded = text
    .replace(ABBREV_DOT_RE, m => m.replace(/\./g, DOT_TOKEN))
    .replace(INITIAL_DOT_RE, m => m.replace(/\./g, DOT_TOKEN));
  return (shielded.match(/(?:[^。！？!?.]|\.(?=\d))+(?:[。！？!?]+|\.+|$)\s*/g) ?? [])
    .map(s => s.replaceAll(DOT_TOKEN, '.').trim())
    .filter(Boolean);
}

export interface Narration { stop(): void }
let current: { stop(): void } | null = null;

export function stopNarration(): void { current?.stop(); }

function pickVoice(lang: 'en' | 'zh', code: string): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices();
  return voices.find(v => v.lang.replace('_', '-').toLowerCase() === code.toLowerCase())
    ?? voices.find(v => v.lang.toLowerCase().startsWith(lang));
}

export function narrate(
  sentences: string[],
  lang: 'en' | 'zh',
  on: { sentence: (i: number) => void; end: (finished: boolean) => void; rate?: number },
): Narration | null {
  const clean = sentences.map(s => s.trim()).filter(Boolean);
  if (!narrationSupported() || !clean.length) return null;
  stopNarration();
  const code = lang === 'zh' ? 'zh-CN' : 'en-US';
  const voice = pickVoice(lang, code);
  const mult = typeof on.rate === 'number' && Number.isFinite(on.rate) ? Math.min(2, Math.max(0.5, on.rate)) : getNarrationRate();
  const baseRate = lang === 'zh' ? 0.95 : 0.92;
  const effRate = Math.min(2, Math.max(0.5, Math.round(baseRate * mult * 100) / 100));
  let live = true;
  const finish = (finished: boolean) => { if (!live) return; live = false; if (current === me) current = null; on.end(finished); };
  const me: Narration = { stop: () => { if (!live) return; finish(false); speechSynthesis.cancel(); } };
  speechSynthesis.cancel();
  clean.forEach((s, i) => {
    const u = new SpeechSynthesisUtterance(s);
    u.lang = code; u.rate = effRate;
    if (voice) u.voice = voice;
    u.onstart = () => { if (live) on.sentence(i); };
    u.onend = () => { if (i === clean.length - 1) finish(true); };
    u.onerror = () => finish(false);
    speechSynthesis.speak(u);
  });
  current = me;
  return me;
}
