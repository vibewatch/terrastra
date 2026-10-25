/** The 17 key terms on the SSBS review sheet, each with a short definition in our own words. */
import type { Pair } from '../kit.ts';

export type TermGroup = 'land' | 'past' | 'power' | 'today';
export interface Term { id: string; term: Pair; def: Pair; group: TermGroup }

const t = (id: string, group: TermGroup, term: Pair, def: Pair): Term => ({ id, term, def, group });

export const TERMS: Term[] = [
  t('sahel', 'land', ['Sahel', '萨赫勒地区'],
    ['The dry belt of grass and thorny shrubs along the southern edge of the Sahara, between the desert and the savanna.', '撒哈拉沙漠南缘、介于沙漠和热带草原之间的半干旱草地和灌木带。']),
  t('savanna', 'land', ['savanna', '热带草原（稀树草原）'],
    ['A tropical grassland with scattered trees, a rainy season and a long dry season.', '有零星树木的热带草地，有雨季和漫长的旱季。']),
  t('arable', 'land', ['arable land', '可耕地'],
    ['Land that is suitable for growing crops.', '适合种植农作物的土地。']),
  t('desertification', 'land', ['desertification', '荒漠化'],
    ['The spread of desert conditions into dry farmland and grassland, made worse by drought, overgrazing and cutting trees.', '干旱地区的耕地和草地变成荒漠的过程，干旱、过度放牧和砍伐树木会使它加剧。']),
  t('deforestation', 'land', ['deforestation', '森林砍伐（毁林）'],
    ['Cutting down or clearing forests for farms, timber, mining or firewood.', '为了农田、木材、采矿或柴火而砍伐、清除森林。']),
  t('salt', 'past', ['salt trade', '盐金贸易'],
    ['Camel caravans carried salt from the Sahara south and traded it for West African gold.', '骆驼商队把撒哈拉的盐向南运，换取西非的黄金。']),
  t('griot', 'past', ['griot', '格里奥（说唱艺人）'],
    ['A West African storyteller, historian and musician who keeps a people\'s history alive in songs and stories.', '西非的说书人、史官和乐师，用歌谣和故事代代相传一个民族的历史。']),
  t('slavetrade', 'past', ['Atlantic slave trade', '大西洋奴隶贸易'],
    ['The forced shipping of about 12 million enslaved Africans across the Atlantic to the Americas, from the 1500s to the 1800s.', '16 至 19 世纪把约 1200 万被奴役的非洲人强行横渡大西洋运往美洲的贸易。']),
  t('middle', 'past', ['middle passage', '中间航程'],
    ['The voyage across the Atlantic in which enslaved Africans were chained in crowded ships; many died on the way.', '被奴役的非洲人被锁在拥挤的船舱里横渡大西洋的航程，很多人死在途中。']),
  t('colonialism', 'power', ['colonialism', '殖民主义'],
    ['One country ruling another land and its people, and using its land, labour and resources.', '一个国家统治另一片土地和那里的人民，并利用其土地、劳动力和资源。']),
  t('imperialism', 'power', ['imperialism', '帝国主义'],
    ['A powerful nation\'s policy of building an empire by taking control of other lands, by force or by money.', '强国通过武力或经济手段控制其他地区、建立帝国的政策。']),
  t('panafricanism', 'power', ['Pan-Africanism', '泛非主义'],
    ['The idea that Africans and people of African descent everywhere should unite and work together.', '主张世界各地的非洲人和非洲后裔团结起来、共同奋斗的思想。']),
  t('au', 'power', ['African Union', '非洲联盟'],
    ['The organisation of all 55 African states, set up in 2002, that works for peace, unity and development.', '由全部 55 个非洲国家组成、2002 年成立的组织，致力于和平、团结与发展。']),
  t('infrastructure', 'today', ['infrastructure', '基础设施'],
    ['The basic systems a country runs on: roads, railways, ports, power, clean water and phone lines.', '国家运转所依靠的基本系统：公路、铁路、港口、电力、清洁用水和通信线路。']),
  t('corruption', 'today', ['corruption', '腐败'],
    ['Dishonest use of power for personal gain, such as officials taking bribes or stealing public money.', '为私利滥用权力，例如官员收受贿赂或侵吞公款。']),
  t('malaria', 'today', ['malaria', '疟疾'],
    ['A deadly disease passed on by the bite of infected mosquitoes; most of its victims are young children in Africa.', '由受感染的蚊子叮咬传播的致命疾病，死者大多是非洲的幼儿。']),
  t('microcredit', 'today', ['microcredit', '小额信贷'],
    ['Very small loans to poor people, often women, so they can start or grow a small business.', '贷给穷人（通常是妇女）的很小额的贷款，帮助他们开办或扩大小生意。']),
];

export const GROUPS: Record<TermGroup, Pair> = {
  land: ['Land and environment', '土地与环境'],
  past: ['Trade and the slave trade', '贸易与奴隶贸易'],
  power: ['Empires, colonies and unity', '帝国、殖民与团结'],
  today: ['Africa today', '今天的非洲'],
};
