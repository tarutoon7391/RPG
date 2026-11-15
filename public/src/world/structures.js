// 建物：町・王都・ステージ碑・ダンジョン入口・魔王城。近づいたら作って、離れたら捨てる
// 形はプリミティブを頂点カラーで塗って 1メッシュにまとめる（光る部分だけ別メッシュ）
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../noise.js';
import { paint } from './props.js';
import { BIOMES } from './terrain.js';

export const lit = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
export const glow = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });

/** 組み立て用の箱 */
export function kit() {
  const solid = [];
  const shine = [];
  const cols = []; // ローカル座標の当たり判定
  const k = {
    solid, shine, cols,
    add(geo, color, x = 0, y = 0, z = 0, ry = 0, bright = false) {
      if (ry) geo.rotateY(ry);
      geo.translate(x, y, z);
      (bright ? shine : solid).push(paint(geo, color));
    },
    box(w, h, d, color, x, y, z, ry = 0, bright = false) { k.add(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z, ry, bright); },
    cyl(rt, rb, h, color, x, y, z, seg = 10, bright = false) { k.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y + h / 2, z, 0, bright); },
    cone(r, h, color, x, y, z, seg = 10, ry = 0) { k.add(new THREE.ConeGeometry(r, h, seg), color, x, y + h / 2, z, ry); },
    circle(x, z, r) { cols.push({ x, z, r }); },
    rect(minX, maxX, minZ, maxZ, top) { cols.push({ minX, maxX, minZ, maxZ, top }); },
  };
  return k;
}

/** ローカル → ワールド（y 回転込み） */
export function toWorld(p, lx, lz) {
  const c = Math.cos(p.yaw || 0);
  const s = Math.sin(p.yaw || 0);
  return { x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c };
}

// ------------------------------------------------------------ 町
const WALLS = [0xe8dcc0, 0xd9c7a3, 0xc8b496, 0xefe6d2, 0xbfa88a];
const ROOFS = [0xa0442f, 0x6b4a8a, 0x3f5f8f, 0x8a5a2b, 0x4d7a45];

export function buildTown(p, k, rnd, { capital = false } = {}) {
  const R = p.r;
  // 石畳
  k.cyl(R - 4, R - 4, 0.12, capital ? 0xb8b0a0 : 0xa89c84, 0, -0.06, 0, 48);
  // 城壁
  const wallR = R - 5;
  const segs = Math.ceil((2 * Math.PI * wallR) / 6);
  const wallH = capital ? 9 : 4.5;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const gate = [0, Math.PI / 2, Math.PI, Math.PI * 1.5].some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) * wallR < 7);
    if (gate) continue;
    const x = Math.sin(a) * wallR;
    const z = Math.cos(a) * wallR;
    k.box(6.4, wallH, 1.6, capital ? 0xd6d0c2 : 0x9a8f7c, x, 0, z, a);
    k.circle(x, z, 1.9);
    const x2 = Math.sin(a + Math.PI / segs) * wallR;
    const z2 = Math.cos(a + Math.PI / segs) * wallR;
    k.circle(x2, z2, 1.9);
    if (i % 6 === 0) {
      k.cyl(2.2, 2.4, wallH + 3, capital ? 0xe0dacc : 0xa89c88, x, 0, z, 8);
      k.cone(2.8, 3, ROOFS[0], x, wallH + 3, z, 8);
      k.circle(x, z, 2.6);
    }
  }
  // 門の柱
  for (const g of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    for (const side of [-1, 1]) {
      const a = g + (side * 7.5) / wallR;
      const x = Math.sin(a) * wallR;
      const z = Math.cos(a) * wallR;
      k.cyl(1.6, 1.8, wallH + 4, 0x8a7f6c, x, 0, z, 8);
      k.circle(x, z, 2);
    }
  }
  // 噴水
  k.cyl(5, 5.4, 0.9, 0x9c9488, 0, 0, 0, 16);
  k.cyl(4.4, 4.4, 0.95, 0x4a90c8, 0, 0, 0, 16);
  k.cyl(0.6, 0.9, 3.2, 0xbfb6a8, 0, 0, 0, 8);
  k.add(new THREE.SphereGeometry(0.9, 10, 6), 0x9fdcff, 0, 3.6, 0, 0, true);
  k.circle(0, 0, 5.6);
  // 家
  const step = capital ? 15 : 14;
  const lim = R - 16;
  for (let gx = -lim; gx <= lim; gx += step) {
    for (let gz = -lim; gz <= lim; gz += step) {
      const x = gx + (rnd() - 0.5) * 3;
      const z = gz + (rnd() - 0.5) * 3;
      if (Math.hypot(x, z) > lim || Math.hypot(x, z) < 16) continue;
      if (Math.abs(x) < 6 || Math.abs(z) < 6) continue; // 大通り
      if (capital && z < -10 && Math.abs(x) < 42 && z > -100) continue; // 王城の場所
      if (rnd() < (capital ? 0.12 : 0.28)) continue;
      const w = 6 + rnd() * 4;
      const d = 6 + rnd() * 3;
      const h = 3.2 + rnd() * (capital ? 4 : 2);
      const ry = rnd() < 0.5 ? 0 : Math.PI / 2;
      const W = ry ? d : w;
      const D = ry ? w : d;
      k.box(W, h, D, WALLS[Math.floor(rnd() * WALLS.length)], x, 0, z);
      const roof = new THREE.ConeGeometry(0.72, 1, 4);
      roof.rotateY(Math.PI / 4);
      const rh = 2.4 + rnd() * 1.5;
      roof.scale(W, rh, D);
      k.add(roof, ROOFS[Math.floor(rnd() * ROOFS.length)], x, h + rh / 2, z);
      // 窓（夕方っぽく光る）
      k.box(1.1, 1, 0.1, 0xffd88a, x - W * 0.2, h * 0.45, z + D / 2 + 0.03, 0, true);
      k.box(1.1, 1, 0.1, 0xffd88a, x + W * 0.2, h * 0.45, z + D / 2 + 0.03, 0, true);
      k.box(1.2, 2, 0.1, 0x5a3a22, x, 0, z + D / 2 + 0.03);
      k.rect(x - W / 2, x + W / 2, z - D / 2, z + D / 2, h + 3);
    }
  }
  // 街灯
  for (let r = 20; r < lim; r += 18) {
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = sx * r + sz * 4.5;
      const z = sz * r + sx * 4.5;
      k.cyl(0.12, 0.15, 3.6, 0x2b2b2b, x, 0, z, 6);
      k.add(new THREE.BoxGeometry(0.5, 0.6, 0.5), 0xffe6a0, x, 3.9, z, 0, true);
    }
  }
}

export function buildCapital(p, k, rnd) {
  buildTown(p, k, rnd, { capital: true });
  // 王城（中心から北＝-z 側）
  const cz = -60;
  k.box(46, 18, 36, 0xe4ded2, 0, 0, cz);
  k.box(30, 12, 22, 0xd8d1c3, 0, 18, cz - 2);
  k.box(14, 10, 12, 0xcfc7b8, 0, 30, cz - 4);
  k.cone(10, 12, 0x3f5f8f, 0, 40, cz - 4, 4, Math.PI / 4);
  for (const [x, z] of [[-23, cz - 18], [23, cz - 18], [-23, cz + 18], [23, cz + 18]]) {
    k.cyl(5, 5.6, 34, 0xeae4d8, x, 0, z, 12);
    k.cone(6.4, 12, 0x3f5f8f, x, 34, z, 12);
    k.circle(x, z, 5.8);
  }
  k.box(7, 9, 0.6, 0x4a3020, 0, 0, cz + 18.1); // 城門
  k.rect(-23, 23, cz - 18, cz + 18);
  // 旗
  k.box(0.2, 10, 0.2, 0x333333, 0, 52, cz - 4);
  k.box(4, 2.4, 0.1, 0xd23a3a, 2.1, 59, cz - 4);
}

// ------------------------------------------------------------ ステージ碑
function buildStage(p, k, rnd, reg) {
  const col = new THREE.Color(BIOMES[reg?.biome || 'plain'].color).getHex();
  k.cyl(3.4, 3.8, 0.6, 0x8c877d, 0, 0, 0, 8);
  k.cyl(2.6, 3, 0.5, 0x9c978d, 0, 0.6, 0, 8);
  const ob = new THREE.CylinderGeometry(0.7, 1.15, 7, 4);
  ob.rotateY(Math.PI / 4);
  k.add(ob, 0xb9b3a6, 0, 4.6, 0);
  k.add(new THREE.OctahedronGeometry(0.9, 0), col, 0, 9.4, 0, 0, true);
  k.circle(0, 0, 3.2);
  return { spin: 9.4 };
}

// ------------------------------------------------------------ ダンジョン入口
export function buildDungeon(p, k, rnd, T) {
  const t = p.type;
  if (t === 'cave' || t === 'ice' || t === 'lava') {
    const rc = t === 'ice' ? 0xa9d4ec : t === 'lava' ? 0x3a2622 : 0x7a7064;
    const big = new THREE.SphereGeometry(10, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    big.scale(1.2, 0.95, 1);
    k.add(big, rc, 0, -1, -6);
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * 0.85 + (i / 8) * Math.PI * 1.7;
      k.add(new THREE.DodecahedronGeometry(2 + rnd() * 2.5, 0), rc, Math.sin(a) * 11, 0.5 + rnd() * 2, -6 + Math.cos(a) * 9);
    }
    k.add(new THREE.CircleGeometry(3.6, 12, 0, Math.PI), 0x050505, 0, 0, 3.9, 0, true);
    if (t === 'lava') k.add(new THREE.CircleGeometry(2.2, 10, 0, Math.PI), 0xff4a10, 0, 0, 3.8, 0, true);
    k.circle(0, -6, 10.5);
    return { door: { x: 0, z: 6.5 } };
  }
  if (t === 'ruin') {
    k.cyl(10, 11, 0.8, 0x8a8576, 0, 0, 0, 12);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const hh = rnd() < 0.35 ? 1.5 + rnd() * 2 : 6;
      k.cyl(0.8, 0.9, hh, 0xb0aa98, Math.sin(a) * 8, 0.8, Math.cos(a) * 8, 8);
      k.circle(Math.sin(a) * 8, Math.cos(a) * 8, 1);
    }
    k.box(4, 0.2, 4, 0x080808, 0, 0.75, 0, 0, true);
    for (let s = 0; s < 3; s++) k.box(4, 0.3, 0.7, 0x77705f, 0, 0.5 - s * 0.35, 1.6 - s * 0.7);
    return { door: { x: 0, z: 0 }, doorR: 3 };
  }
  if (t === 'tower') {
    const H = 26 + p.floors * 4;
    k.cyl(7, 7.6, H, 0x9a9488, 0, 0, 0, 14);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      if (i % 2) k.box(1.6, 1.6, 1.2, 0x9a9488, Math.sin(a) * 7, H, Math.cos(a) * 7, a);
    }
    k.cone(8.2, 10, 0x5a3f6b, 0, H + 1.2, 0, 14);
    k.box(3.2, 4.4, 0.4, 0x120c08, 0, 0, 7.5);
    for (let y = 8; y < H - 4; y += 7) k.box(0.9, 1.6, 0.2, 0xffd27a, 0, y, 7.5, 0, true);
    k.circle(0, 0, 7.8);
    return { door: { x: 0, z: 9 } };
  }
  if (t === 'temple') {
    for (let i = 0; i < 5; i++) {
      const w = 26 - i * 5;
      k.box(w, 3, w, i % 2 ? 0xd2b77a : 0xc9ad6e, 0, i * 3, 0);
    }
    k.box(4, 4, 0.5, 0x140f08, 0, 0, 13.1);
    k.add(new THREE.OctahedronGeometry(1.2, 0), 0xffe08a, 0, 17, 0, 0, true);
    k.circle(0, 0, 13.5);
    return { door: { x: 0, z: 15 }, spin: 17 };
  }
  if (t === 'crypt') {
    k.box(9, 5, 11, 0x5d6358, 0, 0, -1);
    const roof = new THREE.CylinderGeometry(0.01, 6.4, 3, 4, 1);
    roof.rotateY(Math.PI / 4);
    roof.scale(1, 1, 1.25);
    k.add(roof, 0x40453d, 0, 6.5, -1);
    k.box(2.6, 3.6, 0.3, 0x081008, 0, 0, 4.6);
    k.box(2.6, 0.4, 0.3, 0x8affb0, 0, 3.7, 4.65, 0, true);
    for (let i = 0; i < 7; i++) {
      const x = (rnd() - 0.5) * 22;
      const z = 7 + rnd() * 8;
      if (Math.abs(x) < 3) continue;
      k.box(1, 1.4, 0.3, 0x7a8074, x, 0, z, (rnd() - 0.5) * 0.4);
      k.circle(x, z, 0.6);
    }
    k.rect(-4.5, 4.5, -6.5, 4.5);
    return { door: { x: 0, z: 6.2 } };
  }
  if (t === 'demon') {
    const c = 0x3a3048;
    k.cyl(60, 62, 1, 0x2a2430, 0, -0.5, 0, 24);
    k.box(56, 26, 44, c, 0, 0, -10);
    k.box(36, 18, 28, 0x44385a, 0, 26, -12);
    k.box(16, 22, 14, 0x4c3f64, 0, 44, -14);
    k.cone(11, 26, 0x241c2e, 0, 66, -14, 4, Math.PI / 4);
    for (const [x, z] of [[-28, -32], [28, -32], [-28, 12], [28, 12], [-14, 24], [14, 24]]) {
      const hh = 40 + rnd() * 14;
      k.cyl(5, 6, hh, 0x2e2638, x, 0, z, 8);
      k.cone(6.5, 16, 0x1a1422, x, hh, z, 8);
      k.add(new THREE.OctahedronGeometry(1.6, 0), 0xd070ff, x, hh + 19, z, 0, true);
      k.circle(x, z, 6.2);
    }
    k.box(9, 13, 0.6, 0x0a0410, 0, 0, 12.2);
    k.box(9, 1, 0.7, 0xd070ff, 0, 13, 12.3, 0, true);
    k.rect(-28, 28, -32, 12);
    return { door: { x: 0, z: 18 } };
  }
  return { door: { x: 0, z: 5 } };
}

/**
 * 建物の出し入れ
 * @param world generateWorld の結果
 */
export function createStructures(scene, world, colliders) {
  const group = new THREE.Group();
  group.name = 'structures';
  scene.add(group);
  const loaded = new Map(); // id → { obj, acts }
  const spins = [];
  const interactables = new Map(); // id → [{x,z,r,label,poi,kind}]
  let t = 0;
  const stats = { loaded: 0 };

  function load(p) {
    const k = kit();
    const rnd = mulberry32((p.seed || 0) + Math.floor(p.x * 7 + p.z * 13));
    let info = {};
    if (p.kind === 'town') buildTown(p, k, rnd);
    else if (p.kind === 'capital') buildCapital(p, k, rnd);
    else if (p.kind === 'stage') info = buildStage(p, k, rnd, world.regions[p.region]);
    else if (p.kind === 'dungeon') info = buildDungeon(p, k, rnd);
    const obj = new THREE.Group();
    obj.position.set(p.x, p.h, p.z);
    obj.rotation.y = p.yaw || 0;
    if (k.solid.length) {
      const m = new THREE.Mesh(mergeGeometries(k.solid), lit);
      m.castShadow = true;
      m.receiveShadow = true;
      obj.add(m);
    }
    if (k.shine.length) obj.add(new THREE.Mesh(mergeGeometries(k.shine), glow));
    for (const g of [...k.solid, ...k.shine]) g.dispose();
    group.add(obj);
    // 当たり判定をワールド座標へ（箱は回転しない前提＝町・王都・墓所は yaw 0 か、小さいので円で十分）
    const cols = k.cols.map((c) => {
      if (c.r !== undefined) { const w = toWorld(p, c.x, c.z); return { x: w.x, z: w.z, r: c.r }; }
      if (!p.yaw) return { minX: p.x + c.minX, maxX: p.x + c.maxX, minZ: p.z + c.minZ, maxZ: p.z + c.maxZ, top: c.top !== undefined ? p.h + c.top : undefined };
      const w = toWorld(p, (c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2);
      return { x: w.x, z: w.z, r: Math.min(c.maxX - c.minX, c.maxZ - c.minZ) / 2 };
    });
    colliders.setGroup(`s:${p.id}`, cols);
    // 調べられるもの
    const acts = [];
    if (p.kind === 'stage') acts.push({ x: p.x, z: p.z, r: 5.5, label: 'ステージ碑を調べる', poi: p, kind: 'stage' });
    if (p.kind === 'town' || p.kind === 'capital') acts.push({ x: p.x, z: p.z + 7, r: 4.5, label: `${p.name}の案内板を読む`, poi: p, kind: 'town' });
    if (p.kind === 'dungeon') {
      const d = toWorld(p, info.door.x, info.door.z);
      acts.push({ x: d.x, z: d.z, r: info.doorR || 4.5, label: `${p.name}に入る`, poi: p, kind: 'dungeon' });
    }
    if (p.kind === 'capital') {
      const keep = world.pois.find((o) => o.id === 'castle');
      if (keep) acts.push({ x: p.x, z: p.z - 38, r: 5, label: `${keep.name}に入る`, poi: keep, kind: 'dungeon' });
    }
    interactables.set(p.id, acts);
    if (info.spin !== undefined && k.shine.length) spins.push({ id: p.id, obj });
    loaded.set(p.id, { obj });
  }

  function unload(id) {
    const L = loaded.get(id);
    if (!L) return;
    group.remove(L.obj);
    L.obj.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    colliders.setGroup(`s:${id}`, null);
    interactables.delete(id);
    const i = spins.findIndex((s) => s.id === id);
    if (i >= 0) spins.splice(i, 1);
    loaded.delete(id);
  }

  /** 距離で出し入れ（数フレームに1回で十分） */
  function update(px, pz, dt, budget = 3) {
    t += dt;
    let made = 0;
    for (const p of world.pois) {
      if (!p.loadR) continue;
      const d = Math.hypot(p.x - px, p.z - pz);
      const has = loaded.has(p.id);
      if (!has && d < p.loadR && made < budget) { load(p); made++; }
      else if (has && d > p.loadR * 1.15) unload(p.id);
    }
    stats.loaded = loaded.size;
  }

  function animate(dt) {
    for (const s of spins) {
      const m = s.obj.children[s.obj.children.length - 1];
      if (m) m.rotation.y += dt * 0.6;
    }
  }

  function nearest(px, pz) {
    let best = null;
    let bd = Infinity;
    for (const acts of interactables.values()) {
      for (const a of acts) {
        const d = Math.hypot(a.x - px, a.z - pz);
        if (d < a.r && d < bd) { bd = d; best = a; }
      }
    }
    return best;
  }

  function clear() { for (const id of [...loaded.keys()]) unload(id); }

  return { group, update, animate, nearest, stats, clear, setVisible(v) { group.visible = v; } };
}
