/** Free starter lesson for Senior Secondary Astronomy (`cns`: Celestial Systems and Life on Earth). */
import { svg, tx, type Lx } from '../figs.ts';
import { type Lesson, type Pair } from '../kit.ts';

const unit: Pair = ['The Solar System', '太阳系'];
const DAY = 864e5;
const T25 = Date.UTC(2025, 0, 1);

/** Nested boxes: the levels of celestial systems. */
function hierarchy(L: Lx): string {
  const box = (x: number, y: number, w: number, h: number, c: string, d: number) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${c}" fill-opacity=".07" stroke="${c}" stroke-opacity=".75" class="f-fade" style="--d:${d}s"/>`;
  const lab = (x: number, y: number, p: Pair, c: string, d: number) => `<g class="f-fade" style="--d:${d}s">${tx(x, y, L(p), 'fg-label', 's', ` style="fill:${c}"`)}</g>`;
  const sub = (x: number, y: number, p: Pair, d: number, a: 's' | 'm' | 'e' = 's') => `<g class="f-fade" style="--d:${d}s">${tx(x, y, L(p), 'fg-sub', a)}</g>`;
  let o = tx(160, 10, L(['Levels of celestial systems', '天体系统的层次']), 'fg-title', 'm');
  o += box(2, 16, 316, 158, '#ff922b', 0.9) + lab(9, 27, ['Observable universe', '可观测宇宙'], '#ff922b', 0.9);
  o += sub(312, 27, ['≈ 93 billion ly across', '直径约 930 亿光年'], 1, 'e');
  o += box(9, 33, 212, 136, '#b197fc', 0.6) + lab(16, 44, ['Milky Way', '银河系'], '#b197fc', 0.6);
  o += sub(16, 163, ['≈ 100 000 ly across', '直径约 10 万光年'], 0.7);
  o += box(16, 50, 144, 104, '#ffd24a', 0.3) + lab(23, 61, ['Solar System', '太阳系'], '#ffd24a', 0.3);
  o += box(23, 68, 74, 78, '#4dabf7', 0) + lab(30, 79, ['Earth–Moon', '地月系'], '#4dabf7', 0);
  o += `<circle cx="50" cy="110" r="11" fill="#4d8fd6"/><path d="M50 99 a11 11 0 0 1 0 22" fill="#1d3557" opacity=".55"/>`;
  o += `<circle cx="80" cy="100" r="4" fill="#ced4da"/><ellipse cx="50" cy="110" rx="30" ry="12" fill="none" stroke="#a5d8ff" stroke-opacity=".35" stroke-dasharray="2 2"/>`;
  o += sub(30, 139, ['384 400 km', '38.44 万千米'], 0.1);
  o += `<g class="f-fade" style="--d:.4s"><circle cx="136" cy="80" r="9" fill="#ffd24a"/>` +
    ['#c9c0b6:112:104:2', '#e0835a:124:118:2.4', '#e0bf96:146:106:5', '#ecd9a4:140:132:4.2'].map(s => { const [c, x, y, r] = s.split(':'); return `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`; }).join('') + `</g>`;
  o += sub(104, 148, ['Sun, planets…', '太阳、行星…'], 0.4);
  o += `<g class="f-fade" style="--d:.7s">` + [[172, 70], [190, 92], [178, 120], [202, 130], [196, 64], [168, 146], [205, 108]].map(([x, y], i) =>
    `<circle cx="${x}" cy="${y}" r="${i % 3 ? 1.6 : 2.4}" fill="${i % 2 ? '#fff3bf' : '#d0ebff'}"/>`).join('') + `</g>`;
  o += sub(166, 158, ['other stars', '其他恒星'], 0.8);
  o += box(228, 33, 84, 136, '#3bc9db', 1.1) + lab(234, 44, ['Other galaxies', '河外星系'], '#3bc9db', 1.1);
  o += `<g class="f-fade" style="--d:1.2s" fill="#c5f6fa" fill-opacity=".55">` + [[256, 72, 14, 5, -20], [288, 100, 10, 4, 30], [252, 124, 12, 7, 10], [292, 146, 8, 3, -35]].map(([x, y, a, b, r]) =>
    `<ellipse cx="${x}" cy="${y}" rx="${a}" ry="${b}" transform="rotate(${r} ${x} ${y})"/>`).join('') + `</g>`;
  o += sub(234, 163, ['e.g. Andromeda', '如仙女星系'], 1.2);
  return svg(320, 176, o, L(['Nested celestial systems', '天体系统的层次']));
}

export const A_SOLAR_FREE: Lesson[] = [
  {
    id: 'a-systems', strand: 'solar', level: 'sr', tracks: ['uk', 'us', 'ib'], unit, icon: 'globe', minutes: 12,
    title: ['Celestial systems and life on Earth', '天体系统和地球上的生命'],
    blurb: ['From the Earth–Moon system to the observable universe, and why Earth is a planet with life.', '从地月系到可观测宇宙，以及地球为什么是一颗有生命的行星。'],
    keys: [
      ['Celestial bodies are the material objects in space: stars, nebulae, planets, moons, comets, meteoroids and artificial ones such as satellites; a meteorite on the ground is no longer one.', '天体是宇宙间物质的存在形式，如恒星、星云、行星、卫星、彗星、流星体，以及人造卫星等人造天体；落到地面的陨石不再是天体。'],
      ['Bodies that attract and orbit each other form celestial systems: Earth–Moon system → Solar System → Milky Way → observable universe.', '相互吸引、相互绕转的天体构成天体系统：地月系→太阳系→银河系→可观测宇宙。'],
      ['The Milky Way is about 100,000 light-years across; galaxies beyond it are other galaxies, such as Andromeda.', '银河系直径约 10 万光年；银河系以外的星系叫河外星系，如仙女星系。'],
      ['Outside conditions for life: a stable Sun and a safe environment, with planets orbiting in the same direction, in nearly the same plane, on nearly circular orbits.', '生命存在的外部条件：稳定的太阳光照和安全的宇宙环境——行星绕日公转具有同向性、共面性和近圆性。'],
      ['Earth’s own conditions: a suitable distance from the Sun (the habitable zone), a mass that holds an atmosphere, and liquid water.', '地球自身条件：日地距离适中（位于宜居带）、质量适中能吸引大气、有液态水。'],
    ],
    steps: [
      {
        title: ['What is a celestial body?', '什么是天体'],
        astro: { kit: 'satellites', mode: 'overview', clock: { from: 0, to: 24, rate: 1, unit: 'hour' } },
        body: ['Celestial bodies are the material objects of the universe out in space: stars and nebulae, planets and their moons, comets, asteroids and meteoroids, even interstellar gas and dust. Spacecraft orbiting the Earth or the Sun, like the satellites and the Tiangong station here, are artificial celestial bodies. Two tests help: is it in space, and is it an object in its own right? So the Moon is a celestial body, but a meteorite lying in a museum, or a rocket standing on the launch pad, is not.', '天体是宇宙间物质的存在形式，包括恒星、星云、行星、卫星、彗星、小行星、流星体以及星际气体和尘埃。绕地球或太阳运行的航天器，比如图中的人造卫星和天宫空间站，是人造天体。判断时可以看两点：它是否位于宇宙空间中、是否是独立的物质实体。所以月球是天体，而陈列在博物馆里的陨石、立在发射台上的火箭都不是天体。'],
      },
      {
        title: ['Systems inside systems', '层层嵌套的天体系统'],
        astro: { kit: 'ladder', clock: { from: 0, to: 2, rate: 0.14, unit: 'x', fmt: ['Zooming out', '视野放大'], once: true } },
        fig: { k: 'svg', draw: L => hierarchy(L) },
        body: ['Celestial bodies attract each other and orbit each other, forming celestial systems. The Moon and Earth orbit together as the Earth–Moon system, 384,400 km apart. The Sun’s gravity holds the planets, including the Earth–Moon system, in the Solar System.', '天体之间相互吸引、相互绕转，形成天体系统。月球和地球组成地月系，平均相距 38.44 万千米。太阳的引力把包括地月系在内的行星系统维系在一起，组成太阳系。'],
      },
      {
        title: ['Our galaxy', '我们的银河系'],
        astro: { kit: 'ladder', clock: { from: 2, to: 4, rate: 0.12, unit: 'x', fmt: ['Zooming out', '视野放大'], once: true } },
        body: ['The Sun is one of 100–400 billion stars in the Milky Way, a barred spiral galaxy about 100,000 light-years across. The nearest stars are a few light-years away. The Sun sits about 26,000 light-years from the centre and takes about 230 million years to go round it.', '太阳只是银河系 1000 亿—4000 亿颗恒星中的一颗。银河系是直径约 10 万光年的棒旋星系，离太阳最近的恒星也有几光年远。太阳距银河系中心约 2.6 万光年，绕中心转一圈约需 2.3 亿年。'],
      },
      {
        title: ['Other galaxies and the universe', '河外星系和可观测宇宙'],
        astro: { kit: 'ladder', clock: { from: 4, to: 6, rate: 0.12, unit: 'x', fmt: ['Zooming out', '视野放大'], once: true } },
        body: ['Galaxies outside the Milky Way are other galaxies. The Andromeda Galaxy, 2.5 million light-years away, is the largest member of our Local Group. The part of the universe we can observe holds hundreds of billions, perhaps even trillions, of galaxies and is about 93 billion light-years across.', '银河系以外的星系叫河外星系。距离 250 万光年的仙女星系是本星系群中最大的成员。人类能观测到的宇宙部分，叫可观测宇宙，包含数千亿乃至上万亿个星系，直径约 930 亿光年。'],
      },
      {
        title: ['A stable Sun, a safe neighbourhood', '稳定的太阳，安全的环境'],
        astro: { kit: 'orrery', dir: true, labels: false, scale: 'log', clock: { from: 0, to: 30, rate: 0.6, unit: 'year' } },
        fig: { k: 'bars', title: ['Tilt of each orbit to the Earth’s orbit', '各行星轨道与地球轨道面的夹角'], unit: ['degrees: all within 7°', '单位：度，都在 7° 以内'],
          rows: [{ name: ['Mercury', '水星'], v: 7.0, c: '#c9c0b6' }, { name: ['Venus', '金星'], v: 3.4, c: '#e8cf9a' }, { name: ['Mars', '火星'], v: 1.8, c: '#e07a52' }, { name: ['Jupiter', '木星'], v: 1.3, c: '#d9b38c' }, { name: ['Saturn', '土星'], v: 2.5, c: '#ecd9a4' }, { name: ['Uranus', '天王星'], v: 0.8, c: '#9ad7e0' }, { name: ['Neptune', '海王星'], v: 1.8, c: '#5c7cfa' }] },
        body: ['For about 4.6 billion years the Sun has shone steadily, giving Earth stable light and heat. The planets all orbit anticlockwise seen from the north (same direction), their orbits are tilted by at most 7° (nearly the same plane), and their eccentricities are small, from 0.007 for Venus to 0.21 for Mercury (nearly circular). So each keeps to its own lane and they do not collide: this safe environment let life evolve.', '约 46 亿年来，太阳一直比较稳定，为地球提供稳定的光照和热量。从北天看，各行星都沿逆时针方向绕日公转（同向性）；轨道面与地球轨道面的夹角最大只有 7°（共面性）；轨道偏心率很小，从金星的 0.007 到水星的 0.21（近圆性）。大小行星各行其道、互不干扰，使地球处于比较安全的宇宙环境中，生命得以演化。'],
      },
      {
        title: ['Just the right distance', '日地距离适中'],
        astro: { kit: 'orrery', planets: ['mercury', 'venus', 'earth', 'mars'], hz: true, clock: { from: 0, to: 4, rate: 0.12, unit: 'year' } },
        body: ['Earth orbits inside the habitable zone, the range of distances where a planet can keep liquid water on its surface. Its average surface temperature is about 15 °C. Venus, closer in, is far too hot; Mars, farther out, is too cold. Earth’s moderate day length also keeps the day–night temperature swing small.', '地球位于宜居带内，即行星表面能保持液态水的距离范围。地球表面平均温度约 15 °C。离太阳更近的金星太热，更远的火星太冷。地球自转周期适中，昼夜温差也不大。'],
      },
      {
        title: ['Just the right size', '体积和质量适中'],
        astro: { kit: 'orrery', mode: 'lineup', planets: ['mercury', 'venus', 'earth', 'mars'] },
        body: ['Earth’s mass gives enough gravity to hold a thick atmosphere, which over billions of years became rich in nitrogen and oxygen and shields us from harmful radiation. Small Mars has lost most of its air, and tiny Mercury has almost none. Water released from inside the young Earth gathered into the oceans.', '地球的体积和质量适中，引力足以吸引住厚厚的大气层，经过漫长演化形成以氮和氧为主、适合生物呼吸的大气，并能阻挡有害辐射。较小的火星失去了大部分大气，更小的水星几乎没有大气。早期地球内部释放出的水汽凝结降落，形成了原始海洋。'],
      },
    ],
    quiz: [
      { q: ['Which list goes from the smallest system to the largest?', '下列天体系统按从小到大排列正确的是'],
        options: [['Earth–Moon system → Solar System → Milky Way → observable universe', '地月系→太阳系→银河系→可观测宇宙'], ['Solar System → Earth–Moon system → Milky Way → observable universe', '太阳系→地月系→银河系→可观测宇宙'], ['Earth–Moon system → Milky Way → Solar System → observable universe', '地月系→银河系→太阳系→可观测宇宙'], ['Milky Way → Solar System → Earth–Moon system → observable universe', '银河系→太阳系→地月系→可观测宇宙']], answer: 0,
        fig: { k: 'svg', draw: L => hierarchy(L) },
        why: ['The Earth–Moon system is part of the Solar System, which is part of the Milky Way, one of countless galaxies in the observable universe.', '地月系属于太阳系，太阳系属于银河系，银河系是可观测宇宙中无数星系之一。'] },
      { q: ['Tap the planet that orbits inside the habitable zone.', '点出位于宜居带内的行星。'], pick: 'earth',
        astro: { kit: 'orrery', planets: ['mercury', 'venus', 'earth', 'mars'], hz: true, labels: false, t0: T25 + 40 * DAY },
        why: ['Earth, at 1 AU, is in the habitable zone where liquid water can last on the surface.', '地球距太阳 1 天文单位，位于表面能保持液态水的宜居带内。'] },
      { q: ['Why can Earth hold a thick atmosphere?', '地球为什么能保持厚厚的大气层？'],
        options: [['Its mass and gravity are large enough', '它的体积和质量适中，引力足够大'], ['It is the closest planet to the Sun', '它离太阳最近'], ['It has a moon', '它有卫星'], ['It spins very fast', '它自转得很快']], answer: 0,
        why: ['Enough mass means enough gravity to stop the gases escaping into space; small Mars lost most of its air.', '质量适中，引力足以让气体不逃逸到太空；较小的火星失去了大部分大气。'] },
      { q: ['Which is NOT one of the reasons Earth has a safe environment in space?', '下列哪一项不是地球处于安全宇宙环境的原因？'],
        options: [['Earth is the largest planet', '地球是最大的行星'], ['The planets orbit in the same direction', '各行星公转方向相同'], ['The orbits lie in nearly the same plane', '各行星轨道几乎在同一平面'], ['The orbits are nearly circular', '各行星轨道接近圆形']], answer: 0,
        why: ['Jupiter is the largest planet. The safe environment comes from orbits that share a direction and plane and are nearly circular.', '最大的行星是木星。安全的宇宙环境来自行星公转的同向性、共面性和近圆性。'] },
      { q: ['Which of these are celestial bodies? Pick all that apply.', '下列属于天体的是（多选）'], options: [['A comet near the Sun', '接近太阳的彗星'], ['The Tiangong space station in orbit', '在轨运行的天宫空间站'], ['A meteorite in a museum', '博物馆里的陨石'], ['The Moon', '月球']], multi: [0, 1, 3],
        why: ['Comets, the Moon and spacecraft in orbit are in space and are objects in their own right; a meteorite on Earth is part of the Earth now.', '彗星、月球和在轨航天器都位于宇宙空间且是独立的实体；落到地面的陨石已成为地球的一部分，不是天体。'] },
      { q: ['Match each body to the smallest system in the list it belongs to.', '把天体和它所属的最低一级天体系统连起来。'],
        match: [[['The Moon', '月球'], ['Earth–Moon system', '地月系']], [['Jupiter', '木星'], ['Solar System', '太阳系']], [['Polaris (a star 430 ly away)', '北极星（距离约 430 光年的恒星）'], ['Milky Way', '银河系']], [['Andromeda Galaxy', '仙女星系'], ['Other galaxies', '河外星系']]],
        why: ['The Moon orbits the Earth; Jupiter orbits the Sun; Polaris is another star of our galaxy; Andromeda is a separate galaxy.', '月球绕地球转；木星绕太阳转；北极星是银河系中的另一颗恒星；仙女星系是银河系以外的星系。'] },
      { q: ['The Sun is about 4.6 billion years old and takes about 230 million years to go once round the Milky Way. About how many times has it gone round?', '太阳年龄约 46 亿年，绕银河系中心一周约需 2.3 亿年。太阳大约已经绕银河系中心转了多少圈？'], num: { answer: 20, tol: 1, unit: ['orbits', '圈'] },
        why: ['4,600 ÷ 230 = 20 orbits (counting in millions of years).', '46 亿 ÷ 2.3 亿 = 20 圈。'] },
    ],
  },
];
