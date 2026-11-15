// タイトル・ロード画面・ポーズ（画質設定つき）
import { WORLD } from '../config.js';

export function createMenu() {
  const el = document.createElement('div');
  el.className = 'menu';
  document.body.appendChild(el);
  let mode = null;

  function show(html) {
    el.innerHTML = `<div class="menu-box">${html}</div>`;
    el.style.display = 'flex';
  }
  function hide() {
    el.style.display = 'none';
    el.innerHTML = '';
    mode = null;
  }

  return {
    get mode() { return mode; },
    hide,
    /** ロード中 */
    loading(text, ratio) {
      if (mode !== 'loading') {
        mode = 'loading';
        show(`<h1>RPG</h1><p class="menu-sub">ワールドを生成中…</p><div class="menu-bar"><div></div></div><p class="menu-note"></p>`);
      }
      el.querySelector('.menu-bar div').style.width = `${Math.round(ratio * 100)}%`;
      el.querySelector('.menu-note').textContent = text;
    },
    title({ hasSave, stats, onNew, onContinue, onSettings, onGallery, heading = 'RPG <small>ワールドテスト</small>', sub = `${WORLD.sizeKm}km 四方の大陸を歩き回るだけのテスト版`, newLabel = 'はじめから（王都から）', keys, note = '広さを変える：URL の末尾に ?size=8 / 16 / 32 / 64 / 128（km）' }) {
      mode = 'title';
      show(`
        <h1>${heading}</h1>
        <p class="menu-sub">${sub}</p>
        <ul class="menu-stats">${stats.map((s) => `<li>${s}</li>`).join('')}</ul>
        <div class="menu-btns">
          ${hasSave ? '<button type="button" data-b="cont" class="primary">つづきから</button>' : ''}
          <button type="button" data-b="new" class="${hasSave ? '' : 'primary'}">${newLabel}</button>
          ${onGallery ? '<button type="button" data-b="gallery">武器図鑑</button>' : ''}
          ${onSettings ? '<button type="button" data-b="settings">設定</button>' : ''}
        </div>
        <pre class="menu-keys">${keys || `WASD：移動　Shift：ダッシュ　Space：ジャンプ　マウス：視点（クリックでロック）
F：調べる・入る　M：マップ　V：一人称／三人称　G：爆速（テスト用）　F3：デバッグ表示　Esc：ポーズ`}</pre>
        <p class="menu-note">${note}</p>`);
      el.querySelector('[data-b="new"]').onclick = onNew;
      el.querySelector('[data-b="cont"]')?.addEventListener('click', onContinue);
      el.querySelector('[data-b="settings"]')?.addEventListener('click', onSettings);
      el.querySelector('[data-b="gallery"]')?.addEventListener('click', onGallery);
    },
    /**
     * ポーズ。q は設定（変えると onChange）。touch：スマホならスマホの感度を上に出す
     */
    pause({ q, info, touch = false, onResume, onMap, onChange, onTitle, onGallery }) {
      mode = 'pause';
      show(`
        <h2>ポーズ</h2>
        <p class="menu-sub">${info}</p>
        ${settingsHtml(touch)}
        <div class="menu-btns">
          <button type="button" data-b="resume" class="primary">再開</button>
          <button type="button" data-b="map">マップ</button>
          ${onGallery ? '<button type="button" data-b="gallery">武器図鑑</button>' : ''}
          <button type="button" data-b="title">タイトルへ</button>
        </div>`);
      bind(q, onChange);
      el.querySelector('[data-b="gallery"]')?.addEventListener('click', onGallery);
      el.querySelector('[data-b="resume"]').onclick = onResume;
      el.querySelector('[data-b="map"]').onclick = onMap;
      el.querySelector('[data-b="title"]').onclick = onTitle;
    },
    /** 設定画面（タイトルから） */
    settings({ q, touch = false, onChange, onBack }) {
      mode = 'settings';
      show(`
        <h2>設定</h2>
        ${settingsHtml(touch)}
        <div class="menu-btns"><button type="button" data-b="back" class="primary">もどる</button></div>`);
      bind(q, onChange);
      el.querySelector('[data-b="back"]').onclick = onBack;
    },
  };

  /** 設定の中身。操作している方の感度を先頭に出す */
  function settingsHtml(touch) {
    const touchRow = '<label>視点の感度（スマホのフリック） <span data-v="touchSens"></span><input type="range" data-q="touchSens" min="1" max="5" step="0.1"></label>';
    const mouseRow = '<label>視点の感度（PC のマウス） <span data-v="mouseSens"></span><input type="range" data-q="mouseSens" min="0.3" max="3" step="0.05"></label>';
    return `
      <div class="menu-settings">
        <div class="menu-group">操作</div>
        ${touch ? touchRow + mouseRow : mouseRow + touchRow}
        <div class="menu-group">画質</div>
        <label>描画距離 <span data-v="viewDist"></span><input type="range" data-q="viewDist" min="1000" max="40000" step="500"></label>
        <label>地形の細かさ <span data-v="detail"></span><input type="range" data-q="detail" min="0.8" max="3" step="0.1"></label>
        <label>木や岩の範囲 <span data-v="propDist"></span><input type="range" data-q="propDist" min="1" max="9" step="1"></label>
        <label>解像度 <span data-v="pixelRatio"></span><input type="range" data-q="pixelRatio" min="0.5" max="2" step="0.25"></label>
        <label class="menu-check"><input type="checkbox" data-q="shadows"> 影</label>
      </div>`;
  }

  function bind(q, onChange) {
    const fmt = {
      viewDist: (v) => `${(v / 1000).toFixed(1)}km`,
      detail: (v) => `×${(+v).toFixed(1)}`,
      propDist: (v) => `${v * 128}m`,
      pixelRatio: (v) => `×${v}`,
      touchSens: (v) => `×${(+v).toFixed(1)}${+v <= 1 ? '（いちばん遅い）' : ''}`,
      mouseSens: (v) => `×${(+v).toFixed(2)}${+v === 1 ? '（標準）' : ''}`,
    };
    for (const inp of el.querySelectorAll('[data-q]')) {
      const k = inp.dataset.q;
      const lab = el.querySelector(`[data-v="${k}"]`);
      if (inp.type === 'checkbox') inp.checked = q[k];
      else { inp.value = q[k]; lab.textContent = fmt[k](q[k]); }
      inp.oninput = () => {
        q[k] = inp.type === 'checkbox' ? inp.checked : Number(inp.value);
        if (lab) lab.textContent = fmt[k](q[k]);
        onChange(k);
      };
    }
  }
}
