// スモークテスト：サーバー応答・JS 構文・import 解決先の存在を確認する（npm run smoke）
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../server.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const ok = (m) => console.log(`  OK  ${m}`);
const ng = (m) => { errors.push(m); console.log(`  NG  ${m}`); };

function collectJs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) collectJs(p, out);
    else if (/\.m?js$/.test(name)) out.push(p);
  }
  return out;
}

function extractImports(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
  const specs = new Set();
  const re = /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(code))) specs.add(m[1] || m[2] || m[3]);
  return [...specs];
}

/** import 指定子 → 配信されるファイル */
function resolveSpec(spec, fromFile) {
  if (spec === 'three') return path.join(ROOT, 'node_modules/three/build/three.module.js');
  if (spec.startsWith('three/addons/')) return path.join(ROOT, 'node_modules/three/examples/jsm', spec.slice('three/addons/'.length));
  if (spec.startsWith('/')) return path.join(ROOT, 'public', spec);
  return path.resolve(path.dirname(fromFile), spec);
}

console.log('■ JS の構文と import');
const files = collectJs(path.join(ROOT, 'public'));
for (const f of files) {
  const rel = path.relative(ROOT, f);
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) ng(`${rel} 構文エラー\n${r.stderr}`);
  for (const spec of extractImports(readFileSync(f, 'utf8'))) {
    if (spec.startsWith('node:')) continue;
    const target = resolveSpec(spec, f);
    if (!existsSync(target)) ng(`${rel} の import '${spec}' が見つからない`);
  }
}
ok(`${files.length} ファイル確認`);

console.log('■ サーバー応答');
const server = createServer();
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
for (const url of ['/healthz', '/', '/main.js', '/style.css', '/src/game.js', '/vendor/three/three.module.js', '/vendor/three/addons/utils/BufferGeometryUtils.js']) {
  try {
    const res = await fetch(base + url);
    if (res.ok) ok(`${url} → ${res.status}`);
    else ng(`${url} → ${res.status}`);
  } catch (e) {
    ng(`${url} → ${e.message}`);
  }
}
server.close();

console.log(errors.length ? `\n失敗 ${errors.length} 件` : '\nすべて通過');
process.exit(errors.length ? 1 : 0);
