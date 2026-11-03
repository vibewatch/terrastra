export interface ProvincialCapital {
  code: string;
  en: string;
  zh: string;
  lat: number;
  lon: number;
}

export const CHINA_CAPITALS: readonly ProvincialCapital[] = [
  { code: 'CN-HE', en: 'Shijiazhuang', zh: '石家庄', lat: 38.0428, lon: 114.5149 },
  { code: 'CN-SX', en: 'Taiyuan', zh: '太原', lat: 37.8706, lon: 112.5489 },
  { code: 'CN-NM', en: 'Hohhot', zh: '呼和浩特', lat: 40.842, lon: 111.749 },
  { code: 'CN-LN', en: 'Shenyang', zh: '沈阳', lat: 41.8057, lon: 123.4315 },
  { code: 'CN-JL', en: 'Changchun', zh: '长春', lat: 43.8171, lon: 125.3235 },
  { code: 'CN-HL', en: 'Harbin', zh: '哈尔滨', lat: 45.8038, lon: 126.5349 },
  { code: 'CN-JS', en: 'Nanjing', zh: '南京', lat: 32.0603, lon: 118.7969 },
  { code: 'CN-ZJ', en: 'Hangzhou', zh: '杭州', lat: 30.2741, lon: 120.1551 },
  { code: 'CN-AH', en: 'Hefei', zh: '合肥', lat: 31.8206, lon: 117.2272 },
  { code: 'CN-FJ', en: 'Fuzhou', zh: '福州', lat: 26.0745, lon: 119.2965 },
  { code: 'CN-JX', en: 'Nanchang', zh: '南昌', lat: 28.682, lon: 115.8579 },
  { code: 'CN-SD', en: 'Jinan', zh: '济南', lat: 36.6512, lon: 117.1201 },
  { code: 'CN-HA', en: 'Zhengzhou', zh: '郑州', lat: 34.7473, lon: 113.6249 },
  { code: 'CN-HB', en: 'Wuhan', zh: '武汉', lat: 30.5928, lon: 114.3055 },
  { code: 'CN-HN', en: 'Changsha', zh: '长沙', lat: 28.2282, lon: 112.9388 },
  { code: 'CN-GD', en: 'Guangzhou', zh: '广州', lat: 23.1291, lon: 113.2644 },
  { code: 'CN-GX', en: 'Nanning', zh: '南宁', lat: 22.817, lon: 108.3669 },
  { code: 'CN-HI', en: 'Haikou', zh: '海口', lat: 20.044, lon: 110.1999 },
  { code: 'CN-SC', en: 'Chengdu', zh: '成都', lat: 30.5728, lon: 104.0668 },
  { code: 'CN-GZ', en: 'Guiyang', zh: '贵阳', lat: 26.647, lon: 106.6302 },
  { code: 'CN-YN', en: 'Kunming', zh: '昆明', lat: 25.0389, lon: 102.7183 },
  { code: 'CN-XZ', en: 'Lhasa', zh: '拉萨', lat: 29.652, lon: 91.172 },
  { code: 'CN-SN', en: "Xi'an", zh: '西安', lat: 34.3416, lon: 108.9398 },
  { code: 'CN-GS', en: 'Lanzhou', zh: '兰州', lat: 36.0611, lon: 103.8343 },
  { code: 'CN-QH', en: 'Xining', zh: '西宁', lat: 36.6171, lon: 101.7782 },
  { code: 'CN-NX', en: 'Yinchuan', zh: '银川', lat: 38.4872, lon: 106.2309 },
  { code: 'CN-XJ', en: 'Ürümqi', zh: '乌鲁木齐', lat: 43.8256, lon: 87.6168 },
  { code: 'CN-TW', en: 'Taipei', zh: '台北', lat: 25.033, lon: 121.5654 },
];

export const CHINA_CAPITAL_NAMES = new Set(CHINA_CAPITALS.map(city => city.en));
