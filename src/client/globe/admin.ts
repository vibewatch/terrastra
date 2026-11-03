import { mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { lineLonLat } from './borders.ts';
import { url } from '../lib/env.ts';
import type { Lang } from '../../shared/data/types.ts';
import { latLonToVec } from '../../shared/lib/geo.ts';

export const ADMIN_GLOBE_ZOOM = 9;
export const ADMIN_MAP_ZOOM = 3;
export const ADMIN_LINE_RADIUS = 1.0015;
export const ADMIN_BORDER_COLOR = '#f59e0b';

export interface AdminArea extends Record<string, unknown> {
  id: string;
  code: string;
  country: string;
  name: string;
  zh: string;
  lat: number;
  lon: number;
  area: number;
}

export interface AdminLineTile {
  bounds: readonly [west: number, south: number, east: number, north: number];
  globeLines: Float32Array;
  mapLines: Float32Array;
}

export interface AdminData {
  regions: readonly AdminArea[];
  lineTiles: readonly AdminLineTile[];
}

export const adminName = (area: AdminArea, lang: Lang): string => lang === 'zh' ? area.zh : area.name;

function isProperties(p: Record<string, unknown> | null | undefined): p is AdminArea {
  return !!p && ['id', 'code', 'country', 'name', 'zh'].every(k => typeof p[k] === 'string') &&
    ['lat', 'lon', 'area'].every(k => typeof p[k] === 'number' && Number.isFinite(p[k]));
}

const CELL = 10, COLS = 36, ROWS = 18;
const col = (lon: number) => Math.max(0, Math.min(COLS - 1, Math.floor((lon + 180) / CELL)));
const row = (lat: number) => Math.max(0, Math.min(ROWS - 1, Math.floor((lat + 90) / CELL)));

function lineTiles(lines: Float32Array): AdminLineTile[] {
  interface Bucket {
    bounds: [number, number, number, number];
    count: number;
    offset: number;
    globeLines: Float32Array;
    mapLines: Float32Array;
  }
  const count = lines.length / 4;
  const keys = new Uint16Array(count);
  const buckets = new Map<number, Bucket>();
  for (let i = 0; i < count; i++) {
    const j = i * 4;
    const lon1 = lines[j], lat1 = lines[j + 1], lon2 = lines[j + 2], lat2 = lines[j + 3];
    const key = row((lat1 + lat2) / 2) * COLS + col((lon1 + lon2) / 2);
    keys[i] = key;
    let b = buckets.get(key);
    if (!b) {
      b = { bounds: [180, 90, -180, -90], count: 0, offset: 0, globeLines: new Float32Array(), mapLines: new Float32Array() };
      buckets.set(key, b);
    }
    b.count++;
    b.bounds[0] = Math.min(b.bounds[0], lon1, lon2);
    b.bounds[1] = Math.min(b.bounds[1], lat1, lat2);
    b.bounds[2] = Math.max(b.bounds[2], lon1, lon2);
    b.bounds[3] = Math.max(b.bounds[3], lat1, lat2);
  }
  for (const b of buckets.values()) {
    b.mapLines = new Float32Array(b.count * 4);
    b.globeLines = new Float32Array(b.count * 6);
  }
  for (let i = 0; i < count; i++) {
    const b = buckets.get(keys[i])!;
    const j = i * 4, k = b.offset++;
    const lon1 = lines[j], lat1 = lines[j + 1], lon2 = lines[j + 2], lat2 = lines[j + 3];
    const m = k * 4;
    b.mapLines[m] = lon1; b.mapLines[m + 1] = lat1; b.mapLines[m + 2] = lon2; b.mapLines[m + 3] = lat2;
    b.globeLines.set(latLonToVec(lat1, lon1, ADMIN_LINE_RADIUS), k * 6);
    b.globeLines.set(latLonToVec(lat2, lon2, ADMIN_LINE_RADIUS), k * 6 + 3);
  }
  return [...buckets.values()].map(({ bounds, globeLines, mapLines }) => ({ bounds, globeLines, mapLines }));
}

/** Decode the shared topology once into region label anchors and tiled internal border segments. */
export function readAdminData(topo: Topology): AdminData {
  const obj = topo.objects.regions;
  if (!obj || obj.type !== 'GeometryCollection') throw new Error('Missing administrative regions');
  const regions: AdminArea[] = [];
  for (const g of obj.geometries) {
    const p = g.properties as Record<string, unknown> | undefined;
    if (!isProperties(p) || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) {
      throw new Error('Invalid administrative region');
    }
    regions.push({ ...p });
  }
  const borders = mesh(topo, obj as GeometryCollection<AdminArea>, (a, b) =>
    a !== b && !!a.properties && !!b.properties && 'country' in a.properties && 'country' in b.properties &&
    a.properties.country === b.properties.country);
  return {
    regions,
    lineTiles: lineTiles(lineLonLat(borders.coordinates)),
  };
}

export async function fetchAdminData(): Promise<AdminData> {
  const response = await fetch(url('data/admin-1.json'));
  if (!response.ok) throw new Error(`Administrative regions: HTTP ${response.status}`);
  return readAdminData(await response.json() as Topology);
}
