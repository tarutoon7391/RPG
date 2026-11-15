// カメラ：一人称（既定）と三人称。3DGAME の RPG と同じ考え方（ヨーの正面 = (sin, cos)）
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const VIEW = {
  fov: 75,
  tpsFov: 60,
  sens: 0.0022,
  tpsSens: 0.0026,
  pitchLimit: 1.4,
  eyeHeight: 1.6,
  bob: 0.035,
};

export function createCameraRig(camera) {
  camera.rotation.order = 'YXZ';
  const rig = {
    mode: 'fps',
    yaw: Math.PI,
    look: 0,
    bobAmp: 0,
    tps: { pitch: 0.38, dist: 7, curDist: 7 },
    get fps() { return rig.mode === 'fps'; },
    setMode(mode) {
      rig.mode = mode;
      camera.fov = mode === 'fps' ? VIEW.fov : VIEW.tpsFov;
      camera.updateProjectionMatrix();
    },
    input(dx = 0, dy = 0, wheel = 0) {
      if (rig.fps) {
        rig.yaw -= dx * VIEW.sens;
        rig.look = clamp(rig.look - dy * VIEW.sens, -VIEW.pitchLimit, VIEW.pitchLimit);
      } else {
        rig.yaw -= dx * VIEW.tpsSens;
        rig.tps.pitch = clamp(rig.tps.pitch + dy * VIEW.tpsSens, -0.2, 1.3);
        rig.tps.dist = clamp(rig.tps.dist + wheel * 0.9, 3, 30);
      }
    },
    /** 入力（右・前）を地面上のベクトルに */
    toWorld(right, fwd) {
      const s = Math.sin(rig.yaw);
      const c = Math.cos(rig.yaw);
      return { x: s * fwd - c * right, z: c * fwd + s * right };
    },
    /**
     * @param me { pos, walking, walkPhase }
     * @param env { ground(x,z) → 地面の高さ, blocked(x,z,y) → 壁か, ceil → 天井の高さ（無ければ Infinity） }
     */
    update(dt, me, env) {
      if (rig.fps) {
        const amp = me.walking ? VIEW.bob : 0;
        rig.bobAmp += (amp - rig.bobAmp) * Math.min(1, dt * 8);
        const eye = me.swimming ? 0.35 : VIEW.eyeHeight;
        camera.position.set(me.pos.x, me.pos.y + eye + Math.sin(me.walkPhase * 2) * rig.bobAmp, me.pos.z);
        camera.rotation.set(rig.look, rig.yaw + Math.PI, 0);
        return;
      }
      const t = rig.tps;
      // 肩越し：注視点を頭の少し上・右肩側にずらす（画面中央の十字が遠くを向くように）
      const tx = me.pos.x - Math.cos(rig.yaw) * 0.6;
      const ty = me.pos.y + 2.3;
      const tz = me.pos.z + Math.sin(rig.yaw) * 0.6;
      const back = rig.yaw + Math.PI;
      const cp = Math.cos(t.pitch);
      const dx = Math.sin(back) * cp;
      const dy = Math.sin(t.pitch);
      const dz = Math.cos(back) * cp;
      let want = t.dist;
      for (let s = 0.6; s <= t.dist; s += 0.4) {
        const x = tx + dx * s;
        const y = ty + dy * s;
        const z = tz + dz * s;
        if (env.blocked(x, z, y)) { want = Math.max(1.2, s - 0.5); break; }
      }
      t.curDist += (want - t.curDist) * Math.min(1, dt * (want < t.curDist ? 20 : 5));
      const d = t.curDist;
      let cy = ty + dy * d;
      const cx = tx + dx * d;
      const cz = tz + dz * d;
      cy = Math.max(cy, env.ground(cx, cz) + 0.4);
      if (env.ceil < Infinity) cy = Math.min(cy, env.ceil - 0.3);
      camera.position.set(cx, cy, cz);
      camera.lookAt(tx, ty, tz);
    },
  };
  rig.setMode('fps');
  return rig;
}
