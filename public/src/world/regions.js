// ワールドの「中身」を決める：ステージ（リージョン）・町・ダンジョン・城の配置と名前
// すべてシードから決まるので保存しなくても毎回同じ世界になる
import { mulberry32, seedOf } from '../noise.js';
import { WORLD } from '../config.js';
import { BIOMES } from './terrain.js';

const SYL = ['ア', 'ル', 'ミ', 'ナ', 'ガ', 'ド', 'ラ', 'セ', 'リ', 'オ', 'カ', 'ザ', 'ベ', 'ロ', 'ス', 'テ', 'ヴ', 'エ', 'ノ', 'グ', 'フィ', 'シア', 'レ', 'マ', 'ト', 'イ', 'ウ', 'ゼ', 'バ', 'ク', 'ディ', 'モ'];

function makeName(rnd) {
  const n = 2 + (rnd() < 0.55 ? 1 : 0) + (rnd() < 0.15 ? 1 : 0);
  let s = '';
  for (let i = 0; i < n; i++) s += SYL[Math.floor(rnd() * SYL.length)];
  if (rnd() < 0.25) s = s.slice(0, -1) + s.slice(-1) + 'ン';
  return s;
}

/** ダンジョンの種類（中の見た目・階の数え方） */
export const DUNGEON_TYPES = {
  cave: { label: '洞窟', up: false, wall: 0x6b5a48, floor: 0x3e342b, fog: 0x0d0a08, torch: 0xffb060 },
  ruin: { label: '古代遺跡', up: false, wall: 0x8a8576, floor: 0x55524a, fog: 0x0b0c0e, torch: 0x9fe0ff },
  tower: { label: '塔', up: true, wall: 0x9a9488, floor: 0x6a655c, fog: 0x14161c, torch: 0xffd27a },
  temple: { label: '神殿', up: false, wall: 0xc9ad6e, floor: 0x8e774a, fog: 0x140f08, torch: 0xffe08a },
  crypt: { label: '地下墓所', up: false, wall: 0x5d6358, floor: 0x33372f, fog: 0x070908, torch: 0x8affb0 },
  ice: { label: '氷穴', up: false, wall: 0xa9d4ec, floor: 0x7fa8c4, fog: 0x0a1420, torch: 0x9fe8ff },
  lava: { label: '溶岩洞', up: false, wall: 0x4a2a24, floor: 0x2a1714, fog: 0x1a0603, torch: 0xff5a20 },
  demon: { label: '魔王城', up: true, wall: 0x3a3048, floor: 0x241c2e, fog: 0x07040c, torch: 0xd070ff },
  castle: { label: '王城', up: true, wall: 0xd8d2c4, floor: 0x8c7b62, fog: 0x101318, torch: 0xffe6a8 },
};

const DUNGEON_BY_BIOME = {
  plain: ['ruin', 'tower', 'cave'],
  forest: ['ruin', 'cave', 'tower'],
  desert: ['temple', 'temple', 'ruin'],
  snow: ['ice', 'ice', 'tower'],
  swamp: ['crypt', 'crypt', 'ruin'],
  volcano: ['lava', 'lava', 'cave'],
  mountain: ['cave', 'tower', 'ice'],
};

/**
 * ワールドを生成する
 * @returns {{ regions, pois, capital, demon }}
 */
export function generateWorld(terrain) {
  const R = WORLD.regionSize;
  const N = WORLD.regions;
  const HALF = WORLD.half;
  const regions = [];
  const pois = [];
  const f = {};

  /** 置ける場所か（陸・高さ・傾き・ほかの場所との距離） */
  function okSpot(x, z, { minH = 4, maxH = 240, maxSlope = 0.45, gap = 260 } = {}) {
    const h = terrain.raw(x, z, f, 5);
    if (h < minH || h > maxH || f.land < 0.6) return null;
    const s = Math.hypot(terrain.raw(x + 6, z, null, 5) - terrain.raw(x - 6, z, null, 5), terrain.raw(x, z + 6, null, 5) - terrain.raw(x, z - 6, null, 5)) / 12;
    if (s > maxSlope) return null;
    for (const p of pois) if (Math.abs(p.x - x) < gap && Math.abs(p.z - z) < gap && Math.hypot(p.x - x, p.z - z) < gap) return null;
    return h;
  }
  function findSpot(rnd, cx, cz, span, opts, tries = 24) {
    for (let t = 0; t < tries; t++) {
      const x = cx + (rnd() - 0.5) * span;
      const z = cz + (rnd() - 0.5) * span;
      const h = okSpot(x, z, opts);
      if (h !== null) return { x, z, h };
    }
    return null;
  }

  // ---- 王都（中央の近く） ----
  const rc = mulberry32(seedOf(WORLD.seed, 'capital'));
  let cap = null;
  for (let rad = 0; rad < HALF && !cap; rad += 400) cap = findSpot(rc, 0, rad * 0.3, 400 + rad, { maxH: 120, maxSlope: 0.3, gap: 0 }, 40);
  cap = cap || { x: 0, z: 0, h: 10 };
  const capital = { id: 'capital', kind: 'capital', x: cap.x, z: cap.z, h: Math.max(cap.h, 6) + 1, r: 170, fall: 140, yaw: 0, name: '王都アステリア', loadR: 9000 };
  pois.push(capital);

  // ---- 各リージョン ----
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const cx = -HALF + (i + 0.5) * R;
      const cz = -HALF + (j + 0.5) * R;
      const rnd = mulberry32(seedOf(WORLD.seed, 'region', i, j));
      const id = j * N + i;
      const spot = findSpot(rnd, cx, cz, R * 0.8, { maxH: 320, maxSlope: 0.6 }, 30);
      const reg = { id, i, j, cx, cz, land: !!spot, biome: 'sea', name: '', stageNo: 0, pois: [] };
      regions.push(reg);
      if (!spot) {
        reg.name = `${makeName(rnd)}海域`;
        continue;
      }
      reg.biome = terrain.biomeAt(spot.x, spot.z);
      if (reg.biome === 'sea') reg.biome = 'plain';
      reg.name = makeName(rnd) + BIOMES[reg.biome].suffix;
      // ステージ碑（そのステージの目印）
      const mon = { id: `stage-${id}`, kind: 'stage', region: id, x: spot.x, z: spot.z, h: spot.h + 0.3, r: 10, fall: 22, yaw: rnd() * Math.PI * 2, name: `${reg.name}の碑`, loadR: 1600 };
      pois.push(mon);
      reg.pois.push(mon);
      reg.mx = spot.x;
      reg.mz = spot.z;

      // 町
      if (rnd() < 0.3) {
        const s = findSpot(rnd, cx, cz, R * 0.75, { maxH: 160, maxSlope: 0.32, gap: 420 });
        if (s) {
          const big = rnd() < 0.35;
          const town = { id: `town-${id}`, kind: 'town', region: id, x: s.x, z: s.z, h: Math.max(s.h, 5) + 0.5, r: big ? 95 : 65, fall: 80, yaw: 0, big, name: makeName(rnd) + (big ? 'の町' : '村'), loadR: 3500 };
          pois.push(town);
          reg.pois.push(town);
        }
      }
      // ダンジョン（1〜3）
      const nd = 1 + (rnd() < 0.65 ? 1 : 0) + (rnd() < 0.3 ? 1 : 0);
      const kinds = DUNGEON_BY_BIOME[reg.biome] || DUNGEON_BY_BIOME.plain;
      for (let d = 0; d < nd; d++) {
        const s = findSpot(rnd, cx, cz, R * 0.85, { maxH: 380, maxSlope: 0.55, gap: 300 });
        if (!s) continue;
        const type = kinds[Math.floor(rnd() * kinds.length)];
        const dn = { id: `dg-${id}-${d}`, kind: 'dungeon', region: id, type, x: s.x, z: s.z, h: s.h + 0.2, r: type === 'tower' ? 16 : 12, fall: 26, yaw: rnd() * Math.PI * 2, name: `${makeName(rnd)}の${DUNGEON_TYPES[type].label}`, loadR: type === 'tower' ? 7000 : 1800, seed: Math.floor(rnd() * 1e9) };
        pois.push(dn);
        reg.pois.push(dn);
      }
    }
  }

  // ---- 王都からの近さでステージ番号・ダンジョンの難しさを決める ----
  const land = regions.filter((r) => r.land);
  land.sort((a, b) => Math.hypot(a.mx - capital.x, a.mz - capital.z) - Math.hypot(b.mx - capital.x, b.mz - capital.z));
  land.forEach((r, k) => { r.stageNo = k + 1; });
  const maxD = Math.max(1, ...pois.map((p) => Math.hypot(p.x - capital.x, p.z - capital.z)));
  for (const p of pois) {
    if (p.kind !== 'dungeon') continue;
    const t = Math.hypot(p.x - capital.x, p.z - capital.z) / maxD; // 0〜1
    p.tier = 1 + Math.floor(t * 5); // 1〜6
    const r = mulberry32(p.seed);
    p.floors = Math.min(30, 2 + p.tier * 2 + Math.floor(r() * 4));
  }

  // ---- 魔王城：王都から一番遠い陸（火山があればそこ） ----
  const far = land.slice(-Math.max(1, Math.floor(land.length * 0.12)));
  const pick = far.find((r) => r.biome === 'volcano') || far[far.length - 1];
  let demon = null;
  if (pick) {
    const rd = mulberry32(seedOf(WORLD.seed, 'demon'));
    const s = findSpot(rd, pick.cx, pick.cz, R * 0.8, { maxH: 400, maxSlope: 0.6, gap: 350 }, 60) || { x: pick.mx + 300, z: pick.mz, h: 30 };
    demon = { id: 'demon', kind: 'dungeon', type: 'demon', region: pick.id, x: s.x, z: s.z, h: s.h + 1, r: 70, fall: 90, yaw: Math.atan2(capital.x - s.x, capital.z - s.z), name: '魔王城ネクロディア', loadR: 14000, tier: 7, floors: 30, seed: 666 };
    pois.push(demon);
    pick.pois.push(demon);
  }
  // 王城（王都の中心から入れる塔型ダンジョン）
  const keep = { id: 'castle', kind: 'dungeon', type: 'castle', region: -1, x: capital.x, z: capital.z - 40, h: capital.h, r: 0, fall: 0, yaw: 0, name: 'アステリア王城', loadR: 0, tier: 1, floors: 6, seed: 777, inCapital: true };
  pois.push(keep);

  terrain.setFlats(pois.filter((p) => p.r > 0));
  return { regions, pois, capital, demon };
}

/** 座標 → リージョン */
export function regionAt(world, x, z) {
  const N = WORLD.regions;
  const i = Math.floor((x + WORLD.half) / WORLD.regionSize);
  const j = Math.floor((z + WORLD.half) / WORLD.regionSize);
  if (i < 0 || j < 0 || i >= N || j >= N) return null;
  return world.regions[j * N + i];
}
