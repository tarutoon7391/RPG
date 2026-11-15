// 持ち物：武器 3 枠。画面下に並べて、1〜3・ホイール・タップで切り替え
import { WEAPONS_BY_ID, RARITIES, weaponDamage } from './catalog.js';
import { esc } from '../util.js';

export const SLOTS = 3;

export function createInventory({ onChange }) {
  const slots = Array(SLOTS).fill(null); // { id, rarity }
  let cur = 0;
  const bar = document.createElement('div');
  bar.className = 'wbar';
  document.body.appendChild(bar);

  function render() {
    bar.innerHTML = slots.map((s, i) => {
      if (!s) return `<button type="button" class="wslot ${i === cur ? 'on' : ''}" data-i="${i}"><small>${i + 1}</small><span class="wempty">素手</span></button>`;
      const w = WEAPONS_BY_ID[s.id];
      const R = RARITIES[s.rarity];
      return `<button type="button" class="wslot ${i === cur ? 'on' : ''}" data-i="${i}" style="--rc:${R.color}"><small>${i + 1}</small><b>${esc(w.name)}</b><em>${R.name}・${w.typeName}・攻 ${weaponDamage(w, s.rarity)}</em></button>`;
    }).join('');
    for (const b of bar.querySelectorAll('.wslot')) b.onclick = () => select(Number(b.dataset.i));
  }

  function select(i) {
    cur = ((i % SLOTS) + SLOTS) % SLOTS;
    render();
    onChange(slots[cur]);
  }

  /**
   * 拾う。空き枠があればそこへ、無ければ今の枠と入れ替える
   * @returns 手放した武器（無ければ null）
   */
  function pickUp(item) {
    let i = slots.indexOf(null);
    let dropped = null;
    if (i < 0) {
      i = cur;
      dropped = slots[cur];
    }
    slots[i] = { id: item.id, rarity: item.rarity };
    cur = i;
    render();
    onChange(slots[cur]);
    return dropped;
  }

  function clear() {
    slots.fill(null);
    cur = 0;
    render();
    onChange(null);
  }

  render();
  return {
    slots,
    get current() { return slots[cur]; },
    get index() { return cur; },
    select,
    next(d) { select(cur + d); },
    pickUp,
    clear,
    setVisible(v) { bar.style.display = v ? 'flex' : 'none'; },
  };
}
