// 島の建物を全部置く（島は小さいので最初に全部作る）
// planIsland で平らにする場所を決め → 地形ができたら buildIsland で建物・橋・宝箱・抜け道を作る
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { kit, toWorld, buildCapital, buildDungeon, lit, glow } from '../world/structures.js';
import { bigBuilding, spiralTower } from '../world/interiors.js';
import { mulberry32 } from '../noise.js';
import { AREAS, BRIDGES, riverDist } from './island.js';

/** 地下の抜け道の入口 */
export const TUNNELS = [
  { id: 'A', name: '雪山の麓の洞窟', x: 105, z: -215, type: 'cave' },
  { id: 'B', name: '遺跡の地下階段', x: 320, z: -10, type: 'ruin' },
  { id: 'C', name: '森の洞窟', x: -300, z: -95, type: 'cave' },
  { id: 'D', name: '港の崖の洞窟', x: -40, z: 300, type: 'cave' },
  { id: 'E', name: '沼地の洞穴', x: 215, z: 210, type: 'cave' },
];
const TOWERS = [{ x: 150, z: 125 }, { x: -225, z: -205 }, { x: 150, z: -160 }, { x: -60, z: 175 }];

/** 平らにする場所を決める（地形タイルを作る前に呼ぶ） */
export function planIsland(island) {
  const L = {};
  L.town = { x: 0, z: 10, r: 105, yaw: 0 };
  L.town.h = island.addFlat(L.town.x, L.town.z, 105, 45, undefined, 0.3);
  L.fort = { x: 30, z: -330, yaw: 0 };
  L.fort.h = island.addFlat(30, -330, 47, 30, undefined, -3);
  L.ruins = { x: 320, z: -10, yaw: 0 };
  L.ruins.h = island.addFlat(320, -10, 72, 30, undefined, 0);
  L.harbor = { x: 40, z: 360, yaw: 0 };
  L.harbor.h = island.addFlat(40, 360, 58, 22, 2.6);
  L.lighthouse = { x: -295, z: 305, yaw: 0 };
  L.lighthouse.h = island.addFlat(-295, 305, 26, 14, undefined, 0);
  L.windmill = { x: 270, z: -270, yaw: 0.4 };
  L.windmill.h = island.addFlat(270, -270, 16, 14, undefined, 0);
  L.hut = { x: 285, z: 290, yaw: -0.6 };
  L.tunnels = TUNNELS.filter((t) => t.type === 'cave').map((t) => {
    const yaw = Math.atan2(-t.x, -t.z); // 入口は島の中心向き
    return { ...t, yaw, h: island.addFlat(t.x, t.z, 12, 18, undefined, 0) };
  });
  L.towers = TOWERS.map((t, i) => ({ ...t, yaw: i * 1.3, h: island.addFlat(t.x, t.z, 9, 10, undefined, 0) }));
  return L;
}

/** 長方形の板（長さ方向に傾けられる）。ローカル座標 */
function plank(k, cx, cz, hw, hl, y0, y1, color, thick = 0.4, ry = 0) {
  const len = 2 * hl;
  const ang = Math.atan2(y1 - y0, len);
  const g = new THREE.BoxGeometry(hw * 2, thick, Math.hypot(len, y1 - y0));
  g.rotateX(-ang);
  k.add(g, color, cx, (y0 + y1) / 2 - thick / 2, cz, ry);
}

export function buildIsland(scene, island, L, colliders, platforms) {
  const group = new THREE.Group();
  group.name = 'island-structures';
  scene.add(group);
  const acts = [];
  const anims = [];
  const rnd = mulberry32(7331);

  /** k をメッシュにして置く。当たり判定はワールドへ */
  function emit(name, p, k) {
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
    const cols = k.cols.map((c) => {
      const top = c.top !== undefined ? p.h + c.top : undefined;
      const bot = c.bot !== undefined ? p.h + c.bot : undefined;
      if (c.r !== undefined) { const w = toWorld(p, c.x, c.z); return { x: w.x, z: w.z, r: c.r, top, bot }; }
      if (!p.yaw) return { minX: p.x + c.minX, maxX: p.x + c.maxX, minZ: p.z + c.minZ, maxZ: p.z + c.maxZ, top, bot };
      const w = toWorld(p, (c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2);
      return { x: w.x, z: w.z, r: Math.min(c.maxX - c.minX, c.maxZ - c.minZ) / 2 };
    });
    colliders.setGroup(name, cols);
    for (const q of k.plats) addPlat(p, q.x, q.z, q.hw, q.hl, q.y0, q.y1 ?? q.y0, q.yaw || 0);
    return obj;
  }
  /** ローカルの板をワールドの乗れる板として登録 */
  function addPlat(p, lx, lz, hw, hl, y0, y1, yawOff = 0) {
    const w = toWorld(p, lx, lz);
    platforms.add({ x: w.x, z: w.z, yaw: (p.yaw || 0) + yawOff, hw, hl, y0: p.h + y0, y1: p.h + y1 });
  }

  // ---- 王都（城下町＋王城） ----
  const houses = [];
  { const k = kit(); k.houses = houses; buildCapital({ ...L.town, r: 105 }, k, rnd); emit('town', L.town, k); }

  // ---- 雪山砦：四隅に螺旋階段の塔、真ん中に 2 階建て＋屋上の本丸 ----
  {
    const k = kit();
    const S = 30;
    const TR = 4; // 塔の半径
    const W = 0xbfc3c8;
    const FOUND = 8; // 斜面でも浮かないように地面の下まで伸ばす
    k.cyl(S + 6, S + 6, 0.2, 0x9aa0a6, 0, -0.1, 0, 4);
    const L2 = S - TR; // 塔と塔の間の壁の半分
    k.box(2 * L2, 7 + FOUND, 2, W, 0, -FOUND, -S); // 北
    for (const side of [-1, 1]) k.box(2, 7 + FOUND, 2 * L2, W, side * S, -FOUND, 0); // 東西
    const half = (L2 - 5) / 2;
    for (const side of [-1, 1]) k.box(L2 - 5, 7 + FOUND, 2, W, side * (5 + half), -FOUND, S); // 南（真ん中が門）
    k.box(12, 2, 2.4, W, 0, 7, S); // 門の上
    k.rect(-L2, L2, -S - 1, -S + 1);
    k.rect(-S - 1, -S + 1, -L2, L2);
    k.rect(S - 1, S + 1, -L2, L2);
    k.rect(-L2, -5, S - 1, S + 1);
    k.rect(5, L2, S - 1, S + 1);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      k.cyl(TR + 0.3, TR + 0.6, FOUND, 0xa8adb3, sx * S, -FOUND, sz * S, 12); // 塔の土台
      spiralTower(k, { x: sx * S, z: sz * S, R: TR, H: 14, door: Math.atan2(-sx, -sz), color: 0xcfd3d8, roofColor: 0x3f5f8f, rise: 5 });
    }
    bigBuilding(k, { x: 0, z: -8, w: 18, d: 16, floorH: 5, floors: 2, color: 0xd6dade, roof: 'flat', door: [3, 3.2] });
    k.box(0.2, 8, 0.2, 0x333333, 4, 10, -12);
    k.box(3, 1.8, 0.1, 0x3f7fd2, 5.6, 16, -12);
    // 物資の木箱
    for (let i = 0; i < 6; i++) {
      const x = -20 + rnd() * 40;
      const z = 8 + rnd() * 14;
      if (Math.abs(x) < 3) continue;
      k.box(1.6, 1.6, 1.6, 0x8a6a42, x, 0, z, rnd());
      k.circle(x, z, 1.1);
    }
    emit('fort', L.fort, k);
  }

  // ---- 東の古代遺跡 ----
  {
    const k = kit();
    const p = { ...L.ruins, type: 'ruin', floors: 1 };
    buildDungeon(p, k, rnd);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const r = 32 + (i % 2) * 4;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      const broken = rnd() < 0.4;
      k.cyl(1.1, 1.3, broken ? 2 + rnd() * 3 : 9, 0xb7ae98, x, 0, z, 8);
      k.circle(x, z, 1.4);
      if (!broken && i % 3 === 0) {
        const n = (i + 3) % 18;
        const a2 = (n / 18) * Math.PI * 2;
        const x2 = Math.sin(a2) * 32;
        const z2 = Math.cos(a2) * 32;
        if (Math.hypot(x - x2, z - z2) < 40) k.box(1.4, 1.2, Math.hypot(x - x2, z - z2), 0xa89f8a, (x + x2) / 2, 9, (z + z2) / 2, Math.atan2(x2 - x, z2 - z));
      }
    }
    // 崩れた壁（隠れる場所）
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 14 + rnd() * 50;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      const len = 4 + rnd() * 6;
      const hh = 1.4 + rnd() * 2.6;
      const ry = rnd() * Math.PI;
      k.box(len, hh, 1.2, 0x9d9480, x, 0, z, ry);
      for (let t = -len / 2 + 0.8; t <= len / 2 - 0.8; t += 1.4) k.circle(x + Math.sin(ry + Math.PI / 2) * t, z + Math.cos(ry + Math.PI / 2) * t, 0.9);
    }
    // 倒れた柱
    for (let i = 0; i < 5; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 20 + rnd() * 40;
      const g = new THREE.CylinderGeometry(1.1, 1.1, 8, 8);
      g.rotateZ(Math.PI / 2);
      const ry = rnd() * Math.PI;
      k.add(g, 0xb0a790, Math.sin(a) * r, 1.0, Math.cos(a) * r, ry);
      for (const t of [-3, 0, 3]) k.circle(Math.sin(a) * r + Math.cos(ry) * t, Math.cos(a) * r - Math.sin(ry) * t, 1.2);
    }
    emit('ruins', p, k);
    platforms.add({ x: p.x, z: p.z, yaw: 0, hw: 7, hl: 7, y0: p.h + 0.8 });
  }

  // ---- 南の港 ----
  {
    const k = kit();
    const p = L.harbor;
    k.cyl(56, 56, 0.25, 0x9c958a, 0, -0.2, 0, 32);
    // 倉庫
    // 倉庫（2階建て。中の階段で 2 階へ）
    for (const [x, z, w, d] of [[-30, -18, 16, 12], [-8, -26, 13, 11], [26, -20, 18, 12]]) {
      bigBuilding(k, { x, z, w, d, floorH: 4, floors: 2, color: 0x8a6d4f, roof: 'none', door: [3.2, 3.2] });
      const roof = new THREE.CylinderGeometry(d * 0.62, d * 0.62, w + 0.6, 3, 1);
      roof.rotateZ(Math.PI / 2);
      roof.rotateX(Math.PI / 6 + Math.PI);
      k.add(roof, 0x5a4636, x, 8 + d * 0.15, z);
    }
    // 木箱・樽
    for (let i = 0; i < 16; i++) {
      const x = -40 + rnd() * 80;
      const z = -6 + rnd() * 34;
      if (Math.abs(x - 2) < 6) continue;
      if (rnd() < 0.5) { k.box(1.5, 1.5, 1.5, 0x9a7448, x, 0, z, rnd()); k.circle(x, z, 1.05); }
      else { k.cyl(0.6, 0.6, 1.3, 0x6b4a2a, x, 0, z, 8); k.circle(x, z, 0.7); }
    }
    // 桟橋（海へ）
    for (const px of [-18, 22]) {
      plank(k, px, 72, 2.5, 22, 0, 0, 0x8a6a42, 0.5);
      for (let z = 52; z <= 92; z += 8) for (const sx of [-2.2, 2.2]) k.cyl(0.25, 0.25, 6, 0x5a4026, px + sx, -5.5, z, 6);
      addPlat(p, px, 72, 2.5, 22, 0, 0);
    }
    // 船（甲板に乗れる）
    {
      const sx = 34;
      const sz = 78;
      k.box(7, 3, 22, 0x6b4a2a, sx, -1.5, sz);
      k.box(6, 0.3, 20, 0xa47a4a, sx, 1.2, sz);
      k.cyl(0.3, 0.35, 14, 0x5a4026, sx, 1.5, sz - 2, 6);
      k.box(0.2, 7, 9, 0xf0ead8, sx, 6, sz - 2);
      k.rect(sx - 3.5, sx + 3.5, sz - 11, sz + 11, 1.2);
      addPlat(p, sx, sz, 3, 10, 1.5, 1.5);
      plank(k, 27.5, 78, 1, 3.5, 0, 1.5, 0x8a6a42, 0.3, Math.PI / 2);
      addPlat(p, 27.5, 78, 1, 3.5, 0, 1.5, Math.PI / 2);
    }
    emit('harbor', p, k);
  }

  // ---- 灯台（螺旋階段でてっぺんのバルコニーへ） ----
  {
    const k = kit();
    spiralTower(k, { x: 0, z: 0, R: 3.8, H: 24, door: 0, color: 0xf2f2f2, stripe: 0xd23a3a, roofColor: 0x333333, rise: 5 });
    k.add(new THREE.SphereGeometry(1.2, 12, 8), 0xfff2a8, 0, 24 + 7.4, 0, 0, true);
    k.box(7, 3.6, 6, 0xe8e0d0, 8, 0, 6);
    k.cone(5.2, 2.2, 0x3f5f8f, 8, 3.6, 6, 4, Math.PI / 4);
    k.rect(4.5, 11.5, 3, 9);
    emit('lighthouse', L.lighthouse, k);
  }

  // ---- 風車 ----
  {
    const k = kit();
    k.cyl(3, 4.5, 14, 0xe8dcc0, 0, 0, 0, 8);
    k.cone(4, 4, 0xa0442f, 0, 14, 0, 8);
    k.box(1.4, 2.4, 0.2, 0x4a3020, 0, 0, 4.3);
    k.circle(0, 0, 4.4);
    const obj = emit('windmill', L.windmill, k);
    const blades = new THREE.Group();
    blades.position.set(0, 12, 3.8);
    const bm = new THREE.MeshLambertMaterial({ color: 0xf5efe0, flatShading: true });
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, 9, 0.15), bm);
      b.position.y = 4.8;
      const pivot = new THREE.Group();
      pivot.rotation.z = (i * Math.PI) / 2;
      pivot.add(b);
      blades.add(pivot);
    }
    blades.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    obj.add(blades);
    anims.push((dt) => { blades.rotation.z += dt * 0.7; });
  }

  // ---- 沼地の高床小屋 ----
  {
    const p = L.hut;
    p.h = island.height(p.x, p.z);
    const k = kit();
    for (const [x, z] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) { k.cyl(0.2, 0.25, 3.2, 0x4a3a28, x, -0.5, z, 6); k.circle(x, z, 0.35); }
    plank(k, 0, 0, 3.2, 3.2, 2.6, 2.6, 0x6b5236);
    k.box(5, 3, 5, 0x6b5a3a, 0, 2.6, -0.5);
    k.cone(4.4, 2.2, 0x4a5a2a, 0, 5.6, -0.5, 4, Math.PI / 4);
    plank(k, 0, 9.2, 1.1, 6, 2.6, 0, 0x6b5236, 0.3);
    addPlat(p, 0, 0, 3.2, 3.2, 2.6, 2.6);
    addPlat(p, 0, 9.2, 1.1, 6, 2.6, 0);
    emit('hut', p, k);
  }

  // ---- 見張り台（坂で上がれる） ----
  L.towers.forEach((t, i) => {
    const k = kit();
    for (const [x, z] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) { k.cyl(0.2, 0.25, 9.6, 0x6b4a2a, x, 0, z, 6); k.circle(x, z, 0.32); }
    plank(k, 0, 0, 2.2, 2.2, 6, 6, 0x8a6a42);
    for (const [x, z, ry] of [[0, 2.2, 0], [2.2, 0, Math.PI / 2], [-2.2, 0, Math.PI / 2]]) k.box(4.4, 1, 0.15, 0x6b4a2a, x, 6, z, ry);
    k.cone(3.6, 1.8, 0x7a4a2a, 0, 9.6, 0, 4, Math.PI / 4);
    plank(k, 0, -9.2, 1.1, 7, 0, 6, 0x8a6a42, 0.3);
    emit(`tower${i}`, t, k);
    addPlat(t, 0, 0, 2.2, 2.2, 6, 6);
    addPlat(t, 0, -9.2, 1.1, 7, 0, 6);
  });

  // ---- 橋 ----
  BRIDGES.forEach((b, i) => {
    const len = 46;
    const hl = len / 2;
    const s = Math.sin(b.yaw);
    const c = Math.cos(b.yaw);
    const yA = Math.max(island.height(b.x - s * hl, b.z - c * hl), 1.2) + 0.15;
    const yB = Math.max(island.height(b.x + s * hl, b.z + c * hl), 1.2) + 0.15;
    const p = { x: b.x, z: b.z, h: 0, yaw: b.yaw };
    const k = kit();
    plank(k, 0, 0, 2.8, hl, yA, yB, 0x8a6a42, 0.5);
    for (const sx of [-2.7, 2.7]) {
      const g = new THREE.BoxGeometry(0.2, 0.2, Math.hypot(len, yB - yA));
      g.rotateX(-Math.atan2(yB - yA, len));
      k.add(g, 0x5a4026, sx, (yA + yB) / 2 + 1.0, 0);
      for (let t = -hl + 2; t <= hl - 2; t += 4) {
        const y = yA + ((t + hl) / len) * (yB - yA);
        k.box(0.2, 1.1, 0.2, 0x5a4026, sx, y, t);
      }
    }
    // 橋脚（川底から橋板まで）
    for (const t of [-14, -5, 5, 14]) {
      const y = yA + ((t + hl) / len) * (yB - yA);
      for (const sx of [-2.4, 2.4]) k.cyl(0.4, 0.5, y + 6, 0x5a4026, sx, -6, t, 6);
    }
    emit(`bridge${i}`, p, k);
    platforms.add({ x: b.x, z: b.z, yaw: b.yaw, hw: 2.8, hl, y0: yA, y1: yB });
  });

  // ---- 地下の抜け道の入口 ----
  for (const t of L.tunnels) {
    const k = kit();
    const info = buildDungeon({ ...t, floors: 1 }, k, rnd);
    emit(`tunnel${t.id}`, t, k);
    const d = toWorld(t, info.door.x, info.door.z);
    acts.push({ x: d.x, z: d.z, r: 4.5, label: `${t.name}に入る（地下の抜け道）`, kind: 'tunnel', tunnel: t.id });
  }
  const ruinsTunnel = TUNNELS.find((t) => t.id === 'B');
  acts.push({ x: ruinsTunnel.x, z: ruinsTunnel.z, r: 3, label: `${ruinsTunnel.name}を降りる（地下の抜け道）`, kind: 'tunnel', tunnel: 'B' });

  // ---- 宝箱の置き場所 ----
  const chests = placeChests(island, colliders, rnd);
  {
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), new THREE.MeshLambertMaterial({ color: 0x8a5a2a }), chests.length);
    const lid = new THREE.InstancedMesh(new THREE.BoxGeometry(1.25, 0.25, 0.85), new THREE.MeshLambertMaterial({ color: 0x6b4220 }), chests.length);
    const band = new THREE.InstancedMesh(new THREE.BoxGeometry(1.27, 0.12, 0.87), new THREE.MeshBasicMaterial({ color: 0xffd54f }), chests.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    chests.forEach((c, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw);
      m.compose(new THREE.Vector3(c.x, c.y + 0.35, c.z), q, one);
      body.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(c.x, c.y + 0.82, c.z), q, one);
      lid.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(c.x, c.y + 0.66, c.z), q, one);
      band.setMatrixAt(i, m);
      acts.push({ x: c.x, z: c.z, r: 2, label: '宝箱を調べる', kind: 'chest', chest: i });
    });
    for (const o of [body, lid]) o.castShadow = true;
    group.add(body, lid, band);
    colliders.setGroup('chests', chests.map((c) => ({ x: c.x, z: c.z, r: 0.6 })));
  }

  return {
    group,
    acts,
    chests,
    houses,
    animate(dt) { for (const a of anims) a(dt); },
    nearest(px, pz) {
      let best = null;
      let bd = Infinity;
      for (const a of acts) {
        const d = Math.hypot(a.x - px, a.z - pz);
        if (d < a.r && d < bd) { bd = d; best = a; }
      }
      return best;
    },
  };
}

/** 宝箱：エリアごとに数を決めて、空いている場所に置く */
function placeChests(island, colliders, rnd) {
  const per = { town: 7, fort: 4, ruins: 5, forest: 5, harbor: 4, swamp: 3, windmill: 2, lighthouse: 2 };
  const out = [];
  const ok = (x, z) => {
    const h = island.height(x, z);
    if (h < 1.5 || riverDist(x, z) < 18) return null;
    const s = Math.abs(island.height(x + 1.5, z) - island.height(x - 1.5, z)) + Math.abs(island.height(x, z + 1.5) - island.height(x, z - 1.5));
    if (s > 1.4) return null;
    if (colliders.hits(x, z, h) || colliders.hits(x + 1.2, z, h) || colliders.hits(x - 1.2, z, h) || colliders.hits(x, z + 1.2, h) || colliders.hits(x, z - 1.2, h)) return null;
    if (out.some((c) => Math.hypot(c.x - x, c.z - z) < 18)) return null;
    return h;
  };
  for (const a of AREAS) {
    const n = per[a.id] || 0;
    for (let i = 0, tries = 0; i < n && tries < 200; tries++) {
      const ang = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * a.r * 0.85;
      const x = a.x + Math.sin(ang) * r;
      const z = a.z + Math.cos(ang) * r;
      const h = ok(x, z);
      if (h === null) continue;
      out.push({ x, z, y: h, yaw: rnd() * Math.PI * 2, area: a.id });
      i++;
    }
  }
  // 野原にもいくつか
  for (let i = 0, tries = 0; i < 8 && tries < 400; tries++) {
    const x = (rnd() - 0.5) * 760;
    const z = (rnd() - 0.5) * 760;
    const h = ok(x, z);
    if (h === null) continue;
    out.push({ x, z, y: h, yaw: rnd() * Math.PI * 2, area: 'field' });
    i++;
  }
  return out;
}
