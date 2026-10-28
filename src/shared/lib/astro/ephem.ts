/**
 * Time scales and geocentric ephemerides (Meeus, "Astronomical Algorithms", 2nd ed.). All public functions take UTC
 * milliseconds (UT1 ≈ UTC) and return degrees / km. Sun: truncated VSOP87D (ch.25 "higher accuracy", ~1″). Moon:
 * ch.47 with the full periodic tables (~10″). Planets: JPL Keplerian elements via `orbits.ts` (~arcminute).
 */
import { BODY } from '../../data/solar.ts';
import { keplerPosition } from '../orbits.ts';
import type { GeoPoint, TopoSunMoon, Vec3 } from './types.ts';

export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;
export const EARTH_KM = 6378.137;
export const SUN_KM = 696_000;
/** Moon radius in Earth equatorial radii (IAU mean). */
export const MOON_K = 0.2725076;
export const AU_KM = 149_597_870.7;
/** Polar / equatorial radius of the Earth (1 − f). */
export const EARTH_B = 0.99664719;

const norm360 = (x: number) => ((x % 360) + 360) % 360;
export const norm180 = (x: number) => norm360(x + 180) - 180;

// ---------------------------------------------------------------------------------------------- time scales

const jd = (ms: number) => ms / 864e5 + 2440587.5;

/** Espenak–Meeus ΔT polynomial at decimal year `y` (with a smooth extrapolation from observed values after 2005). */
function deltaTYear(y: number): number {
  const em = (y: number) => {
    const u = (y - 1820) / 100;
    if (y < -500 || y >= 2150) return -20 + 32 * u * u;
    if (y >= 2050) return -20 + 32 * u * u - 0.5628 * (2150 - y);
    let t: number;
    if (y < 500) { t = y / 100; return 10583.6 + t * (-1014.41 + t * (33.78311 + t * (-5.952053 + t * (-0.1798452 + t * (0.022174192 + t * 0.0090316521))))); }
    if (y < 1600) { t = (y - 1000) / 100; return 1574.2 + t * (-556.01 + t * (71.23472 + t * (0.319781 + t * (-0.8503463 + t * (-0.005050998 + t * 0.0083572073))))); }
    if (y < 1700) { t = y - 1600; return 120 - 0.9808 * t - 0.01532 * t * t + t ** 3 / 7129; }
    if (y < 1800) { t = y - 1700; return 8.83 + t * (0.1603 + t * (-0.0059285 + t * (0.00013336 - t / 1174000))); }
    if (y < 1860) { t = y - 1800; return 13.72 + t * (-0.332447 + t * (0.0068612 + t * (0.0041116 + t * (-0.00037436 + t * (0.0000121272 + t * (-0.0000001699 + t * 0.000000000875)))))); }
    if (y < 1900) { t = y - 1860; return 7.62 + t * (0.5737 + t * (-0.251754 + t * (0.01680668 + t * (-0.0004473624 + t / 233174)))); }
    if (y < 1920) { t = y - 1900; return -2.79 + t * (1.494119 + t * (-0.0598939 + t * (0.0061966 - 0.000197 * t))); }
    if (y < 1941) { t = y - 1920; return 21.2 + t * (0.84493 + t * (-0.0761 + t * 0.0020936)); }
    if (y < 1961) { t = y - 1950; return 29.07 + t * (0.407 + t * (-1 / 233 + t / 2547)); }
    if (y < 1986) { t = y - 1975; return 45.45 + t * (1.067 + t * (-1 / 260 - t / 718)); }
    t = y - 2000; return 63.86 + t * (0.3345 + t * (-0.060374 + t * (0.0017275 + t * (0.000651814 + t * 0.00002373599))));
  };
  if (y < 2005 || y >= 2100) return em(y);
  if (y < 2025) {
    const i = Math.min(DT_OBS.length - 2, Math.floor((y - 2005) / 2)), f = (y - 2005 - 2 * i) / 2;
    return DT_OBS[i] + (DT_OBS[i + 1] - DT_OBS[i]) * f;
  }
  // Recent ΔT is nearly flat; bend parabolically toward the long-term Espenak–Meeus curve by 2100.
  const f = (y - 2025) / 75, end = DT_OBS[DT_OBS.length - 1];
  return end + (em(2100) - end) * f * f;
}
/** Observed ΔT (s) every 2 years, 2005–2025 (IERS). */
const DT_OBS = [64.69, 65.15, 65.78, 66.32, 66.91, 67.64, 68.59, 69.22, 69.36, 69.20, 69.13];

/** ΔT = TT − UT in seconds. */
export const deltaT = (ms: number) => deltaTYear(2000 + (jd(ms) - 2451545) / 365.25);
/** Julian Ephemeris Day (TT). */
const jde = (ms: number) => jd(ms) + deltaT(ms) / 86400;
/** Julian centuries of TT since J2000.0. */
export const centuries = (ms: number) => (jde(ms) - 2451545) / 36525;

// ------------------------------------------------------------------------------------- nutation & sidereal time

interface Frame { ms: number; T: number; dPsi: number; dEps: number; eps: number; gast: number }
let lastFrame: Frame = { ms: NaN, T: 0, dPsi: 0, dEps: 0, eps: 0, gast: 0 };

/** Per-instant quantities shared by every ephemeris (memoised for the last instant: the client asks every frame). */
function frame(ms: number): Frame {
  if (lastFrame.ms === ms) return lastFrame;
  const T = centuries(ms);
  const om = (125.04452 - 1934.136261 * T + 0.0020708 * T * T + T ** 3 / 450000) * D2R;
  const L = (280.4665 + 36000.7698 * T) * D2R, Lm = (218.3165 + 481267.8813 * T) * D2R;
  const dPsi = (-17.2 * Math.sin(om) - 1.32 * Math.sin(2 * L) - 0.23 * Math.sin(2 * Lm) + 0.21 * Math.sin(2 * om)) / 3600;
  const dEps = (9.2 * Math.cos(om) + 0.57 * Math.cos(2 * L) + 0.1 * Math.cos(2 * Lm) - 0.09 * Math.cos(2 * om)) / 3600;
  const eps0 = 23.4392911111 + (-46.815 * T - 0.00059 * T * T + 0.001813 * T ** 3) / 3600;
  const eps = eps0 + dEps;
  const d = jd(ms) - 2451545, Tu = d / 36525;
  const gmst = norm360(280.46061837 + 360.98564736629 * d + 0.000387933 * Tu * Tu - Tu ** 3 / 38710000);
  return (lastFrame = { ms, T, dPsi, dEps, eps, gast: norm360(gmst + dPsi * Math.cos(eps * D2R)) });
}

/** True obliquity of the ecliptic (degrees). */
export const obliquity = (ms: number) => frame(ms).eps;
/** Greenwich mean sidereal time (degrees). */
export const gmst = (ms: number) => { const f = frame(ms); return norm360(f.gast - f.dPsi * Math.cos(f.eps * D2R)); };
/** Greenwich apparent sidereal time (degrees). */
export const gast = (ms: number) => frame(ms).gast;

/** Ecliptic (of date) → equatorial, degrees. */
function eclToEq(lon: number, lat: number, eps: number): { ra: number; dec: number } {
  const l = lon * D2R, b = lat * D2R, e = eps * D2R, sl = Math.sin(l), cb = Math.cos(b), sb = Math.sin(b);
  return { ra: norm360(Math.atan2(sl * cb * Math.cos(e) - sb * Math.sin(e), Math.cos(l) * cb) * R2D), dec: Math.asin(sb * Math.cos(e) + cb * Math.sin(e) * sl) * R2D };
}
/** Unit (or `r`-scaled) vector from RA/Dec in degrees. */
export function radec(ra: number, dec: number, r = 1): Vec3 {
  const a = ra * D2R, d = dec * D2R, c = Math.cos(d) * r;
  return [c * Math.cos(a), c * Math.sin(a), Math.sin(d) * r];
}

// ------------------------------------------------------------------------------------------------------ Sun

const EL = [
  [175347046, 0.00000, 0.00000, 3341656, 4.66926, 6283.07585, 34894, 4.62610, 12566.15170, 3497, 2.74412, 5753.38488, 3418, 2.82887, 3.52312, 3136, 3.62767, 77713.77147, 2676, 4.41808, 7860.41939, 2343, 6.13516, 3930.20970, 1324, 0.74246, 11506.76977, 1273, 2.03710, 529.69097, 1199, 1.10963, 1577.34354, 990, 5.23268, 5884.92685, 902, 2.04505, 26.29832, 857, 3.50849, 398.14900, 780, 1.17883, 5223.69392, 753, 2.53339, 5507.55324, 505, 4.58293, 18849.22755, 492, 4.20507, 775.52261, 357, 2.91954, 0.06731, 317, 5.84902, 11790.62909, 284, 1.89869, 796.29801, 271, 0.31489, 10977.07880, 243, 0.34481, 5486.77784, 206, 4.80647, 2544.31442, 205, 1.86948, 5573.14280, 202, 2.45768, 6069.77675, 156, 0.83306, 213.29910, 132, 3.41118, 2942.46342, 126, 1.08303, 20.77540, 115, 0.64545, 0.98032, 103, 0.63600, 4694.00295, 102, 0.97569, 15720.83878, 102, 4.26680, 7.11355, 99, 6.20993, 2146.16542, 98, 0.68101, 155.42040, 86, 5.98323, 161000.68574, 85, 1.29871, 6275.96230, 85, 3.67080, 71430.69562, 80, 1.80791, 17260.15465, 79, 3.03698, 12036.46073, 75, 1.75509, 5088.62884, 74, 3.50319, 3154.68708, 74, 4.67927, 801.82093, 70, 0.83298, 9437.76293, 62, 3.97764, 8827.39027, 61, 1.81840, 7084.89678, 57, 2.78430, 6286.59897, 56, 4.38695, 14143.49524, 56, 3.47006, 6279.55273, 52, 0.18915, 12139.55351, 52, 1.33283, 1748.01641, 51, 0.28307, 5856.47766, 49, 0.48735, 1194.44701, 41, 5.36817, 8429.24127, 41, 2.39851, 19651.04848, 39, 6.16833, 10447.38784, 37, 6.04134, 10213.28555, 37, 2.56955, 1059.38193, 36, 1.70876, 2352.86615, 36, 1.77597, 6812.76682, 33, 0.59309, 17789.84562, 30, 0.44294, 83996.84732, 30, 2.73975, 1349.86741, 25, 3.16471, 4690.47984],
  [628331966747, 0.00000, 0.00000, 206059, 2.67823, 6283.07585, 4303, 2.63513, 12566.15170, 425, 1.59047, 3.52312, 119, 5.79557, 26.29832, 109, 2.96618, 1577.34354, 93, 2.59213, 18849.22755, 72, 1.13846, 529.69097, 68, 1.87472, 398.14900, 67, 4.40918, 5507.55324, 59, 2.88797, 5223.69392, 56, 2.17472, 155.42040, 45, 0.39803, 796.29801, 36, 0.46625, 775.52261, 29, 2.64707, 7.11355, 21, 5.34138, 0.98032, 19, 1.84628, 5486.77784, 19, 4.96855, 213.29910, 17, 2.99117, 6275.96230, 16, 0.03216, 2544.31442, 16, 1.43049, 2146.16542, 15, 1.20532, 10977.07880, 12, 2.83432, 1748.01641, 12, 3.25805, 5088.62884, 12, 5.27380, 1194.44701, 12, 2.07502, 4694.00295, 11, 0.76614, 553.56940, 10, 1.30263, 6286.59897, 10, 4.23925, 1349.86741, 9, 2.69957, 242.72860, 9, 5.64476, 951.71841, 8, 5.30063, 2352.86615, 6, 2.65034, 9437.76293, 6, 4.66633, 4690.47984],
  [52919, 0.00000, 0.00000, 8720, 1.07210, 6283.07585, 309, 0.86729, 12566.15170, 27, 0.05298, 3.52312, 16, 5.18827, 26.29832, 16, 3.68458, 155.42040, 10, 0.75742, 18849.22755, 9, 2.05705, 77713.77147, 7, 0.82673, 775.52261, 5, 4.66285, 1577.34354, 4, 1.03057, 7.11355, 4, 3.44051, 5573.14280, 3, 5.14075, 796.29801, 3, 6.05292, 5507.55324, 3, 1.19247, 242.72860, 3, 6.11653, 529.69097, 3, 0.30638, 398.14900, 3, 2.27993, 553.56940, 2, 4.38119, 5223.69392, 2, 3.75435, 0.98032],
  [289, 5.84384, 6283.07585, 35, 0.00000, 0.00000, 17, 5.48767, 12566.15170, 3, 5.19577, 155.42040, 1, 4.72200, 3.52312, 1, 5.30046, 18849.22755, 1, 5.96926, 242.72860],
  [114, 3.14159, 0.00000, 8, 4.13447, 6283.07585, 1, 3.83804, 12566.15170],
  [1, 3.14159, 0.00000],
];
const EB = [
  [280, 3.19870, 84334.66158, 102, 5.42249, 5507.55324, 80, 3.88013, 5223.69392, 44, 3.70445, 2352.86615, 32, 4.00026, 1577.34354],
  [9, 3.89729, 5507.55324, 6, 1.73039, 5223.69392],
];
const ER = [
  [100013989, 0.00000, 0.00000, 1670700, 3.09846, 6283.07585, 13956, 3.05525, 12566.15170, 3084, 5.19847, 77713.77147, 1628, 1.17388, 5753.38488, 1576, 2.84685, 7860.41939, 925, 5.45292, 11506.76977, 542, 4.56409, 3930.20970, 472, 3.66100, 5884.92685, 346, 0.96369, 5507.55324, 329, 5.89984, 5223.69392, 307, 0.29867, 5573.14280, 243, 4.27350, 11790.62909, 212, 5.84715, 1577.34354, 186, 5.02194, 10977.07880, 175, 3.01194, 18849.22755, 110, 5.05511, 5486.77784, 98, 0.88681, 6069.77675, 86, 5.68960, 15720.83878, 86, 1.27084, 161000.68574, 65, 0.27251, 17260.15465, 63, 0.92177, 529.69097, 57, 2.01374, 83996.84732, 56, 5.24160, 71430.69562, 49, 3.24501, 2544.31442, 47, 2.57805, 775.52261, 45, 5.53716, 9437.76293, 43, 6.01110, 6275.96230, 39, 5.36072, 4694.00295, 38, 2.39255, 8827.39027, 37, 0.82953, 19651.04848, 37, 4.90108, 12139.55351, 36, 1.67468, 12036.46073, 35, 1.84271, 2942.46342, 33, 0.24370, 7084.89678, 32, 0.18368, 5088.62884, 32, 1.77776, 398.14900, 28, 1.21345, 6286.59897, 28, 1.89934, 6279.55273, 26, 4.58897, 10447.38784],
  [103019, 1.10749, 6283.07585, 1721, 1.06442, 12566.15170, 702, 3.14159, 0.00000, 32, 1.02169, 18849.22755, 31, 2.84354, 5507.55324, 25, 1.31907, 5223.69392, 18, 1.42430, 1577.34354, 10, 5.91378, 10977.07880, 9, 1.42047, 6275.96230, 9, 0.27146, 5486.77784],
  [4359, 5.78455, 6283.07585, 124, 5.57935, 12566.15170, 12, 3.14159, 0.00000, 9, 3.62778, 77713.77147, 6, 1.86959, 5573.14280, 3, 5.47028, 18849.22755],
  [145, 4.27319, 6283.07585, 7, 3.91698, 12566.15170],
  [4, 2.56384, 6283.07585],
];

function vsop(series: number[][], tau: number): number {
  let s = 0, tp = 1;
  for (const ser of series) {
    let a = 0;
    for (let i = 0; i < ser.length; i += 3) a += ser[i] * Math.cos(ser[i + 1] + ser[i + 2] * tau);
    s += a * tp; tp *= tau;
  }
  return s / 1e8;
}

/** Heliocentric ecliptic-of-date position of the Earth: L, B (rad), R (AU). */
let lastLBR = { T: NaN, v: [0, 0, 0] as [number, number, number] };
function earthLBR(T: number): [number, number, number] {
  if (lastLBR.T !== T) { const tau = T / 10; lastLBR = { T, v: [vsop(EL, tau), vsop(EB, tau), vsop(ER, tau)] }; }
  return lastLBR.v;
}

interface Geo { lon: number; lat: number; distKm: number; ra: number; dec: number }
let lastSun: Geo & { ms: number } = { ms: NaN, lon: 0, lat: 0, distKm: 0, ra: 0, dec: 0 };

/** Apparent geocentric Sun (ecliptic & equatorial of date). */
export function sunGeo(ms: number): Geo {
  if (lastSun.ms === ms) return lastSun;
  const f = frame(ms), [L, B, R] = earthLBR(f.T);
  let lon = L * R2D + 180, lat = -B * R2D;
  const lp = (lon - 1.397 * f.T - 0.00031 * f.T * f.T) * D2R;
  lat += (0.03916 * (Math.cos(lp) - Math.sin(lp))) / 3600;
  lon = norm360(lon + f.dPsi + (-0.09033 - 20.4898 / R) / 3600);
  lastSun = { ms, lon, lat, distKm: R * AU_KM, ...eclToEq(lon, lat, f.eps) };
  return lastSun;
}

// ----------------------------------------------------------------------------------------------------- Moon

/** Meeus table 47.A: D, M, M′, F, Σl (1e-6°), Σr (1e-3 km). */
const MOON_LR = [
  0, 0, 1, 0, 6288774, -20905355, 2, 0, -1, 0, 1274027, -3699111, 2, 0, 0, 0, 658314, -2955968,
  0, 0, 2, 0, 213618, -569925, 0, 1, 0, 0, -185116, 48888, 0, 0, 0, 2, -114332, -3149,
  2, 0, -2, 0, 58793, 246158, 2, -1, -1, 0, 57066, -152138, 2, 0, 1, 0, 53322, -170733,
  2, -1, 0, 0, 45758, -204586, 0, 1, -1, 0, -40923, -129620, 1, 0, 0, 0, -34720, 108743,
  0, 1, 1, 0, -30383, 104755, 2, 0, 0, -2, 15327, 10321, 0, 0, 1, 2, -12528, 0,
  0, 0, 1, -2, 10980, 79661, 4, 0, -1, 0, 10675, -34782, 0, 0, 3, 0, 10034, -23210,
  4, 0, -2, 0, 8548, -21636, 2, 1, -1, 0, -7888, 24208, 2, 1, 0, 0, -6766, 30824,
  1, 0, -1, 0, -5163, -8379, 1, 1, 0, 0, 4987, -16675, 2, -1, 1, 0, 4036, -12831,
  2, 0, 2, 0, 3994, -10445, 4, 0, 0, 0, 3861, -11650, 2, 0, -3, 0, 3665, 14403,
  0, 1, -2, 0, -2689, -7003, 2, 0, -1, 2, -2602, 0, 2, -1, -2, 0, 2390, 10056,
  1, 0, 1, 0, -2348, 6322, 2, -2, 0, 0, 2236, -9884, 0, 1, 2, 0, -2120, 5751,
  0, 2, 0, 0, -2069, 0, 2, -2, -1, 0, 2048, -4950, 2, 0, 1, -2, -1773, 4130,
  2, 0, 0, 2, -1595, 0, 4, -1, -1, 0, 1215, -3958, 0, 0, 2, 2, -1110, 0,
  3, 0, -1, 0, -892, 3258, 2, 1, 1, 0, -810, 2616, 4, -1, -2, 0, 759, -1897,
  0, 2, -1, 0, -713, -2117, 2, 2, -1, 0, -700, 2354, 2, 1, -2, 0, 691, 0,
  2, -1, 0, -2, 596, 0, 4, 0, 1, 0, 549, -1423, 0, 0, 4, 0, 537, -1117,
  4, -1, 0, 0, 520, -1571, 1, 0, -2, 0, -487, -1739, 2, 1, 0, -2, -399, 0,
  0, 0, 2, -2, -381, -4421, 1, 1, 1, 0, 351, 0, 3, 0, -2, 0, -340, 0,
  4, 0, -3, 0, 330, 0, 2, -1, 2, 0, 327, 0, 0, 2, 1, 0, -323, 1165,
  1, 1, -1, 0, 299, 0, 2, 0, 3, 0, 294, 0, 2, 0, -1, -2, 0, 8752,
];
/** Meeus table 47.B: D, M, M′, F, Σb (1e-6°). */
const MOON_B = [
  0, 0, 0, 1, 5128122, 0, 0, 1, 1, 280602, 0, 0, 1, -1, 277693, 2, 0, 0, -1, 173237,
  2, 0, -1, 1, 55413, 2, 0, -1, -1, 46271, 2, 0, 0, 1, 32573, 0, 0, 2, 1, 17198,
  2, 0, 1, -1, 9266, 0, 0, 2, -1, 8822, 2, -1, 0, -1, 8216, 2, 0, -2, -1, 4324,
  2, 0, 1, 1, 4200, 2, 1, 0, -1, -3359, 2, -1, -1, 1, 2463, 2, -1, 0, 1, 2211,
  2, -1, -1, -1, 2065, 0, 1, -1, -1, -1870, 4, 0, -1, -1, 1828, 0, 1, 0, 1, -1794,
  0, 0, 0, 3, -1749, 0, 1, -1, 1, -1565, 1, 0, 0, 1, -1491, 0, 1, 1, 1, -1475,
  0, 1, 1, -1, -1410, 0, 1, 0, -1, -1344, 1, 0, 0, -1, -1335, 0, 0, 3, 1, 1107,
  4, 0, 0, -1, 1021, 4, 0, -1, 1, 833, 0, 0, 1, -3, 777, 4, 0, -2, 1, 671,
  2, 0, 0, -3, 607, 2, 0, 2, -1, 596, 2, -1, 1, -1, 491, 2, 0, -2, 1, -451,
  0, 0, 3, -1, 439, 2, 0, 2, 1, 422, 2, 0, -3, -1, 421, 2, 1, -1, 1, -366,
  2, 1, 0, 1, -351, 4, 0, 0, 1, 331, 2, -1, 1, 1, 315, 2, -2, 0, -1, 302,
  0, 0, 1, 3, -283, 2, 1, 1, -1, -229, 1, 1, 0, -1, 223, 1, 1, 0, 1, 223,
  0, 1, -2, -1, -220, 2, 1, -1, -1, -220, 1, 0, 1, 1, -185, 2, -1, -2, -1, 181,
  0, 1, 2, 1, -177, 4, 0, -2, -1, 176, 4, -1, -1, -1, 166, 1, 0, 1, -1, -164,
  4, 0, 1, -1, 132, 1, 0, -1, -1, -119, 4, -1, 0, -1, 115, 2, -2, 0, 1, 107,
];

let lastMoon: Geo & { ms: number } = { ms: NaN, lon: 0, lat: 0, distKm: 0, ra: 0, dec: 0 };

/** Moon's mean elongation D, argument of latitude F and mean anomalies (degrees), from TT centuries. */
export function lunarArgs(T: number) {
  return {
    Lp: 218.3164477 + T * (481267.88123421 + T * (-0.0015786 + T * (1 / 538841 - T / 65194000))),
    D: 297.8501921 + T * (445267.1114034 + T * (-0.0018819 + T * (1 / 545868 - T / 113065000))),
    M: 357.5291092 + T * (35999.0502909 + T * (-0.0001536 + T / 24490000)),
    Mp: 134.9633964 + T * (477198.8675055 + T * (0.0087414 + T * (1 / 69699 - T / 14712000))),
    F: 93.272095 + T * (483202.0175233 + T * (-0.0036539 + T * (-1 / 3526000 + T / 863310000))),
  };
}

/** Geometric ecliptic-of-date Moon (no nutation): λ, β (deg), Δ (km), at TT centuries `T`. */
function moonMeeus(T: number): [number, number, number] {
  const { Lp, D, M, Mp, F } = lunarArgs(T);
  const E = 1 - T * (0.002516 + 0.0000074 * T), E2 = E * E;
  const d = D * D2R, m = M * D2R, mp = Mp * D2R, f = F * D2R, lp = Lp * D2R;
  let sl = 0, sr = 0, sb = 0;
  for (let i = 0; i < MOON_LR.length; i += 6) {
    const am = MOON_LR[i + 1], e = am === 0 ? 1 : am === 1 || am === -1 ? E : E2;
    const arg = MOON_LR[i] * d + am * m + MOON_LR[i + 2] * mp + MOON_LR[i + 3] * f;
    sl += MOON_LR[i + 4] * e * Math.sin(arg);
    sr += MOON_LR[i + 5] * e * Math.cos(arg);
  }
  for (let i = 0; i < MOON_B.length; i += 5) {
    const am = MOON_B[i + 1], e = am === 0 ? 1 : am === 1 || am === -1 ? E : E2;
    sb += MOON_B[i + 4] * e * Math.sin(MOON_B[i] * d + am * m + MOON_B[i + 2] * mp + MOON_B[i + 3] * f);
  }
  const a1 = (119.75 + 131.849 * T) * D2R, a2 = (53.09 + 479264.29 * T) * D2R, a3 = (313.45 + 481266.484 * T) * D2R;
  sl += 3958 * Math.sin(a1) + 1962 * Math.sin(lp - f) + 318 * Math.sin(a2);
  sb += -2235 * Math.sin(lp) + 382 * Math.sin(a3) + 175 * Math.sin(a1 - f) + 175 * Math.sin(a1 + f) + 127 * Math.sin(lp - mp) - 115 * Math.sin(lp + mp);
  return [norm360(Lp + sl / 1e6), sb / 1e6, 385000.56 + sr / 1000];
}

/** Apparent geocentric Moon (ecliptic & equatorial of date). */
export function moonGeo(ms: number): Geo {
  if (lastMoon.ms === ms) return lastMoon;
  const f = frame(ms), [l, lat, distKm] = moonMeeus(f.T), lon = norm360(l + f.dPsi);
  lastMoon = { ms, lon, lat, distKm, ...eclToEq(lon, lat, f.eps) };
  return lastMoon;
}

// --------------------------------------------------------------------------------------------- Earth-fixed

/** Geocentric vector (km) in the equatorial frame of date. */
export const eqVec = (g: Geo): Vec3 => radec(g.ra, g.dec, g.distKm);
/** Equatorial-of-date → Earth-fixed (rotate by −GAST). */
export function toEcef(v: Vec3, gastDeg: number): Vec3 {
  const t = gastDeg * D2R, c = Math.cos(t), s = Math.sin(t);
  return [c * v[0] + s * v[1], -s * v[0] + c * v[1], v[2]];
}
/** Earth-fixed → equatorial of date. */
export function fromEcef(v: Vec3, gastDeg: number): Vec3 {
  const t = gastDeg * D2R, c = Math.cos(t), s = Math.sin(t);
  return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]];
}
/** Geocentric Sun in the Earth-fixed frame (km). */
export const sunEcef = (ms: number): Vec3 => toEcef(eqVec(sunGeo(ms)), gast(ms));
/** Geocentric Moon in the Earth-fixed frame (km). */
export const moonEcef = (ms: number): Vec3 => toEcef(eqVec(moonGeo(ms)), gast(ms));

/** Observer's geocentric position (km) in the Earth-fixed frame, on the WGS84-ish ellipsoid at sea level. */
function observerEcef(obs: GeoPoint): Vec3 {
  const phi = obs.lat * D2R, u = Math.atan(EARTH_B * Math.tan(phi)), l = obs.lon * D2R;
  const rc = Math.cos(u) * EARTH_KM, rs = EARTH_B * Math.sin(u) * EARTH_KM;
  return [rc * Math.cos(l), rc * Math.sin(l), rs];
}
/** Geodetic lat/lon of an Earth-fixed point (any scale) lying on the ellipsoid. */
export function ecefToGeo(v: Vec3): GeoPoint {
  return { lat: Math.atan2(v[2], EARTH_B * EARTH_B * Math.hypot(v[0], v[1])) * R2D, lon: norm180(Math.atan2(v[1], v[0]) * R2D) };
}

const angle = (a: Vec3, b: Vec3) => {
  const c: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return Math.atan2(Math.hypot(c[0], c[1], c[2]), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) * R2D;
};
export { angle as angleBetween };

/** The Sun and Moon as seen from `obs` (topocentric, no refraction). */
export function topocentric(ms: number, obs: GeoPoint): TopoSunMoon {
  const th = gast(ms), o = fromEcef(observerEcef(obs), th);
  const s0 = eqVec(sunGeo(ms)), m0 = eqVec(moonGeo(ms));
  const s: Vec3 = [s0[0] - o[0], s0[1] - o[1], s0[2] - o[2]], m: Vec3 = [m0[0] - o[0], m0[1] - o[1], m0[2] - o[2]];
  const lst = (th + obs.lon) * D2R, phi = obs.lat * D2R, cl = Math.cos(lst), sl = Math.sin(lst), cp = Math.cos(phi), sp = Math.sin(phi);
  const horiz = (v: Vec3, r: number) => {
    const e = -sl * v[0] + cl * v[1], n = -sp * cl * v[0] - sp * sl * v[1] + cp * v[2], u = cp * cl * v[0] + cp * sl * v[1] + sp * v[2];
    return { alt: Math.asin(u / r) * R2D, az: norm360(Math.atan2(e, n) * R2D) };
  };
  const ds = Math.hypot(s[0], s[1], s[2]), dm = Math.hypot(m[0], m[1], m[2]);
  const as = Math.atan2(s[1], s[0]), dS = Math.asin(s[2] / ds), am = Math.atan2(m[1], m[0]), dM = Math.asin(m[2] / dm);
  const da = am - as, H = lst - as;
  return {
    sun: { ...horiz(s, ds), radius: Math.asin(SUN_KM / ds) * R2D, distKm: ds },
    moon: { ...horiz(m, dm), radius: Math.asin((MOON_K * EARTH_KM) / dm) * R2D, distKm: dm },
    sep: angle(s, m),
    pa: norm360(Math.atan2(Math.cos(dM) * Math.sin(da), Math.cos(dS) * Math.sin(dM) - Math.sin(dS) * Math.cos(dM) * Math.cos(da)) * R2D),
    parallactic: Math.atan2(Math.sin(H), Math.tan(phi) * Math.cos(dS) - Math.sin(dS) * Math.cos(H)) * R2D,
  };
}

// ---------------------------------------------------------------------------------------------- Moon phase

/** Elongation of the Moon from the Sun in ecliptic longitude, 0..360 (0 new, 180 full). */
const moonElong = (ms: number) => norm360(moonGeo(ms).lon - sunGeo(ms).lon);

/** Next instant at or after `ms` when the Moon–Sun longitude difference equals `phase` (0 new, 90 first quarter, 180 full, 270 last quarter). */
export function nextPhase(ms: number, phase: number): number {
  let t = ms + (norm360(phase - moonElong(ms)) / 12.190749) * 864e5;
  for (let i = 0; i < 8; i++) {
    const r = (moonElong(t + 18e5) - moonElong(t - 18e5) + 720) % 360 / 36e5, dt = norm180(phase - moonElong(t)) / r;
    t += dt;
    if (Math.abs(dt) < 100) break;
  }
  return t;
}
/** Previous instant at or before `ms` with the given phase. */
const prevPhase = (ms: number, phase: number) => { const t = nextPhase(ms - 30 * 864e5, phase), n = nextPhase(t + 25 * 864e5, phase); return n <= ms + 1 ? n : t; };

/** Phase angle (Sun–Moon–Earth, deg), illuminated fraction, waxing flag and age since new moon. */
export function moonPhase(ms: number): { phaseAngle: number; illumination: number; waxing: boolean; ageDays: number } {
  const s = sunGeo(ms), m = moonGeo(ms);
  const psi = Math.acos(Math.cos(m.lat * D2R) * Math.cos((m.lon - s.lon) * D2R));
  const i = Math.atan2(s.distKm * Math.sin(psi), m.distKm - s.distKm * Math.cos(psi));
  return { phaseAngle: i * R2D, illumination: (1 + Math.cos(i)) / 2, waxing: norm360(m.lon - s.lon) < 180, ageDays: (ms - prevPhase(ms, 0)) / 864e5 };
}

// -------------------------------------------------------------------------------------------------- planets

export type PlanetId = 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';
export interface PlanetGeo { lon: number; lat: number; distAu: number; ra: number; dec: number; elong: number }

/** Precess a J2000 ecliptic vector to the ecliptic of date (Meeus 21.5–21.7); returns λ, β (deg). */
function precessEcl(v: Vec3, T: number): [number, number] {
  const l0 = Math.atan2(v[1], v[0]), b0 = Math.atan2(v[2], Math.hypot(v[0], v[1]));
  const eta = ((47.0029 - 0.03302 * T + 0.00006 * T * T) * T) / 3600 * D2R;
  const P = (174.876384 + (-869.8089 * T + 0.03536 * T * T) / 3600) * D2R, p = ((5029.0966 + 1.11113 * T - 0.000006 * T * T) * T) / 3600 * D2R;
  const ce = Math.cos(eta), se = Math.sin(eta), cb = Math.cos(b0), sb = Math.sin(b0), sPl = Math.sin(P - l0);
  const A = ce * cb * sPl - se * sb, B = cb * Math.cos(P - l0), C = ce * sb + se * cb * sPl;
  return [norm360((p + P - Math.atan2(A, B)) * R2D), Math.asin(C) * R2D];
}

/** Apparent geocentric position of a planet (light-time, aberration and nutation applied). */
export function planetGeo(id: PlanetId, ms: number): PlanetGeo {
  const f = frame(ms), T = f.T, d = T * 36525, k = BODY[id].kepler!;
  const [L, B, R] = earthLBR(T), cB = Math.cos(B);
  const earth: Vec3 = [R * cB * Math.cos(L), R * cB * Math.sin(L), R * Math.sin(B)];
  const geo = (dd: number): [number, number, number] => {
    const h = keplerPosition(k, dd), [l, b] = precessEcl(h, T), p = radec(l, b, Math.hypot(h[0], h[1], h[2]));
    const g: Vec3 = [p[0] - earth[0], p[1] - earth[1], p[2] - earth[2]], r = Math.hypot(g[0], g[1], g[2]);
    return [Math.atan2(g[1], g[0]), Math.asin(g[2] / r), r];
  };
  let [lam, bet, dist] = geo(d);
  [lam, bet, dist] = geo(d - 0.0057755183 * dist);
  const sunL = L + Math.PI, e = 0.016708634 - 0.000042037 * T, pi = (102.93735 + 1.71946 * T) * D2R, kap = 20.49552 / 3600 * D2R;
  const dl = (-kap * Math.cos(sunL - lam) + e * kap * Math.cos(pi - lam)) / Math.cos(bet);
  const db = -kap * Math.sin(bet) * (Math.sin(sunL - lam) - e * Math.sin(pi - lam));
  const lon = norm360((lam + dl) * R2D + f.dPsi), lat = (bet + db) * R2D;
  const s = sunGeo(ms), el = angle(radec(lon, lat), radec(s.lon, s.lat));
  return { lon, lat, distAu: dist, ...eclToEq(lon, lat, f.eps), elong: norm180(lon - s.lon) < 0 ? -el : el };
}

// -------------------------------------------------------------------------------------------------- solvers

/** Root of `f` in [a, b] (f(a), f(b) of opposite sign) by bisection to `tol` ms. */
export function findRoot(f: (t: number) => number, a: number, b: number, tol = 500): number {
  let fa = f(a);
  while (b - a > tol) {
    const m = (a + b) / 2, fm = f(m);
    if (fa < 0 === fm < 0) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
}

/** Minimum of a unimodal `f` in [a, b] by golden-section search to `tol` ms. */
export function findMin(f: (t: number) => number, a: number, b: number, tol = 1000): number {
  const g = 0.3819660112501051;
  let c = a + g * (b - a), d = b - g * (b - a), fc = f(c), fd = f(d);
  while (b - a > tol) {
    if (fc < fd) { b = d; d = c; fd = fc; c = a + g * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = b - g * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}

/** Walk from `t0` in `step`-ms steps (sign gives direction) until `f` turns non-negative; then bisect. */
export function rootFrom(f: (t: number) => number, t0: number, step: number, maxSteps: number, tol = 500): number | undefined {
  let a = t0;
  for (let i = 0; i < maxSteps; i++) {
    const b = a + step;
    if (f(b) >= 0) return findRoot(f, Math.min(a, b), Math.max(a, b), tol);
    a = b;
  }
  return undefined;
}
