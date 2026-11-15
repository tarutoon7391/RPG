// エンジン：レンダラー・シーン・カメラとメインループ（3DGAME の shared/engine.js と同じ契約）
// 広いマップ用に「対数深度バッファ」と遠いファークリップ、一人称の手を重ねる overlay を足している
import * as THREE from 'three';

const MAX_DT = 0.05; // 1フレームの最大経過秒（タブ復帰時のワープ防止）

/**
 * @param {object} [opts]
 * @param {HTMLCanvasElement} [opts.canvas]
 * @param {boolean} [opts.antialias=true]
 * @param {number} [opts.far=1000] ファークリップ（m）
 * @param {boolean} [opts.logDepth=false] 遠くの地形と水面がちらつかないように対数深度にする
 */
export function createApp({ canvas, antialias = true, far = 1000, logDepth = false, maxPixelRatio = 2 } = {}) {
  if (!canvas) {
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
  }
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', display: 'block' });
  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';

  const renderer = new THREE.WebGLRenderer({ canvas, antialias, logarithmicDepthBuffer: logDepth, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, far);

  const app = { renderer, scene, camera, pixelRatioMax: maxPixelRatio, overlay: null, start, stop, resize };

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, app.pixelRatioMax));
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let running = false;
  let rafId = 0;
  let last = 0;
  let elapsed = 0;
  let updateFn = null;

  function frame(now) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    const dt = Math.max(0, Math.min((now - last) / 1000, MAX_DT));
    last = now;
    elapsed += dt;
    if (updateFn) updateFn(dt, elapsed);
    renderer.render(scene, camera);
    // 上に重ねる絵（一人称の手と武器など）：深度だけ消してから描く
    const ov = app.overlay;
    if (ov && ov.scene.visible) {
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(ov.scene, ov.camera);
      renderer.autoClear = true;
    }
  }

  function start(update) {
    if (update) updateFn = update;
    if (running) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  return app;
}
