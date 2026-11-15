// ダンジョンのフロアを描く（壁・床・柱・松明は InstancedMesh）と、壁との当たり判定
import * as THREE from 'three';
import { CELL, WALL_H, genFloor, cellToWorld, worldToCell } from './gen.js';
import { DUNGEON_TYPES } from '../world/regions.js';
import { seedOf } from '../noise.js';

/** フロアの大きさ（深いほど広い） */
export function floorSize(poi, floor) {
  const s = 25 + poi.tier * 6 + floor * 3;
  return Math.min(121, s | 1);
}

export function createDungeonView(scene) {
  const group = new THREE.Group();
  group.name = 'dungeon';
  group.visible = false;
  scene.add(group);
  let cur = null; // { f, poi, floor, theme, objs }

  function clear() {
    for (const o of [...group.children]) {
      group.remove(o);
      o.geometry?.dispose();
      if (o.material && !o.material.shared) o.material.dispose();
    }
    cur = null;
  }

  /** フロアを作って表示する */
  function load(poi, floor) {
    clear();
    const theme = DUNGEON_TYPES[poi.type] || DUNGEON_TYPES.cave;
    const size = floorSize(poi, floor);
    const f = genFloor(seedOf(poi.seed, poi.id, floor), size);
    const col = new THREE.Color();
    const m4 = new THREE.Matrix4();
    // 床タイル
    const floors = [];
    const walls = [];
    const pillars = [];
    const at = (x, z) => (x < 0 || z < 0 || x >= f.w || z >= f.h ? 0 : f.grid[z * f.w + x]);
    for (let z = 0; z < f.h; z++) {
      for (let x = 0; x < f.w; x++) {
        const v = at(x, z);
        if (v === 1 || v === 2) floors.push([x, z]);
        if (v === 2) pillars.push([x, z]);
        if (v === 0) {
          let edge = false;
          for (let dz = -1; dz <= 1 && !edge; dz++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, z + dz) === 1 || at(x + dx, z + dz) === 2) { edge = true; break; }
          if (edge) walls.push([x, z]);
        }
      }
    }
    const lit = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const tileGeo = new THREE.BoxGeometry(CELL * 0.98, 0.2, CELL * 0.98);
    const tiles = new THREE.InstancedMesh(tileGeo, lit, floors.length);
    floors.forEach(([x, z], i) => {
      const w = cellToWorld(f, x, z);
      m4.makeTranslation(w.x, -0.1, w.z);
      tiles.setMatrixAt(i, m4);
      col.setHex(theme.floor).multiplyScalar(0.85 + ((x * 7 + z * 13) % 5) * 0.06);
      tiles.setColorAt(i, col);
    });
    tiles.receiveShadow = true;
    group.add(tiles);
    // 床の目地（下の暗い板）
    const under = new THREE.Mesh(new THREE.PlaneGeometry(f.w * CELL, f.h * CELL).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.floor).multiplyScalar(0.35) }));
    under.position.y = -0.15;
    group.add(under);

    const wallGeo = new THREE.BoxGeometry(CELL, WALL_H, CELL);
    const wallMesh = new THREE.InstancedMesh(wallGeo, lit, walls.length);
    walls.forEach(([x, z], i) => {
      const w = cellToWorld(f, x, z);
      m4.makeTranslation(w.x, WALL_H / 2, w.z);
      wallMesh.setMatrixAt(i, m4);
      col.setHex(theme.wall).multiplyScalar(0.8 + ((x * 31 + z * 17) % 7) * 0.05);
      wallMesh.setColorAt(i, col);
    });
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    group.add(wallMesh);

    if (pillars.length) {
      const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.9, 1.1, WALL_H, 10), new THREE.MeshLambertMaterial({ color: new THREE.Color(theme.wall).multiplyScalar(1.1) }), pillars.length);
      pillars.forEach(([x, z], i) => {
        const w = cellToWorld(f, x, z);
        m4.makeTranslation(w.x, WALL_H / 2, w.z);
        pm.setMatrixAt(i, m4);
      });
      pm.castShadow = true;
      group.add(pm);
    }
    // 天井（下向き。上から見下ろすカメラからは見えない）
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(f.w * CELL, f.h * CELL).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: new THREE.Color(theme.wall).multiplyScalar(0.45) }));
    ceil.position.y = WALL_H;
    group.add(ceil);

    // 松明
    if (f.torches.length) {
      const flame = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: theme.torch }), f.torches.length);
      const stick = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.7, 0.15), new THREE.MeshLambertMaterial({ color: 0x3a2a1a }), f.torches.length);
      f.torches.forEach((t, i) => {
        const w = cellToWorld(f, t.x, t.z);
        const x = w.x + t.dx * (CELL / 2 + 0.12);
        const z = w.z + t.dz * (CELL / 2 + 0.12);
        m4.makeTranslation(x, 2.6, z);
        stick.setMatrixAt(i, m4);
        m4.makeTranslation(x, 3.1, z);
        flame.setMatrixAt(i, m4);
      });
      group.add(stick, flame);
    }
    // 飾り
    if (f.deco.length) {
      const box = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x6b4a2a }), f.deco.length);
      f.deco.forEach((d, i) => {
        const w = cellToWorld(f, d.x, d.z);
        const s = 0.7 + d.k * 0.25;
        m4.compose(new THREE.Vector3(w.x + (d.k - 1) * 0.6, s / 2, w.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.k), new THREE.Vector3(s, s, s));
        box.setMatrixAt(i, m4);
      });
      box.castShadow = true;
      group.add(box);
    }

    // 入口と出口
    const up = theme.up;
    const last = floor >= poi.floors;
    const sW = cellToWorld(f, f.start.x, f.start.z);
    const gW = cellToWorld(f, f.goal.x, f.goal.z);
    const ring = (x, z, c) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.6, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
      m.position.set(x, 0.05, z);
      group.add(m);
      return m;
    };
    const stairs = (x, z, goUp) => {
      const c = new THREE.Color(theme.wall);
      if (goUp) {
        for (let s = 0; s < 5; s++) {
          const hh = 0.35 * (s + 1);
          const m = new THREE.Mesh(new THREE.BoxGeometry(3, hh, 0.6), new THREE.MeshLambertMaterial({ color: c.clone().multiplyScalar(1.15) }));
          m.position.set(x, hh / 2, z - 1.2 + s * 0.6);
          group.add(m);
        }
      } else {
        const m = new THREE.Mesh(new THREE.BoxGeometry(3, 0.04, 3), new THREE.MeshBasicMaterial({ color: 0x020202 }));
        m.position.set(x, 0.03, z);
        group.add(m);
        for (const sx of [-1.6, 1.6]) {
          const r = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 3.2), new THREE.MeshLambertMaterial({ color: c.clone().multiplyScalar(0.8) }));
          r.position.set(x + sx, 0.25, z);
          group.add(r);
        }
      }
    };
    const acts = [];
    if (floor === 1) {
      ring(sW.x, sW.z, 0x7fe0ff);
      acts.push({ x: sW.x, z: sW.z, r: 2.4, label: '外へ出る', kind: 'exit' });
    } else {
      stairs(sW.x, sW.z, !up);
      acts.push({ x: sW.x, z: sW.z, r: 2.4, label: up ? `${floor - 1}F へ降りる` : `B${floor - 1}F へ上がる`, kind: 'prev' });
    }
    let goalMark = null;
    if (last) {
      const altar = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 1.1, 8), new THREE.MeshLambertMaterial({ color: theme.wall }));
      altar.position.set(gW.x, 0.55, gW.z);
      group.add(altar);
      goalMark = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
      goalMark.position.set(gW.x, 2.2, gW.z);
      group.add(goalMark);
      ring(gW.x, gW.z, 0xffe066);
      acts.push({ x: gW.x, z: gW.z, r: 2.8, label: '最深部の宝を調べる', kind: 'treasure' });
    } else {
      stairs(gW.x, gW.z, up);
      ring(gW.x, gW.z, up ? 0xb8ff9a : 0xff9a7a);
      acts.push({ x: gW.x, z: gW.z, r: 2.4, label: up ? `${floor + 1}F へ上がる` : `B${floor + 1}F へ降りる`, kind: 'next' });
    }
    cur = { f, poi, floor, theme, acts, goalMark, start: { x: sW.x + 2.5, z: sW.z }, goalPos: { x: gW.x - 2.5, z: gW.z } };
    group.visible = true;
    return cur;
  }

  /** そのマスが通れるか */
  function free(x, z) {
    if (!cur) return true;
    const c = worldToCell(cur.f, x, z);
    if (c.x < 0 || c.z < 0 || c.x >= cur.f.w || c.z >= cur.f.h) return false;
    return cur.f.grid[c.z * cur.f.w + c.x] === 1;
  }

  /** 円（半径 r）を軸ごとに動かして壁で止める */
  function move(pos, dx, dz, r) {
    const ok = (x, z) => free(x - r, z - r) && free(x + r, z - r) && free(x - r, z + r) && free(x + r, z + r);
    if (ok(pos.x + dx, pos.z)) pos.x += dx;
    if (ok(pos.x, pos.z + dz)) pos.z += dz;
  }

  function nearest(px, pz) {
    if (!cur) return null;
    let best = null;
    let bd = Infinity;
    for (const a of cur.acts) {
      const d = Math.hypot(a.x - px, a.z - pz);
      if (d < a.r && d < bd) { bd = d; best = a; }
    }
    return best;
  }

  function animate(dt) {
    if (cur?.goalMark) cur.goalMark.rotation.y += dt * 1.5;
  }

  return { group, load, clear, free, move, nearest, animate, get cur() { return cur; } };
}
