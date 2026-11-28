/** "Tonight from my city": a hand-picked city (no GPS), the dark window, Moon, planets, meteor showers and events ahead. */
import { h, openModal, closeModal, toast } from './dom.ts';
import { Select } from './select.ts';
import { icon } from './icons.ts';
import { t, lang, fmtNum } from '../lib/i18n.ts';
import { load, save } from '../lib/storage.ts';
import { classroom } from '../lib/classroom.ts';
import { sfx } from '../lib/sfx.ts';
import { fetchNightCloudForecast, type NightCloudForecast } from '../lib/weather.ts';
import { predictIssPasses } from '../lib/iss.ts';
import { tr } from '../../shared/data/types.ts';
import { SHOWERS } from '../../shared/data/showers.ts';
import { CONSTELLATIONS } from '../../shared/data/constellations.ts';
import { MESSIER, type ScaleId } from '../../shared/data/cosmos.ts';
import { tonight, foldIcsLine, type EventAhead, type Tonight } from '../../shared/lib/astro/tonight.ts';
import { SITES, nearestSite } from '../sky/text.ts';
import { eventTitle, bodyName } from '../sky/acts.ts';
import { zoneOffset, localClock } from '../sky/common.ts';

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const dir = (az: number) => t('dir_' + DIRS[Math.round(az / 45) % 8]);
const LASTS = new Set(['opposition', 'conjunction', 'elongation', 'supermoon']);
const fmtMag = (m: number) => (m > 0 ? `+${m.toFixed(1)}` : m.toFixed(1));
const DAY_MS = 86_400_000;
const SCALE_ROUTE_HEAD: Record<ScaleId, string> = {
  solar: 'solar',
  stars: 'nearbystars',
  galaxy: 'milkyway',
  group: 'localgroup',
  laniakea: 'laniakea',
  universe: 'universe',
};
const conLabel = (id: string, l: 'en' | 'zh') => {
  const c = CONSTELLATIONS.find(x => x.id === id);
  return c ? tr(c.name, l) : id.toUpperCase();
};

function icsUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

export function buildObservingIcs(opts: {
  city: string;
  lat?: number;
  lon?: number;
  startMs: number;
  endMs: number;
  summary: string;
  description: string;
  nowMs?: number;
}): string {
  const stamp = icsUtc(opts.nowMs ?? Date.now());
  const start = icsUtc(opts.startMs);
  const end = icsUtc(Math.max(opts.endMs, opts.startMs + 30 * 60_000));
  const slug = opts.city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site';
  const uid = `terrastra-${opts.startMs}-${slug}@terrastra.space`;
  const lines = [
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
    ...(opts.lat != null && opts.lon != null && Number.isFinite(opts.lat) && Number.isFinite(opts.lon)
      ? [`GEO:${opts.lat.toFixed(4)};${opts.lon.toFixed(4)}`]
      : []),
    `DESCRIPTION:${icsEscape(opts.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(l => foldIcsLine(l)).join('\r\n') + '\r\n';
}

export function formatTonightPlanMarkdown(opts: {
  city: string;
  dateStr: string;
  winLabel: string;
  skySummary: string;
  moonSummary: string;
  data: Tonight;
  hm: (ms: number) => string;
}): string {
  const l = lang();
  const lines = [
    `# ${opts.city} — ${t('tonight')} (${opts.dateStr})`,
    '',
    `- **${t('tnPlanner.title')}**: ${opts.winLabel} ${opts.skySummary}`,
    `- **${t('tnMoonT')}**: ${opts.moonSummary}`,
  ];
  if (opts.data.planets.length) {
    lines.push('', `## ${t('tnPlanetsT')}`);
    for (const p of opts.data.planets) {
      lines.push(`- **${bodyName(p.id)}** (${t('tnMag', { m: fmtMag(p.mag) })} · ${t('tnPlanetTele', { d: p.diskArcsec.toFixed(1), e: p.elongDeg })} · ${t('tnInConst', { c: conLabel(p.constellationId, l) })}) · ${t('tnWhen_' + p.when)} · ${t('tnLook', { d: dir(p.az), a: Math.round(p.alt) })} · ${t('tnBest', { t: opts.hm(p.best) })}`);
    }
  }
  if (opts.data.constellations.length) {
    lines.push('', `## ${t('tnConstT')}`);
    for (const c of opts.data.constellations) {
      const con = CONSTELLATIONS.find(x => x.id === c.id);
      if (!con) continue;
      const star = con.named?.[c.starIndex];
      const starNote = star
        ? t('tnConstStar', { s: tr(star, l), m: fmtMag(c.brightestMag) })
        : t('tnConstMag', { m: fmtMag(c.brightestMag) });
      lines.push(`- **${tr(con.name, l)}** · ${starNote} · ${t('tnLook', { d: dir(c.az), a: Math.round(c.alt) })}`);
    }
  }
  if (opts.data.deepSky.length) {
    lines.push('', `## ${t('tnDeepSkyT')}`);
    for (const d of opts.data.deepSky) {
      const obj = MESSIER.find(x => x.key === d.key);
      if (!obj) continue;
      lines.push(`- **M${d.messier} ${tr(obj.name, l)}** (${t('tnInConst', { c: conLabel(d.constellationId, l) })}) · ${t('tnLook', { d: dir(d.az), a: Math.round(d.alt) })} · ${t('tnBest', { t: opts.hm(d.best) })}`);
    }
  }
  const activeShowers = opts.data.showers.filter(x => x.rate >= 1 || Math.abs(x.daysToPeak) < 3);
  if (activeShowers.length) {
    lines.push('', `## ${t('tnShowersT')}`);
    for (const x of activeShowers) {
      const sh = SHOWERS.find(y => y.key === x.key);
      if (!sh) continue;
      lines.push(`- **${tr(sh.name, l)}** · ~${Math.max(1, Math.round(x.moonlitRate))}/hr (${t('tnBest', { t: opts.hm(x.best) })})`);
    }
  }
  return lines.join('\n') + '\n';
}

export function openTonight(
  open: (hash: string) => void,
  now = Date.now(),
  globeCenter?: () => { lat: number; lon: number },
): void {
  let siteId = load<string>('tonightSite', '');
  let dayOffset = 0;
  let forecast: NightCloudForecast | null = null;
  let forecastKey = '';
  let loadingForecast = false;
  let reqSeq = 0;

  const body = h('div', { class: 'tn-body', 'aria-live': 'polite' });
  const selectObj = new Select({ testid: 'tn-city', label: t('tnCity'), icon: 'pin', className: 'xsel-wide', value: siteId, placeholder: t('tnPick'),
    options: SITES.map(x => ({ value: x.id, label: tr(x.name, lang()) })),
    onChange: v => { reqSeq++; siteId = v; forecast = null; forecastKey = ''; loadingForecast = false; save('tonightSite', siteId); render(); } });
  const select = selectObj.el;
  const matchGlobeBtn = globeCenter ? h('button', {
    class: 'pill pill-sm',
    'data-testid': 'tn-nearest-globe',
    onclick: () => {
      sfx.tap();
      const g = globeCenter();
      const nearest = nearestSite(g.lat, g.lon);
      reqSeq++;
      siteId = nearest.id;
      selectObj.value = siteId;
      forecast = null;
      forecastKey = '';
      loadingForecast = false;
      save('tonightSite', siteId);
      render();
    },
  }, h('span', { html: icon('globe', 14) }), h('span', {}, t('tnNearestGlobe'))) : null;

  const stepDay = (nextOffset: number) => {
    sfx.tap();
    reqSeq++;
    dayOffset = Math.max(-365, Math.min(365, nextOffset));
    forecast = null;
    forecastKey = '';
    loadingForecast = false;
    render();
  };

  const render = () => {
    const site = SITES.find(x => x.id === siteId);
    if (!site) { body.replaceChildren(h('p', { class: 'muted', 'data-testid': 'tn-empty' }, t('tnChoose'))); return; }
    const targetNow = now + dayOffset * DAY_MS;
    const r = tonight(site, targetNow);
    const l = lang();
    const sp = l === 'zh' ? '' : ' ';
    const clock = (ms: number, date = false) => localClock(ms, zoneOffset(site.zone, ms), date, l);
    const hm = (ms: number) => clock(ms).replace(/ \(.*\)$/, '');
    const sec = (id: string, ic: Parameters<typeof icon>[0], title: string, ...kids: (Node | null)[]) =>
      h('section', { class: 'tn-sec', 'data-testid': 'tn-' + id }, h('h3', { html: icon(ic, 16) }, h('span', {}, title)), ...kids);
    const li = (...kids: (Node | string | null)[]) => h('li', {}, ...kids);

    const localDow = new Date(now + zoneOffset(site.zone, now) * 3600_000).getUTCDay();
    const satOffset = (6 - localDow + 7) % 7;
    const dateStepper = h('div', { class: 'tn-dates', 'data-testid': 'tn-dates' },
      h('button', { class: 'pill pill-sm', 'data-testid': 'tn-prev-day', onclick: () => stepDay(dayOffset - 1) }, t('tnDate.prev')),
      h('button', { class: 'pill pill-sm' + (dayOffset === 0 ? ' active' : ''), 'aria-pressed': String(dayOffset === 0), 'data-testid': 'tn-tonight', onclick: () => stepDay(0) }, t('tnDate.tonight')),
      h('button', { class: 'pill pill-sm', 'data-testid': 'tn-next-day', onclick: () => stepDay(dayOffset + 1) }, t('tnDate.next')),
      satOffset > 0 ? h('button', { class: 'pill pill-sm' + (dayOffset === satOffset ? ' active' : ''), 'aria-pressed': String(dayOffset === satOffset), 'data-testid': 'tn-weekend', onclick: () => stepDay(satOffset) }, t('tnDate.weekend')) : null,
    );

    const spanStr = (pair: [number, number] | null, fallback: string) => pair ? `${hm(pair[0])}–${hm(pair[1])}` : fallback;
    const night = r.polar === 'day' ? t('tnPolarDay') : r.polar === 'night' ? t('tnPolarNight')
      : t('tnNight', { a: hm(r.night![0]), b: hm(r.night![1]) }) + sp + (r.dark ? t('tnDark', { a: hm(r.dark[0]), b: hm(r.dark[1]) }) : t('tnNoDark'));
    const twilightNote = !r.polar && r.night ? h('p', { class: 'muted small tn-twilight', 'data-testid': 'tn-twilight' },
      t('tnTwilightStages', {
        c: spanStr(r.civilDark, '—'),
        n: spanStr(r.dark, '—'),
        a: spanStr(r.astroDark, t('tnNoAstroDark')),
      })) : null;
    const m = r.moon;
    const moonRiseSet = m.riseMs !== null && m.setMs !== null
      ? t('tnMoonRiseSet', { r: hm(m.riseMs), s: hm(m.setMs) })
      : m.riseMs !== null
        ? t('tnMoonRiseOnly', { r: hm(m.riseMs) })
        : m.setMs !== null
          ? t('tnMoonSetOnly', { s: hm(m.setMs) })
          : '';
    const moonTxt = t('tnMoon', { p: Math.round(m.illum * 100), phase: t(`tnStage_${m.stage}`) })
      + sp + t('tnMoonAgeDist', { age: m.ageDays.toFixed(1), dist: fmtNum(m.distKm) })
      + sp + t('tnMoonDiam', { d: m.diamArcmin.toFixed(1) })
      + sp + `(${t('tnInConst', { c: conLabel(m.constellationId, l) })})`
      + (moonRiseSet ? sp + moonRiseSet : '')
      + sp + (m.maxAlt <= 0 ? t('tnMoonDown') : t('tnMoonUp', { p: Math.round(m.upFrac * 100) }))
      + (m.washout ? sp + t('tnWashout') : '');

    const planets = r.planets.length ? h('ul', { class: 'tn-list' }, ...r.planets.map(p => li(
      h('button', {
        class: 'link tn-ev',
        'data-testid': 'tn-planet-link',
        onclick: () => { sfx.tap(); closeModal('tonight'); open('solar/' + p.id); },
      }, bodyName(p.id)),
      ' · ', t('tnMag', { m: fmtMag(p.mag) }),
      ' · ', t('tnPlanetTele', { d: p.diskArcsec.toFixed(1), e: p.elongDeg }),
      ' · ', t('tnInConst', { c: conLabel(p.constellationId, l) }),
      ' · ', t('tnWhen_' + p.when),
      ' · ', t('tnLook', { d: dir(p.az), a: Math.round(p.alt) }),
      ' · ', t('tnBest', { t: hm(p.best) }))))
      : h('p', { class: 'muted' }, t('tnNoPlanets'));

    const constList = r.constellations.length ? h('ul', { class: 'tn-list' }, ...r.constellations.map(c => {
      const con = CONSTELLATIONS.find(x => x.id === c.id)!;
      const star = con.named?.[c.starIndex];
      const starTxt = star
        ? t('tnConstStar', { s: tr(star, l), m: fmtMag(c.brightestMag) })
        : t('tnConstMag', { m: fmtMag(c.brightestMag) });
      return li(
        h('b', {}, tr(con.name, l)), ' · ', starTxt, ' · ',
        t('tnLook', { d: dir(c.az), a: Math.round(c.alt) }),
      );
    })) : h('p', { class: 'muted' }, t('tnNoConst'));

    const deepSkyList = r.deepSky.length ? h('ul', { class: 'tn-list' }, ...r.deepSky.map(d => {
      const obj = MESSIER.find(x => x.key === d.key)!;
      const kindKey = `tnDsoKind_${d.kind}` as Parameters<typeof t>[0];
      const route = `${SCALE_ROUTE_HEAD[d.scale]}/${d.key}`;
      return li(
        h('button', {
          class: 'link tn-ev',
          'data-testid': 'tn-dso',
          onclick: () => { sfx.tap(); closeModal('tonight'); open(route); },
        }, `${obj.emoji} M${d.messier} ${tr(obj.name, l)}`),
        ' · ', t(kindKey),
        ' · ', t('tnInConst', { c: conLabel(d.constellationId, l) }),
        ' · ', t('tnLook', { d: dir(d.az), a: Math.round(d.alt) }),
        ' · ', t('tnBest', { t: hm(d.best) }),
      );
    })) : h('p', { class: 'muted' }, t('tnNoDeepSky'));

    const showers = r.showers.filter(x => x.rate >= 1 || Math.abs(x.daysToPeak) < 3);
    const showerList = showers.length ? h('ul', { class: 'tn-list' }, ...showers.map(x => {
      const sh = SHOWERS.find(y => y.key === x.key)!;
      const d = Math.round(x.daysToPeak);
      const peak = t('tnPeak', { t: clock(x.peak, true) }) + ' ' + (d === 0 ? t('tnPeakNow') : d > 0 ? t('tnPeakIn', { n: d }) : t('tnPeakAgo', { n: -d }));
      const moonTrim = x.radiantAlt > 0 && x.moonlitRate < x.rate * 0.85
        ? sp + t('tnShowerMoonRate', { n: fmtNum(Math.max(1, Math.round(x.moonlitRate))) })
        : (m.washout ? sp + t('tnShowerMoon') : '');
      return li(h('b', {}, tr(sh.name, l)), ' · ', peak, h('br'),
        x.radiantAlt > 0 ? t('tnRate', { a: Math.round(x.radiantAlt), n: fmtNum(Math.max(1, Math.round(x.rate))), t: hm(x.best) }) : t('tnRadiantDown'),
        moonTrim);
    })) : h('p', { class: 'muted' }, t('tnNoShowers'));

    const where = (e: EventAhead) => e.here === 'up' ? t('tnHereUp', { a: Math.round(e.alt ?? 0) })
      : e.here === 'none' ? t('tnHereNone')
      : (e.here === 'day' ? t('tnHereDay') : t('tnHereBelow')) + (LASTS.has(e.ev.kind) ? sp + t('tnNearby') : '');
    const events = r.events.length ? h('ul', { class: 'tn-list' }, ...r.events.map(e => li(
      h('button', { class: 'link tn-ev', 'data-testid': 'tn-event', onclick: () => { closeModal('tonight'); open('sky/' + e.ev.id); } }, eventTitle(e.ev)),
      ' · ', t('tnPeak', { t: clock(e.ev.t, true) }), h('br'),
      h('span', { class: 'tn-here tn-' + e.here }, where(e)))))
      : h('p', { class: 'muted' }, t('tnNoEvents'));

    const win = r.dark ?? r.night ?? [targetNow + 2 * 3600_000, targetNow + 5 * 3600_000] as [number, number];
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
      ...r.deepSky.slice(0, 2).map(d => `M${d.messier}`),
      ...showers.slice(0, 2).map(x => tr(SHOWERS.find(y => y.key === x.key)!.name, lang())),
    ];

    const curFcKey = `${site.id}:${dayOffset}`;
    const canForecast = dayOffset >= 0 && dayOffset <= 6 && !classroom();
    const fc = forecastKey === curFcKey ? forecast : null;
    const bestWinStr = fc?.bestWindow ? `${hm(fc.bestWindow[0])}–${hm(fc.bestWindow[1])}` : `${hm(win[0])}–${hm(win[1])}`;
    const fcTone = fc ? (fc.verdictKey === 'wxClear' ? 'excellent' : fc.verdictKey === 'wxPartly' ? 'fair' : 'poor') : 'good';
    const forecastEl = fc
      ? h('p', { class: `tn-forecast tn-fc-${fcTone}`, 'data-testid': 'tn-forecast' },
          t(fc.verdictKey), ' · ',
          t('tnPlanner.cloudSummary', { avg: fc.meanCloudPct, best: bestWinStr, min: fc.bestCloudPct }))
      : null;

    const loadForecast = async () => {
      if (loadingForecast || !canForecast) return;
      sfx.tap();
      const seq = ++reqSeq;
      const targetKey = curFcKey;
      loadingForecast = true;
      render();
      try {
        const res = await fetchNightCloudForecast(site.lat, site.lon, win[0], win[1]);
        if (seq !== reqSeq || `${siteId}:${dayOffset}` !== targetKey) return;
        forecast = res;
        forecastKey = targetKey;
      } finally {
        if (seq === reqSeq && `${siteId}:${dayOffset}` === targetKey) {
          loadingForecast = false;
          render();
        }
      }
    };

    const issPasses = predictIssPasses(site.lat, site.lon, targetNow, 24, 10);
    const issShown = issPasses.slice(0, 3);
    const issList = issShown.length
      ? h('ul', { class: 'tn-list tn-iss-list' }, ...issShown.map(p => li(
          h('span', { class: `tn-iss-badge tn-iss-${p.quality}` }, t(`tnIss.${p.quality}`)),
          ' · ',
          t('tnIss.pass', {
            t: hm(p.maxTimeMs),
            a: p.maxElDeg,
            d: dir(p.maxAzDeg),
            d1: dir(p.startAzDeg),
            d2: dir(p.endAzDeg),
            m: p.durationMin,
          }),
        )))
      : h('p', { class: 'muted' }, t('tnIss.none'));
    const issSec = sec('iss', 'rocket', t('tnIss.title'),
      issList,
      h('div', { class: 'tn-iss-actions' },
        h('button', {
          class: 'pill pill-sm',
          'data-testid': 'tn-iss-track',
          onclick: () => { sfx.tap(); closeModal('tonight'); open('sp_iss'); },
        }, h('span', { html: icon('rocket', 14) }), h('span', {}, t('tnIss.track')))));

    const exportIcs = () => {
      sfx.tap();
      const cityName = tr(site.name, lang());
      const useWin = fc?.bestWindow ?? win;
      const visIss = issPasses.find(p => p.visible);
      const descParts = [
        winLabel,
        t(skyKey),
        topTargets.length ? `${t('tnPlanner.targets')}: ${topTargets.join(', ')}` : '',
        visIss ? `ISS: ${t('tnIss.pass', { t: hm(visIss.maxTimeMs), a: visIss.maxElDeg, d: dir(visIss.maxAzDeg), d1: dir(visIss.startAzDeg), d2: dir(visIss.endAzDeg), m: visIss.durationMin })}` : '',
        fc ? t('tnPlanner.cloudSummary', { avg: fc.meanCloudPct, best: bestWinStr, min: fc.bestCloudPct }) : '',
      ].filter(Boolean);
      const ics = buildObservingIcs({
        city: cityName,
        lat: site.lat,
        lon: site.lon,
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

    const copyMd = async () => {
      sfx.tap();
      const cityName = tr(site.name, l);
      const md = formatTonightPlanMarkdown({
        city: cityName,
        dateStr: clock(targetNow, true),
        winLabel,
        skySummary: t(skyKey),
        moonSummary: moonTxt,
        data: r,
        hm,
      });
      try {
        await navigator.clipboard.writeText(md);
      } catch {
        // ignore clipboard denial in non-secure contexts
      }
      toast(t('tnPlanner.mdCopied'));
    };

    const plannerSec = sec('planner', 'sparkle', t('tnPlanner.title'),
      h('p', {}, winLabel, sp, t(skyKey)),
      topTargets.length ? h('p', { class: 'muted small' }, `${t('tnPlanner.targets')}: ${topTargets.join(' · ')}`) : null,
      forecastEl,
      h('div', { class: 'tn-planner-actions' },
        canForecast ? h('button', {
          class: 'pill pill-sm',
          'data-testid': 'tn-forecast-btn',
          disabled: loadingForecast,
          onclick: () => void loadForecast(),
        }, h('span', { html: icon('cloud', 14) }), h('span', {}, t(loadingForecast ? 'tnPlanner.loadingWeather' : fc ? 'tnPlanner.refreshWeather' : 'tnPlanner.checkWeather'))) : null,
        h('button', {
          class: 'pill pill-sm',
          'data-testid': 'tn-export-ics',
          onclick: exportIcs,
        }, h('span', { html: icon('calendar', 14) }), h('span', {}, t('tnPlanner.exportIcs'))),
        h('button', {
          class: 'pill pill-sm',
          'data-testid': 'tn-copy-md',
          onclick: () => void copyMd(),
        }, h('span', { html: icon('copy', 14) }), h('span', {}, t('tnPlanner.copyMd')))));

    body.replaceChildren(
      h('div', { class: 'tn-when-row' },
        h('p', { class: 'tn-when' }, t('tnFor', { c: tr(site.name, l), d: clock(targetNow, true) })),
        dateStepper),
      plannerSec,
      sec('night', 'clock', t('tnNightT'), h('p', {}, night), twilightNote),
      sec('moon', 'eclipse', t('tnMoonT'), h('p', {}, moonTxt)),
      sec('planets', 'planet', t('tnPlanetsT'), planets),
      sec('constellations', 'star', t('tnConstT'), constList),
      sec('deepsky', 'telescope', t('tnDeepSkyT'), deepSkyList),
      issSec,
      sec('showers', 'star', t('tnShowersT'), showerList),
      sec('events', 'calendar', t('tnEventsT'), h('p', { class: 'muted small' }, t('tnEventsNote')), events),
      h('p', { class: 'tn-weather', 'data-testid': 'tn-weather', html: icon('cloud', 16) }, h('span', {}, t('tnWeather'))));
  };
  render();
  openModal('tonight', t('tonight'), h('div', { class: 'tn', 'data-testid': 'tonight' },
    h('p', { class: 'muted' }, t('tnIntro')),
    h('div', { class: 'tn-city' }, select, matchGlobeBtn),
    body), { wide: true });
}
