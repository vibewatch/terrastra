/** The 25 countries of West and Central Africa on the SSBS review sheet: names, capitals, where they are, one fact. */
import type { LL, Pair } from '../kit.ts';

export type Region = 'west' | 'central';
export interface Country {
  a2: string; name: Pair; capital: Pair;
  /** a point well inside the country (for "find it" answers and labels) */
  ll: LL;
  /** the capital city */
  cap: LL;
  region: Region;
  /** small or island countries: taps this close count even when the map's outline is too fine to hit */
  tolKm: number;
  fact: Pair;
}

const c = (a2: string, name: Pair, capital: Pair, ll: LL, cap: LL, region: Region, fact: Pair, tolKm = 60): Country => ({ a2, name, capital, ll, cap, region, tolKm, fact });

export const COUNTRIES: Country[] = [
  // West Africa (16)
  c('MR', ['Mauritania', '毛里塔尼亚'], ['Nouakchott', '努瓦克肖特'], [20.3, -10.3], [18.08, -15.98], 'west',
    ['Mostly Sahara; home of the "Eye of the Sahara", a giant ring of rock seen from space.', '国土大部分是撒哈拉沙漠，有从太空都能看到的巨大岩石圆环“撒哈拉之眼”。']),
  c('ML', ['Mali', '马里'], ['Bamako', '巴马科'], [17.6, -3.9], [12.64, -8.0], 'west',
    ['Landlocked; heart of the old Mali Empire, with Timbuktu and the mud-brick Great Mosque of Djenné.', '内陆国；古代马里帝国的中心，有廷巴克图和泥砖建成的杰内大清真寺。']),
  c('NE', ['Niger', '尼日尔'], ['Niamey', '尼亚美'], [17.6, 9.0], [13.51, 2.11], 'west',
    ['The largest country in West Africa; landlocked, mostly desert, with the Niger River in its south-west.', '西非面积最大的国家；内陆国，大部分是沙漠，尼日尔河流经西南部。']),
  c('BF', ['Burkina Faso', '布基纳法索'], ['Ouagadougou', '瓦加杜古'], [12.3, -1.6], [12.37, -1.52], 'west',
    ['A landlocked Sahel country; its name means "land of honest people". It grows cotton and mines gold.', '萨赫勒地区的内陆国，国名意为“正直者的土地”；种植棉花，开采黄金。']),
  c('SN', ['Senegal', '塞内加尔'], ['Dakar', '达喀尔'], [14.5, -14.5], [14.69, -17.45], 'west',
    ['Dakar is on the westernmost point of mainland Africa; Gorée Island off Dakar remembers the slave trade.', '达喀尔位于非洲大陆最西端；达喀尔外的戈雷岛是奴隶贸易的历史见证。']),
  c('GM', ['The Gambia', '冈比亚'], ['Banjul', '班珠尔'], [13.45, -15.4], [13.45, -16.58], 'west',
    ['The smallest country on the African mainland: a thin strip along the Gambia River, wrapped by Senegal.', '非洲大陆面积最小的国家：沿冈比亚河的狭长地带，除海岸外被塞内加尔包围。'], 120),
  c('GW', ['Guinea-Bissau', '几内亚比绍'], ['Bissau', '比绍'], [12.0, -15.0], [11.86, -15.6], 'west',
    ['A small coastal country with the Bijagós Islands; cashew nuts are its main export.', '沿海小国，有比热戈斯群岛；腰果是主要出口商品。'], 120),
  c('GN', ['Guinea', '几内亚'], ['Conakry', '科纳克里'], [10.4, -10.9], [9.64, -13.58], 'west',
    ['The Niger River rises in its highlands; it has some of the world\'s biggest reserves of bauxite (aluminium ore).', '尼日尔河发源于这里的高原；铝土矿储量居世界前列。']),
  c('SL', ['Sierra Leone', '塞拉利昂'], ['Freetown', '弗里敦'], [8.5, -11.8], [8.48, -13.23], 'west',
    ['Freetown was founded in 1792 as a home for freed slaves; the country is known for diamonds.', '首都弗里敦建于 1792 年，是获得自由的奴隶的定居地；以钻石闻名。'], 80),
  c('LR', ['Liberia', '利比里亚'], ['Monrovia', '蒙罗维亚'], [6.4, -9.4], [6.31, -10.8], 'west',
    ['Founded by freed slaves from the USA and independent since 1847; never a European colony.', '由来自美国的获释奴隶建立，1847 年独立，从未成为欧洲殖民地。'], 80),
  c('CI', ['Ivory Coast', '科特迪瓦'], ['Yamoussoukro', '亚穆苏克罗'], [7.5, -5.5], [6.83, -5.29], 'west',
    ['The world\'s largest cocoa grower; Abidjan is its biggest city and port.', '世界最大的可可生产国；阿比让是最大城市和港口。']),
  c('GH', ['Ghana', '加纳'], ['Accra', '阿克拉'], [7.9, -1.0], [5.6, -0.19], 'west',
    ['The former Gold Coast; in 1957 it led sub-Saharan Africa to independence under Kwame Nkrumah.', '原名“黄金海岸”；1957 年在恩克鲁玛领导下独立，开启了撒哈拉以南非洲的独立浪潮。']),
  c('TG', ['Togo', '多哥'], ['Lomé', '洛美'], [8.6, 0.9], [6.13, 1.22], 'west',
    ['A narrow country, only about 50–150 km wide, running inland from the coast; it mines phosphate.', '国土狭长，宽只有约 50–150 千米，从海岸向内陆延伸；出产磷酸盐。'], 120),
  c('BJ', ['Benin', '贝宁'], ['Porto-Novo', '波多诺伏'], [9.6, 2.3], [6.5, 2.6], 'west',
    ['Home of the old Kingdom of Dahomey; Cotonou is its largest city and seat of government.', '古代达荷美王国所在地；科托努是最大城市和政府所在地。'], 100),
  c('NG', ['Nigeria', '尼日利亚'], ['Abuja', '阿布贾'], [9.6, 8.1], [9.06, 7.49], 'west',
    ['Africa\'s most populous country (over 220 million people); oil, the megacity Lagos and "Nollywood" films.', '非洲人口最多的国家（超过 2.2 亿）；石油、特大城市拉各斯和“瑙莱坞”电影。']),
  c('CV', ['Cape Verde', '佛得角'], ['Praia', '普拉亚'], [15.1, -23.6], [14.93, -23.51], 'west',
    ['Volcanic islands in the Atlantic about 570 km west of Senegal; nobody lived there before the Portuguese came.', '大西洋中的火山群岛，在塞内加尔以西约 570 千米；葡萄牙人到来之前无人居住。'], 250),
  // Central Africa (9)
  c('TD', ['Chad', '乍得'], ['N\'Djamena', '恩贾梅纳'], [15.4, 18.7], [12.13, 15.06], 'central',
    ['Landlocked, with the Sahara in the north; Lake Chad has shrunk by about 90% since the 1960s.', '内陆国，北部是撒哈拉沙漠；乍得湖自 20 世纪 60 年代以来缩小了约 90%。']),
  c('CM', ['Cameroon', '喀麦隆'], ['Yaoundé', '雅温得'], [5.7, 12.4], [3.85, 11.5], 'central',
    ['"Africa in miniature": desert, savanna, rainforest and the active volcano Mount Cameroon (about 4,040 m).', '“微缩的非洲”：沙漠、草原、雨林都有，还有活火山喀麦隆火山（约 4040 米）。']),
  c('CF', ['Central African Republic', '中非共和国'], ['Bangui', '班吉'], [6.6, 20.9], [4.36, 18.56], 'central',
    ['Landlocked in the very middle of Africa; rich in diamonds and gold but among the poorest countries.', '位于非洲正中央的内陆国；有钻石和黄金，却是世界上最贫穷的国家之一。']),
  c('GQ', ['Equatorial Guinea', '赤道几内亚'], ['Malabo', '马拉博'], [1.6, 10.4], [3.75, 8.78], 'central',
    ['The only Spanish-speaking country in Africa: a mainland part plus Bioko Island, where Malabo is; oil.', '非洲唯一以西班牙语为官方语言的国家：由大陆部分和比奥科岛组成，首都马拉博在岛上；产石油。'], 150),
  c('GA', ['Gabon', '加蓬'], ['Libreville', '利伯维尔'], [-0.8, 11.6], [0.39, 9.45], 'central',
    ['About 88% covered by rainforest, crossed by the equator; oil makes it richer than most neighbours.', '约 88% 的国土被雨林覆盖，赤道横穿；石油使它比多数邻国富裕。']),
  c('CG', ['Republic of the Congo', '刚果共和国（刚果（布））'], ['Brazzaville', '布拉柴维尔'], [1.0, 15.9], [-4.27, 15.28], 'central',
    ['Brazzaville faces Kinshasa across the Congo River: two capitals within sight of each other.', '布拉柴维尔与金沙萨隔刚果河相望，是世界上相距最近的两个首都之一。']),
  c('CD', ['Democratic Republic of the Congo', '刚果民主共和国（刚果（金））'], ['Kinshasa', '金沙萨'], [-2.9, 23.6], [-4.32, 15.31], 'central',
    ['Africa\'s second-largest country, with the Congo rainforest and about 70% of the world\'s cobalt.', '非洲面积第二大的国家，有刚果雨林，钴产量约占世界的 70%。']),
  c('AO', ['Angola', '安哥拉'], ['Luanda', '罗安达'], [-12.3, 17.5], [-8.84, 13.23], 'central',
    ['A former Portuguese colony rich in oil and diamonds; a long civil war ended in 2002.', '前葡萄牙殖民地，石油和钻石丰富；长期内战于 2002 年结束。']),
  c('ST', ['São Tomé and Príncipe', '圣多美和普林西比'], ['São Tomé', '圣多美'], [0.3, 6.7], [0.34, 6.73], 'central',
    ['Two small volcanic islands in the Gulf of Guinea, right by the equator; Africa\'s second-smallest country.', '几内亚湾中两座小火山岛，紧挨赤道；非洲面积第二小的国家。'], 250),
];

export const BY_A2 = new Map(COUNTRIES.map(x => [x.a2, x]));
export const WEST = COUNTRIES.filter(x => x.region === 'west');
export const CENTRAL = COUNTRIES.filter(x => x.region === 'central');
/** Island states missing from the coarse painted map: shown with a marker instead of a fill. */
export const ISLANDS = new Set(['CV', 'ST']);
/** The whole region in view. */
export const AFRICA_CAM: [number, number, number] = [5, 2, 2.35];
