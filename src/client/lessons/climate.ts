/**
 * A schematic world climate map, the kind a textbook draws: the types of the Chinese middle-school course (plus
 * subarctic, which the international courses teach), placed by latitude, by where a place sits on its landmass
 * (west coast, interior, east coast) and by a few regional rules (the monsoons of Asia, the Mediterranean, the
 * highlands). Biomes follow from the climate. Lessons label it a sketch: it is a teaching map, not Köppen data.
 */
import type { LL, Pair } from './stage.ts';

export type Climate =
  | 'rainforest' | 'tmonsoon' | 'savanna' | 'desert' | 'med' | 'smonsoon' | 'maritime' | 'tmonsoon2' | 'continental'
  | 'subarctic' | 'tundra' | 'icecap' | 'highland';
export type Biome =
  | 'rainforest' | 'monsoonforest' | 'savanna' | 'desert' | 'shrubland' | 'evergreen' | 'temperateforest' | 'grassland'
  | 'taiga' | 'tundra' | 'ice' | 'alpine';

export const CLIMATES: Record<Climate, { c: string; name: Pair }> = {
  rainforest: { c: '#2fb344', name: ['Tropical rainforest', '热带雨林气候'] },
  tmonsoon: { c: '#a9e34b', name: ['Tropical monsoon', '热带季风气候'] },
  savanna: { c: '#fcc419', name: ['Tropical savanna', '热带草原气候'] },
  desert: { c: '#fd7e14', name: ['Hot desert', '热带沙漠气候'] },
  med: { c: '#e64980', name: ['Mediterranean', '地中海气候'] },
  smonsoon: { c: '#12b886', name: ['Subtropical monsoon / humid', '亚热带季风和湿润气候'] },
  maritime: { c: '#4c6ef5', name: ['Temperate maritime', '温带海洋性气候'] },
  tmonsoon2: { c: '#4dabf7', name: ['Temperate monsoon', '温带季风气候'] },
  continental: { c: '#e9c46a', name: ['Temperate continental', '温带大陆性气候'] },
  subarctic: { c: '#9775fa', name: ['Subarctic', '亚寒带针叶林气候'] },
  tundra: { c: '#99e9f2', name: ['Polar tundra', '极地苔原气候'] },
  icecap: { c: '#f1f3f5', name: ['Polar ice cap', '极地冰原气候'] },
  highland: { c: '#b08968', name: ['Highland', '高原山地气候'] },
};
export const BIOMES: Record<Biome, { c: string; name: Pair }> = {
  rainforest: { c: '#2b9348', name: ['Tropical rainforest', '热带雨林'] },
  monsoonforest: { c: '#80b918', name: ['Tropical seasonal forest', '热带季雨林'] },
  savanna: { c: '#e9c46a', name: ['Savanna', '热带草原（稀树草原）'] },
  desert: { c: '#f4a261', name: ['Desert', '荒漠'] },
  shrubland: { c: '#c77dff', name: ['Mediterranean scrub', '亚热带常绿硬叶林'] },
  evergreen: { c: '#2a9d8f', name: ['Subtropical evergreen forest', '亚热带常绿阔叶林'] },
  temperateforest: { c: '#74c69d', name: ['Temperate deciduous forest', '温带落叶阔叶林'] },
  grassland: { c: '#d4e157', name: ['Temperate grassland', '温带草原'] },
  taiga: { c: '#3a7d6b', name: ['Taiga (boreal forest)', '亚寒带针叶林'] },
  tundra: { c: '#a8dadc', name: ['Tundra', '苔原'] },
  ice: { c: '#f8f9fa', name: ['Ice sheet', '冰原'] },
  alpine: { c: '#b08968', name: ['Alpine (mountain)', '高山植被'] },
};

/** The Qinghai–Tibet Plateau with the Pamirs (outline shared with the landform lessons). */
const TIBET: LL[] = [[36.5, 72], [37.5, 75], [36.3, 82], [37.8, 88], [38.5, 92], [37.8, 97], [36.7, 101.5], [34.5, 103.5], [31, 103], [28, 101.5], [27.3, 98.8], [28.2, 96.5], [28.5, 92.5], [27.9, 89], [28.3, 86], [29.5, 82], [30.5, 80], [32.5, 78.5], [34.5, 76], [35.5, 73]];
/** The Andes' crest, with its half-width in degrees (the Altiplano is wide). */
const ANDES: [number, number, number][] = [[10, -71.5, 1.2], [5, -75.5, 1.6], [0, -78.2, 1.4], [-6, -77.8, 1.5], [-12, -75.5, 1.8], [-16, -69.5, 3], [-20, -67.5, 3], [-24, -67, 2.2], [-30, -69.6, 1.4], [-36, -70.5, 1.1], [-40, -71.3, 0.8]];

export function inPoly(lat: number, lon: number, poly: LL[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ai, oi] = poly[i], [aj, oj] = poly[j];
    if ((ai > lat) !== (aj > lat) && lon < ((oj - oi) * (lat - ai)) / (aj - ai) + oi) inside = !inside;
  }
  return inside;
}
function highland(lat: number, lon: number): boolean {
  if (inPoly(lat, lon, TIBET)) return true;
  if (((lat - 9.5) / 4.2) ** 2 + ((lon - 38.8) / 3.2) ** 2 < 1) return true; // Ethiopian Highlands
  if (lat <= 10 && lat >= -40 && lon < -64 && lon > -80) {
    for (let i = 1; i < ANDES.length; i++) {
      const [a0, o0, w0] = ANDES[i - 1], [a1, o1, w1] = ANDES[i];
      if (lat <= a0 && lat >= a1) {
        const t = (lat - a0) / (a1 - a0 || 1);
        return Math.abs(lon - (o0 + (o1 - o0) * t)) < w0 + (w1 - w0) * t;
      }
    }
  }
  return false;
}

/**
 * The climate type at a land point. `dw` / `de`: how far (in degrees of longitude × cos latitude, i.e. roughly
 * degrees of great circle) the point is from the west and east coast of its landmass along the parallel.
 */
export function climateAt(lat: number, lon: number, dw: number, de: number): Climate {
  const a = Math.abs(lat), N = lat >= 0, wide = dw + de;
  if (lat < -60) return 'icecap';
  if (N && lat > 59.5 && lon > -74 && lon < -11) return dw > 2 && de > 2 && lat > 61 ? 'icecap' : 'tundra'; // Greenland
  if (highland(lat, lon)) return 'highland';
  if (N && lat >= 66.5) return lon > 5 && lon < 32 && lat < 71 && dw < 3 ? 'maritime' : 'tundra';
  if (!N && a >= 55) return 'tundra';

  const africa = lon > -20 && lon < 52 && lat > -36 && lat < 37.5 && !(lon > 34.5 && lat > 12.5 && (lon > 43 || lat > 29.5));
  const arabiaIran = N && lon >= 34 && lon < 66 && lat >= 12.5 && lat < 40;
  const southAsia = N && lon >= 66 && lon < 100 && lat < 36;
  const eastAsia = N && lon >= 100 && lon < 146;
  const australia = !N && lon > 112 && lon < 155 && lat > -44;
  const nAm = N && lon < -50;
  const sAm = !N && lon < -33 && lon > -82;
  const europe = N && lon >= -25 && lon < 45 && lat >= 35;

  // ---- deep tropics
  if (a < 10) {
    if (africa) {
      if (lat > 2 && lon > 40) return 'desert'; // Horn of Africa
      if (lon > 29 && lat < 5 && lat > -11) return 'savanna'; // East African plateau
      if (a >= 5 && !(lat > 0 && lat < 8 && lon < 10)) return 'savanna'; // Sahel's edge and the south, not the Guinea coast
      return 'rainforest';
    }
    if (southAsia || (eastAsia && lon < 110)) return lat >= 7 ? 'tmonsoon' : 'rainforest';
    if (N && lat > 4 && lon > -73 && lon < -60) return 'savanna'; // the Llanos
    if (!N && lon > 125 && lon < 145 && lat < -8) return 'savanna'; // northern Australia's tip
    return 'rainforest';
  }
  // ---- outer tropics
  if (a < 23.5) {
    if (southAsia) return lat > 20 && lon < 75 ? 'desert' : 'tmonsoon';
    if (eastAsia) return lon < 127 ? 'tmonsoon' : 'rainforest';
    if (arabiaIran) return 'desert';
    if (africa && N) return lat < 15 ? 'savanna' : 'desert';
    if (africa) {
      if (lon < 16 && dw < 4) return 'desert'; // Namib
      if (lon > 43 && lon < 51) return de < 1.6 ? 'rainforest' : 'savanna'; // Madagascar
      return 'savanna';
    }
    if (australia) return a < 18 ? 'savanna' : de < 2.5 && a < 20 ? 'rainforest' : de < 4 ? 'savanna' : 'desert';
    if (nAm) {
      if (lat >= 20 && lon < -104 && dw < 4) return 'desert';
      return de < 2 && wide > 3 ? 'rainforest' : 'savanna';
    }
    if (sAm) return lon < -69 && dw < 5 ? 'desert' : de < 3 ? 'rainforest' : 'savanna';
    return wide < 6 ? 'rainforest' : 'savanna';
  }
  // ---- subtropics
  if (a < 30) {
    if (eastAsia) return 'smonsoon';
    if (southAsia) return lon < 77 ? 'desert' : 'tmonsoon';
    if (arabiaIran || (africa && N)) return 'desert';
    if (africa) {
      if (dw < 3 && lon < 18) return 'desert';
      if (de < 4) return 'smonsoon';
      return lon < 24 ? 'desert' : 'savanna';
    }
    if (australia) return de < 4 ? 'smonsoon' : 'desert';
    if (nAm) return lon > -100 ? 'smonsoon' : 'desert';
    if (sAm) return lon < -68 && dw < 5 ? 'desert' : 'smonsoon';
    return wide < 6 ? 'smonsoon' : 'desert';
  }
  // ---- 30° to 40°
  if (a < 40) {
    if (eastAsia) {
      if (lon < 103) return lat > 36 ? 'continental' : 'smonsoon';
      if (lon > 129 && lat < 36) return 'smonsoon'; // southern Japan
      return lat < 33.5 ? 'smonsoon' : 'tmonsoon2';
    }
    if (N && lon >= 66 && lon < 100) return lat < 35 && lon > 74 ? 'smonsoon' : lat < 35 ? 'desert' : 'continental';
    if (africa && N) return lat >= 32.5 || (lat >= 30.5 && lon < -5) || (lat >= 31 && lon > 19 && lon < 23) ? 'med' : 'desert';
    if (europe || (N && lon >= 25 && lon < 45 && lat >= 30)) {
      if (lon > 36 && lat < 36.5) return 'desert'; // Syrian desert
      if (lon > 31 && lon < 45 && lat > 37.5 && dw > 3 && de > 3) return 'continental'; // Anatolia's interior
      return 'med';
    }
    if (arabiaIran) return lat < 35 ? 'desert' : 'continental';
    if (N && lon >= 45 && lon < 75) return 'continental';
    if (nAm) {
      if (lon < -115 && dw < 4 && lat > 31) return 'med';
      if (lon < -103) return lat < 37 ? 'desert' : 'continental';
      return lat < 38 ? 'smonsoon' : 'continental';
    }
    if (africa) return lon < 26 && dw < 5 ? 'med' : de < 4 ? 'smonsoon' : 'desert';
    if (australia) {
      if (lon < 124 && dw < 6) return 'med';
      if (lon > 134 && lon < 142.5 && lat < -33.5) return 'med';
      if (lat < -37 && lon >= 142.5) return 'maritime';
      return de < 5 ? 'smonsoon' : 'desert';
    }
    if (sAm) return lon < -70 && dw < 4 ? 'med' : lon > -64 && de < 10 ? 'smonsoon' : 'continental';
    if (!N && lon > 165) return 'maritime'; // New Zealand
    return wide < 6 ? 'smonsoon' : 'continental';
  }
  // ---- 40° to 66.5°
  if (eastAsia && lat < 55) {
    if (lon > 129) return lat > 52 ? 'subarctic' : 'tmonsoon2'; // Japan, Sakhalin, the Russian Far East
    if (lon >= 115) return lat > 52 ? 'subarctic' : 'tmonsoon2';
    return lat < 41.5 && lon > 103 ? 'tmonsoon2' : 'continental';
  }
  if (europe || (N && lon >= -25 && lon < 45)) {
    if (lon < -12) return 'maritime'; // Iceland
    if (lat < 43.5 && lon < 3) return dw < 2.5 || lat > 42.8 ? 'maritime' : 'med'; // Iberia's north coast, its dry middle
    if (lat < 42 && lon >= 3) return 'med';
    if (lon >= 5 && lon < 13 && lat > 57.5) return dw < 3 ? 'maritime' : 'subarctic'; // Norway's coast, its fjells
    if (lon >= 13 && lat > 58) return 'subarctic';
    if (lon < 17) return 'maritime';
    return lat > 58 ? 'subarctic' : 'continental';
  }
  if (N && lon >= 45 && lon < 146) return lat > (lon > 60 ? 54 : 58) ? 'subarctic' : 'continental';
  if (N && (lon >= 146 || lon < -140)) return 'subarctic'; // Kamchatka, Chukotka, western Alaska
  if (nAm) {
    if (lon < -117 && dw < 4 && lat < 61) return 'maritime';
    return lat > (lon > -100 ? 50 : 54) ? 'subarctic' : 'continental';
  }
  if (sAm) return dw < 4 ? 'maritime' : 'continental';
  if (!N) return 'maritime'; // New Zealand, Tasmania
  return 'continental';
}

export function biomeOf(cl: Climate, lat: number, lon: number): Biome {
  switch (cl) {
    case 'rainforest': return 'rainforest';
    case 'tmonsoon': return 'monsoonforest';
    case 'savanna': return 'savanna';
    case 'desert': return 'desert';
    case 'med': return 'shrubland';
    case 'smonsoon': return 'evergreen';
    case 'maritime': case 'tmonsoon2': return 'temperateforest';
    case 'subarctic': return 'taiga';
    case 'tundra': return 'tundra';
    case 'icecap': return 'ice';
    case 'highland': return 'alpine';
    case 'continental': {
      const N = lat >= 0;
      // the dry hearts of the continents: Central Asia, the Gobi, the Great Basin, Patagonia's east
      if (N && lon > 50 && lon < 112 && lat > 36 && lat < 46.5 && !(lon > 98 && lat < 41.5)) return 'desert';
      if (N && lon > -121 && lon < -110 && lat > 36 && lat < 44) return 'desert';
      if (N && lon > -96 && lon < -50) return 'temperateforest';
      if (N && lon > 10 && lon < 40 && lat > 47) return 'temperateforest';
      if (N && lat > 50.5) return 'taiga';
      return 'grassland';
    }
  }
}

/**
 * For every pixel of an equirectangular land mask (1 = land), the distance (degrees of great circle) to the west
 * and east coast along its row. Rows wrap around the date line.
 */
export function coastDistances(land: Uint8Array, W: number): { dw: Float32Array; de: Float32Array } {
  const H = W / 2, dw = new Float32Array(W * H), de = new Float32Array(W * H), step = 360 / W;
  for (let y = 0; y < H; y++) {
    const k = Math.cos(((90 - ((y + 0.5) / H) * 180) * Math.PI) / 180) * step, row = y * W;
    let first = -1;
    for (let x = 0; x < W; x++) if (!land[row + x]) { first = x; break; }
    if (first < 0) { for (let x = 0; x < W; x++) { dw[row + x] = 1e3; de[row + x] = 1e3; } continue; }
    // walk east from a sea pixel (twice round, so runs crossing the edge are counted whole)
    let run = 0;
    for (let s = 1; s <= W; s++) { const x = (first + s) % W; run = land[row + x] ? run + 1 : 0; dw[row + x] = run * k; }
    run = 0;
    for (let s = 1; s <= W; s++) { const x = (first - s + W) % W; run = land[row + x] ? run + 1 : 0; de[row + x] = run * k; }
  }
  return { dw, de };
}
