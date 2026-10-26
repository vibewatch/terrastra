/** Pointer controls for the theatre: look-around (ground views) and orbit (space views). Drag, wheel, pinch. */
import * as THREE from 'three';
import { D2R } from './common.ts';

interface Gesture { onDrag(dx: number, dy: number): void; onZoom(f: number): void }

function bind(el: HTMLElement, g: Gesture, onUser: () => void): () => void {
  const pts = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  const down = (e: PointerEvent) => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = 0; };
  const move = (e: PointerEvent) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d0 = Math.hypot(a.x - b.x, a.y - b.y);
      p.x = e.clientX; p.y = e.clientY;
      const d1 = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch && d0 > 0) g.onZoom(d0 / d1);
      pinch = 1;
      onUser();
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (dx || dy) { g.onDrag(dx, dy); onUser(); }
  };
  const up = (e: PointerEvent) => { pts.delete(e.pointerId); };
  const wheel = (e: WheelEvent) => { e.preventDefault(); g.onZoom(Math.exp(Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) * 0.0022)); onUser(); };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', wheel, { passive: false });
  return () => {
    el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('wheel', wheel);
  };
}

/** Stand on the ground and look around: azimuth / altitude in degrees and a zoomable field of view (telescope ↔ eye). */
export class LookControls {
  enabled = true;
  az = 180; alt = 30; fov = 60;
  private tAz = 180; private tAlt = 30; private tFov = 60;
  /** Called when the user takes over (so an act can stop following its target). */
  onUser: () => void = () => {};
  minFov = 0.5; maxFov = 110;
  private off: () => void;

  constructor(el: HTMLElement, private cam: THREE.PerspectiveCamera) {
    this.off = bind(el, {
      onDrag: (dx, dy) => {
        if (!this.enabled) return;
        const k = this.fov / Math.max(el.clientHeight, 1);
        this.tAz = this.tAz - dx * k; this.tAlt = Math.max(-15, Math.min(90, this.tAlt + dy * k));
        this.az = this.tAz; this.alt = this.tAlt;
      },
      onZoom: f => { if (this.enabled) this.tFov = Math.max(this.minFov, Math.min(this.maxFov, this.tFov * f)); },
    }, () => { if (this.enabled) this.onUser(); });
  }

  /**
   * Point at a direction (smoothly unless `snap`). With `follow`, small target moves carry the view along at once, so
   * tracking a body that drifts across a narrow telescope field has no easing lag; big jumps still ease.
   */
  aim(az: number, alt: number, fov?: number, snap = false, follow = false): void {
    const d = ((az - this.tAz) % 360 + 540) % 360 - 180;
    if (follow && Math.abs(d) < 5 && Math.abs(alt - this.tAlt) < 5) { this.az += d; this.alt += alt - this.tAlt; }
    this.tAz += d; this.tAlt = alt;
    if (fov) this.tFov = fov;
    if (snap) { this.az = this.tAz; this.alt = this.tAlt; if (fov) this.fov = fov; }
  }
  zoom(f: number): void { this.tFov = Math.max(this.minFov, Math.min(this.maxFov, this.tFov * f)); }
  get targetFov(): number { return this.tFov; }
  /** Jump to the target now (after a cut: new view, scrubbed timeline). */
  settle(): void { this.az = this.tAz; this.alt = this.tAlt; this.fov = this.tFov; }

  update(dt: number): void {
    const k = 1 - Math.exp(-dt * 6);
    this.az += (this.tAz - this.az) * k; this.alt += (this.tAlt - this.alt) * k;
    this.fov = Math.exp(Math.log(this.fov) + (Math.log(this.tFov) - Math.log(this.fov)) * k);
    const ca = Math.cos(this.alt * D2R);
    this.cam.up.set(0, 1, 0);
    this.cam.position.set(0, 0, 0);
    this.cam.lookAt(ca * Math.sin(this.az * D2R), Math.sin(this.alt * D2R), -ca * Math.cos(this.az * D2R));
    if (Math.abs(this.cam.fov - this.fov) > 1e-4) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
  }

  dispose(): void { this.off(); }
}

/** Orbit a target in space: drag to turn, wheel / pinch to change distance. */
export class OrbitControls {
  enabled = true;
  target = new THREE.Vector3();
  up = new THREE.Vector3(0, 0, 1);
  /** Spherical angles around `up` (radians) and distance. */
  theta = 0; phi = 1.2; dist = 4;
  private tTheta = 0; private tPhi = 1.2; private tDist = 4;
  minDist = 1.2; maxDist = 400;
  onUser: () => void = () => {};
  private off: () => void;
  private basis = new THREE.Matrix4();

  constructor(el: HTMLElement, private cam: THREE.PerspectiveCamera) {
    this.off = bind(el, {
      onDrag: (dx, dy) => { if (!this.enabled) return; this.tTheta -= dx * 0.006; this.tPhi = Math.max(0.05, Math.min(Math.PI - 0.05, this.tPhi - dy * 0.006)); },
      onZoom: f => { if (this.enabled) this.tDist = Math.max(this.minDist, Math.min(this.maxDist, this.tDist * f)); },
    }, () => { if (this.enabled) this.onUser(); });
  }

  /** Put the camera so that it looks at the target from direction `from` (world), at distance d. */
  place(from: THREE.Vector3, d: number, snap = false): void {
    const z = this.up.clone().normalize(), x = new THREE.Vector3(1, 0, 0);
    if (Math.abs(x.dot(z)) > 0.9) x.set(0, 1, 0);
    x.addScaledVector(z, -x.dot(z)).normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    const f = from.clone().normalize();
    this.tTheta = Math.atan2(f.dot(y), f.dot(x));
    this.tPhi = Math.acos(Math.max(-1, Math.min(1, f.dot(z))));
    // keep the shortest way round
    this.tTheta = this.theta + (((this.tTheta - this.theta) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    this.tDist = d;
    if (snap) { this.theta = this.tTheta; this.phi = this.tPhi; this.dist = d; }
  }
  zoom(f: number): void { this.tDist = Math.max(this.minDist, Math.min(this.maxDist, this.tDist * f)); }
  settle(): void { this.theta = this.tTheta; this.phi = this.tPhi; this.dist = this.tDist; }
  /** Turn slowly around the target (an idle drift). */
  spin(d: number): void { this.tTheta += d; this.theta += d; }

  update(dt: number): void {
    const k = 1 - Math.exp(-dt * 5);
    this.theta += (this.tTheta - this.theta) * k; this.phi += (this.tPhi - this.phi) * k;
    this.dist = Math.exp(Math.log(this.dist) + (Math.log(this.tDist) - Math.log(this.dist)) * k);
    const z = this.up.clone().normalize(), x = new THREE.Vector3(1, 0, 0);
    if (Math.abs(x.dot(z)) > 0.9) x.set(0, 1, 0);
    x.addScaledVector(z, -x.dot(z)).normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    this.basis.makeBasis(x, y, z);
    const sp = Math.sin(this.phi);
    const off = new THREE.Vector3(sp * Math.cos(this.theta), sp * Math.sin(this.theta), Math.cos(this.phi)).applyMatrix4(this.basis);
    this.cam.position.copy(this.target).addScaledVector(off, this.dist);
    this.cam.up.copy(z);
    this.cam.lookAt(this.target);
  }

  dispose(): void { this.off(); }
}
