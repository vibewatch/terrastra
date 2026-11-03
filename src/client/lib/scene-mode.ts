import type { ScaleId } from '../../shared/data/cosmos.ts';
import type { MusicLevel } from './music.ts';

export type SurfaceScene = 'globe' | 'map' | 'solar';

export class SceneModeController {
  private surfaceState: SurfaceScene = 'globe';
  private skyState = false;
  private gamingState = false;
  private scaleState: ScaleId = 'solar';
  private seq = 0;

  constructor(private readonly onChange?: () => void) {}

  get surface(): SurfaceScene { return this.surfaceState; }
  get inMap(): boolean { return this.surfaceState === 'map'; }
  get inSolar(): boolean { return this.surfaceState === 'solar'; }
  get inSky(): boolean { return this.skyState; }
  get gaming(): boolean { return this.gamingState; }
  get scale(): ScaleId { return this.scaleState; }
  get navSeq(): number { return this.seq; }

  /** Bumps the navigation sequence and returns the new token. */
  beginNav(): number {
    return ++this.seq;
  }

  /** Checks whether `token` is still the active navigation request. */
  isCurrentNav(token: number): boolean {
    return token === this.seq;
  }

  /** Whether the user is actively viewing the 3D Earth globe (not in map, solar, sky, or game). */
  canLoadGlobeAdmin(lessoning: boolean): boolean {
    return this.surfaceState === 'globe' && !this.skyState && !this.gamingState && !lessoning;
  }

  /** Background music track matching the active scene and cosmic scale. */
  get musicLevel(): MusicLevel {
    if (this.skyState) return 'sky';
    if (this.surfaceState === 'solar') return this.scaleState === 'stars' ? 'galaxy' : this.scaleState;
    return 'earth';
  }

  setScale(scale: ScaleId): void {
    if (this.scaleState === scale) return;
    this.scaleState = scale;
    this.onChange?.();
  }

  setGaming(on: boolean): void {
    if (on) this.seq++;
    this.gamingState = on;
    this.onChange?.();
  }

  enterMap(): void {
    this.surfaceState = 'map';
    this.onChange?.();
  }

  leaveMap(): boolean {
    if (this.surfaceState !== 'map') return false;
    this.surfaceState = 'globe';
    this.onChange?.();
    return true;
  }

  enterSolar(): void {
    this.surfaceState = 'solar';
    this.onChange?.();
  }

  leaveSolar(): boolean {
    if (this.surfaceState !== 'solar') return false;
    this.seq++;
    this.surfaceState = 'globe';
    this.onChange?.();
    return true;
  }

  enterSky(): void {
    this.skyState = true;
    this.onChange?.();
  }

  leaveSky(): void {
    if (!this.skyState) return;
    this.skyState = false;
    this.onChange?.();
  }
}
