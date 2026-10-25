/** 七下 · 东半球其他的国家和地区、西半球的国家: the Middle East, Europe, Africa, Russia, India, the USA, Brazil. */
import { C, arrows, mk, par, type Fig, type Lesson, type Pair } from './kit.ts';
import type { LL } from './stage.ts';
import { ASIA_EUROPE, EAST_AFRICA_RIFT, REGIONS, RIVERS, SUEZ } from './geo.ts';
import { svg, tx } from './figs.ts';

const r1 = (v: number) => Math.round(v * 10) / 10;
/** A climate graph for a station that figs.ts has no data for (same layout as the built-in `climo` figure).
 * Normals are approximate 1991–2020 means. */
const climo = (name: Pair, type: Pair, T: number[], P: number[]): Fig => ({ k: 'svg', draw: L => {
  const x0 = 26, x1 = 294, y0 = 40, y1 = 136, mw = (x1 - x0) / 12;
  const tmin = Math.min(-10, Math.floor(Math.min(...T) / 10) * 10), tmax = Math.max(30, Math.ceil(Math.max(...T) / 10) * 10);
  const pmax = Math.max(100, Math.ceil(Math.max(...P) / 100) * 100);
  const ty = (t: number) => y1 - ((t - tmin) / (tmax - tmin)) * (y1 - y0), py = (p: number) => y1 - (p / pmax) * (y1 - y0);
  let o = '';
  for (let t = tmin; t <= tmax; t += 10) o += `<line x1="${x0}" x2="${x1}" y1="${r1(ty(t))}" y2="${r1(ty(t))}" class="${t === 0 ? 'fg-zero' : 'fg-grid'}"/>` + tx(x0 - 3, ty(t) + 3, String(t), 'fg-tick', 'e');
  for (let k = 0; k <= 4; k++) o += tx(x1 + 3, py((pmax * k) / 4) + 3, String((pmax * k) / 4), 'fg-tick fg-p', 's');
  P.forEach((p, m) => { o += `<rect x="${r1(x0 + m * mw + mw * 0.15)}" y="${r1(py(p))}" width="${r1(mw * 0.7)}" height="${r1(y1 - py(p))}" class="fg-bar f-grow" style="--d:${m * 0.04}s"/>`; });
  o += `<polyline points="${T.map((t, m) => `${r1(x0 + (m + 0.5) * mw)},${r1(ty(t))}`).join(' ')}" class="fg-temp f-draw" pathLength="1"/>`;
  T.forEach((t, m) => { o += `<circle cx="${r1(x0 + (m + 0.5) * mw)}" cy="${r1(ty(t))}" r="1.8" class="fg-tdot f-fade" style="--d:${0.6 + m * 0.05}s"/>`; });
  for (let m = 0; m < 12; m++) o += tx(x0 + (m + 0.5) * mw, y1 + 10, String(m + 1), 'fg-tick', 'm');
  o += tx(x0 - 3, y0 - 5, '°C', 'fg-tick fg-t', 'e') + tx(x1 + 3, y0 - 5, 'mm', 'fg-tick fg-p', 's');
  const mean = T.reduce((a, b) => a + b, 0) / 12, sum = Math.round(P.reduce((a, b) => a + b, 0));
  o += tx(6, 12, `${L(name)} · ${L(type)}`, 'fg-title') + tx(6, 23, L([`mean ${r1(mean)} °C · ${sum.toLocaleString('en-US')} mm a year`, `年均温 ${r1(mean)} °C · 年降水 ${sum} 毫米`]), 'fg-sub');
  return svg(320, 152, o, L(['Climate graph', '气候资料图']));
} });
const MANAUS = climo(['Manaus', '马瑙斯'], ['Tropical rainforest', '热带雨林气候'],
  [26.4, 26.3, 26.5, 26.6, 26.8, 26.8, 27.0, 27.7, 28.1, 28.1, 27.7, 27.0], [287, 293, 315, 336, 264, 116, 88, 66, 83, 115, 179, 248]);
const BAMAKO = climo(['Bamako (Mali)', '巴马科（马里）'], ['Tropical savanna', '热带草原气候'],
  [24.6, 27.5, 30.4, 32.1, 31.6, 28.9, 26.8, 26.2, 26.7, 27.9, 27.0, 24.8], [1, 0, 3, 16, 52, 132, 211, 262, 154, 55, 2, 1]);

const east = ['Countries and regions of the Eastern Hemisphere', '东半球其他的国家和地区'] as const;
const west = ['Countries of the Western Hemisphere', '西半球的国家'] as const;
const flow = (pts: LL[], t: number, c: string = C.blue) => ({ pts, c, t, w: 1.4, flow: true, arrow: true, dur: 1.6 });
const route = (pts: LL[], t: number, c: string = C.gold) => ({ pts, c, t, w: 1.6, flow: true, arrow: true, dur: 2.4 });

// Hand-traced sketch lines and areas (textbook-diagram detail).
const NILE: LL[] = [[0.4, 33.2], [2.3, 31.5], [4.85, 31.6], [9.5, 31.65], [12.5, 32.6], [15.6, 32.5], [17.7, 34.0], [19.5, 33.3], [18.5, 31.8], [19.2, 30.5], [21.8, 31.3], [24.1, 32.9], [25.7, 32.6], [27.2, 31.2], [30.0, 31.2], [31.5, 31.0]];
const BLUE_NILE: LL[] = [[12.0, 37.3], [10.2, 37.9], [11.0, 35.3], [13.5, 33.6], [15.6, 32.5]];
export const CONGO: LL[] = [[-11.0, 26.5], [-5.0, 26.9], [-2.9, 25.9], [0.5, 25.2], [2.0, 22.5], [1.5, 19.0], [0.0, 18.3], [-2.5, 16.2], [-4.3, 15.3], [-6.0, 12.4]];
export const NIGER: LL[] = [[9.2, -10.6], [12.6, -8.0], [14.5, -4.2], [16.8, -3.0], [16.3, 0.0], [13.5, 2.1], [9.1, 4.8], [7.8, 6.7], [5.0, 6.2], [4.3, 6.0]];
const VOLGA: LL[] = [[57.3, 32.5], [56.9, 35.9], [57.6, 39.9], [56.3, 44.0], [55.8, 49.1], [53.2, 50.1], [51.5, 46.0], [48.7, 44.5], [46.35, 48.0], [45.8, 48.4]];
const URALS: LL[] = ASIA_EUROPE.slice(0, 5);
const TRANS_SIB: LL[] = [[55.75, 37.6], [56.3, 44.0], [56.8, 60.6], [55.0, 73.4], [55.0, 82.9], [56.0, 92.9], [52.3, 104.3], [51.8, 107.6], [52.0, 113.5], [54.0, 123.9], [48.5, 135.1], [43.1, 131.9]];
const MISSISSIPPI: LL[] = [[47.2, -95.2], [45.0, -93.3], [43.0, -91.2], [41.5, -90.6], [38.6, -90.2], [37.0, -89.2], [35.1, -90.1], [32.3, -90.9], [30.45, -91.2], [29.95, -90.1], [29.1, -89.3]];
const MISSOURI: LL[] = [[45.9, -111.5], [47.5, -111.3], [47.8, -106.0], [46.8, -100.8], [44.4, -100.3], [41.3, -95.9], [39.1, -94.6], [38.8, -90.1]];
const AMAZON_R: LL[] = [[-10.7, -73.8], [-7.5, -74.8], [-4.5, -73.5], [-3.75, -73.25], [-4.2, -69.9], [-3.3, -64.7], [-3.1, -60.0], [-2.6, -56.7], [-2.4, -54.7], [-1.5, -52.0], [-0.5, -50.0]];
const BR_PLATEAU: LL[] = [[-5, -45], [-5, -36], [-12, -38], [-22, -41], [-30, -50], [-22, -53], [-15, -56], [-10, -55], [-7, -48]];
/** BR-230, the Trans-Amazonian Highway: Cabedelo – Marabá – Altamira – Itaituba – Humaitá – Lábrea (sketch). */
const TRANS_AMAZON: LL[] = [[-7.0, -34.85], [-7.1, -41.5], [-6.5, -46.5], [-5.37, -49.1], [-3.2, -52.2], [-4.27, -55.98], [-6.2, -57.8], [-7.5, -63.0], [-7.26, -64.8]];
const US_WEST: LL[] = [[49, -125], [49, -104.5], [44, -104], [38, -104.5], [32, -105], [31.3, -111], [32.5, -117.5], [40, -124.5]];
const US_PLAINS: LL[] = [[49, -104.5], [49, -89], [44, -85], [40, -84], [36, -86], [31, -87], [29, -95], [26, -97.5], [29, -103], [32, -105], [38, -104.5], [44, -104]];
const US_EAST: LL[] = [[47, -68], [44.5, -73.5], [42, -77.5], [39.5, -80.5], [36.5, -83.5], [33.8, -86], [33, -84.5], [35.5, -81], [38.5, -77.5], [41.5, -74], [44, -70]];
const ROCKIES: LL[] = [[49, -114.5], [46, -112.5], [43.5, -110], [40.5, -106.5], [38, -106], [35.5, -105.5], [32.5, -105.8]];
const APPALACHIANS: LL[] = [[46.5, -69], [44, -72], [42, -75], [40.5, -77.8], [38, -80.2], [36, -82.5], [34, -85]];
const CORN: LL[] = [[44.5, -97], [44.5, -90], [42, -84], [40, -82.5], [38.5, -85], [38.5, -91], [39.5, -96.5]];
const WHEAT_W: LL[] = [[40, -102], [40, -96.8], [37, -96.8], [35, -97.5], [35, -101], [37, -102]];
const WHEAT_S: LL[] = [[49, -111], [49, -97], [45.5, -97], [45.5, -104], [47, -111]];
const COTTON: LL[] = [[35, -101], [35, -90], [34.5, -84], [33, -81], [31.2, -82], [31, -88], [30.6, -91], [31, -97], [32, -101]];
const DAIRY: LL[] = [[47, -93], [46.5, -84], [45, -76], [43, -73], [42, -77], [42, -84], [43, -88], [44, -93]];
/** "Tornado Alley" on the southern Great Plains (sketch). */
const TORNADO: LL[] = [[43, -101], [43, -96], [38, -94], [33, -94.5], [31.5, -98], [33, -102], [38, -102]];
const DECCAN: LL[] = [[22.5, 73.5], [23, 80], [21.5, 85], [17, 82], [14, 80], [11, 77.5], [13, 75], [16, 74], [19, 73.3]];
const GANGES_PLAIN: LL[] = [[31, 74], [29.5, 78.5], [27.5, 83], [26.5, 88], [24.5, 89], [24, 87], [24.8, 82], [26.2, 78], [28, 73], [30, 72]];
/** The Thar Desert on the India–Pakistan border (sketch). */
const THAR: LL[] = [[30, 71], [29.5, 74.5], [27, 75], [25, 73.5], [24.5, 71], [25.5, 69], [28, 69.5]];
const W_GHATS: LL[] = [[21.2, 73.8], [19, 73.6], [16, 73.9], [13, 75.3], [11, 76.2], [8.5, 77.2]];

const EUPHRATES: LL[] = [[39.9, 41.3], [39.5, 39.9], [38.8, 38.75], [37.5, 38.3], [36.8, 38.0], [35.95, 39.0], [35.34, 40.14], [34.45, 40.92], [34.14, 42.38], [33.42, 43.3], [32.5, 44.4], [31.31, 45.28], [31.05, 46.26], [31.0, 47.43]];
const TIGRIS: LL[] = [[38.5, 39.4], [37.9, 40.23], [37.33, 42.18], [36.34, 43.13], [35.5, 43.25], [34.6, 43.68], [33.3, 44.4], [32.5, 45.8], [31.84, 47.15], [31.0, 47.43], [30.5, 47.8], [29.95, 48.6]];
const RHINE: LL[] = [[46.63, 8.67], [46.85, 9.53], [47.5, 9.6], [47.66, 9.17], [47.69, 8.63], [47.56, 7.59], [48.58, 7.8], [49.49, 8.47], [50.0, 8.27], [50.36, 7.6], [50.94, 6.96], [51.23, 6.78], [51.85, 6.1], [51.9, 4.5], [51.98, 4.05]];
const DANUBE: LL[] = [[47.95, 8.5], [48.4, 10.0], [49.02, 12.1], [48.57, 13.46], [48.3, 14.29], [48.21, 16.37], [48.14, 17.1], [47.8, 18.8], [47.5, 19.04], [46.0, 18.9], [45.25, 19.85], [44.82, 20.45], [44.65, 22.4], [43.75, 24.5], [44.1, 27.3], [45.27, 27.97], [45.17, 28.8], [45.2, 29.7]];
const ALPS: LL[] = [[43.9, 7.3], [44.8, 6.9], [45.83, 6.86], [46.1, 7.8], [46.45, 9.3], [46.9, 11.0], [47.1, 12.8], [47.4, 14.5], [47.8, 16.0]];
const SCANDES: LL[] = [[58.5, 7], [61, 7.5], [63, 10], [65.5, 13.5], [68, 16.5], [69.5, 20]];
/** The Sahel, the semi-arid belt on the Sahara's southern edge (sketch). */
export const SAHEL: LL[] = [[17.5, -16.5], [17, -5], [16.5, 5], [16.5, 15], [15.5, 24], [15, 33], [12.5, 33], [12.5, 24], [13, 15], [12.5, 5], [13, -5], [13.5, -16.8]];
/** 中东 in the PEP sense: West Asia except Afghanistan, plus Egypt. */
const ME = ['SA', 'IR', 'IQ', 'KW', 'AE', 'QA', 'BH', 'OM', 'YE', 'JO', 'SY', 'LB', 'IL', 'PS', 'TR', 'CY', 'GE', 'AM', 'AZ', 'EG'];
const WEU = ['GB', 'IE', 'FR', 'DE', 'NL', 'BE', 'LU', 'CH', 'AT', 'ES', 'PT', 'IT', 'DK', 'NO', 'SE', 'FI', 'IS'];
const EU27 = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
const N_AFRICA = ['EG', 'LY', 'TN', 'DZ', 'MA', 'EH'];

export const WORLD: Lesson[] = [
  {
    id: 'middleeast', strand: 'world', tracks: ['uk', 'us', 'ib'], grade: 'g7b', unit: east, icon: 'landmark', minutes: 7,
    title: ['The Middle East', '中东'],
    blurb: ['Where three continents meet: oil under the sand, water in short supply, and holy cities for three faiths.', '“两洋三洲五海之地”：丰富的石油、匮乏的水资源和多元的文化。'],
    keys: [
      ['The Middle East links Asia, Africa and Europe and lies between two oceans and five seas, with key straits and the Suez Canal.', '中东地处亚、非、欧三大洲交界处，沟通两洋、濒临五海，有苏伊士运河和多个重要海峡，被称为“两洋三洲五海之地”。'],
      ['It holds about half of the world\'s proven oil; most is exported through the Strait of Hormuz.', '中东石油储量约占世界的一半，是世界上石油储量最大、出口最多的地区，石油大多经霍尔木兹海峡运出。'],
      ['A dry desert climate makes water very scarce; desalination, drip irrigation and recycling help.', '气候干旱，水资源十分匮乏；海水淡化、滴灌和污水回用是重要的解决办法。'],
      ['Most people are Arabs and Muslims; Jerusalem is holy to Jews, Christians and Muslims.', '居民以阿拉伯人为主，多信仰伊斯兰教；耶路撒冷是犹太教、基督教和伊斯兰教的圣地。'],
      ['Location, oil, water, land and religion have made it a long-running hot spot.', '重要的位置、石油、水源、领土和民族宗教问题，使中东长期成为世界热点地区。'],
    ],
    steps: [
      {
        title: ['Two oceans, three continents, five seas', '两洋三洲五海之地'], cam: [30, 42, 3.0], names: true,
        task: ['Turn around the Middle East and find all five seas: the Caspian, Black, Mediterranean, Red and Arabian Seas.', '绕着中东转一圈，找到五海：里海、黑海、地中海、红海和阿拉伯海。'],
        paint: [{ fill: { k: 'continents', only: ['asia', 'africa', 'europe'] }, a: 0.3 }, { fill: { k: 'land', a2: ME, c: C.gold }, t: 0.4, a: 0.55 }],
        marks: [
          mk([42.5, 34.5], 'Black Sea', '黑海', { c: C.blue, t: 0.8 }), mk([42, 50.5], 'Caspian Sea', '里海', { c: C.blue, t: 1.0 }),
          mk([34, 22], 'Mediterranean Sea', '地中海', { c: C.blue, t: 1.2 }), mk([20, 38.5], 'Red Sea', '红海', { c: C.blue, t: 1.4 }),
          mk([15, 63], 'Arabian Sea', '阿拉伯海', { c: C.blue, t: 1.6 }), mk([24, 46], 'Middle East', '中东', { big: true, c: C.gold, t: 0.4 }),
          mk([50, 30], 'Europe', '欧洲', { c: C.white, t: 1.8 }), mk([16, 22], 'Africa', '非洲', { c: C.white, t: 1.9 }), mk([40, 70], 'Asia', '亚洲', { c: C.white, t: 2.0 }),
        ],
        body: ['The Middle East is the land where Asia, Africa and Europe meet: about 20 countries, from Türkiye and Iran to Saudi Arabia and Egypt. It links the Indian Ocean with the Atlantic (through the Mediterranean) and borders five seas: the Caspian, Black, Mediterranean, Red and Arabian Seas. That is why it is called the land of "two oceans, three continents and five seas". For thousands of years the Silk Road caravans, traders and armies passed through it.',
          '中东是亚洲、非洲、欧洲三大洲的交界地带，包括除阿富汗以外的西亚国家和非洲的埃及，约 20 个国家。它沟通印度洋和大西洋（经地中海），濒临里海、黑海、地中海、红海和阿拉伯海，因此被称为“两洋三洲五海之地”。几千年来，丝绸之路上的商队、商人和军队都要经过这里。'],
      },
      {
        title: ['Straits and the Suez Canal', '海峡与运河'], cam: [27, 42, 3.0],
        lines: [{ pts: SUEZ, c: C.red, w: 2.4, dur: 0.8 }, route([[12, 60], [12.6, 43.4], [20, 38.5], [27.5, 34], [29.9, 32.55], [31.3, 32.3], [34, 28]], 0.4, C.gold)],
        marks: [
          mk([30.6, 32.4], 'Suez Canal', '苏伊士运河', { dot: true, c: C.red, t: 0.6 }), mk([41.1, 29.0], 'Turkish Straits', '土耳其海峡', { dot: true, c: C.red, t: 0.9 }),
          mk([26.6, 56.3], 'Strait of Hormuz', '霍尔木兹海峡', { dot: true, c: C.red, t: 1.2 }), mk([12.6, 43.3], 'Bab-el-Mandeb', '曼德海峡', { dot: true, c: C.red, t: 1.5 }),
          mk([41.01, 28.98], 'Istanbul', '伊斯坦布尔', { c: C.white, t: 1.8 }),
        ],
        body: ['Narrow waters make the region a crossroads of world shipping. The Suez Canal (opened 1869, about 190 km long) links the Red Sea with the Mediterranean, so ships between Asia and Europe save roughly 8,000 km compared with sailing round Africa. The Turkish Straits link the Black Sea to the Mediterranean, and Istanbul sits on both sides, in Europe and in Asia. The Strait of Hormuz is the only way out of the Persian Gulf, and about a fifth of the world\'s oil passes through it.',
          '中东有许多重要的海上通道。苏伊士运河（1869 年通航，全长约 190 千米）沟通红海和地中海，是亚欧之间的“捷径”，比绕行非洲好望角缩短航程约 8000 千米。土耳其海峡沟通黑海和地中海，伊斯坦布尔横跨海峡两岸，地跨亚欧两洲。霍尔木兹海峡是波斯湾通往外界的唯一出口，世界上约五分之一的石油从这里运出。'],
      },
      {
        title: ['The world\'s oil store', '世界石油宝库'], cam: [22, 70, 4.2], sketch: true, items: ['burj', 'vh_dhow'],
        task: ['Follow the oil routes out of the Persian Gulf: one heads east to East Asia, one west through Suez, one round the Cape of Good Hope.', '沿着从波斯湾出发的石油运输路线：一条向东到东亚，一条向西经苏伊士运河，一条绕过好望角。'],
        paint: [{ fill: { k: 'poly', pts: [[30.5, 47.5], [29, 48.5], [26, 50], [24, 52], [24.5, 55], [26.5, 56], [27.5, 52], [29.5, 50], [32, 49], [33, 46]], c: C.orange }, a: 0.55 }],
        lines: [
          route([[27.5, 51], [26.4, 56.5], [22, 62], [10, 75], [5.3, 80.5], [6.2, 94], [2.5, 101], [1.3, 104.3], [10, 110], [22, 116], [30, 123]], 0.4),
          route([[27.5, 51], [26.4, 56.5], [22.5, 60], [13, 50], [12.6, 43.4], [20, 38.5], [27.5, 34], [29.9, 32.55], [31.3, 32.3], [34, 25], [37.3, 11.5], [36, -5.6], [44, -10], [49.5, -5], [51, 1.5]], 0.8, C.orange),
          route([[22.5, 60], [0, 55], [-20, 42], [-35, 20], [-20, 5], [10, -20], [36, -12], [49.5, -5]], 1.2, C.pink),
        ],
        marks: [mk([28, 50.5], 'Persian Gulf oilfields', '波斯湾沿岸油田', { big: true, c: C.orange, t: 0.2 }), mk([20, 120], 'to East Asia', '运往东亚', { c: C.gold, t: 2 }), mk([47, -8], 'to Europe & America', '运往西欧、美国', { c: C.orange, t: 2.4 }), mk([-36, 20], 'Cape of Good Hope', '好望角', { c: C.pink, t: 2.6 })],
        fig: { k: 'pie', title: ['Proven oil reserves by region (approx., 2020)', '世界石油探明储量分布（约，2020 年）'], parts: [
          { name: ['Middle East', '中东'], v: 48, c: C.orange }, { name: ['Central & South America', '中南美洲'], v: 19, c: C.green },
          { name: ['North America', '北美洲'], v: 14, c: C.red }, { name: ['Russia & Central Asia', '俄罗斯及中亚'], v: 8, c: C.blue },
          { name: ['Africa', '非洲'], v: 7, c: C.brown }, { name: ['Asia–Pacific & Europe', '亚太及欧洲'], v: 4, c: C.violet },
        ] },
        body: ['The Persian Gulf and its shores hold about half (≈48 %) of the world\'s proven oil, and the region pumps about a third of the world\'s output. Saudi Arabia, Iraq, Iran, the UAE and Kuwait are the biggest producers; most of their oil is exported because they use little themselves. Tankers leave through the Strait of Hormuz, then sail east via the Strait of Malacca to China, Japan and Korea, west through the Suez Canal to Europe, or round the Cape of Good Hope to Western Europe and the USA. Oil money built modern cities like Dubai.',
          '波斯湾及其沿岸地区石油储量约占世界的一半（约 48%），产量约占世界的三分之一，是世界上石油储量最大、生产和出口石油最多的地区。沙特阿拉伯、伊拉克、伊朗、阿联酋、科威特是主要产油国，本地消费少，石油绝大部分出口。油轮经霍尔木兹海峡驶出：向东经马六甲海峡运往中国、日本、韩国；向西经苏伊士运河运往欧洲；或绕过好望角运往西欧和美国。石油财富建起了迪拜等现代化城市。'],
      },
      {
        title: ['A dry land of few rivers', '干旱少雨，河流稀少'], cam: [28, 42, 3.0], items: ['petra'],
        paint: [{ fill: { k: 'climate', only: ['desert'] }, a: 0.5 }],
        lines: [flow(NILE.slice(9), 0.3), flow(EUPHRATES, 0.6), flow(TIGRIS, 0.8)],
        marks: [mk([35.2, 39.6], 'Euphrates', '幼发拉底河', { c: C.blue, t: 1.2 }), mk([35.6, 44.2], 'Tigris', '底格里斯河', { c: C.blue, t: 1.3 }), mk([26, 31.8], 'Nile', '尼罗河', { c: C.blue, t: 1.4 }), mk([32.6, 44.6], 'Mesopotamia', '两河流域', { c: C.lime, t: 1.6 })],
        fig: { k: 'climo', city: 'cairo' },
        body: ['Most of the Middle East has a hot desert climate: Cairo gets only about 25 mm of rain a year, and much of Arabia has no permanent river at all. People crowd along the few big rivers: the Nile in Egypt, and the Tigris and Euphrates, whose valley (Mesopotamia, "the land between rivers") was a cradle of farming. Because these rivers cross borders, sharing them causes tension: Türkiye\'s dams upstream worry Syria and Iraq, and Ethiopia\'s new dam on the Blue Nile worries Egypt.',
          '中东大部分地区属于热带沙漠气候，开罗年降水量只有 25 毫米左右，阿拉伯半岛许多地方没有常年河流。人口集中在少数大河沿岸：埃及的尼罗河，以及幼发拉底河和底格里斯河——两河流域是古代农业文明的发源地之一。这些河流流经多个国家，分配用水常引发矛盾：土耳其在上游修建水坝，叙利亚和伊拉克担心水量减少；埃塞俄比亚在青尼罗河上建大坝，也引起埃及的担忧。'],
      },
      {
        title: ['Making every drop count', '解决缺水问题'], cam: [27, 44, 2.8],
        marks: [mk([27.0, 49.66], 'Jubail: desalination plants', '朱拜勒：海水淡化厂', { dot: true, c: C.teal, t: 0.4 }), mk([30.8, 34.8], 'Israel: drip irrigation', '以色列：滴灌农业', { dot: true, c: C.green, t: 0.8 }), mk([25.2, 55.27], 'Dubai', '迪拜', { dot: true, t: 1.2 }), mk([24.7, 46.7], 'Riyadh', '利雅得', { dot: true, t: 1.4 })],
        fig: { k: 'bars', title: ['Renewable fresh water per person (approx.)', '人均可更新淡水资源量（约）'], unit: ['m³ a year', '立方米/年'], rows: [
          { name: ['World average', '世界平均'], v: 5500, c: C.blue }, { name: ['China', '中国'], v: 2000, c: C.gold },
          { name: ['Egypt', '埃及'], v: 550, c: C.orange }, { name: ['Israel', '以色列'], v: 190, c: C.orange }, { name: ['Saudi Arabia', '沙特阿拉伯'], v: 70, c: C.red },
        ] },
        body: ['Below about 1,000 m³ of fresh water per person a year, a country is short of water; Saudi Arabia has less than a tenth of that. Rich Gulf states use oil energy to desalinate seawater: the region makes almost half of the world\'s desalinated water, and Saudi Arabia is the biggest producer. Israel pioneered drip irrigation, which delivers water drop by drop to each plant\'s roots, and reuses about 85–90 % of its wastewater on farms. Pumping ancient underground water is another source, but it cannot be refilled.',
          '人均水资源少于约 1000 立方米就属于缺水国家，沙特阿拉伯还不到这个数的十分之一。海湾富国利用丰富的石油能源进行海水淡化，这一地区的海水淡化量约占世界的一半，沙特阿拉伯是最大的海水淡化国。以色列发明并推广滴灌技术，把水一滴一滴直接送到作物根部，还把约 85%–90% 的污水处理后用于农业灌溉。开采地下水也是一种办法，但沙漠下的古老地下水难以补充，不能过度开采。'],
      },
      {
        title: ['Arabs, Islam and desert life', '阿拉伯人与伊斯兰文化'], cam: [26, 45, 2.8], items: ['sheikhzayed', 'an_camel', 'cc_shahmosque'],
        paint: [{ fill: { k: 'land', a2: ['SA', 'IQ', 'KW', 'AE', 'QA', 'BH', 'OM', 'YE', 'JO', 'SY', 'LB', 'PS', 'EG'], c: C.green }, t: 0.3, a: 0.45 }, { fill: { k: 'land', a2: ['IR'], c: C.violet }, t: 0.6, a: 0.45 }, { fill: { k: 'land', a2: ['TR'], c: C.red }, t: 0.8, a: 0.4 }, { fill: { k: 'land', a2: ['IL'], c: C.blue }, t: 1.0, a: 0.5 }],
        marks: [mk([24, 45], 'Arab countries', '阿拉伯国家', { big: true, c: C.green, t: 0.6 }), mk([32.5, 54], 'Persians (Iran)', '波斯人（伊朗）', { c: C.violet, t: 0.9 }), mk([39, 35], 'Turks', '土耳其人', { c: C.red, t: 1.1 }), mk([31, 34.2], 'Jews (Israel)', '犹太人（以色列）', { c: C.blue, t: 1.3 })],
        fig: { k: 'key', set: 'custom', title: ['Main peoples of the Middle East', '中东的主要民族'], items: [
          { c: C.green, name: ['Arabs (Arabic language)', '阿拉伯人（阿拉伯语）'] }, { c: C.violet, name: ['Persians (Persian)', '波斯人（波斯语）'] },
          { c: C.red, name: ['Turks (Turkish)', '土耳其人（土耳其语）'] }, { c: C.blue, name: ['Jews (Hebrew)', '犹太人（希伯来语）'] },
        ] },
        body: ['Most people in the Middle East are Arabs, who speak Arabic and live in more than a dozen Arab countries; Persians live in Iran, Turks in Türkiye and Jews in Israel. Most people are Muslims, so every town has mosques with domes and slender minarets, and daily life follows the five prayers and the fast of Ramadan. In the desert, people traditionally lived as herders with camels, the "ships of the desert", or farmed dates in oases; houses have thick walls, small windows and flat roofs to keep out heat and sand.',
          '中东居民以阿拉伯人为主，他们说阿拉伯语，分布在十多个阿拉伯国家；此外，伊朗以波斯人为主，土耳其以土耳其人为主，以色列以犹太人为主。居民大多信仰伊斯兰教，城镇里随处可见有圆顶和尖塔的清真寺，人们每天礼拜，并在斋月斋戒。沙漠中的人们传统上以骆驼（“沙漠之舟”）放牧，或在绿洲中种植椰枣；房屋墙厚、窗小、屋顶平，可以隔热、挡风沙。'],
      },
      {
        title: ['Holy cities and a hot spot', '宗教圣地与热点地区'], cam: [28, 40, 2.6],
        marks: [mk([31.78, 35.23], 'Jerusalem', '耶路撒冷', { dot: true, big: true, c: C.gold, t: 0.4 }), mk([21.42, 39.83], 'Mecca', '麦加', { dot: true, c: C.gold, t: 0.9 }), mk([24.47, 39.61], 'Medina', '麦地那', { dot: true, c: C.gold, t: 1.2 })],
        fig: { k: 'key', set: 'custom', title: ['Why the Middle East is a hot spot', '中东成为热点地区的原因'], items: [
          { c: C.red, name: ['Key location: straits, canal, three continents', '重要的地理位置：海峡、运河、三洲交界'] }, { c: C.orange, name: ['Oil: the world\'s richest reserves', '石油：世界最丰富的储量'] },
          { c: C.blue, name: ['Water: rivers shared across borders', '水资源：跨国河流用水之争'] }, { c: C.gold, name: ['Land, peoples and religions', '领土、民族和宗教问题'] },
        ] },
        body: ['Judaism, Christianity and Islam all began in this region. Jerusalem is holy to all three: it has the Western Wall, the Church of the Holy Sepulchre and the Al-Aqsa Mosque. Mecca, birthplace of the Prophet Muhammad, is Islam\'s holiest city, and millions of pilgrims travel there each year. Its key location, its oil, scarce water, disputed land, and differences between peoples and faiths have made the Middle East one of the world\'s longest-running hot spots.',
          '犹太教、基督教和伊斯兰教都发源于这一地区。耶路撒冷是三大宗教的圣地，城里有犹太教的哭墙、基督教的圣墓教堂和伊斯兰教的阿克萨清真寺。麦加是伊斯兰教创始人穆罕默德的诞生地，是伊斯兰教第一圣地，每年有数百万穆斯林前来朝觐。重要的地理位置、丰富的石油、匮乏的水资源、领土争端以及民族和宗教矛盾，使中东长期成为世界上的热点地区。'],
      },
    ],
    quiz: [
      { q: ['The Middle East is called the land of…', '中东被称为'], options: [['Two oceans, three continents and five seas', '两洋三洲五海之地'], ['Ice and snow', '冰雪之地'], ['Rainforests', '雨林之地'], ['A thousand lakes', '千湖之国']], answer: 0,
        why: ['It joins Asia, Africa and Europe, links the Indian and Atlantic oceans, and borders the Caspian, Black, Mediterranean, Red and Arabian Seas.', '它连接亚、非、欧三洲，沟通印度洋和大西洋，濒临里海、黑海、地中海、红海和阿拉伯海。'] },
      { q: ['Find the Strait of Hormuz, the gateway of the Persian Gulf oil.', '在地球上点出霍尔木兹海峡。'], at: [26.6, 56.3], tolKm: 500,
        why: ['It is the only way out of the Persian Gulf, between Iran and the tip of Arabia; about a fifth of the world\'s oil passes through it.', '它位于伊朗和阿拉伯半岛之间，是波斯湾通往外界的唯一出口，世界约五分之一的石油从这里运出。'] },
      { q: ['A tanker carries oil from the Persian Gulf to Europe by the shortest sea route. Put the waters it passes in order.', '一艘油轮从波斯湾沿最短航线把石油运往欧洲，把它依次经过的水域排序。'],
        order: [['Strait of Hormuz', '霍尔木兹海峡'], ['Arabian Sea', '阿拉伯海'], ['Bab-el-Mandeb', '曼德海峡'], ['Red Sea', '红海'], ['Suez Canal', '苏伊士运河'], ['Mediterranean Sea', '地中海']],
        why: ['Out of the Gulf through Hormuz, across the Arabian Sea, into the Red Sea at Bab-el-Mandeb, through the Suez Canal and into the Mediterranean.', '出霍尔木兹海峡，经阿拉伯海，过曼德海峡进入红海，再经苏伊士运河进入地中海。'] },
      { q: ['This is Cairo\'s climate graph. What is its annual temperature range (hottest month minus coldest month), in °C?', '这是开罗的气候资料图。它的气温年较差（最热月减最冷月）约是多少摄氏度？'], fig: { k: 'climo', city: 'cairo' }, num: { answer: 14, tol: 1.5, unit: ['°C', '°C'] },
        why: ['August is about 28 °C and January about 14 °C, so the range is about 14 °C; with almost no rain, this is a hot desert climate.', '8 月约 28 °C，1 月约 14 °C，年较差约 14 °C；全年几乎无雨，是热带沙漠气候。'] },
      { q: ['Which are sensible ways to ease the Middle East\'s water shortage? Pick all that apply.', '下列做法中，能缓解中东缺水问题的有（多选）'],
        options: [['Desalinating seawater', '海水淡化'], ['Drip irrigation on farms', '农业推广滴灌'], ['Treating and reusing wastewater', '污水处理后回用'], ['Flooding desert fields with water', '大水漫灌沙漠农田'], ['Pumping ancient groundwater as fast as possible', '尽快大量抽取古老的地下水']], multi: [0, 1, 2],
        why: ['Desalination, drip irrigation and recycling add or save water. Flood irrigation wastes it, and deep desert groundwater cannot be refilled.', '海水淡化、滴灌和污水回用能增加或节约水资源；大水漫灌浪费水，沙漠地下水难以补充，不能过度开采。'] },
      { q: ['Match each strait or canal to the waters it links.', '把海峡、运河和它沟通的水域连起来。'],
        match: [[['Suez Canal', '苏伊士运河'], ['Mediterranean and Red Sea', '地中海和红海']], [['Turkish Straits', '土耳其海峡'], ['Black Sea and Mediterranean', '黑海和地中海']], [['Strait of Hormuz', '霍尔木兹海峡'], ['Persian Gulf and Arabian Sea', '波斯湾和阿拉伯海']], [['Bab-el-Mandeb', '曼德海峡'], ['Red Sea and Gulf of Aden', '红海和亚丁湾']]],
        why: ['These narrow waterways make the Middle East a crossroads: ships from Asia to Europe pass Bab-el-Mandeb, the Red Sea and Suez; Gulf oil leaves through Hormuz.', '这些狭窄的水道使中东成为交通要道：亚欧之间的船只经曼德海峡、红海和苏伊士运河往来；波斯湾的石油经霍尔木兹海峡运出。'] },
      { q: ['Label the five seas around the Middle East.', '在地球上标出中东周围的五海。'],
        place: [{ text: ['Caspian Sea', '里海'], at: [42, 50.5], tolKm: 400 }, { text: ['Black Sea', '黑海'], at: [43, 34.5], tolKm: 450 }, { text: ['Mediterranean Sea', '地中海'], at: [34, 22], tolKm: 700 }, { text: ['Red Sea', '红海'], at: [20, 38.5], tolKm: 400 }, { text: ['Arabian Sea', '阿拉伯海'], at: [15, 63], tolKm: 700 }],
        why: ['The Caspian is a lake in the north-east, the Black Sea is in the north, the Mediterranean in the west, the Red Sea in the south-west and the Arabian Sea in the south-east.', '里海是东北部的内陆湖，黑海在北面，地中海在西面，红海在西南，阿拉伯海在东南。'] },
      { q: ['Which is NOT a main reason the Middle East has long been a hot spot?', '下列不是中东长期成为热点地区的主要原因的是'], options: [['Too much rain and flooding', '降水过多，洪涝频繁'], ['Its key location and shipping lanes', '重要的地理位置和航道'], ['Its rich oil', '丰富的石油资源'], ['Shared, scarce water and disputed land', '水资源匮乏与领土争端']], answer: 0,
        why: ['The region is dry, not wet. Location, oil, water, land, and differences of people and religion are the causes of conflict.', '中东气候干旱而不是多雨。地理位置、石油、水源、领土以及民族宗教差异才是冲突的原因。'] },
    ],
  },
  {
    id: 'europe', strand: 'world', tracks: ['us', 'ib'], grade: 'g7b', unit: east, icon: 'flag', minutes: 7,
    title: ['Western Europe and the EU', '欧洲西部'],
    blurb: ['Mild, wet winds from the Atlantic, green pastures, famous sights and countries that work together.', '大西洋吹来的温和湿润的风、绿色的牧场、闻名世界的旅游胜地和紧密合作的国家。'],
    keys: [
      ['Western Europe has many small, highly developed countries with modern industry and services.', '欧洲西部国家众多，面积不大，绝大多数是经济发达国家，工业和服务业发达。'],
      ['Westerlies and the warm North Atlantic Drift give it a mild, wet temperate maritime climate.', '受西风和北大西洋暖流影响，欧洲西部以温带海洋性气候为主，冬暖夏凉，降水均匀。'],
      ['Cool, damp weather grows grass well, so dairy and livestock farming lead.', '温和湿润的气候利于多汁牧草生长，畜牧业发达，以乳畜业为主。'],
      ['Old cities, the Alps and sunny coasts make it the world\'s busiest tourist region.', '历史名城、阿尔卑斯山和阳光海滩，使这里成为世界上旅游业最发达的地区。'],
      ['27 countries work together in the European Union; 21 of them use the euro.', '27 个国家组成欧洲联盟，其中 21 国使用欧元。'],
    ],
    steps: [
      {
        title: ['Many developed countries', '发达国家集中'], cam: [50, 8, 2.8], names: true,
        paint: [{ fill: { k: 'land', a2: WEU, c: C.green }, t: 0.3, a: 0.5 }],
        marks: [mk([56, -15], 'Atlantic Ocean', '大西洋', { c: C.blue, t: 0.8 }), mk([57, 3], 'North Sea', '北海', { c: C.blue, t: 1.0 }), mk([37, 12], 'Mediterranean Sea', '地中海', { c: C.blue, t: 1.2 })],
        fig: { k: 'bars', title: ['GDP per person, 2023 (approx.)', '2023 年人均国内生产总值（约）'], unit: ['thousand US$', '千美元'], rows: [
          { name: ['Switzerland', '瑞士'], v: 100, c: C.green }, { name: ['Norway', '挪威'], v: 87, c: C.green }, { name: ['Germany', '德国'], v: 53, c: C.green },
          { name: ['France', '法国'], v: 45, c: C.green }, { name: ['World average', '世界平均'], v: 13, c: C.blue }, { name: ['China', '中国'], v: 12.6, c: C.gold },
        ] },
        body: ['Western Europe packs more than 20 countries into an area less than half the size of China, and almost all of them are developed. People here earn several times the world average: Switzerland and Norway are among the richest countries on Earth. Industry started early (the Industrial Revolution began in Britain in the 1760s), and today services such as banking, trade and tourism employ about three in four workers. Its coastline is long and winding, so few places are far from the sea.',
          '欧洲西部国家众多，面积不大，总面积还不到中国的一半，绝大多数是发达国家。这里人均收入是世界平均水平的数倍，瑞士、挪威是世界上最富裕的国家之一。这里工业化起步早（18 世纪 60 年代工业革命首先在英国开始），如今金融、贸易、旅游等服务业吸纳了约四分之三的劳动力。海岸线漫长曲折，大部分地方离海不远。'],
      },
      {
        title: ['Plains, the Alps and great rivers', '平原、阿尔卑斯山与河流'], cam: [49, 10, 2.8], sketch: true, items: ['matterhorn'],
        task: ['Follow the Rhine north from the Alps to the North Sea, then the Danube east towards the Black Sea.', '沿莱茵河从阿尔卑斯山向北流入北海，再沿多瑙河向东流向黑海。'],
        paint: [{ fill: { k: 'poly', pts: [[53.5, -1], [54.5, 8], [54.5, 20], [51, 20], [50.5, 12], [50.5, 6], [49.5, 1], [48.5, -2], [51, -1]], c: C.lime, clip: ['FR', 'BE', 'NL', 'DE', 'DK', 'PL', 'GB'] }, t: 0.2, a: 0.45 }],
        lines: [{ pts: ALPS, c: C.brown, t: 0.4, w: 3, dur: 1.2 }, { pts: SCANDES, c: C.brown, t: 0.6, w: 2.4, dur: 1.2 }, flow(RHINE, 1.0), flow(DANUBE, 1.4)],
        marks: [mk([46.2, 9.8], 'Alps', '阿尔卑斯山脉', { c: C.brown, t: 0.8 }), mk([45.83, 6.86], 'Mont Blanc 4,806 m', '勃朗峰 4806 米', { dot: true, t: 1.0 }), mk([52.8, 12], 'North European Plain', '欧洲平原', { c: C.lime, t: 0.6 }), mk([64.5, 12.5], 'Scandinavian Mts', '斯堪的纳维亚山脉', { c: C.brown, t: 1.0 }), mk([50.4, 7.0], 'Rhine', '莱茵河', { c: C.blue, t: 1.6 }), mk([44.3, 23.5], 'Danube', '多瑙河', { c: C.blue, t: 2.0 })],
        body: ['Western Europe is mostly low plains: the North European Plain stretches from France across Germany to Poland. The high, young Alps rise in the south, and Mont Blanc (4,806 m) is their highest peak; the Scandinavian Mountains in the north were carved by glaciers into deep fjords. The Rhine (about 1,230 km) flows north from the Alps to the North Sea and is one of the world\'s busiest inland waterways. The Danube (about 2,850 km) flows east through ten countries to the Black Sea.',
          '欧洲西部地形以平原为主，欧洲平原从法国经德国一直延伸到波兰。南部有高大年轻的阿尔卑斯山脉，最高峰勃朗峰海拔 4806 米；北部的斯堪的纳维亚山脉被冰川切割出许多峡湾。莱茵河（约 1230 千米）从阿尔卑斯山向北注入北海，是世界上航运最繁忙的内河之一。多瑙河（约 2850 千米）向东流经十个国家，注入黑海。'],
      },
      {
        title: ['A mild, wet climate', '温带海洋性气候'], cam: [50, -2, 3.2], sketch: true,
        task: ['Follow the westerlies and the warm current in from the Atlantic: notice that no mountain wall stops them reaching far inland.', '沿着西风和暖流从大西洋进入欧洲：注意没有高大的南北走向山脉阻挡，它们能深入内陆。'],
        paint: [{ fill: { k: 'climate', only: ['maritime', 'med'] }, t: 0.6, a: 0.55 }],
        lines: [...arrows([[[47, -25], [50, -8]], [[52, -25], [54, -8]], [[57, -22], [59, -6]]], C.teal, 0, 2), { pts: [[40, -40], [48, -25], [55, -15], [62, -4], [68, 8]], c: C.red, t: 0.5, w: 2, flow: true, arrow: true, dur: 2 }],
        marks: [mk([51, -21], 'Westerlies', '西风', { c: C.teal, t: 0.8 }), mk([58, -14], 'North Atlantic Drift (warm)', '北大西洋暖流', { c: C.red, t: 1.4 }), mk([51.5, -0.12], 'London', '伦敦', { dot: true, t: 1.6 }), mk([41.9, 12.5], 'Rome', '罗马', { dot: true, t: 1.8 })],
        fig: { k: 'climo', city: 'london', b: 'rome' },
        body: ['Westerly winds blow from the Atlantic all year, carrying warmth and moisture picked up over the warm North Atlantic Drift. The land is low and the mountains mostly run east–west, so sea air reaches far inland. London is about 5 °C in January and 19 °C in July, with about 50 mm of rain every month: a temperate maritime climate, the most widespread here. The Mediterranean south, like Rome, has hot, dry summers and mild, wet winters.',
          '这里常年受西风影响，西风把北大西洋暖流上空的温暖和水汽带到陆地。地势低平，山脉多为东西走向，海洋气流可以深入内陆。伦敦 1 月约 5 °C，7 月约 19 °C，每月降水约 50 毫米，冬暖夏凉、降水均匀，是这里分布最广的温带海洋性气候。南部地中海沿岸如罗马，属于夏季炎热干燥、冬季温和多雨的地中海气候。'],
      },
      {
        title: ['Dairy and livestock', '发达的乳畜业'], cam: [52, 5, 2.2], items: ['windmill', 'pl_tulips'],
        paint: [{ fill: { k: 'land', a2: ['NL', 'DK', 'IE', 'GB', 'FR', 'DE', 'BE'], c: C.lime }, a: 0.45 }],
        marks: [mk([52.3, 5.3], 'Netherlands', '荷兰', { dot: true, t: 0.5 }), mk([56, 9.5], 'Denmark', '丹麦', { dot: true, t: 0.8 }), mk([53.2, -8], 'Ireland', '爱尔兰', { dot: true, t: 1.1 })],
        fig: { k: 'bars', title: ['Share of farm output from livestock (approx.)', '畜牧业产值占农业产值的比重（约）'], unit: ['%', '%'], rows: [
          { name: ['Ireland', '爱尔兰'], v: 75, c: C.green }, { name: ['Denmark', '丹麦'], v: 65, c: C.green }, { name: ['UK', '英国'], v: 55, c: C.green }, { name: ['China', '中国'], v: 25, c: C.gold },
        ] },
        body: ['Cool, cloudy summers do not give grain enough sun and warmth, but they are perfect for juicy grass that stays green almost all year. So farmers keep dairy and beef cattle and turn milk into butter and cheese: livestock makes up well over half of farm output in Ireland and Denmark. Farms are highly mechanised and linked to processing and marketing, so few farmers produce a lot. The Netherlands, though tiny, is one of the world\'s largest exporters of farm products, from cheese to tulips.',
          '这里夏季凉爽、多阴雨，光热不足，不利于谷物生长，却利于多汁牧草生长，牧草几乎终年常绿。因此农民大量饲养奶牛和肉牛，生产牛奶、黄油和奶酪；在爱尔兰和丹麦，畜牧业产值占农业产值的一半以上。这里农场机械化水平高，生产、加工、销售联系紧密，很少的农民就能生产大量产品。荷兰国土很小，却是世界上最大的农产品出口国之一，奶酪和郁金香等花卉远销世界。'],
      },
      {
        title: ['A tourist magnet', '繁荣的旅游业'], cam: [47, 7, 2.4], items: ['eiffel', 'bigben', 'colosseum', 'neuschwanstein'],
        marks: [mk([48.86, 2.35], 'Paris', '巴黎', { dot: true, t: 0.4 }), mk([51.5, -0.12], 'London', '伦敦', { dot: true, t: 0.7 }), mk([41.9, 12.5], 'Rome', '罗马', { dot: true, t: 1.0 }), mk([46.3, 8.5], 'Alps: skiing', '阿尔卑斯山：滑雪', { c: C.brown, t: 1.3 }), mk([39.5, 2.9], 'Mediterranean beaches', '地中海沿岸海滩', { c: C.gold, t: 1.6 })],
        fig: { k: 'bars', title: ['International tourist arrivals, 2019 (approx.)', '2019 年接待国际游客人数（约）'], unit: ['million', '百万人次'], rows: [
          { name: ['France', '法国'], v: 90, c: C.blue }, { name: ['Spain', '西班牙'], v: 84, c: C.blue }, { name: ['Italy', '意大利'], v: 65, c: C.blue }, { name: ['UK', '英国'], v: 39, c: C.blue },
        ] },
        body: ['Western Europe is the busiest tourist region on Earth. Visitors come for historic cities and museums (Paris, Rome, London), for skiing in the snowy Alps in winter, and for the sunny Mediterranean beaches in summer, which are reliably dry thanks to the Mediterranean climate. France welcomes more international tourists than any other country, about 90 million a year. Good railways, motorways and borderless travel make it easy to visit several countries in one trip, and tourism is a major source of jobs and income.',
          '欧洲西部是世界上旅游业最发达的地区。人们来这里游览巴黎、罗马、伦敦等历史名城和博物馆，冬季到阿尔卑斯山滑雪，夏季到地中海沿岸享受阳光和海滩——地中海气候使夏季晴朗干燥。法国每年接待国际游客约 9000 万人次，居世界首位。便捷的铁路、高速公路和免签证往来，让游客一次就能游览多个国家；旅游业已成为这里重要的经济支柱。'],
      },
      {
        title: ['Industry, ports and the Rhine', '工业、港口与莱茵河'], cam: [50.5, 6, 2.0], items: ['cologne'],
        lines: [flow(RHINE, 0.2)],
        marks: [mk([51.95, 4.14], 'Rotterdam: Europe\'s biggest port', '鹿特丹：欧洲最大港口', { dot: true, big: true, c: C.gold, t: 0.6 }), mk([51.45, 7.2], 'Ruhr', '鲁尔区', { dot: true, c: C.violet, t: 1.0 }), mk([48.78, 9.18], 'Stuttgart: cars', '斯图加特：汽车', { dot: true, c: C.violet, t: 1.3 }), mk([43.6, 1.44], 'Toulouse: Airbus', '图卢兹：空中客车', { dot: true, c: C.violet, t: 1.6 })],
        body: ['Industry grew first on coalfields such as the Ruhr in Germany, which was once Europe\'s biggest coal and steel region and has since switched to services, technology and culture. Today Western Europe is known for cars (Germany), aircraft (Airbus, assembled in Toulouse with parts from several countries), machinery, medicines and fashion. Rotterdam, at the mouth of the Rhine, is Europe\'s biggest port: ships unload here, and barges carry goods up the Rhine deep into Germany and Switzerland.',
          '欧洲西部的工业最早在煤田附近发展起来，德国的鲁尔区曾是欧洲最大的煤炭和钢铁基地，后来转向服务业、高新技术和文化产业。如今这里以汽车（德国）、飞机（空中客车在法国图卢兹总装，零部件来自多个国家）、机械、医药和时装闻名。莱茵河口的鹿特丹是欧洲最大的港口，货物在这里卸船后，由驳船沿莱茵河运往德国和瑞士内陆。'],
      },
      {
        title: ['The European Union', '欧洲联盟'], cam: [50, 14, 3.0], borders: true,
        task: ['Find Brussels, the EU headquarters, among the coloured member countries.', '在着色的成员国中找到欧盟总部所在地布鲁塞尔。'],
        paint: [{ fill: { k: 'land', a2: EU27, c: C.blue }, t: 0.3, a: 0.5 }],
        marks: [mk([50.85, 4.35], 'Brussels (EU headquarters)', '布鲁塞尔（欧盟总部）', { dot: true, big: true, c: C.gold, t: 1 })],
        body: ['After two world wars, European countries chose cooperation. Today 27 countries with about 450 million people form the European Union, and Brussels is its headquarters. Goods, money, services and people move freely between members as if they were one market, and 21 of them share one currency, the euro (Bulgaria joined in 2026). Working together makes them stronger in world trade, though the UK chose to leave in 2020.',
          '两次世界大战之后，欧洲国家走上了联合之路。今天欧洲联盟有 27 个成员国、约 4.5 亿人口，总部设在布鲁塞尔。成员国之间商品、资金、服务和人员可以自由流动，形成统一大市场，其中 21 个国家使用统一货币欧元（保加利亚于 2026 年加入）。联合增强了它们在世界贸易中的竞争力；英国于 2020 年退出了欧盟。'],
      },
    ],
    quiz: [
      { q: ['Western Europe\'s main climate is…', '欧洲西部主要的气候类型是'], options: [['Temperate maritime', '温带海洋性气候'], ['Hot desert', '热带沙漠气候'], ['Tropical rainforest', '热带雨林气候'], ['Temperate monsoon', '温带季风气候']], answer: 0,
        why: ['Westerlies from the Atlantic keep it mild and wet all year.', '大西洋吹来的西风使这里全年温和湿润。'] },
      { q: ['Which climate graph belongs to Western Europe?', '下面的气候资料图最可能属于哪里？'], fig: { k: 'climo', city: 'london', blind: true }, options: [['Western Europe', '欧洲西部'], ['The Middle East', '中东'], ['India', '印度'], ['Siberia', '西伯利亚']], answer: 0,
        why: ['Mild winters (above 0 °C), cool summers (below 22 °C) and rain spread evenly: temperate maritime.', '最冷月在 0 °C 以上，最热月低于 22 °C，降水均匀，是温带海洋性气候。'] },
      { q: ['London averages about 5 °C in January and 19 °C in July. What is its annual temperature range?', '伦敦 1 月平均气温约 5 °C，7 月约 19 °C，气温年较差约是多少？'], num: { answer: 14, tol: 1, unit: ['°C', '°C'] },
        why: ['19 − 5 = 14 °C. The ocean warms slowly and cools slowly, so maritime climates have small ranges (Moscow\'s is over 25 °C).', '19 − 5 = 14 °C。海洋增温慢、降温也慢，所以海洋性气候年较差小（莫斯科超过 25 °C）。'] },
      { q: ['Why is dairy farming so important here?', '这里乳畜业发达的主要原因是'], options: [['Cool, damp summers suit grass better than grain', '夏季凉爽多雨，利于牧草而不利于谷物生长'], ['It is too dry for any plants', '气候太干旱'], ['There are no cities to sell to', '没有城市市场'], ['Cows came from the Middle East', '奶牛来自中东']], answer: 0,
        why: ['Too little summer sun and heat for grain, but grass grows green almost all year.', '夏季光热不足，不利于谷物成熟，但牧草几乎终年常绿。'] },
      { q: ['Which help explain Western Europe\'s mild, wet climate? Pick all that apply.', '欧洲西部形成温和湿润气候的原因有（多选）'],
        options: [['Westerlies blowing in from the Atlantic', '盛行西风从大西洋吹来'], ['The warm North Atlantic Drift', '北大西洋暖流'], ['Mostly plains that let sea air reach far inland', '地形以平原为主，海洋气流能深入内陆'], ['High mountains along the west coast', '西海岸有高大的南北走向山脉'], ['Monsoon winds', '季风']], multi: [0, 1, 2],
        why: ['Moist westerlies and a warm current keep winters mild and bring rain all year, and the low land lets them spread far inland.', '湿润的西风和暖流使冬季温和，全年降水均匀；地势低平，海洋气流能深入内陆。'] },
      { q: ['Match each country to what it is best known for.', '把国家和它的特色连起来。'],
        match: [[['Netherlands', '荷兰'], ['Dairy, flowers and Rotterdam port', '乳畜业、花卉和鹿特丹港']], [['France', '法国'], ['Most international tourists', '接待国际游客最多']], [['Switzerland', '瑞士'], ['The Alps and skiing', '阿尔卑斯山和滑雪']], [['Belgium', '比利时'], ['EU headquarters in Brussels', '欧盟总部布鲁塞尔']]],
        why: ['Each country uses its own strengths: Dutch grassland and ports, French heritage, Swiss mountains, Belgian Brussels at the heart of the EU.', '各国发挥自身优势：荷兰的牧场与港口，法国的名胜古迹，瑞士的高山，比利时布鲁塞尔则是欧盟的中心。'] },
      { q: ['Find Rotterdam, Europe\'s biggest port, at the mouth of the Rhine.', '在地球上点出莱茵河口的欧洲最大港口鹿特丹。'], at: [51.95, 4.14], tolKm: 300,
        why: ['Rotterdam is in the Netherlands where the Rhine meets the North Sea, so goods can go on by river deep into Europe.', '鹿特丹位于荷兰莱茵河入北海处，货物可以沿河深入欧洲内陆。'] },
      { q: ['Label these places in Western Europe.', '在地球上标出欧洲西部的这些地方。'],
        place: [{ text: ['London', '伦敦'], at: [51.5, -0.12], tolKm: 350 }, { text: ['Rome', '罗马'], at: [41.9, 12.5], tolKm: 350 }, { text: ['The Alps', '阿尔卑斯山脉'], at: [46.5, 9.5], tolKm: 350 }, { text: ['Denmark', '丹麦'], at: [56, 9.5], tolKm: 350 }],
        why: ['London is on the Thames in Britain, Rome in central Italy, the Alps arc across Switzerland and its neighbours, and Denmark is a dairy country north of Germany.', '伦敦在英国泰晤士河畔，罗马在意大利中部，阿尔卑斯山脉横贯瑞士及其周边国家，丹麦是德国北面的乳畜业国家。'] },
    ],
  },
  {
    id: 'africa', strand: 'world', tracks: ['uk', 'us', 'ib'], grade: 'g7b', unit: east, icon: 'paw', minutes: 7,
    title: ['Sub-Saharan Africa', '撒哈拉以南非洲'],
    blurb: ['A high plateau continent, great rivers, savanna wildlife, and fast-growing young nations.', '黑种人的故乡：高原大陆、大江大河、草原上的野生动物，以及人口快速增长的国家。'],
    keys: [
      ['Most people south of the Sahara are black: it is called the homeland of black people.', '撒哈拉以南非洲是黑种人的故乡，黑人人口约占世界黑人总数的四分之三。'],
      ['Africa is a plateau continent; the Nile flows north and the Congo crosses the equator twice.', '非洲被称为“高原大陆”；尼罗河向北注入地中海，刚果河两次穿过赤道。'],
      ['Climates mirror each other north and south of the equator; the savanna is the largest belt.', '非洲气候以赤道为中心南北对称分布，热带草原气候分布最广。'],
      ['Many economies rely on exporting one or two raw materials or crops.', '许多国家依赖出口一两种矿产品或农产品，是单一商品经济。'],
      ['Population grows faster than food; overgrazing and clearing land spread the desert.', '人口增长过快，粮食短缺，过度放牧和毁林开荒导致荒漠化。'],
    ],
    steps: [
      {
        title: ['Homeland of black people', '黑种人的故乡'], cam: [2, 20, 3.4],
        paint: [{ fill: { k: 'continents', only: ['africa'] }, a: 0.5 }, { fill: { k: 'land', a2: N_AFRICA, c: C.white }, t: 0.6, a: 0.35 }],
        marks: [mk([24, 10], 'Sahara Desert', '撒哈拉沙漠', { big: true, c: C.orange, t: 0.8 }), mk([-5, 22], 'Sub-Saharan Africa', '撒哈拉以南非洲', { big: true, c: C.gold, t: 1.2 }), mk([28, 20], 'North Africa', '北非', { c: C.white, t: 1.0 })],
        body: ['The Sahara, the world\'s largest hot desert (about 9 million km²), divides Africa in two. North Africa is mostly Arab and closely linked with the Middle East. South of the desert lie more than 40 countries with about 1.2 billion people, and the great majority are black Africans: about three-quarters of the world\'s black people live here, so it is called the homeland of black people. African music, drumming, dance and wood carving are famous worldwide.',
          '撒哈拉沙漠是世界上面积最大的沙漠（约 900 万平方千米），把非洲分成两部分。北非居民以阿拉伯人为主，与中东联系密切。撒哈拉沙漠以南有 40 多个国家，约 12 亿人，绝大多数是黑种人，约占世界黑人总数的四分之三，因此这里被称为“黑种人的故乡”。黑人的音乐、鼓乐、舞蹈和木雕闻名世界。'],
      },
      {
        title: ['A plateau continent', '高原大陆'], cam: [-2, 28, 3.2], sketch: true, items: ['kilimanjaro', 'victoriafalls'],
        paint: [
          { fill: { k: 'poly', pts: [[15, 36.5], [13, 42], [8, 44], [4, 39], [7, 35], [11, 35]], c: C.brown }, t: 0.3, a: 0.6 },
          { fill: { k: 'poly', pts: [[4, 30], [3, 36.5], [-5, 39.5], [-10, 37], [-9, 31], [-3, 29.5]], c: C.brown }, t: 0.6, a: 0.6 },
          { fill: { k: 'poly', pts: [[-12, 15], [-14, 33], [-25, 32], [-33, 27], [-33, 20], [-26, 16], [-18, 13]], c: C.brown }, t: 0.9, a: 0.6 },
        ],
        lines: [{ pts: EAST_AFRICA_RIFT, c: C.red, t: 1.2, w: 1.8, dur: 1.4 }],
        marks: [mk([10, 39.5], 'Ethiopian Highlands', '埃塞俄比亚高原', { c: C.brown, t: 1 }), mk([-3, 33], 'East African Plateau', '东非高原', { c: C.brown, t: 1.3 }), mk([-24, 24], 'South African Plateau', '南非高原', { c: C.brown, t: 1.6 }), mk([-3.07, 37.35], 'Kilimanjaro 5,895 m', '乞力马扎罗山 5895 米', { dot: true, t: 1.9 }), mk([-8, 31.5], 'Great Rift Valley', '东非大裂谷', { c: C.red, t: 2.2 })],
        body: ['Much of Africa is high, flat plateau with an average height of about 750 m, so it is called the plateau continent. The land is higher in the south-east (the Ethiopian, East African and South African plateaus) and lower in the north-west. The Great Rift Valley, where the continent is slowly splitting apart, runs through the east and is lined with lakes and volcanoes. Kilimanjaro (5,895 m), Africa\'s highest peak, is a volcano only 3° south of the equator, yet snow and ice cap its top.',
          '非洲地形以高原为主，平均海拔约 750 米，被称为“高原大陆”。地势东南高、西北低：东南部有埃塞俄比亚高原、东非高原和南非高原。东非大裂谷纵贯东部，是大陆正在缓慢裂开的地方，沿线分布着许多湖泊和火山。非洲最高峰乞力马扎罗山（5895 米）是一座火山，位于赤道以南约 3°，山顶却终年覆盖冰雪。'],
      },
      {
        title: ['The Nile and the Congo', '尼罗河与刚果河'], cam: [8, 26, 3.6],
        task: ['Follow the Nile north from Lake Victoria to the Mediterranean, then the Congo as it curves across the equator to the Atlantic.', '沿尼罗河从维多利亚湖向北一直到地中海，再沿刚果河两次穿过赤道流入大西洋。'],
        lines: [flow(NILE, 0.2), flow(BLUE_NILE, 0.6), flow(CONGO, 1.0), flow(NIGER, 1.4), par(0, C.gold, 0.1, { w: 0.8 })],
        marks: [mk([20, 29.5], 'Nile', '尼罗河', { c: C.blue, t: 1.2 }), mk([1.5, 21], 'Congo', '刚果河', { c: C.blue, t: 1.6 }), mk([15.5, -4], 'Niger', '尼日尔河', { c: C.blue, t: 2 }), mk([-1, 33], 'Lake Victoria', '维多利亚湖', { t: 1 }), mk([-3.5, 5], 'Equator', '赤道', { c: C.gold, t: 0.4 })],
        body: ['The Nile, about 6,670 km long, is the world\'s longest river. Its White Nile starts near Lake Victoria (Africa\'s largest lake) and the Blue Nile in the Ethiopian Highlands; together they flow north across the desert to the Mediterranean, and Egypt depends on them. The Congo crosses the equator twice through the rainforest, gets heavy rain all year and carries more water than any river except the Amazon. Because Africa\'s rivers drop off the plateau edge in falls and rapids, they are rich in water power but hard to navigate.',
          '尼罗河全长约 6670 千米，是世界上最长的河流。白尼罗河发源于非洲最大的湖泊维多利亚湖附近，青尼罗河发源于埃塞俄比亚高原，汇合后向北穿过沙漠注入地中海，埃及的生存离不开它。刚果河两次穿过赤道，流经终年多雨的热带雨林，流量仅次于亚马孙河，居世界第二。非洲河流从高原边缘跌落，多瀑布和急流，水能丰富，但不便航行。'],
      },
      {
        title: ['Climate in mirror image', '气候南北对称'], cam: [2, 18, 3.6], sketch: true,
        task: ['Turn the globe north and south from the equator: notice the same belts of rainforest, savanna and desert on both sides.', '从赤道分别向北、向南转动地球：注意两侧依次出现相同的热带雨林、热带草原和热带沙漠气候带。'],
        paint: [{ fill: { k: 'climate', only: ['rainforest', 'savanna', 'desert', 'med'] }, a: 0.6 }],
        lines: [par(0, C.gold, 0.3), par(23.44, C.orange, 0.5, { w: 0.8 }), par(-23.44, C.orange, 0.5, { w: 0.8 })],
        marks: [mk([0.5, -5], 'Equator', '赤道', { c: C.gold, t: 0.6 }), mk([1, 22], 'Rainforest', '热带雨林', { t: 1 }), mk([10, 22], 'Savanna', '热带草原', { t: 1.3 }), mk([-15, 25], 'Savanna', '热带草原', { t: 1.5 }), mk([23, 12], 'Desert', '热带沙漠', { t: 1.8 }), mk([-24, 17], 'Desert', '热带沙漠', { t: 2 }), mk([34.5, 2], 'Mediterranean', '地中海气候', { t: 2.2 }), mk([-33.5, 21], 'Mediterranean', '地中海气候', { t: 2.4 })],
        fig: { k: 'key', set: 'climate', only: ['rainforest', 'savanna', 'desert', 'med'] },
        body: ['The equator crosses the middle of Africa, and about three-quarters of the continent lies between the tropics, so most of it is hot all year: it is called the tropical continent. The climates are arranged almost like a mirror: rainforest along the equator, then savanna, then desert, then a strip of Mediterranean climate at the northern and southern tips. Because the continent is much wider in the north, the Sahara is far bigger than the deserts of the south. Savanna covers the largest area of all.',
          '赤道横穿非洲中部，全洲约四分之三的面积位于南北回归线之间，大部分地区终年炎热，被称为“热带大陆”。非洲的气候以赤道为中心大致呈南北对称分布：赤道附近是热带雨林气候，向南北依次是热带草原气候、热带沙漠气候，南北两端是地中海气候。由于北部大陆宽广，北部的撒哈拉沙漠远比南部的沙漠大。热带草原气候是非洲分布面积最广的气候类型。'],
      },
      {
        title: ['Savanna: wet season, dry season', '热带草原与野生动物'], cam: [-2.5, 35, 1.4], items: ['an_lion', 'an_elephant', 'mg_wildebeest', 'an_giraffe'],
        task: ['Watch the herds circle between the Serengeti and the Masai Mara, following the rain and the fresh grass.', '观察兽群在塞伦盖蒂和马赛马拉之间循环迁徙，追随雨水和新草。'],
        paint: [{ fill: { k: 'climate', only: ['savanna'] }, a: 0.45 }],
        lines: [{ pts: [[-3.0, 35.0], [-2.4, 34.4], [-1.5, 34.9], [-1.4, 35.3], [-2.2, 35.3], [-3.0, 35.4]], c: C.gold, t: 0.4, w: 2, flow: true, arrow: true, closed: true, dur: 3 }],
        marks: [mk([-2.6, 34.6], 'Serengeti', '塞伦盖蒂', { c: C.lime, t: 0.6 }), mk([-1.4, 35.1], 'Masai Mara', '马赛马拉', { c: C.lime, t: 0.9 }), mk([-3.07, 37.35], 'Kilimanjaro', '乞力马扎罗山', { dot: true, t: 1.2 })],
        fig: BAMAKO,
        body: ['The savanna has a hot wet season, when the Sun is high and the rain belt arrives, and a long dry season, as the climate graph of Bamako shows: almost all of its ≈900 mm falls from May to October. Tall grass with scattered trees like the baobab feeds the largest herds of big animals on Earth. In East Africa about 1.5 million wildebeest, with zebras and gazelles, circle between Tanzania\'s Serengeti and Kenya\'s Masai Mara each year, following the rains, with lions and crocodiles waiting for them. Safari tourism in these national parks brings many jobs.',
          '热带草原气候全年高温，分为明显的湿季和干季：太阳直射、雨带到来时是湿季，其余时间是漫长的干季。从巴马科的气候资料图可以看出，全年约 900 毫米的降水几乎都集中在 5–10 月。高高的草丛中散布着猴面包树等树木，养育着地球上数量最多的大型野生动物群。在东非，每年约 150 万头角马与斑马、羚羊一起，追随雨水在坦桑尼亚的塞伦盖蒂和肯尼亚的马赛马拉之间循环迁徙，狮子和鳄鱼伺机捕食。国家公园里的野生动物观光为当地带来了大量就业机会。'],
      },
      {
        title: ['One export, one economy', '单一商品经济'], cam: [0, 20, 3.4],
        paint: [{ fill: { k: 'land', a2: ['NG', 'ZM', 'CI', 'GH', 'BW', 'ET'], c: C.orange }, a: 0.55 }],
        marks: [mk([9, 8], 'Nigeria: oil', '尼日利亚：石油', { t: 0.4 }), mk([-14, 27.5], 'Zambia: copper', '赞比亚：铜', { t: 0.7 }), mk([7.5, -5.5], 'Côte d\'Ivoire: cocoa', '科特迪瓦：可可', { t: 1 }), mk([-22, 24], 'Botswana: diamonds', '博茨瓦纳：钻石', { t: 1.3 }), mk([8.5, 39.5], 'Ethiopia: coffee', '埃塞俄比亚：咖啡', { t: 1.6 }), mk([7.9, -1.0], 'Ghana: gold, cocoa', '加纳：黄金、可可', { t: 1.9 })],
        fig: { k: 'bars', title: ['Share of exports from one product (approx.)', '单一产品占出口总额的比重（约）'], unit: ['%', '%'], rows: [
          { name: ['Nigeria · oil & gas', '尼日利亚 · 石油天然气'], v: 85, c: C.orange }, { name: ['Botswana · diamonds', '博茨瓦纳 · 钻石'], v: 80, c: C.orange },
          { name: ['Zambia · copper', '赞比亚 · 铜'], v: 70, c: C.orange }, { name: ['Côte d\'Ivoire · cocoa', '科特迪瓦 · 可可'], v: 40, c: C.orange },
        ] },
        body: ['During colonial times, European powers made African colonies dig minerals and grow cash crops for export, and that pattern largely remains. Many countries still earn most of their foreign money from one or two products: oil in Nigeria, copper in Zambia, diamonds in Botswana, cocoa in Côte d\'Ivoire (which grows about 40 % of the world\'s cocoa). They export cheap raw materials and import expensive manufactured goods, and when the world price of their one product falls, the whole economy suffers. Building factories that process their own raw materials is the way out.',
          '殖民统治时期，欧洲殖民者迫使非洲开采矿产、种植经济作物供出口，这种格局至今仍有影响。许多国家的外汇收入主要依靠一两种产品：尼日利亚的石油、赞比亚的铜、博茨瓦纳的钻石、科特迪瓦的可可（约占世界产量的 40%）。它们出口廉价的初级产品，进口昂贵的工业制成品，一旦这种产品的国际价格下跌，整个国家的经济就会受到冲击。发展加工工业、使经济多样化是摆脱困境的出路。'],
      },
      {
        title: ['People, food and the land', '人口、粮食与环境'], cam: [13, 5, 3.2], sketch: true,
        paint: [{ fill: { k: 'poly', pts: SAHEL, c: C.orange, clip: ['SN', 'MR', 'ML', 'BF', 'NE', 'NG', 'TD', 'SD', 'ER', 'GM'] }, t: 0.3, a: 0.5 }, { fill: { k: 'land', a2: ['NE'], c: C.gold }, t: 0.6, a: 0.4 }],
        marks: [mk([15, 1], 'Sahel: desert spreading', '萨赫勒地区：荒漠化', { big: true, c: C.orange, t: 0.6 }), mk([17.5, 9], 'Niger', '尼日尔', { t: 1 })],
        fig: { k: 'pyramid', a: 'niger', b: 'japan' },
        body: ['Compare Niger\'s population pyramid with Japan\'s: Niger\'s wide base means many children are born, and about half of its people are under 15. Africa has about 1.5 billion people and is expected to reach about 2.5 billion by 2050, but food production has grown more slowly, so about one in five Africans does not get enough to eat. To grow more food and feed more animals, people have cleared forests and overgrazed the grasslands of the Sahel, the dry belt south of the Sahara, so the desert is spreading. Better seeds and irrigation, planting the "Great Green Wall" of trees, and slower population growth all help.',
          '比较尼日尔和日本的人口金字塔：尼日尔的金字塔底部很宽，说明出生的孩子多，约一半人口不到 15 岁。非洲现有约 15 亿人，预计到 2050 年将达到约 25 亿，但粮食生产增长较慢，约五分之一的非洲人吃不饱。为了多产粮食、多养牲畜，人们毁林开荒、过度放牧，使撒哈拉沙漠南缘的萨赫勒地区荒漠化日益严重。推广良种和灌溉、营造“绿色长城”防护林、控制人口过快增长，都是解决问题的办法。'],
      },
    ],
    quiz: [
      { q: ['Africa is called the…', '非洲被称为'], options: [['Plateau continent', '高原大陆'], ['Ice continent', '冰雪大陆'], ['Plain continent', '平原大陆'], ['Island continent', '岛屿大陆']], answer: 0,
        why: ['Most of Africa is high, flat plateau averaging about 750 m.', '非洲地形以高原为主，平均海拔约 750 米。'] },
      { q: ['Going north from the equator in Africa, put the climate belts in order.', '在非洲从赤道向北，把气候带依次排序。'],
        order: [['Tropical rainforest', '热带雨林气候'], ['Tropical savanna', '热带草原气候'], ['Tropical desert', '热带沙漠气候'], ['Mediterranean', '地中海气候']],
        why: ['The belts mirror each other about the equator: rainforest, savanna, desert, then Mediterranean at the tip, and the same going south.', '非洲气候以赤道为中心南北对称：依次是热带雨林、热带草原、热带沙漠，两端是地中海气候，向南也一样。'] },
      { q: ['This mystery place\'s climate covers the largest area of Africa. What is it?', '下图所示气候类型是非洲分布面积最广的，它是'], fig: { k: 'climo', city: 'darwin', blind: true }, options: [['Tropical savanna', '热带草原气候'], ['Tropical rainforest', '热带雨林气候'], ['Tropical desert', '热带沙漠气候'], ['Mediterranean', '地中海气候']], answer: 0,
        why: ['Hot all year with a clear wet season and a long dry season: tropical savanna, the habitat of Africa\'s great herds.', '全年高温，分明显的湿季和干季，是热带草原气候，非洲大型兽群就生活在这里。'] },
      { q: ['Find the mouth of the Nile.', '在地球上点出尼罗河的入海口。'], at: [31.3, 31.0], tolKm: 500,
        why: ['The Nile flows north into the Mediterranean, through a delta just north of Cairo.', '尼罗河向北流，在开罗以北形成三角洲，注入地中海。'] },
      { q: ['Kilimanjaro\'s foot (about 1,000 m) averages 25 °C. Air cools about 0.6 °C every 100 m up. Roughly how warm is its 5,895 m summit?', '乞力马扎罗山麓（海拔约 1000 米）年均温约 25 °C，海拔每升高 100 米气温约降低 0.6 °C。山顶（5895 米）年均温约是多少？'], num: { answer: -4, tol: 1.5, unit: ['°C', '°C'] },
        why: ['It is about 4,900 m higher: 4,900 ÷ 100 × 0.6 ≈ 29 °C cooler, so 25 − 29 ≈ −4 °C. That is why there is snow on the equator.', '高出约 4900 米，气温降低约 4900 ÷ 100 × 0.6 ≈ 29 °C，25 − 29 ≈ −4 °C，所以赤道附近的山顶也有冰雪。'] },
      { q: ['Match each country to the main export its economy depends on.', '把国家和它主要依赖的出口商品连起来。'],
        match: [[['Nigeria', '尼日利亚'], ['Oil', '石油']], [['Zambia', '赞比亚'], ['Copper', '铜']], [['Côte d\'Ivoire', '科特迪瓦'], ['Cocoa', '可可']], [['Botswana', '博茨瓦纳'], ['Diamonds', '钻石']]],
        why: ['Many African countries sell one or two raw materials, so a fall in world prices hits the whole economy.', '许多非洲国家依赖一两种原料出口，国际市场价格一下跌，整个国家的经济就会受到冲击。'] },
      { q: ['Which would help the Sahel feed its people without spreading the desert? Pick all that apply.', '下列做法中，既能解决萨赫勒地区的粮食问题、又能防止荒漠化的有（多选）'],
        options: [['Better seeds and small-scale irrigation', '推广良种，发展小型灌溉'], ['Planting belts of trees', '营造防护林带'], ['Keeping herd sizes to what the grass can support', '以草定畜，控制牲畜数量'], ['Clearing more woodland for fields', '砍伐更多林地开垦农田'], ['Doubling the number of goats', '把山羊数量增加一倍']], multi: [0, 1, 2],
        why: ['Raising yields, planting trees and grazing within limits protect the land. Clearing woodland and overgrazing are what spread the desert.', '提高单产、植树造林、合理放牧能保护土地；毁林开荒和过度放牧正是荒漠化的原因。'] },
      { q: ['Label these features of Africa.', '在地球上标出非洲的这些地理事物。'],
        place: [{ text: ['Kilimanjaro', '乞力马扎罗山'], at: [-3.07, 37.35], tolKm: 400 }, { text: ['Lake Victoria', '维多利亚湖'], at: [-1, 33], tolKm: 400 }, { text: ['Ethiopian Highlands', '埃塞俄比亚高原'], at: [10, 39.5], tolKm: 500 }, { text: ['Mouth of the Congo', '刚果河河口'], at: [-6, 12.4], tolKm: 500 }],
        why: ['Kilimanjaro, Africa\'s highest peak, and Lake Victoria, its largest lake, are on the East African Plateau; the Ethiopian Highlands are further north; the Congo reaches the Atlantic in the west.', '非洲最高峰乞力马扎罗山和最大的湖泊维多利亚湖都在东非高原上；埃塞俄比亚高原在它的北面；刚果河在西部注入大西洋。'] },
    ],
  },
  {
    id: 'russia', strand: 'world', tracks: ['uk', 'us'], grade: 'g7b', unit: east, icon: 'compass', minutes: 7,
    title: ['Russia', '俄罗斯'],
    blurb: ['The biggest country on Earth: across Europe and Asia, rivers to the Arctic, cold winters and a railway 9,000 km long.', '世界上面积最大的国家：地跨两洲，河流北流，冬季严寒，资源丰富，铁路绵延 9000 多千米。'],
    keys: [
      ['Russia is the largest country, spanning eastern Europe and northern Asia; the Urals divide the two parts.', '俄罗斯是世界上面积最大的国家，地跨欧洲东部和亚洲北部，以乌拉尔山脉为界。'],
      ['Plains and plateaus dominate; the land is low in the west and high in the east, and slopes down to the north.', '地形以平原和高原为主，地势东高西低、南高北低。'],
      ['The Ob, Yenisei and Lena flow north to the Arctic; the Volga flows into the Caspian Sea.', '鄂毕河、叶尼塞河、勒拿河向北注入北冰洋，伏尔加河注入里海。'],
      ['Most of Russia is cold, with long, freezing winters and a continental climate.', '俄罗斯纬度高，以温带大陆性气候为主，冬季漫长严寒。'],
      ['Rich resources lie in Siberia but industry is in the European part; railways and pipelines link them.', '资源多在亚洲部分，工业集中在欧洲部分，铁路和管道运输把它们连接起来。'],
    ],
    steps: [
      {
        title: ['The largest country', '面积最大的国家'], cam: [60, 90, 4.4],
        paint: [{ fill: { k: 'land', a2: ['RU'], c: C.red }, t: 0.2, a: 0.5 }],
        lines: [{ pts: URALS, c: C.brown, t: 0.8, w: 2.4, dur: 1.4 }],
        marks: [mk([62, 64], 'Ural Mountains', '乌拉尔山脉', { c: C.brown, t: 1.4 }), mk([57, 42], 'European part', '欧洲部分', { big: true, t: 1.8 }), mk([63, 110], 'Asian part (Siberia)', '亚洲部分（西伯利亚）', { big: true, t: 2.1 }), mk([76, 90], 'Arctic Ocean', '北冰洋', { c: C.blue, t: 2.3 }), mk([50, 160], 'Pacific Ocean', '太平洋', { c: C.blue, t: 2.5 })],
        body: ['Russia covers about 17.1 million km², almost twice the size of China and the largest country on Earth. It stretches across eastern Europe and northern Asia, from the Baltic Sea to the Pacific, and has the Arctic Ocean along its whole northern coast. The low Ural Mountains divide it: the Asian part, Siberia, makes up about three-quarters of the land, but about three-quarters of the 146 million people live in the European part. Most Russians are Slavs, and Moscow is the capital.',
          '俄罗斯面积约 1710 万平方千米，将近中国的两倍，是世界上面积最大的国家。它地跨欧洲东部和亚洲北部，西起波罗的海，东到太平洋，北部濒临北冰洋。乌拉尔山脉是欧洲部分和亚洲部分的分界：亚洲部分（西伯利亚）约占全国面积的四分之三，但全国约 1.46 亿人口中约四分之三居住在欧洲部分。居民以俄罗斯族为主，首都是莫斯科。'],
      },
      {
        title: ['Sunrise across 11 time zones', '跨越 11 个时区'], cam: [60, 90, 4.6], night: true,
        task: ['Watch the line between night and day sweep west across Russia: how long after Vladivostok does the Sun rise in Kaliningrad?', '观察晨线自东向西扫过俄罗斯：符拉迪沃斯托克日出后，要过多久加里宁格勒才迎来日出？'],
        clock: { mode: 'day', start: Date.UTC(2025, 2, 20, 18), rate: 2, span: 12 },
        marks: [mk([43.1, 131.9], 'Vladivostok UTC+10', '符拉迪沃斯托克 东十区', { dot: true, t: 0.4 }), mk([55.75, 37.6], 'Moscow UTC+3', '莫斯科 东三区', { dot: true, t: 0.5 }), mk([54.7, 20.5], 'Kaliningrad UTC+2', '加里宁格勒 东二区', { dot: true, t: 0.6 })],
        body: ['From Kaliningrad on the Baltic to the Bering Strait, Russia spans about 170 degrees of longitude, so it uses 11 time zones, from UTC+2 to UTC+12. When the Sun rises in Vladivostok on the Pacific coast, people in Moscow, seven hours behind, are still asleep in the middle of the night. Watch the dawn line sweep from east to west across the country: it takes about ten hours to cross it.',
          '俄罗斯西起波罗的海沿岸的加里宁格勒，东到白令海峡，东西跨经度约 170°，共跨 11 个时区（东二区至东十二区）。当东部太平洋沿岸的符拉迪沃斯托克迎来日出时，比它晚 7 小时的莫斯科还是深夜。看，晨线自东向西扫过这个国家，需要大约十个小时。'],
      },
      {
        title: ['Plains in the west, mountains in the east', '地形：东高西低'], cam: [62, 95, 4.4], sketch: true,
        task: ['Move from west to east: East European Plain, Urals, West Siberian Plain, Central Siberian Plateau, then the East Siberian Mountains.', '自西向东依次找到：东欧平原、乌拉尔山脉、西西伯利亚平原、中西伯利亚高原、东西伯利亚山地。'],
        paint: [
          { fill: { k: 'poly', pts: [[68, 30], [68, 55], [56, 58], [47, 48], [45, 40], [50, 32], [56, 28]], c: C.lime, clip: ['RU'] }, t: 0.2, a: 0.5 },
          { fill: { k: 'poly', pts: [[72, 66], [72, 85], [66, 87], [56, 86], [53, 78], [55, 64], [62, 62], [68, 66]], c: C.green, clip: ['RU'] }, t: 0.6, a: 0.5 },
          { fill: { k: 'poly', pts: [[72, 100], [72, 112], [68, 122], [62, 126], [58, 113], [56, 103], [60, 92], [66, 88]], c: C.orange, clip: ['RU'] }, t: 1.0, a: 0.5 },
          { fill: { k: 'poly', pts: [[71, 132], [70, 160], [64, 178], [58, 162], [52, 141], [58, 135], [64, 129]], c: C.brown, clip: ['RU'] }, t: 1.4, a: 0.55 },
        ],
        lines: [{ pts: URALS, c: C.brown, t: 0.4, w: 2.4, dur: 1 }],
        marks: [mk([55, 42], 'East European Plain', '东欧平原', { c: C.lime, t: 0.4 }), mk([62, 74], 'West Siberian Plain', '西西伯利亚平原', { c: C.green, t: 0.8 }), mk([64, 105], 'Central Siberian Plateau', '中西伯利亚高原', { c: C.orange, t: 1.2 }), mk([65, 150], 'East Siberian Mountains', '东西伯利亚山地', { c: C.brown, t: 1.6 })],
        body: ['Plains and plateaus make up most of Russia, and the land rises from west to east. West of the Urals, the East European Plain is low and rolling; between the Urals and the Yenisei, the West Siberian Plain is one of the flattest, swampiest lowlands in the world. Between the Yenisei and the Lena lies the Central Siberian Plateau, and east of the Lena rise the East Siberian Mountains, with active volcanoes on Kamchatka. Across Siberia the land also tilts down from the southern mountains to the Arctic coast.',
          '俄罗斯地形以平原和高原为主，地势东高西低。乌拉尔山脉以西是地势低缓的东欧平原；乌拉尔山脉与叶尼塞河之间是西西伯利亚平原，是世界上最平坦、沼泽最多的低地之一；叶尼塞河与勒拿河之间是中西伯利亚高原；勒拿河以东是东西伯利亚山地，堪察加半岛上还有活火山。西伯利亚地势还从南部山地向北冰洋沿岸降低，南高北低。'],
      },
      {
        title: ['Rivers that flow north', '向北流的河流'], cam: [60, 85, 4.2],
        lines: [flow(RIVERS.ob, 0.2), flow(RIVERS.yenisei, 0.5), flow(RIVERS.lena, 0.8), flow(VOLGA, 1.2)],
        marks: [mk([63, 69], 'Ob', '鄂毕河', { c: C.blue, t: 1 }), mk([64, 88], 'Yenisei', '叶尼塞河', { c: C.blue, t: 1.2 }), mk([65, 125], 'Lena', '勒拿河', { c: C.blue, t: 1.4 }), mk([52, 47], 'Volga → Caspian Sea', '伏尔加河 → 里海', { c: C.blue, t: 1.8 }), mk([44, 50.5], 'Caspian Sea', '里海', { t: 2.1 }), mk([53.5, 108.2], 'Lake Baikal', '贝加尔湖', { dot: true, c: C.teal, t: 2.3 })],
        body: ['Because Asian Russia slopes down to the north, the great Siberian rivers, the Ob, Yenisei and Lena, all flow north into the Arctic Ocean. They freeze for half the year; in spring the southern upper reaches thaw first while the northern lower reaches are still blocked by ice, so meltwater backs up and floods (ice floods). The Volga, about 3,530 km long, is Europe\'s longest river and Russia\'s "mother river"; it flows south into the Caspian Sea. Lake Baikal, 1,642 m deep, is the deepest lake on Earth and holds about a fifth of the world\'s liquid fresh lake water.',
          '俄罗斯亚洲部分地势南高北低，鄂毕河、叶尼塞河和勒拿河都向北注入北冰洋。这些河流一年中约有半年封冻；春季南部上游先解冻，北部下游仍然冰封，河水受阻泛滥，形成凌汛。伏尔加河全长约 3530 千米，是欧洲最长的河流、俄罗斯的“母亲河”，向南注入里海。贝加尔湖深达 1642 米，是世界上最深的湖泊，蓄水量约占世界湖泊淡水的五分之一。'],
      },
      {
        title: ['A cold country', '寒冷的国家'], cam: [62, 100, 4.2], sketch: true,
        paint: [{ fill: { k: 'climate', only: ['continental', 'subarctic', 'tundra'] }, a: 0.5 }],
        lines: [{ pts: [[66.56, 25], [66.56, 100], [66.56, 180]], c: C.ice, t: 0.4, rhumb: true, dur: 2 }],
        marks: [mk([67.5, 100], 'Arctic Circle', '北极圈', { c: C.ice, t: 1 }), mk([62.0, 129.7], 'Yakutsk', '雅库茨克', { dot: true, t: 1.4 }), mk([55.75, 37.6], 'Moscow', '莫斯科', { dot: true, t: 1.6 })],
        fig: { k: 'climo', city: 'moscow', b: 'yakutsk' },
        body: ['Most of Russia lies north of 50°N, and part is inside the Arctic Circle, so it is a cold country with a mainly continental climate. Further from the Atlantic, winters get longer and colder: Moscow averages −6 °C in January, but Yakutsk averages almost −39 °C, and Oymyakon nearby has recorded −68 °C. Summers are short but warm, so the yearly range is huge. Taiga, the world\'s largest coniferous forest, covers Siberia, with tundra and permafrost along the Arctic coast.',
          '俄罗斯大部分地区位于北纬 50° 以北，有一部分在北极圈内，是一个寒冷的国家，以温带大陆性气候为主。离大西洋越远，冬季越漫长寒冷：莫斯科 1 月平均气温约 −6 °C，而雅库茨克接近 −39 °C，附近的奥伊米亚康曾记录到 −68 °C。夏季短促而较温暖，气温年较差很大。西伯利亚分布着世界上面积最大的亚寒带针叶林，北冰洋沿岸是苔原和冻土。'],
      },
      {
        title: ['Riches in the east, industry in the west', '资源与工业'], cam: [57, 75, 4.0], items: ['kremlin', 'basil'],
        paint: [{ fill: { k: 'poly', pts: [[67, 66], [67, 80], [60, 82], [56, 76], [58, 66]], c: C.orange }, t: 0.3, a: 0.5 }, { fill: { k: 'poly', pts: [[56, 85], [56, 89], [53, 89], [53, 85.5]], c: C.brown }, t: 0.5, a: 0.6 }],
        lines: [{ pts: [[62.5, 75], [58, 60], [55.5, 45], [53, 30], [52.5, 13.4]], c: C.orange, t: 0.8, w: 1.4, flow: true, arrow: true, dur: 2 }, { pts: [[60.7, 116.2], [57, 122], [53.5, 124.7], [50.26, 127.53]], c: C.orange, t: 1.2, w: 1.4, flow: true, arrow: true, dur: 1.6 }],
        marks: [mk([62, 74], 'West Siberian oil & gas', '西西伯利亚油气田', { c: C.orange, t: 0.4 }), mk([54.5, 87], 'Kuzbass coal', '库兹巴斯煤田', { c: C.brown, t: 0.6 }), mk([55.75, 37.6], 'Moscow', '莫斯科', { dot: true, big: true, c: C.violet, t: 1.0 }), mk([59.94, 30.3], 'St Petersburg', '圣彼得堡', { dot: true, c: C.violet, t: 1.2 }), mk([56.84, 60.6], 'Yekaterinburg (Urals)', '叶卡捷琳堡（乌拉尔）', { dot: true, c: C.violet, t: 1.4 }), mk([55.03, 82.92], 'Novosibirsk', '新西伯利亚', { dot: true, c: C.violet, t: 1.6 }), mk([51, 125], 'Power of Siberia → China', '“西伯利亚力量”→ 中国', { c: C.orange, t: 2.0 })],
        body: ['Russia has some of the world\'s largest reserves of natural gas, oil, coal, iron, timber and water power, mostly in Siberia: West Siberia is a giant oil and gas field, and the Kuzbass is a great coalfield. Yet most industry and people are in the European part, around Moscow and St Petersburg and in the Urals, with the Novosibirsk–Kuzbass region as the main Siberian base. Heavy industry such as steel, machinery, chemicals and weapons is strong, while light industry is weaker. Energy is the biggest export: pipelines carry gas and oil west to Europe and east to China.',
          '俄罗斯天然气、石油、煤炭、铁矿、森林和水能资源都非常丰富，储量居世界前列，大多分布在亚洲部分：西西伯利亚有巨大的油气田，库兹巴斯是大煤田。但工业和人口主要集中在欧洲部分，形成以莫斯科、圣彼得堡为中心的工业区和乌拉尔工业区，亚洲部分以新西伯利亚—库兹巴斯工业区为主。俄罗斯重工业（钢铁、机械、化工、军工）发达，轻工业相对薄弱。能源是最大宗的出口商品，管道把天然气和石油向西输往欧洲、向东输往中国。'],
      },
      {
        title: ['The Trans-Siberian Railway', '西伯利亚大铁路'], cam: [55, 85, 4.4], items: ['vh_transsib'],
        task: ['Follow the Trans-Siberian Railway from Moscow all the way east to Vladivostok on the Pacific.', '沿着西伯利亚大铁路从莫斯科一路向东，到达太平洋沿岸的符拉迪沃斯托克。'],
        lines: [{ pts: TRANS_SIB, c: C.gold, t: 0.3, w: 2, dur: 3 }],
        marks: [mk([55.75, 37.6], 'Moscow', '莫斯科', { dot: true, big: true, t: 0.4 }), mk([56.84, 60.6], 'Yekaterinburg', '叶卡捷琳堡', { dot: true, t: 0.9 }), mk([55.03, 82.92], 'Novosibirsk', '新西伯利亚', { dot: true, t: 1.3 }), mk([52.29, 104.3], 'Irkutsk', '伊尔库茨克', { dot: true, t: 1.8 }), mk([48.48, 135.08], 'Khabarovsk', '哈巴罗夫斯克', { dot: true, t: 2.5 }), mk([43.1, 131.9], 'Vladivostok', '符拉迪沃斯托克', { dot: true, t: 2.8 })],
        body: ['Russia\'s transport relies on railways and pipelines, with Moscow as the great hub. The Trans-Siberian Railway, about 9,300 km long and finished in 1916, is the longest railway in the world: it runs from Moscow through Yekaterinburg, Novosibirsk and Irkutsk to Vladivostok, a journey of about seven days. Cities and industry grew up along it, and it carries Siberian timber, coal and metals west and Asian goods to Europe. Building in Siberia is hard because the ground is frozen most of the year, so the far north and east are still thinly settled.',
          '俄罗斯以铁路和管道运输为主，莫斯科是全国最大的交通枢纽。西伯利亚大铁路全长约 9300 千米，1916 年全线通车，是世界上最长的铁路：从莫斯科出发，经叶卡捷琳堡、新西伯利亚、伊尔库茨克，到达符拉迪沃斯托克，全程约需 7 天。铁路沿线兴起了许多城市和工业区，它把西伯利亚的木材、煤炭和金属运往西部，也把亚洲的货物运往欧洲。西伯利亚冻土广布，建设困难，北部和东部人烟仍然稀少。'],
      },
    ],
    quiz: [
      { q: ['Which mountains divide Russia into European and Asian parts?', '俄罗斯欧洲部分和亚洲部分的分界是'], options: [['The Ural Mountains', '乌拉尔山脉'], ['The Alps', '阿尔卑斯山脉'], ['The Himalayas', '喜马拉雅山脉'], ['The Rockies', '落基山脉']], answer: 0,
        why: ['The low Urals run north–south at about 60°E through western Russia.', '乌拉尔山脉大致沿东经 60° 南北延伸，位于俄罗斯西部。'] },
      { q: ['From west to east, put Russia\'s landform regions in order.', '自西向东，给俄罗斯的地形区排序。'],
        order: [['East European Plain', '东欧平原'], ['West Siberian Plain', '西西伯利亚平原'], ['Central Siberian Plateau', '中西伯利亚高原'], ['East Siberian Mountains', '东西伯利亚山地']],
        why: ['The Urals separate the two plains; the Yenisei separates the West Siberian Plain from the plateau, and the Lena the plateau from the mountains. The land rises eastwards.', '乌拉尔山脉分隔两大平原，叶尼塞河分隔西西伯利亚平原和中西伯利亚高原，勒拿河以东是山地。地势东高西低。'] },
      { q: ['Why do the Ob, Yenisei and Lena flood every spring?', '鄂毕河、叶尼塞河和勒拿河春季常发生凌汛，原因是'], options: [['Their southern upper reaches thaw before the frozen northern lower reaches', '河流自南向北流，上游先解冻，下游仍封冻'], ['Monsoon rains fall in spring', '春季季风降雨多'], ['They flow into the warm Indian Ocean', '它们流入温暖的印度洋'], ['Glaciers melt in the Alps', '阿尔卑斯山冰川融化']], answer: 0,
        why: ['Flowing from warmer south to colder north, meltwater reaches ice-blocked lower reaches and spills over.', '河流从较暖的南方流向寒冷的北方，上游融水受到下游冰坝阻挡，漫溢成灾。'] },
      { q: ['Moscow uses UTC+3 and Vladivostok uses UTC+10. When it is 12:00 in Moscow, what time is it in Vladivostok? Give the hour (0–23).', '莫斯科使用东三区时间，符拉迪沃斯托克使用东十区时间。莫斯科 12 时，符拉迪沃斯托克是几时？'], num: { answer: 19, tol: 0.1, unit: ['h', '时'] },
        why: ['Vladivostok is 7 time zones further east, so it is 7 hours later: 12 + 7 = 19:00.', '符拉迪沃斯托克比莫斯科偏东 7 个时区，时间早 7 小时：12 + 7 = 19 时。'] },
      { q: ['Which climate graph is from eastern Siberia?', '下图最可能是哪里的气候资料图？'], fig: { k: 'climo', city: 'yakutsk', blind: true }, options: [['Eastern Siberia', '西伯利亚东部'], ['Western Europe', '欧洲西部'], ['India', '印度'], ['The Middle East', '中东']], answer: 0,
        why: ['January near −40 °C, a short warm summer and little rain: a bitterly cold continental (subarctic) climate.', '1 月气温接近 −40 °C，夏季短暂温暖，降水少，是严寒的亚寒带大陆性气候。'] },
      { q: ['Which resources is Russia rich in? Pick all that apply.', '俄罗斯丰富的资源有（多选）'], options: [['Natural gas and oil', '天然气和石油'], ['Coal', '煤炭'], ['Timber', '森林（木材）'], ['Coffee', '咖啡'], ['Natural rubber', '天然橡胶']], multi: [0, 1, 2],
        why: ['Siberia holds vast gas, oil, coal and taiga forest. Coffee and rubber need a hot, wet tropical climate.', '西伯利亚有丰富的油气、煤炭和针叶林；咖啡和橡胶需要湿热的热带气候。'] },
      { q: ['Find Lake Baikal, the deepest lake on Earth.', '在地球上点出世界上最深的湖泊贝加尔湖。'], at: [53.5, 108.2], tolKm: 400,
        why: ['Baikal lies in southern Siberia, north of Mongolia; the Trans-Siberian Railway runs round its southern tip.', '贝加尔湖位于西伯利亚南部、蒙古以北，西伯利亚大铁路绕过它的南端。'] },
      { q: ['Label these Russian rivers.', '在地球上标出俄罗斯的这些河流。'],
        place: [{ text: ['Volga', '伏尔加河'], at: [52, 47], tolKm: 450 }, { text: ['Ob', '鄂毕河'], at: [63, 69], tolKm: 450 }, { text: ['Yenisei', '叶尼塞河'], at: [64, 88], tolKm: 450 }, { text: ['Lena', '勒拿河'], at: [65, 125], tolKm: 450 }],
        why: ['The Volga, in the European part, flows south into the Caspian Sea; the Ob, Yenisei and Lena cross Siberia from west to east and flow north to the Arctic Ocean.', '伏尔加河在欧洲部分，向南注入里海；鄂毕河、叶尼塞河和勒拿河自西向东排列在西伯利亚，向北注入北冰洋。'] },
    ],
  },
  {
    id: 'india', strand: 'world', tracks: ['uk', 'us', 'ib'], grade: 'g7b', unit: east, icon: 'festival', minutes: 7,
    title: ['India', '印度'],
    blurb: ['A subcontinent shaped by the Himalayas and the monsoon: rice and wheat, booming software and the world\'s largest population.', '喜马拉雅山和季风塑造的次大陆：稻麦之乡、软件大国和世界第一的人口。'],
    keys: [
      ['India fills most of the South Asian subcontinent: the Himalayas in the north, the Ganges Plain in the middle, the Deccan Plateau in the south.', '印度占据南亚次大陆的大部分：北部是喜马拉雅山脉，中部是恒河平原，南部是德干高原。'],
      ['India has a tropical monsoon climate: the wet south-west monsoon blows from June to September, and when it is unreliable, droughts and floods follow.', '印度属热带季风气候，6–9 月盛行湿润的西南季风；季风不稳定，旱涝灾害频繁。'],
      ['Rainfall is very uneven: Cherrapunji is one of the wettest places on Earth, while the Thar Desert in the north-west is dry.', '降水空间分布不均：东北部的乞拉朋齐是世界“雨极”之一，西北部的塔尔沙漠十分干旱。'],
      ['The Green Revolution made India self-sufficient in grain; crops match climate: rice in the wet east, wheat in the drier north-west.', '“绿色革命”使印度基本实现粮食自给；农作物分布与降水有关：东部湿润区种水稻，西北部较干旱区种小麦。'],
      ['India has the world\'s largest population (about 1.45 billion) and a world-class software industry centred on Bengaluru.', '印度人口约 14.5 亿，居世界第一；软件服务业发达，班加罗尔被称为“印度硅谷”。'],
    ],
    steps: [
      {
        title: ['The South Asian subcontinent', '南亚次大陆'], cam: [22, 80, 3.0], items: ['everest'],
        task: ['Turn from the Himalayas southwards: find the Ganges Plain and then the Deccan Plateau.', '从喜马拉雅山向南转动：依次找到恒河平原和德干高原。'],
        paint: [{ fill: { k: 'land', a2: ['IN'], c: C.orange }, a: 0.45 }, { fill: { k: 'poly', pts: REGIONS.himalaya, c: C.white }, t: 0.5, a: 0.7 }, { fill: { k: 'poly', pts: GANGES_PLAIN, c: C.lime, clip: ['IN', 'BD'] }, t: 0.9, a: 0.55 }, { fill: { k: 'poly', pts: DECCAN, c: C.brown, clip: ['IN'] }, t: 1.3, a: 0.55 }],
        lines: [flow(RIVERS.ganges, 1.6), { pts: [[23.44, 66], [23.44, 80], [23.44, 93]], c: C.orange, t: 1.9, rhumb: true, dur: 1.4 }],
        marks: [mk([30, 82], 'Himalayas', '喜马拉雅山脉', { c: C.white, t: 0.6 }), mk([26.5, 81], 'Ganges Plain', '恒河平原', { c: C.lime, t: 1 }), mk([17.5, 77.5], 'Deccan Plateau', '德干高原', { c: C.brown, t: 1.4 }), mk([24.5, 88.5], 'Ganges', '恒河', { c: C.blue, t: 2 }), mk([24.3, 68], 'Tropic of Cancer', '北回归线', { c: C.orange, t: 2.2 }), mk([15, 65], 'Arabian Sea', '阿拉伯海', { c: C.blue, t: 2.4 }), mk([15, 88], 'Bay of Bengal', '孟加拉湾', { c: C.blue, t: 2.5 })],
        body: ['South Asia is a great triangle of land, the "subcontinent", walled off from the rest of Asia by the Himalayas. India fills most of it: about 3.29 million km², the seventh-largest country, with the Arabian Sea to the west and the Bay of Bengal to the east. The land falls into three parts: the Himalayas in the north, the broad, fertile Ganges Plain in the middle, and the Deccan Plateau in the south. The Tropic of Cancer crosses the middle, so most of India is tropical; the 2,500 km Ganges, India\'s holy river, flows east into the Bay of Bengal.',
          '南亚是一块巨大的三角形陆地，被喜马拉雅山脉与亚洲其他部分隔开，称为“南亚次大陆”。印度占据了它的大部分，面积约 329 万平方千米，居世界第七，西临阿拉伯海，东临孟加拉湾。地形分为三部分：北部是喜马拉雅山脉，中部是广阔肥沃的恒河平原，南部是德干高原。北回归线穿过中部，大部分地区位于热带；长约 2500 千米的恒河被印度人视为“圣河”，向东注入孟加拉湾。'],
      },
      {
        title: ['The monsoon', '热带季风气候'], cam: [15, 78, 3.6], sketch: true,
        task: ['Compare the two sets of arrows: the wet south-west monsoon comes from the sea, the dry north-east monsoon from the land.', '比较两组箭头：湿润的西南季风来自海洋，干燥的东北季风来自陆地。'],
        lines: [...arrows([[[-12, 72], [-2, 64], [8, 66], [16, 72]], [[-12, 82], [-2, 76], [8, 78], [14, 80]], [[-10, 92], [-1, 86], [10, 88], [21, 90]]], C.teal, 0, 2), ...arrows([[[30, 88], [22, 82], [14, 80]], [[29, 78], [21, 74], [14, 70]]], C.orange, 1.6, 1.6), par(0, C.gold, 0.3, { w: 1 })],
        marks: [mk([3, 64], 'Jun–Sep: wet SW monsoon', '6–9 月：湿润的西南季风', { c: C.teal, t: 0.8 }), mk([26, 72], 'Oct–Feb: dry NE monsoon', '10 月–次年 2 月：干燥的东北季风', { c: C.orange, t: 2 }), mk([-9, 70], 'SE trades cross the equator', '东南信风越过赤道', { c: C.teal, t: 1.2 }), mk([19.08, 72.88], 'Mumbai', '孟买', { dot: true, t: 1 })],
        fig: { k: 'climo', city: 'mumbai' },
        body: ['India has a tropical monsoon climate with three seasons: a hot season from March to May, a rainy season from June to September, and a cool season from October to February. In summer the land heats faster than the ocean; the south-east trade winds cross the equator, turn right and become the moist south-west monsoon, which drops about 80% of the year\'s rain. In winter the dry north-east monsoon blows out from the cold heart of Asia. If the monsoon comes late or is weak, crops fail in drought; if it is too strong, the Ganges floods.',
          '印度大部分属于热带季风气候，一年分为三季：3–5 月为热季，6–9 月为雨季，10 月至次年 2 月为凉季。夏季陆地比海洋增温快，南半球的东南信风越过赤道后向右偏转，成为湿润的西南季风，带来全年约 80% 的降水。冬季，干燥的东北季风从寒冷的亚洲内陆吹来。西南季风来得晚、势力弱，就会发生旱灾；势力过强，恒河流域又易发生洪涝。'],
      },
      {
        title: ['Wettest and driest', '降水分布：多雨与干旱'], cam: [22, 80, 3.0], sketch: true,
        task: ['Find the wettest place on the map, then the driest: why is one on a mountain slope and the other far from the sea?', '找到图上最湿润和最干旱的地方：为什么一个位于山坡，另一个远离海洋？'],
        paint: [{ fill: { k: 'poly', pts: THAR, c: C.gold, clip: ['IN', 'PK'] }, t: 0.6, a: 0.6 }, { fill: { k: 'poly', pts: [[26.5, 89.8], [26.5, 92.5], [25.1, 92.5], [25.1, 89.8]], c: C.teal }, t: 0.3, a: 0.65 }],
        lines: [{ pts: W_GHATS, c: C.brown, t: 0.9, w: 2.4, dur: 1.2 }, ...arrows([[[13, 66], [15.5, 72]], [[18, 66], [19.5, 72]], [[16, 86], [24, 91]]], C.teal, 1.2, 1.6)],
        marks: [mk([25.3, 91.7], 'Cherrapunji ≈11,000 mm', '乞拉朋齐 约 11000 毫米', { dot: true, c: C.teal, big: true, t: 0.4 }), mk([26.9, 70.9], 'Thar Desert <250 mm', '塔尔沙漠 不足 250 毫米', { c: C.gold, t: 0.8 }), mk([15, 74.5], 'Western Ghats', '西高止山脉', { c: C.brown, t: 1.2 }), mk([17.5, 77.5], 'Deccan: rain shadow', '德干高原：背风坡少雨', { c: C.brown, t: 1.6 })],
        fig: { k: 'bars', title: ['Annual rainfall (approx.)', '年降水量（约）'], unit: ['mm', '毫米'], rows: [
          { name: ['Cherrapunji', '乞拉朋齐'], v: 11000, c: C.teal }, { name: ['Mumbai', '孟买'], v: 2200, c: C.blue }, { name: ['Kolkata', '加尔各答'], v: 1600, c: C.blue }, { name: ['New Delhi', '新德里'], v: 770, c: C.lime }, { name: ['Jaisalmer (Thar)', '杰伊瑟尔梅尔（塔尔沙漠）'], v: 200, c: C.gold },
        ] },
        body: ['The monsoon does not rain evenly. Where moist winds meet a mountain, the air rises, cools and pours: Cherrapunji, on the south-facing slope of the Khasi Hills above the Bay of Bengal, gets about 11,000 mm a year, among the most on Earth, and the west-facing Western Ghats catch heavy rain too. Behind the Ghats the Deccan lies in a rain shadow. Rainfall falls from east to west across the Ganges Plain, and the Thar Desert in the north-west, far from the monsoon\'s path, gets less than 250 mm.',
          '季风降水在空间上分布很不均匀。湿润气流遇到山地被迫抬升，冷却后形成大量降水：位于卡西山南坡、面迎孟加拉湾气流的乞拉朋齐，年降水量约 11000 毫米，是世界上降水最多的地方之一；西高止山脉西坡迎着西南季风，降水也很丰富。山脉东侧的德干高原处于背风坡，降水较少。恒河平原的降水自东向西减少，西北部的塔尔沙漠远离季风的来向，年降水量不足 250 毫米。'],
      },
      {
        title: ['The Green Revolution', '绿色革命'], cam: [26, 79, 2.6], items: ['goldentemple'],
        paint: [{ fill: { k: 'land', a2: ['IN'], c: C.orange }, a: 0.25 }, { fill: { k: 'poly', pts: [[32.5, 74], [31.5, 77], [29.5, 77.5], [28.5, 76.5], [29.5, 73.5], [30.5, 73.5]], c: C.green }, t: 0.4, a: 0.7 }],
        marks: [mk([30.8, 75.5], 'Punjab & Haryana: wheat bowl', '旁遮普、哈里亚纳：小麦产区', { dot: true, c: C.green, t: 0.8 }), mk([31.62, 74.88], 'Amritsar', '阿姆利则', { dot: true, t: 1.2 })],
        fig: { k: 'line', title: ['India\'s grain harvest (approx.)', '印度粮食产量（约）'], unit: ['million tonnes', '百万吨'], x: [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020], series: [{ name: ['Grain', '粮食'], c: C.green, y: [51, 82, 108, 130, 176, 197, 245, 310] }], notes: [{ x: 1966, text: ['Green Revolution', '绿色革命'] }], min: 0 },
        body: ['In the 1960s India\'s population grew faster than its harvests, and it depended on imported grain. From 1966, in the "Green Revolution", farmers planted high-yield varieties of wheat and rice and used far more irrigation, chemical fertiliser and machinery, first in Punjab and Haryana. Grain output rose from about 82 million tonnes in 1960 to over 300 million tonnes today, and India became self-sufficient and is now the world\'s largest rice exporter. The costs are falling groundwater, tired soils and many small farmers who still depend on the monsoon.',
          '20 世纪 60 年代，印度人口增长快于粮食增长，需要进口粮食。从 1966 年起，印度开展“绿色革命”，首先在旁遮普和哈里亚纳推广小麦和水稻的高产品种，扩大灌溉，增施化肥，发展农业机械。粮食产量从 1960 年的约 8200 万吨增长到如今的 3 亿多吨，基本实现了粮食自给，印度现在是世界上最大的大米出口国。但地下水位下降、土壤肥力减退等问题随之出现，许多小农仍然“靠天吃饭”。'],
      },
      {
        title: ['Crops follow the rain', '农作物的分布'], cam: [22, 81, 3.0], sketch: true, items: ['pl_tea'],
        task: ['Compare the crop map with the rainfall map: which crops grow where it is wettest?', '把农作物分布与降水分布对照：哪些作物分布在最湿润的地区？'],
        paint: [
          { fill: { k: 'poly', pts: [[27.5, 82], [26.5, 88], [22, 89], [20, 86.5], [22, 84], [25, 82]], c: C.lime, clip: ['IN', 'BD'] }, t: 0.2, a: 0.55 },
          { fill: { k: 'poly', pts: [[13, 74.5], [8.2, 76.8], [10, 79.8], [16, 81], [13, 80]], c: C.lime, clip: ['IN'] }, t: 0.3, a: 0.5 },
          { fill: { k: 'poly', pts: [[32, 74], [30, 78.5], [27, 80], [26, 77], [28.5, 74], [30.5, 73]], c: C.gold, clip: ['IN'] }, t: 0.6, a: 0.6 },
          { fill: { k: 'poly', pts: [[23, 70], [23, 77], [19, 78.5], [17, 76], [19, 73.5], [21, 72.5]], c: C.white, clip: ['IN'] }, t: 0.9, a: 0.55 },
          { fill: { k: 'poly', pts: [[27.5, 89.5], [27.5, 95.5], [26, 95.5], [26, 89.5]], c: C.green, clip: ['IN'] }, t: 1.2, a: 0.65 },
          { fill: { k: 'poly', pts: [[26, 88], [26, 90.5], [22, 90.5], [22, 88]], c: C.brown, clip: ['IN', 'BD'] }, t: 1.5, a: 0.6 },
        ],
        fig: { k: 'key', set: 'custom', title: ['Main crops of India (sketch)', '印度主要农作物分布（示意）'], items: [
          { c: C.lime, name: ['Rice: wet Ganges lowlands and coasts', '水稻：湿润的恒河中下游和沿海平原'] }, { c: C.gold, name: ['Wheat: drier north-west, irrigated', '小麦：较干旱的西北部（灌溉）'] },
          { c: C.white, name: ['Cotton: Deccan black soils', '棉花：德干高原西北部黑土区'] }, { c: C.green, name: ['Tea: Assam hills', '茶叶：东北部阿萨姆丘陵'] }, { c: C.brown, name: ['Jute: Ganges delta', '黄麻：恒河三角洲'] },
        ] },
        body: ['Farming employs about 45% of India\'s workers, and crops follow the rain. Rice, which needs plenty of water, grows in the wet middle and lower Ganges and on the coastal plains; wheat grows in the drier north-west, watered by canals and wells. Cotton grows on the black, moisture-holding soils of the north-west Deccan, jute in the hot, wet Ganges delta, and tea on the rainy hills of Assam and Darjeeling. India is the world\'s largest producer of milk and jute and second in rice, wheat and tea.',
          '印度约 45% 的劳动力从事农业，农作物分布与降水关系密切。需水多的水稻分布在降水丰富的恒河中下游和沿海平原；小麦分布在较干旱的西北部，依靠水渠和水井灌溉。棉花分布在德干高原西北部保水性好的黑色土地区，黄麻分布在湿热的恒河三角洲，茶叶分布在多雨的阿萨姆和大吉岭丘陵。印度的牛奶和黄麻产量居世界第一，水稻、小麦和茶叶产量居世界第二。'],
      },
      {
        title: ['The world\'s largest population', '人口第一大国'], cam: [22, 80, 3.0], items: ['taj'],
        marks: [mk([28.6, 77.2], 'New Delhi', '新德里', { dot: true, big: true, t: 0.4 }), mk([19.08, 72.88], 'Mumbai', '孟买', { dot: true, t: 0.7 }), mk([22.57, 88.36], 'Kolkata', '加尔各答', { dot: true, t: 1 }), mk([13.08, 80.27], 'Chennai', '金奈', { dot: true, t: 1.2 }), mk([27.17, 78.04], 'Agra: Taj Mahal', '阿格拉：泰姬陵', { t: 1.4 })],
        fig: { k: 'pyramid', a: 'india', b: 'china' },
        body: ['In 2023 India passed China to become the most populous country; it now has about 1.45 billion people, around 440 per km², and the densest areas are the Ganges Plain and the coasts. India\'s population pyramid has a wide base: about a quarter of Indians are under 15, so the population is still growing, although families are now much smaller than in 1960. A huge young workforce can drive growth, but it needs jobs, schools, housing and food. India was the first country to start a national family-planning programme, in 1952.',
          '2023 年，印度人口超过中国，居世界第一，现约 14.5 亿，人口密度约每平方千米 440 人，恒河平原和沿海地区最稠密。印度的人口金字塔底部宽，15 岁以下的人约占四分之一，人口仍在增长，不过家庭规模已比 1960 年小得多。众多年轻劳动力有利于经济发展，但也给就业、教育、住房和粮食带来很大压力。印度是世界上最早（1952 年）推行全国性计划生育的国家。'],
      },
      {
        title: ['India\'s Silicon Valley', '“印度硅谷”'], cam: [18, 40, 4.6],
        lines: [{ pts: [[12.97, 77.59], [25, 60], [40, 20], [45, -40], [40.7, -74]], c: C.violet, t: 0.6, w: 1.4, flow: true, arrow: true, dur: 2.4 }, { pts: [[12.97, 77.59], [30, 50], [51.5, -0.1]], c: C.violet, t: 1.0, w: 1.4, flow: true, arrow: true, dur: 2 }],
        marks: [mk([12.97, 77.59], 'Bengaluru', '班加罗尔', { dot: true, big: true, c: C.violet, t: 0.3 }), mk([17.4, 78.5], 'Hyderabad', '海得拉巴', { dot: true, t: 0.8 }), mk([18.52, 73.86], 'Pune', '浦那', { dot: true, t: 1.0 }), mk([40.7, -74], 'USA', '美国', { t: 1.8 }), mk([51.5, -0.1], 'Europe', '欧洲', { t: 2.0 })],
        body: ['Bengaluru, on the Deccan Plateau at about 900 m with a mild climate, is called India\'s Silicon Valley, and Hyderabad, Pune and Chennai are other IT hubs. India turns out over a million engineering graduates a year, many speak English, and wages are lower than in the West. India\'s working day falls during America\'s night, so work can be handed back and forth round the clock, and government tech parks helped. Software and IT services now earn India about 200 billion US dollars a year in exports, mainly from the USA and Europe.',
          '班加罗尔位于德干高原上，海拔约 900 米，气候宜人，被称为“印度硅谷”；海得拉巴、浦那、金奈等也是信息技术产业中心。印度每年培养 100 多万名工科毕业生，许多人会说英语，劳动力成本比欧美低；印度的白天正是美国的夜晚，工作可以昼夜衔接；政府还建设了软件园区。如今软件和信息技术服务每年为印度带来约 2000 亿美元的出口收入，主要客户在美国和欧洲。'],
      },
    ],
    quiz: [
      { q: ['Which climate graph is from India?', '下图最可能是哪里的气候资料图？'], fig: { k: 'climo', city: 'mumbai', blind: true }, options: [['India: tropical monsoon', '印度：热带季风气候'], ['London: maritime', '伦敦：温带海洋性气候'], ['Cairo: desert', '开罗：热带沙漠气候'], ['Moscow: continental', '莫斯科：温带大陆性气候']], answer: 0,
        why: ['Hot all year, with almost all the rain from June to September and a long dry season: tropical monsoon.', '全年高温，降水集中在 6–9 月，旱季漫长，是热带季风气候。'] },
      { q: ['Starting in March, put India\'s three seasons in order.', '从 3 月开始，给印度的三个季节排序。'],
        order: [['Hot season', '热季'], ['Rainy season', '雨季'], ['Cool season', '凉季']],
        why: ['March–May is hot and dry before the rains; the south-west monsoon brings rain from June to September; October–February is cool and dry under the north-east monsoon.', '3–5 月是雨季前的热季；6–9 月西南季风带来雨季；10 月至次年 2 月吹东北季风，是凉季。'] },
      { q: ['Cherrapunji gets about 11,000 mm of rain a year, but the Thar Desert less than 250 mm. What best explains Cherrapunji\'s rain?', '乞拉朋齐年降水量约 11000 毫米，而塔尔沙漠不足 250 毫米。乞拉朋齐多雨的主要原因是'], options: [['It is on a slope facing the moist south-west monsoon from the Bay of Bengal', '位于山地迎风坡，面迎来自孟加拉湾的湿润西南季风'], ['It is on the equator', '位于赤道上'], ['A cold ocean current flows past it', '有寒流经过'], ['It is far from the sea', '深居内陆，远离海洋']], answer: 0,
        why: ['Moist air forced up the hills cools and rains (relief rain). The Thar lies far from the monsoon\'s path, in the north-west.', '湿润气流沿山坡抬升，冷却后形成地形雨；塔尔沙漠位于西北部，远离季风来向。'] },
      { q: ['Match each crop to where it mainly grows in India.', '把印度的农作物和主要分布区连起来。'],
        match: [[['Wheat', '小麦'], ['Irrigated, drier north-west', '较干旱、有灌溉的西北部']], [['Rice', '水稻'], ['Wet middle and lower Ganges', '湿润的恒河中下游']], [['Cotton', '棉花'], ['Black soils of the north-west Deccan', '德干高原西北部黑土区']], [['Tea', '茶叶'], ['Rainy hills of Assam', '多雨的阿萨姆丘陵']]],
        why: ['Each crop follows water and soil: rice needs the most water, wheat tolerates drier land with irrigation, cotton suits the black soils, tea needs rainy, well-drained slopes.', '农作物分布与水、土条件相适应：水稻需水最多，小麦较耐旱，棉花适宜黑土，茶树喜多雨、排水良好的山坡。'] },
      { q: ['Which conditions helped India\'s software industry grow? Pick all that apply.', '印度软件业迅速发展的有利条件有（多选）'], options: [['Many English-speaking engineers', '大量会说英语的工程技术人才'], ['Lower labour costs', '劳动力成本较低'], ['A time difference with the USA, so work goes on round the clock', '与美国有时差，可以昼夜衔接工作'], ['Large oil reserves', '石油资源丰富'], ['A cold climate', '气候寒冷']], multi: [0, 1, 2],
        why: ['Software needs skilled, educated people and fast links, not raw materials; the time difference lets Indian teams work while America sleeps.', '软件业依靠的是人才和通信，而不是原料；时差使印度团队可以在美国的夜晚继续工作。'] },
      { q: ['India has about 1.45 billion people on 3.29 million km². Roughly how many people per km² is that?', '印度人口约 14.5 亿，面积约 329 万平方千米。人口密度约为每平方千米多少人？'], num: { answer: 440, tol: 15, unit: ['people/km²', '人/平方千米'] },
        why: ['Density = population ÷ area = 1,450,000,000 ÷ 3,290,000 ≈ 440 people per km², over three times China\'s (about 147).', '人口密度 = 人口 ÷ 面积 = 14.5 亿 ÷ 329 万 ≈ 440 人/平方千米，是中国（约 147）的三倍多。'] },
      { q: ['Find Bengaluru, India\'s Silicon Valley.', '在地球上点出“印度硅谷”班加罗尔。'], at: [12.97, 77.59], tolKm: 400,
        why: ['It is on the Deccan Plateau in southern India, about 900 m above sea level.', '它位于印度南部的德干高原上，海拔约 900 米。'] },
      { q: ['Label these places in India.', '在地球上标出印度的这些地方。'],
        place: [{ text: ['New Delhi', '新德里'], at: [28.6, 77.2], tolKm: 400 }, { text: ['Mumbai', '孟买'], at: [19.08, 72.88], tolKm: 400 }, { text: ['Kolkata', '加尔各答'], at: [22.57, 88.36], tolKm: 400 }, { text: ['Thar Desert', '塔尔沙漠'], at: [26.9, 70.9], tolKm: 450 }],
        why: ['New Delhi, the capital, is on the Ganges Plain; Mumbai is the great west-coast port; Kolkata is in the Ganges delta in the east; the Thar Desert is in the dry north-west.', '首都新德里在恒河平原上；孟买是西海岸的大港口；加尔各答在东部的恒河三角洲；塔尔沙漠在干旱的西北部。'] },
    ],
  },
  {
    id: 'usa', strand: 'world', tracks: ['us'], grade: 'g7b', unit: west, icon: 'flag', minutes: 7,
    title: ['The United States', '美国'],
    blurb: ['A nation of immigrants on a land of mountains and plains, with farm belts, old industrial cities and high-tech valleys.', '移民国家：西部山地、中部平原、东部山地，农业地区专业化，高新技术产业发达。'],
    keys: [
      ['The USA is a nation of immigrants: Native Americans first, then Europeans, Africans, Latin Americans and Asians.', '美国是一个移民国家：印第安人是原住民，后来欧洲人、非洲人、拉美人和亚洲人陆续迁入。'],
      ['Landforms run north–south: high western mountains, the central plains drained by the Mississippi, the lower Appalachians in the east.', '地形南北纵列：西部是高大山地，中部是平原（密西西比河流经），东部是低缓的阿巴拉契亚山脉。'],
      ['Most of the USA is temperate; the open central plains let cold Arctic air and warm Gulf air meet, bringing cold waves and tornadoes.', '美国大部分位于温带；中部平原南北贯通，北方冷空气与墨西哥湾暖湿气流交汇，多寒潮和龙卷风。'],
      ['Farming is large-scale, mechanised and specialised in belts: dairy, corn, wheat, cotton.', '农业规模大、机械化水平高，形成了乳畜带、玉米带、小麦区、棉花带等专业化农业带。'],
      ['Industry grew first in the north-east; high-tech industry now leads in the Sun Belt and Silicon Valley.', '工业最早在东北部发展，如今高新技术产业在南部、西部的“阳光地带”和“硅谷”蓬勃发展。'],
    ],
    steps: [
      {
        title: ['A nation of immigrants', '移民国家'], cam: [35, -50, 4.6], items: ['liberty'],
        paint: [{ fill: { k: 'land', a2: ['US'], c: C.blue }, a: 0.4 }],
        lines: [route([[50, -5], [45, -40], [40.7, -74]], 0.4, C.gold), route([[10, -15], [20, -45], [32.8, -79.9]], 0.8, C.orange), route([[19.4, -99.1], [29.4, -98.5]], 1.2, C.green)],
        marks: [mk([40.69, -74.04], 'Statue of Liberty', '自由女神像', { dot: true, t: 0.3 }), mk([47, -30], 'from Europe', '来自欧洲', { c: C.gold, t: 1.4 }), mk([16, -38], 'from Africa', '来自非洲', { c: C.orange, t: 1.8 }), mk([24, -102], 'from Latin America', '来自拉丁美洲', { c: C.green, t: 2.0 })],
        fig: { k: 'pie', title: ['Americans by origin, 2020 census (approx.)', '2020 年美国居民构成（约）'], parts: [
          { name: ['White (European origin)', '白人（欧洲裔）'], v: 58, c: C.gold }, { name: ['Hispanic / Latino', '拉美裔'], v: 19, c: C.green },
          { name: ['Black (African origin)', '黑人（非洲裔）'], v: 12, c: C.orange }, { name: ['Asian', '亚裔'], v: 6, c: C.pink }, { name: ['Native & other', '印第安人及其他'], v: 5, c: C.violet },
        ] },
        body: ['About 340 million people live in the USA, the third-largest population in the world. Native Americans lived here first; from the 1600s came Europeans, and about 400,000 Africans were shipped here as slaves. Later waves came from Latin America and Asia, and about 1 in 7 Americans today was born abroad. That mix is why the USA is called a nation of immigrants, a "melting pot", and why English, Spanish and many other languages are spoken.',
          '美国约有 3.4 亿人，人口居世界第三。印第安人是这里的原住民；17 世纪起欧洲移民大批到来，约 40 万非洲黑人被贩卖到这里成为奴隶；后来拉美和亚洲移民又不断迁入，如今约每 7 个美国人中就有 1 人出生在国外。因此美国被称为“移民国家”“民族大熔炉”，通用英语，西班牙语等多种语言也很常见。'],
      },
      {
        title: ['Mountains, plains, mountains', '西部山地、中部平原、东部山地'], cam: [39, -98, 3.2], sketch: true, items: ['grandcanyon', 'gatewayarch'],
        task: ['Turn the globe from west to east across the USA: the Rockies, the Central Plains, then the Appalachians.', '从西向东转动美国：依次是落基山脉、中部平原和阿巴拉契亚山脉。'],
        paint: [{ fill: { k: 'poly', pts: US_WEST, c: C.brown, clip: ['US'] }, t: 0.2, a: 0.55 }, { fill: { k: 'poly', pts: US_PLAINS, c: C.lime, clip: ['US'] }, t: 0.6, a: 0.45 }, { fill: { k: 'poly', pts: US_EAST, c: C.orange, clip: ['US'] }, t: 1.0, a: 0.5 }],
        lines: [{ pts: ROCKIES, c: C.brown, t: 0.3, w: 2.2, dur: 1.4 }, { pts: APPALACHIANS, c: C.orange, t: 1.1, w: 2, dur: 1.2 }, flow(MISSOURI, 1.5), flow(MISSISSIPPI, 1.8)],
        marks: [mk([41, -110], 'Rocky Mountains', '落基山脉', { c: C.brown, t: 0.8 }), mk([40, -98], 'Central Plains', '中部平原', { c: C.lime, t: 1.2 }), mk([38, -79.5], 'Appalachians', '阿巴拉契亚山脉', { c: C.orange, t: 1.5 }), mk([33, -91.5], 'Mississippi', '密西西比河', { c: C.blue, t: 2.4 }), mk([45, -84], 'Great Lakes', '五大湖', { c: C.blue, t: 2.6 })],
        body: ['The land falls into three north–south strips. In the west are high, young mountains and plateaus such as the Rockies, over 4,000 m, with the Grand Canyon cut into the Colorado Plateau. In the middle is a vast plain, and in the east the lower, older Appalachians. The Mississippi, about 3,770 km long, and its tributary the Missouri drain the plain south into the Gulf of Mexico; together they form one of the longest river systems on Earth. On the Canadian border lie the Great Lakes, the largest group of freshwater lakes in the world.',
          '美国地形大致分为南北延伸的三部分：西部是高大年轻的山地和高原，如海拔 4000 米以上的落基山脉，科罗拉多高原上还有大峡谷；中部是广阔的平原；东部是较低缓、古老的阿巴拉契亚山脉。密西西比河长约 3770 千米，与支流密苏里河一起流经中部平原，向南注入墨西哥湾，组成世界上最长的水系之一。美国和加拿大交界处的五大湖是世界上最大的淡水湖群。'],
      },
      {
        title: ['Climate and wild weather', '气候与灾害性天气'], cam: [38, -96, 3.2], sketch: true,
        task: ['Follow the blue arrows south and the orange arrows north: where do the two air masses meet?', '沿蓝色箭头向南、橙色箭头向北：两股气流在哪里相遇？'],
        paint: [{ fill: { k: 'climate', only: ['continental', 'maritime', 'med', 'desert', 'smonsoon', 'highland'] }, a: 0.4 }, { fill: { k: 'poly', pts: TORNADO, c: C.red, clip: ['US'] }, t: 1.6, a: 0.45 }],
        lines: [...arrows([[[55, -100], [46, -98], [36, -96]], [[55, -90], [45, -89], [36, -88]]], C.ice, 0.4, 2), ...arrows([[[24, -92], [31, -94], [37, -96]], [[25, -86], [32, -87], [37, -88]]], C.orange, 0.9, 2)],
        marks: [mk([52, -96], 'Cold Arctic air', '北冰洋冷空气', { c: C.ice, t: 0.6 }), mk([25, -90], 'Warm, moist Gulf air', '墨西哥湾暖湿气流', { c: C.orange, t: 1.1 }), mk([36, -98.5], 'Tornado Alley', '“龙卷风走廊”', { c: C.red, big: true, t: 1.8 }), mk([40.7, -74], 'New York', '纽约', { dot: true, t: 2.1 })],
        fig: { k: 'climo', city: 'newyork' },
        body: ['Most of the USA lies between 25°N and 49°N, in the temperate zone, so it has four clear seasons. The interior has a continental climate with hot summers and cold winters; the south-east is warm and wet, the Pacific north-west mild and rainy, California Mediterranean, and the south-west desert. Because the central plains are open from north to south, cold Arctic air can rush south and warm, moist Gulf air north. Where they meet, the USA gets about 1,200 tornadoes a year, more than any other country, and the Gulf and Atlantic coasts are hit by hurricanes.',
          '美国本土大部分位于北纬 25°–49° 之间，地处温带，四季分明。内陆以温带大陆性气候为主，夏热冬冷；东南部温暖湿润，西北部太平洋沿岸温和多雨，加利福尼亚为地中海气候，西南部有沙漠。中部平原南北贯通，北冰洋冷空气可以长驱南下，墨西哥湾暖湿气流可以北上。冷暖空气交汇，使美国每年发生约 1200 次龙卷风，居世界之首；墨西哥湾和大西洋沿岸还常受飓风袭击。'],
      },
      {
        title: ['Farm belts', '农业地区专业化'], cam: [39, -95, 3.0], sketch: true, items: ['an_bison'],
        task: ['Match the colours to the key: find the corn belt, then the wheat to its west and the cotton belt to its south.', '对照图例：先找到玉米带，再找到它西边的小麦区和南边的棉花带。'],
        paint: [
          { fill: { k: 'poly', pts: DAIRY, c: C.white }, t: 0.2, a: 0.55 }, { fill: { k: 'poly', pts: CORN, c: C.gold }, t: 0.5, a: 0.6 },
          { fill: { k: 'poly', pts: WHEAT_S, c: C.brown }, t: 0.8, a: 0.6 }, { fill: { k: 'poly', pts: WHEAT_W, c: C.orange }, t: 1.0, a: 0.6 },
          { fill: { k: 'poly', pts: COTTON, c: C.pink, clip: ['US'] }, t: 1.2, a: 0.55 },
        ],
        fig: { k: 'key', set: 'custom', title: ['US farm belts (sketch)', '美国农业带（示意）'], items: [
          { c: C.white, name: ['Dairy belt', '乳畜带'] }, { c: C.gold, name: ['Corn belt', '玉米带'] }, { c: C.brown, name: ['Spring wheat', '春小麦区'] },
          { c: C.orange, name: ['Winter wheat', '冬小麦区'] }, { c: C.pink, name: ['Cotton belt', '棉花带'] },
        ] },
        body: ['Each region of the USA specialises in what its climate and soil suit best. Around the cool, wet Great Lakes, where summers are too short for much grain, grass feeds dairy cows near big city markets. South of them the warm, wet Midwest is the corn belt, and corn is fed to cattle and pigs. Further west, the drier Great Plains grow wheat: spring wheat in the cold north, winter wheat in Kansas. The hot, sunny South is the cotton belt, and the irrigated valleys of California grow fruit and vegetables.',
          '美国各地按照自然条件进行专业化生产，形成了不同的农业带。五大湖附近气候冷湿，生长期短，适宜种植牧草，又靠近城市市场，形成乳畜带；它的南面，中部平原温暖湿润，是玉米带，玉米多用来饲养牛和猪；再往西，较干旱的大平原种植小麦：北部寒冷，种春小麦，堪萨斯一带种冬小麦；南部炎热、光照充足，是棉花带。加利福尼亚的灌溉谷地出产水果和蔬菜。'],
      },
      {
        title: ['Few farmers, huge harvests', '世界农业大国'], cam: [40, -96, 3.0],
        paint: [{ fill: { k: 'poly', pts: CORN, c: C.gold }, a: 0.5 }],
        lines: [{ pts: [[29.95, -90.1], [25, -88], [10, -60], [0, -20], [-5, 20], [10, 60], [5, 95], [22, 120]], c: C.gold, t: 0.6, w: 1.4, flow: true, arrow: true, dur: 2.6 }, { pts: [[46.2, -123.8], [45, -150], [38, 175], [35, 140]], c: C.gold, t: 1.0, w: 1.4, flow: true, arrow: true, dur: 2 }],
        marks: [mk([41.6, -93.6], 'Iowa: corn & soybeans', '艾奥瓦：玉米和大豆', { dot: true, c: C.gold, t: 0.4 }), mk([29.95, -90.1], 'New Orleans: grain port', '新奥尔良：粮食出口港', { dot: true, t: 0.8 }), mk([46.2, -123.8], 'Columbia River ports', '哥伦比亚河港口', { dot: true, t: 1.1 })],
        fig: { k: 'bars', title: ['US share of world output, 2023 (approx.)', '2023 年美国产量占世界的比重（约）'], unit: ['%', '%'], rows: [
          { name: ['Corn', '玉米'], v: 31, c: C.gold }, { name: ['Soybeans', '大豆'], v: 28, c: C.lime }, { name: ['Beef', '牛肉'], v: 21, c: C.red }, { name: ['Cotton', '棉花'], v: 10, c: C.pink }, { name: ['Wheat', '小麦'], v: 6, c: C.brown },
        ] },
        body: ['American farms average about 190 hectares, and big ones run to thousands, worked by combine harvesters, GPS-guided tractors and even drones. Fewer than 2 in 100 American workers farm, yet the USA grows about a third of the world\'s corn and over a quarter of its soybeans. Barges carry grain down the Mississippi to New Orleans, and ships take it to Asia, so the USA is one of the world\'s biggest food exporters. Science, machines and specialisation make each farmer extremely productive.',
          '美国农场平均面积约 190 公顷，大农场可达数千公顷，使用联合收割机、卫星导航拖拉机甚至无人机作业。务农人口不到总劳动力的 2%，美国却生产了全世界约三分之一的玉米和四分之一以上的大豆。驳船沿密西西比河把粮食运到新奥尔良，再装船运往亚洲等地，美国是世界上最大的农产品出口国之一。科技、机械化和专业化使美国农业劳动生产率非常高。'],
      },
      {
        title: ['The north-east industrial belt', '东北部工业区'], cam: [41, -80, 2.6], items: ['empire'],
        paint: [{ fill: { k: 'poly', pts: [[44, -93], [43.5, -76], [42.5, -71], [39, -74], [38.8, -77], [39.5, -88], [41.5, -91]], c: C.violet, clip: ['US'] }, t: 0.3, a: 0.45 }],
        marks: [mk([40.7, -74], 'New York', '纽约', { dot: true, big: true, t: 0.4 }), mk([41.88, -87.63], 'Chicago', '芝加哥', { dot: true, t: 0.7 }), mk([42.33, -83.05], 'Detroit: cars', '底特律：汽车', { dot: true, t: 1.0 }), mk([40.44, -80.0], 'Pittsburgh: steel', '匹兹堡：钢铁', { dot: true, t: 1.3 }), mk([38.0, -82], 'Appalachian coal', '阿巴拉契亚煤田', { c: C.brown, t: 1.6 }), mk([47, -92], 'Lake Superior iron ore', '苏必利尔湖铁矿', { c: C.red, t: 1.8 })],
        body: ['American heavy industry grew up from the late 1800s between the Great Lakes and the Atlantic coast. Coal from the Appalachians and iron ore from around Lake Superior met cheaply by lake and rail, so Pittsburgh made steel, Detroit made cars and Chicago became the hub of railways and meat-packing. New York grew into the biggest city and the world\'s leading financial centre. From the 1970s many old factories closed and the area was nicknamed the "Rust Belt", but it is still the USA\'s most crowded and wealthy region.',
          '19 世纪后期起，美国的重工业在五大湖沿岸到大西洋沿岸之间发展起来。阿巴拉契亚山区的煤和苏必利尔湖附近的铁矿通过湖运和铁路廉价汇集，匹兹堡发展成钢铁城，底特律成为“汽车城”，芝加哥成为铁路枢纽和肉类加工中心。纽约发展为美国最大的城市和世界金融中心。20 世纪 70 年代后许多老工厂关闭，这里被称为“铁锈地带”，但它仍是美国人口最稠密、经济最发达的地区之一。'],
      },
      {
        title: ['The Sun Belt and Silicon Valley', '“阳光地带”与“硅谷”'], cam: [36, -105, 3.4], items: ['goldengate', 'sp_ksc'],
        paint: [{ fill: { k: 'poly', pts: [[37, -125], [37, -76], [33, -76], [25, -81], [26, -97], [32, -117]], c: C.gold, clip: ['US'] }, t: 0.6, a: 0.3 }],
        lines: [...arrows([[[41, -80], [35, -90]], [[42, -86], [36, -105]]], C.violet, 0.9, 1.6)],
        marks: [mk([37.4, -122.1], 'Silicon Valley', '硅谷', { dot: true, big: true, c: C.gold, t: 0.3 }), mk([31, -100], 'Sun Belt', '“阳光地带”', { c: C.gold, big: true, t: 0.8 }), mk([29.7, -95.4], 'Houston: oil & space', '休斯敦：石油、航天', { dot: true, t: 1.3 }), mk([47.6, -122.3], 'Seattle: aircraft, software', '西雅图：飞机、软件', { dot: true, t: 1.5 }), mk([34.05, -118.25], 'Los Angeles', '洛杉矶', { dot: true, t: 1.7 })],
        body: ['Since the 1970s industry and people have moved south and west to the "Sun Belt", with its warm climate, open land, oil and gas, and lower costs. New high-tech industries such as computers, chips, aircraft, space and biotechnology lead there: Houston has oil and NASA\'s mission control, Seattle builds aircraft and software, and Los Angeles makes films. Silicon Valley, south of San Francisco, grew around Stanford University: top universities, skilled people from all over the world, venture capital and a pleasant climate made it home to Apple, Google and Nvidia, the world\'s leading tech cluster.',
          '20 世纪 70 年代以来，美国的工业和人口向南部和西部的“阳光地带”转移，那里气候温暖、土地宽广、油气丰富、成本较低。电子、芯片、航空航天、生物技术等高新技术产业在那里蓬勃发展：休斯敦有石油工业和航天中心，西雅图生产飞机和软件，洛杉矶有电影业。旧金山以南的“硅谷”依托斯坦福大学兴起：名校云集、各国人才汇聚、风险投资充足、气候宜人，苹果、谷歌、英伟达等企业总部都在这里，是世界领先的高新技术产业中心。'],
      },
    ],
    quiz: [
      { q: ['From west to east, put these US landforms in order.', '从西向东，给美国的地形区排序。'],
        order: [['Rocky Mountains', '落基山脉'], ['Central Plains', '中部平原'], ['Appalachian Mountains', '阿巴拉契亚山脉']],
        why: ['High, young mountains in the west, a vast plain in the middle, and the lower, older Appalachians in the east.', '西部是高大年轻的山地，中部是广阔的平原，东部是低缓古老的阿巴拉契亚山脉。'] },
      { q: ['Why does the USA have so many cold waves and tornadoes?', '美国寒潮和龙卷风多发，主要原因是'], options: [['The central plains are open north–south, so Arctic and Gulf air meet', '中部平原南北贯通，北冰洋冷空气和墨西哥湾暖湿气流易交汇'], ['It is on the equator', '位于赤道上'], ['The Rockies block all cold air', '落基山脉阻挡了冷空气'], ['It has no seas nearby', '周围没有海洋']], answer: 0,
        why: ['With no east–west mountains in the middle, cold and warm air sweep across the plains and clash, forming violent storms.', '中部没有东西走向的山脉阻挡，冷暖空气长驱直入，在平原上交汇，形成强烈的对流天气。'] },
      { q: ['Why does the corn belt lie in the Midwest?', '美国玉米带分布在中部的主要原因是'], options: [['Flat land, fertile soil, warm wet summers', '地势平坦、土壤肥沃、夏季温暖湿润'], ['It is a desert', '那里是沙漠'], ['It is very mountainous', '那里山地多'], ['It is very cold all year', '全年寒冷']], answer: 0,
        why: ['Farming belts match natural conditions: that is specialisation.', '农业带与自然条件相适应，这就是农业地区专业化。'] },
      { q: ['Match each US farm belt to where it is found.', '把美国的农业带和它的分布地区连起来。'],
        match: [[['Dairy belt', '乳畜带'], ['Near the cool Great Lakes', '五大湖附近，气候冷湿']], [['Corn belt', '玉米带'], ['The warm, wet Midwest', '中部温暖湿润的平原']], [['Wheat', '小麦区'], ['The drier Great Plains', '较干旱的大平原']], [['Cotton belt', '棉花带'], ['The hot South', '炎热的南部']]],
        why: ['Each belt grows what its climate and soil suit best: grass for cows where it is cool, corn where it is warm and wet, wheat where it is drier, cotton where it is hot.', '各农业带因地制宜：冷湿处种牧草养奶牛，温暖湿润处种玉米，较干旱处种小麦，炎热处种棉花。'] },
      { q: ['In 2023 the USA grew about 389 million tonnes of corn, and the world about 1,230 million tonnes. What percentage of the world\'s corn was American?', '2023 年美国玉米产量约 3.89 亿吨，世界约 12.3 亿吨。美国约占世界的百分之几？'], num: { answer: 32, tol: 1.5, unit: ['%', '%'] },
        why: ['389 ÷ 1,230 × 100 ≈ 32%: nearly a third of the world\'s corn, grown by under 2% of US workers.', '389 ÷ 1230 × 100% ≈ 32%，接近世界的三分之一，而务农人口不到美国劳动力的 2%。'] },
      { q: ['Which helped Silicon Valley become a high-tech centre? Pick all that apply.', '“硅谷”成为高新技术产业中心的有利条件有（多选）'], options: [['Top universities such as Stanford', '有斯坦福等著名大学'], ['Skilled people from all over the world', '汇聚了世界各地的人才'], ['Plenty of venture capital', '风险投资充足'], ['Large coal and iron deposits nearby', '附近有大型煤矿和铁矿'], ['Cheap land for big farms', '有大片廉价耕地']], multi: [0, 1, 2],
        why: ['High-tech industry depends on knowledge, talent and money, not on heavy raw materials like the old steel industry.', '高新技术产业依靠知识、人才和资金，而不像传统钢铁工业那样依赖煤、铁等原料。'] },
      { q: ['Find Silicon Valley.', '在地球上点出“硅谷”。'], at: [37.4, -122.1], tolKm: 400,
        why: ['It is just south of San Francisco, California, on the Pacific coast.', '它位于太平洋沿岸加利福尼亚州的旧金山以南。'] },
      { q: ['Label these features of the USA.', '在地球上标出美国的这些地理事物。'],
        place: [{ text: ['Rocky Mountains', '落基山脉'], at: [41, -108], tolKm: 600 }, { text: ['Appalachians', '阿巴拉契亚山脉'], at: [38, -80], tolKm: 500 }, { text: ['Mouth of the Mississippi', '密西西比河河口'], at: [29.1, -89.3], tolKm: 400 }, { text: ['Great Lakes', '五大湖'], at: [45, -84], tolKm: 500 }],
        why: ['The high Rockies run down the west; the old, lower Appalachians are in the east; the Mississippi crosses the Central Plains to the Gulf of Mexico; the Great Lakes lie on the Canadian border.', '高大的落基山脉纵贯西部，古老低缓的阿巴拉契亚山脉在东部，密西西比河穿过中部平原注入墨西哥湾，五大湖位于美加边境。'] },
    ],
  },
  {
    id: 'brazil', strand: 'world', tracks: ['us', 'ib'], grade: 'g7b', unit: west, icon: 'leaf', minutes: 7,
    title: ['Brazil', '巴西'],
    blurb: ['The giant of South America: the Amazon rainforest and the fight to save it, coffee and soybeans, and a mixed, lively culture.', '南美洲的大国：亚马孙雨林的开发与保护，咖啡和大豆，以及多元的混血文化。'],
    keys: [
      ['Brazil is the largest country in South America; the Amazon Plain lies in the north and the Brazilian Plateau in the centre and south.', '巴西是南美洲面积最大的国家，北部是亚马孙平原，中部和南部是巴西高原。'],
      ['The Amazon rainforest is the world\'s largest, hot and wet all year, and home to about one in ten known species.', '亚马孙热带雨林是世界上面积最大的热带雨林，终年高温多雨，物种极其丰富。'],
      ['Roads, ranches, soy farms, mines and dams have cleared about a fifth of Brazil\'s Amazon; protecting it matters to the whole world.', '修路、开辟牧场和大豆田、开矿和建水电站使巴西亚马孙雨林损失了约五分之一，保护雨林关系到全人类。'],
      ['Brazilians mix Indigenous, Portuguese and African roots; mixed-race people are the largest group, and the language is Portuguese.', '巴西居民由印第安人、葡萄牙等欧洲移民和非洲黑人后裔组成，混血种人最多，通用葡萄牙语。'],
      ['Brazil is a major exporter of soybeans, coffee, beef, sugar and iron ore, and is developing modern industry.', '巴西是大豆、咖啡、牛肉、蔗糖和铁矿石的出口大国，现代工业发展较快。'],
    ],
    steps: [
      {
        title: ['Giant of South America', '南美洲最大的国家'], cam: [-12, -54, 3.4], items: ['redeemer'],
        paint: [{ fill: { k: 'continents', only: ['south-america'] }, a: 0.3 }, { fill: { k: 'poly', pts: REGIONS.amazon, c: C.green, clip: ['BR'] }, t: 0.4, a: 0.55 }, { fill: { k: 'poly', pts: BR_PLATEAU, c: C.brown, clip: ['BR'] }, t: 0.7, a: 0.5 }],
        lines: [par(0, C.gold, 0.9), { pts: [[-23.44, -75], [-23.44, -40]], c: C.orange, t: 1.1, rhumb: true, dur: 1.4 }],
        marks: [mk([-4, -60], 'Amazon Plain', '亚马孙平原', { c: C.green, big: true, t: 0.6 }), mk([-14, -46], 'Brazilian Plateau', '巴西高原', { c: C.brown, big: true, t: 0.9 }), mk([1.2, -70], 'Equator', '赤道', { c: C.gold, t: 1.2 }), mk([-24.5, -70], 'Tropic of Capricorn', '南回归线', { c: C.orange, t: 1.4 }), mk([-15.8, -47.9], 'Brasília', '巴西利亚', { dot: true, t: 1.6 })],
        body: ['Brazil covers about 8.5 million km², almost half of South America and the fifth-largest country on Earth, and has about 212 million people. The equator crosses the north and the Tropic of Capricorn the south, so most of Brazil is tropical. The north is the vast, low Amazon Plain, the largest plain in the world; the centre and south are the Brazilian Plateau, the largest plateau in the world, which drops steeply to the Atlantic coast. Brazil borders every South American country except Chile and Ecuador.',
          '巴西面积约 850 万平方千米，约占南美洲的一半，居世界第五，人口约 2.12 亿。赤道穿过北部，南回归线穿过南部，大部分国土位于热带。北部是地势低平的亚马孙平原，是世界上面积最大的平原；中部和南部是巴西高原，是世界上面积最大的高原，东缘陡降到大西洋沿岸。除智利和厄瓜多尔外，南美洲各国都与巴西接壤。'],
      },
      {
        title: ['The Amazon rainforest', '亚马孙热带雨林'], cam: [-4, -62, 3.0], items: ['an_jaguar', 'an_macaw', 'pl_kapok'],
        task: ['Follow the Amazon River east from the Andes past Manaus to where it meets the Atlantic at the equator.', '沿着亚马孙河从安第斯山向东，经过马瑙斯，到赤道附近注入大西洋的地方。'],
        paint: [{ fill: { k: 'poly', pts: REGIONS.amazon, c: C.green }, t: 0.3, a: 0.6 }],
        lines: [flow(AMAZON_R, 0.6), par(0, C.gold, 0.2, { w: 1 })],
        marks: [mk([-3.1, -60.0], 'Manaus', '马瑙斯', { dot: true, t: 1.4 }), mk([-1.5, -63], 'Amazon River', '亚马孙河', { c: C.blue, t: 1.8 }), mk([0, -49], 'Mouth on the Atlantic', '河口（大西洋）', { c: C.blue, t: 2.2 })],
        fig: MANAUS,
        body: ['The Amazon basin holds the world\'s largest tropical rainforest, about 5.5 million km², and about 60% of it is in Brazil. Near the equator it is hot all year, about 27 °C, with over 2,000 mm of rain, as the Manaus graph shows. The Amazon River, about 6,400 km long, carries more water than any other river, about a fifth of all the river water reaching the oceans. The forest is home to perhaps one in ten of all known species, from jaguars and macaws to giant kapok trees, plus hundreds of Indigenous peoples.',
          '亚马孙平原上分布着世界上面积最大的热带雨林，约 550 万平方千米，其中约 60% 在巴西境内。这里地处赤道附近，终年高温，年均温约 27 °C，年降水量 2000 毫米以上，从马瑙斯的气候资料图可以看出。亚马孙河长约 6400 千米，是世界上流量最大的河流，约占全球河流入海水量的五分之一。雨林中生活着全球约十分之一的已知物种，如美洲豹、金刚鹦鹉和高大的吉贝树，还生活着数百个印第安部族。'],
      },
      {
        title: ['Developing the Amazon', '雨林的开发'], cam: [-6, -55, 3.0], sketch: true,
        task: ['Trace the Trans-Amazonian Highway across the forest: what has grown up along it?', '沿着横贯亚马孙公路穿过雨林：公路沿线出现了什么？'],
        paint: [{ fill: { k: 'poly', pts: REGIONS.amazon, c: C.green }, a: 0.45 }],
        lines: [{ pts: TRANS_AMAZON, c: C.gold, t: 0.3, w: 2, dur: 2.2 }, { pts: [[-6.07, -50.17], [-5.4, -48.5], [-4.2, -47.5], [-2.53, -44.3]], c: C.violet, t: 1.4, w: 1.6, dur: 1.2 }],
        marks: [mk([-5.5, -57], 'Trans-Amazonian Highway', '横贯亚马孙公路', { c: C.gold, t: 0.8 }), mk([-6.07, -50.17], 'Carajás iron mine', '卡拉加斯铁矿', { dot: true, c: C.red, t: 1.2 }), mk([-2.53, -44.3], 'São Luís port', '圣路易斯港', { dot: true, t: 1.6 }), mk([-3.13, -51.78], 'Belo Monte dam', '贝卢蒙蒂水电站', { dot: true, c: C.blue, t: 1.9 }), mk([-3.1, -60.0], 'Manaus free-trade zone', '马瑙斯自由贸易区', { dot: true, t: 2.2 })],
        body: ['For centuries the Amazon was hard to reach. From the 1960s Brazil set out to develop it: the Trans-Amazonian Highway, about 4,000 km long, was opened in 1972 to settle poor farmers from the dry north-east. Carajás became the world\'s largest iron-ore mine, with a railway to the port of São Luís, and big dams such as Belo Monte make electricity. Manaus became a free-trade zone with factories making motorbikes and electronics. Development brought jobs and income, but roads let loggers, ranchers and farmers deep into the forest.',
          '几百年来，亚马孙地区交通闭塞。20 世纪 60 年代起，巴西开始大规模开发这里：1972 年建成长约 4000 千米的横贯亚马孙公路，安置东北部干旱区的贫困农民；卡拉加斯成为世界上最大的铁矿，修建了通往圣路易斯港的铁路；贝卢蒙蒂等大型水电站提供电力；马瑙斯成为自由贸易区，建起了摩托车、电子产品工厂。开发带来了就业和收入，但公路也把伐木者、牧场主和农民带进了雨林深处。'],
      },
      {
        title: ['Protecting the forest', '雨林的保护'], cam: [-8, -58, 3.0], sketch: true,
        task: ['Find the orange "arc of deforestation" along the southern and eastern edge of the green forest.', '在绿色雨林的南缘和东缘找到橙色的“毁林弧”。'],
        paint: [{ fill: { k: 'poly', pts: REGIONS.amazon, c: C.green }, a: 0.5 }, { fill: { k: 'poly', pts: [[-6, -48], [-3, -48.5], [-6, -52], [-9, -60], [-11, -64], [-12.5, -60], [-11, -52], [-8, -49]], c: C.orange, clip: ['BR'] }, t: 0.6, a: 0.6 }],
        marks: [mk([-9.5, -56], '"Arc of deforestation"', '“毁林弧”', { c: C.orange, big: true, t: 1 })],
        fig: { k: 'line', title: ['Amazon forest cleared each year in Brazil (PRODES)', '巴西亚马孙每年毁林面积（卫星监测）'], unit: ['thousand km²', '千平方千米'], x: [1995, 2000, 2004, 2008, 2012, 2016, 2019, 2021, 2024], series: [{ name: ['Cleared', '毁林面积'], c: C.orange, y: [29.1, 18.2, 27.8, 12.9, 4.6, 7.9, 10.1, 13.0, 6.3] }], notes: [{ x: 2004, text: ['Action plan', '防治毁林计划'] }], min: 0 },
        body: ['Forest is cleared mostly for cattle pasture, then soybean fields, logging, mines and roads, along the southern and eastern edge. About a fifth of Brazil\'s Amazon forest has gone since 1970. The rainforest stores huge amounts of carbon and recycles its own rain, so losing it adds to climate change, can dry out farms far away and wipes out species. Since 2004 Brazil has watched the forest by satellite, fined illegal clearing and protected large reserves and Indigenous lands; clearing fell by over 80% by 2012, rose again, and fell to about 6,300 km² in 2024. Sustainable use, such as harvesting nuts and fruit, eco-tourism and replanting, helps people earn a living without cutting trees.',
          '雨林被砍伐主要是为了开辟牧场，其次是种植大豆、采伐木材、开矿和修路，多发生在雨林的南缘和东缘。1970 年以来，巴西亚马孙雨林已减少约五分之一。热带雨林储存着大量的碳，还能通过蒸腾作用形成降水，被誉为“地球之肺”；雨林被毁会加剧全球变暖，可能使远方的农田变干，并造成物种灭绝。2004 年起，巴西用卫星监测雨林，严惩非法砍伐，划定大面积的保护区和印第安人保留地：到 2012 年毁林面积减少了 80% 以上，此后有所反弹，2024 年降到约 6300 平方千米。采集坚果和水果、发展生态旅游、植树造林等可持续利用方式，让人们不砍树也能增加收入。'],
      },
      {
        title: ['A mixed culture', '多元的混血文化'], cam: [-5, -25, 3.6], items: ['fs_rio'],
        lines: [route([[38.7, -9.1], [20, -25], [-8, -34.9]], 0.3, C.gold), route([[6, 2], [-5, -15], [-12.97, -38.5]], 0.7, C.orange)],
        marks: [mk([30, -18], 'from Portugal', '来自葡萄牙', { c: C.gold, t: 1 }), mk([2, -8], 'from Africa', '来自非洲', { c: C.orange, t: 1.4 }), mk([-12.97, -38.5], 'Salvador', '萨尔瓦多', { dot: true, t: 1.6 }), mk([-22.9, -43.2], 'Rio Carnival', '里约狂欢节', { dot: true, t: 1.8 })],
        fig: { k: 'pie', title: ['Brazilians by group, 2022 census (approx.)', '2022 年巴西居民构成（约）'], parts: [
          { name: ['Mixed (pardo)', '混血种人'], v: 45, c: C.lime }, { name: ['White', '白人'], v: 44, c: C.gold }, { name: ['Black', '黑人'], v: 10, c: C.orange }, { name: ['Indigenous & Asian', '印第安人及亚裔'], v: 1, c: C.violet },
        ] },
        body: ['Indigenous peoples lived here first. Portugal ruled Brazil from 1500 to 1822, so Brazilians speak Portuguese, and about 4 million Africans were brought as slaves to work on sugar and coffee plantations, more than to any other country. Later came Italians, Germans and Japanese. Over centuries these groups mixed, and in the 2022 census mixed-race (pardo) people were the largest group for the first time. Samba, capoeira, football and the Rio Carnival all show this lively blend.',
          '印第安人是这里的原住民。1500–1822 年巴西是葡萄牙的殖民地，所以通用葡萄牙语；殖民者从非洲贩运来约 400 万黑奴，在甘蔗和咖啡种植园劳动，人数居美洲各国之首。后来意大利、德国、日本移民也陆续到来。各种族长期通婚，在 2022 年人口普查中，混血种人首次成为最大的群体。桑巴舞、卡波耶拉、足球和里约狂欢节都体现了这种多元文化。'],
      },
      {
        title: ['Farms, mines and factories', '经济：农矿产品与工业'], cam: [-16, -50, 3.0], sketch: true, items: ['pl_coffee', 'iguazu'],
        paint: [{ fill: { k: 'poly', pts: [[-15, -48], [-14, -40], [-22, -40], [-24, -47], [-22.5, -50]], c: C.brown, clip: ['BR'] }, t: 0.3, a: 0.6 }, { fill: { k: 'poly', pts: [[-10, -60], [-10, -46], [-15, -46], [-20, -51], [-30, -50], [-30, -56], [-17, -58]], c: C.lime, clip: ['BR'] }, t: 0.7, a: 0.45 }],
        marks: [mk([-19, -44], 'Coffee', '咖啡', { c: C.brown, t: 0.6 }), mk([-13, -55], 'Soybeans (Mato Grosso)', '大豆（马托格罗索）', { c: C.lime, t: 1 }), mk([-6.07, -50.17], 'Iron ore', '铁矿', { dot: true, c: C.red, t: 1.2 }), mk([-23.55, -46.6], 'São Paulo: industry', '圣保罗：工业中心', { dot: true, big: true, t: 1.5 }), mk([-25.4, -54.6], 'Itaipu dam', '伊泰普水电站', { dot: true, c: C.blue, t: 1.8 })],
        fig: { k: 'bars', title: ['Brazil\'s share of world output (approx.)', '巴西产量占世界的比重（约）'], unit: ['%', '%'], rows: [
          { name: ['Soybeans', '大豆'], v: 39, c: C.lime }, { name: ['Sugar cane', '甘蔗'], v: 38, c: C.green }, { name: ['Coffee', '咖啡'], v: 35, c: C.brown }, { name: ['Iron ore', '铁矿石'], v: 17, c: C.red },
        ] },
        body: ['Brazil is the world\'s biggest producer of soybeans, coffee, sugar cane and oranges and a top exporter of beef, chicken and iron ore; China buys about 70% of its soy exports. Coffee grows on the plateau in the south-east, and soy has spread across the central savanna (Cerrado). Brazil is a developing country, but it has built modern industry: steel, cars, oil from deep under the Atlantic, and Embraer, one of the world\'s big makers of passenger jets. Sugar cane is turned into ethanol, so many cars run on biofuel, and the Itaipu dam is one of the largest hydro-power plants on Earth.',
          '巴西是世界上最大的大豆、咖啡、甘蔗和柑橘生产国，牛肉、鸡肉和铁矿石的出口量也居世界前列；巴西出口的大豆约 70% 卖到中国。咖啡主要种植在东南部的高原上，大豆已扩展到中部的热带草原（塞拉多）。巴西是发展中国家，但已建立起钢铁、汽车、深海石油开采等现代工业，巴西航空工业公司是世界主要的客机制造商之一。甘蔗被加工成乙醇，许多汽车使用生物燃料；伊泰普水电站是世界上最大的水电站之一。'],
      },
      {
        title: ['Cities and a new capital', '城市与新首都'], cam: [-18, -47, 2.8], items: ['lm4_brasilia', 'redeemer'],
        paint: [{ fill: { k: 'poly', pts: [[-12, -39], [-20, -39.5], [-24, -45], [-26, -49], [-24, -50], [-20, -48], [-15, -42]], c: C.violet, clip: ['BR'] }, t: 0.3, a: 0.4 }],
        lines: [...arrows([[[-22.9, -43.2], [-16.5, -47.2]]], C.gold, 1.2, 2)],
        marks: [mk([-23.55, -46.6], 'São Paulo', '圣保罗', { dot: true, big: true, t: 0.4 }), mk([-22.9, -43.2], 'Rio de Janeiro', '里约热内卢', { dot: true, t: 0.7 }), mk([-19.92, -43.94], 'Belo Horizonte', '贝洛奥里藏特', { dot: true, t: 0.9 }), mk([-15.8, -47.9], 'Brasília (capital since 1960)', '巴西利亚（1960 年起为首都）', { dot: true, big: true, c: C.gold, t: 1.4 })],
        body: ['About 87% of Brazilians live in cities, and most of them are near the south-east coast, where the plantations, ports and industry grew first. São Paulo, with over 20 million people in its metropolitan area, is the largest city in the Southern Hemisphere; Rio de Janeiro, under the Christ the Redeemer statue, was the capital until 1960. Fast urban growth left millions in hillside slums called favelas. To pull people and investment inland, Brazil built a brand-new capital, Brasília, on the empty central plateau, shaped like an aeroplane.',
          '巴西约 87% 的人口居住在城市，大多集中在东南沿海，那里是种植园、港口和工业最早发展的地区。圣保罗都市区人口超过 2000 万，是南半球最大的城市；耶稣像俯瞰下的里约热内卢在 1960 年以前是巴西首都。城市化速度过快，数以百万计的人住在山坡上的贫民窟里。为了把人口和投资引向内地，巴西在人烟稀少的中部高原上新建了首都巴西利亚，城市平面形如一架飞机。'],
      },
    ],
    quiz: [
      { q: ['Find the Amazon rainforest.', '在地球上点出亚马孙热带雨林。'], at: [-4, -62], tolKm: 900,
        why: ['It covers the Amazon Plain in northern Brazil, along the equator.', '它分布在巴西北部赤道附近的亚马孙平原。'] },
      { q: ['Read the graph: what is Manaus\'s annual temperature range (warmest month minus coolest month), in °C?', '读图：马瑙斯的气温年较差（最热月均温减最冷月均温）约为多少摄氏度？'], fig: MANAUS, num: { answer: 1.8, tol: 0.4, unit: ['°C', '°C'] },
        why: ['About 28.1 °C in September minus about 26.3 °C in February ≈ 1.8 °C. Near the equator the Sun is high all year, so temperature barely changes; the seasons are wetter and less wet, not warm and cold.', '9 月约 28.1 °C 减 2 月约 26.3 °C ≈ 1.8 °C。赤道附近全年正午太阳高度都很大，气温变化很小，只有多雨期和少雨期之分，没有冷暖季节之分。'] },
      { q: ['Put the usual chain of Amazon deforestation in order.', '给亚马孙雨林常见的毁林过程排序。'],
        order: [['A road is cut into the forest', '修建通往雨林深处的公路'], ['Loggers take the valuable trees', '伐木者砍走珍贵树木'], ['The rest is cleared and burned', '剩余林木被砍光烧掉'], ['The land becomes cattle pasture or soy fields', '土地变成牧场或大豆田']],
        why: ['Roads open the way; selective logging pays for clearing; fire removes the rest; then ranchers and farmers move in. That is why new roads are watched so closely.', '公路打开通道，伐木获取收益，焚烧清除剩余林木，牧场主和农民随后进入。所以新修道路是监测的重点。'] },
      { q: ['Why does losing the Amazon rainforest matter to the whole world?', '为什么说亚马孙雨林被毁关系到全人类？'], options: [['It stores huge amounts of carbon and is home to countless species', '雨林储存大量的碳，又是众多物种的家园'], ['It is the world\'s main source of iron ore', '它是世界铁矿石的主要来源'], ['It is the coldest forest on Earth', '它是地球上最冷的森林'], ['It produces most of the world\'s wheat', '它出产世界上大部分小麦']], answer: 0,
        why: ['Burning the forest releases carbon dioxide and speeds climate change, and many species found nowhere else are lost for ever.', '焚烧雨林会释放二氧化碳，加剧全球变暖；许多独有物种也将永远消失。'] },
      { q: ['Which actions help protect the Amazon rainforest? Pick all that apply.', '下列做法中，有利于保护亚马孙热带雨林的有（多选）'],
        options: [['Setting up nature reserves and Indigenous lands', '建立自然保护区和印第安人保留地'], ['Watching for illegal logging by satellite', '用卫星监测非法砍伐'], ['Earning a living from nuts, fruit and eco-tourism', '发展采集坚果、水果和生态旅游'], ['Clearing forest for cattle ranches', '毁林开辟牧场'], ['Building more roads deep into the forest', '修建更多深入雨林的公路']], multi: [0, 1, 2],
        why: ['Reserves, satellite watching and sustainable use protect the forest. Ranches and new roads are the main causes of forest loss.', '建立保护区、卫星监测和可持续利用能保护雨林；开辟牧场和修路是雨林遭到破坏的主要原因。'] },
      { q: ['Match each Brazilian product to where it mainly comes from.', '把巴西的产品和主要产地连起来。'],
        match: [[['Coffee', '咖啡'], ['The south-east plateau', '东南部高原']], [['Soybeans', '大豆'], ['The central savanna (Mato Grosso)', '中部热带草原（马托格罗索）']], [['Iron ore', '铁矿石'], ['Carajás, on the forest\'s eastern edge', '雨林东缘的卡拉加斯']], [['Cars and aircraft', '汽车和飞机'], ['São Paulo, the industrial heart', '工业中心圣保罗']]],
        why: ['Coffee likes the mild, frost-free plateau; soy has spread over the flat central savanna; Carajás is the world\'s biggest iron mine; factories cluster round São Paulo.', '咖啡适宜温和少霜的高原；大豆在平坦的中部热带草原上大面积种植；卡拉加斯是世界上最大的铁矿；工厂集中在圣保罗周围。'] },
      { q: ['What language do most Brazilians speak, and why?', '巴西的通用语言是什么？'], options: [['Portuguese: Brazil was a Portuguese colony', '葡萄牙语：巴西曾是葡萄牙的殖民地'], ['Spanish: like most of South America', '西班牙语：与南美洲大多数国家相同'], ['English: it was a British colony', '英语：曾是英国殖民地'], ['French: it borders French Guiana', '法语：与法属圭亚那接壤']], answer: 0,
        why: ['Portugal ruled Brazil from 1500 to 1822; the rest of South America was mostly Spanish.', '1500–1822 年巴西是葡萄牙的殖民地，而南美洲其他国家大多曾是西班牙殖民地。'] },
      { q: ['Label these places in Brazil.', '在地球上标出巴西的这些地方。'],
        place: [{ text: ['Brasília (capital)', '巴西利亚（首都）'], at: [-15.8, -47.9], tolKm: 400 }, { text: ['São Paulo', '圣保罗'], at: [-23.55, -46.6], tolKm: 300 }, { text: ['Manaus', '马瑙斯'], at: [-3.1, -60], tolKm: 400 }, { text: ['Iguazu Falls', '伊瓜苏瀑布'], at: [-25.7, -54.4], tolKm: 400 }],
        why: ['Brasília was built inland to develop the interior; São Paulo is near the south-east coast; Manaus is in the middle of the Amazon; Iguazu Falls is on the border with Argentina.', '巴西利亚建在内陆，以带动内地开发；圣保罗在东南沿海附近；马瑙斯在亚马孙雨林中部；伊瓜苏瀑布在与阿根廷交界处。'] },
    ],
  },
];
