// RPG サーバー：静的配信だけ（ビルド工程なし）。three は npm で固定したものを /vendor/three から配る
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

/** Express アプリ（HTTP ルートのみ） */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.get('/healthz', (_req, res) => res.status(200).type('text').send('ok'));

  // three.js（CDN は使わない）。addons を先に登録しないと /vendor/three 側に吸われる
  app.use('/vendor/three/addons', express.static(path.join(__dirname, 'node_modules/three/examples/jsm')));
  app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three/build')));
  // オンライン化するとき用（今は未使用）
  app.use('/vendor/socket.io', express.static(path.join(__dirname, 'node_modules/socket.io/client-dist')));

  app.use('/', express.static(path.join(__dirname, 'public')));
  return app;
}

export function createServer() {
  return http.createServer(createApp());
}

// 直接起動されたときだけ listen する（smoke からの import にも対応）
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  createServer().listen(PORT, () => {
    console.log(`RPG サーバー起動: http://localhost:${PORT}`);
  });
}
