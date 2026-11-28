import type { CatalogueItem, I18n, Lang } from '../data/types.ts';
import { tr } from '../data/types.ts';
import { shuffle, pick } from '../lib/rng.ts';
import { CITIES, cityName } from '../data/cities.ts';
import { CONTINENT_NAMES } from '../data/iso.ts';
import { GAZETTEER, GAZETTEER_BY_KEY, type GazetteerEntry, type GeoKind } from '../data/gazetteer.ts';

export type QuizSet = 'mixed' | 'animals' | 'geo' | 'landmarks' | 'secrets';
export type QuizLevel = 'easy' | 'normal' | 'hard';
export const LEVEL_OPTIONS: Record<QuizLevel, number> = { easy: 2, normal: 3, hard: 5 };
export const QUIZ_SETS: QuizSet[] = ['mixed', 'animals', 'geo', 'landmarks', 'secrets'];

interface Question {
  id: string;
  set: Exclude<QuizSet, 'mixed'>;
  prompt: I18n;
  options: string[];
  answer: number;
  focus?: { lat: number; lon: number };
}

interface Ctx { items: CatalogueItem[]; lang: Lang; rnd: () => number; nOpts: number; country: (a2: string) => string }

type Template = { id: string; set: Question['set']; make: (c: Ctx) => Question | null };

function build(id: string, set: Question['set'], prompt: I18n, correct: string, wrongPool: string[], c: Ctx, focus?: Question['focus']): Question | null {
  const wrong = shuffle([...new Set(wrongPool.filter(w => w && w !== correct))], c.rnd).slice(0, c.nOpts - 1);
  if (wrong.length < c.nOpts - 1) return null;
  const options = shuffle([correct, ...wrong], c.rnd);
  return { id, set, prompt, options, answer: options.indexOf(correct), focus };
}

const by = (c: Ctx, type: CatalogueItem['type']) => c.items.filter(i => i.type === type);
const nm = (c: Ctx, i: CatalogueItem) => tr(i.name, c.lang);
const gzName = (g: GazetteerEntry, l: Lang) => g.name[l];
const gzPoolByKinds = (...kinds: GeoKind[]) => GAZETTEER.filter(g => kinds.includes(g.kind));

const WORLD_RECORDS: { key: GazetteerEntry['key']; kinds: readonly GeoKind[]; prompt: I18n }[] = [
  { key: 'geo:mariana-trench', kinds: ['trench', 'rift'], prompt: { en: 'Which is the deepest oceanic trench on Earth (~11,034 m)?', zh: '地球海洋最深的海沟（最深逾 1.1 万米）是哪一条？' } },
  { key: 'geo:andes', kinds: ['mountain'], prompt: { en: 'Which is the longest continental mountain range in the world?', zh: '世界上最长的陆上山脉（纵贯南美西岸）是哪座？' } },
  { key: 'geo:himalayas', kinds: ['mountain'], prompt: { en: 'Which is the highest mountain range on Earth?', zh: '世界平均海拔最高、拥有珠穆朗玛峰的山脉是哪座？' } },
  { key: 'geo:qinghai-tibet-plateau', kinds: ['plateau'], prompt: { en: 'Which plateau is the highest on Earth, known as the "Roof of the World"?', zh: '被称为“世界屋脊”的世界最高大高原是哪个？' } },
  { key: 'geo:brazilian-highlands', kinds: ['plateau'], prompt: { en: 'Which plateau covers the largest area in the world?', zh: '世界上面积最大的高原是哪一个？' } },
  { key: 'geo:amazon-plain', kinds: ['plain'], prompt: { en: 'Which is the largest plain on Earth, carpeted by equatorial rainforest?', zh: '世界上面积最大、分布着茂密热带雨林的平原是哪个？' } },
  { key: 'geo:sahara-desert', kinds: ['desert'], prompt: { en: 'Which is the largest hot desert in the world?', zh: '世界上面积最大的热带沙漠是哪一个？' } },
  { key: 'geo:nile-river', kinds: ['river'], prompt: { en: 'Which river is traditionally recognized as the longest in the world (~6,650 km)?', zh: '全长约 6650 千米、自南向北注入地中海的世界第一长河是哪条？' } },
  { key: 'geo:amazon-river', kinds: ['river'], prompt: { en: 'Which river has the largest water discharge and drainage basin on Earth?', zh: '世界流量最大、流域面积最广的河流是哪一条？' } },
  { key: 'geo:lake-baikal', kinds: ['lake'], prompt: { en: 'Which is the deepest freshwater lake on Earth (~1,642 m)?', zh: '世界上最深、蓄淡水量最多的淡水湖是哪个？' } },
  { key: 'geo:caspian-sea', kinds: ['lake'], prompt: { en: 'Which is the largest inland body of water (lake) on Earth by area?', zh: '位于亚欧交界处、世界面积最大的内陆湖泊（咸水湖）是哪个？' } },
  { key: 'geo:greenland', kinds: ['island'], prompt: { en: 'Which is the largest island on Earth (excluding continents)?', zh: '除大陆外，世界上面积最大的岛屿是哪座？' } },
  { key: 'geo:arabian-peninsula', kinds: ['peninsula'], prompt: { en: 'Which is the largest peninsula in the world?', zh: '世界上面积最大的半岛是哪一个？' } },
  { key: 'geo:red-sea', kinds: ['sea'], prompt: { en: 'Which sea has the highest surface salinity in the world?', zh: '世界上盐度最高的海域是哪一片？' } },
  { key: 'geo:baltic-sea', kinds: ['sea'], prompt: { en: 'Which sea has the lowest salinity in the world?', zh: '世界上盐度最低的海域是哪一片？' } },
  { key: 'geo:east-african-rift', kinds: ['rift', 'trench', 'mountain'], prompt: { en: 'Which vast tectonic feature is nicknamed "Earth’s great scar"?', zh: '素有“地球表面最大伤疤”之称的陆上最大断裂带是哪里？' } },
];

const WATERWAY_GATEWAYS: { key: GazetteerEntry['key']; prompt: I18n }[] = [
  { key: 'geo:strait-of-malacca', prompt: { en: 'Which strait between the Malay Peninsula and Sumatra is the shortest sea link from the Indian to the Pacific Ocean?', zh: '位于马来半岛与苏门答腊岛之间、沟通太平洋与印度洋的咽喉要道是？' } },
  { key: 'geo:strait-of-gibraltar', prompt: { en: 'Which strait divides Europe from Africa and links the Mediterranean Sea to the Atlantic Ocean?', zh: '作为欧洲与非洲分界线、沟通地中海与大西洋的天然通道是？' } },
  { key: 'geo:strait-of-hormuz', prompt: { en: 'Which strait links the Persian Gulf to the Arabian Sea and is called the "world’s oil valve"?', zh: '连接波斯湾与阿拉伯海、被称为“世界油阀”的海峡是？' } },
  { key: 'geo:bering-strait', prompt: { en: 'Which strait divides Asia from North America and links the Pacific and Arctic Oceans?', zh: '既是亚洲与北美洲分界线，又沟通太平洋与北冰洋的海峡是？' } },
  { key: 'geo:drake-passage', prompt: { en: 'Which is Earth’s widest and deepest strait, separating South America from Antarctica?', zh: '分隔南美洲与南极洲、世界上最宽最深的海峡是？' } },
  { key: 'geo:suez-canal', prompt: { en: 'Which canal divides Asia from Africa and links the Mediterranean Sea directly to the Red Sea?', zh: '作为亚非两洲分界线、直接沟通地中海与红海的人工运河是？' } },
  { key: 'geo:panama-canal', prompt: { en: 'Which lock canal divides North and South America and links the Atlantic and Pacific Oceans?', zh: '作为南北美洲分界线、沟通太平洋和大西洋的水闸式运河是？' } },
  { key: 'geo:grand-canal', prompt: { en: 'Which ancient canal in China is the longest artificial waterway in the world, linking five major river basins?', zh: '贯通海河、黄河、淮河、长江、钱塘江五大水系的世界最长古运河是？' } },
];

const CHINA_GEO_ITEMS: { key: GazetteerEntry['key']; kinds: readonly GeoKind[]; prompt: I18n }[] = [
  { key: 'geo:qinling', kinds: ['mountain'], prompt: { en: 'Which east–west mountain range forms China’s primary north–south geographic divide (Jan 0°C isotherm & 800 mm isohyet)?', zh: '与淮河共同构成我国南北方地理分界线（1月 0°C 等温线、800mm 等降水量线经过）的山脉是？' } },
  { key: 'geo:tarim-basin', kinds: ['basin'], prompt: { en: 'Which is China’s largest inland basin, lying between the Tianshan and Kunlun Mountains?', zh: '位于天山与昆仑山之间、我国面积最大的内陆盆地是？' } },
  { key: 'geo:qaidam-basin', kinds: ['basin'], prompt: { en: 'Which basin on the Qinghai–Tibet Plateau is China’s highest and nicknamed the "Treasure Bowl"?', zh: '位于青藏高原东北部、海拔最高且素有“聚宝盆”之称的盆地是？' } },
  { key: 'geo:northeast-china-plain', kinds: ['plain'], prompt: { en: 'Which is China’s largest plain, renowned for its fertile black soil?', zh: '黑土广布、沃野千里，我国面积最大的平原是？' } },
  { key: 'geo:loess-plateau', kinds: ['plateau'], prompt: { en: 'Which Chinese plateau is famous for deep wind-blown silt deposits and a landscape of thousands of gullies?', zh: '水土流失治理重点区、呈现“千沟万壑、支离破碎”地貌特征的高原是？' } },
  { key: 'geo:yunnan-guizhou-plateau', kinds: ['plateau'], prompt: { en: 'Which Chinese plateau is renowned for dramatic karst stone forests, caves, and underground rivers?', zh: '石灰岩广布，峰林、溶洞、暗河等喀斯特地貌最典型的高原是？' } },
  { key: 'geo:poyang-lake', kinds: ['lake'], prompt: { en: 'Which lake in Jiangxi Province is China’s largest freshwater lake?', zh: '位于江西省北部、我国面积最大的淡水湖是？' } },
  { key: 'geo:qinghai-lake', kinds: ['lake'], prompt: { en: 'Which lake is China’s largest inland saltwater lake?', zh: '我国面积最大的内陆咸水湖是？' } },
];

const FEATURE_CONTINENTS: [GazetteerEntry['key'], Exclude<CatalogueItem['continent'], 'ocean' | 'antarctica'>][] = [
  ['geo:andes', 'south-america'],
  ['geo:rocky-mountains', 'north-america'],
  ['geo:alps', 'europe'],
  ['geo:atlas-mountains', 'africa'],
  ['geo:great-dividing-range', 'oceania'],
  ['geo:himalayas', 'asia'],
  ['geo:sahara-desert', 'africa'],
  ['geo:congo-basin', 'africa'],
  ['geo:amazon-plain', 'south-america'],
  ['geo:brazilian-highlands', 'south-america'],
  ['geo:mississippi-river', 'north-america'],
  ['geo:danube-river', 'europe'],
  ['geo:nile-river', 'africa'],
  ['geo:lake-victoria', 'africa'],
  ['geo:great-victoria-desert', 'oceania'],
];

const TEMPLATES: Template[] = [
  { id: 'lm_country', set: 'landmarks', make: c => {
    const lms = by(c, 'landmark').filter(i => i.country); const it = pick(lms, c.rnd);
    return build('lm_country', 'landmarks', { en: `In which country is ${tr(it.name, 'en')}?`, zh: `${tr(it.name, 'zh')}在哪个国家？` },
      c.country(it.country!), lms.map(l => c.country(l.country!)), c, it);
  } },
  { id: 'lm_tallest', set: 'landmarks', make: c => {
    const lms = shuffle(by(c, 'landmark').filter(i => i.facts?.heightM && i.sub !== 'mountain' && i.sub !== 'volcano'), c.rnd).slice(0, c.nOpts);
    if (lms.length < c.nOpts) return null;
    const top = lms.reduce((a, b) => (a.facts!.heightM! >= b.facts!.heightM! ? a : b));
    return build('lm_tallest', 'landmarks', { en: 'Which of these is the tallest?', zh: '下面哪一个最高？' }, nm(c, top), lms.map(l => nm(c, l)), c);
  } },
  { id: 'lm_oldest', set: 'landmarks', make: c => {
    const lms = shuffle(by(c, 'landmark').filter(i => i.facts?.built !== undefined), c.rnd).slice(0, c.nOpts);
    if (lms.length < c.nOpts) return null;
    const old = lms.reduce((a, b) => (a.facts!.built! <= b.facts!.built! ? a : b));
    return build('lm_oldest', 'landmarks', { en: 'Which of these was built first?', zh: '下面哪一个最早建成？' }, nm(c, old), lms.map(l => nm(c, l)), c);
  } },
  { id: 'an_diet', set: 'animals', make: c => {
    if (c.nOpts > 3) return null;
    const an = by(c, 'animal'); const it = pick(an, c.rnd); const diets = ['carnivore', 'herbivore', 'omnivore'];
    const label = (d: string) => ({ carnivore: { en: 'Meat-eater', zh: '吃肉' }, herbivore: { en: 'Plant-eater', zh: '吃植物' }, omnivore: { en: 'Eats everything', zh: '什么都吃' } } as Record<string, I18n>)[d];
    return build('an_diet', 'animals', { en: `What does the ${tr(it.name, 'en').toLowerCase()} eat?`, zh: `${tr(it.name, 'zh')}吃什么？` },
      tr(label(it.diet!), c.lang), diets.map(d => tr(label(d), c.lang)), c, it);
  } },
  { id: 'an_endangered', set: 'animals', make: c => {
    const an = by(c, 'animal'); const risky = an.filter(a => a.status === 'EN' || a.status === 'CR'); const safe = an.filter(a => a.status === 'LC');
    const it = pick(risky, c.rnd);
    return build('an_endangered', 'animals', { en: 'Which animal is endangered?', zh: '哪种动物濒临灭绝？' }, nm(c, it), safe.map(a => nm(c, a)), c);
  } },
  { id: 'an_heaviest', set: 'animals', make: c => {
    const an = shuffle(by(c, 'animal').filter(a => a.facts?.weightKg), c.rnd).slice(0, c.nOpts);
    if (an.length < c.nOpts) return null;
    const top = an.reduce((a, b) => (a.facts!.weightKg! >= b.facts!.weightKg! ? a : b));
    return build('an_heaviest', 'animals', { en: 'Which animal is the heaviest?', zh: '哪种动物最重？' }, nm(c, top), an.map(a => nm(c, a)), c);
  } },
  { id: 'an_where', set: 'animals', make: c => {
    const an = by(c, 'animal').filter(a => a.continent !== 'ocean' && a.continent !== 'antarctica'); const it = pick(an, c.rnd);
    const conts = ['africa', 'europe', 'asia', 'north-america', 'south-america', 'oceania'] as const;
    const label = (k: CatalogueItem['continent']) => CONTINENT_NAMES[k][c.lang];
    return build('an_where', 'animals', { en: `On which continent can you find the wild ${tr(it.name, 'en').toLowerCase()} on our globe?`, zh: `在地球仪上，野生的${tr(it.name, 'zh')}生活在哪个大洲？` },
      label(it.continent), conts.map(label), c, it);
  } },
  { id: 'geo_capital', set: 'geo', make: c => {
    const caps = CITIES.filter(x => x[5]); const it = pick(caps, c.rnd);
    return build('geo_capital', 'geo', { en: `What is the capital of ${c.country(it[1])}?`, zh: `${c.country(it[1])}的首都是哪里？` }, cityName(it[0], c.lang), caps.map(x => cityName(x[0], c.lang)), c, { lat: it[2], lon: it[3] });
  } },
  { id: 'geo_northmost', set: 'geo', make: c => {
    const cs = shuffle(CITIES, c.rnd).slice(0, c.nOpts); const top = cs.reduce((a, b) => (a[2] >= b[2] ? a : b));
    return build('geo_northmost', 'geo', { en: 'Which city is furthest north?', zh: '哪座城市最靠北？' }, cityName(top[0], c.lang), cs.map(x => cityName(x[0], c.lang)), c);
  } },
  { id: 'geo_southmost', set: 'geo', make: c => {
    const cs = shuffle(CITIES, c.rnd).slice(0, c.nOpts); const top = cs.reduce((a, b) => (a[2] <= b[2] ? a : b));
    return build('geo_southmost', 'geo', { en: 'Which city is furthest south?', zh: '哪座城市最靠南？' }, cityName(top[0], c.lang), cs.map(x => cityName(x[0], c.lang)), c);
  } },
  { id: 'geo_equator', set: 'geo', make: c => {
    const cs = shuffle(CITIES, c.rnd).slice(0, c.nOpts); const top = cs.reduce((a, b) => (Math.abs(a[2]) <= Math.abs(b[2]) ? a : b));
    return build('geo_equator', 'geo', { en: 'Which city is closest to the equator?', zh: '哪座城市离赤道最近？' }, cityName(top[0], c.lang), cs.map(x => cityName(x[0], c.lang)), c);
  } },
  { id: 'geo_city_country', set: 'geo', make: c => {
    const it = pick(CITIES, c.rnd);
    return build('geo_city_country', 'geo', { en: `In which country is ${cityName(it[0], 'en')}?`, zh: `${cityName(it[0], 'zh')}位于哪个国家？` },
      c.country(it[1]), CITIES.map(x => c.country(x[1])), c, { lat: it[2], lon: it[3] });
  } },
  { id: 'geo_southern_hem', set: 'geo', make: c => {
    const south = CITIES.filter(x => x[2] < -5);
    const north = CITIES.filter(x => x[2] > 10);
    if (!south.length || north.length < c.nOpts - 1) return null;
    const it = pick(south, c.rnd);
    return build('geo_southern_hem', 'geo', { en: 'Which of these cities lies in the Southern Hemisphere?', zh: '下列哪座城市位于南半球？' },
      cityName(it[0], c.lang), north.map(x => cityName(x[0], c.lang)), c, { lat: it[2], lon: it[3] });
  } },
  { id: 'geo_tropics', set: 'geo', make: c => {
    const trop = CITIES.filter(x => Math.abs(x[2]) < 22);
    const mid = CITIES.filter(x => Math.abs(x[2]) > 28);
    if (!trop.length || mid.length < c.nOpts - 1) return null;
    const it = pick(trop, c.rnd);
    return build('geo_tropics', 'geo', { en: 'Which of these cities lies in the Tropics (receive direct overhead sunlight)?', zh: '下列哪座城市位于热带（有阳光直射现象）？' },
      cityName(it[0], c.lang), mid.map(x => cityName(x[0], c.lang)), c, { lat: it[2], lon: it[3] });
  } },
  { id: 'geo_populous', set: 'geo', make: c => {
    const cs = shuffle(CITIES, c.rnd).slice(0, c.nOpts);
    const top = cs.reduce((a, b) => (a[4] >= b[4] ? a : b));
    if (cs.filter(x => x[4] === top[4]).length > 1) return null;
    return build('geo_populous', 'geo', { en: 'Which of these cities has the largest metropolitan population?', zh: '下列哪座城市的都市圈人口最多？' },
      cityName(top[0], c.lang), cs.map(x => cityName(x[0], c.lang)), c, { lat: top[2], lon: top[3] });
  } },
  { id: 'geo_peak_highest', set: 'geo', make: c => {
    const peaks = shuffle(c.items.filter(i => (i.sub === 'mountain' || i.type === 'volcano') && i.facts?.heightM), c.rnd).slice(0, c.nOpts);
    if (peaks.length < c.nOpts) return null;
    const top = peaks.reduce((a, b) => (a.facts!.heightM! >= b.facts!.heightM! ? a : b));
    if (peaks.filter(p => p.facts!.heightM === top.facts!.heightM).length > 1) return null;
    return build('geo_peak_highest', 'geo', { en: 'Which of these peaks has the highest elevation above sea level?', zh: '下列哪座山峰的海拔最高？' },
      nm(c, top), peaks.map(p => nm(c, p)), c, top);
  } },
  { id: 'geo_world_record', set: 'geo', make: c => {
    const item = pick(WORLD_RECORDS, c.rnd);
    const gz = GAZETTEER_BY_KEY.get(item.key);
    if (!gz) return null;
    const pool = gzPoolByKinds(...item.kinds).map(g => gzName(g, c.lang));
    return build('geo_world_record', 'geo', item.prompt, gzName(gz, c.lang), pool, c, { lat: gz.lat, lon: gz.lon });
  } },
  { id: 'geo_strait_canal', set: 'geo', make: c => {
    const item = pick(WATERWAY_GATEWAYS, c.rnd);
    const gz = GAZETTEER_BY_KEY.get(item.key);
    if (!gz) return null;
    const pool = gzPoolByKinds(gz.kind === 'canal' ? 'canal' : 'strait', 'strait', 'canal').map(g => gzName(g, c.lang));
    return build('geo_strait_canal', 'geo', item.prompt, gzName(gz, c.lang), pool, c, { lat: gz.lat, lon: gz.lon });
  } },
  { id: 'geo_china_landform', set: 'geo', make: c => {
    const item = pick(CHINA_GEO_ITEMS, c.rnd);
    const gz = GAZETTEER_BY_KEY.get(item.key);
    if (!gz) return null;
    const pool = gzPoolByKinds(...item.kinds).map(g => gzName(g, c.lang));
    return build('geo_china_landform', 'geo', item.prompt, gzName(gz, c.lang), pool, c, { lat: gz.lat, lon: gz.lon });
  } },
  { id: 'geo_feature_continent', set: 'geo', make: c => {
    const [key, cont] = pick(FEATURE_CONTINENTS, c.rnd);
    const gz = GAZETTEER_BY_KEY.get(key);
    if (!gz) return null;
    const conts = ['africa', 'europe', 'asia', 'north-america', 'south-america', 'oceania'] as const;
    const label = (k: typeof conts[number]) => CONTINENT_NAMES[k][c.lang];
    return build(
      'geo_feature_continent',
      'geo',
      { en: `On which continent is ${gz.name.en} located?`, zh: `“${gz.name.zh}”位于哪个大洲？` },
      label(cont),
      conts.map(label),
      c,
      { lat: gz.lat, lon: gz.lon },
    );
  } },
  { id: 'sec_kind', set: 'secrets', make: c => {
    const ds = by(c, 'discovery'); const it = pick(ds, c.rnd);
    const kinds: Record<string, I18n> = { wreck: { en: 'A shipwreck', zh: '一艘沉船' }, mystery: { en: 'A mystery', zh: '一个未解之谜' }, cryptid: { en: 'A legendary creature', zh: '一种传说中的生物' }, deepsea: { en: 'A deep-sea place', zh: '一个深海地点' }, extreme: { en: 'An extreme place', zh: '一个极端的地方' }, restricted: { en: 'A secret base', zh: '一个秘密基地' } };
    if (!kinds[it.sub]) return null;
    return build('sec_kind', 'secrets', { en: `What is “${tr(it.name, 'en')}”?`, zh: `“${tr(it.name, 'zh')}”是什么？` },
      tr(kinds[it.sub], c.lang), Object.values(kinds).map(k => tr(k, c.lang)), c, it);
  } },
  { id: 'sec_deepest', set: 'secrets', make: c => {
    const ds = shuffle(by(c, 'discovery').filter(d => d.facts?.depthM), c.rnd).slice(0, c.nOpts);
    if (ds.length < c.nOpts) return null;
    const top = ds.reduce((a, b) => (a.facts!.depthM! >= b.facts!.depthM! ? a : b));
    return build('sec_deepest', 'secrets', { en: 'Which of these lies deepest underwater?', zh: '下面哪一个位于最深的海底？' }, nm(c, top), ds.map(d => nm(c, d)), c, top);
  } },
  { id: 'geo_ocean_sea', set: 'geo', make: c => {
    const oceans: Record<'pacific' | 'atlantic' | 'indian' | 'arctic' | 'southern', I18n> = {
      pacific: { en: 'Pacific Ocean', zh: '太平洋' },
      atlantic: { en: 'Atlantic Ocean', zh: '大西洋' },
      indian: { en: 'Indian Ocean', zh: '印度洋' },
      arctic: { en: 'Arctic Ocean', zh: '北冰洋' },
      southern: { en: 'Southern Ocean', zh: '南大洋' },
    };
    const seas: [GazetteerEntry['key'], keyof typeof oceans][] = [
      ['geo:mediterranean-sea', 'atlantic'],
      ['geo:caribbean-sea', 'atlantic'],
      ['geo:north-sea', 'atlantic'],
      ['geo:baltic-sea', 'atlantic'],
      ['geo:sargasso-sea', 'atlantic'],
      ['geo:south-china-sea', 'pacific'],
      ['geo:east-china-sea', 'pacific'],
      ['geo:bering-sea', 'pacific'],
      ['geo:coral-sea', 'pacific'],
      ['geo:arabian-sea', 'indian'],
      ['geo:red-sea', 'indian'],
    ];
    const [key, oc] = pick(seas, c.rnd);
    const gz = GAZETTEER_BY_KEY.get(key);
    if (!gz) return null;
    return build(
      'geo_ocean_sea',
      'geo',
      { en: `Which ocean basin is the ${gz.name.en} connected to as a marginal sea?`, zh: `${gz.name.zh}属于哪个大洋的边缘海或附属海？` },
      tr(oceans[oc], c.lang),
      Object.values(oceans).map(o => tr(o, c.lang)),
      c,
      { lat: gz.lat, lon: gz.lon },
    );
  } },
  { id: 'dino_oldest', set: 'animals', make: c => {
    const dinos = shuffle(by(c, 'dino').filter(d => d.facts?.mya), c.rnd).slice(0, c.nOpts);
    if (dinos.length < c.nOpts) return null;
    const oldest = dinos.reduce((a, b) => (a.facts!.mya! >= b.facts!.mya! ? a : b));
    return build(
      'dino_oldest',
      'animals',
      { en: 'Which of these prehistoric creatures lived earliest in Earth’s history?', zh: '下面哪种古生物生活在距今最久远的地质年代？' },
      nm(c, oldest),
      dinos.map(d => nm(c, d)),
      c,
      oldest,
    );
  } },
  { id: 'volcano_tallest', set: 'geo', make: c => {
    const vs = shuffle(by(c, 'volcano').filter(v => v.facts?.heightM), c.rnd).slice(0, c.nOpts);
    if (vs.length < c.nOpts) return null;
    const top = vs.reduce((a, b) => (a.facts!.heightM! >= b.facts!.heightM! ? a : b));
    return build(
      'volcano_tallest',
      'geo',
      { en: 'Which of these volcanoes has the highest summit elevation?', zh: '下面哪座火山的山顶海拔最高？' },
      nm(c, top),
      vs.map(v => nm(c, v)),
      c,
      top,
    );
  } },
];

export function generateQuiz(items: CatalogueItem[], set: QuizSet, level: QuizLevel, n: number, lang: Lang,
  country: (a2: string) => string, rnd: () => number = Math.random): Question[] {
  const c: Ctx = { items, lang, rnd, nOpts: LEVEL_OPTIONS[level], country };
  const tpls = TEMPLATES.filter(t => set === 'mixed' || t.set === set);
  const out: Question[] = [];
  const seen = new Set<string>();
  for (let tries = 0; out.length < n && tries < n * 30; tries++) {
    const q = pick(tpls, rnd).make(c);
    if (!q) continue;
    const sig = q.prompt.en + '|' + q.options[q.answer];
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(q);
  }
  return out;
}

export interface PlayerScore { name: string; score: number; streak: number; bestStreak: number }
export function applyAnswer(p: PlayerScore, correct: boolean): PlayerScore {
  const streak = correct ? p.streak + 1 : 0;
  return { ...p, score: p.score + (correct ? 1 : 0), streak, bestStreak: Math.max(p.bestStreak, streak) };
}
export function ranking(players: PlayerScore[]): PlayerScore[] {
  return players.slice().sort((a, b) => b.score - a.score || b.bestStreak - a.bestStreak);
}

/** Shareable compact text summary for a completed Quiz round. */
export function quizShareText(
  ranked: readonly PlayerScore[],
  perPlayer: number,
  set: QuizSet,
  level: QuizLevel,
  title = 'Terrastra Quiz',
): string {
  const medals = ['🥇', '🥈', '🥉', '🎖️'];
  const lines = ranked.map((p, idx) => {
    const pct = perPlayer > 0 ? Math.round((p.score / perPlayer) * 100) : 0;
    const streak = p.bestStreak >= 2 ? ` 🔥×${p.bestStreak}` : '';
    return `${medals[idx] ?? '•'} ${p.name}: ${p.score}/${perPlayer} (${pct}%)${streak}`;
  });
  return [`${title} (${set} · ${level})`, ...lines].join('\n');
}
