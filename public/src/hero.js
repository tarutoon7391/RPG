// 主人公の見た目（三人称のときに見える）。プリミティブのローポリ
import * as THREE from 'three';
import { buildSkinned, disposeBuilt, HELD_SCALE } from './weapons/view.js';

export function makeHero() {
  const group = new THREE.Group();
  const root = new THREE.Group();
  group.add(root);
  const m = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const skin = m(0xf1c9a5);
  const cloth = m(0x3a6fb0);
  const dark = m(0x2a2f3a);
  const cape = m(0xb03a3a);
  const metal = m(0xc8ccd4);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), cloth);
  body.position.y = 1.2;
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.1, 0.38), dark);
  belt.position.y = 0.9;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.78;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.46), m(0x4a3020));
  hair.position.y = 1.98;
  const capeM = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, 0.06), cape);
  capeM.position.set(0, 1.12, -0.22);
  root.add(body, belt, head, hair, capeM);

  const limb = (w, h, mat, x, y) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
    mesh.position.y = -h / 2;
    pivot.add(mesh);
    root.add(pivot);
    return pivot;
  };
  const armL = limb(0.18, 0.66, cloth, -0.41, 1.52);
  const armR = limb(0.18, 0.66, cloth, 0.41, 1.52);
  const legL = limb(0.22, 0.86, dark, -0.16, 0.86);
  const legR = limb(0.22, 0.86, dark, 0.16, 0.86);
  // 背中の剣
  const sword = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.04), metal);
  sword.position.set(0.15, 1.25, -0.27);
  sword.rotation.z = 0.5;
  root.add(sword);

  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  // 手に持つ武器（体の右手 = -X 側の腕）。3DRPG と同じく腕の先から腕の向きへ伸ばす
  const handR = armL; // 前（+Z）を向いた体の右手は -X 側
  const handL = armR;
  let held = [];
  let atk = 0;
  function setWeapon(slot) {
    for (const h of held) { h.holder.parent.remove(h.holder); disposeBuilt(h.built); }
    held = [];
    sword.visible = !slot;
    if (!slot) return;
    const put = (arm, mirror) => {
      const b = buildSkinned(slot.id, slot.rarity);
      b.group.scale.multiplyScalar(HELD_SCALE);
      if (mirror) b.group.scale.x *= -1;
      b.group.rotation.x = b.hold === 'aim' ? -Math.PI / 2 : Math.PI;
      b.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      const holder = new THREE.Group();
      holder.position.set(0, -0.66 + (b.hold === 'fist' ? 0.05 : 0.04), 0);
      holder.add(b.group);
      arm.add(holder);
      held.push({ holder, built: b });
      return b;
    };
    const b = put(handR, false);
    if (b.dual) put(handL, true);
  }
  function attack() { atk = 0.3; }

  /** 歩きのアニメ（phase は歩いた量、amp は 0〜1） */
  function animate(phase, amp, swim, dt = 0.016) {
    const s = Math.sin(phase) * 0.8 * amp;
    legL.rotation.x = s;
    legR.rotation.x = -s;
    armL.rotation.x = -s * 0.9;
    armR.rotation.x = s * 0.9;
    if (held.length) handR.rotation.x = -0.5 + s * 0.3; // 武器を少し前に構える
    if (atk > 0) {
      atk = Math.max(0, atk - dt);
      const k = 1 - atk / 0.3;
      handR.rotation.x = -2.6 + k * 2.6;
    }
    root.position.y = Math.abs(Math.cos(phase)) * 0.06 * amp;
    root.rotation.x = swim ? 1.2 : 0;
  }
  const tmpV = new THREE.Vector3();
  /** 右手の先のワールド座標（三人称で弾が出る位置） */
  function handWorld(out = new THREE.Vector3()) {
    group.updateMatrixWorld(true);
    return out.copy(handR.localToWorld(tmpV.set(0, -0.75, 0)));
  }
  return { group, root, animate, setWeapon, attack, handWorld };
}
