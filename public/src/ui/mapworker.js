// ワールドマップの絵を裏（Web Worker）で描く。地形の関数はメインと同じものを使う
import { createTerrain } from '../world/terrain.js';
import { generateWorld } from '../world/regions.js';
import { WORLD } from '../config.js';

const RES = Number(new URLSearchParams(self.location.search).get('res')) || 1024;
const terrain = createTerrain();
generateWorld(terrain); // 町などを平らにする情報を揃える
const step = WORLD.size / RES;
const f = {};
const col = [0, 0, 0];
const ROWS = 16;

for (let y0 = 0; y0 < RES; y0 += ROWS) {
  const n = Math.min(ROWS, RES - y0);
  const data = new Uint8ClampedArray(RES * n * 4);
  for (let r = 0; r < n; r++) {
    const z = -WORLD.half + (y0 + r + 0.5) * step;
    let prev = terrain.raw(-WORLD.half, z, null, 3);
    for (let x = 0; x < RES; x++) {
      const wx = -WORLD.half + (x + 0.5) * step;
      const h = terrain.sample(wx, z, f, 4);
      const diff = (h - prev) / step;
      prev = h;
      terrain.color(wx, z, f, 0.95, col);
      const shade = Math.max(0.55, Math.min(1.35, 1 + diff * 2.2));
      let rr = col[0] * shade;
      let g = col[1] * shade;
      let b = col[2] * shade;
      if (h < WORLD.sea) {
        const d = Math.min(1, -h / 60);
        rr = 0.22 - d * 0.12; g = 0.5 - d * 0.2; b = 0.72 - d * 0.18;
      }
      const i = (r * RES + x) * 4;
      data[i] = Math.sqrt(Math.max(0, rr)) * 255;
      data[i + 1] = Math.sqrt(Math.max(0, g)) * 255;
      data[i + 2] = Math.sqrt(Math.max(0, b)) * 255;
      data[i + 3] = 255;
    }
  }
  self.postMessage({ y0, n, res: RES, data }, [data.buffer]);
}
self.postMessage({ done: true });
