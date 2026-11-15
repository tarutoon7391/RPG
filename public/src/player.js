// プレイヤー：歩く・走る・跳ぶ・泳ぐ。入力は intent（データ）で受け取る
import { MOVE, WORLD } from './config.js';
import { makeHero } from './hero.js';

export function emptyIntent(o = {}) {
  o.moveX = 0; o.moveZ = 0; o.dash = false; o.jump = false; o.interact = false;
  return o;
}

export function createPlayer(scene) {
  const hero = makeHero();
  scene.add(hero.group);
  const p = {
    hero,
    pos: hero.group.position,
    vy: 0,
    grounded: true,
    swimming: false,
    walking: false,
    walkPhase: 0,
    yaw: Math.PI,
    boost: false,
    gliding: false, // 降下中（ゆっくり落ちて、空中でも動ける）
    speed: 0,
    odometer: 0, // 歩いた距離（m）
    place(x, z, y) {
      p.pos.set(x, y, z);
      p.vy = 0;
      p.grounded = true;
    },
    /**
     * @param env { ground(x,z), move(pos, dx, dz) → 当たり判定込みで動かす, water: bool }
     * @param dirX dirZ ワールドの移動方向（長さ 0〜1）
     */
    update(dt, intent, dir, env) {
      const len = Math.hypot(dir.x, dir.z);
      let speed = p.boost ? MOVE.boost : intent.dash ? MOVE.dash : MOVE.walk;
      if (p.gliding) speed = 16;
      const ground = env.ground(p.pos.x, p.pos.z);
      p.swimming = env.water && ground < WORLD.sea - MOVE.swimDepth && p.pos.y <= WORLD.sea + 0.3;
      if (p.swimming && !p.boost) speed *= 0.55;
      // 急な上り坂は遅く
      if (!p.swimming && len > 0 && !p.boost) {
        const ahead = env.ground(p.pos.x + (dir.x / len) * 1.2, p.pos.z + (dir.z / len) * 1.2);
        const rise = (ahead - ground) / 1.2;
        if (rise > 0.7) speed *= Math.max(0.25, 1 - (rise - 0.7));
      }
      const dx = dir.x * speed * dt;
      const dz = dir.z * speed * dt;
      const ox = p.pos.x;
      const oz = p.pos.z;
      env.move(p.pos, dx, dz);
      // ワールドの端
      const lim = WORLD.limit;
      p.pos.x = Math.max(-lim, Math.min(lim, p.pos.x));
      p.pos.z = Math.max(-lim, Math.min(lim, p.pos.z));
      const moved = Math.hypot(p.pos.x - ox, p.pos.z - oz);
      p.odometer += moved;
      p.speed = moved / Math.max(dt, 1e-4);

      // 上下
      const g = env.ground(p.pos.x, p.pos.z);
      if (p.swimming) {
        p.pos.y = WORLD.sea - MOVE.swimDepth + Math.sin(performance.now() / 500) * 0.06;
        p.vy = 0;
        p.grounded = true;
        p.gliding = false;
      } else {
        if (intent.jump && p.grounded) {
          p.vy = MOVE.jump;
          p.grounded = false;
        }
        p.vy -= MOVE.gravity * dt;
        if (p.gliding) p.vy = Math.max(p.vy, -16);
        p.pos.y += p.vy * dt;
        // 下り坂は地面に吸い付く
        if (p.pos.y <= g || (p.grounded && p.vy <= 0 && p.pos.y - g < 1.2 + speed * dt)) {
          p.pos.y = g;
          p.vy = 0;
          p.grounded = true;
          p.gliding = false;
        } else {
          p.grounded = false;
        }
      }

      p.walking = len > 0.05 && moved > 0.001;
      if (p.walking) {
        p.walkPhase += moved * 1.6;
        p.yaw = Math.atan2(dir.x, dir.z);
      }
      // 見た目
      const cur = hero.group.rotation.y;
      let d = p.yaw - cur;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      hero.group.rotation.y = cur + d * Math.min(1, dt * 12);
      hero.animate(p.walkPhase, p.walking ? Math.min(1, speed / MOVE.dash + 0.4) : 0, p.swimming);
    },
  };
  return p;
}
