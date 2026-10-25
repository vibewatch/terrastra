/** SSBS map lessons: the countries of West and Central Africa, a drill on all 25, and the 30-point practice test. */
import { type Lesson, type Quiz, type Step } from '../kit.ts';
import { AFRICA_CAM, BY_A2, CENTRAL, COUNTRIES, ISLANDS, WEST, type Country } from './countries.ts';
import { countryLayer, decoys, factsOf, findQ, mcq, nameQ, sample, seeded } from './helpers.ts';

const unit = ['SSBS · West and Central Africa', 'SSBS · 西非与中非'] as const;
const pick = (...a2: string[]): Country[] => a2.map(x => BY_A2.get(x)!);

/** A step showing a group of countries with their names and capitals. */
function groupStep(title: readonly [string, string], list: Country[], cam: [number, number, number]): Step {
  const { paint, marks } = countryLayer(list, { names: true, capitals: true });
  return { title, body: factsOf(list), cam, names: false, borders: true, paint, marks };
}

/** "Name it" with neighbours as the wrong answers. */
const nameIt = (a2: string): Quiz => { const x = BY_A2.get(a2)!; return nameQ(x, decoys(x)); };
/** A map question that suits the country: tiny islands are named, not found (they are too small to tap). */
const mapQ = (x: Country, find: boolean, rand: () => number): Quiz => (find && !ISLANDS.has(x.a2) ? findQ(x) : nameQ(x, decoys(x, COUNTRIES, rand)));

const overview = (list: Country[], title: readonly [string, string], body: readonly [string, string]): Step => {
  const { paint, marks } = countryLayer(list, { a: 0.4 });
  return { title, body, cam: AFRICA_CAM, names: false, borders: true, paint, marks };
};

export const WEST_LESSON: Lesson = {
  id: 'ssbs-west', strand: 'world', tracks: [], unit, icon: 'pin', minutes: 10,
  title: ['The 16 countries of West Africa', '西非的 16 个国家'],
  blurb: ['From the Sahara to the Gulf of Guinea: where each country is, its capital and one thing to remember.', '从撒哈拉到几内亚湾：每个国家在哪里、首都是哪里，以及一件值得记住的事。'],
  keys: [
    ['The Sahel giants: Mauritania, Mali, Niger and landlocked Burkina Faso.', '萨赫勒大国：毛里塔尼亚、马里、尼日尔，以及内陆国布基纳法索。'],
    ['The Atlantic corner: Senegal wraps around The Gambia; then Guinea-Bissau, Guinea, Sierra Leone, Liberia, and Cape Verde out at sea.', '大西洋一角：塞内加尔包围着冈比亚；接着是几内亚比绍、几内亚、塞拉利昂、利比里亚，海上还有佛得角。'],
    ['The Gulf of Guinea coast, west to east: Ivory Coast, Ghana, Togo, Benin, Nigeria.', '几内亚湾沿岸由西向东：科特迪瓦、加纳、多哥、贝宁、尼日利亚。'],
    ['Nigeria has the most people in Africa; its capital is Abuja, its biggest city Lagos.', '尼日利亚是非洲人口最多的国家，首都阿布贾，最大城市拉各斯。'],
  ],
  steps: [
    overview(WEST, ['West Africa: 16 countries', '西非：16 个国家'],
      ['West Africa bulges out into the Atlantic. Its north is the Sahara, its middle the dry Sahel, and its south the wetter savanna and forest along the Gulf of Guinea. Learn the countries in three groups: the big Sahel countries in the north, the small countries of the Atlantic corner, and the five countries along the Gulf coast.',
        '西非向大西洋凸出。北部是撒哈拉沙漠，中部是干旱的萨赫勒，南部是几内亚湾沿岸较湿润的草原和森林。把这些国家分成三组来记：北部萨赫勒的几个大国、大西洋一角的几个小国，以及几内亚湾沿岸的五个国家。']),
    groupStep(['The Sahel giants', '萨赫勒大国'], pick('MR', 'ML', 'NE', 'BF'), [16, -4, 2.2]),
    groupStep(['The Atlantic corner', '大西洋一角'], pick('SN', 'GM', 'GW', 'GN', 'SL', 'LR', 'CV'), [11, -15, 1.8]),
    groupStep(['The Gulf of Guinea coast', '几内亚湾沿岸'], pick('CI', 'GH', 'TG', 'BJ', 'NG'), [8, 2, 1.9]),
  ],
  quiz: [
    findQ(BY_A2.get('NG')!), findQ(BY_A2.get('ML')!), findQ(BY_A2.get('GH')!), findQ(BY_A2.get('SN')!), findQ(BY_A2.get('GM')!),
    nameIt('CI'), nameIt('BF'),
    mcq(['What is the capital of Nigeria?', '尼日利亚的首都是哪里？'], ['Abuja', '阿布贾'], [['Lagos', '拉各斯'], ['Accra', '阿克拉'], ['Dakar', '达喀尔']],
      ['Lagos is the biggest city, but the capital moved to Abuja, in the middle of the country, in 1991.', '拉各斯是最大城市，但首都于 1991 年迁到了国家中部的阿布贾。'], ['Nigeria', '尼日利亚']),
    mcq(['Which country was founded by freed slaves from the United States?', '哪个国家是由来自美国的获释奴隶建立的？'], ['Liberia', '利比里亚'], [['Ghana', '加纳'], ['Senegal', '塞内加尔'], ['Niger', '尼日尔']],
      ['Liberia became independent in 1847; its capital Monrovia is named after US President James Monroe.', '利比里亚于 1847 年独立，首都蒙罗维亚以美国总统门罗命名。'], ['Liberia', '利比里亚']),
  ],
};

export const CENTRAL_LESSON: Lesson = {
  id: 'ssbs-central', strand: 'world', tracks: [], unit, icon: 'pin', minutes: 9,
  title: ['The 9 countries of Central Africa', '中非的 9 个国家'],
  blurb: ['Around the Congo Basin: from Chad in the Sahara to Angola in the south, and two island nations.', '环绕刚果盆地：从撒哈拉的乍得到南边的安哥拉，还有两个岛国。'],
  keys: [
    ['North: Chad, Cameroon and the Central African Republic.', '北部：乍得、喀麦隆和中非共和国。'],
    ['The coast: Equatorial Guinea, Gabon, the Republic of the Congo, and São Tomé and Príncipe at sea.', '沿海：赤道几内亚、加蓬、刚果共和国，海上还有圣多美和普林西比。'],
    ['The giants: the Democratic Republic of the Congo (capital Kinshasa) and Angola.', '两个大国：刚果民主共和国（首都金沙萨）和安哥拉。'],
    ['Two Congos face each other across the river: Kinshasa and Brazzaville are the closest pair of capitals in the world.', '两个刚果隔河相望：金沙萨和布拉柴维尔是世界上距离最近的两个首都。'],
  ],
  steps: [
    overview(CENTRAL, ['Central Africa: 9 countries', '中非：9 个国家'],
      ['Central Africa is built around the Congo Basin, the second-largest rainforest on Earth. Its countries reach from the Sahara in the north to the dry plateaus of Angola in the south. Learn them in three groups: the north, the Atlantic coast and islands, and the two giants of the south.',
        '中非以刚果盆地为中心，那里有世界第二大的热带雨林。这些国家从北部的撒哈拉一直延伸到南部安哥拉干燥的高原。分成三组来记：北部、大西洋沿岸和岛屿，以及南部的两个大国。']),
    groupStep(['The north', '北部'], pick('TD', 'CM', 'CF'), [10, 17, 2.0]),
    groupStep(['The coast and the islands', '沿海与岛屿'], pick('GQ', 'GA', 'CG', 'ST'), [0, 11, 1.6]),
    groupStep(['The southern giants', '南部的两个大国'], pick('CD', 'AO'), [-6, 20, 2.2]),
  ],
  quiz: [
    findQ(BY_A2.get('CD')!), findQ(BY_A2.get('TD')!), findQ(BY_A2.get('GA')!), findQ(BY_A2.get('AO')!), findQ(BY_A2.get('CF')!),
    nameIt('CM'), nameIt('CG'),
    mcq(['What is the capital of the Democratic Republic of the Congo?', '刚果民主共和国的首都是哪里？'], ['Kinshasa', '金沙萨'], [['Brazzaville', '布拉柴维尔'], ['Luanda', '罗安达'], ['Libreville', '利伯维尔']],
      ['Brazzaville, across the river, is the capital of the other Congo, the Republic of the Congo.', '河对岸的布拉柴维尔是另一个刚果，也就是刚果共和国的首都。'], ['Democratic Republic of the Congo', '刚果民主共和国']),
    mcq(['Which Central African country speaks Spanish?', '哪个中非国家讲西班牙语？'], ['Equatorial Guinea', '赤道几内亚'], [['Gabon', '加蓬'], ['Angola', '安哥拉'], ['Chad', '乍得']],
      ['It was a Spanish colony; Angola speaks Portuguese, Gabon and Chad French.', '它曾是西班牙殖民地；安哥拉讲葡萄牙语，加蓬和乍得讲法语。'], ['Equatorial Guinea', '赤道几内亚']),
  ],
};

const DRILL_INTRO: Step = {
  title: ['All 25 countries', '全部 25 个国家'], cam: AFRICA_CAM, names: false, borders: true,
  ...countryLayer(COUNTRIES, { names: true, a: 0.4, t: 0.1 }),
  body: ['Look over the whole map once more, then find or name every country, in a new order each time. Islands are always "name it" questions.',
    '再看一遍整张地图，然后把每个国家找出来或说出名字，每次的顺序都不一样。岛国总是“说出名字”题。'],
};
/** Every country once, in random order, alternating "find it" and "name it". */
export const drillQuiz = (rand: () => number): Quiz[] => sample(COUNTRIES, COUNTRIES.length, rand).map((x, i) => mapQ(x, i % 2 === 0, rand));

export const DRILL_LESSON: Lesson = {
  id: 'ssbs-drill', strand: 'world', tracks: [], unit, icon: 'grid', minutes: 8,
  title: ['Map drill: all 25 countries', '地图练习：全部 25 个国家'],
  blurb: ['Find or name every country of West and Central Africa, shuffled each time.', '把西非和中非的每个国家找出来或说出名字，每次顺序都打乱。'],
  keys: [['Practise until you can find every country without the names on the map.', '一直练到地图上没有国名也能找到每个国家。']],
  steps: [DRILL_INTRO], quiz: drillQuiz(seeded('ssbs-drill')),
  gen: () => ({ steps: [DRILL_INTRO], quiz: drillQuiz(Math.random) }),
};
