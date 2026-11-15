// ワールド全体の設定。URL パラメータで広さ・シードを変えて試せる
//   ?size=64  → 一辺 64km（既定 32km）。8 / 16 / 32 / 64 / 128 を想定
//   ?seed=123 → 地形のシード
const q = new URLSearchParams(location.search);
const sizeKm = Math.min(128, Math.max(4, Number(q.get('size')) || 32));

export const WORLD = {
  sizeKm,
  size: sizeKm * 1024, // 一辺（m）。2 のべき乗にしてクアッドツリーで割り切れるようにする
  seed: Number(q.get('seed')) || 20261115,
  regionSize: 2048, // ステージ（リージョン）1マスの一辺（m）
  sea: 0, // 海面の高さ
};
WORLD.half = WORLD.size / 2;
WORLD.regions = WORLD.size / WORLD.regionSize; // 一辺のリージョン数

/** 地形の描画 */
export const TERRAIN = {
  seg: 32, // 1タイルの分割数
  minTile: 64, // 一番細かいタイルの一辺（m）→ 足元は 2m 間隔
  skirt: 0.12, // 継ぎ目を隠すスカートの深さ（タイルの一辺に対する割合）
};

/** 動き */
export const MOVE = {
  walk: 6, // m/s
  dash: 12,
  boost: 150, // テスト用の爆速（G で切り替え）
  jump: 8.5,
  gravity: 24,
  radius: 0.45,
  swimDepth: 1.3, // これより深い水は泳ぐ
};

/** 画質の初期値（ポーズ画面で変えられる） */
export const QUALITY_DEFAULT = {
  viewDist: 12000, // 霧で見えなくなる距離（m）
  detail: 1.6, // 地形の細かさ（タイルを分割し始める距離の倍率）
  propDist: 5, // 木や岩を出す範囲（128m セルいくつぶん）
  shadows: true,
  pixelRatio: 1.5,
};
