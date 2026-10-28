// Approximate solar-cycle shape shared by the Sun kit and the Earth–Sun lesson figures (no three.js dependency).

/** Solar cycles: [minimum, maximum, smoothed peak sunspot number (SILSO v2)]; the last one is a projection. */
const CYCLES: [number, number, number][] = [[1976.2, 1979.9, 220], [1986.7, 1989.9, 213], [1996.6, 2001.9, 180], [2008.9, 2014.3, 116], [2019.9, 2024.8, 161], [2030.5, 2035, 130]];

/** Approximate smoothed sunspot number in a (decimal) year. */
export function sunspotNumber(y: number): number {
  let s = 3;
  for (let i = 0; i < CYCLES.length; i++) {
    const [a, p, A] = CYCLES[i], end = (CYCLES[i + 1]?.[0] ?? a + 11) + 1.2;
    if (y < a || y > end) continue;
    s += y < p ? A * Math.sin(((Math.PI / 2) * (y - a)) / (p - a)) ** 2 : A * Math.cos((Math.PI / 2) * Math.min(1, (y - p) / (end - p))) ** 2;
  }
  return s;
}

/** How far through its cycle the Sun is (0 at a minimum): new spots start at high latitude and drift to the equator. */
export function cyclePhase(y: number): number {
  for (let i = CYCLES.length - 1; i >= 0; i--) {
    if (y >= CYCLES[i][0]) return Math.max(0, Math.min(1, (y - CYCLES[i][0]) / ((CYCLES[i + 1]?.[0] ?? CYCLES[i][0] + 11) - CYCLES[i][0])));
  }
  return 0;
}
