// 当たり判定：円（木・柱）と箱（家・壁）。グループ単位で出し入れし、16m の格子で引く
const G = 16;

export function createColliders() {
  const groups = new Map(); // name → shapes
  const grid = new Map(); // cellKey → Set(shape)
  const key = (i, j) => i * 73856093 + j;

  function bounds(s) {
    if (s.ring) return [s.x - s.rOut, s.x + s.rOut, s.z - s.rOut, s.z + s.rOut];
    return s.r !== undefined ? [s.x - s.r, s.x + s.r, s.z - s.r, s.z + s.r] : [s.minX, s.maxX, s.minZ, s.maxZ];
  }
  /** 筒の壁（塔）：扉の穴の中にいるか */
  function inDoor(s, x, z, y) {
    if (s.door === undefined || y >= s.doorTop) return false;
    const a = Math.atan2(x - s.x, z - s.z);
    return Math.abs(Math.atan2(Math.sin(a - s.door), Math.cos(a - s.door))) < s.gap;
  }
  function each(s, fn) {
    const [a, b, c, d] = bounds(s);
    for (let i = Math.floor(a / G); i <= Math.floor(b / G); i++) for (let j = Math.floor(c / G); j <= Math.floor(d / G); j++) fn(key(i, j));
  }

  /** グループを入れ替える（shapes が null なら削除） */
  function setGroup(name, shapes) {
    const old = groups.get(name);
    if (old) {
      for (const s of old) each(s, (k) => { const set = grid.get(k); if (set) { set.delete(s); if (!set.size) grid.delete(k); } });
      groups.delete(name);
    }
    if (!shapes || !shapes.length) return;
    groups.set(name, shapes);
    for (const s of shapes) each(s, (k) => { let set = grid.get(k); if (!set) grid.set(k, (set = new Set())); set.add(s); });
  }

  /**
   * 位置 (x,z) 半径 r の円を押し出す。y が top より上、または体（y〜y+1.8）が bot より下なら当たらない
   * px, pz は動く前の位置（筒の壁で内側・外側を決めるのに使う）
   * @returns {{x, z}} 補正後
   */
  function resolve(x, z, r, y = 0, px = x, pz = z) {
    for (let iter = 0; iter < 2; iter++) {
      const set = grid.get(key(Math.floor(x / G), Math.floor(z / G)));
      const near = [];
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const s2 = grid.get(key(Math.floor(x / G) + i, Math.floor(z / G) + j));
        if (s2) for (const s of s2) near.push(s);
      }
      if (!set && !near.length) break;
      for (const s of near) {
        if (s.top !== undefined && y > s.top) continue;
        if (s.bot !== undefined && y + 1.8 <= s.bot) continue;
        if (s.ring) {
          // 筒の壁：内側の人は内側に、外側の人は外側に留める（鎖状の円と違ってすき間が無い）
          const dx = x - s.x;
          const dz = z - s.z;
          const d = Math.hypot(dx, dz);
          if (d < s.rIn - r || d > s.rOut + r || d < 1e-6 || inDoor(s, x, z, y)) continue;
          // どっち側にいたかは「動く前の位置」で決める（速く動いても壁を抜けない）
          const inside = Math.hypot(px - s.x, pz - s.z) < (s.rIn + s.rOut) / 2;
          const m = inside ? s.rIn - r : s.rOut + r;
          x = s.x + (dx / d) * m;
          z = s.z + (dz / d) * m;
          continue;
        }
        if (s.r !== undefined) {
          const dx = x - s.x;
          const dz = z - s.z;
          const d = Math.hypot(dx, dz);
          const m = s.r + r;
          if (d < m && d > 1e-6) {
            x = s.x + (dx / d) * m;
            z = s.z + (dz / d) * m;
          }
        } else {
          const cx = Math.max(s.minX, Math.min(x, s.maxX));
          const cz = Math.max(s.minZ, Math.min(z, s.maxZ));
          const dx = x - cx;
          const dz = z - cz;
          const d = Math.hypot(dx, dz);
          if (d < r) {
            if (d > 1e-6) {
              x = cx + (dx / d) * r;
              z = cz + (dz / d) * r;
            } else {
              // 中にめり込んだら一番近い辺へ
              const opts = [[s.minX - r, z, x - s.minX], [s.maxX + r, z, s.maxX - x], [x, s.minZ - r, z - s.minZ], [x, s.maxZ + r, s.maxZ - z]];
              opts.sort((a, b) => a[2] - b[2]);
              x = opts[0][0];
              z = opts[0][1];
            }
          }
        }
      }
    }
    return { x, z };
  }

  /** 点が何かに当たっているか（カメラ用） */
  function hits(x, z, y = 0) {
    const set = grid.get(key(Math.floor(x / G), Math.floor(z / G)));
    if (!set) return false;
    for (const s of set) {
      if (s.top !== undefined && y > s.top) continue;
      if (s.bot !== undefined && y + 1.8 <= s.bot) continue;
      if (s.ring) {
        const d = Math.hypot(x - s.x, z - s.z);
        if (d > s.rIn && d < s.rOut && !inDoor(s, x, z, y)) return true;
        continue;
      }
      if (s.r !== undefined ? Math.hypot(x - s.x, z - s.z) < s.r : x > s.minX && x < s.maxX && z > s.minZ && z < s.maxZ) return true;
    }
    return false;
  }

  return { setGroup, resolve, hits, get count() { return groups.size; } };
}
