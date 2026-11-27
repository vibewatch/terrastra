/**
 * "What can I see tonight from here": the dark window, the Moon, the naked-eye planets, active meteor showers and the
 * next few events, all for one observer. Keeps an event's peak (a moment for the whole Earth) apart from whether and
 * when this place can see it. No weather: clouds are not modelled and the caller must say so.
 */
import type { GeoPoint, SkyEvent } from './types.ts';
import { gast, moonGeo, moonPhase, planetGeo, planetVisualMag, topocentric, type LunarStage, type PlanetId } from './ephem.ts';
import { localSolar } from './eclipses.ts';
import { skyEvents } from './events.ts';
import { SHOWERS } from '../../data/showers.ts';
import { CONSTELLATIONS } from '../../data/constellations.ts';

const D2R = Math.PI / 180;
const STEP = 10 * 60_000;
const NAKED_EYE: PlanetId[] = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];

/**
 * Fold a single RFC 5545 property line so each physical line is ≤ 75 UTF-8 octets,
 * splitting cleanly on Unicode code-point boundaries with CRLF + SPACE continuation.
 */
export function foldIcsLine(line: string, maxOctets = 75): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= maxOctets) return line;
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;
  let limit = maxOctets;
  for (const ch of line) {
    const chBytes = enc.encode(ch).length;
    if (currentBytes + chBytes > limit && current.length > 0) {
      chunks.push(current);
      current = ch;
      currentBytes = chBytes;
      limit = maxOctets - 1; // continuation line begins with leading SPACE (1 octet)
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks.join('\r\n ');
}

/** Altitude and azimuth (from north through east) of a point given by RA/Dec, ignoring refraction. */
function altAz(ra: number, dec: number, ms: number, obs: GeoPoint): { alt: number; az: number } {
  const H = (gast(ms) + obs.lon - ra) * D2R, d = dec * D2R, p = obs.lat * D2R;
  const alt = Math.asin(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H));
  const az = Math.atan2(-Math.cos(d) * Math.sin(H), Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.sin(p) * Math.cos(H));
  return { alt: alt / D2R, az: ((az / D2R) + 360) % 360 };
}

export interface PlanetTonight { id: PlanetId; best: number; alt: number; az: number; mag: number; when: 'evening' | 'morning' | 'all' | 'night' }
export interface ShowerTonight { key: string; peak: number; daysToPeak: number; zhr: number; radiantAlt: number; best: number; rate: number; moonlitRate: number }
export interface ConstellationTonight { id: string; alt: number; az: number; brightestMag: number; starIndex: number }
export interface EventAhead {
  ev: SkyEvent;
  /** Can this place see it at the peak moment? 'up' = yes; 'day' = the Sun is up; 'below' = under the horizon; 'none' = not from here at all. */
  here: 'up' | 'day' | 'below' | 'none';
  alt?: number;
}
export interface Tonight {
  /** Start and end of the night (Sun below the horizon) and of real darkness (Sun 12° down); null where it never happens. */
  night: [number, number] | null;
  dark: [number, number] | null;
  polar?: 'day' | 'night';
  moon: { illum: number; waxing: boolean; stage: LunarStage; ageDays: number; distKm: number; upFrac: number; maxAlt: number; washout: boolean };
  planets: PlanetTonight[];
  constellations: ConstellationTonight[];
  showers: ShowerTonight[];
  events: EventAhead[];
}

/** The run of samples (from `from`) where `f` holds, as [start, end] times, or null. */
function run(ts: number[], ok: boolean[], from: number): [number, number] | null {
  let i = from;
  while (i < ts.length && !ok[i]) i++;
  if (i >= ts.length) return null;
  let j = i;
  while (j + 1 < ts.length && ok[j + 1]) j++;
  return [ts[i], ts[j]];
}

export function tonight(obs: GeoPoint, now: number, aheadDays = 30): Tonight {
  // sample from 12 h ago to 36 h ahead; "tonight" is the night that contains now, or else the next one
  const ts: number[] = [], sun: number[] = [], moon: number[] = [];
  for (let t = now - 12 * 3600_000; t <= now + 36 * 3600_000; t += STEP) {
    const tp = topocentric(t, obs);
    ts.push(t); sun.push(tp.sun.alt); moon.push(tp.moon.alt);
  }
  const iNow = ts.findIndex(t => t >= now);
  const isNight = sun.map(a => a < -0.833);
  let polar: Tonight['polar'];
  let start = iNow;
  if (isNight[iNow]) while (start > 0 && isNight[start - 1]) start--;
  let night = run(ts, isNight, start);
  if (!night) polar = 'day';
  else if (night[0] === ts[0] && night[1] === ts[ts.length - 1]) { polar = 'night'; night = [now, now + 24 * 3600_000]; }
  const inNight = (t: number) => !!night && t >= night[0] && t <= night[1];
  const darkOk = sun.map((a, i) => a < -12 && inNight(ts[i]));
  const dark = run(ts, darkOk, start);

  const idx = ts.map((t, i) => [t, i] as const).filter(([t]) => inNight(t)).map(([, i]) => i);
  const midMs = night ? (night[0] + night[1]) / 2 : now;
  const ph = moonPhase(midMs);
  const mDistKm = Math.round(moonGeo(midMs).distKm);
  const moonUp = idx.filter(i => moon[i] > 0).length;
  const upFrac = idx.length ? moonUp / idx.length : 0;
  const maxAlt = idx.length ? Math.max(...idx.map(i => moon[i])) : -90;

  const planets: PlanetTonight[] = [];
  const twilight = idx.filter(i => sun[i] < -6);
  for (const id of NAKED_EYE) {
    let best = -1, bestAlt = 10, bestAz = 0, seen = 0, firstHalf = 0;
    twilight.forEach((i, k) => {
      const g = planetGeo(id, ts[i]);
      const p = altAz(g.ra, g.dec, ts[i], obs);
      if (p.alt > 10) { seen++; if (k < twilight.length / 2) firstHalf++; if (p.alt > bestAlt) { bestAlt = p.alt; best = ts[i]; bestAz = p.az; } }
    });
    if (best < 0) continue;
    const share = seen / twilight.length;
    planets.push({ id, best, alt: bestAlt, az: bestAz, mag: planetVisualMag(id, best),
      when: share > 0.7 ? 'all' : firstHalf / seen > 0.8 ? 'evening' : firstHalf / seen < 0.2 ? 'morning' : 'night' });
  }

  // Prominent constellations high overhead during prime stargazing (mid-darkness, or mid-night when twilight persists)
  const constellations: ConstellationTonight[] = [];
  if (polar !== 'day' && twilight.length > 0) {
    const primeMs = dark ? (dark[0] + dark[1]) / 2 : ts[twilight[Math.floor(twilight.length / 2)]];
    const scored: { item: ConstellationTonight; score: number }[] = [];
    for (const con of CONSTELLATIONS) {
      if (!con.stars.length) continue;
      let starIndex = 0;
      let brightestMag = con.stars[0][2];
      for (let k = 1; k < con.stars.length; k++) {
        if (con.stars[k][2] < brightestMag) {
          brightestMag = con.stars[k][2];
          starIndex = k;
        }
      }
      if (brightestMag > 3.2) continue;
      const [ra, dec] = con.stars[starIndex];
      const p = altAz(ra, dec, primeMs, obs);
      if (p.alt < 25) continue;
      scored.push({
        item: { id: con.id, alt: p.alt, az: p.az, brightestMag, starIndex },
        score: (4.0 - brightestMag) * 20 + p.alt,
      });
    }
    scored.sort((a, b) => b.score - a.score);
    for (const s of scored.slice(0, 5)) constellations.push(s.item);
  }

  const showers: ShowerTonight[] = [];
  const peaks = skyEvents(now - 40 * 864e5, now + 40 * 864e5, { kinds: ['meteor-shower'] });
  const darkIdx = idx.filter(i => darkOk[i]);
  for (const sh of SHOWERS) {
    if (!activeOn(sh.activeFrom, sh.activeTo, night ? night[0] : now)) continue;
    const peak = peaks.filter(e => e.shower === sh.key).sort((a, b) => Math.abs(a.t - now) - Math.abs(b.t - now))[0];
    if (!peak) continue;
    let radiantAlt = -90, best = now;
    for (const i of darkIdx.length ? darkIdx : idx) {
      const a = altAz(sh.ra, sh.dec, ts[i], obs).alt;
      if (a > radiantAlt) { radiantAlt = a; best = ts[i]; }
    }
    const days = (peak.t - now) / 864e5;
    // hourly rate under a perfect sky, falling off with the radiant's height and with distance from the peak night
    const rate = radiantAlt > 0 ? sh.zhr * Math.sin(radiantAlt * D2R) * Math.exp(-Math.abs(days) / 2.5) : 0;
    const moonAtBestUp = topocentric(best, obs).moon.alt > 0;
    const moonFactor = moonAtBestUp ? Math.max(0.15, 1 - 0.78 * ph.illumination) : 1;
    const moonlitRate = rate * moonFactor;
    showers.push({ key: sh.key, peak: peak.t, daysToPeak: days, zhr: sh.zhr, radiantAlt, best, rate, moonlitRate });
  }

  const events: EventAhead[] = skyEvents(now, now + aheadDays * 864e5)
    .filter(e => e.kind === 'solar-eclipse' || e.kind === 'lunar-eclipse' || e.kind === 'supermoon' || e.kind === 'opposition'
      || (e.kind === 'conjunction' && (e.value ?? 9) < 3) || e.kind === 'elongation' || e.kind === 'transit')
    .slice(0, 6).map(ev => here(ev, obs));

  return {
    night,
    dark,
    polar,
    moon: {
      illum: ph.illumination,
      waxing: ph.waxing,
      stage: ph.stage,
      ageDays: Math.round(ph.ageDays * 10) / 10,
      distKm: mDistKm,
      upFrac,
      maxAlt,
      washout: ph.illumination > 0.5 && upFrac > 0.4,
    },
    planets,
    constellations,
    showers,
    events,
  };
}

/** Whether this observer can see an event at its peak moment. */
function here(ev: SkyEvent, obs: GeoPoint): EventAhead {
  const tp = topocentric(ev.t, obs);
  if (ev.kind === 'solar-eclipse') {
    const l = localSolar(ev.solar!, obs);
    return { ev, here: l.visible && l.type !== 'none' ? 'up' : 'none', alt: l.sunAlt };
  }
  const body = ev.kind === 'lunar-eclipse' || ev.kind === 'supermoon' ? 'moon' : ev.bodies?.find(b => b !== 'sun' && b !== 'earth') ?? 'moon';
  const alt = body === 'moon' ? tp.moon.alt
    : (NAKED_EYE as string[]).includes(body) || body === 'uranus' || body === 'neptune' ? (() => { const g = planetGeo(body as PlanetId, ev.t); return altAz(g.ra, g.dec, ev.t, obs).alt; })() : tp.moon.alt;
  // a transit is seen against the Sun, so it needs the Sun up rather than down
  if (ev.kind === 'transit') return { ev, here: tp.sun.alt > 0 ? 'up' : 'below', alt: tp.sun.alt };
  if (alt <= 0) return { ev, here: 'below', alt };
  return { ev, here: tp.sun.alt > -6 ? 'day' : 'up', alt };
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayOfYear = (s: string) => { const [m, d] = s.split(' '); return MON.indexOf(m) * 31 + Number(d); };
/** Whether a date falls in an activity window like 'Dec 28'–'Jan 12' (which wraps the new year). */
export function activeOn(from: string, to: string, ms: number): boolean {
  const d = new Date(ms), x = d.getUTCMonth() * 31 + d.getUTCDate();
  const a = dayOfYear(from), b = dayOfYear(to);
  return a <= b ? x >= a && x <= b : x >= a || x <= b;
}
