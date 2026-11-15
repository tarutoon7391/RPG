// 地形の高さと色を「座標 → 値」の関数で決める（保存データなし。どこでも同じ値が出る）
// 北（-z）ほど寒く、南（+z）ほど暑い。大陸の外周は海
import { createNoise } from '../noise.js';
import { WORLD } from '../config.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

export const BIOMES = {
  sea: { name: '海', color: '#2a6f9e' },
  plain: { name: '草原', color: '#6fae4a', suffix: '平原' },
  forest: { name: '森', color: '#2f7a32', suffix: 'の森' },
  desert: { name: '砂漠', color: '#d9c27a', suffix: '砂漠' },
  snow: { name: '雪原', color: '#e8eef5', suffix: '雪原' },
  swamp: { name: '湿地', color: '#56663a', suffix: '沼地' },
  volcano: { name: '火山', color: '#5a3a34', suffix: '火山帯' },
  mountain: { name: '山岳', color: '#8a8580', suffix: '山脈' },
};

// 地面の色（0〜1）
const C = {
  grass: [0.36, 0.58, 0.24],
  forest: [0.19, 0.4, 0.16],
  sand: [0.84, 0.75, 0.48],
  snow: [0.93, 0.95, 0.98],
  ash: [0.2, 0.19, 0.18],
  swamp: [0.3, 0.35, 0.19],
  rock: [0.46, 0.43, 0.4],
  beach: [0.87, 0.8, 0.6],
  seabed: [0.5, 0.47, 0.36],
};

export function createTerrain(seed = WORLD.seed) {
  const HALF = WORLD.half;
  const A = createNoise(seed);
  const B = createNoise(seed + 101);
  const V = createNoise(seed + 202);

  // ---- 平らにする場所（町・ダンジョン入口など） ----
  const PG = 512;
  const poiGrid = new Map();
  function setFlats(list) {
    poiGrid.clear();
    for (const p of list) {
      const R = p.r + p.fall;
      for (let gx = Math.floor((p.x - R) / PG); gx <= Math.floor((p.x + R) / PG); gx++) {
        for (let gz = Math.floor((p.z - R) / PG); gz <= Math.floor((p.z + R) / PG); gz++) {
          const k = gx * 100003 + gz;
          let arr = poiGrid.get(k);
          if (!arr) poiGrid.set(k, (arr = []));
          arr.push(p);
        }
      }
    }
  }
  function flatten(x, z, h) {
    const arr = poiGrid.get(Math.floor(x / PG) * 100003 + Math.floor(z / PG));
    if (!arr) return h;
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      const dx = x - p.x;
      const dz = z - p.z;
      const d2 = dx * dx + dz * dz;
      const R = p.r + p.fall;
      if (d2 >= R * R) continue;
      const d = Math.sqrt(d2);
      const t = d <= p.r ? 1 : smooth(1 - (d - p.r) / p.fall);
      h = lerp(h, p.h, t);
    }
    return h;
  }

  /**
   * 生の高さ（平らにする前）。o にバイオームの値を書き込む
   * @param oct 細かさ（遠くのタイルは少なくして軽くする）
   */
  function raw(x, z, o, oct = 6) {
    const nx = x / HALF;
    const nz = z / HALF;
    const r = Math.hypot(nx, nz) * 0.55 + Math.max(Math.abs(nx), Math.abs(nz)) * 0.45;
    const coastN = A.fbm(x / 5200 + 13.1, z / 5200 - 7.7, Math.min(oct, 5));
    const land = smooth(clamp01((0.97 - (r + coastN * 0.24)) / 0.17));
    const temp = -nz * 0.85 + B.fbm(x / 7000 + 31, z / 7000 - 17, 3) * 0.55;
    const moist = B.fbm(x / 4200 - 91, z / 4200 + 57, 4) * 1.5;
    const mount = clamp01((A.fbm(x / 3800 + 400, z / 3800 - 200, 3) - 0.1) * 2.6);
    const hot = clamp01((temp - 0.25) * 4);
    const vol = hot * clamp01((V.fbm(x / 2600, z / 2600, 3) - 0.16) * 3.5);
    const dry = clamp01((temp - 0.3) * 3) * clamp01(-moist * 2.2) * (1 - vol);
    const cold = clamp01((-temp - 0.38) * 3.5);
    const wet = clamp01((moist - 0.5) * 3.5) * (1 - mount) * (1 - cold);

    let h = lerp(-75, 7, land);
    const hills = A.fbm(x / 700, z / 700, oct) * 20 + A.fbm(x / 2300 - 50, z / 2300 + 80, 3) * 34;
    h += hills * land;
    if (mount > 0) h += mount * mount * A.ridged(x / 1900, z / 1900, Math.max(2, oct - 1)) * 560 * land;
    if (vol > 0) h += vol * vol * V.ridged(x / 1300 + 77, z / 1300 - 33, Math.max(2, oct - 2)) * 420 * land;
    if (dry > 0) h += dry * Math.abs(A.n2(x / 170, z / 95)) * 11 * land;
    if (wet > 0) h = lerp(h, 1.1 + A.n2(x / 60, z / 60) * 1.8, wet * land);

    if (o) {
      o.land = land; o.temp = temp; o.moist = moist; o.mount = mount;
      o.vol = vol; o.dry = dry; o.cold = cold; o.wet = wet;
    }
    return h;
  }

  const tmp = {};
  /** 歩ける地面の高さ（平らにする処理込み） */
  function height(x, z, oct = 6) {
    return flatten(x, z, raw(x, z, null, oct));
  }

  /** 高さとバイオームの値（o に書く） */
  function sample(x, z, o, oct = 6) {
    const h = flatten(x, z, raw(x, z, o, oct));
    o.h = h;
    return h;
  }

  /**
   * 色（out[0..2] に 0〜1）。ny は法線の上向き成分（急な斜面は岩）
   */
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
    mix(C.forest, clamp01(o.moist * 1.8));
    mix(C.sand, o.dry);
    mix(C.swamp, o.wet);
    mix(C.snow, o.cold);
    mix(C.ash, o.vol * 1.2);
    mix(C.rock, clamp01((0.84 - ny) * 5));
    mix(C.snow, clamp01((h - (300 + o.temp * 160)) / 50) * clamp01((ny - 0.55) * 4));
    if (h < 4 && h > -3) mix(C.beach, clamp01((4 - h) / 4) * (1 - o.wet) * (1 - o.cold * 0.7));
    if (h <= -3) mix(C.seabed, clamp01((-3 - h) / 6));
    const v = 1 + A.n2(x / 37, z / 37) * 0.06 + A.n2(x / 9, z / 9) * 0.03;
    out[0] = r * v;
    out[1] = g * v;
    out[2] = b * v;
  }

  /** その地点のバイオームの種類 */
  function biomeAt(x, z) {
    const h = sample(x, z, tmp, 4);
    if (tmp.land < 0.45 || h < -2) return 'sea';
    if (h > 260 || tmp.mount > 0.62) return 'mountain';
    if (tmp.vol > 0.35) return 'volcano';
    if (tmp.cold > 0.45) return 'snow';
    if (tmp.dry > 0.45) return 'desert';
    if (tmp.wet > 0.45) return 'swamp';
    if (tmp.moist > 0.22) return 'forest';
    return 'plain';
  }

  /** 斜面の急さ（0=平ら） */
  function slope(x, z, step = 2) {
    const hx = height(x + step, z) - height(x - step, z);
    const hz = height(x, z + step) - height(x, z - step);
    return Math.hypot(hx, hz) / (2 * step);
  }

  return { raw, height, sample, color, biomeAt, slope, setFlats, fields: tmp };
}
