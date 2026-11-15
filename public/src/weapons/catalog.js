// バトロワの武器の一覧（96種）とスキン（レア度ごとの色）。
// 形は 3DGAME の RPG の武器（weapons/shapes_*.js、形の id = 3DRPG の職業 id）をそのまま使う。
// 攻撃力などの数値は戦闘を入れるときの下書き（種類ごとの基本値 × 武器ごとの少しの差 × レア度）
import { hash2 } from '../noise.js';

/** 武器の種類 */
export const TYPES = {
  sword: { name: '剣', melee: true, dmg: 22, rate: 1.6, range: 2.8 },
  great: { name: '大剣・大鎌', melee: true, dmg: 38, rate: 0.9, range: 3.4 },
  katana: { name: '刀', melee: true, dmg: 26, rate: 1.5, range: 3.0 },
  dagger: { name: '短剣', melee: true, dmg: 14, rate: 2.6, range: 2.2 },
  spear: { name: '槍', melee: true, dmg: 24, rate: 1.2, range: 4.2 },
  axe: { name: '斧', melee: true, dmg: 34, rate: 1.0, range: 3.0 },
  blunt: { name: '鈍器', melee: true, dmg: 30, rate: 1.1, range: 2.8 },
  fist: { name: '拳', melee: true, dmg: 12, rate: 3.0, range: 2.0 },
  staff: { name: '杖（魔法）', melee: false, dmg: 20, rate: 1.4, range: 200 },
  bow: { name: '弓', melee: false, dmg: 28, rate: 1.0, range: 320 },
  gun: { name: '銃', melee: false, dmg: 16, rate: 3.0, range: 260 },
  heavy: { name: '重火器', melee: false, dmg: 45, rate: 0.6, range: 260 },
  throw: { name: '投げ物', melee: false, dmg: 26, rate: 1.0, range: 120 },
  odd: { name: '変わり種', melee: false, dmg: 18, rate: 1.5, range: 100 },
};

/** スキン（レア度）。コモンは 3DRPG の元の色。上のレア度ほど金属・飾り・光る部分の色が変わる */
export const RARITIES = [
  { id: 'common', name: 'コモン', skin: '元の色', color: '#b0bec5', weight: 44, mul: 1.0 },
  { id: 'uncommon', name: 'アンコモン', skin: '翠玉', color: '#66bb6a', weight: 28, mul: 1.08, metal: 0x8fc99a, accent: 0x2e7d32, glow: 0x69f0ae, glowPower: 0.9, tint: 0.6 },
  { id: 'rare', name: 'レア', skin: '蒼鋼', color: '#42a5f5', weight: 16, mul: 1.17, metal: 0x8fb8e8, accent: 0x1565c0, glow: 0x40c4ff, glowPower: 1.1, tint: 0.65 },
  { id: 'epic', name: 'エピック', skin: '紫晶', color: '#ab47bc', weight: 9, mul: 1.27, metal: 0xb39ddb, accent: 0x6a1b9a, glow: 0xea80fc, glowPower: 1.4, tint: 0.7 },
  { id: 'legend', name: 'レジェンド', skin: '黄金', color: '#ffca28', weight: 3, mul: 1.4, metal: 0xffd54f, accent: 0xe65100, glow: 0xfff59d, glowPower: 1.8, tint: 0.85, aura: true },
];

// [形の id, 名前, 種類, 元の金属色, 元の飾り色, 元の防具色]
const LIST = [
  ['swordsman', 'ロングソード', 'sword', 0xcfd8dc, 0xffd54f, 0x5d7fa8],
  ['knight', 'フランジメイス', 'blunt', 0xb0bec5, 0x90a4ae, 0x78909c],
  ['mage', 'サファイアロッド', 'staff', 0x64b5f6, 0x64b5f6, 0x283593],
  ['priest', '聖光の十字杖', 'staff', 0xffe082, 0xfff59d, 0xeceff1],
  ['archer', 'ロングボウ', 'bow', 0x8d6e63, 0xa5d6a7, 0x558b2f],
  ['ninja', '忍刀', 'katana', 0xb0bec5, 0xb39ddb, 0x37474f],
  ['bard', '吟遊のリュート', 'odd', 0xffcc80, 0xf48fb1, 0xad1457],
  ['summoner', '召喚の輪杖', 'staff', 0x80cbc4, 0x80cbc4, 0x00695c],
  ['lancer', '房飾りの長槍', 'spear', 0xd7ccc8, 0xffab91, 0x8d6e63],
  ['monk', '布巻きの籠手', 'fist', 0xffcc80, 0xffcc80, 0xe65100],
  ['alchemist', '光る丸フラスコ', 'throw', 0xaed581, 0xc5e1a5, 0x558b2f],
  ['berserker', '両刃の大斧', 'axe', 0x9e9e9e, 0xef9a9a, 0x4e342e],
  ['chrono', '砂時計の杖', 'staff', 0xb388ff, 0xb388ff, 0x4527a0],
  ['gunner', 'ハンドキャノン', 'gun', 0x424242, 0xffd180, 0x5d4037],
  ['warlock', '骸骨の杖', 'staff', 0xce93d8, 0xce93d8, 0x311b92],
  ['reaper', '処刑の大鎌', 'great', 0xb0bec5, 0xb0bec5, 0x263238],
  ['trapper', 'ハンドクロスボウ', 'bow', 0xa1887f, 0xa1887f, 0x5d4037],
  ['samurai', '打刀', 'katana', 0xeceff1, 0xe0e0e0, 0x37474f],
  ['dancer', '鉄扇', 'odd', 0xf8bbd0, 0xf8bbd0, 0xc2185b],
  ['storm', '雷霆の杖', 'staff', 0xfff176, 0xfff176, 0x283593],
  ['barrier', '結界の札杖', 'staff', 0x80d8ff, 0x80d8ff, 0x0277bd],
  ['thief', '反りの短剣', 'dagger', 0xbdbdbd, 0xbcaaa4, 0x4e342e],
  ['astrologer', '星月の杖', 'staff', 0xd1c4e9, 0xb39ddb, 0x311b92],
  ['spellblade', '魔剣', 'sword', 0xb39ddb, 0x9575cd, 0x4527a0],
  ['dragonkin', '竜牙の大刀', 'great', 0xffab91, 0xff8a65, 0xbf360c],
  ['jester', '道化の笏', 'odd', 0xffeb3b, 0xffeb3b, 0x7b1fa2],
  ['paladin', '聖翼の剣', 'sword', 0xffd54f, 0xffe082, 0xfafafa],
  ['gunslinger', 'リボルバー', 'gun', 0x424242, 0xffcc80, 0x6d4c41],
  ['chainer', '鎖鎌', 'odd', 0xcfd8dc, 0x90a4ae, 0x455a64],
  ['darkknight', '暗黒の大剣', 'great', 0x880e4f, 0x880e4f, 0x212121],
  ['shaman', 'トーテムの杖', 'staff', 0xaed581, 0xaed581, 0x558b2f],
  ['whip', '革の鞭', 'odd', 0x8d6e63, 0xd7ccc8, 0x6d4c41],
  ['shifter', '双色の杖', 'staff', 0xe1bee7, 0xe1bee7, 0x6a1b9a],
  ['gambler', 'トランプとダイス', 'throw', 0xffd740, 0xffd740, 0x1b5e20],
  ['bomber', '導火線の爆弾', 'throw', 0xff9e80, 0xff9e80, 0x424242],
  ['souleater', '魂喰いの鋸刃', 'sword', 0x80cbc4, 0x80cbc4, 0x004d40],
  ['mirror', '魔性の手鏡', 'odd', 0xe0f7fa, 0xe0f7fa, 0x80deea],
  ['gravity', '手のひらの星', 'odd', 0x9fa8da, 0x9fa8da, 0x1a237e],
  ['speedster', '翼の短剣', 'dagger', 0xffff8d, 0xffff8d, 0xf9a825],
  ['cursed', '呪眼の剣', 'sword', 0xb71c1c, 0xb71c1c, 0x311b1b],
  ['desperado', '刃こぼれの剣', 'sword', 0xff8a80, 0xff8a80, 0x8d6e63],
  ['cook', '目玉焼きフライパン', 'blunt', 0x9e9e9e, 0xffcc80, 0xfafafa],
  ['drunkard', '酔いどれひょうたん', 'blunt', 0xffab91, 0xffab91, 0xbf360c],
  ['sniper', 'スナイパーライフル', 'gun', 0x424242, 0xa5d6a7, 0x33691e],
  ['prophet', '予言の水晶玉', 'odd', 0xfff9c4, 0xfff9c4, 0xf9a825],
  ['oni', '鬼の金棒', 'blunt', 0x424242, 0xef5350, 0xc62828],
  ['ghost', '青白い提灯', 'odd', 0xeceff1, 0xeceff1, 0xb0bec5],
  ['twins', '双子のハート杖', 'staff', 0x90caf9, 0xf48fb1, 0xad1457],
  ['machinegunner', 'ガトリング', 'heavy', 0x424242, 0xbdbdbd, 0x546e7a],
  ['flamer', '火炎放射器', 'heavy', 0xff7043, 0xff7043, 0x6d4c41],
  ['rocketeer', 'ロケットランチャー', 'heavy', 0x2e7d32, 0xffab91, 0x5d4037],
  ['medic', '注射器ガン', 'gun', 0xef5350, 0xef9a9a, 0xeceff1],
  ['hammer', 'ウォーハンマー', 'blunt', 0x757575, 0xa1887f, 0x5d4037],
  ['dualblade', '双剣', 'sword', 0x80deea, 0x80deea, 0x006064],
  ['shielder', '投げ丸盾', 'throw', 0x90caf9, 0x90caf9, 0x1565c0],
  ['knifer', '投げナイフ', 'throw', 0xcfd8dc, 0xcfd8dc, 0x37474f],
  ['laser', 'ビーム発射器', 'gun', 0xe1f5fe, 0xe1f5fe, 0x0277bd],
  ['cryo', '氷晶の杖', 'staff', 0xb3e5fc, 0xb3e5fc, 0x0277bd],
  ['asura', '修羅の大刀', 'great', 0xff5252, 0xff5252, 0x4a0000],
  ['falconer', '鷹の手袋', 'odd', 0x8d6e63, 0xbcaaa4, 0x5d4037],
  ['vampire', '籠鍔のレイピア', 'sword', 0xb71c1c, 0xce93d8, 0x212121],
  ['gunblade', 'ガンブレード', 'sword', 0xb0bec5, 0xb0bec5, 0x455a64],
  ['javelin', '投げ槍', 'spear', 0xffe0b2, 0xffe0b2, 0x8d6e63],
  ['maid', 'リボンのほうき', 'blunt', 0xf8bbd0, 0xf8bbd0, 0x212121],
  ['mimic', '仮面の杖', 'staff', 0xffe0b2, 0xffe0b2, 0x8d6e63],
  ['phoenix', '不死鳥の杖', 'staff', 0xffab40, 0xff8a65, 0xbf360c],
  ['weather', '天候の傘', 'odd', 0x90caf9, 0x90caf9, 0x1565c0],
  ['assassin', '隠し刃の籠手', 'fist', 0x9e9e9e, 0x616161, 0x212121],
  ['engineer', '歯車スパナ', 'blunt', 0xffb74d, 0xffb74d, 0x6d4c41],
  ['dimension', '次元門の輪', 'odd', 0xb388ff, 0xb388ff, 0x311b92],
  ['onmyoji', '御幣', 'staff', 0xfff176, 0xfff8e1, 0xfafafa],
  ['hunter', 'クロスボウ', 'bow', 0x8d6e63, 0xa5d6a7, 0x33691e],
  ['gladiator', 'グラディウス', 'sword', 0xcfd8dc, 0xffcc80, 0x8d6e63],
  ['elementalist', '四属の杖', 'staff', 0x80cbc4, 0x80cbc4, 0x00695c],
  ['werewolf', '人狼の爪', 'fist', 0xd7ccc8, 0xa1887f, 0x5d4037],
  ['fortress', '箱型重砲', 'heavy', 0x424242, 0x90a4ae, 0x546e7a],
  ['healfist', '治癒の籠手', 'fist', 0xa5d6a7, 0xa5d6a7, 0x2e7d32],
  ['sage', '浮遊の魔導書', 'odd', 0xfff59d, 0xfff59d, 0xfafafa],
  ['acrobat', 'チャクラム', 'throw', 0xffd54f, 0xffd54f, 0xf57f17],
  ['driller', '回転ドリル', 'odd', 0xbdbdbd, 0xbdbdbd, 0x616161],
  ['absorber', '吸い込みラッパ', 'gun', 0x80cbc4, 0x80cbc4, 0x00695c],
  ['reflector', 'プリズムの杖', 'staff', 0xe1f5fe, 0xb3e5fc, 0x0277bd],
  ['drummer', '太鼓のばち', 'blunt', 0x8d6e63, 0xffeb3b, 0xc62828],
  ['charger', '野太刀', 'katana', 0xffcc80, 0xffab40, 0x4e342e],
  ['thornknight', '棘の棍棒', 'blunt', 0x8bc34a, 0x8bc34a, 0x33691e],
  ['splitter', 'パチンコ', 'bow', 0xff80ab, 0xff80ab, 0x880e4f],
  ['boomeranger', 'ブーメラン', 'throw', 0xffcc80, 0xffcc80, 0x6d4c41],
  ['shredder', 'つるはし', 'axe', 0x90a4ae, 0x90a4ae, 0x455a64],
  ['exorcist', '大十字架', 'great', 0xffd54f, 0xfffde7, 0xfafafa],
  ['stickybomber', '粘着爆弾ガン', 'heavy', 0xff7043, 0xff7043, 0x3e2723],
  ['bellringer', '手鐘', 'blunt', 0xffe082, 0xffe082, 0x5d4037],
  ['gardener', 'じょうろ', 'odd', 0xf8bbd0, 0xf8bbd0, 0x558b2f],
  ['echomage', '音叉の杖', 'staff', 0xb388ff, 0xb388ff, 0x311b92],
  ['vanguard', '旗槍', 'spear', 0xeceff1, 0xef5350, 0xb71c1c],
  ['conductor', '指揮棒', 'staff', 0xfafafa, 0xce93d8, 0x212121],
  ['sacrifice', '儀式の短剣', 'dagger', 0xef9a9a, 0xef9a9a, 0x7f0000],
];

/** 射程を個別に変える武器（m）：スナイパーは島の端まで、火炎放射は短く */
const RANGE_OF = { sniper: 1100, hunter: 400, archer: 380, laser: 400, flamer: 30, rocketeer: 350, fortress: 400 };

export const WEAPON_LIST = LIST.map(([id, name, type, metal, accent, armor], i) => {
  const T = TYPES[type];
  const v = hash2(i, 7, 1234); // 武器ごとの少しの差（±12%）
  return { id, no: i + 1, name, type, typeName: T.name, melee: T.melee, base: { metal, accent, armor }, dmg: Math.round(T.dmg * (0.88 + v * 0.24)), rate: T.rate, range: RANGE_OF[id] ?? T.range };
});
export const WEAPONS_BY_ID = Object.fromEntries(WEAPON_LIST.map((w) => [w.id, w]));

const mixHex = (a, b, t) => {
  const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t;
  const g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t;
  const bl = (a & 255) * (1 - t) + (b & 255) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};

/** 武器 × レア度 → 組み立て用の色 */
export function skinColors(weapon, rarity) {
  const R = RARITIES[rarity] || RARITIES[0];
  const b = weapon.base;
  if (!R.metal) return { metal: b.metal, accent: b.accent, armor: b.armor };
  return {
    metal: mixHex(b.metal, R.metal, R.tint),
    accent: R.accent,
    armor: mixHex(b.armor, R.accent, 0.5),
    glow: R.glow,
    glowPower: R.glowPower,
    tint: { color: R.metal, metal: R.tint * 0.75, other: R.tint * 0.28 }, // 形ごとの固定色（鋼・黒鉄・金など）も寄せる
  };
}

/** レア度の抽選（rnd: 0〜1） */
export function rollRarity(rnd) {
  const total = RARITIES.reduce((s, r) => s + r.weight, 0);
  let t = rnd * total;
  for (let i = 0; i < RARITIES.length; i++) {
    t -= RARITIES[i].weight;
    if (t < 0) return i;
  }
  return 0;
}

/** 実際の攻撃力（レア度込み） */
export const weaponDamage = (w, rarity) => Math.round(w.dmg * (RARITIES[rarity] || RARITIES[0]).mul);
