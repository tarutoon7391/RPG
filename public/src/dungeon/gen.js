// ダンジョンの1フロアを作る（部屋＋通路）。シードから毎回同じ形になる
// grid: 0=壁 1=床 2=柱（通れない）
import { mulberry32 } from '../noise.js';

export const CELL = 4; // 1マスの一辺（m）
export const WALL_H = 5;

/**
 * @param {number} seed
 * @param {number} size 一辺のマス数（奇数）
 */
export function genFloor(seed, size) {
  const rnd = mulberry32(seed);
  const w = size;
  const h = size;
  const grid = new Uint8Array(w * h);
  const at = (x, z) => grid[z * w + x];
  const set = (x, z, v) => { if (x > 0 && z > 0 && x < w - 1 && z < h - 1) grid[z * w + x] = v; };
  const rooms = [];
  const target = Math.max(5, Math.floor((w * h) / 110));
  for (let tries = 0; tries < target * 12 && rooms.length < target; tries++) {
    const rw = 4 + Math.floor(rnd() * 8);
    const rh = 4 + Math.floor(rnd() * 8);
    const x = 1 + Math.floor(rnd() * (w - rw - 2));
    const z = 1 + Math.floor(rnd() * (h - rh - 2));
    if (rooms.some((r) => x < r.x + r.w + 2 && x + rw + 2 > r.x && z < r.z + r.h + 2 && z + rh + 2 > r.z)) continue;
    rooms.push({ x, z, w: rw, h: rh, cx: x + Math.floor(rw / 2), cz: z + Math.floor(rh / 2) });
  }
  for (const r of rooms) for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) set(x, z, 1);

  /** L 字の通路 */
  function corridor(a, b) {
    const wide = rnd() < 0.3;
    let x = a.cx;
    let z = a.cz;
    const horizFirst = rnd() < 0.5;
    const stepX = () => { while (x !== b.cx) { set(x, z, 1); if (wide) set(x, z + 1, 1); x += Math.sign(b.cx - x); } };
    const stepZ = () => { while (z !== b.cz) { set(x, z, 1); if (wide) set(x + 1, z, 1); z += Math.sign(b.cz - z); } };
    if (horizFirst) { stepX(); stepZ(); } else { stepZ(); stepX(); }
    set(x, z, 1);
  }
  for (let i = 1; i < rooms.length; i++) {
    let best = 0;
    let bd = Infinity;
    for (let j = 0; j < i; j++) {
      const d = Math.abs(rooms[i].cx - rooms[j].cx) + Math.abs(rooms[i].cz - rooms[j].cz);
      if (d < bd) { bd = d; best = j; }
    }
    corridor(rooms[i], rooms[best]);
  }
  // 少し輪っかを作る（行き止まりばかりにしない）
  const loops = Math.floor(rooms.length / 4);
  for (let i = 0; i < loops; i++) corridor(rooms[Math.floor(rnd() * rooms.length)], rooms[Math.floor(rnd() * rooms.length)]);

  // 大きい部屋には柱
  for (const r of rooms.slice(1)) {
    if (r.w < 8 || r.h < 8 || rnd() < 0.4) continue;
    for (let z = r.z + 2; z < r.z + r.h - 2; z += 3) for (let x = r.x + 2; x < r.x + r.w - 2; x += 3) if (x !== r.cx && z !== r.cz) set(x, z, 2);
  }

  // 入口の部屋から一番遠い部屋をゴールに
  const start = rooms[0];
  const dist = new Int32Array(w * h).fill(-1);
  const qx = [start.cx];
  const qz = [start.cz];
  dist[start.cz * w + start.cx] = 0;
  for (let k = 0; k < qx.length; k++) {
    const x = qx[k];
    const z = qz[k];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      if (at(nx, nz) !== 1 || dist[nz * w + nx] >= 0) continue;
      dist[nz * w + nx] = dist[z * w + x] + 1;
      qx.push(nx);
      qz.push(nz);
    }
  }
  let goal = rooms[rooms.length - 1];
  let gd = -1;
  for (const r of rooms) {
    const d = dist[r.cz * w + r.cx];
    if (d > gd) { gd = d; goal = r; }
  }

  // 松明（床に面した壁）
  const torches = [];
  for (let z = 1; z < h - 1; z++) {
    for (let x = 1; x < w - 1; x++) {
      if (at(x, z) !== 0) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (at(x + dx, z + dz) === 1 && rnd() < 0.045) torches.push({ x, z, dx, dz });
      }
    }
  }
  // 飾り（箱・樽・骨など）
  const deco = [];
  for (const r of rooms) {
    const n = Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const x = r.x + (rnd() < 0.5 ? 0 : r.w - 1);
      const z = r.z + Math.floor(rnd() * r.h);
      if (at(x, z) === 1 && !(x === start.cx && z === start.cz)) deco.push({ x, z, k: Math.floor(rnd() * 3) });
    }
  }

  return { w, h, grid, rooms, start: { x: start.cx, z: start.cz }, goal: { x: goal.cx, z: goal.cz }, torches, deco, steps: gd };
}

/** マス → ワールド座標（ダンジョンの中心が原点） */
export function cellToWorld(f, x, z) {
  return { x: (x - f.w / 2 + 0.5) * CELL, z: (z - f.h / 2 + 0.5) * CELL };
}
export function worldToCell(f, x, z) {
  return { x: Math.floor(x / CELL + f.w / 2), z: Math.floor(z / CELL + f.h / 2) };
}
