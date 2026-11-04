/**
 * Real-time local weather (Open-Meteo), solar daylight phase, and NOAA planetary Kp geomagnetic index.
 * No API keys required; all network requests use short timeouts, TTL caches, and graceful offline fallbacks.
 */
import { latLonToVec } from '../../shared/lib/geo.ts';
import { subsolar } from '../../shared/lib/sun.ts';

export type SolarPhase = 'day' | 'twilight' | 'night';

export interface SolarStatus {
  phase: SolarPhase;
  /** Solar altitude angle above the horizon in degrees (-90..+90). */
  altitudeDeg: number;
  icon: string;
  labelKey: 'solarDay' | 'solarTwilight' | 'solarNight';
  /** Approximate local solar time string ("HH:MM"). */
  localTimeStr: string;
}

/** Computes the local solar daylight state at (lat, lon) for a given UTC timestamp. */
export function solarStatusAt(lat: number, lon: number, ms = Date.now()): SolarStatus {
  const [sLat, sLon] = subsolar(ms);
  const [px, py, pz] = latLonToVec(lat, lon);
  const [sx, sy, sz] = latLonToVec(sLat, sLon);
  const sinAlt = Math.max(-1, Math.min(1, px * sx + py * sy + pz * sz));
  const altitudeDeg = (Math.asin(sinAlt) * 180) / Math.PI;
  const localMs = ms + Math.round((lon / 15) * 3600_000);
  const d = new Date(localMs);
  const localTimeStr = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  if (sinAlt > 0.05) return { phase: 'day', altitudeDeg, icon: '☀️', labelKey: 'solarDay', localTimeStr };
  if (sinAlt >= -0.12) return { phase: 'twilight', altitudeDeg, icon: '🌅', labelKey: 'solarTwilight', localTimeStr };
  return { phase: 'night', altitudeDeg, icon: '🌙', labelKey: 'solarNight', localTimeStr };
}

export interface LocalWeather {
  tempC: number;
  windKmh: number;
  code: number;
  isDay: boolean;
  icon: string;
  labelKey: string;
}

/** Maps a WMO weather interpretation code (0..99) to an emoji icon and i18n key. */
export function describeWmoCode(code: number, isDay = true): { icon: string; labelKey: string } {
  if (code === 0) return { icon: isDay ? '☀️' : '🌙', labelKey: 'wxClear' };
  if (code === 1 || code === 2) return { icon: isDay ? '🌤️' : '☁️', labelKey: 'wxPartly' };
  if (code === 3) return { icon: '☁️', labelKey: 'wxCloudy' };
  if (code === 45 || code === 48) return { icon: '🌫️', labelKey: 'wxFog' };
  if (code >= 51 && code <= 57) return { icon: '🌦️', labelKey: 'wxDrizzle' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { icon: '🌧️', labelKey: 'wxRain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: '❄️', labelKey: 'wxSnow' };
  if (code >= 95) return { icon: '⛈️', labelKey: 'wxStorm' };
  return { icon: isDay ? '🌤️' : '🌙', labelKey: 'wxClear' };
}

const WEATHER_TTL_MS = 10 * 60_000;
const weatherCache = new Map<string, { at: number; data: LocalWeather }>();
const weatherInflight = new Map<string, Promise<LocalWeather | null>>();

function weatherKey(lat: number, lon: number): string {
  return `${(Math.round(lat * 10) / 10).toFixed(1)},${(Math.round(lon * 10) / 10).toFixed(1)}`;
}

/** Fetches live local surface weather from Open-Meteo, cached by 0.1° grid cell for 10 minutes. */
export async function fetchLocalWeather(lat: number, lon: number): Promise<LocalWeather | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const key = weatherKey(lat, lon);
  const hit = weatherCache.get(key);
  if (hit && Date.now() - hit.at < WEATHER_TTL_MS) return hit.data;
  const pending = weatherInflight.get(key);
  if (pending) return pending;

  const task = (async (): Promise<LocalWeather | null> => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4500);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&current=temperature_2m,weather_code,wind_speed_10m,is_day`;
      const res = await fetch(url, { signal: ctl.signal });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        current?: { temperature_2m?: number; weather_code?: number; wind_speed_10m?: number; is_day?: number };
      };
      const cur = json?.current;
      if (!cur || typeof cur.temperature_2m !== 'number') return null;
      const code = typeof cur.weather_code === 'number' ? cur.weather_code : 0;
      const isDay = cur.is_day !== undefined ? cur.is_day === 1 : solarStatusAt(lat, lon).phase !== 'night';
      const { icon, labelKey } = describeWmoCode(code, isDay);
      const data: LocalWeather = {
        tempC: Math.round(cur.temperature_2m * 10) / 10,
        windKmh: Math.round(cur.wind_speed_10m ?? 0),
        code,
        isDay,
        icon,
        labelKey,
      };
      if (weatherCache.size >= 256) {
        const oldest = weatherCache.keys().next().value;
        if (oldest !== undefined) weatherCache.delete(oldest);
      }
      weatherCache.set(key, { at: Date.now(), data });
      return data;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      weatherInflight.delete(key);
    }
  })();

  weatherInflight.set(key, task);
  return task;
}

export interface KpStatus {
  /** Planetary Kp index (0..9). */
  kp: number;
  /** Shader intensity multiplier (0.75..1.90). */
  auroraBoost: number;
  levelKey: 'kpQuiet' | 'kpActive' | 'kpStorm';
  live: boolean;
}

/** Parses NOAA SWPC planetary K-index JSON array into a KpStatus. */
export function parseNoaaKp(raw: unknown): KpStatus | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  for (let i = raw.length - 1; i >= 1; i--) {
    const row = raw[i];
    const val = Array.isArray(row) ? Number(row[1]) : typeof row === 'object' && row !== null ? Number((row as Record<string, unknown>).Kp ?? (row as Record<string, unknown>).kp_index) : NaN;
    if (Number.isFinite(val) && val >= 0 && val <= 9) {
      const kp = Math.round(val * 10) / 10;
      const auroraBoost = 0.78 + (kp / 9) * 1.12;
      const levelKey = kp >= 5 ? 'kpStorm' : kp >= 4 ? 'kpActive' : 'kpQuiet';
      return { kp, auroraBoost, levelKey, live: true };
    }
  }
  return null;
}

const KP_FALLBACK: KpStatus = { kp: 3.0, auroraBoost: 1.0, levelKey: 'kpQuiet', live: false };
let kpCached: { at: number; status: KpStatus } | null = null;
let kpInflight: Promise<KpStatus> | null = null;

/** Fetches the latest NOAA planetary Kp geomagnetic index (cached 15 minutes, falls back gracefully). */
export async function fetchKpStatus(): Promise<KpStatus> {
  if (kpCached && Date.now() - kpCached.at < 15 * 60_000) return kpCached.status;
  if (kpInflight) return kpInflight;
  kpInflight = (async (): Promise<KpStatus> => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4500);
    try {
      const res = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', { signal: ctl.signal });
      if (!res.ok) return kpCached?.status ?? KP_FALLBACK;
      const parsed = parseNoaaKp(await res.json());
      if (parsed) {
        kpCached = { at: Date.now(), status: parsed };
        return parsed;
      }
    } catch {
      // Offline or blocked; keep fallback.
    } finally {
      clearTimeout(timer);
      kpInflight = null;
    }
    return kpCached?.status ?? KP_FALLBACK;
  })();
  return kpInflight;
}

export function currentKpStatus(): KpStatus {
  return kpCached?.status ?? KP_FALLBACK;
}
