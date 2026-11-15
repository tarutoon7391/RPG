// 武器（形 × スキン）を 3D に組み立てる。地面の落とし物・手に持つ武器・図鑑のプレビューで共通
import * as THREE from 'three';
import { buildWeapon } from './model.js';
import { WEAPONS_BY_ID, RARITIES, skinColors } from './catalog.js';

export const HELD_SCALE = 1.45; // 一人称の大きさ → 体に持たせる大きさ（3DRPG と同じ）

const stdMat = (c, extra) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.2, flatShading: true, ...extra });

/**
 * @param {string} id 武器の id
 * @param {number} rarity レア度（0〜4）
 * @param {(c:number, extra:object)=>THREE.Material} [makeMat]
 */
export function buildSkinned(id, rarity, makeMat = stdMat) {
  const w = WEAPONS_BY_ID[id] || WEAPONS_BY_ID.swordsman;
  const built = buildWeapon(w.id, skinColors(w, rarity), makeMat);
  built.def = w;
  built.rarity = rarity;
  if (RARITIES[rarity]?.aura) built.group.add(makeAura(RARITIES[rarity].glow));
  return built;
}

/** レジェンドのキラキラ（武器のまわりを回る光の粒） */
function makeAura(color) {
  const n = 18;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pos[i * 3] = Math.cos(a) * 0.14;
    pos[i * 3 + 1] = (i % 6) * 0.12;
    pos[i * 3 + 2] = Math.sin(a) * 0.14;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 0.035, transparent: true, opacity: 0.9, depthWrite: false }));
  pts.userData.aura = true;
  pts.onBeforeRender = () => { pts.rotation.y = performance.now() / 600; };
  return pts;
}

/** 組み立てた武器を捨てる（形は使い回すので材質だけ） */
export function disposeBuilt(b) {
  if (!b) return;
  b.mats.forEach((m) => m.dispose());
  b.group.traverse((o) => { if (o.isPoints) { o.geometry.dispose(); o.material.dispose(); } });
}

/** 武器の大まかな大きさ（地面に置くときの向き決め用） */
export function holdUp(b) {
  return b.hold === 'up';
}
