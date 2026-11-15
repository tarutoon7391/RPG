// バトロワの島（約 1km 四方）。地形は関数だけど、山・川・港などの位置は手で決めて固定
// 北 = -z。中心 (0, 0) あたりに城下町
import { createNoise } from '../noise.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const gauss = (x, z, cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * s * s));
/** 中心から r まで 1 → 0 になる重み */
const area = (x, z, cx, cz, r) => smooth(clamp01(1 - Math.hypot(x - cx, z - cz) / r));

/** エリア（名前・場所）。HUD とマップの名前に使う */
export const AREAS = [
  { id: 'town', name: '王都アステリア', x: 0, z: 10, r: 120, color: '#ffd54f' },
  { id: 'fort', name: '雪山砦', x: 30, z: -330, r: 110, color: '#e3f2fd' },
  { id: 'ruins', name: '東の古代遺跡', x: 320, z: -10, r: 95, color: '#d7ccc8' },
  { id: 'forest', name: '西の深い森', x: -330, z: 0, r: 130, color: '#81c784' },
  { id: 'harbor', name: '南の港', x: 40, z: 355, r: 90, color: '#90caf9' },
  { id: 'swamp', name: '霧の沼地', x: 270, z: 270, r: 95, color: '#9ccc65' },
  { id: 'windmill', name: '風車の丘', x: 270, z: -270, r: 80, color: '#fff59d' },
  { id: 'lighthouse', name: '灯台の崖', x: -290, z: 300, r: 75, color: '#ffab91' },
  { id: 'river', name: '大河', x: -140, z: 40, r: 0, color: '#4fc3f7' },
];

/** 川の流れ（北の山から南西の海へ） */
export const RIVER = [
  [-55, -205], [-95, -165], [-140, -70], [-165, 30], [-160, 130], [-135, 225], [-120, 320], [-115, 470],
];
const RIVER_W = 7; // 川幅の半分（m）

/** 橋（川を渡る場所） */
export const BRIDGES = [
  { x: -118, z: -118, len: 34 },
  { x: -164, z: 80, len: 34 },
  { x: -128, z: 272, len: 34 },
];

/** 点と折れ線の距離と、その位置の流れの向き */
function riverDist(x, z) {
  let best = Infinity;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i];
    const [bx, bz] = RIVER[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}
/** 橋の向き（川に直角）を計算 */
for (const b of BRIDGES) {
  let bi = 0;
  let bd = Infinity;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const mx = (RIVER[i][0] + RIVER[i + 1][0]) / 2;
    const mz = (RIVER[i][1] + RIVER[i + 1][1]) / 2;
    const d = Math.hypot(b.x - mx, b.z - mz);
    if (d < bd) { bd = d; bi = i; }
  }
  const [ax, az] = RIVER[bi];
  const [bx, bz] = RIVER[bi + 1];
  b.yaw = Math.atan2(bx - ax, bz - az) + Math.PI / 2; // 橋の長さ方向 = 流れに直角
}

export function createIsland(seed = 20261115) {
  const N = createNoise(seed);
  const flats = [];

  function raw(x, z, o, oct = 5) {
    const d = Math.hypot(x, z);
    const a = Math.atan2(z, x);
    const R = 445 + 40 * Math.sin(3 * a + 0.7) + 24 * Math.sin(5 * a + 2.1) + 14 * Math.sin(9 * a + 0.3) + N.fbm(Math.cos(a) * 1.7, Math.sin(a) * 1.7, 3) * 22;
    const land = smooth(clamp01((R - d) / 55));
    let h = lerp(-28, 9, land);
    h += (N.fbm(x / 170, z / 170, oct) * 6 + N.fbm(x / 55, z / 55, 2) * 1.2) * land;

    const forest = area(x, z, -330, 0, 190);
    const swamp = area(x, z, 270, 270, 120);
    // 北の雪山（砦の山）
    const mt = gauss(x, z, 30, -330, 120);
    h += mt * (118 + N.ridged(x / 90, z / 90, 3) * 18) * land;
    // 風車の丘
    h += gauss(x, z, 270, -270, 55) * 30 * land;
    // 遺跡の台地
    h += smooth(clamp01((110 - Math.hypot(x - 320, z + 10)) / 50)) * 13 * land;
    // 灯台の崖（台地）
    h += smooth(clamp01((80 - Math.hypot(x + 290, z - 300)) / 22)) * 24 * land;
    // 森はでこぼこ
    h += forest * N.fbm(x / 70, z / 70, 3) * 7 * land;
    // 沼地は低く平ら
    if (swamp > 0) h = lerp(h, 0.6 + N.n2(x / 40, z / 40) * 1.4, swamp * land);
    // 川
    const rd = riverDist(x, z);
    const riv = smooth(clamp01(1 - rd / (RIVER_W * 2.6)));
    if (riv > 0) h = lerp(h, Math.min(h, -2.6), smooth(clamp01((RIVER_W * 2.4 - rd) / (RIVER_W * 1.4))));

    if (o) {
      o.land = land;
      o.temp = 0.3 - forest * 0.6;
      o.moist = forest * 1.1 + 0.12 * N.fbm(x / 120, z / 120, 2) + swamp * 0.3;
      o.mount = 0;
      o.vol = 0;
      o.dry = 0;
      o.cold = 0;
      o.wet = swamp * 0.9;
      o.river = riv;
      o.snowy = clamp01((h - 62) / 22);
    }
    return h;
  }

  function flatten(x, z, h) {
    for (let i = 0; i < flats.length; i++) {
      const p = flats[i];
      const dx = x - p.x;
      const dz = z - p.z;
      const R = p.r + p.fall;
      if (dx > R || dx < -R || dz > R || dz < -R) continue;
      const d = Math.hypot(dx, dz);
      if (d >= R) continue;
      const t = d <= p.r ? 1 : smooth(1 - (d - p.r) / p.fall);
      h = lerp(h, p.h, t);
    }
    return h;
  }

  const height = (x, z, oct = 5) => flatten(x, z, raw(x, z, null, oct));
  function sample(x, z, o, oct = 5) {
    const h = flatten(x, z, raw(x, z, o, oct));
    o.h = h;
    // 雪は「平らにする前」ではなく実際の高さで
    o.cold = clamp01((h - 62) / 22) > 0.5 ? 1 : 0;
    return h;
  }

  const C = {
    grass: [0.38, 0.6, 0.25], forest: [0.18, 0.38, 0.15], snow: [0.92, 0.94, 0.97], swamp: [0.3, 0.34, 0.2],
    rock: [0.47, 0.44, 0.41], sand: [0.88, 0.8, 0.6], bed: [0.48, 0.44, 0.34], mud: [0.42, 0.36, 0.26],
  };
  function color(x, z, o, ny, out) {
    const h = o.h;
    let r = C.grass[0];
    let g = C.grass[1];
    let b = C.grass[2];
    const mix = (c, t) => {
      if (t <= 0) return;
      r += (c[0] - r) * t;
      g += (c[1] - g) * t;
      b += (c[2] - b) * t;
    };
    mix(C.forest, clamp01(o.moist * 1.3));
    mix(C.swamp, o.wet);
    mix(C.rock, clamp01((0.8 - ny) * 4));
    mix(C.snow, clamp01((h - 62) / 22) * clamp01((ny - 0.5) * 4));
    if (o.river > 0.2 && h < 3) mix(C.mud, clamp01((3 - h) / 3));
    else if (h < 3.2 && h > -2.5) mix(C.sand, clamp01((3.2 - h) / 2.5) * (1 - o.wet));
    if (h <= -2) mix(C.bed, clamp01((-2 - h) / 5));
    const v = 1 + N.n2(x / 23, z / 23) * 0.07 + N.n2(x / 6, z / 6) * 0.03;
    out[0] = r * v;
    out[1] = g * v;
    out[2] = b * v;
  }

  /** 平らにする場所を足す（h を省略するとその場の高さ＋off） */
  function addFlat(x, z, r, fall, h, off = 0) {
    const hh = h ?? raw(x, z, null, 5) + off;
    flats.push({ x, z, r, fall, h: hh });
    return hh;
  }

  return { raw, height, sample, color, addFlat, flats, setFlats() {}, fields: {} };
}

/** 座標 → いるエリア（一番近いもの） */
export function areaAt(x, z) {
  let best = null;
  let bd = Infinity;
  for (const a of AREAS) {
    if (!a.r) continue;
    const d = Math.hypot(x - a.x, z - a.z) / a.r;
    if (d < 1 && d < bd) { bd = d; best = a; }
  }
  if (!best && riverDist(x, z) < 30) return AREAS.find((a) => a.id === 'river');
  return best;
}
export { riverDist };
