import { describe, expect, it } from 'vitest';
import { searchAll, type SearchHit } from '../../src/client/lib/search.ts';
import { spaceIndex } from '../../src/client/solar/space-index.ts';
import { ALIASES } from '../../src/shared/data/aliases.ts';
import { CATALOGUE } from '../../src/shared/data/catalogue.ts';
import { norm } from '../../src/shared/lib/search.ts';

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
});
