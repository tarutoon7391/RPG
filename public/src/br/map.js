// 島の地図（M）とミニマップ。島は小さいので地形の絵はロード時に一度だけ描く
// 地図をクリックすると、そこへ降下（テスト用。本番は試合開始時の降下地点選び）
import { AREAS, RIVER } from './island.js';
import { TUNNELS } from './build.js';

const RES = 512;
const SPAN = 1120; // 地図に映す範囲（m）

export function createIslandMap(island, built, { onPick, onClose }) {
  const base = document.createElement('canvas');
  base.width = base.height = RES;
  const bctx = base.getContext('2d');
  const toPx = (v) => ((v + SPAN / 2) / SPAN) * RES;

  // 地形の絵
  {
    const img = bctx.createImageData(RES, RES);
    const f = {};
    const col = [0, 0, 0];
    const step = SPAN / RES;
    for (let y = 0; y < RES; y++) {
      const z = -SPAN / 2 + (y + 0.5) * step;
      let prev = island.height(-SPAN / 2, z, 3);
      for (let x = 0; x < RES; x++) {
        const wx = -SPAN / 2 + (x + 0.5) * step;
        const h = island.sample(wx, z, f, 3);
        const diff = (h - prev) / step;
        prev = h;
        island.color(wx, z, f, 0.95, col);
        const sh = Math.max(0.55, Math.min(1.4, 1 + diff * 0.9));
        let r = col[0] * sh;
        let g = col[1] * sh;
        let b = col[2] * sh;
        if (h < 0) {
          const d = Math.min(1, -h / 25);
          r = 0.24 - d * 0.12; g = 0.55 - d * 0.22; b = 0.76 - d * 0.2;
        }
        const i = (y * RES + x) * 4;
        img.data[i] = Math.sqrt(Math.max(0, r)) * 255;
        img.data[i + 1] = Math.sqrt(Math.max(0, g)) * 255;
        img.data[i + 2] = Math.sqrt(Math.max(0, b)) * 255;
        img.data[i + 3] = 255;
      }
    }
    bctx.putImageData(img, 0, 0);
    // 等高線っぽく 20m ごとに薄い線
    bctx.globalAlpha = 0.18;
    bctx.fillStyle = '#000';
    for (let y = 1; y < RES; y += 1) {
      for (let x = 1; x < RES; x += 1) {
        const wx = -SPAN / 2 + x * step;
        const wz = -SPAN / 2 + y * step;
        if (x % 2 || y % 2) continue;
        const a = Math.floor(island.height(wx, wz, 2) / 20);
        const b2 = Math.floor(island.height(wx + step * 2, wz, 2) / 20);
        const c2 = Math.floor(island.height(wx, wz + step * 2, 2) / 20);
        if (a > 0 && (a !== b2 || a !== c2)) bctx.fillRect(x, y, 2, 2);
      }
    }
    bctx.globalAlpha = 1;
  }

  function drawMarks(ctx, k, ox, oy, full) {
    // 宝箱
    ctx.fillStyle = '#ffd54f';
    for (const c of built.chests) {
      const x = (toPx(c.x) - ox) * k;
      const y = (toPx(c.z) - oy) * k;
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    // 抜け道
    for (const t of TUNNELS) {
      const x = (toPx(t.x) - ox) * k;
      const y = (toPx(t.z) - oy) * k;
      ctx.fillStyle = '#b388ff';
      ctx.strokeStyle = '#000';
      ctx.beginPath();
      ctx.arc(x, y, full ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${full ? 10 : 8}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.id, x, y + 0.5);
    }
  }

  // ---- ミニマップ ----
  const mini = document.createElement('canvas');
  mini.className = 'minimap';
  mini.width = mini.height = 180;
  document.body.appendChild(mini);
  const mctx = mini.getContext('2d');
  const MINI = 320; // ミニマップに映す範囲（m）
  function drawMini(px, pz, yaw) {
    const W = mini.width;
    const s = (MINI / SPAN) * RES;
    const ox = toPx(px) - s / 2;
    const oy = toPx(pz) - s / 2;
    mctx.fillStyle = '#16324a';
    mctx.fillRect(0, 0, W, W);
    mctx.drawImage(base, ox, oy, s, s, 0, 0, W, W);
    drawMarks(mctx, W / s, ox, oy, false);
    arrow(mctx, W / 2, W / 2, yaw, 7);
    mctx.fillStyle = '#fff';
    mctx.font = 'bold 12px sans-serif';
    mctx.textAlign = 'center';
    mctx.fillText('N', W / 2, 13);
  }

  // ---- 全体の地図 ----
  const panel = document.createElement('div');
  panel.className = 'worldmap';
  panel.innerHTML = `
    <div class="wm-head"><b class="wm-title">島の地図</b><span class="wm-stats"></span><button type="button" class="wm-close">閉じる（M）</button></div>
    <div class="wm-body"><canvas class="wm-canvas"></canvas><div class="wm-info"></div></div>
    <div class="wm-foot">◆ 宝箱　● 地下の抜け道（A〜E はつながっている）　クリックでその場所へ降下（テスト用）</div>`;
  document.body.appendChild(panel);
  const cv = panel.querySelector('.wm-canvas');
  const cctx = cv.getContext('2d');
  const info = panel.querySelector('.wm-info');
  const title = panel.querySelector('.wm-title');
  const closeBtn = panel.querySelector('.wm-close');
  closeBtn.onclick = () => close();
  let open = false;
  let me = null;
  let dropMode = false;

  function draw() {
    if (!open) return;
    const r = cv.getBoundingClientRect();
    const S = Math.round(Math.max(10, Math.min(r.width, r.height)) * Math.min(2, devicePixelRatio || 1));
    if (cv.width !== S) { cv.width = S; cv.height = S; }
    cctx.drawImage(base, 0, 0, S, S);
    const k = S / RES;
    // 川の名前とエリア名
    cctx.textAlign = 'center';
    cctx.textBaseline = 'middle';
    for (const a of AREAS) {
      if (!a.r) continue;
      const x = toPx(a.x) * k;
      const y = toPx(a.z) * k;
      cctx.strokeStyle = 'rgba(255,255,255,0.35)';
      cctx.setLineDash([4, 4]);
      cctx.beginPath();
      cctx.arc(x, y, (a.r / SPAN) * RES * k, 0, Math.PI * 2);
      cctx.stroke();
      cctx.setLineDash([]);
    }
    drawMarks(cctx, k, 0, 0, true);
    cctx.font = `bold ${Math.round(14 * (S / 700))}px sans-serif`;
    for (const a of AREAS) {
      if (!a.r) continue;
      label(cctx, a.name, toPx(a.x) * k, toPx(a.z) * k, a.color);
    }
    const rv = RIVER[3];
    cctx.font = `${Math.round(12 * (S / 700))}px sans-serif`;
    label(cctx, '大河', toPx(rv[0] - 26) * k, toPx(rv[1]) * k, '#b3e5fc');
    if (me) arrow(cctx, toPx(me.x) * k, toPx(me.z) * k, me.yaw, 10 * (S / 700));
  }
  function label(ctx, t, x, y, c) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(t, x, y);
    ctx.fillStyle = c;
    ctx.fillText(t, x, y);
  }

  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * SPAN - SPAN / 2;
    const z = ((e.clientY - r.top) / r.height) * SPAN - SPAN / 2;
    if (island.height(x, z) < -1.5 && !dropMode) {
      info.innerHTML = '海の上には降りられない';
      info.style.display = 'block';
      return;
    }
    const pick = { x, z };
    close(true);
    onPick(pick);
  });

  function openMap(pos, { drop = false } = {}) {
    open = true;
    dropMode = drop;
    me = pos;
    title.textContent = drop ? '降下地点を選ぶ' : '島の地図';
    closeBtn.style.display = drop ? 'none' : '';
    info.style.display = drop ? 'block' : 'none';
    info.innerHTML = drop ? '<b>どこに降りる？</b><br>地図をクリックすると、その上空から降下する。<br>（海に落ちても泳いで上陸できる）' : '';
    panel.querySelector('.wm-stats').textContent = `約 1km 四方｜エリア ${AREAS.filter((a) => a.r).length}｜宝箱 ${built.chests.length}｜抜け道 ${TUNNELS.length}`;
    panel.style.display = 'flex';
    requestAnimationFrame(draw);
  }
  function close(picked = false) {
    if (!open) return;
    open = false;
    panel.style.display = 'none';
    if (!picked) onClose?.();
  }

  return {
    drawMini,
    open: openMap,
    close,
    get isOpen() { return open; },
    get dropMode() { return dropMode; },
    setMiniVisible(v) { mini.style.display = v ? 'block' : 'none'; },
  };
}

function arrow(ctx, x, y, yaw, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI - yaw);
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
