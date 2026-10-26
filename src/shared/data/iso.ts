// ISO 3166-1 numeric -> [alpha-2, continent] for the Natural Earth 1:110m and 1:50m country sets (world-atlas).
// Entries without an ISO numeric code in the source (N. Cyprus, Somaliland, Kosovo) are keyed by English name.
export type Continent = 'africa' | 'europe' | 'asia' | 'north-america' | 'south-america' | 'oceania' | 'antarctica';

const T = 'africa', E = 'europe', A = 'asia', N = 'north-america', S = 'south-america', O = 'oceania', Q = 'antarctica';

export const ISO: Record<string, [string, Continent]> = {
  '242': ['FJ', O], '834': ['TZ', T], '732': ['EH', T], '124': ['CA', N], '840': ['US', N], '398': ['KZ', A], '860': ['UZ', A],
  '598': ['PG', O], '360': ['ID', A], '032': ['AR', S], '152': ['CL', S], '180': ['CD', T], '706': ['SO', T], '404': ['KE', T],
  '729': ['SD', T], '148': ['TD', T], '332': ['HT', N], '214': ['DO', N], '643': ['RU', E], '044': ['BS', N], '238': ['FK', S],
  '578': ['NO', E], '304': ['GL', N], '260': ['TF', Q], '626': ['TL', A], '710': ['ZA', T], '426': ['LS', T], '484': ['MX', N],
  '858': ['UY', S], '076': ['BR', S], '068': ['BO', S], '604': ['PE', S], '170': ['CO', S], '591': ['PA', N], '188': ['CR', N],
  '558': ['NI', N], '340': ['HN', N], '222': ['SV', N], '320': ['GT', N], '084': ['BZ', N], '862': ['VE', S], '328': ['GY', S],
  '740': ['SR', S], '250': ['FR', E], '218': ['EC', S], '630': ['PR', N], '388': ['JM', N], '192': ['CU', N], '716': ['ZW', T],
  '072': ['BW', T], '516': ['NA', T], '686': ['SN', T], '466': ['ML', T], '478': ['MR', T], '204': ['BJ', T], '562': ['NE', T],
  '566': ['NG', T], '120': ['CM', T], '768': ['TG', T], '288': ['GH', T], '384': ['CI', T], '324': ['GN', T], '624': ['GW', T],
  '430': ['LR', T], '694': ['SL', T], '854': ['BF', T], '140': ['CF', T], '178': ['CG', T], '266': ['GA', T], '226': ['GQ', T],
  '894': ['ZM', T], '454': ['MW', T], '508': ['MZ', T], '748': ['SZ', T], '024': ['AO', T], '108': ['BI', T], '376': ['IL', A],
  '422': ['LB', A], '450': ['MG', T], '275': ['PS', A], '270': ['GM', T], '788': ['TN', T], '012': ['DZ', T], '400': ['JO', A],
  '784': ['AE', A], '634': ['QA', A], '414': ['KW', A], '368': ['IQ', A], '512': ['OM', A], '548': ['VU', O], '116': ['KH', A],
  '764': ['TH', A], '418': ['LA', A], '104': ['MM', A], '704': ['VN', A], '408': ['KP', A], '410': ['KR', A], '496': ['MN', A],
  '356': ['IN', A], '050': ['BD', A], '064': ['BT', A], '524': ['NP', A], '586': ['PK', A], '004': ['AF', A], '762': ['TJ', A],
  '417': ['KG', A], '795': ['TM', A], '364': ['IR', A], '760': ['SY', A], '051': ['AM', A], '752': ['SE', E], '112': ['BY', E],
  '804': ['UA', E], '616': ['PL', E], '040': ['AT', E], '348': ['HU', E], '498': ['MD', E], '642': ['RO', E], '440': ['LT', E],
  '428': ['LV', E], '233': ['EE', E], '276': ['DE', E], '100': ['BG', E], '300': ['GR', E], '792': ['TR', A], '008': ['AL', E],
  '191': ['HR', E], '756': ['CH', E], '442': ['LU', E], '056': ['BE', E], '528': ['NL', E], '620': ['PT', E], '724': ['ES', E],
  '372': ['IE', E], '540': ['NC', O], '090': ['SB', O], '554': ['NZ', O], '036': ['AU', O], '144': ['LK', A], '156': ['CN', A],
  '158': ['TW', A], '380': ['IT', E], '208': ['DK', E], '826': ['GB', E], '352': ['IS', E], '031': ['AZ', A], '268': ['GE', A],
  '608': ['PH', A], '458': ['MY', A], '096': ['BN', A], '705': ['SI', E], '246': ['FI', E], '703': ['SK', E], '203': ['CZ', E],
  '232': ['ER', T], '392': ['JP', A], '600': ['PY', S], '887': ['YE', A], '682': ['SA', A], '010': ['AQ', Q], '196': ['CY', E],
  '504': ['MA', T], '818': ['EG', T], '434': ['LY', T], '231': ['ET', T], '262': ['DJ', T], '800': ['UG', T], '646': ['RW', T],
  '070': ['BA', E], '807': ['MK', E], '688': ['RS', E], '499': ['ME', E], '780': ['TT', N], '728': ['SS', T],
  // only in the 1:50m set (small states and territories)
  '336': ['VA', E], '583': ['FM', O], '584': ['MH', O], '580': ['MP', O], '850': ['VI', N], '316': ['GU', O], '016': ['AS', O],
  '239': ['GS', S], '086': ['IO', A], '654': ['SH', T], '612': ['PN', O], '660': ['AI', N], '136': ['KY', N], '060': ['BM', N],
  '092': ['VG', N], '796': ['TC', N], '500': ['MS', N], '832': ['JE', E], '831': ['GG', E], '833': ['IM', E], '776': ['TO', O],
  '702': ['SG', A], '690': ['SC', T], '678': ['ST', T], '674': ['SM', E], '882': ['WS', O], '670': ['VC', N], '662': ['LC', N],
  '659': ['KN', N], '585': ['PW', O], '570': ['NU', O], '184': ['CK', O], '533': ['AW', N], '531': ['CW', N], '520': ['NR', O],
  '492': ['MC', E], '480': ['MU', T], '470': ['MT', E], '462': ['MV', A], '438': ['LI', E], '296': ['KI', O], '308': ['GD', N],
  '666': ['PM', N], '876': ['WF', O], '663': ['MF', N], '652': ['BL', N], '258': ['PF', O], '248': ['AX', E], '212': ['DM', N],
  '234': ['FO', E], '174': ['KM', T], '446': ['MO', A], '344': ['HK', A], '132': ['CV', T], '052': ['BB', N], '048': ['BH', A],
  '334': ['HM', Q], '574': ['NF', O], '028': ['AG', N], '020': ['AD', E], '534': ['SX', N],
  'N. Cyprus': ['CY', E], 'Somaliland': ['SO', T], 'Kosovo': ['XK', E],
};

export const CONTINENT_NAMES: Record<Continent | 'ocean', Record<'en' | 'zh', string>> = {
  africa: { en: 'Africa', zh: '非洲' },
  europe: { en: 'Europe', zh: '欧洲' },
  asia: { en: 'Asia', zh: '亚洲' },
  'north-america': { en: 'North America', zh: '北美洲' },
  'south-america': { en: 'South America', zh: '南美洲' },
  oceania: { en: 'Oceania', zh: '大洋洲' },
  antarctica: { en: 'Antarctica', zh: '南极洲' },
  ocean: { en: 'The ocean', zh: '海洋' },
};
