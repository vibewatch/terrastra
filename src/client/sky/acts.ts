/**
 * Acts: each kind of sky event becomes a little staged scene: a time range with contact marks, where to stand, where
 * to look, which views make sense, and what to say at each moment. The theatre owns the scenes and the clock; an act
 * only decides.
 */
import * as THREE from 'three';
import {
  topocentric, localSolar, eclipsePath, planetGeo, moonGeo, sunGeo, moonPhase, gast, nextPhase, type PlanetId, type SkyEvent, type GeoPoint,
} from '../../shared/lib/astro/index.ts';
import { SHOWERS } from '../../shared/data/showers.ts';
import { lang } from '../lib/i18n.ts';
import { tr } from '../../shared/data/types.ts';
import { s, SITES, regionOf } from './text.ts';
import { siteClock, eqVec, D2R } from './common.ts';
import { PLANETS, type GroundSky } from './ground.ts';
import type { SpaceScene } from './space.ts';
import type { ModelScene, ModelSetup } from './model.ts';
import type { LookControls, OrbitControls } from './controls.ts';
import { findRoot } from '../../shared/lib/astro/ephem.ts';

export type View = 'model' | 'ground' | 'space' | 'moon';
/** `tz` = UTC offset (hours) around the event; `zone` = IANA zone for exact local clocks; `est` = no real zone, `tz` is a sun-time guess. */
export interface Site { id: string; name: string; lat: number; lon: number; tz: number; zone?: string; est?: boolean }
export interface Ctx {
  ground: GroundSky; space: SpaceScene; model: ModelScene;
  look: LookControls; orbit: OrbitControls; morbit: OrbitControls; user: boolean;
}
export interface Frame { caption: string; read: [string, string][]; note?: string }
export interface Mark { t: number; label: string; major?: boolean }
/** The clock of a view: its span, start, pace and the marks on its timeline. */
export interface Timing {
  t0: number; t1: number; start: number; rate: number; marks: Mark[]; days?: boolean;
  slow?(t: number): number; at?(t: number): number;
}

export interface Act {
  title: string;
  views: View[];
  view: View;
  site: Site;
  notice?: string;
  t0: number; t1: number; start: number;
  /** Default sim seconds per real second. */
  rate: number;
  marks: Mark[];
  /** Timeline shows dates rather than clock times (multi-day acts). */
  days?: boolean;
  /** Rate multiplier near interesting moments (slow motion). */
  slow?(t: number): number;
  /** Timeline value → instant to show (defaults to itself). */
  at?(t: number): number;
  /** Ground-view field-of-view presets (telescope / naked eye). */
  fov: { tele: number; eye: number; start: 'tele' | 'eye' };
  enter(view: View, c: Ctx): void;
  frame(ms: number, view: View, c: Ctx): Frame;
  /** "See it in the Solar System" hand-off. */
  solar?: { focus: string; ms: number };
  /** The "how it works" model: what to build, its own clock (overrides the act's), extra names for labels. */
  model?: { setup: ModelSetup; timing?: Partial<Timing>; names?: Record<string, string> };
}

const H = 3600_000, DAY = 86400_000, SID = 86164_091;
const BODY_NAME: Record<string, { en: string; zh: string }> = {
  ...Object.fromEntries(PLANETS.map(p => [p.id, p.name])), moon: { en: 'the Moon', zh: '月亮' }, sun: { en: 'the Sun', zh: '太阳' },
};
export const bodyName = (id: string) => tr(BODY_NAME[id] ?? { en: id, zh: id }, lang());
const pct = (x: number) => `${Math.round(x * 100)}%`;
const deg = (x: number, d = 1) => `${x.toFixed(d)}°`;
const tzOf = (lon: number) => Math.round(lon / 15);

/** Best spot as a site. */
const spot = (p: GeoPoint): Site => ({ id: 'best', name: s('bestSpot'), lat: p.lat, lon: p.lon, tz: tzOf(p.lon), est: true });

export function eventTitle(ev: SkyEvent): string {
  switch (ev.kind) {
    case 'solar-eclipse': return s(`k_solar_${ev.solar!.type}` as const);
    case 'lunar-eclipse': return s(`k_lunar_${ev.lunar!.type}` as const);
    case 'full-moon': return s('k_full');
    case 'new-moon': return s('k_new');
    case 'supermoon': return s('k_super');
    case 'equinox': case 'solstice': return s(`k_${ev.season!}` as const);
    case 'opposition': return s('k_opposition', { p: bodyName(ev.bodies![0]) });
    case 'conjunction': return s('k_conjunction', { a: bodyName(ev.bodies![0]), b: bodyName(ev.bodies![1]) });
    case 'elongation': return s(ev.side === 'east' ? 'k_elong_e' : 'k_elong_w', { p: bodyName(ev.bodies![0]) });
    case 'transit': return s('k_transit', { p: bodyName(ev.bodies![0]) });
    case 'meteor-shower': { const sh = SHOWERS.find(x => x.key === ev.shower); return sh ? tr(sh.name, lang()) : ev.id; }
  }
}

/** Sun altitude at a site. */
const sunAlt = (ms: number, o: GeoPoint) => topocentric(ms, o).sun.alt;

/** Within [a, b], the first time the Sun crosses `alt` going up (rising) or down. */
function sunCross(a: number, b: number, o: GeoPoint, alt: number, rising: boolean): number | undefined {
  const step = 10 * 60_000;
  let prev = sunAlt(a, o) - alt;
  for (let t = a + step; t <= b; t += step) {
    const cur = sunAlt(t, o) - alt;
    if (rising ? prev < 0 && cur >= 0 : prev > 0 && cur <= 0) {
      let lo = t - step, hi = t;
      for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2, v = sunAlt(m, o) - alt; if ((v >= 0) === rising) hi = m; else lo = m; }
      return (lo + hi) / 2;
    }
    prev = cur;
  }
  return undefined;
}

/** Local midnight (UTC ms) of the local date containing `ms`. */
const localMidnight = (ms: number, tz: number) => Math.floor((ms + tz * H) / DAY) * DAY - tz * H;

/** Smooth slow-motion factor: 1 far from the moments, down to `min` within `near` ms of them. */
function slowNear(ts: (number | undefined)[], near: number, far: number, min: number) {
  return (t: number) => {
    let f = 1;
    for (const c of ts) if (c !== undefined) f = Math.min(f, min + (1 - min) * THREE.MathUtils.smoothstep(Math.abs(t - c), near, far));
    return f;
  };
}

/** Keep the camera on a target (az / alt in degrees) unless the user took over. */
function track(c: Ctx, az: number, alt: number, fov?: number): void { if (!c.user) c.look.aim(az, alt, fov, false, true); }

// ------------------------------------------------------------------------------------------------ the model view

// no line breaks inside (word joiner after the hyphen, no-break space)
const utcDate = (ms: number) => new Date(ms).toISOString().slice(5, 16).replace('-', '-\u2060').replace('T', '\u00a0');
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** Model clock centred on a moment: `days` either side, slowing down around it. */
function around(t: number, days: number, label: string, near: number, far: number, min: number, secs = 50): Partial<Timing> {
  return {
    t0: t - days * DAY, t1: t + days * DAY, start: t - days * 0.65 * DAY, rate: (2 * days * DAY) / 1000 / secs, days: true,
    marks: [{ t, label, major: true }], slow: slowNear([t], near, far, min), at: undefined,
  };
}
/** Great-circle angle between two ecliptic directions (degrees). */
function sepDeg(l1: number, b1: number, l2: number, b2: number): number {
  const c = Math.sin(b1 * D2R) * Math.sin(b2 * D2R) + Math.cos(b1 * D2R) * Math.cos(b2 * D2R) * Math.cos((l1 - l2) * D2R);
  return Math.acos(Math.max(-1, Math.min(1, c))) / D2R;
}
/** Eclipse models: how far the Moon is from the Sun–Earth line, and whether it is lined up now. */
function eclipseModelFrame(ms: number, t: number, lunar: boolean): Frame {
  const m = moonGeo(ms), g = sunGeo(ms);
  const sep = lunar ? sepDeg(m.lon, m.lat, g.lon + 180, -g.lat) : sepDeg(m.lon, m.lat, g.lon, g.lat);
  const near = Math.abs(ms - t) < 10 * H;
  return {
    caption: lunar ? s(near ? 'cm_lunar_near' : 'cm_lunar_far') : s(near ? 'cm_solar_near' : 'cm_solar_far'),
    read: [[s('utc'), utcDate(ms)], [s('moonLat'), deg(m.lat, 2)], [s(lunar ? 'shadowSep' : 'sunMoonSep'), deg(sep, 2)]],
    note: s('mScale'),
  };
}
/** Times (UTC ms) of the equinoxes and solstices within ±half a year of t. */
function seasonMarks(t: number): Mark[] {
  const out: Mark[] = [];
  const lon0 = sunGeo(t).lon;
  ([[0, 'march'], [90, 'june'], [180, 'september'], [270, 'december']] as const).forEach(([L, key]) => {
    const d = ((((L - lon0) % 360) + 540) % 360) - 180;
    const guess = t + (d / 360) * 365.2422 * DAY;
    const f = (u: number) => ((((sunGeo(u).lon - L) % 360) + 540) % 360) - 180;
    const at = findRoot(f, guess - 5 * DAY, guess + 5 * DAY, 60_000);
    out.push({ t: at, label: s(`k_${key}` as const), major: Math.abs(at - t) < DAY });
  });
  return out.sort((a, b) => a.t - b.t);
}
/** Phase marks (New, First quarter, Full, Last quarter) within [a, b]. */
function phaseMarks(a: number, b: number, majorAt: number): Mark[] {
  const out: Mark[] = [];
  ([[0, 'ph0'], [90, 'ph2'], [180, 'ph4'], [270, 'ph6']] as const).forEach(([ph, key]) => {
    for (let u = nextPhase(a, ph); u < b; u = nextPhase(u + DAY, ph)) out.push({ t: u, label: s(key), major: Math.abs(u - majorAt) < DAY });
  });
  return out.sort((x, y) => x.t - y.t);
}

// ------------------------------------------------------------------------------------------------ solar eclipse

function solarAct(ev: SkyEvent, pick: Site | null): Act {
  const e = ev.solar!;
  let site = pick ?? spot(e.greatest);
  let L = localSolar(e, site);
  let notice: string | undefined;
  if (!L.visible || L.type === 'none') { notice = pick ? s('notVisibleHere', { p: pick.name }) : undefined; site = spot(e.greatest); L = localSolar(e, site); }
  const central = L.type === 'total' || L.type === 'annular';
  const t0 = (L.c1 ?? L.max - 1.5 * H) - 15 * 60_000, t1 = (L.c4 ?? L.max + 1.5 * H) + 15 * 60_000;
  const marks: Mark[] = [];
  if (L.c1) marks.push({ t: L.c1, label: s('c_c1') });
  if (L.c2) marks.push({ t: L.c2, label: s('c_c2'), major: true });
  marks.push({ t: L.max, label: s('c_max'), major: !L.c2 });
  if (L.c3) marks.push({ t: L.c3, label: s('c_c3'), major: true });
  if (L.c4) marks.push({ t: L.c4, label: s('c_c4') });
  const path = e.type === 'partial' ? null : eclipsePath(e, 60);
  const typeKey = L.type === 'total' ? 'seesTotal' : L.type === 'annular' ? 'seesAnnular' : 'seesPartial';
  return {
    title: eventTitle(ev), views: ['model', 'ground', 'space'], view: 'model', site, notice, marks,
    model: { setup: { kind: 'solar', t: ev.t }, timing: around(ev.t, 2, s('c_max'), 2 * H, 12 * H, 0.1) },
    t0, t1, start: Math.max(t0, (L.c2 ?? L.max) - (central ? 6 * 60_000 : 25 * 60_000)),
    rate: (t1 - t0) / 1000 / 70,
    slow: central ? slowNear([L.c2, L.c3], 40_000, 6 * 60_000, 0.025) : undefined,
    fov: { tele: 3.2, eye: 55, start: 'tele' },
    enter(view, c) {
      if (view === 'model') { c.model.aim(c.morbit, ev.t); return; }
      c.space.setPath(path);
      c.space.setMarker(site);
      c.space.showAxis(true);
      c.space.showCones(false);
      c.space.exaggerate(1);
      if (view === 'space') {
        c.orbit.target.set(0, 0, 0); c.orbit.up.set(0, 0, 1); c.orbit.minDist = 1.3; c.orbit.maxDist = 300;
        const st = c.space.update(ev.t);
        // look down on the greatest-eclipse point, a little toward the Sun so the shadow sits on the day side
        const g = e.greatest, th = (gast(ev.t) + g.lon) * D2R, cl = Math.cos(g.lat * D2R);
        const gp = new THREE.Vector3(cl * Math.cos(th), cl * Math.sin(th), Math.sin(g.lat * D2R));
        c.orbit.place(gp.multiplyScalar(0.7).addScaledVector(st.sunDir, 0.3), 4.2, true);
      }
    },
    frame(ms, view, c) {
      if (view === 'model') return eclipseModelFrame(ms, ev.t, false);
      const read: [string, string][] = [[s('localTime'), siteClock(ms, site, false, lang())]];
      if (view === 'space') {
        read.push([s('magnitude'), e.magnitude.toFixed(3)]);
        if (e.durationS) read.push([e.type === 'annular' ? s('durationAnn') : s('duration'), fmtDur(e.durationS)]);
        if (e.pathWidthKm) read.push([s('pathWidth'), `${Math.round(e.pathWidthKm)} km`]);
        read.push([s('bestSpot'), regionOf(e.greatest.lat, e.greatest.lon)]);
        return { caption: s('cap_solar_space'), read };
      }
      const st = c.ground.state;
      track(c, st.sunAz, st.sunAlt);
      read.push([s('sunAlt'), deg(st.sunAlt)], [s('covered'), pct(1 - st.vis)]);
      read.push([site.name, s(typeKey, { n: Math.round(L.obscuration * 100) })]);
      if (L.c2 && L.c3) read.push([L.type === 'annular' ? s('durationAnn') : s('duration'), fmtDur((L.c3 - L.c2) / 1000)]);
      let cap = s('cap_solar_partial');
      if (L.c1 && ms < L.c1) cap = s('cap_solar_pre');
      else if (st.tot > 0.5) cap = s('cap_solar_total');
      else if (st.rm < st.rs && st.sep < st.rs - st.rm) cap = s('cap_solar_annular');
      else if (L.type === 'total' && st.vis < 0.03) cap = s('cap_solar_beads');
      return { caption: cap, read };
    },
  };
}

const fmtDur = (sec: number) => {
  const m = Math.floor(sec / 60), r = Math.round(sec % 60);
  return lang() === 'zh' ? (m ? `${m}分${r}秒` : `${r}秒`) : (m ? `${m}m ${r}s` : `${r}s`);
};

// ------------------------------------------------------------------------------------------------ lunar eclipse

function lunarAct(ev: SkyEvent, pick: Site | null): Act {
  const l = ev.lunar!;
  let site = pick ?? spot(l.subMoon);
  let notice: string | undefined;
  const up = (o: GeoPoint) => Math.max(...[l.u1 ?? l.t, l.t, l.u4 ?? l.t].map(t => topocentric(t, o).moon.alt));
  if (up(site) < 2) { notice = pick ? s('notVisibleHere', { p: pick.name }) : undefined; site = spot(l.subMoon); }
  const marks: Mark[] = [{ t: l.p1, label: s('c_p1') }];
  if (l.u1) marks.push({ t: l.u1, label: s('c_c1') });
  if (l.u2) marks.push({ t: l.u2, label: s('c_c2'), major: true });
  marks.push({ t: l.t, label: s('c_max'), major: !l.u2 });
  if (l.u3) marks.push({ t: l.u3, label: s('c_c3'), major: true });
  if (l.u4) marks.push({ t: l.u4, label: s('c_c4') });
  marks.push({ t: l.p4, label: s('c_p4') });
  const t0 = l.p1 - 10 * 60_000, t1 = l.p4 + 10 * 60_000;
  return {
    title: eventTitle(ev), views: ['model', 'ground', 'moon'], view: 'model', site, notice, marks,
    model: { setup: { kind: 'lunar', t: l.t }, timing: around(l.t, 2, s('c_max'), 2 * H, 12 * H, 0.1) },
    t0, t1, start: (l.u1 ?? l.p1) - 10 * 60_000, rate: (t1 - t0) / 1000 / 80,
    fov: { tele: 2.4, eye: 60, start: 'tele' },
    enter(view, c) {
      if (view === 'model') { c.model.aim(c.morbit, l.t); return; }
      c.space.setPath(null); c.space.setMarker(null); c.space.showAxis(false); c.space.showCones(true); c.space.exaggerate(1);
      const st = c.space.update(l.t);
      if (view === 'space') {
        c.orbit.target.copy(st.moonPos); c.orbit.up.set(0, 0, 1); c.orbit.minDist = 0.6; c.orbit.maxDist = 200;
        const toEarth = st.moonPos.clone().negate().normalize();
        const side = new THREE.Vector3().crossVectors(toEarth, new THREE.Vector3(0, 0, 1)).normalize();
        c.orbit.place(toEarth.multiplyScalar(Math.cos(0.9)).addScaledVector(side, Math.sin(0.9)), 3.2, true);
      } else if (view === 'moon') {
        // stand just above the Moon's Earth-facing side and look home: Earth hides the Sun
        c.orbit.target.set(0, 0, 0); c.orbit.up.set(0, 0, 1); c.orbit.minDist = 1.5; c.orbit.maxDist = 400;
        c.orbit.place(st.moonPos.clone().normalize(), st.moonPos.length() - 0.4, true);
        c.space.camera.fov = 6;
        c.space.camera.updateProjectionMatrix();
      }
    },
    frame(ms, view, c) {
      if (view === 'model') return eclipseModelFrame(ms, l.t, true);
      const read: [string, string][] = [[s('localTime'), siteClock(ms, site, false, lang())]];
      read.push([s('magnitude'), l.umbralMagnitude > 0 ? l.umbralMagnitude.toFixed(2) : l.penumbralMagnitude.toFixed(2)]);
      if (l.u2 && l.u3) read.push([s('duration'), fmtDur((l.u3 - l.u2) / 1000)]);
      const inUmbra = l.u1 !== undefined && ms > l.u1 && ms < (l.u4 ?? 0);
      const total = l.u2 !== undefined && ms > l.u2 && ms < (l.u3 ?? 0);
      let cap = ms > l.p1 && ms < l.p4 ? s('cap_lunar_pen') : s('cap_full');
      if (inUmbra) cap = s('cap_lunar_partial');
      if (total) cap = s('cap_lunar_total');
      if (view === 'ground') {
        const st = c.ground.state;
        track(c, st.moonAz, st.moonAlt);
        read.splice(1, 0, [s('moonAlt'), deg(st.moonAlt)]);
      } else {
        if (view === 'space') c.orbit.target.copy(c.space.state.moonPos);
        if (view === 'moon') cap = s('cap_lunar_space');
      }
      return { caption: cap, read };
    },
  };
}

// ------------------------------------------------------------------------------------------------ meteor shower

function meteorAct(ev: SkyEvent, pick: Site | null): Act {
  const sh = SHOWERS.find(x => x.key === ev.shower)!;
  const site: Site = pick ?? (sh.dec < -10
    ? { id: 'best', name: s('bestSpot'), lat: -31.95, lon: 115.86, tz: 8, zone: 'Australia/Perth' }
    : { ...SITES[0], id: 'best', name: s('bestSpot') });
  // the night of the peak: 20:00 local → 06:00 next morning
  const mid = localMidnight(ev.t, site.tz);
  const t0 = (ev.t - mid < 12 * H ? mid - DAY : mid) + 20 * H, t1 = t0 + 10 * H;
  const radiant = eqVec(sh.ra, sh.dec);
  return {
    title: eventTitle(ev), views: ['model', 'ground'], view: 'model', site, marks: [{ t: Math.min(t1, Math.max(t0, ev.t)), label: s('c_peak'), major: true }],
    model: {
      setup: { kind: 'meteors', t: ev.t, shower: sh },
      timing: { ...around(ev.t, 12, s('c_peak'), 8 * H, 3 * DAY, 0.2, 45), start: ev.t - 8 * DAY },
      names: { stream: s('stream', { p: tr(sh.parent, lang()) }) },
    },
    t0, t1, start: t0 + 3 * H, rate: 240,
    fov: { tele: 40, eye: 95, start: 'eye' },
    enter(v, c) {
      if (v === 'model') { c.model.aim(c.morbit, ev.t); return; }
      c.ground.shower = { radiant, perSec: sh.zhr / 3600 };
      c.ground.radiant = { dir: radiant, name: s('radiant') + ' · ' + tr(sh.name, lang()) };
    },
    frame(ms, v, c) {
      if (v === 'model') {
        const o = c.model.streamInfo, near = Math.abs(ms - ev.t) < 2.5 * DAY;
        const read: [string, string][] = [[s('utc'), utcDate(ms)]];
        if (o) read.push([s('orbitA'), `${o.a.toFixed(2)} AU`], [s('orbitE'), o.e.toFixed(2)], [s('orbitI'), deg(o.i, 0)]);
        read.push([s('speed'), `${sh.speedKms} km/s`], [s('parent'), tr(sh.parent, lang())]);
        return { caption: near ? s('cm_meteor_near', { v: sh.speedKms }) : s('cm_meteor_far', { p: tr(sh.parent, lang()) }), read, note: s('mScaleHelio') };
      }
      const st = c.ground.state, rad = c.ground.radiantHz;
      if (rad) track(c, rad.az, Math.min(55, Math.max(25, rad.alt * 0.7)));
      const moon = moonPhase(ms);
      const rateNow = Math.round(sh.zhr * Math.max(0, Math.sin((rad?.alt ?? 0) * D2R)) * (1 - THREE.MathUtils.smoothstep(st.day, 0, 0.15)));
      return {
        caption: st.day > 0.2 ? s('cap_meteor_tip') : s('cap_meteor'),
        read: [
          [s('localTime'), siteClock(ms, site, false, lang())],
          [s('rate'), `~${rateNow}`],
          [s('radiant'), deg(rad?.alt ?? 0, 0)],
          [s('speed'), `${sh.speedKms} km/s`],
          [s('parent'), tr(sh.parent, lang())],
          [s('illum') + ' · ' + bodyName('moon'), pct(moon.illumination)],
        ],
      };
    },
  };
}

// ------------------------------------------------------------------------------------------------ Moon phases

function moonAct(ev: SkyEvent, pick: Site | null): Act {
  const site = pick ?? { ...SITES[0], id: 'best', name: s('bestSpot') };
  const isNew = ev.kind === 'new-moon';
  const t0 = ev.t - 12 * H, t1 = ev.t + 12 * H;
  // start when the Moon is highest during these 24 h
  let best = ev.t, hi = -90;
  for (let t = t0; t <= t1; t += 20 * 60_000) { const a = topocentric(t, site).moon.alt; if (a > hi) { hi = a; best = t; } }
  const AVG_R = 0.2588; // mean apparent radius of the Moon, degrees (31.06′ diameter)
  return {
    title: eventTitle(ev), views: ['model', 'ground'], view: 'model', site,
    marks: [{ t: ev.t, label: s(isNew ? 'k_new' : 'k_full'), major: true }],
    model: {
      setup: { kind: 'phases', t: ev.t, apsides: ev.kind === 'supermoon' },
      timing: {
        t0: ev.t - 15 * DAY, t1: ev.t + 15 * DAY, start: ev.t - 8 * DAY, rate: 30 * DAY / 1000 / 60, days: true, at: undefined,
        marks: phaseMarks(ev.t - 15 * DAY, ev.t + 15 * DAY, ev.t), slow: slowNear([ev.t], 6 * H, 2 * DAY, 0.2),
      },
    },
    t0: isNew ? ev.t - 15 * DAY : t0, t1: isNew ? ev.t + 15 * DAY : t1, start: isNew ? ev.t - 4 * DAY : best,
    rate: isNew ? 30 * DAY / 1000 / 60 : 24 * H / 1000 / 80, days: isNew,
    fov: { tele: 1.6, eye: 60, start: 'tele' },
    enter(view, c) {
      if (view === 'model') { c.model.aim(c.morbit, ev.t); return; }
      c.space.setPath(null); c.space.setMarker(null); c.space.showAxis(false); c.space.showCones(false);
      if (view === 'space') {
        c.space.exaggerate(5);
        c.orbit.target.set(0, 0, 0); c.orbit.up.set(0, 0, 1); c.orbit.minDist = 8; c.orbit.maxDist = 600;
        const sd = c.space.update(ev.t).sunDir;
        c.orbit.place(new THREE.Vector3(0, 0, 1).addScaledVector(sd, -0.35), 170, true);
      } else c.space.exaggerate(1);
      c.ground.avgMoon = ev.kind === 'supermoon' ? AVG_R : 0;
    },
    frame(ms, view, c) {
      const m = moonGeo(ms), ph = moonPhase(ms);
      if (view === 'model') {
        const e = ((m.lon - sunGeo(ms).lon) % 360 + 360) % 360, ix = Math.round(e / 45) % 8;
        return {
          caption: ev.kind === 'supermoon' ? s('cm_super') : s('cm_phase'),
          read: [
            [s('utc'), utcDate(ms)], [s('phaseNow'), s(`ph${ix}` as `ph${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7}`)], [s('illum'), pct(ph.illumination)],
            [s('distance'), `${Math.round(m.distKm).toLocaleString()} km`], [s('moonAge'), `${ph.ageDays.toFixed(1)} ${lang() === 'zh' ? '天' : 'd'}`],
          ],
          note: s('mScale'),
        };
      }
      const read: [string, string][] = [
        [s(isNew ? 'utc' : 'localTime'), isNew ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') : siteClock(ms, site, false, lang())],
        [s('illum'), pct(ph.illumination)],
        [s('distance'), `${Math.round(m.distKm).toLocaleString()} km`],
      ];
      if (view === 'ground') {
        const st = c.ground.state;
        track(c, st.moonAz, st.moonAlt);
        read.push([s('moonAlt'), deg(st.moonAlt)], ['⌀', `${(st.rm * 120).toFixed(1)}′ (${pct(st.rm / AVG_R)})`]);
      }
      const cap = ev.kind === 'supermoon' ? s('cap_super') : isNew ? s('cap_new') : s('cap_full');
      return { caption: cap, read };
    },
  };
}

// ------------------------------------------------------------------------------------------------ seasons

function seasonAct(ev: SkyEvent, pick: Site | null): Act {
  const site = pick ?? { ...SITES[0], id: 'best', name: s('bestSpot') };
  const mid = localMidnight(ev.t, site.tz);
  const rise = sunCross(mid, mid + DAY, site, -0.833, true), set = sunCross(mid, mid + DAY, site, -0.833, false);
  const dayLen = rise !== undefined && set !== undefined ? (set > rise ? set - rise : set + DAY - rise) : (sunAlt(mid + 12 * H, site) > 0 ? DAY : 0);
  const marks: Mark[] = [{ t: ev.t, label: s(`k_${ev.season!}` as const), major: true }];
  if (rise) marks.push({ t: rise, label: s('c_rise') });
  if (set) marks.push({ t: set, label: s('c_set') });
  return {
    title: eventTitle(ev), views: ['model', 'space', 'ground'], view: 'model', site, marks,
    model: {
      setup: { kind: 'seasons', t: ev.t },
      timing: {
        t0: ev.t - 183 * DAY, t1: ev.t + 183 * DAY, start: ev.t - 40 * DAY, rate: 366 * DAY / 1000 / 90, days: true, at: undefined,
        marks: seasonMarks(ev.t), slow: slowNear([ev.t], 12 * H, 12 * DAY, 0.12),
      },
    },
    t0: mid, t1: mid + DAY, start: rise ? rise - H : mid + 6 * H, rate: 24 * H / 1000 / 50,
    fov: { tele: 30, eye: 100, start: 'eye' },
    enter(view, c) {
      if (view === 'model') { c.model.aim(c.morbit, ev.t); return; }
      c.space.setPath(null); c.space.setMarker(site); c.space.showAxis(false); c.space.showCones(false); c.space.exaggerate(1);
      if (view === 'space') {
        c.orbit.target.set(0, 0, 0); c.orbit.up.set(0, 0, 1); c.orbit.minDist = 1.3; c.orbit.maxDist = 300;
        const sd = c.space.update(ev.t).sunDir;
        c.orbit.place(sd.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), 0.95).setZ(0.12), 3.6, true);
      }
    },
    frame(ms, view, c) {
      const sg = sunGeo(ms);
      if (view === 'model') {
        const au = sg.distKm / 149_597_870.7, zh = lang() === 'zh';
        return {
          caption: au < 0.985 ? s('cm_perihelion') : s('cm_season'),
          read: [
            [s('utc'), utcDay(ms)],
            [s('subsolar'), `${Math.abs(sg.dec).toFixed(1)}°${sg.dec >= 0 ? (zh ? '北纬' : 'N') : (zh ? '南纬' : 'S')}`],
            [s('sunDist'), `${au.toFixed(3)} AU`],
          ],
          note: s('mScaleHelio'),
        };
      }
      const read: [string, string][] = [
        [s('localTime'), siteClock(ms, site, false, lang())],
        [lang() === 'zh' ? '太阳直射' : 'Sun overhead at', `${Math.abs(sg.dec).toFixed(1)}°${sg.dec >= 0 ? (lang() === 'zh' ? '北纬' : 'N') : (lang() === 'zh' ? '南纬' : 'S')}`],
        [s('dayLength', { p: site.name }), `${Math.floor(dayLen / H)}h ${Math.round((dayLen % H) / 60_000)}m`],
      ];
      if (view === 'ground') {
        const st = c.ground.state;
        track(c, site.lat >= 0 ? 180 : 0, 30);
        read.push([s('sunAlt'), deg(st.sunAlt)]);
      }
      return { caption: ev.kind === 'equinox' ? s('cap_equinox') + ' ' + s('cap_season') : s('cap_solstice') + ' ' + s('cap_season'), read };
    },
  };
}

// ------------------------------------------------------------------------------------------------ planets

const isPlanet = (id: string): id is PlanetId => PLANETS.some(p => p.id === id);
function bodyDirAlt(c: Ctx, id: string): { az: number; alt: number } {
  if (id === 'moon') return { az: c.ground.state.moonAz, alt: c.ground.state.moonAlt };
  const p = c.ground.state.planets[id];
  return p ? { az: p.az, alt: p.alt } : { az: 180, alt: 20 };
}

/** Altitude (degrees) of an RA/Dec (degrees) at a site. */
function altAt(ra: number, dec: number, ms: number, o: GeoPoint): number {
  const h = (gast(ms) + o.lon - ra) * D2R, f = o.lat * D2R, d = dec * D2R;
  return Math.asin(Math.sin(f) * Math.sin(d) + Math.cos(f) * Math.cos(d) * Math.cos(h)) / D2R;
}

/** Best moment around an event to watch some bodies from a site: as high as possible in a dark-enough sky. */
function bestWatch(ids: string[], ev: SkyEvent, o: GeoPoint & { tz: number }): { t: number; score: number } {
  const mid = localMidnight(ev.t, o.tz);
  let t = ev.t, score = -99;
  for (let u = mid - 6 * H; u <= mid + 30 * H; u += 10 * 60_000) {
    let lo = 90;
    for (const id of ids) {
      const g = id === 'moon' ? moonGeo(u) : planetGeo(id as PlanetId, u);
      lo = Math.min(lo, altAt(g.ra, g.dec, u, o));
    }
    const sc = Math.min(lo, -sunAlt(u, o) - 6);
    if (sc > score + 0.01) { score = sc; t = u; }
  }
  return { t, score };
}

function planetAct(ev: SkyEvent, pick: Site | null): Act {
  const ids = (ev.bodies ?? []).filter(b => b !== 'sun' && b !== 'earth');
  const main = ids.find(isPlanet) ?? 'venus';
  // stand where (and when) the pair is highest in a dark sky: Beijing first, then further south
  let site: Site = pick ?? { ...SITES[0], id: 'best', name: s('bestSpot') };
  let w = bestWatch(ids.length ? ids : [main], ev, site);
  if (!pick && w.score < 10) {
    for (const id of ['hongkong', 'singapore', 'sydney']) {
      const x = SITES.find(y => y.id === id)!, c = { ...x, id: 'best', name: s('bestSpot') }, cw = bestWatch(ids.length ? ids : [main], ev, c);
      if (cw.score > w.score + 2) { site = c; w = cw; }
    }
  }
  const base = w.t;
  const span = 15;
  const at = (t: number) => base + ((t - base) / DAY) * SID;
  const cap = ev.kind === 'opposition' ? s('cap_opposition', { p: bodyName(main) })
    : ev.kind === 'elongation' ? s('cap_elongation', { p: bodyName(main) }) : s('cap_conjunction');
  return {
    title: eventTitle(ev), views: ['model', 'ground'], view: 'model', site, days: true, at,
    model: {
      setup: {
        kind: 'planets', t: ev.t, planets: ids.filter(isPlanet),
        sight: ev.kind === 'conjunction' ? ids.filter(isPlanet) : [main, 'sun'],
        arc: ev.kind === 'elongation' && isPlanet(main) ? main : undefined,
      },
      timing: { ...around(ev.t, 30, ev.kind === 'conjunction' ? s('c_closest') : s('c_peak'), 12 * H, 6 * DAY, 0.15, 60), start: ev.t - 20 * DAY },
    },
    marks: [{ t: base, label: ev.kind === 'conjunction' ? s('c_closest') : s('c_peak'), major: true }],
    t0: base - span * DAY, t1: base + span * DAY, start: base - 6 * DAY, rate: DAY / 1000 / 2.5,
    fov: { tele: ev.kind === 'conjunction' ? Math.max(3, (ev.value ?? 1) * 5) : 12, eye: 70, start: ev.kind === 'conjunction' ? 'tele' : 'eye' },
    solar: isPlanet(main) ? { focus: main, ms: ev.t } : undefined,
    enter(v, c) { if (v === 'model') { c.model.aim(c.morbit, ev.t); return; } c.ground.highlight = ids; },
    frame(ms, v, c) {
      if (v === 'model') {
        const g = isPlanet(main) ? planetGeo(main, ms) : null;
        const read: [string, string][] = [[s('utc'), utcDay(ms)]];
        if (g) read.push([s('elongation'), deg(Math.abs(g.elong), 0)], [s('earthDist'), `${g.distAu.toFixed(2)} AU`]);
        if (ev.kind === 'conjunction' && ids.length > 1 && ids.every(isPlanet)) {
          const p = planetGeo(ids[0] as PlanetId, ms), q = planetGeo(ids[1] as PlanetId, ms);
          read.push([s('separation'), deg(sepDeg(p.lon, p.lat, q.lon, q.lat), 2)]);
        }
        const k = ev.kind === 'opposition' ? 'cm_opposition' : ev.kind === 'elongation' ? 'cm_elongation' : 'cm_conjunction';
        return { caption: s(k, { p: bodyName(main) }), read, note: s('mScaleHelio') };
      }
      const a = bodyDirAlt(c, ids[0] ?? main), b = bodyDirAlt(c, ids[1] ?? ids[0] ?? main);
      const az = a.az + (((b.az - a.az + 540) % 360) - 180) / 2, alt = (a.alt + b.alt) / 2;
      track(c, az, c.look.targetFov > 20 ? Math.max(alt * 0.6, Math.min(alt, 18)) : alt);
      const g = isPlanet(main) ? planetGeo(main, ms) : null;
      const read: [string, string][] = [[s('localTime'), siteClock(ms, site, true, lang())]];
      if (g) read.push([s('elongation'), deg(Math.abs(g.elong), 0)], [s('distance'), `${g.distAu.toFixed(2)} AU`]);
      if (ev.kind === 'conjunction' && ids.length > 1) {
        const v = (id: string) => id === 'moon' ? (() => { const m = moonGeo(ms); return eqVec(m.ra, m.dec); })() : (() => { const p = planetGeo(id as PlanetId, ms); return eqVec(p.ra, p.dec); })();
        const p = v(ids[0]), q = v(ids[1]);
        read.push([s('separation'), deg(Math.acos(Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2])) / D2R, 2)]);
      }
      const st = c.ground.state.planets[main];
      if (st) read.push([lang() === 'zh' ? '亮度' : 'Magnitude', st.mag.toFixed(1)]);
      return { caption: cap, read };
    },
  };
}

// ------------------------------------------------------------------------------------------------ transits

function transitAct(ev: SkyEvent): Act {
  const id = ev.bodies![0] as PlanetId;
  const sepAt = (t: number) => {
    const p = planetGeo(id, t), g = sunGeo(t), a = eqVec(p.ra, p.dec), b = eqVec(g.ra, g.dec);
    return Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) / D2R;
  };
  const rsun = (t: number) => Math.asin(696_000 / sunGeo(t).distKm) / D2R;
  const edge = (from: number, dir: number) => { let t = from; while (Math.abs(t - from) < 12 * H && sepAt(t) < rsun(t)) t += dir * 60_000; return t; };
  const ingress = edge(ev.t, -1), egress = edge(ev.t, 1);
  const sg = sunGeo(ev.t);
  // the subsolar point: where the Sun is overhead at mid-transit
  const lon = ((sg.ra - gast(ev.t) + 540) % 360) - 180;
  const site: Site = { id: 'best', name: s('bestSpot'), lat: sg.dec, lon, tz: tzOf(lon), est: true };
  const t0 = ingress - 25 * 60_000, t1 = egress + 25 * 60_000;
  return {
    title: eventTitle(ev), views: ['model', 'ground'], view: 'model', site,
    marks: [{ t: ingress, label: s('c_ingress') }, { t: ev.t, label: s('c_midtransit'), major: true }, { t: egress, label: s('c_egress') }],
    model: { setup: { kind: 'planets', t: ev.t, planets: [id], sight: [id, 'sun'] }, timing: around(ev.t, 12, s('c_midtransit'), 4 * H, 2 * DAY, 0.04) },
    t0, t1, start: ingress - 6 * 60_000, rate: (t1 - t0) / 1000 / 60,
    slow: slowNear([ingress, egress], 2 * 60_000, 15 * 60_000, 0.15),
    fov: { tele: 0.9, eye: 0.9, start: 'tele' },
    solar: { focus: id, ms: ev.t },
    enter(v, c) { if (v === 'model') { c.model.aim(c.morbit, ev.t); return; } c.ground.filter = true; c.ground.transit = id; },
    frame(ms, v, c) {
      if (v === 'model') {
        const g = planetGeo(id, ms);
        return {
          caption: s('cm_transit', { p: bodyName(id) }),
          read: [[s('utc'), utcDate(ms)], [s('elongation'), deg(sepAt(ms), 2)], [s('earthDist'), `${g.distAu.toFixed(3)} AU`]],
          note: s('mScaleHelio'),
        };
      }
      const st = c.ground.state;
      track(c, st.sunAz, st.sunAlt);
      return {
        caption: s('cap_transit', { p: bodyName(id) }),
        read: [[s('utc'), new Date(ms).toISOString().slice(11, 16)], [s('localTime'), siteClock(ms, site, false, lang())], [s('sunAlt'), deg(st.sunAlt)]],
      };
    },
  };
}

/** Build the act for an event, watched from `pick` (null = the best spot). */
export function buildAct(ev: SkyEvent, pick: Site | null): Act {
  switch (ev.kind) {
    case 'solar-eclipse': return solarAct(ev, pick);
    case 'lunar-eclipse': return lunarAct(ev, pick);
    case 'meteor-shower': return meteorAct(ev, pick);
    case 'full-moon': case 'new-moon': case 'supermoon': return moonAct(ev, pick);
    case 'equinox': case 'solstice': return seasonAct(ev, pick);
    case 'transit': return transitAct(ev);
    default: return planetAct(ev, pick);
  }
}
