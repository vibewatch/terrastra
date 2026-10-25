/**
 * Senior high school physical geography, part A (PEP 2019 必修第一册 / 选择性必修1): the Earth's layers, its history,
 * the forces that shape the land, landforms, soil and vegetation, and the unity and diversity of natural zones.
 * The belt and fold models live in `models.ts`, shared with the astro kits `mountain` and `strata`, so the lab tasks
 * and the pictures always agree.
 */
import { C, mk, type Lesson, type Pair } from './kit.ts';
import { arrowDef, svg, tx, type Lx } from './figs.ts';
import { EAST_AFRICA_RIFT, REGIONS, RIVERS } from './geo.ts';
import { LOESS_PLATEAU } from './geo-cn.ts';
import { beltsOf, foldInverted } from './models.ts';

const EARTH: Pair = ['The Earth in the universe', '宇宙中的地球'];
const LAND: Pair = ['Landforms', '地貌'];
const SOILVEG: Pair = ['Vegetation and soil', '植被与土壤'];
const SHAPE: Pair = ['Shaping the land surface', '地表形态的塑造'];
const UNITY: Pair = ['Unity and diversity of the natural environment', '自然环境的整体性与差异性'];

// ── Lab helpers ──────────────────────────────────────────────────────────────────────────────────────────────────
/** is the foot of the mountain in the tundra zone? */
const isFootTundra = (lat: number, h: number) => beltsOf(lat, h)[0]?.id === 'tundra';

// ── Figures ──────────────────────────────────────────────────────────────────────────────────────────────────────
const DARK = ' style="fill:#1b2733"';
/** boxes joined by arrows, top to bottom */
function chainFig(title: Pair, items: [Pair, string][]): (L: Lx, id: string) => string {
  return (L, id) => {
    const W = 300, bh = 19, gap = 9, y0 = 22, H = y0 + items.length * (bh + gap);
    const body = items.map(([p, c], i) => {
      const y = y0 + i * (bh + gap);
      const ar = i < items.length - 1 ? `<path d="M150 ${y + bh + 1} V${y + bh + gap - 1}" stroke="#adb5bd" stroke-width="1.4" marker-end="url(#${id}a)"/>` : '';
      return `<g class="f-fade" style="--d:${(i * 0.35).toFixed(2)}s"><rect x="20" y="${y}" width="260" height="${bh}" rx="5" fill="${c}"/>${tx(150, y + 13, L(p), 'fg-label', 'm', DARK)}</g>${ar}`;
    }).join('');
    return svg(W, H, arrowDef(`${id}a`, '#adb5bd') + tx(150, 13, L(title), 'fg-title', 'm') + body, L(title));
  };
}

/** P and S wave speeds with depth */
const WAVE_P: [number, number][] = [[0, 5.8], [33, 6.8], [33, 8.1], [400, 8.9], [670, 10.1], [2900, 13.7], [2900, 8.0], [5150, 10.3], [5150, 11.0], [6371, 11.3]];
const WAVE_S: [number, number][] = [[0, 3.2], [33, 3.9], [33, 4.5], [400, 4.8], [670, 5.6], [2900, 7.3]];
const wavesFig = (L: Lx) => {
  const W = 300, H = 190, x0 = 120, x1 = 285, y0 = 26, y1 = 178;
  const X = (v: number) => x0 + (v / 14) * (x1 - x0), Y = (d: number) => y0 + (d / 6371) * (y1 - y0);
  const path = (pts: [number, number][]) => pts.map(([d, v], i) => `${i ? 'L' : 'M'}${X(v).toFixed(1)} ${Y(d).toFixed(1)}`).join(' ');
  const layers: [number, number, string, Pair][] = [[0, 2900, '#c2461f', ['Mantle', '地幔']], [2900, 5150, '#ffa53b', ['Outer core (liquid)', '外核（液态）']], [5150, 6371, '#fff1b8', ['Inner core (solid)', '内核（固态）']]];
  const bands = layers.map(([a, b, c, n]) => `<rect x="10" y="${Y(a)}" width="100" height="${Y(b) - Y(a)}" fill="${c}" opacity=".85"/>${tx(60, (Y(a) + Y(b)) / 2 + 3, L(n), 'fg-label', 'm', DARK)}`).join('');
  const ticks = [0, 4, 8, 12].map(v => `<line x1="${X(v)}" x2="${X(v)}" y1="${y0}" y2="${y1}" class="fg-grid"/>${tx(X(v), y0 - 4, String(v), 'fg-tick', 'm')}`).join('')
    + [0, 2900, 5150, 6371].map(d => tx(x0 - 3, Y(d) + 3, String(d), 'fg-tick', 'e')).join('');
  const lines = `<line x1="10" x2="${x1}" y1="${Y(2900)}" y2="${Y(2900)}" class="fg-guide"/>`
    + `<path d="${path(WAVE_P)}" fill="none" stroke="#4dabf7" stroke-width="2" class="f-draw" pathLength="1"/>`
    + `<path d="${path(WAVE_S)}" fill="none" stroke="#ff6b6b" stroke-width="2" class="f-draw" pathLength="1"/>`
    + tx(X(10), Y(4000), L(['P wave', '纵波 P']), 'fg-label', 's', ' style="fill:#74c0fc"')
    + tx(X(5.6), Y(1500), L(['S wave', '横波 S']), 'fg-label', 'e', ' style="fill:#ff8787"')
    + tx(X(0.2), Y(2900) + 11, L(['S vanishes, P slows', '横波消失，纵波减速']), 'fg-sub', 's')
    + tx(X(0.2), Y(2900) - 4, L(['Gutenberg discontinuity', '古登堡面']), 'fg-sub', 's')
    + tx(x1, 12, L(['speed, km/s', '波速（千米/秒）']), 'fg-sub', 'e') + tx(10, 12, L(['depth, km', '深度（千米）']), 'fg-sub', 's');
  return svg(W, H, bands + ticks + lines, L(['Seismic wave speeds with depth', '地震波波速随深度的变化']));
};

/** the outer spheres: atmosphere, hydrosphere, biosphere over the lithosphere */
const spheresFig = (L: Lx, id: string) => {
  const W = 300, H = 160;
  const g = `<defs><linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c3d6e"/><stop offset="1" stop-color="#74c0fc"/></linearGradient></defs>`;
  const sky = `<rect x="0" y="0" width="${W}" height="100" fill="url(#${id}s)"/>`;
  const sea = `<path d="M0 100 H130 L150 130 V160 H0 Z" class="fg-sea"/>`;
  const land = `<path d="M130 100 C150 96 170 80 200 82 C230 84 250 70 300 74 V160 H150 L150 130 Z" class="fg-land"/>`;
  const trees = [175, 195, 215, 240, 265].map(x => `<path d="M${x} ${78 - (x % 7)} l-6 12 h12 z" fill="#2f9e44"/>`).join('');
  const bio = `<rect x="4" y="62" width="292" height="78" rx="10" fill="none" stroke="#51cf66" stroke-width="1.6" stroke-dasharray="5 3" class="f-fade" style="--d:.6s"/>`;
  const labs = tx(10, 18, L(['Atmosphere', '大气圈']), 'fg-label') + tx(40, 122, L(['Hydrosphere', '水圈']), 'fg-label')
    + tx(230, 120, L(['Lithosphere', '岩石圈']), 'fg-label') + tx(292, 58, L(['Biosphere', '生物圈']), 'fg-label', 'e', ' style="fill:#8ce99a"')
    + tx(150, 172, L(['The biosphere spans the lowest air, all the water and the top of the rock', '生物圈占有大气圈底部、水圈全部和岩石圈上部']), 'fg-sub', 'm');
  const cloud = `<ellipse cx="80" cy="40" rx="26" ry="9" class="fg-cloud"/><ellipse cx="96" cy="34" rx="16" ry="8" class="fg-cloud"/>`;
  return svg(W, H + 18, g + sky + cloud + sea + land + trees + bio + labs, L(['The outer spheres', '地球的外部圈层']));
};

interface Era { n: Pair; from: number; to: number; c: string }
const EONS: Era[] = [
  { n: ['Hadean', '冥古宙'], from: 4600, to: 4000, c: '#ae3ec9' }, { n: ['Archean', '太古宙'], from: 4000, to: 2500, c: '#e64980' },
  { n: ['Proterozoic', '元古宙'], from: 2500, to: 541, c: '#f783ac' }, { n: ['Phanerozoic', '显生宙'], from: 541, to: 0, c: '#74c0fc' },
];
const ERAS: Era[] = [
  { n: ['Paleozoic', '古生代'], from: 541, to: 252, c: '#8ce99a' }, { n: ['Mesozoic', '中生代'], from: 252, to: 66, c: '#4dabf7' }, { n: ['Cenozoic', '新生代'], from: 66, to: 0, c: '#ffd43b' },
];
const ERA_LIFE: Pair[] = [
  ['sea invertebrates → fish → amphibians; ferns, coal', '海洋无脊椎动物→鱼类→两栖类；蕨类，成煤'],
  ['reptiles and dinosaurs; gymnosperms, coal', '爬行动物（恐龙）；裸子植物，成煤'],
  ['mammals, then humans; flowering plants', '哺乳动物，人类出现；被子植物'],
];
const timeFig = (L: Lx) => {
  const W = 300, H = 170, x0 = 12, x1 = 288, X = (a: number) => x0 + ((4600 - a) / 4600) * (x1 - x0);
  const eons = EONS.map((e, i) => `<rect x="${X(e.from)}" y="30" width="${X(e.to) - X(e.from)}" height="22" fill="${e.c}" class="f-fade" style="--d:${i * 0.25}s"/>`
    + tx((X(e.from) + X(e.to)) / 2, i === 3 ? 64 : 45, L(e.n), i === 3 ? 'fg-sub' : 'fg-label', 'm', i === 3 ? '' : DARK)).join('');
  const ticks = [4600, 4000, 2500, 541, 0].map(a => tx(X(a), 26, String(a), 'fg-tick', a === 0 ? 'e' : a === 4600 ? 's' : 'm')).join('');
  const Z = (a: number) => x0 + ((541 - a) / 541) * (x1 - x0);
  const zoom = `<path d="M${X(541)} 52 L${x0} 92 M${x1} 52 L${x1} 92" class="fg-guide"/>`;
  const eras = ERAS.map((e, i) => `<rect x="${Z(e.from)}" y="92" width="${Z(e.to) - Z(e.from)}" height="22" fill="${e.c}" class="f-fade" style="--d:${0.9 + i * 0.25}s"/>`
    + tx((Z(e.from) + Z(e.to)) / 2, 107, L(e.n), 'fg-label', 'm', DARK)).join('');
  const life = ERAS.map((e, i) => tx(x0, 128 + i * 11, `${L(e.n)}: ${L(ERA_LIFE[i])}`, 'fg-sub', 's')).join('');
  const zt = [541, 252, 66, 0].map(a => tx(Z(a), 88, String(a), 'fg-tick', a === 0 ? 'e' : a === 541 ? 's' : 'm')).join('');
  return svg(W, H, tx(150, 12, L(['Geological time scale (million years ago)', '地质年代表（距今百万年）']), 'fg-title', 'm') + eons + ticks + zoom + eras + zt + life, L(['Geological time scale', '地质年代表']));
};

/** a crescent dune (barchan): plan view and profile; the wind blows from the left (west) */
const duneFig = (L: Lx, id: string) => {
  const W = 300, H = 200;
  const plan = `<path d="M150 26 C190 22 214 24 232 30 C214 40 200 50 188 56 C170 66 164 76 164 83 C164 90 170 100 188 110 C200 116 214 126 232 136 C214 142 190 144 150 140 C112 136 96 112 96 83 C96 54 112 30 150 26 Z" fill="#e9c46a" class="f-fade"/>`
    + `<path d="M188 56 C170 66 164 76 164 83 C164 90 170 100 188 110" fill="none" stroke="#a47148" stroke-width="2"/>`;
  const wind = [56, 83, 110].map(y => `<path d="M14 ${y} H74" stroke="#74c0fc" stroke-width="2" marker-end="url(#${id}w)" class="f-draw" pathLength="1"/>`).join('');
  const labs = tx(14, 46, L(['Wind', '风向']), 'fg-label', 's', ' style="fill:#74c0fc"')
    + tx(128, 87, L(['gentle', '缓坡']), 'fg-label', 'm', DARK) + tx(172, 87, L(['steep', '陡坡']), 'fg-label', 's')
    + tx(238, 33, L(['horn', '两翼']), 'fg-sub', 's') + tx(238, 140, L(['horn', '两翼']), 'fg-sub', 's');
  const prof = `<path d="M96 194 C130 188 160 176 182 168 L202 194 Z" fill="#e9c46a"/><line x1="80" x2="230" y1="194" y2="194" stroke="#adb5bd"/>`
    + tx(134, 178, L(['gentle', '缓']), 'fg-sub', 'm') + tx(200, 178, L(['steep', '陡']), 'fg-sub', 'm') + tx(240, 190, L(['profile', '剖面']), 'fg-sub', 's');
  return svg(W, H, arrowDef(`${id}w`, '#74c0fc') + tx(150, 12, L(['A crescent dune seen from above', '新月形沙丘（俯视）']), 'fg-title', 'm') + plan + wind + labs + prof, L(['A crescent dune', '新月形沙丘']));
};
/** the same dune without the wind arrows or slope labels: "which way does the wind blow?" */
const duneQuizFig = (L: Lx) => {
  const plan = `<path d="M 150 22 C 110 18 86 20 68 26 C 86 36 100 46 112 52 C 130 62 136 72 136 79 C 136 86 130 96 112 106 C 100 112 86 122 68 132 C 86 138 110 140 150 136 C 188 132 204 108 204 79 C 204 50 188 26 150 22 Z" fill="#e9c46a"/>`
    + `<path d="M 112 52 C 130 62 136 72 136 79 C 136 86 130 96 112 106" fill="none" stroke="#a47148" stroke-width="2"/>`;
  const n = `<path d="M270 30 V12" stroke="#f1f3f5" stroke-width="1.4"/><path d="M266 16 L270 8 L274 16 Z" fill="#f1f3f5"/>` + tx(270, 42, L(['N', '北']), 'fg-label', 'm');
  return svg(300, 160, plan + n + tx(150, 156, L(['Plan view of a crescent dune', '某新月形沙丘平面图']), 'fg-sub', 'm'), L(['A crescent dune', '新月形沙丘']));
};

/** karst: a limestone landscape with peaks, a cave and an underground river */
const karstFig = (L: Lx) => {
  const W = 300, H = 170;
  const rock = `<path d="M0 170 V96 C10 96 14 40 30 40 C46 40 48 96 62 96 C70 96 74 30 92 30 C110 30 112 96 124 96 L160 96 C170 96 176 52 190 52 C204 52 208 96 218 96 C226 96 232 26 250 26 C268 26 272 96 284 96 H300 V170 Z" fill="#adb5bd"/>`;
  const beds = [110, 124, 138, 152].map(y => `<line x1="0" x2="300" y1="${y}" y2="${y}" stroke="#868e96" stroke-width=".7"/>`).join('');
  const cave = `<path d="M150 112 C176 104 214 106 236 118 C228 140 182 142 150 134 Z" fill="#1b2733"/>`
    + [166, 180, 196, 212].map((x, i) => `<path d="M${x} 110 l3 ${8 + (i % 2) * 6} l3 -${8 + (i % 2) * 6} Z" fill="#dee2e6"/>`).join('')
    + [172, 204].map(x => `<path d="M${x} 136 l3 -9 l3 9 Z" fill="#dee2e6"/>`).join('')
    + `<path d="M188 110 V134" stroke="#dee2e6" stroke-width="3"/>`;
  const river = `<path d="M0 158 C60 156 90 162 150 150 C200 140 250 160 300 156" class="fg-river"/>`;
  const sink = `<path d="M140 96 L146 106 L134 106 Z" fill="#1b2733"/>`;
  const labs = tx(92, 22, L(['peak forest', '峰林']), 'fg-label', 'm') + tx(30, 34, L(['peak', '峰丛']), 'fg-sub', 'm') + tx(250, 18, L(['tower', '孤峰']), 'fg-sub', 'm')
    + tx(138, 90, L(['sinkhole', '落水洞']), 'fg-sub', 'm') + tx(240, 108, L(['cave: stalactites, stalagmites, a column', '溶洞：石钟乳、石笋、石柱']), 'fg-sub', 'e')
    + tx(8, 150, L(['underground river', '地下河']), 'fg-sub', 's', ' style="fill:#d0ebff"') + tx(292, 88, L(['limestone', '石灰岩']), 'fg-label', 'e', DARK);
  return svg(W, H, rock + beds + cave + river + sink + labs, L(['Karst landforms', '喀斯特地貌']));
};

/** a meander: erosion on the outer (concave) bank, deposition on the inner (convex) bank */
const meanderFig = (L: Lx, id: string) => {
  const W = 300, H = 170;
  const river = `<path d="M10 52 C80 52 110 34 150 34 C190 34 214 70 214 95 C214 120 192 128 170 128 C150 128 130 118 130 100 C130 82 120 66 100 66 C70 66 60 80 10 80" fill="none" stroke="#4dabf7" stroke-width="16" stroke-linecap="round" opacity=".85"/>`;
  const bar = `<path d="M142 102 C142 86 150 70 168 64 C186 70 196 84 198 96 C188 108 172 116 160 114 C150 112 142 108 142 102 Z" fill="#e9c46a" class="f-fade" style="--d:.4s"/>`;
  const flow = `<path d="M30 52 C80 52 110 34 150 34" fill="none" stroke="#d0ebff" stroke-width="1.4" marker-end="url(#${id}f)" class="f-draw" pathLength="1"/>`;
  const labs = tx(196, 40, L(['concave bank: eroded, deep', '凹岸：侵蚀，水深']), 'fg-label', 's', ' style="fill:#ff8787"')
    + tx(170, 92, L(['convex bank:', '凸岸：']), 'fg-sub', 'm', DARK) + tx(170, 101, L(['deposited', '堆积']), 'fg-sub', 'm', DARK);
  return svg(W, H, arrowDef(`${id}f`, '#d0ebff') + river + bar + flow + labs
    + tx(150, 164, L(['Build a port on the concave bank, where the water is deep', '港口宜建在水深的凹岸']), 'fg-sub', 'm'), L(['A river meander', '河流的弯道']));
};

/** a soil profile */
const PROFILE: [Pair, Pair, string, number][] = [
  [['O: organic layer', '有机层'], ['leaf litter', '枯枝落叶'], '#5c4b2a', 12],
  [['A: humus layer', '腐殖质层'], ['dark, rich in humus', '颜色深，富含腐殖质'], '#3b2f22', 26],
  [['E: eluvial layer', '淋溶层'], ['washed out, pale', '物质被淋失，颜色较浅'], '#bfa98a', 22],
  [['B: illuvial layer', '淀积层'], ['clay and iron build up', '黏粒、铁等物质淀积'], '#a0612e', 30],
  [['C: parent material', '母质层'], ['broken rock', '风化的岩石碎屑'], '#8d8273', 28],
  [['R: bedrock', '母岩层'], ['solid rock', '坚硬的岩石'], '#5c5f66', 24],
];
const soilFig = (L: Lx) => {
  let y = 24;
  const rows = PROFILE.map(([n, d, c, h], i) => {
    const r = `<g class="f-fade" style="--d:${(i * 0.3).toFixed(1)}s"><rect x="20" y="${y}" width="80" height="${h}" fill="${c}"/>`
      + (i === 5 ? `<path d="M20 ${y + 8} l20 6 l25 -8 l35 10" stroke="#3b3f45" fill="none"/>` : '')
      + tx(110, y + h / 2 - 1, L(n), 'fg-label') + tx(110, y + h / 2 + 8, L(d), 'fg-sub') + '</g>';
    y += h;
    return r;
  }).join('');
  const grass = [24, 34, 46, 58, 70, 84, 94].map(x => `<path d="M${x} 24 l-2 -8 M${x} 24 l2 -9" stroke="#51cf66" stroke-width="1.2"/>`).join('');
  return svg(300, y + 6, grass + rows + tx(298, 12, L(['A forest soil profile', '森林土壤剖面']), 'fg-title', 'e'), L(['A soil profile', '土壤剖面']));
};

/** black soil against red soil */
const soilsFig = (L: Lx) => {
  const col = (x: number, c: string, top: string, th: number, n: Pair, lines: Pair[]) => `<rect x="${x}" y="34" width="36" height="110" fill="${c}"/><rect x="${x}" y="34" width="36" height="${th}" fill="${top}"/>`
    + tx(x, 26, L(n), 'fg-label', 's') + lines.map((p, i) => tx(x + 44, 52 + i * 22, L(p), 'fg-sub')).join('');
  return svg(300, 152,
    col(6, '#4a3626', '#1a130d', 56, ['Black soil (NE China)', '东北黑土'], [['cold: litter rots slowly', '冬季寒冷，有机质分解慢'], ['thick humus, very fertile', '腐殖质层厚，肥沃']])
    + col(152, '#b5502b', '#7a4a30', 8, ['Red soil (S China)', '南方红壤'], [['hot, wet: humus rots fast', '高温多雨，有机质分解快'], ['nutrients washed out', '养分淋失严重'], ['iron oxides: red, acidic', '富含铁铝氧化物，偏酸性']]),
    L(['Black soil and red soil', '黑土与红壤']));
};

/** the five elements of the natural environment, all linked */
const webFig = (L: Lx, id: string) => {
  const n: [Pair, string][] = [[['Climate', '气候'], '#ffd43b'], [['Water', '水文'], '#4dabf7'], [['Landform', '地形'], '#d9a066'], [['Soil', '土壤'], '#c08457'], [['Life', '生物'], '#51cf66']];
  const P = n.map((_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; return [150 + 92 * Math.cos(a), 92 + 68 * Math.sin(a)] as const; });
  let links = '';
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
    const [x1, y1] = P[i], [x2, y2] = P[j], dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy), k = 26 / d;
    links += `<path d="M${(x1 + dx * k).toFixed(1)} ${(y1 + dy * k).toFixed(1)} L${(x2 - dx * k).toFixed(1)} ${(y2 - dy * k).toFixed(1)}" stroke="#868e96" stroke-width="1.1" marker-start="url(#${id}m)" marker-end="url(#${id}m)" class="f-fade" style="--d:${(0.6 + (i + j) * 0.08).toFixed(2)}s"/>`;
  }
  const nodes = n.map(([p, c], i) => `<g class="f-fade" style="--d:${(i * 0.12).toFixed(2)}s"><ellipse cx="${P[i][0]}" cy="${P[i][1]}" rx="30" ry="13" fill="${c}"/>${tx(P[i][0], P[i][1] + 3.5, L(p), 'fg-label', 'm', DARK)}</g>`).join('');
  return svg(300, 180, arrowDef(`${id}m`, '#868e96') + links + nodes, L(['The elements of the natural environment', '自然地理要素的相互联系']));
};

// ── Lessons ──────────────────────────────────────────────────────────────────────────────────────────────────────
const AGE = (from: number, to: number, secs: number) => ({ from, to, rate: (to - from) / secs, unit: 'x' as const, fmt: ['Geological time', '地质年代'] as Pair, once: true });

export const SENIOR_A: Lesson[] = [
  {
    id: 'h-history', strand: 'physical', grade: 'h1', tracks: ['us', 'ib'], unit: EARTH, icon: 'dino', minutes: 10,
    title: ['The history of the Earth', '地球的历史'],
    blurb: ['Read 4.6 billion years in layers of rock: the eons and eras, the rise of life, two great extinctions and the coal ages.', '在一层层岩石里读懂 46 亿年：地质年代、生物的演化、两次生物大灭绝和成煤时期。'],
    keys: [
      ['Strata are laid down in order: lower layers are older (law of superposition), and each layer’s fossils date it.', '地层是按顺序沉积的：一般下老上新；地层中的化石可以确定地层的年代。'],
      ['Eons: Hadean, Archean, Proterozoic (together the Precambrian), then the Phanerozoic: Paleozoic, Mesozoic, Cenozoic.', '地质年代：冥古宙、太古宙、元古宙（合称前寒武纪）和显生宙；显生宙分为古生代、中生代、新生代。'],
      ['Animals: sea invertebrates → fish → amphibians → reptiles (dinosaurs) → mammals → humans. Plants: algae → ferns → gymnosperms → flowering plants.', '动物：海洋无脊椎动物→鱼类→两栖类→爬行类（恐龙）→哺乳类→人类；植物：海生藻类→蕨类→裸子植物→被子植物。'],
      ['Mass extinctions ended the Paleozoic (end-Permian) and the Mesozoic (end-Cretaceous, with the dinosaurs).', '古生代末（二叠纪末）和中生代末（白垩纪末，恐龙灭绝）都发生了生物大灭绝。'],
      ['The late Paleozoic and the Mesozoic were the main coal-forming times; Pangaea formed in the late Paleozoic and broke up in the Mesozoic.', '古生代后期和中生代是重要的成煤时期；联合古陆在古生代后期形成，中生代开始解体。'],
    ],
    steps: [
      {
        title: ['A book written in stone', '石头写成的史书'], astro: { kit: 'strata', mode: 'history', clock: AGE(0, 1, 28) },
        body: ['Sand, mud and shells settle on the sea floor and slowly harden into sedimentary rock, layer upon layer. Unless the rocks are later overturned, a lower layer is older than the one above it: this is the law of superposition. Watch 4.6 billion years of layers pile up.',
          '泥沙和生物遗骸在海底一层层沉积，慢慢固结成沉积岩。如果岩层没有被翻转，下面的岩层总比上面的老，这就是“下老上新”的地层层序律。看看 46 亿年的岩层是怎样一层层堆起来的。'],
      },
      {
        title: ['The geological time scale', '地质年代表'], astro: { kit: 'strata', mode: 'history', full: true }, fig: { k: 'svg', draw: timeFig },
        body: ['Fossils tell the layers apart: the same kinds of fossils mean rocks of the same age, even on different continents. Geologists divide time into eons, eras and periods. Life with hard shells only appears in the Phanerozoic eon, the last 541 million years; everything before it is called the Precambrian.',
          '化石能区分岩层：含有相同化石的地层，即使在不同大陆，年代也大致相同。地质学家把地球历史划分为宙、代、纪等单位。有硬壳的生物到显生宙（距今约 5.41 亿年以来）才大量出现，之前的漫长时期统称前寒武纪。'],
      },
      {
        title: ['The Precambrian: four billion quiet years', '前寒武纪：漫长的四十亿年'], astro: { kit: 'strata', mode: 'history', clock: AGE(0, 0.15, 10) },
        body: ['For almost 90 % of its history the Earth had only simple life. The first life appeared in the sea. Blue-green bacteria (cyanobacteria) built mats called stromatolites and, by photosynthesis, slowly filled the air with oxygen. Many of the world’s iron ores formed then, as the oxygen rusted the iron in the sea.',
          '在地球历史近 90% 的时间里，只有简单的生命。最早的生命出现在海洋中。蓝细菌（蓝藻）形成叠层石，并通过光合作用慢慢为大气积累了氧气。这一时期是重要的成矿时期，世界上许多铁矿形成于此。'],
      },
      {
        title: ['The Paleozoic: life explodes', '古生代：生命大爆发'], astro: { kit: 'strata', mode: 'history', clock: AGE(0.15, 0.604, 14) },
        body: ['In the Cambrian, sea invertebrates such as trilobites suddenly flourished. Then came the age of fishes, and some fish crawled onto land to become amphibians. Fern forests spread over swampy land, and their buried trunks became coal. The era ended at the end of the Permian with the worst extinction ever: over 90 % of sea species died out.',
          '寒武纪，以三叶虫为代表的海洋无脊椎动物空前繁盛；后来鱼类大量繁衍，一部分鱼类登上陆地演化为两栖类。蕨类植物繁盛，形成大片森林，被埋藏后成为煤炭。古生代末（二叠纪末）发生了史上最大的生物灭绝，90% 以上的海洋物种消失。'],
      },
      {
        title: ['The Mesozoic: the age of reptiles', '中生代：爬行动物的时代'], astro: { kit: 'strata', mode: 'history', clock: AGE(0.604, 0.896, 12) },
        body: ['Reptiles ruled the land, the sea and the air; dinosaurs were the giants of the Jurassic and Cretaceous. Birds and small mammals appeared. On land, gymnosperms such as conifers and cycads became dominant, and their forests made another great store of coal. The supercontinent Pangaea began to break up.',
          '爬行动物盛行，恐龙是侏罗纪和白垩纪的霸主；鸟类和小型哺乳动物出现。陆地上裸子植物（松柏、苏铁等）极度兴盛，形成又一个重要的成煤期。联合古陆开始解体，各大陆向现在的位置漂移。'],
      },
      {
        title: ['The end of the dinosaurs', '恐龙的灭绝'], cam: [30, -96, 2.4], wide: true, items: ['dn_trex'],
        marks: [mk([21.4, -89.5], 'Chicxulub crater, 66 million years ago', '希克苏鲁伯陨石坑（约 6600 万年前）', { dot: true, c: C.red, t: 0.6 })],
        body: ['66 million years ago, at the end of the Cretaceous, an asteroid about 10 km wide struck what is now Mexico, and huge volcanic eruptions in India added to the damage. Dust and gas darkened and chilled the planet; about three quarters of all species, including every dinosaur except the birds, died out.',
          '约 6600 万年前的白垩纪末，一颗直径约 10 千米的小行星撞击今墨西哥一带，加上印度大规模的火山喷发，尘埃和气体遮蔽了阳光，全球变冷。约四分之三的物种灭绝，除鸟类外的恐龙全部消失。'],
      },
      {
        title: ['The Cenozoic: mammals and flowers', '新生代：哺乳动物和被子植物'], astro: { kit: 'strata', mode: 'history', clock: AGE(0.896, 1, 10) },
        body: ['With the dinosaurs gone, mammals spread and grew large, and flowering plants (angiosperms) covered the land. The continents moved close to where they are now, and the Himalayas rose as India hit Asia. In the Quaternary, the last 2.6 million years, ice ages came and went, and humans appeared.',
          '恐龙灭绝后，哺乳动物快速发展，被子植物高度繁盛。各大陆漂移到接近现在的位置；印度板块与亚欧板块碰撞，喜马拉雅山脉隆起。第四纪（约 260 万年以来）冰期与间冰期交替，人类出现。'],
      },
      {
        title: ['Coal: buried forests', '煤炭：埋藏的森林'], cam: [35, 110, 2.2], wide: true, items: ['dn_mamenchisaurus'],
        marks: [
          mk([40.1, 113.3], 'Datong coalfield', '大同煤田', { dot: true, c: C.gold, t: 0.3 }), mk([26.6, 104.8], 'Liupanshui coalfield', '六盘水煤田', { dot: true, c: C.gold, t: 0.6 }),
          mk([32.6, 117.0], 'Huainan coalfield', '淮南煤田', { dot: true, c: C.gold, t: 0.9 }), mk([30.5, 104.5], 'Jurassic dinosaurs of Sichuan', '四川侏罗纪恐龙', { c: C.green, t: 1.2 }),
        ],
        body: ['Coal is the remains of plants that grew in warm, swampy forests and were buried before they could rot. Most of China’s coal formed in two periods: the late Paleozoic (Carboniferous and Permian fern forests) and the Mesozoic (Jurassic gymnosperm forests). The rocks of Shanxi and Inner Mongolia hold both.',
          '煤炭是温暖湿润的沼泽森林被迅速埋藏、未能腐烂而形成的。我国的煤主要形成于两个时期：古生代后期（石炭纪、二叠纪的蕨类森林）和中生代（侏罗纪的裸子植物森林）。山西、内蒙古一带的煤田两种都有。'],
      },
    ],
    quiz: [
      {
        q: ['Put these divisions of Earth history in order, oldest first.', '把下列地质年代按从古到新的顺序排列。'],
        order: [['Hadean', '冥古宙'], ['Archean', '太古宙'], ['Proterozoic', '元古宙'], ['Paleozoic', '古生代'], ['Mesozoic', '中生代'], ['Cenozoic', '新生代']],
        why: ['The three Precambrian eons come first; the Phanerozoic eon is split into the Paleozoic, Mesozoic and Cenozoic eras.', '前寒武纪的三个宙在前；显生宙依次分为古生代、中生代、新生代。'],
      },
      {
        q: ['Match each time with the life that flourished then.', '把各地质年代与当时繁盛的生物配对。'],
        match: [
          [['Precambrian', '前寒武纪'], ['Blue-green bacteria and algae', '蓝细菌、藻类']],
          [['Paleozoic', '古生代'], ['Trilobites, fish and fern forests', '三叶虫、鱼类、蕨类植物']],
          [['Mesozoic', '中生代'], ['Dinosaurs and gymnosperms', '恐龙、裸子植物']],
          [['Cenozoic', '新生代'], ['Mammals and flowering plants', '哺乳动物、被子植物']],
        ],
        why: ['Life grew more complex over time: simple sea life, then fish and ferns, then reptiles and conifers, then mammals and flowers.', '生物由简单到复杂、由海洋到陆地不断演化。'],
      },
      {
        q: ['Tap the rock layers laid down in the Mesozoic, the age of the dinosaurs.', '点出中生代（恐龙时代）形成的地层。'],
        astro: { kit: 'strata', mode: 'history', full: true, bare: true }, pick: 'mesozoic',
        why: ['Layers settle in order, so the Mesozoic layers lie above the Paleozoic ones and below the youngest, Cenozoic layers.', '地层下老上新：中生代地层位于古生代地层之上、新生代地层之下。'],
      },
      {
        q: ['In an undisturbed cliff, layer X lies below layer Y. What can you say?', '在未经扰动的崖壁上，岩层 X 位于岩层 Y 之下。可以得出什么结论？'],
        options: [['X is older than Y', 'X 比 Y 古老'], ['X is younger than Y', 'X 比 Y 年轻'], ['They are the same age', '两者年代相同'], ['X must hold more fossils', 'X 中的化石一定更多']], answer: 0,
        why: ['Sediment settles on top of what is already there, so lower layers are older: the law of superposition.', '沉积物总是落在已有地层之上，所以下面的岩层更老（地层层序律）。'],
      },
      {
        q: ['Which were the main coal-forming times? (Choose all that apply.)', '主要的成煤时期有哪些？（多选）'],
        options: [['Late Paleozoic', '古生代后期'], ['Mesozoic', '中生代'], ['Early Precambrian', '前寒武纪早期'], ['Quaternary', '第四纪']], multi: [0, 1],
        why: ['Coal needs big land forests: the fern forests of the late Paleozoic and the gymnosperm forests of the Mesozoic.', '煤由大片陆地森林形成：古生代后期的蕨类森林和中生代的裸子植物森林。'],
      },
      {
        q: ['The Mesozoic ran from 252 to 66 million years ago. How long did it last, in millions of years?', '中生代从距今 2.52 亿年持续到距今 6600 万年，共经历了约多少百万年？'],
        num: { answer: 186, tol: 2, unit: ['million years', '百万年'] },
        why: ['252 − 66 = 186 million years.', '252 − 66 = 186（百万年）。'],
      },
      {
        q: ['Which event ended the Mesozoic?', '中生代是以什么事件结束的？'],
        options: [['A mass extinction, including the dinosaurs', '生物大灭绝，恐龙灭绝'], ['The first fish appearing', '鱼类出现'], ['The first humans', '人类出现'], ['Pangaea forming', '联合古陆形成']], answer: 0,
        why: ['At the end of the Cretaceous, 66 million years ago, an asteroid impact and huge eruptions wiped out the dinosaurs.', '约 6600 万年前的白垩纪末，小行星撞击和火山喷发导致恐龙等大量物种灭绝。'],
      },
    ],
  },
  {
    id: 'h-layers', strand: 'physical', grade: 'h1', tracks: ['us', 'ib'], unit: EARTH, icon: 'globe', minutes: 10,
    title: ['The Earth’s layers', '地球的圈层结构'],
    blurb: ['Use earthquake waves to see inside the Earth: the Moho, the Gutenberg discontinuity, crust, mantle and core, and the spheres outside.', '借助地震波“看清”地球内部：莫霍面、古登堡面，地壳、地幔、地核，以及外部圈层。'],
    keys: [
      ['P waves (longitudinal) are faster and pass through solids, liquids and gases; S waves (transverse) are slower and pass through solids only.', '纵波（P 波）传播速度快，能通过固体、液体和气体；横波（S 波）速度慢，只能通过固体。'],
      ['Moho: both waves speed up, about 33 km under the continents (17 km on average; oceanic crust only about 7 km). Gutenberg: at 2,900 km S waves vanish and P waves slow down.', '莫霍面：纵波和横波速度都明显增加，大陆部分平均深约 33 千米（全球平均约 17 千米，大洋地壳平均仅约 7 千米）；古登堡面：约 2900 千米，横波消失，纵波速度突然下降。'],
      ['Crust above the Moho, mantle between, core below the Gutenberg discontinuity; the outer core is liquid, the inner core solid.', '莫霍面以上为地壳，两个不连续面之间为地幔，古登堡面以下为地核；外核为液态，内核为固态。'],
      ['The lithosphere is the crust plus the rigid top of the mantle, above the asthenosphere (about 80–400 km deep), where magma comes from.', '岩石圈包括地壳和上地幔顶部（软流层以上），由坚硬的岩石组成；软流层（约 80–400 千米深）一般认为是岩浆的发源地。'],
      ['Outside the solid Earth: the atmosphere, the hydrosphere and the biosphere, which overlaps them all.', '外部圈层包括大气圈、水圈和生物圈；生物圈渗透于其他圈层之中。'],
    ],
    steps: [
      {
        title: ['Seeing with earthquakes', '用地震波“透视”地球'], astro: { kit: 'layers', mode: 'cutaway' }, fig: { k: 'svg', draw: wavesFig },
        body: ['No drill has gone deeper than about 12 km, yet we know what lies 6,371 km down. Earthquake waves change speed, bend and even vanish as they pass through different materials. P waves push and pull and travel through anything; S waves shake sideways and only cross solids. Their speeds jump sharply at two depths.',
          '人类钻探的最大深度只有约 12 千米，却知道地下 6371 千米的情况，靠的是地震波：它在不同物质中传播速度不同，还会折射甚至消失。纵波（P 波）能通过固、液、气体；横波（S 波）只能通过固体。地震波的速度在两个深度发生明显变化。'],
      },
      {
        title: ['Lab: dive to the centre', '实验：深入地心'],
        astro: {
          kit: 'layers', mode: 'waves',
          params: [{ id: 'depth', name: ['Depth', '深度'], min: 0, max: 6371, value: 0, step: 10, fmt: ['{v} km', '{v} 千米'] }],
          tasks: [
            { text: ['Find the depth where S waves disappear.', '找到横波消失的深度。'], done: p => p.depth >= 2850 && p.depth <= 2950 },
            { text: ['Go down into the asthenosphere, where magma comes from.', '下潜到岩浆的发源地：软流层。'], done: p => p.depth >= 80 && p.depth <= 400 },
            { text: ['Reach the solid inner core.', '到达固态的内核。'], done: p => p.depth >= 5150 },
          ],
        },
        task: ['Drag the depth and watch the two curves. Where does the red S curve stop?', '拖动深度，观察两条曲线。红色的横波曲线在哪里中断？'],
        body: ['The probe shows how fast each wave travels at your depth and which layer you are in. At the Moho both waves speed up. At the Gutenberg discontinuity, 2,900 km down, S waves cannot go on and P waves slow sharply: the outer core must be liquid. P waves speed up again in the solid inner core.',
          '探测器显示所在深度的纵波、横波速度和所在圈层。经过莫霍面，两种波速度都明显增加；到约 2900 千米的古登堡面，横波完全消失，纵波速度突然下降，说明外核是液态的。进入固态的内核，纵波速度又有所增加。'],
      },
      {
        title: ['Lab: how thick is the crust?', '实验：地壳有多厚？'],
        astro: {
          kit: 'layers', mode: 'crust',
          params: [
            { id: 'x', name: ['Position: ocean → continent → plateau', '位置：海洋→大陆→高原'], min: 0, max: 100, value: 60, step: 1, fmt: ['{v}', '{v}'] },
            { id: 'depth', name: ['Drill depth', '钻探深度'], min: 0, max: 125, value: 5, step: 1, fmt: ['{v} km', '{v} 千米'] },
          ],
          tasks: [
            { text: ['Find the Moho under the continent.', '找到大陆下的莫霍面。'], done: p => p.x >= 45 && p.x <= 78 && Math.abs(p.depth - 33) <= 3 },
            { text: ['Find the Moho under the ocean.', '找到海洋下的莫霍面。'], done: p => p.x <= 33 && Math.abs(p.depth - 11) <= 2 },
            { text: ['Find the Moho under the high plateau.', '找到高原下的莫霍面。'], done: p => p.x >= 85 && Math.abs(p.depth - 65) <= 4 },
          ],
        },
        task: ['Move the drill across the section and push it down to the Moho in each place.', '沿剖面移动钻头，在不同位置把它钻到莫霍面。'],
        body: ['The crust is very uneven. Under the oceans it is thin, about 7 km on average (5–10 km) of dense basalt; under the continents it averages about 33 km, and under high plateaus such as Tibet it is 60–70 km thick, like the root of an iceberg. On average over the whole Earth it is about 17 km.',
          '地壳厚度很不均匀：大洋地壳较薄，平均约 7 千米（5–10 千米），主要是玄武岩；大陆地壳平均约 33 千米，青藏高原等高大地形下可达 60–70 千米，像冰山伸入水下的“根”。全球地壳平均厚度约 17 千米。'],
      },
      {
        title: ['Crust, mantle and core', '地壳、地幔和地核'], astro: { kit: 'layers', mode: 'cutaway' },
        body: ['The two discontinuities split the Earth into three layers. The crust is a thin rocky skin. The mantle, from the Moho to 2,900 km, is hot, dense rock rich in iron and magnesium. The core is mostly iron and nickel: the outer core is liquid metal, whose motion makes the Earth’s magnetic field; the inner core is solid because of the immense pressure.',
          '两个不连续面把地球内部分为三层。地壳是薄薄的岩石外壳；地幔从莫霍面到 2900 千米深，由含铁、镁的硅酸盐岩石组成；地核主要由铁和镍组成：外核是液态金属，它的运动产生了地球磁场；内核在巨大压力下呈固态。'],
      },
      {
        title: ['Lithosphere and asthenosphere', '岩石圈与软流层'], astro: { kit: 'layers', mode: 'cutaway', litho: true },
        body: ['In the upper mantle, about 80–400 km down, lies the asthenosphere: rock so hot that part of it is molten and it flows slowly. This is generally thought to be where magma comes from. Above it, the crust and the rigid top of the mantle together make up the lithosphere, the rocky shell that is broken into the plates.',
          '上地幔上部约 80–400 千米深处有一个软流层，温度高，物质部分熔融，能缓慢流动，一般认为这里是岩浆的发源地。软流层以上的上地幔顶部和地壳合称岩石圈，由坚硬的岩石组成，并被分割成若干板块。'],
      },
      {
        title: ['The outer spheres', '地球的外部圈层'], cam: [10, 120, 3.6], wide: true, fig: { k: 'svg', draw: spheresFig },
        paint: [{ fill: { k: 'biome' }, a: 0.55 }],
        body: ['Above the solid Earth are three more spheres. The atmosphere is the envelope of gas, thickest near the ground. The hydrosphere is all the water: oceans, rivers, lakes, ice, groundwater and vapour, continuous but uneven. The biosphere is all living things and where they live; it spans the bottom of the atmosphere, all the hydrosphere and the top of the lithosphere, linking the spheres together.',
          '地球外部有三个圈层：大气圈是包围地球的气体层，近地面最稠密；水圈由海洋、河流、湖泊、冰川、地下水和水汽等组成，连续但不规则；生物圈是地球上所有生物及其生存环境的总称，占有大气圈底部、水圈全部和岩石圈上部，把各圈层联系在一起。'],
      },
    ],
    quiz: [
      {
        q: ['How deep is the Gutenberg discontinuity, in km?', '古登堡面大约位于地下多少千米处？'],
        num: { answer: 2900, tol: 100, unit: ['km', '千米'] },
        why: ['At about 2,900 km S waves vanish and P waves slow down sharply: the boundary between the mantle and the core.', '约 2900 千米处横波消失、纵波速度突然下降，这是地幔与地核的分界。'],
      },
      {
        q: ['Put the layers in order from the centre outward.', '把地球内部圈层按由里向外的顺序排列。'],
        order: [['Inner core', '内核'], ['Outer core', '外核'], ['Lower mantle', '下地幔'], ['Asthenosphere', '软流层'], ['Crust', '地壳']],
        why: ['Solid inner core, liquid outer core, then the mantle (with the asthenosphere near its top) and the thin crust.', '固态内核、液态外核，再往外是地幔（软流层位于上地幔上部），最外面是薄薄的地壳。'],
      },
      {
        q: ['Match each to what it does.', '把下列名称与对应的特点配对。'],
        match: [
          [['P wave', '纵波'], ['Fast; passes through solids, liquids and gases', '速度快，能通过固、液、气体']],
          [['S wave', '横波'], ['Slower; passes through solids only', '速度慢，只能通过固体']],
          [['Moho', '莫霍面'], ['Both waves speed up', '纵波、横波速度都明显增加']],
          [['Gutenberg discontinuity', '古登堡面'], ['S waves vanish, P waves slow', '横波消失，纵波速度下降']],
        ],
        why: ['The way the two kinds of wave change tells us where the boundaries are and which layers are liquid.', '根据两种地震波的变化，可以确定圈层界面和液态圈层的位置。'],
      },
      {
        q: ['Tap the layer that is liquid metal.', '点出由液态金属组成的圈层。'],
        astro: { kit: 'layers', mode: 'cutaway', bare: true }, pick: 'outer-core',
        why: ['S waves cannot cross the outer core, so it must be liquid; it is mostly iron and nickel.', '横波不能通过外核，说明外核是液态的，主要由铁、镍组成。'],
      },
      {
        q: ['An earthquake strikes under the sea near a ship. What do the crew feel?', '海底发生地震，附近船上的人会有什么感觉？'],
        options: [['Only up-and-down jolts', '只有上下颠簸'], ['Only side-to-side shaking', '只有左右摇晃'], ['Up-and-down first, then side to side', '先上下颠簸，后左右摇晃'], ['Nothing at all', '没有任何感觉']], answer: 0,
        why: ['Only P waves can pass through the water, and they reach the ship from below as up-and-down jolts; S waves stop at the sea floor.', '只有纵波能在海水中传播，从下往上传到船上，表现为上下颠簸；横波不能通过海水。'],
      },
      {
        q: ['What makes up the lithosphere? (Choose all that apply.)', '岩石圈包括哪些部分？（多选）'],
        options: [['The crust', '地壳'], ['The top of the mantle, above the asthenosphere', '软流层以上的上地幔顶部'], ['The asthenosphere', '软流层'], ['The outer core', '外核']], multi: [0, 1],
        why: ['The lithosphere is the rigid shell: the crust and the solid top of the mantle that sits on the asthenosphere.', '岩石圈由地壳和软流层以上的上地幔顶部组成，都是坚硬的岩石。'],
      },
      {
        q: ['Where is magma generally thought to come from?', '一般认为岩浆发源于哪里？'],
        options: [['The asthenosphere', '软流层'], ['The inner core', '内核'], ['The outer core', '外核'], ['The crust’s surface', '地表']], answer: 0,
        why: ['In the asthenosphere, 80–400 km down, the rock is hot enough to partly melt.', '软流层位于上地幔上部（约 80–400 千米深），物质部分熔融，是岩浆的发源地。'],
      },
    ],
  },
  {
    id: 'h-landforms', strand: 'physical', grade: 'h1', tracks: ['uk', 'au'], unit: LAND, icon: 'mountain', minutes: 10,
    title: ['Common landforms', '常见地貌类型'],
    blurb: ['Karst, river, desert, coastal and glacial landforms: how water, wind, waves and ice carve and build the land.', '喀斯特、河流、风沙、海岸和冰川地貌：流水、风、海浪和冰川怎样侵蚀和堆积出各种地貌。'],
    keys: [
      ['Karst: water with dissolved CO₂ dissolves limestone into caves, stone forests and peak forests; dripping water builds stalactites.', '喀斯特地貌：含二氧化碳的流水溶蚀石灰岩，形成溶洞、石林、峰林等；水中碳酸钙沉积形成石钟乳、石笋、石柱。'],
      ['Rivers cut V-shaped valleys upstream and build alluvial fans, floodplains and deltas downstream; on a bend the concave bank is eroded and the convex bank built up.', '河流上游下切形成 V 形谷；出山口形成冲积扇，中下游形成河漫滩，河口形成三角洲；河道弯曲处凹岸侵蚀、凸岸堆积。'],
      ['Wind carves mushroom rocks and yardangs, and piles sand into crescent dunes: gentle windward slope, steep leeward slope, horns pointing downwind.', '风蚀形成风蚀蘑菇、雅丹地貌；风积形成新月形沙丘：迎风坡缓、背风坡陡，两翼指向下风向。'],
      ['Waves cut cliffs, caves and sea stacks; calm water builds sandy beaches.', '海浪侵蚀形成海蚀崖、海蚀洞、海蚀柱；海浪堆积形成沙滩等。'],
      ['Glaciers carve horns, cirques and U-shaped valleys (fjords where the sea floods in) and leave moraines.', '冰川侵蚀形成角峰、冰斗和 U 形谷（被海水淹没成为峡湾），冰川堆积形成冰碛地貌。'],
    ],
    steps: [
      {
        title: ['Karst: rock that dissolves', '喀斯特地貌：会“溶化”的岩石'], cam: [24.5, 107, 2.4], items: ['cn_guilin', 'halong'], fig: { k: 'svg', draw: karstFig },
        marks: [mk([25.27, 110.29], 'Guilin: peak forest', '桂林：峰林', { dot: true, c: C.gold, t: 0.4 }), mk([24.82, 103.33], 'Lunan Stone Forest', '路南石林', { dot: true, c: C.gold, t: 0.8 })],
        body: ['Rain takes up carbon dioxide and becomes a weak acid that slowly dissolves limestone. Over millions of years it widens cracks into sinkholes, caves and underground rivers, and leaves peaks, towers and stone forests standing. Inside caves, dripping water gives up its calcium carbonate and builds stalactites, stalagmites and columns. South-west China has one of the largest karst areas in the world.',
          '雨水溶解了二氧化碳，变成弱酸，缓慢地溶蚀石灰岩。经过漫长的时间，裂隙被扩大成落水洞、溶洞和地下河，地表留下峰丛、峰林、孤峰和石林。溶洞中，滴水中的碳酸钙沉积下来，形成石钟乳、石笋和石柱。我国西南地区是世界上喀斯特地貌分布最广的地区之一。'],
      },
      {
        title: ['Rivers that cut', '流水侵蚀地貌'], cam: [30, 108, 2.2], wide: true, fig: { k: 'svg', draw: meanderFig },
        lines: [{ pts: RIVERS.yangtze, c: C.blue, w: 1.6, dur: 2.5 }],
        marks: [mk([30.95, 110.3], 'Three Gorges: V-shaped valleys', '长江三峡：V 形谷', { dot: true, c: C.gold, t: 0.6 })],
        body: ['In the mountains a river flows fast and cuts down into its bed, carving deep, steep V-shaped valleys such as the Three Gorges; it also cuts back toward its source and widens its valley. Where it bends, the water swings to the outer, concave bank and wears it away, while slower water on the inner, convex bank drops sand: the bend grows and the river meanders.',
          '山区河流流速快，以下切侵蚀为主，形成深而陡的 V 形谷，如长江三峡；河流还会溯源侵蚀和侧蚀，使河谷加长、展宽。河道弯曲处，水流冲向外侧的凹岸，凹岸被侵蚀；内侧凸岸水流慢，泥沙堆积，河道越来越弯曲。'],
      },
      {
        title: ['Rivers that build', '流水堆积地貌'], cam: [37, 108, 2.2], wide: true,
        lines: [{ pts: RIVERS.yellow, c: C.gold, w: 1.6, dur: 3 }],
        marks: [mk([38.93, 100.45], 'Alluvial fans, Hexi Corridor', '河西走廊的冲积扇', { dot: true, c: C.orange, t: 0.8 }), mk([37.75, 119.0], 'Yellow River delta', '黄河三角洲', { dot: true, c: C.orange, t: 1.4 }), mk([35, 116], 'North China Plain', '华北平原', { big: true, t: 2 })],
        body: ['Where a river leaves the mountains, it suddenly slows and drops its load in a fan-shaped alluvial fan; oases in the Hexi Corridor grow on them. On the plains, floods spread silt over a floodplain beside the channel. At the mouth, meeting the still sea, the river drops the rest and builds a delta. The silt-laden Yellow River pushes its delta out into the sea by kilometres every few years.',
          '河流出山口，流速骤减，泥沙堆积形成扇形的冲积扇，河西走廊的绿洲就分布在冲积扇上。在中下游平原，洪水漫出河道，泥沙堆积成河漫滩。在河口，河水受海水顶托，泥沙大量堆积形成三角洲。含沙量极大的黄河，三角洲不断向海推进。'],
      },
      {
        title: ['Wind and sand', '风沙地貌'], cam: [40, 90, 2.0], wide: true, items: ['cn_mogao'], fig: { k: 'svg', draw: duneFig },
        marks: [mk([40.55, 93.0], 'Dunhuang yardangs', '敦煌雅丹', { dot: true, c: C.gold, t: 0.4 }), mk([39, 83], 'Taklimakan dunes', '塔克拉玛干沙漠沙丘', { big: true, c: C.orange, t: 0.9 })],
        body: ['In dry lands, wind armed with sand blasts the rock. It undercuts rocks into mushroom shapes and carves ridges and furrows into yardangs, like the "devil city" near Dunhuang. Where the wind drops its sand it piles up dunes. A crescent dune has a long gentle slope facing the wind and a steep slip face on the lee side, and its two horns point downwind.',
          '在干旱地区，挟带沙粒的风不断吹蚀、磨蚀岩石，形成风蚀蘑菇、风蚀柱，以及沟槽与土墩相间的雅丹地貌，如敦煌的“魔鬼城”。风力减弱时，沙粒堆积成沙丘。新月形沙丘迎风坡缓而长，背风坡陡，两翼（沙丘的两个尖角）指向下风向。'],
      },
      {
        title: ['Waves on the coast', '海岸地貌'], cam: [30, 118, 3.4], fig: { k: 'dia', id: 'coast' },
        marks: [mk([37.39, 122.7], 'Chengshantou: sea cliffs and stacks', '成山头：海蚀崖、海蚀柱', { dot: true, c: C.gold, t: 0.4 }), mk([39.82, 119.48], 'Beidaihe: sandy beaches', '北戴河：沙滩', { dot: true, c: C.teal, t: 0.8 }), mk([18.25, 109.5], 'Sanya: sandy beaches', '三亚：沙滩', { dot: true, c: C.teal, t: 1.2 })],
        body: ['Where waves hit a rocky shore they cut a notch, then a sea cave, and the cliff above collapses: the coast retreats as a sea cliff. Headlands are cut through into arches, and when an arch falls a sea stack is left, like the Twelve Apostles in Australia. In sheltered bays the waves lose energy and drop sand and gravel, building beaches and sand bars.',
          '海浪拍击基岩海岸，先蚀出海蚀穴、海蚀洞，上部岩石崩塌，海岸后退形成海蚀崖；岬角被蚀穿形成海蚀拱桥，拱桥坍塌后留下海蚀柱，如澳大利亚的“十二门徒”。在隐蔽的海湾，海浪能量减弱，泥沙堆积形成沙滩、沙坝等海积地貌。'],
      },
      {
        title: ['Rivers of ice', '冰川地貌'], cam: [54, 9, 2.8], items: ['matterhorn'], fig: { k: 'dia', id: 'valleys' },
        marks: [mk([61.1, 6.5], 'Sognefjord', '松恩峡湾', { dot: true, c: C.ice, t: 0.5 }), mk([45.98, 7.66], 'Matterhorn: a horn', '马特洪峰：角峰', { dot: true, c: C.ice, t: 1 })],
        body: ['A glacier is slow, heavy and full of rock: it plucks and grinds its bed. It scoops out armchair-shaped cirques; where several cirques eat into one peak they leave a sharp horn such as the Matterhorn. It turns a river’s V into a broad U-shaped valley. When the ice melts the sea may flood the U-valleys as fjords, as in Norway, and the rock it carried is dumped as moraine.',
          '冰川移动缓慢，但质量巨大且挟带大量岩块，能强烈刨蚀、磨蚀谷底和谷壁，形成冰斗；几个冰斗从不同方向侵蚀同一山峰，形成尖锐的角峰，如马特洪峰。冰川把河流的 V 形谷改造成宽阔的 U 形谷，海水淹没后形成峡湾，如挪威海岸。冰川融化后，挟带的碎屑堆积形成冰碛地貌。'],
      },
    ],
    quiz: [
      {
        q: ['Match each landform to what made it.', '把地貌与形成它的外力作用配对。'],
        match: [
          [['Stone forest', '石林'], ['Water dissolving limestone', '流水溶蚀']],
          [['Delta', '三角洲'], ['River deposition', '流水堆积']],
          [['Yardang', '雅丹地貌'], ['Wind erosion', '风力侵蚀']],
          [['Crescent dune', '新月形沙丘'], ['Wind deposition', '风力堆积']],
          [['Sea stack', '海蚀柱'], ['Wave erosion', '海浪侵蚀']],
          [['U-shaped valley', 'U 形谷'], ['Glacial erosion', '冰川侵蚀']],
        ],
        why: ['Each agent erodes in some places and deposits in others; the shape of a landform tells you which agent was at work.', '各种外力既有侵蚀作用，也有堆积作用；从地貌形态可以判断主要的外力作用。'],
      },
      {
        q: ['Place these landforms on the globe.', '在地球上标出下列地貌的位置。'],
        place: [{ text: ['Guilin peak forest', '桂林峰林'], at: [25.27, 110.29], tolKm: 350 }, { text: ['Dunhuang yardangs', '敦煌雅丹'], at: [40.55, 93.0], tolKm: 350 }, { text: ['Yellow River delta', '黄河三角洲'], at: [37.75, 119.0], tolKm: 300 }],
        why: ['Karst in the wet, limestone south-west; yardangs in the dry north-west; the delta where the Yellow River meets the Bohai Sea.', '喀斯特地貌在湿润、石灰岩广布的西南；雅丹地貌在干旱的西北；黄河三角洲在黄河注入渤海处。'],
      },
      {
        q: ['The figure shows a crescent dune; the dark line is its steep slip face. Where does the wind blow from?', '图示为某新月形沙丘，深色线为其陡坡。当地的盛行风向是？'],
        fig: { k: 'svg', draw: duneQuizFig },
        options: [['From the east', '偏东风'], ['From the west', '偏西风'], ['From the north', '偏北风'], ['From the south', '偏南风']], answer: 0,
        why: ['The horns and the steep slip face point downwind, here to the west, so the wind blows from the east; the gentle slope faces it.', '两翼和陡坡（背风坡）指向下风向，图中指向西，所以盛行偏东风；缓坡是迎风坡。'],
      },
      {
        q: ['Where should a port be built on a river bend?', '在河流弯道处修建港口，应选在哪一岸？'],
        options: [['The concave (outer) bank: deep water', '凹岸：水深'], ['The convex (inner) bank: flat land', '凸岸：地势平坦'], ['Either; it makes no difference', '两岸都一样'], ['In the middle of the channel', '河道中央']], answer: 0,
        why: ['The current scours the concave bank, keeping it deep for ships; the convex bank silts up.', '凹岸受侵蚀，水深，利于船舶停靠；凸岸泥沙堆积，水浅。'],
      },
      {
        q: ['Which landforms are built by deposition? (Choose all that apply.)', '下列地貌中，由堆积作用形成的有（多选）'],
        options: [['Alluvial fan', '冲积扇'], ['Delta', '三角洲'], ['Sand dune', '沙丘'], ['V-shaped valley', 'V 形谷'], ['Yardang', '雅丹地貌']], multi: [0, 1, 2],
        why: ['Fans and deltas are dropped by rivers and dunes by the wind; V-valleys and yardangs are carved by erosion.', '冲积扇、三角洲由流水堆积而成，沙丘由风力堆积而成；V 形谷、雅丹是侵蚀地貌。'],
      },
      {
        q: ['How does a stalactite grow?', '石钟乳是怎样形成的？'],
        options: [['Dripping water loses CO₂ and leaves calcium carbonate behind', '滴水中的二氧化碳逸出，碳酸钙沉积'], ['Wind piles up sand on the cave roof', '风把沙堆在洞顶'], ['Lava cools as it drips', '岩浆滴落冷却'], ['Ice freezes in the cave', '洞中的水结冰']], answer: 0,
        why: ['Water seeping into the cave releases carbon dioxide, so the calcium carbonate it carried is deposited drop by drop.', '渗入溶洞的水中二氧化碳逸出，溶解的碳酸钙一点点沉积下来，形成石钟乳、石笋、石柱。'],
      },
    ],
  },
  {
    id: 'h-soil-veg', strand: 'physical', grade: 'h1', tracks: ['ib'], unit: SOILVEG, icon: 'leaf', minutes: 10,
    title: ['Vegetation and soil', '植被与土壤'],
    blurb: ['How forests, grasslands and desert plants fit their climates, what soil is made of, how it forms, and why black soil is so rich.', '森林、草原和荒漠植被怎样适应环境，土壤由什么组成、怎样形成，黑土为什么那么肥沃。'],
    keys: [
      ['Natural vegetation follows climate: forests where it is wet, grassland where it is drier, desert plants where it is driest.', '自然植被与气候相适应：湿润地区为森林，半湿润、半干旱地区为草原，干旱地区为荒漠。'],
      ['Rainforest trees have buttress roots and flowers on their trunks; desert plants have deep roots and small, waxy or spiny leaves; conifers have needles and a cone shape.', '热带雨林有板根、茎花等现象；荒漠植物根系发达，叶片小，多呈刺状或有蜡质；针叶林叶片呈针状，树冠多呈塔形。'],
      ['Soil is minerals, organic matter, water and air. A forest soil profile: organic layer, humus layer, eluvial layer, illuvial layer, parent material, bedrock.', '土壤由矿物质、有机质、水分和空气组成。森林土壤剖面：有机层、腐殖质层、淋溶层、淀积层、母质层、母岩层。'],
      ['Soil forms from parent material, living things (the most active factor), climate, relief, time and human activity.', '土壤的形成受成土母质、生物（最活跃的因素）、气候、地貌、时间和人类活动的影响。'],
      ['North-east China’s black soil is thick and rich because cold winters slow decay; southern red soil is acidic and poor because heat and rain rot humus fast and wash out nutrients.', '东北黑土冬季寒冷，有机质分解慢，腐殖质层厚，十分肥沃；南方红壤高温多雨，有机质分解快，养分淋失严重，呈酸性，较贫瘠。'],
    ],
    steps: [
      {
        title: ['Plants follow the climate', '植被与气候'], cam: [20, 30, 4.4], wide: true,
        paint: [{ fill: { k: 'biome' }, a: 0.8 }], fig: { k: 'key', set: 'biome', only: ['rainforest', 'savanna', 'desert', 'grassland', 'evergreen', 'temperateforest', 'taiga', 'tundra'] },
        body: ['Vegetation is the plant cover of a place. Natural vegetation is a mirror of the climate: where it is warm and wet there is forest, where rain is scarcer grassland, and where it is driest desert scrub. Cold limits it too, from tropical rainforest near the equator to coniferous forest and tundra toward the poles.',
          '植被是覆盖一个地区的植物群落的总称。自然植被是气候的一面镜子：温暖湿润的地区生长森林，降水较少的地区为草原，最干旱的地区为荒漠。热量也有影响：从赤道附近的热带雨林，到高纬度的针叶林和苔原。'],
      },
      {
        title: ['Tropical rainforest', '热带雨林'], cam: [-3, -62, 2.8], items: ['pl_kapok'],
        paint: [{ fill: { k: 'biome', only: ['rainforest'] }, a: 0.8 }],
        marks: [mk([-4, -63], 'Amazon rainforest', '亚马孙热带雨林', { big: true, c: C.green, t: 0.5 })],
        body: ['Hot and wet all year, the rainforest is the richest vegetation on Earth, with many layers from the giant emergent trees to the dark floor. It is evergreen. Tall trees grow wide buttress roots to stand in thin soil; many trees bear flowers and fruit straight on their trunks (cauliflory); leaves have drip tips to shed the rain, and climbers and epiphytes cover the branches.',
          '热带雨林全年高温多雨，是地球上最丰富的植被，群落结构复杂，垂直分层多，终年常绿。高大的乔木在浅薄的土壤上长出板根；许多树木在树干上开花结果（茎花现象）；叶片有滴水叶尖，藤本植物和附生植物遍布枝干。'],
      },
      {
        title: ['Grassland and desert', '草原与荒漠'], cam: [-20, 18, 3], items: ['pl_welwitschia', 'cb_deadvlei', 'baobabs'],
        paint: [{ fill: { k: 'biome', only: ['savanna', 'desert', 'grassland', 'shrubland'] }, a: 0.8 }],
        marks: [mk([-2.3, 34.8], 'Serengeti savanna', '塞伦盖蒂热带草原', { c: C.gold, t: 0.5 }), mk([-24, 15.2], 'Namib Desert', '纳米布沙漠', { c: C.orange, t: 0.8 }), mk([-21, 25], 'Kalahari', '卡拉哈里', { c: C.gold, t: 1.1 })],
        body: ['Where it is too dry for forest, grasses take over: tropical savanna with scattered trees such as the baobab, or temperate steppe. In deserts plants survive on very little water. They send roots deep or wide, shrink their leaves into spines or coat them with wax, and store water in fleshy stems, like cacti; Welwitschia in the Namib drinks fog through its two long leaves.',
          '降水不足以生长森林的地方，以草本植物为主：热带草原上散生着猴面包树等耐旱乔木，温带草原则以草为主。荒漠植物适应极度缺水的环境：根系发达，叶片退化成刺状或表面有蜡质，有的茎肉质储水，如仙人掌；纳米布沙漠的百岁兰靠两片长叶吸收雾中的水分。'],
      },
      {
        title: ['Forests of the middle and high latitudes', '中高纬度的森林'], cam: [45, 110, 3.4], wide: true,
        paint: [{ fill: { k: 'biome', only: ['evergreen', 'temperateforest', 'taiga'] }, a: 0.8 }],
        marks: [mk([25, 112], 'Evergreen broadleaf', '常绿阔叶林', { c: C.green, t: 0.5 }), mk([38, 116], 'Deciduous broadleaf', '落叶阔叶林', { c: C.gold, t: 0.8 }), mk([58, 105], 'Taiga (coniferous)', '亚寒带针叶林', { c: C.blue, t: 1.1 })],
        body: ['Southern China’s evergreen broadleaf forest has glossy, waxy leaves and stays green all year. Further north, deciduous broadleaf trees such as oaks and maples drop their leaves to survive the cold, dry winter. In the long winters of the taiga, needle-leaved conifers such as spruce, fir and larch grow in a cone shape so that snow slides off.',
          '我国南方的常绿阔叶林，叶片革质、表面有蜡质，四季常绿；往北的落叶阔叶林（栎、槭等）冬季落叶，以适应寒冷干燥的冬季；寒冷漫长的亚寒带针叶林中，云杉、冷杉、落叶松等叶片呈针状，树冠呈塔形，不易积雪。'],
      },
      {
        title: ['What soil is made of', '土壤的组成'], cam: [44, 120, 2.2], wide: true,
        lines: [{ pts: [[50.5, 125], [48.5, 129.5], [45.5, 131], [43, 126.5], [43.5, 123], [47, 122.5]], c: C.gold, w: 1.2, closed: true, dur: 1.5 }],
        fig: { k: 'pie', title: ['A fertile soil, by volume', '肥沃土壤的组成（体积）'], parts: [{ name: ['Minerals', '矿物质'], v: 45, c: '#c08457' }, { name: ['Organic matter', '有机质'], v: 5, c: '#3b2f22' }, { name: ['Water', '水分'], v: 25, c: '#4dabf7' }, { name: ['Air', '空气'], v: 25, c: '#e9ecef' }] },
        paint: [{ fill: { k: 'poly', pts: [[50.5, 125], [48.5, 129.5], [45.5, 131], [43, 126.5], [43.5, 123], [47, 122.5]], c: 'rgba(30,22,16,.75)', clip: ['CN'] } }],
        marks: [mk([46.5, 126], 'Black soil of the North-east Plain', '东北平原黑土区', { big: true, c: C.gold, t: 0.5 })],
        body: ['Soil is the loose top layer of the land in which plants grow. About half of it is mineral grains weathered from rock, and only about 5 % is organic matter, yet that organic matter, broken down into humus, is the key to fertility. The rest is pore space filled with water and air, which roots need too.',
          '土壤是陆地表面能够生长植物的疏松表层。矿物质约占一半，来自岩石的风化；有机质只占约 5%，但它分解形成的腐殖质是土壤肥力的关键；其余是孔隙中的水分和空气，也是植物根系所必需的。'],
      },
      {
        title: ['Reading a soil profile', '观察土壤剖面'], cam: [44, 120, 2.2], wide: true, fig: { k: 'svg', draw: soilFig },
        body: ['Dig a pit in a forest and the soil shows layers. On top lies leaf litter; below it a dark humus layer; then a pale eluvial layer from which rainwater has washed clay and iron down into the illuvial layer below; then broken parent material and finally solid bedrock. Grassland and farm soils have fewer layers.',
          '在森林里挖一个土坑，可以看到土壤分层：最上面是枯枝落叶构成的有机层；下面是颜色较深的腐殖质层；再往下是颜色较浅的淋溶层，雨水把其中的黏粒、铁等物质淋洗到下面的淀积层；再往下是风化碎屑组成的母质层，最底部是坚硬的母岩层。草原土壤和耕作土壤的层次较少。'],
      },
      {
        title: ['How soil forms: black and red', '土壤的形成：黑土与红壤'], cam: [36, 114, 3.2], fig: { k: 'svg', draw: soilsFig },
        lines: [{ pts: [[50.5, 125], [48.5, 129.5], [45.5, 131], [43, 126.5], [43.5, 123], [47, 122.5]], c: C.white, w: 1.2, closed: true, dur: 1.5 }],
        paint: [
          { fill: { k: 'poly', pts: [[50.5, 125], [48.5, 129.5], [45.5, 131], [43, 126.5], [43.5, 123], [47, 122.5]], c: 'rgba(30,22,16,.8)', clip: ['CN'] } },
          { fill: { k: 'poly', pts: [[30, 108], [30.3, 114], [29.5, 118], [28, 121], [24.5, 118.5], [23.5, 113], [23, 108], [25.5, 104.5], [28, 105]], c: 'rgba(196,78,40,.7)', clip: ['CN'] }, t: 0.6 },
        ],
        marks: [mk([46, 126], 'Black soil', '黑土', { big: true, c: C.white, t: 0.3 }), mk([26.5, 113], 'Red soil', '红壤', { big: true, c: C.red, t: 0.9 })],
        body: ['Weathered rock (the parent material) gives soil its minerals. Living things are the most active factor: plants and microbes add and break down organic matter and make humus. Climate sets the pace of weathering and decay, relief moves water and sediment, and soils take thousands of years to form. In the cold North-east, litter rots slowly and builds thick, fertile black soil. In the hot, wet South, humus rots fast and rain leaches nutrients away, leaving acidic red soil stained by iron oxides; farmers add lime and organic manure to improve it.',
          '岩石风化形成的成土母质是土壤矿物质的来源；生物是土壤形成中最活跃的因素，植物和微生物积累、分解有机质，形成腐殖质；气候影响风化和有机质分解的速度；地貌影响水分和物质的迁移；土壤的形成需要漫长的时间。东北冬季寒冷，有机质分解慢，积累形成深厚肥沃的黑土；南方高温多雨，有机质分解快，养分淋失严重，铁铝氧化物使土壤呈红色、偏酸性，可以施用石灰、增施有机肥加以改良。'],
      },
    ],
    quiz: [
      {
        q: ['Match each vegetation type with one of its adaptations.', '把植被类型与它的适应特征配对。'],
        match: [
          [['Tropical rainforest', '热带雨林'], ['Buttress roots, flowers on the trunk', '板根、茎花']],
          [['Desert plants', '荒漠植被'], ['Deep roots, tiny or spiny leaves', '根系发达，叶片小或呈刺状']],
          [['Coniferous forest', '针叶林'], ['Needle leaves, cone-shaped crowns', '叶片针状，树冠呈塔形']],
          [['Deciduous broadleaf forest', '落叶阔叶林'], ['Drops its leaves in winter', '冬季落叶']],
        ],
        why: ['Each adaptation answers a problem: thin soil and dim light in the rainforest, drought in the desert, snow and cold in the taiga and the temperate winter.', '各种适应特征都对应着环境中的问题：雨林土层薄、林下光照弱，荒漠缺水，寒冷地区冬季低温、积雪。'],
      },
      {
        q: ['Put the layers of a forest soil profile in order, from the surface down.', '把森林土壤剖面的各层由地表向下排序。'],
        order: [['Organic layer', '有机层'], ['Humus layer', '腐殖质层'], ['Eluvial layer', '淋溶层'], ['Illuvial layer', '淀积层'], ['Parent material', '母质层'], ['Bedrock', '母岩层']],
        why: ['Litter on top, humus below it, then the washed-out layer, the layer where the washed material collects, broken rock and solid rock.', '有机层在最上，其下为腐殖质层、淋溶层、淀积层、母质层，最底部是母岩层。'],
      },
      {
        q: ['Which is the most active factor in forming soil?', '土壤形成过程中，最活跃的因素是什么？'],
        options: [['Living things', '生物'], ['Parent material', '成土母质'], ['Relief', '地貌'], ['Time', '时间']], answer: 0,
        why: ['Living things build up organic matter and turn it into humus, which makes soil fertile.', '生物积累有机质并将其转化为腐殖质，是土壤肥力形成的关键，是最活跃的因素。'],
      },
      {
        q: ['Which part takes up the most of a fertile soil?', '在肥沃的土壤中，所占体积最大的组成部分是？'],
        fig: { k: 'pie', title: ['A fertile soil, by volume', '肥沃土壤的组成（体积）'], parts: [{ name: ['Minerals', '矿物质'], v: 45, c: '#c08457' }, { name: ['Organic matter', '有机质'], v: 5, c: '#3b2f22' }, { name: ['Water', '水分'], v: 25, c: '#4dabf7' }, { name: ['Air', '空气'], v: 25, c: '#e9ecef' }] },
        options: [['Minerals', '矿物质'], ['Organic matter', '有机质'], ['Water', '水分'], ['Air', '空气']], answer: 0,
        why: ['Mineral grains are about 45 %; organic matter is only about 5 %, though it matters most for fertility.', '矿物质约占 45%；有机质虽然只占约 5%，却是土壤肥力的关键。'],
      },
      {
        q: ['Why is the black soil of North-east China so fertile? (Choose all that apply.)', '东北黑土肥沃的原因有（多选）'],
        options: [['Cold winters slow the decay of organic matter', '冬季寒冷，有机质分解缓慢'], ['Lush summer grass and forest add much litter', '夏季植物生长茂盛，枯枝落叶多'], ['Thick humus builds up', '腐殖质积累深厚'], ['Heavy rain leaches it all year', '全年多雨，淋溶作用强']], multi: [0, 1, 2],
        why: ['Lots of organic matter goes in each summer, and the cold slows its decay, so humus piles up. Strong leaching is the problem of the red soils.', '夏季有机质来源多，冬季寒冷分解慢，腐殖质大量积累；淋溶强是南方红壤的特点。'],
      },
      {
        q: ['How can farmers improve acidic red soil in the South?', '南方红壤偏酸性，可以怎样改良？'],
        options: [['Add lime and organic manure', '施用石灰，增施有机肥'], ['Spread salt', '撒盐'], ['Burn off all plants', '烧掉地表植被'], ['Plough deeper to expose bedrock', '深翻露出母岩']], answer: 0,
        why: ['Lime neutralises the acid, and organic manure adds the humus that heat and rain have removed.', '石灰可以中和酸性；有机肥能补充被高温多雨分解、淋失的有机质。'],
      },
    ],
  },
  {
    id: 'h-forces', strand: 'physical', grade: 'h2', tracks: ['uk', 'us'], unit: SHAPE, icon: 'volcano', minutes: 12,
    title: ['The forces that shape the land', '塑造地表形态的力量'],
    blurb: ['Internal forces raise, fold and break the crust; external forces wear it down. Follow the rock cycle and see why an anticline can become a valley.', '内力抬升、弯曲、断裂地壳，外力削高填低。认识岩石圈物质循环，看看背斜为什么会成谷。'],
    keys: [
      ['Internal forces (from the Earth’s heat): crustal movement, magmatic activity, metamorphism. They build relief.', '内力作用（能量来自地球内部的热能）：地壳运动、岩浆活动、变质作用，使地表变得高低不平。'],
      ['External forces (from solar energy and gravity): weathering, erosion, transport, deposition, lithification. They level relief.', '外力作用（能量来自太阳辐射能和重力能）：风化、侵蚀、搬运、堆积、固结成岩，使地表趋于平坦。'],
      ['Rock cycle: magma → igneous rock (intrusive or extrusive) → sedimentary and metamorphic rock → melted back into magma.', '岩石圈物质循环：岩浆冷却凝固形成岩浆岩（侵入岩、喷出岩），经外力作用形成沉积岩，经变质作用形成变质岩，岩石重熔再生又成为岩浆。'],
      ['A fold arching up is an anticline (oldest rock in its core), down a syncline. The cracked anticline crest wears fastest, so an anticline can become a valley and a syncline a mountain.', '岩层向上拱起为背斜（中心岩层老），向下弯曲为向斜（中心岩层新）。背斜顶部受张力、易被侵蚀，可能形成谷地；向斜槽部受挤压、不易被侵蚀，可能成为山岭。'],
      ['Anticlines trap oil and gas; synclines collect groundwater. Faults make block mountains (horsts, e.g. Huashan) and rift valleys (grabens, e.g. the Wei River plain, the East African Rift).', '背斜是良好的储油、储气构造，向斜利于储存地下水。断层处岩块上升形成断块山（地垒，如华山），下降形成谷地或平原（地堑，如渭河平原、东非大裂谷）。'],
    ],
    steps: [
      {
        title: ['Two sets of forces', '内力和外力'], cam: [32, 95, 3.2], tectonics: true,
        lines: [{ pts: REGIONS.himalaya, c: C.red, w: 1.4, closed: true, dur: 2 }, { pts: RIVERS.yellow, c: C.gold, w: 1.6, t: 1.2, dur: 2.5 }, { pts: RIVERS.yangtze, c: C.blue, w: 1.6, t: 1.4, dur: 2.5 }],
        marks: [mk([28.5, 86.5], 'Himalayas: still rising (internal)', '喜马拉雅山：仍在升高（内力）', { c: C.red, t: 0.6 }), mk([37.2, 119.2], 'Silt from the Loess Plateau builds land (external)', '黄土高原的泥沙堆积成陆（外力）', { c: C.gold, t: 2.4 })],
        body: ['The land surface is a battle between two sets of forces. Internal forces draw on the Earth’s inner heat: they move the crust, push up mountains such as the Himalayas, which still rise as India pushes into Asia, and drive volcanoes and earthquakes. External forces draw on sunlight and gravity: water, wind, ice and waves break rock down, carry it away and drop it in low places. Internal forces mostly make the land rougher, external forces smoother.',
          '地表形态是内力和外力共同作用的结果。内力作用的能量来自地球内部的热能，表现为地壳运动、岩浆活动、变质作用等，如印度洋板块向北挤压，喜马拉雅山至今仍在升高。外力作用的能量来自太阳辐射能和重力能，流水、风、冰川、海浪等把岩石风化、侵蚀、搬运，最后堆积在低处。内力作用使地表变得高低不平，外力作用使地表趋于平坦。'],
      },
      {
        title: ['The rock cycle', '岩石圈物质循环'], cam: [28, 112, 2.8], items: ['cn_huangshan', 'cn_danxia', 'cn_guilin'], fig: { k: 'dia', id: 'rockcycle' },
        marks: [mk([25.6, 100.2], 'Dali: marble', '大理：大理岩', { dot: true, c: C.white, t: 0.8 })],
        body: ['Magma that cools underground makes intrusive igneous rock with big crystals, such as the granite of Huangshan; lava that cools at the surface makes extrusive rock such as basalt. Weathered, carried and deposited sediment is pressed and cemented into sedimentary rock in layers, often with fossils, like the red sandstone of Danxia or the limestone of Guilin. Heat and pressure turn rocks into metamorphic rock: limestone into the marble of Dali. Deep down, any rock can melt back into magma, and the cycle goes on.',
          '岩浆在地下冷凝形成侵入岩，晶体较大，如黄山的花岗岩；喷出地表冷凝形成喷出岩，如玄武岩。岩石经风化、侵蚀、搬运、堆积和固结成岩形成沉积岩，具有层理构造，常含化石，如丹霞山的红色砂岩、桂林的石灰岩。岩石在高温高压下发生变质作用形成变质岩，如石灰岩变成大理岩。各类岩石在地下深处重熔再生，又成为新的岩浆，周而复始。'],
      },
      {
        title: ['Lab: fold it, then wear it down', '实验：挤压褶皱，再侵蚀它'],
        astro: {
          kit: 'strata', mode: 'fold',
          params: [
            { id: 'squeeze', name: ['Compression', '水平挤压'], min: 0, max: 100, value: 0, step: 1, fmt: ['{v} %', '{v}%'] },
            { id: 'erode', name: ['Erosion', '外力侵蚀'], min: 0, max: 100, value: 0, step: 1, fmt: ['{v} %', '{v}%'] },
          ],
          tasks: [
            { text: ['Squeeze the layers into a strong fold.', '把岩层挤压成明显的褶皱。'], done: p => p.squeeze >= 60 },
            { text: ['Erode until the anticline becomes a valley.', '侵蚀，直到背斜变成谷地。'], done: p => foldInverted(p.squeeze, p.erode) },
          ],
        },
        task: ['Push the layers together, then wear them down. Watch the surface over the anticline and over the syncline.', '先水平挤压岩层，再进行侵蚀，观察背斜和向斜处地表的变化。'],
        body: ['Squeezed sideways, flat layers buckle. Where they arch up is an anticline, where they sag down a syncline. At first the anticline is a ridge and the syncline a valley. But the top of the arch is stretched and cracked, so it wears away fast, while the trough of the syncline is squeezed tight and resists. Erode long enough and the anticline becomes a valley and the syncline a mountain. To tell them apart, look at the rock: the oldest layer is in the core of an anticline, the youngest in the core of a syncline.',
          '岩层受水平挤压发生弯曲：向上拱起的是背斜，向下弯曲的是向斜。初期背斜成山、向斜成谷。但背斜顶部受张力，裂隙发育，容易被侵蚀；向斜槽部受挤压，岩性坚实，不易被侵蚀。侵蚀时间长了，就会出现“背斜成谷、向斜成山”的地形倒置。判断背斜、向斜要看岩层：背斜中心岩层老、两翼新；向斜中心岩层新、两翼老。'],
      },
      {
        title: ['Oil, gas and water in folds', '褶皱与资源、工程'], astro: { kit: 'strata', mode: 'fold', squeeze: 75, erode: 0, res: true },
        body: ['Folds matter for people. Oil and gas are lighter than water and rise until trapped under the arch of an anticline, so geologists drill at anticline crests. Groundwater runs down the layers and gathers in synclines, good places for wells. Tunnels are usually built through anticlines: the arch holds itself up and water drains away, while a tunnel through a syncline may flood.',
          '褶皱与人类活动关系密切。石油、天然气比水轻，向上运移，聚集在背斜顶部，背斜是良好的储油、储气构造；地下水沿岩层向下汇集到向斜槽部，向斜利于打井取水。修建隧道一般选在背斜处：背斜呈拱形，结构稳定，地下水也向两翼流走；在向斜处修隧道则可能变成“水库”。'],
      },
      {
        title: ['Faults: block mountains', '断层：断块山'], astro: { kit: 'strata', mode: 'fault', kind: 'horst', clock: { from: 0, to: 100, rate: 25, unit: 'x', fmt: ['Fault movement', '断层运动'], once: true } },
        body: ['When rock is stressed beyond its strength it breaks, and the blocks slide along the break: a fault. If a block rises between two faults it stands up as a block mountain (a horst), with steep, straight sides along the faults, like Huashan or Lushan. Springs and lakes often line up along faults, and builders avoid them because of earthquakes and leaks.',
          '岩层受力超过其承受能力就会破裂，并沿断裂面发生明显的位移，这就是断层。两条断层之间的岩块相对上升，形成断块山（地垒），山坡陡峭、沿断层呈直线状，如华山、庐山、泰山。断层处常有泉水、湖泊分布；修建大型工程时要避开断层，以免诱发地震、渗漏等灾害。'],
      },
      {
        title: ['Faults: rift valleys', '断层：地堑'], astro: { kit: 'strata', mode: 'fault', kind: 'graben', clock: { from: 0, to: 100, rate: 25, unit: 'x', fmt: ['Fault movement', '断层运动'], once: true } },
        body: ['If the block between two faults drops, it becomes a rift valley or plain (a graben). Rivers then flow along it and fill it with fertile silt: the Wei River plain and the Fen River valley in China are grabens. Where the crust is pulled apart over a long distance, a great rift opens, such as the East African Rift.',
          '两条断层之间的岩块相对下降，形成谷地或平原（地堑），常有河流沿其发育，并堆积成肥沃的平原，如我国的渭河平原、汾河谷地。地壳在大范围内被拉张时，可形成巨大的裂谷，如东非大裂谷。'],
      },
      {
        title: ['Faults on the map', '断层地貌实例'], cam: [20, 75, 4.4], sketch: true,
        lines: [{ pts: EAST_AFRICA_RIFT, c: C.red, w: 1.6, dur: 2.5, t: 1.6 }],
        marks: [
          mk([34.48, 110.08], 'Huashan (horst) & Wei River plain (graben)', '华山（断块山）与渭河平原（地堑）', { dot: true, c: C.orange, t: 0.3 }),
          mk([29.55, 115.98], 'Lushan (horst)', '庐山（断块山）', { dot: true, c: C.orange, t: 1.2 }),
          mk([3, 36.5], 'East African Rift', '东非大裂谷', { big: true, c: C.red, t: 2.2 }),
        ],
        body: ['Huashan rises straight up from the Wei River plain: the mountain block went up along a fault as the plain beside it went down, the same movement seen from both sides. The East African Rift, thousands of kilometres long, is where Africa is slowly being pulled apart.',
          '华山拔地而起，紧邻渭河平原：断层一侧的岩块上升成山，另一侧下降成为平原，是同一次断裂运动的两个结果。长达数千千米的东非大裂谷，是非洲大陆正在被缓慢拉开的地方。'],
      },
    ],
    quiz: [
      {
        q: ['Match each rock with its type.', '把岩石与它所属的类型配对。'],
        match: [
          [['Granite', '花岗岩'], ['Intrusive igneous rock', '侵入岩']],
          [['Basalt', '玄武岩'], ['Extrusive igneous rock', '喷出岩']],
          [['Limestone', '石灰岩'], ['Sedimentary rock', '沉积岩']],
          [['Marble', '大理岩'], ['Metamorphic rock', '变质岩']],
        ],
        why: ['Granite cools slowly underground, basalt quickly at the surface; limestone is laid down in water; marble is limestone changed by heat and pressure.', '花岗岩在地下缓慢冷凝，玄武岩在地表迅速冷凝；石灰岩由沉积作用形成；大理岩是石灰岩经变质作用形成的。'],
      },
      {
        q: ['Tap the anticline.', '点出图中的背斜。'],
        astro: { kit: 'strata', mode: 'fold', squeeze: 80, erode: 0, bare: true }, pick: 'anticline',
        why: ['An anticline is where the layers arch upward, with the oldest rock in its core.', '岩层向上拱起的部分是背斜，中心部分岩层较老。'],
      },
      {
        q: ['Why can an anticline end up as a valley?', '背斜为什么可能成为谷地？'],
        options: [['Its cracked, stretched crest is eroded fastest', '背斜顶部受张力，裂隙发育，易被侵蚀'], ['Its rock is the youngest and softest', '背斜中心岩层最新最软'], ['Rivers always start on anticlines', '河流都发源于背斜'], ['Anticlines sink after they form', '背斜形成后会下沉']], answer: 0,
        why: ['Bending stretches the top of the arch and opens cracks, so weathering and erosion strip it fastest; the squeezed syncline holds out.', '弯曲使背斜顶部受张力，裂隙多，容易被风化、侵蚀；向斜槽部受挤压，坚实不易被侵蚀。'],
      },
      {
        q: ['Which are internal forces? (Choose all that apply.)', '下列属于内力作用的是（多选）'],
        options: [['Crustal movement', '地壳运动'], ['Magmatic activity', '岩浆活动'], ['Metamorphism', '变质作用'], ['Weathering', '风化作用'], ['Transport by rivers', '流水搬运']], multi: [0, 1, 2],
        why: ['Internal forces draw on the Earth’s inner heat; weathering and transport are external forces, driven by the Sun and gravity.', '内力作用的能量来自地球内部；风化、搬运属于外力作用，能量来自太阳辐射和重力。'],
      },
      {
        q: ['Put the external processes that turn old rock into new sedimentary rock in order.', '把外力作用形成沉积岩的过程排序。'],
        order: [['Weathering', '风化'], ['Erosion', '侵蚀'], ['Transport', '搬运'], ['Deposition', '堆积'], ['Lithification', '固结成岩']],
        why: ['Rock is broken down, removed, carried, dropped, then pressed and cemented into sedimentary rock.', '岩石先被风化破碎，再被侵蚀、搬运，然后堆积，最后固结成为沉积岩。'],
      },
      {
        q: ['Where in a fold should you drill for oil and gas?', '在褶皱中勘探石油、天然气，应选在哪里？'],
        options: [['The crest of an anticline', '背斜顶部'], ['The trough of a syncline', '向斜槽部'], ['On a fault', '断层处'], ['Anywhere; the layers are the same', '任意位置都一样']], answer: 0,
        why: ['Oil and gas are lighter than water and rise into the top of the arch, where they are trapped.', '石油、天然气密度小，向上运移并聚集在背斜顶部。'],
      },
      {
        q: ['Huashan has steep, straight cliffs and rises straight from the Wei River plain. What kind of mountain is it?', '华山山体陡峭、山麓平直，紧邻渭河平原。它属于哪种山？'],
        options: [['A fault-block mountain (horst)', '断块山'], ['A volcano', '火山'], ['A folded mountain', '褶皱山'], ['A sand dune', '沙丘']], answer: 0,
        why: ['Huashan rose along faults while the Wei River plain dropped beside it: a horst next to a graben.', '华山沿断层上升形成断块山，相邻的渭河平原沿断层下降形成地堑。'],
      },
    ],
  },
  {
    id: 'h-integrity', strand: 'physical', grade: 'h2', tracks: ['ib'], unit: UNITY, icon: 'sparkle', minutes: 9,
    title: ['The natural environment as a whole', '自然环境的整体性'],
    blurb: ['Climate, water, landforms, soil and life are all linked: change one and the rest follow, as the Amazon and the Loess Plateau show.', '气候、水文、地形、土壤、生物相互联系：牵一发而动全身。以亚马孙雨林和黄土高原为例。'],
    keys: [
      ['The elements of nature (climate, water, landforms, soil, life) interact and exchange matter and energy, forming a whole.', '自然地理要素（气候、水文、地形、土壤、生物）相互联系、相互作用，进行物质和能量交换，形成一个整体。'],
      ['The whole evolves together: when one element changes, the others change with it (e.g. the rise of the Tibetan Plateau).', '自然环境各要素统一演化：一个要素变化，其他要素也随之变化（如青藏高原的隆升）。'],
      ['A change in one element spreads through the rest (“pull one hair and the whole body moves”).', '某一要素的变化会导致其他要素乃至整个环境的变化（牵一发而动全身）。'],
      ['Clearing forest on the Loess Plateau or in the Amazon sets off a chain: soil erosion, poorer soil, changes to rivers and climate.', '黄土高原、亚马孙雨林的植被破坏会引发连锁反应：水土流失、土壤肥力下降、河流和气候变化等。'],
      ['Restoring one element, such as returning farmland to forest, can set off a chain of improvements.', '恢复某一要素（如退耕还林还草）也能带动整体环境的改善。'],
      ['Together the elements gain new functions: production (photosynthesis makes organic matter) and balance (keeping the air’s carbon–oxygen balance).', '各要素相互作用产生新功能：生产功能（绿色植物通过光合作用制造有机物）和平衡功能（维持大气的碳氧平衡）。'],
    ],
    steps: [
      {
        title: ['Everything is connected', '要素之间的联系'], cam: [20, 40, 4.4], wide: true, fig: { k: 'svg', draw: webFig },
        paint: [{ fill: { k: 'biome' }, a: 0.6 }],
        body: ['Climate decides how much water a place has; water carves landforms; landforms steer air and water; rock, climate and life make soil; and soil and climate decide what can grow, which in turn shelters the soil and returns water to the air. Through these exchanges of matter and energy the elements form one whole, and each place has its own matching set: wet tropics with rainforest and leached red soil, dry lands with deserts and thin, salty soil.',
          '气候决定一个地区的水分条件；流水塑造地貌；地形又影响大气和水的运动；岩石、气候和生物共同形成土壤；土壤和气候决定植被，植被又保护土壤、通过蒸腾把水分送回大气。各要素通过物质和能量交换形成一个整体，每个地区都有一套相互协调的要素组合：湿热的热带有雨林和淋溶强的红壤，干旱区有荒漠和贫瘠、含盐的土壤。'],
      },
      {
        title: ['Evolving together: the rise of Tibet', '统一演化：青藏高原的隆升'], cam: [32, 92, 3.2],
        lines: [{ pts: REGIONS.tibet, c: C.white, w: 1.4, closed: true, dur: 2 }, ...[RIVERS.yangtze, RIVERS.yellow, RIVERS.mekong, RIVERS.ganges, RIVERS.indus].map((pts, i) => ({ pts, c: C.blue, w: 1.3, t: 1.6 + i * 0.3, dur: 2.2 }))],
        marks: [mk([33, 88], 'Tibetan Plateau', '青藏高原', { big: true, t: 0.4 })],
        body: ['As India pushed into Asia over the last tens of millions of years, the Tibetan Plateau rose. Every element changed with it: the air grew thin and cold, glaciers formed, and great rivers such as the Yangtze, Yellow and Mekong began there; alpine meadows and cold-adapted animals replaced the warm forests whose fossils are still found in its rocks, and the plateau changed the monsoon of all East Asia.',
          '数千万年来，印度洋板块向北挤压亚欧板块，青藏高原逐渐隆升。各要素随之一起变化：气温降低，空气稀薄，形成高寒气候，发育了冰川；长江、黄河、澜沧江等大河在这里发源；原来的温暖森林（今天还能找到它们的化石）被高寒草甸和耐寒动物取代；高原还改变了整个东亚的季风环流。'],
      },
      {
        title: ['New functions: production and balance', '产生新功能：生产功能和平衡功能'], cam: [8, -20, 4.6], wide: true,
        paint: [{ fill: { k: 'biome', only: ['rainforest', 'desert'] }, a: 0.75 }],
        marks: [
          mk([-4, -62], 'Amazon: ≈ 2,000 g of plant matter per m² a year', '亚马孙雨林：每平方米每年约 2000 克', { c: C.green, t: 0.5 }),
          mk([23, 10], 'Sahara: under 100 g', '撒哈拉荒漠：不足 100 克', { c: C.gold, t: 1 }),
        ],
        fig: { k: 'svg', draw: chainFig(['Producing something new', '产生新功能'], [[['Sunlight, water, CO₂ and soil nutrients', '太阳光、水、二氧化碳、土壤养分'], '#ffd43b'], [['Photosynthesis in green plants', '绿色植物的光合作用'], '#8ce99a'], [['Organic matter: food, wood (production)', '制造有机物：粮食、木材（生产功能）'], '#e9c46a'], [['CO₂ taken in, O₂ given out (balance)', '吸收二氧化碳、释放氧气（平衡功能）'], '#a5d8ff']]) },
        body: ['When the elements work together they can do what none can do alone. Sunlight, water, carbon dioxide and the nutrients of the soil meet in green plants, which make organic matter by photosynthesis: this production function feeds every food chain, every farm and forest. A tropical rainforest produces about 2,000 g of dry plant matter per square metre a year, a hot desert less than 100 g, because there water is missing from the combination. At the same time plants take in CO₂ and give out O₂, keeping the carbon–oxygen balance of the air (oxygen steady at about 21%): the balance function.',
          '各要素相互作用，能产生单个要素所不具备的新功能。阳光、水、二氧化碳和土壤中的养分在绿色植物中结合，通过光合作用制造有机物，这就是生产功能，它是食物链和农业、林业的基础：热带雨林每平方米每年生产约 2000 克干物质，热带荒漠缺水，不足 100 克。绿色植物同时吸收二氧化碳、释放氧气，使大气中的氧气稳定在约 21%，维持碳氧平衡，这就是平衡功能。'],
      },
      {
        title: ['Clearing the Amazon', '亚马孙雨林的破坏'], cam: [-5, -60, 2.8],
        lines: [{ pts: REGIONS.amazon, c: C.green, w: 1.4, closed: true, dur: 2 }],
        paint: [{ fill: { k: 'biome', only: ['rainforest'] }, a: 0.7 }],
        fig: { k: 'svg', draw: chainFig(['A chain of effects', '连锁反应'], [[['Rainforest cleared', '砍伐雨林'], '#8ce99a'], [['Bare soil: nutrients washed out, erosion', '地表裸露，养分淋失，水土流失'], '#e9c46a'], [['Less evaporation and transpiration', '蒸发和蒸腾减少'], '#a5d8ff'], [['Less rain, more drought and fire', '降水减少，干旱、火灾增多'], '#ffc078'], [['Species lost; less carbon stored', '物种减少，碳吸收减少'], '#ffa8a8']]) },
        body: ['The rainforest seems rich, but its soil is poor: heat and rain rot fallen leaves almost at once and wash the nutrients away, so nearly all of them are stored in the living plants. Cut the forest and the nutrients go with it; heavy rain strips the bare soil, which is soon useless for farming. Since much of the Amazon’s rain is water the forest itself has breathed out, clearing it also dries the climate. The loss of species and of a huge carbon store affects the whole world.',
          '热带雨林看似富饶，土壤却很贫瘠：高温多雨，枯枝落叶很快被分解，养分又被雨水淋失，养分几乎都储存在植物体内。一旦砍伐，养分随之失去；裸露的土壤被暴雨冲刷，很快就无法耕种。亚马孙地区的降水有很大一部分来自雨林自身的蒸腾，毁林还会使气候变干。物种的消失和巨大碳库的丧失，影响的是全球环境。'],
      },
      {
        title: ['The Loess Plateau', '黄土高原的水土流失'], cam: [36, 109, 1.6], wide: true,
        marks: [mk([37.2, 109.5], 'Loess Plateau', '黄土高原', { big: true, c: C.gold, t: 0.6 })],
        lines: [{ pts: LOESS_PLATEAU, c: C.gold, w: 1.4, closed: true, dur: 2 }, { pts: RIVERS.yellow, c: C.orange, w: 1.6, t: 1, dur: 2.5 }],
        fig: { k: 'svg', draw: chainFig(['Pull one hair…', '牵一发而动全身'], [[['Forest and grass cleared', '植被破坏'], '#8ce99a'], [['Loose loess left bare to summer storms', '疏松的黄土裸露，夏季暴雨冲刷'], '#e9c46a'], [['Severe soil erosion, deep gullies', '水土流失加剧，沟壑纵横'], '#ffc078'], [['Poorer soil, lower harvests', '土壤肥力下降，粮食减产'], '#ffa8a8'], [['Silt raises the Yellow River bed downstream', '黄河含沙量增大，下游河床抬高'], '#a5d8ff']]) },
        body: ['Loess is fine and loose, and the plateau’s rain falls in heavy summer storms. Once the trees and grass were cleared for farming and fuel, storms washed the soil into gullies. The plateau lost its fertile topsoil, and the silt made the Yellow River the muddiest river in the world, raising its bed downstream above the surrounding land: a “river hanging in the sky”.',
          '黄土疏松，黄土高原的降水又多集中在夏季，且多暴雨。植被被开垦、砍伐后，暴雨冲刷地表，形成千沟万壑。高原失去了肥沃的表土，大量泥沙进入黄河，使黄河成为世界上含沙量最大的河流，下游河床不断抬高，成为“地上河”。'],
      },
      {
        title: ['Putting it back', '退耕还林还草'], cam: [37, 109, 2.4],
        lines: [{ pts: LOESS_PLATEAU, c: C.green, w: 1.4, closed: true, dur: 2 }],
        paint: [{ fill: { k: 'poly', pts: LOESS_PLATEAU, c: 'rgba(81,207,102,.35)', clip: ['CN'] }, t: 0.8 }],
        body: ['The chain works in reverse too. Since 1999, steep farmland on the Loess Plateau has been returned to forest and grass, terraces and check dams have been built, and grazing has been limited. Plant cover has roughly doubled, less soil washes away, and the silt reaching the Yellow River has fallen sharply. Improving one element improved the whole.',
          '连锁反应也可以向好的方向发展。1999 年以来，黄土高原实施退耕还林还草，修梯田、打淤地坝，限制放牧。植被覆盖率大约翻了一番，水土流失减轻，黄河的输沙量大幅减少。一个要素的改善，带动了整个环境的好转。'],
      },
    ],
    quiz: [
      {
        q: ['Put this chain of events on the Loess Plateau in order.', '把黄土高原的连锁反应按顺序排列。'],
        order: [['Vegetation is cleared', '植被破坏'], ['Loose loess is left bare', '黄土裸露'], ['Soil erosion speeds up', '水土流失加剧'], ['The soil grows poorer', '土壤肥力下降'], ['The Yellow River bed rises downstream', '黄河下游河床抬高']],
        why: ['Without plant cover the storms wash the loose loess away; the land loses its topsoil and the river fills with silt.', '植被破坏后，疏松的黄土被暴雨冲刷，土壤变得贫瘠，泥沙进入黄河，在下游淤积。'],
      },
      {
        q: ['Match each change with its knock-on effect.', '把各种变化与它引起的连锁影响配对。'],
        match: [
          [['The Tibetan Plateau rises', '青藏高原隆升'], ['A cold high climate and the source of great rivers', '形成高寒气候，成为大江大河的发源地']],
          [['Overgrazing on dry grassland', '干旱区草原过度放牧'], ['Grassland turns to desert', '草场退化，土地荒漠化']],
          [['Paving a city with concrete', '城市地面硬化'], ['Less water soaks in, more floods', '下渗减少，地表径流增加，易内涝']],
          [['A dam traps a river’s silt', '大坝拦截泥沙'], ['The delta downstream shrinks', '下游三角洲面积缩小']],
        ],
        why: ['Each change in one element is passed on to the others through the flows of water, soil and energy.', '一个要素的变化会通过水、土、能量的联系传递给其他要素。'],
      },
      {
        q: ['Why is the soil of the Amazon rainforest poor, despite the lush forest?', '亚马孙雨林植被茂密，为什么土壤却很贫瘠？'],
        options: [['Heat and rain rot litter fast and wash nutrients away; most nutrients are in the plants', '高温多雨，有机质分解快，养分易淋失，养分主要储存在植物体内'], ['There are too few plants to make humus', '植物太少，不能形成腐殖质'], ['It is too cold for decay', '气温太低，有机质不能分解'], ['The soil is frozen for half the year', '土壤半年冻结']], answer: 0,
        why: ['In the hot, wet tropics nutrients cycle quickly through the plants and are leached from the soil.', '在湿热的热带，养分在生物间快速循环，留在土壤中的很少，又易被淋失。'],
      },
      {
        q: ['What can clearing the Amazon rainforest lead to? (Choose all that apply.)', '大规模砍伐亚马孙雨林可能导致（多选）'],
        options: [['Loss of species', '生物多样性减少'], ['Soil erosion and poorer soil', '水土流失，土壤贫瘠化'], ['Less rain in the region', '区域降水减少'], ['More carbon dioxide in the air', '大气中二氧化碳增多'], ['Much more fertile soil', '土壤变得更加肥沃']], multi: [0, 1, 2, 3],
        why: ['Clearing removes habitat, nutrients, moisture and a carbon store all at once; the soil only gets poorer.', '砍伐雨林同时破坏了生物栖息地、养分库、水汽来源和碳库；土壤只会更贫瘠。'],
      },
      {
        q: ['What does the rise of the Tibetan Plateau show about the natural environment?', '青藏高原隆升带来的变化，体现了自然环境的什么特征？'],
        options: [['Its elements evolve together', '各要素统一演化'], ['Only landforms change; climate stays the same', '只有地形变化，气候不变'], ['Each element changes on its own', '各要素各自独立变化'], ['Nothing changes over time', '自然环境不会随时间变化']], answer: 0,
        why: ['As the land rose, the climate, rivers, soil and life all changed together.', '地形抬升，气候、水文、土壤和生物随之一起变化，这就是统一演化。'],
      },
      {
        q: ['A dry valley’s scrub is cleared, and dust storms grow worse downwind. This shows that the environment is…', '某干旱河谷的灌丛被砍伐后，下风向的沙尘天气加剧。这体现了自然环境的'],
        options: [['A whole: a change in one place and one element spreads', '整体性：一个要素、一个地区的变化会影响其他要素和地区'], ['Different from place to place', '地域差异性'], ['Unchanging', '稳定不变性'], ['Only affected by people', '只受人类影响']], answer: 0,
        why: ['Losing the vegetation changes the soil and the air, and the effect travels to other places: the environment works as a whole.', '植被的变化影响了土壤和大气，还影响到其他地区，体现了自然环境的整体性。'],
      },
      {
        q: ['Find the two regions of this lesson on the globe.', '在地球仪上找到本课的两个案例地区。'],
        place: [
          { text: ['Loess Plateau', '黄土高原'], at: [37, 108], tolKm: 500 },
          { text: ['Amazon rainforest', '亚马孙雨林'], at: [-4, -62], tolKm: 1200 },
        ],
        why: ['The Loess Plateau lies in the middle reaches of the Yellow River; the Amazon basin straddles the equator in South America.', '黄土高原位于黄河中游；亚马孙雨林位于南美洲赤道附近的亚马孙平原。'],
      },
    ],
  },
  {
    id: 'h-zonation', strand: 'physical', grade: 'h2', tracks: ['ib'], unit: UNITY, icon: 'compass', minutes: 12,
    title: ['Natural zones: from equator to pole, coast to inland, foot to summit', '自然环境的地域差异'],
    blurb: ['Why natural zones change with latitude, with distance from the sea and with height, build your own mountain of belts, and spot places that break the pattern.', '自然带为什么随纬度、距海远近和海拔高度变化？亲手“造”一座有垂直自然带的山，再找找打破规律的地方。'],
    keys: [
      ['Latitudinal zonation: from the equator to the poles, heat falls, so zones change north–south (they run east–west).', '纬度地带性：由赤道到两极，热量递减，自然带沿纬线方向延伸、沿经线方向更替。'],
      ['Zonation by moisture (longitudinal): from the coast inland, water falls, e.g. along 40° N in China: forest → grassland → desert.', '干湿度地带性（经度地带性）：由沿海向内陆，水分递减，如我国 40°N 附近由东向西依次为森林、草原、荒漠。'],
      ['Vertical zonation: up a mountain heat falls (≈ 0.6 °C per 100 m) and water changes; the belt at the foot matches the local horizontal zone.', '垂直地带性：随海拔升高，热量递减（约每 100 米降低 0.6 °C），水分也发生变化；山麓的自然带与当地水平自然带一致。'],
      ['The lower the latitude and the higher the mountain, the more belts. Wet, windward slopes have more belts; the snowline is highest in the dry subtropics and higher on dry, leeward and sunny slopes.', '纬度越低、山体越高，垂直自然带越多；迎风坡水分多，自然带更丰富；雪线在副热带干旱地区最高，背风坡、阳坡的雪线一般较高。'],
      ['Non-zonal (azonal) differences come from local landforms, sea currents, groundwater and so on.', '非地带性分异：受海陆分布、地形、洋流、地下水等因素影响，形成与地带性规律不符的现象。'],
    ],
    steps: [
      {
        title: ['From the equator to the poles', '由赤道到两极的地域分异'], cam: [15, 20, 4.6], wide: true,
        paint: [{ fill: { k: 'biome' }, a: 0.85 }], fig: { k: 'key', set: 'biome', only: ['rainforest', 'savanna', 'desert', 'shrubland', 'temperateforest', 'taiga', 'tundra'] },
        lines: [{ pts: [[-34, 20], [0, 20], [70, 20]], c: C.white, w: 1.4, dur: 3, rhumb: true }],
        body: ['Follow the line from South Africa up through Africa and Europe. The Sun’s heat falls with latitude, so the natural zones change one after another: rainforest at the equator, savanna, desert, Mediterranean scrub, forest, taiga and tundra. They stretch east–west along the parallels and replace each other north–south. This is latitudinal zonation, and its basis is heat.',
          '沿白线从南非向北穿过非洲和欧洲：太阳辐射随纬度变化，热量由赤道向两极递减，自然带依次更替：热带雨林、热带草原、热带荒漠、亚热带常绿硬叶林、温带森林、亚寒带针叶林、苔原。它们沿纬线方向延伸、沿经线方向更替，这就是由赤道到两极的地域分异规律（纬度地带性），基础是热量。'],
      },
      {
        title: ['From the coast to the interior', '从沿海向内陆的地域分异'], cam: [40, 100, 3], sketch: true,
        paint: [{ fill: { k: 'biome', only: ['temperateforest', 'grassland', 'desert'] }, a: 0.85 }], fig: { k: 'key', set: 'biome', only: ['temperateforest', 'grassland', 'desert'] },
        lines: [{ pts: [[40, 124], [40, 75]], c: C.white, w: 1.4, dur: 3, rhumb: true, arrow: true }],
        marks: [mk([41, 120], 'Forest', '森林', { c: C.green, t: 0.6 }), mk([43, 108], 'Grassland', '草原', { c: C.lime, t: 1.4 }), mk([40, 88], 'Desert', '荒漠', { c: C.orange, t: 2.2 })],
        body: ['Now go west along 40° N from the coast of China. The temperature changes little, but moist sea air reaches less and less far: rain falls from humid to dry. The zones change from forest to grassland to desert and run roughly north–south, parallel to the coast. This zonation by moisture is often called longitudinal zonation; its basis is water.',
          '再沿 40°N 从我国沿海向西走：热量变化不大，但海洋水汽越来越难到达，降水由多到少，自然带由森林、草原过渡到荒漠，大致沿经线方向延伸、与海岸平行。这就是从沿海向内陆的地域分异规律（干湿度地带性，又称经度地带性），基础是水分。'],
      },
      {
        title: ['Lab: build a mountain', '实验：造一座山'],
        astro: {
          kit: 'mountain', mode: 'lab',
          params: [
            { id: 'lat', name: ['Latitude of the mountain', '山的纬度'], min: 0, max: 70, value: 40, step: 1, fmt: ['{v}°', '{v}°'] },
            { id: 'height', name: ['Height', '山的海拔'], min: 1000, max: 8800, value: 2000, step: 100, fmt: ['{v} m', '{v} 米'] },
          ],
          tasks: [
            { text: ['Make a mountain with at least 6 belts.', '造一座至少有 6 个自然带的山。'], done: p => beltsOf(p.lat, p.height).length >= 6 },
            { text: ['Find a latitude where the foot of the mountain is tundra.', '找到山麓就是苔原的纬度。'], done: p => isFootTundra(p.lat, p.height) },
            { text: ['Put a snowy summit on the equator (latitude 10° or less).', '在赤道附近（纬度 10° 以内）造一座有冰雪带的山。'], done: p => p.lat <= 10 && beltsOf(p.lat, p.height).slice(-1)[0]?.id === 'snow' },
          ],
        },
        task: ['Change the latitude and the height and count the belts. Which mountains have the most?', '改变纬度和海拔，数一数自然带。什么样的山自然带最多？'],
        body: ['Up a mountain the air cools about 0.6 °C every 100 m, and moisture changes too, so the vegetation changes in belts, much as it does going toward the poles. The belt at the foot is the local horizontal zone. Mountains near the equator start with rainforest and can climb through many belts to permanent snow; the higher the mountain and the lower its latitude, the more belts it has.',
          '海拔每升高 100 米，气温约降低 0.6 °C，水分条件也随之变化，所以植被呈带状更替，类似于从赤道向两极的变化。山麓的自然带与当地的水平自然带一致。低纬度的高山从热带雨林开始，可以一直更替到终年积雪；纬度越低、山体越高，垂直自然带越丰富。'],
      },
      {
        title: ['Qomolangma: two slopes, two stories', '珠穆朗玛峰：南北坡的差异'], astro: { kit: 'mountain', mode: 'everest' },
        body: ['The south slope of Qomolangma (Everest) starts at about 1,000 m in a warm valley and faces the moist monsoon from the Indian Ocean, so it climbs through many belts, from evergreen broadleaf forest to ice. The north slope rises from the 4,300 m Tibetan Plateau and lies in the rain shadow: it has only a few belts, starting with alpine steppe. Yet the snowline is higher on the dry north side (about 6,000 m against 5,500 m), because less snow falls there.',
          '珠峰南坡山麓海拔约 1000 米，地处喜马拉雅山南侧的湿润谷地，迎着来自印度洋的西南季风，从常绿阔叶林到冰雪带，自然带多而完整。北坡从海拔约 4300 米的青藏高原上升起，处于背风坡，自然带少，从高山草原开始。但北坡降水少，雪线反而比南坡高（约 6000 米，南坡约 5500 米）。'],
      },
      {
        title: ['Kilimanjaro: snow on the equator', '乞力马扎罗山：赤道上的雪山'], astro: { kit: 'mountain', mode: 'lab', lat: 3, height: 5900 },
        body: ['Kilimanjaro (5,895 m) stands only 3° south of the equator, yet glaciers cap its summit. Climbing it is like travelling from the equator to the poles: at 0.6 °C per 100 m the top is about 30 °C colder than the plain at its foot. The model starts from humid lowland at sea level; the real mountain rises from savanna at about 1,000 m (its foot matches the local zone), through montane forest, wettest on the south slope that faces the moist south-east trades, then heath and alpine meadow, alpine desert, and ice and snow above about 5,000 m. This is vertical zonation, not a non-zonal exception. Since 1912 its glaciers have shrunk by more than 80%.',
          '乞力马扎罗山海拔 5895 米，位于南纬 3° 附近，山顶却有冰川。从山麓登上山顶，就像从赤道走到两极：按每升高 100 米降温 0.6 °C 计算，山顶比山麓平原低约 30 °C。模型的山麓是海平面的湿润低地；真实的乞力马扎罗山从海拔约 1000 米的热带草原上升起（山麓自然带与当地水平自然带一致），向上依次是山地森林（南坡迎着湿润的东南信风，降水最多）、灌丛和高山草甸、高山荒漠，约 5000 米以上为冰雪带。这是垂直地带性的典型例子，而不是非地带性现象。1912 年以来，山顶冰川已缩小了 80% 以上。'],
      },
      {
        title: ['The snowline', '雪线'], cam: [28, 45, 4.6], wide: true, sketch: true,
        marks: [
          mk([-3.07, 37.35], 'Kilimanjaro, 3° S: ≈ 5,000 m', '乞力马扎罗山（3°S）：约 5000 米', { dot: true, c: C.white, t: 0.4 }),
          mk([32, 88], 'Tibet, 30° N, dry: ≈ 6,000 m', '青藏高原（30°N，干燥）：约 6000 米', { dot: true, c: C.gold, t: 0.8 }),
          mk([46.5, 8], 'Alps, 46° N: ≈ 3,000 m', '阿尔卑斯山（46°N）：约 3000 米', { dot: true, c: C.teal, t: 1.2 }),
          mk([61.5, 7.5], 'Norway, 61° N: ≈ 1,500 m', '挪威（61°N）：约 1500 米', { dot: true, c: C.ice, t: 1.6 }),
        ],
        fig: {
          k: 'line', title: ['Snowline height by latitude (northern hemisphere, approx.)', '雪线高度随纬度的变化（北半球，约值）'], unit: ['m · latitude °N', '米 · 纬度 °N'],
          x: [0, 10, 20, 30, 40, 50, 60, 70], min: 0, max: 6500,
          series: [{ name: ['Snowline', '雪线'], c: C.ice, y: [4900, 5100, 5600, 5800, 4000, 2800, 1500, 700] }],
          notes: [{ x: 30, text: ['Highest: dry subtropics', '副热带干旱区最高'] }],
        },
        body: ['The snowline is the lower edge of permanent snow, where a year\'s snowfall just equals what melts. More heat lifts it, so it falls towards the poles: about 3,000 m in the Alps and 1,500 m in Norway. Yet it is highest not on the rainy equator (about 4,800–5,000 m) but in the dry subtropics, about 6,000 m in Tibet and over 6,000 m in the central Andes, because little snow falls under the sinking air. On one mountain the snowline is lower on the wet windward side and on shady slopes; Qomolangma\'s north slope is shady, but it is so dry that its snowline is higher than the south slope\'s.',
          '雪线是终年积雪的下限，在这里一年的降雪量与消融量大致相等。热量越多，雪线越高，所以雪线总体由低纬向高纬降低：阿尔卑斯山约 3000 米，挪威约 1500 米。但雪线最高处不在多雨的赤道（约 4800–5000 米），而在副热带干旱地区：青藏高原约 6000 米，安第斯山脉中段超过 6000 米，因为那里盛行下沉气流，降雪少。同一座山，迎风坡降水多、阴坡热量少，雪线较低；珠峰北坡虽是阴坡，但处于背风坡、降水少，雪线反而比南坡高。'],
      },
      {
        title: ['Breaking the pattern', '非地带性现象'], cam: [-6, -18, 4.8], wide: true, sketch: true,
        paint: [{ fill: { k: 'biome', only: ['rainforest', 'savanna', 'desert'] }, a: 0.8 }],
        lines: [{ pts: [[0.4, 33.2], [4.85, 31.6], [9.5, 31.65], [15.6, 32.5], [19.5, 33.3], [21.8, 31.3], [24.1, 32.9], [27.2, 31.2], [30, 31.2], [31.5, 31]], c: C.blue, w: 1.6, dur: 2.5 }],
        marks: [
          mk([-18.5, 49.2], 'East Madagascar: rainforest at 20° S', '马达加斯加岛东部：南纬 20° 的热带雨林', { dot: true, c: C.green, t: 0.6 }),
          mk([-12, -77.5], 'Peru coast: desert reaching 5° S', '秘鲁沿岸：荒漠一直延伸到南纬 5° 附近', { dot: true, c: C.gold, t: 1.2 }),
          mk([20, 32.5], 'The Nile: a green ribbon through the desert', '尼罗河：穿过沙漠的绿色走廊', { c: C.blue, t: 1.8 }),
        ],
        body: ['Some places do not follow the zones. The east coast of Madagascar, at 20° S, should be savanna, but warm currents and trade winds blowing from the sea against its mountains bring rain all year, so there is rainforest. On the other side of the world, the coast of Peru lies in the latitudes of savanna and even rainforest, yet it is desert almost to 5° S: the cold Peru Current chills and steadies the air, and the Andes block the moist trade winds from the east. The Nile carries water through the Sahara, so oases and farmland line it. Such local, non-zonal differences come from landforms, ocean currents, rivers and groundwater.',
          '有些地方不符合地带性规律。马达加斯加岛东部位于南纬 20° 附近，按纬度本应是热带草原，但受来自海洋的东南信风、沿岸暖流和山地迎风坡的影响，全年多雨，形成了热带雨林。南美洲西岸的秘鲁沿海，按纬度应是热带草原甚至雨林，荒漠却一直延伸到南纬 5° 附近：沿岸的秘鲁寒流降温减湿，安第斯山脉又阻挡了来自东面的湿润信风。尼罗河把水带进撒哈拉沙漠，两岸形成绿洲和农田。这些由地形、洋流、河流、地下水等局部因素造成的差异，属于非地带性分异。'],
      },
    ],
    quiz: [
      {
        q: ['The foot of a mountain is 24 °C. At 0.6 °C per 100 m, what is the temperature 3,000 m higher?', '某山山麓气温为 24 °C。按海拔每升高 100 米气温下降 0.6 °C 计算，比山麓高 3000 米处的气温约是多少？'],
        num: { answer: 6, tol: 0.5, unit: ['°C', '°C'] },
        why: ['3,000 m is 30 × 100 m: 30 × 0.6 = 18 °C cooler, so 24 − 18 = 6 °C.', '3000 米是 30 个 100 米，降温 30 × 0.6 = 18 °C，24 − 18 = 6 °C。'],
      },
      {
        q: ['Going west along 40° N from the coast of China, what is the order of the natural zones?', '在我国沿 40°N 由东向西，自然景观依次为'],
        options: [['Forest → grassland → desert', '森林→草原→荒漠'], ['Desert → grassland → forest', '荒漠→草原→森林'], ['Rainforest → savanna → desert', '热带雨林→热带草原→热带荒漠'], ['Taiga → tundra → ice', '针叶林→苔原→冰原']], answer: 0,
        why: ['Moisture falls inland, away from the sea, while the temperature changes little.', '由沿海向内陆，水分逐渐减少，热量变化不大，体现干湿度地带性。'],
      },
      {
        q: ['Match each kind of zonation to its main cause.', '把各种地域分异规律与其主导因素配对。'],
        match: [
          [['Equator to poles', '由赤道到两极'], ['Heat, falling with latitude', '热量（随纬度变化）']],
          [['Coast to interior', '由沿海向内陆'], ['Water, falling inland', '水分（随距海远近变化）']],
          [['Foot to summit', '山地垂直分异'], ['Heat and water changing with height', '水热状况随海拔变化']],
          [['Non-zonal', '非地带性'], ['Local landforms, currents or groundwater', '地形、洋流、地下水等局部因素']],
        ],
        why: ['Heat drives latitudinal zonation, water the coast-to-interior kind, and altitude changes both on mountains.', '纬度地带性以热量为基础，干湿度地带性以水分为基础，垂直地带性取决于随海拔变化的水热组合。'],
      },
      {
        q: ['On a high mountain near the equator, put the belts in order from the foot to the summit.', '把赤道附近某高山的垂直自然带由山麓到山顶排序。'],
        order: [['Tropical rainforest', '热带雨林带'], ['Evergreen broadleaf forest', '常绿阔叶林带'], ['Deciduous broadleaf forest', '落叶阔叶林带'], ['Alpine meadow', '高山草甸带'], ['Ice and snow', '冰雪带']],
        why: ['The belts repeat the zones you would cross going poleward: the foot matches the local rainforest, the top the ice of the poles.', '垂直带谱类似于由赤道到两极的水平自然带：山麓与当地的热带雨林一致，山顶为冰雪带。'],
      },
      {
        q: ['Which are true of Qomolangma (Everest)? (Choose all that apply.)', '关于珠穆朗玛峰，下列说法正确的是（多选）'],
        options: [['The south slope has more belts', '南坡自然带数量多'], ['The north slope’s snowline is higher', '北坡雪线较高'], ['The south slope is the windward, wetter side', '南坡是迎风坡，降水多'], ['The north slope has more belts', '北坡自然带数量多'], ['The snowline is the same on both sides', '南北坡雪线高度相同']], multi: [0, 1, 2],
        why: ['The low, wet south slope climbs through more belts; the dry north slope gets less snow, so its snowline is higher.', '南坡山麓海拔低、降水多，自然带多；北坡处于背风坡，降水少，雪线较高。'],
      },
      {
        q: ['East Madagascar has rainforest at 20° S, where you would expect savanna. What kind of difference is this?', '马达加斯加岛东部在南纬 20° 附近却分布着热带雨林，这属于'],
        options: [['Non-zonal', '非地带性分异'], ['Latitudinal zonation', '纬度地带性'], ['Coast-to-interior zonation', '干湿度地带性'], ['Vertical zonation', '垂直地带性']], answer: 0,
        why: ['Moist trade winds rising over its mountains and warm currents offshore bring rain all year: a local, non-zonal cause.', '来自海洋的东南信风受山地抬升，加上沿岸暖流增温增湿，全年多雨，属于非地带性现象。'],
      },
      {
        q: ['A mountain\'s foot is at 1,000 m and averages 21 °C. At 0.6 °C per 100 m, at about what height is the average 0 °C?', '某山山麓海拔 1000 米，年均温 21 °C。按每升高 100 米降温 0.6 °C 计算，年均温 0 °C 的位置海拔约是多少米？'],
        num: { answer: 4500, tol: 100, unit: ['m', '米'] },
        why: ['It must cool 21 °C: 21 ÷ 0.6 = 35 lots of 100 m, i.e. 3,500 m above the foot, so 1,000 + 3,500 = 4,500 m.', '需要降温 21 °C：21 ÷ 0.6 = 35，即比山麓高 3500 米，1000 + 3500 = 4500 米。'],
      },
    ],
  },
];
