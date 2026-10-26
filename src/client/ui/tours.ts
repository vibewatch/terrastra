/**
 * Guided tours: short routes through the scenes that already exist (the globe, the Solar System, the deep-space levels
 * and the sky theatre). A tour only moves the camera/scene and explains; every step can be left for free exploration.
 */
import { h, openModal, closeModal, confetti, toast } from './dom.ts';
import { icon, type IconName } from './icons.ts';
import { t, lang, onLang } from '../lib/i18n.ts';
import { load, save } from '../lib/storage.ts';
import { classroomLink } from '../lib/classroom.ts';
import { closeTutorial } from './tutorial.ts';
import { skyEvents } from '../../shared/lib/astro/events.ts';
import { BY_KEY } from '../../shared/data/catalogue.ts';

type Pair = readonly [en: string, zh: string];
const L = (p: Pair) => (lang() === 'zh' ? p[1] : p[0]);

/** What a tour may ask of the app: all of it goes through the normal navigation, so nothing here owns a scene. */
export interface TourHost {
  earth(lat: number, lon: number, h: number): void;
  /** A route like `solar/earth` or `milkyway/dp_orion_arm` (closes the sky theatre first). */
  go(route: string): void;
  sky(id: string | undefined, view?: 'model' | 'ground' | 'space'): void;
  /** Draws a route as arcs between consecutive points (a sketch, not tracking data). */
  path(pts: [number, number][]): void;
  item(key: string): void;
  /** Opens the Solar System on `focus` with its clock set to `ms`, so the scene shows that moment. */
  solarAt(focus: string, ms: number): void;
}

interface Step {
  title: Pair; body: Pair; run: (h: TourHost) => void; spot?: string;
  /** Mission stories: the moment of this phase (UTC ms) and whether what is shown is from the record or only a sketch. */
  when?: number; track?: 'record' | 'sketch';
}
export interface Tour { id: string; icon: IconName; title: Pair; blurb: Pair; minutes: number; steps: () => Step[]; /** mission start (UTC ms), for mission elapsed time */ t0?: number }

const DAY = 864e5;
/** The Arctic tern's sketched route: the catalogue journey's own points. */
const TERN = (BY_KEY.get('mg_tern')?.route?.pts ?? []) as [number, number][];
/** The next total eclipse of each kind, from today (the tour stays current without editing dates). */
function nextTotal(kind: 'solar-eclipse' | 'lunar-eclipse'): string | undefined {
  const now = Date.now();
  return skyEvents(now - DAY, now + 6 * 365 * DAY, { kinds: [kind] })
    .find(e => (e.solar?.type ?? e.lunar?.type) === 'total')?.id;
}


/** Apollo 11, from the NASA mission report: times are UTC, places are the recorded pad, landing and splashdown points. */
const A11 = Date.UTC(1969, 6, 16, 13, 32, 0);
const A11_PARKING: [number, number][] = [[28.6, -80.6], [30, -50], [22, -15], [5, 20], [-15, 60], [-28, 100], [-25, 140], [-5, 175], [15, -150]];

export const TOURS: Tour[] = [
  {
    id: 'cosmos', icon: 'planet', minutes: 4,
    title: ['From home to the Milky Way', '从家园到银河系'],
    blurb: ['Zoom out one level at a time: Earth, the planets, the nearest stars, our galaxy and its neighbours.', '一层一层向外看：地球、行星、最近的恒星、我们的银河系和它的邻居。'],
    steps: () => [
      { title: ['Start at home', '从家出发'], run: x => x.earth(30, 110, 2.6),
        body: ['This is Earth, the only place we know of with life. Its air is a very thin layer: compared with the whole planet, thinner than the skin of an apple. Now we zoom out, one level at a time.',
          '这就是地球，目前我们知道的唯一有生命的地方。和整个星球比起来，大气层薄得像苹果皮。接下来，我们一层一层往外看。'] },
      { title: ['Earth among the planets', '行星中的地球'], run: x => x.go('solar/earth'),
        body: ['Earth is the third planet from the Sun, about 150 million km away. Sunlight takes about 8 minutes and 20 seconds to reach us.',
          '地球是离太阳第三近的行星，和太阳相距约 1.5 亿公里。阳光大约要走 8 分 20 秒才能到达地球。'] },
      { title: ['The whole Solar System', '整个太阳系'], run: x => x.go('solar'),
        body: ['Eight planets travel around the Sun. Their sizes are enlarged here so you can see them: at true scale, at this distance they would be smaller than specks of dust.',
          '八颗行星绕着太阳转。这里把它们放大了，好让你看清；如果按真实比例，在这么远的地方看，它们比灰尘还小。'] },
      { title: ['Our nearest stars', '离我们最近的恒星'], run: x => x.go('nearbystars/dp_alpha_centauri'),
        body: ['The nearest star system, Alpha Centauri, is 4.4 light-years away: its light takes more than four years to get here. Most of our neighbours are small red dwarfs, too dim to see without a telescope.',
          '最近的恒星系统半人马座α离我们 4.4 光年，它的光要走四年多才能到达这里。我们的邻居大多是小小的红矮星，不用望远镜根本看不见。'] },
      { title: ['Our galaxy', '我们的星系'], run: x => x.go('milkyway'),
        body: ['The Sun is just one of 100–400 billion stars in the Milky Way, a barred spiral galaxy nearly 90,000 light-years across.',
          '太阳只是银河系 1000 亿到 4000 亿颗恒星中的一颗。银河系是一个棒旋星系，直径将近 9 万光年。'] },
      { title: ['Where we live', '我们住在哪里'], run: x => x.go('milkyway/dp_orion_arm'),
        body: ['We live in a small arm called the Orion Arm, about 26,000 light-years from the black hole at the centre. The Sun takes about 230 million years to go around the galaxy once.',
          '我们住在一条叫“猎户臂”的小旋臂上，离银河系中心的黑洞约 2.6 万光年。太阳绕银河系转一圈要大约 2.3 亿年。'] },
      { title: ['Our neighbours', '我们的邻居'], run: x => x.go('localgroup/dp_m31'),
        body: ['The Milky Way belongs to the Local Group, with the Andromeda and Triangulum galaxies and dozens of dwarf galaxies. Andromeda is about 2.5 million light-years away and moving toward us.',
          '银河系属于本星系群，同伴有仙女星系、三角星系和几十个矮星系。仙女星系离我们约 250 万光年，正在向我们靠近。'] },
      { title: ['Your turn', '轮到你了'], run: () => {}, spot: '.level-switch',
        body: ['Use the level button at the top left to jump between levels, or go back to Earth. Every name you see can be tapped.',
          '点左上角的层级按钮，可以在各个层级之间跳转，也可以回到地球。你看到的每个名字都可以点开。'] },
    ],
  },
  {
    id: 'eclipse', icon: 'eclipse', minutes: 4,
    title: ['Why eclipses happen', '日食和月食是怎么回事'],
    blurb: ['The Sun, the Moon and Earth line up: see the shadows from space and from the ground.', '太阳、月亮和地球排成一线：从太空和地面看影子。'],
    steps: () => {
      const solar = nextTotal('solar-eclipse'), lunar = nextTotal('lunar-eclipse');
      return [
        { title: ['Meet the Moon', '认识月亮'], run: x => x.go('solar/moon'),
          body: ['The Moon goes around Earth about every 27.3 days. The Sun is about 400 times wider than the Moon, but also about 400 times farther away, so in our sky they look almost the same size.',
            '月亮大约每 27.3 天绕地球转一圈。太阳的直径约是月亮的 400 倍，但离我们也远了约 400 倍，所以在天上它们看起来差不多一样大。'] },
        { title: ['A shadow on Earth', '落在地球上的影子'], run: x => x.sky(solar, 'model'),
          body: ['At New Moon the Moon passes between Earth and the Sun. Its orbit is tilted about 5°, so most months its shadow misses Earth. When they line up exactly, the shadow sweeps across a narrow path.',
            '新月时，月亮从地球和太阳之间经过。月亮的轨道倾斜约 5°，所以大多数月份它的影子都错过了地球。只有三者正好排成一线时，影子才会扫过地面上一条窄窄的带子。'] },
        { title: ['Seen from the path', '在全食带上看'], run: x => x.sky(solar, 'ground'),
          body: ['Inside that path, the Moon covers the Sun completely for a few minutes. The sky turns dark and the Sun\'s faint outer atmosphere, the corona, appears. Never look straight at the Sun without proper eclipse glasses.',
            '在全食带里，月亮会把太阳完全遮住几分钟。天空变暗，太阳暗淡的外层大气——日冕——就显现出来。没有合格的日食眼镜，千万不要直视太阳。'] },
        { title: ['A lunar eclipse', '月食'], run: x => x.sky(lunar, 'model'),
          body: ['At Full Moon the Moon can slip into Earth\'s shadow. Everyone on the night side of Earth can see it. The Moon turns coppery red because Earth\'s air bends a little red sunlight into the shadow.',
            '满月时，月亮可能钻进地球的影子里。地球上处在夜晚的地方都能看到。月亮会变成古铜般的红色，因为地球的大气把一点红色的阳光折射进了影子里。'] },
        { title: ['Find the next one', '找到下一次'], run: () => {}, spot: '[data-testid="sky-cal"]',
          body: ['The calendar lists coming eclipses and when they can be seen from different cities. Pick one to replay it, or close the theatre to keep exploring.',
            '天象日历列出了接下来的日食和月食，以及在不同城市什么时候能看到。选一个重播，或者关闭剧场继续探索。'] },
      ];
    },
  },
  {
    id: 'tern', icon: 'bird', minutes: 3,
    title: ['Follow the Arctic tern', '跟着北极燕鸥飞'],
    blurb: ['From the Arctic to Antarctica: a bird that lives through two summers a year.', '从北极飞到南极：一年过两个夏天的鸟。'],
    steps: () => [
      { title: ['Summer in the Arctic', '北极的夏天'], run: x => x.earth(72, -21, 2.0),
        body: ['Arctic terns nest on Arctic coasts such as north-east Greenland. In the northern summer the Sun hardly sets there, so they can hunt small fish almost all day.',
          '北极燕鸥在格陵兰东北部这样的北极海岸筑巢。北半球夏天时，那里的太阳几乎不落山，它们差不多整天都能捕小鱼。'] },
      { title: ['Down the Atlantic', '沿大西洋南下'], run: x => { x.earth(40, -22, 2.8); x.path(TERN.slice(0, 4)); },
        body: ['In autumn they head south over the Atlantic. Many do not fly straight but follow curving routes with helpful winds. The line here is a simplified sketch, not a tracked bird.',
          '秋天，它们飞越大西洋向南。很多燕鸥不走直线，而是沿着顺风的弯曲路线飞。这里画的是简化示意路线，不是真实追踪数据。'] },
      { title: ['Across the equator', '飞过赤道'], run: x => { x.earth(-5, -15, 2.8); x.path(TERN.slice(0, 6)); },
        body: ['Past the equator they enter the Southern Hemisphere, where the seasons are the other way round: spring is starting there while the north heads into winter.',
          '飞过赤道就进入了南半球，那里的季节正好相反：北半球快到冬天时，南半球的春天才刚开始。'] },
      { title: ['Summer in Antarctica', '南极的夏天'], run: x => { x.earth(-62, -12, 2.6); x.path(TERN); },
        body: ['They reach the edge of the Antarctic pack ice in the southern summer — their second summer of the year. One round trip is about 70,000 km.',
          '它们在南半球的夏天到达南极浮冰的边缘——这是它们一年里的第二个夏天。往返一趟大约 7 万公里。'] },
      { title: ['Why the seasons flip', '为什么季节会颠倒'], run: x => x.earth(5, -20, 3.4),
        body: ['Earth\'s axis is tilted about 23.4°. In June the north leans toward the Sun; in December the south does. By flying from pole to pole, terns follow the summer.',
          '地球的自转轴倾斜约 23.4°。六月北半球朝向太阳，十二月轮到南半球。北极燕鸥在两极之间来回飞，就是在追着夏天走。'] },
      { title: ['Your turn', '轮到你了'], run: x => x.item('mg_tern'),
        body: ['Open its card to ride along with the terns, or find the whale, butterfly and wildebeest journeys among the migrations.',
          '打开卡片可以跟着燕鸥一起飞；也可以在“迁徙”分类里找找座头鲸、帝王蝶和角马的旅程。'] },
    ],
  },
  {
    id: 'apollo11', icon: 'rocket', minutes: 5, t0: A11,
    title: ['Apollo 11: to the Moon and back', '阿波罗11号：登月往返'],
    blurb: ['Eight days in July 1969, phase by phase: launch, the trip, the landing, the first steps and the splashdown.', '1969 年 7 月的八天，一段一段看：发射、飞行、着陆、第一步和溅落。'],
    steps: () => [
      { title: ['Launch', '发射'], when: A11, track: 'record', run: x => x.item('sp_ksc'),
        body: ['A Saturn V rocket lifted off from Launch Complex 39A at the Kennedy Space Center, Florida, carrying Neil Armstrong, Buzz Aldrin and Michael Collins.',
          '土星五号火箭从美国佛罗里达州肯尼迪航天中心的 39A 发射台升空，载着尼尔·阿姆斯特朗、巴兹·奥尔德林和迈克尔·柯林斯。'] },
      { title: ['Around Earth, then off to the Moon', '先绕地球，再飞向月球'], when: Date.UTC(1969, 6, 16, 16, 22, 13), track: 'sketch',
        run: x => { x.earth(5, -120, 3.2); x.path(A11_PARKING); },
        body: ['They circled Earth about one and a half times to check the spacecraft. Then, over the Pacific, the rocket\'s third stage fired again and sent them toward the Moon. The line here is a simplified sketch of the orbit, not tracking data.',
          '他们先绕地球飞了大约一圈半，检查飞船。然后在太平洋上空，火箭第三级再次点火，把他们送向月球。这里画的线是简化的轨道示意，不是真实追踪数据。'] },
      { title: ['Three days to the Moon', '飞行三天到月球'], when: Date.UTC(1969, 6, 19, 17, 21, 50), track: 'sketch', run: x => x.solarAt('moon', Date.UTC(1969, 6, 19, 17, 21, 50)),
        body: ['The trip of about 384,000 km took three days. Behind the Moon, out of radio contact, they fired the engine to slow down and enter lunar orbit. The Solar System clock is set to that day; sizes and distances are enlarged, and the spacecraft itself is not shown.',
          '约 38.4 万公里的路程用了三天。在月球背面、和地球失去无线电联系时，他们点燃发动机减速，进入环月轨道。太阳系的时钟已调到那一天；画面里的大小和距离都放大了，也没有画出飞船本身。'] },
      { title: ['The Eagle has landed', '“鹰”着陆了'], when: Date.UTC(1969, 6, 20, 20, 17, 40), track: 'record', run: x => x.solarAt('ss_moon_apollo11', Date.UTC(1969, 6, 20, 20, 17, 40)),
        body: ['Armstrong and Aldrin flew the lunar module Eagle down to the Sea of Tranquility, steering past a field of boulders with less than a minute of landing fuel to spare. Collins stayed in orbit in Columbia.',
          '阿姆斯特朗和奥尔德林驾驶“鹰”号登月舱降落在静海，为了避开一片大石头，着陆时剩下的燃料只够用不到一分钟。柯林斯留在“哥伦比亚”号指令舱里环绕月球。'] },
      { title: ['One small step', '一小步'], when: Date.UTC(1969, 6, 21, 2, 56, 15), track: 'record', run: x => x.solarAt('ss_moon_apollo11', Date.UTC(1969, 6, 21, 2, 56, 15)),
        body: ['Armstrong stepped onto the Moon: "That\'s one small step for man, one giant leap for mankind." Aldrin followed, and together they spent about two and a half hours outside, setting up experiments and collecting 21.5 kg of rock and soil.',
          '阿姆斯特朗踏上月面：“这是个人的一小步，却是人类的一大步。”奥尔德林随后出舱，两人在外面一共待了约两个半小时，安放实验仪器，采集了 21.5 公斤岩石和土壤。'] },
      { title: ['Splashdown', '溅落'], when: Date.UTC(1969, 6, 24, 16, 50, 35), track: 'record', run: x => x.earth(13.3, -169.15, 2.4),
        body: ['After rejoining Collins in lunar orbit, the crew flew home and splashed down in the Pacific Ocean, south-west of Hawaii, where the ship USS Hornet picked them up. The whole mission lasted about 8 days and 3 hours.',
          '回到月球轨道和柯林斯会合后，三人飞回地球，降落在夏威夷西南方的太平洋上，由“大黄蜂”号航空母舰接回。整个任务持续了约 8 天 3 小时。'] },
      { title: ['Your turn', '轮到你了'], run: x => x.item('pp_armstrong'),
        body: ['Meet Neil Armstrong, or find the Apollo 11 landing site and the other Apollo missions on the Moon in the Solar System.',
          '认识一下尼尔·阿姆斯特朗，或者到太阳系的月球上找找阿波罗11号着陆点和其他阿波罗任务。'] },
    ],
  },
];

/** "20 July 1969, 20:17 UTC · T+102:45" (mission elapsed time in hours:minutes). */
function missionTime(ms: number, t0?: number): string {
  const d = new Intl.DateTimeFormat(lang() === 'zh' ? 'zh-CN' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false }).format(ms);
  if (t0 === undefined) return t('tourUtc', { d });
  const m = Math.floor((ms - t0) / 60_000);
  return t('tourMet', { d, met: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` });
}

const done = () => new Set(load<string[]>('toursDone', []));

let active: { root: HTMLElement; stop: () => void } | null = null;
function stopTour(): void { active?.stop(); }

export function startTour(id: string, host: TourHost): void {
  const tour = TOURS.find(x => x.id === id);
  if (!tour) return;
  stopTour();
  closeTutorial();
  const steps = tour.steps();
  let i = 0;
  const ring = h('div', { class: 'tour-spot', 'aria-hidden': 'true' });
  const card = h('section', { class: 'tour-card', 'data-occludes': true, 'data-testid': 'tour', 'aria-labelledby': 'tour-title' });
  const root = h('div', { class: 'tour' }, ring, card);
  let spotTimer = 0;
  const place = () => {
    const el = steps[i].spot ? document.querySelector(steps[i].spot!) : null;
    const r = el?.getBoundingClientRect();
    if (r && r.width) Object.assign(ring.style, { display: 'block', left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
    else ring.style.display = 'none';
  };
  const render = () => {
    const st = steps[i], last = i === steps.length - 1;
    card.replaceChildren(
      h('header', { class: 'tour-head' },
        h('span', { class: 'tour-kicker', html: icon(tour.icon, 14) }, h('span', {}, `${L(tour.title)} · ${t('tutStep', { i: i + 1, n: steps.length })}`)),
        h('button', { class: 'icon-btn tour-x', 'aria-label': t('tourExit'), 'data-testid': 'tour-exit', html: icon('close', 16), onclick: () => stop() })),
      h('h2', { id: 'tour-title' }, L(st.title)),
      st.when !== undefined ? h('p', { class: 'tour-when', 'data-testid': 'tour-when' }, missionTime(st.when, tour.t0)) : '',
      st.track ? h('p', { class: 'tour-track tour-' + st.track, 'data-testid': 'tour-track', html: icon(st.track === 'record' ? 'pin' : 'sparkle', 14) },
        h('span', {}, t(st.track === 'record' ? 'tourRecord' : 'tourSketch'))) : '',
      h('p', { class: 'tour-body', 'aria-live': 'polite' }, L(st.body)),
      h('div', { class: 'dots', 'aria-hidden': 'true' }, ...steps.map((_, j) => h('span', { class: j === i ? 'on' : '' }))),
      h('div', { class: 'row' },
        h('button', { class: 'pill', 'data-testid': 'tour-back', disabled: i === 0, onclick: () => go(i - 1) }, t('tourBack')),
        h('button', { class: 'cta', 'data-testid': 'tour-next', onclick: () => (last ? finish() : go(i + 1)) }, last ? t('tourFinish') : t('next'))));
  };
  const go = (k: number) => {
    if (k < 0 || k >= steps.length) return;
    i = k;
    render();
    (card.querySelector('[data-testid="tour-next"]') as HTMLButtonElement).focus({ preventScroll: true });
    try { steps[i].run(host); } catch (e) { console.error(e); }
    clearInterval(spotTimer);
    ring.style.display = 'none';
    // scenes load and settle at their own pace: keep the spotlight on its target while it moves into place
    if (steps[i].spot) spotTimer = window.setInterval(place, 400);
  };
  const stop = () => {
    clearInterval(spotTimer);
    offLang();
    root.remove();
    document.body.classList.remove('touring');
    if (active?.root === root) active = null;
  };
  const finish = () => {
    save('toursDone', [...done().add(tour.id)]);
    stop();
    confetti(40);
  };
  const offLang = onLang(() => render());
  active = { root, stop };
  document.body.append(root);
  document.body.classList.add('touring');
  go(0);
}

/** The tour picker. */
export function openTours(host: TourHost): void {
  const seen = done();
  openModal('tours', t('tours'), h('div', { class: 'tour-list' },
    h('p', { class: 'muted' }, t('toursIntro')),
    ...TOURS.map(x => h('div', { class: 'tour-row' },
      h('button', { class: 'tour-pick', 'data-testid': 'tour-' + x.id, onclick: () => { closeModal('tours'); startTour(x.id, host); } },
        h('span', { class: 'tile', html: icon(x.icon, 22) }),
        h('span', { class: 'grow' }, h('strong', {}, L(x.title)), h('span', { class: 'muted small' }, L(x.blurb))),
        h('span', { class: 'meta' }, (seen.has(x.id) ? '✓ ' : '') + t('minutesN', { n: x.minutes }))),
      // A teacher's link: opens straight into this tour with classroom mode on.
      h('button', { class: 'icon-btn tour-link', 'data-testid': 'tour-link-' + x.id, 'aria-label': t('classLink'), title: t('classLink'), html: icon('share', 16),
        onclick: () => void copyLink(classroomLink(x.id)) })))));
}

async function copyLink(link: string): Promise<void> {
  try { await navigator.clipboard.writeText(link); toast(t('classLinkCopied')); }
  catch { prompt(t('classLink'), link); }
}
