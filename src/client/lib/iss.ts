/**
 * Real-time International Space Station (ISS, NORAD 25544) telemetry and orbital propagator.
 * Uses https://api.wheretheiss.at/v1/satellites/25544 when online and smoothly propagates a
 * 51.64° inclined low-Earth orbit between polls or when offline.
 */
import { solarStatusAt } from './weather.ts';

/** Freshness window (5 minutes) during which a live observation is considered current rather than stale. */
export const ISS_FRESH_TTL_MS = 5 * 60_000;

export type IssTelemetryStatus = 'fresh' | 'stale' | 'estimated' | 'unavailable';

export interface IssTelemetry {
  lat: number;
  lon: number;
  altitudeKm: number;
  velocityKmh: number;
  visibility: 'daylight' | 'eclipsed';
  /** Timestamp (ms) of the last live observation when available, or `nowMs` when estimated. */
  timestampMs: number;
  /** Timestamp (ms) of the last successful live observation, or `null` if none has been received. */
  observedAtMs: number | null;
  /** Timestamp (ms) at which the orbital state was evaluated/propagated. */
  propagatedAtMs: number;
  /** Age (ms) of the last live observation at `propagatedAtMs`, or `null` when estimated/unavailable. */
  ageMs: number | null;
  /** Telemetry freshness state (`fresh`, `stale`, `estimated`, or `unavailable`). */
  status: IssTelemetryStatus;
  /** True only when anchored to a fresh live wheretheiss.at observation within `ISS_FRESH_TTL_MS`. */
  live: boolean;
  /** True when the orbital track is currently heading north-east (ascending). */
  ascending: boolean;
}

const INCL_DEG = 51.64;
const INCL_RAD = (INCL_DEG * Math.PI) / 180;
/** Mean orbital angular rate (rad/s) for a ~92.9-minute LEO orbit. */
const ORBIT_OMEGA = (2 * Math.PI) / (92.9 * 60);
/** Earth rotation + nodal precession rate relative to ground track (rad/s). */
const EARTH_OMEGA = (2 * Math.PI) / 86164 + (5.0 * Math.PI) / (180 * 86400);

interface OrbitAnchor {
  t0Ms: number;
  /** Argument of latitude u0 (radians, -pi..pi) at t0Ms. */
  u0: number;
  /** Right-ascension / ascending-node longitude offset (radians) at t0Ms. */
  lonNode0: number;
  altitudeKm: number;
  velocityKmh: number;
  live: boolean;
  observedAtMs: number | null;
}

interface IssObservation {
  lat: number;
  lon: number;
  tsMs: number;
  ascending: boolean;
  hasDirection: boolean;
}

const DEFAULT_ANCHOR: OrbitAnchor = {
  t0Ms: Date.UTC(2026, 0, 1, 0, 0, 0),
  u0: 0.42,
  lonNode0: -0.52,
  altitudeKm: 418,
  velocityKmh: 27580,
  live: false,
  observedAtMs: null,
};

// Default analytical anchor (J2026 epoch approximation) used before live API responds or when offline.
let anchor: OrbitAnchor = { ...DEFAULT_ANCHOR };
let lastObs: IssObservation | null = null;
let lastFetchMs = 0;
let hasFailedFetch = false;
let inflight: Promise<IssTelemetry> | null = null;

type IssListener = (tel: IssTelemetry) => void;
const issListeners = new Set<IssListener>();

export function onIssTelemetry(fn: IssListener): () => void {
  issListeners.add(fn);
  return () => issListeners.delete(fn);
}

function emitIssTelemetry(nowMs = Date.now()): void {
  const cur = propagateIss(nowMs);
  for (const fn of issListeners) fn(cur);
}

export function resetIssTelemetryForTest(): void {
  anchor = { ...DEFAULT_ANCHOR };
  lastObs = null;
  lastFetchMs = 0;
  hasFailedFetch = false;
  inflight = null;
}

function wrapLonDeg(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Propagates the current ISS ground position at `nowMs` from the active orbital anchor. */
export function propagateIss(nowMs = Date.now()): IssTelemetry {
  const dtSec = (nowMs - anchor.t0Ms) / 1000;
  const u = anchor.u0 + ORBIT_OMEGA * dtSec;
  const sinLat = Math.max(-1, Math.min(1, Math.sin(INCL_RAD) * Math.sin(u)));
  const lat = (Math.asin(sinLat) * 180) / Math.PI;
  const lonInOrbit = Math.atan2(Math.cos(INCL_RAD) * Math.sin(u), Math.cos(u));
  const lon = wrapLonDeg(((anchor.lonNode0 + lonInOrbit - EARTH_OMEGA * dtSec) * 180) / Math.PI);
  const ascending = Math.cos(u) >= 0;
  const solar = solarStatusAt(lat, lon, nowMs);
  // At ~420 km altitude, orbital sunset occurs around solar depression angle -20°; approximate with twilight/day.
  const visibility: 'daylight' | 'eclipsed' = solar.altitudeDeg > -14 ? 'daylight' : 'eclipsed';
  const observedAtMs = anchor.observedAtMs;
  const ageMs = observedAtMs !== null ? Math.max(0, nowMs - observedAtMs) : null;
  const status: IssTelemetryStatus = observedAtMs !== null
    ? (ageMs! <= ISS_FRESH_TTL_MS ? 'fresh' : 'stale')
    : (hasFailedFetch ? 'unavailable' : 'estimated');
  const live = status === 'fresh';
  return {
    lat: Math.round(lat * 100) / 100,
    lon: Math.round(lon * 100) / 100,
    altitudeKm: Math.round(anchor.altitudeKm),
    velocityKmh: Math.round(anchor.velocityKmh),
    visibility,
    timestampMs: observedAtMs ?? nowMs,
    observedAtMs,
    propagatedAtMs: nowMs,
    ageMs,
    status,
    live,
    ascending,
  };
}

/** Fits an OrbitAnchor to an observed (lat, lon) pair and optional branch direction. */
export function anchorFromObservation(
  lat: number,
  lon: number,
  nowMs = Date.now(),
  opts: { altitudeKm?: number; velocityKmh?: number; ascending?: boolean; live?: boolean; observedAtMs?: number | null } = {},
): OrbitAnchor {
  const clampedLat = Math.max(-INCL_DEG, Math.min(INCL_DEG, lat));
  const sinU = Math.max(-1, Math.min(1, Math.sin((clampedLat * Math.PI) / 180) / Math.sin(INCL_RAD)));
  const baseU = Math.asin(sinU);
  const asc = opts.ascending ?? true;
  const u0 = asc ? baseU : Math.PI - baseU;
  const lonInOrbit = Math.atan2(Math.cos(INCL_RAD) * Math.sin(u0), Math.cos(u0));
  const lonNode0 = (lon * Math.PI) / 180 - lonInOrbit;
  const isLive = opts.live ?? true;
  return {
    t0Ms: nowMs,
    u0,
    lonNode0,
    altitudeKm: opts.altitudeKm ?? 418,
    velocityKmh: opts.velocityKmh ?? 27580,
    live: isLive,
    observedAtMs: opts.observedAtMs !== undefined ? opts.observedAtMs : (isLive ? nowMs : null),
  };
}

export function inferAscending(prev: IssObservation | null, lat: number, lon: number, tsMs: number): { ascending: boolean; hasDirection: boolean } {
  if (!prev) return { ascending: true, hasDirection: false };
  const dtSec = (tsMs - prev.tsMs) / 1000;
  if (dtSec <= 0 || (dtSec < 0.5 && Math.abs(lat - prev.lat) < 1e-4)) {
    return { ascending: prev.ascending, hasDirection: prev.hasDirection };
  }
  if (dtSec <= 2400) {
    const backLatErr = (asc: boolean): number => {
      const cand = anchorFromObservation(lat, lon, tsMs, { ascending: asc });
      const uPrev = cand.u0 - ORBIT_OMEGA * dtSec;
      const sinPrev = Math.max(-1, Math.min(1, Math.sin(INCL_RAD) * Math.sin(uPrev)));
      const predLat = (Math.asin(sinPrev) * 180) / Math.PI;
      return Math.abs(predLat - prev.lat);
    };
    const errAsc = backLatErr(true);
    const errDesc = backLatErr(false);
    if (Math.abs(errAsc - errDesc) > 0.05) {
      return { ascending: errAsc <= errDesc, hasDirection: true };
    }
    if (prev.hasDirection) {
      const prevAnchor = anchorFromObservation(prev.lat, prev.lon, prev.tsMs, { ascending: prev.ascending });
      return { ascending: Math.cos(prevAnchor.u0 + ORBIT_OMEGA * dtSec) >= 0, hasDirection: true };
    }
  }
  if (Math.abs(lat - prev.lat) > 1e-4) {
    return { ascending: lat > prev.lat, hasDirection: true };
  }
  return { ascending: prev.ascending, hasDirection: prev.hasDirection };
}

/** Builds a 16-point orbital loop `[lat, lon][]` aligned with the current ISS ascending node. */
export function currentIssOrbitPts(nowMs = Date.now()): { pts: [number, number][]; seg: number; t: number; current: IssTelemetry } {
  const dtSec = (nowMs - anchor.t0Ms) / 1000;
  const nodeLonDeg = wrapLonDeg(((anchor.lonNode0 - EARTH_OMEGA * dtSec) * 180) / Math.PI);
  const N = 16;
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const u = (2 * Math.PI * i) / N;
    const lat = (Math.asin(Math.sin(INCL_RAD) * Math.sin(u)) * 180) / Math.PI;
    const dLon = (Math.atan2(Math.cos(INCL_RAD) * Math.sin(u), Math.cos(u)) * 180) / Math.PI;
    pts.push([Math.round(lat * 100) / 100, Math.round(wrapLonDeg(nodeLonDeg + dLon) * 100) / 100]);
  }
  const uNow = (((anchor.u0 + ORBIT_OMEGA * dtSec) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const pos = (uNow / (2 * Math.PI)) * N;
  const seg = Math.floor(pos) % N;
  const t = pos - Math.floor(pos);
  return { pts, seg, t, current: propagateIss(nowMs) };
}

/** Fetches live ISS position from wheretheiss.at (throttled to 15 s) and updates the orbital anchor. */
export async function refreshIssTelemetry(): Promise<IssTelemetry> {
  const now = Date.now();
  if (lastFetchMs > 0 && now - lastFetchMs < 15_000) return propagateIss(now);
  if (inflight) return inflight;

  inflight = (async (): Promise<IssTelemetry> => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4500);
    let updated = false;
    try {
      const res = await fetch('https://api.wheretheiss.at/v1/satellites/25544', { signal: ctl.signal });
      if (res.ok) {
        const json = (await res.json()) as {
          latitude?: number;
          longitude?: number;
          altitude?: number;
          velocity?: number;
          visibility?: string;
          timestamp?: number;
        };
        if (typeof json.latitude === 'number' && typeof json.longitude === 'number'
            && Number.isFinite(json.latitude) && Number.isFinite(json.longitude)) {
          const tsMs = typeof json.timestamp === 'number' && Number.isFinite(json.timestamp)
            ? json.timestamp * 1000
            : Date.now();
          if (!lastObs || tsMs >= lastObs.tsMs) {
            const dir = inferAscending(lastObs, json.latitude, json.longitude, tsMs);
            anchor = anchorFromObservation(json.latitude, json.longitude, tsMs, {
              altitudeKm: typeof json.altitude === 'number' && Number.isFinite(json.altitude) ? json.altitude : 418,
              velocityKmh: typeof json.velocity === 'number' && Number.isFinite(json.velocity) ? json.velocity : 27580,
              ascending: dir.ascending,
              live: true,
              observedAtMs: tsMs,
            });
            lastObs = {
              lat: json.latitude,
              lon: json.longitude,
              tsMs,
              ascending: dir.ascending,
              hasDirection: dir.hasDirection,
            };
          }
          lastFetchMs = Date.now();
          hasFailedFetch = false;
          updated = true;
        }
      }
      if (!updated) hasFailedFetch = true;
    } catch {
      // Offline or blocked: keep analytical orbit propagation.
      hasFailedFetch = true;
    } finally {
      clearTimeout(timer);
      inflight = null;
    }
    const result = propagateIss(Date.now());
    emitIssTelemetry(result.propagatedAtMs);
    return result;
  })();

  return inflight;
}
