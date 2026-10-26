/**
 * Earth, Moon and Sun in space at true relative sizes and distances (unit = one Earth radius), in the equatorial
 * frame of date. The Moon's shadow on Earth and Earth's shadow on the Moon are computed per pixel from the real
 * geometry; the eclipse path, the shadow axis and Earth's umbra / penumbra cones are drawn as guides.
 */
import * as THREE from 'three';
import { gast, sunGeo, moonGeo, eqVec, sunEcef, moonEcef } from '../../shared/lib/astro/ephem.ts';
import type { GeoPoint, PathPoint, Vec3 } from '../../shared/lib/astro/types.ts';
import { D2R, R_EARTH, R_MOON, R_SUN, R_SHADOW, bodyTexture, glowTexture } from './common.ts';
import { earthMaterial, moonMaterial, moonBasis, sunDiscMaterial, SUN_SPAN } from './bodies.ts';
import { CONSTELLATIONS } from '../../shared/data/constellations.ts';

const SUN_DIST = 4000;
const UMBRA_LEN = (R_EARTH * 149_597_870.7) / (R_SUN - R_EARTH) / R_EARTH;

function sph(p: GeoPoint, r = 1.003): THREE.Vector3 {
  const la = p.lat * D2R, lo = p.lon * D2R;
  return new THREE.Vector3(Math.cos(la) * Math.cos(lo) * r, Math.cos(la) * Math.sin(lo) * r, Math.sin(la) * r);
}

interface SpaceState { sunEq: Vec3; moonEq: Vec3; sunDir: THREE.Vector3; moonPos: THREE.Vector3 }

export class SpaceScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.005, 20000);
  readonly earth: THREE.Mesh<THREE.SphereGeometry, ReturnType<typeof earthMaterial>>;
  readonly moon: THREE.Mesh<THREE.SphereGeometry, ReturnType<typeof moonMaterial>>;
  private sun: THREE.Mesh<THREE.PlaneGeometry, ReturnType<typeof sunDiscMaterial>>;
  private stars: THREE.Points;
  private paths = new THREE.Group();
  private cones = new THREE.Group();
  private axis: THREE.Line;
  private orbit: THREE.Line;
  private marker: THREE.Sprite;
  state!: SpaceState;
  private time = 0;
  private orbitAt = NaN;

  constructor() {
    this.scene.add(this.camera);
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), earthMaterial());
    this.earth.renderOrder = 2;
    this.scene.add(this.earth);
    const placeholder = new THREE.DataTexture(new Uint8Array([30, 60, 110, 255]), 1, 1);
    placeholder.needsUpdate = true;
    this.earth.material.uniforms.uDay.value = placeholder;
    bodyTexture('earth', 2048).then(t => { this.earth.material.uniforms.uDay.value = t; this.earth.material.needsUpdate = true; placeholder.dispose(); }).catch(() => {});
    this.earth.add(this.paths);

    this.moon = new THREE.Mesh(new THREE.SphereGeometry(R_MOON / R_EARTH, 96, 48), moonMaterial());
    this.moon.material.transparent = false;
    this.moon.material.blending = THREE.NormalBlending;
    this.moon.renderOrder = 2;
    this.scene.add(this.moon);
    bodyTexture('moon').then(t => { this.moon.material.uniforms.uMap.value = t; this.moon.material.uniforms.uReady.value = 1; }).catch(() => {});

    const sm = sunDiscMaterial();
    sm.depthTest = true;
    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(2 * SUN_SPAN, 2 * SUN_SPAN), sm);
    this.sun.renderOrder = 3;
    this.scene.add(this.sun);

    // stars as a far backdrop (equatorial J2000 is close enough for a backdrop)
    const pos: number[] = [], col: number[] = [];
    for (const c of CONSTELLATIONS) for (const [ra, dec, m] of c.stars) {
      const cd = Math.cos(dec * D2R);
      pos.push(cd * Math.cos(ra * D2R) * 9000, cd * Math.sin(ra * D2R) * 9000, Math.sin(dec * D2R) * 9000);
      const b = Math.max(0.15, Math.min(1, (5 - m) / 4.5));
      col.push(b, b, b * 1.05);
    }
    let seed = 9;
    const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 2500; i++) {
      const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z), b = 0.08 + Math.pow(r(), 4) * 0.4;
      pos.push(s * Math.cos(a) * 9000, s * Math.sin(a) * 9000, z * 9000); col.push(b, b, b);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false, transparent: true }));
    this.stars.renderOrder = 0;
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);

    this.axis = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: 0xffb547, dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0.55, depthWrite: false }));
    this.axis.visible = false;
    this.scene.add(this.axis);
    this.orbit = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.22, depthWrite: false }));
    this.scene.add(this.orbit);
    this.scene.add(this.cones);
    this.cones.visible = false;
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb547, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.marker.visible = false;
    this.marker.renderOrder = 4;
    this.earth.add(this.marker);
  }

  /** Draw a solar eclipse's central line and limits on the globe. */
  setPath(path: PathPoint[] | null): void {
    for (const c of [...this.paths.children]) { const l = c as THREE.Line; this.paths.remove(l); l.geometry.dispose(); (l.material as THREE.Material).dispose(); }
    if (!path?.length) return;
    const line = (pts: (GeoPoint | null)[], color: number, op: number) => {
      // split where a limit drops off the Earth
      let run: THREE.Vector3[] = [];
      const flush = () => {
        if (run.length > 1) {
          const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(run), new THREE.LineBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false }));
          l.renderOrder = 3;
          this.paths.add(l);
        }
        run = [];
      };
      for (const p of pts) { if (p) run.push(sph(p)); else flush(); }
      flush();
    };
    line(path.map(p => p.center), 0xffb547, 0.95);
    line(path.map(p => p.north), 0x7dd3fc, 0.6);
    line(path.map(p => p.south), 0x7dd3fc, 0.6);
  }

  /** A glowing pin on the globe (the observer or the greatest-eclipse point). */
  setMarker(p: GeoPoint | null): void {
    this.marker.visible = !!p;
    if (p) { this.marker.position.copy(sph(p, 1.01)); this.marker.scale.setScalar(0.09); }
  }

  /** Earth's umbra and penumbra as faint cones (lunar eclipses). */
  showCones(on: boolean): void {
    this.cones.visible = on;
    if (!on || this.cones.children.length) return;
    const mk = (r0: number, r1: number, l: number, color: number, op: number) => {
      const g = new THREE.CylinderGeometry(r1, r0, l, 96, 1, true);
      g.translate(0, l / 2, 0);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.renderOrder = 1;
      this.cones.add(m);
    };
    const L = 75, pr = (R_SUN + R_EARTH) / 149_597_870.7 / 1 * (L * R_EARTH) / R_EARTH;
    mk(R_SHADOW / R_EARTH, (R_SHADOW / R_EARTH) * (1 - L / UMBRA_LEN), L, 0xff6a3a, 0.07);
    mk(1, 1 + pr, L, 0x7dd3fc, 0.035);
  }

  showAxis(on: boolean): void { this.axis.visible = on; }

  /** Draw Earth and Moon k× larger (to see them in a whole-orbit view); shading stays exact. */
  exaggerate(k: number): void { this.earth.scale.setScalar(k); this.moon.scale.setScalar(k); }

  update(ms: number, dt = 0): SpaceState {
    this.time += dt;
    const th = gast(ms);
    const sEq = eqVec(sunGeo(ms)), mEq = eqVec(moonGeo(ms));
    this.earth.rotation.set(0, 0, th * D2R);
    this.earth.updateMatrixWorld();
    const eu = this.earth.material.uniforms;
    const se = sunEcef(ms), me = moonEcef(ms);
    eu.uSunRel.value.set(se[0], se[1], se[2]);
    eu.uMoonRel.value.set(me[0], me[1], me[2]);

    const moonPos = new THREE.Vector3(mEq[0], mEq[1], mEq[2]).divideScalar(R_EARTH);
    this.moon.position.copy(moonPos);
    const mu = this.moon.material.uniforms;
    mu.uSunRel.value.set(sEq[0] - mEq[0], sEq[1] - mEq[1], sEq[2] - mEq[2]);
    mu.uEarthRel.value.set(-mEq[0], -mEq[1], -mEq[2]);
    moonBasis(mu.uEarthRel.value, new THREE.Vector3(0, 0, 1), mu.uBasis.value);
    mu.uOcc.value = 1;
    mu.uEarthshine.value = 1;
    mu.uGain.value = 1.1;

    // the Sun: a billboard far away in the right direction and at the right angular size
    const sd = new THREE.Vector3(sEq[0], sEq[1], sEq[2]).normalize();
    const rs = Math.asin(R_SUN / Math.hypot(...sEq));
    const sp = sd.clone().multiplyScalar(SUN_DIST).add(this.camera.position);
    const f = sp.clone().sub(this.camera.position).normalize();
    let rr = new THREE.Vector3().crossVectors(f, this.camera.up);
    if (rr.lengthSq() < 1e-6) rr.set(1, 0, 0);
    rr.normalize();
    const uu = new THREE.Vector3().crossVectors(rr, f);
    const sz = SUN_DIST * Math.tan(rs);
    const m4 = new THREE.Matrix4().makeBasis(rr.clone().multiplyScalar(sz), uu.clone().multiplyScalar(sz), f.clone().multiplyScalar(-sz));
    m4.setPosition(sp);
    this.sun.matrixAutoUpdate = false;
    this.sun.matrix.copy(m4);
    this.sun.matrixWorldNeedsUpdate = true;
    // is the Sun hidden behind Earth or the Moon from the camera? then its corona shows
    const cam = this.camera.position;
    const hide = (c: THREE.Vector3, rad: number) => {
      const b = c.clone().sub(cam), d = b.length();
      if (b.dot(f) <= 0) return 0;
      const ro = Math.asin(Math.min(1, rad / d)), sepA = b.angleTo(f);
      return THREE.MathUtils.clamp((ro + rs - sepA) / (2 * rs), 0, 1);
    };
    const covered = Math.max(hide(new THREE.Vector3(), 1.0), hide(moonPos, R_MOON / R_EARTH));
    const su = this.sun.material.uniforms;
    su.uMoon.value.set(99, 99);
    su.uCorona.value = THREE.MathUtils.smoothstep(covered, 0.9, 1);
    su.uChromo.value = 0;
    su.uGlare.value = 1 - covered;
    su.uPx.value = 40;
    su.uTime.value = this.time;

    this.stars.position.copy(cam);

    // the Moon's orbit around this instant (refreshed every few hours of sim time)
    if (!(Math.abs(ms - this.orbitAt) < 6 * 3600_000)) {
      this.orbitAt = ms;
      const pts: THREE.Vector3[] = [];
      for (let i = -150; i <= 150; i++) {
        const v = eqVec(moonGeo(ms + i * 0.1 * 86400_000));
        pts.push(new THREE.Vector3(v[0], v[1], v[2]).divideScalar(R_EARTH));
      }
      this.orbit.geometry.dispose();
      this.orbit.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    }

    // shadow axis: from the Moon away from the Sun, through to Earth (solar eclipses)
    if (this.axis.visible) {
      const a = moonPos.clone(), b = moonPos.clone().addScaledVector(sd, -moonPos.length() * 1.05);
      this.axis.geometry.setFromPoints([a, b]);
      this.axis.computeLineDistances();
    }
    if (this.cones.visible) this.cones.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sd.clone().negate());

    this.state = { sunEq: sEq, moonEq: mEq, sunDir: sd, moonPos };
    return this.state;
  }

  render(r: THREE.WebGLRenderer): void { r.render(this.scene, this.camera); }

  dispose(): void {
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    });
  }
}
