/**
 * Astronomy lessons: the Sun and the Earth (senior). Solar radiation and solar activity, local time and time zones,
 * the noon Sun's altitude, and the length of day and night.
 */
import { C, T, mer, mk, type Fig, type LL, type Lesson, type Pair } from '../kit.ts';
import { arrowDef, svg, tx, type Lx } from '../figs.ts';
import { REGIONS } from '../geo.ts';
import type { Paint } from '../stage.ts';
import { subsolar } from '../../../shared/lib/sun.ts';
import { sunspotNumber } from './sunspots.ts';

const unit: Pair = ['The Sun and the Earth', '太阳对地球的影响与地球运动'];
const D2R = Math.PI / 180;
const OB = 23.44;

// ------------------------------------------------------------------------------------------------ figures

/** Sunspot number 1986–2031: cycles 22–25 (approximate shape). */
const cycleFig: Fig = {
  k: 'svg', draw: (L: Lx) => {
    const x0 = 30, x1 = 312, y0 = 150, y1 = 34, Y0 = 1986, Y1 = 2031, MX = 240;
    const X = (y: number) => x0 + ((y - Y0) / (Y1 - Y0)) * (x1 - x0), Yp = (n: number) => y0 - (n / MX) * (y0 - y1);
    let o = tx(4, 12, L(['The 11-year sunspot cycle', '太阳黑子数的 11 年周期']), 'fg-title');
    o += tx(4, 23, L(['smoothed monthly sunspot number (approximate); after 2025 a projection', '月均黑子数（平滑，近似）；2025 年后为预测']), 'fg-sub');
    for (const n of [0, 100, 200]) o += `<line x1="${x0}" x2="${x1}" y1="${Yp(n)}" y2="${Yp(n)}" class="fg-grid"/>` + tx(x0 - 4, Yp(n) + 3, String(n), 'fg-tick', 'e');
    for (let y = 1990; y <= 2030; y += 10) o += tx(X(y), y0 + 11, String(y), 'fg-tick', 'm');
    const pts = (a: number, b: number) => Array.from({ length: Math.round((b - a) * 6) + 1 }, (_, i) => { const y = a + i / 6; return `${X(y).toFixed(1)},${Yp(sunspotNumber(y)).toFixed(1)}`; }).join(' ');
    o += `<polyline points="${pts(Y0, 2025.4)}" fill="none" stroke="${C.gold}" stroke-width="1.6" class="fg-line"/>`;
    o += `<polyline points="${pts(2025.4, Y1)}" fill="none" stroke="${C.gold}" stroke-width="1.2" stroke-dasharray="3 2" opacity=".7"/>`;
    [[1989.9, 22], [2001.9, 23], [2014.3, 24], [2024.8, 25]].forEach(([y, n], i) => {
      o += `<g class="f-fade" style="--d:${(0.3 + i * 0.25).toFixed(2)}s">` + tx(X(y), Yp(sunspotNumber(y)) - 5, L([`cycle ${n}`, `第 ${n} 周期`]), 'fg-label', 'm') + '</g>';
    });
    o += `<g class="f-fade" style="--d:1.4s"><line x1="${X(2008.9)}" x2="${X(2019.9)}" y1="${y0 - 8}" y2="${y0 - 8}" stroke="${C.teal}" stroke-width="1"/>` + tx((X(2008.9) + X(2019.9)) / 2, y0 - 11, L(['≈ 11 years', '约 11 年']), 'fg-label', 'm') + '</g>';
    return svg(320, 164, o, L(['Sunspot number from 1986 to 2031', '1986—2031 年太阳黑子数']));
  },
};

/** Noon Sun altitude through the year at a few latitudes. */
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const decOf = (m: number) => subsolar(Date.UTC(2025, m - 1, 15, 4))[0];
const noonFig: Fig = {
  k: 'line', title: ['Noon Sun altitude through the year', '一年中正午太阳高度的变化'], unit: ['°', '°'], x: MONTHS, min: 0, max: 90,
  series: [
    { name: ['Guangzhou 23.1°N', '广州 23.1°N'], c: C.orange, y: MONTHS.map(m => Math.round(90 - Math.abs(23.1 - decOf(m)))) },
    { name: ['Beijing 39.9°N', '北京 39.9°N'], c: C.gold, y: MONTHS.map(m => Math.round(90 - Math.abs(39.9 - decOf(m)))) },
    { name: ['Harbin 45.8°N', '哈尔滨 45.8°N'], c: C.blue, y: MONTHS.map(m => Math.round(90 - Math.abs(45.8 - decOf(m)))) },
  ],
};
const decOfDay = (d: number) => {
  const x = (Date.UTC(2025, 0, 1, 4) + (d - 1) * 864e5 - Date.UTC(2000, 0, 1, 12)) / 864e5,
    g = (357.528 + 0.9856003 * x) * D2R,
    l = (280.46 + 0.9856474 * x + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R;
  return Math.asin(Math.sin(OB * D2R) * Math.sin(l)) / D2R;
};
const dayLen = (lat: number, dec: number) => { const c = -Math.tan(lat * D2R) * Math.tan(dec * D2R); return c >= 1 ? 0 : c <= -1 ? 24 : (2 * Math.acos(c)) / D2R / 15; };
const dayFig: Fig = {
  k: 'line', title: ['Day length through the year', '一年中昼长的变化'], unit: ['hours', '小时'], x: MONTHS, min: 0, max: 24,
  series: [
    { name: ['Equator', '赤道'], c: C.white, y: MONTHS.map(() => 12) },
    { name: ['Guangzhou', '广州'], c: C.orange, y: MONTHS.map(m => Math.round(dayLen(23.1, decOf(m)) * 10) / 10) },
    { name: ['Harbin', '哈尔滨'], c: C.blue, y: MONTHS.map(m => Math.round(dayLen(45.8, decOf(m)) * 10) / 10) },
    { name: ['Arctic 70°N', '北纬 70°'], c: C.violet, y: MONTHS.map(m => Math.round(dayLen(70, decOf(m)) * 10) / 10) },
  ],
};

/** Annual sunshine hours (approximate climate normals). */
const sunshineFig: Fig = {
  k: 'bars', title: ['Sunshine hours per year (approximate)', '年日照时数（约值）'], unit: ['hours', '小时'],
  rows: [
    { name: ['Lhasa (3650 m)', '拉萨（海拔 3650 米）'], v: 3000, c: C.gold },
    { name: ['Beijing', '北京'], v: 2550, c: C.orange },
    { name: ['Guangzhou', '广州'], v: 1650, c: C.teal },
    { name: ['Chengdu (Sichuan Basin)', '成都（四川盆地）'], v: 1100, c: C.blue },
  ],
};

/** The zone-number line: Beijing (UTC+8) and New York (UTC−5) are 13 zones apart. */
const zoneFig: Fig = {
  k: 'svg', draw: (L: Lx, id: string) => {
    const x0 = 16, x1 = 304, y = 70, X = (z: number) => x0 + ((z + 12) / 24) * (x1 - x0);
    let o = arrowDef(`za${id}`, C.gold) + tx(4, 12, L(['Zone time: east add, west subtract', '区时计算：东加西减']), 'fg-title');
    o += tx(4, 23, L(['zones west of zone 0 are UTC−1 … −12, east UTC+1 … +12', '中时区以西为西一区至西十二区，以东为东一区至东十二区']), 'fg-sub');
    o += `<line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" stroke="#9aa7b4" stroke-width="1"/>`;
    for (let z = -12; z <= 12; z++) {
      const hot = z === -5 || z === 8 || z === 0;
      o += `<line x1="${X(z)}" x2="${X(z)}" y1="${y - (hot ? 5 : 3)}" y2="${y + (hot ? 5 : 3)}" stroke="${z === 8 ? C.red : z === -5 ? C.blue : z === 0 ? C.gold : '#9aa7b4'}" stroke-width="${hot ? 1.6 : 0.8}"/>`;
      if (z % 4 === 0 || hot) o += tx(X(z), y + 14, z > 0 ? `+${z}` : String(z).replace('-', '−'), 'fg-tick', 'm');
    }
    o += tx(X(-5), y + 25, L(['New York', '纽约']), 'fg-label', 'm', ` fill="${C.blue}"`) + tx(X(8), y + 25, L(['Beijing', '北京']), 'fg-label', 'm', ` fill="${C.red}"`) + tx(X(0), y + 25, 'UTC', 'fg-label', 'm', ` fill="${C.gold}"`);
    o += `<g class="f-fade" style="--d:.4s"><path d="M${X(8)} ${y - 9} Q ${(X(8) + X(-5)) / 2} ${y - 34} ${X(-5)} ${y - 9}" class="fg-arrow" marker-end="url(#za${id})"/>`;
    o += tx((X(8) + X(-5)) / 2, y - 26, L(['13 zones west: −13 h', '向西 13 个时区：减 13 小时']), 'fg-label', 'm', ` fill="${C.gold}"`) + '</g>';
    o += `<g class="f-fade" style="--d:.9s">` + tx(x1, 40, L(['east: clock ahead (+) →', '东：钟点超前（加）→']), 'fg-tick', 'e') + tx(x0, 40, L(['← west: clock behind (−)', '← 西：钟点落后（减）']), 'fg-tick', 's') + '</g>';
    return svg(320, 108, o, L(['Time zones on a number line', '时区数轴']));
  },
};

/** Beijing on the June solstice: the day is symmetric about local noon. */
const dayBarFig: Fig = {
  k: 'svg', draw: (L: Lx) => {
    const x0 = 14, x1 = 306, y = 52, hgt = 16, X = (h: number) => x0 + (h / 24) * (x1 - x0);
    const rise = 12 - 14.83 / 2, set = 12 + 14.83 / 2;
    let o = tx(4, 12, L(['Beijing, 21 June (local solar time)', '北京夏至日（地方时）']), 'fg-title');
    o += tx(4, 23, L(['day length 14 h 50 min = 2 × (12:00 − 04:35)', '昼长 14 小时 50 分 = 2 ×（12:00 − 4:35）']), 'fg-sub');
    o += `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="${hgt}" fill="#1c2c4f"/>`;
    o += `<rect x="${X(rise)}" y="${y}" width="${X(set) - X(rise)}" height="${hgt}" fill="${C.gold}" opacity=".85" class="f-growx" style="--d:.2s"/>`;
    o += `<line x1="${X(12)}" x2="${X(12)}" y1="${y - 6}" y2="${y + hgt + 4}" stroke="${C.red}" stroke-width="1.4"/>`;
    for (const h of [0, 6, 12, 18, 24]) o += tx(X(h), y + hgt + 12, `${h}:00`, 'fg-tick', 'm');
    o += tx(X(rise), y - 4, L(['sunrise 04:35', '日出 4:35']), 'fg-label', 'm') + tx(X(set), y - 4, L(['sunset 19:25', '日落 19:25']), 'fg-label', 'm');
    o += tx(X(12), y - 9, L(['noon', '正午']), 'fg-label', 'm', ` fill="${C.red}"`);
    o += `<g class="f-fade" style="--d:.7s">` + tx((X(rise) + X(12)) / 2, y + 11.5, L(['7 h 25 min', '7 小时 25 分']), 'fg-tick', 'm', ' fill="#1b1b1b"') + tx((X(set) + X(12)) / 2, y + 11.5, L(['7 h 25 min', '7 小时 25 分']), 'fg-tick', 'm', ' fill="#1b1b1b"') + '</g>';
    o += tx(X(1.8), y + 11.5, L(['night', '夜']), 'fg-tick', 'm') + tx(X(22.2), y + 11.5, L(['night', '夜']), 'fg-tick', 'm');
    return svg(320, 92, o, L(['Day length from the sunrise time', '由日出时刻求昼长']));
  },
};

// ------------------------------------------------------------------------------------------------ globe drawings

/** The 24 ideal time zones (15° strips), zone 0 gold and UTC+8 red. */
const ZONES: Paint[] = Array.from({ length: 24 }, (_, i) => {
  const z = i - 11;
  const c = z === 0 ? C.gold : z === 8 ? C.red : i % 2 ? C.blue : C.violet;
  return z === 12 ? { fill: { k: 'strip', w: 172.5, e: -172.5, c }, t: i * 0.08, a: 0.3 } : { fill: { k: 'strip', w: z * 15 - 7.5, e: z * 15 + 7.5, c }, t: i * 0.08, a: 0.3 };
});
/** China's five theoretical zones, UTC+5 … UTC+9. */
const CHINA_ZONES: Paint[] = [5, 6, 7, 8, 9].map((z, i) => ({ fill: { k: 'strip', w: z * 15 - 7.5, e: z * 15 + 7.5, c: z === 8 ? C.red : i % 2 ? C.blue : C.violet }, t: 0.4 + i * 0.15, a: 0.22 }));
/** The International Date Line, simplified. */
const DATE_LINE: LL[] = [[89.9, 180], [75, 180], [68, -169], [65.5, -169], [52.5, 170], [48, 180], [5, 180], [4, -150], [-10, -150], [-11, -171], [-16, -171.5], [-45, -172.5], [-51, 180], [-89.9, 180]];
const BEIJING: LL = [39.9, 116.4], KASHGAR: LL = [39.5, 76.0], FUYUAN: LL = [48.4, 134.3];
const EQ = T.marchNoonChina, Y25 = Date.UTC(2025, 0, 1, 4), Y26 = Date.UTC(2025, 11, 31, 4);

export const A_EARTHSUN: Lesson[] = [
  {
    id: 'a-solar-activity', strand: 'earthsun', level: 'sr', tracks: ['us'], unit, icon: 'sun', minutes: 12,
    title: ['Solar radiation and solar activity', '太阳辐射和太阳活动'],
    blurb: ['Where the Earth\'s energy comes from, and how storms on the Sun reach us.', '地球的能量从哪里来，太阳上的“风暴”又怎样影响地球。'],
    keys: [
      ['Solar radiation is the main source of energy at the Earth\'s surface: it drives winds, water and life; coal and oil are stored solar energy.', '太阳辐射是地球表面最主要的能量来源：推动大气和水的运动、维持生命活动；煤、石油是地质时期储存的太阳能。'],
      ['Solar radiation is strongest where the Sun is high, the air thin and the sky clear: the Qinghai–Tibet Plateau gets the most in China (Lhasa ≈ 3,000 sunshine hours a year), the cloudy Sichuan Basin the least (Chengdu ≈ 1,100).', '太阳高度大、空气稀薄、晴天多的地方太阳辐射强：我国青藏高原最丰富（拉萨年日照约 3000 小时），多云雾的四川盆地最少（成都约 1100 小时）。'],
      ['The Sun\'s atmosphere has three layers: photosphere (sunspots), chromosphere (flares, prominences) and corona (solar wind, coronal mass ejections).', '太阳大气由里向外分为光球层（黑子）、色球层（耀斑、日珥）和日冕层（太阳风、日冕物质抛射）。'],
      ['Sunspots and flares wax and wane together in a cycle of about 11 years; sunspot numbers are the sign of solar activity.', '黑子和耀斑的多少同步变化，周期约为 11 年；黑子数是太阳活动强弱的标志。'],
      ['Solar activity disturbs the ionosphere (shortwave radio) and the magnetic field (magnetic storms), lights up aurorae, and threatens satellites, GPS and power grids.', '太阳活动扰动电离层（短波通信中断），扰动地球磁场（磁暴），产生极光，并危及卫星、导航和电网。'],
    ],
    steps: [
      {
        title: ['The Earth\'s power station', '地球的能量源泉'],
        astro: { kit: 'sun', mode: 'energy' },
        body: ['The Sun is a ball of hot gas 1.39 million km across; in its core, at about 15 million °C, nuclear fusion turns hydrogen into helium and converts about 4 million tonnes of matter into energy every second. It pours this energy out in every direction as electromagnetic radiation, mostly visible light. The Earth intercepts only about one part in 2.2 billion, yet that is still about 1361 W on every square metre facing the Sun above the air (the solar constant). This solar radiation warms the land and sea, drives the winds, ocean currents and the water cycle, and feeds photosynthesis; coal, oil and gas are solar energy stored by plants and plankton millions of years ago.', '太阳是一个直径约 139 万千米的炽热气体球。日核温度约 1500 万 °C，在那里氢核聚变成氦核，每秒约有 400 万吨物质转化为能量，以电磁波的形式向四面八方辐射，主要是可见光。地球只接收到其中约二十二亿分之一，但在大气上界、垂直于太阳光的每平方米上仍有约 1361 瓦（太阳常数）。太阳辐射使地表增温，推动大气运动、洋流和水循环，为光合作用提供能量；煤、石油、天然气是地质历史时期生物固定、积累下来的太阳能。'],
      },
      {
        title: ['Where the sunshine is richest', '我国太阳辐射的分布'], cam: [31, 98, 2.4], sun: true, clock: { mode: 'day', start: T.marchNoonChina, rate: 0 },
        fig: sunshineFig,
        paint: [{ fill: { k: 'poly', pts: REGIONS.tibet, c: C.gold, clip: ['CN'] }, a: 0.45, t: 0.3 }, { fill: { k: 'poly', pts: REGIONS.sichuan, c: C.blue }, a: 0.55, t: 1 }],
        marks: [
          mk([29.65, 91.11], 'Lhasa: ≈ 3,000 h of sun a year', '拉萨：年日照约 3000 小时', { c: C.gold, big: true, dot: true, t: 0.6 }),
          mk([30.66, 104.07], 'Chengdu: ≈ 1,100 h', '成都：约 1100 小时', { c: C.blue, big: true, dot: true, t: 1.3 }),
          mk([33, 87], 'Qinghai–Tibet Plateau: most', '青藏高原：最丰富', { c: C.gold, t: 1.8 }),
          mk([29.5, 106.5], 'Sichuan Basin: least', '四川盆地：最少', { c: C.blue, t: 2.2 }),
        ],
        body: ['How much solar radiation a place receives depends on how high the Sun climbs (latitude), how thick the air is (altitude) and how often the sky is clear (weather). In China the Qinghai–Tibet Plateau gets the most: at 3,650 m above sea level the air is thin, dry and clean, and Lhasa, the “sunlight city”, enjoys about 3,000 hours of sunshine and some 7,500 MJ per square metre a year. Only 1,200 km east, Chengdu in the Sichuan Basin gets about 1,100 hours and roughly half the energy, because damp air trapped by the surrounding mountains keeps it under cloud and fog. That is why Tibet and Qinghai build large solar farms, while in Sichuan it is said that “the dogs bark when the Sun comes out”.', '一个地方得到的太阳辐射多少，取决于太阳高度（纬度）、大气厚薄（海拔）和晴天多少（天气）。我国太阳辐射最丰富的是青藏高原：海拔高，空气稀薄、干燥、洁净，“日光城”拉萨（海拔约 3650 米）年日照约 3000 小时，年太阳辐射总量约 7500 兆焦/平方米。往东约 1200 千米，四川盆地的成都年日照只有约 1100 小时，辐射总量约为拉萨的一半——四周高山围合，水汽不易散去，多云雾、阴天多，所以有“蜀犬吠日”之说。因此青海、西藏大力建设光伏电站。'],
      },
      {
        title: ['Layers of the Sun\'s atmosphere', '太阳大气的分层'],
        astro: { kit: 'sun', mode: 'layers', labels: 'layers' },
        body: ['What we see as the Sun\'s surface is the photosphere, a layer about 500 km thick at roughly 5,500 °C, seething with granules of rising gas each about 1,000 km across. Above it lies the thin, red chromosphere, about 2,000 km deep, and then the faint corona, which reaches millions of kilometres out and is heated to 1–2 million °C. The corona is so hot that the Sun\'s gravity cannot hold it: it streams away as the solar wind, charged particles passing the Earth at about 400 km/s. The chromosphere and corona are normally lost in the photosphere\'s glare, so we see them only during a total solar eclipse (or with a coronagraph).', '我们看到的太阳“表面”是光球层，厚约 500 千米，温度约 5500 °C，布满直径约 1000 千米的米粒组织（上涌的热气体）。它外面是厚约 2000 千米、发红的色球层，最外面是延伸到几百万千米以外的日冕层，温度高达 100 万—200 万 °C。日冕温度极高，太阳引力束缚不住其中的带电粒子，它们不断向外流出，形成太阳风，经过地球附近时速度约每秒 400 千米。色球层和日冕层平时被光球层的强光淹没，只有日全食时（或用日冕仪）才能看到。'],
      },
      {
        title: ['Sunspots, flares and prominences', '黑子、耀斑和日珥'],
        astro: { kit: 'sun', mode: 'layers', labels: 'features' },
        task: ['Drag to turn the Sun: find the sunspots, the flare above them and a prominence on the limb.', '拖动旋转太阳：找出黑子、黑子上方的耀斑和边缘的日珥。'],
        body: ['Sunspots are darker patches of the photosphere, 1,000–2,000 °C cooler than their surroundings, where strong magnetic fields hold back the rising heat; a large one is wider than the Earth. Flares are sudden brightenings in the chromosphere above sunspot groups: in minutes to an hour they release up to 10²⁵ J, as much as billions of hydrogen bombs, as X-rays, ultraviolet light and fast particles. Prominences are huge arches of glowing gas held up by the magnetic field above the chromosphere. All three are forms of solar activity, and all are driven by the Sun\'s tangled magnetic field.', '黑子是光球层上温度比周围低 1000—2000 °C 而显得较暗的区域，那里的强磁场阻碍了热量上涌；大黑子比整个地球还大。耀斑是黑子群上方色球层中突然增亮的现象，几分钟到一小时内释放的能量可达 10²⁵ 焦，相当于数十亿颗氢弹，以 X 射线、紫外线和高能粒子的形式射出。日珥是被磁场托起在色球层之上、发光的巨大气体拱。三者都是太阳活动的表现形式，都由太阳扭结的磁场驱动。'],
      },
      {
        title: ['The 11-year cycle', '太阳活动的 11 年周期'],
        astro: { kit: 'sun', mode: 'layers', labels: 'features', clock: { from: Date.UTC(2007, 0, 1), to: Date.UTC(2031, 0, 1), rate: 500, unit: 'date', at: 0.1 } },
        task: ['Drag the date from 2009 to late 2024 and watch the sunspots multiply.', '把日期从 2009 年拖到 2024 年底，看黑子怎样增多。'],
        fig: cycleFig,
        body: ['Count the sunspots every day and the number rises and falls about every 11 years (9–14 years in practice); flares follow the same rhythm, so the sunspot number is the standard sign of how active the Sun is. Cycle 24 was weak, peaking at about 116 in 2014; cycle 25 peaked higher, at about 160 in late 2024, so the next quiet minimum should come around 2030. Cycles can also fail: from 1645 to 1715, the Maunder Minimum, almost no sunspots were seen, which coincided with the coldest part of the Little Ice Age in Europe and China. Long changes in solar activity do nudge the climate, but the effect is small next to that of today\'s greenhouse gases.', '逐日统计黑子数，会发现它大约每 11 年起落一次（实际为 9—14 年），耀斑也同步增减，所以黑子数是衡量太阳活动强弱的标志。第 24 周期较弱，2014 年峰值约 116；第 25 周期较强，2024 年下半年峰值约 160，下一个低谷预计在 2030 年前后。太阳活动也会长期低迷：1645—1715 年的“蒙德极小期”几乎看不到黑子，恰逢欧洲和我国“小冰期”最冷的时段。太阳活动的长期变化会影响气候，但其作用远小于如今温室气体的影响。'],
      },
      {
        title: ['A storm crosses space', '太阳风暴奔向地球'],
        astro: { kit: 'sun', mode: 'flare', clock: { from: 0, to: 72, rate: 6, unit: 'hour' }, tasks: [
          { text: ['Run the clock until the CME hits the magnetosphere (≈ 40 h in this model).', '让时间走到日冕物质抛射撞上磁层（本模型约 40 小时）。'], done: (_p, v) => v >= 38 && v <= 60 },
        ] },
        task: ['Drag the time: the flare\'s light arrives at once, the CME takes days.', '拖动时间：耀斑的光立刻到达，日冕物质抛射却要走几天。'],
        body: ['A big flare is often followed by a coronal mass ejection (CME): 1–10 billion tonnes of magnetised plasma from the corona, flung out at 500–2,000 km/s. The flare\'s light and X-rays cover the 150 million km to the Earth in 8.3 minutes, but the CME takes days: at 1,500 km/s it needs 150,000,000 ÷ 1,500 = 100,000 s ≈ 28 hours, at 1,000 km/s about 42 hours. That gap is what lets space-weather forecasters, watching from satellites such as China\'s Kuafu-1 (launched 2022), warn us a day or more ahead. At the Earth the magnetosphere, squeezed on the day side by the solar wind behind a bow shock, deflects most of the plasma, but the impact shakes the field and drives particles down the field lines towards the poles.', '大耀斑常伴随日冕物质抛射：日冕中 10 亿—100 亿吨带磁场的等离子体以每秒 500—2000 千米的速度被抛出。耀斑的光和 X 射线走完日地之间约 1.5 亿千米只需 8.3 分钟，日冕物质抛射却要走几天：速度每秒 1500 千米时需要 150000000 ÷ 1500 = 100000 秒 ≈ 28 小时，每秒 1000 千米时约 42 小时。正是这段时间差，让空间天气预报员可以借助“夸父一号”（2022 年发射）等卫星的监测提前一天以上发出预警。到达地球时，被太阳风压扁在向阳一侧、前方形成弓形激波的磁层挡住了大部分带电粒子，但冲击会剧烈扰动地磁场，并把带电粒子沿磁力线引向两极。'],
      },
      {
        title: ['Aurora', '极光'],
        astro: { kit: 'sun', mode: 'aurora' },
        body: ['Guided down near the magnetic poles, the particles hit the thin upper atmosphere 100–300 km up and make it glow, like the gas in a neon tube: oxygen glows green at about 100–200 km and red higher up, nitrogen violet and blue. The aurora forms an oval ring round each magnetic pole, at about 65–70° magnetic latitude, so it is seen most often in northern Norway, Alaska, northern Canada and, in the south, over Antarctica, where China\'s Zhongshan Station (69.4°S) lies right under the oval. In a strong magnetic storm the oval spreads towards the equator: on 10–11 May 2024 aurorae were photographed across northern China, in Heilongjiang, Inner Mongolia and Xinjiang. Aurorae are the most beautiful sign of solar activity, and the brightest come in the years around the sunspot maximum.', '带电粒子在磁极附近沉降，撞击 100—300 千米高空的稀薄大气使之发光，就像霓虹灯管里的气体：氧原子在约 100—200 千米处发绿光、更高处发红光，氮发紫光和蓝光。极光在每个磁极周围形成一个椭圆形的光环（极光带），大约位于磁纬 65°—70°，所以挪威北部、阿拉斯加、加拿大北部和南极上空最常见，我国南极中山站（69.4°S）就位于极光带下方。磁暴强烈时极光带向低纬扩展：2024 年 5 月 10—11 日，我国北方的黑龙江、内蒙古、新疆等地都拍到了极光。极光是太阳活动最美的表现，黑子高峰年前后最为频繁。'],
      },
      {
        title: ['Space weather at home', '太阳活动对地球的影响'],
        astro: { kit: 'sun', mode: 'effects' },
        body: ['A flare\'s X-rays and ultraviolet light reach the Earth in 8 minutes and over-ionise the ionosphere on the day side, so it absorbs shortwave radio instead of reflecting it: shortwave links can go silent for minutes to hours. The CME that follows sets off a magnetic storm: compass needles swing, positions from GPS and BeiDou drift, and the heated upper air swells and drags on low satellites; in February 2022 a minor storm brought down 38 of 49 newly launched Starlink satellites. Fast-changing fields also induce currents in long power lines and pipelines: on 13 March 1989 a storm blacked out Québec, leaving 6 million people without power for 9 hours. That is why countries now run space-weather services that watch the Sun round the clock and warn airlines, grid operators and satellite owners.', '耀斑的 X 射线和紫外线 8 分钟就到达地球，使白昼半球的电离层过度电离，短波无线电信号被吸收而不再被反射，短波通信可能中断几分钟到几小时。随后到达的日冕物质抛射引发磁暴：磁针剧烈摆动，GPS 和北斗定位出现偏差，高层大气受热膨胀，增大低轨卫星的阻力——2022 年 2 月一次较弱的磁暴就使刚发射的 49 颗“星链”卫星中的 38 颗坠毁。快速变化的地磁场还会在长距离输电线和管道中感应出电流：1989 年 3 月 13 日的磁暴使加拿大魁北克 600 万人停电 9 小时。因此各国建立了空间天气预报业务，全天候监测太阳，向航空、电网和卫星部门发出预警。'],
      },
    ],
    quiz: [
      { q: ['Tap a sunspot on the Sun.', '在太阳上点出一个黑子。'], astro: { kit: 'sun', mode: 'layers', labels: 'none' }, pick: 'sunspot',
        why: ['Sunspots are the dark patches on the photosphere, 1,000–2,000 °C cooler than their surroundings.', '黑子是光球层上温度比周围低 1000—2000 °C、显得较暗的斑点。'] },
      { q: ['Put these in order from the centre of the Sun outwards.', '从太阳中心向外排列。'],
        order: [['Core (nuclear fusion)', '日核（核聚变）'], ['Photosphere (sunspots)', '光球层（黑子）'], ['Chromosphere (flares)', '色球层（耀斑）'], ['Corona (solar wind)', '日冕层（太阳风）']],
        why: ['Fusion runs in the core; the visible “surface” is the photosphere, then the chromosphere, then the outermost corona.', '核聚变在日核中进行；我们看到的“表面”是光球层，向外依次是色球层和最外层的日冕层。'] },
      { q: ['Match each solar event with its effect on the Earth.', '把太阳活动和它对地球的影响连起来。'],
        match: [
          [['Flare X-rays', '耀斑的 X 射线'], ['Shortwave radio fades on the day side', '白昼半球短波通信中断']],
          [['Charged particles near the magnetic poles', '在磁极附近沉降的带电粒子'], ['Aurora', '极光']],
          [['A CME hits the magnetosphere', '日冕物质抛射撞击磁层'], ['Magnetic storm, compasses swing', '磁暴，磁针剧烈摆动']],
          [['Long-term change in sunspot numbers', '黑子数的长期变化'], ['Small shifts in climate', '气候的小幅变化']],
        ],
        why: ['X-rays over-ionise the ionosphere, which then absorbs shortwave; particles make the air glow as aurorae; a CME shakes the geomagnetic field; long quiet spells like the Maunder Minimum coincided with cold spells.', 'X 射线使电离层过度电离而吸收短波；带电粒子使高层大气发光形成极光；日冕物质抛射扰动地磁场产生磁暴；蒙德极小期等长期低迷与寒冷时期对应。'] },
      { q: ['In which layer of the Sun\'s atmosphere do flares occur?', '耀斑发生在太阳大气的哪一层？'], options: [['Chromosphere', '色球层'], ['Photosphere', '光球层'], ['Corona', '日冕层'], ['The core', '日核']], answer: 0,
        why: ['Flares are sudden brightenings in the chromosphere, above sunspot groups; sunspots are in the photosphere, the solar wind comes from the corona.', '耀斑是色球层中突然增亮的现象，常出现在黑子群上方；黑子在光球层，太阳风来自日冕层。'] },
      { q: ['A CME leaves the Sun at 1,500 km/s. Roughly how many hours does it take to cover the 150 million km to the Earth?', '一次日冕物质抛射以每秒 1500 千米的速度离开太阳，走完日地之间约 1.5 亿千米大约需要多少小时？'], num: { answer: 28, tol: 1.5, unit: ['hours', '小时'] },
        why: ['t = 150,000,000 km ÷ 1,500 km/s = 100,000 s; ÷ 3,600 ≈ 27.8 h, just over a day. The flare\'s light took only 8.3 minutes.', 't = 150000000 千米 ÷ 1500 千米/秒 = 100000 秒，÷ 3600 ≈ 27.8 小时，一天多一点；而耀斑的光只需 8.3 分钟。'] },
      { q: ['Which of these can solar activity cause? Pick all.', '下列哪些可能由太阳活动引起？（多选）'], options: [['Aurorae', '极光'], ['Shortwave radio blackouts', '短波通信中断'], ['Magnetic storms', '磁暴'], ['Earthquakes', '地震'], ['Ocean tides', '海洋潮汐']], multi: [0, 1, 2],
        why: ['Aurorae, radio blackouts and magnetic storms come from the Sun\'s particles and radiation. Earthquakes draw on the Earth\'s internal energy, and tides on the gravity of the Moon and Sun, not on solar activity.', '极光、短波通信中断和磁暴都来自太阳的带电粒子和辐射；地震的能量来自地球内部，潮汐由月球和太阳的引力引起，都与太阳活动无关。'] },
      { q: ['Lhasa and Chengdu lie at almost the same latitude, yet Lhasa gets nearly three times the sunshine. Why?', '拉萨和成都纬度相近，拉萨的年日照时数却约为成都的三倍，主要原因是'], options: [['Lhasa is high, with thin, dry air and clear skies; Chengdu\'s basin traps cloud and fog', '拉萨海拔高、空气稀薄干燥、晴天多；成都所在盆地多云雾'], ['Lhasa is closer to the Equator', '拉萨更靠近赤道'], ['Lhasa has longer days all year', '拉萨全年白昼更长'], ['Lhasa is closer to the Sun at 3,650 m', '拉萨海拔高，离太阳更近']], answer: 0,
        why: ['At the same latitude the Sun climbs equally high, and 3.65 km is nothing next to 150 million km. The difference is the atmosphere: less air, water vapour and cloud above Lhasa.', '纬度相同，太阳高度和昼长都相近；3.65 千米与 1.5 亿千米相比微不足道。差别在于大气：拉萨上空空气稀薄、水汽少、云少，大气削弱作用弱。'] },
      { q: ['Read the sunspot chart: when is the next solar minimum expected?', '读黑子数变化图：下一个太阳活动低谷预计在什么时候？'], fig: cycleFig, options: [['Around 2030', '2030 年前后'], ['Around 2026', '2026 年前后'], ['Around 2035', '2035 年前后'], ['Around 2041', '2041 年前后']], answer: 0,
        why: ['Minima came in 2008–09 and 2019–20, about 11 years apart; add 11 years to 2019.9 and you get about 2030.', '前两个低谷在 2008—2009 年和 2019—2020 年，相隔约 11 年；2019.9 + 11 ≈ 2030。'] },
    ],
  },
  {
    id: 'a-time-zones', strand: 'earthsun', level: 'sr', tracks: [], unit, icon: 'clock', minutes: 12,
    title: ['Local time, time zones and the date line', '地方时、时区和日界线'],
    blurb: ['Work out the time anywhere, and find where on Earth the new day has begun.', '算出任何地方的时间，找出地球上哪些地方已进入新的一天。'],
    keys: [
      ['Local time: 15° of longitude = 1 hour, 1° = 4 minutes; places further east see noon first, so their clocks are ahead.', '地方时：经度相差 15° 时间相差 1 小时，相差 1° 相差 4 分钟；东边的地点先见到正午，时刻较早到来（东早西晚）。'],
      ['24 time zones, each 15° wide; zone = longitude ÷ 15, rounded. Zone time: east add, west subtract, one hour per zone.', '全球分 24 个时区，各跨经度 15°；时区数 = 经度 ÷ 15（四舍五入）。区时计算“东加西减”，每差一个时区差 1 小时。'],
      ['Beijing Time is the local time of 120°E (UTC+8), used across China\'s five theoretical zones; in Kashgar the Sun is highest at about 14:56 Beijing Time.', '北京时间是东经 120° 的地方时（东八区区时），我国跨五个时区但统一使用北京时间；喀什的正午约在北京时间 14 时 56 分。'],
      ['The International Date Line roughly follows 180° but bends round land; crossing it westward, add a day; eastward, take a day off.', '国际日期变更线大致沿 180° 经线，但为避开陆地而弯折；自东向西越过日界线日期加一天，自西向东越过减一天。'],
      ['The new day runs east from the midnight (0:00) meridian to 180°: at UTC hour t its share is (180 + 15t)/360; at UTC 12:00 (Beijing 20:00) the whole world shares one date.', '新的一天从 0 时所在经线向东到 180° 经线：协调世界时 t 时，新一天占全球的 (180 + 15t)/360；协调世界时 12 时（北京时间 20 时）全球同属一天。'],
    ],
    steps: [
      {
        title: ['Local time', '地方时'], cam: [32, 105, 3.6], night: true, sun: true,
        clock: { mode: 'day', start: T.marchNoonChina, rate: 0 },
        task: ['Turn the globe and compare the four clocks: every degree further west is 4 minutes earlier.', '转动地球，比较四个地点的时刻：每向西 1°，地方时减少 4 分钟（东加西减）。'],
        paint: [{ fill: { k: 'land', a2: ['CN'], c: C.gold }, a: 0.15 }],
        lines: [mer(120, C.red, 0, { w: 1.3 }), mer(116.4, C.gold, 0.4), mer(76, C.teal, 0.8), mer(134.3, C.violet, 1.2)],
        marks: [
          mk([30, 120], '120°E: 12:00', '东经 120°：12:00', { c: C.red, big: true, t: 0.3 }),
          mk(BEIJING, 'Beijing 116.4°E: 11:46', '北京 116.4°E：11:46', { dot: true, c: C.gold, t: 0.8 }),
          mk(KASHGAR, 'Kashgar 76°E: 9:04', '喀什 76°E：9:04', { dot: true, c: C.teal, t: 1.3 }),
          mk(FUYUAN, 'Fuyuan 134.3°E: 12:57', '抚远 134.3°E：12:57', { dot: true, c: C.violet, t: 1.8 }),
        ],
        body: ['Local (sun) time is set by the Sun: it is 12:00 when the Sun crosses your meridian. The Earth turns 360° in 24 hours, so 15° = 1 hour and 1° = 4 minutes, and places to the east see noon first. The rule is: time difference = longitude difference × 4 minutes, added going east and subtracted going west. When the Sun is due south at 120°E, Beijing (3.6° further west) is 3.6 × 4 = 14.4 minutes behind, about 11:46; Kashgar, 44° west, is 176 minutes = 2 h 56 min behind, at 9:04; and Fuyuan, China\'s easternmost county, 14.3° east, is already at 12:57.', '因经度不同而不同的时刻叫地方时，太阳上中天时为当地正午 12 时。地球 24 小时自转 360°，经度相差 15° 地方时相差 1 小时，相差 1° 相差 4 分钟，东边的地点先到正午。计算方法：时差 = 经度差 × 4 分钟，求东边的时刻加，求西边的时刻减。东经 120° 正午时，北京（偏西 3.6°）晚 3.6 × 4 = 14.4 分钟，约 11:46；喀什偏西 44°，晚 176 分钟即 2 小时 56 分，是 9:04；我国最东的抚远偏东 14.3°，已是 12:57。'],
      },
      {
        title: ['Twenty-four zones', '时区和区时'], cam: [25, 60, 5.4], night: true, sketch: true,
        clock: { mode: 'day', start: T.marchNoonChina, rate: 1.5 },
        paint: ZONES,
        marks: [mk([60, 0], 'Zone 0 (UTC)', '中时区', { c: C.gold, t: 0.9 }), mk([60, 120], 'UTC+8', '东八区', { c: C.red, t: 1.6 }), mk([60, -75], 'UTC−5', '西五区', { c: C.blue, t: 0.6 }), mk([-30, 180], 'East/West 12', '东西十二区', { c: C.violet, t: 2 })],
        body: ['Local times change every few kilometres, which is impractical, so the world is divided into 24 time zones, each 15° wide. Zone 0 (UTC) is centred on the Greenwich meridian and runs from 7.5°W to 7.5°E; east of it come UTC+1 to UTC+12, west of it UTC−1 to UTC−12, and the two half-zones UTC±12 meet at 180°. Each zone keeps the local time of its central meridian (0°, 15°, 30° …), its zone time, and a place\'s zone is its longitude ÷ 15, rounded: Beijing 116°E → 7.7 → UTC+8, New York 74°W → 4.9 → UTC−5. Between two zones, the time differs by one hour per zone: east add, west subtract. In practice zone borders follow national borders, so real zones are ragged.', '地方时每隔几千米就不同，使用不便，因此全球按经度划分为 24 个时区，每个时区跨经度 15°。中时区（零时区）以本初子午线为中央经线，范围为 7.5°W—7.5°E；向东依次为东一区至东十二区，向西为西一区至西十二区，东十二区和西十二区各跨 7.5°，在 180° 经线相接。各时区统一使用中央经线（0°、15°、30°……）的地方时，叫区时；某地所在时区 = 经度 ÷ 15，四舍五入：北京 116°E → 7.7 → 东八区，纽约 74°W → 4.9 → 西五区。两地相差几个时区，区时就相差几小时，“东加西减”。实际的时区界线多沿国界、行政区界，并不整齐。'],
      },
      {
        title: ['Beijing to New York', '从北京飞往纽约'], cam: [72, -163, 5.6], night: true, wide: true,
        clock: { mode: 'day', start: Date.UTC(2025, 0, 10, 5), rate: 0 },
        fig: zoneFig,
        paint: [{ fill: { k: 'strip', w: 112.5, e: 127.5, c: C.red }, a: 0.25, t: 0.2 }, { fill: { k: 'strip', w: -82.5, e: -67.5, c: C.blue }, a: 0.25, t: 0.5 }],
        lines: [{ pts: [[40.1, 116.6], [52.3, 119.3], [64.4, 124.2], [76.0, 136.7], [83.9, -161.2], [76.5, -94.9], [64.9, -81.7], [52.8, -76.6], [40.6, -73.8]], c: C.gold, t: 0.8, dur: 3, w: 1.6, arrow: true }],
        marks: [
          mk(BEIJING, 'Beijing (UTC+8): leave 13:00, 10 Jan', '北京（东八区）：1 月 10 日 13:00 起飞', { c: C.red, big: true, dot: true, t: 0.4 }),
          mk([40.7, -74.0], 'New York (UTC−5): land 13:00, 10 Jan', '纽约（西五区）：1 月 10 日 13:00 到达', { c: C.blue, big: true, dot: true, t: 3.6 }),
          mk([84, -160], 'Over the Arctic: 10,978 km', '飞越北冰洋：10978 千米', { c: C.gold, t: 2.2 }),
        ],
        body: ['Zone-time sums are easiest on a number line: count the zones from one city to the other, then add going east or subtract going west. Beijing is UTC+8 and New York UTC−5, so New York is 8 − (−5) = 13 zones west and its clocks are 13 hours behind. A non-stop flight leaves Beijing at 13:00 on 10 January (in winter, when New York keeps standard time) and flies about 13 hours: it lands at 02:00 on 11 January Beijing Time, which is 02:00 − 13 h = 13:00 on 10 January in New York, the same clock time it left. The shortest route is a great circle over the Arctic Ocean, 10,978 km long, not the straight line on a flat map.', '区时计算借助数轴最清楚：数出两地相差几个时区，求东边的时刻加，求西边的时刻减。北京在东八区，纽约在西五区，纽约在北京以西 8 − (−5) = 13 个时区，区时晚 13 小时。一架航班 1 月 10 日 13:00（北京时间）从北京起飞（冬季，纽约不实行夏令时），飞行约 13 小时，到达时北京时间为 1 月 11 日 2:00，换算成纽约时间为 2:00 − 13 小时 = 1 月 10 日 13:00，与起飞时的钟点相同。最短航线是越过北冰洋的大圆航线，长 10978 千米，而不是平面地图上的直线。'],
      },
      {
        title: ['One clock for China', '北京时间'], cam: [35, 105, 3.2], night: true, sun: true,
        clock: { mode: 'day', start: T.marchNoonChina, rate: 0.3 },
        paint: [{ fill: { k: 'land', a2: ['CN'], c: C.gold }, a: 0.2 }, ...CHINA_ZONES],
        lines: [mer(120, C.red, 0.3, { w: 1.4 })],
        marks: [mk([20, 75], 'UTC+5', '东五区', { c: C.violet, t: 0.5 }), mk([20, 90], '+6', '东六区', { c: C.blue, t: 0.65 }), mk([20, 105], '+7', '东七区', { c: C.violet, t: 0.8 }), mk([20, 120], 'UTC+8 · 120°E', '东八区 · 东经 120°', { c: C.red, big: true, t: 0.95 }), mk([20, 135], '+9', '东九区', { c: C.violet, t: 1.1 }),
          mk(KASHGAR, 'Kashgar: noon at 14:56', '喀什：正午 14:56', { c: C.teal, dot: true, t: 1.4 }), mk([43.8, 87.6], 'Urumqi: noon ≈ 14:10', '乌鲁木齐：正午约 14:10', { c: C.teal, dot: true, t: 1.7 })],
        body: ['China spans about 73°E to 135°E, which covers five zones, UTC+5 to UTC+9, but since 1949 the whole country has used one standard time, Beijing Time: the local time of 120°E, which is UTC+8 (not the local time of Beijing itself, at 116.4°E). In the west the Sun runs far behind the clock: Kashgar (76°E) is 44° west of 120°E, so its noon comes 44 × 4 = 176 minutes late, at 14:56 Beijing Time, and Urumqi (87.6°E) has noon at about 14:10. Schools and offices in Xinjiang therefore open later, and many people there keep an unofficial “Xinjiang time” two hours behind (UTC+6). Big countries choose differently: Russia, spanning about 170° of longitude, uses 11 time zones.', '我国领土东西跨经度 60 多度（约东经 73°—135°），跨东五区到东九区五个时区，但 1949 年以来全国统一使用北京时间，即东经 120° 的地方时（东八区区时），而不是北京（116.4°E）的地方时。西部地区太阳“落后”于钟表很多：喀什（76°E）在东经 120° 以西 44°，正午晚 44 × 4 = 176 分钟，在北京时间 14 时 56 分；乌鲁木齐（87.6°E）的正午约在 14 时 10 分。因此新疆的学校和单位作息时间较晚，当地生活中也常用比北京时间晚 2 小时的“新疆时间”（东六区）。大国的选择各不相同：俄罗斯东西跨约 170 个经度，使用 11 个时区。'],
      },
      {
        title: ['The International Date Line', '国际日期变更线'], cam: [15, -178, 4.6], night: true, sun: true, sketch: true,
        clock: { mode: 'day', start: Date.UTC(2025, 2, 20, 6), rate: 0 },
        paint: [{ fill: { k: 'strip', w: 165, e: 180, c: C.gold }, a: 0.18, t: 0.3 }, { fill: { k: 'strip', w: -180, e: -165, c: C.violet }, a: 0.22, t: 0.6 }],
        lines: [mer(180, C.white, 0, { w: 0.8 }), { pts: DATE_LINE, c: C.gold, t: 0.3, dur: 2.5, w: 1.6 }],
        marks: [
          mk([65.8, -169], 'Diomede Islands: 3.8 km and 21 h apart', '大、小代奥米德岛：相距 3.8 千米，时差 21 小时', { c: C.teal, dot: true, t: 1 }),
          mk([1.87, -157.36], 'Kiritimati: UTC+14', '圣诞岛（基里蒂马蒂）：UTC+14', { c: C.gold, dot: true, t: 1.5 }),
          mk([-13.83, -171.76], 'Samoa: skipped 30 Dec 2011', '萨摩亚：2011 年跳过 12 月 30 日', { c: C.gold, dot: true, t: 2 }),
          mk([42, 165], 'West: one day later', '西侧：日期早一天（新一天）', { c: C.gold, big: true, t: 2.4 }),
          mk([16, -160], 'East: one day earlier', '东侧：日期晚一天（旧一天）', { c: C.violet, big: true, t: 2.6 }),
        ],
        body: ['The two half-zones UTC+12 and UTC−12 keep the same clock time but dates a day apart, so the date must change somewhere: at the International Date Line, which follows the 180° meridian through the open Pacific but bends to keep each country on one date. It swings east round Chukotka, west round the Aleutian Islands, and far east round Kiribati, whose Line Islands, such as Kiritimati, keep UTC+14, the earliest clock on Earth. It also runs between the two Diomede Islands in the Bering Strait: only 3.8 km apart, Big Diomede (Russia, UTC+12) is 21 hours ahead of Little Diomede (USA, UTC−9). Crossing the line westward (America → Asia) you add a day, eastward you take one off; and a country can move the line, as Samoa did, jumping from 29 to 31 December 2011 to share a date with Australia and New Zealand.', '东十二区和西十二区钟点相同、日期却相差一天，所以日期必须在某处变更，这就是国际日期变更线（日界线）。它在太平洋上大致沿 180° 经线，但为了使同一国家保持同一日期而多处弯折：在楚科奇半岛向东弯，在阿留申群岛向西弯，在基里巴斯大幅向东弯——该国的莱恩群岛（如圣诞岛）使用 UTC+14，是全球最早的时间。日界线还从白令海峡的大、小代奥米德岛之间穿过：两岛只相距 3.8 千米，大代奥米德岛（俄罗斯，UTC+12）比小代奥米德岛（美国，UTC−9）早 21 小时。自东向西（从美洲到亚洲）越过日界线，日期加一天；自西向东则减一天。国家也可以调整日界线：萨摩亚 2011 年从 12 月 29 日直接跳到 31 日，以便与澳大利亚、新西兰同一日期。'],
      },
      {
        title: ['Landing before you left', '“昨天”到达'], cam: [30, 175, 4.4], night: true, wide: true,
        clock: { mode: 'day', start: Date.UTC(2025, 2, 20, 11), rate: 0 },
        lines: [{ pts: DATE_LINE, c: C.violet, t: 0, w: 1 }, { pts: [[35.5, 139.8], [35.6, 148.3], [35.1, 156.9], [34.0, 165.2], [32.3, 173.3], [30.1, -179.0], [27.6, -171.6], [24.6, -164.6], [21.3, -157.9]], c: C.gold, t: 0.5, dur: 3, w: 1.6, arrow: true }],
        marks: [
          mk([35.5, 139.8], 'Tokyo (UTC+9): leave 20:00, 20 Mar', '东京（东九区）：3 月 20 日 20:00 起飞', { c: C.red, big: true, dot: true, t: 0.3 }),
          mk([21.3, -157.9], 'Honolulu (UTC−10): land 08:00, 20 Mar', '檀香山（西十区）：3 月 20 日 8:00 到达', { c: C.blue, big: true, dot: true, t: 3.4 }),
          mk([42, 180], 'Date line: take a day off', '日界线：向东越过，日期减一天', { c: C.violet, t: 2 }),
        ],
        body: ['Flights across the Pacific show the date line at work. A plane leaves Tokyo (UTC+9) at 20:00 on 20 March and flies 7 hours east to Honolulu (UTC−10): it lands at 03:00 on 21 March Tokyo time, and Honolulu is 19 zones behind, so the local time there is 03:00 − 19 h = 08:00 on 20 March, twelve hours “before” it took off. The same answer comes from crossing the line: going east, take a day off. The return is the opposite: leave Honolulu at 12:00 on 22 March, fly 8 hours west (against the jet stream), and land in Tokyo at 15:00 on 23 March, having lost a whole calendar day. Magellan\'s crew, sailing west round the world, were puzzled to find their logbook a day behind when they reached the Cape Verde Islands in 1522.', '跨太平洋的航班最能说明日界线的作用。一架飞机 3 月 20 日 20:00 从东京（东九区）起飞，向东飞行 7 小时到达檀香山（西十区）：到达时东京时间为 3 月 21 日 3:00，檀香山比东京晚 19 个时区，当地时间为 3:00 − 19 小时 = 3 月 20 日 8:00，比起飞时刻还“早”了 12 小时。用日界线也能得到同样结果：向东越过，日期减一天。返程正好相反：3 月 22 日 12:00 从檀香山起飞，向西逆着西风急流飞行 8 小时，到达东京已是 3 月 23 日 15:00，整整“丢”了一个日历日。麦哲伦船队向西环球航行，1522 年抵达佛得角群岛时发现航海日志比当地日期少了一天，正是这个原因。'],
      },
      {
        title: ['Two dates at once', '两个日期'], cam: [20, 60, 6], night: true, sun: true, wide: true, sketch: true,
        clock: { mode: 'day', start: EQ, rate: 0 },
        paint: [{ fill: { k: 'strip', w: -60, e: 180, c: C.gold }, a: 0.22, t: 0.4 }, { fill: { k: 'strip', w: 180, e: -60, c: C.violet }, a: 0.28, t: 0.8 }],
        lines: [mer(-60, C.teal, 0, { w: 1.4 }), { pts: DATE_LINE, c: C.gold, t: 0.3, dur: 2.5, w: 1.4 }],
        marks: [mk([10, -60], '0:00 midnight (60°W)', '0 时经线（西经 60°）', { c: C.teal, big: true, t: 0.5 }), mk([45, 60], '20 March (new day)', '3 月 20 日（新的一天）', { c: C.gold, big: true, t: 1.2 }), mk([45, -120], '19 March', '3 月 19 日', { c: C.violet, big: true, t: 1.6 }), mk([-20, 180], 'Date line ≈ 180°', '日界线 ≈ 180°', { c: C.gold, t: 2 })],
        body: ['There are always two date boundaries. One is the midnight meridian, where the local time is 0:00; it sweeps west 15° every hour. The other is the International Date Line, near 180°, which stays put. From midnight east to 180° it is already the new day, so at UTC hour t (0 ≤ t ≤ 12) midnight is at 15t degrees west and the new day covers (180 + 15t)° of the 360°. At 12:00 Beijing Time (04:00 UTC) midnight is at 60°W, so the new date covers 180 + 60 = 240°, two-thirds of the world: it is 20 March from Brazil east to New Zealand but still 19 March across most of the Americas and the eastern Pacific.', '地球上始终有两条日期分界线：一条是 0 时所在的经线，它每小时向西移动 15°；另一条是国际日期变更线（日界线），大致沿 180° 经线，位置固定。从 0 时经线向东到 180° 经线是“新的一天”，所以协调世界时 t 时（0 ≤ t ≤ 12），0 时经线在西经 15t°，新的一天占 (180 + 15t)°。北京时间 12 时（协调世界时 4 时），0 时经线在西经 60°，新的一天范围为 180° + 60° = 240°，占全球的三分之二：从巴西向东直到新西兰已是 3 月 20 日，美洲的大部分地区仍是 3 月 19 日。'],
      },
      {
        title: ['One date for the whole world', '全球同一日期'], cam: [20, 180, 6], night: true, sun: true, wide: true, sketch: true,
        clock: { mode: 'day', start: Date.UTC(2025, 2, 20, 12), rate: 0 },
        paint: [{ fill: { k: 'strip', w: -180, e: 180, c: C.gold }, a: 0.18, t: 0.4 }],
        lines: [mer(180, C.teal, 0, { w: 1.6 })],
        marks: [mk([10, 180], '180°: 0:00', '180°：0 时', { c: C.teal, big: true, t: 0.5 }), mk([45, 120], 'Beijing 20:00, 20 March', '北京 3 月 20 日 20 时', { c: C.red, t: 1 }), mk([40, -100], 'Everywhere: 20 March', '全球都是 3 月 20 日', { c: C.gold, big: true, t: 1.5 })],
        body: ['When midnight reaches 180°, the two boundaries coincide and, for an instant, the whole world shares one date: (180 + 15 × 12)/360 = 1. That happens at 12:00 UTC, which is 20:00 Beijing Time, every day. One hour later midnight has moved to 165°E and a new date begins again just west of the date line (by the 180° meridian, not by the zone clocks). So when the share is asked at a Beijing Time T between 08:00 and 20:00, turn it into UTC (t = T − 8) and use (180 + 15t)/360; at 16:00 Beijing Time, for example, t = 8 and the new day covers 300°, five-sixths of the globe.', '当 0 时经线与 180° 经线重合时，两条分界线合二为一，全球处在同一日期：(180 + 15 × 12)/360 = 1。这发生在每天协调世界时 12 时，也就是北京时间 20 时。再过一小时，0 时经线移到东经 165°，日界线西侧又进入了新的一天（按 180° 经线计算，而非各地区时）。所以已知北京时间 T（8 时至 20 时之间）求新一天的范围时，先换算成协调世界时 t = T − 8，再用 (180 + 15t)/360：例如北京时间 16 时，t = 8，新的一天占 300°，即全球的六分之五。'],
      },
    ],
    quiz: [
      { q: ['A is at 120°E and B at 90°E. When the local time at A is 10:00, what is the local time at B (in hours)?', '甲地位于东经 120°，乙地位于东经 90°。甲地地方时为 10 时，乙地地方时是几时？'], num: { answer: 8, tol: 0.05, unit: ['o\'clock', '时'] },
        why: ['30° apart × 4 min = 120 min = 2 hours, and B is to the west, so its clock is behind: 10 − 2 = 8:00.', '经度差 30° × 4 分钟 = 120 分钟 = 2 小时；乙在西边，求西边的时刻用减：10 − 2 = 8 时。'] },
      { q: ['At 12:00 Beijing Time, what is the local time in Kashgar (76°E)?', '北京时间 12 时，喀什（东经 76°）的地方时约是'], options: [['09:04', '9 时 04 分'], ['14:56', '14 时 56 分'], ['12:00', '12 时'], ['10:00', '10 时']], answer: 0,
        why: ['Beijing Time is the local time of 120°E. 120 − 76 = 44°, × 4 min = 176 min = 2 h 56 min earlier: 9:04. (14:56 is the Beijing Time of Kashgar\'s noon, the reverse question.)', '北京时间是东经 120° 的地方时。经度差 44°，× 4 分钟 = 176 分钟 = 2 小时 56 分，西减：9 时 04 分。（14 时 56 分是喀什正午时的北京时间，是反过来的问题。）'] },
      { q: ['Match each city with the time zone its longitude puts it in.', '按经度把城市和它所在的（理论）时区连起来。'],
        match: [[['London 0°', '伦敦 0°'], ['UTC (zone 0)', '中时区']], [['Moscow 37.6°E', '莫斯科 37.6°E'], ['UTC+3', '东三区']], [['Lhasa 91.1°E', '拉萨 91.1°E'], ['UTC+6', '东六区']], [['Sydney 151.2°E', '悉尼 151.2°E'], ['UTC+10', '东十区']], [['New York 74°W', '纽约 74°W'], ['UTC−5', '西五区']]],
        why: ['Longitude ÷ 15, rounded: 0, 37.6/15 = 2.5 → 3, 91.1/15 = 6.1 → 6, 151.2/15 = 10.1 → 10, 74/15 = 4.9 → 5 west. Lhasa still keeps Beijing Time (UTC+8) by law.', '经度 ÷ 15 后四舍五入：0；37.6/15 = 2.5 → 3；91.1/15 = 6.1 → 6；151.2/15 = 10.1 → 10；74/15 = 4.9 → 西 5。拉萨在法定上仍使用北京时间（东八区）。'] },
      { q: ['A flight leaves Beijing at 10:00 Beijing Time and flies 14 hours to New York (UTC−5). At what local hour does it land?', '一架飞机北京时间 10 时从北京起飞，飞行 14 小时到达纽约（西五区），到达时纽约当地时间是几时？'], num: { answer: 11, tol: 0.05, unit: ['o\'clock', '时'] },
        why: ['Landing in Beijing Time: 10 + 14 = 24:00, i.e. 0:00 the next day. New York is 13 zones west: 24 − 13 = 11:00, on the same date it left.', '到达时北京时间为 10 + 14 = 24 时（次日 0 时）；纽约在西五区，比东八区晚 13 小时：24 − 13 = 11 时，与起飞同一天。'] },
      { q: ['At 16:00 Beijing Time, what share of the world is already on the new date?', '北京时间 16 时，全球进入新一天的范围约占'], options: [['Five-sixths', '六分之五'], ['Two-thirds', '三分之二'], ['One-half', '二分之一'], ['One-sixth', '六分之一']], answer: 0,
        why: ['16:00 Beijing Time = 08:00 UTC, so midnight is at 8 × 15 = 120°W. From 120°W east to 180° is 300°: 300/360 = 5/6.', '北京时间 16 时 = 协调世界时 8 时，0 时经线在西经 120°。从西经 120° 向东到 180° 共 300°，占 300/360 = 5/6。'] },
      { q: ['Which statements about the International Date Line are true? Pick all.', '关于国际日期变更线，下列说法正确的是（多选）'], options: [['Sailing west across it, from America to Asia, you add a day', '自东向西（从美洲到亚洲）越过它，日期加一天'], ['It bends round island groups so that a country keeps one date', '它绕过一些群岛弯折，使同一国家保持同一日期'], ['Kiritimati (UTC+14) and Honolulu (UTC−10) show the same clock time but dates a day apart', '圣诞岛（UTC+14）与檀香山（UTC−10）钟点相同、日期相差一天'], ['It follows the 180° meridian exactly', '它与 180° 经线完全重合'], ['Crossing it eastward, you add a day', '自西向东越过它，日期加一天']], multi: [0, 1, 2],
        why: ['The line bends round Chukotka, the Aleutians, Kiribati and Samoa, so it is not exactly 180°. West of it the calendar is one day ahead, so going west you add a day and going east you take one off. +14 and −10 differ by 24 hours: the same clock, one day apart.', '日界线在楚科奇、阿留申、基里巴斯、萨摩亚等处弯折，并不与 180° 经线完全重合。它西侧的日期比东侧早一天（先进入新的一天），所以向西越过加一天、向东越过减一天。+14 与 −10 相差 24 小时：钟点相同、日期差一天。'] },
      { q: ['Put these places in order by when they see the noon Sun, first to last.', '按正午先后（最先到最后）排列这些地点。'], order: [['Fuyuan 134.3°E', '抚远 134.3°E'], ['Shanghai 121.5°E', '上海 121.5°E'], ['Beijing 116.4°E', '北京 116.4°E'], ['Lhasa 91.1°E', '拉萨 91.1°E'], ['Kashgar 76.0°E', '喀什 76.0°E']],
        why: ['The Earth turns west to east, so the Sun reaches the eastern places first: the larger the east longitude, the earlier the noon. Fuyuan sees noon about 3 h 53 min before Kashgar (58.3° × 4 min).', '地球自西向东自转，东边的地点先到正午：东经度数越大，正午越早。抚远比喀什早约 3 小时 53 分（58.3° × 4 分钟）。'] },
      { q: ['At about what Beijing Time is the Sun highest in Urumqi (87.6°E)?', '乌鲁木齐（东经 87.6°）正午时，北京时间约是'], options: [['14:10', '14 时 10 分'], ['09:50', '9 时 50 分'], ['12:00', '12 时'], ['13:00', '13 时']], answer: 0,
        why: ['120 − 87.6 = 32.4°, × 4 min ≈ 130 min ≈ 2 h 10 min. Urumqi is west, so its noon comes later by the Beijing clock: 12:00 + 2 h 10 min ≈ 14:10.', '经度差 120° − 87.6° = 32.4°，× 4 分钟 ≈ 130 分钟 ≈ 2 小时 10 分。乌鲁木齐在西边，正午来得晚：12:00 + 2 小时 10 分 ≈ 14 时 10 分。'] },
    ],
  },
  {
    id: 'a-noon-sun', strand: 'earthsun', level: 'sr', tracks: [], unit, icon: 'ruler', minutes: 12,
    title: ['The noon Sun\'s altitude', '正午太阳高度'],
    blurb: ['How high the Sun climbs at noon, from place to place and season to season, and why it matters for houses.', '正午太阳有多高？它怎样随纬度和季节变化，又怎样决定楼间距。'],
    keys: [
      ['Noon Sun altitude H = 90° − |φ − δ|: φ the latitude, δ the latitude of the subsolar point (north positive, south negative).', '正午太阳高度 H = 90° − |φ − δ|：φ 为当地纬度，δ 为直射点纬度（北纬取正，南纬取负）。'],
      ['H is 90° at the subsolar point and falls by 1° for every degree of latitude away from it, to the north and to the south.', '正午太阳高度由直射点向南北两侧递减，每远离 1 个纬度减小 1°。'],
      ['North of the Tropic of Cancer, H is highest at the June solstice and lowest at the December solstice, a swing of 46.88°; between the tropics the Sun is overhead twice a year.', '北回归线以北，夏至日正午太阳高度最大，冬至日最小，年变化幅度为 46.88°；回归线之间每年有两次太阳直射。'],
      ['Buildings are spaced so the December-solstice noon shadow does not reach the next block: L = h / tan H.', '楼间距按冬至日正午影长确定：L = h / tan H。'],
      ['A solar panel facing the noon Sun square on is tilted at 90° − H; a fixed panel is set at about the latitude.', '太阳能集热板与正午太阳光线垂直时，倾角 = 90° − H；固定安装时一般取约等于当地纬度的倾角。'],
    ],
    steps: [
      {
        title: ['Measuring the noon Sun', '正午太阳高度'],
        astro: { kit: 'rays', mode: 'noon', lat: 39.9, dec: OB, name: ['Beijing', '北京'] },
        body: ['The Sun\'s altitude is the angle between its rays and the local horizon, and it is greatest at local noon, when the Sun crosses the meridian. Sunlight arrives in parallel rays, and only at the subsolar point (where it is directly overhead, at latitude δ) is the noon altitude 90°. Each degree of latitude away from it tilts the horizon by one more degree, so the noon Sun is one degree lower: H = 90° − |φ − δ|. On 21 June (δ = 23.44°N), Beijing (39.9°N) is 39.9 − 23.44 = 16.46° from the subsolar point, so H = 90° − 16.46° ≈ 73.5°.', '太阳高度是太阳光线与当地地平面的夹角，一天中以正午（太阳上中天时）最大。太阳光是平行光，只有太阳直射点（纬度为 δ）的正午太阳高度是 90°；离直射点每远 1 个纬度，地平面就多倾斜 1°，正午太阳高度减小 1°：H = 90° − |φ − δ|。夏至日直射点在北纬 23.44°，北京（39.9°N）与它相差 39.9° − 23.44° = 16.46°，所以 H = 90° − 16.46° ≈ 73.5°。'],
      },
      {
        title: ['Across the Equator', '南北半球的计算'],
        astro: { kit: 'rays', mode: 'noon', lat: -33.9, dec: OB, name: ['Sydney', '悉尼'] },
        body: ['The rule |φ − δ| is simply the distance in latitude between you and the subsolar point. If you are in the same hemisphere as the Sun, subtract the two latitudes; if in opposite hemispheres, add them. On 21 June the Sun is overhead at 23.44°N, so Guangzhou (23.1°N) is only 0.34° away and has H = 89.7°, almost overhead, while Sydney (33.9°S) is 33.9 + 23.44 = 57.34° away and has H = 90° − 57.34° ≈ 32.7°. In Sydney the noon Sun stands in the northern sky, and June is midwinter there.', '|φ − δ| 就是当地与直射点之间相差的纬度：同在一个半球时两纬度相减，分处南北半球时两纬度相加。6 月 21 日太阳直射北纬 23.44°，广州（23.1°N）与它只差 0.34°，H = 89.7°，几乎直射；悉尼（33.9°S）与它相差 33.9° + 23.44° = 57.34°，H = 90° − 57.34° ≈ 32.7°。悉尼的正午太阳在北方天空，6 月正是那里的隆冬。'],
      },
      {
        title: ['From place to place', '随纬度变化'],
        astro: { kit: 'rays', mode: 'noon', dec: OB, clock: { from: -70, to: 85, rate: 12, unit: 'lat', at: 0.4 }, tasks: [
          { text: ['Find the latitude where the noon Sun is overhead (H = 90°).', '找到正午太阳高度为 90° 的纬度。'], done: (_p, v) => Math.abs(v - OB) <= 1 },
          { text: ['Go north to the Arctic Circle (66.56°N): how high is the noon Sun there?', '向北移到北极圈（66.56°N）：那里的正午太阳高度是多少？'], done: (_p, v) => Math.abs(v - 66.56) <= 1 },
        ] },
        task: ['Drag the latitude slider from south to north.', '拖动纬度滑块，从南向北移动观察者。'],
        body: ['Slide the observer from south to north on the June solstice. The noon Sun is highest (90°) at the Tropic of Cancer and falls by a degree for every degree you go either way: 66.56° at the Equator, 90° − (40° + 23.44°) = 26.56° at 40°S, 0° at the Antarctic Circle (66.56°S). At the Arctic Circle the noon Sun is still 46.88° high, and north of it the Sun stays above the horizon even at midnight; south of the Antarctic Circle it never rises, because the formula would give a negative H. So on any day the noon Sun decreases away from the subsolar latitude, the same in both directions.', '在夏至日让观察者从南向北移动：北回归线上正午太阳高度为 90°，向南、向北每移动 1 个纬度减小 1°：赤道 66.56°，南纬 40° 为 90° − (40° + 23.44°) = 26.56°，南极圈（66.56°S）为 0°。北极圈上正午太阳高度仍有 46.88°，北极圈以北半夜太阳也不落下；南极圈以南太阳整天不出，按公式算出的 H 小于 0。所以同一天，正午太阳高度由直射点所在纬度向南北两侧递减。'],
      },
      {
        title: ['From season to season', '随季节变化'],
        astro: { kit: 'rays', mode: 'noon', lat: 39.9, name: ['Beijing', '北京'], clock: { from: Y25, to: Y26, rate: 24, unit: 'date', at: 0.47 } },
        task: ['Drag the date through the year and watch Beijing\'s noon Sun rise and fall.', '拖动日期走过一年，观察北京正午太阳高度的升降。'],
        fig: noonFig,
        body: ['Because the Earth\'s axis is tilted 23.44°, the subsolar point moves between the tropics in a year: on the Tropic of Cancer at the June solstice, the Equator at the equinoxes, the Tropic of Capricorn at the December solstice. So Beijing\'s noon Sun swings from 73.5° in June through 50.1° at the equinoxes to 90° − (39.9° + 23.44°) = 26.7° in December, a range of 2 × 23.44° = 46.88°, which is the same everywhere north of the Tropic of Cancer. There, H is highest at the June solstice and lowest at the December solstice. Between the tropics the Sun is overhead twice a year, and the noon Sun is lowest at whichever solstice the subsolar point is furthest away.', '由于地轴倾斜 23.44°，太阳直射点一年中在南北回归线之间来回移动：夏至日直射北回归线，春分、秋分日直射赤道，冬至日直射南回归线。所以北京的正午太阳高度从夏至日的 73.5°，经二分日的 50.1°，降到冬至日的 90° − (39.9° + 23.44°) = 26.7°，年变化幅度为 2 × 23.44° = 46.88°，北回归线以北各地都是如此。这些地方夏至日正午太阳高度达一年中最大，冬至日最小。回归线之间每年有两次太阳直射，直射点离当地最远的那个至日正午太阳高度最小。'],
      },
      {
        title: ['A day without a shadow', '立竿无影'],
        astro: { kit: 'gnomon', mode: 'day', lat: 23.1, day: 162, clock: { from: 6, to: 18, rate: 0.9, unit: 'hour', fmt: ['Solar time', '地方时'], at: 0.25 }, tasks: [
          { text: ['Drag the time to local noon: the shadow vanishes.', '把时间拖到地方时 12 时：影子消失了。'], done: (_p, v) => Math.abs(v - 12) <= 0.15 },
        ] },
        task: ['Watch the shadow of the rod in Guangzhou on 11 June.', '观察 6 月 11 日广州的立竿影子。'],
        body: ['Where the Sun passes straight overhead, a vertical rod casts no shadow at noon: in Guangzhou (23.1°N) this happens when the subsolar point reaches 23.1°N, about 11 June on its way north and 1 July on its way back. In Sanya (18.3°N) the shadowless days come earlier and later, about 12 May and 30 July, and north of the Tropic of Cancer they never come at all. The noon shadow always points away from the Sun: in Beijing it points north all year, but in Guangzhou between 11 June and 1 July, with the Sun overhead slightly to the north, it points south. Engineers use the shadowless moment to check that the sunlight falls straight down a well or a pillar.', '太阳直射的地方，正午时竖直的竿子没有影子（立竿无影）：广州（23.1°N）在直射点到达北纬 23.1° 时出现这一现象，北移时约在 6 月 11 日，南返时约在 7 月 1 日。三亚（18.3°N）的“无影日”来得更早、结束得更晚，约在 5 月 12 日和 7 月 30 日；北回归线以北则永远没有。正午影子总是背向太阳：北京的正午影子终年朝北，而广州在 6 月 11 日至 7 月 1 日之间，太阳直射点略偏北，正午影子朝南。'],
      },
      {
        title: ['Spacing buildings', '确定楼间距'],
        astro: { kit: 'rays', mode: 'spacing', clock: { from: 18, to: 50, rate: 2.5, unit: 'lat', fmt: ['Latitude {v}°N', '北纬 {v}°'], dp: 1 }, tasks: [
          { text: ['Find Beijing\'s latitude (39.9°N): about 40 m between 20 m blocks.', '找到北京的纬度（39.9°N）：20 米高的楼约需间隔 40 米。'], done: (_p, v) => Math.abs(v - 39.9) <= 0.5 },
        ] },
        task: ['Drag the latitude and watch the winter shadow grow.', '拖动纬度，观察冬至日正午影子怎样变长。'],
        body: ['Every flat should get some winter sunshine, so the gap between blocks is set by the day with the lowest noon Sun, the December solstice. At noon the front block of height h casts a shadow L = h / tan H, and the next block must stand at least that far away. For 20 m blocks in Beijing, H = 26.7° and tan 26.7° ≈ 0.503, so L = 20 ÷ 0.503 ≈ 40 m; in Guangzhou (H = 43.5°) about 21 m is enough, but in Harbin (H = 20.8°) it takes about 53 m. That is why northern cities are spread out more thinly, and why China\'s planning rules require a minimum number of hours of sunlight on the darkest day.', '为了让每户冬季都能照到阳光，楼间距要按一年中正午太阳高度最小的冬至日来算：高为 h 的前楼正午影长 L = h / tan H，后楼与它的距离不能小于 L。同样 20 米高的楼，北京冬至日 H = 26.7°，tan 26.7° ≈ 0.503，L = 20 ÷ 0.503 ≈ 40 米；广州（H = 43.5°）约需 21 米，哈尔滨（H = 20.8°）约需 53 米。所以北方城市的住宅区更稀疏，我国规划规范也规定了住宅在冬至日（或大寒日）的最低日照时数。'],
      },
      {
        title: ['Tilting a solar water heater', '太阳能热水器的倾角'],
        astro: { kit: 'rays', mode: 'spacing', heater: true, clock: { from: 18, to: 50, rate: 2.5, unit: 'lat', fmt: ['Latitude {v}°N', '北纬 {v}°'], dp: 1, at: 0.6 } },
        body: ['A solar collector absorbs most when the rays hit it square on. Then the panel and the ground make an angle α = 90° − H, so the tilt must be steeper where and when the Sun is lower. In Beijing at the December solstice α = 90° − 26.7° = 63.3°, at the June solstice only 90° − 73.5° = 16.5°: from summer to winter the panel should be raised by 46.88°. At the equinoxes α = 90° − (90° − φ) = φ, which is why a panel that cannot be moved is usually fixed at about the local latitude, 40° in Beijing. Heaters with an adjustable frame can be re-angled a few times a year to collect more.', '太阳光线与集热板垂直时吸收的能量最多，此时集热板与地面的夹角 α = 90° − H，太阳越低，集热板就要立得越陡。北京冬至日 α = 90° − 26.7° = 63.3°，夏至日只需 90° − 73.5° = 16.5°：从夏到冬要调高 46.88°。春分、秋分日 α = 90° − (90° − φ) = φ，所以不能调节的集热板一般按约等于当地纬度的倾角安装，北京约为 40°。可调支架的热水器每年调整几次，能收集更多热量。'],
      },
      {
        title: ['Lab: tilt and latitude', '实验：地轴倾角与纬度'],
        task: ['Change your latitude and the Earth\'s tilt; read the noon Sun at the two solstices.', '改变观察者纬度和地轴倾角，读出两个至日的正午太阳高度。'],
        astro: {
          kit: 'terms', view: 'tilt', clock: { from: Date.UTC(2025, 2, 20, 9), to: Date.UTC(2026, 2, 20, 9), rate: 12, unit: 'date', at: 0.25 },
          params: [
            { id: 'lat', name: ['Your latitude', '观察者纬度'], min: 0, max: 80, value: 30, step: 0.5, fmt: ['{v}°N', '北纬 {v}°'], dp: 1 },
            { id: 'tilt', name: ['Axial tilt', '地轴倾角'], min: 0, max: 45, value: 23.44, step: 0.5, fmt: ['{v}°', '{v}°'], dp: 1 },
          ],
          tasks: [
            { text: ['Put yourself on the Tropic of Cancer: the June-solstice noon Sun reaches 90°.', '把自己放到北回归线上：夏至日正午太阳高度达到 90°。'], done: p => Math.abs(p.lat - p.tilt) <= 0.5 },
            { text: ['Make the December-solstice noon Sun just touch the horizon (the Arctic Circle).', '让冬至日正午太阳恰好落在地平线上（北极圈）。'], done: p => Math.abs(p.lat + p.tilt - 90) <= 0.6 },
            { text: ['Set the tilt to 0°: the noon Sun no longer changes with the seasons.', '把倾角调到 0°：正午太阳高度不再随季节变化。'], done: p => p.tilt <= 0.5 },
          ],
        },
        body: ['The two solstice values follow from the formula: at latitude φ the noon Sun is 90° − |φ − ε| at the June solstice and 90° − (φ + ε) at the December solstice, where ε is the tilt. At 30°N with ε = 23.44° that gives 83.4° and 36.6°. Raise the latitude and both fall; raise the tilt and summer gets higher while winter gets lower, so the seasons grow harsher. With no tilt the Sun would be overhead at the Equator every day, and every place would have the same noon Sun, 90° − φ, all year.', '两个至日的正午太阳高度都可以由公式求出：纬度 φ 处，夏至日为 90° − |φ − ε|，冬至日为 90° − (φ + ε)，ε 为地轴倾角。北纬 30°、ε = 23.44° 时分别为 83.4° 和 36.6°。纬度升高，两者都减小；倾角增大，夏季更高、冬季更低，季节变化更剧烈。如果地轴不倾斜，太阳天天直射赤道，各地全年的正午太阳高度都是 90° − φ。'],
      },
    ],
    quiz: [
      { q: ['Tap the subsolar point, where the Sun is directly overhead.', '点出太阳直射点。'], astro: { kit: 'rays', mode: 'noon', lat: 39.9, dec: 12 }, pick: 'subsolar',
        why: ['The subsolar point is where the rays meet the surface head-on, at latitude δ.', '太阳直射点是太阳光线垂直射到地面的地方，其纬度为 δ。'] },
      { q: ['What is Beijing\'s (39.9°N) noon Sun altitude at the December solstice, in degrees?', '冬至日北京（39.9°N）的正午太阳高度是多少度？'], num: { answer: 26.7, tol: 0.5, unit: ['°', '°'] },
        why: ['δ = −23.44°: H = 90° − |39.9° − (−23.44°)| = 90° − 63.34° ≈ 26.7°. Opposite hemispheres, so the latitudes add.', '冬至日直射点在 23.44°S，与北京分处南北半球，纬度相加：H = 90° − (39.9° + 23.44°) = 90° − 63.34° ≈ 26.7°。'] },
      { q: ['Put these cities in order of their noon Sun at the December solstice, highest first.', '按冬至日正午太阳高度从大到小排列这些城市。'],
        order: [['Sanya 18.3°N', '三亚 18.3°N'], ['Guangzhou 23.1°N', '广州 23.1°N'], ['Shanghai 31.2°N', '上海 31.2°N'], ['Beijing 39.9°N', '北京 39.9°N'], ['Harbin 45.8°N', '哈尔滨 45.8°N']],
        why: ['The subsolar point is at 23.44°S, south of all of them, so the further north, the lower: 48.3°, 43.5°, 35.4°, 26.7°, 20.8°.', '冬至日直射点在 23.44°S，位于这些城市以南，纬度越高正午太阳高度越小：48.3°、43.5°、35.4°、26.7°、20.8°。'] },
      { q: ['Match each place with its noon Sun altitude at the equinoxes.', '把各地和它春分日的正午太阳高度连起来。'],
        match: [[['Equator', '赤道'], ['90°', '90°']], [['Guangzhou 23.1°N', '广州 23.1°N'], ['66.9°', '66.9°']], [['Beijing 39.9°N', '北京 39.9°N'], ['50.1°', '50.1°']], [['Harbin 45.8°N', '哈尔滨 45.8°N'], ['44.2°', '44.2°']]],
        why: ['At the equinoxes the Sun is overhead at the Equator (δ = 0), so H = 90° − φ: 90°, 66.9°, 50.1°, 44.2°.', '春分日直射赤道（δ = 0），H = 90° − φ：90°、66.9°、50.1°、44.2°。'] },
      { q: ['Where the noon Sun is 50° high, at what angle to the ground should a solar panel be set?', '某地正午太阳高度为 50°，太阳能集热板与地面的夹角应调为'], options: [['40°', '40°'], ['50°', '50°'], ['90°', '90°'], ['25°', '25°']], answer: 0,
        why: ['For the rays to hit square on, the panel tilt = 90° − H = 40°: the panel and the rays then meet at 90°.', '使太阳光线与集热板垂直，倾角 = 90° − H = 40°，此时光线与板面成 90°。'] },
      { q: ['In Shanghai (31.2°N) the December-solstice noon Sun is 35.4° high (tan 35.4° ≈ 0.71). How far apart, in metres, must 30 m blocks stand?', '上海（31.2°N）冬至日正午太阳高度为 35.4°（tan 35.4° ≈ 0.71）。30 米高的楼房之间至少要相距多少米？'], num: { answer: 42, tol: 2, unit: ['m', '米'] },
        why: ['L = h / tan H = 30 ÷ 0.71 ≈ 42 m. Any closer, and the lower floors of the next block lose their noon sunshine in winter.', 'L = h / tan H = 30 ÷ 0.71 ≈ 42 米。间距再小，后楼低层冬至日正午就照不到阳光。'] },
      { q: ['Which are true on the June solstice? Pick all.', '夏至日，下列说法正确的是（多选）'], options: [['The noon Sun is 90° on the Tropic of Cancer', '北回归线上正午太阳高度为 90°'], ['The noon Sun falls away from 23.44°N both to the north and to the south', '正午太阳高度由北纬 23.44° 向南北两侧递减'], ['In Sydney the noon Sun is in the northern sky', '悉尼的正午太阳位于北方天空'], ['Beijing\'s noon shadow points south', '北京的正午影子朝南'], ['The noon Sun is 90° on the Equator', '赤道上正午太阳高度为 90°']], multi: [0, 1, 2],
        why: ['The subsolar point is at 23.44°N. Beijing is north of it, so its shadow points north; the Equator gets 66.56°; Sydney, far south, sees the Sun to the north at 32.7°.', '夏至日直射点在 23.44°N。北京在直射点以北，正午影子朝北；赤道正午太阳高度为 66.56°；悉尼远在南方，正午太阳在北方天空，高度 32.7°。'] },
      { q: ['At the March equinox the noon Sun at a place in the Northern Hemisphere is 60° high. What is its latitude, in degrees north?', '春分日北半球某地正午太阳高度为 60°，该地纬度是北纬多少度？'], num: { answer: 30, tol: 0.5, unit: ['°N', '°N'] },
        why: ['At the equinox δ = 0, so H = 90° − φ and φ = 90° − 60° = 30°N.', '春分日直射赤道，δ = 0，H = 90° − φ，所以 φ = 90° − 60° = 30°N。'] },
    ],
  },
  {
    id: 'a-day-length', strand: 'earthsun', level: 'sr', tracks: [], unit, icon: 'globe', minutes: 12,
    title: ['Day and night: how long?', '昼夜长短的变化'],
    blurb: ['Why summer days are long, and why the Arctic has days that never end.', '为什么夏季白昼长，北极地区又为什么会有“不落的太阳”。'],
    keys: [
      ['The terminator (day–night line) cuts the Earth in half; the share of a latitude circle on the day side (its day arc) sets the day length.', '晨昏线把地球分成昼半球和夜半球；某纬线圈上昼弧所占的比例决定当地昼长。'],
      ['At the equinoxes the terminator passes through the poles: 12 hours everywhere. The Equator has 12 hours all year.', '春分、秋分日晨昏线通过两极，全球昼夜等长（各 12 小时）；赤道上终年昼夜等长。'],
      ['Whichever hemisphere holds the subsolar point has days longer than nights, longer the further from the Equator; beyond 90° − |δ| there is polar day, and polar night round the other pole.', '直射点在哪个半球，哪个半球就昼长夜短，且纬度越高昼越长；纬度高于 90° − |δ| 的地方出现极昼，另一极周围出现极夜。'],
      ['As the subsolar point moves north, northern days lengthen; as it moves south, they shorten. Days in the north are longest at the June solstice and shortest at the December solstice.', '直射点向北移动，北半球昼渐长；向南移动，北半球昼渐短。北半球夏至日昼最长，冬至日昼最短。'],
      ['Day length = 2 × (12 − sunrise time) = 2 × (sunset time − 12), in local solar time; places on the same latitude share the same day length.', '昼长 = 2 ×（12 − 日出时刻）= 2 ×（日落时刻 − 12），用地方时计算；同一纬线上各地昼长相同。'],
    ],
    steps: [
      {
        title: ['The terminator', '晨昏线'],
        astro: { kit: 'rays', mode: 'daylen', dec: 0 },
        body: ['Half the Earth faces the Sun at any moment. The circle between the day hemisphere and the night hemisphere is the terminator; it always stands at right angles to the Sun\'s rays, and the Sun is on the horizon all along it. On the dawn line places are turning into daylight; on the dusk line, out of it. As the Earth turns, each place is carried round its latitude circle, so the share of that circle on the day side (the day arc) is the share of 24 hours that is daytime. At the equinoxes the terminator runs through both poles and halves every circle: 12 hours of day and 12 of night everywhere, from Singapore to Harbin.', '任何时刻地球都有一半被太阳照亮。昼半球和夜半球的分界线叫晨昏线，它所在的平面始终与太阳光线垂直，线上各点太阳高度为 0。由夜进入昼的是晨线，由昼进入夜的是昏线。地球自转时，各地沿所在纬线圈运动，纬线圈在昼半球的部分（昼弧）占多少，白昼就占 24 小时的多少。春分、秋分日，晨昏线通过两极，平分所有纬线圈，从新加坡到哈尔滨，全球昼夜等长，各 12 小时。'],
      },
      {
        title: ['The June solstice', '夏至日'],
        astro: { kit: 'rays', mode: 'daylen', dec: OB, lats: [{ lat: 53.5, name: ['Mohe', '漠河'] }, { lat: 39.9, name: ['Beijing', '北京'] }, { lat: 23.1, name: ['Guangzhou', '广州'] }] },
        body: ['The Earth\'s axis is tilted 23.44°. On 21 June the North Pole leans towards the Sun: the terminator no longer passes through the poles, and in the north each latitude circle has a longer day arc than night arc. The further north, the longer the day: about 13.4 h in Guangzhou, 14.0 h in Shanghai, 14.8 h in Beijing, 15.5 h in Harbin and 16.8 h in Mohe, China\'s northernmost town, where refraction stretches it to about 17 h and the sky never gets fully dark. North of the Arctic Circle (66.56°N) the whole circle is lit: polar day, the midnight Sun. The Equator still has exactly 12 hours, and the Southern Hemisphere has short days.', '地轴倾斜 23.44°。6 月 21 日前后（夏至日），北极倾向太阳，晨昏线不再通过两极，北半球各纬线圈昼弧长于夜弧，昼长夜短，且纬度越高白昼越长：广州约 13.4 小时，上海约 14.0 小时，北京约 14.8 小时，哈尔滨约 15.5 小时，我国最北的漠河约 16.8 小时，加上大气折射约 17 小时，夜空不会完全黑下来。北极圈（66.56°N）以北整个纬线圈都在昼半球，出现极昼（“午夜太阳”）。赤道上仍是昼夜等长，南半球则昼短夜长。'],
      },
      {
        title: ['Polar day and polar night', '极昼和极夜'],
        astro: { kit: 'rays', mode: 'daylen', lats: [{ lat: 69.6, name: ['Tromsø', '特罗姆瑟'] }, { lat: 53.5, name: ['Mohe', '漠河'] }, { lat: 39.9, name: ['Beijing', '北京'] }], clock: { from: Date.UTC(2025, 2, 20, 4), to: Date.UTC(2025, 8, 23, 4), rate: 15, unit: 'date' }, tasks: [
          { text: ['Find a date when Tromsø (69.6°N) has the midnight Sun.', '找到特罗姆瑟（69.6°N）出现极昼的日期。'], done: (_p, v) => v >= Date.UTC(2025, 4, 24) && v <= Date.UTC(2025, 6, 19) },
        ] },
        task: ['Drag the date from March to September and watch the polar-day cap grow and shrink.', '把日期从 3 月拖到 9 月，观察极昼范围怎样扩大又缩小。'],
        body: ['When the subsolar point is at latitude δ, the terminator touches the latitude 90° − |δ|, so polar day covers everything poleward of it in the sunlit hemisphere and polar night the same area round the other pole. On 1 May, with δ ≈ 15°N, that is north of 75°N; by the June solstice it has grown to the Arctic Circle, the largest it can be. Tromsø in Norway (69.6°N) therefore sees the midnight Sun from about 20 May to 22 July, and has polar night in midwinter. At the North Pole itself the Sun rises once at the March equinox and sets once at the September equinox: a single six-month day.', '直射点位于纬度 δ 时，晨昏线与纬度 90° − |δ| 的纬线相切：在直射点所在半球，这条纬线以内出现极昼；另一极周围同样大的范围出现极夜。5 月 1 日 δ ≈ 15°N，极昼出现在 75°N 以北；到夏至日扩大到北极圈，达到最大。所以挪威的特罗姆瑟（69.6°N）约从 5 月 20 日到 7 月 22 日有“午夜太阳”，隆冬则有极夜。北极点上，太阳在春分日升起、秋分日落下，一年中只有一次长达半年的白昼。'],
      },
      {
        title: ['The December solstice', '冬至日'],
        astro: { kit: 'rays', mode: 'daylen', dec: -OB },
        body: ['Six months later everything is reversed. On 21–22 December the South Pole leans towards the Sun, so northern days are short: about 10.6 h in Guangzhou, 9.2 h in Beijing and 8.5 h in Harbin, exactly 24 h minus their June day lengths. North of the Arctic Circle there is polar night, while south of the Antarctic Circle the Sun never sets and Sydney enjoys its longest days. The rule is simple: whichever hemisphere holds the subsolar point has days longer than nights, and the further towards its pole, the longer.', '半年后情况正好相反：12 月 21—22 日（冬至日），南极倾向太阳，北半球昼短夜长：广州约 10.6 小时，北京约 9.2 小时，哈尔滨约 8.5 小时，正好是 24 小时减去各自夏至日的昼长。北极圈以北出现极夜，南极圈以南出现极昼，悉尼迎来一年中最长的白昼。规律很简单：太阳直射点在哪个半球，哪个半球就昼长夜短，且越往该半球的极点白昼越长。'],
      },
      {
        title: ['Through the year', '一年中的变化'],
        astro: { kit: 'rays', mode: 'daylen', clock: { from: Y25, to: Y26, rate: 20, unit: 'date' } },
        task: ['Drag the date: watch the terminator swing as the subsolar point moves between the tropics.', '拖动日期：观察直射点在回归线之间移动时晨昏线的摆动。'],
        fig: dayFig,
        body: ['As the subsolar point travels between the tropics, day lengths change in step. While it moves north (December to June), northern days grow longer; while it moves south (June to December), they grow shorter, and at both equinoxes they pass through 12 hours. The higher the latitude, the bigger the swing: about 2.8 h between longest and shortest day in Guangzhou, 5.7 h in Beijing, 7 h in Harbin and a full 24 h north of the Arctic Circle; at the Equator nothing changes. Day lengths also change fastest around the equinoxes, by about 3 minutes a day in Beijing, and hardly at all around the solstices.', '随着直射点在南北回归线之间移动，各地昼长不断变化：直射点向北移动时（冬至到夏至），北半球昼渐长；向南移动时（夏至到冬至），北半球昼渐短；二分日都经过 12 小时。纬度越高，昼长的年变化越大：最长与最短白昼相差，广州约 2.8 小时，北京约 5.7 小时，哈尔滨约 7 小时，北极圈以北达 24 小时；赤道上终年不变。二分日前后昼长变化最快，北京每天约变化 3 分钟；二至日前后几乎不变。'],
      },
      {
        title: ['Working it out', '昼长的计算'],
        astro: { kit: 'rays', mode: 'daylen', dec: OB, lats: [{ lat: 39.9, name: ['Beijing', '北京'] }, { lat: -39.9, name: ['39.9°S', '南纬 39.9°'] }] },
        fig: dayBarFig,
        body: ['Day and night are symmetric about local noon, so day length = 2 × (12 − sunrise) = 2 × (sunset − 12), all in local solar time. In Beijing on 21 June the Sun rises at 04:35 local time: 2 × (12:00 − 04:35) = 2 × 7 h 25 min = 14 h 50 min, and sunset is at 12:00 + 7 h 25 min = 19:25. On the same day 39.9°S, the mirror-image latitude, has the mirror-image day: 24 − 14 h 50 min = 9 h 10 min. In Beijing Time the sunrise is 14 minutes later (Beijing lies 3.6° west of 120°E), about 04:50, and refraction lifts the Sun into view a few minutes early, so the published time is about 04:46.', '白昼以地方时 12 时为中心对称，所以昼长 = 2 ×（12 − 日出时刻）= 2 ×（日落时刻 − 12），都用地方时。6 月 21 日北京地方时 4:35 日出：2 ×（12:00 − 4:35）= 2 × 7 小时 25 分 = 14 小时 50 分，日落在 12:00 + 7 小时 25 分 = 19:25。同一天南纬 39.9° 的昼长正好与北京的夜长相等：24 − 14 小时 50 分 = 9 小时 10 分。换成北京时间，日出要晚约 14 分钟（北京在东经 120° 以西 3.6°），约 4:50；大气折射又使太阳提前几分钟露出地平线，所以日出表上是 4:46 左右。'],
      },
      {
        title: ['Why it happens: the tilt', '原因：地轴倾斜'],
        astro: { kit: 'model', kind: 'seasons', clock: { from: Y25, to: Y26, rate: 20, unit: 'date' } },
        body: ['As the Earth orbits the Sun its axis keeps pointing the same way in space, towards Polaris, tilted 66.56° to the plane of its orbit. In June the northern half leans sunward, in December the southern half, and at the equinoxes neither does. That one fact moves the subsolar point between the tropics, and with it the noon Sun\'s altitude, the day length and the seasons. The Earth is actually closest to the Sun in early January, during the northern winter, which shows that distance is not what makes the seasons.', '地球绕太阳公转时，地轴的空间指向保持不变，北端始终指向北极星附近，与公转轨道面成 66.56° 夹角。6 月北半球倾向太阳，12 月南半球倾向太阳，春分、秋分时两者都不倾向太阳。正是这一点使太阳直射点在南北回归线之间移动，从而带来正午太阳高度、昼夜长短的变化和四季更替。地球在 1 月初距太阳最近，那时北半球却是冬季，可见季节并不是由日地距离决定的。'],
      },
      {
        title: ['Lab: any place, any day', '实验：任何地方、任何日子'],
        task: ['Change the latitude and the date; watch whether the Sun\'s path dips below the horizon.', '改变纬度和日期，观察太阳的视运动路径是否落到地平线以下。'],
        astro: {
          kit: 'gnomon', mode: 'day', clock: { from: 0, to: 24, rate: 1.2, unit: 'hour', fmt: ['Solar time', '地方时'], at: 0.5 },
          params: [
            { id: 'lat', name: ['Latitude', '纬度'], min: 0, max: 80, value: 40, step: 0.5, fmt: ['{v}°N', '北纬 {v}°'], dp: 1 },
            { id: 'day', name: ['Date (day of the year)', '日期（一年中的第几天）'], min: 1, max: 365, value: 172, step: 1, fmt: ['day {v}', '第 {v} 天'] },
          ],
          tasks: [
            { text: ['Make the Sun stay up all day: polar day.', '让太阳整天不落：极昼。'], done: p => p.lat + decOfDay(p.day) >= 90.3 },
            { text: ['Make the Sun stay down all day: polar night.', '让太阳整天不升起：极夜。'], done: p => p.lat - decOfDay(p.day) >= 90.3 },
            { text: ['Find a day when day and night are equal everywhere.', '找到全球昼夜等长的一天。'], done: p => Math.abs(decOfDay(p.day)) <= 0.4 },
          ],
        },
        body: ['The Sun\'s daily path is a circle tilted to the horizon; how much of it lies above the horizon is the day length. At 40°N on day 172 (the June solstice) about 62% of the path is above the horizon, 14.8 hours; on day 355 (the December solstice) only 38%, 9.2 hours. Move north past 90° − δ and the whole circle clears the horizon: polar day. Day 79 or 266 (the equinoxes) splits every path exactly in half, wherever you stand.', '太阳一天的视运动路径是一个与地平面斜交的圆，它在地平线以上的部分越多，白昼越长。北纬 40° 第 172 天（夏至）约 62% 的路径在地平线以上，昼长约 14.8 小时；第 355 天（冬至）只有约 38%，昼长约 9.2 小时。纬度高于 90° − δ 时整个路径都在地平线以上，出现极昼。第 79 天或第 266 天（春分、秋分）无论在哪里，路径都被地平线平分。'],
      },
    ],
    quiz: [
      { q: ['On this day, tap the region that has polar day.', '这一天，点出出现极昼的区域。'], astro: { kit: 'rays', mode: 'daylen', dec: OB }, pick: 'polarday',
        why: ['With the subsolar point at 23.44°N, everywhere north of the Arctic Circle (66.56°N) is lit all day.', '直射点在 23.44°N 时，北极圈（66.56°N）以北全天都在昼半球，出现极昼。'] },
      { q: ['On the March equinox, how long is the day in Harbin?', '春分日，哈尔滨的昼长约是'], options: [['12 hours', '12 小时'], ['15.5 hours', '15.5 小时'], ['8.5 hours', '8.5 小时'], ['24 hours', '24 小时']], answer: 0,
        why: ['At the equinoxes the terminator passes through the poles and halves every latitude circle, so even Harbin has 12 hours.', '春分、秋分日晨昏线通过两极，平分所有纬线圈，全球昼夜等长，哈尔滨也是 12 小时。'] },
      { q: ['Put these places in order of day length on 21 June, longest first.', '按 6 月 21 日的昼长从长到短排列这些地点。'],
        order: [['Mohe 53.5°N', '漠河 53.5°N'], ['Harbin 45.8°N', '哈尔滨 45.8°N'], ['Beijing 39.9°N', '北京 39.9°N'], ['Guangzhou 23.1°N', '广州 23.1°N'], ['Singapore 1.3°N', '新加坡 1.3°N']],
        why: ['The subsolar point is in the north, so northern days are longer than 12 h, and the further north, the longer: about 16.8, 15.5, 14.8, 13.4 and 12.1 hours.', '直射点在北半球，北半球昼长夜短，纬度越高昼越长：约 16.8、15.5、14.8、13.4、12.1 小时。'] },
      { q: ['At a place the Sun rises at 05:00 local solar time. How many hours long is the day?', '某地日出时间为地方时 5 时，该地昼长为多少小时？'], num: { answer: 14, tol: 0.05, unit: ['hours', '小时'] },
        why: ['The day is symmetric about local noon: 12 − 5 = 7 hours before noon, so 2 × 7 = 14 hours, with sunset at 19:00.', '白昼以地方时 12 时为中心对称：日出到正午 7 小时，昼长 = 2 × 7 = 14 小时，日落在 19 时。'] },
      { q: ['On 21 June Beijing (39.9°N) has a 14.8-hour day. How many hours of daylight are there at 39.9°S on the same day?', '6 月 21 日北京（39.9°N）昼长约 14.8 小时。同一天南纬 39.9° 的昼长是多少小时？'], num: { answer: 9.2, tol: 0.15, unit: ['hours', '小时'] },
        why: ['Latitudes the same distance north and south have mirror-image days: the day at 39.9°S equals the night at 39.9°N, 24 − 14.8 = 9.2 hours.', '南北纬度数相同的两地昼夜长短正好相反：南纬 39.9° 的昼长等于北京的夜长，24 − 14.8 = 9.2 小时。'] },
      { q: ['Which are true on the December solstice? Pick all.', '冬至日，下列说法正确的是（多选）'], options: [['Harbin\'s day is shorter than Guangzhou\'s', '哈尔滨的白昼比广州短'], ['South of the Antarctic Circle the Sun never sets', '南极圈以南出现极昼'], ['Sydney\'s day is longer than 12 hours', '悉尼昼长超过 12 小时'], ['The terminator passes through both poles', '晨昏线通过南北两极'], ['The Equator\'s day is shorter than 12 hours', '赤道上昼短夜长']], multi: [0, 1, 2],
        why: ['The subsolar point is at 23.44°S: southern days are long (Sydney about 14.4 h, polar day round the South Pole), northern days short and shorter further north. Only at the equinoxes does the terminator pass through the poles, and the Equator always has 12 hours.', '冬至日直射点在 23.44°S：南半球昼长夜短（悉尼约 14.4 小时，南极圈以南极昼），北半球昼短夜长且纬度越高昼越短。只有二分日晨昏线才通过两极；赤道终年昼夜等长。'] },
      { q: ['Match each date with what happens in the Northern Hemisphere.', '把日期和北半球的昼夜情况连起来。'],
        match: [
          [['21 March', '3 月 21 日'], ['Day and night equal everywhere; days now growing', '全球昼夜等长，此后昼渐长']],
          [['1 May', '5 月 1 日'], ['Days longer than nights and still growing', '昼长夜短，且昼仍在变长']],
          [['21 June', '6 月 21 日'], ['Longest day; polar day north of the Arctic Circle', '白昼最长，北极圈以北极昼']],
          [['23 September', '9 月 23 日'], ['Day and night equal; days now shrinking', '昼夜等长，此后昼渐短']],
          [['22 December', '12 月 22 日'], ['Shortest day; polar night north of the Arctic Circle', '白昼最短，北极圈以北极夜']],
        ],
        why: ['The subsolar point crosses the Equator northward in March, reaches 23.44°N in June, crosses southward in September and reaches 23.44°S in December; on 1 May it is at about 15°N and still moving north.', '直射点 3 月向北越过赤道，6 月到达 23.44°N，9 月向南越过赤道，12 月到达 23.44°S；5 月 1 日直射点约在 15°N，仍在向北移动。'] },
      { q: ['When the subsolar point is at 10°N, where is there polar day?', '太阳直射点位于 10°N 时，出现极昼的范围是'], options: [['North of 80°N', '80°N 以北'], ['North of 66.56°N', '66.56°N 以北'], ['South of 80°S', '80°S 以南'], ['North of 10°N', '10°N 以北']], answer: 0,
        why: ['The terminator touches the latitude 90° − δ = 80° on the sunlit side, so polar day covers 80°N–90°N (and polar night 80°S–90°S).', '晨昏线与 90° − δ = 80° 的纬线相切，所以 80°N 以北出现极昼（80°S 以南出现极夜）。'] },
    ],
  },
];
