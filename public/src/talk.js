// 看板・ステージ碑の文章
import { BIOMES } from './world/terrain.js';
import { esc, fmtDist } from './util.js';

const DIRS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
/** (dx, dz) の方角（北 = -z） */
export function dirName(dx, dz) {
  const deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  return DIRS[Math.round(deg / 45) % 8];
}

export function describeStage(world, reg, save) {
  if (!reg) return '';
  const dgs = reg.pois.filter((p) => p.kind === 'dungeon');
  const towns = reg.pois.filter((p) => p.kind === 'town');
  let html = `<b>ステージ ${reg.stageNo}「${esc(reg.name)}」</b><br>${BIOMES[reg.biome].name}の地方。`;
  if (towns.length) html += `<br>町：${towns.map((t) => esc(t.name)).join('、')}`;
  if (dgs.length) {
    html += '<br>この地方のダンジョン：<ul class="dlg-list">';
    for (const d of dgs) {
      const mark = save.cleared[d.id] ? '✔ 踏破' : save.entered[d.id] ? '… 挑戦中' : '';
      html += `<li>${esc(d.name)}（${d.floors} 階・${'★'.repeat(d.tier)}）${dirName(d.x - reg.mx, d.z - reg.mz)}へ ${fmtDist(Math.hypot(d.x - reg.mx, d.z - reg.mz))}　${mark}</li>`;
    }
    html += '</ul>';
  }
  return html;
}

export function describeTown(world, town, pos) {
  const near = world.pois
    .filter((p) => p.kind === 'dungeon' && !p.inCapital)
    .map((p) => ({ p, d: Math.hypot(p.x - pos.x, p.z - pos.z) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3);
  const towns = world.pois
    .filter((p) => (p.kind === 'town' || p.kind === 'capital') && p !== town)
    .map((p) => ({ p, d: Math.hypot(p.x - pos.x, p.z - pos.z) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 2);
  let html = `<b>${esc(town.name)}へようこそ</b><br>（住人や店は今後の実装）<br>近くのダンジョン：<ul class="dlg-list">`;
  for (const { p, d } of near) html += `<li>${esc(p.name)}　${dirName(p.x - pos.x, p.z - pos.z)}へ ${fmtDist(d)}</li>`;
  html += '</ul>近くの町：<ul class="dlg-list">';
  for (const { p, d } of towns) html += `<li>${esc(p.name)}　${dirName(p.x - pos.x, p.z - pos.z)}へ ${fmtDist(d)}</li>`;
  return `${html}</ul>`;
}
