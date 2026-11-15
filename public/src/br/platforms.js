// 乗れる板（橋・桟橋・船の甲板・坂・見張り台）。向き付きの長方形で、長さ方向に高さが変わってもいい
const STEP = 1.3; // これくらいの段差までは上がれる

export function createPlatforms() {
  const list = [];
  return {
    list,
    /**
     * @param p { x, z, yaw, hw: 幅の半分, hl: 長さの半分, y0: 手前(-hl)の高さ, y1: 奥(+hl)の高さ }
     */
    add(p) {
      list.push({ ...p, y1: p.y1 ?? p.y0, c: Math.cos(p.yaw || 0), s: Math.sin(p.yaw || 0) });
    },
    /** (x, z) で curY から乗れる一番高い板の高さ（無ければ -Infinity） */
    heightAt(x, z, curY = Infinity) {
      let best = -Infinity;
      for (const p of list) {
        const dx = x - p.x;
        const dz = z - p.z;
        // ローカル（l = 長さ方向、w = 幅方向）。yaw の正面 (sin, cos) が長さ方向
        const l = dx * p.s + dz * p.c;
        const w = dx * p.c - dz * p.s;
        if (Math.abs(l) > p.hl || Math.abs(w) > p.hw) continue;
        const y = p.y0 + ((l + p.hl) / (2 * p.hl)) * (p.y1 - p.y0);
        if (y <= curY + STEP && y > best) best = y;
      }
      return best;
    },
  };
}
