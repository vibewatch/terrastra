import { readFile, writeFile } from 'node:fs/promises';
import { topology } from 'topojson-server';
import { presimplify, simplify } from 'topojson-simplify';
import { merge, quantize } from 'topojson-client';

const source = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_10m_admin_1_states_provinces.geojson';
const input = process.argv[2];
const text = input ? await readFile(input, 'utf8') : await fetch(source).then(r => {
  if (!r.ok) throw new Error(`Administrative data: HTTP ${r.status}`);
  return r.text();
});
const data = JSON.parse(text);
if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('Expected a GeoJSON FeatureCollection');

function ringArea(ring) {
  let area = 0, prev = ring[0][0];
  const points = ring.map(([x, y]) => {
    while (x - prev > 180) x -= 360;
    while (prev - x > 180) x += 360;
    prev = x;
    return [x, y];
  });
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += points[j][0] * points[i][1] - points[i][0] * points[j][1];
  }
  return Math.abs(area / 2);
}

function areaOf(geometry, latitude) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const area = polygons.reduce((sum, rings) => sum + Math.max(0, ringArea(rings[0]) - rings.slice(1).reduce((s, ring) => s + ringArea(ring), 0)), 0);
  return Math.round(area * Math.cos(latitude * Math.PI / 180) * 10000) / 10000;
}

function makeFeature(feature, properties) {
  return {
    type: 'Feature',
    id: properties.id,
    properties: { ...properties, area: areaOf(feature.geometry, properties.lat) },
    geometry: feature.geometry,
  };
}

const merged = {
  HK: { id: 'CN-HK', code: 'CN-HK', country: 'CN', name: 'Hong Kong', zh: '香港特别行政区', lat: 22.35, lon: 114.12, polygons: [] },
  MO: { id: 'CN-MO', code: 'CN-MO', country: 'CN', name: 'Macao', zh: '澳门特别行政区', lat: 22.19, lon: 113.55, polygons: [] },
  TW: { id: 'CN-TW', code: 'CN-TW', country: 'CN', name: 'Taiwan', zh: '台湾省', lat: 23.7, lon: 120.95, polygons: [] },
};
const regions = {
  'FR-ARA': ['Auvergne-Rhône-Alpes', '奥弗涅-罗讷-阿尔卑斯大区'],
  'FR-BFC': ['Bourgogne-Franche-Comté', '勃艮第-弗朗什-孔泰大区'],
  'FR-BRE': ['Brittany', '布列塔尼大区'],
  'FR-CVL': ['Centre-Val de Loire', '中央-卢瓦尔河谷大区'],
  'FR-COR': ['Corsica', '科西嘉'],
  'FR-GES': ['Grand Est', '大东部大区'],
  'FR-HDF': ['Hauts-de-France', '上法兰西大区'],
  'FR-IDF': ['Île-de-France', '法兰西岛大区'],
  'FR-NOR': ['Normandy', '诺曼底大区'],
  'FR-NAQ': ['Nouvelle-Aquitaine', '新阿基坦大区'],
  'FR-OCC': ['Occitanie', '奥克西塔尼大区'],
  'FR-PDL': ['Pays de la Loire', '卢瓦尔河地区大区'],
  'FR-PAC': ["Provence-Alpes-Côte d'Azur", '普罗旺斯-阿尔卑斯-蓝色海岸大区'],
  'FR-GUF': ['French Guiana', '法属圭亚那'],
  'FR-MTQ': ['Martinique', '马提尼克'],
  'FR-GUA': ['Guadeloupe', '瓜德罗普'],
  'FR-LRE': ['Réunion', '留尼汪'],
  'FR-MAY': ['Mayotte', '马约特'],
};
const ukRegions = {
  'Northern Ireland': 'GB-NIR',
  'West Wales and the Valleys': 'GB-WLS', 'East Wales': 'GB-WLS',
  'Eastern': 'GB-SCT', 'South Western': 'GB-SCT', 'Highlands and Islands': 'GB-SCT', 'North Eastern': 'GB-SCT',
  'North West': 'GB-ENG', 'West Midlands': 'GB-ENG', 'South West': 'GB-ENG', 'North East': 'GB-ENG',
  'Yorkshire and the Humber': 'GB-ENG', 'East Midlands': 'GB-ENG', 'East': 'GB-ENG', 'South East': 'GB-ENG', 'Greater London': 'GB-ENG',
};
const ukNames = {
  'GB-ENG': ['England', '英格兰'],
  'GB-SCT': ['Scotland', '苏格兰'],
  'GB-WLS': ['Wales', '威尔士'],
  'GB-NIR': ['Northern Ireland', '北爱尔兰'],
};
for (const [code, [name, zh]] of Object.entries({ ...regions, ...ukNames })) {
  merged[code] = { id: code, code, country: code.slice(0, 2), name, zh, lat: 0, lon: 0, polygons: [], largest: -1 };
}
const features = [];
let unnamed = 0;
for (const f of data.features) {
  const p = f.properties;
  if (!p || !f.geometry || !['Polygon', 'MultiPolygon'].includes(f.geometry.type)) throw new Error('Invalid administrative geometry');
  const group = Object.hasOwn(merged, p.iso_a2) ? p.iso_a2
    : p.iso_a2 === 'FR' ? p.region_cod?.trim()
      : p.iso_a2 === 'GB' ? ukRegions[p.region] : null;
  if ((p.iso_a2 === 'FR' || p.iso_a2 === 'GB') && !Object.hasOwn(merged, group)) {
    throw new Error(`Missing first-level grouping for ${p.iso_a2}: ${p.name}`);
  }
  if (group && Object.hasOwn(merged, group)) {
    const target = merged[group];
    target.polygons.push(...(f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates));
    if ('largest' in target) {
      const area = areaOf(f.geometry, p.latitude);
      if (area > target.largest) { target.largest = area; target.lat = p.latitude; target.lon = p.longitude; }
    }
    continue;
  }
  if (!p.name) { unnamed++; continue; }
  if (!p.adm1_code || !p.iso_a2 || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) {
    throw new Error(`Invalid administrative properties: ${p.adm1_code ?? '(missing id)'}`);
  }
  features.push(makeFeature(f, {
    id: p.adm1_code, code: p.iso_3166_2, country: p.iso_a2,
    name: p.name_en || p.name, zh: p.name_zh || p.name_en || p.name,
    lat: p.latitude, lon: p.longitude,
  }));
}
for (const entry of Object.values(merged)) {
  const { polygons, largest: _largest, ...properties } = entry;
  if (!polygons.length) throw new Error(`Missing geometry for ${properties.name}`);
  features.push(makeFeature({ geometry: { type: 'MultiPolygon', coordinates: polygons } }, properties));
}

const collection = { type: 'FeatureCollection', features };
const initial = topology({ regions: collection }, 1e6);
const groupedIds = new Set(Object.values(merged).map(group => group.id));
for (let i = 0; i < features.length; i++) {
  if (!groupedIds.has(features[i].id)) continue;
  const geometry = initial.objects.regions.geometries[i];
  if (geometry.type !== 'MultiPolygon') throw new Error(`Invalid grouped geometry for ${features[i].id}`);
  features[i].geometry = merge(initial, geometry.arcs.map(arcs => ({ type: 'Polygon', arcs })));
}
const raw = topology({ regions: collection }, 1e6);
const result = quantize(simplify(presimplify(raw), 0.00005), 2e5);
await writeFile('public/data/admin-1.json', JSON.stringify(result));
console.log(`Wrote ${features.length} administrative areas to public/data/admin-1.json`);
if (unnamed) console.warn(`Skipped ${unnamed} unnamed Natural Earth features`);
