// ダメージカカシ：島のあちこちに立っている練習用の的。倒れない（HP 無限）
// 当たると：揺れる・赤く光る・火花・ダメージの数字が浮かぶ（頭はクリティカル ×1.5 で黄色）。合計ダメージも頭の上に出す
import * as THREE from 'three';
import { AREAS, riverDist } from '../br/island.js';
import { mulberry32 } from '../noise.js';

const HEAD_MUL = 1.5;

function makeDummy(mats) {
  const g = new THREE.Group();
  const sway = new THREE.Group(); // 揺れる部分（足元を支点に）
  g.add(sway);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.2, 6), mats.wood);
  post.position.y = 1.1;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6).rotateZ(Math.PI / 2), mats.wood);
  bar.position.y = 1.55;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.95, 8), mats.sack);
  body.position.y = 1.25;
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.385, 0.385, 0.1, 8), mats.rope);
  belt.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), mats.sack);
  head.position.y = 2.0;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.32, 10), mats.hat);
  hat.position.y = 2.32;
  // 的の模様（胸）
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.17, 16), mats.red);
  ring.position.set(0, 1.3, 0.335);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), mats.red);
  dot.position.set(0, 1.3, 0.336);
  // 顔
  for (const sx of [-0.08, 0.08]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), mats.dark);
    eye.position.set(sx, 2.04, 0.25);
    sway.add(eye);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.02), mats.dark);
  mouth.position.set(0, 1.93, 0.24);
  // 腕のわら
  for (const sx of [-0.85, 0.85]) {
    const straw = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 6).rotateZ(sx > 0 ? -Math.PI / 2 : Math.PI / 2), mats.straw);
    straw.position.set(sx, 1.55, 0);
    sway.add(straw);
  }
  sway.add(post, bar, body, belt, head, hat, ring, dot, mouth);
  body.userData.part = 'body';
  belt.userData.part = 'body';
  ring.userData.part = 'body';
  dot.userData.part = 'body';
  head.userData.part = 'head';
  hat.userData.part = 'head';
  post.userData.part = 'body';
  bar.userData.part = 'body';
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, sway, flashMeshes: [body, head] };
}

/** 置き場所：エリアごとに 3 体＋野原にいくつか＋王城の大広間・砦の中庭 */
function placeDummies(island, colliders, layout) {
  const rnd = mulberry32(4242);
  const out = [];
  const ok = (x, z) => {
    const h = island.height(x, z);
    if (h < 1.2 || riverDist(x, z) < 16) return null;
    const s = Math.abs(island.height(x + 1, z) - island.height(x - 1, z)) + Math.abs(island.height(x, z + 1) - island.height(x, z - 1));
    if (s > 1.2) return null;
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (colliders.hits(x + dx, z + dz, h)) return null;
    if (out.some((d) => Math.hypot(d.x - x, d.z - z) < 10)) return null;
    return h;
  };
  for (const a of AREAS) {
    if (!a.r) continue;
    for (let i = 0, tries = 0; i < 3 && tries < 200; tries++) {
      const ang = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * a.r * 0.8;
      const x = a.x + Math.sin(ang) * r;
      const z = a.z + Math.cos(ang) * r;
      const h = ok(x, z);
      if (h === null) continue;
      out.push({ x, z, y: h, yaw: rnd() * Math.PI * 2 });
      i++;
    }
  }
  for (let i = 0, tries = 0; i < 8 && tries < 400; tries++) {
    const x = (rnd() - 0.5) * 700;
    const z = (rnd() - 0.5) * 700;
    const h = ok(x, z);
    if (h === null) continue;
    out.push({ x, z, y: h, yaw: rnd() * Math.PI * 2 });
    i++;
  }
  // 建物の中
  const T = layout.town;
  for (const [x, z] of [[-6, -48], [6, -48]]) out.push({ x: T.x + x, z: T.z + z, y: T.h, yaw: 0 });
  const F = layout.fort;
  for (const [x, z] of [[-12, 14], [12, 14]]) out.push({ x: F.x + x, z: F.z + z, y: F.h, yaw: Math.PI });
  return out;
}

export function createDummies(scene, island, colliders, layout) {
  const group = new THREE.Group();
  group.name = 'dummies';
  scene.add(group);
  const mats = {
    wood: new THREE.MeshLambertMaterial({ color: 0x6b4a2a, flatShading: true }),
    sack: new THREE.MeshLambertMaterial({ color: 0xd9c48e, flatShading: true, emissive: 0x000000 }),
    rope: new THREE.MeshLambertMaterial({ color: 0x8a6a3a }),
    hat: new THREE.MeshLambertMaterial({ color: 0x8a5a2a, flatShading: true }),
    straw: new THREE.MeshLambertMaterial({ color: 0xe8d27a, flatShading: true }),
    red: new THREE.MeshBasicMaterial({ color: 0xd32f2f, side: THREE.DoubleSide }),
    dark: new THREE.MeshBasicMaterial({ color: 0x2a2018 }),
  };
  const list = [];
  for (const p of placeDummies(island, colliders, layout)) {
    const m = makeDummy({ ...mats, sack: mats.sack.clone() });
    m.g.position.set(p.x, p.y, p.z);
    m.g.rotation.y = p.yaw;
    group.add(m.g);
    const d = { ...p, ...m, total: 0, hits: 0, wob: 0, wobDir: 1, flash: 0, sackMat: m.flashMeshes[0].material };
    m.flashMeshes[1].material = d.sackMat;
    m.g.traverse((o) => { if (o.isMesh) o.userData.dummy = d; });
    list.push(d);
  }
  colliders.setGroup('dummies', list.map((d) => ({ x: d.x, z: d.z, r: 0.45 })));

  // ---- ダメージの数字（画面に重ねる DOM。ワールドの位置を毎フレーム画面へ写す） ----
  const layer = document.createElement('div');
  layer.className = 'dmg-layer';
  document.body.appendChild(layer);
  const pops = []; // { el, pos, t, life, vy }
  const totals = new Map(); // dummy → el
  const v = new THREE.Vector3();

  function popNumber(pos, amount, crit) {
    const el = document.createElement('div');
    el.className = `dmg-num${crit ? ' crit' : ''}`;
    el.textContent = crit ? `${amount}!` : `${amount}`;
    layer.appendChild(el);
    pops.push({ el, pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.2, (Math.random() - 0.5) * 0.4)), t: 0, life: 0.9 });
  }

  /**
   * ダメージを入れる
   * @param d カカシ  amount 基本ダメージ  part 'head' ならクリティカル  point 当たった所  from 攻撃した位置（揺れる向き）
   * @returns 実際のダメージ
   */
  function damage(d, amount, part, point, from) {
    const crit = part === 'head';
    const dmg = Math.max(1, Math.round(amount * (crit ? HEAD_MUL : 1)));
    d.total += dmg;
    d.hits++;
    d.flash = 0.18;
    d.wob = Math.min(0.5, d.wob + 0.18 + dmg / 300);
    // 攻撃された向きと反対へ傾く
    if (from) d.wobAng = Math.atan2(d.x - from.x, d.z - from.z) - d.g.rotation.y;
    popNumber(point || v.set(d.x, d.y + 2, d.z), dmg, crit);
    showTotal(d);
    return { dmg, crit };
  }

  /** 爆発：半径の中のカカシ全部（遠いほど弱く） */
  function splash(point, radius, amount, from) {
    const hits = [];
    for (const d of list) {
      const dist = Math.hypot(d.x - point.x, d.z - point.z, (d.y + 1.2) - point.y);
      if (dist > radius) continue;
      const k = 1 - (dist / radius) * 0.6;
      hits.push(damage(d, amount * k, 'body', v.set(d.x, d.y + 1.6, d.z).clone(), from));
    }
    return hits;
  }

  function showTotal(d) {
    let el = totals.get(d);
    if (!el) {
      el = document.createElement('div');
      el.className = 'dmg-total';
      layer.appendChild(el);
      totals.set(d, el);
    }
    el.textContent = `合計 ${d.total}（${d.hits} 回）`;
    d.totalT = 6; // 6 秒たったら消す
  }

  function project(pos, el, camera, W, H) {
    v.copy(pos).project(camera);
    if (v.z > 1 || v.z < -1) { el.style.display = 'none'; return false; }
    el.style.display = 'block';
    el.style.transform = `translate(${((v.x + 1) / 2) * W}px, ${((1 - v.y) / 2) * H}px) translate(-50%, -50%)`;
    return true;
  }

  const tp = new THREE.Vector3();
  function update(dt, camera) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    for (const d of list) {
      if (d.wob > 0.001 || d.flash > 0) {
        d.wob *= Math.exp(-dt * 3);
        const t = performance.now() / 1000;
        const a = d.wobAng ?? 0;
        const tilt = Math.sin(t * 18) * d.wob * 0.5;
        d.sway.rotation.set(Math.cos(a) * tilt, 0, -Math.sin(a) * tilt);
        d.flash = Math.max(0, d.flash - dt);
        d.sackMat.emissive.setRGB(d.flash > 0 ? 0.9 : 0, d.flash > 0 ? 0.1 : 0, d.flash > 0 ? 0.05 : 0);
      }
      const el = totals.get(d);
      if (el) {
        d.totalT -= dt;
        if (d.totalT <= 0) { el.remove(); totals.delete(d); }
        else project(tp.set(d.x, d.y + 2.75, d.z), el, camera, W, H);
      }
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      p.t += dt;
      p.pos.y += dt * 1.4;
      const k = p.t / p.life;
      if (k >= 1) { p.el.remove(); pops.splice(i, 1); continue; }
      if (project(p.pos, p.el, camera, W, H)) {
        p.el.style.opacity = String(1 - Math.max(0, k - 0.6) / 0.4);
        p.el.style.transform += ` scale(${k < 0.12 ? 1.5 - k * 4 : 1})`;
      }
    }
  }

  return { group, list, damage, splash, update, setVisible(on) { layer.style.display = on ? 'block' : 'none'; } };
}
