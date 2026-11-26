/** Astronomy lessons: the Solar System — the planets, its scale, small bodies, and systems of celestial bodies. */
import { svg, tx, type Lx } from '../figs.ts';
import { C, type Fig, type Lesson, type Pair } from '../kit.ts';
import { A_SOLAR_FREE } from './free-solar.ts';

const unit: Pair = ['The Solar System', '太阳系'];

/** NASA planetary fact sheet: distance from the Sun (AU), equatorial diameter (km), orbital period, mean density (g/cm³). */
const PLANETS: [Pair, string, string, string, string, string][] = [
  [['Mercury', '水星'], '0.39', '4,879', '88 d', '5.4', '#c9c0b6'],
  [['Venus', '金星'], '0.72', '12,104', '225 d', '5.2', '#e8cf9a'],
  [['Earth', '地球'], '1.00', '12,756', '365 d', '5.5', '#4dabf7'],
  [['Mars', '火星'], '1.52', '6,792', '1.88 yr', '3.9', '#e07a52'],
  [['Jupiter', '木星'], '5.20', '142,984', '11.9 yr', '1.3', '#d9b38c'],
  [['Saturn', '土星'], '9.58', '120,536', '29.4 yr', '0.7', '#ecd9a4'],
  [['Uranus', '天王星'], '19.2', '51,118', '84 yr', '1.3', '#9ad7e0'],
  [['Neptune', '海王星'], '30.1', '49,528', '165 yr', '1.6', '#5c7cfa'],
];
const planetTable: Fig = {
  k: 'svg', draw: (L: Lx) => {
    let o = tx(4, 12, L(['The planets in numbers', '行星数据一览']), 'fg-title') + tx(4, 23, L(['NASA fact sheet; d = days, yr = years', '数据来自 NASA；d 为天，yr 为年']), 'fg-sub');
    const X = [4, 112, 166, 228, 282];
    const HEAD: Pair[] = [['Planet', '行星'], ['Distance (AU)', '距日 (AU)'], ['Diameter (km)', '直径 (千米)'], ['Year', '公转周期'], ['Density', '密度']];
    HEAD.forEach((h, i) => { o += tx(X[i] + (i ? 30 : 0), 38, L(h), 'fg-sub', i ? 'e' : 's'); });
    PLANETS.forEach((r, k) => {
      const y = 52 + k * 12.5;
      o += `<g class="f-fade" style="--d:${(0.1 + k * 0.1).toFixed(1)}s"><circle cx="8" cy="${y - 3}" r="3" fill="${r[5]}"/>` + tx(15, y, L(r[0]), 'fg-label');
      [r[1], r[2], r[3], r[4]].forEach((v, i) => { o += tx(X[i + 1] + 30, y, v, 'fg-tick', 'e'); });
      o += '</g>';
      if (k === 3) o += `<line x1="4" x2="316" y1="${y + 4.5}" y2="${y + 4.5}" stroke="${C.gold}" stroke-opacity=".5" stroke-dasharray="2 2"/>`;
    });
    o += tx(4, 156, L(['density in g/cm³ (water = 1): rocky planets about 4–5.5, giants 0.7–1.6', '密度单位为克/厘米³（水 = 1）：类地行星约 4—5.5，巨行星 0.7—1.6']), 'fg-sub');
    return svg(320, 162, o, L(['Planet data table', '行星数据表']));
  },
};

export const A_SOLAR: Lesson[] = [
  // ------------------------------------------------------------------------------------------------ the planets
  {
    id: 'a-planets', strand: 'solar', level: 'jr', tracks: ['uk', 'us', 'ib'], unit, icon: 'planet', minutes: 9,
    title: ['The eight planets', '八大行星'],
    blurb: ['Meet the Sun’s family: rocky inner worlds, giant outer worlds, and the dwarf planets beyond.', '认识太阳的家族：岩质的类地行星、庞大的巨行星，还有更远处的矮行星。'],
    keys: [
      ['Order from the Sun: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune.', '离太阳由近到远：水星、金星、地球、火星、木星、土星、天王星、海王星。'],
      ['The four inner planets are small and rocky (terrestrial planets).', '内侧四颗是体积小、由岩石构成的类地行星。'],
      ['Jupiter and Saturn are gas giants; Uranus and Neptune are ice giants. Jupiter is the largest planet.', '木星、土星是巨行星，天王星、海王星是远日行星（冰巨星）。木星是最大的行星。'],
      ['Dwarf planets such as Pluto and Ceres are round but have not cleared their orbits.', '冥王星、谷神星等矮行星呈球形，但没有清空自己轨道附近的区域。'],
      ['Farther planets take longer to go round: Mercury 88 days, Earth 1 year, Neptune 165 years.', '离太阳越远，公转周期越长：水星 88 天，地球 1 年，海王星 165 年。'],
      ['Five planets are easy to see with the naked eye: Mercury, Venus, Mars, Jupiter and Saturn; Venus is the brightest.', '肉眼容易看到五颗行星：水星、金星、火星、木星和土星，其中金星最亮。'],
    ],
    steps: [
      {
        title: ['The Sun’s family', '太阳的家族'],
        astro: { kit: 'orrery', clock: { from: 0, to: 12, rate: 0.2, unit: 'year' } },
        body: ['The Solar System is the Sun and everything that orbits it. The Sun holds 99.8% of all its mass, and its gravity keeps eight planets on their paths. In order from the Sun: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus and Neptune.', '太阳系由太阳和所有绕它运行的天体组成。太阳占太阳系总质量的 99.8%，它的引力让八颗行星沿着各自的轨道运行。离太阳由近到远依次是：水星、金星、地球、火星、木星、土星、天王星和海王星。'],
      },
      {
        title: ['Rocky planets and giants', '类地行星和巨行星'],
        astro: { kit: 'orrery', groups: true, clock: { from: 0, to: 12, rate: 0.2, unit: 'year' } },
        body: ['The four inner planets are small, dense and rocky: the terrestrial planets. Jupiter and Saturn are huge gas giants made mostly of hydrogen and helium. Uranus and Neptune, far out in the cold, are ice giants, rich in water, ammonia and methane.', '内侧四颗行星体积小、密度大，由岩石构成，叫类地行星。木星和土星是主要由氢和氦组成的巨行星。天王星和海王星离太阳很远、非常寒冷，含有大量水、氨和甲烷冰，叫远日行星（冰巨星）。'],
      },
      {
        title: ['Sizes side by side', '大小比一比'],
        astro: { kit: 'orrery', mode: 'lineup', groups: true },
        body: ['Here the planets are drawn to the same scale, next to the edge of the Sun. Jupiter is 11 times wider than Earth, and the Sun is 109 times wider. Earth is the largest of the rocky planets; Mercury is the smallest planet of all.', '这里的行星按同一比例画出，左边是太阳的边缘。木星的直径是地球的 11 倍，太阳的直径是地球的 109 倍。地球是类地行星中最大的，水星是八颗行星中最小的。'],
      },
      {
        title: ['Four rocky worlds', '四颗岩质行星'],
        astro: { kit: 'orrery', planets: ['mercury', 'venus', 'earth', 'mars'], groups: true, clock: { from: 0, to: 4, rate: 0.12, unit: 'year' } },
        body: ['Mercury has almost no air and is covered in craters. Venus is wrapped in thick carbon dioxide clouds, and at about 464 °C it is the hottest planet. Earth is the only planet known to have liquid water on its surface and life. Mars is a cold red desert with Olympus Mons, a volcano about 22 km high.', '水星几乎没有大气，表面布满环形山。金星被浓厚的二氧化碳云层包裹，表面约 464 °C，是最热的行星。地球是目前所知唯一表面有液态水和生命的行星。火星是寒冷的红色荒漠，有高约 22 千米的奥林匹斯火山。'],
      },
      {
        title: ['Four giant worlds', '四颗巨大的行星'],
        astro: { kit: 'orrery', mode: 'lineup', planets: ['jupiter', 'saturn', 'uranus', 'neptune'], groups: true },
        body: ['Jupiter’s Great Red Spot is a storm wider than Earth. Saturn has the brightest rings, made of ice and rock, and is less dense than water. Uranus spins tipped on its side. Neptune has the fastest winds in the Solar System, about 2,000 km/h. None of them has a solid surface to stand on.', '木星的大红斑是一个比地球还宽的风暴。土星有最明亮的光环，由冰块和岩石组成，它的平均密度比水还小。天王星“躺着”自转。海王星的风速约 2000 千米/时，是太阳系中最快的。这四颗行星都没有可以站立的固体表面。'],
      },
      {
        title: ['Dwarf planets', '矮行星'],
        astro: { kit: 'orrery', dwarfs: true, belt: true, kuiper: true, scale: 'log', clock: { from: 0, to: 40, rate: 1, unit: 'year' } },
        body: ['In 2006 astronomers decided that Pluto is a dwarf planet: it is round and orbits the Sun, but it shares its orbit with many other icy bodies in the Kuiper belt. Ceres, the largest object in the asteroid belt, is a dwarf planet too, along with Eris, Haumea and Makemake.', '2006 年，天文学家把冥王星重新归类为矮行星：它呈球形、绕太阳运行，但它的轨道附近还有柯伊伯带里的许多冰质天体。小行星带中最大的谷神星也是矮行星，同类的还有阋神星、妊神星和鸟神星。'],
      },
      {
        title: ['The planets in numbers', '用数据认识行星'],
        astro: { kit: 'orrery', scale: 'log', clock: { from: 0, to: 30, rate: 0.8, unit: 'year' } },
        fig: planetTable,
        body: ['The table lists real data for each planet. The farther a planet is from the Sun, the longer its year: Mercury races round in 88 days, while Neptune needs 165 years: discovered in 1846, it completed its first full orbit since then only in 2011. The rocky planets are dense, 4 to 5.5 times as dense as water, while the giants are light; Saturn would float. Here the distances are squeezed (log scale) so all eight orbits fit: watch the inner planets lap the outer ones.', '表中列出了各行星的真实数据。离太阳越远，公转一周的时间越长：水星 88 天就绕太阳一圈，海王星却要 165 年，它 1846 年被发现，直到 2011 年才绕完被发现后的第一圈。类地行星密度大，约为水的 4—5.5 倍；巨行星密度小，土星甚至比水还轻。图中按对数比例压缩了距离，好让八条轨道都放得下：看看内侧行星怎样一圈圈超过外侧行星。'],
      },
      {
        title: ['Planets in our sky', '天空中的行星'],
        astro: { kit: 'model', kind: 'planets', planets: ['venus', 'mars', 'jupiter', 'saturn'], sight: ['venus', 'jupiter'] },
        body: ['Five planets are easy to see without a telescope. They look like bright stars, but they shine steadily rather than twinkling, and they slowly wander against the constellations: "planet" means "wanderer". Venus, the brightest after the Sun and Moon, is never far from the Sun, so it is seen only in the west after sunset or in the east before dawn. Ancient Chinese astronomers called the five planets Chenxing, Taibai, Yinghuo, Suixing and Zhenxing.', '有五颗行星不用望远镜就能看到。它们看起来像亮星，但光芒稳定、不怎么闪烁，并且在星座之间缓慢移动，“行星”就是“行走的星”的意思。金星是除太阳和月亮外最亮的天体，它总在太阳附近，只能在日落后的西方天空（长庚星）或日出前的东方天空（启明星）看到。我国古代把水、金、火、木、土五星分别叫做辰星、太白、荧惑、岁星和镇星。'],
      },
    ],
    quiz: [
      { q: ['Tap the largest planet.', '点出最大的行星。'], pick: 'jupiter', astro: { kit: 'orrery', mode: 'lineup' },
        why: ['Jupiter is the largest planet, about 11 times wider than Earth.', '木星是最大的行星，直径约为地球的 11 倍。'] },
      { q: ['Which planets are terrestrial (rocky) planets?', '下列哪一组都是类地行星？'],
        options: [['Mercury, Venus, Earth, Mars', '水星、金星、地球、火星'], ['Jupiter, Saturn, Uranus, Neptune', '木星、土星、天王星、海王星'], ['Earth, Mars, Jupiter, Saturn', '地球、火星、木星、土星'], ['Venus, Earth, Uranus, Pluto', '金星、地球、天王星、冥王星']], answer: 0,
        why: ['The four inner planets are small and rocky.', '离太阳最近的四颗行星体积小，由岩石构成。'] },
      { q: ['Counting out from the Sun, which planet comes fourth?', '离太阳由近到远，第四颗行星是'],
        options: [['Mars', '火星'], ['Earth', '地球'], ['Jupiter', '木星'], ['Venus', '金星']], answer: 0,
        why: ['Mercury, Venus, Earth, then Mars.', '依次是水星、金星、地球，然后是火星。'] },
      { q: ['Why is Pluto called a dwarf planet?', '冥王星为什么被归为矮行星？'],
        options: [['It has not cleared other bodies from around its orbit', '它没有清空轨道附近的其他天体'], ['It does not orbit the Sun', '它不绕太阳运行'], ['It is not round', '它不是球形的'], ['It has no moons', '它没有卫星']], answer: 0,
        why: ['Pluto is round and orbits the Sun, but it shares its region with many Kuiper belt objects.', '冥王星呈球形、绕太阳运行，但它所在区域还有许多柯伊伯带天体。'] },
      { q: ['Put these planets in order, from nearest to the Sun to farthest.', '把下列行星按离太阳由近到远排序。'],
        order: [['Venus', '金星'], ['Mars', '火星'], ['Jupiter', '木星'], ['Saturn', '土星'], ['Neptune', '海王星']],
        why: ['Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune: 0.72, 1.52, 5.2, 9.6 and 30 AU for these five.', '水星、金星、地球、火星、木星、土星、天王星、海王星；这五颗分别距太阳约 0.72、1.52、5.2、9.6 和 30 天文单位。'] },
      { q: ['Match each planet to its feature.', '把行星和它的特点连起来。'],
        match: [[['Venus', '金星'], ['The hottest planet, under thick clouds', '浓云笼罩，最热的行星']], [['Mars', '火星'], ['Red desert with the tallest volcano', '红色荒漠，有最高的火山']], [['Saturn', '土星'], ['Bright rings; less dense than water', '光环明亮，密度比水小']], [['Uranus', '天王星'], ['Spins tipped on its side', '“躺着”自转']]],
        why: ['Venus\'s CO₂ greenhouse makes it hotter than Mercury; Olympus Mons is on Mars; Saturn\'s density is 0.7 g/cm³; Uranus is tilted about 98°.', '金星浓厚的二氧化碳产生强烈温室效应，比水星还热；奥林匹斯火山在火星上；土星密度约 0.7 克/厘米³；天王星自转轴倾斜约 98°。'] },
      { q: ['Saturn is 9.6 AU from the Sun, and sunlight takes 8.3 minutes to travel 1 AU. How many minutes does sunlight take to reach Saturn?', '土星距太阳 9.6 天文单位，太阳光走 1 天文单位约需 8.3 分钟。太阳光到达土星约需多少分钟？'], num: { answer: 80, tol: 3, unit: ['min', '分钟'] },
        why: ['9.6 × 8.3 ≈ 80 minutes, about 1 h 20 min.', '9.6 × 8.3 ≈ 80 分钟，约 1 小时 20 分。'] },
      { q: ['Which planets can easily be seen with the naked eye? Pick all that apply.', '下列哪些行星用肉眼就容易看到？（多选）'], options: [['Venus', '金星'], ['Jupiter', '木星'], ['Saturn', '土星'], ['Neptune', '海王星']], multi: [0, 1, 2],
        why: ['Mercury, Venus, Mars, Jupiter and Saturn are naked-eye planets. Neptune is too faint: it was found with a telescope in 1846.', '水星、金星、火星、木星和土星肉眼可见。海王星太暗，1846 年才用望远镜发现。'] },
    ],
  },
  // ------------------------------------------------------------------------------------------------ scale
  {
    id: 'a-scale', strand: 'solar', level: 'jr', tracks: ['uk', 'us', 'ib'], unit, icon: 'ruler', minutes: 9,
    title: ['How big is the Solar System?', '太阳系有多大'],
    blurb: ['Astronomical units, a Sun the size of a football, and light that takes hours to cross the planets.', '天文单位、足球大小的太阳，以及要走几个小时才能穿过行星的光。'],
    keys: [
      ['1 astronomical unit (AU) is the average Earth–Sun distance, about 150 million km.', '1 天文单位是日地平均距离，约 1.5 亿千米。'],
      ['Neptune is about 30 AU from the Sun.', '海王星离太阳约 30 天文单位。'],
      ['Light from the Sun reaches Earth in about 8.3 minutes and Neptune in about 4.2 hours.', '太阳光约 8.3 分钟到达地球，约 4.2 小时到达海王星。'],
      ['Diagrams squash the distances and enlarge the planets; at true scale the planets are tiny dots far apart.', '示意图压缩了距离、放大了行星；按真实比例，行星只是相距遥远的小点。'],
      ['Radio signals to Mars take 3 to 22 minutes, so rovers must drive themselves; Voyager 1, about 170 AU away, is nearly a light-day from us.', '无线电信号到火星要 3—22 分钟，所以火星车必须自主行驶；约 170 天文单位外的旅行者 1 号离我们将近 1 光日。'],
    ],
    steps: [
      {
        title: ['Pictures that cheat', '“作弊”的示意图'],
        astro: { kit: 'orrery', clock: { from: 0, to: 10, rate: 0.2, unit: 'year' } },
        body: ['Almost every picture of the Solar System, including this one, is not to scale. The planets are drawn hundreds of times too big, and the distances are squeezed together. If both were true to scale, every planet would be smaller than a speck of dust on the screen.', '几乎所有太阳系的图，包括这一幅，都没有按比例画。行星被放大了几百倍，距离又被压缩了。如果大小和距离都按真实比例，每颗行星在屏幕上都比一粒灰尘还小。'],
      },
      {
        title: ['The astronomical unit', '天文单位'],
        astro: { kit: 'orrery', planets: ['mercury', 'venus', 'earth', 'mars'], au: true, clock: { from: 0, to: 2, rate: 0.06, unit: 'year' } },
        body: ['Kilometres get clumsy in space, so astronomers use the astronomical unit (AU): the average distance from Earth to the Sun, about 149.6 million km. Mars is about 1.5 AU from the Sun, Jupiter 5.2 AU and Neptune about 30 AU.', '在太空中用千米计量太麻烦，天文学家用天文单位：地球到太阳的平均距离，约 1.496 亿千米。火星距太阳约 1.5 天文单位，木星约 5.2 天文单位，海王星约 30 天文单位。'],
      },
      {
        title: ['If the Sun were a ball', '如果太阳是一个球'],
        astro: { kit: 'ladder', mode: 'model', clock: { from: 0, to: 1000, rate: 32, unit: 'x', fmt: ['{v} m from the Sun', '离太阳 {v} 米'], once: true } },
        body: ['Shrink the Sun to a 30 cm ball. Earth becomes a 2.7 mm peppercorn 32 m away, Jupiter a 3 cm marble at 168 m, and Neptune a 1 cm bead almost 1 km away. Nearly all of the Solar System is empty space.', '把太阳缩小成一个直径 30 厘米的球。地球就成了 32 米外一粒 2.7 毫米的胡椒，木星是 168 米外一颗 3 厘米的弹珠，海王星是将近 1 千米外一颗 1 厘米的珠子。太阳系几乎全是空荡荡的空间。'],
      },
      {
        title: ['Light takes time', '光也要走一阵子'],
        astro: { kit: 'ladder', mode: 'light', clock: { from: 0, to: 260, rate: 9, unit: 'x', fmt: ['{v} min', '{v} 分钟'], once: true } },
        body: ['Light travels 300,000 km every second, yet sunlight needs about 8.3 minutes to reach Earth. It passes Jupiter after 43 minutes and Neptune after about 4.2 hours. So we always see the Sun as it was a few minutes ago.', '光每秒传播 30 万千米，太阳光到达地球仍需约 8.3 分钟。它 43 分钟后经过木星，约 4.2 小时后才到达海王星。所以我们看到的太阳，总是几分钟以前的样子。'],
      },
      {
        title: ['Calling Mars', '给火星打电话'],
        astro: { kit: 'orrery', planets: ['mercury', 'venus', 'earth', 'mars'], au: true, clock: { from: 0, to: 2.2, rate: 0.08, unit: 'year' } },
        body: ['Radio waves travel at the speed of light too. Earth and Mars are 0.4 AU apart when they are on the same side of the Sun, but about 2.6 AU apart on opposite sides; watch the gap change as they orbit. So a message to Mars takes between about 3 and 22 minutes, and an answer as long again. Nobody can steer a Mars rover with a joystick: China\'s Tianwen-1 lander set down the Zhurong rover in 2021 entirely on its own.', '无线电波也以光速传播。地球和火星在太阳同一侧时最近约 0.4 天文单位，分处太阳两侧时远达约 2.6 天文单位，看看它们公转时距离怎样变化。所以发往火星的信号要走约 3—22 分钟，回复也要同样久。没有人能用操纵杆实时驾驶火星车：2021 年我国天问一号的着陆器完全自主地把祝融号火星车送上了火星表面。'],
      },
      {
        title: ['The edge of the Solar System', '太阳系的边缘'],
        astro: { kit: 'orrery', scale: 'log', kuiper: true, dwarfs: true, labels: false, clock: { from: 0, to: 40, rate: 1, unit: 'year' } },
        body: ['Beyond Neptune lies the icy Kuiper belt, out to about 50 AU. The solar wind blows a bubble, the heliosphere, that ends at the heliopause about 120 AU away: Voyager 1, launched in 1977, crossed it in 2012 and became the first spacecraft in interstellar space. Today it is about 170 AU away, and its radio signals take almost a day to reach us. Yet the Sun\'s gravity still holds the Oort Cloud of comets, thought to stretch thousands to about 100,000 AU out.', '海王星以外是冰质天体组成的柯伊伯带，延伸到约 50 天文单位。太阳风吹出一个巨大的“气泡”——日球层，它的边界日球层顶在约 120 天文单位处：1977 年发射的旅行者 1 号在 2012 年越过这里，成为第一个进入星际空间的探测器。现在它距我们约 170 天文单位，无线电信号要走将近一整天。但太阳引力的范围更远，一般认为奥尔特云的彗星分布在几千到约 10 万天文单位处。'],
      },
      {
        title: ['To the next star', '到最近的恒星'],
        astro: { kit: 'ladder', clock: { from: 2, to: 3, rate: 0.1, unit: 'x', fmt: ['Zooming out', '视野放大'], once: true } },
        body: ['Beyond the planets, distances are measured in light-years: the distance light travels in a year, about 9.46 trillion km. The nearest star, Proxima Centauri, is 4.2 light-years away. On our 30 cm Sun model it would be about 8,600 km away, farther than from Beijing to London.', '行星以外的距离用光年来量：光在一年里走过的距离，约 9.46 万亿千米。离太阳最近的恒星比邻星距离我们 4.2 光年。在 30 厘米太阳的模型里，它在约 8600 千米以外，比北京到伦敦还远。'],
      },
    ],
    quiz: [
      { q: ['One astronomical unit (1 AU) is…', '1 天文单位是'],
        options: [['the average distance from Earth to the Sun', '地球到太阳的平均距离'], ['the distance light travels in a year', '光一年走过的距离'], ['the distance from Earth to the Moon', '地球到月球的距离'], ['the width of the Solar System', '太阳系的宽度']], answer: 0,
        why: ['1 AU ≈ 149.6 million km, the average Earth–Sun distance. A light-year is far larger.', '1 天文单位约 1.496 亿千米，是日地平均距离。光年要大得多。'] },
      { q: ['About how long does sunlight take to reach Earth?', '太阳光到达地球大约需要多长时间？'],
        options: [['8 minutes', '8 分钟'], ['8 seconds', '8 秒'], ['8 hours', '8 小时'], ['It arrives instantly', '瞬间到达']], answer: 0,
        why: ['About 8.3 minutes: 150 million km ÷ 300,000 km/s ≈ 500 s.', '约 8.3 分钟：1.5 亿千米 ÷ 30 万千米/秒 ≈ 500 秒。'] },
      { q: ['If the Sun were a 30 cm ball, Earth would be…', '如果太阳是直径 30 厘米的球，地球就是'],
        options: [['a 2.7 mm grain about 32 m away', '约 32 米外一粒 2.7 毫米的小球'], ['a 3 cm ball 1 m away', '1 米外一个 3 厘米的球'], ['a 10 cm ball 5 m away', '5 米外一个 10 厘米的球'], ['a 2.7 mm grain 1 km away', '1 千米外一粒 2.7 毫米的小球']], answer: 0,
        why: ['The Sun is 109 times wider than Earth and about 107 of its own diameters away.', '太阳直径是地球的 109 倍，日地距离约为太阳直径的 107 倍。'] },
      { q: ['Why are Solar System diagrams not drawn to scale?', '太阳系示意图为什么不按比例画？'],
        options: [['At true scale the planets would be invisible dots', '按真实比例，行星会小得看不见'], ['Nobody knows the real distances', '没有人知道真实的距离'], ['The planets are all the same size', '行星都一样大'], ['The planets are very close together', '行星彼此离得很近']], answer: 0,
        why: ['The distances are so huge compared with the planets that a true-scale picture shows almost nothing.', '和行星的大小相比，距离实在太大，按真实比例画几乎什么也看不见。'] },
      { q: ['Jupiter is 5.2 AU from the Sun. 1 AU ≈ 150 million km. How many million km is that?', '木星距太阳 5.2 天文单位，1 天文单位约 1.5 亿千米。木星距太阳约多少百万千米？'], num: { answer: 780, tol: 10, unit: ['million km', '百万千米'] },
        why: ['5.2 × 150 = 780 million km (the fact sheet gives 778.5).', '5.2 × 150 = 780 百万千米，即约 7.8 亿千米（实测平均 7.785 亿千米）。'] },
      { q: ['Mars is 225 million km from Earth. Radio waves travel 300,000 km/s. How many minutes does a message take to reach Mars?', '火星距地球 2.25 亿千米，无线电波每秒传播 30 万千米。信号到达火星约需多少分钟？'], num: { answer: 12.5, tol: 0.5, unit: ['min', '分钟'] },
        why: ['225,000,000 ÷ 300,000 = 750 s = 12.5 minutes, and a reply takes as long again.', '225 000 000 ÷ 300 000 = 750 秒 = 12.5 分钟，回复也要同样长。'] },
      { q: ['Put these in order, from nearest to Earth to farthest.', '把下列天体按离地球由近到远排序。'],
        order: [['The Moon', '月球'], ['The Sun', '太阳'], ['Neptune', '海王星'], ['Voyager 1', '旅行者 1 号'], ['Proxima Centauri', '比邻星']],
        why: ['1.3 light-seconds, 8.3 light-minutes, about 4 light-hours, almost a light-day, 4.2 light-years.', '分别约为 1.3 光秒、8.3 光分、4 光时、将近 1 光日、4.2 光年。'] },
      { q: ['Match each unit to what it is best for measuring.', '把长度单位和最适合测量的距离连起来。'],
        match: [[['Kilometre', '千米'], ['Earth to the Moon', '地球到月球']], [['Astronomical unit', '天文单位'], ['The Sun to the planets', '太阳到各行星']], [['Light-year', '光年'], ['The Sun to other stars', '太阳到其他恒星']]],
        why: ['384,400 km is easy to say; planets are 0.4–30 AU out; even the nearest star is 268,000 AU, so light-years work better.', '38.44 万千米用千米就好；行星距太阳 0.4—30 天文单位；最近的恒星也有 26.8 万天文单位，用光年更方便。'] },
    ],
  },
  // ------------------------------------------------------------------------------------------------ small bodies
  {
    id: 'a-small-bodies', strand: 'solar', level: 'jr', tracks: ['uk', 'us', 'ib'], unit, icon: 'sparkle', minutes: 10,
    title: ['Asteroids, comets and meteors', '小行星、彗星和流星'],
    blurb: ['Rocky asteroids, icy comets with tails that point away from the Sun, and the dust that makes shooting stars.', '岩质的小行星、尾巴背向太阳的冰质彗星，以及化作流星的尘埃。'],
    keys: [
      ['Most asteroids orbit in the asteroid belt between Mars and Jupiter.', '大多数小行星在火星和木星轨道之间的小行星带运行。'],
      ['Comets are balls of ice and dust; near the Sun they grow a coma and tails that point away from the Sun.', '彗星由冰和尘埃组成；接近太阳时形成彗发和彗尾，彗尾总是背向太阳。'],
      ['A meteor is a streak of light from a grain burning up in the atmosphere; a meteorite is a rock that reaches the ground.', '流星是微粒在大气中燃烧发出的光迹；落到地面的叫陨石。'],
      ['Meteor showers happen when Earth crosses the dust a comet left along its orbit.', '地球穿过彗星沿轨道留下的尘埃带时，就会出现流星雨。'],
      ['Big impacts are rare but serious; astronomers track near-Earth asteroids, and NASA\'s DART (2022) showed an asteroid can be nudged.', '大型撞击很少见但后果严重；天文学家持续监测近地小行星，2022 年美国的 DART 任务证明可以撞偏小行星。'],
    ],
    steps: [
      {
        title: ['The asteroid belt', '小行星带'],
        astro: { kit: 'orrery', planets: ['mercury', 'venus', 'earth', 'mars', 'jupiter'], belt: true, clock: { from: 0, to: 12, rate: 0.25, unit: 'year' } },
        body: ['Between Mars and Jupiter, millions of rocky asteroids orbit the Sun. The largest, Ceres, is about 940 km across and counts as a dwarf planet; most are far smaller. They are so spread out that spacecraft fly through the belt safely, and all of them together weigh only about 3% as much as the Moon.', '在火星和木星的轨道之间，数以百万计的岩质小行星绕太阳运行。最大的谷神星直径约 940 千米，属于矮行星，其余大多小得多。它们分布得非常稀疏，探测器可以安全穿过；全部加起来，质量也只有月球的 3% 左右。'],
      },
      {
        title: ['Comets and their tails', '彗星和彗尾'],
        astro: { kit: 'orrery', planets: ['mercury', 'venus', 'earth', 'mars', 'jupiter'], comet: 'encke', clock: { from: Date.UTC(2026, 5, 1), to: Date.UTC(2027, 7, 1), rate: 16, unit: 'date' } },
        body: ['A comet is a “dirty snowball” of ice and dust a few kilometres across. Near the Sun its ice turns to gas, making a glowing coma and two tails: a straight bluish gas tail and a curved yellowish dust tail. Sunlight and the solar wind push them, so the tails always point away from the Sun.', '彗星是直径几千米的“脏雪球”，由冰和尘埃组成。接近太阳时，冰升华成气体，形成发光的彗发和两条彗尾：一条笔直、偏蓝的气体彗尾，一条弯曲、偏黄的尘埃彗尾。太阳光和太阳风推动它们，所以彗尾总是背向太阳。'],
      },
      {
        title: ['Long journeys', '漫长的旅程'],
        astro: { kit: 'orrery', comet: 'halley', kuiper: true, t0: Date.UTC(1980, 0, 1), clock: { from: 0, to: 82, rate: 3, unit: 'year' } },
        body: ['Comets move on long, stretched ellipses. Halley’s Comet returns every 76 years: it last passed the Sun in 1986 and will be back in 2061. Short-period comets come from the Kuiper belt beyond Neptune; long-period ones fall in from the far-off Oort Cloud.', '彗星沿着又长又扁的椭圆轨道运行。哈雷彗星约每 76 年回归一次：上一次经过近日点是 1986 年，下一次是 2061 年。短周期彗星来自海王星以外的柯伊伯带，长周期彗星来自遥远的奥尔特云。'],
      },
      {
        title: ['Meteors and meteorites', '流星和陨石'],
        astro: { kit: 'model', kind: 'meteors', shower: 'perseids', event: 'meteor-shower', clock: { from: -8, to: 8, rate: 1, unit: 'day' } },
        body: ['A meteor, or shooting star, is a grain of space dust hitting the air at tens of kilometres per second and burning up as a streak of light, 70–120 km up. A rock big enough to survive the fall and land on the ground is a meteorite. Most meteorites are pieces of asteroids. On 8 March 1976 a meteorite shower fell on Jilin: its largest stone, Jilin No. 1, weighs about 1,770 kg, the biggest stony meteorite ever found.', '流星是太空中的微粒以每秒几十千米的速度冲进大气层，在 70—120 千米高空燃烧发光留下的光迹。体积较大、没有烧完而落到地面的叫陨石。大多数陨石是小行星的碎块。1976 年 3 月 8 日，吉林降落了一场陨石雨，其中最大的“吉林 1 号”陨石重约 1770 千克，是世界上最大的石陨石。'],
      },
      {
        title: ['Meteor showers', '流星雨'],
        astro: { kit: 'orrery', planets: ['mercury', 'venus', 'earth', 'mars', 'jupiter'], comet: 'encke', stream: true, clock: { from: 0, to: 6, rate: 0.15, unit: 'year' } },
        body: ['A comet leaves a trail of dust along its orbit. Each year, on the same dates, Earth ploughs through such a trail and we see a meteor shower: the Perseids every August come from Comet Swift–Tuttle, and the Taurids in autumn from Comet Encke, shown here.', '彗星沿轨道留下一条尘埃带。每年同一时间，地球穿过这样的尘埃带，我们就会看到流星雨：每年 8 月的英仙座流星雨来自斯威夫特—塔特尔彗星，秋季的金牛座流星雨来自图中的恩克彗星。'],
      },
      {
        title: ['Watching a meteor shower', '观看流星雨'],
        astro: { kit: 'sky', view: 'dome', lat: 40, lon: 116.4, tz: 8, look: [45, 45], fov: 90, cons: ['per', 'cas'], names: true, meteors: { ra: 48, dec: 58, name: ['Perseid radiant', '英仙座流星雨辐射点'] }, t: Date.UTC(2025, 7, 12, 16), clock: { from: 0, to: 4, rate: 0.25, unit: 'hour', dp: 1, fmt: ['13 Aug, {v} h after midnight', '8 月 13 日 午夜后 {v} 小时'] } },
        body: ['The meteors of a shower are parallel paths seen in perspective, so they all seem to shoot out from one point, the radiant, which names the shower. The Perseids peak around 12–13 August, the Geminids around 13–14 December and the Quadrantids around 3–4 January; each can bring dozens of meteors an hour. Find a dark place away from city lights, lie back after midnight when the radiant is high, and give your eyes 20 minutes to adapt. No telescope is needed.', '同一场流星雨的流星沿平行的路径进入大气，由于透视效果，看起来都像是从天空中的同一点射出，这个点叫辐射点，流星雨就以它所在的星座命名。英仙座流星雨约在 8 月 12—13 日达到极大，双子座流星雨约在 12 月 13—14 日，象限仪座流星雨约在 1 月 3—4 日，每小时可多达几十颗。观看时要远离城市灯光，最好在后半夜辐射点升高以后，躺下来仰望天空，让眼睛适应黑暗 20 分钟左右。不需要望远镜。'],
      },
      {
        title: ['Impacts and planetary defence', '小行星撞击和行星防御'],
        astro: { kit: 'orrery', planets: ['mercury', 'venus', 'earth', 'mars', 'jupiter'], belt: true, clock: { from: 0, to: 6, rate: 0.2, unit: 'year' } },
        body: ['Some asteroids cross the Earth\'s orbit. About 66 million years ago a 10 km asteroid struck Chicxulub in Mexico and helped wipe out the dinosaurs. Smaller hits are more frequent: in 1908 an explosion over Tunguska, Siberia flattened 2,000 km² of forest, and in 2013 a 20 m rock burst over Chelyabinsk, Russia, injuring about 1,500 people with broken glass. Astronomers now track near-Earth asteroids; in 2022 NASA\'s DART spacecraft hit the small moonlet Dimorphos and shortened its orbit by 32 minutes, and China plans its own deflection test. China\'s Tianwen-2, launched in 2025, will bring back a sample of a near-Earth asteroid.', '有些小行星的轨道与地球轨道相交。约 6600 万年前，一颗直径约 10 千米的小行星撞击墨西哥希克苏鲁伯，导致包括恐龙在内的大量生物灭绝。小规模的撞击更常见：1908 年西伯利亚通古斯上空的爆炸夷平了约 2000 平方千米的森林；2013 年一块直径约 20 米的岩石在俄罗斯车里雅宾斯克上空爆炸，飞溅的玻璃使约 1500 人受伤。如今天文学家持续监测近地小行星；2022 年美国的 DART 探测器撞击小卫星迪莫弗斯，使其公转周期缩短了 32 分钟，我国也计划开展近地小行星撞击防御试验。2025 年发射的我国天问二号，将从一颗近地小行星采样返回。'],
      },
    ],
    quiz: [
      { q: ['In which direction does a comet’s tail point?', '彗尾指向哪个方向？'], astro: { kit: 'orrery', planets: ['mercury', 'venus', 'earth', 'mars', 'jupiter'], comet: 'encke', t0: Date.UTC(2027, 0, 20), labels: false },
        options: [['Away from the Sun', '背向太阳'], ['Behind the comet, along its path', '沿运动方向的后方'], ['Toward the Sun', '指向太阳'], ['Toward Earth', '指向地球']], answer: 0,
        why: ['Sunlight and the solar wind push the gas and dust outward, so the tail points away from the Sun even when the comet is moving away.', '太阳光和太阳风把气体和尘埃向外推，所以即使彗星正远离太阳，彗尾仍背向太阳。'] },
      { q: ['Where is the asteroid belt?', '小行星带位于'],
        options: [['Between Mars and Jupiter', '火星和木星轨道之间'], ['Between Earth and Mars', '地球和火星轨道之间'], ['Beyond Neptune', '海王星轨道以外'], ['Between Venus and Earth', '金星和地球轨道之间']], answer: 0,
        why: ['The main belt lies about 2.1–3.3 AU from the Sun, between Mars and Jupiter. Beyond Neptune is the Kuiper belt.', '主小行星带距太阳约 2.1—3.3 天文单位，在火星和木星之间。海王星以外是柯伊伯带。'] },
      { q: ['What is a meteor?', '流星是什么？'],
        options: [['A streak of light from a grain burning up in the air', '微粒在大气中燃烧发出的光迹'], ['A star falling to Earth', '掉向地球的恒星'], ['A comet passing Earth', '经过地球的彗星'], ['A rock lying on the ground', '躺在地面上的石头']], answer: 0,
        why: ['Meteors are tiny grains burning up high in the atmosphere. A rock that reaches the ground is a meteorite.', '流星是在高空大气中燃烧的微粒。落到地面的岩石叫陨石。'] },
      { q: ['Why does the same meteor shower return every year?', '为什么同一个流星雨每年都会出现？'],
        options: [['Earth crosses the same comet dust trail on the same date', '地球每年在同一时间穿过同一条彗星尘埃带'], ['The Moon throws off dust each year', '月球每年抛出尘埃'], ['The Sun ejects meteors every year', '太阳每年喷出流星'], ['A planet passes Earth each year', '每年有行星经过地球']], answer: 0,
        why: ['The dust stays spread along the comet’s orbit, and Earth reaches that crossing point at the same time each year.', '尘埃沿彗星轨道散布，地球每年在同一时间到达那个交叉点。'] },
      { q: ['Halley’s Comet passed the Sun in 1910 and in 1986. If its period stays about the same, in about which year will it return?', '哈雷彗星分别在 1910 年和 1986 年经过近日点。如果周期大致不变，它下一次回归约在哪一年？'], num: { answer: 2062, tol: 1 },
        why: ['1986 − 1910 = 76 years, so about 1986 + 76 = 2062. The planets\' pulls change it slightly: it is due in mid-2061.', '1986 − 1910 = 76 年，所以约在 1986 + 76 = 2062 年。行星引力会使周期略有变化，实际预计在 2061 年回归。'] },
      { q: ['Match each word to its meaning.', '把下列名词和含义连起来。'],
        match: [[['Asteroid', '小行星'], ['A rocky body, mostly between Mars and Jupiter', '岩质天体，多在火星和木星之间']], [['Comet', '彗星'], ['Ice and dust; grows tails near the Sun', '由冰和尘埃组成，近日时出现彗尾']], [['Meteor', '流星'], ['A streak of light in the air', '大气中燃烧的光迹']], [['Meteorite', '陨石'], ['A space rock found on the ground', '落到地面的太空岩石']]],
        why: ['Asteroids and comets orbit the Sun; meteors are what we see as grains burn up; meteorites are the survivors on the ground.', '小行星和彗星绕太阳运行；流星是微粒燃烧时的光迹；陨石是落到地面的残留物。'] },
      { q: ['Put these from smallest to largest.', '把下列天体按从小到大排序。'],
        order: [['A dust grain making a meteor', '形成流星的尘粒'], ['The Chelyabinsk rock (≈ 20 m)', '车里雅宾斯克陨石（约 20 米）'], ['Halley’s nucleus (≈ 15 km)', '哈雷彗核（约 15 千米）'], ['Ceres (≈ 940 km)', '谷神星（约 940 千米）']],
        why: ['Most meteors come from grains smaller than a grain of sand; Ceres is the largest body in the asteroid belt.', '大多数流星来自比沙粒还小的尘粒；谷神星是小行星带中最大的天体。'] },
      { q: ['Which statements about meteor showers are true? Pick all that apply.', '关于流星雨，下列哪些说法正确？（多选）'], options: [['They seem to come from one point, the radiant', '流星看起来都从辐射点射出'], ['They return on about the same dates every year', '每年大约在同一日期出现'], ['You need a telescope to see them', '必须用望远镜观看'], ['They are best seen from a bright city centre', '在明亮的市中心看得最清楚']], multi: [0, 1],
        why: ['Showers have a radiant and recur each year. Use your eyes, not a telescope, and find a dark sky.', '流星雨有辐射点，每年定期出现。观看用肉眼即可，并且要找黑暗的地方。'] },
    ],
  },
  ...A_SOLAR_FREE,
];
