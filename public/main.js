// 起動だけ（バトロワの島）
import { startIsland } from './src/br/game.js';

startIsland().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:20px;color:#ff8a80;background:#000c;padding:16px;z-index:99;white-space:pre-wrap">起動に失敗しました\n${String(err?.stack || err)}</pre>`);
});
