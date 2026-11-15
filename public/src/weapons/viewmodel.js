// 一人称の手と武器（画面の右下）。別のシーンにして、壁にめり込まないよう深度を消してから上に描く
// 攻撃（左クリック・攻撃ボタン）で振る／突く／殴る／撃つの動きだけする（ダメージはまだ無い）
import * as THREE from 'three';
import { buildSkinned, disposeBuilt } from './view.js';
import { HOLD_ROT, HOLD_POS } from './model.js';

const BASE = new THREE.Vector3(0.36, -0.42, -0.84); // 右手の基本位置（カメラから見て。3DRPG の肩 (0.36,-0.42,-0.42) から腕 0.42m 先）

export function createViewModel(app) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.01, 10); // 一人称の視野角と同じ
  scene.add(new THREE.HemisphereLight(0xffffff, 0x606070, 1.6));
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.6);
  sun.position.set(0.6, 1, 0.4);
  scene.add(sun);

  const root = new THREE.Group(); // 揺れ
  scene.add(root);
  const holder = new THREE.Group(); // 右手
  holder.position.copy(BASE);
  root.add(holder);
  const skin = new THREE.MeshStandardMaterial({ color: 0xf1c9a5, roughness: 0.8, flatShading: true });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x3a6fb0, roughness: 0.8, flatShading: true });
  const makeHand = () => {
    const g = new THREE.Group();
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), skin);
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.42), cloth);
    sleeve.position.set(0, 0, 0.23);
    g.add(hand, sleeve);
    return g;
  };
  const handR = makeHand();
  holder.add(handR);
  const twist = new THREE.Group(); // 武器の向き
  holder.add(twist);
  // 素手のときの左手
  const holderL = new THREE.Group();
  holderL.position.set(-BASE.x, BASE.y, BASE.z);
  const handL = makeHand();
  handL.scale.x = -1;
  holderL.add(handL);
  root.add(holderL);

  let built = null;
  let dualBuilt = null;
  let style = 'fist2';
  let hold = 'fist';
  let atk = 0; // 攻撃アニメの残り（秒）
  let atkLen = 0.3;
  let combo = 0;
  let bob = 0;
  let visible = true;

  function resize() {
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();
  app.overlay = { scene, camera };

  /** 持つ武器を変える（null で素手） */
  function set(slot) {
    if (built) { twist.remove(built.group); disposeBuilt(built); built = null; }
    if (dualBuilt) { holderL.remove(dualBuilt.group); disposeBuilt(dualBuilt); dualBuilt = null; }
    twist.rotation.set(0, 0, 0);
    twist.position.set(0, 0, 0);
    if (!slot) {
      style = 'fist2';
      hold = 'fist';
      holderL.visible = true;
      return;
    }
    built = buildSkinned(slot.id, slot.rarity);
    hold = built.hold;
    style = hold === 'aim' ? 'shoot' : built.style;
    const r = built.rot || HOLD_ROT[hold] || HOLD_ROT.up;
    const p = built.pos || HOLD_POS[hold] || HOLD_POS.up;
    twist.rotation.set(r[0], r[1], r[2]);
    twist.position.set(p[0], p[1], p[2]);
    twist.add(built.group);
    // レジェンドのキラキラは目の前だと大きすぎるので小さく
    built.group.traverse((o) => { if (o.userData.aura) o.material.size = 0.007; });
    if (built.dual) {
      dualBuilt = buildSkinned(slot.id, slot.rarity);
      dualBuilt.group.scale.x *= -1;
      dualBuilt.group.rotation.set(r[0], -r[1], -r[2]);
      dualBuilt.group.position.set(-p[0], p[1], p[2]);
      holderL.add(dualBuilt.group);
    }
    holderL.visible = !!built.dual || style === 'fist2';
  }

  /** 攻撃の動きを始める */
  function attack() {
    if (atk > 0.05) return false;
    combo = (combo + 1) % 3;
    atkLen = style === 'shoot' ? 0.18 : style === 'thrust' ? 0.32 : style === 'fist2' ? 0.22 : style === 'axe' || style === 'scythe' ? 0.45 : 0.3;
    atk = atkLen;
    return true;
  }

  /**
   * @param walk 0〜1（歩きの強さ）
   */
  function update(dt, walk, phase) {
    bob += (walk - bob) * Math.min(1, dt * 8);
    root.position.set(Math.cos(phase) * 0.012 * bob, Math.abs(Math.sin(phase)) * -0.018 * bob, 0);
    // 待機の揺れ
    const tt = performance.now() / 1000;
    root.position.y += Math.sin(tt * 1.6) * 0.004;
    holder.position.copy(BASE);
    holder.rotation.set(0, 0, 0);
    holderL.position.set(-BASE.x, BASE.y, BASE.z);
    holderL.rotation.set(0, 0, 0);
    if (atk > 0) {
      atk = Math.max(0, atk - dt);
      const k = 1 - atk / atkLen; // 0→1
      const s = Math.sin(k * Math.PI); // 0→1→0
      if (style === 'shoot') {
        holder.position.z += s * 0.07;
        holder.rotation.x = s * 0.22;
      } else if (style === 'thrust') {
        holder.position.z -= s * 0.32;
        holder.position.x -= s * 0.08;
      } else if (style === 'fist2' || style === 'fist') {
        const left = style === 'fist2' && combo % 2 === 1;
        const H = left ? holderL : holder;
        H.position.z -= s * 0.3;
        H.position.x += (left ? 1 : -1) * s * 0.1;
      } else {
        // 振る：右上から左下へ（3段目は縦）
        const vertical = combo === 2 || style === 'axe';
        const a = -1.1 + k * 2.4;
        if (vertical) {
          holder.rotation.x = -a * 0.9;
          holder.position.y += Math.cos(k * Math.PI) * 0.06;
        } else {
          holder.rotation.z = (combo === 1 ? -a : a) * 0.7;
          holder.rotation.y = (combo === 1 ? 1 : -1) * s * 0.5;
          holder.position.x -= s * 0.12;
        }
      }
    }
    scene.visible = visible;
  }

  return {
    set,
    attack,
    update,
    setVisible(v) { visible = v; scene.visible = v; },
    get style() { return style; },
  };
}
