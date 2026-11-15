// 地面に落ちている武器：くるくる回って、レア度の色の光の柱が立つ。近くで F で拾う
import * as THREE from 'three';
import { buildSkinned, disposeBuilt } from './view.js';
import { RARITIES, WEAPONS_BY_ID } from './catalog.js';

const beamGeo = new THREE.CylinderGeometry(0.18, 0.35, 1, 10, 1, true).translate(0, 0.5, 0);
const ringGeo = new THREE.RingGeometry(0.55, 0.75, 24).rotateX(-Math.PI / 2);

export function createLoot(scene) {
  const group = new THREE.Group();
  group.name = 'loot';
  scene.add(group);
  const items = []; // { id, rarity, x, y, z, obj, built }
  const beamMats = RARITIES.map((r) => new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
  const ringMats = RARITIES.map((r) => new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
  let t = 0;

  /** 置く（y は地面の高さ） */
  function drop(id, rarity, x, y, z) {
    const obj = new THREE.Group();
    obj.position.set(x, y, z);
    const built = buildSkinned(id, rarity);
    const spin = new THREE.Group();
    // 立てる武器は斜めに、構える武器（銃など）は横向きに浮かべる
    if (built.hold === 'aim') built.group.rotation.y = Math.PI / 2;
    built.group.scale.multiplyScalar(1.7);
    built.group.position.y = built.hold === 'up' ? -0.35 : 0;
    spin.add(built.group);
    spin.position.y = 1.0;
    spin.rotation.z = built.hold === 'up' ? 0.35 : 0;
    obj.add(spin);
    built.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const beam = new THREE.Mesh(beamGeo, beamMats[rarity]);
    beam.scale.set(1, 2.6 + rarity * 0.9, 1);
    const ring = new THREE.Mesh(ringGeo, ringMats[rarity]);
    ring.position.y = 0.04;
    obj.add(beam, ring);
    group.add(obj);
    const it = { id, rarity, x, y, z, obj, spin, built, phase: Math.random() * 6 };
    items.push(it);
    return it;
  }

  function remove(it) {
    const i = items.indexOf(it);
    if (i < 0) return;
    items.splice(i, 1);
    group.remove(it.obj);
    disposeBuilt(it.built);
  }

  function update(dt, px, pz) {
    t += dt;
    for (const it of items) {
      // 遠いものは止めておく（軽くする）
      const far = Math.abs(it.x - px) > 120 || Math.abs(it.z - pz) > 120;
      it.obj.visible = !far;
      if (far) continue;
      it.spin.rotation.y += dt * 1.4;
      it.spin.position.y = 1.0 + Math.sin(t * 2 + it.phase) * 0.12;
    }
  }

  /** 近くの拾えるもの */
  function nearest(px, pz, py, r = 2.2) {
    let best = null;
    let bd = r;
    for (const it of items) {
      if (Math.abs(it.y - py) > 2.5) continue;
      const d = Math.hypot(it.x - px, it.z - pz);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  const label = (it) => `${WEAPONS_BY_ID[it.id].name}（${RARITIES[it.rarity].name}）を拾う`;

  return { group, items, drop, remove, update, nearest, label };
}
