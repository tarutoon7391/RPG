// 地形の描画：クアッドツリー LOD。近くは細かい 64m タイル、遠くは数km の粗いタイルで、ワールド全体を地平線まで出す
// 1タイル = 33x33 頂点＋継ぎ目隠しのスカート。インデックスは全タイル共通
import * as THREE from 'three';
import { WORLD, TERRAIN } from '../config.js';

const SEG = TERRAIN.seg;
const V1 = SEG + 1;

/** 共通のインデックス（本体＋スカート） */
function makeIndex() {
  const idx = [];
  for (let z = 0; z < SEG; z++) {
    for (let x = 0; x < SEG; x++) {
      const a = z * V1 + x;
      const b = a + 1;
      const c = a + V1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // スカート：外周を一周（本体の外周頂点 → 下にずらした複製）
  const ring = perimeter();
  const base = V1 * V1;
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k];
    const b = ring[(k + 1) % ring.length];
    const a2 = base + k;
    const b2 = base + ((k + 1) % ring.length);
    idx.push(a, b, a2, b, b2, a2, a, a2, b, b, a2, b2); // 両面
  }
  return idx;
}
/** 外周の頂点番号（一周） */
function perimeter() {
  const r = [];
  for (let x = 0; x < SEG; x++) r.push(x);
  for (let z = 0; z < SEG; z++) r.push(z * V1 + SEG);
  for (let x = SEG; x > 0; x--) r.push(SEG * V1 + x);
  for (let z = SEG; z > 0; z--) r.push(z * V1);
  return r;
}

export function createTiles(scene, terrain, quality) {
  const group = new THREE.Group();
  group.name = 'terrain';
  scene.add(group);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const INDEX = makeIndex();
  const RING = perimeter();
  const NV = V1 * V1 + RING.length;
  const cache = new Map(); // key → { mesh, used }
  let frame = 0;
  const stats = { visible: 0, cached: 0, built: 0, queued: 0 };

  const f = {};
  const col = [0, 0, 0];
  // 作業用の配列（縁を1つ広げた高さ）
  const W = SEG + 3;
  const hbuf = new Float32Array(W * W);
  const fbuf = new Float32Array(V1 * V1 * 8);

  function octFor(size) {
    if (size <= 128) return 6;
    if (size <= 512) return 5;
    if (size <= 2048) return 4;
    return 3;
  }

  /** タイルのメッシュを作る */
  function build(size, cx, cz) {
    const step = size / SEG;
    const x0 = cx - size / 2;
    const z0 = cz - size / 2;
    const oct = octFor(size);
    // 高さ（縁を1つ広げて法線用に）
    for (let gz = 0; gz < W; gz++) {
      for (let gx = 0; gx < W; gx++) {
        const x = x0 + (gx - 1) * step;
        const z = z0 + (gz - 1) * step;
        const inner = gx >= 1 && gz >= 1 && gx <= V1 && gz <= V1;
        if (inner) {
          hbuf[gz * W + gx] = terrain.sample(x, z, f, oct);
          const o = ((gz - 1) * V1 + (gx - 1)) * 8;
          fbuf[o] = f.land; fbuf[o + 1] = f.temp; fbuf[o + 2] = f.moist; fbuf[o + 3] = f.mount;
          fbuf[o + 4] = f.vol; fbuf[o + 5] = f.dry; fbuf[o + 6] = f.cold; fbuf[o + 7] = f.wet;
        } else {
          hbuf[gz * W + gx] = terrain.height(x, z, oct);
        }
      }
    }
    const pos = new Float32Array(NV * 3);
    const nor = new Float32Array(NV * 3);
    const clr = new Float32Array(NV * 3);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let z = 0; z < V1; z++) {
      for (let x = 0; x < V1; x++) {
        const i = z * V1 + x;
        const hi = (z + 1) * W + (x + 1);
        const h = hbuf[hi];
        pos[i * 3] = (x - SEG / 2) * step;
        pos[i * 3 + 1] = h;
        pos[i * 3 + 2] = (z - SEG / 2) * step;
        if (h < minY) minY = h;
        if (h > maxY) maxY = h;
        const dx = hbuf[hi + 1] - hbuf[hi - 1];
        const dz = hbuf[hi + W] - hbuf[hi - W];
        let nx = -dx;
        let ny = 2 * step;
        let nz = -dz;
        const l = Math.hypot(nx, ny, nz);
        nx /= l; ny /= l; nz /= l;
        nor[i * 3] = nx; nor[i * 3 + 1] = ny; nor[i * 3 + 2] = nz;
        const o = i * 8;
        f.land = fbuf[o]; f.temp = fbuf[o + 1]; f.moist = fbuf[o + 2]; f.mount = fbuf[o + 3];
        f.vol = fbuf[o + 4]; f.dry = fbuf[o + 5]; f.cold = fbuf[o + 6]; f.wet = fbuf[o + 7]; f.h = h;
        terrain.color(x0 + x * step, z0 + z * step, f, ny, col);
        clr[i * 3] = col[0]; clr[i * 3 + 1] = col[1]; clr[i * 3 + 2] = col[2];
      }
    }
    // スカート
    const drop = Math.max(2, size * TERRAIN.skirt);
    const base = V1 * V1;
    for (let k = 0; k < RING.length; k++) {
      const s = RING[k];
      const d = base + k;
      pos[d * 3] = pos[s * 3];
      pos[d * 3 + 1] = pos[s * 3 + 1] - drop;
      pos[d * 3 + 2] = pos[s * 3 + 2];
      nor[d * 3] = nor[s * 3]; nor[d * 3 + 1] = nor[s * 3 + 1]; nor[d * 3 + 2] = nor[s * 3 + 2];
      clr[d * 3] = clr[s * 3]; clr[d * 3 + 1] = clr[s * 3 + 1]; clr[d * 3 + 2] = clr[s * 3 + 2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(clr, 3));
    geo.setIndex(INDEX);
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(-size / 2, minY - drop, -size / 2), new THREE.Vector3(size / 2, maxY, size / 2));
    geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(cx, 0, cz);
    mesh.receiveShadow = size <= 256;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.visible = false;
    group.add(mesh);
    stats.built++;
    return mesh;
  }

  const keyOf = (size, cx, cz) => `${size}:${Math.round(cx)}:${Math.round(cz)}`;

  /** カメラ位置から必要なタイル（葉）を集める */
  function collect(px, pz, py, out) {
    const K = quality.detail;
    const lift = Math.max(0, py - 60) * 0.8; // 高いところからは遠くまで粗くていい
    const rec = (size, cx, cz) => {
      const dx = Math.max(0, Math.abs(px - cx) - size / 2);
      const dz = Math.max(0, Math.abs(pz - cz) - size / 2);
      const d = Math.hypot(dx, dz, lift);
      if (size > TERRAIN.minTile && d < size * K) {
        const q = size / 4;
        const h = size / 2;
        rec(h, cx - q, cz - q);
        rec(h, cx + q, cz - q);
        rec(h, cx - q, cz + q);
        rec(h, cx + q, cz + q);
      } else {
        out.push({ size, cx, cz, key: keyOf(size, cx, cz), d });
      }
    };
    // 根は世界全体の 4 分割から（一辺 = ワールドの半分）
    const s = WORLD.size / 2;
    rec(s, -s / 2, -s / 2);
    rec(s, s / 2, -s / 2);
    rec(s, -s / 2, s / 2);
    rec(s, s / 2, s / 2);
  }

  const want = [];
  const shown = new Set();
  let lastWant = new Set();

  /**
   * 毎フレーム：必要なタイルを決め、作れていないものは予算内で作る。
   * まだ無いタイルは、作れている親（粗いタイル）か、前に出していた子タイルで代わりに埋める
   */
  function update(px, pz, py, budgetMs = 5, force = false) {
    frame++;
    want.length = 0;
    collect(px, pz, py, want);
    want.sort((a, b) => b.size - a.size || a.d - b.d); // 粗い方から・近い方から作る
    const t0 = performance.now();
    for (const w of want) {
      if (cache.has(w.key)) continue;
      if (!force && performance.now() - t0 > budgetMs) break;
      cache.set(w.key, { mesh: build(w.size, w.cx, w.cz), used: frame, size: w.size, cx: w.cx, cz: w.cz });
    }
    // 表示するものを決める
    const next = new Set();
    const covers = [];
    for (const w of want) {
      const c = cache.get(w.key);
      if (c) {
        next.add(w.key);
        continue;
      }
      // 親を探す
      let s = w.size;
      let found = null;
      while (s < WORLD.size / 2) {
        s *= 2;
        const pcx = Math.floor((w.cx + WORLD.half) / s) * s + s / 2 - WORLD.half;
        const pcz = Math.floor((w.cz + WORLD.half) / s) * s + s / 2 - WORLD.half;
        const k = keyOf(s, pcx, pcz);
        if (cache.has(k)) { found = { k, s, cx: pcx, cz: pcz }; break; }
      }
      if (found) {
        next.add(found.k);
        covers.push(found);
      } else {
        // 子：前のフレームに出していた、この範囲の小さいタイル
        for (const k of lastWant) {
          const c2 = cache.get(k);
          if (c2 && c2.size < w.size && Math.abs(c2.cx - w.cx) < w.size / 2 && Math.abs(c2.cz - w.cz) < w.size / 2) next.add(k);
        }
      }
    }
    // 親で覆った範囲の小さいタイルは消す（重なり防止）
    if (covers.length) {
      for (const k of [...next]) {
        const c = cache.get(k);
        for (const cv of covers) {
          if (c.size < cv.s && Math.abs(c.cx - cv.cx) < cv.s / 2 && Math.abs(c.cz - cv.cz) < cv.s / 2) {
            next.delete(k);
            break;
          }
        }
      }
    }
    for (const k of shown) if (!next.has(k)) { const c = cache.get(k); if (c) c.mesh.visible = false; }
    for (const k of next) { const c = cache.get(k); c.mesh.visible = true; c.used = frame; }
    shown.clear();
    for (const k of next) shown.add(k);
    lastWant = next;
    // 古いキャッシュを捨てる
    if (cache.size > 900) {
      const old = [...cache.entries()].filter(([k]) => !next.has(k)).sort((a, b) => a[1].used - b[1].used);
      for (let i = 0; i < old.length && cache.size > 700; i++) {
        const [k, c] = old[i];
        group.remove(c.mesh);
        c.mesh.geometry.dispose();
        cache.delete(k);
      }
    }
    stats.visible = next.size;
    stats.cached = cache.size;
    stats.queued = want.filter((w) => !cache.has(w.key)).length;
    return stats.queued;
  }

  return { group, update, stats, setVisible(v) { group.visible = v; } };
}
