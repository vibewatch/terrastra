/**
 * In-app reader: opens beside the info card (same screen, horizontal expansion) and shows the item's Wikipedia
 * article in the chosen language, plus nearby places and attribution. Loaded lazily on first "Read more".
 */
import { h } from './dom.ts';
import { icon } from './icons.ts';
import { t, lang, fmtNum } from '../lib/i18n.ts';
import { url } from '../lib/env.ts';
import { articleUrl, fetchArticle, type WikiArticle, type WikiSection } from '../lib/wikipedia.ts';
import { WIKI } from '../../shared/data/wiki.ts';
import { CATALOGUE } from '../../shared/data/catalogue.ts';
import { TYPE_META } from '../../shared/data/typemeta.ts';
import { haversineKm } from '../../shared/lib/geo.ts';
import { tr, type CatalogueItem, type Lang } from '../../shared/data/types.ts';

const FIRST_SECTIONS = 4;
const HTML_LANG: Record<Lang, string> = { en: 'en', zh: 'zh-CN' };

interface ReaderHooks { close: () => void; pick: (it: CatalogueItem) => void }

/** Anything with a Wikipedia article: catalogue items, and solar-system bodies/features (no type → no nearby list). */
export type Readable = Pick<CatalogueItem, 'key' | 'name' | 'desc'> & Partial<Pick<CatalogueItem, 'type' | 'slug' | 'lat' | 'lon' | 'route' | 'wiki' | 'funFact'>>;

export class Reader {
  readonly el: HTMLElement;
  private scroller = h('div', { class: 'reader-scroll' });
  private seg = h('div', { class: 'reader-lang', role: 'group', 'aria-label': t('language') });
  private ext = h('a', { class: 'icon-btn', target: '_blank', rel: 'noopener', 'data-testid': 'reader-wiki-link', html: icon('external', 16) });
  private item: Readable | null = null;
  private readLang: Lang = lang();
  private shown = '';
  private seq = 0;

  constructor(private hooks: ReaderHooks) {
    this.el = h('section', { class: 'reader', 'data-testid': 'reader', 'aria-label': 'Wikipedia' },
      h('header', { class: 'reader-bar' },
        h('button', { class: 'icon-btn reader-back', 'aria-label': t('readerClose'), 'data-testid': 'reader-close', html: icon('collapse', 16), onclick: () => this.hooks.close() }),
        h('span', { class: 'reader-src' }, h('b', { class: 'wiki-w', 'aria-hidden': 'true' }, 'W'), h('span', {}, 'Wikipedia')),
        this.seg, this.ext),
      this.scroller);
  }

  /** Shows `it` in `l` (defaults to the reading language); no-op if already shown. */
  show(it: Readable, l: Lang = this.item?.key === it.key ? this.readLang : lang()): void {
    this.item = it;
    this.readLang = l;
    const id = it.key + ':' + l;
    this.renderLangs();
    if (id === this.shown) return;
    this.shown = id;
    void this.load(it, l);
  }

  /** App language changed: follow it. */
  relang(): void { if (this.item) { this.shown = ''; this.show(this.item, lang()); } }

  private renderLangs(): void {
    const it = this.item!;
    const titles = WIKI[it.key];
    this.seg.replaceChildren(...(['en', 'zh'] as Lang[]).map(l =>
      h('button', { class: l === this.readLang ? 'on' : '', 'aria-pressed': String(l === this.readLang), 'data-testid': 'reader-lang-' + l,
        disabled: l === 'zh' && !titles?.[1], onclick: () => this.show(it, l) }, l === 'en' ? 'EN' : '中文')));
    this.el.querySelector('.reader-back')?.setAttribute('aria-label', t('readerClose'));
    this.seg.setAttribute('aria-label', t('language'));
  }

  private async load(it: Readable, want: Lang): Promise<void> {
    const seq = ++this.seq;
    const titles = WIKI[it.key];
    const l: Lang = want === 'zh' && titles?.[1] ? 'zh' : 'en';
    const title = l === 'zh' ? titles![1]! : titles?.[0] ?? it.wiki ?? it.name.en;
    this.ext.setAttribute('href', articleUrl(l, title));
    this.ext.setAttribute('title', t('readerOpenWiki'));
    this.scroller.replaceChildren(this.skeleton(it));
    this.scroller.scrollTop = 0;
    let art: WikiArticle | null = null;
    let failed = false;
    try { art = await fetchArticle(l, title); } catch { failed = true; }
    if (seq !== this.seq) return;
    if (art) this.ext.setAttribute('href', art.url);
    this.scroller.replaceChildren(art ? this.article(it, art, want !== l) : this.fallback(it, failed));
  }

  private skeleton(it: Readable): HTMLElement {
    return h('article', { class: 'reader-article', 'aria-busy': 'true' },
      h('div', { class: 'reader-figure sk' }),
      h('h1', {}, tr(it.name, lang())),
      ...[92, 100, 96, 70, 0, 100, 88, 94, 60].map(w => h('div', { class: 'sk-line', style: w ? `width:${w}%` : 'height:10px;background:none' })));
  }

  private article(it: Readable, a: WikiArticle, notInLang: boolean): HTMLElement {
    const mins = Math.max(1, Math.round(a.words / (a.lang === 'zh' ? 300 : 220)));
    const top = a.sections.filter(s => s.level === 2);
    const body = h('div', { class: 'reader-body' });
    const renderSections = (from: number, to: number) => {
      for (const s of a.sections.slice(from, to)) body.append(this.section(s, a.sections.indexOf(s)));
    };
    const cut = a.sections.findIndex((s, i) => s.level === 2 && a.sections.slice(0, i).filter(x => x.level === 2).length === FIRST_SECTIONS);
    const firstEnd = cut < 0 ? a.sections.length : cut;
    renderSections(0, firstEnd);
    const rest = top.length - FIRST_SECTIONS;
    const more = firstEnd < a.sections.length ? h('button', { class: 'reader-continue', 'data-testid': 'reader-continue', onclick: () => { more!.remove(); renderSections(firstEnd, a.sections.length); } },
      h('span', {}, t('readerContinue')), h('small', {}, t('readerMoreSections', { n: rest }))) : null;
    const goto = (i: number) => {
      if (more?.isConnected && i >= firstEnd) more.click();
      this.scroller.querySelector<HTMLElement>(`[data-sec="${i}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const section = it.type ? TYPE_META[it.type].section : undefined;
    return h('article', { class: 'reader-article', lang: HTML_LANG[a.lang], 'data-testid': 'reader-article' },
      a.image ? h('figure', { class: 'reader-figure' + (a.image.height > a.image.width * 0.75 ? ' tall' : ''), style: `--img:url("${a.image.src.replace(/"/g, "%22")}")` },
        h('img', { src: a.image.src, alt: a.title, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', width: a.image.width, height: a.image.height,
          onerror: (e: Event) => (e.currentTarget as HTMLElement).parentElement?.remove() })) : null,
      a.description ? h('p', { class: 'reader-kicker' }, a.description) : null,
      h('h1', { 'data-testid': 'reader-title' }, a.title),
      h('p', { class: 'reader-meta' }, t('readerMinutes', { n: mins }), a.sections.length ? ' · ' + t('readerSections', { n: top.length }) : ''),
      notInLang ? h('p', { class: 'reader-note' }, t('readerOnlyEn')) : null,
      h('div', { class: 'reader-lead' }, ...a.lead.map(p => h('p', {}, p))),
      top.length > 1 ? h('nav', { class: 'reader-toc', 'aria-label': t('readerContents') },
        h('span', { class: 'reader-label' }, t('readerContents')),
        h('div', {}, ...top.map(s => h('button', { onclick: () => goto(a.sections.indexOf(s)) }, s.title)))) : null,
      body, more,
      this.nearby(it),
      h('footer', { class: 'reader-credit' },
        h('p', {}, t('readerLicense', { title: a.title }), ' ',
          h('a', { href: a.url, target: '_blank', rel: 'noopener' }, 'Wikipedia'), ' · ',
          h('a', { href: 'https://creativecommons.org/licenses/by-sa/4.0/', target: '_blank', rel: 'noopener license' }, 'CC BY-SA 4.0')),
        section ? h('a', { class: 'reader-page', href: url(`${section}/${it.slug}/`) }, h('span', { html: icon('book', 14) }), t('readerPage')) : null));
  }

  private section(s: WikiSection, i: number): HTMLElement {
    const tag = s.level <= 2 ? 'h2' : s.level === 3 ? 'h3' : 'h4';
    return h('section', { class: 'reader-sec lv' + Math.min(s.level, 4), 'data-sec': i },
      h(tag, {}, s.title), ...s.paras.map(p => h('p', {}, p)));
  }

  private fallback(it: Readable, offline: boolean): HTMLElement {
    const l = lang();
    return h('article', { class: 'reader-article' },
      h('h1', {}, tr(it.name, l)),
      h('p', { class: 'reader-note' }, offline ? t('readerOffline') : t('readerMissing')),
      h('div', { class: 'reader-lead' }, h('p', {}, tr(it.desc, l)), it.funFact ? h('p', {}, tr(it.funFact, l)) : null),
      offline ? h('button', { class: 'pill', 'data-testid': 'reader-retry', onclick: () => { this.shown = ''; this.show(it, this.readLang); } }, t('readerRetry')) : null,
      this.nearby(it));
  }

  private nearby(it: Readable): HTMLElement | null {
    if (it.route || !it.type || it.lat === undefined || it.lon === undefined) return null;
    const lat = it.lat, lon = it.lon;
    const l = lang();
    const near = CATALOGUE.filter(o => o.key !== it.key && !o.route)
      .map(o => ({ o, d: haversineKm(lat, lon, o.lat, o.lon) }))
      .sort((a, b) => a.d - b.d).slice(0, 6);
    return h('aside', { class: 'reader-nearby' },
      h('span', { class: 'reader-label' }, t('readerNearby')),
      h('div', { class: 'reader-near-grid' }, ...near.map(({ o, d }) =>
        h('button', { class: 'near-card', 'data-testid': 'reader-near', onclick: () => this.hooks.pick(o) },
          h('span', { class: 'near-emoji', 'aria-hidden': 'true' }, o.emoji),
          h('span', { class: 'near-txt' }, h('b', {}, tr(o.name, l)),
            h('small', {}, tr(TYPE_META[o.type].one, l), h('i', {}, ' · ' + fmtNum(Math.round(d)) + ' km')))))));
  }
}
