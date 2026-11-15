// 中に入れる建物の部品：空洞の家・階段つきの大きい建物・螺旋階段の塔
// どれも kit（structures.js）に描画・当たり判定・乗れる板（k.plat）を足していく。座標はすべてローカル
// 当たり判定の rect / circle は top（これより上にいれば通れる）・bot（これより下にいれば通れる）を持てる
import * as THREE from 'three';

const T = 0.5; // 壁の厚さ

/** 面の向きを裏返す（筒の内側を見えるようにする） */
export function flipInside(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position.array;
  const n = g.attributes.normal.array;
  for (let i = 0; i < p.length; i += 9) {
    for (let j = 0; j < 3; j++) {
      const a = i + 3 + j;
      const b = i + 6 + j;
      [p[a], p[b]] = [p[b], p[a]];
      [n[a], n[b]] = [n[b], n[a]];
    }
  }
  for (let i = 0; i < n.length; i++) n[i] = -n[i];
  return g;
}

/** 傾けられる板（長さ方向 = ローカル z を ry だけ回す）。見た目と乗れる板の両方 */
export function plank(k, cx, cz, hw, hl, y0, y1, color, { thick = 0.3, ry = 0, walk = true } = {}) {
  const len = 2 * hl;
  const ang = Math.atan2(y1 - y0, len);
  const g = new THREE.BoxGeometry(hw * 2, thick, Math.hypot(len, y1 - y0));
  g.rotateX(-ang);
  k.add(g, color, cx, (y0 + y1) / 2 - thick / 2, cz, ry);
  if (walk) k.plat({ x: cx, z: cz, yaw: ry, hw, hl, y0, y1 });
}

/**
 * 空洞の家（1階建て）。扉は +z 側の真ん中
 */
export function hollowHouse(k, x, z, W, D, h, wallColor) {
  const dw = Math.min(2.4, W - 2.2); // 入口の穴の幅（扉は付けない）
  const dh = Math.min(2.7, h - 0.4);
  // 後ろ・左右
  k.box(W, h, T, wallColor, x, 0, z - D / 2 + T / 2);
  k.box(T, h, D, wallColor, x - W / 2 + T / 2, 0, z);
  k.box(T, h, D, wallColor, x + W / 2 - T / 2, 0, z);
  // 前（入口の穴）
  const side = (W - dw) / 2;
  k.box(side, h, T, wallColor, x - dw / 2 - side / 2, 0, z + D / 2 - T / 2);
  k.box(side, h, T, wallColor, x + dw / 2 + side / 2, 0, z + D / 2 - T / 2);
  k.box(dw, h - dh, T, wallColor, x, dh, z + D / 2 - T / 2);
  // 入口の石の縁（穴だと分かるように）
  const rim = 0x6b6258;
  k.box(0.25, dh, T + 0.2, rim, x - dw / 2 - 0.1, 0, z + D / 2 - T / 2);
  k.box(0.25, dh, T + 0.2, rim, x + dw / 2 + 0.1, 0, z + D / 2 - T / 2);
  k.box(dw + 0.45, 0.25, T + 0.2, rim, x, dh, z + D / 2 - T / 2);
  // 床（明るめの板張り）と天井、天井のランプ
  k.box(W - 0.1, 0.1, D - 0.1, 0xb08a5e, x, 0, z);
  k.box(W, 0.2, D, 0x8a7158, x, h - 0.2, z);
  k.box(0.6, 0.25, 0.6, 0xffe6a8, x, h - 0.45, z, 0, true);
  // 当たり判定（壁ごと）
  k.rect(x - W / 2, x + W / 2, z - D / 2, z - D / 2 + T);
  k.rect(x - W / 2, x - W / 2 + T, z - D / 2, z + D / 2);
  k.rect(x + W / 2 - T, x + W / 2, z - D / 2, z + D / 2);
  k.rect(x - W / 2, x - dw / 2 - 0.2, z + D / 2 - T, z + D / 2);
  k.rect(x + dw / 2 + 0.2, x + W / 2, z + D / 2 - T, z + D / 2);
}

/**
 * 階段つきの大きい建物（1〜3階＋平らな屋上）。扉は +z 側
 * @param o { x, z, w, d, floorH, floors, color, roof: 'flat'|'none', door: [幅, 高さ], pillars }
 */
export function bigBuilding(k, o) {
  const { x, z, w, d, floorH, floors, color } = o;
  const H = floorH * floors;
  const parapet = o.roof === 'flat' ? 1.3 : 0;
  const [dw, dh] = o.door || [3, 3.2];
  const wallH = H + parapet;
  // 壁（前は扉の穴）
  k.box(w, wallH, T, color, x, 0, z - d / 2 + T / 2);
  k.box(T, wallH, d, color, x - w / 2 + T / 2, 0, z);
  k.box(T, wallH, d, color, x + w / 2 - T / 2, 0, z);
  const side = (w - dw) / 2;
  k.box(side, wallH, T, color, x - dw / 2 - side / 2, 0, z + d / 2 - T / 2);
  k.box(side, wallH, T, color, x + dw / 2 + side / 2, 0, z + d / 2 - T / 2);
  k.box(dw, wallH - dh, T, color, x, dh, z + d / 2 - T / 2);
  k.rect(x - w / 2, x + w / 2, z - d / 2, z - d / 2 + T);
  k.rect(x - w / 2, x - w / 2 + T, z - d / 2, z + d / 2);
  k.rect(x + w / 2 - T, x + w / 2, z - d / 2, z + d / 2);
  k.rect(x - w / 2, x - dw / 2, z + d / 2 - T, z + d / 2);
  k.rect(x + dw / 2, x + w / 2, z + d / 2 - T, z + d / 2);
  k.rect(x - dw / 2, x + dw / 2, z + d / 2 - T, z + d / 2, undefined, dh); // 扉の上（2階以上では壁）
  k.box(w - 0.2, 0.12, d - 0.2, 0x6e6458, x, 0, z);
  // 窓（光る）
  for (let f = 0; f < floors; f++) {
    for (let i = 1; i < Math.floor(w / 5); i++) {
      const wx = x - w / 2 + i * (w / Math.floor(w / 5));
      if (Math.abs(wx - x) < dw / 2 + 0.8 && f === 0) continue;
      k.box(1, 1.3, 0.1, 0xffd88a, wx, f * floorH + floorH * 0.45, z + d / 2 + 0.03, 0, true);
      k.box(1, 1.3, 0.1, 0xffd88a, wx, f * floorH + floorH * 0.45, z - d / 2 - 0.03, 0, true);
    }
  }

  // 階段：階ごとに左右交互の壁ぞい。奥（-z）へ向かって上がる
  const slope = 0.6;
  const L = floorH / slope;
  const sw = 2.2; // 階段の幅
  const levels = o.roof === 'flat' ? floors : floors - 1; // 屋上まで上がるなら floors 本
  const holes = []; // 各階の床の穴（階段の上）
  for (let f = 0; f < levels; f++) {
    const left = f % 2 === 0;
    const sx = left ? x - w / 2 + T + sw / 2 + 0.1 : x + w / 2 - T - sw / 2 - 0.1;
    const zEnd = z - d / 2 + T + 1.2; // 上り切る位置（奥）
    const zStart = zEnd + L;
    const y0 = f * floorH;
    const y1 = y0 + floorH;
    // 段の見た目（板＋段）
    plank(k, sx, (zStart + zEnd) / 2, sw / 2, L / 2, y1, y0, 0x7a6a58, { thick: 0.35, ry: 0 });
    const steps = Math.round(floorH / 0.4);
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps;
      k.box(sw, 0.12, L / steps, 0x8c7c68, sx, y0 + t * floorH, zStart - t * L);
    }
    // 階段の下には入れない（高いところだけふさぐ。上っている人の体が引っかからないよう余裕を持たせる）
    const zBlock = zStart - L * (1.9 / floorH);
    k.rect(sx - sw / 2, sx + sw / 2, zEnd, zBlock, y0 + 1.0, y0);
    // 手すり
    k.box(0.12, 1, L, 0x5a4a3a, left ? sx + sw / 2 : sx - sw / 2, y0 + floorH / 2, (zStart + zEnd) / 2);
    // 上の階の床の穴：頭がぶつかる下半分だけ。上り切った先（奥の踊り場）は床がある
    holes.push({ minX: sx - sw / 2 - 0.1, maxX: sx + sw / 2 + 0.1, minZ: zEnd + L * (1.2 / floorH), maxZ: zStart + 0.2 });
  }
  // 上の階の床（穴をあける）＋屋上
  for (let f = 1; f <= floors; f++) {
    const y = f * floorH;
    if (f === floors && o.roof !== 'flat') break;
    const hole = holes[f - 1];
    slab(k, x - w / 2 + T, x + w / 2 - T, z - d / 2 + T, z + d / 2 - T, y, hole, f === floors ? 0x8a8478 : 0x7a6a58);
  }
  // 柱（大広間）
  for (const [px, pz] of o.pillars || []) {
    k.cyl(0.7, 0.8, floorH, color, x + px, 0, z + pz, 10);
    k.circle(x + px, z + pz, 0.9);
  }
  return { H };
}

/** 穴あきの床（長方形から穴の長方形を抜いた 4 枚）。見た目と乗れる板 */
function slab(k, minX, maxX, minZ, maxZ, y, hole, color) {
  const parts = hole
    ? [
      [minX, hole.minX, minZ, maxZ],
      [hole.maxX, maxX, minZ, maxZ],
      [hole.minX, hole.maxX, minZ, hole.minZ],
      [hole.minX, hole.maxX, hole.maxZ, maxZ],
    ]
    : [[minX, maxX, minZ, maxZ]];
  for (const [a, b, c, d] of parts) {
    if (b - a < 0.05 || d - c < 0.05) continue;
    k.box(b - a, 0.3, d - c, color, (a + b) / 2, y - 0.3, (c + d) / 2);
    k.plat({ x: (a + b) / 2, z: (c + d) / 2, yaw: 0, hw: (b - a) / 2, hl: (d - c) / 2, y0: y, y1: y });
  }
}

/**
 * 螺旋階段の塔。てっぺんは外に張り出したバルコニー（手すりの切れ目から撃ち下ろせる）
 * @param o { x, z, R: 外の半径, H: 高さ, door: 扉の向き（ヨー）, color, roofColor, rise: 1周で上がる高さ, stripe }
 */
export function spiralTower(k, o) {
  const { x, z, R, H, color } = o;
  const door = o.door ?? 0;
  const rise = o.rise ?? 5.5;
  const rIn = 0.8;
  const rOut = R - T - 0.05;
  const gap = 1.7 / R; // 扉の角度幅
  const segs = 16;
  const segA = (Math.PI * 2) / segs;
  // 外壁（扉の穴あき）と内壁（裏返し）。縞模様のときは段ごとに色を変える
  const bands = o.stripe ? Math.ceil(H / 4.4) : 1;
  for (let b = 0; b < bands; b++) {
    const y0 = (H / bands) * b;
    const hh = H / bands;
    const c = o.stripe && b % 2 ? o.stripe : color;
    const doorBand = y0 < 2.6;
    const ts = doorBand ? door + gap / 2 : 0;
    const tl = doorBand ? Math.PI * 2 - gap : Math.PI * 2;
    const outer = new THREE.CylinderGeometry(R, R, hh, 20, 1, true, ts, tl);
    k.add(outer, c, x, y0 + hh / 2, z);
    const inner = flipInside(new THREE.CylinderGeometry(R - T, R - T, hh, 20, 1, true, ts, tl));
    k.add(inner, 0xa09888, x, y0 + hh / 2, z);
    if (doorBand && hh > 2.6) {
      // 扉の上をふさぐ
      const top = new THREE.CylinderGeometry(R, R, hh - 2.6, 6, 1, true, door - gap / 2, gap);
      k.add(top, c, x, 2.6 + (hh - 2.6) / 2, z);
      k.add(flipInside(new THREE.CylinderGeometry(R - T, R - T, hh - 2.6, 6, 1, true, door - gap / 2, gap)), 0xa09888, x, 2.6 + (hh - 2.6) / 2, z);
    }
  }
  // 扉の枠
  k.box(0.3, 2.8, 0.6, 0x4a3a2a, x + Math.sin(door - gap / 2) * R, 0, z + Math.cos(door - gap / 2) * R, door);
  k.box(0.3, 2.8, 0.6, 0x4a3a2a, x + Math.sin(door + gap / 2) * R, 0, z + Math.cos(door + gap / 2) * R, door);
  // 床と中心の柱
  k.cyl(R - T, R - T, 0.15, 0x6e6458, x, 0, z, 16);
  k.cyl(rIn, rIn, H, 0x8a8478, x, 0, z, 10);
  k.circle(x, z, rIn + 0.1);
  // 外壁の当たり判定（扉は空ける）。てっぺんより上にいれば通れる
  const n = Math.ceil((2 * Math.PI * R) / 1.0);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const da = Math.atan2(Math.sin(a - door), Math.cos(a - door));
    if (Math.abs(da) < gap / 2 + 0.05) continue;
    k.cols.push({ x: x + Math.sin(a) * (R - T / 2), z: z + Math.cos(a) * (R - T / 2), r: T / 2 + 0.15, top: H - 0.6 });
  }
  // 螺旋階段：扉の右から上り始める
  const start = door + gap / 2 + segA * 0.6;
  const total = Math.ceil((H / rise) * segs);
  const dy = H / total;
  const rm = (rIn + rOut) / 2;
  const hw = (rOut - rIn) / 2;
  const hl = (rm * segA) / 2 * 1.08;
  let endA = start;
  for (let i = 0; i < total; i++) {
    const am = start + (i + 0.5) * segA;
    const y0 = i * dy;
    const y1 = y0 + dy;
    const yaw = Math.atan2(Math.cos(am), -Math.sin(am)); // 角度が増える向き
    plank(k, x + Math.sin(am) * rm, z + Math.cos(am) * rm, hw, hl, y0, y1, 0x9a8f80, { thick: 0.25, ry: yaw });
    endA = start + (i + 1) * segA;
  }
  // てっぺんの床（階段の出口のまわり 1/3 周は穴）とバルコニー
  const holeFrom = endA - (2 * Math.PI) / 3;
  const B = R + 2; // バルコニーの外の半径
  for (let i = 0; i < segs; i++) {
    const a0 = holeFrom + (2 * Math.PI) / 3 + i * segA; // = endA から一周
    const am = a0 + segA / 2;
    const inHole = i * segA > (Math.PI * 4) / 3 - 1e-6; // 最後の 1/3 周
    const yaw = Math.atan2(Math.cos(am), -Math.sin(am));
    // 内側（塔の中）と外側（バルコニー）に分けて、穴の方へはみ出さないようにする
    const pieces = inHole ? [[R - T, B]] : [[rIn, R - T], [R - T, B]];
    for (const [r0, r1] of pieces) {
      const rmF = (r0 + r1) / 2;
      const hwF = (r1 - r0) / 2 + 0.02;
      const hlF = (rmF * segA) / 2 * 1.04;
      plank(k, x + Math.sin(am) * rmF, z + Math.cos(am) * rmF, hwF, hlF, H, H, 0x8a8478, { thick: 0.35, ry: yaw });
    }
  }
  // バルコニーの手すり（ところどころ切れ目＝狙う窓）
  const rn = Math.ceil((2 * Math.PI * B) / 1.2);
  for (let i = 0; i < rn; i++) {
    const a = (i / rn) * Math.PI * 2;
    const px = x + Math.sin(a) * (B - 0.15);
    const pz = z + Math.cos(a) * (B - 0.15);
    const low = i % 3 === 1;
    k.box(1.05, low ? 0.55 : 1.15, 0.3, color, px, H, pz, a);
    k.cols.push({ x: px, z: pz, r: 0.45, bot: H - 0.3, top: H + 3 });
  }
  // 屋根（柱で持ち上げる）
  for (let i = 0; i < 4; i++) {
    const a = door + Math.PI / 4 + (i * Math.PI) / 2;
    k.cyl(0.22, 0.25, 3.4, color, x + Math.sin(a) * (R - 0.6), H, z + Math.cos(a) * (R - 0.6), 6);
    k.cols.push({ x: x + Math.sin(a) * (R - 0.6), z: z + Math.cos(a) * (R - 0.6), r: 0.35, bot: H - 0.3, top: H + 3.4 });
  }
  k.cone(R + 1.2, 3.2, o.roofColor ?? 0x3f5f8f, x, H + 3.4, z, 16);
  return { top: H };
}
