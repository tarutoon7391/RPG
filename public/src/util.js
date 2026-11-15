// 小さな道具
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** m → 「1.2km」「350m」 */
export function fmtDist(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)}km` : `${Math.round(m)}m`;
}

/** 秒 → 「12分34秒」 */
export function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60}分` : m ? `${m}分${s}秒` : `${s}秒`;
}
