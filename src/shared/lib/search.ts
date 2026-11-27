/**
 * Offline search scoring: normalisation plus a simple ranked match. Typos and
 * synonyms are handled through curated aliases (data/aliases.ts), not online AI.
 */

const CN_DIGIT: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** Compact Traditional → Simplified map for high-frequency geography, astronomy & landmark characters. */
const TRAD_TO_SIMP: Record<string, string> = {
  亞: '亚', 馬: '马', 瑪: '玛', 納: '纳', 溝: '沟', 脈: '脉', 東: '东', 峽: '峡', 島: '岛', 灣: '湾', 臺: '台',
  長: '长', 黃: '黄', 嶺: '岭', 運: '运', 蘇: '苏', 爾: '尔', 鐵: '铁', 倫: '伦', 羅: '罗', 國: '国', 際: '际',
  線: '线', 極: '极', 歸: '归', 緯: '纬', 經: '经', 歐: '欧', 華: '华', 蘭: '兰', 門: '门', 關: '关',
  風: '风', 雲: '云', 電: '电', 龍: '龙', 鳥: '鸟', 魚: '鱼', 鯨: '鲸', 鵝: '鹅', 鷹: '鹰', 獅: '狮', 龜: '龟',
  銀: '银', 獵: '猎', 戶: '户', 處: '处', 雙: '双', 寶: '宝', 衛: '卫', 號: '号', 鏡: '镜', 遠: '远', 陽: '阳',
  宮: '宫', 廟: '庙', 聖: '圣', 凱: '凯', 鐘: '钟', 樓: '楼', 橋: '桥', 園: '园', 館: '馆', 場: '场',
  剛: '刚', 盧: '卢', 薩: '萨', 麥: '麦', 頓: '顿', 諾: '诺', 貝: '贝', 裡: '里', 鹹: '咸',
  瀾: '澜', 滄: '沧', 魯: '鲁', 連: '连', 韓: '韩', 鮮: '鲜', 緬: '缅',
  愛: '爱', 達: '达', 萬: '万', 鄭: '郑', 張: '张', 時: '时', 圓: '圆', 紐: '纽', 開: '开',
  熱: '热', 溫: '温', 帶: '带', 陸: '陆', 嶼: '屿', 濕: '湿', 鹽: '盐', 峯: '峰', 澤: '泽', 濱: '滨',
  瀋: '沈', 廣: '广', 慶: '庆', 陝: '陕', 寧: '宁', 貴: '贵', 瓊: '琼', 粵: '粤', 贛: '赣', 閩: '闽', 滬: '沪', 遼: '辽',
  恆: '恒', 團: '团', 蝕: '蚀', 隕: '陨', 殼: '壳', 塊: '块', 層: '层', 環: '环',
};
const TRAD_RE = new RegExp(`[${Object.keys(TRAD_TO_SIMP).join('')}]`, 'g');

function toSimplified(s: string): string {
  return s.replace(TRAD_RE, ch => TRAD_TO_SIMP[ch] ?? ch);
}

/** Chinese numerals 1–999 (三, 十一, 四十七, 一百零五, 三百六十五) → number. */
function cnNum(s: string): number | null {
  if (s.length === 1 && s in CN_DIGIT) return CN_DIGIT[s];
  const m10 = /^([一二两三四五六七八九])?十([一二三四五六七八九])?$/.exec(s);
  if (m10) return (m10[1] ? CN_DIGIT[m10[1]] : 1) * 10 + (m10[2] ? CN_DIGIT[m10[2]] : 0);
  const m100 = /^([一二两三四五六七八九])百(?:[零〇]([一二三四五六七八九])|([一二三四五六七八九])(?:十([一二三四五六七八九])?)?)?$/.exec(s);
  if (!m100) return null;
  const h = CN_DIGIT[m100[1]] * 100;
  if (m100[2]) return h + CN_DIGIT[m100[2]];
  if (m100[3]) return h + CN_DIGIT[m100[3]] * 10 + (m100[4] ? CN_DIGIT[m100[4]] : 0);
  return h;
}

/**
 * Lower-case, map common Traditional Chinese characters, strip accents, spaces and punctuation,
 * so "Chang'e 3", "change3" and "嫦娥三号" / "嫦娥3号" / "嫦娥三號" all compare equal;
 * "Messier 031" becomes "m31" and "NGC 0224" becomes "ngc224".
 */
export function norm(s: string): string {
  let x = toSimplified(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  x = x.replace(/([零〇一二两三四五六七八九十百]+)号/g, (all, n: string) => { const v = cnNum(n); return v == null ? all : v + '号'; });
  x = x.replace(/[\s\p{P}\p{S}]+/gu, '');
  x = x.replace(/(?:messier|梅西耶)(?=\d)/g, 'm').replace(/caldwell(?=\d)/g, 'c');
  return x.replace(/\b(m|ngc|ic|c)0+(\d)/g, '$1$2').replace(/^(m|ngc|ic|c)0+(\d)/, '$1$2');
}

/** Split a raw user query into normalized whitespace tokens (2..5 tokens) for out-of-order matching. */
export function queryTokens(raw: string): string[] {
  const parts = raw.trim().split(/\s+/).map(norm).filter(Boolean);
  return parts.length >= 2 && parts.length <= 5 ? parts : [];
}

interface Terms {
  /** Display names in every language. */
  names: readonly string[];
  /** Curated aliases, catalogue numbers, related people/missions. */
  aliases?: readonly string[];
  /** Weaker context: country, category. */
  other?: readonly string[];
}

/** 0 = no match; higher is better. `q` must already be normalised; `tokens` optional from `queryTokens(raw)`. */
export function scoreTerms(q: string, terms: Terms, tokens?: readonly string[]): number {
  if (!q) return 0;
  let best = 0;
  const normNames: string[] = [];
  const normAliases: string[] = [];
  const normOther: string[] = [];
  const hasWordPrefix = (raw: string): boolean => {
    const parts = raw.split(/[\s\p{P}\p{S}]+/u);
    if (parts.length <= 1) return false;
    for (let i = 1; i < parts.length; i++) {
      const w = norm(parts[i]);
      if (w && w.startsWith(q)) return true;
    }
    return false;
  };
  const test = (list: readonly string[] | undefined, w: number, bucket: string[]) => {
    for (const raw of list ?? []) {
      const t = norm(raw);
      if (!t) continue;
      bucket.push(t);
      const s = t === q
        ? 100
        : t.startsWith(q)
          ? 75
          : t.includes(q)
            ? (hasWordPrefix(raw) ? 64 : 50)
            : 0;
      if (s * w > best) best = s * w;
    }
  };
  test(terms.names, 1, normNames);
  test(terms.aliases, 0.92, normAliases);
  test(terms.other, 0.55, normOther);
  if (best === 0 && tokens && tokens.length >= 2) {
    const namesBlob = normNames.join(' ');
    if (tokens.every(tok => namesBlob.includes(tok))) return 68;
    const aliasBlob = namesBlob + ' ' + normAliases.join(' ');
    if (tokens.every(tok => aliasBlob.includes(tok))) return 58;
    const allBlob = aliasBlob + ' ' + normOther.join(' ');
    if (tokens.every(tok => allBlob.includes(tok))) return 42;
  }
  return best;
}

export interface ParsedCoordinate {
  lat: number;
  lon: number;
}

function parseSingleCoordPart(part: string): { val: number; axis: 'lat' | 'lon' | null } | null {
  let s = toSimplified(part).trim();
  if (!s) return null;
  let sign = 1;
  let axis: 'lat' | 'lon' | null = null;
  if (/^(?:北纬|n\b)/i.test(s) || /[nN]$/.test(s)) { axis = 'lat'; sign = 1; }
  else if (/^(?:南纬|s\b)/i.test(s) || /[sS]$/.test(s)) { axis = 'lat'; sign = -1; }
  else if (/^(?:东经|e\b)/i.test(s) || /[eE]$/.test(s)) { axis = 'lon'; sign = 1; }
  else if (/^(?:西经|w\b)/i.test(s) || /[wW]$/.test(s)) { axis = 'lon'; sign = -1; }
  s = s.replace(/^(?:北纬|南纬|东经|西经|[nNsSeEwW])\s*/, '').replace(/\s*(?:[nNsSeEwW]|[北南]纬|[东西]经)$/, '').trim();
  const dms = /^([+-]?\d+(?:\.\d+)?)\s*[°度]\s*(?:(\d+(?:\.\d+)?)\s*[′'分]\s*)?(?:(\d+(?:\.\d+)?)\s*[″"秒]\s*)?$/.exec(s);
  if (dms) {
    const deg = Number(dms[1]);
    const min = dms[2] ? Number(dms[2]) : 0;
    const sec = dms[3] ? Number(dms[3]) : 0;
    if (![deg, min, sec].every(Number.isFinite) || min < 0 || min >= 60 || sec < 0 || sec >= 60) return null;
    const abs = Math.abs(deg) + min / 60 + sec / 3600;
    const explicitNeg = dms[1].startsWith('-');
    return { val: (explicitNeg ? -1 : sign) * abs, axis };
  }
  if (/^[+-]?\d+(?:\.\d+)?$/.test(s)) {
    const v = Number(s);
    if (!Number.isFinite(v)) return null;
    const explicitNeg = s.startsWith('-');
    return { val: explicitNeg ? v : sign * v, axis };
  }
  return null;
}

/**
 * Parses coordinate queries such as `35.68, 139.76`, `(23.5°N, 113.2°E)`,
 * `geo:35.68,139.76?z=10`, `@48.858,2.294,15z`, or `北纬30度 东经120度`.
 * Returns null for non-coordinate text.
 */
export function parseCoordinateQuery(raw: string): ParsedCoordinate | null {
  let trimmed = raw.trim();
  if (trimmed.length < 3 || trimmed.length > 96) return null;
  if (/^geo:[+-]?\d/i.test(trimmed)) {
    trimmed = trimmed.slice(4).replace(/[;?].*$/, '').trim();
  } else if (/^@[+-]?\d/.test(trimmed)) {
    trimmed = trimmed.slice(1).replace(/,\s*\d+(?:\.\d+)?z$/i, '').trim();
  }
  if (
    (trimmed.startsWith('(') && trimmed.endsWith(')')) ||
    (trimmed.startsWith('（') && trimmed.endsWith('）')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  if (trimmed.length < 3 || trimmed.length > 64) return null;
  let parts = trimmed.split(/\s*[,，;；/]\s*/).filter(Boolean);
  if (parts.length !== 2) {
    // Allow whitespace separation when explicit degree/cardinal markers exist or signed decimals are separated by space
    const m = /^(.+?[°度′'″"nNsSeEwW])\s+(.+)$/.exec(trimmed)
      ?? /^((?:北纬|南纬|东经|西经)\S+)\s+((?:北纬|南纬|东经|西经)\S+)$/.exec(toSimplified(trimmed));
    if (m) parts = [m[1], m[2]];
    else {
      const sp = trimmed.split(/\s+/);
      if (sp.length === 2 && sp.every(p => /^[+-]?\d+\.\d+$/.test(p))) parts = sp;
    }
  }
  if (parts.length !== 2) return null;
  const a = parseSingleCoordPart(parts[0]);
  const b = parseSingleCoordPart(parts[1]);
  if (!a || !b) return null;
  // Require either a comma/semicolon, degree/cardinal marker, or a decimal point so plain "10 20" or years aren't misread
  const hasExplicitHint = /[,，;；°度nNsSeEwW北南东西.]/.test(trimmed);
  if (!hasExplicitHint) return null;

  let lat: number;
  let lon: number;
  if (a.axis === 'lon' && b.axis === 'lat') {
    lon = a.val;
    lat = b.val;
  } else if (a.axis === 'lat' && b.axis === 'lat') {
    return null;
  } else if (a.axis === 'lon' && b.axis === 'lon') {
    return null;
  } else {
    lat = a.val;
    lon = b.val;
  }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return {
    lat: Math.round(lat * 10000) / 10000,
    lon: Math.round(lon * 10000) / 10000,
  };
}

/**
 * Returns the best-matching alias when the query matched via `aliases` rather
 * than the primary display `names` (`q` must already be normalised).
 */
export function matchedAlias(
  q: string,
  names: readonly string[],
  aliases?: readonly string[],
  tokens?: readonly string[],
): string | undefined {
  if (!q || !aliases?.length) return undefined;
  const normNames: string[] = [];
  for (const raw of names) {
    const t = norm(raw);
    if (!t) continue;
    normNames.push(t);
    if (t.includes(q)) return undefined;
  }
  if (tokens && tokens.length >= 2) {
    const namesBlob = normNames.join(' ');
    if (tokens.every(tok => namesBlob.includes(tok))) return undefined;
  }
  let bestScore = 0;
  let bestRaw: string | undefined;
  for (const raw of aliases) {
    const t = norm(raw);
    if (!t) continue;
    let s = t === q ? 100 : t.startsWith(q) ? 75 : t.includes(q) ? 50 : 0;
    if (s === 0 && tokens && tokens.length >= 2 && tokens.every(tok => t.includes(tok))) {
      s = 45;
    }
    if (s > bestScore) { bestScore = s; bestRaw = raw; }
  }
  return bestRaw;
}

export interface RecentSearchEntry {
  kind: 'item' | 'place' | 'space';
  /** Catalogue key (`eiffel`), place key (`geo:mariana-trench` / `country:JP`), or space hash (`solar/saturn`). */
  key: string;
  emoji: string;
  name: { en: string; zh?: string };
}

export function isRecentSearchEntry(v: unknown): v is RecentSearchEntry {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  if (r.kind !== 'item' && r.kind !== 'place' && r.kind !== 'space') return false;
  if (typeof r.key !== 'string' || !r.key || typeof r.emoji !== 'string') return false;
  const n = r.name as Record<string, unknown> | undefined;
  return Boolean(n && typeof n === 'object' && typeof n.en === 'string' && (n.zh === undefined || typeof n.zh === 'string'));
}

export function pushRecentSearch(
  list: readonly unknown[],
  entry: RecentSearchEntry,
  max = 6,
): RecentSearchEntry[] {
  const valid = Array.isArray(list) ? list.filter(isRecentSearchEntry) : [];
  return [entry, ...valid.filter(x => !(x.kind === entry.kind && x.key === entry.key))].slice(0, max);
}
