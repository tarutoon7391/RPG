// 武器図鑑：96種の武器を種類ごとに並べ、選んだ武器をスキン（レア度）を切り替えながら回して見られる
import * as THREE from 'three';
import { WEAPON_LIST, TYPES, RARITIES, weaponDamage, ACTIVE_TYPES } from './catalog.js';
import { buildSkinned, disposeBuilt } from './view.js';
import { esc } from '../util.js';

export function createGallery({ onClose }) {
  const el = document.createElement('div');
  el.className = 'gallery';
  el.innerHTML = `
    <div class="gl-head"><b>武器図鑑</b><span class="gl-count"></span><button type="button" class="gl-close">閉じる</button></div>
    <div class="gl-tabs"></div>
    <div class="gl-body">
      <div class="gl-list"></div>
      <div class="gl-view">
        <canvas class="gl-canvas"></canvas>
        <div class="gl-skins"></div>
        <div class="gl-info"></div>
      </div>
    </div>`;
  document.body.appendChild(el);
  const $ = (s) => el.querySelector(s);
  $('.gl-close').onclick = () => close();
  const canvas = $('.gl-canvas');
  let renderer = null;
  let scene = null;
  let camera = null;
  let built = null;
  let raf = 0;
  let type = 'all';
  let sel = WEAPON_LIST[0];
  let rarity = 0;
  let open = false;
  let drag = null;
  let rotY = 0;
  let autoSpin = true;

  function ensure3D() {
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(35, 1, 0.01, 20);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404858, 1.8));
    const d = new THREE.DirectionalLight(0xfff2dc, 2.2);
    d.position.set(1.5, 2, 2);
    scene.add(d);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1b2230 }));
    floor.position.y = -0.62;
    scene.add(floor);
    canvas.addEventListener('pointerdown', (e) => { drag = e.clientX; autoSpin = false; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (drag === null) return; rotY += (e.clientX - drag) * 0.01; drag = e.clientX; });
    canvas.addEventListener('pointerup', () => { drag = null; });
  }

  function show() {
    if (built) { scene.remove(built.pivot); disposeBuilt(built); }
    built = buildSkinned(sel.id, rarity);
    const pivot = new THREE.Group();
    // 大きさをそろえて真ん中に
    const box = new THREE.Box3().setFromObject(built.group);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const s = 1.0 / Math.max(size.x, size.y, size.z, 0.01);
    built.group.position.sub(c);
    pivot.add(built.group);
    pivot.scale.setScalar(s);
    if (built.hold === 'aim') pivot.rotation.y = Math.PI / 2;
    scene.add(pivot);
    built.pivot = pivot;
    const R = RARITIES[rarity];
    $('.gl-info').innerHTML = `<b style="color:${R.color}">${esc(sel.name)}</b><span>No.${sel.no}　${sel.typeName}　スキン：${R.skin}（${R.name}）</span>
      <span>攻撃力 ${weaponDamage(sel, rarity)}　${sel.melee ? `間合い ${sel.range}m` : `射程 ${sel.range}m`}　速さ ${sel.rate}回/秒</span><small>※ 数値は戦闘を入れるときの下書き</small>`;
    for (const b of el.querySelectorAll('.gl-skin')) b.classList.toggle('on', Number(b.dataset.r) === rarity);
    for (const b of el.querySelectorAll('.gl-item')) b.classList.toggle('on', b.dataset.id === sel.id);
  }

  function renderTabs() {
    const tabs = [['all', 'すべて'], ...ACTIVE_TYPES.map((k) => [k, TYPES[k].name])];
    $('.gl-tabs').innerHTML = tabs.map(([k, n]) => `<button type="button" data-t="${k}" class="${k === type ? 'on' : ''}">${n}</button>`).join('');
    for (const b of el.querySelectorAll('.gl-tabs button')) b.onclick = () => { type = b.dataset.t; renderTabs(); renderList(); };
  }
  function renderList() {
    const list = WEAPON_LIST.filter((w) => type === 'all' || w.type === type);
    $('.gl-list').innerHTML = list.map((w) => `<button type="button" class="gl-item ${w.id === sel.id ? 'on' : ''}" data-id="${w.id}"><small>${w.no}</small>${esc(w.name)}<em>${w.typeName}</em></button>`).join('');
    for (const b of el.querySelectorAll('.gl-item')) b.onclick = () => { sel = WEAPON_LIST.find((w) => w.id === b.dataset.id); autoSpin = true; show(); };
  }
  $('.gl-skins').innerHTML = RARITIES.map((r, i) => `<button type="button" class="gl-skin" data-r="${i}" style="--rc:${r.color}">${r.skin}<small>${r.name}</small></button>`).join('');
  for (const b of el.querySelectorAll('.gl-skin')) b.onclick = () => { rarity = Number(b.dataset.r); show(); };
  $('.gl-count').textContent = `${WEAPON_LIST.length} 種 × スキン ${RARITIES.length} 色`;

  function loop() {
    if (!open) return;
    raf = requestAnimationFrame(loop);
    const r = canvas.getBoundingClientRect();
    const w = Math.max(10, Math.round(r.width));
    const h = Math.max(10, Math.round(r.height));
    if (canvas.width !== w * Math.min(2, devicePixelRatio) || canvas.height !== h * Math.min(2, devicePixelRatio)) {
      renderer.setPixelRatio(Math.min(2, devicePixelRatio));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    if (autoSpin) rotY += 0.012;
    camera.position.set(Math.sin(rotY) * 2.4, 0.35, Math.cos(rotY) * 2.4);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }

  function openGallery() {
    ensure3D();
    open = true;
    el.style.display = 'flex';
    renderTabs();
    renderList();
    show();
    cancelAnimationFrame(raf);
    loop();
  }
  function close() {
    if (!open) return;
    open = false;
    el.style.display = 'none';
    cancelAnimationFrame(raf);
    onClose?.();
  }
  return { open: openGallery, close, get isOpen() { return open; } };
}
