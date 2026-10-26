import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { inferPbr, PBR_ATTR } from '../../src/client/models/pbr.ts';
import { bakeStaticMeshes } from '../../src/client/models/kit.ts';
import { box, mat, add, BOX } from '../../src/client/models/prims.ts';
import { packModel, unpackModel } from '../../src/client/models/pack.ts';

const pbr = (hex: string) => inferPbr(new THREE.Color(hex));

describe('inferPbr', () => {
  it('keeps foliage and earth matte, water glossy and gold metallic', () => {
    expect(pbr('#16a34a')[0]).toBeGreaterThan(0.8);
    expect(pbr('#8a6a4a')[0]).toBeGreaterThan(0.8);
    expect(pbr('#38bdf8')[0]).toBeLessThan(0.25);
    expect(pbr('#eab308')[1]).toBeGreaterThan(0.3);
    expect(pbr('#16a34a')[1]).toBe(0);
  });
});

describe('bakeStaticMeshes', () => {
  it('stores inferred finishes per vertex but honours explicit ones', () => {
    const gp = new THREE.Group();
    box(gp, '#16a34a', 0, 0, 0, 1, 1, 1);
    add(gp, BOX(), mat('#16a34a', { rough: 0.1, metal: 0.9 }), 2, 0, 0, 1, 1, 1);
    bakeStaticMeshes(gp);
    const meshes = gp.children.filter(c => (c as THREE.Mesh).isMesh) as THREE.Mesh[];
    expect(meshes).toHaveLength(1);
    const a = meshes[0].geometry.getAttribute(PBR_ATTR);
    const vals = new Set<string>();
    for (let i = 0; i < a.count; i++) vals.add(`${a.getX(i).toFixed(2)},${a.getY(i).toFixed(2)}`);
    expect(vals).toContain('0.86,0.00');
    expect(vals).toContain('0.10,0.90');
  });
});

describe('people rig', async () => {
  const { ik2, armFK } = await import('../../src/client/models/rig.ts');
  const { human } = await import('../../src/client/models/human.ts');
  type V = [number, number, number];
  const dist = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  it('two-bone IK keeps both bone lengths and bends toward the pole, whatever the reach', () => {
    const a: V = [0, 1, 0], l1 = 0.45, l2 = 0.42, pole: V = [0, 0, 1];
    for (const t of [[0, 0.3, 0.1], [0, -2, 0.3], [0.01, 0.98, 0.01], [0.3, 0.4, -0.2]] as V[]) {
      const { mid, end } = ik2(a, t, l1, l2, pole);
      expect(dist(a, mid)).toBeCloseTo(l1, 6);
      expect(dist(mid, end)).toBeCloseTo(l2, 4);
      // the joint sits on the pole side of the root–end line
      const ax = [end[0] - a[0], end[1] - a[1], end[2] - a[2]], m = [mid[0] - a[0], mid[1] - a[1], mid[2] - a[2]];
      const L2 = ax[0] ** 2 + ax[1] ** 2 + ax[2] ** 2, k = (m[0] * ax[0] + m[1] * ax[1] + m[2] * ax[2]) / L2;
      expect(m[2] - k * ax[2]).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('arm FK keeps the forearm and upper arm their lengths', () => {
    for (const P of [{}, { fwd: 2.8, bend: 2.5 }, { side: 2.9, inward: 1.4 }, { fwd: -1, side: -0.35 }]) {
      const sh: V = [0.1, 0.8, 0], r = armFK(1, P, sh, 0.17, 0.15);
      expect(dist(sh, r.elbow)).toBeCloseTo(0.17, 6);
      expect(dist(r.elbow, r.wrist)).toBeCloseTo(0.15, 6);
    }
  });

  it('builds every pose at every detail level with finite geometry', () => {
    const poses = ['stand', 'relax', 'walk', 'run', 'sit', 'sitGround', 'kneel', 'crouch', 'wave', 'point', 'cheer', 'carry', 'pray', 'photo', 'reach', 'row'] as const;
    for (const detail of ['min', 'lo', 'hi'] as const) for (const pose of poses) {
      const g = new THREE.Group();
      human(g, 0, 0, 0, { h: 1, pose, detail, phase: 0.3, top: '#2563eb' });
      let n = 0;
      g.traverse(o => {
        const pos = (o as THREE.Mesh).geometry?.attributes?.position;
        if (!pos) return;
        n++;
        for (let i = 0; i < pos.array.length; i++) if (!Number.isFinite(pos.array[i])) throw new Error(`${pose}/${detail}: NaN in ${o.name || o.type}`);
      });
      expect(n, `${pose}/${detail}`).toBeGreaterThan(5);
    }
  });
});

describe('model packing', () => {
  it('ships normals and colours as 16-bit normalised integers that unpack to the same values', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const n = geo.getAttribute('position').count;
    geo.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => (i % 7) / 6), 3));
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true })));
    const out = unpackModel(packModel(root).model).children[0] as THREE.Mesh;
    const nor = out.geometry.getAttribute('normal') as THREE.BufferAttribute, col = out.geometry.getAttribute('color') as THREE.BufferAttribute;
    expect(nor.array).toBeInstanceOf(Int16Array);
    expect(col.array).toBeInstanceOf(Uint16Array);
    expect(nor.normalized && col.normalized).toBe(true);
    expect(out.geometry.getAttribute('position').array).toBeInstanceOf(Float32Array);
    for (let i = 0; i < n; i++) {
      for (const [q, f] of [[nor, geo.getAttribute('normal')], [col, geo.getAttribute('color')]] as const) {
        expect(q.getX(i)).toBeCloseTo(f.getX(i), 4);
        expect(q.getZ(i)).toBeCloseTo(f.getZ(i), 4);
      }
    }
  });

  it('leaves colours outside 0…1 (e.g. HDR tints) as floats', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(geo.getAttribute('position').count * 3).fill(1.5), 3));
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true })));
    const out = unpackModel(packModel(root).model).children[0] as THREE.Mesh;
    expect(out.geometry.getAttribute('color').array).toBeInstanceOf(Float32Array);
  });
});
