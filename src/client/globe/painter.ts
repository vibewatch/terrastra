import { feature, mesh, neighbors } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import { ISO, type Continent } from '../../shared/data/iso.ts';
import { CITIES } from '../../shared/data/cities.ts';

export interface CountryInfo { id: string; a2: string; continent: Continent; name: string; lat: number; lon: number; area: number; feature: Feature<Polygon | MultiPolygon> }

// Harmonious orbital political atlas palette (rich jewel/cartographic tones that pair with AuraFM lighting)
const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'];

export function loadCountries(topo: Topology): CountryInfo[] {
  const obj = topo.objects.countries as GeometryCollection;
  const fc = feature(topo, obj) as unknown as { features: Feature<Polygon | MultiPolygon>[] };
  return fc.features.map((f, i) => {
    const id = String(f.id ?? (f.properties as { name: string }).name);
    const name = (f.properties as { name: string }).name;
    const [a2, continent] = ISO[id] ?? ISO[name] ?? ['', 'asia'];
    const { lat, lon, area } = labelPoint(f);
    return { id: id + ':' + i, a2, continent, name, lat, lon, area, feature: f };
  });
}

function ringArea(r: Position[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
}

/** Centroid of the largest polygon, plus total area in deg² (cos-lat weighted) for label priority. */
function labelPoint(f: Feature<Polygon | MultiPolygon>): { lat: number; lon: number; area: number } {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let best = polys[0], bestA = -1, total = 0;
  for (const p of polys) {
    const a = ringArea(p[0]) * Math.cos(((p[0][0][1] ?? 0) * Math.PI) / 180);
    total += a;
    if (a > bestA) { bestA = a; best = p; }
  }
  // unwrap longitudes so rings that touch the antimeridian (Fiji, Russia) get a sensible centroid
  const r: Position[] = [];
  let prev = best[0][0][0];
  for (const [x0, y] of best[0]) { let x = x0; while (x - prev > 180) x -= 360; while (prev - x > 180) x += 360; r.push([x, y]); prev = x; }
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const k = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    a += k; cx += (r[j][0] + r[i][0]) * k; cy += (r[j][1] + r[i][1]) * k;
  }
  if (Math.abs(a) < 1e-9) return { lon: r[0][0], lat: r[0][1], area: total };
  const lon = ((cx / (3 * a) + 540) % 360) - 180;
  return { lon, lat: cy / (3 * a), area: total };
}

/** `borderTopo`: a finer topology to stroke the borders from (the fills always come from `topo`). */
export interface PaintOpts { political: boolean; borders: boolean; width: number; borderTopo?: Topology }

// Deterministic multi-octave value-noise for AuraFM satellite biome & elevation synthesis.
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number): number {
  return noise(x, y) * 0.52 + noise(x * 2.13, y * 2.13) * 0.30 + noise(x * 4.47, y * 4.47) * 0.18;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
function gauss(lat: number, lon: number, cLat: number, cLon: number, sLat: number, sLon: number): number {
  const dLat = (lat - cLat) / sLat;
  const dLon = (lon - cLon) / sLon;
  return Math.exp(-(dLat * dLat + dLon * dLon));
}
function lerp3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  const u = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

/**
 * Generates smooth, artifact-free satellite biome colours tuned for AuraFM's orbital shader (`Gp`),
 * using continuous latitude & Gaussian regional weights (no hard bounding boxes).
 */
function terrainColour(lat: number, lon: number): [number, number, number] {
  const al = Math.abs(lat);
  const n = fbm(lon / 11, lat / 11);
  const detail = fbm(lon / 3.2 + 7.1, lat / 3.2 + 3.4);
  const v = 0.84 + n * 0.24 + (detail - 0.5) * 0.14;

  // 1. Continuous latitude vegetation base: tropical -> temperate -> boreal
  const tropic: [number, number, number] = [32 * v, 88 * v, 50 * v];
  const tempForest: [number, number, number] = [48 * v, 102 * v, 58 * v];
  const steppe: [number, number, number] = [94 * v, 108 * v, 66 * v];
  const temperate = lerp3(tempForest, steppe, smoothstep(0.46, 0.72, n));
  const boreal: [number, number, number] = [62 * v, 84 * v, 68 * v];

  let col = lerp3(tropic, temperate, smoothstep(10, 23, al));
  col = lerp3(col, boreal, smoothstep(50, 64, al));

  // 2. Smooth desert / arid belts (Sahara, Arabia, Gobi/Central Asia, Outback, SW North America, Atacama)
  const desertWeight = Math.min(
    1,
    gauss(lat, lon, 23, 12, 9, 26) * 1.15 +      // Sahara
    gauss(lat, lon, 24, 46, 8, 16) * 1.10 +      // Arabian Peninsula
    gauss(lat, lon, 41, 68, 7, 18) * 0.90 +      // Kyzylkum / Central Asia
    gauss(lat, lon, 42, 96, 6, 16) * 0.88 +      // Taklamakan & Gobi
    gauss(lat, lon, -25, 130, 7, 16) * 0.95 +    // Australian Outback
    gauss(lat, lon, 30, -110, 7, 10) * 0.75 +    // Sonoran / Mojave
    gauss(lat, lon, -23, -69, 8, 4) * 0.85       // Atacama
  ) * smoothstep(0.24, 0.52, n);

  const sand: [number, number, number] = [156 * v, 128 * v, 88 * v];
  col = lerp3(col, sand, desertWeight);

  // 3. Smooth mountain ranges (Himalayas/Tibet, Andes, Rockies, Alps/Caucasus, East African Rift)
  const mtnWeight = Math.min(
    1,
    gauss(lat, lon, 33, 86, 5.5, 13) * 0.95 +    // Himalayas & Tibetan Plateau
    gauss(lat, lon, -18, -68, 18, 4.5) * 0.82 +  // Andes
    gauss(lat, lon, 45, -113, 12, 6.5) * 0.75 +  // Rockies
    gauss(lat, lon, 46, 11, 2.5, 6) * 0.70 +     // Alps
    gauss(lat, lon, 42, 44, 2.5, 6) * 0.70       // Caucasus
  ) * smoothstep(0.35, 0.65, n);

  const rock: [number, number, number] = [96 * v, 88 * v, 80 * v];
  const alpineSnow: [number, number, number] = [172, 184, 198];
  const mtnCol = lerp3(rock, alpineSnow, smoothstep(0.58, 0.78, detail) * mtnWeight);
  col = lerp3(col, mtnCol, mtnWeight * 0.85);

  // 4. Smooth polar ice caps (Antarctica, Greenland, high Arctic islands)
  const greenland = gauss(lat, lon, 72, -40, 9, 14);
  const polarWeight = Math.max(
    smoothstep(67, 76, al + (n - 0.5) * 6),
    smoothstep(-58, -66, -lat),
    greenland * smoothstep(0.28, 0.5, n)
  );
  const ice: [number, number, number] = [196 + detail * 24, 208 + detail * 22, 224 + detail * 18];
  col = lerp3(col, ice, polarWeight);

  return col;
}

/** Adds a country's rings to the current path on an equirectangular canvas `W` wide, handling the antimeridian. */
export function tracePath(targetCtx: CanvasRenderingContext2D, f: Feature<Polygon | MultiPolygon>, W: number, isAntarctica = false): void {
  const H = W / 2;
  const X = (lon: number) => ((lon + 180) / 360) * W;
  const Y = (lat: number) => ((90 - lat) / 180) * H;
  const traceRing = (ring: Position[], shift: number) => {
    ring.forEach(([lon, lat], i) => {
      const adjLon = shift > 0 && lon < 0 ? lon + 360 : shift < 0 && lon > 0 ? lon - 360 : lon;
      if (i === 0) targetCtx.moveTo(X(adjLon), Y(lat));
      else targetCtx.lineTo(X(adjLon), Y(lat));
    });
    targetCtx.closePath();
  };
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  targetCtx.beginPath();
  for (const poly of polys) for (const ring of poly) {
    let hasJump = false;
    for (let i = 1; i < ring.length; i++) {
      if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) { hasJump = true; break; }
    }
    if (!hasJump) {
      traceRing(ring, 0);
    } else if (isAntarctica) {
      ring.forEach(([lon, lat], i) => {
        if (i > 0 && Math.abs(lon - ring[i - 1][0]) > 180) {
          const prevLon = ring[i - 1][0];
          targetCtx.lineTo(X(prevLon > 0 ? 180 : -180), Y(-90));
          targetCtx.lineTo(X(lon > 0 ? 180 : -180), Y(-90));
        }
        if (i === 0) targetCtx.moveTo(X(lon), Y(lat));
        else targetCtx.lineTo(X(lon), Y(lat));
      });
      targetCtx.closePath();
    } else {
      traceRing(ring, 1);
      traceRing(ring, -1);
    }
  }
}

let paintedBase: { countries: CountryInfo[]; political: boolean; cv: HTMLCanvasElement } | null = null;

export function paintEarth(topo: Topology, countries: CountryInfo[], opts: PaintOpts): HTMLCanvasElement {
  const W = opts.width, H = W / 2;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const X = (lon: number) => ((lon + 180) / 360) * W;
  const Y = (lat: number) => ((90 - lat) / 180) * H;

  // Clear canvas to transparent (alpha = 0 in ocean) so AuraFM's Earth shader
  // can compute view-dependent deep ocean shading and landMask from landSample.a!
  ctx.clearRect(0, 0, W, H);

  const path = (f: Feature<Polygon | MultiPolygon>, targetCtx: CanvasRenderingContext2D = ctx, isAntarctica = false) => tracePath(targetCtx, f, W, isAntarctica);
  const base = paintedBase;
  if (base && base.countries === countries && base.political === opts.political && base.cv.width === W) ctx.drawImage(base.cv, 0, 0);
  else {
    // Political fill with greedy colouring so neighbours differ.
    const obj = topo.objects.countries as GeometryCollection;
    const nb = neighbors(obj.geometries as never);
    const colourIdx: number[] = [];
    countries.forEach((_, i) => {
      const used = new Set(nb[i].map(j => colourIdx[j]).filter(x => x !== undefined));
      let k = (i * 3) % PALETTE.length;
      for (let t = 0; t < PALETTE.length && used.has(k); t++) k = (k + 1) % PALETTE.length;
      colourIdx[i] = k;
    });

    if (!opts.political) {
      // Build anti-aliased land mask, then fill land pixels with procedural satellite biome colours.
      const mask = document.createElement('canvas'); mask.width = W; mask.height = H;
      const mctx = mask.getContext('2d')!;
      mctx.fillStyle = '#fff';
      mctx.strokeStyle = 'rgba(255,255,255,0.65)';
      mctx.lineWidth = Math.max(0.8, W / 2048);
      for (const c of countries) {
        path(c.feature, mctx, c.a2 === 'AQ');
        mctx.fill('evenodd');
      }
      const md = mctx.getImageData(0, 0, W, H).data;
      const img = ctx.createImageData(W, H);
      const d = img.data;
      // The biome field is smooth (finest octave ≈ 0.7°), so it is evaluated on a lattice every S pixels, lazily and
      // only next to land, and interpolated bilinearly in between: ~S² fewer evaluations, visually identical.
      const S = W > 1024 ? 2 : 1, GW = W / S + 1, GH = H / S + 1;
      const grid = new Float32Array(GW * GH * 3), done = new Uint8Array(GW * GH);
      const node = (gx: number, gy: number): number => {
        const k = gy * GW + gx;
        if (!done[k]) {
          done[k] = 1;
          const c = terrainColour(90 - ((gy * S) / H) * 180, ((gx * S) / W) * 360 - 180);
          grid[k * 3] = c[0]; grid[k * 3 + 1] = c[1]; grid[k * 3 + 2] = c[2];
        }
        return k * 3;
      };
      for (let y = 0; y < H; y++) {
        const gy = Math.floor(y / S), fy = (y - gy * S) / S;
        for (let x = 0; x < W; x++) {
          const o = (y * W + x) * 4;
          const alpha = md[o + 3];
          if (alpha < 8) continue;
          const gx = Math.floor(x / S), fx = (x - gx * S) / S;
          const a = node(gx, gy), b = node(gx + 1, gy), c = node(gx, gy + 1), e = node(gx + 1, gy + 1);
          for (let ch = 0; ch < 3; ch++) {
            const top = grid[a + ch] + (grid[b + ch] - grid[a + ch]) * fx, bot = grid[c + ch] + (grid[e + ch] - grid[c + ch]) * fx;
            d[o + ch] = top + (bot - top) * fy;
          }
          d[o + 3] = alpha;
        }
      }
      ctx.putImageData(img, 0, 0);
    } else {
      countries.forEach((c, i) => {
        path(c.feature, ctx, c.a2 === 'AQ');
        ctx.fillStyle = c.a2 === 'AQ' ? '#cbd5e1' : PALETTE[colourIdx[i]];
        ctx.fill('evenodd');
      });
    }
    // kept so that a border-only change (switching borders, finer border data) does not repaint the land
    const copy = document.createElement('canvas');
    copy.width = W; copy.height = H;
    copy.getContext('2d')!.drawImage(cv, 0, 0);
    paintedBase = { countries, political: opts.political, cv: copy };
  }

  if (opts.borders) {
    const bt = opts.borderTopo ?? topo;
    const m = mesh(bt, bt.objects.countries as GeometryCollection as never, (a, b) => a !== b);
    const w = Math.max(1, W / 1600);
    const trace = () => {
      ctx.beginPath();
      for (const line of m.coordinates) {
        let prev: number | null = null;
        for (const [lon, lat] of line) {
          const x = X(lon), y = Y(lat);
          if (prev === null || Math.abs(prev - x) > W / 2) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          prev = x;
        }
      }
    };
    trace();
    ctx.lineJoin = ctx.lineCap = 'round';
    // a dark casing under a light line keeps borders legible over both bright deserts and dark forests
    if (!opts.political) { ctx.strokeStyle = 'rgba(2, 6, 23, 0.35)'; ctx.lineWidth = w * 2.6; ctx.stroke(); }
    ctx.strokeStyle = !opts.political ? 'rgba(241, 245, 249, 0.55)' : 'rgba(15, 23, 42, 0.7)';
    ctx.lineWidth = w;
    ctx.stroke();
  }
  return cv;
}

/**
 * Generates AuraFM's night-hemisphere city lights texture (`uNightTex`).
 * Uses real global cities, metropolitan sprawl, and interconnected urban corridors.
 */
let cachedNightCanvas: HTMLCanvasElement | null = null;
let cachedNightWidth = 0;

export function paintNightLights(countries: CountryInfo[], width: number): HTMLCanvasElement {
  if (cachedNightCanvas && cachedNightWidth === width) return cachedNightCanvas;
  const W = width, H = W / 2;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const X = (lon: number) => ((lon + 180) / 360) * W;
  const Y = (lat: number) => ((90 - lat) / 180) * H;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);

  // 1. Inter-city highway/urban corridors between nearby cities
  ctx.strokeStyle = 'rgba(255, 210, 140, 0.14)';
  ctx.lineWidth = Math.max(1, W / 1024);
  for (let i = 0; i < CITIES.length; i++) {
    const [, , lat1, lon1, pop1] = CITIES[i];
    for (let j = i + 1; j < CITIES.length; j++) {
      const [, , lat2, lon2, pop2] = CITIES[j];
      const dLat = lat1 - lat2, dLon = lon1 - lon2;
      const dist = Math.hypot(dLat, dLon);
      if (dist < 13 && Math.abs(dLon) < 20) {
        const alpha = Math.min(0.28, (1 - dist / 13) * 0.18 * Math.min(2, (pop1 + pop2) / 15));
        ctx.strokeStyle = `rgba(255, 215, 150, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(X(lon1), Y(lat1));
        ctx.lineTo(X(lon2), Y(lat2));
        ctx.stroke();
      }
    }
  }

  // 2. Metropolitan glow domes and satellite towns around each city
  const scale = W / 1024;
  for (let i = 0; i < CITIES.length; i++) {
    const [, , lat, lon, pop, capital] = CITIES[i];
    const cx = X(lon), cy = Y(lat);
    // Kept compact: large overlapping domes merged into solid cream washes over dense regions (Japan, E China).
    const rOuter = (2 + Math.sqrt(pop) * 1.2 + (capital ? 0.8 : 0)) * scale;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, rOuter);
    grd.addColorStop(0, 'rgba(255, 245, 215, 0.9)');
    grd.addColorStop(0.2, 'rgba(255, 215, 145, 0.5)');
    grd.addColorStop(0.55, 'rgba(255, 185, 100, 0.12)');
    grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
    ctx.fill();

    // Deterministic satellite town sparkles around major hubs
    const subCount = Math.min(18, Math.floor(3 + pop * 0.6));
    for (let k = 0; k < subCount; k++) {
      const ang = hash(i * 17 + k, k * 31) * Math.PI * 2;
      const dist = (0.15 + hash(k * 23, i * 13) * 0.85) * rOuter * 1.15;
      const sx = cx + Math.cos(ang) * dist;
      const sy = cy + Math.sin(ang) * dist * 0.75;
      const sr = (0.7 + hash(i + k, k) * 1.4) * scale;
      ctx.fillStyle = `rgba(255, 230, 175, ${(0.35 + hash(k, i) * 0.5).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 3. Regional settlements around inhabited country centroids
  for (let i = 0; i < countries.length; i++) {
    const c = countries[i];
    if (c.a2 === 'AQ' || Math.abs(c.lat) > 68) continue;
    const cx = X(c.lon), cy = Y(c.lat);
    const r = Math.min(6, 2 + Math.sqrt(Math.max(1, c.area)) * 0.25) * scale;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grd.addColorStop(0, 'rgba(255, 225, 160, 0.3)');
    grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  cachedNightCanvas = cv;
  cachedNightWidth = width;
  return cv;
}

