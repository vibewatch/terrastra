/**
 * Expanded PEP grade-level geography lessons and comprehensive per-grade Question Banks (综合题库与期末模拟):
 * - New curriculum lessons:
 *   - `se-asia` (g7b · 七下：东南亚——十字路口与热带农业)
 *   - `china-hazards` (g8a · 八上：中国的自然灾害与防灾减灾)
 *   - `prd` (g8b · 八下：珠江三角洲与粤港澳大湾区)
 *   - `h-motion` (h2 · 高中选择性必修 1：地球的运动——时差、昼夜长短与正午太阳高度)
 * - Six comprehensive grade question banks (`exam-g7a`, `exam-g7b`, `exam-g8a`, `exam-g8b`, `exam-h1`, `exam-h2`)
 *   that draw fresh multi-section tests (`exam: true`, `gen()`) from both curated synthesis banks and every lesson in that grade.
 */
import { C, arrows, mer, mk, par, type Grade, type Lesson, type Pair, type Quiz, type Step } from './kit.ts';
import { QINLING_HUAIHE, STEP1, STEP2 } from './geo.ts';
import { mulberry32, shuffle } from '../../shared/lib/rng.ts';

const SEC = {
  match: ['Part 1 · Concept Matching', '第一部分 · 概念与区域配对'] as const,
  mc: ['Part 2 · Core Choice & Multi-Select', '第二部分 · 核心选择与多选'] as const,
  skill: ['Part 3 · Map, Order & Calculation', '第三部分 · 读图、排序与计算'] as const,
};

// ============================================================================
// 1. New Grade-Level Curriculum Lessons (新增年级核心课程)
// ============================================================================

export const EXTRA_GRADE_LESSONS: Lesson[] = [
  {
    id: 'se-asia',
    strand: 'world',
    grade: 'g7b',
    tracks: ['uk', 'us', 'ib', 'au'],
    unit: ['Our neighbouring regions and countries', '我们邻近的地区和国家'],
    icon: 'ship',
    minutes: 9,
    title: ['Southeast Asia: Crossroads & Tropical Farming', '东南亚：“十字路口”与热带农业'],
    blurb: ['The Strait of Malacca, parallel mountains and rivers on the Indo-China Peninsula, and monsoon rice and cash crops.', '马六甲海峡、中南半岛“山河相间、纵列分布”的地形，以及水稻和热带经济作物。'],
    keys: [
      ['Southeast Asia consists of the Indo-China Peninsula and the Malay Archipelago, sitting at the crossroads between Asia and Oceania, the Pacific and Indian Oceans.', '东南亚由中南半岛和马来群岛两部分组成，地处亚洲与大洋洲、太平洋与印度洋之间的“十字路口”。'],
      ['The Strait of Malacca between the Malay Peninsula and Sumatra is the shortest sea route linking Europe/Africa with East Asia.', '位于马来半岛和苏门答腊岛之间的马六甲海峡，是沟通太平洋与印度洋、连接欧洲和非洲至东亚最短航线的咽喉要道。'],
      ['The Indo-China Peninsula is higher in the north and lower in the south, with mountains and rivers running north-to-south; big cities sit on river deltas.', '中南半岛地势北高南低，具有“山河相间、纵列分布”的特征；大城市主要分布在河流沿岸和河口三角洲。'],
      ['Hot, wet tropical monsoon and rainforest climates make Southeast Asia a major producer of rice, natural rubber, palm oil, coconut, and abaca.', '湿热的热带季风和热带雨林气候使东南亚成为世界重要的稻米产区，也是天然橡胶、油棕、椰子和蕉麻的最大产地。'],
    ],
    steps: [
      {
        title: ['The crossroads and the Strait of Malacca', '“十字路口”的位置与马六甲海峡'],
        cam: [8, 106, 2.8],
        names: true,
        paint: [{ fill: { k: 'land', a2: ['MM', 'TH', 'LA', 'KH', 'VN', 'MY', 'SG', 'ID', 'PH', 'BN', 'TL'], c: C.green }, a: 0.48 }],
        lines: [
          { pts: [[12, 80], [6.0, 95.5], [2.5, 101.5], [1.25, 103.8], [6.0, 109.0], [18.0, 116.0], [30.0, 123.0]], c: C.gold, w: 2.2, flow: true, arrow: true, dur: 2.0 },
        ],
        marks: [
          mk([16, 101], 'Indo-China Peninsula', '中南半岛', { big: true, c: C.lime, t: 0.3 }),
          mk([-2, 118], 'Malay Archipelago', '马来群岛', { big: true, c: C.teal, t: 0.5 }),
          mk([2.5, 101.2], 'Strait of Malacca', '马六甲海峡', { dot: true, big: true, c: C.red, t: 0.8 }),
          mk([1.29, 103.85], 'Singapore', '新加坡', { dot: true, c: C.gold, t: 1.1 }),
        ],
        body: [
          'Southeast Asia lies in the southeastern corner of Asia and comprises two distinct parts: the Indo-China Peninsula on the mainland and the vast Malay Archipelago of more than 20,000 islands. Situated between Asia and Oceania, and linking the Pacific Ocean with the Indian Ocean, it is a vital maritime crossroads. The narrow Strait of Malacca between the Malay Peninsula and Sumatra Island is the busiest shipping lane for oil tankers and cargo vessels bound for East Asia.',
          '东南亚位于亚洲东南部，包括中南半岛和马来群岛两大部分。它处于亚洲与大洋洲、印度洋与太平洋之间的“十字路口”。位于马来半岛和苏门答腊岛之间的马六甲海峡，是欧洲、非洲向东航行到东南亚、东亚各港口最短航线的必经之地，被誉为海上交通的“咽喉”。',
        ],
      },
      {
        title: ['Mountains, rivers and delta capitals', '山河相间与河口三角洲城市'],
        cam: [16, 102, 2.2],
        sketch: true,
        lines: [
          { pts: [[28, 98.8], [22, 100.8], [18, 102.6], [15, 105.8], [10.3, 106.5]], c: C.blue, w: 2.0, flow: true, arrow: true, dur: 1.8 },
          { pts: [[28, 97.5], [22, 96.0], [17, 95.5]], c: C.blue, w: 1.8, flow: true, arrow: true, dur: 1.8 },
        ],
        marks: [
          mk([13.75, 100.5], 'Bangkok (Chao Phraya)', '曼谷（昭披耶河）', { dot: true, c: C.gold, t: 0.4 }),
          mk([21.03, 105.85], 'Hanoi (Red River)', '河内（红河）', { dot: true, c: C.gold, t: 0.7 }),
          mk([11.56, 104.92], 'Phnom Penh (Mekong)', '金边（湄公河）', { dot: true, c: C.gold, t: 1.0 }),
          mk([17.97, 102.63], 'Vientiane (Mekong)', '万象（湄公河）', { dot: true, c: C.gold, t: 1.2 }),
          mk([16.84, 96.17], 'Yangon (Irrawaddy)', '仰光（伊洛瓦底江）', { dot: true, c: C.gold, t: 1.4 }),
        ],
        body: [
          'The mountains and rivers of the Indo-China Peninsula extend southward from China, forming a pattern of parallel ranges and valleys higher in the north and lower in the south. The Mekong (called the Lancang River in China) flows through six countries before entering the South China Sea. Because river banks and deltas offer flat alluvial soil, abundant water, and easy water transport, nearly all major cities — Hanoi, Vientiane, Phnom Penh, Bangkok, and Yangon — grew along great rivers.',
          '中南半岛北连中国，山脉和河流多由北向南延伸，具有“山河相间、纵列分布”的特点，地势北高南低。湄公河在中国境内称澜沧江，流经六国注入南海，是亚洲流经国家最多的国际河流。河流沿岸及河口三角洲地势平坦、土壤肥沃、易于灌溉、交通便利，因此河内、万象、金边、曼谷、仰光等大城市都分布在这里。',
        ],
      },
      {
        title: ['Tropical climates, rice and cash crops', '湿热气候、水稻与热带经济作物'],
        cam: [5, 108, 2.8],
        lines: [par(0, C.red, 0.2), par(23.436, C.gold, 0.4)],
        marks: [
          mk([15.0, 101.0], 'Thailand: Rice & Natural Rubber', '泰国：世界重要稻米与天然橡胶产地', { dot: true, c: C.lime, t: 0.5 }),
          mk([4.2, 102.0], 'Malaysia: Oil Palm', '马来西亚：油棕与棕榈油王国', { dot: true, c: C.orange, t: 0.8 }),
          mk([-1.5, 114.0], 'Indonesia: Coconut & Tropical Rainforest', '印度尼西亚：椰子与热带雨林', { dot: true, c: C.green, t: 1.1 }),
          mk([13.0, 122.0], 'Philippines: Abaca & Coconut', '菲律宾：蕉麻与椰子出口国', { dot: true, c: C.teal, t: 1.4 }),
        ],
        body: [
          'Most of the Indo-China Peninsula and the northern Philippines have a tropical monsoon climate with distinct rainy and dry seasons, while the Malay Archipelago straddling the equator has a year-round hot and wet tropical rainforest climate. High temperatures, abundant rainfall, and dense population make rice the staple food crop, while tropical plantation crops — natural rubber, oil palm, coconut, and abaca — lead the world in output.',
          '中南半岛绝大部分和菲律宾群岛北部属于终年高温、分旱雨两季的热带季风气候；赤道横穿的马来群岛绝大部分属于终年高温多雨的热带雨林气候。高温多雨的气候条件，加上耕地较少、人口稠密、种植历史悠久，使水稻成为主要粮食作物，同时也使东南亚成为世界天然橡胶、油棕、椰子和蕉麻的最大产区。',
        ],
      },
    ],
    quiz: [
      {
        q: ['Which strait between the Malay Peninsula and Sumatra links the Indian Ocean with the Pacific Ocean?', '位于马来半岛和苏门答腊岛之间，沟通印度洋与太平洋的咽喉要道是？'],
        options: [['Strait of Malacca', '马六甲海峡'], ['Strait of Hormuz', '霍尔木兹海峡'], ['Bering Strait', '白令海峡'], ['Strait of Gibraltar', '直布罗陀海峡']],
        answer: 0,
        tag: ['Strait of Malacca', '马六甲海峡'],
        why: ['The Strait of Malacca lies between the Malay Peninsula and Sumatra Island and is the shortest sea lane between the Indian and Pacific Oceans.', '马六甲海峡位于马来半岛与苏门答腊岛之间，是沟通太平洋与印度洋的咽喉要道。'],
      },
      {
        q: ['What best describes the terrain and river pattern of the Indo-China Peninsula?', '中南半岛的地形与河流分布特征可以概括为？'],
        options: [
          ['Mountains and rivers alternate north-to-south, higher in the north', '山河相间、纵列分布，地势北高南低'],
          ['High central plateau with rivers radiating outward in all directions', '中部高、四周低，河流呈放射状流向四周'],
          ['Plains in the north and high fold mountains in the south', '北部广阔平原、南部高大褶皱山脉'],
          ['Three broad terrain steps descending from west to east', '西高东低，呈三级阶梯状分布'],
        ],
        answer: 0,
        tag: ['Indo-China terrain', '中南半岛地形'],
        why: ['Rivers on the Indo-China Peninsula flow from north to south between parallel mountain chains.', '中南半岛山脉、大河多由北向南延伸，地势北高南低，具有山河相间、纵列分布的特点。'],
      },
      {
        q: ['Match each Southeast Asian capital city with the river it sits beside.', '把东南亚首都（或大城市）与它所在的河流配对。'],
        match: [
          [['Hanoi (Vietnam)', '河内（越南）'], ['Red River', '红河']],
          [['Bangkok (Thailand)', '曼谷（泰国）'], ['Chao Phraya River', '昭披耶河（湄南河）']],
          [['Phnom Penh (Cambodia)', '金边（柬埔寨）'], ['Mekong River', '湄公河']],
          [['Yangon (Myanmar)', '仰光（缅甸）'], ['Irrawaddy River', '伊洛瓦底江']],
        ],
        tag: ['Southeast Asian rivers & capitals', '东南亚河流与城市'],
        why: ['Hanoi sits on the Red River, Bangkok on the Chao Phraya, Phnom Penh and Vientiane on the Mekong, and Yangon on the Irrawaddy.', '河内位于红河沿岸，曼谷位于昭披耶河（湄南河）沿岸，金边和万象位于湄公河沿岸，仰光位于伊洛瓦底江沿岸。'],
      },
      {
        q: ['Which of the following are major reasons why Southeast Asia grows rice on a large scale?', '东南亚大面积种植水稻的主要原因有哪些？'],
        options: [
          ['High temperatures and abundant rainfall', '气候高温多雨，水热条件好'],
          ['Dense population providing abundant labour and high food demand', '人口稠密，劳动力丰富且粮食需求量大'],
          ['Long history of wet-rice cultivation', '种植水稻的历史悠久'],
          ['Vast temperate chernozem plains with sparse population', '地广人稀的温带黑土大平原'],
        ],
        multi: [0, 1, 2],
        tag: ['Southeast Asia rice farming', '东南亚水稻种植条件'],
        why: ['Hot, wet tropical climates, dense population, and centuries of farming experience favour paddy rice, not temperate plains.', '高温多雨的气候、稠密的人口与丰富的劳动力以及悠久的种植历史，是东南亚种植水稻的有利条件。'],
      },
      {
        q: ['Tap the Strait of Malacca on the globe.', '在地球仪上点出马六甲海峡的位置。'],
        at: [2.5, 101.2],
        tolKm: 600,
        tag: ['Strait of Malacca', '马六甲海峡'],
        why: ['The Strait of Malacca runs between the Malay Peninsula and Sumatra Island near 2.5°N, 101°E.', '马六甲海峡位于马来半岛与苏门答腊岛之间（约 2.5°N，101°E）。'],
      },
    ],
  },
  {
    id: 'china-hazards',
    strand: 'china',
    grade: 'g8a',
    tracks: ['uk', 'us', 'ib'],
    unit: ['China\'s natural environment', '中国的自然环境'],
    icon: 'volcano',
    minutes: 9,
    title: ['China\'s natural hazards and prevention', '中国的自然灾害与防灾减灾'],
    blurb: ['Monsoon droughts and floods, typhoons, cold waves, and why earthquakes and debris flows cluster in the southwest.', '旱涝、台风、寒潮等气象灾害，以及地震、滑坡、泥石流等地质灾害的分布与防灾减灾。'],
    keys: [
      ['Meteorological hazards include droughts (most frequent in North China, especially spring drought), floods (middle-lower Yangtze and southern plains), typhoons (southeast coast in summer/autumn), and cold waves (from Siberia/Mongolia).', '气象灾害主要有干旱（华北春旱最突出）、洪涝（秦岭—淮河以南及长江中下游多发）、台风（夏秋季节东南沿海）和寒潮（源于西伯利亚、蒙古一带）。'],
      ['China sits near the junction of the Eurasian, Pacific, and Indian Ocean plates; earthquakes are frequent in Taiwan and the Southwest.', '我国地处亚欧板块、太平洋板块和印度洋板块交界附近，地壳活跃，台湾省和西南地区地震频发。'],
      ['Landslides and debris flows cluster in the mountainous central and southwestern regions where slopes are steep and summer rains are heavy.', '滑坡和泥石流主要集中在中西部山区，以西南地区最为集中（地形崎岖、岩石破碎、夏季暴雨集中）。'],
      ['During an earthquake indoors, shelter beside sturdy furniture or load-bearing walls (never take the lift); during a debris flow, run perpendicular to the valley up the slope.', '地震发生时室内应护头躲在坚固家具旁或承重墙角（切勿乘电梯）；遭遇泥石流应向垂直于泥石流流动方向的山坡高处逃生。'],
    ],
    steps: [
      {
        title: ['Meteorological hazards: monsoons, typhoons and cold waves', '气象灾害：旱涝、台风与寒潮'],
        cam: [34, 110, 2.8],
        sketch: true,
        lines: [
          ...arrows([[[50, 92], [43, 104], [36, 114], [28, 116]]], C.blue, 0.2, 2.0),
          ...arrows([[[16, 130], [21, 122], [25, 118]], [[15, 122], [19, 114], [22, 110]]], C.red, 0.8, 2.0),
          { pts: QINLING_HUAIHE, c: C.gold, w: 1.8, dur: 1.0 },
        ],
        marks: [
          mk([38.0, 115.5], 'North China Plain: Spring Drought', '华北平原：春旱严重', { dot: true, c: C.orange, t: 0.4 }),
          mk([30.0, 114.5], 'Middle–Lower Yangtze: Summer Floods', '长江中下游：洪涝多发', { dot: true, c: C.teal, t: 0.7 }),
          mk([23.5, 119.5], 'SE Coast: Typhoons (Summer–Autumn)', '东南沿海：夏秋台风', { dot: true, c: C.red, t: 1.0 }),
          mk([46.0, 102.0], 'Cold Wave Track (Autumn–Spring)', '寒潮南下路径（秋末至初春）', { c: C.blue, t: 0.3 }),
        ],
        body: [
          'Because the summer monsoon varies in strength and timing from year to year, droughts and floods are the most widespread meteorological hazards in China. In spring, temperatures rise rapidly across the North China Plain while rain has not yet arrived and winter wheat needs water, causing severe spring drought. Floods are most common in the eastern plains, especially south of the Qinling–Huaihe line. In summer and autumn, tropical cyclones (typhoons) strike the southeast coast with gales and torrential rain, while from late autumn to early spring, cold waves sweep south from Mongolia and Siberia.',
          '受夏季风强弱和进退失常影响，旱涝是我国最常见、影响最广的气象灾害。华北平原春季气温回升快、蒸发旺盛，而雨季未到、冬小麦返青需水量大，极易发生春旱；洪涝多发生在东部平原特别是秦岭—淮河以南地区。夏秋季节东南沿海常受台风侵袭，秋末至初春则常有来自蒙古、西伯利亚的强冷空气（寒潮）大举南下。',
        ],
      },
      {
        title: ['Geological hazards: earthquakes, landslides and debris flows', '地质灾害：地震、滑坡与泥石流'],
        cam: [30, 104, 2.6],
        sketch: true,
        lines: [
          { pts: STEP1, c: C.violet, w: 2.0, dur: 1.2 },
          { pts: STEP2, c: C.brown, w: 1.8, dur: 1.2 },
        ],
        marks: [
          mk([23.8, 121.5], 'Taiwan: Pacific–Eurasian Plate Boundary', '台湾：环太平洋地震带', { dot: true, c: C.red, t: 0.4 }),
          mk([31.0, 103.4], 'Sichuan–Yunnan: Mediterranean–Himalayan Belt', '川滇地区：地中海—喜马拉雅地震带', { dot: true, c: C.red, t: 0.7 }),
          mk([27.5, 100.5], 'Hengduan Mountains: Landslides & Debris Flows', '横断山区：滑坡、泥石流多发', { dot: true, c: C.orange, t: 1.0 }),
        ],
        body: [
          'China spans two of the world\'s major seismic belts: the Circum-Pacific belt in the east (Taiwan) and the Mediterranean–Himalayan belt in the southwest (Tibet, Sichuan, Yunnan), where the Indian Plate collides with the Eurasian Plate. In the mountainous central and southwestern regions — especially along the transition between the first and second terrain steps — steep slopes, fractured rock, and heavy summer downpours trigger frequent landslides and debris flows.',
          '我国地处亚欧板块与太平洋板块、印度洋板块交界地带，跨环太平洋地震带（台湾省最典型）和地中海—喜马拉雅地震带（西南青藏、川滇地区）。中西部山区特别是西南地区（第一、二级阶梯交界处），山高谷深、坡度陡峻、岩石破碎，加之夏季暴雨集中，是滑坡和泥石流最集中的地区。',
        ],
      },
      {
        title: ['Disaster prevention and emergency self-rescue', '防灾减灾工程与紧急避险'],
        cam: [34, 108, 2.8],
        marks: [
          mk([41.5, 112.0], 'Three-North Shelterbelt Forest', '“三北”防护林工程（防风固沙）', { dot: true, c: C.green, t: 0.4 }),
          mk([30.82, 111.0], 'Three Gorges Dam (Flood Control)', '三峡水利枢纽（防洪调蓄）', { dot: true, c: C.blue, t: 0.7 }),
          mk([30.6, 104.1], 'Seismic Early Warning & Shelters', '地震预警网与应急避难场所', { dot: true, c: C.gold, t: 1.0 }),
        ],
        body: [
          'China combines satellite monitoring, weather radar, ecological projects like the Three-North Shelterbelt, and flood-control reservoirs like Three Gorges with strategic disaster-relief reserves. Knowing how to protect yourself saves lives: when an earthquake strikes indoors, crouch beside sturdy furniture or an interior load-bearing corner and protect your head (never use a lift); outdoors, move to open ground away from buildings and power lines; if caught in a debris flow in a mountain valley, run up the slope perpendicular to the flow path, never downstream along the gully.',
          '我国通过遥感卫星监测预报、建设“三北”防护林、修建三峡等大型水利枢纽以及建立救灾物资储备库来防灾减灾。科学的自救互救至关重要：地震时在室内应迅速护住头部躲在坚固家具下或承重墙角，切勿乘坐电梯；在室外应撤离到空旷地带。在山谷中遭遇泥石流时，应向垂直于泥石流流动方向的山坡高处跑，绝不能顺着沟谷往下跑。',
        ],
      },
    ],
    quiz: [
      {
        q: ['Why does the North China Plain suffer severe drought in spring?', '华北平原在春季最容易发生严重春旱的主要原因是？'],
        options: [
          ['Rapid spring warming and high evaporation before the summer rain belt arrives, while winter wheat needs water', '春季气温回升快、蒸发强，雨季尚未到来，且冬小麦返青需水量大'],
          ['It lies inside the non-monsoon inland desert basin with less than 50 mm of annual rain', '位于非季风区内陆沙漠盆地，年降水量不足 50 毫米'],
          ['Typhoons push all moisture away from North China in March and April', '三四月份台风将华北地区的水汽全部吹散'],
          ['The subtropical high ("dog days" drought) sits over Beijing in April', '四月份副热带高气压带控制华北形成“伏旱”'],
        ],
        answer: 0,
        tag: ['North China spring drought', '华北春旱'],
        why: ['In spring the monsoon rain belt is still in South China, while North China warms fast, winds are strong, and winter wheat needs irrigation.', '春季锋面雨带尚在华南，华北平原气温回升快、风大蒸发强，正值冬小麦返青需水关键期，故春旱严重（伏旱发生在 7—8 月的长江中下游）。'],
      },
      {
        q: ['If you encounter a sudden debris flow in a mountain valley, which way should you run?', '在山区沟谷中如果遭遇突发泥石流，正确的逃生方向是？'],
        options: [
          ['Run up the slope perpendicular to the direction of the debris flow', '向垂直于泥石流流动方向的山坡高处跑'],
          ['Run fast downstream along the bottom of the valley', '顺着泥石流流动方向往沟谷下游快跑'],
          ['Climb tall trees at the bottom of the gully', '爬上沟谷底部的树木等待救援'],
          ['Hide behind loose boulders in the middle of the channel', '躲在河道中央松散的大石块后面'],
        ],
        answer: 0,
        tag: ['Debris flow safety', '泥石流避险'],
        why: ['Debris flows travel down the channel faster than a person can run; climbing perpendicular up the valley side is the only safe escape.', '泥石流顺沟谷下泄速度极快，必须向垂直于泥石流前进方向的两侧山坡高处逃生。'],
      },
      {
        q: ['Match each natural hazard in China with the region where it is most typical.', '将我国常见自然灾害与最典型的多发区配对。'],
        match: [
          [['Typhoons and storm surges', '台风与风暴潮'], ['Southeast coastal provinces (Guangdong, Fujian, Taiwan)', '东南沿海省区（粤、闽、台等）']],
          [['Landslides and debris flows', '滑坡与泥石流'], ['Mountainous Southwest (Hengduan Mountains, Yunnan–Guizhou)', '西南山区（横断山区、云贵高原）']],
          [['Spring drought', '春旱'], ['North China Plain', '华北平原']],
          [['Cold waves and blizzards', '寒潮与暴雪'], ['Northwest, North China and Northeast near the winter monsoon source', '西北、华北、东北（靠近冬季风源地）']],
        ],
        tag: ['China hazard distribution', '中国自然灾害分布'],
        why: ['Typhoons hit the SE coast; debris flows cluster in the steep, rainy SW mountains; spring drought plagues North China; cold waves enter from the north/northwest.', '台风主要影响东南沿海；滑坡泥石流集中在西南山区；春旱最典型在华北平原；寒潮自西北、北方南下。'],
      },
      {
        q: ['Which two regions of China have no or almost no impact from cold waves because of high terrain or low latitude?', '受高大地形阻挡或纬度位置较低影响，我国几乎不受寒潮影响或影响极小的地区包括？'],
        options: [
          ['Qinghai–Tibet Plateau (extremely high elevation)', '青藏高原（海拔极高）'],
          ['Southern Yunnan, Hainan and southern Taiwan (low latitude and mountain barriers)', '滇南谷地、海南岛和台湾南部（纬度低且重重山脉阻挡）'],
          ['Inner Mongolia Plateau', '内蒙古高原'],
          ['Northeast Plain', '东北平原'],
        ],
        multi: [0, 1],
        tag: ['Cold wave reach', '寒潮影响范围'],
        why: ['The Qinghai–Tibet Plateau is too high for shallow cold air masses to climb, and southernmost Yunnan/Hainan/Taiwan are shielded by distance and east–west mountain ranges.', '青藏高原海拔高，寒潮难以爬升；滇南、海南和台湾南部纬度低且有重重山脉阻挡，几乎不受寒潮影响。'],
      },
      {
        q: ['Why is Southwest China (Sichuan, Yunnan, Tibet) prone to both earthquakes and landslides/debris flows?', '为什么我国西南地区（川、滇、藏）既多地震，又多滑坡和泥石流？'],
        options: [
          ['It lies at the collision zone of the Eurasian and Indian plates, with steep terrain, fractured rock, and heavy summer rains', '位于亚欧板块与印度洋板块碰撞挤压地带，山高谷深、岩石破碎，且夏季多暴雨'],
          ['It sits at the boundary between the Pacific Plate and the Antarctic Plate', '位于太平洋板块与南极洲板块交界处'],
          ['It is a flat alluvial plain below sea level', '属于海拔低于海平面的平坦冲积平原'],
          ['It is controlled all year by polar continental air masses', '终年受极地大陆气团控制'],
        ],
        answer: 0,
        tag: ['Southwest geological hazards', '西南地质灾害成因'],
        why: ['Tectonic collision fractures the rock along the steep Hengduan step boundary, and intense summer monsoon rains mobilize the loose debris.', '板块碰撞使地壳活跃、岩石破碎，阶梯交界处山高谷深坡陡，加上夏季风带来集中暴雨，导致地震、滑坡、泥石流多发且具有关联性。'],
      },
    ],
  },
  {
    id: 'prd',
    strand: 'china',
    grade: 'g8b',
    tracks: ['ib'],
    unit: ['China\'s regions', '中国的地域差异与区域发展'],
    icon: 'landmark',
    minutes: 8,
    title: ['The Pearl River Delta and Greater Bay Area', '珠江三角洲与粤港澳大湾区'],
    blurb: ['China\'s southern gateway: overseas Chinese ties, industrial upgrading, and cross-estuary mega-bridges.', '祖国的“南大门”：毗邻港澳的区位优势、产业转型升级与跨江通道群。'],
    keys: [
      ['The Pearl River Delta lies in south-central Guangdong around the Pearl River estuary, straddling the Tropic of Cancer, adjacent to Hong Kong and Macau, facing Southeast Asia.', '珠江三角洲位于广东省中南部、珠江下游，北回归线穿过北部，毗邻港澳，与东南亚隔海相望，被称为我国的“南大门”。'],
      ['As a famous hometown of overseas Chinese, it pioneered reform and opening-up, evolving from labor-intensive light manufacturing ("front shop, back factory") to advanced tech and innovation.', '这里是著名的“侨乡”，改革开放先行区，产业从早期的劳动密集型加工制造（“前店后厂”）升级为高新技术、先进装备制造与现代服务业。'],
      ['The Guangdong–Hong Kong–Macau Greater Bay Area links 9 Pearl River Delta cities (Guangzhou, Shenzhen, Zhuhai, etc.) with Hong Kong and Macau.', '粤港澳大湾区由香港、澳门两个特别行政区和广东省广州、深圳、珠海、佛山、惠州、东莞、中山、江门、肇庆九市组成。'],
      ['Mega-projects like the Hong Kong–Zhuhai–Macau Bridge and the Shenzhen–Zhongshan Link join the east and west banks of the Pearl River estuary into a 1-hour living circle.', '港珠澳大桥、深中通道等跨江跨海通道打通了珠江口东西两岸，构建起大湾区“一小时生活圈”。'],
    ],
    steps: [
      {
        title: ['The southern gateway at the Pearl River estuary', '南海之滨的“南大门”与侨乡优势'],
        cam: [22.6, 113.6, 1.9],
        names: true,
        lines: [par(23.436, C.gold, 0.2)],
        marks: [
          mk([23.13, 113.26], 'Guangzhou (Provincial Capital)', '广州（省会·千年商都）', { dot: true, big: true, c: C.gold, t: 0.3 }),
          mk([22.54, 114.06], 'Shenzhen (SEZ · Tech Hub)', '深圳（经济特区·科创中心）', { dot: true, big: true, c: C.green, t: 0.6 }),
          mk([22.27, 113.58], 'Zhuhai (SEZ)', '珠海（经济特区）', { dot: true, c: C.teal, t: 0.8 }),
          mk([22.32, 114.17], 'Hong Kong', '香港', { dot: true, c: C.red, t: 1.0 }),
          mk([22.19, 113.54], 'Macau', '澳门', { dot: true, c: C.orange, t: 1.2 }),
        ],
        body: [
          'Located where the West, North, and East Rivers converge to enter the South China Sea, the Pearl River Delta is a fertile alluvial plain crisscrossed by waterways. Shenzhen (adjacent to Hong Kong) and Zhuhai (adjacent to Macau) were among China\'s first Special Economic Zones in 1980. Proximity to Hong Kong and Macau, convenient sea lanes toward Southeast Asia, and deep overseas Chinese family ties attracted capital, technology, and management expertise.',
          '珠江三角洲由西江、北江、东江汇流冲积而成，河网密布。1980 年我国在此设立深圳（毗邻香港）、珠海（毗邻澳门）经济特区。紧邻港澳的地理位置、面向东南亚的便利海运，以及全国著名的“侨乡”优势，使其成为改革开放的先行区。',
        ],
      },
      {
        title: ['Industrial upgrading: from light manufacturing to innovation', '产业升级：从“前店后厂”到科创高地'],
        cam: [22.7, 113.7, 1.85],
        marks: [
          mk([22.54, 114.06], 'Shenzhen: IT, Telecom, New Energy & Drones', '深圳：电子信息、新能源与无人机', { dot: true, c: C.green, t: 0.4 }),
          mk([23.02, 113.75], 'Dongguan: Smart Electronics Manufacturing', '东莞：智能终端与电子制造', { dot: true, c: C.blue, t: 0.7 }),
          mk([23.02, 113.12], 'Foshan: Home Appliances & Advanced Manufacturing', '佛山：智能家电与先进制造', { dot: true, c: C.orange, t: 1.0 }),
          mk([23.13, 113.26], 'Guangzhou: Trade, Auto & Research Hub', '广州：国际商贸、汽车与科教中心', { dot: true, c: C.gold, t: 1.2 }),
        ],
        body: [
          'In the 1980s and 1990s, Hong Kong and the Pearl River Delta cooperated through the "front shop, back factory" model: Hong Kong handled overseas orders, finance, and design ("the shop"), while the delta cities manufactured toys, garments, and electronics ("the factory"). As land and labor costs rose, the region upgraded to high-technology industries — semiconductors, telecoms, electric vehicles, robotics, and modern financial and logistics services.',
          '改革开放初期，珠江三角洲与港澳形成“前店后厂”模式：港澳扮演“店”（承接海外订单、金融、设计），珠三角扮演“厂”（从事服装、玩具、电子装配等劳动密集型加工）。随着经济发展，珠三角大力推进产业结构调整，升级为世界级的电子信息、新能源汽车、生物医药与高端装备制造基地。',
        ],
      },
      {
        title: ['Bridging the Pearl River estuary: the Greater Bay Area', '跨江通道与粤港澳大湾区同城化'],
        cam: [22.4, 113.75, 1.75],
        sketch: true,
        lines: [
          { pts: [[22.31, 113.94], [22.28, 113.76], [22.21, 113.56]], c: C.gold, w: 2.4, dur: 1.0 },
          { pts: [[22.60, 113.81], [22.56, 113.66], [22.53, 113.56]], c: C.red, w: 2.4, dur: 1.0 },
        ],
        marks: [
          mk([22.28, 113.76], 'Hong Kong–Zhuhai–Macau Bridge', '港珠澳大桥', { dot: true, c: C.gold, t: 0.4 }),
          mk([22.56, 113.68], 'Shenzhen–Zhongshan Link', '深中通道', { dot: true, c: C.red, t: 0.8 }),
        ],
        body: [
          'The funnel-shaped Pearl River estuary once separated the economically dense east bank (Hong Kong, Shenzhen, Dongguan) from the west bank (Macau, Zhuhai, Zhongshan, Jiangmen). Today, the Humen Bridge, Nansha Bridge, Hong Kong–Zhuhai–Macau Bridge, and Shenzhen–Zhongshan Link span the estuary, cutting travel between Shenzhen and Zhongshan from two hours to 30 minutes and binding the 9+2 cities of the Greater Bay Area together.',
          '喇叭形的珠江口曾将东岸（香港、深圳、东莞）与西岸（澳门、珠海、中山、江门）隔开。如今，虎门大桥、南沙大桥、港珠澳大桥和深中通道等跨海跨江工程飞架珠江口，将深圳到中山的车程缩短至约 30 分钟，推动粤港澳大湾区“9+2”城市群深度融合。',
        ],
      },
    ],
    quiz: [
      {
        q: ['Which two Special Economic Zones lie in the Pearl River Delta adjacent to Hong Kong and Macau?', '珠江三角洲地区毗邻香港和澳门的两个经济特区分别是？'],
        options: [
          ['Shenzhen and Zhuhai', '深圳、珠海'],
          ['Shantou and Xiamen', '汕头、厦门'],
          ['Guangzhou and Foshan', '广州、佛山'],
          ['Pudong and Xiong\'an', '浦东、雄安'],
        ],
        answer: 0,
        tag: ['Shenzhen and Zhuhai SEZs', '深圳与珠海经济特区'],
        why: ['Shenzhen borders Hong Kong on the east side of the Pearl River estuary; Zhuhai borders Macau on the west side.', '深圳位于珠江口东侧毗邻香港，珠海位于珠江口西侧毗邻澳门。'],
      },
      {
        q: ['Why did the Pearl River Delta shift from labor-intensive processing industries to high-technology industries?', '珠江三角洲从早期的劳动密集型加工工业转向高新技术产业的主要原因包括？'],
        options: [
          ['Rising land and labor costs eroded the advantage of low-value processing', '土地和劳动力成本上升，传统加工工业优势减弱'],
          ['Higher value-added, cleaner innovation industries drive sustainable growth', '高新技术产业附加值高、资源消耗低，利于可持续发展'],
          ['Strong industrial base, skilled talent inflow, and national Greater Bay Area policy support', '工业基础雄厚、人才集聚及国家粤港澳大湾区政策支持'],
          ['Discovery of giant coal and iron-ore mines inside Shenzhen and Hong Kong', '深圳与香港境内发现了特大型煤矿与铁矿'],
        ],
        multi: [0, 1, 2],
        tag: ['PRD industrial upgrading', '珠三角产业升级'],
        why: ['The Pearl River Delta lacks heavy mineral and energy resources; its industrial upgrading relies on technology, talent, capital, and policy.', '珠三角矿产和能源资源匮乏，其产业升级依靠科技、人才、资金与政策优势，淘汰高耗能低附加值环节。'],
      },
      {
        q: ['Historically, before industrial upgrading, what was the classic agricultural system of low-lying lands in the Pearl River Delta?', '珠江三角洲地势低洼地区极具地方特色的传统生态农业模式是？'],
        options: [
          ['Mulberry-dyke and sugarcane-dyke fish ponds (Jitang agriculture)', '基塘农业（桑基鱼塘、蔗基鱼塘、果基鱼塘）'],
          ['River-valley highland barley farming', '河谷青稞农业'],
          ['Oasis Karez cotton farming', '绿洲坎儿井棉作农业'],
          ['Loess tableland dryland millet farming', '黄土塬旱作谷子农业'],
        ],
        answer: 0,
        tag: ['Jitang fish-pond agriculture', '基塘农业'],
        why: ['Farmers dug low-lying floodable land into fish ponds and piled the mud into dykes to grow mulberry, sugarcane, or fruit trees — a classic circular ecological farming system.', '珠三角农民因地制宜，将低洼易涝地挖深为塘养鱼，堆泥成基种桑、种蔗、种果，形成良性循环的“基塘农业”。'],
      },
      {
        q: ['Tap Guangzhou on the globe.', '在地球仪上点出广州市的位置。'],
        at: [23.13, 113.26],
        tolKm: 400,
        tag: ['Guangzhou', '广州'],
        why: ['Guangzhou sits at the head of the Pearl River Delta near 23.1°N, 113.3°E, just south of the Tropic of Cancer.', '广州位于北回归线略南的珠江三角洲北部顶点（约 23.1°N，113.3°E）。'],
      },
    ],
  },
  {
    id: 'h-motion',
    strand: 'maps',
    grade: 'h2',
    tracks: ['us', 'ib'],
    unit: ['Earth\'s movements', '地球的运动'],
    icon: 'clock',
    minutes: 15,
    title: ['Earth\'s movement: time zones, daylength and solar altitude', '地球的运动：时差、昼夜长短与正午太阳高度'],
    blurb: ['Angular vs linear speed, local solar time and Date Line rules, daylength variations, and noon sun angle H = 90° − |φ − δ|.', '自转角速度与线速度、地方时与日界线计算、昼夜长短变化规律以及正午太阳高度角公式与应用。'],
    keys: [
      ['Except at the two poles, Earth\'s rotational angular speed is 15°/h everywhere, while linear speed decreases from ~1,670 km/h at the equator to 0 at the poles (roughly proportional to cos φ).', '除南北极点外，地球自转角速度处处均为 15°/时（1°/4 分钟）；线速度由赤道（约 1670 千米/时）向两极递减，南北纬 60° 处约为赤道的一半。'],
      ['East longitudes have earlier local time than west longitudes ("East plus, West minus": +1 hour per 15°, +4 minutes per 1°); Beijing Time is the zone time of UTC+8 (local solar time at 120°E).', '地方时“东早西晚、东加西减”，经度每相差 15° 时间相差 1 小时（每差 1° 差 4 分钟）；北京时间即东八区区时（120°E 的地方时）。'],
      ['Two date lines divide "today" and "yesterday": the natural midnight meridian (0:00) and the 180° International Date Line.', '地球上分隔不同日期的界线有两条：地方时为 0 时（24 时）的自然日界线，以及大致沿 180° 经线的人为国际日界线。'],
      ['The subsolar hemisphere always has longer days than nights, with longer days at higher latitudes; noon solar altitude is H = 90° − |φ − δ|.', '太阳直射哪个半球，哪个半球就昼长夜短，且纬度越高昼越长；正午太阳高度角公式为 H = 90° − |φ − δ|（同减异加）。'],
    ],
    steps: [
      {
        title: ['Rotational speed, local time and the two Date Lines', '自转速度、地方时与两条日界线'],
        cam: [25, 135, 3.2],
        lines: [
          par(0, C.red, 0.2),
          par(60, C.teal, 0.4),
          mer(120, C.gold, 0.6),
          mer(180, C.orange, 0.8),
        ],
        marks: [
          mk([0, 120], 'Equator: 1,670 km/h · 15°/h', '赤道：线速度约 1670 km/h · 角速度 15°/h', { dot: true, c: C.red, t: 0.3 }),
          mk([60, 120], '60°N: ~837 km/h (half of equator)', '60°N：线速度约为赤道的一半', { dot: true, c: C.teal, t: 0.6 }),
          mk([39.9, 116.4], 'Beijing (116.4°E) · uses 120°E UTC+8', '北京（116.4°E）采用 120°E 东八区区时', { dot: true, c: C.gold, t: 0.9 }),
          mk([0, 180], '180° International Date Line', '180° 国际日界线（向东过线减一天）', { dot: true, c: C.orange, t: 1.2 }),
        ],
        body: [
          'Every point on Earth (except the exact poles) turns through 360° in 24 hours — an angular speed of 15° per hour, or 1° every 4 minutes. Because parallels shrink toward the poles as cos(latitude), linear speed at 60°N or 60°S is half that at the equator. Higher elevation also gives slightly faster linear speed, which is why low-latitude sites like Wenchang (19.6°N) save rocket fuel at launch. Two lines divide calendar dates on Earth: the moving 0:00 (midnight) meridian and the fixed 180° International Date Line.',
          '除南北两极点既无角速度也无线速度外，地球各地自转角速度均为 15°/小时；自转线速度自赤道向两极递减（60° 纬线处约为赤道的一半），且同纬度海拔越高线速度越大。海南文昌发射场纬度低（约 19.6°N），自转线速度大，可节省火箭燃料。地球上新的一天范围是从 0 时经线向东到 180° 经线。',
        ],
      },
      {
        title: ['Obliquity of the ecliptic and daylength across seasons', '黄赤交角与昼夜长短的变化规律'],
        cam: [20, 110, 3.4],
        lines: [
          par(23.436, C.gold, 0.2),
          par(0, C.white, 0.4),
          par(-23.436, C.gold, 0.6),
          par(66.564, C.blue, 0.8),
        ],
        marks: [
          mk([23.44, 116.5], 'June 21 Solstice: Sun at 23°26′N', '夏至（6 月 21 日前后）：直射北回归线', { dot: true, c: C.gold, t: 0.4 }),
          mk([0, 116.5], 'Mar 20 / Sep 23 Equinox: 12h day everywhere', '春分 / 秋分：直射赤道，全球昼夜平分', { dot: true, c: C.white, t: 0.7 }),
          mk([-23.44, 116.5], 'Dec 21 Solstice: Sun at 23°26′S', '冬至（12 月 22 日前后）：直射南回归线', { dot: true, c: C.gold, t: 1.0 }),
          mk([66.56, 116.5], 'Arctic Circle (66°34′N): Polar Day/Night edge', '北极圈（66°34′N）：极昼极夜南界', { dot: true, c: C.blue, t: 1.3 }),
        ],
        body: [
          'Earth\'s equatorial plane is tilted by 23°26′ (23.44°) relative to its orbital plane (the ecliptic). This obliquity drives the subsolar point between the Tropic of Cancer and the Tropic of Capricorn. Rule 1 (Position determines day vs night length): whichever hemisphere holds the subsolar point has days longer than 12 hours, and the higher the latitude, the longer the day. Rule 2 (Movement direction determines lengthening vs shortening): whenever the subsolar point moves northward (from Dec 21 to Jun 21), northern-hemisphere days grow longer every day.',
          '目前黄赤交角约为 23°26′，使太阳直射点在南北回归线之间往返移动。昼夜长短判读有两大口诀：①“直射点所在半球昼长夜短，且纬度越高昼越长”（位置决定昼夜长短对比）；②“直射点向哪个半球移动，哪个半球就昼变长、夜变短”（移动方向决定昼夜长短变化趋势）。例如冬至到春分，太阳直射南半球但向北移动，因此北半球仍是昼短夜长，但白昼在逐日变长。',
        ],
      },
      {
        title: ['Noon solar altitude H = 90° − |φ − δ| in daily life', '正午太阳高度角计算与楼间距、太阳能应用'],
        cam: [32, 116, 2.5],
        marks: [
          mk([39.9, 116.4], 'Beijing (40°N): Summer ~73.5° · Winter ~26.5°', '北京（40°N）：夏至正午约 73.5° · 冬至约 26.5°', { dot: true, c: C.gold, t: 0.4 }),
          mk([23.1, 113.3], 'Guangzhou (23.1°N): Zenith near Summer Solstice', '广州（23.1°N）：夏至前后接近正午直射（90°）', { dot: true, c: C.red, t: 0.8 }),
          mk([19.6, 110.8], 'Wenchang (19.6°N): Twice-yearly overhead Sun', '文昌（19.6°N）：一年两次正午太阳直射', { dot: true, c: C.green, t: 1.2 }),
        ],
        body: [
          'The noon solar altitude angle at latitude φ when the subsolar point is at declination δ is H = 90° − |φ − δ| (subtract latitudes in the same hemisphere; add them in opposite hemispheres). At 40°N (Beijing), H reaches 90° − (40° − 23.5°) = 73.5° on the June solstice and drops to 90° − (40° + 23.5°) = 26.5° on the December solstice. Consequently: (1) Northern China needs wider north–south building spacing than Southern China so ground floors receive winter sunlight; (2) A rooftop solar water heater panel achieves perpendicular sunlight when its tilt angle α from the ground equals |φ − δ| (i.e. α + H = 90°).',
          '某地（纬度 φ）的正午太阳高度角公式为 H = 90° − |φ − δ|（φ 与直射点纬度 δ 同半球相减、异半球相加）。以 40°N（北京附近）为例：夏至日 H ≈ 90° − (40° − 23.5°) = 73.5°；冬至日 H ≈ 90° − (40° + 23.5°) = 26.5°。实际应用：①为保证北楼底层冬至日有采光，我国北方正午太阳高度小、楼影长，因此南北楼间距比南方更大；②太阳能集热板与地面的倾角 α 应与正午太阳高度角互余（α = 90° − H = |φ − δ|）。',
        ],
      },
    ],
    quiz: [
      {
        q: ['When Beijing Time (120°E) is 14:00 on May 1, what is the local solar time at 90°E (near Ürümqi)?', '当北京时间（120°E 地方时）为 5 月 1 日 14:00 时，90°E 经线（乌鲁木齐附近）的地方时是几时（直接填数字）？'],
        num: { answer: 12, tol: 0.1, unit: ['o\'clock (24h)', '时'] },
        tag: ['Local solar time calculation', '地方时计算'],
        why: ['90°E lies 30° west of 120°E. Each 15° equals 1 hour, and west is later ("East plus, West minus"): 14 − (30 / 15) = 12:00 noon.', '90°E 位于 120°E 以西 30°，经度每差 15° 地方时差 1 小时，依据“东加西减”，14 − (30 ÷ 15) = 12 时。'],
      },
      {
        q: ['On the Equinox (subsolar point at 0°), what is the noon solar altitude angle (°) at 40°N?', '春分日或秋分日（太阳直射赤道 0°），北纬 40° 地区的正午太阳高度角是多少度？'],
        num: { answer: 50, tol: 0.5, unit: ['°', '°'] },
        tag: ['Noon solar altitude formula', '正午太阳高度计算'],
        why: ['Using H = 90° − |φ − δ| with φ = 40° and δ = 0° gives H = 90° − 40° = 50°.', '代入公式 H = 90° − |φ − δ|，当 δ = 0°、φ = 40°N 时，H = 90° − |40° − 0°| = 50°。'],
      },
      {
        q: ['From the Winter Solstice (Dec 22) to the March Equinox (Mar 20), what is true of daylength in Beijing (40°N)?', '从冬至日（12 月 22 日前后）到次年春分日（3 月 20 日前后），北京（40°N）的昼夜长短状况及变化趋势是？'],
        options: [
          ['Days are shorter than nights, and days are getting longer each day', '昼短夜长，且白昼逐日变长'],
          ['Days are longer than nights, and days are getting longer each day', '昼长夜短，且白昼逐日变长'],
          ['Days are shorter than nights, and days are getting shorter each day', '昼短夜长，且白昼逐日变短'],
          ['Days are longer than nights, and days are getting shorter each day', '昼长夜短，且白昼逐日变短'],
        ],
        answer: 0,
        tag: ['Daylength seasonal change', '昼夜长短变化规律'],
        why: ['Between Dec 22 and Mar 20, the subsolar point is still in the Southern Hemisphere (so Beijing has days shorter than nights), but it is moving northward (so Beijing\'s days are lengthening).', '冬至到春分期间，太阳直射点位于南半球（故北半球昼短夜长），但直射点正在向北移动（故北半球白昼逐日变长）。'],
      },
      {
        q: ['Order these four Chinese cities from SHORTEST to LONGEST daylight on the June Summer Solstice.', '在夏至日（6 月 21 日前后），将下列四座中国城市按白昼由短到长排序。'],
        order: [
          ['Haikou (20°N)', '海口（约 20°N）'],
          ['Shanghai (31°N)', '上海（约 31°N）'],
          ['Beijing (40°N)', '北京（约 40°N）'],
          ['Harbin (45.8°N)', '哈尔滨（约 45.8°N）'],
        ],
        tag: ['Summer solstice daylength order', '夏至昼长纬度排序'],
        why: ['On the June solstice the Sun is overhead in the Northern Hemisphere, so the further north you go across the world, the longer the daylight.', '夏至日太阳直射北回归线，全球越往北白昼越长，因此从南向北（海口→上海→北京→哈尔滨）白昼依次变长。'],
      },
      {
        q: ['If the obliquity of the ecliptic (currently 23°26′) became 20°, which consequences would occur?', '假设黄赤交角由目前的 23°26′ 变小为 20°，地球上会出现哪些变化？'],
        options: [
          ['The Tropical Zone (between the Tropics) would become narrower', '热带的范围会变小（南北回归线之间变窄）'],
          ['The Frigid Zones (inside the Polar Circles, now at 70°N/S) would become smaller', '寒带的范围会变小（极圈移至南北纬 70°）'],
          ['The Temperate Zones would become wider', '温带的范围会变大'],
          ['Annual variation of noon solar altitude in mid-latitudes would increase', '中纬度地区正午太阳高度的年变化幅度会变大'],
        ],
        multi: [0, 1, 2],
        tag: ['Obliquity of the ecliptic', '黄赤交角变化影响'],
        why: ['The latitude of the Tropics equals the obliquity (20°), and the Polar Circles sit at 90° − 20° = 70°, so both the Tropical and Frigid zones shrink while the Temperate zones expand.', '回归线度数等于黄赤交角（变为 20°），极圈度数与黄赤交角互余（变为 70°），因此“黄赤交角变小，热带和寒带变小，温带变大”。'],
      },
    ],
  },
];

// ============================================================================
// 2. Curated Synthesis Question Pools per Grade (各年级专属综合拔高题库)
// ============================================================================

const G7A_EXTRA_QUIZ: Quiz[] = [
  {
    q: ['Match each special latitude or longitude line with its geographical meaning.', '将重要的经纬线与它的地理意义配对。'],
    sec: SEC.match,
    match: [
      [['Equator (0° latitude)', '赤道（0° 纬线）'], ['Divides the Northern and Southern Hemispheres; longest parallel (~40,000 km)', '南北半球分界线，最长的纬线圈（约 4 万千米）']],
      [['Prime Meridian (0° longitude)', '本初子午线（0° 经线）'], ['Starting line for East and West longitudes (passes through Greenwich)', '东西经度的起始线（经过英国格林尼治天文台旧址）']],
      [['20°W and 160°E meridian circle', '20°W 和 160°E 经线圈'], ['Divides the Eastern and Western Hemispheres', '东西半球的分界线']],
      [['Tropic of Cancer & Capricorn (23.5°N/S)', '南北回归线（23.5°N/S）'], ['Divides the Tropical Zone from the Temperate Zones; limit of overhead Sun', '热带与温带的分界线，有无太阳直射现象的界线']],
    ],
    tag: ['Lines of latitude and longitude', '重要经纬线分界'],
    why: ['0° latitude splits N/S hemispheres; 0° longitude starts E/W longitudes; 20°W–160°E splits E/W hemispheres; 23.5°N/S bounds the tropics.', '南北半球分界是赤道，东西经分界是 0° 和 180° 经线，东西半球分界是 20°W 和 160°E 经线圈，回归线是热带与温带分界。'],
  },
  {
    q: ['Match each contour-map landform feature with how its contour lines look.', '将等高线地形图上的地形部位与等高线形态特征配对。'],
    sec: SEC.match,
    match: [
      [['Ridge', '山脊'], ['Contour lines bend toward lower elevation ("convex to low")', '等高线向海拔低处凸出（“凸低为脊”）']],
      [['Valley', '山谷'], ['Contour lines bend toward higher elevation ("convex to high"); rivers form here', '等高线向海拔高处凸出（“凸高为谷”），常发育河流']],
      [['Saddle', '鞍部'], ['The relatively flat space between two adjacent mountain peaks', '两个相邻山峰之间的相对低平部位']],
      [['Cliff', '陡崖'], ['Several contour lines of different elevations overlap and merge', '多条不同海拔的等高线重叠相交']],
    ],
    tag: ['Contour landforms', '等高线地形部位判读'],
    why: ['"Convex to low is a ridge; convex to high is a valley"; overlapping contours mark a cliff, and the gap between two peaks is a saddle.', '等高线判读口诀：“凸低为脊（分水岭），凸高为谷（集水线，可发育河流）”，重叠处为陡崖，两峰之间为鞍部。'],
  },
  {
    q: ['If the temperature at the foot of a mountain (200 m above sea level) is 24 °C, what is the approximate temperature (°C) at its summit (2,200 m)?', '若某山山脚（海拔 200 米）的气温为 24 ℃，则山顶（海拔 2200 米）的气温大约是多少摄氏度？'],
    sec: SEC.skill,
    num: { answer: 12, tol: 0.6, unit: ['°C', '℃'] },
    tag: ['Elevation temperature lapse rate', '地形与气温垂直递减率'],
    why: ['The relative height is 2,200 − 200 = 2,000 m. Temperature drops by about 6 °C per 1,000 m: 24 − 2 × 6 = 12 °C.', '山顶与山脚相对高度为 2200 − 200 = 2000 米。海拔每升高 1000 米气温约下降 6 ℃，故 24 − 2 × 6 = 12 ℃。'],
  },
  {
    q: ['Which climate type is found on the west coasts of continents between 30° and 40° latitude, with hot dry summers and mild rainy winters?', '分布在南北纬 30°—40° 大陆西岸，具有“夏季炎热干燥、冬季温和多雨”特征的气候类型是？'],
    sec: SEC.mc,
    options: [
      ['Mediterranean climate', '地中海气候'],
      ['Temperate maritime climate', '温带海洋性气候'],
      ['Humid subtropical monsoon climate', '亚热带季风气候'],
      ['Tropical savanna climate', '热带草原气候'],
    ],
    answer: 0,
    tag: ['Mediterranean climate', '地中海气候'],
    why: ['Mediterranean climate (30°–40° west coast) is the only major climate with out-of-phase heat and rain (winter rain, summer drought).', '地中海气候位于南北纬 30°—40° 大陆西岸，夏季受副高控制炎热干燥、冬季受西风影响温和多雨（雨热不同期）。'],
  },
  {
    q: ['Order the four oceans of the world from LARGEST to SMALLEST in area.', '将世界四大洋按面积从大到小排序。'],
    sec: SEC.skill,
    order: [
      ['Pacific Ocean', '太平洋'],
      ['Atlantic Ocean', '大西洋'],
      ['Indian Ocean', '印度洋'],
      ['Arctic Ocean', '北冰洋'],
    ],
    tag: ['Four oceans by area', '四大洋面积排序'],
    why: ['Mnemonic "Tai–Da–Yin–Bei": Pacific (nearly half the world\'s ocean area) > Atlantic > Indian > Arctic.', '四大洋面积由大到小口诀为“太大印北”：太平洋、大西洋、印度洋、北冰洋。'],
  },
];

const G7B_EXTRA_QUIZ: Quiz[] = [
  {
    q: ['Match each region or country from Grade 7 Term 2 with its signature geographic nickname.', '将七年级下册的重要国家或地区与它的地理称号配对。'],
    sec: SEC.match,
    match: [
      [['Middle East', '中东'], ['"Land of Two Oceans, Three Continents and Five Seas" & World Oil Storehouse', '“两洋三洲五海之地”与“世界石油宝库”']],
      [['Sub-Saharan Africa', '撒哈拉以南非洲'], ['"Plateau Continent", "Tropical Continent" & "Storehouse of Raw Materials"', '“高原大陆”、“热带大陆”与“原材料仓库”']],
      [['Australia', '澳大利亚'], ['"Museum of Living Fossils", "Country Riding on Sheep\'s Back" & "Sitting on a Mine Cart"', '“世界活化石博物馆”、“骑在羊背上的国家”与“坐在矿车上的国家”']],
      [['Antarctica', '南极地区'], ['"Ice Plateau", "White Desert" & "Storehouse of Wind"', '“冰雪高原”、“白色荒漠”与“风库”']],
    ],
    tag: ['World regions nicknames', '世界典型区域特征'],
    why: ['Each region\'s nickname summarizes its location, climate, resources, and economic profile.', '这些经典地理称号高度概括了中东、撒哈拉以南非洲、澳大利亚与南极地区的核心自然和人文特征。'],
  },
  {
    q: ['Match each major world river with the sea or ocean it flows into.', '将世界著名河流与它最终注入的海洋（或湖泊）配对。'],
    sec: SEC.match,
    match: [
      [['Ob, Yenisei and Lena Rivers (Asian Russia)', '鄂毕河、叶尼塞河、勒拿河'], ['Arctic Ocean', '北冰洋']],
      [['Volga River (Europe\'s longest river)', '伏尔加河（欧洲第一长河）'], ['Caspian Sea (inland)', '里海（内陆湖）']],
      [['Ganges River', '恒河'], ['Bay of Bengal (Indian Ocean)', '孟加拉湾（印度洋）']],
      [['Mississippi River', '密西西比河'], ['Gulf of Mexico (Atlantic Ocean)', '墨西哥湾（大西洋）']],
    ],
    tag: ['World rivers and mouths', '世界主要河流注入海域'],
    why: ['Siberian rivers flow north into the Arctic; the Volga is an inland river entering the Caspian Sea; the Ganges enters the Bay of Bengal; the Mississippi enters the Gulf of Mexico.', '俄罗斯亚洲部分三大河自南向北注入北冰洋；俄罗斯“母亲河”伏尔加河注入里海；恒河注入孟加拉湾；密西西比河注入墨西哥湾。'],
  },
  {
    q: ['Why is animal husbandry (especially dairy farming) so well developed in Western Europe?', '欧洲西部畜牧业（尤其是乳畜业）高度发达的主要原因有哪些？'],
    sec: SEC.mc,
    options: [
      ['Mid-latitude west-coast location with warm North Atlantic Drift and prevailing westerlies creating a mild, humid maritime climate', '地处中纬度大陆西岸，受西风和北大西洋暖流影响，温带海洋性气候广布'],
      ['Predominantly flat plains allowing moist ocean air to penetrate deep inland, ideal for succulent pastures ("green gold")', '地形以平原为主，南北山脉多东西走向，利于海洋湿润气流深入内陆，多汁牧草生长旺盛'],
      ['Dense urban population and culinary tradition creating huge demand for milk, cheese, and beef', '人口和城市密集、经济发达，居民有喜食乳畜产品的饮食习惯，市场广阔'],
      ['Year-round tropical monsoon rains flooding terraced rice paddies', '终年受热带季风控制，梯田水热充足'],
    ],
    multi: [0, 1, 2],
    tag: ['Western Europe dairy farming', '欧洲西部乳畜业成因'],
    why: ['Plains + westerlies + temperate maritime climate + succulent grass + dense affluent urban markets make Western Europe a world leader in dairy farming.', '平原地形、温带海洋性气候、多汁牧草以及发达的城市消费市场，共同造就了欧洲西部发达的乳畜业。'],
  },
  {
    q: ['Why are China\'s Antarctic research stations (Great Wall, Zhongshan, Kunlun, Taishan, Qinling) usually visited and supplied between November and March?', '我国赴南极地区科学考察（如长城站、中山站、昆仑站、秦岭站）通常选择在每年 11 月至次年 3 月，原因是？'],
    sec: SEC.mc,
    options: [
          ['It is the Southern Hemisphere\'s warm season (summer) with polar day, milder temperatures, and longer daylight for work', '此时为南半球的暖季（夏季），气温相对较高，且有极昼现象，白昼时间长'],
          ['It is the Southern Hemisphere\'s winter with 24-hour polar night for aurora photography', '此时为南半球冬季，全天极夜便于观测极光'],
          ['Antarctica moves closer to the Equator in January', '一月份南极大陆漂移到赤道附近'],
          ['There is zero wind in Antarctica during January', '一月份南极地区完全没有风'],
        ],
    answer: 0,
    tag: ['Antarctic research season', '南极科考最佳时间'],
    why: ['November to March is summer in the Southern Hemisphere, bringing relatively warmer weather and continuous daylight (polar day) inside the Antarctic Circle.', '南北半球季节相反，11 月至次年 3 月是南极地区的暖季，气温相对较高，且有极昼现象，便于开展科考与物资补给。'],
  },
];

const G8A_EXTRA_QUIZ: Quiz[] = [
  {
    q: ['Match each major geographical boundary line in China with what it divides.', '将我国重要的地理分界线与它的地理意义配对。'],
    sec: SEC.match,
    match: [
      [['Heihe (Aihui)–Tengchong Line', '黑河—腾冲一线'], ['China\'s population density boundary (dense east, sparse west)', '我国人口地理分界线（东密西疏）']],
      [['Kunlun–Qilian–Hengduan Mountains', '昆仑山脉—祁连山脉—横断山脉'], ['Boundary between Terrain Step 1 and Step 2', '我国地势第一、二级阶梯分界线']],
      [['Greater Khingan–Taihang–Wushan–Xuefeng Mountains', '大兴安岭—太行山脉—巫山—雪峰山'], ['Boundary between Terrain Step 2 and Step 3', '我国地势第二、三级阶梯分界线']],
      [['Qinling–Huaihe Line', '秦岭—淮河一线'], ['January 0 °C isotherm, 800 mm isohyet, and Humid/Sub-humid boundary', '1 月 0 ℃ 等温线、800 毫米年等降水量线、湿润与半湿润区分界线']],
    ],
    tag: ['China key boundary lines', '中国重要地理分界线'],
    why: ['These four boundary lines form the spatial backbone of Chinese geography.', '黑河—腾冲线、两级阶梯分界山脉和秦岭—淮河一线是八年级上册中国地理最核心的空间骨架。'],
  },
  {
    q: ['Match each major north–south and east–west railway trunk line with its endpoints, or key hub city.', '将我国铁路干线或著名铁路枢纽配对。'],
    sec: SEC.match,
    match: [
      [['Jingguang Line (North–South)', '京广线（南北干线）'], ['Beijing – Zhengzhou – Wuhan – Guangzhou', '北京—郑州—武汉—广州']],
      [['Jinghu Line (North–South)', '京沪线（南北干线）'], ['Beijing – Xuzhou – Nanjing – Shanghai', '北京—徐州—南京—上海']],
      [['Longhai–Lanxin Line (East–West)', '陇海—兰新线（东西干线）'], ['Lianyungang – Zhengzhou – Lanzhou – Ürümqi', '连云港—郑州—兰州—乌鲁木齐']],
      [['Zhengzhou Hub & Xuzhou Hub', '郑州枢纽与徐州枢纽'], ['Zhengzhou (Jingguang × Longhai); Xuzhou (Jinghu × Longhai)', '郑州（京广与陇海交汇）；徐州（京沪与陇海交汇）']],
    ],
    tag: ['China railway network', '中国铁路干线与枢纽'],
    why: ['Longhai meets Jinghu at Xuzhou, Jingjiu at Shangqiu, Jingguang at Zhengzhou, and Baocheng/abuts Lanxin at Baoji/Lanzhou.', '陇海线自东向西分别与京沪线交汇于徐州、与京九线交汇于商丘、与京广线交汇于郑州。'],
  },
  {
    q: ['What are the hydrological features of rivers north of the Qinling–Huaihe line compared with rivers south of it?', '与秦岭—淮河以南的河流相比，秦岭—淮河以北的河流普遍具有哪些水文特征？'],
    sec: SEC.mc,
    options: [
      ['They have a winter freezing period (January mean temperature < 0 °C)', '有结冰期（1 月平均气温低于 0 ℃）'],
      ['Smaller annual runoff and shorter summer flood season', '年径流量较小，汛期较短'],
      ['Generally higher sediment load (especially rivers flowing through the Loess Plateau)', '含沙量普遍较大（特别是流经黄土高原的河流）'],
      ['Year-round ice-free navigation with the largest discharge in China', '终年不冻且年径流量全国最大'],
    ],
    multi: [0, 1, 2],
    tag: ['River hydrology north vs south', '秦岭—淮河以北河流水文特征'],
    why: ['North of Qinling–Huaihe, annual precipitation is <800 mm with a shorter rainy season, winters drop below 0 °C (rivers freeze), and vegetation cover is lower.', '秦岭—淮河以北年降水量小于 800 毫米、雨季短，故水量较小、汛期短；1 月均温低于 0 ℃，故有结冰期；植被覆盖率较低，含沙量较大。'],
  },
  {
    q: ['Which solution mainly addresses the uneven SPATIAL distribution of water resources in China (abundant in the south, scarce in the north)?', '为解决我国水资源“空间分布不均（南丰北缺）”的问题，最关键的工程措施是？'],
    sec: SEC.mc,
    options: [
      ['Inter-basin water transfer projects such as the South-to-North Water Diversion', '跨流域调水（如南水北调工程）'],
      ['Building reservoirs (which mainly regulates seasonal/temporal variation)', '兴修水库（主要解决时间/季节分配不均）'],
      ['Melting all glaciers on the Kunlun Mountains', '人工融化昆仑山全部冰川'],
      ['Stopping agricultural irrigation in the North China Plain', '全面停止华北平原的农业灌溉'],
    ],
    answer: 0,
    tag: ['Water resource distribution', '水资源时空调节措施'],
    why: ['Inter-basin transfer (South-to-North Water Diversion) solves spatial imbalance; reservoirs solve seasonal/temporal imbalance.', '跨流域调水（南水北调）解决水资源空间分布不均（南丰北缺）；兴修水库解决水资源时间（季节）分配不均（夏秋多、冬春少）。'],
  },
];

const G8B_EXTRA_QUIZ: Quiz[] = [
  {
    q: ['Match each boundary between China\'s Four Major Geographical Regions with its dominant controlling factor.', '将我国四大地理区域的分界线与决定该界线的主导因素配对。'],
    sec: SEC.match,
    match: [
      [['Northern vs. Southern China (Qinling–Huaihe)', '北方地区与南方地区分界线（秦岭—淮河）'], ['Climate (combined temperature and precipitation)', '气候因素（气温和降水综合）']],
      [['Northern vs. Northwestern China (~400 mm isohyet)', '北方地区与西北地区分界线（约 400 毫米等降水量线）'], ['Precipitation (summer monsoon influence)', '降水因素（夏季风影响强弱）']],
      [['Qinghai–Tibet vs. the other three regions (Step 1 edge)', '青藏地区与其他三个地区分界线（第一级阶梯边缘）'], ['Topography and elevation (terrain)', '地形地势因素（海拔高，形成高寒气候）']],
    ],
    tag: ['Four geographical regions boundaries', '四大地理区域界线主导因素'],
    why: ['North/South is driven by climate (heat + rain); North/Northwest by precipitation (monsoon); Qinghai–Tibet by high elevation.', '南北方分界主导因素是气候（水热），北方与西北分界主导因素是降水（季风），青藏与其他地区分界主导因素是地形地势。'],
  },
  {
    q: ['Match each region of China with its typical agricultural type and representative crops.', '将我国不同区域与它的典型农业类型及代表农作物配对。'],
    sec: SEC.match,
    match: [
      [['Southern Region', '南方地区'], ['Paddy-field farming: rice, rapeseed, sugarcane, tea', '水田农业：水稻、油菜、甘蔗、茶树']],
      [['Northern Region', '北方地区'], ['Dryland farming: wheat, corn, soybeans, sugar beet', '旱地农业：小麦、玉米、大豆、甜菜']],
      [['Northwest Region (Xinjiang & Hexi)', '西北地区（新疆与河西走廊）'], ['Oasis irrigated farming: long-staple cotton, Hami melon, grapes', '绿洲灌溉农业：长绒棉、哈密瓜、葡萄']],
      [['Qinghai–Tibet Region (Yarlung Tsangpo & Huangshui)', '青藏地区（雅鲁藏布江谷地、湟水谷地）'], ['River-valley farming: highland barley and spring wheat', '河谷农业：青稞、春小麦']],
    ],
    tag: ['Regional agriculture in China', '中国四大区域农业类型'],
    why: ['Water divides Southern paddy fields from Northern drylands; drought limits the Northwest to oases; cold limits Qinghai–Tibet to warm low river valleys.', '南方湿润多水田，北方半湿润多旱地，西北干旱靠冰雪融水发展绿洲农业，青藏高寒在海拔较低、热量较好的河谷发展河谷农业。'],
  },
  {
    q: ['Why do Xinjiang\'s melons, grapes, and long-staple cotton have high sugar content and excellent quality?', '新疆的瓜果特别甜、长绒棉品质优良，最主要的气候原因是？'],
    sec: SEC.mc,
    options: [
      ['Dry continental climate with intense summer sunshine, long daylight, and a large diurnal temperature range', '温带大陆性气候，夏季光照强、日照时间长，且昼夜温差大，利于糖分和养分积累'],
      ['Heavy monsoon rain every afternoon throughout the year', '终年受季风影响，每天午后都有充沛的对流雨'],
      ['Warm ocean currents flowing into the Tarim Basin', '塔里木盆地受大洋暖流增温增湿作用显著'],
      ['High winter temperatures above 20 °C all year round', '冬季漫长且最冷月平均气温在 20 ℃ 以上'],
    ],
    answer: 0,
    tag: ['Xinjiang oasis farming', '新疆绿洲农业优势'],
    why: ['Warm days with strong sunlight maximize photosynthesis, while cool nights reduce plant respiration, locking in sugars and fibers.', '新疆深居内陆，晴天多、日照充足，白天光合作用强；夜晚降温快，呼吸作用弱，消耗少，极利于瓜果糖分积累。'],
  },
  {
    q: ['Why are railway lines, cities, and population in Taiwan distributed in a ring around the coast (especially on the western plain)?', '台湾岛的铁路、城市和人口主要呈环状分布在沿海地区（尤其是西部平原），主要原因包括？'],
    sec: SEC.mc,
    options: [
      ['Central and eastern Taiwan are covered by steep north–south mountain ranges, while coastal plains are flat', '中东部为高耸的南北向山脉（台湾山脉），沿海地区（特别是西部）地势平坦'],
      ['Western plains were settled earlier, have fertile soil, and enjoy convenient sea transport across the Taiwan Strait', '西部平原开发历史悠久、土壤肥沃，且隔台湾海峡与大陆相望，海陆交通便利'],
      ['Coastal hubs concentrate industry, trade, and ports (such as Taipei, Kaohsiung, Taichung)', '工商业和港口多集中在沿海平原，吸引人口集聚'],
      ['The central mountain peaks are below sea level and flooded all year', '台湾中部山脉海拔低于海平面，常年被海水淹没'],
    ],
    multi: [0, 1, 2],
    tag: ['Taiwan ring distribution', '台湾人口与铁路环状分布'],
    why: ['Two-thirds of Taiwan is mountainous in the center and east, so flat land, farming, cities, and ring railways follow the coastal plains.', '台湾岛约 2/3 为山地（集中在中东部），西部和沿海为平原，地势平坦、开发早、经济发达，因此铁路呈环状分布。'],
  },
];

const H1_EXTRA_QUIZ: Quiz[] = [
  {
    q: ['Match each external geomorphic agent with the typical landforms it creates.', '将外力作用类型与它塑造的典型地貌配对。'],
    sec: SEC.match,
    match: [
      [['Fluvial erosion & deposition', '流水侵蚀与流水堆积'], ['V-shaped gorges, alluvial fans at mountain exits, river deltas', 'V 形峡谷、山前冲积扇、河口三角洲']],
      [['Karst (dissolution & precipitation)', '喀斯特作用（流水溶蚀与淀积）'], ['Peak clusters, sinkholes (tiankeng), stalactites & stalagmites in caves', '峰林峰丛、天坑、溶洞中的石钟乳与石笋']],
      [['Aeolian (wind erosion & deposition)', '风力侵蚀与风力堆积'], ['Yardangs, wind-eroded mushrooms, crescent barchan sand dunes', '雅丹地貌、风蚀蘑菇、新月形沙丘']],
      [['Coastal & Glacial action', '海浪作用与冰川作用'], ['Sea stacks/arches & sandy beaches; U-shaped valleys, horns & fjords', '海蚀柱与沙滩；冰川 U 形谷、角峰与峡湾']],
    ],
    tag: ['Landforms and external forces', '外力作用与典型地貌'],
    why: ['Running water, karst dissolution, wind, waves, and glaciers each leave unmistakable erosional and depositional signatures.', '流水、喀斯特溶蚀、风力、海浪和冰川分别在不同气候与地形区塑造出对应的侵蚀地貌与堆积地貌。'],
  },
  {
    q: ['Match each ocean water property or movement with its key geographic law.', '将海水性质或海水运动的规律配对。'],
    sec: SEC.match,
    match: [
      [['Surface seawater temperature', '表层海水温度'], ['Decreases from low latitudes toward high latitudes (driven by solar radiation)', '由低纬向高纬递减（主要受太阳辐射影响）']],
      [['Surface seawater salinity', '表层海水盐度'], ['Double-peaked Saddle Curve: highest in the subtropical zones (~20°–30°N/S)', '呈“马鞍形”分布：副热带海区最高，向赤道和两极递减']],
      [['Warm vs. Cold Ocean Currents', '暖流与寒流对沿岸气候影响'], ['Warm currents warm & humidify; cold currents cool & dehumidify (aridity/fog)', '暖流增温增湿；寒流降温减湿（易成荒漠与海雾）']],
      [['Major world fishing grounds', '世界著名大渔场成因'], ['Convergence of warm & cold currents (Hokkaido, Newfoundland, North Sea) or upwelling (Peru)', '寒暖流交汇（北海道、纽芬兰、北海）或上升补偿流（秘鲁渔场）']],
    ],
    tag: ['Ocean properties & currents', '海水性质与洋流影响'],
    why: ['Temperature follows latitude; salinity peaks under subtropical high evaporation; currents shape coastal climates and marine fisheries.', '海水温度随纬度递减，盐度在副热带最高（蒸发大于降水），洋流深刻影响沿岸水热与渔场分布。'],
  },
  {
    q: ['In the atmospheric heating process ("Sun warms Earth, Earth warms Air, Air warms Earth"), why are cloudy nights warmer than clear nights?', '依据“太阳暖大地、大地暖大气、大气还大地”的受热过程原理，为什么多云的夜晚通常比晴朗的夜晚气温更高？'],
    sec: SEC.mc,
    options: [
      ['Clouds absorb more terrestrial longwave radiation and return strong atmospheric counter-radiation to the ground', '云层能强烈吸收地面长波辐射，并增强大气逆辐射，对地面保温作用强'],
      ['Clouds emit strong ultraviolet shortwave solar radiation at midnight', '云层在午夜会发射强烈的太阳紫外短波辐射'],
      ['Clear nights have no gravity, so all air escapes into space', '晴朗的夜晚没有重力，空气全部逃逸到太空'],
      ['Clouds stop the Earth from rotating at night', '云层在夜间会阻止地球自转'],
    ],
    answer: 0,
    tag: ['Atmospheric counter-radiation', '大气逆辐射与保温作用'],
    why: ['Water vapor and cloud droplets absorb longwave radiation from the ground and radiate it back downward as atmospheric counter-radiation.', '云层中的水汽和云滴能强烈吸收地面长波辐射，并通过大气逆辐射将热量返还给地面，起到良好的保温作用；晴夜大气逆辐射弱，易发生霜冻。'],
  },
  {
    q: ['Put the layers of the atmosphere in order from the Earth\'s surface (0 km) UPWARD to interplanetary space.', '将地球大气垂直分层按从地面向上到星际空间的顺序排列。'],
    sec: SEC.skill,
    order: [
      ['Troposphere (convection; weather clouds & rain)', '对流层（天气现象复杂多变）'],
      ['Stratosphere (ozone layer; horizontal flow for aviation)', '平流层（含臭氧层，适合高空飞行）'],
      ['Upper atmosphere (mesosphere, thermosphere & ionosphere)', '高层大气（含电离层，能反射无线电波且有极光）'],
    ],
    tag: ['Atmospheric vertical layers', '大气的垂直分层'],
    why: ['From bottom to top: Troposphere (0 to ~8–18 km) → Stratosphere (up to ~50–55 km) → Upper Atmosphere.', '大气自下而上依次为对流层、平流层和高层大气。'],
  },
];

const H2_EXTRA_QUIZ: Quiz[] = [
  {
    q: ['Match each geological structure with its field signature and engineering application.', '将地质构造类型与它的地貌表现及工程应用配对。'],
    sec: SEC.match,
    match: [
      [['Anticline (older rock in core)', '背斜（岩层中心老、两翼新）'], ['Arch structure; good trap for oil & natural gas, and ideal for mountain tunnels', '天然拱形结构：良好的储油、储气构造，适宜开凿隧道']],
      [['Syncline (younger rock in core)', '向斜（岩层中心新、两翼老）'], ['Trough structure; good basin for storing groundwater; compressed core resists erosion to form a ridge', '储水构造；槽部受挤压岩石坚硬不易被侵蚀，常“地形倒置”成山']],
      [['Fault (horst & graben)', '断层（地垒与地堑）'], ['Horst forms block mountains (Huashan, Lushan, Taishan); graben forms rift valleys/basins (Fen–Wei Plains)', '地垒形成断块山（华山、庐山、泰山）；地堑形成谷地或盆地（渭河平原、汾河谷地）']],
    ],
    tag: ['Folds and faults', '褶皱（背斜向斜）与断层'],
    why: ['Oil/gas and tunnels belong in anticlines; groundwater collects in synclines; faults must be avoided by dams and tunnels.', '“背斜储油气、修隧道，向斜储水；断层处岩层不稳定，大型工程（水库、隧道）应避开”。'],
  },
  {
    q: ['Match each weather system with the weather it brings.', '将常见天气系统与它控制的典型天气现象配对。'],
    sec: SEC.match,
    match: [
      [['Cold front', '冷锋'], ['Gusty winds, drop in temperature, narrow rain/snow band (mostly behind the front); summer heavy downpours & winter cold waves', '过境时常出现大风、降温、雨雪天气（降水主要在锋后），如北方夏季暴雨和冬季寒潮']],
      [['Warm front', '暖锋'], ['Gentle continuous precipitation ahead of the front, followed by warming and clearing', '过境时常出现连续性降水（降水全在锋前），过境后气温上升、气压下降、天气转晴']],
      [['Low-pressure cyclone', '低压（气旋）'], ['Converging air rises in the center, bringing cloudy and rainy weather (e.g., typhoons)', '中心气流辐合上升，多阴雨天气（如夏秋季节的台风）']],
      [['High-pressure anticyclone', '高压（反气旋）'], ['Diverging air sinks in the center, bringing clear, dry weather (e.g., Yangtze "dog-days" drought & autumn crisp skies)', '中心气流下沉辐散，多晴朗干燥天气（如长江中下游伏旱、北方“秋高气爽”）']],
    ],
    tag: ['Weather fronts & pressure systems', '锋面与高低压天气系统'],
    why: ['Rising air in fronts and cyclones cools and condenses into rain; sinking air in anticyclones warms and inhibits cloud formation.', '气旋与锋面使暖湿气流抬升冷却凝结致雨；反气旋中心气流下沉增温，水汽不易凝结，多晴朗天气。'],
  },
  {
    q: ['Why is the summer southwest monsoon in South Asia (India) formed?', '南亚（印度半岛）夏季盛行的西南季风，其形成的主要原因是？'],
    sec: SEC.mc,
    options: [
      ['In northern summer, the southern-hemisphere Southeast Trade Winds cross the Equator and deflect right under the Northern Hemisphere Coriolis force', '北半球夏季气压带风带北移，南半球的东南信风越过赤道后受地转偏向力影响向右偏转而成'],
      ['Siberian high-pressure cold air blows directly from the north in July', '七月份西伯利亚冷高压直接向南吹送干冷气流'],
      ['The Westerlies shift south to the Equator in July', '七月份盛行西风带南移至赤道附近'],
      ['Cold Peru Current upwelling off the west coast of South America', '南美洲西岸秘鲁寒流上升补偿流直接吹向印度'],
    ],
    answer: 0,
    tag: ['South Asian monsoon mechanism', '南亚季风成因'],
    why: ['While East Asian monsoons are driven solely by land–sea thermal contrast, the South Asian summer SW monsoon is primarily caused by seasonal migration of pressure/wind belts (SE trades crossing the equator and turning right) combined with the Asian Low.', '东亚季风主要由海陆热力性质差异形成；而南亚夏季西南季风主要是气压带和风带的季节移动（南半球东南信风北移越过赤道向右偏转）与海陆热力差异共同作用的结果。'],
  },
  {
    q: ['Which spatial differentiation law explains the transition from forest → steppe → desert as you travel inland from China\'s eastern coast to Xinjiang?', '从我国东部沿海向西北内陆依次出现“森林→草原→荒漠”的景观变化，体现了哪种地域分异规律？'],
    sec: SEC.mc,
    options: [
      ['Dry–wet (coastal-to-inland / longitudinal) regional differentiation, driven mainly by moisture', '从沿海向内陆的地域分异规律（干湿度地带分异规律），以水分为基础'],
      ['Latitudinal (equator-to-pole) regional differentiation, driven mainly by heat', '由赤道到两极的地域分异规律（纬度地带性），以热量为基础'],
      ['Vertical zonation on high mountains, driven by combined heat and moisture changes with altitude', '山地的垂直地域分异规律，受海拔引起的水热组合变化控制'],
      ['Local non-zonal oasis anomaly', '地方性非地带性绿洲分异'],
    ],
    answer: 0,
    tag: ['Regional differentiation laws', '地域分异规律（水平与垂直）'],
    why: ['Moving from coast to inland at mid-latitudes, precipitation drops steadily, shifting vegetation from forest to grassland to desert.', '在中纬度地区从沿海向内陆，随着距离海洋越来越远，水分逐渐减少，自然景观呈现森林带→草原带→荒漠带的干湿度地带分异规律。'],
  },
];

const EXTRA_POOLS: Record<Grade, Quiz[]> = {
  g7a: G7A_EXTRA_QUIZ,
  g7b: G7B_EXTRA_QUIZ,
  g8a: G8A_EXTRA_QUIZ,
  g8b: G8B_EXTRA_QUIZ,
  h1: H1_EXTRA_QUIZ,
  h2: H2_EXTRA_QUIZ,
};

// ============================================================================
// 3. Six Grade-Level Question Bank & Mock Exam Lessons (六大年级综合题库与模拟卷)
// ============================================================================

interface BankSpec {
  id: string;
  grade: Grade;
  strand: Lesson['strand'];
  tracks: Lesson['tracks'];
  unit: Pair;
  title: Pair;
  blurb: Pair;
  keys: Pair[];
  steps: Step[];
}

const BANK_SPECS: BankSpec[] = [
  {
    id: 'exam-g7a',
    grade: 'g7a',
    strand: 'maps',
    tracks: ['uk', 'us', 'ib', 'au'],
    unit: ['Grade 7 Term 1 · Question Bank', '七年级上册 · 综合题库'],
    title: ['Grade 7 Term 1 · Question Bank & Mock Exam', '七年级上册 · 综合题库与期末模拟'],
    blurb: ['Freshly drawn mock exam covering Earth & graticule, rotation & seasons, contour maps, plates, world climates, and human settlements.', '涵盖经纬网、地球运动、等高线地形图、海陆板块、世界气候判读与人口聚落，每次重新组卷并自动收录错题。'],
    keys: [
      ['Hemispheres: 0° latitude divides N/S; 20°W and 160°E divide E/W; 0°–30° is low, 30°–60° middle, and 60°–90° high latitude.', '半球划分：赤道分南北，20°W 和 160°E 分东西（小小为东，大大为西）；0°—30° 为低纬、30°—60° 为中纬、60°—90° 为高纬。'],
      ['Contours: "convex to low is a ridge, convex to high is a valley"; closer contours mean steeper slopes.', '等高线判读：“凸低为脊、凸高为谷”，等高线越密集坡度越陡，重叠处为陡崖。'],
      ['Climate graph reading ("Temperature sets the zone, Rainfall sets the type"): check coldest month (>15 °C tropical, 0–15 °C subtropical/maritime, <0 °C temperate) and rain pattern.', '气候判读“以温定带、以水定型”：最冷月 >15 ℃ 为热带，0—15 ℃ 为亚热带或温带海洋性，<0 ℃ 为温带；再按年雨、夏雨、冬雨（地中海）、少雨定气候类型。'],
    ],
    steps: [
      {
        title: ['Review 1 · Graticule, Hemispheres and Earth\'s Motion', '考前串讲 1 · 经纬网、半球划分与地球运动'],
        cam: [20, 20, 3.4],
        lines: [par(0, C.red, 0.2), par(23.436, C.gold, 0.4), par(-23.436, C.gold, 0.4), mer(-20, C.teal, 0.6), mer(160, C.teal, 0.6)],
        marks: [
          mk([0, 0], 'Equator (0°)', '赤道（南北半球界线）', { dot: true, c: C.red, t: 0.3 }),
          mk([25, -20], '20°W (E/W Hemisphere Boundary)', '20°W（东西半球分界）', { dot: true, c: C.teal, t: 0.7 }),
        ],
        body: [
          'Before starting the Grade 7 Term 1 practice exam, review the three foundational rules: (1) Latitude runs 0°–90° N/S (Equator splits N/S hemispheres); Longitude runs 0°–180° E/W, while the 20°W–160°E circle splits the Eastern and Western Hemispheres. (2) Rotation causes day–night alternation and time differences; Revolution around the Sun (with 23.5° axial tilt) causes seasons, shifting daylength, and the five thermal zones.',
          '开始七年级上册综合模拟前，先回顾核心考点：①纬线指示东西、经线指示南北；赤道划分南北半球，20°W 和 160°E 经线圈划分东西半球。②地球自转产生昼夜更替与时差；地球公转产生四季更替、昼夜长短变化和五带划分。',
        ],
      },
      {
        title: ['Review 2 · Contour Maps, Continents and Plate Tectonics', '考前串讲 2 · 等高线地形图与海陆板块'],
        cam: [25, 90, 3.4],
        marks: [
          mk([27.99, 86.93], 'Himalayas: Eurasian × Indian Plate Collision', '喜马拉雅山：亚欧板块与印度洋板块碰撞', { dot: true, c: C.gold, t: 0.4 }),
          mk([20.0, 38.5], 'Red Sea: Diverging Plates (Expanding)', '红海：印度洋板块与非洲板块张裂扩张', { dot: true, c: C.red, t: 0.8 }),
        ],
        body: [
          'Earth\'s surface is 71% ocean ("seven parts sea") and 29% land ("three parts land"). Six major tectonic plates are in constant motion: interiors are stable while plate boundaries have active volcanoes and earthquakes along the Circum-Pacific and Mediterranean–Himalayan belts. On contour maps, remember that contour lines bending toward lower values form a ridge (watershed), while lines bending toward higher values form a valley (stream channel).',
          '全球海陆比例为“七分海洋（71%）、三分陆地（29%）”。六大板块内部较稳定，交界处地壳活跃（张裂形成裂谷或海洋如红海，碰撞挤压形成高大山脉如喜马拉雅山）。在等高线地形图上，“凸低为脊、凸高为谷”，山谷处可发育河流。',
        ],
      },
      {
        title: ['Review 3 · World Climates and Human Geography', '考前串讲 3 · 世界气候类型与人口聚落'],
        cam: [30, 60, 3.4],
        marks: [
          mk([38, 15], 'Mediterranean: Summer Dry, Winter Wet', '地中海沿岸：夏季炎热干燥、冬季温和多雨', { dot: true, c: C.orange, t: 0.4 }),
          mk([51.5, -0.1], 'Western Europe: Maritime (Mild & Wet All Year)', '欧洲西部：温带海洋性气候（终年温和湿润）', { dot: true, c: C.green, t: 0.8 }),
        ],
        body: [
          'Temperature decreases from low to high latitudes, differs between land and sea in summer vs. winter, and drops by ~6 °C per 1,000 m of elevation. Every time you take this practice test, a fresh set of matching, choice, and map/calculation questions is drawn from the Grade 7 Term 1 bank. Any question you miss is automatically saved to your Wrong-Question Notebook for targeted review!',
          '世界气温由低纬向高纬递减，同纬度夏季陆地气温高于海洋、冬季相反，海拔每升高 1000 米气温约下降 6 ℃。每次启动本综合题库都会随机抽取配对题、选择题与读图计算题；做错的题目会自动进入“错题本”，方便随时重练攻克！',
        ],
      },
    ],
  },
  {
    id: 'exam-g7b',
    grade: 'g7b',
    strand: 'world',
    tracks: ['uk', 'us', 'ib', 'au'],
    unit: ['Grade 7 Term 2 · Question Bank', '七年级下册 · 综合题库'],
    title: ['Grade 7 Term 2 · Question Bank & Mock Exam', '七年级下册 · 综合题库与期末模拟'],
    blurb: ['Freshly drawn mock exam covering Asia, Japan, SE Asia, India, Russia, Middle East, Europe, Africa, Australia, USA, Brazil, and Polar regions.', '全面覆盖亚洲、日本、东南亚、印度、俄罗斯、中东、欧洲西部、撒哈拉以南非洲、澳大利亚、美国、巴西与极地地区。'],
    keys: [
      ['Asia is the largest continent in area, latitude span, and East–West distance; its high central plateaus/mountains send rivers radiating outward.', '亚洲是面积最大、跨纬度最广、东西距离最长的大洲；地势中部高、四周低，大河多发源于中部呈放射状流向周边的海洋。'],
      ['Key maritime chokepoints: Strait of Malacca (SE Asia), Strait of Hormuz (Persian Gulf oil), Suez Canal (Red Sea–Mediterranean), Panama Canal (Pacific–Atlantic).', '关键海上通道：马六甲海峡（沟通印太）、霍尔木兹海峡（波斯湾石油出口）、苏伊士运河（亚非界线）、巴拿马运河（南北美洲界线）。'],
      ['Industrial & farming patterns: Japan (Pacific coastal belt), Russia (heavy industry near minerals), USA (specialized agricultural belts & Silicon Valley), Brazil & Australia (iron ore exports, SE coastal cities).', '工农业格局：日本工业集中太平洋及濑户内海沿岸，俄罗斯重工业靠近矿产地，美国农业地区专业化，澳大利亚与巴西人口城市均集中在东南沿海。'],
    ],
    steps: [
      {
        title: ['Review 1 · Asia and Our Neighbours (Japan, SE Asia, India, Russia)', '考前串讲 1 · 亚洲与邻近国家和地区'],
        cam: [32, 100, 3.3],
        marks: [
          mk([32, 88], 'Asia: High Center, Radial Rivers', '亚洲：中部高四周低、放射状水系', { dot: true, c: C.gold, t: 0.3 }),
          mk([35.7, 139.7], 'Japan: Pacific Industrial Belt', '日本：太平洋沿岸工业带', { dot: true, c: C.red, t: 0.6 }),
          mk([2.5, 101.2], 'Strait of Malacca', '马六甲海峡', { dot: true, c: C.teal, t: 0.9 }),
          mk([55.75, 37.6], 'Russia: Heavy Industry & Trans-Siberian Railway', '俄罗斯：重工业发达与西伯利亚大铁路', { dot: true, c: C.blue, t: 1.2 }),
        ],
        body: [
          'Asia\'s central highlands send rivers radiating to the Arctic, Pacific, and Indian Oceans, with monsoon climates dominating its eastern and southern margins. Japan imports raw materials and exports manufactured goods from its Pacific coast; Southeast Asia sits at the crossroads of two oceans; India leverages the SW monsoon for food crops and Bengaluru for software outsourcing; Russia spans Eurasia with rich mineral/energy resources and southern Asian railway corridors.',
          '亚洲地势中部高四周低，季风气候显著、大陆性气候分布广。日本工业集中在太平洋及濑户内海沿岸；东南亚地处“十字路口”；印度服务外包产业发达（班加罗尔）；俄罗斯重工业发达，西伯利亚大铁路沿南部山区修建。',
        ],
      },
      {
        title: ['Review 2 · Eastern Hemisphere: Middle East, Europe, Africa & Australia', '考前串讲 2 · 中东、欧洲西部、非洲与澳大利亚'],
        cam: [15, 45, 3.4],
        marks: [
          mk([26.6, 56.3], 'Persian Gulf & Strait of Hormuz (Oil)', '波斯湾与霍尔木兹海峡（石油）', { dot: true, c: C.gold, t: 0.3 }),
          mk([50, 8], 'Western Europe: Maritime Climate & Dairy', '欧洲西部：温带海洋性气候与乳畜业', { dot: true, c: C.green, t: 0.6 }),
          mk([-2, 24], 'Sub-Saharan Africa: Tropical Savanna & Raw Materials', '撒哈拉以南非洲：热带草原与初级农矿产品', { dot: true, c: C.orange, t: 0.9 }),
          mk([-25, 135], 'Australia: Sheep, Minerals & SE Coast Cities', '澳大利亚：羊背与矿车上的国家', { dot: true, c: C.teal, t: 1.2 }),
        ],
        body: [
          'In the Eastern Hemisphere: the Middle East combines strategic seas/canals, Persian Gulf oil, and severe water scarcity; Western Europe pairs flat plains and maritime climate with intensive dairy farming and tourism; Sub-Saharan Africa is the "Tropical Plateau Continent" working to diversify beyond primary commodities; Australia\'s unique wildlife, sheep-wheat belts, and mineral exports center on its habitable southeastern coast.',
          '中东“两洋三洲五海之地”，石油集中在波斯湾及其沿岸，水资源匮乏；欧洲西部乳畜业和旅游业发达；撒哈拉以南非洲热带草原气候广布，面临人口、粮食与环境问题；澳大利亚特有生物多，人口与城市集中分布在东南沿海。',
        ],
      },
      {
        title: ['Review 3 · Western Hemisphere (USA, Brazil) & Polar Regions', '考前串讲 3 · 西半球（美国、巴西）与极地地区'],
        cam: [0, -65, 3.5],
        marks: [
          mk([41, -93], 'USA: Specialized Agricultural Belts (Corn, Dairy)', '美国：中部平原农业带专业化', { dot: true, c: C.gold, t: 0.4 }),
          mk([-3.1, -60.0], 'Amazon Rainforest: "Lungs of the Earth"', '亚马孙热带雨林：“地球之肺”', { dot: true, c: C.green, t: 0.8 }),
          mk([-75, 75], 'Antarctica: Coldest, Driest, Windiest Continent', '南极大陆：酷寒、干燥、烈风', { dot: true, c: C.ice, t: 1.2 }),
        ],
        body: [
          'In the Western Hemisphere, the United States features three longitudinal terrain zones, specialized farming belts around the Great Lakes and Mississippi Plains, and high-tech hubs led by Silicon Valley; Brazil balances tropical agriculture and iron-ore industry with protecting the Amazon Rainforest. At the poles, the Arctic is an ocean surrounded by land (polar bears), while Antarctica is a high ice-covered continent surrounded by ocean (penguins, best visited Nov–Mar).',
          '美国地形呈南北纵列分布，农业实现地区专业化，高新技术产业领先；巴西兼有辽阔的亚马孙雨林与巴西高原。极地地区中，北极是“陆包洋”（代表动物北极熊），南极是“洋包陆”（代表动物企鹅，暖季 11 月至次年 3 月最宜科考）。',
        ],
      },
    ],
  },
  {
    id: 'exam-g8a',
    grade: 'g8a',
    strand: 'china',
    tracks: ['uk', 'us', 'ib'],
    unit: ['Grade 8 Term 1 · Question Bank', '八年级上册 · 综合题库'],
    title: ['Grade 8 Term 1 · Question Bank & Mock Exam', '八年级上册 · 综合题库与期末模拟'],
    blurb: ['Freshly drawn mock exam on China\'s territory & provinces, population, Three Terrain Steps, climate & Qinling–Huaihe line, Yangtze & Yellow River, resources, and railways.', '涵盖中国的疆域与行政区划、人口民族、三级阶梯与地形区、气候与秦岭—淮河线、长江黄河、自然资源与防灾减灾及交通运输。'],
    keys: [
      ['China\'s territory & people: 9.6 million km² land, 34 provincial administrative regions; population split by the Heihe–Tengchong line; ethnic distribution "mixed on a large scale, clustered in small communities".', '疆域与人口：陆地面积约 960 万平方千米，34 个省级行政区；人口以黑河—腾冲一线为界东多西少；民族分布“大杂居、小聚居、交错居住”。'],
      ['Terrain & climate: Three Steps descending west to east; Qinling–Huaihe marks the Jan 0 °C isotherm and 800 mm isohyet; monsoon climates bring simultaneous summer heat and rain.', '地势与气候：西高东低呈三级阶梯；秦岭—淮河一线是 1 月 0 ℃ 等温线和 800 毫米年等降水量线经过的地方；季风气候显著、雨热同期。'],
      ['Rivers & economy: Yangtze ("Water Power Treasury" & "Golden Waterway"); Yellow River (middle-reach Loess Plateau sediment, lower-reach "Aboveground River"); South-to-North Water Diversion & railway hubs.', '河流与经济：长江是“水能宝库”和“黄金水道”；黄河中游流经黄土高原含沙量大，下游形成“地上河”；南水北调缓解华北西北缺水。'],
    ],
    steps: [
      {
        title: ['Review 1 · China\'s Territory, Population and Three Terrain Steps', '考前串讲 1 · 疆域、人口民族与三级阶梯'],
        cam: [35, 105, 2.8],
        lines: [
          { pts: STEP1, c: C.violet, w: 2.2, dur: 1.0 },
          { pts: STEP2, c: C.brown, w: 2.0, dur: 1.0 },
          { pts: [[50.2, 127.5], [25.0, 98.5]], c: C.gold, w: 1.8, dur: 1.0 },
        ],
        marks: [
          mk([50.2, 127.5], 'Heihe', '黑河', { dot: true, c: C.gold, t: 0.3 }),
          mk([25.0, 98.5], 'Tengchong', '腾冲', { dot: true, c: C.gold, t: 0.5 }),
          mk([33.0, 88.0], 'Step 1: Qinghai–Tibet Plateau (>4,000 m)', '第一级阶梯：青藏高原', { dot: true, c: C.violet, t: 0.8 }),
        ],
        body: [
          'China lies in eastern Asia on the western shore of the Pacific Ocean, bordered by four seas from north to south: Bohai, Yellow, East China, and South China Seas (Bohai and Qiongzhou Strait are internal waters). The Heihe–Tengchong line divides the densely populated eastern 43% of land (94% of people) from the sparse west. Terrain descends from west to east in three steps, letting moist ocean air flow inland and creating huge hydroelectric potential at step boundaries.',
          '我国位于亚洲东部、太平洋西岸，自北向南濒临渤海、黄海、东海和南海（渤海和琼州海峡为内海）。黑河—腾冲一线以东面积占 43%，人口占 94%。地势西高东低呈三级阶梯分布，有利于海洋湿润气流深入内陆形成降水，且在阶梯交界处落差大、水能资源极为丰富。',
        ],
      },
      {
        title: ['Review 2 · Climate, Qinling–Huaihe and the Yangtze & Yellow Rivers', '考前串讲 2 · 气候、秦岭—淮河线与长江黄河'],
        cam: [33, 110, 2.6],
        lines: [{ pts: QINLING_HUAIHE, c: C.red, w: 2.4, dur: 1.0 }],
        marks: [
          mk([33.8, 109.0], 'Qinling–Huaihe: 0 °C (Jan) & 800 mm Rain', '秦岭—淮河：1 月 0 ℃ 与 800 mm 降水量线', { dot: true, c: C.red, t: 0.4 }),
          mk([30.82, 111.0], 'Three Gorges (Upper–Middle Yangtze)', '三峡水利枢纽（宜昌附近）', { dot: true, c: C.blue, t: 0.8 }),
          mk([34.8, 113.6], 'Lower Yellow River: "Aboveground River"', '黄河下游：“地上河”', { dot: true, c: C.gold, t: 1.1 }),
        ],
        body: [
          'In winter, China has a huge north–south temperature gap (~50 °C); in summer, almost the whole country is hot except the Qinghai–Tibet Plateau. Precipitation decreases from the southeast coast toward the northwest interior. The Yangtze originates in the Tanggula Mountains and enters the East China Sea; the Yellow River originates in the Bayan Har Mountains, picks up heavy silt across the Loess Plateau in its middle reach, and forms an "aboveground river" on the North China Plain.',
          '我国冬季南北温差大，夏季除青藏高原外普遍高温；降水从东南沿海向西北内陆递减。长江发源于唐古拉山脉注入东海，上游水能丰富、中下游航运发达；黄河发源于巴颜喀拉山脉注入渤海，中游流经黄土高原水土流失严重，下游泥沙淤积形成“地上河”，治黄的关键在于治沙。',
        ],
      },
      {
        title: ['Review 3 · Natural Resources, Agriculture, Industry & Transport', '考前串讲 3 · 自然资源、工农业与交通运输'],
        cam: [36, 114, 2.6],
        marks: [
          mk([39.9, 116.4], 'Jing–Jin–Tang Industrial Base', '京津唐综合性工业基地', { dot: true, c: C.gold, t: 0.4 }),
          mk([31.2, 121.5], 'Yangtze River Delta (Largest Comprehensive Base)', '沪宁杭（长三角）全国最大综合性工业基地', { dot: true, c: C.green, t: 0.7 }),
          mk([34.75, 113.65], 'Zhengzhou (Jingguang × Longhai Hub)', '郑州（京广线与陇海线交汇）', { dot: true, c: C.teal, t: 1.0 }),
        ],
        body: [
          'China\'s water resources are abundant in the south and summer/autumn, scarce in the north and winter/spring — addressed by the South-to-North Water Diversion and reservoirs. The 400 mm isohyet separates western pastoralism from eastern crop farming (further split at Qinling–Huaihe into northern dryland wheat and southern paddy rice). Four major coastal industrial bases and a crisscross national railway network anchor the modern economy.',
          '我国水资源南丰北缺、夏秋多冬春少，通过南水北调和兴修水库加以调节。农业呈“西牧东耕、南稻北麦”格局；四大工业基地沿海分布（辽中南、京津唐、沪宁杭、珠江三角洲）；铁路干线构成“五纵三横”等全国综合立体交通网骨架。',
        ],
      },
    ],
  },
  {
    id: 'exam-g8b',
    grade: 'g8b',
    strand: 'china',
    tracks: ['ib'],
    unit: ['Grade 8 Term 2 · Question Bank', '八年级下册 · 综合题库'],
    title: ['Grade 8 Term 2 · Question Bank & Mock Exam', '八年级下册 · 综合题库与期末模拟'],
    blurb: ['Freshly drawn mock exam on China\'s Four Major Geographical Regions, Northeast, Loess Plateau, Beijing, YRD, PRD/HK/Macau, Taiwan, Xinjiang, and Sanjiangyuan.', '全面覆盖四大地理区域划分、北方（东北三省、黄土高原、北京）、南方（长三角、港澳、珠三角、台湾）、西北（塔里木盆地）与青藏（三江源）。'],
    keys: [
      ['Four Major Geographical Regions: Northern & Southern separated by Qinling–Huaihe (climate); Northern & Northwestern by 400 mm isohyet (precipitation); Qinghai–Tibet by Step 1 boundary (elevation).', '四大地理区域：北方与南方以秦岭—淮河为界（气候主导）；北方与西北大体以 400 毫米年等降水量线为界（降水主导）；青藏与其他三区以第一级阶梯边缘为界（地形地势主导）。'],
      ['Northern & Southern highlights: Northeast ("Cold & Wet", black soil commercial grain base); Loess Plateau (gullied terrain, soil & water conservation); YRD ("Land of Fish and Rice", river–sea intermodal hub led by Shanghai); Taiwan (export-oriented economy, ring coastal cities).', '南北方重点区域：东北三省“冷湿”黑土商品粮基地与重工业摇篮；黄土高原千沟万壑需水土保持；长三角“鱼米之乡”与江海联运枢纽；台湾“进口—加工—出口”型经济。'],
      ['Northwest & Qinghai–Tibet highlights: Northwest ("Arid", east-to-west steppe → desert steppe → desert, Tarim oil/gas & West-to-East Gas Pipeline); Qinghai–Tibet ("High & Cold", river-valley barley farming, Sanjiangyuan "Chinese Water Tower").', '西北与青藏重点区域：西北“干旱”，塔里木盆地绿洲环绕、西气东输；青藏“高寒”，河谷农业（青稞），三江源是长江、黄河、澜沧江源头，被誉为“中华水塔”。'],
    ],
    steps: [
      {
        title: ['Review 1 · Four Major Regions and Northern China (Northeast, Loess, Beijing)', '考前串讲 1 · 四大地理区域与北方地区'],
        cam: [38, 114, 2.7],
        lines: [{ pts: QINLING_HUAIHE, c: C.red, w: 2.2, dur: 1.0 }],
        marks: [
          mk([46.5, 127.0], 'Northeast: Black Soil & Commercial Grain', '东北三省：黑土地与最大商品粮基地', { dot: true, c: C.green, t: 0.3 }),
          mk([36.6, 109.5], 'Loess Plateau: Soil Erosion & Check Dams', '黄土高原：水土流失治理（植树种草、打坝淤地）', { dot: true, c: C.orange, t: 0.7 }),
          mk([39.9, 116.4], 'Beijing: Political, Cultural & International Center', '北京：政治中心、文化中心、国际交往中心、科技创新中心', { dot: true, c: C.gold, t: 1.0 }),
        ],
        body: [
          'China is divided into the Northern, Southern, Northwestern, and Qinghai–Tibet regions. In the Northern Region: the Northeast Plains have cold-wet climate, fertile black soil, flat terrain, and sparse population relative to farmland, making them China\'s largest commercial grain base; the Loess Plateau combats soil erosion through biological measures (trees/grass) and engineering measures (terraces, check dams); Beijing serves as the national political, cultural, international exchange, and sci-tech innovation center.',
          '我国划分为北方、南方、西北和青藏四大地理区域。北方地区中：东北三省山环水绕、沃野千里，是我国最大的商品粮基地和新中国工业摇篮；黄土高原通过生物措施（植树种草）与工程措施（修筑梯田、打坝淤地）综合治理水土流失；北京是全国政治中心、文化中心、国际交往中心和科技创新中心。',
        ],
      },
      {
        title: ['Review 2 · Southern China (Yangtze Delta, Greater Bay Area, HK/Macau & Taiwan)', '考前串讲 2 · 南方地区（长三角、粤港澳与台湾）'],
        cam: [26, 118, 2.6],
        marks: [
          mk([31.23, 121.47], 'Shanghai & YRD: River–Sea Hub', '上海与长三角：江海交汇之地', { dot: true, c: C.gold, t: 0.3 }),
          mk([22.3, 114.1], 'HK, Macau & PRD: Greater Bay Area', '粤港澳大湾区', { dot: true, c: C.red, t: 0.7 }),
          mk([23.7, 121.0], 'Taiwan: Yushan, Sun Moon Lake & Silicon Island', '台湾省：玉山、日月潭与高新技术产业', { dot: true, c: C.green, t: 1.0 }),
        ],
        body: [
          'Southern China has a humid subtropical/tropical monsoon climate ("Red Soil") and paddy-field farming. The Yangtze River Delta sits at the T-junction of the Golden Waterway and the coast, with Shanghai as its radiating core; Hong Kong (free port, finance/trade/shipping) and Macau work tightly with Guangdong in the Greater Bay Area; Taiwan Island lies across the Taiwan Strait from Fujian, rich in forest ("Asian Botanical Garden"), sea salt, camphor, and semiconductor industries.',
          '南方地区湿热多雨，被称为“红土地”。长江三角洲地处江海交汇之地，上海对区域乃至全国具有辐射带动作用；香港是国际金融、航运、贸易中心，与祖国内地优势互补；台湾省隔台湾海峡与福建省相望，享有“祖国东南海上的明珠”、“亚洲天然植物园”、“东方甜岛”、“海上米仓”等美誉。',
        ],
      },
      {
        title: ['Review 3 · Northwest (Tarim Basin) and Qinghai–Tibet (Sanjiangyuan)', '考前串讲 3 · 西北地区（塔里木盆地）与青藏地区（三江源）'],
        cam: [36, 90, 2.8],
        marks: [
          mk([39.5, 83.0], 'Tarim Basin: Oasis Ring & West–East Gas Pipeline', '塔里木盆地：绿洲农业、坎儿井与西气东输', { dot: true, c: C.gold, t: 0.4 }),
          mk([33.5, 96.0], 'Sanjiangyuan: Source of Yangtze, Yellow & Lancang', '三江源：长江、黄河、澜沧江源头（“中华水塔”）', { dot: true, c: C.blue, t: 0.8 }),
          mk([29.65, 91.1], 'Lhasa ("Sunlight City") & Yarlung Tsangpo Valley', '拉萨（“日光城”）与雅鲁藏布江谷地河谷农业', { dot: true, c: C.violet, t: 1.2 }),
        ],
        body: [
          'The Northwest Region is dominated by aridity because it is far from the sea and blocked by mountains; towns and roads in the Tarim Basin ring the basin margin along mountain-foot oases fed by snowmelt, while the West-to-East Gas Pipeline benefits both western resource development and eastern clean energy. On the "High and Cold" Qinghai–Tibet Plateau, yaks ("Boats of the Plateau") graze alpine meadows, highland barley grows in warmer river valleys, and Sanjiangyuan National Park protects the headwaters of the Yangtze, Yellow, and Lancang Rivers.',
          '西北地区突出自然特征是“干旱”，塔里木盆地城镇、交通线分布在盆地边缘有冰雪融水灌溉的绿洲上，西气东输工程实现东西部双赢。青藏地区突出特征是“高寒”，被称为“世界屋脊”，太阳能、地热能丰富，藏绵羊、牦牛适应高寒环境，三江源地区是长江、黄河、澜沧江的源区，被誉为“中华水塔”。',
        ],
      },
    ],
  },
  {
    id: 'exam-h1',
    grade: 'h1',
    strand: 'physical',
    tracks: ['uk', 'us', 'ib', 'au'],
    unit: ['Senior Compulsory 1 · Question Bank', '高中必修第一册 · 综合题库'],
    title: ['Senior Compulsory 1 · Question Bank & Mock Exam', '高中必修第一册 · 综合题库与期末模拟'],
    blurb: ['Freshly drawn senior mock exam on Earth\'s spheres & history, atmospheric heating & thermal circulation, water cycle & ocean currents, landforms, soils, and vegetation.', '涵盖地球的宇宙环境与圈层结构、大气受热过程与热力环流、水循环与洋流、喀斯特/流水/风沙/海岸/冰川地貌、土壤与植被。'],
    keys: [
      ['Earth\'s spheres: Moho (~33 km on continents) separates Crust and Mantle; Gutenberg (~2,900 km, where S-waves vanish) separates Mantle and Core; Lithosphere = Crust + top of Upper Mantle above the asthenosphere.', '地球圈层：莫霍界面（大陆平均约 33 千米）分隔地壳与地幔；古登堡界面（约 2900 千米，横波消失）分隔地幔与地核；岩石圈＝地壳＋软流层以上的上地幔顶部。'],
      ['Atmosphere & Water: Ground longwave radiation is the direct heat source of the troposphere; thermal circulation flows Warm Rise (surface Low) → Cold Sink (surface High); urban heat island & sea–land breezes.', '大气与水：地面长波辐射是近地面大气主要的直接热源；热力环流规律“热升冷降、近地面热低压冷高压”；人类最易干预的水循环环节是地表径流。'],
      ['Landforms, Vegetation & Soils: External agents shape erosional and depositional landforms; climate controls vegetation leaf/root traits and is the most active factor in soil formation (while parent material sets mineral nutrients).', '地貌、植被与土壤：气候决定植被特征（如热带雨林板状根、常绿硬叶林革质叶、荒漠肉质茎与发达根系），生物是土壤有机质来源和最活跃因素，气候影响风化与淋溶强度。'],
    ],
    steps: [
      {
        title: ['Review 1 · Earth\'s History, Interior Layers and Atmospheric Heating', '考前串讲 1 · 地球演化、内部圈层与大气受热过程'],
        cam: [28, 105, 3.2],
        marks: [
          mk([30.0, 90.0], 'Qinghai–Tibet Crust (~70 km thick; thin air, strong solar radiation)', '青藏高原：地壳最厚（约 70 km），空气稀薄太阳辐射强、保温弱', { dot: true, c: C.violet, t: 0.4 }),
          mk([29.5, 105.5], 'Sichuan Basin: Heavy Clouds (Weak Solar Radiation, Strong Counter-Radiation)', '四川盆地：多云雾（太阳辐射最弱，大气逆辐射强）', { dot: true, c: C.gold, t: 0.8 }),
        ],
        body: [
          'Seismic P-waves travel through solids, liquids, and gases, whereas slower S-waves travel only through solids. At the Gutenberg discontinuity (2,900 km depth), S-waves disappear, proving the outer core is liquid. In the troposphere, solar shortwave radiation warms the ground, ground longwave radiation warms the atmosphere, and atmospheric counter-radiation warms the ground at night. High plateaus have strong solar radiation but weak counter-radiation; cloudy basins have weak solar radiation but strong counter-radiation.',
          '地震纵波（P 波）波速快，能通过固、液、气三态；横波（S 波）波速慢，只能通过固态，在 2900 千米深处的古登堡界面完全消失。大气受热过程为“太阳暖大地→大地暖大气→大气还大地”：青藏高原海拔高、空气稀薄，大气削弱作用弱（太阳辐射强）但大气逆辐射也弱（夜晚寒冷）。',
        ],
      },
      {
        title: ['Review 2 · Thermal Circulation, Winds, Water Cycle and Ocean Properties', '考前串讲 2 · 热力环流、风向判读、水循环与海水运动'],
        cam: [15, -60, 3.4],
        marks: [
          mk([47.0, -50.0], 'Newfoundland Fishery: Labrador Cold × Gulf Stream Warm', '纽芬兰渔场：拉布拉多寒流与墨西哥湾暖流交汇', { dot: true, c: C.blue, t: 0.4 }),
          mk([-12.0, -78.0], 'Peru Fishery: Cold Upwelling Current', '秘鲁渔场：秘鲁寒流（上升流将深层营养盐带至表层）', { dot: true, c: C.teal, t: 0.8 }),
        ],
        body: [
          'Uneven surface heating drives thermal circulation (sea breeze by day, land breeze by night; valley breeze by day, mountain breeze by night). Upper-level winds parallel isobars (PGF + Coriolis), while surface winds cross isobars from high to low pressure at an angle (PGF + Coriolis + Friction; deflecting right in the N. Hemisphere, left in the S. Hemisphere). Sponge-city green infrastructure increases infiltration and reduces surface runoff peaks.',
          '地表冷热不均引起热力环流（白天吹海风、谷风，夜晚吹陆风、山风）。高空风最终与等压线平行，近地面风受水平气压梯度力、地转偏向力（北右南左）和摩擦力共同作用，斜穿等压线由高压吹向低压。“海绵城市”通过透水铺装、下凹式绿地增加下渗、削减地表径流洪峰。',
        ],
      },
      {
        title: ['Review 3 · Landforms, Natural Disasters, Vegetation and Soils', '考前串讲 3 · 典型地貌、植被与土壤'],
        cam: [25, 110, 2.8],
        marks: [
          mk([25.27, 110.29], 'Guilin Karst: Peak Clusters & Caves', '桂林山水：喀斯特溶蚀与淀积地貌', { dot: true, c: C.green, t: 0.4 }),
          mk([40.1, 94.6], 'Northwest Yardangs & Crescent Dunes', '西北干旱区：风蚀雅丹与新月形沙丘（缓坡迎风）', { dot: true, c: C.orange, t: 0.8 }),
          mk([46.0, 126.5], 'Northeast Chernozem (Cold-Wet → High Humus)', '东北黑土：冷湿环境微生物分解慢，有机质积累多', { dot: true, c: C.lime, t: 1.2 }),
        ],
        body: [
          'Barchan (crescent) sand dunes have a gentle windward slope and a steep leeward slip face. In humid-hot Southern China, rapid microbial decomposition and strong leaching produce acidic, organic-poor red soil; in cold-wet Northeast China, slow microbial decay accumulates thick, fertile black soil (chernozem). Take the mock exam now to test all Compulsory 1 modules!',
          '新月形沙丘迎风坡缓、背风坡陡。我国南方湿热环境下有机质分解快、淋溶强，形成偏酸性的红壤；东北冷湿环境下微生物分解慢，有机质大量积累形成肥沃的黑土。现在开始必修第一册综合模拟测试吧！',
        ],
      },
    ],
  },
  {
    id: 'exam-h2',
    grade: 'h2',
    strand: 'climate',
    tracks: ['uk', 'us', 'ib'],
    unit: ['Senior Elective 1 · Question Bank', '高中选择性必修 1 · 综合题库'],
    title: ['Senior Elective 1 · Question Bank & Mock Exam', '高中选择性必修 1 · 综合题库与期末模拟'],
    blurb: ['Freshly drawn senior mock exam on Earth\'s rotation/revolution & solar calculations, rock cycle & geological structures, pressure belts & monsoons, weather systems, and physical zonation.', '全面覆盖地球自转与公转计算、岩石圈物质循环与内力构造、气压带风带与季风、锋面气旋天气系统、自然环境整体性与地域分异规律。'],
    keys: [
      ['Earth\'s movement formulas: Local time ±4 min per 1° longitude; noon sun angle H = 90° − |φ − δ|; sunrise is NE and sunset is NW worldwide (outside polar day/night) when the Sun is in the Northern Hemisphere.', '地球运动规律：经度每差 1° 地方时差 4 分钟；正午太阳高度 H = 90° − |φ − δ|；太阳直射北半球时，全球除极昼极夜区外均“日出东北、日落西北”；直射南半球则“日出东南、日落西南”。'],
      ['Rock cycle & structures: Only magma cools into igneous rock, and all rock types can melt back into magma; Anticline = older core (oil/gas/tunnel), Syncline = younger core (water; often forms an inverted ridge).', '岩石循环与构造：三大类岩石均可重熔再生为岩浆，而岩浆只能直接形成岩浆岩；背斜“老核”储油气宜修隧道，向斜“新核”储水且槽部受挤压易“地形倒置”成山。'],
      ['Circulation & Zonation: 7 pressure belts & 6 wind belts shift north in N. summer and south in N. winter; vertical mountain zonation mirrors latitudinal zonation from the mountain\'s base zone.', '环流与分异：气压带风带随太阳直射点移动而“北夏北移、北冬南移”；山地垂直自然带基带与当地水平自然带一致，纬度越低、海拔越高、相对高差越大，垂直带谱越丰富。'],
    ],
    steps: [
      {
        title: ['Review 1 · Earth\'s Rotation, Revolution and Sun-Angle Geometry', '考前串讲 1 · 地球运动与太阳视运动规律'],
        cam: [28, 115, 3.0],
        lines: [par(23.436, C.gold, 0.2), par(0, C.white, 0.4), par(-23.436, C.gold, 0.6)],
        marks: [
          mk([23.44, 116.5], 'N. Summer Half-Year: Sunrise NE, Sunset NW', '北半球夏半年：日出东北、日落西北', { dot: true, c: C.gold, t: 0.4 }),
          mk([-23.44, 116.5], 'N. Winter Half-Year: Sunrise SE, Sunset SW', '北半球冬半年：日出东南、日落西南', { dot: true, c: C.teal, t: 0.8 }),
        ],
        body: [
          'Earth orbits fastest near perihelion (early January) and slowest near aphelion (early July). When the subsolar point is in the Northern Hemisphere (Mar 21 to Sep 23), every non-polar location on Earth sees sunrise in the northeast and sunset in the northwest; when the subsolar point is in the Southern Hemisphere, sunrise is southeast and sunset is southwest. At noon, a place north of 23.5°N always sees the Sun due south (casting a shadow due north).',
          '地球公转在近日点（1 月初）速度最快，远日点（7 月初）速度最慢。太阳直射北半球时，全球（除极昼极夜区外）日出东北、日落西北；直射南半球时，日出东南、日落西南。北回归线以北地区正午太阳终年在正南天空，正午物影终年朝向正北。',
        ],
      },
      {
        title: ['Review 2 · Tectonic Structures, Pressure Belts, Monsoons and Fronts', '考前串讲 2 · 地质构造、三圈环流与天气系统'],
        cam: [30, 105, 3.0],
        marks: [
          mk([34.5, 110.1], 'Mount Huashan (Horst) & Weihe Plain (Graben)', '华山（地垒断块山）与渭河平原（地堑谷地）', { dot: true, c: C.orange, t: 0.4 }),
          mk([30.5, 118.0], 'Yangtze June Plum Rains (Quasi-stationary Front) & July–Aug Drought (Subtropical High)', '江淮 6 月梅雨（准静止锋）与 7—8 月伏旱（副高控制）', { dot: true, c: C.blue, t: 0.8 }),
        ],
        body: [
          'Distinguish anticlines vs. synclines by rock age (older in the core = anticline; younger in the core = syncline), not surface topography, since an eroded anticline crest often becomes a valley while a compressed syncline trough resists erosion to stand as a ridge. In eastern China, the seasonal march of the Western Pacific Subtropical High drives the frontal rain belt: South China (Apr–May) → Yangtze Plum Rains (mid-Jun to early Jul, followed by Subtropical High "dog-days" drought in Jul–Aug) → North & Northeast China (Jul–Aug).',
          '判读背斜和向斜最根本的依据是岩层新老关系（中心老两翼新为背斜，中心新两翼老为向斜），注意“背斜成谷、向斜成山”的地形倒置。我国锋面雨带受副热带高气压带推动：4—5 月在华南，6 月中旬至 7 月上旬在江淮形成“梅雨”（受江淮准静止锋控制），7—8 月雨带北移至华北、东北，而长江中下游受副高控制出现晴热少雨的“伏旱”。',
        ],
      },
      {
        title: ['Review 3 · Integrity of the Physical Environment and Zonation Laws', '考前串讲 3 · 自然环境的整体性与差异性规律'],
        cam: [28, 87, 2.8],
        marks: [
          mk([27.99, 86.93], 'Mt Everest: South Slope Has Richer Vertical Zones Than North Slope', '珠穆朗玛峰：南坡基带海拔低、迎风坡水热好，垂直自然带比北坡更丰富', { dot: true, c: C.gold, t: 0.4 }),
          mk([-12.0, -77.0], 'Atacama / Peruvian Coast Desert: Non-zonal (Andes Barrier + Peru Cold Current)', '南美西岸热带沙漠延伸近赤道：非地带性（安第斯山阻挡＋秘鲁寒流）', { dot: true, c: C.red, t: 0.8 }),
        ],
        body: [
          'All elements of the physical environment (terrain, climate, water, soil, biota) evolve together ("pull one hair and the whole body moves"). On Mount Everest (Qomolangma), the southern slope has more vertical natural zones and a lower snowline than the northern slope because its base lies in low river valleys (~1,000 m vs. 4,000 m on the Tibetan Plateau) and faces the moist Indian Ocean summer monsoon.',
          '自然地理环境各要素相互联系、相互制约，“牵一发而动全身”。在山地垂直地域分异中，珠穆朗玛峰南坡比北坡垂直自然带谱更丰富（因为南坡基带海拔低、相对高差大，且处于向阳坡和印度洋西南季风迎风坡）；南坡雪线却比北坡更低（因为南坡为迎风坡，降雪量远大于北坡）。',
        ],
      },
    ],
  },
];

/** Builds a fresh multi-section practice exam for `grade`, drawing from both `EXTRA_POOLS[grade]` and all lessons in that grade. */
export function buildGradeExam(
  grade: Grade,
  steps: Step[],
  baseLessons: readonly Lesson[],
  rand: () => number = Math.random,
): { steps: Step[]; quiz: Quiz[] } {
  const extra = EXTRA_POOLS[grade] ?? [];
  const matchPool = [
    ...extra.filter(q => q.match),
    ...baseLessons.filter(l => l.grade === grade && !l.exam).flatMap(l => l.quiz).filter(q => q.match),
  ];
  const mcPool = [
    ...extra.filter(q => q.options && !q.show),
    ...baseLessons.filter(l => l.grade === grade && !l.exam).flatMap(l => l.quiz).filter(q => q.options && !q.show),
  ];
  const skillPool = [
    ...extra.filter(q => q.order || q.num || q.place || q.at),
    ...baseLessons.filter(l => l.grade === grade && !l.exam).flatMap(l => l.quiz).filter(q => q.order || q.num || q.place || q.at),
  ];

  const pickedMatch = shuffle(matchPool, rand).slice(0, 2).map(q => ({ ...q, sec: SEC.match }));
  const pickedMc = shuffle(mcPool, rand).slice(0, 6).map(q => ({ ...q, sec: SEC.mc }));
  const pickedSkill = shuffle(skillPool, rand).slice(0, 4).map(q => ({ ...q, sec: SEC.skill }));

  return {
    steps,
    quiz: [...pickedMatch, ...pickedMc, ...pickedSkill],
  };
}

export function createGradeBankLessons(baseLessons: readonly Lesson[]): Lesson[] {
  return BANK_SPECS.map((spec, idx) => {
    const initial = buildGradeExam(spec.grade, spec.steps, baseLessons, mulberry32(0x9e3779b1 + idx * 101));
    return {
      id: spec.id,
      strand: spec.strand,
      grade: spec.grade,
      tracks: spec.tracks,
      unit: spec.unit,
      icon: 'trophy',
      minutes: 15,
      exam: true,
      title: spec.title,
      blurb: spec.blurb,
      keys: spec.keys,
      steps: initial.steps,
      quiz: initial.quiz,
      gen: () => buildGradeExam(spec.grade, spec.steps, baseLessons, Math.random),
    };
  });
}

export const ALL_EXTRA_QUIZ: Quiz[] = Object.values(EXTRA_POOLS).flat();
