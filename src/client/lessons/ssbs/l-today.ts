/** SSBS study lesson, part 3: West and Central Africa today, and the questions from the worksheets. */
import { C, mk, type Lesson } from '../kit.ts';
import { CONGO } from '../l-world.ts';
import { mcq } from './helpers.ts';

const unit = ['SSBS · West and Central Africa', 'SSBS · 西非与中非'] as const;
const LANDLOCKED = ['ML', 'BF', 'NE', 'TD', 'CF'];

export const TODAY_LESSON: Lesson = {
  id: 'ssbs-today', strand: 'world', tracks: [], unit, icon: 'globe', minutes: 10,
  title: ['Africa today: health, wealth and poverty', '今天的非洲：健康、财富与贫困'],
  blurb: ['Malaria, Ebola and TB; why the rich DRC is poor; how geography and corruption hold countries back; microcredit.', '疟疾、埃博拉和结核病；资源丰富的刚果（金）为什么贫穷；地理与腐败如何拖累发展；小额信贷。'],
  keys: [
    ['Malaria, spread by mosquitoes, kills hundreds of thousands a year; about 95% of the deaths are in Africa.', '疟疾由蚊子传播，每年造成数十万人死亡，约 95% 发生在非洲。'],
    ['Ebola (2014–16) hit Guinea, Liberia and Sierra Leone; TB spreads through the air but can be cured.', '埃博拉（2014–2016 年）重创几内亚、利比里亚和塞拉利昂；结核病通过空气传播，但可以治愈。'],
    ['The DRC is rich in cobalt, copper and diamonds, yet poor because of exploitation, corruption, war and weak infrastructure.', '刚果（金）钴、铜、钻石丰富，却因掠夺、腐败、战争和基础设施落后而贫穷。'],
    ['Geography traps: few harbours, rivers blocked by rapids, landlocked countries, disease and the Sahara.', '地理陷阱：天然良港少、河流被急流阻断、内陆国多、疾病多，还有撒哈拉沙漠。'],
    ['Microcredit gives small loans so poor people, often women, can start businesses.', '小额信贷向穷人（多为妇女）发放小额贷款，帮助他们创业。'],
  ],
  steps: [
    {
      title: ['Malaria, Ebola and tuberculosis', '疟疾、埃博拉和结核病'], cam: [6, 2, 2.5],
      paint: [{ fill: { k: 'land', a2: ['GN', 'LR', 'SL'], c: C.red }, t: 0.6, a: 0.6 }],
      marks: [mk([9.5, -11], 'Ebola 2014–16', '埃博拉 2014–2016 年', { big: true, c: C.red, t: 0.9 }), mk([2, 18], 'malaria all across the tropics', '热带地区疟疾流行', { c: C.orange, t: 1.4 })],
      body: ['Malaria is passed on by the bite of infected mosquitoes, which breed in warm, still water. It kills about 600,000 people a year, and about 95% of those deaths are in Africa, most of them children under five. Bed nets treated with insecticide save many lives, and the first malaria vaccines are now in use. Ebola is a rare but deadly virus spread by contact with a sick person\'s body fluids: the 2014–16 outbreak in Guinea, Liberia and Sierra Leone killed about 11,300 people. Tuberculosis (TB) is a lung disease spread through the air by coughing; it can be cured with six months of medicine, but poor and crowded places struggle to find and treat it.',
        '疟疾由受感染的蚊子叮咬传播，蚊子在温暖的静水中繁殖。疟疾每年造成约 60 万人死亡，其中约 95% 在非洲，大多是五岁以下的儿童。经过杀虫剂处理的蚊帐挽救了许多生命，第一批疟疾疫苗也已经开始使用。埃博拉是一种罕见但致命的病毒，通过接触病人的体液传播：2014–2016 年在几内亚、利比里亚和塞拉利昂暴发的疫情造成约 11300 人死亡。结核病是一种通过咳嗽在空气中传播的肺部疾病，服药六个月可以治愈，但贫困拥挤的地方很难及时发现和治疗。'],
    },
    {
      title: ['Why isn\'t the DRC rich?', '刚果（金）为什么不富裕？'], cam: [-4, 22, 2.4],
      paint: [{ fill: { k: 'land', a2: ['CD'], c: C.gold }, t: 0.3, a: 0.4 }],
      lines: [{ pts: CONGO, c: C.blue, t: 0.6, w: 1.6, dur: 2 }],
      marks: [mk([-10.7, 25.5], 'Katanga: cobalt and copper', '加丹加：钴和铜', { dot: true, c: C.gold, t: 0.9 }), mk([-5.52, 13.6], 'Inga Falls: huge hydropower', '因加瀑布：巨大水能', { dot: true, c: C.blue, t: 1.3 }), mk([1.5, 23], 'rainforest', '热带雨林', { c: C.green, t: 1.6 }), mk([-4.32, 15.31], 'Kinshasa', '金沙萨', { dot: true, t: 1.9 })],
      body: ['The Democratic Republic of the Congo may hold more mineral wealth than almost any country: about 70% of the world\'s cobalt (used in phone and car batteries), plus copper, diamonds, gold and coltan, a huge rainforest and a river that could make enormous amounts of electricity. Yet most people live on very little. Why? Leopold II and Belgium took its riches; after independence the dictator Mobutu ruled for 32 years (1965–97) and stole billions; then wars from 1996 to 2003, the deadliest since the Second World War, killed millions; armed groups still fight over mines in the east. Roads and railways are so poor that much of the country can only be reached by river or plane.',
        '刚果民主共和国的矿产财富可能几乎超过任何国家：钴的产量约占世界的 70%（用于手机和汽车电池），还有铜、钻石、黄金和钶钽矿，加上广阔的雨林和一条可以发出巨量电力的大河。然而大多数人生活非常贫困。为什么？利奥波德二世和比利时掠夺了它的财富；独立后，独裁者蒙博托统治 32 年（1965–1997 年），侵吞了数十亿美元；1996–2003 年的战争是二战以来死亡人数最多的冲突，夺去了数百万人的生命；东部的武装团体至今仍在争夺矿山。道路和铁路非常落后，全国很多地方只能靠河运或飞机到达。'],
    },
    {
      title: ['How geography can trap a country', '地理如何困住一个国家'], cam: [6, 8, 2.6],
      paint: [{ fill: { k: 'land', a2: LANDLOCKED, c: C.orange }, t: 0.3, a: 0.5 }],
      lines: [{ pts: CONGO, c: C.blue, t: 0.8, w: 1.4, dur: 1.6 }],
      marks: [mk([15, 3], 'landlocked: far from any port', '内陆国：远离港口', { big: true, c: C.orange, t: 0.6 }), mk([-5.6, 13.6], 'rapids block ships', '急流挡住船只', { dot: true, c: C.red, t: 1.4 }), mk([2, -4], 'smooth coast, few natural harbours', '海岸平直，天然良港少', { c: C.white, t: 1.8 })],
      body: ['Some say Africa\'s geography works against it. The coastline is smooth, with few deep bays for natural harbours. Rivers drop off the high plateau in rapids and waterfalls near the sea, so ships cannot sail far inland the way they can up the Rhine or the Mississippi. Many countries are landlocked, so their goods must cross a neighbour\'s land to reach a port. The Sahara cut West Africa off from Europe and Asia; heat and wet help diseases such as malaria spread; and many soils are poor. Geography is not destiny, though: good roads, railways, power and honest government can overcome it.',
        '有人认为非洲的地理条件对它不利。海岸线平直，缺少能做天然良港的深水海湾。河流从高原流下，在入海口附近形成急流和瀑布，船只无法像在莱茵河或密西西比河上那样深入内陆。许多国家是内陆国，货物必须穿过邻国才能到达港口。撒哈拉沙漠把西非与欧洲、亚洲隔开；湿热的气候让疟疾等疾病容易传播；许多地方土壤贫瘠。不过，地理并不决定命运：良好的道路、铁路、电力和清廉的政府可以克服这些困难。'],
    },
    {
      title: ['Infrastructure and corruption', '基础设施与腐败'], cam: [8, 4, 2.4],
      lines: [{ pts: [[6.45, 3.4], [9.06, 7.49], [12.0, 8.5]], c: C.gold, t: 0.4, dur: 1.4 }, { pts: [[5.32, -4.02], [12.37, -1.52]], c: C.gold, t: 0.9, dur: 1.4 }, { pts: [[14.69, -17.45], [12.64, -8.0]], c: C.gold, t: 1.3, dur: 1.4 }],
      marks: [mk([6.45, 3.4], 'Lagos', '拉各斯', { dot: true, t: 0.4 }), mk([5.32, -4.02], 'Abidjan', '阿比让', { dot: true, t: 0.9 }), mk([14.69, -17.45], 'Dakar', '达喀尔', { dot: true, t: 1.3 })],
      body: ['Infrastructure is the roads, railways, ports, power lines, water pipes and phone networks a country needs to work. Colonial railways ran only from mines and plantations to the coast, not between African cities, so trade between neighbours is still hard. In Nigeria, Africa\'s biggest oil producer, power cuts are common and many businesses run their own generators. Corruption makes it worse: when officials take bribes or steal public money, roads and schools are not built, and investors stay away. New ports, railways and solar power are now changing parts of the region.',
        '基础设施是一个国家运转所需要的公路、铁路、港口、电网、自来水管道和通信网络。殖民时期的铁路只从矿山和种植园通往海岸，而不连接非洲城市，所以邻国之间的贸易至今仍很困难。尼日利亚是非洲最大的石油生产国，却经常停电，许多企业只能自己发电。腐败让情况更糟：官员收受贿赂或侵吞公款，道路和学校就建不起来，投资者也不敢来。如今，新的港口、铁路和太阳能发电正在改变这一地区的一些地方。'],
    },
    {
      title: ['Microcredit: small loans, big change', '小额信贷：小贷款，大改变'], cam: [8, 0, 2.5],
      marks: [mk([12.37, -1.52], 'a loan for a market stall', '一笔开小摊的贷款', { dot: true, c: C.lime, t: 0.5 }), mk([5.6, -0.19], 'a loan for a sewing machine', '一笔买缝纫机的贷款', { dot: true, c: C.lime, t: 0.9 })],
      body: ['Banks rarely lend to people with no savings or property. Microcredit offers very small loans, sometimes under 100 dollars, to poor people, most often women, to buy a sewing machine, seeds, a few goats or goods for a market stall. Borrowers often meet in groups and help each other repay. The idea was made famous by Muhammad Yunus and his Grameen Bank in Bangladesh, which won the Nobel Peace Prize in 2006, and it spread across Africa. It does not solve everything, but it helps families earn more and send children to school.',
        '银行很少把钱借给没有存款和财产的人。小额信贷向穷人（多数是妇女）提供很小额的贷款，有时不到 100 美元，用来买缝纫机、种子、几只山羊，或摆摊用的货物。借款人常常结成小组，互相帮助按时还款。孟加拉国的尤努斯和他创办的格莱珉银行让这个做法闻名世界，并于 2006 年获得诺贝尔和平奖，随后这一做法传遍非洲。它不能解决所有问题，但能帮助家庭增加收入、送孩子上学。'],
    },
  ],
  quiz: [
    mcq(['How is malaria spread?', '疟疾是怎样传播的？'], ['By the bite of infected mosquitoes', '通过受感染的蚊子叮咬'],
      [['By drinking dirty water', '喝脏水'], ['By shaking hands', '握手'], ['By eating bad meat', '吃坏了的肉']],
      ['Mosquitoes carry the malaria parasite; bed nets and clearing still water help stop them.', '蚊子携带疟原虫；蚊帐和清除积水有助于阻止传播。'], ['malaria', '疟疾']),
    mcq(['Which three countries were hit hardest by the 2014–16 Ebola outbreak?', '2014–2016 年埃博拉疫情最严重的是哪三个国家？'], ['Guinea, Liberia and Sierra Leone', '几内亚、利比里亚和塞拉利昂'],
      [['Nigeria, Ghana and Togo', '尼日利亚、加纳和多哥'], ['Chad, Niger and Mali', '乍得、尼日尔和马里'], ['Angola, Gabon and Cameroon', '安哥拉、加蓬和喀麦隆']],
      ['The outbreak began in Guinea in late 2013 and killed about 11,300 people.', '疫情于 2013 年底在几内亚开始，造成约 11300 人死亡。'], ['Ebola', '埃博拉']),
    mcq(['How does tuberculosis (TB) spread?', '结核病是怎样传播的？'], ['Through the air when a sick person coughs', '病人咳嗽时通过空气传播'],
      [['Through mosquito bites', '通过蚊子叮咬'], ['Only through food', '只通过食物'], ['It does not spread between people', '不会在人与人之间传播']],
      ['TB attacks the lungs; it can be cured with about six months of medicine.', '结核病侵害肺部，服药约六个月可以治愈。'], ['tuberculosis', '结核病']),
    mcq(['Which is NOT a reason the DRC is poor despite its riches?', '下列哪一项不是刚果（金）资源丰富却贫穷的原因？'], ['It has no valuable minerals', '它没有值钱的矿产'],
      [['Corruption under Mobutu', '蒙博托时期的腐败'], ['Long wars over land and mines', '争夺土地和矿山的长期战争'], ['Poor roads and railways', '道路和铁路落后']],
      ['The DRC has about 70% of the world\'s cobalt and much copper and diamonds; the problem is how the wealth has been used.', '刚果（金）的钴约占世界的 70%，还有大量铜和钻石；问题在于这些财富被如何使用。'], ['Why isn\'t the DRC rich?', '刚果（金）为什么不富裕？']),
    mcq(['Why can\'t ocean ships sail far up most African rivers?', '为什么远洋船只无法沿非洲大多数河流深入内陆？'], ['Rapids and waterfalls near the coast block them', '入海口附近的急流和瀑布挡住了它们'],
      [['The rivers are frozen in winter', '河流冬天结冰'], ['The rivers flow into the Sahara', '河流流进撒哈拉沙漠'], ['There are too many bridges', '桥太多了']],
      ['Rivers fall off Africa\'s high plateau close to the sea, like the Congo below Kinshasa.', '河流在临近大海处从非洲高原上跌落，例如金沙萨下游的刚果河。'], ['geography trap', '地理陷阱']),
    mcq(['What is microcredit?', '什么是小额信贷？'], ['Very small loans to help poor people start businesses', '帮助穷人创业的小额贷款'],
      [['Free food for hungry families', '给饥饿家庭的免费食物'], ['A tiny computer chip', '一块微型电脑芯片'], ['A tax on imports', '一种进口税']],
      ['Borrowers use the loans for things like seeds, animals or a market stall, and pay them back.', '借款人用贷款买种子、牲畜或开小摊，然后按期还款。'], ['microcredit', '小额信贷']),
    mcq(['What is infrastructure?', '什么是基础设施？'], ['Roads, railways, ports, power and water systems', '公路、铁路、港口、电力和供水系统'],
      [['A country\'s army', '一个国家的军队'], ['The history told by griots', '格里奥讲述的历史'], ['Land that can grow crops', '能种庄稼的土地']],
      ['Without good infrastructure it is hard to trade, run factories or reach schools and hospitals.', '没有良好的基础设施，就很难开展贸易、开办工厂，也很难上学和就医。'], ['infrastructure', '基础设施']),
    mcq(['What is corruption?', '什么是腐败？'], ['Using power dishonestly for personal gain, like taking bribes', '为私利不正当地使用权力，例如收受贿赂'],
      [['Lending money to small businesses', '向小企业放贷'], ['Building new railways', '修建新铁路'], ['Planting trees in the Sahel', '在萨赫勒种树']],
      ['Corruption takes money meant for roads, schools and hospitals.', '腐败侵吞了本该用于修路、建学校和医院的钱。'], ['corruption', '腐败']),
  ],
};
