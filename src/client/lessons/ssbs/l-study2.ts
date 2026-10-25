/** SSBS study lessons, part 2: the Atlantic slave trade, colonial rule and independence. */
import { C, mk, type Lesson } from '../kit.ts';
import { mcq } from './helpers.ts';

const unit = ['SSBS · West and Central Africa', 'SSBS · 西非与中非'] as const;

export const SLAVERY_LESSON: Lesson = {
  id: 'ssbs-slavery', strand: 'world', tracks: [], unit, icon: 'compass', minutes: 8,
  title: ['The Atlantic slave trade', '大西洋奴隶贸易'],
  blurb: ['The triangular trade, the middle passage, and what it cost Africa.', '三角贸易、中间航程，以及它给非洲带来的伤害。'],
  keys: [
    ['From the 1500s to the 1800s about 12.5 million Africans were forced onto ships to the Americas.', '16 至 19 世纪，约 1250 万非洲人被强行押上开往美洲的船。'],
    ['The triangular trade: goods from Europe to Africa, enslaved people to the Americas, sugar and cotton back to Europe.', '三角贸易：欧洲商品运到非洲，被奴役的人运到美洲，糖和棉花运回欧洲。'],
    ['The middle passage was the deadly crossing of the Atlantic; about one in seven died on board.', '中间航程是横渡大西洋的死亡之旅，约七分之一的人死在船上。'],
    ['Britain banned the trade in 1807; slavery ended in the USA in 1865 and Brazil in 1888.', '英国 1807 年禁止奴隶贸易；美国 1865 年、巴西 1888 年废除奴隶制。'],
  ],
  steps: [
    {
      title: ['The triangular trade', '三角贸易'], cam: [18, -32, 4.2],
      lines: [
        { pts: [[53.4, -3.0], [6, -1]], c: C.white, t: 0.3, arrow: true, dur: 1.6 },
        { pts: [[6, -1], [18, -70]], c: C.red, t: 1.6, arrow: true, w: 2, dur: 1.8 },
        { pts: [[18, -70], [53.4, -3.0]], c: C.gold, t: 3.1, arrow: true, dur: 1.8 },
      ],
      marks: [mk([50, -15], '1: cloth, guns, iron', '1：布匹、枪支、铁器', { c: C.white, t: 0.8 }), mk([7, -40], '2: enslaved Africans', '2：被奴役的非洲人', { c: C.red, big: true, t: 2.2 }), mk([38, -45], '3: sugar, cotton, tobacco', '3：糖、棉花、烟草', { c: C.gold, t: 3.6 })],
      body: ['European ships sailed to the coast of West and Central Africa with cloth, guns, iron and alcohol, and traded them for captured people. The captives were shipped across the Atlantic and sold to work on plantations in Brazil, the Caribbean and North America. The ships returned to Europe loaded with sugar, cotton and tobacco grown by enslaved people. Because the routes made a triangle on the map, this is called the triangular trade.',
        '欧洲船只载着布匹、枪支、铁器和酒来到西非和中非沿海，用它们换取被俘的人。这些俘虏被运过大西洋，卖到巴西、加勒比地区和北美洲的种植园做苦工。船只再满载奴隶种植的糖、棉花和烟草返回欧洲。航线在地图上构成一个三角形，所以叫作三角贸易。'],
    },
    {
      title: ['The middle passage', '中间航程'], cam: [8, -30, 3.8],
      lines: [{ pts: [[14.67, -17.4], [-8, -35]], c: C.red, t: 0.4, arrow: true, w: 1.6, dur: 1.6 }, { pts: [[5.08, -1.35], [18, -76.8]], c: C.red, t: 0.8, arrow: true, w: 1.6, dur: 1.8 }, { pts: [[-8.84, 13.23], [-13, -38.5]], c: C.red, t: 1.2, arrow: true, w: 1.6, dur: 1.8 }],
      marks: [mk([14.67, -17.4], 'Gorée Island', '戈雷岛', { dot: true, t: 0.4 }), mk([5.08, -1.35], 'Elmina Castle', '埃尔米纳城堡', { dot: true, t: 0.8 }), mk([-8.84, 13.23], 'Luanda', '罗安达', { dot: true, t: 1.2 })],
      body: ['The crossing from Africa to the Americas, the middle leg of the triangle, is called the middle passage. It took six to eight weeks or more. People were chained lying down in dark, crowded holds with little food, water or air; disease spread fast, and about one in seven died at sea. Forts such as Elmina Castle in Ghana and the House of Slaves on Gorée Island in Senegal, where captives were held before boarding, are now museums and memorials.',
        '从非洲到美洲的航程是三角形的中间一边，叫作中间航程，要走六到八周甚至更久。人们被锁着躺在黑暗、拥挤的船舱里，食物、饮水和空气都很少；疾病迅速蔓延，约七分之一的人死在海上。加纳的埃尔米纳城堡、塞内加尔戈雷岛上的“奴隶屋”曾是关押俘虏、等待装船的地方，如今是博物馆和纪念地。'],
    },
    {
      title: ['The cost to Africa', '非洲付出的代价'], cam: [2, 4, 2.6],
      paint: [{ fill: { k: 'land', a2: ['SN', 'GM', 'GW', 'GN', 'SL', 'LR', 'CI', 'GH', 'TG', 'BJ', 'NG', 'CM', 'GA', 'CG', 'CD', 'AO'], c: C.red }, t: 0.3, a: 0.35 }],
      marks: [mk([3, -4], 'Gold Coast', '黄金海岸', { t: 0.6 }), mk([5.5, 2.5], 'Slave Coast', '奴隶海岸', { c: C.red, t: 0.9 }), mk([-7, 15], 'Kongo and Angola', '刚果和安哥拉', { t: 1.2 })],
      body: ['About 12.5 million Africans were put on ships and about 10.7 million survived the crossing; millions more died in the wars and raids to capture them and on the march to the coast. The trade took away young, strong people, set African kingdoms against each other and brought guns. The coast of Togo, Benin and Nigeria was even called the Slave Coast. Britain banned the trade in 1807 and the USA in 1808, but slavery itself lasted in the USA until 1865 and in Brazil until 1888.',
        '约 1250 万非洲人被押上船，约 1070 万人活着到达美洲；还有数百万人死于抓捕奴隶的战争和袭击，或死在被押往海岸的路上。奴隶贸易夺走了年轻力壮的人口，挑起非洲各王国之间的争斗，并带来了枪支。多哥、贝宁和尼日利亚的海岸甚至被称为“奴隶海岸”。英国 1807 年、美国 1808 年禁止奴隶贸易，但奴隶制在美国一直延续到 1865 年，在巴西延续到 1888 年。'],
    },
  ],
  quiz: [
    mcq(['What was the middle passage?', '什么是中间航程？'], ['The voyage of enslaved Africans across the Atlantic', '被奴役的非洲人横渡大西洋的航程'],
      [['A trade road across the Sahara', '一条穿越撒哈拉的商路'], ['A canal between two rivers', '连接两条河的运河'], ['The route of Mansa Musa to Mecca', '曼萨·穆萨去麦加的路线']],
      ['It was the middle side of the triangular trade, from Africa to the Americas.', '它是三角贸易中间的一边，从非洲到美洲。'], ['middle passage', '中间航程']),
    mcq(['About how many Africans were forced onto ships in the Atlantic slave trade?', '在大西洋奴隶贸易中，约有多少非洲人被强行押上船？'], ['About 12.5 million', '约 1250 万'],
      [['About 12,000', '约 1.2 万'], ['About 125,000', '约 12.5 万'], ['About 1 billion', '约 10 亿']],
      ['Over about 350 years, around 12.5 million people were shipped; about 10.7 million survived the voyage.', '约 350 年间，约 1250 万人被运走，约 1070 万人在航程中幸存。'], ['Atlantic slave trade', '大西洋奴隶贸易']),
    mcq(['In the triangular trade, what was carried from the Americas back to Europe?', '在三角贸易中，从美洲运回欧洲的是什么？'], ['Sugar, cotton and tobacco', '糖、棉花和烟草'],
      [['Enslaved Africans', '被奴役的非洲人'], ['Guns and cloth', '枪支和布匹'], ['Salt and gold', '盐和黄金']],
      ['Plantation crops grown by enslaved people went to Europe; guns and cloth went from Europe to Africa.', '奴隶种植的作物运往欧洲；枪支和布匹从欧洲运往非洲。'], ['triangular trade', '三角贸易']),
    mcq(['Gorée Island, where captives were held before the voyage, is off the coast of which country?', '关押俘虏、等待装船的戈雷岛位于哪个国家的海岸外？'], ['Senegal', '塞内加尔'],
      [['Angola', '安哥拉'], ['Chad', '乍得'], ['Mali', '马里']],
      ['Gorée lies just off Dakar, Senegal; it is a UNESCO World Heritage Site.', '戈雷岛就在塞内加尔达喀尔外海，是世界文化遗产。'], ['Gorée Island', '戈雷岛']),
  ],
};

const FR = ['SN', 'MR', 'ML', 'NE', 'BF', 'GN', 'CI', 'BJ', 'TG', 'TD', 'CF', 'CG', 'GA', 'CM'];
const UK = ['NG', 'GH', 'SL', 'GM'];
const PT = ['AO', 'GW'];

export const COLONIAL_LESSON: Lesson = {
  id: 'ssbs-colonial', strand: 'world', tracks: [], unit, icon: 'flag', minutes: 9,
  title: ['Colonies, independence and unity', '殖民、独立与团结'],
  blurb: ['Imperialism and the scramble for Africa, then independence, Pan-Africanism and the African Union.', '帝国主义与瓜分非洲，随后的独立、泛非主义和非洲联盟。'],
  keys: [
    ['Imperialism: a strong nation takes control of other lands; colonialism: ruling a colony and using its resources.', '帝国主义：强国控制其他地区；殖民主义：统治殖民地并掠夺其资源。'],
    ['At the Berlin Conference (1884–85) European powers divided Africa among themselves.', '在柏林会议（1884–1885 年）上，欧洲列强瓜分了非洲。'],
    ['By 1914 only Liberia and Ethiopia were still independent.', '到 1914 年，只有利比里亚和埃塞俄比亚仍保持独立。'],
    ['Ghana led the way to independence in 1957; 17 countries became free in 1960.', '加纳于 1957 年率先独立；1960 年有 17 个国家独立。'],
    ['Pan-Africanism led to the OAU (1963), which became the African Union (2002).', '泛非主义促成了非洲统一组织（1963 年），它后来成为非洲联盟（2002 年）。'],
  ],
  steps: [
    {
      title: ['The scramble for Africa', '瓜分非洲'], cam: [5, 6, 2.6],
      paint: [
        { fill: { k: 'land', a2: FR, c: C.blue }, t: 0.3, a: 0.5 },
        { fill: { k: 'land', a2: UK, c: C.red }, t: 0.7, a: 0.55 },
        { fill: { k: 'land', a2: PT, c: C.green }, t: 1.1, a: 0.55 },
        { fill: { k: 'land', a2: ['CD'], c: C.gold }, t: 1.5, a: 0.55 },
        { fill: { k: 'land', a2: ['GQ'], c: C.orange }, t: 1.9, a: 0.7 },
        { fill: { k: 'land', a2: ['LR'], c: C.white }, t: 2.3, a: 0.6 },
      ],
      marks: [mk([16, 0], 'France', '法国', { big: true, c: C.blue, t: 0.5 }), mk([9.6, 8.1], 'Britain', '英国', { c: C.red, t: 0.9 }), mk([-12.3, 17.5], 'Portugal', '葡萄牙', { c: C.green, t: 1.3 }), mk([-2.9, 23.6], 'Belgium', '比利时', { c: C.gold, t: 1.7 }), mk([1.6, 10.4], 'Spain', '西班牙', { c: C.orange, t: 2.1 }), mk([6.4, -9.4], 'Liberia: free', '利比里亚：独立', { c: C.white, t: 2.5 })],
      body: ['In the late 1800s, European nations raced to grab land, raw materials and markets: this is imperialism. At the Berlin Conference of 1884–85 they agreed how to divide Africa, without a single African present. They drew borders with rulers on maps, cutting through peoples and kingdoms. In this region France took the most land; Britain took Nigeria, Ghana, Sierra Leone and the Gambia; Portugal took Angola, Guinea-Bissau, Cape Verde and São Tomé; Belgium took the Congo; Spain took Equatorial Guinea. Germany held Togo and Cameroon until the First World War. By 1914 only Liberia and Ethiopia were free.',
        '19 世纪末，欧洲国家争相抢夺土地、原料和市场，这就是帝国主义。1884–1885 年的柏林会议上，他们商定如何瓜分非洲，而会上没有一个非洲人。他们在地图上用直尺画边界，把民族和王国切开。在这一地区，法国占地最多；英国占有尼日利亚、加纳、塞拉利昂和冈比亚；葡萄牙占有安哥拉、几内亚比绍、佛得角和圣多美和普林西比；比利时占有刚果；西班牙占有赤道几内亚。德国在第一次世界大战前占有多哥和喀麦隆。到 1914 年，只有利比里亚和埃塞俄比亚保持独立。'],
    },
    {
      title: ['Colonial rule: the Congo', '殖民统治：以刚果为例'], cam: [-3, 22, 2.5],
      paint: [{ fill: { k: 'land', a2: ['CD'], c: C.gold }, t: 0.3, a: 0.5 }],
      marks: [mk([-2.9, 23.6], 'Congo Free State, 1885–1908', '刚果自由邦（1885–1908 年）', { big: true, c: C.gold, t: 0.6 })],
      body: ['Colonialism means ruling a colony and using its land, people and resources for the ruling country. The worst case was the Congo, which King Leopold II of Belgium owned as his private property from 1885. His agents forced villagers to collect wild rubber and punished them brutally when they fell short; millions died. After an outcry Belgium took over in 1908. Colonies built railways from mines to ports to ship out raw materials, and few schools; when Congo became independent in 1960 it had very few university graduates.',
        '殖民主义是指统治殖民地，利用那里的土地、人民和资源为宗主国服务。最残酷的例子是刚果：从 1885 年起，它是比利时国王利奥波德二世的私人财产。他的手下强迫村民采集野生橡胶，完不成任务就施以酷刑，数百万人因此死亡。在国际舆论谴责下，比利时政府于 1908 年接管。殖民者修铁路只是为了把矿产从矿山运到港口，学校却很少；1960 年刚果独立时，大学毕业生寥寥无几。'],
    },
    {
      title: ['Independence', '独立'], cam: [5, 6, 2.6],
      paint: [{ fill: { k: 'land', a2: ['GH'], c: C.gold }, t: 0.3, a: 0.7 }, { fill: { k: 'land', a2: ['SN', 'MR', 'ML', 'NE', 'BF', 'CI', 'BJ', 'TG', 'NG', 'TD', 'CF', 'CG', 'GA', 'CM', 'CD'], c: C.green }, t: 1.0, a: 0.4 }],
      marks: [mk([7.9, -1.0], 'Ghana 1957', '加纳 1957 年', { big: true, c: C.gold, t: 0.4 }), mk([10, 15], '1960: the Year of Africa', '1960 年：“非洲年”', { big: true, c: C.green, t: 1.2 })],
      body: ['After the Second World War, Africans demanded freedom. In 1957 the Gold Coast, led by Kwame Nkrumah, became independent as Ghana, the first colony south of the Sahara to break free from European rule in the post-war wave. 1960 was called the Year of Africa: 17 countries became independent, including Nigeria, the Congo and most French colonies. Portugal\'s colonies fought long wars and won independence only in 1974–75.',
        '第二次世界大战后，非洲人要求自由。1957 年，在恩克鲁玛领导下，黄金海岸独立为加纳，成为战后撒哈拉以南第一个摆脱欧洲统治的殖民地。1960 年被称为“非洲年”：有 17 个国家独立，包括尼日利亚、刚果和大部分法国殖民地。葡萄牙的殖民地经过长期战争，直到 1974–1975 年才获得独立。'],
    },
    {
      title: ['Pan-Africanism and the African Union', '泛非主义与非洲联盟'], cam: [5, 18, 3.2],
      paint: [{ fill: { k: 'continents', only: ['africa'] }, a: 0.45 }],
      marks: [mk([9.0, 38.75], 'Addis Ababa: AU headquarters', '亚的斯亚贝巴：非盟总部', { dot: true, big: true, t: 0.5 }), mk([5.6, -0.19], 'Accra: Nkrumah', '阿克拉：恩克鲁玛', { dot: true, t: 1.0 })],
      body: ['Pan-Africanism is the belief that Africans everywhere, on the continent and in the Americas and Europe, share a history and should unite. Thinkers such as W. E. B. Du Bois and Marcus Garvey spread it, and Kwame Nkrumah dreamed of a "United States of Africa". In 1963 independent states formed the Organisation of African Unity (OAU). In 2002 it became the African Union, which today has all 55 African states and its headquarters in Addis Ababa, Ethiopia. It works for peace, trade and development, and even sends peacekeepers.',
        '泛非主义认为，世界各地的非洲人（无论在非洲大陆，还是在美洲和欧洲）有共同的历史，应当团结起来。杜波依斯、加维等思想家传播了这一思想，恩克鲁玛梦想建立“非洲合众国”。1963 年，独立的非洲国家成立了非洲统一组织。2002 年，它改组为非洲联盟，如今有全部 55 个非洲国家，总部设在埃塞俄比亚的亚的斯亚贝巴，致力于和平、贸易与发展，还派出维和部队。'],
    },
  ],
  quiz: [
    mcq(['What was decided at the Berlin Conference of 1884–85?', '1884–1885 年的柏林会议决定了什么？'], ['How European powers would divide Africa', '欧洲列强如何瓜分非洲'],
      [['The end of the slave trade', '结束奴隶贸易'], ['Independence for Ghana', '加纳独立'], ['The founding of the African Union', '成立非洲联盟']],
      ['No African was invited; the borders drawn then still shape the map today.', '会议没有邀请任何非洲人，那时画下的边界至今仍影响着非洲地图。'], ['imperialism', '帝国主义']),
    mcq(['What is imperialism?', '什么是帝国主义？'], ['A powerful nation building an empire by taking control of other lands', '强国通过控制其他地区建立帝国'],
      [['People of African descent uniting', '非洲后裔团结起来'], ['Small loans to poor people', '给穷人的小额贷款'], ['Telling history through songs', '用歌谣讲述历史']],
      ['European imperialism in the late 1800s led to the scramble for Africa.', '19 世纪末的欧洲帝国主义导致了瓜分非洲。'], ['imperialism', '帝国主义']),
    mcq(['Which country in this region was never a European colony?', '这一地区哪个国家从未成为欧洲殖民地？'], ['Liberia', '利比里亚'],
      [['Ghana', '加纳'], ['Senegal', '塞内加尔'], ['Angola', '安哥拉']],
      ['Liberia was founded by freed slaves from the USA and has been independent since 1847.', '利比里亚由来自美国的获释奴隶建立，自 1847 年起一直独立。'], ['Liberia', '利比里亚']),
    mcq(['Which was the first colony south of the Sahara to win independence after the Second World War, in 1957?', '1957 年，二战后撒哈拉以南第一个获得独立的殖民地是哪个？'], ['Ghana', '加纳'],
      [['Nigeria', '尼日利亚'], ['Angola', '安哥拉'], ['Mali', '马里']],
      ['Led by Kwame Nkrumah, the Gold Coast became independent Ghana in 1957.', '在恩克鲁玛领导下，黄金海岸于 1957 年独立为加纳。'], ['independence', '独立']),
    mcq(['What is the African Union?', '非洲联盟是什么？'], ['An organisation of all 55 African states working for unity and peace', '由全部 55 个非洲国家组成、致力于团结与和平的组织'],
      [['A trade company from Europe', '一家欧洲贸易公司'], ['An old West African empire', '一个古代西非帝国'], ['A football league', '一个足球联赛']],
      ['Founded in 2002 to replace the OAU, it has its headquarters in Addis Ababa.', '它于 2002 年取代非洲统一组织成立，总部在亚的斯亚贝巴。'], ['African Union', '非洲联盟']),
    mcq(['What is Pan-Africanism?', '什么是泛非主义？'], ['The idea that all people of African descent should unite', '主张所有非洲后裔团结起来的思想'],
      [['Ruling another country\'s land', '统治别国的土地'], ['The spread of the desert', '沙漠的扩展'], ['Trading salt for gold', '用盐换黄金']],
      ['It inspired independence leaders like Kwame Nkrumah and led to the OAU and the African Union.', '它激励了恩克鲁玛等独立运动领袖，并促成了非洲统一组织和非洲联盟。'], ['Pan-Africanism', '泛非主义']),
  ],
};
