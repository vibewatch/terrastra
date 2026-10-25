/**
 * The astronomy "board": a 3D scene of its own (not the globe) for the steps of an astronomy lesson. A step names a
 * kit (a small animated model: an orrery, a tide model, a star dome…) and passes it options; the board gives the kit
 * a scene graph, a camera with orbit controls, HTML labels and a lesson clock, and clears everything between steps.
 */
import type * as THREE from 'three';
import type { OrbitControls } from '../../sky/controls.ts';
import type { Pair } from '../stage.ts';
import type { CountryInfo } from '../../globe/painter.ts';
import type { Opts as ProjectionOpts } from './k-projection.ts';
import type { Opts as ModelOpts } from './k-model.ts';
import type { Opts as OrreryOpts } from './k-orrery.ts';
import type { Opts as CompareOpts } from './k-compare.ts';
import type { Opts as TidesOpts } from './k-tides.ts';
import type { Opts as SkyOpts } from './k-sky.ts';
import type { Opts as GalaxyOpts } from './k-galaxy.ts';
import type { Opts as LadderOpts } from './k-ladder.ts';
import type { Opts as KeplerOpts } from './k-kepler.ts';
import type { Opts as CannonOpts } from './k-cannon.ts';
import type { Opts as SatellitesOpts } from './k-satellites.ts';
import type { Opts as RetroOpts } from './k-retro.ts';
import type { Opts as SunOpts } from './k-sun.ts';
import type { Opts as StarsOpts } from './k-stars.ts';
import type { Opts as LifeOpts } from './k-life.ts';
import type { Opts as CompactOpts } from './k-compact.ts';
import type { Opts as ExpandOpts } from './k-expand.ts';
import type { Opts as TransitOpts } from './k-transit.ts';
import type { Opts as RaysOpts } from './k-rays.ts';
import type { Opts as LayersOpts } from './k-layers.ts';
import type { Opts as StrataOpts } from './k-strata.ts';
import type { Opts as MountainOpts } from './k-mountain.ts';
import type { Opts as AirOpts } from './k-air.ts';
import type { Opts as BeltsOpts } from './k-belts.ts';
import type { Opts as TermsOpts } from './k-terms.ts';
import type { Opts as GnomonOpts } from './k-gnomon.ts';
import type { Opts as NebulaOpts } from './k-nebula.ts';
import type { Opts as OpticsOpts } from './k-optics.ts';

export type { Pair };
export type V3 = [x: number, y: number, z: number];

/**
 * The lesson clock of an astronomy step: a value running from `from` to `to` at `rate` units per second. It can be
 * time (a date, days, years, millions of years) or any parameter a kit animates (latitude, launch speed,
 * eccentricity…). With `rate: 0` it is a fixed readout; the user can always drag the slider.
 */
export interface AstroClock {
  from: number; to: number;
  /** units per second (for `date`: days per second) */
  rate: number;
  /**
   * How the value reads:
   * - `date`: the value is a UTC instant (ms) and reads as a date (`from`/`to` are ms too)
   * - `hour` / `day` / `year`: elapsed time (“Day 12”); `myr` / `gyr`: millions / billions of years
   * - `deg`: an angle; `lat`: a latitude (N/S); `kms`: a speed in km/s; `x`: a plain number
   */
  unit: 'date' | 'hour' | 'day' | 'year' | 'myr' | 'gyr' | 'deg' | 'lat' | 'kms' | 'x';
  /** custom readout, `{v}` is the value (with `dp` decimals), e.g. `['e = {v}', '偏心率 {v}']` */
  fmt?: Pair;
  dp?: number;
  /** stop at the end instead of starting over (default: loop) */
  once?: boolean;
  /** where the slider starts (0 … 1, default 0) */
  at?: number;
  /** start paused */
  hold?: boolean;
}

/** A lab slider: a parameter the learner changes; the kit reads it each frame with `ctx.param(id)`. */
export interface AstroParam {
  id: string; name: Pair; min: number; max: number; value: number;
  /** slider step (default: (max − min) / 100) */
  step?: number;
  /** readout, `{v}` is the value with `dp` decimals (default `{v}`) */
  fmt?: Pair; dp?: number;
}
/** A lab task: it ticks itself once `done` holds for the parameters and the clock value. */
export interface LabTask { text: Pair; done: (p: Readonly<Record<string, number>>, v: number) => boolean }

/**
 * One kit and its options; `cam` overrides the kit's own framing. `params` turn the step into a lab: sliders in the
 * card, read by the kit, with optional `tasks` that tick themselves.
 */
type With<K extends string, O> = { kit: K; clock?: AstroClock; cam?: AstroCam; params?: AstroParam[]; tasks?: LabTask[] } & O;
export type AstroScene =
  | With<'model', ModelOpts>
  | With<'orrery', OrreryOpts>
  | With<'compare', CompareOpts>
  | With<'tides', TidesOpts>
  | With<'sky', SkyOpts>
  | With<'galaxy', GalaxyOpts>
  | With<'ladder', LadderOpts>
  | With<'kepler', KeplerOpts>
  | With<'cannon', CannonOpts>
  | With<'satellites', SatellitesOpts>
  | With<'retro', RetroOpts>
  | With<'sun', SunOpts>
  | With<'stars', StarsOpts>
  | With<'life', LifeOpts>
  | With<'compact', CompactOpts>
  | With<'expand', ExpandOpts>
  | With<'transit', TransitOpts>
  | With<'rays', RaysOpts>
  | With<'projection', ProjectionOpts>
  | With<'layers', LayersOpts>
  | With<'strata', StrataOpts>
  | With<'mountain', MountainOpts>
  | With<'air', AirOpts>
  | With<'belts', BeltsOpts>
  | With<'terms', TermsOpts>
  | With<'gnomon', GnomonOpts>
  | With<'nebula', NebulaOpts>
  | With<'optics', OpticsOpts>;
/** A scene as the board gets it from the server: lab tasks without their rules (the server checks those). */
export type BoardScene = AstroScene extends infer S ? S extends AstroScene ? Omit<S, 'tasks'> & { tasks?: { text: Pair }[] } : never : never;
export type KitId = AstroScene['kit'];

/** Camera: look at `target` (default origin) from direction `from`, `dist` away. The scene's up axis is +z. */
export interface AstroCam { from: V3; dist: number; target?: V3 }

export interface LabelOpts {
  /** colour (CSS) */ c?: string;
  /** bigger heading */ big?: boolean;
  /** pulsing dot at the point */ dot?: boolean;
  /** reveal after this many seconds */ t?: number;
  /** shift on screen (px), e.g. to sit above a body */ dx?: number; dy?: number;
}
export interface Label {
  readonly el: HTMLElement;
  /** world position the label follows (ignored when it follows an object); kits may move it every frame */
  readonly pos: THREE.Vector3;
  /** change the text */
  set(text: Pair | string): void;
  /** show / hide */
  on: boolean;
}

export interface KitCtx {
  /** the step's scene graph: cleared and disposed (geometries, materials, textures) when the step changes */
  readonly root: THREE.Group;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly orbit: OrbitControls;
  readonly renderer: THREE.WebGLRenderer;
  /** low-end device: fewer particles, smaller textures */
  readonly low: boolean;
  /** country outlines (from the globe; empty until it has loaded them) */
  countries(): readonly CountryInfo[];
  zh(): boolean;
  L(p: Pair): string;
  /**
   * Frame the scene: look at `target` from direction `from`, `dist` away. The distance is scaled so that what fits
   * a 16:10 screen at `dist` fits the free area beside the lesson card.
   */
  view(from: V3, dist: number, target?: V3, snap?: boolean): void;
  /** An HTML label pinned to a point or following an object. */
  label(at: THREE.Vector3 | THREE.Object3D, text: Pair | string, o?: LabelOpts): Label;
  /** Make an object answerable in a "pick it" quiz question (`Quiz.pick` = tag). */
  pickable(obj: THREE.Object3D, tag: string): void;
  /** A lab slider's value (the scene's `params`); NaN when the scene has no such parameter. */
  param(id: string): number;
}

/** A running kit for one step. */
export interface KitRun {
  /**
   * Each frame. `v`: the clock value (UTC ms for `date`), or 0 without a clock; `dt`: seconds since the last frame
   * (0 when only the slider moved); `el`: seconds since the step was shown (for draw-in animations).
   */
  update(v: number, dt: number, el: number): void;
  /** Extra text after the clock readout (e.g. “Earth–Moon 384 400 km”). */
  readout?(v: number): Pair | string;
  dispose?(): void;
}
export type KitFactory<O> = (ctx: KitCtx, o: O) => KitRun;
