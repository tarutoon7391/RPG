// ワールドマップ（M）とミニマップ。地形の絵は少しずつ（数フレームに分けて）描く
// マップでは場所をクリックするとテスト用のワープができる
import { WORLD } from '../config.js';
import { BIOMES } from '../world/terrain.js';
import { esc, fmtDist } from '../util.js';

const RES = 1024;

export function createMap(world, { onWarp, onClose }) {
  // ---- 地形の絵（オフスクリーン） ----
  const base = document.createElement('canvas');
  base.width = base.height = RES;
  const bctx = base.getContext('2d');
  let painted = false;
  let rows = 0;
  // 絵は Web Worker が少しずつ送ってくる（メインスレッドを止めない）
  const qs = new URLSearchParams(location.search);
  qs.set('res', RES);
  qs.set('mode', 'world');
  const worker = new Worker(new URL(`./mapworker.js?${qs}`, import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.done) { painted = true; worker.terminate(); if (open) draw(); return; }
    bctx.putImageData(new ImageData(m.data, m.res, m.n), 0, m.y0);
    rows = m.y0 + m.n;
    if (open && (rows % 128 === 0)) draw();
  };
  worker.onerror = (e) => console.error('[map] 地図の作成に失敗', e.message);
  bctx.fillStyle = '#16324a';
  bctx.fillRect(0, 0, RES, RES);

  const toPx = (x) => ((x + WORLD.half) / WORLD.size) * RES;

  // ---- ミニマップ ----
  const mini = document.createElement('canvas');
  mini.className = 'minimap';
  mini.width = mini.height = 180;
  document.body.appendChild(mini);
  const mctx = mini.getContext('2d');
  const MINI_SPAN = 2400; // ミニマップに映す範囲（m）

  function drawMini(px, pz, yaw, inDungeon, dungeonInfo) {
    const W = mini.width;
    mctx.fillStyle = '#0b0f16';
    mctx.fillRect(0, 0, W, W);
    if (inDungeon) {
      drawDungeonMini(dungeonInfo, px, pz, yaw);
      return;
    }
    const s = (MINI_SPAN / WORLD.size) * RES;
    mctx.imageSmoothingEnabled = true;
    mctx.drawImage(base, toPx(px) - s / 2, toPx(pz) - s / 2, s, s, 0, 0, W, W);
    const k = W / MINI_SPAN;
    for (const p of world.pois) {
      const dx = (p.x - px) * k + W / 2;
      const dz = (p.z - pz) * k + W / 2;
      if (dx < -6 || dz < -6 || dx > W + 6 || dz > W + 6) continue;
      icon(mctx, p, dx, dz, 1);
    }
    arrow(mctx, W / 2, W / 2, yaw, 7);
    mctx.fillStyle = '#fff';
    mctx.font = 'bold 12px sans-serif';
    mctx.fillText('N', W / 2 - 4, 13);
  }

  function drawDungeonMini(info, px, pz, yaw) {
    if (!info) return;
    const { f: fl, seen } = info;
    const W = mini.width;
    const cell = 6;
    const c = { x: px / 4 + fl.w / 2, z: pz / 4 + fl.h / 2 };
    for (let z = 0; z < fl.h; z++) {
      for (let x = 0; x < fl.w; x++) {
        const v = fl.grid[z * fl.w + x];
        if (v !== 1 || !seen[z * fl.w + x]) continue;
        const sx = (x - c.x) * cell + W / 2;
        const sz = (z - c.z) * cell + W / 2;
        if (sx < -cell || sz < -cell || sx > W || sz > W) continue;
        mctx.fillStyle = '#5a6577';
        mctx.fillRect(sx, sz, cell, cell);
      }
    }
    for (const [g, color] of [[fl.start, '#7fe0ff'], [fl.goal, '#ffd54f']]) {
      if (!seen[g.z * fl.w + g.x]) continue;
      mctx.fillStyle = color;
      mctx.fillRect((g.x - c.x) * cell + W / 2, (g.z - c.z) * cell + W / 2, cell, cell);
    }
    arrow(mctx, W / 2, W / 2, yaw, 7);
  }

  // ---- 全体マップ ----
  const panel = document.createElement('div');
  panel.className = 'worldmap';
  panel.innerHTML = `
    <div class="wm-head"><b>ワールドマップ</b><span class="wm-stats"></span><button type="button" class="wm-close">閉じる（M）</button></div>
    <div class="wm-body"><canvas class="wm-canvas"></canvas><div class="wm-info"></div></div>
    <div class="wm-foot">ホイール／ピンチ：拡大縮小　ドラッグ：移動　クリック：場所を選ぶ（テスト用ワープ）</div>`;
  document.body.appendChild(panel);
  const cv = panel.querySelector('.wm-canvas');
  const cctx = cv.getContext('2d');
  const info = panel.querySelector('.wm-info');
  const statsEl = panel.querySelector('.wm-stats');
  panel.querySelector('.wm-close').onclick = () => close();
  let open = false;
  let zoom = 1;
  let cx = 0;
  let cz = 0;
  let sel = null;
  let me = { x: 0, z: 0, yaw: 0 };
  let saveRef = null;

  function viewSize() {
    const r = cv.getBoundingClientRect();
    return Math.max(10, Math.min(r.width, r.height));
  }
  /** 画面 px → ワールド */
  function screenToWorld(sx, sy) {
    const S = cv.width;
    const span = WORLD.size / zoom;
    return { x: cx + (sx / S - 0.5) * span, z: cz + (sy / S - 0.5) * span };
  }
  function worldToScreen(x, z) {
    const S = cv.width;
    const span = WORLD.size / zoom;
    return { x: ((x - cx) / span + 0.5) * S, y: ((z - cz) / span + 0.5) * S };
  }

  function draw() {
    if (!open) return;
    const S = Math.round(viewSize() * Math.min(2, devicePixelRatio || 1));
    if (cv.width !== S) { cv.width = S; cv.height = S; }
    cctx.fillStyle = '#16324a';
    cctx.fillRect(0, 0, S, S);
    const span = WORLD.size / zoom;
    const sx = toPx(cx - span / 2);
    const sy = toPx(cz - span / 2);
    const sw = (span / WORLD.size) * RES;
    cctx.imageSmoothingEnabled = zoom < 6;
    cctx.drawImage(base, sx, sy, sw, sw, 0, 0, S, S);
    // リージョンの線
    cctx.strokeStyle = 'rgba(255,255,255,0.12)';
    cctx.lineWidth = 1;
    for (let i = 0; i <= WORLD.regions; i++) {
      const v = -WORLD.half + i * WORLD.regionSize;
      const a = worldToScreen(v, -WORLD.half);
      const b = worldToScreen(v, WORLD.half);
      cctx.beginPath(); cctx.moveTo(a.x, a.y); cctx.lineTo(b.x, b.y); cctx.stroke();
      const c = worldToScreen(-WORLD.half, v);
      const d = worldToScreen(WORLD.half, v);
      cctx.beginPath(); cctx.moveTo(c.x, c.y); cctx.lineTo(d.x, d.y); cctx.stroke();
    }
    const scale = S / 600;
    const big = Math.max(1, Math.min(2.2, zoom / 2)) * scale;
    for (const p of world.pois) {
      if (p.inCapital) continue;
      const q = worldToScreen(p.x, p.z);
      if (q.x < -10 || q.y < -10 || q.x > S + 10 || q.y > S + 10) continue;
      if (p.kind === 'stage' && zoom < 1.5) continue;
      icon(cctx, p, q.x, q.y, big, saveRef);
    }
    // 名前（拡大したとき）
    cctx.font = `${Math.round(12 * scale)}px sans-serif`;
    cctx.textAlign = 'center';
    for (const p of world.pois) {
      const show = p.kind === 'capital' || p.id === 'demon' || (zoom >= 3 && p.kind === 'town') || (zoom >= 6 && !p.inCapital);
      if (!show) continue;
      const q = worldToScreen(p.x, p.z);
      if (q.x < 0 || q.y < 0 || q.x > S || q.y > S) continue;
      label(cctx, p.name, q.x, q.y - 9 * big);
    }
    if (zoom >= 2.5) {
      cctx.font = `bold ${Math.round(11 * scale)}px sans-serif`;
      for (const r of world.regions) {
        if (!r.land) continue;
        const q = worldToScreen(r.cx, r.cz - WORLD.regionSize * 0.42);
        label(cctx, `ST${r.stageNo}`, q.x, q.y, 'rgba(255,255,255,0.75)');
      }
    }
    if (sel) {
      const q = worldToScreen(sel.x, sel.z);
      cctx.strokeStyle = '#fff';
      cctx.lineWidth = 2 * scale;
      cctx.beginPath(); cctx.arc(q.x, q.y, 9 * scale, 0, Math.PI * 2); cctx.stroke();
    }
    const m = worldToScreen(me.x, me.z);
    arrow(cctx, m.x, m.y, me.yaw, 9 * scale);
  }

  function label(ctx, text, x, y, color = '#fff') {
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function select(wx, wz) {
    // 近くの場所を拾う
    const span = WORLD.size / zoom;
    const pick = (span / 600) * 14;
    let best = null;
    let bd = pick;
    for (const p of world.pois) {
      if (p.inCapital) continue;
      const d = Math.hypot(p.x - wx, p.z - wz);
      if (d < bd) { bd = d; best = p; }
    }
    const reg = world.regions.find((r) => wx >= r.cx - WORLD.regionSize / 2 && wx < r.cx + WORLD.regionSize / 2 && wz >= r.cz - WORLD.regionSize / 2 && wz < r.cz + WORLD.regionSize / 2);
    sel = best ? { x: best.x, z: best.z, poi: best } : { x: wx, z: wz };
    const dist = Math.hypot(sel.x - me.x, sel.z - me.z);
    let html = '';
    if (best) {
      html += `<b>${esc(best.name)}</b><br>`;
      if (best.kind === 'dungeon') html += `${best.type === 'tower' || best.type === 'demon' || best.type === 'castle' ? '上へ' : '地下へ'} ${best.floors} 階　難しさ ${'★'.repeat(best.tier)}<br>`;
    } else {
      html += `<b>X ${Math.round(wx)} / Z ${Math.round(wz)}</b><br>`;
    }
    if (reg) html += reg.land ? `ステージ ${reg.stageNo}「${esc(reg.name)}」（${BIOMES[reg.biome].name}）<br>` : `${esc(reg.name)}<br>`;
    html += `ここから ${fmtDist(dist)}（歩いて約 ${Math.ceil(dist / 6 / 60)} 分）`;
    info.innerHTML = `${html}<button type="button" class="wm-warp">ここへワープ（テスト用）</button>`;
    info.style.display = 'block';
    info.querySelector('.wm-warp').onclick = () => { const s = sel; close(); onWarp(s.poi ? warpSpot(s.poi) : { x: s.x, z: s.z }); };
    draw();
  }

  /** 場所のちょっと手前に降ろす */
  function warpSpot(p) {
    if (p.kind === 'town' || p.kind === 'capital') return { x: p.x, z: p.z + 20 };
    const d = p.kind === 'dungeon' ? (p.type === 'demon' ? 40 : 18) : 8;
    return { x: p.x + Math.sin(p.yaw || 0) * d, z: p.z + Math.cos(p.yaw || 0) * d };
  }

  // 操作
  let drag = null;
  const pointers = new Map();
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag = { x: e.clientX, y: e.clientY, moved: 0, cx, cz };
  });
  cv.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)[1];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
      const d1 = Math.hypot(a.x - b.x, a.y - b.y);
      if (d0 > 0) setZoom(zoom * (d1 / d0));
      if (drag) drag.moved = 99;
      return;
    }
    if (!drag) return;
    const r = cv.getBoundingClientRect();
    const span = WORLD.size / zoom;
    const ddx = e.clientX - drag.x;
    const ddy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.hypot(ddx, ddy));
    cx = drag.cx - (ddx / r.width) * span;
    cz = drag.cz - (ddy / r.height) * span;
    clampView();
    draw();
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (drag && drag.moved < 6 && pointers.size === 0) {
      const r = cv.getBoundingClientRect();
      const w = screenToWorld(((e.clientX - r.left) / r.width) * cv.width, ((e.clientY - r.top) / r.height) * cv.height);
      select(w.x, w.z);
    }
    if (pointers.size === 0) drag = null;
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); drag = null; });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const before = screenToWorld(((e.clientX - r.left) / r.width) * cv.width, ((e.clientY - r.top) / r.height) * cv.height);
    setZoom(zoom * (e.deltaY < 0 ? 1.25 : 0.8));
    const after = screenToWorld(((e.clientX - r.left) / r.width) * cv.width, ((e.clientY - r.top) / r.height) * cv.height);
    cx += before.x - after.x;
    cz += before.z - after.z;
    clampView();
    draw();
  }, { passive: false });

  function setZoom(z) {
    zoom = Math.max(1, Math.min(48, z));
    clampView();
    draw();
  }
  function clampView() {
    const span = WORLD.size / zoom;
    const lim = WORLD.half - span / 2;
    cx = Math.max(-lim, Math.min(lim, cx));
    cz = Math.max(-lim, Math.min(lim, cz));
  }

  function openMap(px, pz, yaw, save) {
    open = true;
    me = { x: px, z: pz, yaw };
    saveRef = save;
    zoom = Math.max(zoom, 2);
    cx = px;
    cz = pz;
    clampView();
    sel = null;
    info.style.display = 'none';
    const land = world.regions.filter((r) => r.land).length;
    const dg = world.pois.filter((p) => p.kind === 'dungeon').length;
    const towns = world.pois.filter((p) => p.kind === 'town').length + 1;
    const seenR = save ? Object.keys(save.regions).length : 0;
    const clr = save ? Object.keys(save.cleared).length : 0;
    statsEl.textContent = `${WORLD.sizeKm}km 四方｜ステージ ${seenR}/${land}｜町 ${towns}｜ダンジョン踏破 ${clr}/${dg}`;
    panel.style.display = 'flex';
    requestAnimationFrame(draw);
  }
  function close() {
    if (!open) return;
    open = false;
    panel.style.display = 'none';
    onClose?.();
  }

  return {
    drawMini,
    open: openMap,
    close,
    redraw: draw,
    get isOpen() { return open; },
    get painted() { return painted; },
    get row() { return rows; },
    base,
    setMiniVisible(v) { mini.style.display = v ? 'block' : 'none'; },
  };
}

/** マップのアイコン */
function icon(ctx, p, x, y, k = 1, save) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  if (p.kind === 'capital') {
    star(ctx, 8 * k, '#ffe066');
  } else if (p.kind === 'town') {
    ctx.fillStyle = '#ffd54f';
    ctx.fillRect(-4 * k, -4 * k, 8 * k, 8 * k);
    ctx.strokeRect(-4 * k, -4 * k, 8 * k, 8 * k);
  } else if (p.kind === 'stage') {
    ctx.fillStyle = '#e8f4ff';
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-2.6 * k, -2.6 * k, 5.2 * k, 5.2 * k);
    ctx.strokeRect(-2.6 * k, -2.6 * k, 5.2 * k, 5.2 * k);
  } else if (p.kind === 'dungeon') {
    const s = p.type === 'demon' ? 9 * k : 5 * k;
    ctx.fillStyle = p.type === 'demon' ? '#c070ff' : save?.cleared?.[p.id] ? '#69f0ae' : save?.entered?.[p.id] ? '#ffb74d' : '#ff6a5a';
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s, s * 0.8);
    ctx.lineTo(-s, s * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function star(ctx, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** 向きの矢印（yaw の正面 = (sin, cos)。画面は上が -z） */
function arrow(ctx, x, y, yaw, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(Math.cos(yaw), Math.sin(yaw)) + Math.PI / 2);
  ctx.fillStyle = '#ff3d3d';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(s * 0.7, s * 0.8);
  ctx.lineTo(0, s * 0.35);
  ctx.lineTo(-s * 0.7, s * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
