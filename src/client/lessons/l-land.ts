/**
 * 七上 · 陆地和海洋 (大洲和大洋, 世界的地形, 海陆的变迁) and 天气与气候 (气温, 降水): landforms and the ocean floor,
 * continents and oceans, moving plates, and how temperature and rainfall vary in time and space.
 */
import { C, T, arrows, mk, par, type LL, type Lesson, type Pair } from './kit.ts';
import { CITIES, arrowDef, svg, tx, type Lx } from './figs.ts';
import { ASIA_EUROPE, BERING, MED_HIMALAYA, PANAMA, PLATES, REGIONS, RING_OF_FIRE, SUEZ } from './geo.ts';
import { LOESS_PLATEAU } from './geo-cn.ts';
import { LAPSE, footTemp } from './models.ts';

const land = ['Land and sea', '陆地和海洋'] as const;
const climate = ['Weather and climate', '天气与气候'] as const;

/* ---- shapes (sketches) ---- */
const QAIDAM: LL[] = [[38.6, 90.5], [39.0, 93.0], [38.3, 95.5], [37.5, 97.5], [36.6, 98.5], [36.0, 97.0], [36.3, 94.5], [37.0, 92.0], [37.8, 90.5]];
const JUNGGAR: LL[] = [[46.3, 83.5], [47.2, 85.5], [47.0, 88.0], [45.8, 90.5], [44.5, 89.5], [44.3, 86.0], [44.6, 83.5], [45.4, 82.5]];
const BRAZIL_PLATEAU: LL[] = [[-5, -45], [-4, -40], [-8, -35.5], [-15, -39.5], [-22, -41.5], [-28, -49], [-30, -53], [-24, -55.5], [-18, -57.5], [-12, -55], [-8, -50]];
const CONGO_BASIN: LL[] = [[5, 17], [4.5, 24], [2.5, 28], [-2, 28], [-6, 26], [-8, 22], [-6, 17], [-3, 14], [1, 14]];
/** the crest of the Andes, Venezuela to Tierra del Fuego */
const ANDES: LL[] = [[10.5, -71.5], [7, -72.5], [4, -75.5], [0, -78], [-5, -79.3], [-10, -77], [-15, -73], [-18, -69.5], [-22, -68], [-27, -68.8], [-32.65, -70.0], [-38, -71], [-42, -71.8], [-47, -73], [-52, -73], [-55, -69]];
/** the 200 m isobath at the edge of the East China Sea shelf (along the west side of the Okinawa Trough) */
const ECS_SHELF_EDGE: LL[] = [[32.5, 128.3], [31, 128.6], [29.5, 127.6], [28, 126.4], [26.5, 124.6], [25.5, 122.8]];
/** the southern Izu–Bonin–Mariana Trench (as in the plate data) */
const MARIANA: LL[] = [[21, 146], [18, 147.8], [15, 147.5], [12.5, 146], [11.5, 143], [11, 140.5], [10, 138]];
/** the San Andreas Fault (as in the plate data) */
const SAN_ANDREAS: LL[] = [[32.5, -115.5], [33.5, -116.5], [34.3, -117.5], [34.8, -118.8], [35.3, -119.8], [35.8, -120.5], [36.5, -121.2], [37, -121.8], [37.7, -122.4], [38.3, -122.9], [39.5, -123.8], [40.3, -124.4]];

const EVEREST: LL = [27.99, 86.93], CHALLENGER: LL = [11.35, 142.2], WENCHUAN: LL = [31.0, 103.4], MAWSYNRAM: LL = [25.3, 91.58];
const BEIJING: LL = [39.9, 116.4], SINGAPORE: LL = [1.35, 103.82], SYDNEY: LL = [-33.87, 151.21], ROME: LL = [41.9, 12.5];

/** the stage's continent and ocean colours, so the bars match the globe */
const CONT = { asia: '#f2c94c', africa: '#f2994a', na: '#eb5757', sa: '#bb6bd9', antarctica: '#e0e6ee', europe: '#6fcf97', oceania: '#56ccf2' };
const OCEAN = { pacific: '#2f80ed', atlantic: '#27ae9f', indian: '#8e6cf0', arctic: '#9fd8ff' };
/** the tectonics overlay colours */
const TEC = { ridge: '#fb923c', trench: '#ef4444', collision: '#f59e0b', rift: '#facc15', transform: '#fda4af' };

/* ---- figures ---- */
const GOLD = '#ffd24a', HOT = '#ff6b6b';
const poly = (pts: number[][], cls: string, extra = '') => `<path d="M${pts.map(p => p.join(' ')).join(' L')} Z" class="${cls}"${extra}/>`;
const lead = (x: number, y0: number, y1: number) => `<line x1="${x}" x2="${x}" y1="${y0}" y2="${y1}" class="fg-guide"/>`;

/** the five landforms on one schematic profile, with the 200 m and 500 m guides */
const profileFig = (L: Lx) => {
  const g = [[40, 150], [40, 147], [90, 145], [96, 138], [104, 142], [112, 131], [120, 140], [128, 133], [136, 139], [144, 102], [151, 64], [157, 80], [164, 46],
    [171, 72], [178, 92], [184, 98], [192, 116], [208, 120], [222, 116], [230, 88], [236, 74], [244, 66], [310, 62], [326, 63], [326, 176], [40, 176]];
  const y0 = 150, y200 = 138, y500 = 118;
  const guides = [[y0, '0 m'], [y200, '200 m'], [y500, '500 m']].map(([y, s]) => `<line x1="40" x2="326" y1="${y}" y2="${y}" class="fg-guide"/>` + tx(36, Number(y) + 3, String(s), 'fg-tick', 'e')).join('');
  const names: [number, number, Pair][] = [[65, 142, ['Plain', '平原']], [116, 128, ['Hills', '丘陵']], [164, 43, ['Mountains', '山地']], [207, 114, ['Basin', '盆地']], [280, 59, ['Plateau', '高原']]];
  const lab = names.map(([x, y, p], i) => `<g class="f-fade" style="--d:${(0.4 + i * 0.25).toFixed(2)}s">${tx(x, 30, L(p), 'fg-label', 'm')}${lead(x, 34, y)}</g>`).join('');
  return svg(330, 190, tx(165, 13, L(['Five landforms on one profile (schematic, not to scale)', '五种基本地形剖面示意（不按比例）']), 'fg-title', 'm')
    + `<rect x="10" y="150" width="30" height="26" class="fg-sea"/>` + poly(g, 'fg-land') + guides + lab
    + tx(183, 187, L(['height (altitude) and relief tell them apart', '海拔高低和地面起伏是区分的依据']), 'fg-sub', 'm'), L(['Landform profile', '地形剖面']));
};

/** the ocean floor: shelf, slope, basin, ridge, trench, island arc */
const seaFloorFig = (L: Lx) => {
  const floor = [[0, 40], [30, 44], [36, 50], [92, 58], [120, 120], [137, 132], [178, 138], [206, 112], [214, 96], [219, 104], [224, 96], [233, 112], [256, 136],
    [274, 140], [284, 178], [292, 140], [308, 82], [314, 44], [320, 58], [330, 88], [330, 186], [0, 186]];
  const names: [number, number, number, 'm' | 'e', Pair][] = [
    [64, 22, 55, 'm', ['Shelf', '大陆架']], [106, 38, 90, 'm', ['Slope', '大陆坡']], [158, 22, 136, 'm', ['Ocean basin', '海盆']],
    [219, 38, 94, 'm', ['Ridge', '海岭']], [284, 22, 170, 'm', ['Trench', '海沟']], [328, 38, 42, 'e', ['Island arc', '岛弧']]];
  const lab = names.map(([x, y, fy, a, p], i) => {
    const lx = a === 'e' ? 314 : x;
    return `<g class="f-fade" style="--d:${(0.3 + i * 0.2).toFixed(2)}s">${tx(x, y, L(p), 'fg-label', a)}${lx === 314 ? '' : lead(lx, y + 4, fy)}</g>`;
  }).join('');
  return svg(330, 214, tx(165, 10, L(['The ocean floor (schematic)', '海底地形示意']), 'fg-title', 'm')
    + `<rect x="36" y="50" width="294" height="136" class="fg-sea"/>` + poly(floor, 'fg-land') + lab
    + tx(4, 198, L(['Shelf: 0–200 m deep · Ocean basin: 3,000–6,000 m', '大陆架：水深 0—200 米 · 海盆：水深 3000—6000 米']), 'fg-sub')
    + tx(4, 209, L(['Trench: deeper than 6,000 m (Mariana ≈ 10,935 m) · Ridge: undersea mountain chain', '海沟：水深超过 6000 米（马里亚纳海沟约 10935 米）· 海岭：海底山脉']), 'fg-sub'),
  L(['Ocean floor', '海底地形']));
};

type Bdy = 'collision' | 'subduction' | 'rift';
/** a plate boundary in cross-section; `blind` hides what it builds (for the quiz) */
const bdyFig = (kind: Bdy, blind = false) => (L: Lx, id: string) => {
  const a = `${id}a`, arr = (x0: number, y0: number, x1: number, y1: number, d = 0.3) =>
    `<path d="M${x0} ${y0} L${x1} ${y1}" class="fg-arrow f-draw" pathLength="1" marker-end="url(#${a})" style="--d:${d}s"/>`;
  const mantle = `<rect x="10" y="125" width="280" height="50" fill="rgba(255,120,60,.16)"/>` + tx(286, 170, L(['hot mantle rock', '软流层']), 'fg-sub', 'e');
  let body = '', title: Pair = ['', ''];
  if (kind === 'collision') {
    title = ['Two continents collide', '大陆与大陆碰撞挤压'];
    body = mantle + poly([[10, 90], [100, 90], [120, 62], [134, 48], [150, 36], [165, 50], [180, 64], [200, 90], [290, 90], [290, 122], [200, 122], [176, 142], [150, 150], [124, 142], [100, 122], [10, 122]], 'fg-land')
      + `<path d="M150 40 L142 146" class="fg-crack" stroke-dasharray="3 3"/>` + arr(24, 106, 84, 106) + arr(276, 106, 216, 106, 0.5)
      + tx(14, 84, L(['Indian Plate', '印度洋板块']), 'fg-label') + tx(286, 84, L(['Eurasian Plate', '亚欧板块']), 'fg-label', 'e')
      + tx(150, 30, L(['Himalaya and Tibetan Plateau', '喜马拉雅山脉和青藏高原']), 'fg-label', 'm', ` style="fill:${GOLD}"`)
      + tx(150, 162, L(['crust piles up ~70 km thick', '地壳挤压增厚至约 70 千米']), 'fg-sub', 'm');
  } else if (kind === 'subduction') {
    title = blind ? ['What forms at this boundary?', '这种板块边界会形成什么？'] : ['An ocean plate dives under a continent', '大洋板块俯冲到大陆板块之下'];
    body = mantle + `<path d="M10 80 L148 80 L148 103 L140 101 Q128 96 120 95 L10 95 Z" class="fg-sea"/>`
      + poly([[10, 95], [120, 95], [140, 101], [160, 110], [200, 135], [250, 172], [228, 172], [182, 142], [150, 124], [130, 112], [10, 110]], 'fg-rock')
      + poly([[148, 82], [168, 80], [182, 66], [190, 50], [198, 66], [214, 76], [240, 80], [290, 82], [290, 126], [210, 128], [182, 120], [148, 103]], 'fg-land')
      + `<path d="M196 140 Q194 100 190 54" fill="none" stroke="${HOT}" stroke-width="2" stroke-dasharray="4 3" class="f-draw" pathLength="1" style="--d:.9s"/>`
      + `<circle cx="196" cy="140" r="4" fill="${HOT}" class="f-fade" style="--d:.8s"/>`
      + arr(30, 102, 96, 102) + arr(205, 146, 236, 168, 0.6) + arr(276, 104, 236, 104, 0.4)
      + tx(14, 74, L(['Ocean plate (heavier)', '大洋板块（较重）']), 'fg-label') + tx(286, 76, L(['Continental plate', '大陆板块']), 'fg-label', 'e')
      + (blind ? tx(148, 116, '?', 'fg-title', 'm', ` style="fill:${GOLD}"`) + tx(190, 42, '?', 'fg-title', 'm', ` style="fill:${GOLD}"`)
        : tx(146, 118, L(['trench', '海沟']), 'fg-label', 'e', ` style="fill:${GOLD}"`) + tx(190, 42, L(['volcanic mountains (Andes)', '火山、高大山脉（安第斯山脉）']), 'fg-label', 'm', ` style="fill:${GOLD}"`)
          + tx(202, 140, L(['rock melts', '岩石熔融']), 'fg-sub'));
  } else {
    title = ['A plate splits apart', '板块张裂'];
    body = mantle + poly([[10, 80], [125, 80], [140, 125], [10, 125]], 'fg-land') + poly([[175, 80], [290, 80], [290, 125], [160, 125]], 'fg-land')
      + poly([[132.3, 102], [167.7, 102], [160, 125], [140, 125]], 'fg-land', ' style="opacity:.85"')
      + poly([[130.3, 96], [169.7, 96], [167.7, 102], [132.3, 102]], 'fg-water')
      + `<path d="M125 80 L140 125 M175 80 L160 125" class="fg-crack"/>`
      + `<path d="M150 168 Q148 148 150 128" fill="none" stroke="${HOT}" stroke-width="2" stroke-dasharray="4 3" class="f-draw" pathLength="1" style="--d:.6s"/>`
      + arr(100, 100, 40, 100) + arr(200, 100, 260, 100)
      + tx(14, 74, L(['plate', '板块']), 'fg-label') + tx(286, 74, L(['plate', '板块']), 'fg-label', 'e')
      + tx(150, 62, L(['rift valley with long, deep lakes', '裂谷，谷底有狭长的深湖']), 'fg-label', 'm', ` style="fill:${GOLD}"`) + lead(150, 66, 94)
      + tx(150, 140, L(['magma rises', '岩浆上涌']), 'fg-sub', 'm');
  }
  return svg(300, 180, arrowDef(a, GOLD) + tx(150, 13, L(title), 'fg-title', 'm') + body, L(title));
};

/** relief rain: the windward slope is wet, the leeward slope lies in a rain shadow */
const reliefRainFig = (L: Lx, id: string) => {
  const a = `${id}a`, arr = (d: string, t: number, c = '#a5d8ff') => `<path d="${d}" fill="none" stroke="${c}" stroke-width="1.8" marker-end="url(#${a})" class="f-draw" pathLength="1" style="--d:${t}s;color:${c}"/>`;
  const rain = Array.from({ length: 7 }, (_, i) => `<line x1="${96 + i * 8}" y1="${62 + i * 2}" x2="${92 + i * 8}" y2="${78 + i * 2}"/>`).join('');
  return svg(300, 176, arrowDef(a, '#a5d8ff') + tx(150, 13, L(['Mountains and rain', '地形对降水的影响']), 'fg-title', 'm')
    + `<rect x="0" y="140" width="70" height="20" class="fg-sea"/>` + poly([[70, 160], [70, 140], [110, 112], [150, 52], [165, 46], [182, 62], [230, 120], [300, 140], [300, 160]], 'fg-land')
    + arr('M8 128 L60 128', 0.2) + arr('M76 122 Q110 100 138 58', 0.6)
    + `<g class="f-fade" style="--d:1.1s"><ellipse cx="112" cy="54" rx="26" ry="11" class="fg-cloud"/><ellipse cx="136" cy="42" rx="20" ry="9" class="fg-cloud"/></g>`
    + `<g class="fg-rain f-fade" style="--d:1.4s">${rain}</g>` + arr('M190 50 Q228 72 262 118', 1.6, '#ffc078')
    + tx(6, 120, L(['moist sea wind', '湿润的海风']), 'fg-sub')
    + tx(10, 30, L(['Windward slope: air rises,', '迎风坡：气流上升、']), 'fg-label') + tx(10, 41, L(['cools and rains', '冷却，降水多']), 'fg-label')
    + tx(296, 30, L(['Leeward slope: air sinks,', '背风坡：气流下沉、']), 'fg-label', 'e') + tx(296, 41, L(['warms, stays dry', '增温，降水少']), 'fg-label', 'e')
    + tx(150, 172, L(['e.g. Mawsynram, windward of India\'s Khasi Hills: ≈ 11,870 mm a year', '例：印度卡西山迎风坡的毛辛拉姆，年降水量约 11870 毫米']), 'fg-sub', 'm'),
  L(['Relief rain', '地形雨']));
};

const SHARE_C = { mtn: '#e9ecef', plateau: C.violet, basin: C.orange, plain: C.green, hill: C.lime };

export const LAND: Lesson[] = [
  {
    id: 'landforms', strand: 'physical', tracks: ['uk', 'us', 'ib', 'au'], grade: 'g7a', unit: land, icon: 'mountain', minutes: 9,
    title: ['Five basic landforms', '五种基本地形'],
    blurb: ['Plains, plateaus, mountains, hills and basins on land, and shelves, ridges and trenches under the sea: what tells them apart, and where the biggest are.', '陆地上的平原、高原、山地、丘陵、盆地，海底的大陆架、海岭、海沟：怎样区分，最大的在哪里。'],
    keys: [
      ['Five basic landforms, told apart by altitude and relief: plains (mostly < 200 m, flat), plateaus (> 500 m, flat top, steep edges), mountains (> 500 m, peaks, steep slopes), hills (< 500 m, gentle and rolling) and basins (high rim, low middle).', '五种基本地形按海拔和起伏区分：平原（多在 200 米以下，平坦）、高原（500 米以上，顶面平坦、边缘陡峭）、山地（500 米以上，峰峦起伏、坡度陡峻）、丘陵（500 米以下，起伏和缓）、盆地（四周高、中间低）。'],
      ['China has all five: the North China Plain, the Qinghai–Tibet Plateau, the Himalaya, the Southeast Hills, the Sichuan and Tarim basins.', '我国五种地形齐全：华北平原、青藏高原、喜马拉雅山脉、东南丘陵、四川盆地和塔里木盆地等。'],
      ['A basin is defined by its shape, not its height: the Qaidam Basin floor lies 2,600–3,000 m up.', '盆地看的是“四周高、中间低”的形态，不看海拔：柴达木盆地底部海拔 2600—3000 米。'],
      ['World records: the Amazon Plain, the Brazilian Plateau and the Congo Basin are the largest of their kind; the Andes are the longest range; Tibet is the highest plateau.', '世界之最：亚马孙平原、巴西高原、刚果盆地分别是面积最大的平原、高原、盆地；安第斯山脉最长；青藏高原最高。'],
      ['The ocean floor has landforms too: the shelf (< 200 m), the slope, ocean basins, mid-ocean ridges and trenches (Mariana ≈ 10,935 m).', '海底也有地形：大陆架（水深不到 200 米）、大陆坡、海盆、海岭和海沟（马里亚纳海沟约 10935 米）。'],
    ],
    steps: [
      {
        title: ['Height and relief', '海拔与起伏'], cam: [33, 104, 3.2], sketch: true, fig: { k: 'svg', draw: profileFig },
        paint: [
          { fill: { k: 'poly', pts: REGIONS.northChinaPlain, c: C.green }, a: 0.55 }, { fill: { k: 'poly', pts: REGIONS.southeastHills, c: C.lime }, t: 0.4, a: 0.5 },
          { fill: { k: 'poly', pts: REGIONS.himalaya, c: C.white }, t: 0.8, a: 0.6 }, { fill: { k: 'poly', pts: REGIONS.sichuan, c: C.orange }, t: 1.2, a: 0.6 },
          { fill: { k: 'poly', pts: REGIONS.tibet, c: C.violet, clip: ['CN'] }, t: 1.6, a: 0.45 },
        ],
        marks: [mk([36.5, 115.8], 'Plain', '平原', { c: C.green, t: 0.3 }), mk([26.5, 115.5], 'Hills', '丘陵', { c: C.lime, t: 0.7 }), mk([29, 83.5], 'Mountains', '山地', { c: C.white, t: 1.1 }),
          mk([30.4, 105.6], 'Basin', '盆地', { c: C.orange, t: 1.5 }), mk([33.5, 90], 'Plateau', '高原', { c: C.violet, t: 1.9 })],
        task: ['Match each coloured region on the globe with its place on the profile in the card.', '把地球上每块彩色区域和卡片剖面图上的地形一一对应起来。'],
        body: ['Land is sorted into five basic landforms by two things: altitude (height above sea level) and relief (how much the ground rises and falls). Plains and hills are low; plateaus and mountains are high; a basin is high round the rim and low in the middle. The average height of all the world\'s land is only about 840 m, but it ranges from the Dead Sea shore (about −430 m) to the top of Everest (8,848.86 m). China has all five landforms, coloured here.',
          '陆地地形按两个标准划分为五种基本类型：海拔（高出海平面的垂直距离）和地面起伏。平原和丘陵海拔较低，高原和山地海拔较高，盆地则四周高、中间低。全球陆地平均海拔只有约 840 米，但最低的死海湖岸约为 −430 米，最高的珠穆朗玛峰达 8848.86 米。我国五种基本地形齐全，图中用不同颜色标出。'],
      },
      {
        title: ['Plains: flat land built by rivers', '平原：河流堆积的平地'], cam: [37, 118, 2.2], items: ['forbidden'],
        paint: [{ fill: { k: 'poly', pts: REGIONS.northChinaPlain, c: C.green }, a: 0.55 }],
        marks: [mk([36.3, 116], 'North China Plain', '华北平原', { big: true, c: C.green, t: 0.4 }), mk([45.5, 125], 'Northeast Plain: China\'s largest', '东北平原：我国最大', { c: C.green, t: 1 }),
          mk([30.6, 116.5], 'Middle–Lower Yangtze Plain', '长江中下游平原', { c: C.green, t: 1.4 })],
        task: ['Turn the globe a little west: find where the flat green plain ends against the Taihang Mountains.', '把地球向西转一点：找到平坦的绿色平原在哪里与太行山相接。'],
        body: ['Plains are low (mostly below 200 m) and flat, with very little relief. Most big plains are built by rivers: every flood spreads a layer of silt, and over thousands of years the layers fill a lowland. The North China Plain (about 300,000 km², mostly under 50 m) was built by the Yellow, Hai and Huai rivers. Flat ground, deep soil and easy transport make plains the main farming and city regions of the world: Beijing sits at the plain\'s northern tip.',
          '平原海拔较低，一般在 200 米以下，地面平坦，起伏很小。大平原多由河流冲积而成：每次洪水都留下一层泥沙，日积月累，填平了低地。华北平原面积约 30 万平方千米，大部分海拔在 50 米以下，主要由黄河、海河、淮河带来的泥沙堆积而成。平原地势平坦、土层深厚、交通便利，是世界上主要的农耕区和城市密集区，北京就位于华北平原的北端。'],
      },
      {
        title: ['Plateaus: high and flat-topped', '高原：高而平坦'], cam: [33, 100, 2.8], items: ['potala', 'an_yak'],
        paint: [{ fill: { k: 'poly', pts: REGIONS.tibet, c: C.violet, clip: ['CN'] }, a: 0.5 }, { fill: { k: 'poly', pts: LOESS_PLATEAU, c: C.brown }, t: 0.8, a: 0.6 }],
        marks: [mk([33, 89], 'Qinghai–Tibet Plateau: > 4,000 m', '青藏高原：4000 米以上', { big: true, c: C.violet, t: 0.4 }), mk([37, 108.5], 'Loess Plateau', '黄土高原', { c: C.brown, t: 1 }),
          mk([42.8, 112], 'Inner Mongolia Plateau', '内蒙古高原', { c: C.gold, t: 1.4 }), mk([25.8, 105], 'Yunnan–Guizhou Plateau', '云贵高原', { c: C.gold, t: 1.8 })],
        body: ['Plateaus are high (usually above 500 m) and large, with a wide, fairly flat top and steep edges. The Qinghai–Tibet Plateau covers about 2.5 million km² at an average height above 4,000 m, the highest in the world: the "roof of the world". China\'s four great plateaus look very different: Tibet is high, cold and dotted with snow peaks; the Inner Mongolia Plateau is flat grassland; the Loess Plateau is cut into gullies; the Yunnan–Guizhou Plateau is broken into karst hills and gorges.',
          '高原海拔较高，一般在 500 米以上，面积广大，顶面比较平坦，边缘比较陡峭。青藏高原面积约 250 万平方千米，平均海拔 4000 米以上，是世界上最高的高原，被称为“世界屋脊”。我国四大高原各有特色：青藏高原高寒，雪山连绵；内蒙古高原地面坦荡，草原辽阔；黄土高原千沟万壑；云贵高原地形崎岖，喀斯特地貌广布。'],
      },
      {
        title: ['Mountains: peaks in long ranges', '山地：连绵的山脉'], cam: [30, 84, 2.2], items: ['everest', 'an_snowleopard'],
        paint: [{ fill: { k: 'poly', pts: REGIONS.himalaya, c: C.white }, a: 0.55 }],
        marks: [mk(EVEREST, 'Everest 8,848.86 m', '珠穆朗玛峰 8848.86 米', { dot: true, c: C.gold, t: 0.6 }), mk([27.7, 88.15], 'Kangchenjunga 8,586 m', '干城章嘉峰 8586 米', { dot: true, c: C.white, t: 1.1 }),
          mk([35.88, 76.51], 'K2 8,611 m (Karakoram)', '乔戈里峰 8611 米（喀喇昆仑山）', { dot: true, c: C.white, t: 1.5 })],
        fig: { k: 'pie', title: ['China\'s land by landform', '我国各类地形面积比例'], parts: [
          { name: ['Mountains', '山地'], v: 33.3, c: SHARE_C.mtn }, { name: ['Plateaus', '高原'], v: 26, c: SHARE_C.plateau }, { name: ['Basins', '盆地'], v: 18.8, c: SHARE_C.basin },
          { name: ['Plains', '平原'], v: 12, c: SHARE_C.plain }, { name: ['Hills', '丘陵'], v: 9.9, c: SHARE_C.hill }] },
        body: ['Mountains are high (usually above 500 m), with sharp peaks, steep slopes and deep valleys, and they usually run in long ranges. The Himalaya, about 2,400 km long, holds ten of the world\'s fourteen peaks above 8,000 m, including Everest (8,848.86 m, measured by China and Nepal in 2020). Mountains cover a third of China, more than any other landform. They are hard to farm or cross, but rich in forests, minerals, water power and scenery.',
          '山地海拔较高，一般在 500 米以上，峰峦起伏，坡度陡峻，沟谷幽深，一般多呈脉状分布，称为山脉。喜马拉雅山脉长约 2400 千米，世界上 14 座 8000 米以上的高峰中有 10 座在这里，其中珠穆朗玛峰高 8848.86 米（2020 年中尼两国共同测定）。山地约占我国陆地面积的三分之一，比例最大；山区耕作和交通不便，但森林、矿产、水能和旅游资源丰富。'],
      },
      {
        title: ['Hills: low and rolling', '丘陵：低缓起伏'], cam: [26.5, 114.5, 1.9], items: ['cn_huangshan', 'cn_guilin'],
        paint: [{ fill: { k: 'poly', pts: REGIONS.southeastHills, c: C.lime }, a: 0.5 }],
        marks: [mk([27.6, 114], 'Jiangnan Hills', '江南丘陵', { c: C.lime, t: 0.4 }), mk([26.6, 118.6], 'Zhe–Min Hills', '浙闽丘陵', { c: C.lime, t: 0.8 }),
          mk([23.6, 112], 'Liangguang Hills', '两广丘陵', { c: C.lime, t: 1.2 }), mk([30.13, 118.17], 'Huangshan 1,864 m', '黄山 1864 米', { dot: true, c: C.white, t: 1.6 })],
        task: ['Tilt the globe to look along the ground: the hills roll, but Huangshan stands out as a true mountain.', '倾斜地球贴地看：丘陵连绵起伏，而黄山明显高出一截，是真正的山地。'],
        body: ['Hills are low (mostly below 500 m) with gentle, rounded slopes; the rise from valley to top is usually less than 200 m. The Southeast Hills of China, south of the Yangtze, are made of the Jiangnan, Zhe–Min and Liangguang hills, mostly 200–600 m high, with true mountains such as Huangshan (1,864 m) rising above them. Rain is plentiful here, so hillsides are terraced for rice and tea, planted with fruit and bamboo, and the karst hills around Guilin draw tourists from all over the world.',
          '丘陵海拔较低，一般在 500 米以下，坡度和缓，地势起伏，相对高度一般不超过 200 米。长江以南的东南丘陵由江南丘陵、浙闽丘陵和两广丘陵组成，海拔多在 200—600 米，其间耸立着黄山（1864 米）等山地。这里降水丰富，山坡上修筑梯田种植水稻和茶树，或种植果树、竹林；桂林一带的喀斯特丘陵更是闻名世界的旅游胜地。'],
      },
      {
        title: ['Basins: bowls among mountains', '盆地：群山环抱'], cam: [37, 94, 3], items: ['leshan'],
        paint: [{ fill: { k: 'poly', pts: REGIONS.sichuan, c: C.orange }, a: 0.6 }, { fill: { k: 'poly', pts: REGIONS.tarim, c: C.brown }, t: 0.5, a: 0.6 },
          { fill: { k: 'poly', pts: JUNGGAR, c: C.gold }, t: 1, a: 0.55 }, { fill: { k: 'poly', pts: QAIDAM, c: C.pink }, t: 1.5, a: 0.6 }],
        marks: [mk([30.5, 105.6], 'Sichuan Basin: 250–750 m', '四川盆地：海拔 250—750 米', { c: C.orange, t: 0.3 }), mk([39.4, 83.5], 'Tarim: China\'s largest', '塔里木盆地：我国最大', { c: C.brown, t: 0.8 }),
          mk([45.7, 86.5], 'Junggar Basin', '准噶尔盆地', { c: C.gold, t: 1.3 }), mk([37.2, 94.5], 'Qaidam: floor 2,600–3,000 m', '柴达木盆地：海拔 2600—3000 米', { c: C.pink, t: 1.8 })],
        task: ['Tilt the globe to look along the ground: find the mountains that ring each basin.', '倾斜地球，贴着地面看：找出环绕各个盆地的山脉。'],
        body: ['A basin is high all round (mountains or plateaus) and low in the middle, like a bowl; its floor may be plain or hills. China has four great basins. The Tarim Basin (about 530,000 km²) is the largest and holds the Taklimakan Desert; the warm, wet Sichuan Basin, its floor 250–750 m, is so fertile it is called the "Land of Abundance". The Qaidam Basin shows the key point: its floor is 2,600–3,000 m above sea level, higher than many mountains, yet it is a basin because of its shape.',
          '盆地四周高（山地或高原），中部低（平原或丘陵），形似盆状。我国有四大盆地：塔里木盆地面积约 53 万平方千米，是我国最大的盆地，盆地中有塔克拉玛干沙漠；四川盆地底部海拔 250—750 米，气候温暖湿润，物产丰富，被誉为“天府之国”。柴达木盆地说明了一个关键：它的底部海拔 2600—3000 米，比许多山还高，但因为“四周高、中间低”，仍然是盆地。'],
      },
      {
        title: ['The world\'s biggest landforms', '世界地形之最'], cam: [-10, -25, 4.6], wide: true, items: ['pl_kapok', 'iguazu', 'machupicchu'],
        paint: [{ fill: { k: 'poly', pts: REGIONS.amazon, c: C.green }, a: 0.55 }, { fill: { k: 'poly', pts: BRAZIL_PLATEAU, c: C.violet }, t: 0.6, a: 0.5 },
          { fill: { k: 'poly', pts: CONGO_BASIN, c: C.orange }, t: 1.2, a: 0.55 }],
        lines: [{ pts: ANDES, c: C.white, w: 2.2, t: 1.6, dur: 2.4 }],
        marks: [mk([-4, -64], 'Amazon Plain', '亚马孙平原', { big: true, c: C.green, t: 0.3 }), mk([-14, -46], 'Brazilian Plateau', '巴西高原', { big: true, c: C.violet, t: 0.9 }),
          mk([-1.5, 21], 'Congo Basin', '刚果盆地', { big: true, c: C.orange, t: 1.5 }), mk([-32.65, -70.01], 'Andes · Aconcagua 6,961 m', '安第斯山脉 · 阿空加瓜山 6961 米', { dot: true, c: C.white, t: 2.2 })],
        fig: { k: 'bars', title: ['Area of some landform regions (approx.)', '部分地形区的面积（约）'], unit: ['million km²', '百万平方千米'], rows: [
          { name: ['Amazon Plain', '亚马孙平原'], v: 5.6, c: C.green }, { name: ['Brazilian Plateau', '巴西高原'], v: 5.0, c: C.violet }, { name: ['Congo Basin', '刚果盆地'], v: 3.37, c: C.orange },
          { name: ['Qinghai–Tibet Plateau', '青藏高原'], v: 2.5, c: C.violet }, { name: ['Tarim Basin', '塔里木盆地'], v: 0.53, c: C.brown }, { name: ['North China Plain', '华北平原'], v: 0.3, c: C.green }] },
        body: ['The world records sit on either side of the South Atlantic. The Amazon Plain (about 5.6 million km²) is the largest plain, built by the river with the most water on Earth and covered by rainforest. Next to it, the Brazilian Plateau (about 5 million km²) is the largest plateau, and rivers tumble off its edge in waterfalls such as Iguazú. Across the ocean, the Congo Basin (about 3.4 million km²) is the largest basin. Along the west coast, the Andes run about 8,900 km, the longest range on land.',
          '世界地形之最分布在南大西洋两岸。亚马孙平原面积约 560 万平方千米，是世界上最大的平原，由世界上流量最大的亚马孙河冲积而成，覆盖着热带雨林。它南边的巴西高原面积约 500 万平方千米，是世界上面积最大的高原，河流从高原边缘跌落，形成伊瓜苏瀑布等大瀑布。大西洋对岸的刚果盆地面积约 340 万平方千米，是世界上最大的盆地。南美洲西岸的安第斯山脉长约 8900 千米，是陆地上最长的山脉。'],
      },
      {
        title: ['Landforms under the sea', '海底地形'], cam: [22, 134, 3.4], sketch: true, items: ['dc_challenger'],
        fig: { k: 'svg', draw: seaFloorFig },
        lines: [{ pts: ECS_SHELF_EDGE, c: C.teal, w: 1.8, dur: 1.6 }, { pts: MARIANA, c: C.red, w: 2.2, t: 1.2, dur: 1.8 }],
        marks: [mk([30.5, 124.5], 'East China Sea shelf: < 200 m', '东海大陆架：水深不足 200 米', { c: C.teal, t: 0.5 }), mk([28.3, 128.2], 'Shelf edge', '大陆架外缘', { c: C.teal, t: 1.2 }),
          mk([17, 149], 'Mariana Trench', '马里亚纳海沟', { big: true, c: C.red, t: 1.6 }), mk(CHALLENGER, 'Challenger Deep ≈ 10,935 m', '挑战者深渊 约 10935 米', { dot: true, c: C.red, t: 2.2 })],
        body: ['The sea floor has landforms like the land. Next to the coast lies the continental shelf, less than 200 m deep: the Bohai and Yellow Seas sit entirely on it, and the East China Sea shelf (its edge drawn in teal) is one of the widest in the world, rich in fish, oil and gas. Beyond it the continental slope drops to ocean basins 3,000–6,000 m deep, crossed by long mid-ocean ridges. The deepest places are narrow trenches: the Mariana Trench reaches about 10,935 m (older books give 11,034 m), and in 2020 China\'s crewed submersible Fendouzhe dived to 10,909 m there.',
          '海底和陆地一样起伏不平。紧靠大陆的是大陆架，水深不到 200 米：渤海、黄海全部位于大陆架上，东海大陆架（青色线为其外缘）是世界上最宽的大陆架之一，渔业和油气资源丰富。大陆架以外，大陆坡陡然下降到水深 3000—6000 米的海盆，海盆中绵延着海岭（海底山脉）。最深的地方是狭长的海沟：马里亚纳海沟深约 10935 米（旧资料为 11034 米），2020 年我国“奋斗者”号载人潜水器在这里下潜到 10909 米。'],
      },
    ],
    quiz: [
      { q: ['A region 300–700 m high is flat in the middle and ringed by mountains 1,000–3,000 m high. It is a…', '某地区海拔 300—700 米，中部平坦，四周被海拔 1000—3000 米的山地环绕，这种地形是'],
        options: [['Basin', '盆地'], ['Plateau', '高原'], ['Plain', '平原'], ['Hills', '丘陵']], answer: 0,
        why: ['Shape decides it: high all round and low in the middle is a basin, like the Sichuan Basin. Its floor is above 500 m in places, but that does not make it a plateau, which would stand higher than its surroundings.', '判断依据是形态：四周高、中间低就是盆地，例如四川盆地。它虽然部分海拔超过 500 米，但不是高原，因为高原比周围高，而它比周围低。'] },
      { q: ['Match each landform to its description.', '把地形和它的特征连起来。'],
        match: [[['Plain', '平原'], ['Low and flat, mostly under 200 m', '海拔多在 200 米以下，地面平坦']], [['Plateau', '高原'], ['High, with a wide, fairly flat top and steep edges', '海拔较高，顶面宽广平坦，边缘陡峭']],
          [['Mountains', '山地'], ['High, with peaks and steep slopes', '海拔较高，峰峦起伏，坡度陡峻']], [['Hills', '丘陵'], ['Mostly under 500 m, with gentle rolling slopes', '海拔多在 500 米以下，坡度和缓，起伏连绵']]],
        why: ['Height and relief tell them apart: plains and hills are low (plains are flat, hills roll); plateaus and mountains are high (plateaus have flat tops, mountains sharp peaks).', '海拔和起伏是区分的关键：平原和丘陵海拔低（平原平坦，丘陵起伏）；高原和山地海拔高（高原顶面平坦，山地峰峦起伏）。'] },
      { q: ['Label these landform regions of China on the globe.', '在地球上标出我国的这些地形区。'],
        place: [{ text: ['North China Plain', '华北平原'], at: [36.5, 115.8], tolKm: 450 }, { text: ['Qinghai–Tibet Plateau', '青藏高原'], at: [33, 89], tolKm: 800 },
          { text: ['Sichuan Basin', '四川盆地'], at: [30.4, 105.5], tolKm: 350 }, { text: ['Tarim Basin', '塔里木盆地'], at: [39.4, 83.5], tolKm: 500 }],
        why: ['The plateau fills the south-west; the Sichuan Basin lies just east of it; the Tarim Basin lies north of it, between the Tian Shan and the Kunlun; the North China Plain lies by the Bohai and Yellow Seas.', '青藏高原在西南部，四川盆地在它的东侧，塔里木盆地在它的北面、天山与昆仑山之间，华北平原濒临渤海、黄海。'] },
      { q: ['You travel east along about 30°N from Lhasa to Shanghai. Put the landforms you cross in order.', '沿北纬 30° 附近从拉萨向东到上海，把沿途经过的地形区排序。'],
        order: [['Qinghai–Tibet Plateau', '青藏高原'], ['Hengduan Mountains', '横断山区'], ['Sichuan Basin', '四川盆地'], ['Middle–Lower Yangtze Plain', '长江中下游平原']],
        why: ['Lhasa is on the plateau; its eastern edge is cut into the north–south ridges of the Hengduan Mountains; then you drop into the Sichuan Basin, pass the Three Gorges and reach the plain by the sea. China\'s land steps down from west to east.', '拉萨位于青藏高原；高原东缘是南北走向的横断山区；向东进入四川盆地，穿过三峡后到达长江中下游平原直至海边。我国地势西高东低。'] },
      { q: ['Which statements about basins are true? Pick all that apply.', '关于盆地，下列说法正确的有（多选）'],
        options: [['A basin floor can be thousands of metres above sea level', '盆地底部可以高出海平面几千米'], ['The Sichuan Basin is ringed by mountains and plateaus', '四川盆地四周被山地和高原环绕'], ['The Tarim Basin is China\'s largest basin', '塔里木盆地是我国最大的盆地'],
          ['A basin always lies below sea level', '盆地一定低于海平面'], ['A basin is always wetter than the mountains round it', '盆地一定比周围山地湿润']], multi: [0, 1, 2],
        why: ['Basins are defined by shape. The Qaidam floor is 2,600–3,000 m up, and only a few basins (the Turpan Basin, the Dead Sea) dip below sea level. Mountains often block moist air, so basins such as the Tarim are very dry.', '盆地按形态划分。柴达木盆地底部海拔 2600—3000 米，只有少数盆地（如吐鲁番盆地、死海所在洼地）低于海平面。四周山地常阻挡湿润气流，塔里木盆地等反而十分干旱。'] },
      { q: ['Tap the world\'s largest plain.', '在地球上点出世界上面积最大的平原。'], at: [-4, -63], tolKm: 900,
        why: ['The Amazon Plain, about 5.6 million km², spreads along the Amazon River in northern South America, near the equator.', '亚马孙平原面积约 560 万平方千米，分布在南美洲北部、赤道附近的亚马孙河流域。'] },
      { q: ['Everest is 8,849 m high and Challenger Deep is about 10,935 m deep. What is the height difference between them, in kilometres?', '珠穆朗玛峰高 8849 米，挑战者深渊深约 10935 米。二者高差约多少千米？'], num: { answer: 19.8, tol: 0.3, unit: ['km', '千米'] },
        why: ['8,849 + 10,935 = 19,784 m ≈ 19.8 km. If Everest stood in the trench, its summit would still be about 2 km under water.', '8849 + 10935 = 19784 米，约 19.8 千米。把珠峰放进马里亚纳海沟，峰顶离海面还有约 2 千米。'] },
      { q: ['Fishing grounds and offshore oil rigs are mostly on the…', '近海渔场和海上油气平台大多位于'], options: [['Continental shelf', '大陆架'], ['Ocean trench', '海沟'], ['Mid-ocean ridge', '海岭'], ['Deep ocean basin', '深海海盆']], answer: 0,
        why: ['The shelf is under 200 m deep and close to land: sunlight reaches the bottom, rivers bring nutrients, and its thick sediments hold oil and gas within reach of drilling.', '大陆架水深不到 200 米，靠近陆地：阳光能照到海底，河流带来营养物质，深厚的沉积层中蕴藏油气，也便于开采。'] },
    ],
  },
  {
    id: 'continents', strand: 'physical', tracks: ['uk', 'us', 'ib', 'au'], grade: 'g7a', unit: land, icon: 'globe', minutes: 9,
    title: ['Seven continents, four oceans', '七大洲和四大洋'],
    blurb: ['How much of the Earth is sea, what continents, islands and peninsulas are, where each continent ends, and which straits join the oceans.', '地球上海洋占多少，什么是大陆、岛屿和半岛，各大洲的分界在哪里，哪些海峡连通大洋。'],
    keys: [
      ['The Earth\'s surface is about 510 million km²: 71% sea and 29% land, so it is "seven parts sea, three parts land".', '地球表面积约 5.1 亿平方千米，海洋约占 71%，陆地约占 29%，“七分海洋，三分陆地”。'],
      ['A continent is a mainland plus the islands near it; an island is land surrounded by water, a peninsula is surrounded on three sides.', '大陆和它附近的岛屿合起来称为大洲；四面环水的陆地叫岛屿，三面临水的陆地叫半岛。'],
      ['Seven continents by area: Asia, Africa, North America, South America, Antarctica, Europe, Oceania.', '七大洲按面积从大到小：亚洲、非洲、北美洲、南美洲、南极洲、欧洲、大洋洲。'],
      ['Boundaries: Urals–Ural River–Caspian–Caucasus–Turkish Straits (Asia/Europe), Suez Canal (Asia/Africa), Panama Canal (N/S America), Bering Strait (Asia/N America).', '分界线：乌拉尔山脉—乌拉尔河—里海—大高加索山脉—土耳其海峡（亚/欧），苏伊士运河（亚/非），巴拿马运河（南/北美），白令海峡（亚/北美）。'],
      ['Four oceans: Pacific (largest, deepest), Atlantic, Indian and Arctic (smallest); straits such as Malacca and Gibraltar join them.', '四大洋：太平洋（最大最深）、大西洋、印度洋、北冰洋（最小）；马六甲、直布罗陀等海峡把它们连在一起。'],
    ],
    steps: [
      {
        title: ['Seven parts sea, three parts land', '七分海洋，三分陆地'], cam: [-47, 178, 4.8], wide: true,
        paint: [{ fill: { k: 'oceans' }, a: 0.5 }],
        marks: [mk([-47, 178], 'Centre of the water hemisphere', '水半球中心', { dot: true, c: C.ice, t: 0.6 }), mk([-41.3, 174.8], 'New Zealand', '新西兰', { c: C.white, t: 1.1 })],
        fig: { k: 'pie', title: ['The Earth\'s surface, 510 million km²', '地球表面积约 5.1 亿平方千米'], parts: [{ name: ['Sea', '海洋'], v: 71, c: C.blue }, { name: ['Land', '陆地'], v: 29, c: C.brown }] },
        task: ['Turn the globe until you see the most land you can (look near France), then come back to this water side.', '转动地球，找到陆地最多的一面（看看法国附近），再转回这片“水的一面”。'],
        body: ['The Earth\'s surface covers about 510 million km². Some 361 million km² of it, 71%, is sea; only 149 million km², 29%, is land. The land is unevenly spread: about two-thirds of it is in the northern hemisphere, and even the "land hemisphere" centred near France is still a little more than half water. Look from above New Zealand and you see the "water hemisphere", about 89% ocean. That is why the Earth looks blue from space.',
          '地球表面积约 5.1 亿平方千米，其中海洋约 3.61 亿平方千米，占 71%；陆地约 1.49 亿平方千米，只占 29%。海陆分布很不均匀：约三分之二的陆地集中在北半球；即使是以法国附近为中心的“陆半球”，海洋面积也略多于陆地。从新西兰上空看到的“水半球”，约 89% 是海洋。所以从太空看，地球是一颗蓝色的星球。'],
      },
      {
        title: ['Continents, islands and peninsulas', '大陆、岛屿和半岛'], cam: [48, 5, 4.4],
        paint: [{ fill: { k: 'land', a2: ['GL'], c: C.ice }, a: 0.6 }, { fill: { k: 'land', a2: ['SA', 'YE', 'OM', 'AE', 'QA', 'KW'], c: C.orange }, t: 0.6, a: 0.6 },
          { fill: { k: 'land', a2: ['GB', 'IE'], c: C.teal }, t: 1.2, a: 0.6 }, { fill: { k: 'land', a2: ['IT'], c: C.pink }, t: 1.6, a: 0.6 }],
        marks: [mk([72, -40], 'Greenland: largest island', '格陵兰岛：最大的岛屿', { big: true, c: C.ice, t: 0.3 }), mk([23, 46], 'Arabian Peninsula: largest', '阿拉伯半岛：最大的半岛', { big: true, c: C.orange, t: 0.9 }),
          mk([54, -2.5], 'Great Britain (island)', '大不列颠岛', { c: C.teal, t: 1.4 }), mk([42.5, 13], 'Apennine Peninsula', '亚平宁半岛', { c: C.pink, t: 1.8 }), mk([55, 60], 'Eurasia: one mainland', '亚欧大陆', { c: C.gold, t: 2.2 })],
        task: ['Find the Iberian and Scandinavian peninsulas too: which seas surround each on three sides?', '再找一找伊比利亚半岛和斯堪的纳维亚半岛：它们三面分别临哪些海？'],
        body: ['A mainland is a huge block of land; a smaller piece surrounded by water on all sides is an island, and land jutting into the sea with water on three sides is a peninsula. A continent is a mainland together with the islands near it. Greenland (about 2.17 million km²) is the largest island, and the Arabian Peninsula (about 3 million km²) the largest peninsula. Asia and Europe share one mainland, Eurasia, the largest on Earth.',
          '面积广大的陆地叫大陆；四面环水的小块陆地叫岛屿；陆地伸进海洋、三面临水的部分叫半岛。大陆和它周围的岛屿合起来称为大洲。格陵兰岛面积约 217 万平方千米，是世界上最大的岛屿；阿拉伯半岛面积约 300 万平方千米，是世界上最大的半岛。亚洲和欧洲共处一块大陆——亚欧大陆，它是世界上面积最大的大陆。'],
      },
      {
        title: ['Seven continents', '七大洲'], cam: [20, 60, 5.2], wide: true,
        paint: (['asia', 'africa', 'north-america', 'south-america', 'antarctica', 'europe', 'oceania'] as const).map((c, i) => ({ fill: { k: 'continents' as const, only: [c] }, t: i * 0.45, a: 0.65 })),
        fig: { k: 'bars', title: ['Area of the seven continents', '七大洲的面积'], unit: ['million km²', '百万平方千米'], rows: [
          { name: ['Asia', '亚洲'], v: 44, c: CONT.asia }, { name: ['Africa', '非洲'], v: 30.2, c: CONT.africa }, { name: ['North America', '北美洲'], v: 24.2, c: CONT.na },
          { name: ['South America', '南美洲'], v: 18.0, c: CONT.sa }, { name: ['Antarctica', '南极洲'], v: 14, c: CONT.antarctica }, { name: ['Europe', '欧洲'], v: 10.2, c: CONT.europe }, { name: ['Oceania', '大洋洲'], v: 9.0, c: CONT.oceania }] },
        task: ['Spin the globe and find all seven, then notice which ones lie wholly in one hemisphere.', '转动地球找出全部七个大洲，再看看哪些大洲完全位于一个半球。'],
        marks: [mk([45, 95], '1 Asia', '① 亚洲', { t: 0.2, big: true }), mk([5, 20], '2 Africa', '② 非洲', { t: 0.65, big: true }), mk([45, -100], '3 North America', '③ 北美洲', { t: 1.1, big: true }),
          mk([-15, -60], '4 South America', '④ 南美洲', { t: 1.55, big: true }), mk([-80, 30], '5 Antarctica', '⑤ 南极洲', { t: 2, big: true }), mk([52, 15], '6 Europe', '⑥ 欧洲', { t: 2.45, big: true }), mk([-25, 135], '7 Oceania', '⑦ 大洋洲', { t: 2.9, big: true })],
        body: ['From largest to smallest: Asia, Africa, North America, South America, Antarctica, Europe and Oceania. Asia (about 44 million km²) is almost a third of all land and nearly five times the size of Oceania (about 9 million km²). Antarctica, almost buried under ice, is bigger than Europe or Oceania. North America and Europe lie wholly in the northern hemisphere and Antarctica wholly in the southern; the equator runs through the middle of Africa and across northern South America.',
          '按面积从大到小：亚洲、非洲、北美洲、南美洲、南极洲、欧洲、大洋洲。亚洲面积约 4400 万平方千米，约占世界陆地的三分之一，差不多是大洋洲（约 900 万平方千米）的 5 倍。几乎被冰雪覆盖的南极洲比欧洲和大洋洲都大。北美洲和欧洲全部位于北半球，南极洲全部位于南半球；赤道穿过非洲中部和南美洲北部。'],
      },
      {
        title: ['Where Asia, Europe and Africa meet', '亚、欧、非三洲的分界'], cam: [40, 38, 2.8], items: ['ar_troy', 'cc_gergeti'],
        paint: [{ fill: { k: 'continents', only: ['asia', 'europe', 'africa'] }, a: 0.4 }],
        lines: [{ pts: ASIA_EUROPE, c: C.gold, w: 1.8, dur: 2.4 }, { pts: SUEZ, c: C.red, w: 2.2, t: 2.2, dur: 0.8 }],
        marks: [mk([58, 59.5], 'Ural Mountains', '乌拉尔山脉', { c: C.gold, t: 0.4 }), mk([48, 52], 'Ural River', '乌拉尔河', { c: C.gold, t: 0.9 }), mk([42, 50.5], 'Caspian Sea', '里海', { c: C.gold, t: 1.3 }),
          mk([43, 43.5], 'Greater Caucasus', '大高加索山脉', { c: C.gold, t: 1.7 }), mk([41.1, 29.05], 'Turkish Straits', '土耳其海峡', { c: C.gold, t: 2.1 }), mk([30.6, 32.35], 'Suez Canal', '苏伊士运河', { c: C.red, t: 2.5, dot: true })],
        body: ['Asia and Europe share one mainland, so their boundary was chosen along natural features: the Ural Mountains, the Ural River, the Caspian Sea, the Greater Caucasus and the Turkish Straits (the Bosporus, the Sea of Marmara and the Dardanelles). Istanbul lies on both sides of the Bosporus, so it stands in two continents. Asia and Africa meet at the Suez Canal (opened in 1869, about 190 km long), cut across the narrow Isthmus of Suez.',
          '亚洲和欧洲同处亚欧大陆，两洲以乌拉尔山脉、乌拉尔河、里海、大高加索山脉和土耳其海峡（博斯普鲁斯海峡、马尔马拉海和达达尼尔海峡）为界。伊斯坦布尔横跨博斯普鲁斯海峡两岸，地跨亚、欧两洲。亚洲和非洲以苏伊士运河为界，运河 1869 年通航，长约 190 千米，开凿在狭窄的苏伊士地峡上。'],
      },
      {
        title: ['The Americas and the far north', '美洲与白令海峡'], cam: [35, -125, 4.8], wide: true, items: ['cb_panamacanal'],
        paint: [{ fill: { k: 'continents', only: ['north-america', 'south-america'] }, a: 0.45 }],
        lines: [{ pts: PANAMA, c: C.red, w: 2.2, t: 0.4, dur: 0.8 }, { pts: BERING, c: C.red, w: 2.2, t: 1.2, dur: 0.8 }],
        marks: [mk([9.1, -79.7], 'Panama Canal', '巴拿马运河', { c: C.red, t: 0.6, dot: true }), mk([66, -169], 'Bering Strait', '白令海峡', { c: C.red, t: 1.4, dot: true }),
          mk([-58, -65], 'Drake Passage', '德雷克海峡', { c: C.ice, t: 2 })],
        body: ['North and South America are joined by the narrow Isthmus of Panama; the Panama Canal (opened in 1914, about 82 km long) cuts across it and is the boundary between the two continents. In the far north, the Bering Strait, only about 85 km wide, separates Asia (Russia) from North America (Alaska). South America is parted from Antarctica by the Drake Passage, the widest strait in the world.',
          '北美洲和南美洲由狭窄的巴拿马地峡相连，开凿在地峡上的巴拿马运河（1914 年通航，长约 82 千米）是南、北美洲的分界线。在北方，宽约 85 千米的白令海峡把亚洲（俄罗斯）和北美洲（美国阿拉斯加）分开。南美洲和南极洲之间隔着德雷克海峡，它是世界上最宽的海峡。'],
      },
      {
        title: ['Four oceans', '四大洋'], cam: [10, -150, 5.4], wide: true,
        paint: (['pacific', 'atlantic', 'indian', 'arctic'] as const).map((o, i) => ({ fill: { k: 'oceans' as const, only: [o] }, t: i * 0.6, a: 0.6 })),
        marks: [mk([0, -150], 'Pacific: largest and deepest', '太平洋：最大最深', { big: true, t: 0.3 }), mk([20, -40], 'Atlantic', '大西洋', { big: true, t: 0.9 }),
          mk([-20, 80], 'Indian Ocean', '印度洋', { big: true, t: 1.5 }), mk([82, 0], 'Arctic: smallest', '北冰洋：最小', { big: true, t: 2.1 })],
        fig: { k: 'bars', title: ['Area of the four oceans', '四大洋的面积'], unit: ['million km²', '百万平方千米'], rows: [
          { name: ['Pacific', '太平洋'], v: 179.7, c: OCEAN.pacific }, { name: ['Atlantic', '大西洋'], v: 93.4, c: OCEAN.atlantic }, { name: ['Indian', '印度洋'], v: 74.9, c: OCEAN.indian }, { name: ['Arctic', '北冰洋'], v: 13.1, c: OCEAN.arctic }] },
        body: ['The Pacific (about 180 million km²) is the largest and deepest ocean, bigger than all the land put together, and it holds the Mariana Trench. The Atlantic, shaped like a long "S", is second; the Indian Ocean lies mostly in the southern hemisphere; the Arctic Ocean, round the North Pole, is the smallest and shallowest and is partly frozen all year. Some geographers also count a Southern Ocean round Antarctica, but the Chinese textbook uses four.',
          '太平洋面积约 1.8 亿平方千米，是面积最大、最深的大洋，比全世界陆地面积的总和还大，马里亚纳海沟就在太平洋中。大西洋呈“S”形，面积居第二；印度洋大部分位于南半球；北冰洋环绕北极，面积最小、最浅，终年有海冰覆盖。也有地理学家把环绕南极洲的水域单列为南大洋，我国教材采用四大洋的划分。'],
      },
      {
        title: ['Seas and straits', '海和海峡'], cam: [24, 58, 4.8], wide: true, items: ['marinabay'],
        marks: [mk([35.95, -5.6], 'Strait of Gibraltar', '直布罗陀海峡', { dot: true, c: C.gold, t: 0.3 }), mk([35, 18], 'Mediterranean Sea', '地中海', { c: C.blue, t: 0.7 }),
          mk([26.6, 56.4], 'Strait of Hormuz', '霍尔木兹海峡', { dot: true, c: C.gold, t: 1.1 }), mk([2.5, 101.3], 'Strait of Malacca', '马六甲海峡', { dot: true, c: C.gold, t: 1.5 }),
          mk([14, 114], 'South China Sea', '南海', { c: C.blue, t: 1.9 }), mk([24.5, 119.7], 'Taiwan Strait', '台湾海峡', { dot: true, c: C.gold, t: 2.3 })],
        task: ['Trace a tanker\'s route from the Persian Gulf to Shanghai and name each strait it passes.', '追踪一艘油轮从波斯湾到上海的航线，说出它经过的每一个海峡。'],
        body: ['The edges of the oceans, partly enclosed by land, are seas; the South China Sea (about 3.5 million km²) is China\'s largest sea, and the Mediterranean lies between Europe and Africa. A strait is a narrow channel joining two seas or oceans, and the busiest are vital trade routes. The Strait of Malacca links the Indian and Pacific Oceans and carries most of China\'s imported oil; the Strait of Hormuz is the only way out of the Persian Gulf, for about a fifth of the world\'s oil; the Strait of Gibraltar, only about 14 km wide, joins the Mediterranean to the Atlantic.',
          '大洋靠近陆地、被陆地部分包围的边缘部分叫海，南海面积约 350 万平方千米，是我国面积最大的海；地中海位于欧洲和非洲之间。连接两个海域的狭窄水道叫海峡，繁忙的海峡是重要的航运要道。马六甲海峡沟通印度洋和太平洋，我国进口的石油大部分要经过这里；霍尔木兹海峡是波斯湾通往外界的唯一通道，世界约五分之一的石油由此运出；直布罗陀海峡最窄处只有约 14 千米，连接地中海和大西洋。'],
      },
    ],
    quiz: [
      { q: ['Which continent lies wholly in the southern hemisphere?', '全部位于南半球的大洲是'], options: [['Antarctica', '南极洲'], ['Oceania', '大洋洲'], ['South America', '南美洲'], ['Africa', '非洲']], answer: 0,
        why: ['Antarctica surrounds the South Pole. Oceania includes islands north of the equator (such as Guam and part of Kiribati), and the equator crosses both South America and Africa.', '南极洲环绕南极点。大洋洲有部分岛屿位于赤道以北（如关岛、基里巴斯的部分岛屿），赤道还穿过南美洲和非洲。'] },
      { q: ['Put the continents in order of area, largest first.', '把七大洲按面积从大到小排序。'],
        order: [['Asia', '亚洲'], ['Africa', '非洲'], ['North America', '北美洲'], ['South America', '南美洲'], ['Antarctica', '南极洲'], ['Europe', '欧洲'], ['Oceania', '大洋洲']],
        why: ['Asia 44, Africa 30, North America 24, South America 18, Antarctica 14, Europe 10 and Oceania 9 million km². Antarctica beats Europe and Oceania, even though it looks thin on many maps.', '亚洲约 4400 万、非洲 3020 万、北美洲 2422 万、南美洲 1797 万、南极洲 1400 万、欧洲 1016 万、大洋洲 897 万平方千米。南极洲比欧洲和大洋洲都大。'] },
      { q: ['Match each boundary to the two continents it separates.', '把分界线和它分开的两个大洲连起来。'],
        match: [[['Suez Canal', '苏伊士运河'], ['Asia and Africa', '亚洲和非洲']], [['Panama Canal', '巴拿马运河'], ['North and South America', '北美洲和南美洲']], [['Bering Strait', '白令海峡'], ['Asia and North America', '亚洲和北美洲']], [['Ural Mountains', '乌拉尔山脉'], ['Asia and Europe', '亚洲和欧洲']]],
        why: ['Canals cut through the narrow necks of land (Suez, Panama); a strait separates Asia from North America; and the Urals with the Ural River, Caspian, Caucasus and Turkish Straits divide Asia from Europe.', '苏伊士运河和巴拿马运河开凿在狭窄的地峡上；白令海峡把亚洲和北美洲隔开；乌拉尔山脉、乌拉尔河、里海、大高加索山脉和土耳其海峡是亚洲和欧洲的分界。'] },
      { q: ['Find the Panama Canal.', '在地球上点出巴拿马运河。'], at: [9.1, -79.7], tolKm: 600,
        why: ['It cuts across the Isthmus of Panama, the narrow land joining North and South America.', '它横穿连接南、北美洲的巴拿马地峡。'] },
      { q: ['Label the four oceans: tap near the middle of each.', '标出四大洋：在每个大洋的中部附近点一下。'],
        place: [{ text: ['Pacific Ocean', '太平洋'], at: [5, -150], tolKm: 800 }, { text: ['Atlantic Ocean', '大西洋'], at: [15, -40], tolKm: 800 }, { text: ['Indian Ocean', '印度洋'], at: [-20, 78], tolKm: 800 }, { text: ['Arctic Ocean', '北冰洋'], at: [84, 0], tolKm: 800 }],
        why: ['The Pacific lies between Asia, Oceania and the Americas; the Atlantic between the Americas and Europe–Africa; the Indian Ocean south of Asia; the Arctic Ocean round the North Pole.', '太平洋位于亚洲、大洋洲和南北美洲之间；大西洋位于南北美洲和欧洲、非洲之间；印度洋在亚洲南面；北冰洋环绕北极。'] },
      { q: ['The Earth\'s surface is about 510 million km², and 71% of it is sea. About how many million km² is that?', '地球表面积约 5.1 亿平方千米，其中海洋占 71%。海洋面积约为多少百万平方千米？'], num: { answer: 362, tol: 4, unit: ['million km²', '百万平方千米'] },
        why: ['510 × 0.71 ≈ 362 million km². The Pacific alone is about half of it.', '510 × 0.71 ≈ 362 百万平方千米，即约 3.6 亿平方千米，仅太平洋就约占一半。'] },
      { q: ['Which of these are islands? Pick all that apply.', '下列地理事物中，属于岛屿的有（多选）'],
        options: [['Greenland', '格陵兰岛'], ['Great Britain', '大不列颠岛'], ['Madagascar', '马达加斯加岛'], ['Taiwan', '台湾岛'], ['Arabia', '阿拉伯半岛'], ['Korea', '朝鲜半岛']], multi: [0, 1, 2, 3],
        why: ['Islands have water on every side. Arabia and Korea are joined to the mainland on one side, so they are peninsulas.', '岛屿四面环水；阿拉伯半岛和朝鲜半岛一面与大陆相连、三面临水，是半岛。'] },
      { q: ['A tanker carries oil from the Persian Gulf to China. Which strait between the Indian and Pacific Oceans does it usually pass?', '一艘油轮从波斯湾运石油到中国，通常经过哪个沟通印度洋和太平洋的海峡？'],
        options: [['Strait of Malacca', '马六甲海峡'], ['Strait of Gibraltar', '直布罗陀海峡'], ['Bering Strait', '白令海峡'], ['Turkish Straits', '土耳其海峡']], answer: 0,
        why: ['It leaves the Gulf through Hormuz, crosses the Indian Ocean and enters the South China Sea through the Strait of Malacca, between the Malay Peninsula and Sumatra. Gibraltar and the Turkish Straits lead to the Mediterranean and Black Sea; the Bering Strait is in the Arctic.', '油轮经霍尔木兹海峡驶出波斯湾，横渡印度洋，再经马来半岛和苏门答腊岛之间的马六甲海峡进入南海。直布罗陀海峡和土耳其海峡分别通往地中海和黑海，白令海峡在北极附近。'] },
    ],
  },
  {
    id: 'plates', strand: 'physical', tracks: ['uk', 'us', 'ib', 'au'], grade: 'g7a', unit: land, icon: 'plates', minutes: 9,
    title: ['Plates on the move', '板块的运动'],
    blurb: ['Seas become land and land becomes sea. Six great plates drift slowly; where they collide, split or slide, mountains rise, rifts open and the ground shakes.', '沧海桑田，海陆变迁。六大板块缓慢漂移，在碰撞、张裂和错动的地方，山脉隆起、裂谷张开、地震频发。'],
    keys: [
      ['Land and sea keep changing ("seas become mulberry fields"), through crustal movement, sea-level change and human activity.', '海陆在不断变迁（沧海桑田），原因有地壳运动、海平面升降和人类活动。'],
      ['The lithosphere is broken into six great plates (Eurasian, African, American, Pacific, Indo-Australian, Antarctic) that move a few centimetres a year.', '岩石圈由六大板块组成（亚欧、非洲、美洲、太平洋、印度洋、南极洲板块），每年移动几厘米。'],
      ['Plate interiors are stable; boundaries are active. Collision builds mountains and trenches; splitting opens rift valleys and new oceans.', '板块内部比较稳定，交界地带比较活跃：碰撞挤压形成山脉、海沟，张裂拉伸形成裂谷、海洋。'],
      ['Most volcanoes and earthquakes lie on two belts: the Circum-Pacific and the Mediterranean–Himalayan.', '火山、地震主要分布在环太平洋火山地震带和地中海—喜马拉雅火山地震带。'],
      ['China lies where the Eurasian, Pacific and Indo-Australian plates meet, so its south-west and Taiwan have frequent strong earthquakes.', '我国位于亚欧板块、太平洋板块、印度洋板块的交界附近，西南地区和台湾地震多发。'],
    ],
    steps: [
      {
        title: ['Seas become land, land becomes sea', '沧海桑田'], cam: [36, 62, 4.6], wide: true, items: ['everest', 'windmill'],
        marks: [mk(EVEREST, 'Sea fossils near the top of Everest', '珠峰顶部的岩层中有海洋生物化石', { dot: true, c: C.gold, t: 0.3 }),
          mk([24.5, 119.6], 'Taiwan Strait: old riverbeds and forests on the sea floor', '台湾海峡海底：古河道和森林遗迹', { dot: true, c: C.blue, t: 1 }),
          mk([52.4, 4.9], 'Netherlands: about a quarter below sea level', '荷兰：约四分之一的国土低于海平面', { dot: true, c: C.green, t: 1.7 })],
        fig: { k: 'key', set: 'custom', title: ['Why land and sea change', '海陆变迁的原因'], items: [
          { c: C.gold, name: ['Crustal movement: the sea floor is lifted into mountains', '地壳运动：海底被抬升成高山'] },
          { c: C.blue, name: ['Sea-level change: ice ages lowered the sea about 120 m', '海平面升降：冰期海平面下降约 120 米'] },
          { c: C.green, name: ['Human activity: land reclaimed from the sea', '人类活动：填海造陆'] }] },
        body: ['The map of land and sea is never fixed. The limestone near the summit of Everest holds fossils of sea creatures: it formed on an ocean floor and was lifted nearly 9 km by moving plates. The Taiwan Strait is only about 60 m deep on average, and old riverbeds, tree stumps and mammal bones lie on its floor: in the last ice age the sea was about 120 m lower and people could walk from the mainland to Taiwan. People change the coast too: the Dutch have won much of their country from the sea with dykes and polders.',
          '海陆分布不是一成不变的。珠穆朗玛峰顶部的石灰岩中含有海洋生物化石，说明这里曾是海底，后来被板块运动抬升了近 9 千米。台湾海峡平均水深只有约 60 米，海底发现了古河道、古树和哺乳动物化石：末次冰期时海平面比现在低约 120 米，人们可以从大陆走到台湾。人类活动也在改变海岸线：荷兰人修筑堤坝、围海造陆，国土中有大片土地是从海洋中“夺”来的。'],
      },
      {
        title: ['Six great plates', '六大板块'], cam: [15, 60, 5.4], wide: true, follow: -60, clock: { mode: 'day', start: T.marchNoonChina, rate: 1 }, tectonics: true, sketch: true,
        marks: PLATES.map(([ll, text], i) => ({ ll, text, big: true, t: 0.3 + i * 0.3, c: C.gold })),
        fig: { k: 'key', set: 'custom', title: ['Plate boundaries on the globe', '地球上的板块边界'], items: [
          { c: TEC.ridge, name: ['Mid-ocean ridge: plates move apart', '海岭（洋中脊）：板块张裂'] }, { c: TEC.rift, name: ['Rift on land: a plate splits', '陆上裂谷：板块张裂'] },
          { c: TEC.trench, name: ['Trench: an ocean plate dives under', '海沟：大洋板块俯冲'] }, { c: TEC.collision, name: ['Collision: two continents meet', '碰撞带：大陆与大陆碰撞挤压'] },
          { c: TEC.transform, name: ['Transform fault: plates slide past', '转换断层：板块错动'] }] },
        task: ['The globe turns slowly. When the Pacific comes round, follow the edge of the Pacific Plate: which continents\' coasts does it run along?', '地球在慢慢转动。等太平洋转过来，沿着太平洋板块的边界走一圈：它经过了哪些大洲的沿岸？'],
        body: ['In 1912 Alfred Wegener proposed that the continents drift; in the 1960s, plate tectonics explained how. The Earth\'s rigid outer shell, the lithosphere, is broken into plates that ride on hot, slowly flowing rock below and move a few centimetres a year, about as fast as your fingernails grow. The textbook divides it into six great plates: Eurasian, African, American, Pacific, Indo-Australian and Antarctic. Plate interiors are fairly stable; the coloured lines mark the restless boundaries where plates meet.',
          '1912 年魏格纳提出大陆漂移假说；20 世纪 60 年代，板块构造学说解释了大陆为什么会移动。地球坚硬的外壳（岩石圈）被分割成若干板块，它们“漂浮”在炽热、缓慢流动的软流层上，每年移动几厘米，和指甲生长的速度差不多。教材把全球岩石圈划分为六大板块：亚欧板块、非洲板块、美洲板块、太平洋板块、印度洋板块和南极洲板块。板块内部比较稳定，图中彩色线条标出的板块交界地带则比较活跃。'],
      },
      {
        title: ['When continents collide', '大陆与大陆碰撞'], cam: [28, 84, 2.4], tectonics: true, items: ['everest'],
        fig: { k: 'svg', draw: bdyFig('collision') },
        lines: arrows([[[15, 78], [23, 79.5]], [[13, 84], [22, 85.5]], [[16, 90], [23.5, 90.5]]], C.red, 0.2, 2.2),
        marks: [mk([33, 88], 'Qinghai–Tibet Plateau', '青藏高原', { big: true, c: C.violet, t: 1 }), mk(EVEREST, 'Himalaya: still rising', '喜马拉雅山脉：仍在升高', { dot: true, c: C.gold, t: 1.6 }),
          mk([18, 79], 'India moves north ≈ 5 cm a year', '印度每年向北移动约 5 厘米', { c: C.red, t: 0.6 })],
        body: ['Where two plates push together, the crust is squeezed, folded and lifted. About 50 million years ago India, riding on the Indo-Australian Plate, ran into the Eurasian Plate. Neither continent would sink, so the crust crumpled and piled up to about 70 km thick, raising the Himalaya and the Qinghai–Tibet Plateau. India still pushes north at about 5 cm a year, so the mountains are still rising and earthquakes are common along the amber collision line.',
          '两个板块相互碰撞挤压的地方，地壳受挤压、弯曲、抬升。大约 5000 万年前，印度洋板块上的印度大陆与亚欧板块相撞，两块大陆都不易下沉，地壳被挤压堆叠、增厚到约 70 千米，隆起形成了喜马拉雅山脉和青藏高原。印度至今仍以每年约 5 厘米的速度向北推进，喜马拉雅山仍在升高，沿琥珀色的碰撞带地震频繁。'],
      },
      {
        title: ['When an ocean plate dives under', '大洋板块俯冲'], cam: [-20, -75, 3.2], tectonics: true, items: ['vo_cotopaxi', 'vo_villarrica'],
        fig: { k: 'svg', draw: bdyFig('subduction') },
        lines: [...arrows([[[-12, -90], [-12, -81]], [[-26, -86], [-26, -74.5]], [[-38, -84], [-38, -77]]], C.red, 0.2, 2), ...arrows([[[-16, -52], [-16, -61]]], C.orange, 0.9, 2)],
        marks: [mk([-20, -73.2], 'Peru–Chile Trench', '秘鲁—智利海沟', { c: C.red, t: 1 }), mk([-32.65, -70.01], 'Aconcagua 6,961 m', '阿空加瓜山 6961 米', { dot: true, c: C.white, t: 1.6 }),
          mk([-8, -66], 'American Plate', '美洲板块', { c: C.orange, t: 0.9 })],
        body: ['When an ocean plate meets a continent, the heavier ocean plate bends and sinks beneath it. Where it dives down, a deep trench forms: the Peru–Chile Trench, about 8,000 m deep, follows the west coast of South America. As the sinking slab heats up, rock melts and magma rises, building a chain of volcanoes on the land above, while the squeezed continent edge is pushed up into the Andes, with Aconcagua (6,961 m) the highest peak outside Asia. Japan and its trench formed the same way where the Pacific Plate dives under Asia.',
          '大洋板块与大陆板块相遇时，较重的大洋板块向下弯曲，俯冲到大陆板块之下。俯冲处形成深深的海沟：秘鲁—智利海沟深约 8000 米，沿南美洲西岸延伸。下沉的板块受热，岩石熔融，岩浆上涌，在陆地上形成一串火山；受挤压的大陆边缘隆起成安第斯山脉，其最高峰阿空加瓜山（6961 米）是亚洲以外的最高峰。太平洋板块俯冲到亚欧板块之下，也形成了日本海沟和日本列岛的火山。'],
      },
      {
        title: ['When a plate splits', '板块张裂'], cam: [5, 38, 2.6], tectonics: true, items: ['kilimanjaro', 'vo_ertaale', 'vo_nyiragongo'],
        fig: { k: 'svg', draw: bdyFig('rift') },
        lines: arrows([[[2, 29.5], [2, 24.5]], [[2, 38], [2, 43]], [[-7, 29], [-7, 24]], [[-7, 37], [-7, 42]], [[19.5, 40.6], [22, 45]], [[17.5, 37.8], [15.5, 33.5]]], C.red, 1.2, 1.5),
        marks: [mk([2, 36], 'East African Rift', '东非大裂谷', { big: true, c: TEC.rift, t: 0.4 }), mk([20, 38.6], 'Red Sea widening', '红海在扩张', { big: true, c: C.orange, t: 0.9 }),
          mk([11.5, 41.5], 'Afar', '阿法尔', { c: C.gold, t: 1.4 }), mk([-6, 29.6], 'Lake Tanganyika 1,470 m deep', '坦噶尼喀湖 深 1470 米', { c: C.blue, t: 1.8 })],
        body: ['Where a plate is pulled apart, the crust thins and cracks, blocks drop down between faults, and long rift valleys open. The East African Rift (yellow lines), a chain of rifts about 6,000 km long, is splitting eastern Africa away at about 6–7 mm a year; its floor holds long, deep lakes such as Lake Tanganyika (1,470 m deep) and volcanoes such as Kilimanjaro and Nyiragongo. Further north the split has gone further: the Red Sea is a young ocean, widening by about 1–1.5 cm a year as Arabia moves away from Africa. In millions of years, East Africa may become an island like Madagascar.',
          '板块受拉张的地方，地壳变薄、破裂，断层之间的岩块下陷，形成狭长的裂谷。东非大裂谷（黄色线）全长约 6000 千米，正以每年约 6—7 毫米的速度把非洲东部拉开；谷底分布着坦噶尼喀湖（深 1470 米）等狭长的深湖，两侧有乞力马扎罗山、尼拉贡戈火山等火山。再往北，张裂已经更进一步：红海是一个年轻的海洋，阿拉伯半岛正离开非洲，红海每年加宽约 1—1.5 厘米。数百万年后，东非有可能像马达加斯加岛一样从大陆分离出去。'],
      },
      {
        title: ['How a rift valley forms', '裂谷是怎样形成的'], astro: { kit: 'strata', mode: 'fault', kind: 'graben', clock: { from: 0, to: 100, rate: 25, unit: 'x', fmt: ['Fault movement', '断层运动'], once: true } },
        task: ['Drag the clock back to the start and replay it: watch which block moves along the two faults.', '把时间拖回起点再播放一遍：看两条断层之间哪一块岩块在移动。'],
        body: ['Pulling stretches the brittle crust until it breaks along faults, fractures where the rock on one side slips past the other. When the block between two faults drops down, it forms a rift valley (a graben) with steep, straight walls. Rivers and lakes gather in it, and the sinking floor can lie far below the land around: the shore of the Dead Sea, in a rift, is about 430 m below sea level, the lowest land on Earth. Earthquakes happen each time the blocks slip.',
          '拉张作用使脆性的地壳破裂，岩块沿破裂面发生明显的位移，形成断层。两条断层之间的岩块相对下降，就形成了谷壁陡直的裂谷（地堑）。河流、湖泊常在谷中汇集，谷底可以远低于周围地面：位于裂谷中的死海湖岸低于海平面约 430 米，是陆地最低处。岩块每错动一次，就可能发生一次地震。'],
      },
      {
        title: ['When plates slide past', '板块水平错动'], cam: [36, -119.5, 1.5], tectonics: true,
        lines: [{ pts: SAN_ANDREAS, c: C.pink, w: 2.4, dur: 2 }, ...arrows([[[34.2, -120.8], [35.7, -122.7]]], C.gold, 1.4, 2.2), ...arrows([[[37.6, -119.6], [36.1, -117.6]]], C.orange, 1.6, 2.2)],
        marks: [mk([37.77, -122.42], 'San Francisco', '旧金山', { dot: true, c: C.white, t: 0.6 }), mk([34.05, -118.24], 'Los Angeles', '洛杉矶', { dot: true, c: C.white, t: 0.9 }),
          mk([34.4, -121.6], 'Pacific Plate → NW', '太平洋板块 → 西北', { c: C.gold, t: 1.6 }), mk([37.3, -118.5], 'American Plate', '美洲板块', { c: C.orange, t: 1.8 })],
        body: ['At the third kind of boundary, two plates grind sideways past each other along a transform fault, so crust is neither made nor destroyed. The San Andreas Fault (pink) runs about 1,200 km through California: the Pacific Plate on its west side, carrying Los Angeles, creeps north-west past the American Plate by a few centimetres a year. The plates lock, strain builds up for decades, then slips at once: in 1906 a magnitude 7.9 earthquake on this fault shook San Francisco and fires burned much of the city.',
          '第三种板块边界上，两个板块沿转换断层水平错动，地壳既不生成也不消亡。圣安德烈亚斯断层（粉色线）纵贯美国加利福尼亚州，长约 1200 千米：断层西侧的太平洋板块（洛杉矶就在其上）相对美洲板块每年向西北移动几厘米。板块被卡住时应力逐年积累，到一定程度突然错动：1906 年，这条断层上发生 7.9 级大地震，旧金山大部分城区毁于地震和随后的大火。'],
      },
      {
        title: ['Volcano and earthquake belts', '火山地震带'], cam: [28, 118, 4.6], wide: true, tectonics: true, items: ['fuji', 'vo_pinatubo', 'vo_etna'],
        lines: [{ pts: RING_OF_FIRE, c: C.red, w: 1.8, dur: 3 }, { pts: MED_HIMALAYA, c: C.orange, w: 1.8, t: 1.5, dur: 3 }],
        marks: [mk([45, 165], 'Circum-Pacific belt', '环太平洋火山地震带', { big: true, c: C.red, t: 1 }), mk([38, 62], 'Mediterranean–Himalayan belt', '地中海—喜马拉雅火山地震带', { big: true, c: C.orange, t: 2.6 }),
          mk(WENCHUAN, 'Wenchuan 2008, M 8.0', '汶川 2008 年 8.0 级地震', { dot: true, c: C.gold, t: 3.2 }), mk([23.7, 121], 'Taiwan', '台湾', { dot: true, c: C.gold, t: 3.6 })],
        fig: { k: 'pie', title: ['Where the world\'s earthquakes happen (approx.)', '全球地震的分布（约）'], parts: [
          { name: ['Circum-Pacific', '环太平洋地震带'], v: 80, c: C.red }, { name: ['Mediterranean–Himalayan', '地中海—喜马拉雅地震带'], v: 15, c: C.orange }, { name: ['Elsewhere', '其他地区'], v: 5, c: C.white }] },
        task: ['Follow the red belt round the Pacific and name three countries it passes through.', '沿着红色的地震带绕太平洋一周，说出它经过的三个国家。'],
        body: ['Because plate boundaries are restless, most of the world\'s volcanoes and earthquakes line up along them in two belts. The Circum-Pacific belt, the "Ring of Fire", runs round the Pacific through Chile, the United States, Japan, the Philippines and Indonesia, and has about 80% of all earthquakes. The Mediterranean–Himalayan belt runs from Italy and Turkey through Iran to the Himalaya. China lies where the Eurasian, Pacific and Indo-Australian plates meet: Taiwan sits on the Pacific belt, and the south-west lies near the collision zone, where the 2008 Wenchuan earthquake (magnitude 8.0) struck.',
          '板块交界地带地壳活跃，世界上的火山、地震大多沿板块边界成带分布。环太平洋火山地震带环绕太平洋，经过智利、美国、日本、菲律宾、印度尼西亚等国，集中了全球约 80% 的地震；地中海—喜马拉雅火山地震带从意大利、土耳其经伊朗延伸到喜马拉雅山。我国位于亚欧板块、太平洋板块和印度洋板块的交界附近：台湾位于环太平洋地震带上，西南地区靠近板块碰撞带，2008 年的汶川 8.0 级地震就发生在这里。'],
      },
    ],
    quiz: [
      { q: ['The Himalaya were formed by plates…', '喜马拉雅山脉是板块怎样运动形成的'], options: [['Colliding', '碰撞挤压'], ['Pulling apart', '张裂拉伸'], ['Sliding past each other', '水平错动'], ['Not moving at all', '静止不动']], answer: 0,
        why: ['The Indo-Australian Plate (carrying India) collided with the Eurasian Plate and squeezed the crust up into mountains and a plateau.', '印度洋板块与亚欧板块碰撞挤压，地壳隆起形成高大的山脉和高原。'] },
      { q: ['Fossils of sea creatures are found in rock near the top of Everest. This shows that…', '珠穆朗玛峰顶部的岩层中发现了海洋生物化石，这说明'],
        options: [['The rock formed on a sea floor and was later lifted up', '这里曾是海洋，后来地壳抬升成为高山'], ['Sea animals once climbed the mountain', '海洋生物曾经爬上山顶'], ['Sea level was once 9 km higher', '海平面曾比现在高 9 千米'], ['Climbers brought the fossils', '化石是登山者带上去的']], answer: 0,
        why: ['The fossils are inside layers of limestone that formed on the floor of an ancient ocean. Plate collision folded and lifted those layers almost 9 km: crustal movement turned sea into mountain.', '化石保存在古海洋底部沉积形成的石灰岩中，板块碰撞挤压使岩层抬升近 9 千米。这是地壳运动使“沧海”变成高山的证据。'] },
      { q: ['Which of these lie on the Circum-Pacific belt? Pick all that apply.', '下列地区中，位于环太平洋火山地震带上的有（多选）'],
        options: [['Japan', '日本'], ['Chile', '智利'], ['Alaska', '美国阿拉斯加'], ['Italy', '意大利'], ['Central Australia', '澳大利亚中部']], multi: [0, 1, 2],
        why: ['Japan, Chile and Alaska ring the Pacific. Italy is on the Mediterranean–Himalayan belt, and the middle of Australia is far from any plate edge.', '日本、智利和阿拉斯加都在太平洋沿岸。意大利位于地中海—喜马拉雅火山地震带，澳大利亚中部位于板块内部，远离板块边界。'] },
      { q: ['Match what the plates do to what it makes.', '把板块运动和它形成的地表形态连起来。'],
        match: [[['India collides with Eurasia', '印度洋板块与亚欧板块碰撞挤压'], ['The Himalaya rise', '喜马拉雅山脉隆起']], [['Eastern Africa is pulled apart', '非洲东部张裂'], ['The East African Rift', '东非大裂谷']],
          [['Arabia moves away from Africa', '阿拉伯半岛远离非洲'], ['The Red Sea widens', '红海不断扩大']], [['An ocean plate dives under South America', '大洋板块俯冲到南美洲之下'], ['The Peru–Chile Trench and the Andes', '秘鲁—智利海沟和安第斯山脉']]],
        why: ['Collision crumples the crust into mountains; where an ocean plate sinks, a trench and volcanic mountains form; where plates pull apart, rifts and new seas open.', '大陆碰撞挤压形成高大山脉；大洋板块俯冲形成海沟和火山山脉；板块张裂形成裂谷和海洋。'] },
      { q: ['Label these places shaped by moving plates.', '在地球上标出这些由板块运动形成的地方。'],
        place: [{ text: ['Japan', '日本'], at: [36.5, 138.5], tolKm: 500 }, { text: ['East African Rift', '东非大裂谷'], at: [2, 36.5], tolKm: 600 }, { text: ['Red Sea', '红海'], at: [20, 38.5], tolKm: 500 }, { text: ['Andes', '安第斯山脉'], at: [-20, -68], tolKm: 800 }],
        why: ['Japan sits where the Pacific Plate dives under Eurasia; the rift and the Red Sea are opening up; the Andes rise where the Pacific floor dives under the American Plate.', '日本位于太平洋板块与亚欧板块交界处；东非大裂谷和红海处在板块张裂地带；安第斯山脉位于大洋板块与美洲板块交界处。'] },
      { q: ['Tap the fault where the Pacific Plate slides past the American Plate in California.', '在地球上点出美国加利福尼亚州太平洋板块与美洲板块水平错动的断层。'], at: [36, -120.6], tolKm: 350,
        why: ['The San Andreas Fault runs about 1,200 km through California, between San Francisco and Los Angeles.', '圣安德烈亚斯断层纵贯加利福尼亚州，长约 1200 千米，经过旧金山和洛杉矶之间。'] },
      { q: ['India moves north about 5 cm a year. At that speed, how many kilometres does it move in 1 million years?', '印度每年向北移动约 5 厘米。按这个速度，100 万年移动多少千米？'], num: { answer: 50, tol: 1, unit: ['km', '千米'] },
        why: ['5 cm × 1,000,000 = 5,000,000 cm = 50,000 m = 50 km. Slow motion adds up: over 50 million years that is about 2,500 km.', '5 厘米 × 1000000 = 5000000 厘米 = 50000 米 = 50 千米。板块运动虽慢，但日积月累：5000 万年就是约 2500 千米。'] },
      { q: ['Look at the diagram. What forms at a boundary like this?', '读图，这种板块边界上会形成什么？'], fig: { k: 'svg', draw: bdyFig('subduction', true) },
        options: [['A deep trench and a chain of volcanic mountains, like the Andes', '深海沟和一串火山山脉，如安第斯山脉'], ['A rift valley with long, deep lakes, like East Africa', '谷底有深湖的裂谷，如东非大裂谷'],
          ['A high plateau with almost no volcanoes, like Tibet', '几乎没有火山的高原，如青藏高原'], ['A mid-ocean ridge where new sea floor forms', '生成新洋底的海岭']], answer: 0,
        why: ['The arrows push an ocean plate under a continent. It sinks into a trench, melts at depth and feeds volcanoes on the continent edge. Two continents colliding (Tibet) build mountains with few volcanoes; ridges and rifts form where plates move apart.', '图中大洋板块俯冲到大陆板块之下：俯冲处形成海沟，下沉的板块在深处熔融，岩浆上涌，在大陆边缘形成火山山脉。大陆与大陆碰撞（青藏高原）火山很少；海岭和裂谷形成于板块张裂处。'] },
    ],
  },
  {
    id: 'climate', strand: 'climate', tracks: ['uk', 'us', 'ib', 'au'], grade: 'g7a', unit: climate, icon: 'cloud', minutes: 9,
    title: ['Temperature and rainfall', '气温和降水'],
    blurb: ['How temperature changes through the day and the year, why it falls with latitude and height, and where in the world it rains most.', '气温在一天和一年中怎样变化，为什么随纬度和海拔升高而降低；世界上哪里降水最多。'],
    keys: [
      ['Weather is the state of the air over a short time; climate is the long-term average weather of a place.', '天气是短时间内的大气状况，气候是一个地方多年的天气平均状况。'],
      ['Temperature peaks at about 14:00 and is lowest around sunrise; on land in the Northern Hemisphere July is warmest and January coldest.', '一天中气温最高值出现在午后 2 时左右，最低值在日出前后；北半球大陆上 7 月最热，1 月最冷。'],
      ['Temperature falls from low to high latitudes, and by about 0.6 °C for every 100 m of height.', '气温从低纬度向高纬度递减；海拔每升高 100 米，气温约下降 0.6 ℃。'],
      ['In winter land is colder than sea at the same latitude, in summer hotter, so isotherms bend where they cross coasts.', '同纬度地区，冬季陆地比海洋冷，夏季陆地比海洋热，所以等温线在海陆交界处发生弯曲。'],
      ['Rain is plentiful near the equator, on east coasts near the tropics, on coasts and on windward slopes; scarce near the poles, on tropical west coasts, inland and in rain shadows.', '赤道附近、回归线附近大陆东岸、沿海和山地迎风坡降水多；两极、回归线附近大陆西岸、内陆和背风坡降水少。'],
    ],
    steps: [
      {
        title: ['A day of temperature', '气温的日变化'], cam: [36, 112, 3.4], wide: true, night: true, sun: true,
        clock: { mode: 'day', start: Date.UTC(2025, 4, 15, 21), rate: 2 },
        marks: [mk(BEIJING, 'Beijing, mid-May', '北京（5 月中旬）', { dot: true, c: C.gold, t: 0.3 })],
        fig: { k: 'line', title: ['Beijing: temperature on a sunny May day', '北京 5 月某晴天的气温变化'], unit: ['°C', '℃'], x: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24], min: 10, max: 30,
          series: [{ name: ['Temperature (hour)', '气温（时）'], c: C.orange, y: [17, 15.5, 14, 15, 19, 23, 25.5, 27, 26, 23.5, 21, 19, 17.5] }],
          notes: [{ x: 4, text: ['Lowest ~ sunrise', '最低：日出前后'] }, { x: 14, text: ['Highest ~ 14:00', '最高：午后 2 时'] }] },
        task: ['Let the clock run through a day in Beijing, then read the graph: how many hours after noon is it warmest?', '让时钟走完北京的一天，再读图：一天中气温最高的时刻比正午晚几个小时？'],
        body: ['Weather is what the air is doing now, and it changes from hour to hour. Air temperature is measured in the shade, in a white louvred box (a Stevenson screen) 1.5 m above the ground. On a sunny day it is lowest around sunrise, after the ground has lost heat all night, and highest at about 14:00: the Sun is highest at noon, but the warm ground goes on heating the air for two more hours. The daily mean is the average of readings at 2, 8, 14 and 20 h: here (15.5 + 19 + 27 + 21) ÷ 4 ≈ 20.6 °C, and the daily range is 27 − 14 = 13 °C.',
          '天气是某地短时间内的大气状况，时刻在变。气温要在背阴通风处测量：把温度计放在离地 1.5 米高的白色百叶箱里。晴天时，地面整夜散热，日出前后气温最低；正午太阳最高，但地面还会继续给空气加热，所以午后 2 时左右气温最高。日平均气温通常取 2 时、8 时、14 时、20 时四次观测的平均值：图中为（15.5 + 19 + 27 + 21）÷ 4 ≈ 20.6 ℃，气温日较差为 27 − 14 = 13 ℃。'],
      },
      {
        title: ['A year of temperature', '气温的年变化'], cam: [8, 125, 4.6], wide: true, sun: true,
        clock: { mode: 'year', start: T.janChina, rate: 24 }, paint: [{ fill: { k: 'temp' }, a: 0.6 }],
        marks: [mk(BEIJING, 'Beijing', '北京', { dot: true, c: C.gold, t: 0.3 }), mk(SINGAPORE, 'Singapore', '新加坡', { dot: true, c: C.white, t: 0.6 }), mk(SYDNEY, 'Sydney', '悉尼', { dot: true, c: C.teal, t: 0.9 })],
        fig: { k: 'line', title: ['Monthly mean temperature', '各月平均气温'], unit: ['°C', '℃'], x: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], min: -10, max: 30,
          series: [{ name: ['Beijing', '北京'], c: C.gold, y: [...CITIES.beijing.T] }, { name: ['Singapore', '新加坡'], c: C.white, y: [...CITIES.singapore.T] }, { name: ['Sydney', '悉尼'], c: C.teal, y: [...CITIES.sydney.T] }] },
        body: ['Over a year, temperature follows the Sun\'s height and the length of day. Beijing is coldest in January (−3.1 °C) and warmest in July (26.7 °C): an annual range of about 30 °C. Singapore, almost on the equator, stays between 26.5 and 28.4 °C all year, a range under 2 °C. Sydney, in the Southern Hemisphere, is the other way round from Beijing: January (23.5 °C) is its warmest month and July (13.4 °C) its coolest. On the globe, watch the warm colours follow the overhead Sun north and south.',
          '一年中，气温随太阳高度和昼长变化。北京 1 月最冷（−3.1 ℃），7 月最热（26.7 ℃），气温年较差约 30 ℃。新加坡几乎位于赤道上，全年气温都在 26.5—28.4 ℃ 之间，年较差不到 2 ℃。南半球的悉尼与北京正好相反：1 月最热（23.5 ℃），7 月最冷（13.4 ℃）。看地球上的暖色带，它跟着太阳直射点一年里南北移动。'],
      },
      {
        title: ['January: land colder than sea', '1 月：陆地比海洋冷'], cam: [50, 60, 4.6], sun: true,
        clock: { mode: 'year', start: T.janChina, rate: 0 }, paint: [{ fill: { k: 'temp' }, a: 0.62 }], lines: [par(61, C.white, 0.4)],
        marks: [mk([60.4, 5.3], 'Bergen: January +1.5 °C', '卑尔根：1 月 1.5 ℃', { dot: true, c: C.white, t: 1 }), mk([62.0, 129.7], 'Yakutsk: January −38.6 °C', '雅库茨克：1 月 −38.6 ℃', { dot: true, c: C.white, t: 1.5 })],
        task: ['Follow the white 61°N parallel from the Norwegian coast into Siberia: how many 5 °C colour steps do you cross?', '沿白色的北纬 61° 线从挪威海岸走进西伯利亚：经过了几个 5 ℃ 色阶？'],
        body: ['Each colour step on the globe is 5 °C, so the edges between colours work like isotherms, lines joining places with the same temperature. If latitude were all that mattered, they would run along the parallels. In January they do not: Bergen on the Norwegian coast and Yakutsk in Siberia lie at almost the same latitude, yet Bergen averages +1.5 °C and Yakutsk −38.6 °C. Land loses heat fast in winter while the sea holds its warmth, so over the northern continents the isotherms bend towards the equator.',
          '地球上每个色阶代表 5 ℃，颜色的分界线就相当于等温线（气温相同的各点的连线）。如果只受纬度影响，等温线应与纬线平行。但 1 月并非如此：挪威沿海的卑尔根和西伯利亚的雅库茨克纬度几乎相同，卑尔根 1 月平均气温 1.5 ℃，雅库茨克却低至 −38.6 ℃。冬季陆地散热快，海洋降温慢、保持着热量，所以北半球大陆上的等温线向南（低纬）弯曲。'],
      },
      {
        title: ['July: land hotter than sea', '7 月：陆地比海洋热'], cam: [28, 66, 4.6], wide: true,
        clock: { mode: 'year', start: T.julChina, rate: 0 }, paint: [{ fill: { k: 'temp' }, a: 0.62 }],
        marks: [mk([24, 20], 'Sahara: July mean above 30 °C', '撒哈拉：7 月均温超过 30 ℃', { big: true, c: C.orange, t: 0.5 }), mk([29.65, 91.1], 'Lhasa 3,650 m: July 16.3 °C', '拉萨（3650 米）：7 月 16.3 ℃', { dot: true, c: C.white, t: 1.1 }),
          mk([31.23, 121.47], 'Shanghai: July 28.7 °C', '上海：7 月 28.7 ℃', { dot: true, c: C.white, t: 1.5 })],
        body: ['In July the pattern turns round: the northern continents heat up faster than the oceans beside them, and the isotherms over land bend towards the poles. The hottest places are not on the equator, where clouds and daily rain cool the afternoons, but in the subtropical deserts, where clear skies let the Sun bake the ground: in the Sahara and Arabia the July mean is above 30 °C. Height matters too: Lhasa and Shanghai are only about 1.6° of latitude apart, but Lhasa, 3,650 m up on the plateau, is 12 °C cooler in July.',
          '7 月情况相反：北半球大陆比旁边的海洋升温快，陆地上的等温线向北（高纬）弯曲。最热的地方不在赤道（那里云多雨多，午后常被降雨降温），而在副热带的沙漠：晴空少云，烈日暴晒，撒哈拉和阿拉伯半岛 7 月平均气温超过 30 ℃。地势也有影响：拉萨和上海纬度只差约 1.6°，但拉萨位于海拔 3650 米的高原上，7 月气温比上海低 12 ℃。'],
      },
      {
        title: ['Latitude: how high the Sun climbs', '纬度：太阳的高低'], astro: { kit: 'rays', mode: 'noon', dec: 0, clock: { from: -70, to: 85, rate: 12, unit: 'lat', at: 0.4 } },
        fig: { k: 'line', title: ['Annual mean temperature by latitude', '不同纬度城市的年平均气温'], unit: ['°C', '℃'], x: [1, 31, 40, 46, 62], min: -10, max: 30,
          series: [{ name: ['Annual mean (x: latitude °N)', '年平均气温（横轴：北纬度数）'], c: C.orange, y: [27.6, 17.0, 12.9, 4.8, -8.8] }],
          notes: [{ x: 1, text: ['Singapore', '新加坡'] }, { x: 31, text: ['Shanghai', '上海'] }, { x: 46, text: ['Harbin', '哈尔滨'] }] },
        body: ['Why is it hotter near the equator? Slide the observer north on an equinox day. At the equator the noon Sun is overhead (90°) and a beam of sunlight falls on a small patch of ground; at 40° it is only 50° high and at 66.5° just 23.5°, so the same beam is spread over a much larger area and each square metre gets less heat. So annual mean temperature falls with latitude: about 27.6 °C in Singapore (1°N), 17.0 °C in Shanghai (31°N), 12.9 °C in Beijing (40°N), 4.8 °C in Harbin (46°N) and −8.8 °C in Yakutsk (62°N).',
          '为什么低纬度更热？在春分日让观察者向北移动：赤道上正午太阳直射（太阳高度 90°），一束阳光照在一小块地面上；北纬 40° 正午太阳高度只有 50°，北纬 66.5° 只有 23.5°，同样一束阳光分散到更大的面积上，每平方米得到的热量就少了。所以年平均气温随纬度升高而降低：新加坡（1°N）约 27.6 ℃，上海（31°N）17.0 ℃，北京（40°N）12.9 ℃，哈尔滨（46°N）4.8 ℃，雅库茨克（62°N）−8.8 ℃。'],
      },
      {
        title: ['Altitude: colder higher up', '地势：越高越冷'],
        astro: {
          kit: 'mountain', mode: 'lab',
          params: [
            { id: 'lat', name: ['Latitude of the mountain', '山的纬度'], min: 0, max: 70, value: 40, step: 1, fmt: ['{v}°', '{v}°'] },
            { id: 'height', name: ['Height', '山的海拔'], min: 1000, max: 8800, value: 2000, step: 100, fmt: ['{v} m', '{v} 米'] },
          ],
          tasks: [
            { text: ['At latitude 40°, find the lowest height where the summit is below 0 °C.', '在纬度 40° 处，找出山顶气温刚好低于 0 ℃ 的最低海拔。'], done: p => Math.abs(p.lat - 40) <= 2 && footTemp(p.lat) - LAPSE * p.height < 0 && footTemp(p.lat) - LAPSE * p.height > -1.2 },
            { text: ['Build a mountain at least 5,000 m high.', '造一座海拔至少 5000 米的山。'], done: p => p.height >= 5000 },
            { text: ['Put a freezing summit on the equator (latitude 5° or less).', '在赤道附近（纬度 5° 以内）造一座山顶气温低于 0 ℃ 的山。'], done: p => p.lat <= 5 && footTemp(p.lat) - LAPSE * p.height < 0 },
          ],
        },
        body: ['The air is warmed mainly by the ground, not straight by the Sun, and as air rises it expands and cools. So temperature falls by about 0.6 °C for every 100 m you climb. A 3,000 m mountain is about 18 °C colder at the top than at its foot. That is why Kilimanjaro (5,895 m), only 3° south of the equator, has glaciers on its summit, and why the Qinghai–Tibet Plateau is cool in summer. Change the latitude and height and read the temperatures at the foot and the summit.',
          '空气主要靠地面辐射增温，而且空气上升时膨胀冷却，所以海拔越高，气温越低：大约每升高 100 米，气温下降 0.6 ℃。一座 3000 米高的山，山顶比山脚约低 18 ℃。所以乞力马扎罗山（5895 米）虽然离赤道只有约 3°，山顶却有冰川；青藏高原夏季也很凉爽。调节山的纬度和高度，读一读山脚和山顶的气温。'],
      },
      {
        title: ['Rain through the year', '降水的季节变化'], cam: [40, 64, 5], wide: true,
        marks: [mk(BEIJING, 'Beijing: 583 mm a year', '北京：年降水量 583 毫米', { dot: true, c: C.gold, t: 0.4 }), mk(ROME, 'Rome: 800 mm a year', '罗马：年降水量 800 毫米', { dot: true, c: C.teal, t: 0.8 })],
        fig: { k: 'climo', city: 'beijing', b: 'rome' },
        task: ['Find the wettest month on each graph. Is it in summer or in winter?', '在两幅图中分别找出降水最多的月份：是夏季还是冬季？'],
        body: ['Climate graphs show a place\'s long-term average: bars for each month\'s rainfall (precipitation, which includes snow), a line for temperature. Add the twelve bars to get the annual rainfall. Beijing gets 583 mm a year, and about 73% falls in June–August, with July the wettest month (185 mm): rain and heat come together. Rome gets 800 mm, but in July only 19 mm: its summers are hot and dry and its rain comes in autumn and winter, peaking in October (113 mm).',
          '气候资料图表示一个地方多年的平均状况：柱状表示各月降水量（降水包括降雨、降雪等），曲线表示各月气温。把 12 个月的降水量相加就是年降水量。北京年降水量约 583 毫米，约 73% 集中在 6—8 月，7 月最多（185 毫米），雨热同期。罗马年降水量约 800 毫米，但 7 月只有 19 毫米：夏季炎热干燥，降水集中在秋冬季节，10 月最多（113 毫米）。'],
      },
      {
        title: ['Where it rains', '降水的地区分布'], cam: [15, 62, 5.2], wide: true, items: ['pl_kapok', 'dc_richat'],
        paint: [{ fill: { k: 'band', s: -10, n: 10, c: C.blue }, a: 0.45 }, { fill: { k: 'band', s: 15, n: 32, c: C.brown }, t: 0.8, a: 0.4 }, { fill: { k: 'band', s: -32, n: -15, c: C.brown }, t: 0.8, a: 0.4 }],
        marks: [mk([0, 22], 'Equator: rainy', '赤道附近：多雨', { big: true, c: C.blue, t: 0.4 }), mk([21, 16], 'Tropics, west & inland: dry', '回归线附近大陆西岸和内部：少雨', { big: true, c: C.brown, t: 1.2 }),
          mk(MAWSYNRAM, 'Mawsynram', '毛辛拉姆', { dot: true, c: C.blue, t: 1.8 }), mk([23.13, 113.26], 'Guangzhou (east coast): ≈ 1,800 mm', '广州（大陆东岸）：约 1800 毫米', { dot: true, c: C.green, t: 2.2 }),
          mk([30.04, 31.24], 'Cairo: 25 mm', '开罗：25 毫米', { dot: true, c: C.brown, t: 2.6 }), mk([43.8, 87.6], 'Ürümqi (inland): 259 mm', '乌鲁木齐（内陆）：259 毫米', { dot: true, c: C.brown, t: 3 })],
        fig: { k: 'svg', draw: reliefRainFig },
        body: ['Rain falls when moist air rises and cools. Near the equator (blue band) hot air rises every day, so it rains a lot. Near the tropics (brown bands) air sinks, so the west sides and interiors of continents hold great deserts such as the Sahara, where Cairo gets just 25 mm a year; east coasts at the same latitude, like Guangzhou, are wet because summer monsoon winds blow in from the sea. In the mid-latitudes coasts are wetter than interiors far from the sea, such as Ürümqi. And where wind is forced up a mountain, the windward slope is drenched: Mawsynram in India gets about 11,870 mm a year, one of the wettest places on Earth.',
          '暖湿空气上升、冷却，才会形成降水。赤道附近（蓝色带）空气受热天天上升，降水多。回归线附近（褐色带）盛行下沉气流，大陆西岸和内部有撒哈拉等大沙漠，开罗年降水量只有 25 毫米；同纬度的大陆东岸受来自海洋的夏季风影响，降水较多，如广州。中纬度地区沿海降水多，远离海洋的内陆降水少，如乌鲁木齐。山地迎风坡空气被迫抬升，降水丰富：印度的毛辛拉姆年降水量约 11870 毫米，是世界上降水最多的地方之一；背风坡则降水少。'],
      },
    ],
    quiz: [
      { q: ['On a sunny day, when is the air temperature usually highest?', '晴朗的日子里，一天中气温最高值一般出现在'], options: [['About 14:00', '午后 2 时左右'], ['12:00 noon', '正午 12 时'], ['Just after sunrise', '日出后不久'], ['About 20:00', '晚上 8 时左右']], answer: 0,
        why: ['The Sun is highest at noon, but the air is warmed by the ground, which keeps heating it for about two hours more, so the maximum comes at about 14:00.', '正午太阳最高，但空气主要靠地面增温，地面热量传给空气需要时间，所以气温最高值出现在午后 2 时左右。'] },
      { q: ['A school weather station read 8 °C at 2:00, 10 °C at 8:00, 18 °C at 14:00 and 12 °C at 20:00. What was the daily mean temperature?', '某校气象站测得：2 时 8 ℃，8 时 10 ℃，14 时 18 ℃，20 时 12 ℃。这一天的日平均气温是多少？'], num: { answer: 12, tol: 0.1, unit: ['°C', '°C'] },
        why: ['(8 + 10 + 18 + 12) ÷ 4 = 48 ÷ 4 = 12 °C. The daily range is 18 − 8 = 10 °C.', '（8 + 10 + 18 + 12）÷ 4 = 48 ÷ 4 = 12 ℃。气温日较差为 18 − 8 = 10 ℃。'] },
      { q: ['At Moshi, at the foot of Kilimanjaro (800 m), it is 23 °C. Using a fall of 0.6 °C per 100 m, about how warm is the 5,895 m summit?', '乞力马扎罗山脚下的莫希（海拔 800 米）气温 23 ℃。按海拔每升高 100 米气温下降 0.6 ℃ 计算，海拔 5895 米的山顶气温约是多少？'], num: { answer: -7.6, tol: 0.3, unit: ['°C', '°C'] },
        why: ['The summit is 5,895 − 800 = 5,095 m higher, so it is 5,095 ÷ 100 × 0.6 ≈ 30.6 °C cooler: 23 − 30.6 ≈ −7.6 °C. That is why there is ice near the equator.', '山顶比莫希高 5895 − 800 = 5095 米，气温约低 5095 ÷ 100 × 0.6 ≈ 30.6 ℃，所以山顶约 23 − 30.6 ≈ −7.6 ℃。这就是赤道附近的高山也有冰雪的原因。'] },
      { q: ['This city is warmest in January and coolest in July. Where is it?', '读图：这座城市 1 月最热、7 月最冷。它位于'], fig: { k: 'climo', city: 'sydney', blind: true },
        options: [['In the Southern Hemisphere', '南半球'], ['In the Northern Hemisphere', '北半球'], ['On the equator', '赤道上'], ['Inside the Arctic Circle', '北极圈内']], answer: 0,
        why: ['Seasons are reversed south of the equator: January is midsummer there. This is Sydney (34°S). On the equator the temperature would hardly change through the year.', '南北半球季节相反，1 月是南半球的盛夏。这是悉尼（34°S）的气候资料图。如果在赤道上，全年气温几乎不变。'] },
      { q: ['Match each cause to an example of it.', '把影响气温和降水的因素与实例连起来。'],
        match: [[['Latitude', '纬度位置'], ['Singapore is warmer than Harbin', '新加坡比哈尔滨热']], [['Land and sea', '海陆位置'], ['In January, Yakutsk is much colder than Bergen', '1 月雅库茨克比卑尔根冷得多']],
          [['Altitude', '地势高低'], ['Snow on Kilimanjaro, near the equator', '赤道附近的乞力马扎罗山顶有冰雪']], [['Windward slope', '山地迎风坡'], ['Mawsynram gets about 11,870 mm of rain a year', '毛辛拉姆年降水量约 11870 毫米']]],
        why: ['Latitude sets how much sunshine a place gets; land cools faster than the sea in winter; temperature falls about 0.6 °C per 100 m; and air forced up a mountain cools and drops its rain.', '纬度决定获得太阳热量的多少；冬季陆地比海洋降温快；海拔每升高 100 米气温约下降 0.6 ℃；气流沿迎风坡被迫抬升，冷却后形成大量降水。'] },
      { q: ['Which of these describe climate rather than weather? Pick all that apply.', '下列说法中，描述气候（而不是天气）的有（多选）'],
        options: [['Kunming is spring-like all year round', '昆明四季如春'], ['Hainan is hot and wet all year', '海南终年高温多雨'], ['The Sahara gets almost no rain in any season', '撒哈拉沙漠常年少雨'], ['A thunderstorm is coming this afternoon', '今天下午有雷阵雨'], ['Tomorrow: clearing, light winds', '明天晴转多云，微风']], multi: [0, 1, 2],
        why: ['Climate is the long-term average state of a place; weather is the short-term state of the air, which changes from hour to hour and day to day.', '气候是一个地方多年的天气平均状况，比较稳定；天气是短时间内的大气状况，时刻在变。'] },
      { q: ['Put these cities in order of annual rainfall, wettest first.', '把这些城市按年降水量从多到少排序。'],
        order: [['Singapore', '新加坡'], ['Shanghai', '上海'], ['Beijing', '北京'], ['Ürümqi', '乌鲁木齐'], ['Cairo', '开罗']],
        why: ['Singapore ≈ 2,160 mm (equator), Shanghai ≈ 1,250 mm (coast), Beijing ≈ 580 mm, Ürümqi ≈ 260 mm (far inland), Cairo ≈ 25 mm (desert near the tropic).', '新加坡约 2160 毫米（赤道附近），上海约 1250 毫米（沿海），北京约 580 毫米，乌鲁木齐约 260 毫米（深居内陆），开罗约 25 毫米（回归线附近的沙漠）。'] },
      { q: ['Tap Mawsynram, one of the wettest places on Earth, on the windward slope of the hills north of Bangladesh.', '在地球上点出世界上降水最多的地方之一——毛辛拉姆（位于孟加拉国北面山地的迎风坡）。'], at: MAWSYNRAM, tolKm: 400,
        why: ['Mawsynram (25.3°N, 91.6°E) in north-east India gets about 11,870 mm a year: the wet south-west monsoon from the Bay of Bengal is forced up the Khasi Hills and drops its rain.', '毛辛拉姆（25.3°N，91.6°E）位于印度东北部，年降水量约 11870 毫米：来自孟加拉湾的西南季风沿卡西丘陵被迫抬升，形成大量降水。'] },
    ],
  },
];
