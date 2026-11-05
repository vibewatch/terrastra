/** The compare bench modal: one measure per group, true scale or clearly-marked enlarged view. */
import { h, openModal } from './dom.ts';
import { Select } from './select.ts';
import { icon } from './icons.ts';
import { t, lang, fmtNum } from '../lib/i18n.ts';
import { tr, type CatalogueItem } from '../../shared/data/types.ts';
import { CATALOGUE, BY_KEY } from '../../shared/data/catalogue.ts';
import { sfx } from '../lib/sfx.ts';
import { compareGroups, groupOf, ratio, drawn, type Group, type Thing } from '../lib/compare.ts';
import { antipodeOf, formatCoordPair, greatCircleSummary, nearestCatalogueItem } from '../../shared/lib/geodesic.ts';

export interface CompareOptions {
  onShowArc?: (a: [number, number], b: [number, number]) => void;
  onFlyTo?: (lat: number, lon: number) => void;
}

const SVG = 'http://www.w3.org/2000/svg';
const W = 520, H = 250, BASE = 228, MAX = 200;
const COL = ['#ffb347', '#6cc6ff'];

function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
}

function formatDurationHours(hours: number, l: 'en' | 'zh'): string {
  if (hours <= 0) return '0s';
  const totalSec = Math.round(hours * 3600);
  if (totalSec < 60) return l === 'zh' ? `${totalSec} 秒` : `${totalSec} s`;
  if (hours < 1) {
    const m = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return l === 'zh' ? (sec ? `${m} 分 ${sec} 秒` : `${m} 分钟`) : (sec ? `${m}m ${sec}s` : `${m} min`);
  }
  if (hours < 48) {
    const hInt = Math.floor(hours);
    const m = Math.round((hours - hInt) * 60);
    return l === 'zh' ? (m ? `${hInt} 小时 ${m} 分` : `${hInt} 小时`) : (m ? `${hInt}h ${m}m` : `${hInt} h`);
  }
  const days = Math.round((hours / 24) * 10) / 10;
  return l === 'zh' ? `${fmtNum(days)} 天` : `${fmtNum(days)} days`;
}

function earthPlaces(ensureKeys: string[]): CatalogueItem[] {
  const list = CATALOGUE.filter(it => !it.route && (it.tier <= 2 || ensureKeys.includes(it.key)));
  return list;
}

export function openCompare(start?: string, opts?: CompareOptions): void {
  const groups = compareGroups();
  const isDistStart = start === 'dist' || Boolean(start?.startsWith('dist:'));
  const distInitKey = start?.startsWith('dist:') ? start.slice(5) : undefined;
  let mode: 'scale' | 'dist' = isDistStart ? 'dist' : 'scale';
  let g: Group = (!isDistStart && start && groupOf(start)) || groups[0];
  let pair: [string, string] = !isDistStart && start && groupOf(start) ? [start, g.pair[0] === start ? g.pair[1] : g.pair[0]] : [...g.pair];
  let scale: 'true' | 'zoom' = 'true';
  const defaultA = distInitKey && BY_KEY.has(distInitKey) ? distInitKey : 'eiffel';
  const defaultB = defaultA === 'liberty' ? 'greatwall' : 'liberty';
  let distPair: [string, string] = [defaultA, defaultB];

  const fmt = (th: Thing) => fmtNum(th.size) + (g.unit === 'km' ? (lang() === 'zh' ? ' 公里' : ' km') : g.unit === 'kmh' ? (lang() === 'zh' ? ' 公里/时' : ' km/h') : (lang() === 'zh' ? ' 米' : ' m'));
  const bars = () => g.id === 'long' || g.id === 'fast';
  const tabs = h('div', { class: 'cmp-tabs', role: 'group', 'aria-label': t('compare') });
  const pickers = h('div', { class: 'cmp-picks' });
  const scales = h('div', { class: 'cmp-scale', role: 'group' });
  const stage = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'cmp-stage', role: 'img', 'data-testid': 'cmp-stage' });
  const ratioP = h('p', { class: 'cmp-ratio', 'data-testid': 'cmp-ratio', 'aria-live': 'polite' });
  const note = h('p', { class: 'cmp-note', 'data-testid': 'cmp-note' });
  const distDetails = h('div', { class: 'cmp-dist-details hidden', 'data-testid': 'cmp-dist-details' });

  const renderDist = () => {
    const l = lang();
    const places = earthPlaces(distPair);
    const a = places.find(p => p.key === distPair[0]) ?? places[0];
    const b = places.find(p => p.key === distPair[1]) ?? places[1] ?? places[0];
    distPair = [a.key, b.key];

    pickers.replaceChildren(...[0, 1].map(i => h('div', { class: 'cmp-pick' },
      h('span', { class: 'dot', style: `background:${COL[i]}` }),
      h('span', { class: 'muted small' }, t(i ? 'cmpPickB' : 'cmpPickA')),
      new Select({
        testid: 'cmp-pick-' + i,
        label: t(i ? 'cmpPickB' : 'cmpPickA'),
        className: 'xsel-wide',
        value: distPair[i],
        options: places.map(it => ({ value: it.key, label: `${it.emoji} ${tr(it.name, l)} · ${formatCoordPair(it.lat, it.lon)}` })),
        onChange: v => { distPair[i] = v; render(); },
      }).el)));

    scales.replaceChildren(
      h('button', {
        class: 'pill pill-sm',
        'data-testid': 'cmp-dist-swap',
        onclick: () => { sfx.tap(); distPair = [distPair[1], distPair[0]]; render(); },
      }, h('span', { html: icon('shuffle', 13) }), ' ', t('cmpDist.swap')),
    );

    const summary = greatCircleSummary(a, b);
    const nameA = tr(a.name, l);
    const nameB = tr(b.name, l);
    const kmRounded = fmtNum(Math.round(summary.distanceKm));
    ratioP.textContent = a.key === b.key
      ? t('cmpDist.samePlace', { a: nameA })
      : t('cmpDist.summary', {
          a: nameA,
          b: nameB,
          km: kmRounded,
          pct: summary.circumferencePct.toFixed(1),
          deg: Math.round(summary.bearingDeg),
          dir: t('dir_' + summary.compassDir),
          solar: (summary.solarOffsetHours >= 0 ? '+' : '') + summary.solarOffsetHours.toFixed(1),
        });
    note.className = 'cmp-note';
    note.textContent = t('cmpDist.note');
    stage.setAttribute('aria-label', `${ratioP.textContent} ${note.textContent}`);
    stage.setAttribute('data-scale', 'true');

    // Cross-section globe diagram with Place A, Place B, great-circle surface arc, interior chord, and Antipode of A
    const cx = W / 2, cy = 126, r = 86;
    const theta = Math.min(Math.PI, summary.distanceKm / 6371);
    const angA = -Math.PI / 2 - theta / 2;
    const angB = -Math.PI / 2 + theta / 2;
    const angAnti = angA + Math.PI;
    const pt = (ang: number, rad = r): [number, number] => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)];
    const [ax, ay] = pt(angA);
    const [bx, by] = pt(angB);
    const [antix, antiy] = pt(angAnti);
    const largeArc = theta > Math.PI ? 1 : 0;

    const kids: SVGElement[] = [
      s('circle', { cx, cy, r, fill: 'rgba(14, 34, 58, 0.55)', stroke: 'rgba(125, 211, 252, 0.35)', 'stroke-width': 1.5 }),
      s('line', { x1: ax, y1: ay, x2: antix, y2: antiy, stroke: 'rgba(148, 163, 184, 0.35)', 'stroke-width': 1, 'stroke-dasharray': '3 3' }),
      s('line', { x1: ax, y1: ay, x2: bx, y2: by, stroke: 'rgba(255, 179, 71, 0.45)', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }),
      s('path', { d: `M ${ax.toFixed(1)} ${ay.toFixed(1)} A ${r} ${r} 0 ${largeArc} 1 ${bx.toFixed(1)} ${by.toFixed(1)}`, fill: 'none', stroke: '#38bdf8', 'stroke-width': 3.5 }),
      s('circle', { cx: ax, cy: ay, r: 5, fill: COL[0] }),
      s('circle', { cx: bx, cy: by, r: 5, fill: COL[1] }),
      s('circle', { cx: antix, cy: antiy, r: 4, fill: 'none', stroke: '#f472b6', 'stroke-width': 2 }),
      s('text', { x: cx - 120, y: 28, 'text-anchor': 'middle', class: 'cmp-lbl', fill: COL[0] }, `${a.emoji} ${nameA}`),
      s('text', { x: cx + 120, y: 28, 'text-anchor': 'middle', class: 'cmp-lbl', fill: COL[1] }, `${b.emoji} ${nameB}`),
      s('text', { x: cx, y: cy + 5, 'text-anchor': 'middle', class: 'cmp-lbl', fill: '#bae6fd' }, `${kmRounded} km (${Math.round((theta * 180) / Math.PI)}°)`),
      s('text', { x: antix, y: Math.min(H - 8, antiy + 18), 'text-anchor': 'middle', class: 'cmp-badge', fill: '#f472b6' }, `${t('antipode.label')}: ${formatCoordPair(...antipodeOf(a.lat, a.lon))}`),
    ];
    stage.replaceChildren(...kids);

    const [antiLat, antiLon] = antipodeOf(a.lat, a.lon);
    const nearAnti = nearestCatalogueItem(antiLat, antiLon, CATALOGUE, a.key);
    const travelItems: [string, string][] = [
      ['🚶 ' + t('cmpDist.walk'), formatDurationHours(summary.travelHours.walk, l)],
      ['🚄 ' + t('cmpDist.train'), formatDurationHours(summary.travelHours.train, l)],
      ['✈️ ' + t('cmpDist.jet'), formatDurationHours(summary.travelHours.jet, l)],
      ['🌋 ' + t('cmpDist.seismic'), formatDurationHours(summary.travelHours.seismicP, l)],
      ['🛰️ ' + t('cmpDist.iss'), formatDurationHours(summary.travelHours.iss, l)],
      ['💡 ' + t('cmpDist.light'), `${summary.lightMs.toFixed(1)} ms`],
    ];

    distDetails.classList.remove('hidden');
    distDetails.replaceChildren(
      h('div', { class: 'cmp-travel-box' },
        h('h4', { class: 'cmp-subhead' }, t('cmpDist.travelTitle', { km: kmRounded })),
        h('dl', { class: 'cmp-travel-grid', 'data-testid': 'cmp-travel-grid' },
          ...travelItems.map(([k, v]) => h('div', { class: 'cmp-travel-cell' }, h('dt', {}, k), h('dd', {}, v))))),
      h('div', { class: 'cmp-antipode-card', 'data-testid': 'cmp-antipode-card' },
        h('div', { class: 'cmp-antipode-text' },
          h('strong', {}, t('cmpDist.antipodeTitle', { a: nameA })),
          h('p', { class: 'muted small' }, t('cmpDist.antipodeCoord', { coord: formatCoordPair(antiLat, antiLon) })),
          nearAnti ? h('p', { class: 'muted small' }, t('cmpDist.antipodeNear', {
            name: `${nearAnti.item.emoji} ${tr(nearAnti.item.name, l)}`,
            km: fmtNum(Math.round(nearAnti.distanceKm)),
          })) : null),
        opts?.onShowArc || opts?.onFlyTo ? h('div', { class: 'cmp-antipode-actions' },
          opts.onShowArc ? h('button', {
            class: 'pill pill-sm',
            'data-testid': 'cmp-fly-arc',
            onclick: () => { sfx.tap(); opts.onShowArc!([a.lat, a.lon], [b.lat, b.lon]); },
          }, h('span', { html: icon('compass', 13) }), ' ', t('cmpDist.showArc')) : null,
          opts.onFlyTo ? h('button', {
            class: 'pill pill-sm',
            'data-testid': 'cmp-fly-antipode',
            onclick: () => { sfx.tap(); opts.onFlyTo!(antiLat, antiLon); },
          }, h('span', { html: icon('globe', 13) }), ' ', t('cmpDist.flyAntipode')) : null) : null),
    );
  };

  const render = () => {
    tabs.replaceChildren(
      ...groups.map(x => h('button', {
        class: 'pill pill-sm' + (mode === 'scale' && x === g ? ' active' : ''),
        'aria-pressed': String(mode === 'scale' && x === g),
        'data-testid': 'cmp-g-' + x.id,
        onclick: () => { if (mode !== 'scale' || x !== g) { sfx.tap(); mode = 'scale'; g = x; pair = [...x.pair]; render(); } },
      }, t('cmp_' + x.id))),
      h('button', {
        class: 'pill pill-sm' + (mode === 'dist' ? ' active' : ''),
        'aria-pressed': String(mode === 'dist'),
        'data-testid': 'cmp-g-dist',
        onclick: () => { if (mode !== 'dist') { sfx.tap(); mode = 'dist'; render(); } },
      }, t('cmp_dist')),
    );

    if (mode === 'dist') {
      renderDist();
      return;
    }

    distDetails.classList.add('hidden');
    distDetails.replaceChildren();
    pickers.replaceChildren(...[0, 1].map(i => h('div', { class: 'cmp-pick' },
      h('span', { class: 'dot', style: `background:${COL[i]}` }), h('span', { class: 'muted small' }, t(i ? 'cmpPickB' : 'cmpPickA')),
      new Select({ testid: 'cmp-pick-' + i, label: t(i ? 'cmpPickB' : 'cmpPickA'), className: 'xsel-wide', value: pair[i],
        options: g.things.map(th => ({ value: th.id, label: `${th.emoji} ${tr(th.name, lang())} · ${fmt(th)}` })),
        onChange: v => { pair[i] = v; render(); } }).el)));
    scales.replaceChildren(...(['true', 'zoom'] as const).map(m => h('button', { class: 'pill pill-sm' + (m === scale ? ' active' : ''), 'aria-pressed': String(m === scale), 'data-testid': 'cmp-' + m,
      onclick: () => { scale = m; render(); } }, t(m === 'true' ? 'cmpTrue' : 'cmpZoom'))));

    const [a, b] = pair.map(id => g.things.find(x => x.id === id)!);
    const name = (x: Thing) => tr(x.name, lang());
    const m = t('cmpM_' + g.id);
    const r = ratio(a.size, b.size);
    ratioP.textContent = r.times < 1.05 ? t('cmpSame', { m }) : t('cmpRatio', { m, a: name(r.big ? b : a), b: name(r.big ? a : b), n: fmtNum(r.times) });
    const d = drawn(a.size, b.size, bars() ? 440 : MAX, scale);
    const small = r.big ? a : b;
    const tiny = d.tiny[0] ? a : d.tiny[1] ? b : null;
    note.className = 'cmp-note' + (scale === 'zoom' ? ' warn' : '');
    note.textContent = scale === 'zoom' && a.size !== b.size ? t('cmpZoomNote', { name: name(small), n: fmtNum(r.times) })
      : tiny ? t('cmpTrueNote') + (lang() === 'zh' ? '' : ' ') + t('cmpTiny', { name: name(tiny) }) : t('cmpTrueNote');
    stage.setAttribute('aria-label', `${ratioP.textContent} ${note.textContent}`);
    stage.setAttribute('data-scale', scale);

    const kids: SVGElement[] = bars() ? [] : [s('line', { x1: 10, x2: W - 10, y1: BASE, y2: BASE, class: 'cmp-ground' })];
    const label = (x: number, y: number, th: Thing, i: number, anchor = 'middle') =>
      kids.push(s('text', { x, y, 'text-anchor': anchor, class: 'cmp-lbl', fill: COL[i] }, `${th.emoji} ${name(th)} · ${fmt(th)}`));
    [a, b].forEach((th, i) => {
      const px = Math.max(d.px[i], 2);
      const dashed: Record<string, string> = scale === 'zoom' && th === small && a.size !== b.size ? { 'stroke-dasharray': '6 4' } : {};
      if (g.id === 'bodies') {
        const cx = W * (i ? 0.73 : 0.27);
        kids.push(s('circle', { cx, cy: BASE - px / 2, r: px / 2, fill: COL[i], 'fill-opacity': 0.85, stroke: COL[i], 'stroke-width': 2, ...dashed }));
        label(cx, Math.min(BASE - px - 8, BASE - 12), th, i);
      } else if (g.id === 'tall') {
        const x = W * (i ? 0.62 : 0.3), w = 54;
        kids.push(s('rect', { x, y: BASE - px, width: w, height: px, rx: 3, fill: COL[i], 'fill-opacity': 0.85, stroke: COL[i], 'stroke-width': 2, ...dashed }));
        label(x + w / 2, Math.max(BASE - px - 8, 14), th, i);
      } else {
        const y = i ? 150 : 70;
        kids.push(s('rect', { x: 40, y, width: px, height: 30, rx: 6, fill: COL[i], 'fill-opacity': 0.85, stroke: COL[i], 'stroke-width': 2, ...dashed }));
        label(40, y - 10, th, i, 'start');
      }
      if (scale === 'zoom' && th === small && a.size !== b.size) {
        const [x, y] = g.id === 'bodies' ? [W * (i ? 0.73 : 0.27), BASE - px / 2 + 6] : g.id === 'tall' ? [W * (i ? 0.62 : 0.3) + 27, BASE - px / 2] : [40 + px / 2, (i ? 150 : 70) + 20];
        kids.push(s('text', { x, y, 'text-anchor': 'middle', class: 'cmp-x' }, '×' + fmtNum(r.times)));
      }
    });
    if (scale === 'zoom') kids.push(s('text', { x: W - 12, y: H - 6, 'text-anchor': 'end', class: 'cmp-badge' }, t('cmpZoom')));
    stage.replaceChildren(...kids);
  };
  render();
  openModal('compare', t('compare'), h('div', { class: 'cmp', 'data-testid': 'compare' },
    h('p', { class: 'muted' }, t('cmpIntro')), tabs, pickers, scales, stage, ratioP, note, distDetails,
    h('p', { class: 'muted small cmp-src' }, h('span', { html: icon('ruler', 13) }), h('span', {}, t('cmpSource')))), { wide: true });
}
