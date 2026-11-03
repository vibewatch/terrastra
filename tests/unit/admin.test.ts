import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { mesh } from 'topojson-client';
import { readAdminData, type AdminData } from '../../src/client/globe/admin.ts';
import { lineLonLat } from '../../src/client/globe/borders.ts';
import { CHINA_CAPITALS } from '../../src/shared/data/china-capitals.ts';

describe('administrative map data', () => {
  let data: AdminData;
  let topology: Topology;
  beforeAll(() => {
    topology = JSON.parse(readFileSync('public/data/admin-1.json', 'utf8')) as Topology;
    data = readAdminData(topology);
  }, 60_000);

  it('covers Chinese provincial divisions and first-level regions across the world', () => {
    const codes = new Set(data.regions.filter(area => area.country === 'CN').map(area => area.code));
    const chineseDivisions = [
      'CN-BJ', 'CN-TJ', 'CN-SH', 'CN-CQ', 'CN-HE', 'CN-SX', 'CN-LN', 'CN-JL', 'CN-HL',
      'CN-JS', 'CN-ZJ', 'CN-AH', 'CN-FJ', 'CN-JX', 'CN-SD', 'CN-HA', 'CN-HB', 'CN-HN',
      'CN-GD', 'CN-HI', 'CN-SC', 'CN-GZ', 'CN-YN', 'CN-SN', 'CN-GS', 'CN-QH',
      'CN-NM', 'CN-GX', 'CN-XZ', 'CN-NX', 'CN-XJ', 'CN-HK', 'CN-MO', 'CN-TW',
    ];
    for (const code of chineseDivisions) expect(codes.has(code), code).toBe(true);
    expect(new Set(data.regions.map(area => area.country)).size).toBeGreaterThan(180);
    expect(data.regions.filter(area => area.country === 'GB').map(area => area.code).sort()).toEqual(['GB-ENG', 'GB-NIR', 'GB-SCT', 'GB-WLS']);
    expect(data.regions.filter(area => area.country === 'FR')).toHaveLength(18);
    expect(data.lineTiles.length).toBeGreaterThan(0);
  });

  it('keeps every administrative border when partitioning it for rendering', () => {
    const collection = topology.objects.regions;
    if (collection.type !== 'GeometryCollection') throw new Error('Expected administrative region collection');
    const borders = mesh(topology, collection as GeometryCollection, (a, b) =>
      a !== b && !!a.properties && !!b.properties && 'country' in a.properties && 'country' in b.properties &&
      a.properties.country === b.properties.country);
    const segmentCount = lineLonLat(borders.coordinates).length / 4;
    expect(data.lineTiles.reduce((sum, tile) => sum + tile.mapLines.length / 4, 0)).toBe(segmentCount);
    for (const tile of data.lineTiles) expect(tile.globeLines.length / 6).toBe(tile.mapLines.length / 4);
  });

  it('dissolves lower-level boundaries inside consolidated regions', () => {
    const collection = topology.objects.regions;
    if (collection.type !== 'GeometryCollection') throw new Error('Expected administrative region collection');
    for (const code of ['CN-HK', 'CN-MO', 'CN-TW', 'GB-ENG', 'GB-SCT', 'GB-WLS', 'GB-NIR', 'FR-IDF']) {
      const region = collection.geometries.find(geometry => geometry.properties && 'code' in geometry.properties && geometry.properties.code === code);
      if (!region || (region.type !== 'MultiPolygon' && region.type !== 'Polygon')) throw new Error(`Missing region ${code}`);
      const arcs = (region.type === 'Polygon' ? region.arcs.flat() : region.arcs.flat(2)).map(index => index < 0 ? ~index : index);
      expect(new Set(arcs).size, code).toBe(arcs.length);
    }
  });

  it('places each Chinese provincial capital inside the corresponding region', () => {
    for (const city of CHINA_CAPITALS) {
      expect(data.at(city.lat, city.lon)?.code, `${city.zh} (${city.code})`).toBe(city.code);
    }
  });

  it.each([
    [39.904, 116.407, 'CN-BJ'],
    [31.2304, 121.4737, 'CN-SH'],
    [22.3, 114.17, 'CN-HK'],
    [22.1987, 113.5439, 'CN-MO'],
    [37.7749, -122.4194, 'US-CA'],
    [30.2672, -97.7431, 'US-TX'],
    [43.6532, -79.3832, 'CA-ON'],
    [51.5074, -0.1278, 'GB-ENG'],
    [55.9533, -3.1883, 'GB-SCT'],
    [51.4816, -3.1791, 'GB-WLS'],
    [54.5973, -5.9301, 'GB-NIR'],
    [48.8566, 2.3522, 'FR-IDF'],
  ])('finds the region at (%f, %f)', (lat, lon, code) => {
    expect(data.at(lat, lon)?.code).toBe(code);
  });
});
