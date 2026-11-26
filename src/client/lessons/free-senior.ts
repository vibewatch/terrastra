/** Free starter lesson for Senior High Geography (`cns`: PEP Compulsory 1 · The History of the Earth). */
import { C, mk, type Lesson, type Pair } from './kit.ts';
import { svg, tx, type Lx } from './figs.ts';

const EARTH: Pair = ['The Earth in the universe', '宇宙中的地球'];
const DARK = ' style="fill:#1b2733"';

interface Era { n: Pair; from: number; to: number; c: string }
const EONS: Era[] = [
  { n: ['Hadean', '冥古宙'], from: 4600, to: 4000, c: '#ae3ec9' },
  { n: ['Archean', '太古宙'], from: 4000, to: 2500, c: '#e64980' },
  { n: ['Proterozoic', '元古宙'], from: 2500, to: 541, c: '#f783ac' },
  { n: ['Phanerozoic', '显生宙'], from: 541, to: 0, c: '#74c0fc' },
];
const ERAS: Era[] = [
  { n: ['Paleozoic', '古生代'], from: 541, to: 252, c: '#8ce99a' },
  { n: ['Mesozoic', '中生代'], from: 252, to: 66, c: '#4dabf7' },
  { n: ['Cenozoic', '新生代'], from: 66, to: 0, c: '#ffd43b' },
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

const AGE = (from: number, to: number, secs: number) => ({ from, to, rate: (to - from) / secs, unit: 'x' as const, fmt: ['Geological time', '地质年代'] as Pair, once: true });

export const SENIOR_FREE: Lesson[] = [
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
];
