import { mesh } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import { latLonToVec } from '../../shared/lib/geo.ts';

/** Long straight edges (e.g. the 49th parallel) are split into ≤ 1° steps so the chords stay above the surface. */
const STEP_DEG = 1;

function pushLine(out: number[], line: Position[], r: number): void {
  for (let i = 0; i < line.length - 1; i++) {
    const [lon1, lat1] = line[i], [lon2, lat2] = line[i + 1];
    if (Math.abs(lon1 - lon2) > 90) continue; // antimeridian wrap
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(lon2 - lon1), Math.abs(lat2 - lat1)) / STEP_DEG));
    let p = latLonToVec(lat1, lon1, r);
    for (let k = 1; k <= n; k++) {
      const q = latLonToVec(lat1 + ((lat2 - lat1) * k) / n, lon1 + ((lon2 - lon1) * k) / n, r);
      out.push(p[0], p[1], p[2], q[0], q[1], q[2]);
      p = q;
    }
  }
}

const meshCache = new WeakMap<Topology, Float32Array>();

/** Line segments `[x1,y1,z1, x2,y2,z2, …]` of the land borders between countries (no coastlines). */
export function borderPositions(topo: Topology, radius = 1.0015): Float32Array {
  const hit = meshCache.get(topo);
  if (hit) return hit;
  const m = mesh(topo, topo.objects.countries as GeometryCollection as never, (a, b) => a !== b);
  const out: number[] = [];
  for (const line of m.coordinates) pushLine(out, line, radius);
  const pos = new Float32Array(out);
  meshCache.set(topo, pos);
  return pos;
}

const llCache = new WeakMap<Topology, Float32Array>();

/** The same land borders as flat-map segments `[lon1,lat1, lon2,lat2, …]` in degrees, ≤ 1° each. */
export function borderLonLat(topo: Topology): Float32Array {
  const hit = llCache.get(topo);
  if (hit) return hit;
  const m = mesh(topo, topo.objects.countries as GeometryCollection as never, (a, b) => a !== b);
  const out: number[] = [];
  for (const line of m.coordinates) {
    for (let i = 0; i < line.length - 1; i++) {
      const [lon1, lat1] = line[i], [lon2, lat2] = line[i + 1];
      if (Math.abs(lon1 - lon2) > 90) continue;
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(lon2 - lon1), Math.abs(lat2 - lat1)) / STEP_DEG));
      for (let k = 0; k < n; k++) {
        out.push(lon1 + ((lon2 - lon1) * k) / n, lat1 + ((lat2 - lat1) * k) / n, lon1 + ((lon2 - lon1) * (k + 1)) / n, lat1 + ((lat2 - lat1) * (k + 1)) / n);
      }
    }
  }
  const ll = new Float32Array(out);
  llCache.set(topo, ll);
  return ll;
}

/** Line segments of every ring (coast included) of one country. */
export function outlinePositions(f: Feature<Polygon | MultiPolygon>, radius = 1.0025): Float32Array {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const out: number[] = [];
  for (const rings of polys) for (const ring of rings) pushLine(out, ring, radius);
  return new Float32Array(out);
}

function inRing(lat: number, lon: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

type Box = [number, number, number, number];
const boxCache = new WeakMap<Feature, Box[]>();
function boxes(f: Feature<Polygon | MultiPolygon>): Box[] {
  let b = boxCache.get(f);
  if (b) return b;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  b = polys.map(rings => {
    const bx: Box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of rings[0]) { bx[0] = Math.min(bx[0], x); bx[1] = Math.min(bx[1], y); bx[2] = Math.max(bx[2], x); bx[3] = Math.max(bx[3], y); }
    return bx;
  });
  boxCache.set(f, b);
  return b;
}

/** True if (lat, lon) lies inside the feature (holes excluded). */
export function contains(f: Feature<Polygon | MultiPolygon>, lat: number, lon: number): boolean {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const bx = boxes(f);
  for (let i = 0; i < polys.length; i++) {
    const b = bx[i];
    if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
    const rings = polys[i];
    if (inRing(lat, lon, rings[0]) && !rings.slice(1).some(r => inRing(lat, lon, r))) return true;
  }
  return false;
}

/** The country under (lat, lon); enclaves win over the country around them. */
export function countryAt<T extends { area: number; feature: Feature<Polygon | MultiPolygon> }>(list: readonly T[], lat: number, lon: number): T | null {
  let best: T | null = null;
  for (const c of list) if ((!best || c.area < best.area) && contains(c.feature, lat, lon)) best = c;
  return best;
}
