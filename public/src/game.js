// ゲーム全体：ロード → タイトル → 探索（外の世界 ⇄ ダンジョン）
import { createApp } from '/shared/engine.js';
import { createInput } from '/shared/input.js';
import { WORLD, QUALITY_DEFAULT, MOVE } from './config.js';
import { createTerrain, BIOMES } from './world/terrain.js';
import { generateWorld, regionAt, DUNGEON_TYPES } from './world/regions.js';
import { createTiles } from './world/tiles.js';
import { createProps } from './world/props.js';
import { createColliders } from './world/colliders.js';
import { createStructures } from './world/structures.js';
import { createEnv } from './world/env.js';
import { createDungeonView } from './dungeon/build.js';
import { worldToCell } from './dungeon/gen.js';
import { createPlayer, emptyIntent } from './player.js';
import { createCameraRig } from './camera.js';
import { createHud } from './ui/hud.js';
import { createMap } from './ui/map.js';
import { createMenu } from './ui/menu.js';
import { createTouch, isTouchDevice } from './ui/touch.js';
import { store } from './save.js';
import { esc, fmtDist, fmtTime } from './util.js';
import { describeStage, describeTown } from './talk.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

export async function startGame() {
  const q = { ...QUALITY_DEFAULT };
  try { Object.assign(q, JSON.parse(localStorage.getItem('rpg:quality') || '{}')); } catch { /* 既定値のまま */ }
  const app = createApp({ far: 150000, logDepth: true, maxPixelRatio: q.pixelRatio });
  const { renderer, scene, camera } = app;
  const input = createInput(renderer.domElement);
  const menu = createMenu();
  const touchMode = isTouchDevice();

  menu.loading('大陸とステージを生成しています', 0.05);
  await nextFrame();
  const t0 = performance.now();
  const terrain = createTerrain();
  const world = generateWorld(terrain);
  const genMs = performance.now() - t0;

  const env = createEnv(scene);
  const colliders = createColliders();
  const tiles = createTiles(scene, terrain, q);
  const props = createProps(scene, terrain, q, colliders);
  const structures = createStructures(scene, world, colliders);
  const dungeon = createDungeonView(scene);
  const player = createPlayer(scene);
  const cam = createCameraRig(camera);
  const hud = createHud();
  const map = createMap(world, { onWarp: (s) => warp(s.x, s.z), onClose: () => resumeLock() });
  const touch = touchMode ? createTouch({ onPause: () => pause(), onView: () => toggleView(), onMap: () => openMap(), onBoost: () => toggleBoost() }) : null;
  touch?.setVisible(false);
  map.setMiniVisible(false);
  env.outdoor(q.viewDist);
  env.sun.castShadow = q.shadows;

  let save = store.load();
  let state = 'loading'; // loading / title / play / pause / map
  let inDungeon = false;
  let seen = null;
  let regionId = -1;
  let regionT = 0;
  let structT = 0;
  let saveT = 0;
  let debugOn = false;
  let fps = 60;
  let expectUnlock = false;
  const intent = emptyIntent();
  const cap = world.capital;

  // ---- 初回ロード：王都まわりを先に作っておく ----
  const counts = {
    land: world.regions.filter((r) => r.land).length,
    towns: world.pois.filter((p) => p.kind === 'town').length + 1,
    dungeons: world.pois.filter((p) => p.kind === 'dungeon').length,
    floors: world.pois.filter((p) => p.kind === 'dungeon').reduce((s, p) => s + p.floors, 0),
  };
  menu.loading('地形を組み立てています', 0.3);
  await nextFrame();
  placeTitleCamera(0);
  tiles.update(camera.position.x, camera.position.z, 150, 0, true);
  menu.loading('建物と草木を置いています', 0.6);
  await nextFrame();
  structures.update(cap.x, cap.z, 0, 999);
  props.update(cap.x, cap.z, 0, true);
  menu.loading('地図を描いています', 0.85);
  await nextFrame();
  console.log(`[RPG] ワールド生成 ${genMs.toFixed(0)}ms / ステージ ${counts.land} / 町 ${counts.towns} / ダンジョン ${counts.dungeons}（合計 ${counts.floors} 階）`);
  showTitle();

  // ---- 入力まわり ----
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3') { e.preventDefault(); debugOn = !debugOn; if (!debugOn) hud.debug(''); }
  });
  renderer.domElement.addEventListener('click', () => {
    if (state === 'play' && !touchMode && !hud.dialogOpen) input.lockPointer();
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) return;
    if (expectUnlock) { expectUnlock = false; return; }
    if (state === 'play' && !touchMode && !hud.dialogOpen) pause();
  });
  function unlock() {
    if (document.pointerLockElement) { expectUnlock = true; input.unlockPointer(); }
  }
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
    const hasSave = store.exists();
    menu.title({
      hasSave,
      stats: [
        `ステージ（地方）<b>${counts.land}</b>`,
        `町 <b>${counts.towns}</b>`,
        `ダンジョン <b>${counts.dungeons}</b>（全 ${counts.floors} 階）`,
        `端から端まで歩いて約 <b>${Math.round(WORLD.size / MOVE.dash / 60)}</b> 分（ダッシュ）`,
      ],
      onSettings: () => menu.settings({ q, touch: touchMode, onChange: onQuality, onBack: () => showTitle() }),
      onNew: () => { save = store.fresh(); begin(); },
      onContinue: () => { save = store.load(); begin(); },
    });
  }

  function begin() {
    menu.hide();
    hud.root.style.display = 'block';
    map.setMiniVisible(true);
    touch?.setVisible(true);
    cam.setMode(save.view === 'tps' ? 'tps' : 'fps');
    player.hero.group.visible = !cam.fps;
    hud.crosshair(cam.fps && !touchMode);
    exitDungeonView();
    if (save.dungeon) {
      const poi = world.pois.find((p) => p.id === save.dungeon.id);
      if (poi) {
        enterDungeon(poi, save.dungeon.floor, false);
      } else {
        save.dungeon = null;
      }
    }
    if (!save.dungeon) {
      const x = save.x ?? cap.x;
      const z = save.z ?? cap.z + 25;
      warp(x, z, true);
      cam.yaw = save.yaw ?? Math.PI;
    }
    regionId = -1;
    resumeLock();
  }

  /** 設定を変えたとき（保存して反映） */
  function onQuality(k) {
    localStorage.setItem('rpg:quality', JSON.stringify(q));
    if (k === 'viewDist' && !inDungeon) env.outdoor(q.viewDist);
    if (k === 'shadows') env.sun.castShadow = q.shadows;
    if (k === 'pixelRatio') { app.pixelRatioMax = q.pixelRatio; app.resize(); }
  }

  function pause() {
    if (state !== 'play') return;
    state = 'pause';
    unlock();
    const reg = inDungeon ? null : regionAt(world, player.pos.x, player.pos.z);
    menu.pause({
      q,
      touch: touchMode,
      info: `歩いた距離 ${fmtDist(save.odo)}｜プレイ時間 ${fmtTime(save.time)}${reg ? `｜いま：${esc(reg.name)}` : ''}`,
      onResume: () => { menu.hide(); resumeLock(); },
      onMap: () => { menu.hide(); state = 'play'; openMap(); },
      onTitle: () => { autosave(); showTitle(); },
      onChange: onQuality,
    });
  }

  function openMap() {
    if (state !== 'play' || inDungeon) {
      if (inDungeon) hud.toast('ダンジョンの中では全体マップは見られない（右下に今の階の地図）');
      return;
    }
    state = 'map';
    unlock();
    map.open(player.pos.x, player.pos.z, cam.yaw, save);
  }

  function toggleView() {
    cam.setMode(cam.fps ? 'tps' : 'fps');
    save.view = cam.mode;
    player.hero.group.visible = !cam.fps;
    hud.crosshair(cam.fps && !touchMode);
  }
  function toggleBoost() {
    player.boost = !player.boost;
    hud.toast(player.boost ? `爆速モード ON（${MOVE.boost}m/s・テスト用）` : '爆速モード OFF');
    return player.boost;
  }

  // ---- 外の世界 ----
  function warp(x, z, silent = false) {
    if (inDungeon) leaveDungeon(false);
    const y = Math.max(terrain.height(x, z), WORLD.sea - MOVE.swimDepth);
    player.place(x, z, y);
    tiles.update(x, z, 2, 0, true);
    props.reset();
    props.update(x, z, 0, true);
    structures.update(x, z, 0, 999);
    // 建物の中に降りてしまったら外へ押し出す
    const r = colliders.resolve(x, z, 1.5, y);
    player.place(r.x, r.z, terrain.height(r.x, r.z));
    if (!silent) hud.toast(`ワープした（${Math.round(x)}, ${Math.round(z)}）`);
  }

  const worldEnv = {
    water: true,
    ground: (x, z) => terrain.height(x, z),
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
  const worldCamEnv = { ground: (x, z) => terrain.height(x, z, 4), blocked: (x, z, y) => colliders.hits(x, z, y), ceil: Infinity };

  // ---- ダンジョン ----
  const dungeonEnv = {
    water: false,
    ground: () => 0,
    move: (pos, dx, dz) => dungeon.move(pos, dx, dz, MOVE.radius),
  };
  const dungeonCamEnv = { ground: () => 0, blocked: (x, z) => !dungeon.free(x, z), ceil: 5 };

  function enterDungeon(poi, floor = 1, fromOutside = true) {
    if (fromOutside) save.ret = { x: player.pos.x, z: player.pos.z };
    save.entered[poi.id] = 1;
    save.dungeon = { id: poi.id, floor };
    inDungeon = true;
    tiles.setVisible(false);
    props.setVisible(false);
    structures.setVisible(false);
    const cur = dungeon.load(poi, floor);
    seen = new Uint8Array(cur.f.w * cur.f.h);
    env.indoor(cur.theme);
    player.place(cur.start.x, cur.start.z, 0);
    cam.yaw = Math.PI / 2;
    hud.banner(poi.name, floorLabel(poi, floor));
  }
  function floorLabel(poi, floor) {
    const up = DUNGEON_TYPES[poi.type]?.up;
    return `${up ? `${floor}F` : `B${floor}F`}　／　全 ${poi.floors} 階`;
  }
  function changeFloor(delta) {
    const poi = dungeon.cur.poi;
    const floor = dungeon.cur.floor + delta;
    save.dungeon = { id: poi.id, floor };
    const cur = dungeon.load(poi, floor);
    seen = new Uint8Array(cur.f.w * cur.f.h);
    env.indoor(cur.theme);
    const at = delta > 0 ? cur.start : cur.goalPos;
    player.place(at.x, at.z, 0);
    hud.banner(poi.name, floorLabel(poi, floor));
    autosave();
  }
  function exitDungeonView() {
    inDungeon = false;
    dungeon.clear();
    dungeon.group.visible = false;
    tiles.setVisible(true);
    props.setVisible(true);
    structures.setVisible(true);
    env.outdoor(q.viewDist);
  }
  function leaveDungeon(place = true) {
    const ret = save.ret;
    save.dungeon = null;
    exitDungeonView();
    if (place && ret) warp(ret.x, ret.z, true);
  }

  // ---- 調べる ----
  function interact(a) {
    if (!a) return;
    if (a.kind === 'stage') {
      const reg = world.regions[a.poi.region];
      hud.dialog(describeStage(world, reg, save), [{ label: '閉じる', onClick: resumeLock }]);
      unlock();
    } else if (a.kind === 'town') {
      hud.dialog(describeTown(world, a.poi, player.pos), [{ label: '閉じる', onClick: resumeLock }]);
      unlock();
    } else if (a.kind === 'dungeon') {
      enterDungeon(a.poi, 1);
    } else if (a.kind === 'exit') {
      leaveDungeon();
      hud.toast('外に出た');
    } else if (a.kind === 'next') changeFloor(1);
    else if (a.kind === 'prev') changeFloor(-1);
    else if (a.kind === 'treasure') {
      const poi = dungeon.cur.poi;
      const first = !save.cleared[poi.id];
      save.cleared[poi.id] = 1;
      autosave();
      unlock();
      hud.dialog(`<b>${esc(poi.name)} を踏破した！</b><br>${first ? '最深部にたどり着いた。（宝箱の中身は今後の実装）' : 'もう踏破している。'}<br>踏破したダンジョン：${Object.keys(save.cleared).length} / ${counts.dungeons}`, [
        { label: '外へ戻る', onClick: () => { leaveDungeon(); resumeLock(); } },
        { label: 'ここに残る', onClick: () => resumeLock() },
      ]);
    }
  }

  function autosave() {
    if (!inDungeon) {
      save.x = Math.round(player.pos.x * 10) / 10;
      save.z = Math.round(player.pos.z * 10) / 10;
    }
    save.yaw = cam.yaw;
    store.save(save);
  }

  function placeTitleCamera(t) {
    const a = t * 0.05;
    const x = cap.x + Math.sin(a) * 320;
    const z = cap.z + Math.cos(a) * 320;
    camera.position.set(x, Math.max(cap.h + 110, terrain.height(x, z, 4) + 40), z);
    camera.lookAt(cap.x, cap.h + 10, cap.z);
  }

  // テスト用のつまみ（?debug を付けたときだけ）
  if (new URLSearchParams(location.search).has('debug')) {
    window.__rpg = { world, terrain, map, player, cam, warp, enterDungeon, changeFloor, toggleView, interact, get state() { return state; }, stats: () => ({ tiles: { ...tiles.stats }, props: { ...props.stats }, st: { ...structures.stats }, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, fps }) };
  }

  // ---- 毎フレーム ----
  const tmpDir = { x: 0, z: 0 };
  let lastNow = performance.now();
  app.start((dt, t) => {
    const now = performance.now();
    fps += (1000 / Math.max(now - lastNow, 1) - fps) * 0.05;
    lastNow = now;
    hud.tick(dt);
    if (state === 'title' || state === 'loading') {
      placeTitleCamera(t);
      tiles.update(camera.position.x, camera.position.z, 150, 6);
      env.follow(camera, camera.position, t);
      structures.animate(dt);
      input.endFrame();
      return;
    }
    if (state === 'play' && !hud.dialogOpen) {
      readIntent(dt);
    } else {
      emptyIntent(intent);
      if (hud.dialogOpen && (input.wasPressed('Escape') || input.wasPressed('KeyF'))) { hud.closeDialog(); resumeLock(); }
      if (state === 'map' && (input.wasPressed('KeyM') || input.wasPressed('Escape'))) map.close();
    }

    // 移動
    const dir = cam.toWorld(intent.moveX, intent.moveZ);
    const l = Math.hypot(dir.x, dir.z);
    tmpDir.x = l > 1 ? dir.x / l : dir.x;
    tmpDir.z = l > 1 ? dir.z / l : dir.z;
    const env2 = inDungeon ? dungeonEnv : worldEnv;
    if (state === 'play') {
      player.update(dt, intent, tmpDir, env2);
      save.odo += Math.min(player.speed * dt, 200);
      save.time += dt;
    }
    cam.update(dt, player, inDungeon ? dungeonCamEnv : worldCamEnv);
    env.follow(camera, player.pos, t);

    if (inDungeon) {
      dungeon.animate(dt);
      markSeen();
      const a = dungeon.nearest(player.pos.x, player.pos.z);
      hud.setPrompt(a ? a.label : '');
      if (intent.interact) interact(a);
    } else {
      const cy = camera.position.y - terrain.height(camera.position.x, camera.position.z, 3);
      tiles.update(camera.position.x, camera.position.z, cy, 5);
      props.update(player.pos.x, player.pos.z, 3);
      structT -= dt;
      if (structT <= 0) { structT = 0.25; structures.update(player.pos.x, player.pos.z, dt, 2); }
      structures.animate(dt);
      const a = structures.nearest(player.pos.x, player.pos.z);
      hud.setPrompt(a ? a.label : '');
      if (intent.interact) interact(a);
      regionT -= dt;
      if (regionT <= 0) { regionT = 0.3; checkRegion(); }
    }

    hud.compass(cam.yaw);
    updateStatus();
    map.drawMini(player.pos.x, player.pos.z, cam.yaw, inDungeon, inDungeon && dungeon.cur ? { f: dungeon.cur.f, seen } : null);
    if (debugOn) hud.debug(debugText());
    saveT += dt;
    if (saveT > 5 && state === 'play') { saveT = 0; autosave(); }
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
      cam.input(s.dx * q.touchSens, s.dy * q.touchSens, 0);
    }
    intent.moveX = mx;
    intent.moveZ = mz;
    if (input.mouse.locked) cam.input(input.mouse.dx * q.mouseSens, input.mouse.dy * q.mouseSens, input.mouse.wheel);
    else if (!cam.fps) cam.input(0, 0, input.mouse.wheel);
    if (input.wasPressed('KeyV')) toggleView();
    if (input.wasPressed('KeyG')) toggleBoost();
    if (input.wasPressed('KeyM')) openMap();
  }

  function checkRegion() {
    const reg = regionAt(world, player.pos.x, player.pos.z);
    if (!reg || reg.id === regionId) return;
    regionId = reg.id;
    if (reg.land) {
      const first = !save.regions[reg.id];
      save.regions[reg.id] = 1;
      hud.banner(reg.name, `ステージ ${reg.stageNo}　${BIOMES[reg.biome].name}${first ? '　― 初到達！' : ''}`);
    } else {
      hud.banner(reg.name, '海');
    }
  }

  function markSeen() {
    const f = dungeon.cur?.f;
    if (!f || !seen) return;
    const c = worldToCell(f, player.pos.x, player.pos.z);
    for (let z = c.z - 4; z <= c.z + 4; z++) for (let x = c.x - 4; x <= c.x + 4; x++) if (x >= 0 && z >= 0 && x < f.w && z < f.h) seen[z * f.w + x] = 1;
  }

  function updateStatus() {
    if (inDungeon) {
      const c = dungeon.cur;
      hud.setStatus(`<div class="st-region">${esc(c.poi.name)}</div><div class="st-sub">${floorLabel(c.poi, c.floor)}　難しさ ${'★'.repeat(c.poi.tier)}</div><div class="st-sub">${c.f.w}×${c.f.h} マス（${c.f.w * 4}m 四方）</div>`);
      return;
    }
    const reg = regionAt(world, player.pos.x, player.pos.z);
    const h = player.pos.y;
    const dc = Math.hypot(player.pos.x - cap.x, player.pos.z - cap.z);
    const name = reg ? (reg.land ? `ST${reg.stageNo}　${esc(reg.name)}` : esc(reg.name)) : '';
    const bi = reg ? BIOMES[reg.biome].name : '';
    hud.setStatus(`<div class="st-region">${name}</div><div class="st-sub">${bi}　標高 ${Math.round(h)}m${player.swimming ? '　<b class="st-swim">泳いでいる</b>' : ''}</div><div class="st-sub">X ${Math.round(player.pos.x)}　Z ${Math.round(player.pos.z)}　王都まで ${fmtDist(dc)}</div>${player.boost ? '<div class="st-boost">爆速モード</div>' : ''}`);
  }

  function debugText() {
    const info = renderer.info;
    const mem = performance.memory ? `${Math.round(performance.memory.usedJSHeapSize / 1048576)}MB` : '-';
    return [
      `FPS ${fps.toFixed(0)}　描画 ${info.render.calls} 回　ポリゴン ${(info.render.triangles / 1000).toFixed(0)}k`,
      `地形タイル 表示 ${tiles.stats.visible} / キャッシュ ${tiles.stats.cached} / 待ち ${tiles.stats.queued}（作成累計 ${tiles.stats.built}）`,
      `草木 ${props.stats.instances} 本（${props.stats.cells} セル）　建物 ${structures.stats.loaded} 件　当たり判定 ${colliders.count} 組`,
      `位置 ${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${player.pos.z.toFixed(1)}　速さ ${player.speed.toFixed(1)}m/s`,
      `ワールド ${WORLD.sizeKm}km（seed ${WORLD.seed}）　生成 ${genMs.toFixed(0)}ms　JS メモリ ${mem}`,
    ].join('\n');
  }
}
