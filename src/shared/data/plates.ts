// Simplified major tectonic plate boundaries for the globe overlay (hand-traced from general geography, not survey data).
export type BoundaryKind = 'ridge' | 'trench' | 'collision' | 'transform' | 'rift';

export interface PlateBoundary {
  name: string;
  nameZh: string;
  kind: BoundaryKind;
  /** Representative relative plate motion rate in mm/yr along this boundary. */
  rateMmYr?: number;
  /** [lat, lon] polyline; consecutive points are joined along great circles */
  pts: [number, number][];
}

export const BOUNDARY_COLORS: Record<BoundaryKind, string> = {
  ridge: '#fb923c',
  trench: '#ef4444',
  collision: '#f59e0b',
  rift: '#facc15',
  transform: '#fda4af',
};

export const PLATE_BOUNDARIES: PlateBoundary[] = [
  // ---------- Atlantic & Arctic ----------
  { name: 'Gakkel Ridge', nameZh: '加克尔海岭（北冰洋中脊）', kind: 'ridge', rateMmYr: 11, pts: [[79.5, 125], [83, 115], [85.5, 90], [86, 60], [84, 20], [81.5, -3], [80, 2], [78.5, 7], [76, 8], [73.5, 8], [72, 2], [71, -7], [69, -16], [67, -18.5]] },
  { name: 'Mid-Atlantic Ridge', nameZh: '大西洋中脊', kind: 'ridge', rateMmYr: 25, pts: [
    [67, -18.5], [65, -17], [64, -19], [63.6, -22.5], [62, -25], [59, -30], [56, -34], [53, -35], [52.5, -31], [50, -29], [47, -27.5],
    [45, -28], [43, -29], [40, -29.5], [38.5, -30], [37, -33], [35, -35], [33, -38], [30, -42], [27, -44], [24, -45.5], [21, -45.5],
    [18, -46.5], [15, -45], [12, -44.5], [10, -41], [7, -35], [4, -31], [1, -27], [0, -20], [-1, -15], [-3, -12.5], [-6, -11.5],
    [-10, -13], [-14, -14], [-18, -13], [-22, -12.5], [-26, -13.5], [-30, -13.5], [-34, -15], [-38, -17], [-42, -16], [-46, -13.5],
    [-50, -8], [-53, -2], [-54.5, 1]] },
  { name: 'American–Antarctic Ridge', nameZh: '美洲—南极海岭', kind: 'ridge', rateMmYr: 18, pts: [[-54.5, 1], [-55.5, -5], [-57, -12], [-59, -18], [-60, -24]] },
  { name: 'South Sandwich Trench', nameZh: '南桑威奇海沟', kind: 'trench', rateMmYr: 70, pts: [[-55, -28], [-56.5, -26], [-58, -25.5], [-59.5, -26], [-60.5, -28]] },
  { name: 'Puerto Rico & Lesser Antilles Trench', nameZh: '波多黎各—小安的列斯海沟', kind: 'trench', rateMmYr: 20, pts: [[19.8, -68], [19.9, -66], [19.8, -64], [18.5, -62.5], [16, -59.5], [13, -58.5], [11, -60]] },
  { name: 'Cayman & El Pilar faults', nameZh: '开曼转换断层带', kind: 'transform', rateMmYr: 19, pts: [[15.5, -88.5], [16.5, -85], [17.5, -82], [18.5, -79], [19.5, -76], [20, -73], [19.8, -68]] },
  { name: 'El Pilar Fault', nameZh: '埃尔皮拉尔断层', kind: 'transform', rateMmYr: 20, pts: [[11, -60], [10.6, -62], [10.6, -64], [10.8, -67], [11, -69.5]] },

  // ---------- Pacific Ring of Fire ----------
  { name: 'Aleutian Trench', nameZh: '阿留申海沟', kind: 'trench', rateMmYr: 65, pts: [[59.5, -146], [58.5, -149], [57.5, -151], [56.5, -153.5], [55.5, -156], [54.6, -158.5], [54, -160],
    [53.3, -163], [52.8, -165], [52.2, -167.5], [51.6, -170], [51.2, -172.5], [51, -175], [50.9, -177.5], [50.8, -180], [50.9, 177.5],
    [51, 175], [51.4, 172.5], [51.8, 170], [52.4, 167.5], [53, 165], [54, 163]] },
  { name: 'Kuril–Kamchatka & Japan Trench', nameZh: '千岛—堪察加与日本海沟', kind: 'trench', rateMmYr: 83, pts: [[56, 163.5], [54, 162.5], [52, 160], [50, 158], [47.5, 155], [45, 151],
    [43, 148], [41.5, 145], [40, 144.3], [38, 144], [36, 142.5], [34.5, 141.8]] },
  { name: 'Izu–Bonin–Mariana Trench', nameZh: '伊势—小笠原—马里亚纳海沟', kind: 'trench', rateMmYr: 45, pts: [[34.5, 141.8], [32, 141.5], [29, 142.5], [26, 143], [24, 143.5], [21, 146],
    [18, 147.8], [15, 147.5], [12.5, 146], [11.5, 143], [11, 140.5], [10, 138]] },
  { name: 'Nankai & Ryukyu Trench', nameZh: '南海海槽—琉球海沟', kind: 'trench', rateMmYr: 58, pts: [[35, 138.5], [33.5, 136.5], [32.5, 134], [31, 132], [29, 130.5], [27, 129.5],
    [25, 127.5], [24, 124.5], [23.5, 122.5]] },
  { name: 'Manila Trench', nameZh: '马尼拉海沟', kind: 'trench', rateMmYr: 80, pts: [[22, 120.3], [20.5, 120], [18, 119.4], [15.5, 119.3], [13.5, 120]] },
  { name: 'Philippine Trench', nameZh: '菲律宾海沟', kind: 'trench', rateMmYr: 85, pts: [[14, 125], [12, 126.3], [9.5, 127], [7, 127.2], [5, 127.5], [3, 128]] },
  { name: 'Sunda (Java) Trench', nameZh: '巽他（爪哇）海沟', kind: 'trench', rateMmYr: 65, pts: [[15.5, 94.5], [12, 92.5], [9, 92.5], [6, 93.8], [3.5, 94.5], [1, 96.2], [-2, 98.5],
    [-5, 101], [-8, 105], [-10, 110], [-11, 115], [-11, 120], [-10.5, 124]] },
  { name: 'Banda Arc', nameZh: '班达弧碰撞带', kind: 'collision', rateMmYr: 72, pts: [[-10.5, 124], [-9.5, 128], [-8, 131], [-6, 132], [-4.5, 131], [-3, 129]] },
  { name: 'New Britain & Solomon Trench', nameZh: '新不列颠—所罗门海沟', kind: 'trench', rateMmYr: 95, pts: [[-6, 148], [-6.5, 151], [-7, 154], [-8, 156], [-10, 159.5], [-11.5, 162]] },
  { name: 'New Hebrides Trench', nameZh: '新赫布里底海沟', kind: 'trench', rateMmYr: 88, pts: [[-11, 165.5], [-13, 166], [-15.5, 166.5], [-18, 168], [-20.5, 169.5], [-22.5, 171]] },
  { name: 'Tonga–Kermadec & Hikurangi Trench', nameZh: '汤加—克马德克海沟', kind: 'trench', rateMmYr: 160, pts: [[-15, -173], [-17, -172.5], [-19.5, -173], [-22, -174.5], [-25, -175.5],
    [-28, -176.5], [-31, -177.3], [-34, -178.5], [-37, -179.8], [-39, 178.8], [-40.5, 177.5], [-41.8, 175.5]] },
  { name: 'Alpine Fault', nameZh: '新西兰南阿尔卑斯断层', kind: 'transform', rateMmYr: 38, pts: [[-41.8, 174.2], [-42.5, 172], [-43.3, 170.3], [-44.2, 168.5], [-45.3, 166.8]] },
  { name: 'Puysegur Trench & Macquarie Ridge', nameZh: '普伊斯哥海沟—麦夸里海岭', kind: 'transform', rateMmYr: 34, pts: [[-45.3, 166.8], [-47, 165.6], [-49, 164.5], [-51, 162],
    [-53, 159.5], [-56, 158.5], [-58.5, 159], [-61, 161]] },
  { name: 'Peru–Chile Trench', nameZh: '秘鲁—智利海沟', kind: 'trench', rateMmYr: 68, pts: [[5, -79], [2, -79.5], [-1, -81.5], [-4, -82], [-8, -80.5], [-12, -78.5], [-15, -76],
    [-18, -72], [-20, -71], [-24, -71], [-28, -71.8], [-32, -72.5], [-36, -74], [-40, -75], [-44, -76], [-46.5, -75.8], [-49, -76.2], [-52, -75.5]] },
  { name: 'Middle America Trench', nameZh: '中美洲海沟', kind: 'trench', rateMmYr: 62, pts: [[21, -106], [18.5, -104.5], [16.5, -100], [15, -96.5], [14, -93], [12.5, -90],
    [11, -87.5], [9.5, -86], [8, -84]] },
  { name: 'Cascadia Subduction Zone', nameZh: '卡斯卡迪亚俯冲带', kind: 'trench', rateMmYr: 40, pts: [[40.3, -124.6], [42, -124.8], [44, -125], [46, -125], [48, -125.8], [50, -127.5], [51, -129]] },

  // ---------- Pacific & Southern Ocean ridges ----------
  { name: 'East Pacific Rise', nameZh: '东太平洋海隆', kind: 'ridge', rateMmYr: 140, pts: [[-36, -110], [-30, -112], [-25, -114], [-20, -113], [-15, -112.5], [-10, -110], [-5, -106],
    [0, -102], [2, -102], [5, -104], [9, -104], [12, -104], [15, -105], [18, -106], [21, -108], [23, -109]] },
  { name: 'Gulf of California Rift', nameZh: '加利福尼亚湾裂谷', kind: 'rift', rateMmYr: 48, pts: [[23, -109], [25, -110], [27, -111.5], [29, -113], [31, -114.5], [32.5, -115.5]] },
  { name: 'San Andreas Fault', nameZh: '圣安德烈亚斯断层', kind: 'transform', rateMmYr: 46, pts: [[32.5, -115.5], [33.5, -116.5], [34.3, -117.5], [34.8, -118.8], [35.3, -119.8],
    [35.8, -120.5], [36.5, -121.2], [37, -121.8], [37.7, -122.4], [38.3, -122.9], [39.5, -123.8], [40.3, -124.4]] },
  { name: 'Juan de Fuca Ridge', nameZh: '胡安·德富卡海岭', kind: 'ridge', rateMmYr: 56, pts: [[40.5, -126], [42, -127], [44.5, -129.8], [46, -129.5], [47.5, -129], [49, -129.5], [50.5, -130.5]] },
  { name: 'Galápagos Rift', nameZh: '加拉帕戈斯裂谷海岭', kind: 'ridge', rateMmYr: 55, pts: [[2, -102], [2.2, -98], [2, -95], [1.5, -90], [1.3, -87], [1.5, -84]] },
  { name: 'Chile Rise', nameZh: '智利海岭', kind: 'ridge', rateMmYr: 58, pts: [[-36, -110], [-36.5, -105], [-38, -100], [-40, -92], [-43, -84], [-45, -79], [-46.5, -75.8]] },
  { name: 'Pacific–Antarctic Ridge', nameZh: '太平洋—南极海岭', kind: 'ridge', rateMmYr: 75, pts: [[-36, -110], [-40, -111.5], [-45, -112], [-50, -116], [-54, -122], [-56, -130],
    [-57, -140], [-59, -148], [-62, -157], [-64, -167], [-65, -178], [-64, 172], [-62.5, 165], [-61, 161]] },

  // ---------- Indian Ocean ridges ----------
  { name: 'Southwest Indian Ridge', nameZh: '西南印度洋中脊', kind: 'ridge', rateMmYr: 14, pts: [[-54.5, 1], [-54, 9], [-52.5, 16], [-50, 25], [-47, 32], [-44, 38], [-42, 44],
    [-39, 50], [-35, 55], [-31, 59], [-27, 63], [-25.5, 70]] },
  { name: 'Central Indian & Carlsberg Ridge', nameZh: '中印度洋—卡尔斯伯格海岭', kind: 'ridge', rateMmYr: 36, pts: [[-25.5, 70], [-20, 67], [-15, 66.5], [-10, 67], [-5, 68], [-1, 67],
    [3, 63], [6, 61], [9, 58], [11.5, 57], [13, 52], [12.3, 47], [12.2, 44.5], [11.8, 43.2]] },
  { name: 'Southeast Indian Ridge', nameZh: '东南印度洋中脊', kind: 'ridge', rateMmYr: 70, pts: [[-25.5, 70], [-30, 76], [-35, 78], [-40, 80], [-43, 85], [-46, 92], [-48, 100],
    [-50, 110], [-50, 120], [-50.5, 130], [-53, 140], [-56, 148], [-59, 154], [-61, 161]] },

  // ---------- Africa, Red Sea & Middle East ----------
  { name: 'Red Sea Rift', nameZh: '红海裂谷扩张带', kind: 'ridge', rateMmYr: 16, pts: [[12.5, 43.3], [15, 41.8], [17.5, 40], [20, 38.5], [22.5, 37.5], [25, 35.8], [27.5, 34.2], [28.5, 34.6], [29.5, 35]] },
  { name: 'Dead Sea Transform', nameZh: '死海转换断层', kind: 'transform', rateMmYr: 5, pts: [[29.5, 35], [31, 35.5], [33, 35.6], [35, 36], [36.5, 36.2]] },
  { name: 'East African Rift (eastern branch)', nameZh: '东非大裂谷（东支）', kind: 'rift', rateMmYr: 6, pts: [[11.8, 42.5], [9.5, 40.5], [7, 38.5], [4.5, 37], [2, 36.2], [0, 36],
    [-2.5, 36], [-5, 35.8], [-8, 33.5], [-10, 34.2], [-12, 34.4], [-14.5, 35.2], [-17, 35.5], [-19, 35]] },
  { name: 'East African Rift (western branch)', nameZh: '东非大裂谷（西支）', kind: 'rift', rateMmYr: 4, pts: [[2.5, 31], [0.5, 30], [-1.5, 29], [-3.5, 29.2], [-6, 29.6], [-8, 30.8], [-9, 32.5]] },

  // ---------- Alpine–Himalayan & Asian Intracontinental belt ----------
  { name: 'Azores–Gibraltar Fault', nameZh: '亚速尔—直布罗陀断层', kind: 'transform', rateMmYr: 5, pts: [[38.5, -30], [38.2, -26], [37.2, -20], [36.5, -12], [36, -6]] },
  { name: 'Africa–Europe Collision', nameZh: '非欧板块地中海碰撞带', kind: 'collision', rateMmYr: 8, pts: [[36, -6], [35.3, -3], [36, 0], [36.6, 3.5], [37, 7], [37.4, 10.5], [38, 13],
    [38.3, 15.6], [40, 16.5], [42, 14.5], [44, 11.5], [45.5, 8], [46.5, 10], [47, 13], [47.5, 16]] },
  { name: 'Dinarides', nameZh: '迪纳拉褶皱碰撞带', kind: 'collision', rateMmYr: 6, pts: [[46, 14.5], [45, 16], [43, 18], [41, 20], [39.5, 20.5]] },
  { name: 'Hellenic Arc', nameZh: '爱琴海（希腊）俯冲弧', kind: 'trench', rateMmYr: 35, pts: [[39.5, 20.2], [38, 20.5], [36.5, 21.5], [35, 23], [34.6, 25], [35, 27], [36, 28.5]] },
  { name: 'North Anatolian Fault', nameZh: '北安纳托利亚断层', kind: 'transform', rateMmYr: 24, pts: [[40.6, 26.5], [40.8, 29.5], [40.7, 32], [41, 34], [40.5, 37], [39.7, 39.5], [39.3, 41]] },
  { name: 'Zagros & Bitlis Collision', nameZh: '扎格罗斯碰撞造山带', kind: 'collision', rateMmYr: 22, pts: [[36.5, 36.2], [37.5, 38], [38, 40], [38, 42.5], [37, 44.5], [35.5, 45.8],
    [34, 47], [32.5, 48.5], [30.5, 50.5], [28.5, 52.5], [27.2, 55.5], [26.5, 57]] },
  { name: 'Makran Trench', nameZh: '马克兰海沟', kind: 'trench', rateMmYr: 32, pts: [[26.5, 57], [25.3, 58], [24.8, 61], [24.8, 64], [25.2, 66.5]] },
  { name: 'Chaman Fault', nameZh: '查曼转换断层', kind: 'transform', rateMmYr: 26, pts: [[25.2, 66.5], [28, 66.6], [30.5, 66.8], [33, 68.5], [34.5, 71]] },
  { name: 'Himalaya', nameZh: '喜马拉雅碰撞造山带', kind: 'collision', rateMmYr: 45, pts: [[34.5, 71], [35.5, 73], [35.5, 74.5], [34.5, 76.5], [32.5, 78], [30.5, 80], [29, 82],
    [28, 84], [27.5, 86.5], [27, 89], [27.5, 92], [28, 95], [27.5, 96.5]] },
  { name: 'Indo-Burman Ranges', nameZh: '印缅山脉碰撞带', kind: 'collision', rateMmYr: 36, pts: [[27.5, 96.5], [26, 95], [23.5, 94], [21, 93.5], [18, 94], [15.5, 94.5]] },
  { name: 'Longmenshan & Xianshuihe Fault', nameZh: '龙门山—鲜水河断裂带', kind: 'collision', rateMmYr: 10, pts: [[32.8, 105.2], [31.5, 103.8], [30.1, 102.0], [28.0, 102.2], [25.5, 102.8]] },
  { name: 'Baikal Rift', nameZh: '贝加尔裂谷带', kind: 'rift', rateMmYr: 4, pts: [[51.5, 103.8], [52.8, 106.5], [54.2, 108.8], [55.8, 109.8]] },
];
