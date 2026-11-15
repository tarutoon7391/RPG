// 一人称の手と武器（3DGAME の RPG の viewmodel.js の動きを移植）。別のシーンにして、深度を消してから上に描く
// 腕の作り：肩（off）→ 回転（pivot）→ 0.42m 先に手（hand）→ 持ち方（holder）→ ひねり（twist）→ 武器
// 振り方：剣は横薙ぎ→逆へ横薙ぎ→振りかぶって縦斬り（斧・鎌は刃を縦に）／槍は突き／拳は左右交互の突き／銃は反動／杖は前へ突き出して放つ
// 覗き込み（ADS）：銃・弓は画面の真ん中へ構える（スコープのときは手を隠す）
import * as THREE from 'three';
import { buildSkinned, disposeBuilt } from './view.js';
import { HOLD_ROT, HOLD_POS } from './model.js';

const SHOULDER = [0.36, -0.42, -0.42]; // 右肩（カメラ基準。3DRPG の VIEW.vm と同じ）
const LEFT_X = -0.72; // 左肩（右肩から見た位置）
const AIM_ROT = [-1.5, 0.12, 0]; // 槍を前へ向けたときの持ち方
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (k) => 1 - (1 - k) * (1 - k);
const smooth = (a, b, v) => {
  const k = clamp01((v - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const pose = () => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, twist: 0, aim: false });

/** 3DRPG の剣のコンボ（dur：1段の長さ、hit：当たる瞬間） */
const COMBO = {
  swing: [{ dur: 0.34, hit: 0.11 }, { dur: 0.34, hit: 0.11 }, { dur: 0.52, hit: 0.2 }],
  heavy: [{ dur: 0.5, hit: 0.18 }, { dur: 0.5, hit: 0.18 }, { dur: 0.7, hit: 0.3 }],
  thrust: [{ dur: 0.36, hit: 0.14 }, { dur: 0.36, hit: 0.14 }, { dur: 0.55, hit: 0.22 }],
  fist2: [{ dur: 0.22, hit: 0.08 }, { dur: 0.22, hit: 0.08 }, { dur: 0.22, hit: 0.08 }, { dur: 0.22, hit: 0.08 }, { dur: 0.4, hit: 0.15 }],
  fast: [{ dur: 0.24, hit: 0.08 }, { dur: 0.24, hit: 0.08 }, { dur: 0.36, hit: 0.14 }],
};

/** 縦斬り：振り上げ → 振り下ろし */
function vertical(P, raise, down) {
  P.ry = 0;
  P.rz = 0;
  P.twist = 0;
  P.x = -0.12;
  if (down <= 0) {
    const u = ease(raise);
    P.rx = 1.35 * u;
    P.y = 0.12 * u;
    P.z = 0.05 * u;
  } else {
    const u = ease(down);
    P.rx = 1.35 - 2.75 * u;
    P.y = 0.12 - 0.2 * u;
    P.z = 0.05 - 0.2 * u;
  }
}
/** 突き：構えて引き → 一気に前へ → 戻す */
function thrust(P, actT, hit, dur, reach) {
  if (actT < hit) {
    const k = actT / hit;
    P.z += 0.08 * ease(clamp01(k / 0.6)) - (0.08 + reach) * smooth(0.6, 1, k);
  } else {
    const r = clamp01((actT - hit) / Math.max(0.05, dur - hit));
    P.z += -reach * (1 - ease(r) * 0.85);
  }
}
const guard = (P) => { P.x -= 0.1; P.y += 0.14; P.z += 0.1; P.rx += 0.35; };

/** 星形の光（銃口） */
function starTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,220,140,0.9)');
  grd.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = grd;
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? 10 : 32;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  g.fill();
  return new THREE.CanvasTexture(c);
}

export function createViewModel(app) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.01, 10);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x606070, 1.6));
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.6);
  sun.position.set(0.6, 1, 0.4);
  scene.add(sun);
  const root = new THREE.Group();
  scene.add(root);

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.8, flatShading: true });
  const armMat = new THREE.MeshStandardMaterial({ color: 0x3a6fb0, roughness: 0.8, flatShading: true });
  function makeArm(baseX) {
    const off = new THREE.Group();
    off.position.set(baseX, 0, 0);
    root.add(off);
    const pivot = new THREE.Group();
    off.add(pivot);
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.42), armMat);
    sleeve.position.z = -0.19;
    pivot.add(sleeve);
    const hand = new THREE.Group();
    hand.position.z = -0.42;
    pivot.add(hand);
    hand.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), skinMat));
    const holder = new THREE.Group();
    hand.add(holder);
    const twist = new THREE.Group();
    holder.add(twist);
    return { off, pivot, hand, holder, twist, baseRot: null, weapon: null };
  }
  const R = makeArm(0);
  const L = makeArm(LEFT_X);

  const muzzleMat = new THREE.SpriteMaterial({ map: starTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const muzzle = new THREE.Sprite(muzzleMat);
  muzzle.visible = false;
  R.twist.add(muzzle);

  function resize() {
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();
  app.overlay = { scene, camera };

  // 状態
  let style = 'fist2';
  let hold = 'fist';
  let kind = 'melee'; // melee / shoot / cast
  let combo = COMBO.fist2;
  let lastV = false;
  let muzzlePos = null;
  let action = null; // 'attack' / 'shoot' / 'cast'
  let actT = 0;
  let step = 0; // コンボの段
  let fired = false;
  let fireT = 0; // 次に振れる・撃てるまで
  let muzzleT = 0;
  let ads = 0; // 0〜1（覗き込みの度合い）
  let visible = true;

  function arm(A, slot, mirror) {
    if (A.weapon) { A.twist.remove(A.weapon.group); disposeBuilt(A.weapon); A.weapon = null; }
    if (!slot) return null;
    const b = buildSkinned(slot.id, slot.rarity);
    b.group.traverse((o) => { if (o.userData.aura) o.material.size = 0.007; }); // レジェンドのキラキラは目の前だと大きいので小さく
    if (mirror) b.group.scale.x *= -1;
    A.twist.add(b.group);
    A.weapon = b;
    const r = b.rot || HOLD_ROT[b.hold] || HOLD_ROT.up;
    const hp = b.pos || HOLD_POS[b.hold] || HOLD_POS.up;
    A.holder.rotation.set(r[0], mirror ? -r[1] : r[1], mirror ? -r[2] : r[2]);
    A.baseRot = A.holder.rotation.clone();
    A.holder.position.set(mirror ? -hp[0] : hp[0], hp[1], hp[2]);
    return b;
  }

  /** 武器の形の一番前（-Z）を銃口とみなす（3DRPG と同じ考え方） */
  function autoMuzzle(b) {
    b.group.updateMatrix();
    const box = new THREE.Box3();
    let best = null;
    const m = new THREE.Matrix4();
    for (const o of b.group.children) {
      if (!o.isMesh) continue;
      o.geometry.computeBoundingBox();
      m.multiplyMatrices(b.group.matrix, o.matrix);
      box.copy(o.geometry.boundingBox).applyMatrix4(m);
      if (!best || box.min.z < best[2]) best = [(box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.min.z];
    }
    return best ? [best[0], best[1], best[2] - 0.02] : [0, 0, -0.3];
  }

  /**
   * 持つ武器を変える（null で素手）
   * @param def catalog の武器（種類で振り方を決める）
   */
  function set(slot, def) {
    action = null;
    const b = arm(R, slot, false);
    arm(L, b?.dual ? slot : null, true);
    if (!b) {
      style = 'fist2'; hold = 'fist'; kind = 'melee'; combo = COMBO.fist2; lastV = false; muzzlePos = null;
      return;
    }
    hold = b.hold;
    style = b.style;
    lastV = b.lastV;
    kind = def && !def.melee ? (def.type === 'staff' || def.type === 'odd' ? 'cast' : 'shoot') : 'melee';
    if (kind === 'melee' && hold === 'aim') kind = 'shoot';
    if (hold === 'fist') style = 'fist2';
    combo = style === 'thrust' ? COMBO.thrust : style === 'fist2' ? COMBO.fist2 : def?.type === 'dagger' ? COMBO.fast : def?.type === 'great' || def?.type === 'axe' || def?.type === 'blunt' ? COMBO.heavy : COMBO.swing;
    muzzlePos = kind === 'shoot' ? autoMuzzle(b) : null;
  }

  /** 攻撃を始める（interval は撃つ間隔）。始めたら true */
  function trigger(interval) {
    if (fireT > 0) return false;
    if (kind === 'melee') {
      step = action === 'attack' ? (step + 1) % combo.length : 0;
      action = 'attack';
      actT = 0;
      fired = false;
      fireT = combo[step].dur * 0.8;
    } else {
      action = kind;
      actT = 0;
      fired = false;
      fireT = interval;
    }
    return true;
  }

  /** 毎フレーム。戻り値 fire：このフレームが当たる瞬間（弾・斬撃を出す） */
  function update(dt, { walk = 0, phase = 0, lookDx = 0, lookDy = 0, aiming = false, scope = false } = {}) {
    fireT = Math.max(0, fireT - dt);
    ads += ((aiming ? 1 : 0) - ads) * Math.min(1, dt * 14);
    const Rp = pose();
    const Lp = pose();
    if (style === 'fist2') { guard(Rp); guard(Lp); }
    let fire = false;
    let last = false;
    if (action) {
      actT += dt;
      if (action === 'attack') {
        const c = combo[step];
        last = step === combo.length - 1;
        const k = Math.min(1, actT / (c.hit * 1.8));
        const e = ease(k);
        if (style === 'thrust') {
          Rp.aim = true;
          Rp.rx = 0.08; Rp.ry = 0.12; Rp.x -= 0.06; Rp.y += 0.02;
          thrust(Rp, actT, c.hit, c.dur, last ? 0.5 : 0.32);
          if (last) { Rp.twist = e * Math.PI * 2; Rp.rz = Math.sin(e * Math.PI) * 0.25; }
        } else if (style === 'fist2') {
          const P = step % 2 === 0 ? Rp : Lp;
          P.rx -= 0.35;
          P.x -= 0.04;
          thrust(P, actT, c.hit, c.dur, last ? 0.55 : 0.4);
        } else if (last && lastV) {
          vertical(Rp, Math.min(1, actT / (c.hit * 0.6)), Math.max(0, Math.min(1, (actT - c.hit * 0.6) / (c.hit * 0.5))));
        } else if (last) {
          Rp.rx = 0.7 - e * 1.6;
          Rp.x -= 0.1 * e;
          if (style === 'axe' || style === 'scythe') Rp.twist = Math.PI / 2;
        } else {
          const dir = step % 2 === 0 ? 1 : -1;
          Rp.ry = -dir * (0.6 - e * 1.4);
          Rp.rx = -1.05;
          Rp.rz = dir * 0.5;
          Rp.y += 0.24;
          Rp.x -= 0.16;
          if (style === 'scythe' && step === 0) Rp.twist = Math.PI;
        }
        if (!fired && actT >= c.hit) { fired = true; fire = true; }
        if (actT >= c.dur) action = null;
      } else if (action === 'shoot') {
        // 撃つ：一瞬で反動（後ろへ・銃口が上へ）→ 戻る
        const d = 0.2;
        const w = clamp01(actT / d);
        const kick = Math.sin(w * Math.PI) * (1 - w * 0.4);
        Rp.z += kick * 0.07 * (1 - ads * 0.5);
        Rp.rx += kick * 0.18 * (1 - ads * 0.6);
        if (!fired) { fired = true; fire = true; } // 銃口の光は出さない（スコープを覗くと見えなくなるため）
        if (actT >= d) action = null;
      } else if (action === 'cast') {
        // 杖・変わり種：前へ突き出して放つ
        const d = 0.35;
        const w = clamp01(actT / d);
        Rp.z -= Math.sin(w * Math.PI) * 0.14;
        Rp.rx += 0.6 - w * 0.4;
        if (!fired && actT >= d * 0.4) { fired = true; fire = true; }
        if (actT >= d) action = null;
      }
    }
    // 覗き込み：銃・弓を画面の真ん中へ寄せて、照準を目の前に
    if (ads > 0.001) {
      // 武器（手からずらして持っている分も含めて）が画面の真ん中に来るように
      Rp.x += (-SHOULDER[0] - R.holder.position.x) * ads;
      Rp.y += (0.3 - R.holder.position.y) * ads;
      Rp.z += 0.1 * ads;
    }
    const sway = 1 - ads * 0.85;
    root.position.set(
      SHOULDER[0] + (Math.cos(phase) * 0.012 * walk - lookDx * 0.0006) * sway,
      SHOULDER[1] + (-Math.abs(Math.sin(phase)) * 0.012 * walk + lookDy * 0.0006 + Math.sin(performance.now() / 600) * 0.003) * sway,
      SHOULDER[2],
    );
    R.off.position.set(Rp.x, Rp.y, Rp.z);
    R.pivot.rotation.set(Rp.rx, Rp.ry, Rp.rz, 'YXZ');
    R.twist.rotation.y = Rp.twist;
    if (Rp.aim) R.holder.rotation.set(AIM_ROT[0], AIM_ROT[1], AIM_ROT[2]);
    else if (R.baseRot) R.holder.rotation.copy(R.baseRot);
    L.off.visible = !!L.weapon || style === 'fist2';
    if (L.off.visible) {
      L.off.position.set(LEFT_X - Lp.x, Lp.y, Lp.z);
      L.pivot.rotation.set(Lp.rx, -Lp.ry, -Lp.rz, 'YXZ');
      L.twist.rotation.y = -Lp.twist;
    }
    if (muzzlePos && muzzleT > 0) {
      muzzle.visible = true;
      muzzle.position.set(muzzlePos[0], muzzlePos[1], muzzlePos[2]);
      muzzle.scale.setScalar(0.18 + Math.random() * 0.1);
      muzzleMat.rotation = Math.random() * 6.28;
      muzzleT -= dt;
    } else muzzle.visible = false;
    // スコープを覗いている間は手と銃を隠す（スコープの絵だけ）
    scene.visible = visible && !(scope && ads > 0.6);
    return { fire, last, step, ads };
  }

  const tmp = new THREE.Vector3();
  /** 弾が出る位置（カメラ基準の座標）。銃は銃口、それ以外は手 */
  function muzzleLocal(out = new THREE.Vector3()) {
    root.updateMatrixWorld(true);
    if (muzzlePos) return out.copy(R.twist.localToWorld(tmp.set(muzzlePos[0], muzzlePos[1], muzzlePos[2])));
    return out.copy(R.hand.getWorldPosition(tmp));
  }

  return {
    set,
    trigger,
    update,
    muzzleLocal,
    setVisible(v) { visible = v; scene.visible = v; },
    get kind() { return kind; },
  };
}
