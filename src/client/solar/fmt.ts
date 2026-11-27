import { fmtNum } from '../lib/i18n.ts';
import type { Lang } from '../../shared/data/types.ts';

export const LY_PER_PC = 3.26156378;

/** Scientific distance in parsecs ("1.30 pc" / "8.18 kpc" / "16.5 Mpc" / "4.2 Gpc"). */
export function fmtParsec(ly: number, l: Lang): string {
  const pc = Math.max(0, ly) / LY_PER_PC;
  const n = (v: number, d: number) => fmtNum(+v.toFixed(d), l);
  if (pc < 1e3) return `${n(pc, pc < 10 ? 2 : pc < 100 ? 1 : 0)} pc`;
  if (pc < 1e6) return `${n(pc / 1e3, pc < 1e4 ? 2 : 1)} kpc`;
  if (pc < 1e9) return `${n(pc / 1e6, pc < 1e7 ? 2 : 1)} Mpc`;
  return `${n(pc / 1e9, 2)} Gpc`;
}

/** "4.2 light-years" / "250 万光年" / "13.8 billion light-years". */
export function fmtLy(ly: number, l: Lang): string {
  const n = (v: number, d: number) => fmtNum(+v.toFixed(d), l);
  if (l === 'zh') {
    if (ly < 1e4) return `${n(ly, ly < 10 ? 1 : 0)} 光年`;
    if (ly < 1e8) return `${n(ly / 1e4, ly < 1e5 ? 1 : 0)} 万光年`;
    return `${n(ly / 1e8, ly < 1e9 ? 1 : 0)} 亿光年`;
  }
  if (ly < 1e6) { const v = n(ly, ly < 10 ? 1 : 0); return `${v} light-year${v === '1' ? '' : 's'}`; }
  if (ly < 1e9) return `${n(ly / 1e6, ly < 1e7 ? 1 : 0)} million light-years`;
  return `${n(ly / 1e9, 1)} billion light-years`;
}

/** "4.2 years" / "1.8 万年" / "76 million years". */
export function fmtYears(y: number, l: Lang): string {
  const n = (v: number, d: number) => fmtNum(+v.toFixed(d), l);
  if (l === 'zh') {
    if (y < 1e4) return `${n(y, y < 10 ? 1 : 0)} 年`;
    if (y < 1e8) return `${n(y / 1e4, y < 1e5 ? 1 : 0)} 万年`;
    if (y < 1e12) return `${n(y / 1e8, y < 1e9 ? 1 : 0)} 亿年`;
    return `${n(y / 1e12, 1)} 万亿年`;
  }
  if (y < 1e6) { const v = n(y, y < 10 ? 1 : 0); return `${v} year${v === '1' ? '' : 's'}`; }
  if (y < 1e9) return `${n(y / 1e6, y < 1e7 ? 1 : 0)} million years`;
  if (y < 1e12) return `${n(y / 1e9, y < 1e10 ? 1 : 0)} billion years`;
  return `${n(y / 1e12, 1)} trillion years`;
}
