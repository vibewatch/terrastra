/**
 * Render quality tiers. The globe picks one at start-up from the device (phone/tablet, memory, cores) or from the URL
 * (`?q=high|medium|low`; `?lowfx` implies `low`), and then fine-tunes the pixel ratio at run time from frame times.
 * See ADR-015.
 */
export type Tier = 'high' | 'medium' | 'low';

/** `?lowfx` / `?lowfx=1` force reduced effects, `?lowfx=0` forces full effects; otherwise follow the OS “reduce motion” setting. */
export function lowFxFrom(params: URLSearchParams, prefersReduced: boolean): boolean {
  return params.has('lowfx') ? params.get('lowfx') !== '0' : prefersReduced;
}

export interface Quality {
  tier: Tier;
  /** Pixel-ratio ceiling (also capped by the device's own ratio) and the floor adaptive resolution may drop to. */
  dprMax: number;
  dprMin: number;
  msaa: boolean;
  /** Painted land texture width (height = width / 2). */
  mapW: number;
  nightW: number;
  /** Elevation / ocean-depth map width (public/data/relief/relief-<w>.webp). */
  reliefW: 1024 | 2048 | 4096;
  cloudW: number;
  cloudSeg: number;
  auroraN: number;
  earthSeg: [number, number];
  stars: number;
  /** Projected model radius (px) below which models switch to their far level of detail. */
  lodPx: number;
  /** Most item models drawn at once; the ones nearest the view centre win. */
  maxShown: number;
  /** Most moving (route) models drawn at once, counted separately from static ones. */
  maxMoving: number;
  /** Time budget (ms) per frame for placing newly built models. */
  drainMs: number;
  /** Shadow-map size for real-time model shadows (0 = off; the soft contact shadow under each model stays). */
  shadowMap: 0 | 1024 | 2048;
  /** Frame-rate cap while nothing is being dragged / flown / ridden (0 = render every display frame). */
  idleFps: number;
}

export const QUALITY: Record<Tier, Quality> = {
  high: { tier: 'high', dprMax: 2, dprMin: 1, msaa: true, mapW: 2048, nightW: 2048, reliefW: 4096, cloudW: 2048, cloudSeg: 128, auroraN: 384,
    earthSeg: [96, 96], stars: 1400, lodPx: 60, maxShown: 400, maxMoving: 400, drainMs: 10, idleFps: 0, shadowMap: 2048 },
  medium: { tier: 'medium', dprMax: 1.5, dprMin: 0.85, msaa: false, mapW: 2048, nightW: 1024, reliefW: 2048, cloudW: 1024, cloudSeg: 96, auroraN: 256,
    earthSeg: [80, 64], stars: 800, lodPx: 90, maxShown: 48, maxMoving: 16, drainMs: 6, idleFps: 30, shadowMap: 0 },
  low: { tier: 'low', dprMax: 1, dprMin: 0.75, msaa: false, mapW: 512, nightW: 1024, reliefW: 1024, cloudW: 512, cloudSeg: 64, auroraN: 160,
    earthSeg: [64, 48], stars: 400, lodPx: 110, maxShown: 36, maxMoving: 12, drainMs: 6, idleFps: 30, shadowMap: 0 },
};

interface DeviceHints {
  query?: string | null;
  lowfx?: boolean;
  coarse?: boolean;
  /** shorter side of the screen in CSS px */
  screenMin?: number;
  memoryGB?: number;
  cores?: number;
  mobileUA?: boolean;
}

export function pickTier(d: DeviceHints): Tier {
  if (d.query === 'high' || d.query === 'medium' || d.query === 'low') return d.query;
  if (d.lowfx) return 'low';
  if ((d.memoryGB !== undefined && d.memoryGB <= 2) || (d.cores !== undefined && d.cores <= 2)) return 'low';
  const handheld = d.mobileUA || (d.coarse && (d.screenMin ?? Infinity) <= 1024);
  if (handheld || (d.memoryGB !== undefined && d.memoryGB <= 4)) return 'medium';
  return 'high';
}

let active: Quality = QUALITY.high;
/** The tier chosen at start-up (for secondary renderers such as the model preview). */
export const currentQuality = (): Quality => active;

export function detectQuality(params: URLSearchParams, lowfx: boolean): Quality {
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean } };
  const tier = pickTier({
    query: params.get('q'),
    lowfx,
    coarse: matchMedia('(pointer: coarse)').matches,
    screenMin: Math.min(screen.width, screen.height),
    memoryGB: nav.deviceMemory,
    cores: nav.hardwareConcurrency,
    mobileUA: nav.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent),
  });
  return (active = QUALITY[tier]);
}

/**
 * Frame-time driven resolution: drops the pixel ratio a step when frames are consistently slow and raises it again
 * when there is headroom. Only fed with intervals between consecutively rendered frames.
 */
export class AdaptiveResolution {
  private avg = 16.7;
  private slow = 0;
  private fast = 0;
  ratio: number;

  constructor(private min: number, private max: number) { this.ratio = max; }

  /** Returns the new pixel ratio when it should change, otherwise null. */
  sample(ms: number): number | null {
    if (ms <= 0 || ms > 250) return null; // tab switches, hitches and stalls say nothing about steady frame cost
    this.avg += (ms - this.avg) * 0.08;
    this.slow = this.avg > 36 ? this.slow + 1 : 0;
    this.fast = this.avg < 19 ? this.fast + 1 : 0;
    if (this.slow > 45 && this.ratio > this.min) return this.step(-0.25);
    if (this.fast > 300 && this.ratio < this.max) return this.step(0.25);
    return null;
  }

  private step(d: number): number {
    this.ratio = Math.round(Math.min(this.max, Math.max(this.min, this.ratio + d)) * 100) / 100;
    this.slow = this.fast = 0;
    this.avg = 16.7 + (d < 0 ? 4 : 0);
    return this.ratio;
  }
}
