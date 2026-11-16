// バトロワの島（マップだけのテスト版）：ロード → タイトル → 降下地点を選ぶ → 歩き回る
import { createApp } from '/shared/engine.js';
import { createInput } from '/shared/input.js';
import { QUALITY_DEFAULT, MOVE, WORLD } from '../config.js';
import { createIsland, areaAt, AREAS } from './island.js';
import { planIsland, buildIsland, TUNNELS } from './build.js';
import { createPlatforms } from './platforms.js';
import { createIslandMap } from './map.js';
import { createTiles } from '../world/tiles.js';
import { createProps } from '../world/props.js';
import { createColliders } from '../world/colliders.js';
import { createEnv } from '../world/env.js';
import { createPlayer, emptyIntent } from '../player.js';
import { createCameraRig } from '../camera.js';
import { createHud } from '../ui/hud.js';
import { createMenu } from '../ui/menu.js';
import { createTouch, isTouchDevice } from '../ui/touch.js';
import { esc, fmtDist } from '../util.js';
import { createLoot } from '../weapons/loot.js';
import { createInventory } from '../weapons/inventory.js';
import { createViewModel } from '../weapons/viewmodel.js';
import { createGallery } from '../weapons/gallery.js';
import { WEAPON_LIST, rollRarity, RARITIES, WEAPONS_BY_ID, weaponDamage } from '../weapons/catalog.js';
import { createSights, sightOf, SIGHT_FOV } from '../weapons/sights.js';
import { createProjectiles, shotOf } from '../weapons/projectiles.js';
import { createDummies } from '../weapons/dummies.js';
import * as THREE from 'three';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const DROP_HEIGHT = 140; // 降下を始める高さ（地面から）

export async function startIsland() {
  const q = { ...QUALITY_DEFAULT };
  try { Object.assign(q, JSON.parse(localStorage.getItem('rpg:br:quality') || '{}')); } catch { /* 既定値 */ }
  const app = createApp({ far: 20000, logDepth: true, maxPixelRatio: q.pixelRatio });
  const { renderer, scene, camera } = app;
  const input = createInput(renderer.domElement);
  const menu = createMenu();
  const touchMode = isTouchDevice();

  menu.loading('島を作っています', 0.1);
  await nextFrame();
  const island = createIsland();
  const layout = planIsland(island);
  const env = createEnv(scene);
  const colliders = createColliders();
  const platforms = createPlatforms();
  const built = buildIsland(scene, island, layout, colliders, platforms);
  menu.loading('地形を組み立てています', 0.4);
  await nextFrame();
  const tiles = createTiles(scene, island, q);
  const props = createProps(scene, island, q, colliders);
  const player = createPlayer(scene);
  const cam = createCameraRig(camera);
  player.hero.group.visible = false; // 一人称だけのゲーム（自分の体は描かない）
  const hud = createHud();
  menu.loading('地図を描いています', 0.7);
  await nextFrame();
  const map = createIslandMap(island, built, { onPick: (p) => drop(p.x, p.z), onClose: () => resumeLock() });
  const touch = touchMode ? createTouch({ onPause: () => pause(), onView: null, onMap: () => openMap(), onBoost: () => toggleBoost() }) : null;
  touch?.setVisible(false);
  map.setMiniVisible(false);
  env.outdoor(q.viewDist);
  env.sun.castShadow = q.shadows;
  tiles.update(0, 0, 300, 0, true);
  props.update(0, 0, 0, true);

  // ---- 武器 ----
  const loot = createLoot(scene);
  const viewmodel = createViewModel(app);
  const sights = createSights();
  const shots = createProjectiles(scene);
  const dummies = createDummies(scene, island, colliders, layout);
  let curDef = null; // 今持っている武器（catalog）
  let curSight = null;
  let aiming = false;
  let rightDown = false;
  const inv = createInventory({ onChange: (slot) => {
    curDef = slot ? WEAPONS_BY_ID[slot.id] : null;
    curSight = sightOf(slot?.id);
    viewmodel.set(slot, curDef);
    player.hero.setWeapon(slot);
    if (!curSight) setAim(false);
    touch?.setAim(!!curSight, aiming);
  } });
  inv.setVisible(false);
  viewmodel.setVisible(false);
  let galleryBack = null;
  const gallery = createGallery({ onClose: () => galleryBack?.() });
  const randomWeapon = () => WEAPON_LIST[Math.floor(Math.random() * WEAPON_LIST.length)];

  /** 覗き込みの切り替え */
  function setAim(on) {
    on = !!on && !!curSight;
    if (on === aiming) return;
    aiming = on;
    touch?.setAim(!!curSight, aiming);
  }

  // ---- 狙い：画面中央の十字の先 ----
  const ray = new THREE.Raycaster();
  const center = new THREE.Vector2(0, 0);
  const aimTo = new THREE.Vector3();
  const from = new THREE.Vector3();
  function aimPoint(range) {
    ray.setFromCamera(center, camera);
    ray.far = range;
    const targets = [built.group, dummies.group];
    for (const m of tiles.group.children) if (m.visible) targets.push(m);
    const hit = ray.intersectObjects(targets, true)[0];
    if (hit) return { point: aimTo.copy(hit.point), hit: true, dist: hit.distance, dummy: hit.object.userData.dummy || null, part: hit.object.userData.part };
    return { point: aimTo.copy(ray.ray.origin).addScaledVector(ray.ray.direction, range), hit: false, dist: range, dummy: null };
  }
  /** 今の武器の攻撃力（素手は 8） */
  const dmgNow = () => (curDef ? weaponDamage(curDef, inv.current?.rarity ?? 0) : 8);
  function hitDummy(d, amount, part, point) {
    const r = dummies.damage(d, amount, part, point, camera.position);
    sights.hit(r.crit);
    shots.burst(point, r.crit ? 0xffeb3b : 0xffab91, 0.8, 10);
  }

  /** 当たる瞬間：近接は斬撃の弧と火花、飛び道具は十字の先へ飛ばす */
  function onFire(ev) {
    const R = RARITIES[inv.current?.rarity ?? 0];
    const color = R.glow ?? (curDef ? curDef.base.accent : 0xffffff);
    const shot = shotOf(curDef);
    if (shot.kind === 'slash' || shot.kind === 'punch') {
      const reach = curDef ? curDef.range : 2.2;
      shots.slash(camera, ev.step, ev.last, shot.kind === 'punch' ? 0xffe0b2 : color, shot.kind === 'punch' ? 1.0 : 1.3);
      const a = aimPoint(reach + 0.3);
      if (a.hit) shots.burst(a.point, a.dummy ? 0xffcc80 : 0xffffff, 0.7, 8);
      if (a.dummy) hitDummy(a.dummy, dmgNow() * (ev.last ? 1.3 : 1), a.part, a.point);
      return;
    }
    const range = curDef.range;
    const a = aimPoint(range);
    // 弾は十字の真後ろ（目の少し先）から出して、十字の線の上をまっすぐ飛ばす
    from.copy(camera.position).addScaledVector(ray.ray.direction, aiming ? 2.5 : 1.2);
    const target = a.dummy;
    const part = a.part;
    const at = a.point.clone();
    const dmg = dmgNow();
    const boom = shot.kind === 'rocket' || shot.kind === 'bomb' || shot.kind === 'shell';
    const shooter = camera.position.clone();
    shots.fire(shot, from, a.point, color, () => {
      if (boom) {
        const hits = dummies.splash(at, 4.5, dmg, shooter);
        if (hits.length) sights.hit(false);
      } else if (target) hitDummy(target, dmg, part, at);
    });
    sights.kick(curDef.type === 'heavy' ? 1.2 : 0.7);
  }
  /** 試合ごとに落とし物を置き直す（家は 3 軒に 1 軒くらい、建物の上や塔のてっぺんは必ず。高いところほど良い物が出やすい） */
  function spawnLoot() {
    for (const it of [...loot.items]) loot.remove(it);
    for (const sp of built.lootSpots) {
      if (sp.kind === 'house' && Math.random() > 0.35) continue;
      const bonus = sp.kind === 'towertop' || sp.kind === 'roof' ? 0.45 : sp.kind === 'house' ? 0 : 0.2;
      const r = rollRarity(Math.min(0.999, Math.random() * (1 - bonus) + bonus));
      loot.drop(randomWeapon().id, r, sp.x, sp.y, sp.z);
    }
  }

  let state = 'title';
  let areaId = null;
  let areaT = 0;
  let debugOn = false;
  let fps = 60;
  let expectUnlock = false;
  const opened = new Set();
  let matchStarted = false;
  const intent = emptyIntent();

  // ---- 乗れる板込みの地面 ----
  const ground = (x, z) => Math.max(island.height(x, z), platforms.heightAt(x, z, player.pos.y));
  const playEnv = {
    water: true,
    ground,
    move(pos, dx, dz) {
      // 速いとき（ダッシュ・爆速）に壁を抜けないよう、0.4m ずつ刻んで動かす
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.4));
      for (let i = 0; i < n; i++) {
        const r = colliders.resolve(pos.x + dx / n, pos.z + dz / n, MOVE.radius, pos.y, pos.x, pos.z);
        pos.x = r.x;
        pos.z = r.z;
      }
    },
  };
  const camEnv = { ground: (x, z) => island.height(x, z, 3), blocked: (x, z, y) => colliders.hits(x, z, y), ceil: Infinity };

  // ---- 入力 ----
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3') { e.preventDefault(); debugOn = !debugOn; if (!debugOn) hud.debug(''); }
  });
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault()); // 右クリックは覗き込み
  renderer.domElement.addEventListener('click', () => {
    if (state === 'play' && !touchMode && !hud.dialogOpen) input.lockPointer();
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) return;
    if (expectUnlock) { expectUnlock = false; return; }
    if (state === 'play' && !touchMode && !hud.dialogOpen) pause();
  });
  const unlock = () => { if (document.pointerLockElement) { expectUnlock = true; input.unlockPointer(); } };
  function resumeLock() {
    state = 'play';
    if (!touchMode) input.lockPointer();
  }

  function showTitle() {
    state = 'title';
    unlock();
    hud.root.style.display = 'none';
    map.setMiniVisible(false);
    touch?.setVisible(false);
    inv.setVisible(false);
    viewmodel.setVisible(false);
    dummies.setVisible(false);
    menu.title({
      hasSave: false,
      heading: 'BATTLE ISLAND <small>マップテスト</small>',
      sub: '8人用バトルロイヤルの島（約 1km 四方）。いまは歩き回れるだけ',
      newLabel: '降下地点を選ぶ',
      stats: [
        `エリア <b>${AREAS.filter((a) => a.r).length}</b>`,
        `宝箱 <b>${built.chests.length}</b>`,
        `地下の抜け道 <b>${TUNNELS.length}</b>`,
        `端から端までダッシュで約 <b>${Math.round(900 / MOVE.dash)}</b> 秒`,
      ],
      keys: 'WASD：移動　Shift：ダッシュ　Space：ジャンプ　マウス：視点（クリックでロック）\nF：調べる　M：地図　右クリック：覗き込み　1〜3：持ち替え　G：爆速（テスト用）　F3：デバッグ　Esc：ポーズ',
      note: '広大マップのテストは <a href="/world/" style="color:#58a6ff">/world/</a>',
      onSettings: () => menu.settings({ q, touch: touchMode, onChange: onQuality, onBack: () => showTitle() }),
      onGallery: () => { menu.hide(); galleryBack = () => showTitle(); gallery.open(); },
      onNew: () => { menu.hide(); openDrop(); },
    });
  }

  function openDrop() {
    matchStarted = false;
    state = 'map';
    map.open(null, { drop: true });
  }

  /** (x, z) の上空から降下 */
  function drop(x, z) {
    menu.hide();
    if (!matchStarted) {
      matchStarted = true;
      inv.clear();
      opened.clear();
      spawnLoot();
    }
    inv.setVisible(true);
    dummies.setVisible(true);
    hud.root.style.display = 'block';
    map.setMiniVisible(true);
    touch?.setVisible(true);
    hud.crosshair(false);
    const g = Math.max(island.height(x, z), 0);
    player.place(x, z, g + DROP_HEIGHT);
    player.grounded = false;
    player.gliding = true;
    cam.yaw = Math.atan2(-x, -z) || Math.PI; // 島の中心を向いて降りる
    cam.look = -0.6;
    tiles.update(x, z, DROP_HEIGHT, 0, true);
    props.update(x, z, 0, true);
    areaId = null;
    hud.toast('降下中… WASD で着地点を調整できる', 3);
    resumeLock();
  }

  /** 設定を変えたとき（保存して反映） */
  function onQuality(k) {
    localStorage.setItem('rpg:br:quality', JSON.stringify(q));
    if (k === 'viewDist') env.outdoor(q.viewDist);
    if (k === 'shadows') env.sun.castShadow = q.shadows;
    if (k === 'pixelRatio') { app.pixelRatioMax = q.pixelRatio; app.resize(); }
  }

  function pause() {
    if (state !== 'play') return;
    state = 'pause';
    unlock();
    const a = areaAt(player.pos.x, player.pos.z);
    menu.pause({
      q,
      touch: touchMode,
      info: `いま：${a ? esc(a.name) : '野原'}　開けた宝箱 ${opened.size} / ${built.chests.length}`,
      onResume: () => { menu.hide(); resumeLock(); },
      onMap: () => { menu.hide(); state = 'play'; openMap(); },
      onTitle: () => showTitle(),
      onGallery: () => { menu.hide(); galleryBack = () => { state = 'play'; pause(); }; gallery.open(); },
      onChange: onQuality,
    });
  }
  function openMap() {
    if (state !== 'play') return;
    state = 'map';
    unlock();
    map.open({ x: player.pos.x, z: player.pos.z, yaw: cam.yaw });
  }
  function toggleBoost() {
    player.boost = !player.boost;
    hud.toast(player.boost ? '爆速モード ON（テスト用）' : '爆速モード OFF');
    return player.boost;
  }

  // ---- 調べる ----
  function interact(a) {
    if (!a) return;
    if (a.kind === 'loot') {
      const it = a.item;
      const dropped = inv.pickUp(it);
      loot.remove(it);
      if (dropped) loot.drop(dropped.id, dropped.rarity, player.pos.x, player.pos.y, player.pos.z);
      const R = RARITIES[it.rarity];
      hud.toast(`${WEAPONS_BY_ID[it.id].name}（${R.name}）を拾った${dropped ? '（持っていた武器と入れ替え）' : ''}`, 2.2);
      return;
    }
    if (a.kind === 'chest') {
      if (opened.has(a.chest)) { hud.toast('もう空っぽだ'); return; }
      opened.add(a.chest);
      const c = built.chests[a.chest];
      // 宝箱はちょっと良い物が出やすい。2 個のことも
      const n = Math.random() < 0.3 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const ang = Math.atan2(player.pos.x - c.x, player.pos.z - c.z) + (i - (n - 1) / 2) * 0.8;
        loot.drop(randomWeapon().id, rollRarity(Math.random() * 0.75 + 0.25), c.x + Math.sin(ang) * 1.6, c.y, c.z + Math.cos(ang) * 1.6);
      }
      hud.toast(`宝箱を開けた！武器が ${n} 本出てきた`, 2.2);
    } else if (a.kind === 'tunnel') {
      const here = TUNNELS.find((t) => t.id === a.tunnel);
      unlock();
      hud.dialog(`<b>${esc(here.name)}</b><br>地下の抜け道。どこへ出る？`, [
        ...TUNNELS.filter((t) => t.id !== here.id).map((t) => ({ label: `${t.id}：${t.name}`, onClick: () => { exitTunnel(t); resumeLock(); } })),
        { label: 'やめる', onClick: () => resumeLock() },
      ]);
    }
  }
  function exitTunnel(t) {
    const act = built.acts.find((a) => a.kind === 'tunnel' && a.tunnel === t.id);
    // 入口の少し外（島の中心側）に出る
    const dx = -act.x;
    const dz = -act.z;
    const l = Math.hypot(dx, dz) || 1;
    const x = act.x + (dx / l) * 5;
    const z = act.z + (dz / l) * 5;
    player.place(x, z, ground(x, z));
    cam.yaw = Math.atan2(dx, dz);
    tiles.update(x, z, 2, 0, true);
    props.update(x, z, 0, true);
    hud.toast(`${t.name}から出た`);
  }

  // ---- 毎フレーム ----
  const dir = { x: 0, z: 0 };
  let lastNow = performance.now();
  app.start((dt, t) => {
    const now = performance.now();
    fps += (1000 / Math.max(now - lastNow, 1) - fps) * 0.05;
    lastNow = now;
    hud.tick(dt);
    built.animate(dt);
    if (state === 'title' || (state === 'map' && map.dropMode)) {
      // タイトル：島の上をぐるっと回る
      const a = t * 0.04;
      camera.position.set(Math.sin(a) * 620, 230, Math.cos(a) * 620);
      camera.lookAt(0, 20, 0);
      tiles.update(camera.position.x, camera.position.z, 200, 5);
      env.follow(camera, { x: 0, y: 0, z: 0 }, t);
      input.endFrame();
      return;
    }
    if (state === 'play' && !hud.dialogOpen) readIntent();
    else {
      emptyIntent(intent);
      if (hud.dialogOpen && input.wasPressed('Escape')) { hud.closeDialog(); resumeLock(); }
      if (state === 'map' && (input.wasPressed('KeyM') || input.wasPressed('Escape'))) map.close();
    }
    const w = cam.toWorld(intent.moveX, intent.moveZ);
    const l = Math.hypot(w.x, w.z);
    dir.x = l > 1 ? w.x / l : w.x;
    dir.z = l > 1 ? w.z / l : w.z;
    if (state === 'play') player.update(dt, intent, dir, playEnv);
    cam.update(dt, player, camEnv);
    env.follow(camera, player.pos, t);
    const cy = camera.position.y - island.height(camera.position.x, camera.position.z, 3);
    tiles.update(camera.position.x, camera.position.z, cy, 5);
    props.update(player.pos.x, player.pos.z, 3);

    const lootIt = player.gliding ? null : loot.nearest(player.pos.x, player.pos.z, player.pos.y);
    const act = player.gliding ? null : lootIt ? { kind: 'loot', item: lootIt, label: loot.label(lootIt) } : built.nearest(player.pos.x, player.pos.z);
    hud.setPrompt(act ? (act.kind === 'chest' && opened.has(act.chest) ? '空の宝箱' : act.label) : '');
    loot.update(dt, player.pos.x, player.pos.z);
    if (state !== 'play' || player.gliding) setAim(false);
    viewmodel.setVisible(state === 'play');
    const vm = viewmodel.update(dt, { walk: player.walking ? 1 : 0, phase: player.walkPhase, lookDx: input.mouse.dx, lookDy: input.mouse.dy, aiming, scope: curSight === 'scope' });
    {
      const f = 75 + ((SIGHT_FOV[curSight] || 75) - 75) * vm.ads;
      if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); }
    }
    sights.update(dt, state === 'play' && !hud.dialogOpen, curSight, vm.ads);
    if (intent.attack && !player.gliding && state === 'play') {
      if (viewmodel.trigger(curDef ? 1 / curDef.rate : 0.25)) player.hero.attack();
    }
    if (vm.fire) onFire(vm);
    shots.update(dt);
    dummies.update(dt, camera);
    if (intent.interact) interact(act);
    areaT -= dt;
    if (areaT <= 0) { areaT = 0.3; checkArea(); }
    hud.compass(cam.yaw);
    updateStatus();
    map.drawMini(player.pos.x, player.pos.z, cam.yaw);
    if (debugOn) hud.debug(debugText());
    input.endFrame();
    touch?.endFrame();
  });

  function readIntent() {
    emptyIntent(intent);
    let mx = 0;
    let mz = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) mz += 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) mz -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) mx += 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) mx -= 1;
    intent.dash = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    intent.jump = input.isDown('Space');
    intent.interact = input.wasPressed('KeyF') || input.wasPressed('KeyE');
    if (touch) {
      const s = touch.state;
      if (Math.hypot(s.x, s.z) > 0.08) { mx = s.x; mz = s.z; }
      intent.dash = intent.dash || s.dash;
      intent.jump = intent.jump || s.held.has('jump');
      intent.interact = intent.interact || s.pressed.has('interact');
      cam.input(s.dx * q.touchSens * (camera.fov / 75), s.dy * q.touchSens * (camera.fov / 75), 0);
    }
    intent.moveX = mx;
    intent.moveZ = mz;
    const zoomSens = camera.fov / 75; // 覗き込んでズームしているほど視点をゆっくり
    if (input.mouse.locked) cam.input(input.mouse.dx * q.mouseSens * zoomSens, input.mouse.dy * q.mouseSens * zoomSens, input.mouse.wheel);
    if (input.wasPressed('KeyG')) toggleBoost();
    if (input.wasPressed('KeyM')) openMap();
    // 武器：攻撃（左クリック／攻撃ボタン）・持ち替え（1〜3／一人称ならホイール）
    intent.attack = (input.mouse.locked && input.isDown('Mouse0')) || !!touch?.state.held.has('attack');
    // 覗き込み：PC は右クリックを押している間、スマホは照準ボタンで切り替え
    if (touch?.state.pressed.has('aim')) setAim(!aiming);
    else if (!touch) {
      const rd = input.mouse.locked && input.isDown('Mouse2');
      if (rd !== rightDown) { rightDown = rd; setAim(rd); } // 押した・離した瞬間だけ切り替え
    }
    if (aiming) intent.dash = false;
    for (let i = 0; i < 3; i++) if (input.wasPressed(`Digit${i + 1}`)) inv.select(i);
    if (input.mouse.locked && input.mouse.wheel) inv.next(Math.sign(input.mouse.wheel));
  }

  function checkArea() {
    const a = areaAt(player.pos.x, player.pos.z);
    const id = a ? a.id : 'field';
    if (id === areaId) return;
    areaId = id;
    if (a && !player.gliding) hud.banner(a.name, '');
  }

  function updateStatus() {
    const a = areaAt(player.pos.x, player.pos.z);
    const alt = player.pos.y - Math.max(0, island.height(player.pos.x, player.pos.z));
    hud.setStatus(`<div class="st-region">${a ? esc(a.name) : '野原'}</div><div class="st-sub">${player.gliding ? `<b class="st-swim">降下中　地面まで ${Math.round(alt)}m</b>` : `標高 ${Math.round(player.pos.y)}m${player.swimming ? '　<b class="st-swim">泳いでいる</b>' : ''}`}</div><div class="st-sub">X ${Math.round(player.pos.x)}　Z ${Math.round(player.pos.z)}　島の中心まで ${fmtDist(Math.hypot(player.pos.x, player.pos.z))}</div>${player.boost ? '<div class="st-boost">爆速モード</div>' : ''}`);
  }

  function debugText() {
    const info = renderer.info;
    return [
      `FPS ${fps.toFixed(0)}　描画 ${info.render.calls} 回　ポリゴン ${(info.render.triangles / 1000).toFixed(0)}k`,
      `地形タイル 表示 ${tiles.stats.visible} / 作成 ${tiles.stats.built}　草木 ${props.stats.instances} 本　当たり判定 ${colliders.count} 組　板 ${platforms.list.length}`,
      `位置 ${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${player.pos.z.toFixed(1)}　速さ ${player.speed.toFixed(1)}m/s`,
      `ワールド ${WORLD.size}m（島）`,
    ].join('\n');
  }

  if (new URLSearchParams(location.search).has('debug')) {
    window.__rpg = { island, built, player, cam, drop, exitTunnel, interact, platforms, loot, inv, viewmodel, shots, dummies, setAim, aimPoint, get state() { return state; }, stats: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, tiles: { ...tiles.stats }, props: { ...props.stats }, fps }) };
  }
  showTitle();
}
