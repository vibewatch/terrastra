/** The sky-events calendar: a year of events, filters, countdowns and what each one looks like from your site. */
import { skyEvents, localSolar, topocentric, gast, planetGeo, foldIcsLine, type PlanetId, type SkyEvent, type SkyEventKind } from '../../shared/lib/astro/index.ts';
import { SHOWERS } from '../../shared/data/showers.ts';
import { h, toast } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';
import { openPaywall } from '../ui/paywall.ts';
import { lang, t } from '../lib/i18n.ts';
import { canUsePro } from '../store.ts';
import { isFreeSkyYear, skyEventYear } from '../../shared/lib/entitlements.ts';
import { s, regionOf, type SkyKey } from './text.ts';
import { eventTitle, type Site } from './acts.ts';

type Filter = 'top' | 'eclipse' | 'meteor' | 'moon' | 'planet' | 'season';
const FILTERS: Filter[] = ['top', 'eclipse', 'meteor', 'moon', 'planet', 'season'];
const DAY = 86400_000;

const cache = new Map<number, SkyEvent[]>();
function eventsOf(year: number): SkyEvent[] {
  let e = cache.get(year);
  if (!e) { e = skyEvents(Date.UTC(year, 0, 1), Date.UTC(year + 1, 0, 1)); cache.set(year, e); }
  return e;
}

/** Find an event by id (ids carry their year). */
export function findEvent(id: string): SkyEvent | undefined {
  const y = skyEventYear(id);
  if (!y) return undefined;
  for (const yy of [y, y - 1, y + 1]) { const e = eventsOf(yy).find(x => x.id === id); if (e) return e; }
  return undefined;
}

const isTop = (e: SkyEvent) =>
  e.kind === 'solar-eclipse' || (e.kind === 'lunar-eclipse' && e.lunar!.type !== 'penumbral') || e.kind === 'supermoon' || e.kind === 'transit'
  || e.kind === 'opposition' || (e.kind === 'meteor-shower' && (SHOWERS.find(x => x.key === e.shower)?.zhr ?? 0) >= 50)
  || (e.kind === 'conjunction' && !e.bodies!.includes('moon') && (e.value ?? 9) < 1);
const KINDS: Record<Exclude<Filter, 'top'>, SkyEventKind[]> = {
  eclipse: ['solar-eclipse', 'lunar-eclipse'],
  meteor: ['meteor-shower'],
  moon: ['full-moon', 'new-moon', 'supermoon'],
  planet: ['opposition', 'conjunction', 'elongation', 'transit'],
  season: ['equinox', 'solstice'],
};
const match = (e: SkyEvent, f: Filter) => f === 'top' ? isTop(e) : KINDS[f].includes(e.kind) || (f === 'moon' && e.kind === 'conjunction' && e.bodies!.includes('moon'));

/** The first highlight from now (what the theatre opens on when no event is given). */
export function nextHighlight(now = Date.now()): SkyEvent | undefined {
  const y = new Date(now).getUTCFullYear();
  const all = [...eventsOf(y), ...eventsOf(y + 1)].filter(e => e.t > now - DAY);
  const eclipse = all.find(e => e.kind === 'solar-eclipse' || e.kind === 'lunar-eclipse');
  return eclipse && eclipse.t - now < 200 * DAY ? eclipse : all.find(isTop) ?? all[0];
}

/** One line: what `site` gets of this event. */
function seenFrom(e: SkyEvent, site: Site | null): string {
  if (e.kind === 'solar-eclipse') {
    const x = e.solar!;
    if (!site) return s('bestFrom', { r: regionOf(x.greatest.lat, x.greatest.lon) });
    const L = localSolar(x, site);
    const k: SkyKey = !L.visible || L.type === 'none' ? 'seesNone' : L.type === 'total' ? 'seesTotal' : L.type === 'annular' ? 'seesAnnular' : 'seesPartial';
    return s('hereSees', { p: site.name, s: s(k, { n: Math.round(L.obscuration * 100) }) });
  }
  if (e.kind === 'lunar-eclipse') {
    const l = e.lunar!;
    if (!site) return s('bestFrom', { r: regionOf(l.subMoon.lat, l.subMoon.lon) });
    const up = [l.u1 ?? l.p1, l.t, l.u4 ?? l.p4].some(t => topocentric(t, site).moon.alt > 0);
    return s('hereSees', { p: site.name, s: s(up ? 'seesUp' : 'seesNone') });
  }
  if (e.kind === 'meteor-shower') {
    const sh = SHOWERS.find(x => x.key === e.shower);
    return sh ? `${s('zhr', { n: sh.zhr })} · ${s('parent')} ${lang() === 'zh' ? sh.parent.zh : sh.parent.en}` : '';
  }
  if (e.kind === 'conjunction') return `${s('separation')} ${(e.value ?? 0).toFixed(1)}°`;
  if (e.kind === 'elongation') return `${s('elongation')} ${(e.value ?? 0).toFixed(0)}°`;
  if (e.kind === 'supermoon' || e.kind === 'full-moon') return `${Math.round(e.value ?? 0).toLocaleString()} km`;
  return '';
}

/** Local midnight of the day containing `ms`. */
const dayStart = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);

/** "in 3 days" / "3 days ago" counted in calendar days, so tomorrow evening is always "in 1 day". */
export function countdown(t: number, now = Date.now()): string {
  const days = Math.round((dayStart(t) - dayStart(now)) / DAY);
  if (days === 0) return t - now >= 3600_000 ? s('inHours', { n: Math.round((t - now) / 3600_000) }) : s('today');
  return days > 0 ? s('inDays', { n: days }) : s('daysAgo', { n: -days });
}

const KIND_ICON: Partial<Record<SkyEventKind, string>> = {
  'solar-eclipse': '◐', 'lunar-eclipse': '◑', 'meteor-shower': '✶', 'full-moon': '○', 'new-moon': '●', supermoon: '◯',
  equinox: '◒', solstice: '◓', opposition: '⊕', conjunction: '∴', elongation: '∠', transit: '⊙',
};

function icsUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function icsEsc(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** Whether `site` can actually observe `e` above the horizon during its observable window. */
export function isVisibleAtSite(e: SkyEvent, site: Site | null): boolean {
  if (!site) return true;
  if (e.kind === 'solar-eclipse') {
    const L = localSolar(e.solar!, site);
    return L.visible && L.type !== 'none';
  }
  if (e.kind === 'lunar-eclipse') {
    const l = e.lunar!;
    return [l.u1 ?? l.p1, l.t, l.u4 ?? l.p4].some(t => topocentric(t, site).moon.alt > 0);
  }
  if (e.kind === 'transit') return topocentric(e.t, site).sun.alt > 0;
  if (e.kind === 'meteor-shower') {
    const sh = SHOWERS.find(x => x.key === e.shower);
    if (!sh) return true;
    const d2r = Math.PI / 180;
    for (let u = e.t - 12 * 3600_000; u <= e.t + 12 * 3600_000; u += 3600_000) {
      if (topocentric(u, site).sun.alt >= -6) continue;
      const H = (gast(u) + site.lon - sh.ra) * d2r;
      const alt = Math.asin(Math.sin(site.lat * d2r) * Math.sin(sh.dec * d2r) + Math.cos(site.lat * d2r) * Math.cos(sh.dec * d2r) * Math.cos(H)) / d2r;
      if (alt > 5) return true;
    }
    return false;
  }
  if (e.kind === 'opposition' || e.kind === 'conjunction' || e.kind === 'elongation') {
    const body = (e.bodies ?? []).find(b => b !== 'sun' && b !== 'earth' && b !== 'moon') as PlanetId | undefined;
    if (!body) return true;
    const d2r = Math.PI / 180;
    const g = planetGeo(body, e.t);
    for (let u = e.t - 12 * 3600_000; u <= e.t + 12 * 3600_000; u += 2 * 3600_000) {
      if (topocentric(u, site).sun.alt >= -4) continue;
      const H = (gast(u) + site.lon - g.ra) * d2r;
      const alt = Math.asin(Math.sin(site.lat * d2r) * Math.sin(g.dec * d2r) + Math.cos(site.lat * d2r) * Math.cos(g.dec * d2r) * Math.cos(H)) / d2r;
      if (alt > 5) return true;
    }
    return false;
  }
  return true;
}

/** Format a list of sky events as a clean bilingual Markdown ephemeris table. */
export function skyEventsToMarkdown(events: readonly SkyEvent[], site: Site | null, year: number): string {
  const zh = lang() === 'zh';
  const place = site?.name ?? s('bestSpot');
  const lines = [
    `# Terrastra ${s('title')} · ${year} (${place})`,
    '',
    zh ? '| 日期 (UTC) | 天象 | 观测提示 |' : '| Date (UTC) | Event | Circumstances |',
    '| --- | --- | --- |',
  ];
  for (const e of events) {
    const iso = new Date(e.t).toISOString().slice(0, 16).replace('T', ' ');
    const title = eventTitle(e).replace(/\|/g, '\\|');
    const note = (seenFrom(e, site) || '—').replace(/\|/g, '\\|');
    lines.push(`| ${iso} | ${title} | ${note} |`);
  }
  return lines.join('\n') + '\n';
}

/** Format a list of sky events as an RFC 5545 iCalendar (.ics) document. */
export function skyEventsToIcs(events: readonly SkyEvent[], site: Site | null, year: number): string {
  const stamp = icsUtc(Date.now());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Terrastra//Sky Events Ephemeris//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:Terrastra Sky Events ${year}`,
  ];
  for (const e of events) {
    const t0 = e.solar?.p1 ?? e.lunar?.p1 ?? (e.t - 30 * 60_000);
    const t1 = e.solar?.p4 ?? e.lunar?.p4 ?? (e.t + 60 * 60_000);
    const title = eventTitle(e);
    const desc = seenFrom(e, site) || title;
    lines.push(
      'BEGIN:VEVENT',
      `UID:terrastra-sky-${e.id}@terrastra.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsUtc(t0)}`,
      `DTEND:${icsUtc(Math.max(t0 + 60_000, t1))}`,
      `SUMMARY:${icsEsc(title)}`,
      ...(site?.name ? [`LOCATION:${icsEsc(site.name)}`] : []),
      ...(site && Number.isFinite(site.lat) && Number.isFinite(site.lon) ? [`GEO:${site.lat.toFixed(4)};${site.lon.toFixed(4)}`] : []),
      `DESCRIPTION:${icsEsc(desc)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(l => foldIcsLine(l)).join('\r\n') + '\r\n';
}

export class Calendar {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private yearEl: HTMLElement;
  private chips: HTMLElement;
  private searchInput: HTMLInputElement;
  private hereBtn: HTMLButtonElement;
  private countEl: HTMLElement;
  private query = '';
  private onlyVisibleHere = false;
  private year = new Date().getFullYear();
  private filter: Filter = 'top';
  active: string | null = null;

  constructor(private site: () => Site | null, private pick: (e: SkyEvent) => void) {
    this.yearEl = h('b', { class: 'skycal-year' });
    this.chips = h('div', { class: 'skycal-chips', role: 'tablist' });
    this.searchInput = h('input', {
      type: 'search',
      class: 'skycal-search',
      'data-testid': 'skycal-search',
      placeholder: s('calSearch'),
      'aria-label': s('calSearch'),
      oninput: () => {
        this.query = this.searchInput.value.trim().toLowerCase();
        this.renderListOnly();
      },
    }) as HTMLInputElement;
    this.hereBtn = h('button', {
      class: 'skycal-chip skycal-here',
      'data-testid': 'skycal-here',
      'aria-pressed': 'false',
      onclick: () => {
        this.onlyVisibleHere = !this.onlyVisibleHere;
        this.hereBtn.classList.toggle('on', this.onlyVisibleHere);
        this.hereBtn.setAttribute('aria-pressed', String(this.onlyVisibleHere));
        this.renderListOnly();
      },
    }, s('calVisibleHere')) as HTMLButtonElement;
    this.countEl = h('small', { class: 'skycal-count', 'data-testid': 'skycal-count' });
    this.list = h('ol', { class: 'skycal-list', style: 'position:relative' });
    this.el = h('aside', { class: 'skycal', 'aria-label': s('list') },
      h('header', { class: 'skycal-head' },
        h('span', { class: 'skycal-kicker' }, (lang() === 'zh' ? '' : 'EPHEMERIS · ') + s('list')),
        h('div', { class: 'skycal-years' },
          h('button', { class: 'sky-btn sky-btn-sq', 'data-testid': 'skycal-today', title: s('calToday'), 'aria-label': s('calToday'), html: icon('reset', 16), onclick: () => { this.year = new Date().getFullYear(); this.render(); } }),
          h('button', { class: 'sky-btn sky-btn-sq', 'aria-label': '−1', html: icon('collapse', 18), onclick: () => this.go(-1) }),
          this.yearEl,
          h('button', { class: 'sky-btn sky-btn-sq', 'aria-label': '+1', html: icon('chevron', 18), onclick: () => this.go(1) }),
          h('button', { class: 'sky-btn sky-btn-sq', 'data-testid': 'skycal-md', title: s('calCopyMd'), 'aria-label': s('calCopyMd'), html: icon('copy', 15), onclick: () => void this.copyMd() }),
          h('button', { class: 'sky-btn sky-btn-sq', 'data-testid': 'skycal-ics', title: s('calExportIcs'), 'aria-label': s('calExportIcs'), html: icon('calendar', 16), onclick: () => this.exportIcs() }))),
      this.chips,
      h('div', { class: 'skycal-search-wrap' },
        this.searchInput,
        h('div', { class: 'skycal-subbar' }, this.hereBtn, this.countEl)),
      this.list,
      h('p', { class: 'skycal-tz' }, s('calTz', { z: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' })));
    this.render();
  }

  private currentYearEvents(): SkyEvent[] {
    const y = this.year;
    const site = this.site();
    const q = this.query;
    return [...eventsOf(y - 1), ...eventsOf(y), ...eventsOf(y + 1)].filter(e => {
      if (new Date(e.t).getFullYear() !== y || !match(e, this.filter)) return false;
      if (this.onlyVisibleHere && site && !isVisibleAtSite(e, site)) return false;
      if (!q) return true;
      return (
        eventTitle(e).toLowerCase().includes(q) ||
        seenFrom(e, site).toLowerCase().includes(q) ||
        e.kind.toLowerCase().includes(q)
      );
    });
  }

  private async copyMd(): Promise<void> {
    const evs = this.currentYearEvents();
    if (!evs.length) return;
    const md = skyEventsToMarkdown(evs, this.site(), this.year);
    try {
      await navigator.clipboard.writeText(md);
    } catch {
      // ignore clipboard denial in non-secure contexts
    }
    toast(s('calMdCopied'));
  }

  private exportIcs(): void {
    if (!canUsePro()) {
      openPaywall(t('proReasonSkyIcs'), () => this.exportIcs());
      return;
    }
    const evs = this.currentYearEvents();
    if (!evs.length) return;
    const ics = skyEventsToIcs(evs, this.site(), this.year);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `terrastra-sky-${this.year}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  private go(d: number): void {
    const target = Math.max(1900, Math.min(2199, this.year + d));
    if (!canUsePro() && !isFreeSkyYear(target)) {
      openPaywall(t('proReasonSkyYear'), () => { this.year = target; this.render(); });
      return;
    }
    this.year = target;
    this.render();
  }
  showYear(y: number): void { if (y !== this.year) { this.year = y; this.render(); } }

  render(): void {
    const hasSite = !!this.site();
    this.yearEl.textContent = String(this.year);
    this.searchInput.placeholder = s('calSearch');
    this.searchInput.setAttribute('aria-label', s('calSearch'));
    this.hereBtn.textContent = s('calVisibleHere');
    this.hereBtn.hidden = !hasSite;
    this.chips.replaceChildren(...FILTERS.map(f => h('button', {
      class: 'skycal-chip' + (f === this.filter ? ' on' : ''), role: 'tab', 'aria-selected': String(f === this.filter),
      onclick: () => { this.filter = f; this.render(); },
    }, s(`f_${f}` as SkyKey))));
    this.renderListOnly();
  }

  private renderListOnly(): void {
    const now = Date.now(), site = this.site();
    const evs = this.currentYearEvents();
    this.countEl.textContent = s('calCount', { n: evs.length });
    if (!evs.length) { this.list.replaceChildren(h('li', { class: 'skycal-empty' }, s('empty'))); return; }
    const l = lang(), nextIdx = evs.findIndex(e => e.t > now);
    this.list.replaceChildren(...evs.map((e, i) => {
      const d = new Date(e.t);
      const md = l === 'zh' ? `${d.getMonth() + 1}月${d.getDate()}日` : d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
      const wk = d.toLocaleDateString(l === 'zh' ? 'zh-CN' : 'en', { weekday: 'short' });
      const past = e.t < now - DAY;
      return h('li', {},
        h('button', {
          class: 'skycal-item' + (e.id === this.active ? ' on' : '') + (past ? ' past' : '') + (i === nextIdx ? ' next' : ''),
          'data-kind': e.kind, 'data-id': e.id, onclick: () => this.pick(e),
        },
          h('span', { class: 'skycal-glyph', 'aria-hidden': 'true' }, KIND_ICON[e.kind] ?? '·'),
          h('span', { class: 'skycal-date' }, h('b', {}, md), h('small', {}, `${wk} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)),
          h('span', { class: 'skycal-main' }, h('b', {}, eventTitle(e)), h('small', {}, seenFrom(e, site))),
          h('span', { class: 'skycal-cd' }, i === nextIdx ? h('em', {}, s('next')) : null, countdown(e.t, now))));
    }));
    // scrollIntoView would also scroll the clipped stage to reveal a closed drawer: scroll only the list
    const it = this.list.querySelector<HTMLElement>('.on, .next');
    if (it) this.list.scrollTop = Math.max(0, it.offsetTop - this.list.clientHeight / 3);
  }
}
