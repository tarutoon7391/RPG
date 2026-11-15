// 照準：画面中央の十字（いつも）と、覗き込み（ADS）したときの照準器
//   スコープ（スナイパー）… 画面いっぱいの丸いスコープ。大きくズーム
//   ホロサイト（マシンガン・重火器・光線銃など）… ガラス枠に赤い円と点
//   アイアンサイト（拳銃など）… 銃の上の「くぼみ（照門）」と「出っ張り（照星）」を合わせる
//   弓 … 矢じりの目印
// PC は右クリックを押している間、スマホは照準ボタンで切り替え

/** 武器の id → 照準器の種類（無い武器は覗き込みなし） */
const SIGHT_OF = {
  sniper: 'scope',
  machinegunner: 'holo', flamer: 'holo', rocketeer: 'holo', fortress: 'holo', stickybomber: 'holo', laser: 'holo', absorber: 'holo',
  gunslinger: 'iron', gunner: 'iron', medic: 'iron',
  archer: 'bow', hunter: 'bow', trapper: 'bow', splitter: 'bow',
};
/** 照準器ごとの視野角（度。普段は 75） */
export const SIGHT_FOV = { scope: 14, holo: 50, iron: 58, bow: 56 };
export const SIGHT_NAME = { scope: 'スコープ', holo: 'ホロサイト', iron: 'アイアンサイト', bow: '照準' };

export const sightOf = (id) => (id ? SIGHT_OF[id] || null : null);

export function createSights() {
  const el = document.createElement('div');
  el.className = 'sights';
  el.innerHTML = `
    <div class="sg-cross"><i></i><i></i><i></i><i></i><b></b></div>
    <svg class="sg-scope" viewBox="-100 -100 200 200" preserveAspectRatio="xMidYMid slice">
      <defs><mask id="sgm"><rect x="-1000" y="-1000" width="2000" height="2000" fill="white"/><circle r="86" fill="black"/></mask></defs>
      <rect x="-1000" y="-1000" width="2000" height="2000" fill="#000" mask="url(#sgm)"/>
      <circle r="86" fill="none" stroke="#000" stroke-width="5"/>
      <circle r="86" fill="url(#sgv)" opacity="0.5"/>
      <radialGradient id="sgv"><stop offset="0.75" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.9"/></radialGradient>
      <line x1="-86" y1="0" x2="-6" y2="0" stroke="#000" stroke-width="1.6"/><line x1="6" y1="0" x2="86" y2="0" stroke="#000" stroke-width="1.6"/>
      <line x1="0" y1="-86" x2="0" y2="-6" stroke="#000" stroke-width="1.6"/><line x1="0" y1="6" x2="0" y2="86" stroke="#000" stroke-width="1.6"/>
      <line x1="-86" y1="0" x2="-40" y2="0" stroke="#000" stroke-width="4"/><line x1="40" y1="0" x2="86" y2="0" stroke="#000" stroke-width="4"/><line x1="0" y1="40" x2="0" y2="86" stroke="#000" stroke-width="4"/>
      ${[-30, -20, -10, 10, 20, 30].map((v) => `<circle cx="${v}" cy="0" r="0.9" fill="#000"/><circle cx="0" cy="${v}" r="0.9" fill="#000"/>`).join('')}
      <circle r="0.8" fill="#ff1744"/>
    </svg>
    <div class="sg-holo"><div class="sg-holo-glass"><svg viewBox="-50 -50 100 100"><circle r="20" fill="none" stroke="#ff3b30" stroke-width="1.6"/><circle r="1.6" fill="#ff3b30"/><line x1="0" y1="-26" x2="0" y2="-22" stroke="#ff3b30" stroke-width="1.6"/><line x1="0" y1="22" x2="0" y2="26" stroke="#ff3b30" stroke-width="1.6"/><line x1="-26" y1="0" x2="-22" y2="0" stroke="#ff3b30" stroke-width="1.6"/><line x1="22" y1="0" x2="26" y2="0" stroke="#ff3b30" stroke-width="1.6"/></svg></div></div>
    <svg class="sg-iron" viewBox="-100 -60 200 160">
      <path d="M-70 40 L-70 8 L-14 8 L-14 22 Q-14 30 -6 30 L6 30 Q14 30 14 22 L14 8 L70 8 L70 40 Z" fill="#1b1b1f" stroke="#000" stroke-width="1.5"/>
      <rect x="-3.5" y="0" width="7" height="30" fill="#2a2a30" stroke="#000" stroke-width="1"/>
      <circle cx="0" cy="2.5" r="2" fill="#7CFC00"/><circle cx="-9" cy="20" r="1.6" fill="#7CFC00"/><circle cx="9" cy="20" r="1.6" fill="#7CFC00"/>
    </svg>
    <svg class="sg-bow" viewBox="-40 -40 80 80"><path d="M-10 6 L0 -4 L10 6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle r="1.5" fill="#fff"/><circle r="14" fill="none" stroke="#ffffff66" stroke-width="1" stroke-dasharray="3 4"/></svg>
    <div class="sg-label"></div>
    <div class="sg-hit"><i></i><i></i><i></i><i></i></div>`;
  document.body.appendChild(el);
  const cross = el.querySelector('.sg-cross');
  const parts = { scope: el.querySelector('.sg-scope'), holo: el.querySelector('.sg-holo'), iron: el.querySelector('.sg-iron'), bow: el.querySelector('.sg-bow') };
  const label = el.querySelector('.sg-label');
  const hitEl = el.querySelector('.sg-hit');
  let hitT = 0;
  let spread = 0;
  let lastKey = '';

  return {
    /** 撃ったときに十字を一瞬広げる */
    kick(v = 1) { spread = Math.min(1.5, spread + v); },
    /** 当たったときの × 印（クリティカルは赤） */
    hit(crit) {
      hitT = 0.22;
      hitEl.classList.toggle('crit', !!crit);
      hitEl.style.display = 'block';
    },
    /**
     * @param show 照準を出すか（遊んでいる間）
     * @param sight 照準器の種類（null は無し）
     * @param ads 覗き込みの度合い（0〜1）
     */
    update(dt, show, sight, ads) {
      spread = Math.max(0, spread - dt * 5);
      if (hitT > 0) { hitT -= dt; if (hitT <= 0) hitEl.style.display = 'none'; else hitEl.style.opacity = String(Math.min(1, hitT / 0.12)); }
      const on = ads > 0.55 ? sight : null;
      const key = `${show}|${on}|${sight}`;
      if (key !== lastKey) {
        lastKey = key;
        el.style.display = show ? 'block' : 'none';
        cross.style.display = on ? 'none' : 'block';
        for (const [k, p] of Object.entries(parts)) p.style.display = on === k ? 'block' : 'none';
        label.style.display = on ? 'block' : 'none';
        label.textContent = on ? `${SIGHT_NAME[on]}（右クリック／照準ボタンで戻る）` : '';
      }
      if (!on) cross.style.setProperty('--sp', `${6 + spread * 10}px`);
    },
  };
}
