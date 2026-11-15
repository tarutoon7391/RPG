// 飛び道具と攻撃の見た目：銃の曳光弾・矢・魔法の玉・ロケット・炎・投げ物・爆弾、近接の斬撃の弧、当たった所の火花
// 見た目だけ（ダメージはまだ無い）。狙いは画面中央の十字の先
import * as THREE from 'three';

/** 武器 → 飛ばす物 */
export function shotOf(def) {
  if (!def) return { kind: 'punch' };
  const id = def.id;
  if (id === 'rocketeer') return { kind: 'rocket', speed: 180 };
  if (id === 'flamer') return { kind: 'flame', speed: 45 };
  if (id === 'fortress') return { kind: 'shell', speed: 260 };
  if (id === 'stickybomber') return { kind: 'goo', speed: 110, gravity: 10 };
  if (id === 'laser') return { kind: 'beam', speed: 2000 };
  if (id === 'bomber' || id === 'alchemist') return { kind: 'bomb', speed: 80, gravity: 12 };
  if (id === 'sniper') return { kind: 'bullet', speed: 1200 };
  if (def.type === 'gun' || def.type === 'heavy') return { kind: 'bullet', speed: 700 };
  if (def.type === 'bow') return { kind: 'arrow', speed: 240, gravity: 3 };
  if (def.type === 'throw') return { kind: 'spin', speed: 110, gravity: 5 };
  if (def.type === 'staff' || def.type === 'odd') return { kind: 'orb', speed: 160 };
  return { kind: 'slash' };
}

const GEO = {
  tracer: new THREE.BoxGeometry(0.04, 0.04, 4.5), // 速いので長め
  arrow: (() => {
    const s = new THREE.CylinderGeometry(0.015, 0.015, 0.8, 5).rotateX(Math.PI / 2);
    return s;
  })(),
  arrowHead: new THREE.ConeGeometry(0.035, 0.12, 4).rotateX(-Math.PI / 2).translate(0, 0, -0.45),
  orb: new THREE.IcosahedronGeometry(0.16, 1),
  rocket: new THREE.CylinderGeometry(0.07, 0.07, 0.6, 8).rotateX(Math.PI / 2),
  rocketHead: new THREE.ConeGeometry(0.07, 0.18, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.39),
  ball: new THREE.SphereGeometry(0.14, 10, 8),
  spin: new THREE.BoxGeometry(0.42, 0.04, 0.1),
  beam: new THREE.CylinderGeometry(0.035, 0.035, 1, 6).rotateX(Math.PI / 2).translate(0, 0, -0.5),
  slash: new THREE.RingGeometry(1.0, 1.45, 24, 1, -0.9, 1.8),
};

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createProjectiles(scene) {
  const group = new THREE.Group();
  group.name = 'projectiles';
  scene.add(group);
  const glowTex = glowTexture();
  const live = []; // { obj, pos, vel, gravity, left, kind, to, onHit }
  const fx = []; // 火花・斬撃など { obj, t, life, update }
  const v = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const fwd = new THREE.Vector3(0, 0, -1);

  const basic = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false });
  const sprite = (color, size, opacity = 1) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.setScalar(size);
    return s;
  };

  /** 当たった所の火花 */
  function burst(pos, color = 0xffd27a, size = 1, n = 10) {
    const g = new THREE.Group();
    g.position.copy(pos);
    const parts = [];
    for (let i = 0; i < n; i++) {
      const s = sprite(color, 0.18 * size);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar((2 + Math.random() * 4) * size);
      parts.push({ s, dir });
      g.add(s);
    }
    const flash = sprite(color, 1.1 * size, 0.9);
    g.add(flash);
    group.add(g);
    fx.push({ obj: g, t: 0, life: 0.35, update(dt, k) {
      for (const p of parts) { p.s.position.addScaledVector(p.dir, dt); p.dir.y -= dt * 6; p.s.material.opacity = 1 - k; }
      flash.scale.setScalar((1.1 + k) * size);
      flash.material.opacity = 0.9 * (1 - k);
    } });
  }

  /** 爆発（ロケット・爆弾） */
  function explode(pos, color = 0xff8a3d) {
    burst(pos, color, 2.2, 18);
    const s = sprite(0xffe0b2, 1, 1);
    s.position.copy(pos);
    group.add(s);
    fx.push({ obj: s, t: 0, life: 0.45, update(dt, k) { s.scale.setScalar(1 + k * 6); s.material.opacity = 1 - k; } });
  }

  /** 近接の斬撃の弧（カメラの前）。step で向きを変える（横・逆横・縦） */
  function slash(camera, step, last, color = 0xffffff, dist = 1.3) {
    const m = new THREE.Mesh(GEO.slash, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    camera.getWorldDirection(v);
    m.position.copy(camera.position).addScaledVector(v, dist);
    m.quaternion.copy(camera.quaternion);
    // 横に薙ぐ：弧を水平に／縦斬り：縦に
    if (last) m.rotateZ(Math.PI / 2);
    else m.rotateZ(step % 2 === 0 ? 0 : Math.PI);
    m.rotateX(-Math.PI / 2.4);
    group.add(m);
    fx.push({ obj: m, t: 0, life: 0.16, update(dt, k) { m.material.opacity = 0.8 * (1 - k); m.scale.setScalar(1 + k * 0.25); } });
  }

  /**
   * 飛ばす
   * @param shot shotOf の結果
   * @param from 出る位置（ワールド） to 狙う位置（ワールド）
   * @param color 光る色（スキン）
   */
  function fire(shot, from, to, color = 0xffd54f, onArrive = null) {
    const dir = v.copy(to).sub(from);
    const dist = dir.length();
    dir.normalize();
    const obj = new THREE.Group();
    obj.position.copy(from);
    q.setFromUnitVectors(fwd, dir);
    obj.quaternion.copy(q);
    let speed = shot.speed;
    let life = dist / speed;
    const k = shot.kind;
    if (k === 'bullet') {
      obj.add(new THREE.Mesh(GEO.tracer, basic(0xfff1a8))); // 弾の筋だけ（光の玉は付けない）
    } else if (k === 'beam') {
      // 光線：一瞬で伸びる
      const b = new THREE.Mesh(GEO.beam, basic(color));
      b.scale.z = dist;
      obj.add(b, sprite(color, 0.5));
      group.add(obj);
      fx.push({ obj, t: 0, life: 0.12, update(_dt, kk) { b.material.opacity = 1 - kk; } });
      burst(to, color, 0.8);
      onArrive?.();
      return;
    } else if (k === 'arrow') {
      obj.add(new THREE.Mesh(GEO.arrow, basic(0x8d6e63)), new THREE.Mesh(GEO.arrowHead, basic(0xcfd8dc)));
    } else if (k === 'orb') {
      obj.add(new THREE.Mesh(GEO.orb, basic(color)), sprite(color, 0.9, 0.9));
    } else if (k === 'rocket') {
      obj.add(new THREE.Mesh(GEO.rocket, basic(0x556b2f)), new THREE.Mesh(GEO.rocketHead, basic(0xd32f2f)), sprite(0xff9800, 0.6));
    } else if (k === 'shell') {
      obj.add(new THREE.Mesh(GEO.ball, basic(0x37474f)), sprite(0xffcc80, 0.4, 0.6));
    } else if (k === 'goo') {
      obj.add(new THREE.Mesh(GEO.ball, basic(0x76ff03)), sprite(0xb2ff59, 0.6, 0.7));
    } else if (k === 'bomb') {
      obj.add(new THREE.Mesh(GEO.ball, basic(0x212121)), sprite(0xffab40, 0.25));
    } else if (k === 'spin') {
      obj.add(new THREE.Mesh(GEO.spin, basic(0xcfd8dc)));
    } else if (k === 'flame') {
      // 炎：オレンジの玉をいくつか散らして短く飛ばす
      for (let i = 0; i < 6; i++) {
        const s = sprite(i % 2 ? 0xff6d00 : 0xffd180, 0.5, 0.8);
        const o = new THREE.Group();
        o.position.copy(from);
        o.add(s);
        group.add(o);
        const d2 = dir.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15)).normalize();
        const len = Math.min(dist, 30);
        fx.push({ obj: o, t: 0, life: len / speed, update(dt, kk) { o.position.addScaledVector(d2, speed * dt); s.scale.setScalar(0.5 + kk * 1.6); s.material.opacity = 0.8 * (1 - kk); } });
      }
      if (dist <= 30) { burst(to, 0xff6d00, 0.7, 6); onArrive?.(); }
      return;
    }
    group.add(obj);
    const vel = dir.clone().multiplyScalar(speed);
    // 重力のある物は、落ちる分だけ少し上へ向けて投げる
    if (shot.gravity) vel.y += (shot.gravity * life) / 2;
    live.push({ obj, vel, gravity: shot.gravity || 0, left: life, kind: k, to: to.clone(), color, onArrive });
  }

  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.left -= dt;
      p.vel.y -= p.gravity * dt;
      p.obj.position.addScaledVector(p.vel, dt);
      if (p.gravity) p.obj.quaternion.setFromUnitVectors(fwd, v.copy(p.vel).normalize());
      if (p.kind === 'spin') p.obj.children[0].rotation.y += dt * 25;
      if (p.left <= 0) {
        p.onArrive?.();
        if (p.kind === 'rocket' || p.kind === 'bomb' || p.kind === 'shell') explode(p.to);
        else burst(p.to, p.kind === 'orb' ? p.color : p.kind === 'goo' ? 0x76ff03 : 0xffd27a, p.kind === 'bullet' ? 0.6 : 0.9);
        group.remove(p.obj);
        p.obj.traverse((o) => { if (o.material) o.material.dispose(); });
        live.splice(i, 1);
      }
    }
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.life);
      f.update(dt, k);
      if (k >= 1) {
        group.remove(f.obj);
        f.obj.traverse((o) => { if (o.material) o.material.dispose(); });
        fx.splice(i, 1);
      }
    }
  }

  return { fire, slash, burst, explode, update, get count() { return live.length + fx.length; } };
}
