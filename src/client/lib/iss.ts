/**
 * Real-time International Space Station (ISS, NORAD 25544) telemetry and orbital propagator.
 * Uses https://api.wheretheiss.at/v1/satellites/25544 when online and smoothly propagates a
 * 51.64° inclined low-Earth orbit between polls or when offline.
 */
import { solarStatusAt } from './weather.ts';

export interface IssTelemetry {
  lat: number;
  lon: number;
  altitudeKm: number;
  velocityKmh: number;
  visibility: 'daylight' | 'eclipsed';
  timestampMs: number;
  /** True when anchored to a live wheretheiss.at observation in this session. */
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
}

// Default analytical anchor (J2026 epoch approximation) used before live API responds or when offline.
let anchor: OrbitAnchor = {
  t0Ms: Date.UTC(2026, 0, 1, 0, 0, 0),
  u0: 0.42,
  lonNode0: -0.52,
  altitudeKm: 418,
  velocityKmh: 27580,
  live: false,
};

let lastFetchMs = 0;
let inflight: Promise<IssTelemetry> | null = null;

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
  return {
    lat: Math.round(lat * 100) / 100,
    lon: Math.round(lon * 100) / 100,
    altitudeKm: Math.round(anchor.altitudeKm),
    velocityKmh: Math.round(anchor.velocityKmh),
    visibility,
    timestampMs: nowMs,
    live: anchor.live,
    ascending,
  };
}

/** Fits an OrbitAnchor to an observed (lat, lon) pair and optional previous latitude sample. */
export function anchorFromObservation(
  lat: number,
  lon: number,
  nowMs = Date.now(),
  opts: { altitudeKm?: number; velocityKmh?: number; ascending?: boolean; live?: boolean } = {},
): OrbitAnchor {
  const clampedLat = Math.max(-INCL_DEG, Math.min(INCL_DEG, lat));
  const sinU = Math.max(-1, Math.min(1, Math.sin((clampedLat * Math.PI) / 180) / Math.sin(INCL_RAD)));
  const baseU = Math.asin(sinU);
  const asc = opts.ascending ?? true;
  const u0 = asc ? baseU : Math.PI - baseU;
  const lonInOrbit = Math.atan2(Math.cos(INCL_RAD) * Math.sin(u0), Math.cos(u0));
  const lonNode0 = (lon * Math.PI) / 180 - lonInOrbit;
  return {
    t0Ms: nowMs,
    u0,
    lonNode0,
    altitudeKm: opts.altitudeKm ?? 418,
    velocityKmh: opts.velocityKmh ?? 27580,
    live: opts.live ?? true,
  };
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
    pts.push([Math.round(lat * 10) / 10, Math.round(wrapLonDeg(nodeLonDeg + dLon) * 10) / 10]);
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
  if (now - lastFetchMs < 15_000) return propagateIss(now);
  if (inflight) return inflight;

  const prev = propagateIss(now);
  inflight = (async (): Promise<IssTelemetry> => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4500);
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
        if (typeof json.latitude === 'number' && typeof json.longitude === 'number') {
          const tsMs = typeof json.timestamp === 'number' ? json.timestamp * 1000 : Date.now();
          const ascending = anchor.live ? json.latitude >= prev.lat : true;
          anchor = anchorFromObservation(json.latitude, json.longitude, tsMs, {
            altitudeKm: typeof json.altitude === 'number' ? json.altitude : 418,
            velocityKmh: typeof json.velocity === 'number' ? json.velocity : 27580,
            ascending,
            live: true,
          });
          lastFetchMs = Date.now();
        }
      }
    } catch {
      // Offline or blocked: keep analytical orbit propagation.
    } finally {
      clearTimeout(timer);
      inflight = null;
    }
    return propagateIss(Date.now());
  })();

  return inflight;
}
