/**
 * Live Earth Information Panel: interactive seismic & space-weather monitor with
 * magnitude/depth filters synced to the 3D globe, depth legend, refresh controls,
 * and explicit live / cached (stale) / empty / offline-sample status indicators.
 */
import { h, openModal, closeModal } from './dom.ts';
import { icon } from './icons.ts';
import { t, lang, fmtNum } from '../lib/i18n.ts';
import { tr } from '../../shared/data/types.ts';
import { classroom } from '../lib/classroom.ts';
import { store, updateSettings } from '../store.ts';
import { sfx } from '../lib/sfx.ts';
import {
  DEFAULT_QUAKE_FILTER,
  fetchRecentQuakes,
  filterQuakes,
  getCachedQuakes,
  getQuakeFeedStatus,
  getQuakeFeedUpdatedAt,
  quakeDepthBand,
  type QuakeDepthBand,
  type QuakeEvent,
  type QuakeFilter,
} from '../lib/earthquakes.ts';
import { analyzeQuakeTectonics, summarizeQuakeFeed } from '../../shared/lib/tectonics.ts';
import { earthSolarSummary } from '../../shared/lib/sun.ts';
import { currentKpStatus, fetchKpStatus } from '../lib/weather.ts';
import { propagateIss, refreshIssTelemetry } from '../lib/iss.ts';
import type { Globe } from '../globe/scene.ts';

const DEPTH_SWATCH: Record<QuakeDepthBand, string> = {
  shallow: '#fd6138',
  intermediate: '#fac229',
  deep: '#ad6bfc',
};

function formatCoord(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;
}

function formatQuakeAge(q: QuakeEvent, isStale: boolean): string {
  if (!q.live || q.timeMs <= 0) return t('quake.demo');
  const ageMin = Math.max(1, Math.round((Date.now() - q.timeMs) / 60_000));
  const base = ageMin < 90 ? t('quake.agoMin', { m: ageMin }) : t('quake.agoHr', { h: Math.round(ageMin / 60) });
  return isStale ? `${base} · ${t('quake.stale')}` : base;
}

export function openLiveEarth(globe: Globe, onIss: () => void): void {
  const eqLayer = globe.layers?.earthquakes;
  let filter: QuakeFilter = eqLayer ? { ...eqLayer.filter } : { ...DEFAULT_QUAKE_FILTER };
  let allEvents: QuakeEvent[] = eqLayer?.allEvents.length ? eqLayer.allEvents : getCachedQuakes();
  let refreshing = false;

  const wrap = h('div', { class: 'live-earth', 'data-testid': 'live-earth' });

  const applyFilter = (next: Partial<QuakeFilter>) => {
    sfx.tap();
    filter = { ...filter, ...next };
    eqLayer?.setFilter(filter);
    globe.markDirty();
    render();
  };

  const refreshAll = async (force: boolean) => {
    if (refreshing) return;
    refreshing = true;
    render();
    try {
      const [ev] = await Promise.all([
        eqLayer ? eqLayer.refresh(force) : fetchRecentQuakes(force),
        !classroom() ? fetchKpStatus() : Promise.resolve(currentKpStatus()),
        !classroom() ? refreshIssTelemetry() : Promise.resolve(propagateIss(Date.now())),
      ]);
      allEvents = ev;
      globe.markDirty();
    } finally {
      refreshing = false;
      render();
    }
  };

  const render = () => {
    const rawStatus = refreshing ? 'loading' : getQuakeFeedStatus();
    const isClass = classroom();
    const updatedAt = getQuakeFeedUpdatedAt();
    const effStatus = isClass && !updatedAt ? 'classroom' : rawStatus;
    const statusLabelKey = effStatus === 'live'
      ? 'liveEarth.statusLive'
      : effStatus === 'stale'
        ? 'liveEarth.statusStale'
        : effStatus === 'empty'
          ? 'liveEarth.statusEmpty'
          : effStatus === 'classroom'
            ? 'liveEarth.statusClassroom'
            : effStatus === 'loading'
              ? 'liveEarth.statusLoading'
              : 'liveEarth.statusDemo';

    const timeFmt = updatedAt
      ? new Intl.DateTimeFormat(lang() === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date(updatedAt))
      : '';
    const updatedText = updatedAt
      ? t('liveEarth.updatedAt', { t: timeFmt })
      : isClass
        ? t('liveEarth.classroomNote')
        : t('liveEarth.sampleNote');

    const kp = currentKpStatus();
    const iss = propagateIss(Date.now());
    const sun = earthSolarSummary(globe.simTime ?? Date.now());
    const filtered = filterQuakes(allEvents, filter);
    const feedSum = summarizeQuakeFeed(filtered);
    const isStale = effStatus === 'stale';

    const magBtn = (m: number, label: string) => h('button', {
      class: 'pill pill-sm' + (filter.minMag === m ? ' active' : ''),
      'data-testid': `quake-mag-${m}`,
      'aria-pressed': String(filter.minMag === m),
      onclick: () => applyFilter({ minMag: m }),
    }, label);

    const depthBtn = (d: 'all' | QuakeDepthBand, label: string) => h('button', {
      class: 'pill pill-sm' + (filter.depth === d ? ' active' : ''),
      'data-testid': `quake-depth-${d}`,
      'aria-pressed': String(filter.depth === d),
      onclick: () => applyFilter({ depth: d }),
    }, label);

    const rows = filtered.map(q => {
      const l = lang();
      const band = quakeDepthBand(q.depthKm);
      const bandLabel = t(band === 'shallow' ? 'quake.bandShallow' : band === 'intermediate' ? 'quake.bandInter' : 'quake.bandDeep');
      const tec = analyzeQuakeTectonics(q.lat, q.lon);
      const boundaryLabel = t(`quake.boundary_${tec.boundaryKind}` as const);
      const tecParts = [
        tec.boundaryKind === 'intraplate'
          ? boundaryLabel
          : `${boundaryLabel} · ${tec.boundaryName} (${fmtNum(tec.boundaryDistanceKm)} km)`,
      ];
      if (tec.nearestVolcano) {
        tecParts.push(t('quake.nearVolcano', {
          name: `${tec.nearestVolcano.item.emoji} ${tr(tec.nearestVolcano.item.name, l)}`,
          km: fmtNum(tec.nearestVolcano.distanceKm),
        }));
      }
      return h('li', {},
        h('button', {
          class: 'quake-row',
          'data-testid': 'quake-row',
          onclick: () => {
            sfx.tap();
            if (!store.settings.earthquakes) updateSettings({ earthquakes: true });
            closeModal('live-earth');
            globe.ev.onQuake?.(q);
          },
        },
          h('span', { class: 'quake-mag-badge', style: `--q-col:${DEPTH_SWATCH[band]}` }, `M${q.mag.toFixed(1)}`),
          h('span', { class: 'quake-row-main' },
            h('strong', {}, q.place),
            h('small', { class: 'muted' }, `${t('quake.depthKm', { km: Math.round(q.depthKm) })} (${bandLabel}) · ${formatCoord(q.lat, q.lon)}`),
            h('small', { class: 'quake-tectonic', 'data-testid': 'quake-tectonic' }, tecParts.join(' · '))),
          h('span', { class: 'quake-row-age' }, formatQuakeAge(q, isStale))));
    });

    wrap.replaceChildren(
      h('p', { class: 'muted' }, t('liveEarth.intro')),
      h('section', { class: 'le-status-bar', 'data-testid': 'live-earth-status' },
        h('div', { class: 'le-status-left' },
          h('span', { class: `le-badge le-${effStatus}`, 'data-testid': 'quake-feed-status', 'data-status': effStatus }, t(statusLabelKey)),
          h('span', { class: 'muted small', 'data-testid': 'quake-updated-at' }, updatedText)),
        h('div', { class: 'le-status-actions' },
          h('button', {
            class: 'pill pill-sm' + (store.settings.earthquakes ? ' active' : ''),
            'data-testid': 'live-earth-layer-toggle',
            'aria-pressed': String(Boolean(store.settings.earthquakes)),
            onclick: () => {
              sfx.tap();
              updateSettings({ earthquakes: !store.settings.earthquakes });
              render();
            },
          }, h('span', { html: icon('quake', 14) }), h('span', {}, t('earthquakes'))),
          h('button', {
            class: 'pill pill-sm' + (store.settings.tectonics ? ' active' : ''),
            'data-testid': 'live-earth-tectonics-toggle',
            'aria-pressed': String(Boolean(store.settings.tectonics)),
            onclick: () => {
              sfx.tap();
              updateSettings({ tectonics: !store.settings.tectonics });
              render();
            },
          }, h('span', { html: icon('mountain', 14) }), h('span', {}, t('tectonics'))),
          !isClass ? h('button', {
            class: 'pill pill-sm',
            'data-testid': 'quake-refresh',
            disabled: refreshing,
            onclick: () => void refreshAll(true),
          }, h('span', { html: icon('reset', 14) }), h('span', {}, t(refreshing ? 'liveEarth.refreshing' : 'liveEarth.refresh'))) : null)),

      h('section', { class: 'le-cards', 'data-testid': 'live-earth-space' },
        h('div', { class: 'le-card', 'data-testid': 'live-earth-kp' },
          h('div', { class: 'le-card-head' },
            h('span', { html: icon('aurora', 16) }),
            h('strong', {}, t('liveEarth.spaceWeather')),
            h('small', { class: 'muted' }, kp.live ? t('liveEarth.noaaLive') : t('liveEarth.noaaEst'))),
          h('p', { class: 'le-card-val' }, `Kp ${kp.kp.toFixed(1)} · ${t(kp.levelKey)}`),
          h('button', {
            class: 'pill pill-sm' + (store.settings.aurora ? ' active' : ''),
            'data-testid': 'live-earth-aurora-toggle',
            'aria-pressed': String(Boolean(store.settings.aurora)),
            onclick: () => { sfx.tap(); updateSettings({ aurora: !store.settings.aurora }); render(); },
          }, t(store.settings.aurora ? 'liveEarth.auroraOn' : 'liveEarth.auroraOff'))),
        h('div', { class: 'le-card', 'data-testid': 'live-earth-iss-card' },
          h('div', { class: 'le-card-head' },
            h('span', { html: icon('rocket', 16) }),
            h('strong', {}, t('issLive')),
            h('small', { class: 'muted' }, iss.live ? t('iss.justNow') : t('liveEarth.orbitModel'))),
          h('p', { class: 'le-card-val' }, `${formatCoord(iss.lat, iss.lon)} · ${Math.round(iss.altitudeKm)} km · ${fmtNum(Math.round(iss.velocityKmh))} km/h`),
          h('button', {
            class: 'pill pill-sm',
            'data-testid': 'live-earth-iss',
            onclick: () => { sfx.tap(); closeModal('live-earth'); onIss(); },
          }, t('liveEarth.trackIss'))),
        h('div', { class: 'le-card', 'data-testid': 'live-earth-sun-card' },
          h('div', { class: 'le-card-head' },
            h('span', { html: icon('sun', 16) }),
            h('strong', {}, t('sun.cardTitle')),
            h('small', { class: 'muted' }, t('sun.zenithNow'))),
          h('p', { class: 'le-card-val' },
            t('sun.cardMeta', {
              coord: formatCoord(sun.subsolarLat, sun.subsolarLon),
              decl: (sun.declinationDeg > 0 ? '+' : '') + sun.declinationDeg.toFixed(1),
            })),
          h('p', { class: 'muted small le-sun-note' },
            sun.polarDayHemisphere
              ? t('sun.polarNote', { lat: sun.polarDayLat.toFixed(1), hem: sun.polarDayHemisphere })
              : t('sun.equinoxNote')),
          h('button', {
            class: 'pill pill-sm',
            'data-testid': 'live-earth-subsolar-fly',
            onclick: () => {
              sfx.tap();
              if (!store.settings.shadows) updateSettings({ shadows: true });
              closeModal('live-earth');
              globe.flyTo(sun.subsolarLat, sun.subsolarLon, 2.2, 1300);
            },
          }, t('sun.flyNoon')))),

      h('section', { class: 'le-legend', 'data-testid': 'quake-legend' },
        h('span', { class: 'le-swatch' }, h('i', { style: `background:${DEPTH_SWATCH.shallow}` }), t('quake.legendShallow')),
        h('span', { class: 'le-swatch' }, h('i', { style: `background:${DEPTH_SWATCH.intermediate}` }), t('quake.legendInter')),
        h('span', { class: 'le-swatch' }, h('i', { style: `background:${DEPTH_SWATCH.deep}` }), t('quake.legendDeep')),
        h('span', { class: 'muted small' }, t('quake.legendScale'))),

      h('section', { class: 'le-filters', 'data-testid': 'quake-filters' },
        h('div', { class: 'le-filter-group', 'data-testid': 'quake-filter-mag' },
          h('span', { class: 'muted small' }, t('liveEarth.filterMag')),
          magBtn(2.5, 'M2.5+'),
          magBtn(4.5, 'M4.5+'),
          magBtn(5.5, 'M5.5+')),
        h('div', { class: 'le-filter-group', 'data-testid': 'quake-filter-depth' },
          h('span', { class: 'muted small' }, t('liveEarth.filterDepth')),
          depthBtn('all', t('liveEarth.depthAll')),
          depthBtn('shallow', t('quake.bandShallow')),
          depthBtn('intermediate', t('quake.bandInter')),
          depthBtn('deep', t('quake.bandDeep')))),

      h('div', { class: 'le-summary-row', 'data-testid': 'quake-summary-bar' },
        h('span', { class: 'muted small le-count', 'data-testid': 'quake-count' },
          t('liveEarth.showingN', { n: filtered.length, total: allEvents.length })),
        feedSum
          ? h('span', { class: 'quake-summary-stats', 'data-testid': 'quake-summary-stats' },
              t('quake.summaryStats', {
                max: feedSum.maxMag.toFixed(1),
                energy: feedSum.energyLabel,
                tnt: fmtNum(feedSum.tntTons),
                pct: feedSum.plateBoundaryPct,
              }))
          : null),

      filtered.length > 0
        ? h('ul', { class: 'quake-list', 'data-testid': 'quake-list' }, ...rows)
        : h('p', { class: 'muted le-empty', 'data-testid': 'quake-empty' },
            allEvents.length === 0 ? t('liveEarth.emptyFeed') : t('liveEarth.emptyFilter')),
    );
  };

  render();
  openModal('live-earth', t('liveEarth'), wrap, { wide: true });
  if (getQuakeFeedStatus() === 'loading' || (!classroom() && !getQuakeFeedUpdatedAt())) {
    void refreshAll(false);
  }
}
