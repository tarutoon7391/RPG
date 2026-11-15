// 木・岩・サボテンなどの小物。128m のセルごとに置き場所を決め、近くのセルだけ InstancedMesh にまとめて描く
// 幹・岩には当たり判定（円）を付ける
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2, mulberry32 } from '../noise.js';
import { WORLD } from '../config.js';

const CELL = 128;
const GRID = 7; // 候補の間隔（m）

/** 頂点カラーを塗る */
export function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
const at = (geo, x, y, z) => geo.translate(x, y, z);

/** 小物の形（1つの geometry にまとめる） */
function makeKinds() {
  const pine = mergeGeometries([
    paint(at(new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6), 0, 1.1, 0), 0x5a3d25),
    paint(at(new THREE.ConeGeometry(2.0, 4.2, 7), 0, 3.6, 0), 0x2f5d2a),
    paint(at(new THREE.ConeGeometry(1.5, 3.2, 7), 0, 5.5, 0), 0x356b2f),
  ]);
  const snowPine = mergeGeometries([
    paint(at(new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6), 0, 1.1, 0), 0x5a3d25),
    paint(at(new THREE.ConeGeometry(2.0, 4.2, 7), 0, 3.6, 0), 0x40634f),
    paint(at(new THREE.ConeGeometry(1.4, 2.8, 7), 0, 5.6, 0), 0xe8f0f4),
  ]);
  const round = mergeGeometries([
    paint(at(new THREE.CylinderGeometry(0.28, 0.4, 2.6, 6), 0, 1.3, 0), 0x6a4a2c),
    paint(at(new THREE.IcosahedronGeometry(2.2, 0), 0, 3.8, 0), 0x4f8a35),
    paint(at(new THREE.IcosahedronGeometry(1.5, 0), 0.9, 4.6, 0.4), 0x5d9a3c),
  ]);
  const palm = mergeGeometries([
    paint(at(new THREE.CylinderGeometry(0.18, 0.3, 5, 6), 0, 2.5, 0), 0x8a6a42),
    paint(at(new THREE.ConeGeometry(2.4, 1.0, 6), 0, 5.2, 0), 0x5f9c3a),
  ]);
  const cactus = mergeGeometries([
    paint(at(new THREE.CylinderGeometry(0.35, 0.4, 3.2, 7), 0, 1.6, 0), 0x4c8a3c),
    paint(at(new THREE.CylinderGeometry(0.22, 0.22, 1.2, 6), 0.6, 1.8, 0), 0x4c8a3c),
    paint(at(new THREE.CylinderGeometry(0.2, 0.2, 1.0, 6), -0.55, 2.2, 0), 0x4c8a3c),
  ]);
  const dead = mergeGeometries([
    paint(at(new THREE.CylinderGeometry(0.15, 0.3, 3.6, 5), 0, 1.8, 0), 0x3d3328),
    paint(at(new THREE.CylinderGeometry(0.06, 0.12, 1.6, 4).rotateZ(0.9), 0.6, 2.7, 0), 0x3d3328),
    paint(at(new THREE.CylinderGeometry(0.06, 0.12, 1.3, 4).rotateZ(-1.0), -0.5, 2.3, 0), 0x3d3328),
  ]);
  const rock = paint(new THREE.DodecahedronGeometry(1, 0).scale(1.3, 0.8, 1.1), 0x7d7a74);
  const darkRock = paint(new THREE.DodecahedronGeometry(1, 0).scale(1.3, 0.9, 1.1), 0x3a302c);
  const bush = paint(new THREE.IcosahedronGeometry(0.8, 0).scale(1.2, 0.7, 1.2).translate(0, 0.4, 0), 0x46803a);
  return {
    pine: { geo: pine, cap: 14000, r: 0.4 },
    snowPine: { geo: snowPine, cap: 8000, r: 0.4 },
    round: { geo: round, cap: 12000, r: 0.45 },
    palm: { geo: palm, cap: 3000, r: 0.3 },
    cactus: { geo: cactus, cap: 4000, r: 0.45 },
    dead: { geo: dead, cap: 5000, r: 0.3 },
    rock: { geo: rock, cap: 8000, r: 1 },
    darkRock: { geo: darkRock, cap: 5000, r: 1 },
    bush: { geo: bush, cap: 12000, r: 0 },
  };
}

/** バイオームの値 → 置く小物と密度（候補1つあたりの確率） */
function choose(f, h, r) {
  if (h < 0.8) return null;
  if (f.cold > 0.5) return r < 0.14 ? 'snowPine' : r < 0.17 ? 'rock' : null;
  if (f.vol > 0.35) return r < 0.06 ? 'darkRock' : r < 0.09 ? 'dead' : null;
  if (f.dry > 0.45) return r < 0.025 ? 'cactus' : r < 0.04 ? 'rock' : null;
  if (f.wet > 0.45) return r < 0.07 ? 'dead' : r < 0.17 ? 'bush' : null;
  if (h > 230) return r < 0.05 ? 'rock' : r < 0.07 ? 'snowPine' : null;
  if (h < 4 && f.temp > 0.15) return r < 0.05 ? 'palm' : null;
  const forest = Math.min(1, Math.max(0, f.moist * 1.6));
  if (r < forest * 0.32) return f.temp < -0.1 || r < forest * 0.14 ? 'pine' : 'round';
  if (r < forest * 0.32 + 0.012) return 'round';
  if (r < forest * 0.32 + 0.05) return 'bush';
  if (r < forest * 0.32 + 0.062) return 'rock';
  return null;
}

export function createProps(scene, terrain, quality, colliders) {
  const group = new THREE.Group();
  group.name = 'props';
  scene.add(group);
  const kinds = makeKinds();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const meshes = {};
  for (const [k, d] of Object.entries(kinds)) {
    const m = new THREE.InstancedMesh(d.geo, material, d.cap);
    m.count = 0;
    m.castShadow = true;
    m.receiveShadow = false;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(m);
    meshes[k] = m;
  }
  const cells = new Map(); // key → { items: {kind: Float32Array(16*n)}, cols: [] }
  const f = {};
  const mat = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let center = null;
  let pending = [];
  const stats = { cells: 0, instances: 0 };

  function genCell(ci, cj) {
    const out = {};
    const cols = [];
    const x0 = ci * CELL;
    const z0 = cj * CELL;
    if (Math.abs(x0) > WORLD.half + CELL || Math.abs(z0) > WORLD.half + CELL) return { out, cols };
    const rnd = mulberry32((hash2(ci, cj, WORLD.seed) * 4294967296) >>> 0);
    for (let gz = 0; gz < CELL; gz += GRID) {
      for (let gx = 0; gx < CELL; gx += GRID) {
        const x = x0 + gx + rnd() * GRID;
        const z = z0 + gz + rnd() * GRID;
        const r = rnd();
        const sc = 0.7 + rnd() * 0.7;
        const rot = rnd() * Math.PI * 2;
        const h = terrain.sample(x, z, f, 5);
        const kind = choose(f, h, r);
        if (!kind) continue;
        if (Math.abs(terrain.raw(x, z, null, 5) - h) > 0.5) continue; // 平らにした場所（町など）には置かない
        const sl = Math.abs(terrain.height(x + 1.5, z, 5) - terrain.height(x - 1.5, z, 5)) + Math.abs(terrain.height(x, z + 1.5, 5) - terrain.height(x, z - 1.5, 5));
        if (sl > 2.6 && kind !== 'rock' && kind !== 'darkRock') continue;
        q.setFromAxisAngle(up, rot);
        s.set(sc, sc * (kind === 'rock' || kind === 'darkRock' ? 0.6 + rnd() : 1), sc);
        p.set(x, h - 0.15, z);
        mat.compose(p, q, s);
        (out[kind] ||= []).push(...mat.elements);
        const cr = kinds[kind].r * sc;
        if (cr > 0) cols.push({ x, z, r: cr });
      }
    }
    for (const k in out) out[k] = new Float32Array(out[k]);
    return { out, cols };
  }

  function rebuild() {
    for (const k in meshes) meshes[k].count = 0;
    let total = 0;
    for (const c of cells.values()) {
      if (!c.on) continue;
      for (const k in c.out) {
        const m = meshes[k];
        const arr = c.out[k];
        const n = arr.length / 16;
        const room = kinds[k].cap - m.count;
        const use = Math.min(n, room);
        if (use <= 0) continue;
        m.instanceMatrix.array.set(use === n ? arr : arr.subarray(0, use * 16), m.count * 16);
        m.count += use;
        total += use;
      }
    }
    for (const k in meshes) meshes[k].instanceMatrix.needsUpdate = true;
    stats.instances = total;
  }

  /** 毎フレーム。セルが変わったら作るものを予約し、予算内で作る */
  function update(px, pz, budgetMs = 3, force = false) {
    const ci = Math.floor(px / CELL);
    const cj = Math.floor(pz / CELL);
    const R = quality.propDist;
    const key = `${ci}:${cj}:${R}`;
    let dirty = false;
    if (key !== center) {
      center = key;
      const need = new Set();
      pending = [];
      for (let j = cj - R; j <= cj + R; j++) {
        for (let i = ci - R; i <= ci + R; i++) {
          if ((i - ci) ** 2 + (j - cj) ** 2 > R * R + 1) continue;
          const k = `${i}:${j}`;
          need.add(k);
          if (!cells.has(k)) pending.push({ i, j, k, d: (i - ci) ** 2 + (j - cj) ** 2 });
        }
      }
      pending.sort((a, b) => a.d - b.d);
      for (const [k, c] of cells) {
        const on = need.has(k);
        if (c.on !== on) { c.on = on; dirty = true; colliders.setGroup(`p:${k}`, on ? c.cols : null); }
        if (!on && (Math.abs(c.i - ci) > R + 4 || Math.abs(c.j - cj) > R + 4)) cells.delete(k);
      }
    }
    const t0 = performance.now();
    while (pending.length && (force || performance.now() - t0 < budgetMs)) {
      const { i, j, k } = pending.shift();
      const g = genCell(i, j);
      cells.set(k, { i, j, on: true, out: g.out, cols: g.cols });
      colliders.setGroup(`p:${k}`, g.cols);
      dirty = true;
    }
    if (dirty) rebuild();
    stats.cells = cells.size;
  }

  function reset() {
    center = null;
    for (const k of cells.keys()) colliders.setGroup(`p:${k}`, null);
    cells.clear();
  }

  return { group, update, stats, reset, setVisible(v) { group.visible = v; } };
}
