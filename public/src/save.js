// セーブ（localStorage）。広さ・シードごとに別のセーブにする
import { WORLD } from './config.js';

const KEY = `rpg:world:${WORLD.sizeKm}:${WORLD.seed}`;
const DEFAULTS = () => ({ x: null, z: null, yaw: Math.PI, view: 'fps', regions: {}, entered: {}, cleared: {}, dungeon: null, ret: null, odo: 0, time: 0 });

export const store = {
  exists() {
    try { return !!localStorage.getItem(KEY); } catch { return false; }
  },
  load() {
    const d = DEFAULTS();
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && typeof raw === 'object') return { ...d, ...raw };
    } catch { /* 壊れていたら最初から */ }
    return d;
  },
  save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* 容量不足などは無視 */ }
  },
  fresh: DEFAULTS,
};
