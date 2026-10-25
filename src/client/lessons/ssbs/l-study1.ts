/** SSBS study lessons, part 1: the key terms, the land and its climate, and the trading empires. */
import { C, mk, type Lesson, type Quiz, type Step } from '../kit.ts';
import { CONGO, NIGER, SAHEL } from '../l-world.ts';
import { GROUPS, TERMS, type TermGroup } from './terms.ts';
import { AFRICA_CAM } from './countries.ts';
import { mcq } from './helpers.ts';

const unit = ['SSBS · West and Central Africa', 'SSBS · 西非与中非'] as const;
const SAHEL_C = ['SN', 'MR', 'ML', 'BF', 'NE', 'NG', 'TD', 'SD', 'ER', 'GM'];
const GREEN_WALL = [[14.7, -17], [15, -5], [14.5, 5], [13.5, 15], [13, 25], [13.5, 33], [12, 43]] as [number, number][];

const termStep = (g: TermGroup, extra: Partial<Step>): Step => {
  const ts = TERMS.filter(x => x.group === g);
  return {
    title: GROUPS[g], cam: AFRICA_CAM,
    body: [ts.map(x => `${x.term[0][0].toUpperCase()}${x.term[0].slice(1)}: ${x.def[0]}`).join(' '), ts.map(x => `${x.term[1]}：${x.def[1]}`).join('')],
    ...extra,
  } as Step;
};
const termMatch = (g: TermGroup): Quiz => ({
  q: [`Match each term to its meaning (${GROUPS[g][0].toLowerCase()}).`, `把每个词语和它的意思配对（${GROUPS[g][1]}）。`],
  match: TERMS.filter(x => x.group === g).map(x => [x.term, x.def] as const),
  why: ['Say each term aloud with its meaning, then try the practice test.', '把每个词语和它的意思大声说一遍，再去做模拟测试。'],
});

export const TERMS_LESSON: Lesson = {
  id: 'ssbs-terms', strand: 'world', tracks: [], unit, icon: 'book', minutes: 10,
  title: ['The 17 key terms', '17 个关键词'],
  blurb: ['Every word on the review sheet, in plain words, with the map to show it.', '复习单上的每个关键词，用浅显的话解释，并配上地图。'],
  keys: TERMS.map(x => [`${x.term[0]}: ${x.def[0]}`, `${x.term[1]}：${x.def[1]}`] as const),
  steps: [
    termStep('land', {
      paint: [{ fill: { k: 'poly', pts: SAHEL, c: C.orange, clip: SAHEL_C }, t: 0.3, a: 0.55 }],
      marks: [mk([23, 2], 'Sahara', '撒哈拉沙漠', { big: true, c: C.orange, t: 0.4 }), mk([15.5, -2], 'Sahel', '萨赫勒', { c: C.gold, t: 0.8 }), mk([9, 20], 'savanna', '热带草原', { c: C.lime, t: 1.1 }), mk([0, 20], 'rainforest', '热带雨林', { c: C.green, t: 1.4 })],
    }),
    termStep('past', {
      lines: [{ pts: [[23.6, -5], [16.77, -3]], c: C.white, t: 0.4, arrow: true, dur: 1.2 }, { pts: [[11.5, -9.2], [16.77, -3]], c: C.gold, t: 1.0, arrow: true, dur: 1.2 }],
      marks: [mk([23.6, -5], 'Taghaza salt mines', '塔加扎盐矿', { dot: true, t: 0.4 }), mk([11.5, -9.2], 'gold fields', '金矿区', { dot: true, c: C.gold, t: 1.0 }), mk([16.77, -3], 'Timbuktu', '廷巴克图', { dot: true, big: true, t: 1.4 })],
    }),
    termStep('power', {
      paint: [{ fill: { k: 'continents', only: ['africa'] }, a: 0.45 }],
      marks: [mk([9.0, 38.75], 'Addis Ababa: African Union headquarters', '亚的斯亚贝巴：非盟总部', { dot: true, big: true, t: 0.6 })],
      cam: [5, 15, 3.1],
    }),
    termStep('today', {
      marks: [mk([6.45, 3.4], 'Lagos', '拉各斯', { dot: true, t: 0.4 }), mk([-4.32, 15.31], 'Kinshasa', '金沙萨', { dot: true, t: 0.7 }), mk([12.13, 15.06], 'N\'Djamena', '恩贾梅纳', { dot: true, t: 1.0 })],
    }),
  ],
  quiz: (['land', 'past', 'power', 'today'] as TermGroup[]).map(termMatch),
};

export const LAND_LESSON: Lesson = {
  id: 'ssbs-land', strand: 'world', tracks: [], unit, icon: 'leaf', minutes: 9,
  title: ['Desert, Sahel, savanna and rainforest', '沙漠、萨赫勒、草原和雨林'],
  blurb: ['The climate belts, the Niger and Congo rivers, and why the desert is spreading.', '气候带、尼日尔河与刚果河，以及沙漠为什么在扩大。'],
  keys: [
    ['From north to south: Sahara desert, the dry Sahel, savanna, then rainforest near the equator.', '从北到南：撒哈拉沙漠、干旱的萨赫勒、热带草原，赤道附近是热带雨林。'],
    ['Desertification: drought, overgrazing and cutting trees turn the Sahel\'s grassland into desert.', '荒漠化：干旱、过度放牧和砍伐树木让萨赫勒的草地变成沙漠。'],
    ['Lake Chad has shrunk by about 90% since the 1960s.', '乍得湖自 20 世纪 60 年代以来缩小了约 90%。'],
    ['The Niger bends through the desert edge; the Congo crosses the equator twice.', '尼日尔河在沙漠边缘拐了个大弯；刚果河两次穿过赤道。'],
    ['Deforestation clears the rainforest for farms, timber and charcoal.', '森林砍伐为了农田、木材和木炭而清除雨林。'],
  ],
  steps: [
    {
      title: ['Belts of climate', '一条条气候带'], cam: [8, 8, 2.6],
      paint: [{ fill: { k: 'biome' }, a: 0.6 }],
      marks: [mk([23, 2], 'Sahara: desert', '撒哈拉：沙漠', { big: true, c: C.orange, t: 0.5 }), mk([15.5, -4], 'Sahel', '萨赫勒', { c: C.gold, t: 0.8 }), mk([10, 15], 'savanna', '热带草原', { c: C.lime, t: 1.1 }), mk([0, 20], 'rainforest', '热带雨林', { c: C.green, t: 1.4 }), mk([-12, 18], 'savanna again', '又是热带草原', { c: C.lime, t: 1.7 })],
      body: ['Rain falls most near the equator and less the further you go from it. So the region is a set of belts: the Sahara in the north, where it hardly ever rains; the Sahel, a dry strip of grass and thorny bushes; the savanna, tropical grassland with scattered trees and a long dry season; and the rainforest around the equator, wet all year. South of the rainforest, in Angola, the savanna comes back.',
        '赤道附近雨水最多，离赤道越远雨越少。因此这里分成一条条气候带：北部是几乎不下雨的撒哈拉沙漠；然后是萨赫勒，一条长着草和带刺灌木的干旱地带；接着是热带草原，稀疏的树木和漫长的旱季；赤道附近是全年湿润的热带雨林。雨林以南的安哥拉，又是热带草原。'],
    },
    {
      title: ['The Sahel and desertification', '萨赫勒与荒漠化'], cam: [14, 5, 2.4],
      paint: [{ fill: { k: 'poly', pts: SAHEL, c: C.orange, clip: SAHEL_C }, t: 0.3, a: 0.55 }],
      lines: [{ pts: GREEN_WALL, c: C.green, t: 1.4, w: 1.6, dur: 2 }],
      marks: [mk([13.0, 14.5], 'Lake Chad: about 90% smaller since the 1960s', '乍得湖：比 20 世纪 60 年代缩小约 90%', { dot: true, c: C.blue, t: 0.9 }), mk([16.5, 25], 'Great Green Wall', '绿色长城', { c: C.green, t: 1.8 })],
      body: ['Sahel means "shore" in Arabic: it is the shore of the Sahara. Rain here is short and unreliable. When droughts come, and when too many goats and cattle eat the grass (overgrazing) and people cut trees for firewood, the bare soil blows away and the land turns to desert. That is desertification. Lake Chad, once one of Africa\'s biggest lakes, has shrunk by about 90%. Countries are now planting a "Great Green Wall" of trees and fields across the Sahel to hold the desert back.',
        '“萨赫勒”在阿拉伯语里是“海岸”的意思，指撒哈拉沙漠的“岸边”。这里雨季短、降水不稳定。遇到干旱，加上牛羊太多把草吃光（过度放牧）、人们砍树当柴烧，裸露的土壤被风吹走，土地就变成沙漠，这就是荒漠化。乍得湖曾是非洲最大的湖泊之一，现在缩小了约 90%。各国正在萨赫勒种植一道横贯非洲的“绿色长城”来阻挡沙漠。'],
    },
    {
      title: ['Two great rivers', '两条大河'], cam: [5, 5, 2.5], sketch: true,
      lines: [{ pts: NIGER, c: C.blue, t: 0.3, w: 1.8, dur: 2 }, { pts: CONGO, c: C.teal, t: 1.4, w: 1.8, dur: 2 }],
      marks: [mk([9.2, -10.6], 'Niger rises in Guinea', '尼日尔河发源于几内亚', { dot: true, c: C.blue, t: 0.3 }), mk([16.77, -3], 'Timbuktu', '廷巴克图', { dot: true, t: 1.0 }), mk([4.5, 6.2], 'Niger Delta', '尼日尔河三角洲', { c: C.blue, t: 1.4 }), mk([0.5, 21], 'Congo River', '刚果河', { big: true, c: C.teal, t: 2.0 }), mk([-5.6, 13.6], 'rapids and falls', '急流和瀑布', { dot: true, c: C.red, t: 2.6 })],
      body: ['The Niger (about 4,200 km) starts in the hills of Guinea only about 240 km from the Atlantic, yet flows away from the sea: north-east to the edge of the Sahara at Timbuktu, then in a great bend south-east through Niger and Nigeria to the Gulf of Guinea. The Congo (about 4,700 km) crosses the equator twice and carries more water than any river except the Amazon. Near its mouth, rapids and waterfalls stop ships from sailing inland from the sea.',
        '尼日尔河（约 4200 千米）发源于几内亚的山地，离大西洋只有约 240 千米，却背海而流：先向东北流到撒哈拉边缘的廷巴克图，再拐一个大弯向东南，穿过尼日尔和尼日利亚注入几内亚湾。刚果河（约 4700 千米）两次穿过赤道，水量仅次于亚马孙河。在河口附近，急流和瀑布挡住了从海上驶入内陆的船只。'],
    },
    {
      title: ['Rainforest, farmland and deforestation', '雨林、耕地与森林砍伐'], cam: [0, 17, 2.4],
      paint: [{ fill: { k: 'biome', only: ['rainforest'] }, a: 0.6 }],
      marks: [mk([-1, 22], 'Congo rainforest', '刚果雨林', { big: true, c: C.green, t: 0.5 }), mk([7, -5.5], 'Ivory Coast: forest cleared for cocoa', '科特迪瓦：为种可可砍掉森林', { dot: true, c: C.red, t: 1.0 })],
      body: ['The Congo Basin holds the world\'s second-largest tropical rainforest. Deforestation is eating into it: trees are cut for timber, cleared for farms and burned for charcoal. In Ivory Coast and Ghana most of the old forest has been turned into cocoa farms. Arable land, land that can grow crops, is limited: deserts are too dry, and rainforest soils lose their goodness quickly once the trees are gone.',
        '刚果盆地有世界第二大的热带雨林。森林砍伐正在吞噬它：树木被砍去做木材，被清除开辟农田，被烧成木炭。科特迪瓦和加纳的大部分原始森林已经变成可可种植园。可耕地（能种庄稼的土地）很有限：沙漠太干，而雨林土壤在树木消失后很快就失去肥力。'],
    },
  ],
  quiz: [
    mcq(['What is the Sahel?', '萨赫勒地区是什么？'], ['The dry belt along the southern edge of the Sahara', '撒哈拉沙漠南缘的干旱地带'],
      [['The rainforest of the Congo Basin', '刚果盆地的热带雨林'], ['A mountain range in Cameroon', '喀麦隆的一条山脉'], ['The delta of the Niger River', '尼日尔河三角洲']],
      ['The Sahel lies between the Sahara and the savanna, from Senegal to Sudan.', '萨赫勒位于撒哈拉沙漠和热带草原之间，从塞内加尔一直延伸到苏丹。'], ['Sahel', '萨赫勒地区']),
    mcq(['Which of these causes desertification?', '下列哪一项会导致荒漠化？'], ['Overgrazing and cutting trees in dry lands', '在干旱地区过度放牧和砍伐树木'],
      [['Planting trees across the Sahel', '在萨赫勒种树'], ['Heavy rain all year', '全年大量降雨'], ['Building dams for electricity', '修建水坝发电']],
      ['Animals strip the grass and people cut trees for fuel; the bare soil dries and blows away.', '牲畜啃光草、人们砍树当柴，裸露的土壤干燥后被风吹走。'], ['desertification', '荒漠化']),
    mcq(['How much has Lake Chad shrunk since the 1960s?', '自 20 世纪 60 年代以来，乍得湖缩小了多少？'], ['About 90%', '约 90%'],
      [['About 10%', '约 10%'], ['About half', '约一半'], ['It has grown', '它变大了']],
      ['Drought and water taken for farming have left only a small part of the old lake.', '干旱和农业取水使这个湖只剩下原来很小的一部分。'], ['Lake Chad', '乍得湖']),
    mcq(['What is a savanna?', '什么是热带草原（稀树草原）？'], ['Tropical grassland with scattered trees and a long dry season', '有零星树木、旱季漫长的热带草地'],
      [['A sand desert with no plants', '没有植物的沙漠'], ['A forest that is wet all year', '全年湿润的森林'], ['A frozen plain near the poles', '极地附近的冰冻平原']],
      ['Savanna covers more of Africa than any other kind of land; lions, elephants and zebras live there.', '热带草原是非洲分布最广的自然带，狮子、大象和斑马生活在那里。'], ['savanna', '热带草原']),
    mcq(['Which river crosses the equator twice?', '哪条河两次穿过赤道？'], ['The Congo', '刚果河'],
      [['The Niger', '尼日尔河'], ['The Gambia', '冈比亚河'], ['The Senegal', '塞内加尔河']],
      ['The Congo loops north over the equator and back south again on its way to the Atlantic.', '刚果河先向北越过赤道，又折回南方，最后注入大西洋。'], ['Congo River', '刚果河']),
    mcq(['What is deforestation?', '什么是森林砍伐（毁林）？'], ['Cutting down or clearing forests', '砍伐或清除森林'],
      [['Planting new forests', '种植新的森林'], ['Grass turning into desert', '草地变成沙漠'], ['Floods along a river', '河流沿岸的洪水']],
      ['Forests are cleared for farms, timber, mining and charcoal.', '人们为了农田、木材、采矿和木炭而清除森林。'], ['deforestation', '森林砍伐']),
  ],
};

export const EMPIRES_LESSON: Lesson = {
  id: 'ssbs-empires', strand: 'world', tracks: [], unit, icon: 'landmark', minutes: 8,
  title: ['Salt, gold and great empires', '盐、黄金与伟大的帝国'],
  blurb: ['Ghana, Mali and Songhai grew rich on the trade in salt and gold; griots kept their story.', '加纳、马里和桑海帝国因盐金贸易而富强，格里奥传颂着它们的故事。'],
  keys: [
    ['Salt trade: camel caravans swapped Saharan salt for West African gold.', '盐金贸易：骆驼商队用撒哈拉的盐交换西非的黄金。'],
    ['Ghana, then Mali, then Songhai controlled this trade and grew rich.', '加纳、马里、桑海先后控制这条贸易路线而富强。'],
    ['Mansa Musa of Mali went to Mecca in 1324 with so much gold that its price fell in Cairo.', '马里国王曼萨·穆萨 1324 年去麦加朝圣，带去的黄金多到让开罗的金价下跌。'],
    ['Timbuktu became a city of trade, mosques and books.', '廷巴克图成为贸易、清真寺和书籍之城。'],
    ['Griots keep history alive in songs and stories, like the epic of Sundiata.', '格里奥用歌谣和故事传承历史，例如《松迪亚塔史诗》。'],
  ],
  steps: [
    {
      title: ['Salt for gold', '用盐换黄金'], cam: [20, -4, 2.5],
      lines: [{ pts: [[31.3, -4.3], [23.6, -5], [16.77, -3]], c: C.white, t: 0.3, arrow: true, dur: 2 }, { pts: [[11.5, -9.2], [16.77, -3]], c: C.gold, t: 1.6, arrow: true, dur: 1.2 }],
      marks: [mk([31.3, -4.3], 'Sijilmasa', '西吉尔马萨', { dot: true, t: 0.3 }), mk([23.6, -5], 'Taghaza: salt', '塔加扎：盐', { dot: true, t: 0.9 }), mk([11.5, -9.2], 'gold fields', '金矿区', { dot: true, c: C.gold, t: 1.6 }), mk([16.77, -3], 'Timbuktu', '廷巴克图', { dot: true, big: true, t: 2.0 })],
      body: ['People in the hot savanna needed salt to stay healthy and to keep food, but had none. The Sahara had salt mines; the land around the upper Niger and Senegal rivers had gold. For hundreds of years, camel caravans crossed the desert in about two months, carrying slabs of salt south and gold north. Salt was sometimes worth as much as gold. The kingdoms that controlled the meeting point grew rich by taxing the trade.',
        '炎热草原上的人们需要盐来维持健康、保存食物，但当地不产盐。撒哈拉沙漠有盐矿，而尼日尔河和塞内加尔河上游一带有黄金。几百年来，骆驼商队大约用两个月穿越沙漠，把成块的盐运往南方，把黄金运往北方。盐有时和黄金一样贵重。控制交易地点的王国通过对贸易征税而富强起来。'],
    },
    {
      title: ['Ghana, Mali and Songhai', '加纳、马里和桑海'], cam: [15, -4, 2.4], sketch: true,
      paint: [
        { fill: { k: 'poly', pts: [[17.5, -12], [17.5, -5], [14, -5], [13.5, -12]], c: C.gold }, t: 0.3, a: 0.45 },
        { fill: { k: 'poly', pts: [[18, -17], [18, 0], [12, 0], [10, -9], [12.5, -17]], c: C.orange }, t: 1.0, a: 0.4 },
        { fill: { k: 'poly', pts: [[19, -11], [19, 5], [13, 8], [10.5, 3], [12.5, -11]], c: C.red }, t: 1.7, a: 0.35 },
      ],
      marks: [mk([15.77, -7.97], 'Ghana Empire: Koumbi Saleh', '加纳帝国：昆比萨利赫', { dot: true, c: C.gold, t: 0.5 }), mk([11.4, -8.4], 'Mali Empire: Niani', '马里帝国：尼亚尼', { dot: true, c: C.orange, t: 1.2 }), mk([16.27, -0.04], 'Songhai Empire: Gao', '桑海帝国：加奥', { dot: true, c: C.red, t: 1.9 })],
      items: ['djenne'],
      body: ['Ancient Ghana (about 300–1200) was not in today\'s Ghana but further north, in Mauritania and Mali; Arab writers called it "the land of gold". Then came the Mali Empire, founded by Sundiata Keita around 1235. Last and largest was the Songhai Empire, ruled from Gao, until a Moroccan army with guns defeated it in 1591. Modern Ghana and Mali took their names from these empires.',
        '古代加纳王国（约 300–1200 年）并不在今天的加纳，而是在更北面的毛里塔尼亚和马里一带，阿拉伯作家称它为“黄金之国”。随后，松迪亚塔·凯塔大约在 1235 年建立了马里帝国。最后也是最大的是以加奥为都城的桑海帝国，1591 年被装备火枪的摩洛哥军队击败。今天的加纳和马里就以这些古国命名。'],
    },
    {
      title: ['Mansa Musa and Timbuktu', '曼萨·穆萨与廷巴克图'], cam: [22, 12, 3.4],
      lines: [{ pts: [[16.77, -3], [30.0, 31.2], [21.4, 39.8]], c: C.gold, t: 0.4, arrow: true, dur: 2.4 }],
      marks: [mk([16.77, -3], 'Timbuktu', '廷巴克图', { dot: true, big: true, t: 0.3 }), mk([30.0, 31.2], 'Cairo', '开罗', { dot: true, t: 1.4 }), mk([21.4, 39.8], 'Mecca', '麦加', { dot: true, t: 2.4 })],
      items: ['pp_mansamusa'],
      body: ['Mansa Musa, king of Mali, set out for Mecca in 1324 with thousands of people and camels loaded with gold. In Cairo he gave away and spent so much gold that its value there fell for years. News of his wealth reached Europe, where maps showed him holding a golden nugget. Back home he built mosques, and Timbuktu grew into a centre of trade and learning, with scholars and libraries of handwritten books.',
        '马里国王曼萨·穆萨在 1324 年出发去麦加朝圣，随行有成千上万的人和满载黄金的骆驼。他在开罗赏赐和花费了大量黄金，使当地金价多年低迷。他的财富传到欧洲，欧洲地图上画着他手捧金块的样子。回国后他修建清真寺，廷巴克图发展成贸易和学术中心，有许多学者和收藏手抄本的图书馆。'],
    },
    {
      title: ['Griots: living libraries', '格里奥：活的图书馆'], cam: [13, -8, 2.5],
      marks: [mk([11.4, -8.4], 'Niani: home of Sundiata', '尼亚尼：松迪亚塔的故乡', { dot: true, t: 0.4 }), mk([13.45, -15.4], 'kora music of the Gambia', '冈比亚的科拉琴音乐', { dot: true, c: C.violet, t: 0.9 })],
      body: ['Most history in West Africa was not written down but spoken and sung. A griot is a storyteller, historian, musician and adviser who remembers the families, kings and battles of a people and performs them, often with the kora, a harp-like instrument with 21 strings. The great "Epic of Sundiata", about the founder of Mali, has been passed down by griots for about 800 years.',
        '西非的大部分历史不是写下来的，而是口口相传、用歌声唱出来的。格里奥是说书人、史官、乐师和顾问，记得一个民族的家族、国王和战争，并常常弹着科拉琴（一种有 21 根弦的竖琴类乐器）表演出来。讲述马里开国君主的《松迪亚塔史诗》，就由格里奥传唱了约 800 年。'],
    },
  ],
  quiz: [
    mcq(['In the salt trade, what did West Africans get in return for their gold?', '在盐金贸易中，西非人用黄金换来了什么？'], ['Salt from the Sahara', '撒哈拉的盐'],
      [['Guns from Europe', '欧洲的枪支'], ['Rice from China', '中国的大米'], ['Cocoa from the Americas', '美洲的可可']],
      ['Caravans brought slabs of Saharan salt south and carried gold back north.', '商队把撒哈拉的盐块运往南方，再把黄金运回北方。'], ['salt trade', '盐金贸易']),
    mcq(['Who was Mansa Musa?', '曼萨·穆萨是谁？'], ['A rich king of Mali who went to Mecca in 1324', '1324 年去麦加朝圣的富有的马里国王'],
      [['A Portuguese explorer', '一位葡萄牙探险家'], ['The first president of Ghana', '加纳第一任总统'], ['A griot who wrote the Epic of Sundiata', '写下《松迪亚塔史诗》的格里奥']],
      ['His journey made Mali famous as one of the richest kingdoms in the world.', '他的朝圣之旅让马里以世界上最富有的王国之一而闻名。'], ['Mansa Musa', '曼萨·穆萨']),
    mcq(['What is a griot?', '格里奥是什么人？'], ['A storyteller and musician who keeps a people\'s history', '传承民族历史的说书人和乐师'],
      [['A trader who crosses the Sahara', '穿越撒哈拉的商人'], ['A king of the Songhai Empire', '桑海帝国的国王'], ['A kind of mud-brick mosque', '一种泥砖清真寺']],
      ['Griots remember and perform history, often with the kora.', '格里奥记住并表演历史，常常弹奏科拉琴。'], ['griot', '格里奥']),
    { q: ['Put the empires in order, oldest first.', '把这些帝国按时间排序，最早的在前。'],
      order: [['Ghana Empire', '加纳帝国'], ['Mali Empire', '马里帝国'], ['Songhai Empire', '桑海帝国']],
      why: ['Ghana (about 300–1200), Mali (about 1235–1600), Songhai (about 1460–1591).', '加纳（约 300–1200 年）、马里（约 1235–1600 年）、桑海（约 1460–1591 年）。'] },
    mcq(['Which city became a famous centre of trade and learning in the Mali Empire?', '哪座城市成为马里帝国著名的贸易和学术中心？'], ['Timbuktu', '廷巴克图'],
      [['Lagos', '拉各斯'], ['Kinshasa', '金沙萨'], ['Dakar', '达喀尔']],
      ['Timbuktu, on the Niger at the edge of the Sahara, had scholars and libraries of manuscripts.', '廷巴克图位于撒哈拉边缘的尼日尔河畔，有许多学者和手抄本图书馆。'], ['Timbuktu', '廷巴克图']),
  ],
};
