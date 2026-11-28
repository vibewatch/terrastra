/**
 * Minimal Wikipedia client for the in-app reader: one CORS request per article (plain-text extract, lead image,
 * short description). Output is plain text only, so callers render it with textContent and never inject HTML.
 */
import type { Lang } from '../../shared/data/types.ts';

export interface WikiSection { title: string; level: number; paras: string[] }
export interface WikiArticle {
  lang: Lang;
  title: string;
  url: string;
  description?: string;
  image?: { src: string; width: number; height: number };
  lead: string[];
  sections: WikiSection[];
  words: number;
}

const HOST: Record<Lang, string> = { en: 'en.wikipedia.org', zh: 'zh.wikipedia.org' };
const SKIP = new Set([
  'see also', 'references', 'external links', 'notes', 'further reading', 'bibliography', 'sources', 'citations', 'footnotes', 'gallery',
  '参见', '参考文献', '外部链接', '注释', '延伸阅读', '参考资料', '参考', '注释和参考文献', '脚注', '相关条目', '外部連結', '參見', '參考文獻', '註釋', '图集', '画廊',
]);

const MAX_WIKI_CACHE = 64;
const WIKI_TIMEOUT_MS = 12_000;
const cache = new Map<string, Promise<WikiArticle | null>>();

export function articleUrl(l: Lang, title: string): string {
  return `https://${HOST[l]}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}${l === 'zh' ? '?variant=zh-cn' : ''}`;
}

/** Cleans empty pronunciation parentheses, audio/citation remnants, and LaTeX `\displaystyle` artifacts left by `explaintext=1`. */
export function cleanWikiText(raw: string): string {
  return raw
    .replace(/\{\\displaystyle\s*([^}]*)\}/g, '$1')
    .replace(/\[\s*(?:citation needed|来源请求|來源請求|注\s*\d+|註\s*\d+)\s*\]/gi, '')
    .replace(/\(\s*(?:listen|听|聽)\s*\)/gi, '')
    .replace(/\(\s*[;,·•\s]*\)/g, '')
    .replace(/\(\s*[,;:]\s+/g, '(')
    .replace(/\s*[,;:]\s*\)/g, ')')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\(\s*[;,·•\s]*\)/g, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Formats a concise Markdown study summary from a Wikipedia article extract with CC BY-SA 4.0 attribution. */
export function formatWikiStudyMarkdown(a: WikiArticle, appUrl?: string): string {
  const mins = Math.max(1, Math.round(a.words / (a.lang === 'zh' ? 300 : 220)));
  const lines: string[] = [`# ${a.title}`];
  if (a.description) lines.push(`> ${a.description}`);
  lines.push(a.lang === 'zh' ? `> 预计阅读：约 ${mins} 分钟` : `> Reading time: ~${mins} min`, '');
  for (const p of a.lead) lines.push(p, '');
  const topSections = a.sections.filter(s => s.level === 2 && s.paras.length > 0).slice(0, 6);
  for (const sec of topSections) {
    lines.push(`## ${sec.title}`, '', sec.paras[0], '');
  }
  lines.push(
    '---',
    a.lang === 'zh'
      ? `*来源：[${a.title} — 维基百科](${a.url})（CC BY-SA 4.0）${appUrl ? ` · [在寰星打开](${appUrl})` : ''}*`
      : `*Source: [${a.title} — Wikipedia](${a.url}) (CC BY-SA 4.0)${appUrl ? ` · [Open in Terrastra](${appUrl})` : ''}*`,
  );
  return lines.join('\n').trim() + '\n';
}

/** Splits a `exsectionformat=wiki` plain-text extract into lead paragraphs and sections, dropping reference-style sections. */
export function parseExtract(text: string): { lead: string[]; sections: WikiSection[] } {
  const lead: string[] = [];
  const sections: WikiSection[] = [];
  let cur: WikiSection | null = null;
  let skipBelow = 0;
  for (const raw of text.split('\n')) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const m = /^(={2,6})\s*(.+?)\s*\1$/.exec(trimmed);
    if (m) {
      const level = m[1].length;
      if (skipBelow && level > skipBelow) continue;
      skipBelow = 0;
      const secTitle = cleanWikiText(m[2]);
      if (!secTitle || SKIP.has(secTitle.toLowerCase())) { skipBelow = level; cur = null; continue; }
      cur = { title: secTitle, level, paras: [] };
      sections.push(cur);
      continue;
    }
    if (skipBelow) continue;
    const line = cleanWikiText(trimmed);
    if (!line) continue;
    (cur ? cur.paras : lead).push(line);
  }
  // Drop headings with no body text of their own and no non-empty children (lists/tables vanish in plain text).
  const hasBody = (i: number): boolean => {
    if (sections[i].paras.length) return true;
    for (let j = i + 1; j < sections.length && sections[j].level > sections[i].level; j++) if (sections[j].paras.length) return true;
    return false;
  };
  return { lead, sections: sections.filter((_, i) => hasBody(i)) };
}

async function load(l: Lang, title: string): Promise<WikiArticle | null> {
  const q = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*', redirects: '1',
    prop: 'extracts|pageimages|description|info', inprop: 'varianttitles', explaintext: '1', exsectionformat: 'wiki',
    piprop: 'thumbnail', pithumbsize: '960', titles: title,
  });
  if (l === 'zh') q.set('variant', 'zh-cn');
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), WIKI_TIMEOUT_MS) : null;
  let r: Response;
  try {
    r = await fetch(`https://${HOST[l]}/w/api.php?${q}`, ctrl ? { signal: ctrl.signal } : undefined);
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!r.ok) throw new Error('wikipedia ' + r.status);
  const j = await r.json() as { query?: { pages?: { title: string; varianttitles?: Record<string, string>; missing?: boolean; extract?: string; description?: string; thumbnail?: { source: string; width: number; height: number } }[] } };
  const p = j.query?.pages?.[0];
  if (!p || p.missing || !p.extract) return null;
  const { lead, sections } = parseExtract(p.extract);
  const words = [...lead, ...sections.flatMap(s => s.paras)].reduce((n, s) => n + (l === 'zh' ? s.length / 2 : s.split(/\s+/).length), 0);
  return {
    lang: l, title: (l === 'zh' && p.varianttitles?.['zh-cn']) || p.title, url: articleUrl(l, p.title), description: p.description, lead, sections, words: Math.round(words),
    image: p.thumbnail ? { src: p.thumbnail.source, width: p.thumbnail.width, height: p.thumbnail.height } : undefined,
  };
}

/** Fetches (once per session) the article; resolves null if the page does not exist, rejects when offline. */
export function fetchArticle(l: Lang, title: string): Promise<WikiArticle | null> {
  const k = l + ':' + title;
  const existing = cache.get(k);
  if (existing) {
    // Refresh LRU recency
    cache.delete(k);
    cache.set(k, existing);
    return existing;
  }
  if (cache.size >= MAX_WIKI_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  const p = load(l, title);
  cache.set(k, p);
  p.catch(() => cache.delete(k));
  return p;
}
