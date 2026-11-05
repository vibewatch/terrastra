/**
 * Real-time global earthquakes feed from USGS (M2.5+ past 24 hours) with offline Ring-of-Fire fallback.
 * https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson
 */

import { classroom } from './classroom.ts';

export interface QuakeEvent {
  id: string;
  mag: number;
  place: string;
  timeMs: number;
  lat: number;
  lon: number;
  depthKm: number;
  live: boolean;
}

export type QuakeDepthBand = 'shallow' | 'intermediate' | 'deep';
export type QuakeFeedStatus = 'loading' | 'live' | 'empty' | 'stale' | 'unavailable';

export interface QuakeFilter {
  minMag: number;
  depth: 'all' | QuakeDepthBand;
}

export const DEFAULT_QUAKE_FILTER: QuakeFilter = { minMag: 2.5, depth: 'all' };

export function quakeDepthBand(depthKm: number): QuakeDepthBand {
  if (depthKm < 70) return 'shallow';
  if (depthKm <= 300) return 'intermediate';
  return 'deep';
}

export function filterQuakes(events: readonly QuakeEvent[], filter: QuakeFilter = DEFAULT_QUAKE_FILTER): QuakeEvent[] {
  return events.filter(q => {
    if (q.mag < filter.minMag) return false;
    if (filter.depth !== 'all' && quakeDepthBand(q.depthKm) !== filter.depth) return false;
    return true;
  });
}

export function quakeColorRgb(depthKm: number): [number, number, number] {
  const band = quakeDepthBand(depthKm);
  if (band === 'shallow') return [0.99, 0.38, 0.22]; // shallow (<70 km): coral-orange
  if (band === 'intermediate') return [0.98, 0.76, 0.16]; // intermediate (70-300 km): amber-gold
  return [0.68, 0.42, 0.99]; // deep (>300 km): violet
}

/** Representative global seismic snapshot used when offline or before USGS responds. */
const FALLBACK_QUAKES: readonly Omit<QuakeEvent, 'timeMs' | 'live'>[] = [
  { id: 'fb_jp_honshu', mag: 5.8, place: 'Near the east coast of Honshu, Japan', lat: 38.25, lon: 142.4, depthKm: 42 },
  { id: 'fb_cl_antofagasta', mag: 5.4, place: '78 km ENE of Calama, Chile', lat: -22.1, lon: -68.2, depthKm: 118 },
  { id: 'fb_id_banda', mag: 5.6, place: 'Banda Sea, Indonesia', lat: -6.4, lon: 129.8, depthKm: 165 },
  { id: 'fb_to_tonga', mag: 6.1, place: '140 km WNW of Nuku‘alofa, Tonga', lat: -20.5, lon: -176.4, depthKm: 520 },
  { id: 'fb_us_alaska', mag: 4.9, place: '62 km S of Sand Point, Alaska', lat: 54.8, lon: -160.5, depthKm: 28 },
  { id: 'fb_tw_hualien', mag: 5.1, place: '18 km SSE of Hualien City, Taiwan', lat: 23.82, lon: 121.65, depthKm: 24 },
  { id: 'fb_nz_kermadec', mag: 5.5, place: 'Kermadec Islands region, New Zealand', lat: -30.2, lon: -177.8, depthKm: 48 },
  { id: 'fb_mx_oaxaca', mag: 4.7, place: '24 km SW of Pinotepa Nacional, Mexico', lat: 16.2, lon: -98.2, depthKm: 35 },
  { id: 'fb_gr_crete', mag: 4.6, place: '45 km S of Palaiochora, Greece', lat: 34.8, lon: 23.7, depthKm: 31 },
  { id: 'fb_is_reykjanes', mag: 4.2, place: 'Reykjanes Ridge, Iceland', lat: 63.85, lon: -22.4, depthKm: 9 },
  { id: 'fb_us_hawaii', mag: 3.9, place: '7 km S of Volcano, Hawaii', lat: 19.36, lon: -155.24, depthKm: 4 },
  { id: 'fb_pe_arequipa', mag: 5.0, place: '38 km WSW of Majes, Peru', lat: -16.45, lon: -72.5, depthKm: 86 },
  { id: 'fb_pg_newbritain', mag: 5.3, place: 'New Britain region, Papua New Guinea', lat: -5.6, lon: 151.4, depthKm: 62 },
  { id: 'fb_ru_kuril', mag: 5.2, place: 'Kuril Islands', lat: 46.8, lon: 153.2, depthKm: 340 },
  { id: 'fb_tr_aegean', mag: 4.4, place: 'Dodecanese Islands, Aegean Sea', lat: 36.6, lon: 27.1, depthKm: 14 },
  { id: 'fb_fj_fiji', mag: 5.7, place: 'Fiji region', lat: -18.1, lon: -178.4, depthKm: 560 },
  { id: 'fb_us_ca_geyser', mag: 3.6, place: 'The Geysers, California', lat: 38.82, lon: -122.8, depthKm: 3 },
  { id: 'fb_ph_mindanao', mag: 5.1, place: '42 km E of Hinatuan, Philippines', lat: 8.35, lon: 126.7, depthKm: 54 },
];

export function fallbackQuakes(): QuakeEvent[] {
  return FALLBACK_QUAKES.map(q => ({
    ...q,
    timeMs: 0,
    live: false,
  }));
}

export function isValidUsgsFeatureCollection(raw: unknown): raw is { type?: unknown; features: unknown[] } {
  if (!raw || typeof raw !== 'object') return false;
  const obj = raw as { type?: unknown; features?: unknown };
  if (obj.type !== undefined && obj.type !== 'FeatureCollection') return false;
  if (!Array.isArray(obj.features)) return false;
  if (obj.features.length === 0) return true;
  return obj.features.some(f => {
    if (!f || typeof f !== 'object') return false;
    const props = (f as { properties?: Record<string, unknown> }).properties;
    const geom = (f as { geometry?: { coordinates?: unknown } }).geometry;
    if (!props || !geom || !Array.isArray(geom.coordinates)) return false;
    const lon = Number(geom.coordinates[0]);
    const lat = Number(geom.coordinates[1]);
    const mag = Number(props.mag);
    return Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(mag);
  });
}

/** Parses a USGS GeoJSON FeatureCollection into up to `limit` sorted QuakeEvents. */
export function parseUsgsQuakes(raw: unknown, limit = 160): QuakeEvent[] {
  if (!raw || typeof raw !== 'object') return [];
  const features = (raw as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];
  const out: QuakeEvent[] = [];
  const seen = new Set<string>();
  for (const f of features) {
    if (!f || typeof f !== 'object') continue;
    const id = String((f as { id?: unknown }).id ?? '');
    const props = (f as { properties?: Record<string, unknown> }).properties;
    const geom = (f as { geometry?: { coordinates?: unknown } }).geometry;
    if (!props || !geom || !Array.isArray(geom.coordinates)) continue;
    const lon = Number(geom.coordinates[0]);
    const lat = Number(geom.coordinates[1]);
    const depthKm = Math.max(0, Number(geom.coordinates[2] ?? 10));
    const mag = Number(props.mag);
    const timeMs = Number(props.time ?? Date.now());
    const place = typeof props.place === 'string' && props.place.trim() ? props.place.trim() : `${lat.toFixed(1)}°, ${lon.toFixed(1)}°`;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(mag)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || mag < 2.0) continue;
    const key = id || `${lat.toFixed(2)},${lon.toFixed(2)},${timeMs}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: key,
      mag: Math.round(mag * 10) / 10,
      place,
      timeMs: Number.isFinite(timeMs) ? timeMs : Date.now(),
      lat,
      lon,
      depthKm: Math.round(depthKm * 10) / 10,
      live: true,
    });
  }
  out.sort((a, b) => b.mag - a.mag || b.timeMs - a.timeMs);
  return out.slice(0, limit);
}

const QUAKE_TTL_MS = 5 * 60_000;
let cachedQuakes: { at: number; events: QuakeEvent[] } | null = null;
let quakeInflight: Promise<QuakeEvent[]> | null = null;
let lastFeedStatus: QuakeFeedStatus = 'loading';

export function getQuakeFeedStatus(): QuakeFeedStatus {
  return lastFeedStatus;
}

export function getQuakeFeedUpdatedAt(): number | null {
  return cachedQuakes?.at ?? null;
}

export function getCachedQuakes(): QuakeEvent[] {
  return cachedQuakes?.events ?? fallbackQuakes();
}

export function resetQuakeFeedForTest(): void {
  cachedQuakes = null;
  quakeInflight = null;
  lastFeedStatus = 'loading';
}

/** Fetches M2.5+ earthquakes in the past 24 hours from USGS, falling back to representative events when offline. */
export async function fetchRecentQuakes(force = false): Promise<QuakeEvent[]> {
  if (classroom()) {
    if (cachedQuakes) {
      lastFeedStatus = 'stale';
      return cachedQuakes.events;
    }
    lastFeedStatus = 'unavailable';
    return fallbackQuakes();
  }
  if (!force && cachedQuakes && Date.now() - cachedQuakes.at < QUAKE_TTL_MS) {
    lastFeedStatus = cachedQuakes.events.length > 0 ? 'live' : 'empty';
    return cachedQuakes.events;
  }
  if (quakeInflight) return quakeInflight;

  quakeInflight = (async (): Promise<QuakeEvent[]> => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5500);
    try {
      const res = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson', {
        signal: ctl.signal,
      });
      if (res.ok) {
        const raw: unknown = await res.json();
        if (isValidUsgsFeatureCollection(raw)) {
          const parsed = parseUsgsQuakes(raw);
          cachedQuakes = { at: Date.now(), events: parsed };
          lastFeedStatus = parsed.length > 0 ? 'live' : 'empty';
          return parsed;
        }
      }
    } catch {
      // Offline or blocked: use cached or fallback dataset.
    } finally {
      clearTimeout(timer);
      quakeInflight = null;
    }
    if (cachedQuakes) {
      lastFeedStatus = 'stale';
      return cachedQuakes.events;
    }
    lastFeedStatus = 'unavailable';
    return fallbackQuakes();
  })();

  return quakeInflight;
}
