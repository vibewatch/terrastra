/**
 * Charles Messier's 1781 list of 110 "fuzzy things that are not comets" — the classic first targets for a small
 * telescope. Objects already described in cosmos.ts carry `messier: n` there; the rest are generated here from a
 * compact table (J2000 RA/Dec, distance, rough size), with a short description per type.
 */
import type { DeepKind, DeepObject, DeepScale, Morph } from './cosmos.ts';
import type { I18n } from './types.ts';
import { radecToGal } from '../lib/sky.ts';

/** gc globular · oc open cluster · pn planetary nebula · dn bright nebula · rn reflection nebula · gx galaxy · ds double star · as asterism · sc star cloud */
type MessierType = 'gc' | 'oc' | 'pn' | 'dn' | 'rn' | 'sn' | 'gx' | 'ds' | 'as' | 'sc';

/** The four filter groups of the Messier list. */
export type MessierGroup = 'galaxy' | 'nebula' | 'open' | 'globular';
export function messierGroup(kind: DeepKind): MessierGroup {
  if (kind === 'galaxy' || kind === 'dwarf' || kind === 'blackhole') return 'galaxy';
  if (kind === 'nebula' || kind === 'remnant') return 'nebula';
  if (kind === 'globular') return 'globular';
  return 'open';
}

const CON: Record<string, I18n> = {
  and: { en: 'Andromeda', zh: '仙女座' }, aqr: { en: 'Aquarius', zh: '宝瓶座' }, aur: { en: 'Auriga', zh: '御夫座' },
  cap: { en: 'Capricornus', zh: '摩羯座' }, cas: { en: 'Cassiopeia', zh: '仙后座' }, cet: { en: 'Cetus', zh: '鲸鱼座' },
  cma: { en: 'Canis Major', zh: '大犬座' }, cnc: { en: 'Cancer', zh: '巨蟹座' }, com: { en: 'Coma Berenices', zh: '后发座' },
  cvn: { en: 'Canes Venatici', zh: '猎犬座' }, cyg: { en: 'Cygnus', zh: '天鹅座' }, dra: { en: 'Draco', zh: '天龙座' },
  gem: { en: 'Gemini', zh: '双子座' }, her: { en: 'Hercules', zh: '武仙座' }, hya: { en: 'Hydra', zh: '长蛇座' },
  leo: { en: 'Leo', zh: '狮子座' }, lep: { en: 'Lepus', zh: '天兔座' }, lyr: { en: 'Lyra', zh: '天琴座' },
  mon: { en: 'Monoceros', zh: '麒麟座' }, oph: { en: 'Ophiuchus', zh: '蛇夫座' }, ori: { en: 'Orion', zh: '猎户座' },
  peg: { en: 'Pegasus', zh: '飞马座' }, per: { en: 'Perseus', zh: '英仙座' }, psc: { en: 'Pisces', zh: '双鱼座' },
  pup: { en: 'Puppis', zh: '船尾座' }, sco: { en: 'Scorpius', zh: '天蝎座' }, sct: { en: 'Scutum', zh: '盾牌座' },
  ser: { en: 'Serpens', zh: '巨蛇座' }, sge: { en: 'Sagitta', zh: '天箭座' }, sgr: { en: 'Sagittarius', zh: '人马座' },
  uma: { en: 'Ursa Major', zh: '大熊座' }, vir: { en: 'Virgo', zh: '室女座' }, vul: { en: 'Vulpecula', zh: '狐狸座' },
};

type Row = [n: number, type: MessierType, con: string, ra: string, dec: string, distLy: number, sizeLy: number,
  morph?: Morph | '', en?: string, zh?: string];

// RA "hh mm.m", Dec "±dd mm" (J2000). Distances and sizes are rounded catalogue values.
const ROWS: Row[] = [
  [2, 'gc', 'aqr', '21 33.5', '-00 49', 37_500, 175],
  [3, 'gc', 'cvn', '13 42.2', '+28 23', 33_900, 180],
  [4, 'gc', 'sco', '16 23.6', '-26 32', 7_200, 75],
  [5, 'gc', 'ser', '15 18.6', '+02 05', 24_500, 165],
  [6, 'oc', 'sco', '17 40.1', '-32 13', 1_600, 12, '', 'Butterfly Cluster', '蝴蝶星团'],
  [7, 'oc', 'sco', '17 53.9', '-34 49', 980, 25, '', 'Ptolemy Cluster', '托勒密星团'],
  [9, 'gc', 'oph', '17 19.2', '-18 31', 25_800, 90],
  [10, 'gc', 'oph', '16 57.1', '-04 06', 14_300, 83],
  [11, 'oc', 'sct', '18 51.1', '-06 16', 6_200, 22, '', 'Wild Duck Cluster', '野鸭星团'],
  [12, 'gc', 'oph', '16 47.2', '-01 57', 15_700, 75],
  [14, 'gc', 'oph', '17 37.6', '-03 15', 30_300, 100],
  [15, 'gc', 'peg', '21 30.0', '+12 10', 35_700, 175],
  [17, 'dn', 'sgr', '18 20.8', '-16 11', 5_500, 40, '', 'Omega Nebula', '欧米茄星云'],
  [18, 'oc', 'sgr', '18 19.9', '-17 08', 4_900, 17],
  [19, 'gc', 'oph', '17 02.6', '-26 16', 28_700, 140],
  [20, 'dn', 'sgr', '18 02.6', '-23 02', 5_200, 40, '', 'Trifid Nebula', '三叶星云'],
  [21, 'oc', 'sgr', '18 04.6', '-22 30', 4_250, 8],
  [22, 'gc', 'sgr', '18 36.4', '-23 54', 10_600, 100],
  [23, 'oc', 'sgr', '17 56.8', '-19 01', 2_150, 15],
  [24, 'sc', 'sgr', '18 16.9', '-18 29', 10_000, 600, '', 'Sagittarius Star Cloud', '人马座恒星云'],
  [25, 'oc', 'sgr', '18 31.6', '-19 15', 2_000, 20],
  [26, 'oc', 'sct', '18 45.2', '-09 24', 5_000, 20],
  [27, 'pn', 'vul', '19 59.6', '+22 43', 1_360, 3, '', 'Dumbbell Nebula', '哑铃星云'],
  [28, 'gc', 'sgr', '18 24.5', '-24 52', 17_900, 90],
  [29, 'oc', 'cyg', '20 23.9', '+38 31', 4_000, 10],
  [30, 'gc', 'cap', '21 40.4', '-23 11', 27_100, 90],
  [34, 'oc', 'per', '02 42.0', '+42 47', 1_500, 7],
  [35, 'oc', 'gem', '06 08.9', '+24 20', 2_800, 23],
  [36, 'oc', 'aur', '05 36.1', '+34 08', 4_100, 14, '', 'Pinwheel Cluster', '风车星团'],
  [37, 'oc', 'aur', '05 52.4', '+32 33', 4_500, 25],
  [38, 'oc', 'aur', '05 28.4', '+35 50', 4_200, 25, '', 'Starfish Cluster', '海星星团'],
  [39, 'oc', 'cyg', '21 32.2', '+48 26', 1_000, 7],
  [40, 'ds', 'uma', '12 22.4', '+58 05', 510, 0, '', 'Winnecke 4', '温内克4'],
  [41, 'oc', 'cma', '06 46.0', '-20 44', 2_300, 26],
  [43, 'dn', 'ori', '05 35.6', '-05 16', 1_600, 8, '', "De Mairan's Nebula", '德梅朗星云'],
  [46, 'oc', 'pup', '07 41.8', '-14 49', 5_000, 30],
  [47, 'oc', 'pup', '07 36.6', '-14 30', 1_600, 12],
  [48, 'oc', 'hya', '08 13.8', '-05 48', 1_500, 23],
  [49, 'gx', 'vir', '12 29.8', '+08 00', 56e6, 157e3, 'elliptical'],
  [50, 'oc', 'mon', '07 03.2', '-08 20', 3_200, 20],
  [52, 'oc', 'cas', '23 24.2', '+61 35', 5_000, 19],
  [53, 'gc', 'com', '13 12.9', '+18 10', 58_000, 250],
  [54, 'gc', 'sgr', '18 55.1', '-30 29', 87_400, 300],
  [55, 'gc', 'sgr', '19 40.0', '-30 58', 17_600, 100],
  [56, 'gc', 'lyr', '19 16.6', '+30 11', 32_900, 85],
  [58, 'gx', 'vir', '12 37.7', '+11 49', 62e6, 110e3, 'barred'],
  [59, 'gx', 'vir', '12 42.0', '+11 39', 60e6, 90e3, 'elliptical'],
  [60, 'gx', 'vir', '12 43.7', '+11 33', 57e6, 120e3, 'elliptical'],
  [61, 'gx', 'vir', '12 21.9', '+04 28', 52.5e6, 100e3, 'barred'],
  [62, 'gc', 'oph', '17 01.2', '-30 07', 22_200, 100],
  [63, 'gx', 'cvn', '13 15.8', '+42 02', 29e6, 98e3, 'spiral', 'Sunflower Galaxy', '向日葵星系'],
  [64, 'gx', 'com', '12 56.7', '+21 41', 17e6, 54e3, 'spiral', 'Black Eye Galaxy', '黑眼星系'],
  [65, 'gx', 'leo', '11 18.9', '+13 05', 35e6, 90e3, 'spiral'],
  [66, 'gx', 'leo', '11 20.2', '+12 59', 31e6, 95e3, 'barred'],
  [67, 'oc', 'cnc', '08 51.3', '+11 49', 2_700, 10],
  [68, 'gc', 'hya', '12 39.5', '-26 45', 33_600, 105],
  [69, 'gc', 'sgr', '18 31.4', '-32 21', 29_700, 85],
  [70, 'gc', 'sgr', '18 43.2', '-32 18', 29_300, 70],
  [71, 'gc', 'sge', '19 53.8', '+18 47', 13_000, 27],
  [72, 'gc', 'aqr', '20 53.5', '-12 32', 54_600, 105],
  [73, 'as', 'aqr', '20 59.0', '-12 38', 2_500, 0],
  [74, 'gx', 'psc', '01 36.7', '+15 47', 32e6, 95e3, 'spiral', 'Phantom Galaxy', '幻影星系'],
  [75, 'gc', 'sgr', '20 06.1', '-21 55', 67_500, 135],
  [76, 'pn', 'per', '01 42.4', '+51 34', 2_500, 1.2, '', 'Little Dumbbell Nebula', '小哑铃星云'],
  [77, 'gx', 'cet', '02 42.7', '-00 01', 47e6, 100e3, 'barred', 'Cetus A', '鲸鱼座A'],
  [78, 'rn', 'ori', '05 46.7', '+00 03', 1_350, 8],
  [79, 'gc', 'lep', '05 24.5', '-24 33', 41_000, 120],
  [80, 'gc', 'sco', '16 17.0', '-22 59', 32_600, 95],
  [81, 'gx', 'uma', '09 55.6', '+69 04', 11.8e6, 90e3, 'spiral', "Bode's Galaxy", '波德星系'],
  [82, 'gx', 'uma', '09 55.8', '+69 41', 11.4e6, 37e3, 'irregular', 'Cigar Galaxy', '雪茄星系'],
  [83, 'gx', 'hya', '13 37.0', '-29 52', 15e6, 55e3, 'barred', 'Southern Pinwheel Galaxy', '南风车星系'],
  [84, 'gx', 'vir', '12 25.1', '+12 53', 60e6, 105e3, 'lenticular'],
  [85, 'gx', 'com', '12 25.4', '+18 11', 60e6, 125e3, 'lenticular'],
  [86, 'gx', 'vir', '12 26.2', '+12 57', 52e6, 135e3, 'lenticular'],
  [88, 'gx', 'com', '12 32.0', '+14 25', 47e6, 130e3, 'spiral'],
  [89, 'gx', 'vir', '12 35.7', '+12 33', 50e6, 80e3, 'elliptical'],
  [90, 'gx', 'vir', '12 36.8', '+13 10', 58.7e6, 160e3, 'spiral'],
  [91, 'gx', 'com', '12 35.4', '+14 30', 63e6, 100e3, 'barred'],
  [92, 'gc', 'her', '17 17.1', '+43 08', 26_700, 110],
  [93, 'oc', 'pup', '07 44.6', '-23 52', 3_600, 23],
  [94, 'gx', 'cvn', '12 50.9', '+41 07', 16e6, 50e3, 'spiral'],
  [95, 'gx', 'leo', '10 44.0', '+11 42', 33e6, 75e3, 'barred'],
  [96, 'gx', 'leo', '10 46.8', '+11 49', 31e6, 66e3, 'spiral'],
  [97, 'pn', 'uma', '11 14.8', '+55 01', 2_030, 2, '', 'Owl Nebula', '猫头鹰星云'],
  [98, 'gx', 'com', '12 13.8', '+14 54', 44.4e6, 150e3, 'spiral'],
  [99, 'gx', 'com', '12 18.8', '+14 25', 50.2e6, 85e3, 'spiral'],
  [100, 'gx', 'com', '12 22.9', '+15 49', 55e6, 107e3, 'spiral'],
  [102, 'gx', 'dra', '15 06.5', '+55 46', 50e6, 60e3, 'lenticular', 'Spindle Galaxy', '纺锤星系'],
  [103, 'oc', 'cas', '01 33.2', '+60 42', 10_000, 15],
  [105, 'gx', 'leo', '10 47.8', '+12 35', 32e6, 54e3, 'elliptical'],
  [106, 'gx', 'cvn', '12 19.0', '+47 18', 23.7e6, 135e3, 'spiral'],
  [107, 'gc', 'oph', '16 32.5', '-13 03', 20_900, 80],
  [108, 'gx', 'uma', '11 11.5', '+55 40', 46e6, 100e3, 'barred', 'Surfboard Galaxy', '冲浪板星系'],
  [109, 'gx', 'uma', '11 57.6', '+53 23', 83.5e6, 180e3, 'barred'],
];

const KIND: Record<MessierType, DeepKind> = {
  gc: 'globular', oc: 'starcluster', pn: 'nebula', dn: 'nebula', rn: 'nebula', sn: 'remnant', gx: 'galaxy', ds: 'star', as: 'starcluster', sc: 'starcluster',
};
const EMOJI: Record<MessierType, string> = { gc: '✨', oc: '💫', pn: '💍', dn: '🌸', rn: '🌌', sn: '💥', gx: '🌀', ds: '👯', as: '⭐', sc: '🌟' };

type Blurb = (c: I18n) => I18n;
const BLURB: Record<string, Blurb> = {
  gc: c => ({ en: `A globular cluster in ${c.en}: a tight ball of hundreds of thousands of very old stars, circling far out around the Milky Way's centre.`,
    zh: `${c.zh}里的一个球状星团：几十万颗非常古老的恒星紧紧挤成一团，在银河系外围绕着银心转。` }),
  oc: c => ({ en: `An open cluster in ${c.en}: a loose family of young stars that were all born together from the same gas cloud.`,
    zh: `${c.zh}里的一个疏散星团：一群年轻的恒星兄弟姐妹，都是从同一团气体云里一起诞生的。` }),
  pn: c => ({ en: `A planetary nebula in ${c.en}: glowing shells of gas puffed off by a dying Sun-like star. Our Sun will make one too, in about 5 billion years.`,
    zh: `${c.zh}里的一个行星状星云：一颗像太阳一样的恒星临终时吹出的发光气体壳。大约50亿年后，太阳也会变成这样。` }),
  dn: c => ({ en: `A glowing nebula in ${c.en}: a giant cloud of gas and dust where new stars are being born right now.`,
    zh: `${c.zh}里的一片发光星云：由气体和尘埃组成的巨大云团，新的恒星正在里面诞生。` }),
  rn: c => ({ en: `A reflection nebula in ${c.en}: a dusty cloud lit up by nearby bright stars, like fog caught in a torch beam.`,
    zh: `${c.zh}里的一个反射星云：一团尘埃被附近的亮星照亮，就像手电筒照亮了雾气。` }),
  ds: c => ({ en: `Two stars in ${c.en} that only look close together from Earth. Messier listed it while searching for a nebula that was not there!`,
    zh: `${c.zh}里的两颗星，只是从地球上看起来挨在一起。梅西耶在寻找一个并不存在的星云时把它记了下来！` }),
  as: c => ({ en: `A little group of four stars in ${c.en} that just happen to line up from Earth: not a real cluster at all.`,
    zh: `${c.zh}里的四颗星，只是从地球上看恰好排在一起，其实根本不是真正的星团。` }),
  sc: c => ({ en: `A vast cloud of stars in ${c.en}: a window through the dust, looking deep into one of the Milky Way's inner arms.`,
    zh: `${c.zh}里的一大片恒星云：透过尘埃的一扇窗，能一直望到银河系内侧的旋臂。` }),
  spiral: c => ({ en: `A spiral galaxy in ${c.en}, far beyond the Milky Way: hundreds of billions of stars swirled into shining arms.`,
    zh: `${c.zh}里的一个旋涡星系，远在银河系之外：数千亿颗恒星旋成一条条明亮的旋臂。` }),
  barred: c => ({ en: `A barred spiral galaxy in ${c.en}: its arms unwind from a bright bar of stars across the middle, just like our Milky Way's.`,
    zh: `${c.zh}里的一个棒旋星系：旋臂从中间一根明亮的恒星“棒”两端伸出，和我们的银河系一样。` }),
  elliptical: c => ({ en: `An elliptical galaxy in ${c.en}: a huge, smooth, egg-shaped swarm of old stars, far beyond the Milky Way.`,
    zh: `${c.zh}里的一个椭圆星系：由古老恒星组成的巨大蛋形星群，远在银河系之外。` }),
  lenticular: c => ({ en: `A lens-shaped galaxy in ${c.en}: a bright disc of stars with no spiral arms, far beyond the Milky Way.`,
    zh: `${c.zh}里的一个透镜状星系：一个明亮的恒星圆盘，却没有旋臂，远在银河系之外。` }),
  irregular: c => ({ en: `A starburst galaxy in ${c.en}, making new stars about ten times faster than the Milky Way does.`,
    zh: `${c.zh}里的一个星暴星系，产生新恒星的速度大约是银河系的10倍。` }),
};

const deg = (s: string, k: number): number => {
  const [a, b] = s.trim().split(/\s+/);
  const v = Math.abs(Number(a)) + Number(b) / 60;
  return (a.startsWith('-') ? -v : v) * k;
};
/** Which deep scale an object at `distLy` belongs to. */
const scaleFor = (distLy: number): DeepScale => (distLy < 1e5 ? 'galaxy' : distLy < 1e7 ? 'group' : 'laniakea');

export const MESSIER_EXTRA: DeepObject[] = ROWS.map(([n, type, con, ra, dec, distLy, sizeLy, morph, en, zh]) => {
  const [l, b] = radecToGal(deg(ra, 15), deg(dec, 1));
  const c = CON[con];
  return {
    key: `dp_m${n}`, scale: scaleFor(distLy), kind: KIND[type], messier: n,
    name: en ? { en: `${en} (M${n})`, zh: `${zh}（M${n}）` } : { en: `Messier ${n}`, zh: `梅西耶${n}` },
    emoji: EMOJI[type], l: +l.toFixed(2), b: +b.toFixed(2), distLy, rank: 0.5,
    ...(sizeLy ? { sizeLy } : {}), ...(morph ? { morph } : {}),
    desc: BLURB[type === 'gx' ? morph || 'spiral' : type](c),
    wiki: `Messier ${n}`,
  };
});
