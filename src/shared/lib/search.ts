/**
 * Offline search scoring: normalisation plus a simple ranked match. Typos and
 * synonyms are handled through curated aliases (data/aliases.ts), not online AI.
 */

const CN_DIGIT: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** Chinese numerals 1–99 (三, 十一, 二十, 四十七) → number. */
function cnNum(s: string): number | null {
  if (s.length === 1 && s in CN_DIGIT) return CN_DIGIT[s];
  const m = /^([一二三四五六七八九])?十([一二三四五六七八九])?$/.exec(s);
  if (!m) return null;
  return (m[1] ? CN_DIGIT[m[1]] : 1) * 10 + (m[2] ? CN_DIGIT[m[2]] : 0);
}

/**
 * Lower-case, strip accents, spaces and punctuation, so "Chang'e 3", "change3"
 * and "嫦娥三号" / "嫦娥3号" all compare equal; "Messier 31" becomes "m31".
 */
export function norm(s: string): string {
  let x = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  x = x.replace(/([零〇一二两三四五六七八九十]+)号/g, (all, n: string) => { const v = cnNum(n); return v == null ? all : v + '号'; });
  x = x.replace(/[\s\p{P}\p{S}]+/gu, '');
  return x.replace(/(?:messier|梅西耶)(?=\d)/g, 'm');
}

interface Terms {
  /** Display names in every language. */
  names: string[];
  /** Curated aliases, catalogue numbers, related people/missions. */
  aliases?: string[];
  /** Weaker context: country, category. */
  other?: string[];
}

/** 0 = no match; higher is better. `q` must already be normalised. */
export function scoreTerms(q: string, terms: Terms): number {
  if (!q) return 0;
  let best = 0;
  const test = (list: string[] | undefined, w: number) => {
    for (const raw of list ?? []) {
      const t = norm(raw);
      if (!t) continue;
      const s = t === q ? 100 : t.startsWith(q) ? 75 : t.includes(q) ? 50 : 0;
      if (s * w > best) best = s * w;
    }
  };
  test(terms.names, 1);
  test(terms.aliases, 0.92);
  test(terms.other, 0.55);
  return best;
}
