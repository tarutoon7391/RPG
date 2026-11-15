# RPG 開発規約

3DGAME（tarutoon7391/3DGAME）の 3DRPG と同じ仕組みで作る、超広域オープンワールド RPG。
いまは「どこまで広いマップが作れるか」を試す段階で、**歩き回れるマップだけ**ある（戦闘・NPC・アイテムはまだ無い）。
設計の正本は `docs/world.md`。

## 構成

- Express（`server.js`）で `public/` を静的配信。ビルド工程なし。`npm start`（PORT は環境変数、既定 3000）
- three は npm で固定し `/vendor/three` から配信。`public/index.html` の importmap で `three` / `three/addons/` を解決
- `public/shared/engine.js`・`input.js` は 3DGAME の shared と同じ契約（engine だけ対数深度バッファと far を追加）
- Railway にそのまま載る（`npm start`、`/healthz`）

## 規約

- コメント・コミットメッセージは日本語。ES Modules
- 外部アセット・CDN 禁止（プリミティブのローポリ＋頂点カラー）
- 追加ライブラリ禁止（three の addons は使用可）
- 1ファイル 400 行を目安に `public/src/` で分割。`main.js` は起動だけ
- 大量オブジェクトは InstancedMesh か mergeGeometries で 1 メッシュに。不要な geometry は dispose。毎フレームの new を避ける
- ワールドの中身（地形・ステージ・町・ダンジョン）は **シードから決まる関数**で作る。保存データに地形を持たない
- セーブは `public/src/save.js`（localStorage、キー `rpg:world:<広さ>:<シード>`）

## 完了条件

- コンソールエラー 0
- `npm run smoke` 通過
