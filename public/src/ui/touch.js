// スマホ（横持ち）のタッチ操作
// 左：仮想スティック（触ったところが中心。いっぱいに倒すとダッシュ）／右：ドラッグで視点
// ボタン：ジャンプ・調べる・爆速（テスト）・マップ・視点・ポーズ
export function isTouchDevice() {
  if (new URLSearchParams(location.search).has('touch')) return true;
  return matchMedia('(hover: none) and (pointer: coarse)').matches;
}

const STICK_R = 56;
const LOOK_SENS = 1.6;

export function createTouch({ onPause, onView, onMap, onBoost }) {
  document.body.classList.add('touch-on');
  const root = document.createElement('div');
  root.className = 'touch';
  root.innerHTML = `
    <div class="t-look"></div>
    <div class="t-stick"><div class="t-base"></div><div class="t-knob"></div></div>
    <button type="button" class="t-btn t-jump" data-k="jump">ジャンプ</button>
    <button type="button" class="t-btn t-act" data-k="interact">調べる</button>
    <div class="t-top">
      <button type="button" data-a="pause">⏸</button>
      <button type="button" data-a="map">🗺</button>
      <button type="button" data-a="view">視点</button>
      <button type="button" data-a="boost">爆速</button>
    </div>`;
  document.body.appendChild(root);
  const stickEl = root.querySelector('.t-stick');
  const knob = root.querySelector('.t-knob');
  const look = root.querySelector('.t-look');
  const state = { x: 0, z: 0, dash: false, dx: 0, dy: 0, pressed: new Set(), held: new Set() };
  let stickId = null;
  let sx = 0;
  let sy = 0;
  let lookId = null;
  let lx = 0;
  let ly = 0;

  // スティック（画面の左半分ならどこでも）
  root.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    if (e.clientX < innerWidth * 0.45 && stickId === null) {
      stickId = e.pointerId;
      sx = e.clientX;
      sy = e.clientY;
      stickEl.style.left = `${sx - 70}px`;
      stickEl.style.top = `${sy - 70}px`;
      stickEl.classList.add('on');
    } else if (lookId === null) {
      lookId = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
    }
    root.setPointerCapture?.(e.pointerId);
  });
  root.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickId) {
      let dx = e.clientX - sx;
      let dy = e.clientY - sy;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      state.x = dx / STICK_R;
      state.z = -dy / STICK_R;
      state.dash = d > STICK_R * 0.92;
    } else if (e.pointerId === lookId) {
      state.dx += (e.clientX - lx) * LOOK_SENS;
      state.dy += (e.clientY - ly) * LOOK_SENS;
      lx = e.clientX;
      ly = e.clientY;
    }
  });
  const end = (e) => {
    if (e.pointerId === stickId) {
      stickId = null;
      state.x = state.z = 0;
      state.dash = false;
      knob.style.transform = '';
      stickEl.classList.remove('on');
    }
    if (e.pointerId === lookId) lookId = null;
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);

  for (const b of root.querySelectorAll('.t-btn')) {
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      state.pressed.add(b.dataset.k);
      state.held.add(b.dataset.k);
    });
    const up = () => state.held.delete(b.dataset.k);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
  }
  for (const b of root.querySelectorAll('[data-a]')) {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const a = b.dataset.a;
      if (a === 'pause') onPause();
      if (a === 'map') onMap();
      if (a === 'view') onView();
      if (a === 'boost') b.classList.toggle('on', onBoost());
    });
  }
  look.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    state,
    setVisible(v) { root.style.display = v ? 'block' : 'none'; },
    /** フレームの最後に */
    endFrame() {
      state.dx = 0;
      state.dy = 0;
      state.pressed.clear();
    },
  };
}
