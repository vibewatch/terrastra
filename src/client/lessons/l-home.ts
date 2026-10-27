/**
 * "Where I live": a lesson made from the learner's own place (picked on the globe or from the device's location).
 * Its coordinates, hemispheres and temperature zone, its time against Beijing time, the noon Sun and day length
 * through the year, its climate and vegetation, and what the globe shows nearby.
 */
import { BIOMES, CLIMATES, type Climate } from './climate.ts';
import { svg, tx, arrowDef, type Lx } from './figs.ts';
import { haversineKm } from '../../shared/lib/geo.ts';
import { CATALOGUE } from '../../shared/data/catalogue.ts';
import { C, mer, mk, par, T, type Home, type Lesson, type LL, type Pair, type Quiz, type Step } from './kit.ts';

const TILT = 23.44;
const r1 = (v: number) => Math.round(v * 10) / 10;
const deg = (v: number, pos: Pair, neg: Pair): Pair => [`${Math.abs(r1(v))}°${v >= 0 ? pos[0] : neg[0]}`, `${v >= 0 ? pos[1] : neg[1]}${Math.abs(r1(v))}°`];
const latTxt = (v: number) => deg(v, ['N', '北纬'], ['S', '南纬']);
const lonTxt = (v: number) => deg(v, ['E', '东经'], ['W', '西经']);
const wrap = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

/** Noon Sun altitude (°) at latitude `lat` when the overhead Sun is at `dec` (0 below the horizon). */
const noonAlt = (lat: number, dec: number) => Math.max(0, 90 - Math.abs(lat - dec));
/** Day length (hours) from the sunrise equation (no refraction). */
function dayHours(lat: number, dec: number): number {
  const c = -Math.tan((lat * Math.PI) / 180) * Math.tan((dec * Math.PI) / 180);
  return c <= -1 ? 24 : c >= 1 ? 0 : (2 * Math.acos(c) * 180) / Math.PI / 15;
}
const hm = (h: number): Pair => {
  const m = Math.round(h * 60), hh = Math.floor(m / 60), mm = m % 60;
  return [`${hh} h ${String(mm).padStart(2, '0')} min`, `${hh} 小时 ${mm} 分`];
};

type Zone = 'tropic' | 'ntemp' | 'stemp' | 'nfrigid' | 'sfrigid';
const ZONES: Record<Zone, Pair> = {
  tropic: ['Tropical zone', '热带'], ntemp: ['North temperate zone', '北温带'], stemp: ['South temperate zone', '南温带'],
  nfrigid: ['North frigid zone', '北寒带'], sfrigid: ['South frigid zone', '南寒带'],
};
const zoneOf = (lat: number): Zone => Math.abs(lat) < TILT ? 'tropic' : lat >= 90 - TILT ? 'nfrigid' : lat <= TILT - 90 ? 'sfrigid' : lat > 0 ? 'ntemp' : 'stemp';
const ZONE_BAND: Record<Zone, [number, number]> = { tropic: [-TILT, TILT], ntemp: [TILT, 90 - TILT], stemp: [TILT - 90, -TILT], nfrigid: [90 - TILT, 90], sfrigid: [-90, TILT - 90] };
const ZONE_WHY: Record<Zone, Pair> = {
  tropic: ['the Sun is overhead at noon twice a year, so it is hot all year', '一年有两次太阳直射，终年炎热'],
  ntemp: ['the Sun is never overhead and there is no polar day, so the four seasons are distinct', '既没有太阳直射，也没有极昼极夜，四季分明'],
  stemp: ['the Sun is never overhead and there is no polar day, so the four seasons are distinct', '既没有太阳直射，也没有极昼极夜，四季分明'],
  nfrigid: ['there are polar days and polar nights, and it is cold all year', '有极昼极夜现象，终年寒冷'],
  sfrigid: ['there are polar days and polar nights, and it is cold all year', '有极昼极夜现象，终年寒冷'],
};
/** In the textbook the Eastern and Western Hemispheres are split along 20°W and 160°E (so no country is cut in two). */
const eastHemi = (lon: number) => lon >= -20 && lon < 160;

const CLIMATE_NOTE: Record<Climate, Pair> = {
  rainforest: ['hot and wet all year, with rain almost every afternoon', '全年高温多雨，午后常有对流雨'],
  tmonsoon: ['hot all year, with a dry season and a very wet monsoon season', '全年高温，分旱季和雨季，雨季降水特别多'],
  savanna: ['hot all year, with a wet season and a long dry season', '全年高温，有明显的干季和湿季'],
  desert: ['hot and very dry all year', '全年炎热干燥，降水稀少'],
  med: ['hot dry summers and mild wet winters', '夏季炎热干燥，冬季温和多雨'],
  smonsoon: ['hot wet summers and mild, drier winters', '夏季高温多雨，冬季温和少雨'],
  maritime: ['mild all year, with rain spread evenly through the seasons', '冬无严寒、夏无酷暑，全年降水均匀'],
  tmonsoon2: ['hot wet summers and cold dry winters', '夏季高温多雨，冬季寒冷干燥'],
  continental: ['big seasonal swings and little rain', '冬冷夏热，气温年较差大，降水少'],
  subarctic: ['long, very cold winters and short cool summers', '冬季漫长严寒，夏季短暂凉爽'],
  tundra: ['cold all year; only the top of the ground thaws in summer', '终年寒冷，夏季只有地表解冻'],
  icecap: ['frozen all year, under thick ice', '终年严寒，被厚厚的冰雪覆盖'],
  highland: ['cool because it is high: the air gets colder by about 0.6 °C every 100 m up', '海拔高，气温低；海拔每升高 100 米，气温约下降 0.6℃'],
};

/** The noon Sun at the solstices and equinoxes, drawn over the horizon. */
function noonFig(lat: number): (L: Lx, id: string) => string {
  const days: [Pair, number, string][] = [[['June solstice', '夏至'], TILT, C.orange], [['Equinoxes', '春分、秋分'], 0, C.gold], [['December solstice', '冬至'], -TILT, C.blue]];
  return (L, id) => {
    const W = 300, H = 150, ox = 150, oy = 128, R = 104;
    // the noon Sun is in the south for places north of the overhead point, in the north otherwise
    const rays = days.map(([n, dec, c], j) => {
      const a = noonAlt(lat, dec), south = lat >= dec, rad = (a * Math.PI) / 180;
      const x = ox + (south ? -1 : 1) * R * Math.cos(rad), y = oy - R * Math.sin(rad);
      const lx = ox + (south ? -1 : 1) * (R + 8) * Math.cos(rad), ly = oy - (R + 8) * Math.sin(rad);
      return a <= 0
        ? tx(ox, 20 + j * 11, `${L(n)}: ${L(['below the horizon', '在地平线下'])}`, 'fg-sub', 'm')
        : `<line x1="${x}" y1="${y}" x2="${ox}" y2="${oy}" stroke="${c}" stroke-width="2" marker-end="url(#${id}a)"/>` +
          `<circle cx="${x}" cy="${y}" r="5" fill="${c}"/>` + tx(lx, ly - 4, `${L(n)} ${r1(a)}°`, 'fg-label', south ? 'e' : 's', ` style="fill:${c}"`);
    }).join('');
    return svg(W, H, arrowDef(id + 'a', '#ced4da') +
      `<line x1="16" y1="${oy}" x2="${W - 16}" y2="${oy}" stroke="#868e96" stroke-width="1.5"/>` +
      `<rect x="${ox - 3}" y="${oy - 16}" width="6" height="16" fill="#ced4da"/>` +
      tx(18, oy + 14, L(['S', '南']), 'fg-tick') + tx(W - 18, oy + 14, L(['N', '北']), 'fg-tick', 'e') +
      tx(ox, oy + 14, L(['you', '你的位置']), 'fg-tick', 'm') + rays,
    L(['Noon Sun altitude through the year', '一年中正午太阳高度的变化']));
  };
}

function build(home: Home): { steps: Step[]; quiz: Quiz[] } {
  const [lat, lon] = home.ll;
  const here: LL = [r1(lat), r1(lon)];
  const name: Pair | null = home.country ? home.country.name : null;
  const homeMark = { ll: here, text: ['You', '你在这里'] as Pair, dot: true, big: true, c: C.gold };

  // hemispheres and zone
  const ns: Pair = lat >= 0 ? ['Northern', '北'] : ['Southern', '南'], ew: Pair = eastHemi(lon) ? ['Eastern', '东'] : ['Western', '西'];
  const zone = zoneOf(lat), [zs, zn] = ZONE_BAND[zone];

  // time: the standard time zone, and how far local solar time is from Beijing time (120°E)
  const tz = Math.round(lon / 15), cm = tz * 15;
  const tzTxt = `UTC${tz >= 0 ? '+' : '−'}${Math.abs(tz)}`;
  const vsBJ = Math.round((lon - 120) * 4);
  const vsTxt: Pair = vsBJ === 0 ? ['exactly Beijing time', '与北京时间相同'] : [
    `${Math.abs(vsBJ)} minutes ${vsBJ > 0 ? 'ahead of' : 'behind'} Beijing time`,
    `比北京时间${vsBJ > 0 ? '早' : '晚'} ${Math.abs(vsBJ)} 分钟`];

  // the Sun through the year
  const hs = noonAlt(lat, TILT), he = noonAlt(lat, 0), hw = noonAlt(lat, -TILT);
  const ds = dayHours(lat, TILT), dw = dayHours(lat, -TILT);
  const hot = lat >= 0 ? hs : hw;

  // nearby: the three closest places and animals on the globe
  const near = CATALOGUE.filter(i => i.type === 'landmark' || i.type === 'animal')
    .map(i => ({ i, km: haversineKm(lat, lon, i.lat, i.lon) })).sort((a, b) => a.km - b.km).slice(0, 3);
  const nearTxt: Pair = [near.map(n => `${n.i.name.en} (${Math.round(n.km).toLocaleString('en-US')} km)`).join(', '),
    near.map(n => `${n.i.name.zh ?? n.i.name.en}（${Math.round(n.km)} 千米）`).join('、')];

  const steps: Step[] = [
    {
      title: ['Your address on the globe', '你在地球上的“地址”'],
      body: [
        `You are at ${latTxt(lat)[0]}, ${lonTxt(lon)[0]}, ${name ? `in ${name[0]}` : 'out at sea'}. Your parallel (gold) runs all the way round the Earth; your meridian (blue) runs from pole to pole. Where they cross is your place — no other spot has the same pair of numbers.`,
        `你的位置是${latTxt(lat)[1]}、${lonTxt(lon)[1]}，${name ? `位于${name[1]}` : '在海洋上'}。金色的是你所在的纬线，它绕地球一圈；蓝色的是你所在的经线，连接南北两极。两条线的交点就是你的位置，地球上没有第二个地方有同样的经纬度。`],
      task: ['Turn the globe along your gold parallel: which other countries share your latitude?', '沿着金色纬线转动地球：还有哪些国家和你在同一纬度上？'],
      cam: [here[0], here[1], 2.6], wide: true, graticule: true, names: true, borders: true,
      lines: [par(here[0], C.gold, 0.2), mer(here[1], C.blue, 0.6), par(0, 'rgba(241,243,245,.55)', 1.2, { w: 0.7 })],
      marks: [homeMark],
    },
    {
      title: ['Your hemispheres', '你在哪个半球'],
      body: [
        `North or south is set by the Equator: you are in the ${ns[0]} Hemisphere. East or west is set by 20°W and 160°E (so that no country in Europe or Africa is cut in two): you are in the ${ew[0]} Hemisphere.`,
        `南北半球以赤道为界：你在${ns[1]}半球。东西半球以 20°W 和 160°E 组成的经线圈为界（避免把欧洲、非洲的一些国家分在两个半球）：你在${ew[1]}半球。`],
      cam: [here[0], here[1], 3.4], wide: true, graticule: true,
      paint: [{ fill: { k: 'band', s: lat >= 0 ? 0 : -90, n: lat >= 0 ? 90 : 0, c: 'rgba(77,171,247,.22)' } },
        { fill: eastHemi(lon) ? { k: 'strip', w: -20, e: 160, c: 'rgba(255,210,74,.18)' } : { k: 'strip', w: 160, e: -20, c: 'rgba(255,210,74,.18)' }, t: 1 }],
      lines: [par(0, C.white, 0.2), mer(-20, C.gold, 1), mer(160, C.gold, 1.2)],
      marks: [homeMark, mk([0, wrap(here[1] + 25)], 'Equator', '赤道', { c: C.white, t: 0.8 }),
        mk([30, -20], '20°W', '西经 20°', { c: C.gold, t: 1.4 }), mk([30, 160], '160°E', '东经 160°', { c: C.gold, t: 1.6 })],
    },
    {
      title: ['Your temperature zone', '你所在的温度带'],
      body: [
        `The tropics (23.5°) and the polar circles (66.5°) split the Earth into five zones by how much heat they get from the Sun. Your latitude puts you in the ${ZONES[zone][0].toLowerCase()}: ${ZONE_WHY[zone][0]}.`,
        `回归线（23.5°）和极圈（66.5°）按获得太阳光热的多少，把地球表面分成五带。你所在的纬度属于${ZONES[zone][1]}：${ZONE_WHY[zone][1]}。`],
      cam: [here[0], here[1], 3.6], wide: true,
      paint: [{ fill: { k: 'band', s: zs, n: zn, c: zone === 'tropic' ? 'rgba(255,107,107,.3)' : zone.endsWith('temp') ? 'rgba(81,207,102,.26)' : 'rgba(165,216,255,.34)' } }],
      lines: [par(TILT, C.orange, 0.3, { w: 0.8 }), par(-TILT, C.orange, 0.4, { w: 0.8 }), par(90 - TILT, C.ice, 0.5, { w: 0.8 }), par(TILT - 90, C.ice, 0.6, { w: 0.8 })],
      marks: [homeMark, mk([zs + (zn - zs) / 2, wrap(here[1] + 40)], ...ZONES[zone], { c: C.white, big: true, t: 0.8 })],
    },
    {
      title: ['Your time', '你的时间'],
      body: [
        `The Earth turns 15° an hour, so places further east see the Sun earlier: 4 minutes for every degree. By longitude you belong to the time zone ${tzTxt} (central meridian ${lonTxt(cm)[0]}), and the Sun's own time where you are is ${vsTxt[0]} (Beijing time is the local time of 120°E).`,
        `地球每小时自转 15°，越往东的地方越早看到日出：经度每差 1°，地方时相差 4 分钟。按经度你属于${tz === 8 ? '东八区' : `${tzTxt} 时区`}（中央经线${lonTxt(cm)[1]}）；你那里的地方时${vsTxt[1]}（北京时间是 120°E 的地方时）。`],
      task: ['Watch the line between day and night sweep over you as the clock runs.', '看着时钟走动：晨昏线什么时候扫过你的位置？'],
      cam: [here[0], here[1], 3.2], wide: true, night: true, sun: true,
      clock: { mode: 'day', start: T.dawnBeijing, rate: 1.5, span: 24 },
      paint: [{ fill: { k: 'strip', w: wrap(cm - 7.5), e: wrap(cm + 7.5), c: 'rgba(177,151,252,.25)' } }],
      lines: [mer(cm, C.violet, 0.3, { w: 0.8 }), ...(Math.abs(lon - 120) > 1 ? [mer(120, C.red, 0.6, { w: 0.8 })] : [])],
      marks: [homeMark, mk([Math.max(-60, Math.min(60, here[0] - 12)), wrap(cm)], `zone ${tzTxt}`, `${tzTxt} 时区`, { c: C.violet, t: 0.6 }),
        ...(Math.abs(lon - 120) > 1 ? [mk([here[0] > 40 ? 30 : here[0] + 14, 120], 'Beijing time (120°E)', '北京时间（120°E）', { c: C.red, t: 0.9 })] : [])],
    },
    {
      title: ['The Sun over your year', '你那里一年中的太阳'],
      body: [
        `As the overhead Sun moves between the tropics, your noon Sun climbs and sinks: ${r1(hs)}° at the June solstice, ${r1(he)}° at the equinoxes, ${r1(hw)}° at the December solstice. Days last about ${hm(ds)[0]} in June and ${hm(dw)[0]} in December.`,
        `太阳直射点在南北回归线之间移动，你那里的正午太阳高度也随之变化：夏至日 ${r1(hs)}°，春分、秋分日 ${r1(he)}°，冬至日 ${r1(hw)}°。夏至日昼长约 ${hm(ds)[1]}，冬至日约 ${hm(dw)[1]}。`],
      task: ['Let the year run and watch the overhead Sun move north and south of you.', '让一年的时间走起来，看太阳直射点在你的南北来回移动。'],
      cam: [here[0], here[1], 3.4], wide: true, night: true, sun: true,
      clock: { mode: 'year', start: Date.UTC(2025, 2, 20, 12) - (lon / 15) * 36e5, rate: 30, span: 365 },
      lines: [par(TILT, C.orange, 0.2, { w: 0.8 }), par(-TILT, C.orange, 0.3, { w: 0.8 }), par(here[0], C.gold, 0.5, { w: 0.7 })],
      marks: [homeMark],
      fig: { k: 'svg', draw: noonFig(lat) },
    },
    home.climate ? {
      title: ['Your climate and vegetation', '你那里的气候和植被'],
      body: [
        `On the textbook climate map you are in the ${CLIMATES[home.climate].name[0].toLowerCase()} climate: ${CLIMATE_NOTE[home.climate][0]}. The natural vegetation that goes with it is ${BIOMES[home.biome ?? 'grassland'].name[0].toLowerCase()} — though farms and towns may have replaced much of it.`,
        `在课本的世界气候类型图上，你那里属于${CLIMATES[home.climate].name[1]}：${CLIMATE_NOTE[home.climate][1]}。与之对应的自然植被是${BIOMES[home.biome ?? 'grassland'].name[1]}，不过很多地方已经被农田和城镇取代了。`],
      sketch: true,
      cam: [here[0], here[1], 2.6], wide: true, borders: true,
      paint: [{ fill: { k: 'climate', only: [home.climate] }, a: 0.85 }],
      marks: [homeMark],
      fig: { k: 'key', set: 'climate', only: [home.climate] },
    } : {
      title: ['Out at sea', '在海洋上'],
      body: [
        'You picked a point on the ocean. Sea water warms and cools slowly, so places at sea (and on nearby coasts) have milder seasons than places deep inside a continent at the same latitude.',
        '你选的位置在海洋上。海水升温慢、降温也慢，所以海洋上（以及沿海地区）的气温年较差比同纬度的大陆内部小。'],
      cam: [here[0], here[1], 3], wide: true,
      paint: [{ fill: { k: 'oceans' }, a: 0.7 }],
      marks: [homeMark],
    },
    {
      title: ['Near you on the globe', '你附近有什么'],
      body: [
        `The nearest places and animals in this globe's collection: ${nearTxt[0]}. Explore them after the lesson.`,
        `在这个地球仪收录的地点和动物中，离你最近的是：${nearTxt[1]}。下课后可以去看看。`],
      cam: [here[0], here[1], 1.6], borders: true, names: true,
      items: near.map(n => n.i.key),
      marks: [homeMark],
    },
  ];

  const hemiOpts: Pair[] = ([[true, true], [true, false], [false, true], [false, false]] as const).map(([n, e]) => [
    `${n ? 'Northern' : 'Southern'} and ${e ? 'Eastern' : 'Western'}`, `${n ? '北' : '南'}半球和${e ? '东' : '西'}半球`]);
  const hemiAns = (lat >= 0 ? 0 : 2) + (eastHemi(lon) ? 0 : 1);
  const zoneKeys = Object.keys(ZONES) as Zone[];
  const antipode: LL = [-here[0], wrap(here[1] + 180)];
  const third: { text: Pair; at: LL; tolKm: number } = Math.abs(lat) > 8
    ? { text: lat > 0 ? ['The Equator due south of you', '你正南方的赤道上'] : ['The Equator due north of you', '你正北方的赤道上'], at: [0, here[1]], tolKm: 700 }
    : { text: ['Your parallel, 90° of longitude to the east', '沿你的纬线向东 90° 的地方'], at: [here[0], wrap(here[1] + 90)], tolKm: 800 };

  const quiz: Quiz[] = [
    { q: ['Which hemispheres are you in?', '你在哪两个半球？'], options: [hemiOpts[hemiAns], ...hemiOpts.filter((_, j) => j !== hemiAns)], answer: 0,
      why: ['North/south is split by the Equator, east/west by 20°W and 160°E.', '南北半球以赤道为界；东西半球以 20°W 和 160°E 组成的经线圈为界。'] },
    { q: ['Which temperature zone are you in?', '你在哪个温度带？'], options: [ZONES[zone], ...zoneKeys.filter(z => z !== zone).slice(0, 3).map(z => ZONES[z])], answer: 0,
      why: [`Your latitude is ${latTxt(lat)[0]}; the tropics are at 23.5° and the polar circles at 66.5°.`, `你的纬度是${latTxt(lat)[1]}；回归线在 23.5°，极圈在 66.5°。`] },
    { q: [`Work it out: the noon Sun altitude where you live at the ${lat >= 0 ? 'June' : 'December'} solstice (H = 90° − |your latitude − latitude of the overhead Sun|).`,
      `算一算：${lat >= 0 ? '夏至日（6 月）' : '冬至日（12 月）'}你那里的正午太阳高度是多少度？（H = 90° − |当地纬度 − 太阳直射点纬度|）`],
      num: { answer: r1(hot), tol: 1.5, unit: ['°', '°'] },
      why: [`90° − |${r1(lat)} − (${lat >= 0 ? 23.4 : -23.4})| ≈ ${r1(hot)}°.`, `正午太阳高度 = 90° − |${r1(lat)} − (${lat >= 0 ? 23.4 : -23.4})| ≈ ${r1(hot)}°。`] },
    { q: ['How many minutes apart are your local solar time and Beijing time (the local time of 120°E)?', '你那里的地方时与北京时间（120°E 的地方时）相差多少分钟？'],
      num: { answer: Math.abs(vsBJ), tol: 6, unit: ['minutes', '分钟'] },
      why: [`Every degree of longitude is 4 minutes: |${r1(lon)} − 120| × 4 ≈ ${Math.abs(vsBJ)} minutes.`, `经度每差 1°，地方时相差 4 分钟：|${r1(lon)} − 120| × 4 ≈ ${Math.abs(vsBJ)} 分钟。`] },
    { q: [`Label the map: your home, your antipode (the point exactly on the other side of the Earth) and ${third.text[0].toLowerCase()}.`, `在地图上标注：你的家、你的对跖点（地球另一侧正对着你的地方），以及${third.text[1]}的那个点。`],
      place: [{ text: ['Your home', '你的家'], at: here, tolKm: 300 }, { text: ['Your antipode', '你的对跖点'], at: antipode, tolKm: 1000 }, third],
      why: [`The antipode has the opposite latitude and a longitude 180° away: ${latTxt(antipode[0])[0]}, ${lonTxt(antipode[1])[0]}.`, `对跖点的纬度数值相同、南北相反，经度相差 180°：${latTxt(antipode[0])[1]}、${lonTxt(antipode[1])[1]}。`] },
  ];
  if (home.climate) {
    const others = (Object.keys(CLIMATES) as Climate[]).filter(c => c !== home.climate && c !== 'icecap' && c !== 'highland');
    const pick = [0, 4, 8].map(j => others[(j + home.climate!.length) % others.length]);
    quiz.splice(2, 0, {
      q: ['Which climate type is yours on the textbook map?', '在课本的气候类型图上，你那里属于哪种气候？'],
      options: [CLIMATES[home.climate].name, ...pick.map(c => CLIMATES[c].name)], answer: 0,
      why: [`${CLIMATES[home.climate].name[0]}: ${CLIMATE_NOTE[home.climate][0]}.`, `${CLIMATES[home.climate].name[1]}：${CLIMATE_NOTE[home.climate][1]}。`],
    });
  }
  return { steps, quiz };
}

export const HOME: Lesson[] = [{
  id: 'home', strand: 'maps', grade: 'g8b', tracks: ['uk', 'us', 'ib', 'au'], icon: 'pin', minutes: 10,
  unit: ['Local geography', '乡土地理'],
  title: ['Where I live', '我的家乡'],
  blurb: ['Your own place on the globe: its coordinates, time, Sun, climate and neighbours.', '在地球上找到你的家：经纬度、时间、太阳、气候和周边。'],
  keys: [
    ['Latitude and longitude give every place a unique address.', '经纬度可以确定地球上任何一个地方的位置。'],
    ['Local time changes by 4 minutes for every degree of longitude; Beijing time is the local time of 120°E.', '经度每相差 1°，地方时相差 4 分钟；北京时间是 120°E 的地方时。'],
    ['Your noon Sun is highest at your summer solstice and lowest at your winter solstice: H = 90° − |φ − δ|.', '正午太阳高度在当地夏至日最大、冬至日最小：H = 90° − |φ − δ|。'],
    ['Latitude, the sea and the land around you together decide your climate.', '纬度位置和海陆位置等共同决定了当地的气候。'],
  ],
  steps: [], quiz: [],
  build,
}];
