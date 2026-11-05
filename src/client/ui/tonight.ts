/** "Tonight from my city": a hand-picked city (no GPS), the dark window, Moon, planets, meteor showers and events ahead. */
import { h, openModal, closeModal, toast } from './dom.ts';
import { Select } from './select.ts';
import { icon } from './icons.ts';
import { t, lang, fmtNum } from '../lib/i18n.ts';
import { load, save } from '../lib/storage.ts';
import { classroom } from '../lib/classroom.ts';
import { sfx } from '../lib/sfx.ts';
import { fetchNightCloudForecast, type NightCloudForecast } from '../lib/weather.ts';
import { tr } from '../../shared/data/types.ts';
import { SHOWERS } from '../../shared/data/showers.ts';
import { tonight, type EventAhead } from '../../shared/lib/astro/tonight.ts';
import { SITES } from '../sky/text.ts';
import { eventTitle, bodyName } from '../sky/acts.ts';
import { zoneOffset, localClock } from '../sky/common.ts';

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const dir = (az: number) => t('dir_' + DIRS[Math.round(az / 45) % 8]);
const LASTS = new Set(['opposition', 'conjunction', 'elongation', 'supermoon']);

function icsUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

export function buildObservingIcs(opts: {
  city: string;
  startMs: number;
  endMs: number;
  summary: string;
  description: string;
  nowMs?: number;
}): string {
  const stamp = icsUtc(opts.nowMs ?? Date.now());
  const start = icsUtc(opts.startMs);
  const end = icsUtc(Math.max(opts.endMs, opts.startMs + 30 * 60_000));
  const uid = `terrastra-${opts.startMs}-${opts.city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@terrastra.space`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Terrastra//Observing Planner//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${icsEscape(opts.summary)}`,
    `LOCATION:${icsEscape(opts.city)}`,
    `DESCRIPTION:${icsEscape(opts.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export function openTonight(open: (hash: string) => void, now = Date.now()): void {
  let siteId = load<string>('tonightSite', '');
  let forecast: NightCloudForecast | null = null;
  let forecastSiteId = '';
  let loadingForecast = false;

  const body = h('div', { class: 'tn-body', 'aria-live': 'polite' });
  const select = new Select({ testid: 'tn-city', label: t('tnCity'), icon: 'pin', className: 'xsel-wide', value: siteId, placeholder: t('tnPick'),
    options: SITES.map(x => ({ value: x.id, label: tr(x.name, lang()) })),
    onChange: v => { siteId = v; forecast = null; forecastSiteId = ''; loadingForecast = false; save('tonightSite', siteId); render(); } }).el;

  const render = () => {
    const site = SITES.find(x => x.id === siteId);
    if (!site) { body.replaceChildren(h('p', { class: 'muted', 'data-testid': 'tn-empty' }, t('tnChoose'))); return; }
    const r = tonight(site, now);
    const sp = lang() === 'zh' ? '' : ' ';
    const clock = (ms: number, date = false) => localClock(ms, zoneOffset(site.zone, ms), date, lang());
    const hm = (ms: number) => clock(ms).replace(/ \(.*\)$/, '');
    const sec = (id: string, ic: Parameters<typeof icon>[0], title: string, ...kids: (Node | null)[]) =>
      h('section', { class: 'tn-sec', 'data-testid': 'tn-' + id }, h('h3', { html: icon(ic, 16) }, h('span', {}, title)), ...kids);
    const li = (...kids: (Node | string | null)[]) => h('li', {}, ...kids);

    const night = r.polar === 'day' ? t('tnPolarDay') : r.polar === 'night' ? t('tnPolarNight')
      : t('tnNight', { a: hm(r.night![0]), b: hm(r.night![1]) }) + sp + (r.dark ? t('tnDark', { a: hm(r.dark[0]), b: hm(r.dark[1]) }) : t('tnNoDark'));
    const m = r.moon;
    const moonTxt = t('tnMoon', { p: Math.round(m.illum * 100), phase: t(m.illum < 0.03 ? 'tnNew' : m.illum > 0.97 ? 'tnFull' : m.waxing ? 'tnWaxing' : 'tnWaning') })
      + sp + (m.maxAlt <= 0 ? t('tnMoonDown') : t('tnMoonUp', { p: Math.round(m.upFrac * 100) }))
      + (m.washout ? sp + t('tnWashout') : '');

    const planets = r.planets.length ? h('ul', { class: 'tn-list' }, ...r.planets.map(p => li(
      h('b', {}, bodyName(p.id)), ' · ', t('tnWhen_' + p.when), ' · ',
      t('tnLook', { d: dir(p.az), a: Math.round(p.alt) }), ' · ', t('tnBest', { t: hm(p.best) }))))
      : h('p', { class: 'muted' }, t('tnNoPlanets'));

    const showers = r.showers.filter(x => x.rate >= 1 || Math.abs(x.daysToPeak) < 3);
    const showerList = showers.length ? h('ul', { class: 'tn-list' }, ...showers.map(x => {
      const sh = SHOWERS.find(y => y.key === x.key)!;
      const d = Math.round(x.daysToPeak);
      const peak = t('tnPeak', { t: clock(x.peak, true) }) + ' ' + (d === 0 ? t('tnPeakNow') : d > 0 ? t('tnPeakIn', { n: d }) : t('tnPeakAgo', { n: -d }));
      return li(h('b', {}, tr(sh.name, lang())), ' · ', peak, h('br'),
        x.radiantAlt > 0 ? t('tnRate', { a: Math.round(x.radiantAlt), n: fmtNum(Math.max(1, Math.round(x.rate))), t: hm(x.best) }) : t('tnRadiantDown'),
        m.washout ? sp + t('tnShowerMoon') : '');
    })) : h('p', { class: 'muted' }, t('tnNoShowers'));

    const where = (e: EventAhead) => e.here === 'up' ? t('tnHereUp', { a: Math.round(e.alt ?? 0) })
      : e.here === 'none' ? t('tnHereNone')
      : (e.here === 'day' ? t('tnHereDay') : t('tnHereBelow')) + (LASTS.has(e.ev.kind) ? sp + t('tnNearby') : '');
    const events = r.events.length ? h('ul', { class: 'tn-list' }, ...r.events.map(e => li(
      h('button', { class: 'link tn-ev', 'data-testid': 'tn-event', onclick: () => { closeModal('tonight'); open('sky/' + e.ev.id); } }, eventTitle(e.ev)),
      ' · ', t('tnPeak', { t: clock(e.ev.t, true) }), h('br'),
      h('span', { class: 'tn-here tn-' + e.here }, where(e)))))
      : h('p', { class: 'muted' }, t('tnNoEvents'));

    const win = r.dark ?? r.night ?? [now + 2 * 3600_000, now + 5 * 3600_000] as [number, number];
    const winLabel = r.polar === 'day'
      ? t('tnPolarDay')
      : t('tnPlanner.window', { a: hm(win[0]), b: hm(win[1]) });
    const skyKey = r.polar === 'day'
      ? 'tnPlanner.skyBright'
      : (r.dark && !m.washout && m.upFrac < 0.35)
        ? 'tnPlanner.skyIdeal'
        : (!m.washout)
          ? 'tnPlanner.skyGood'
          : 'tnPlanner.skyMoonlit';

    const topTargets = [
      ...r.planets.slice(0, 3).map(p => bodyName(p.id)),
      ...showers.slice(0, 2).map(x => tr(SHOWERS.find(y => y.key === x.key)!.name, lang())),
    ];

    const fc = forecastSiteId === site.id ? forecast : null;
    const bestWinStr = fc?.bestWindow ? `${hm(fc.bestWindow[0])}–${hm(fc.bestWindow[1])}` : `${hm(win[0])}–${hm(win[1])}`;
    const fcTone = fc ? (fc.verdictKey === 'wxClear' ? 'excellent' : fc.verdictKey === 'wxPartly' ? 'fair' : 'poor') : 'good';
    const forecastEl = fc
      ? h('p', { class: `tn-forecast tn-fc-${fcTone}`, 'data-testid': 'tn-forecast' },
          t(fc.verdictKey), ' · ',
          t('tnPlanner.cloudSummary', { avg: fc.meanCloudPct, best: bestWinStr, min: fc.bestCloudPct }))
      : null;

    const loadForecast = async () => {
      if (loadingForecast || classroom()) return;
      sfx.tap();
      loadingForecast = true;
      render();
      try {
        const res = await fetchNightCloudForecast(site.lat, site.lon, win[0], win[1]);
        forecast = res;
        forecastSiteId = site.id;
      } finally {
        loadingForecast = false;
        render();
      }
    };

    const exportIcs = () => {
      sfx.tap();
      const cityName = tr(site.name, lang());
      const useWin = fc?.bestWindow ?? win;
      const descParts = [
        winLabel,
        t(skyKey),
        topTargets.length ? `${t('tnPlanner.targets')}: ${topTargets.join(', ')}` : '',
        fc ? t('tnPlanner.cloudSummary', { avg: fc.meanCloudPct, best: bestWinStr, min: fc.bestCloudPct }) : '',
      ].filter(Boolean);
      const ics = buildObservingIcs({
        city: cityName,
        startMs: useWin[0],
        endMs: useWin[1],
        summary: t('tnPlanner.icsSummary', { c: cityName }),
        description: descParts.join('\n'),
        nowMs: now,
      });
      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `terrastra-observing-${site.id}.ics`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(t('tnPlanner.icsSaved'));
    };

    const plannerSec = sec('planner', 'sparkle', t('tnPlanner.title'),
      h('p', {}, winLabel, sp, t(skyKey)),
      topTargets.length ? h('p', { class: 'muted small' }, `${t('tnPlanner.targets')}: ${topTargets.join(' · ')}`) : null,
      forecastEl,
      h('div', { class: 'tn-planner-actions' },
        !classroom() ? h('button', {
          class: 'pill pill-sm',
          'data-testid': 'tn-forecast-btn',
          disabled: loadingForecast,
          onclick: () => void loadForecast(),
        }, h('span', { html: icon('cloud', 14) }), h('span', {}, t(loadingForecast ? 'tnPlanner.loadingWeather' : fc ? 'tnPlanner.refreshWeather' : 'tnPlanner.checkWeather'))) : null,
        h('button', {
          class: 'pill pill-sm',
          'data-testid': 'tn-export-ics',
          onclick: exportIcs,
        }, h('span', { html: icon('calendar', 14) }), h('span', {}, t('tnPlanner.exportIcs')))));

    body.replaceChildren(
      h('p', { class: 'tn-when' }, t('tnFor', { c: tr(site.name, lang()), d: clock(now, true) })),
      plannerSec,
      sec('night', 'clock', t('tnNightT'), h('p', {}, night)),
      sec('moon', 'eclipse', t('tnMoonT'), h('p', {}, moonTxt)),
      sec('planets', 'planet', t('tnPlanetsT'), planets),
      sec('showers', 'star', t('tnShowersT'), showerList),
      sec('events', 'calendar', t('tnEventsT'), h('p', { class: 'muted small' }, t('tnEventsNote')), events),
      h('p', { class: 'tn-weather', 'data-testid': 'tn-weather', html: icon('cloud', 16) }, h('span', {}, t('tnWeather'))));
  };
  render();
  openModal('tonight', t('tonight'), h('div', { class: 'tn', 'data-testid': 'tonight' },
    h('p', { class: 'muted' }, t('tnIntro')),
    h('div', { class: 'tn-city' }, select),
    body), { wide: true });
}
