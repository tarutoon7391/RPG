// HUD：左上のステータス・方位・調べるの案内・バナー・トースト・会話ウィンドウ・デバッグ表示
import { esc } from '../util.js';

export function createHud() {
  const root = document.createElement('div');
  root.className = 'hud';
  root.innerHTML = `
    <div class="hud-status"></div>
    <div class="hud-compass"><div class="hud-compass-strip"></div><i></i></div>
    <div class="hud-prompt"></div>
    <div class="hud-banner"><small></small><b></b></div>
    <div class="hud-toast"></div>
    <div class="hud-debug"></div>
    <div class="hud-dialog"><div class="hud-dialog-body"></div><div class="hud-dialog-btns"></div></div>
    <div class="hud-cross"></div>
  `;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const status = $('.hud-status');
  const strip = $('.hud-compass-strip');
  const prompt = $('.hud-prompt');
  const banner = $('.hud-banner');
  const toastEl = $('.hud-toast');
  const debug = $('.hud-debug');
  const dialog = $('.hud-dialog');
  const cross = $('.hud-cross');
  let lastStatus = '';
  let lastPrompt = null;
  let bannerT = 0;
  let toastT = 0;
  let dialogOpen = false;

  // 方位の帯（N・E・S・W と 15° ごとの目盛り）
  const marks = [];
  for (let d = -360; d <= 720; d += 15) {
    const n = ((d % 360) + 360) % 360;
    const lab = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[n];
    marks.push(`<span style="left:${(d + 360) * 2}px" class="${lab ? 'big' : ''}">${lab || (n % 45 === 0 ? '·' : '|')}</span>`);
  }
  strip.innerHTML = marks.join('');

  return {
    root,
    setStatus(html) {
      if (html === lastStatus) return;
      lastStatus = html;
      status.innerHTML = html;
    },
    /** 方位：yaw は正面ベクトル (sin, cos)。北 = -z */
    compass(yaw) {
      // 正面の方角（度。北=0、東=90）
      const deg = ((Math.atan2(Math.sin(yaw), -Math.cos(yaw)) * 180) / Math.PI + 360) % 360;
      strip.style.transform = `translateX(${-(deg + 360) * 2 + 150}px)`;
    },
    setPrompt(text) {
      if (text === lastPrompt) return;
      lastPrompt = text;
      prompt.style.display = text ? 'block' : 'none';
      prompt.innerHTML = text ? `<b class="key-f">F</b>${esc(text)}` : '';
    },
    banner(title, sub = '') {
      banner.querySelector('b').textContent = title;
      banner.querySelector('small').textContent = sub;
      banner.classList.remove('show');
      void banner.offsetWidth;
      banner.classList.add('show');
      bannerT = 3.2;
    },
    toast(text, sec = 2.4) {
      toastEl.textContent = text;
      toastEl.classList.add('show');
      toastT = sec;
    },
    debug(text) {
      debug.style.display = text ? 'block' : 'none';
      if (text) debug.textContent = text;
    },
    crosshair(on) { cross.style.display = on ? 'block' : 'none'; },
    /** 会話ウィンドウ。buttons: [{ label, onClick }] */
    dialog(html, buttons = [{ label: '閉じる' }]) {
      dialogOpen = true;
      dialog.querySelector('.hud-dialog-body').innerHTML = html;
      const box = dialog.querySelector('.hud-dialog-btns');
      box.innerHTML = '';
      for (const b of buttons) {
        const el = document.createElement('button');
        el.type = 'button';
        el.textContent = b.label;
        el.onclick = () => { closeDialog(); b.onClick?.(); };
        box.appendChild(el);
      }
      dialog.style.display = 'block';
    },
    get dialogOpen() { return dialogOpen; },
    closeDialog,
    tick(dt) {
      if (bannerT > 0 && (bannerT -= dt) <= 0) banner.classList.remove('show');
      if (toastT > 0 && (toastT -= dt) <= 0) toastEl.classList.remove('show');
    },
  };
  function closeDialog() {
    dialogOpen = false;
    dialog.style.display = 'none';
  }
}
