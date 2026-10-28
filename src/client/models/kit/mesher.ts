import * as THREE from 'three';
import { type V3, type MatOpts, add, mat } from '../prims.ts';

/**
 * Vertex-coloured triangle soup built into one mesh. `want` (optional) flips a triangle's winding so its face
 * normal points that way. Shared by the landmark/country/archaeology packs; packs extend it with their own shapes.
 */
export class Mesher {
  pos: number[] = [];
  col: number[] = [];
  private c = new THREE.Color();
  private cache = new Map<string, [number, number, number]>();
  /** Whether a window frame grows to cover an arched top (see `windows`). */
  protected archFrame = true;
  tri(a: V3, b: V3, d: V3, color: string, want?: V3): void {
    let q1 = b, q2 = d;
    if (want) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * want[0] + ny * want[1] + nz * want[2] < 0) { q1 = d; q2 = b; }
    }
    let k = this.cache.get(color);
    if (!k) { this.c.set(color); k = [this.c.r, this.c.g, this.c.b]; this.cache.set(color, k); }
    for (const q of [a, q1, q2]) { this.pos.push(q[0], q[1], q[2]); this.col.push(k[0], k[1], k[2]); }
  }
  quad(a: V3, b: V3, d: V3, e: V3, color: string, want?: V3): void { this.tri(a, b, d, color, want); this.tri(a, d, e, color, want); }
  /** Flat rectangle on a vertical facade: bottom-centre c, horizontal unit axis u, outward normal n. */
  rect(c: V3, u: [number, number], n: [number, number], w: number, h: number, color: string): void {
    const ux = u[0] * w / 2, uz = u[1] * w / 2;
    this.quad([c[0] - ux, c[1], c[2] - uz], [c[0] + ux, c[1], c[2] + uz], [c[0] + ux, c[1] + h, c[2] + uz], [c[0] - ux, c[1] + h, c[2] - uz], color, [n[0], 0, n[1]]);
  }
  /** Rows of (optionally arched) windows on a facade plane: o = facade centre at its base, u along the wall, n outward. */
  windows(o: V3, u: [number, number], n: [number, number], cols: number, dx: number, rows: number[], ww: number, wh: number, glass: string, frame?: string, arch = false): void {
    const fx = arch && this.archFrame ? ww * 0.5 : 0;
    for (const y of rows) for (let i = 0; i < cols; i++) {
      const s = (i - (cols - 1) / 2) * dx;
      const cx = o[0] + u[0] * s + n[0] * 0.0012, cz = o[2] + u[1] * s + n[1] * 0.0012;
      if (frame) this.rect([cx, o[1] + y - 0.0025, cz], u, n, ww + 0.005, wh + 0.005 + fx, frame);
      const cx2 = cx + n[0] * 0.0008, cz2 = cz + n[1] * 0.0008;
      this.rect([cx2, o[1] + y, cz2], u, n, ww, wh, glass);
      if (arch) this.tri([cx2 - u[0] * ww / 2, o[1] + y + wh, cz2 - u[1] * ww / 2], [cx2 + u[0] * ww / 2, o[1] + y + wh, cz2 + u[1] * ww / 2], [cx2, o[1] + y + wh + ww * 0.5, cz2], glass, [n[0], 0, n[1]]);
    }
  }
  build(p: THREE.Object3D, o: MatOpts = {}): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.computeVertexNormals();
    return add(p, geo, mat('#ffffff', { vc: true, ...o }), 0, 0, 0, 1, 1, 1);
  }
}
