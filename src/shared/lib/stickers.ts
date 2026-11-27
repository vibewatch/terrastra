import { countOn, type Progress } from './progress.ts';
import type { I18n } from '../data/types.ts';
import { PASSPORTS, bookDone } from '../data/passports.ts';

interface StickerDef {
  id: string;
  emoji: string;
  name: I18n;
  hint: I18n;
  test: (p: Progress, totals: { animals: number; discoveries: number }) => boolean;
}

const n = (o: Record<string, number>) => Object.keys(o).length;

export const STICKERS: StickerDef[] = [
  { id: 'first_animal', emoji: '🐾', name: { en: 'First find', zh: '第一次发现' }, hint: { en: 'Collect 1 animal in the Animal Dex', zh: '在动物图鉴中收集 1 种动物' }, test: p => n(p.dex) >= 1 },
  { id: 'animals_10', emoji: '🦁', name: { en: 'Safari scout', zh: '草原侦察员' }, hint: { en: 'Collect 10 animals', zh: '在动物图鉴中收集 10 种动物' }, test: p => n(p.dex) >= 10 },
  { id: 'animals_all', emoji: '🏆', name: { en: 'Animal expert', zh: '动物专家' }, hint: { en: 'Collect every animal on Earth', zh: '集齐全部动物图鉴' }, test: (p, t) => n(p.dex) >= t.animals },
  { id: 'first_log', emoji: '🔍', name: { en: 'Detective', zh: '小侦探' }, hint: { en: 'Log 1 mystery or shipwreck discovery', zh: '记录 1 个神秘发现或沉船' }, test: p => n(p.logs) >= 1 },
  { id: 'logs_all', emoji: '🗺️', name: { en: 'Mystery master', zh: '解谜大师' }, hint: { en: 'Log every discovery in the Discovery Dex', zh: '集齐全部发现图鉴' }, test: (p, t) => n(p.logs) >= t.discoveries },
  { id: 'placeit_play', emoji: '📍', name: { en: 'Pin dropper', zh: '插旗手' }, hint: { en: 'Finish a round of Place-It on the globe', zh: '完成一局地球定位挑战' }, test: p => Object.values(p.placeit).some(r => r.plays > 0) },
  { id: 'placeit_7000', emoji: '🎯', name: { en: 'Sharp eye', zh: '火眼金睛' }, hint: { en: 'Score 7,000+ in a Place-It round', zh: '在地球定位挑战中单局得分 7,000+' }, test: p => Object.values(p.placeit).some(r => r.best >= 7000) },
  { id: 'quiz_10', emoji: '🧠', name: { en: 'Quiz whiz', zh: '问答小达人' }, hint: { en: 'Answer 10 quiz questions correctly', zh: '累计答对 10 道知识问答题' }, test: p => p.quiz.correct >= 10 },
  { id: 'quiz_geo', emoji: '🧭', name: { en: 'Geography expert', zh: '地理专家' }, hint: { en: 'Answer 20 Geography quiz questions correctly', zh: '累计答对 20 道地理问答题' }, test: p => (p.quiz.bySet.geo ?? 0) >= 20 },
  { id: 'daily_win', emoji: '📅', name: { en: 'Daily solver', zh: '每日解题王' }, hint: { en: 'Win 1 Daily Challenge', zh: '赢得 1 次每日挑战' }, test: p => p.daily.won >= 1 },
  { id: 'daily_streak3', emoji: '🔥', name: { en: 'On a roll', zh: '连胜中' }, hint: { en: 'Reach a 3-day Daily Challenge streak', zh: '达成每日挑战 3 连胜' }, test: p => p.daily.maxStreak >= 3 },
  { id: 'traveller', emoji: '🧳', name: { en: 'Globetrotter', zh: '环球旅行家' }, hint: { en: 'Mark 5 places as visited', zh: '标记 5 个“我去过”的地点' }, test: p => countOn(p.visited) >= 5 },
  { id: 'passport_10', emoji: '🛂', name: { en: 'Stamp collector', zh: '集章小能手' }, hint: { en: 'Earn 10 passport stamps', zh: '获得 10 枚护照印章' }, test: p => n(p.seen) >= 10 },
  { id: 'passport_50', emoji: '🌍', name: { en: 'World explorer', zh: '世界探险家' }, hint: { en: 'Earn 50 passport stamps', zh: '获得 50 枚护照印章' }, test: p => n(p.seen) >= 50 },
  { id: 'book_done', emoji: '📕', name: { en: 'Full passport book', zh: '集满一本护照' }, hint: { en: 'Complete every stamp in any Passport Book', zh: '集满任意一本主题护照册' }, test: p => PASSPORTS.some(b => bookDone(b, p.seen)) },
  { id: 'found_10', emoji: '🧺', name: { en: 'Keen collector', zh: '收藏达人' }, hint: { en: 'Collect 10 special items (dinos, foods, plants…)', zh: '收集 10 件特色藏品（恐龙、美食、植物等）' }, test: p => n(p.found) >= 10 },
  { id: 'fossil_hunter', emoji: '🦴', name: { en: 'Fossil hunter', zh: '化石猎人' }, hint: { en: 'Collect your first dinosaur fossil', zh: '收集第 1 件恐龙化石' }, test: p => Object.keys(p.found).some(k => k.startsWith('dn_')) },
  { id: 'foodie', emoji: '🍜', name: { en: 'Little foodie', zh: '小吃货' }, hint: { en: 'Collect 5 world foods', zh: '收集 5 道世界美食' }, test: p => Object.keys(p.found).filter(k => k.startsWith('fd_')).length >= 5 },
];

/** Returns ids of stickers newly earned; caller persists them. */
export function newlyEarned(p: Progress, totals: { animals: number; discoveries: number }, now = Date.now()): string[] {
  const out: string[] = [];
  for (const s of STICKERS) if (!(s.id in p.stickers) && s.test(p, totals)) { p.stickers[s.id] = now; out.push(s.id); }
  return out;
}
