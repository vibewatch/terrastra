import { describe, expect, it } from 'vitest';
import { searchAll, type SearchHit } from '../../src/client/lib/search.ts';
import { spaceIndex } from '../../src/client/solar/space-index.ts';
import { ALIASES } from '../../src/shared/data/aliases.ts';
import { CATALOGUE } from '../../src/shared/data/catalogue.ts';
import { GAZETTEER, GAZETTEER_BY_KEY, KEY_LESSON_OVERRIDES, relatedLessonsForPlace } from '../../src/shared/data/gazetteer.ts';
import { isRecentSearchEntry, matchedAlias, norm, parseCoordinateQuery, pushRecentSearch, type RecentSearchEntry } from '../../src/shared/lib/search.ts';

const space = spaceIndex();
const keyOf = (h: SearchHit) => h.kind === 'item' ? h.item.key : h.hit.key;

/** Queries real users type (kids, parents, teachers), with the object that should come up in the top 3. */
const QUERIES: [string, string][] = [
  ['M31', 'dp_m31'], ['m 42', 'dp_orion_nebula'], ['Messier 45', 'dp_pleiades'], ['M1', 'dp_crab_nebula'],
  ['NGC 224', 'dp_m31'], ['ngc5139', 'dp_omega_centauri'], ['M104', 'dp_sombrero_galaxy'], ['M51', 'dp_whirlpool_galaxy'],
  ['M87', 'dp_m87_black_hole'], ['创生之柱', 'dp_eagle_nebula'], ['仙女座', 'dp_m31'], ['Andromeda', 'dp_m31'],
  ['北极星', 'dp_polaris'], ['North Star', 'dp_polaris'], ['七姐妹', 'dp_pleiades'], ['银心', 'dp_sgr_a_star'],
  ['大爆炸', 'dp_cmb'], ['最近的恒星', 'dp_proxima_centauri'], ['织女', 'dp_vega'], ['大麦云', 'dp_lmc'],
  ['月亮', 'moon'], ['启明星', 'venus'], ['红色星球', 'mars'], ['Great Red Spot', 'jupiter'],
  ['嫦娥4号', 'ss_moon_change4'], ['嫦娥三号', 'ss_moon_change3'], ["chang'e 5", 'ss_moon_change5'], ['change 6', 'ss_moon_change6'],
  ['祝融', 'ss_mars_zhurong'], ['JWST', 'ss_earth_jwst'], ['韦伯', 'ss_earth_jwst'], ['阿波罗十一号', 'ss_moon_apollo11'],
  ['登月', 'ss_moon_apollo11'], ['阿姆斯特朗', 'pp_armstrong'], ['旅行者1号', 'ss_sun_voyager1'], ['Voyager', 'ss_sun_voyager1'],
  ['天眼', 'sp_fast'], ['故宫', 'forbidden'], ['珠峰', 'everest'], ['埃菲尔', 'eiffel'], ['eiffel tower', 'eiffel'],
  ['金字塔', 'pyramids'], ['复活节岛', 'moai'], ['天空之镜', 'uyuni'], ['东方明珠', 'cn_bund'], ['马里亚纳海沟', 'dc_challenger'],
  ['熊猫', 'an_panda'], ['大象', 'an_elephant'], ['T-Rex', 'dn_trex'], ['trex', 'dn_trex'], ['暴龙', 'dn_trex'],
  ['披萨', 'fd_pizza'], ['过年', 'fs_springfestival'], ['中秋', 'fs_midautumn'], ['月饼', 'fs_midautumn'], ['粽子', 'fs_dragonboat'],
  ['牛顿', 'pp_newton'], ['爱因斯坦', 'pp_einstein'], ['居里夫人', 'pp_curie'], ['达芬奇', 'pp_davinci'], ['唐僧', 'pp_xuanzang'],
  ['郑和', 'pp_zhenghe'], ['Galileo', 'pp_galileo'], ['杀人鲸', 'an_orca'], ['空间站', 'sp_iss'], ['ISS', 'sp_iss'],
  ['Mount Fuji', 'fuji'], ['tour eiffel', 'eiffel'], ['Machu Picchu', 'machupicchu'], ['Chichen Itza', 'chichenitza'],
];

describe('search', () => {
  it('normalises accents, spacing, catalogue numbers and Chinese numerals', () => {
    expect(norm('Chichén Itzá')).toBe(norm('chichen itza'));
    expect(norm('Messier 31')).toBe('m31');
    expect(norm('嫦娥三号')).toBe(norm('嫦娥3号'));
    expect(norm('阿波罗十一号')).toBe(norm('阿波罗11号'));
    expect(norm('土卫二十号')).toBe('土卫20号');
    expect(norm('十二门徒岩')).toBe('十二门徒岩');
  });

  it.each(QUERIES)('%s → %s in the top 3', (q, key) => {
    const top = searchAll(q, 'zh', space).slice(0, 3).map(keyOf);
    expect(top).toContain(key);
  });

  it('has a high hit rate on the whole query set', () => {
    const top1 = QUERIES.filter(([q, key]) => keyOf(searchAll(q, 'zh', space)[0]) === key).length;
    expect(top1 / QUERIES.length).toBeGreaterThan(0.85);
  });

  it('aliases point at real objects, and keys do not collide between levels', () => {
    const keys = new Set([...CATALOGUE.map(i => i.key), ...space.map(s => s.key)]);
    expect(keys.size).toBe(CATALOGUE.length + space.length);
    expect(Object.keys(ALIASES).filter(k => !keys.has(k))).toEqual([]);
  });

  it('labels every space result with its level', () => {
    const r = searchAll('M31', 'en', space).find(h => h.kind === 'space');
    expect(r?.kind === 'space' && r.hit.level.en).toBe('Local Group');
    expect(space.every(s => s.level.en && s.level.zh)).toBe(true);
  });

  it('keeps filters: a type filter hides space, the space filter hides the globe', () => {
    expect(searchAll('m', 'en', space, 'animal').every(h => h.kind === 'item' && h.item.type === 'animal')).toBe(true);
    expect(searchAll('', 'en', space, 'space').every(h => h.kind === 'space')).toBe(true);
    expect(searchAll('', 'en', space, 'space').length).toBe(space.length);
  });

  it('indexes countries, states/provinces, and Chinese provincial capitals when places are supplied', () => {
    const places = {
      countries: [
        { a2: 'CN', name: 'China', continent: 'AS', lat: 35, lon: 105, area: 900 },
        { a2: 'FR', name: 'France', continent: 'EU', lat: 46, lon: 2, area: 60 },
      ],
      regions: [
        { id: 'cn-sc', code: 'CN-SC', country: 'CN', name: 'Sichuan', zh: '四川省', lat: 30.6, lon: 102.7, area: 48 },
        { id: 'us-ca', code: 'US-CA', country: 'US', name: 'California', zh: '加利福尼亚', lat: 37.2, lon: -119.5, area: 42 },
      ],
    };
    const cnHits = searchAll('四川省', 'zh', space, 'all', places);
    expect(cnHits[0]).toMatchObject({ kind: 'place', hit: { key: 'state:CN-SC', placeKind: 'state', needsStates: true } });

    const stateHits = searchAll('California', 'en', space, 'all', places);
    expect(stateHits[0]).toMatchObject({ kind: 'place', hit: { key: 'state:US-CA', placeKind: 'state', needsStates: true } });

    const capHits = searchAll('成都', 'zh', space, 'all', places);
    expect(capHits.some(h => h.kind === 'place' && h.hit.placeKind === 'capital' && h.hit.name.zh === '成都' && h.hit.needsStates)).toBe(true);

    const countryHits = searchAll('France', 'en', space, 'all', places);
    expect(countryHits.some(h => h.kind === 'place' && h.hit.placeKind === 'country' && h.hit.key === 'country:FR' && !h.hit.needsStates)).toBe(true);
  });

  it('indexes textbook physical-geography gazetteer places in Chinese and English', () => {
    const geoQueries: [string, string][] = [
      ['地中海', 'geo:mediterranean-sea'],
      ['Mediterranean Sea', 'geo:mediterranean-sea'],
      ['马里亚纳海沟', 'geo:mariana-trench'],
      ['Mariana Trench', 'geo:mariana-trench'],
      ['安第斯山脉', 'geo:andes'],
      ['Andes', 'geo:andes'],
      ['青藏高原', 'geo:qinghai-tibet-plateau'],
      ['世界屋脊', 'geo:qinghai-tibet-plateau'],
      ['马六甲海峡', 'geo:strait-of-malacca'],
      ['撒哈拉沙漠', 'geo:sahara-desert'],
      ['亚马孙平原', 'geo:amazon-plain'],
      ['亚马逊平原', 'geo:amazon-plain'],
      ['秦岭', 'geo:qinling'],
      ['长江', 'geo:yangtze-river'],
      ['黄河', 'geo:yellow-river'],
      ['塔里木盆地', 'geo:tarim-basin'],
      ['苏伊士运河', 'geo:suez-canal'],
      ['东非大裂谷', 'geo:east-african-rift'],
      ['本初子午线', 'geo:prime-meridian'],
      ['北回归线', 'geo:tropic-of-cancer'],
    ];
    for (const [q, expected] of geoQueries) {
      const top = searchAll(q, 'zh', space).slice(0, 3).map(keyOf);
      expect(top, `expected ${expected} in top 3 for "${q}"`).toContain(expected);
    }

    // Searching 马里亚纳海沟 surfaces BOTH the Mariana Trench gazetteer entry AND Challenger Deep (with matched alias)
    const mariana = searchAll('马里亚纳海沟', 'zh', space);
    expect(keyOf(mariana[0])).toBe('geo:mariana-trench');
    const challenger = mariana.find(h => keyOf(h) === 'dc_challenger');
    expect(challenger).toBeDefined();
    expect(challenger?.alias).toBe('马里亚纳海沟');
  });

  it('validates gazetteer integrity, geo filter, matchedAlias, and deduplicated world cities', () => {
    const itemAndSpaceKeys = new Set([...CATALOGUE.map(i => i.key), ...space.map(s => s.key)]);
    const geoKeys = new Set(GAZETTEER.map(g => g.key));
    expect(geoKeys.size).toBe(GAZETTEER.length);
    expect(GAZETTEER_BY_KEY.size).toBe(GAZETTEER.length);
    for (const g of GAZETTEER) {
      expect(g.key.startsWith('geo:')).toBe(true);
      expect(itemAndSpaceKeys.has(g.key)).toBe(false);
      expect(g.lat).toBeGreaterThanOrEqual(-90);
      expect(g.lat).toBeLessThanOrEqual(90);
      expect(g.lon).toBeGreaterThanOrEqual(-180);
      expect(g.lon).toBeLessThanOrEqual(180);
      expect(g.h).toBeGreaterThan(0);
      expect(g.name.en.length).toBeGreaterThan(0);
      expect(g.name.zh.length).toBeGreaterThan(0);
      expect(g.desc.en.length).toBeGreaterThan(10);
      expect(g.desc.zh.length).toBeGreaterThan(6);
    }

    // 'geo' filter returns all gazetteer entries when query is empty, and only physical-geography places when queried
    const allGeo = searchAll('', 'zh', space, 'geo');
    expect(allGeo.length).toBe(GAZETTEER.length);
    expect(allGeo.every(h => h.kind === 'place' && h.hit.isGeo)).toBe(true);
    const filteredGeo = searchAll('海沟', 'zh', space, 'geo');
    expect(filteredGeo.length).toBeGreaterThan(0);
    expect(filteredGeo.every(h => h.kind === 'place' && h.hit.isGeo)).toBe(true);

    // matchedAlias only reports an alias when primary names did not match
    expect(matchedAlias('挑战者深渊', ['Challenger Deep', '挑战者深渊'], ['马里亚纳海沟'])).toBeUndefined();
    expect(matchedAlias('马里亚纳海沟', ['Challenger Deep', '挑战者深渊'], ['马里亚纳海沟', 'Mariana Trench'])).toBe('马里亚纳海沟');

    // World cities are indexed without duplicating Chinese provincial capitals
    const tokyo = searchAll('东京', 'zh', space);
    expect(tokyo.some(h => h.kind === 'place' && h.hit.placeKind === 'capital' && h.hit.key === 'city:tokyo')).toBe(true);
    const ny = searchAll('纽约', 'zh', space);
    expect(ny.some(h => h.kind === 'place' && h.hit.placeKind === 'city' && h.hit.key === 'city:newyork')).toBe(true);
    const chengdu = searchAll('成都', 'zh', space);
    const chengduPlaces = chengdu.filter(h => h.kind === 'place' && h.hit.name.zh === '成都');
    expect(chengduPlaces).toHaveLength(1);
    expect(chengduPlaces[0]?.kind === 'place' && chengduPlaces[0].hit.placeKind).toBe('capital');
  });

  it('resolves place deep-link keys and hit-tests rendered geo labels', async () => {
    const { resolvePlaceByKey } = await import('../../src/client/lib/search.ts');
    const { pickGeoLabel } = await import('../../src/client/globe/overlay.ts');

    const places = {
      countries: [{ id: '250', a2: 'FR', name: 'France', continent: 'europe', lat: 46.2, lon: 2.2, area: 64 }],
      regions: [{ id: 'cn-sc', code: 'CN-SC', country: 'CN', name: 'Sichuan', zh: '四川省', lat: 30.6, lon: 102.7, area: 48 }],
    } as Parameters<typeof resolvePlaceByKey>[1];

    expect(resolvePlaceByKey('geo:mariana-trench', places)?.name.zh).toBe('马里亚纳海沟');
    expect(resolvePlaceByKey('city:tokyo', places)?.name.zh).toBe('东京');
    expect(resolvePlaceByKey('capital:CN-SC', places)?.name.zh).toBe('成都');
    expect(resolvePlaceByKey('country:FR', places)?.placeKind).toBe('country');
    expect(resolvePlaceByKey('state:CN-SC', places)).toMatchObject({ placeKind: 'state', needsStates: true });
    expect(resolvePlaceByKey('geo:does-not-exist', places)).toBeNull();
    expect(resolvePlaceByKey('unknown:foo', places)).toBeNull();

    const hits = [
      { key: 'geo:andes', box: [100, 200, 180, 220] as [number, number, number, number] },
      { key: 'geo:amazon-plain', box: [182, 200, 260, 220] as [number, number, number, number] },
    ];
    expect(pickGeoLabel(hits, 140, 210)?.key).toBe('geo:andes');
    expect(pickGeoLabel(hits, 181, 210)?.key).toBe('geo:amazon-plain');
    expect(pickGeoLabel(hits, 50, 50)).toBeNull();
  });

  it('maps every gazetteer place and key override to valid curriculum lessons without importing lesson chunks', async () => {
    const { ALL_GEO_META } = await import('../../src/client/lessons/catalog.ts');
    const validGeoIds = new Set(ALL_GEO_META.map(m => m.id));

    for (const overrideKey of Object.keys(KEY_LESSON_OVERRIDES)) {
      expect(GAZETTEER_BY_KEY.has(overrideKey), `Unknown gazetteer key in KEY_LESSON_OVERRIDES: ${overrideKey}`).toBe(true);
    }
    for (const g of GAZETTEER) {
      const links = relatedLessonsForPlace(g.key, g.kind, g.region.en);
      expect(links.length, `Missing related lessons for ${g.key}`).toBeGreaterThanOrEqual(1);
      expect(links.length).toBeLessThanOrEqual(2);
      for (const l of links) {
        expect(validGeoIds.has(l.id), `Gazetteer ${g.key} points to unknown geography lesson "${l.id}"`).toBe(true);
        expect(l.title.en.length).toBeGreaterThan(0);
        expect(l.title.zh.length).toBeGreaterThan(0);
      }
    }
    expect(relatedLessonsForPlace('city:tokyo', 'capital', 'Japan')).toEqual([]);
  });

  it('validates, deduplicates, and caps recent search chips', () => {
    let list: RecentSearchEntry[] = [];
    list = pushRecentSearch(list, { kind: 'place', key: 'geo:mariana-trench', emoji: '🌊', name: { en: 'Mariana Trench', zh: '马里亚纳海沟' } });
    list = pushRecentSearch(list, { kind: 'item', key: 'eiffel', emoji: '🗼', name: { en: 'Eiffel Tower', zh: '埃菲尔铁塔' } });
    list = pushRecentSearch(list, { kind: 'space', key: 'localgroup/dp_m31', emoji: '🌌', name: { en: 'Andromeda Galaxy', zh: '仙女座星系' } });
    // Re-selecting Mariana Trench moves it to index 0 without duplicating
    list = pushRecentSearch(list, { kind: 'place', key: 'geo:mariana-trench', emoji: '🌊', name: { en: 'Mariana Trench', zh: '马里亚纳海沟' } });
    expect(list.map(e => e.key)).toEqual(['geo:mariana-trench', 'localgroup/dp_m31', 'eiffel']);
    expect(list.every(isRecentSearchEntry)).toBe(true);

    for (let i = 0; i < 10; i++) {
      list = pushRecentSearch(list, { kind: 'item', key: `item-${i}`, emoji: '📍', name: { en: `Item ${i}`, zh: `条目 ${i}` } });
    }
    expect(list).toHaveLength(6);
    expect(list[0]?.key).toBe('item-9');

    expect(isRecentSearchEntry(null)).toBe(false);
    expect(isRecentSearchEntry({ kind: 'item', key: '', emoji: '📍', name: { en: 'Empty' } })).toBe(false);
    expect(isRecentSearchEntry({ kind: 'unknown', key: 'x', emoji: '📍', name: { en: 'X', zh: 'X' } })).toBe(false);
  });

  it('parses decimal, DMS, and bilingual coordinate queries and resolves coord: deep-links', async () => {
    const { resolvePlaceByKey } = await import('../../src/client/lib/search.ts');
    expect(parseCoordinateQuery('35.68, 139.76')).toEqual({ lat: 35.68, lon: 139.76 });
    expect(parseCoordinateQuery('23°26′N 113°12′E')).toEqual({ lat: 23.4333, lon: 113.2 });
    expect(parseCoordinateQuery('南纬15.8度 西经69.3度')).toEqual({ lat: -15.8, lon: -69.3 });
    expect(parseCoordinateQuery('120°E, 30°N')).toEqual({ lat: 30, lon: 120 });
    expect(parseCoordinateQuery('M31')).toBeNull();
    expect(parseCoordinateQuery('95.0, 10.0')).toBeNull();

    const hits = searchAll('23.5°N, 113.2°E', 'zh', space);
    expect(hits[0]?.kind === 'place' && hits[0].hit.placeKind).toBe('coord');
    expect(hits[0]?.kind === 'place' && hits[0].hit.key).toBe('coord:23.5000,113.2000');

    const resolved = resolvePlaceByKey('coord:-15.0000,-170.0000');
    expect(resolved?.placeKind).toBe('coord');
    expect(resolved?.sub.en).toContain('Western Hemisphere');
    // 10°W is in the Eastern Hemisphere by the 20°W–160°E geography textbook rule!
    expect(resolvePlaceByKey('coord:40.0000,-10.0000')?.sub.en).toContain('Eastern Hemisphere');
  });

  it('supports Traditional Chinese queries, leading-zero catalogue numbers, multi-token queries, and country aliases', () => {
    expect(norm('馬里亞納海溝')).toBe(norm('马里亚纳海沟'));
    expect(norm('M031')).toBe('m31');
    expect(norm('NGC 0224')).toBe('ngc224');

    expect(keyOf(searchAll('馬里亞納海溝', 'zh', space)[0])).toBe('geo:mariana-trench');
    expect(keyOf(searchAll('安第斯山脈', 'zh', space)[0])).toBe('geo:andes');
    expect(keyOf(searchAll('Tower Eiffel', 'en', space)[0])).toBe('eiffel');
    expect(searchAll('雅典卫城', 'zh', space).slice(0, 3).map(keyOf)).toContain('parthenon');
    expect(searchAll('基尔运河', 'zh', space).slice(0, 3).map(keyOf)).toContain('geo:kiel-canal');

    const places = {
      countries: [
        { a2: 'GB', name: 'United Kingdom', continent: 'europe', lat: 54, lon: -2, area: 24 },
        { a2: 'US', name: 'United States', continent: 'north-america', lat: 39, lon: -98, area: 900 },
      ],
    } as Parameters<typeof searchAll>[4];
    expect(searchAll('UK', 'en', space, 'all', places).some(h => h.kind === 'place' && h.hit.key === 'country:GB')).toBe(true);
    expect(searchAll('USA', 'en', space, 'all', places).some(h => h.kind === 'place' && h.hit.key === 'country:US')).toBe(true);
  });

  it('supports 100-999 Chinese numerals, expanded Traditional Chinese, URI/parenthesized coords, city nicknames, and coord timezone facts', async () => {
    const { resolvePlaceByKey } = await import('../../src/client/lib/search.ts');

    // #121: 100-999 Chinese numerals & expanded Traditional Chinese + Caldwell leading-zero
    expect(norm('一百零五号')).toBe('105号');
    expect(norm('三百六十五号')).toBe('365号');
    expect(norm('Caldwell 014')).toBe('c14');
    expect(norm('愛因斯坦')).toBe(norm('爱因斯坦'));
    expect(norm('萬里長城')).toBe(norm('万里长城'));
    expect(norm('珠穆朗瑪峯')).toBe(norm('珠穆朗玛峰'));
    expect(keyOf(searchAll('愛因斯坦', 'zh', space)[0])).toBe('pp_einstein');

    // #122: parenthesized textbook coordinates, RFC 5870 geo: URIs, and Google Maps @lat,lon,z fragments
    expect(parseCoordinateQuery('(23.5°N, 113.2°E)')).toEqual({ lat: 23.5, lon: 113.2 });
    expect(parseCoordinateQuery('（北纬30度，东经120度）')).toEqual({ lat: 30, lon: 120 });
    expect(parseCoordinateQuery('geo:35.68,139.76?z=11')).toEqual({ lat: 35.68, lon: 139.76 });
    expect(parseCoordinateQuery('@48.8584,2.2945,17z')).toEqual({ lat: 48.8584, lon: 2.2945 });

    // #123: multi-token out-of-order alias surfacing
    const eagle = searchAll('Creation Pillars', 'en', space).find(h => keyOf(h) === 'dp_eagle_nebula');
    expect(eagle?.alias).toBe('Pillars of Creation');

    // #124: new Gaokao/curriculum gazetteer entries
    expect(keyOf(searchAll('巴塔哥尼亚沙漠', 'zh', space)[0])).toBe('geo:patagonian-desert');
    expect(keyOf(searchAll('马尾藻海', 'zh', space)[0])).toBe('geo:sargasso-sea');
    expect(keyOf(searchAll('珠江三角洲', 'zh', space)[0])).toBe('geo:pearl-river-delta');
    expect(keyOf(searchAll('马来半岛', 'zh', space)[0])).toBe('geo:malay-peninsula');
    expect(keyOf(searchAll('河西走廊', 'zh', space)[0])).toBe('geo:hexi-corridor');

    // #126: Chinese city historic nicknames & world city historical/abbreviation aliases
    expect(searchAll('海参崴', 'zh', space).some(h => h.kind === 'place' && h.hit.key === 'city:vladivostok' && h.alias === '海参崴')).toBe(true);
    expect(searchAll('羊城', 'zh', space).some(h => h.kind === 'place' && h.hit.key === 'capital:CN-GD' && h.alias === '羊城')).toBe(true);
    expect(searchAll('NYC', 'en', space).some(h => h.kind === 'place' && h.hit.key === 'city:newyork')).toBe(true);

    // #127 & #128: case-insensitive resolvePlaceByKey + fallback country lookup + coord latitude band & timezone fact
    expect(resolvePlaceByKey('GEO:MARIANA-TRENCH')?.key).toBe('geo:mariana-trench');
    expect(resolvePlaceByKey('city:New-York')?.key).toBe('city:newyork');
    expect(resolvePlaceByKey('country:jp')?.key).toBe('country:JP');
    const bjCoord = resolvePlaceByKey('coord:39.9000,116.4000');
    expect(bjCoord?.fact?.zh).toContain('中纬度地区');
    expect(bjCoord?.fact?.zh).toContain('东八区');
    expect(bjCoord?.fact?.en).toContain('Middle Latitudes');
    expect(bjCoord?.fact?.en).toContain('UTC+8');

    // #160: Messier catalogue M1–M110 aliases, 88 IAU constellations & spacecraft agency search
    expect(searchAll('M45', 'en', space).some(h => h.kind === 'space' && h.hit.key === 'dp_pleiades')).toBe(true);
    expect(searchAll('M1', 'en', space).some(h => h.kind === 'space' && h.hit.key === 'dp_crab_nebula')).toBe(true);
    expect(searchAll('猎户座', 'zh', space).some(h => h.kind === 'space' && h.hit.key === 'cst_ori' && h.hit.hash === 'solar/cst_ori')).toBe(true);
    expect(searchAll('Ursa Major', 'en', space).some(h => h.kind === 'space' && h.hit.key === 'cst_uma')).toBe(true);
    expect(searchAll('CNSA', 'en', space, 'space').length).toBeGreaterThanOrEqual(3);
  });
});
