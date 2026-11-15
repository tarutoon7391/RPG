// 空・太陽・水面・霧（プレイヤーについてくる）
import * as THREE from 'three';

export function createEnv(scene) {
  // 空：上ほど濃い青のグラデーション球
  const skyGeo = new THREE.SphereGeometry(1, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(0x3d7fd1) }, horizon: { value: new THREE.Color(0xc8dff0) }, bottom: { value: new THREE.Color(0x9fb8c8) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vP; void main(){ float y = vP.y; vec3 c = y > 0.0 ? mix(horizon, top, pow(clamp(y*1.6,0.0,1.0),0.7)) : mix(horizon, bottom, clamp(-y*4.0,0.0,1.0)); gl_FragColor = vec4(c,1.0); }',
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.scale.setScalar(1000);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xdfefff, 0x5a6a40, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3(0.45, 0.75, 0.35).normalize();

  // 水面（とても大きい板。プレイヤーの真下に置き直す）
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x2c74a8, transparent: true, opacity: 0.82, depthWrite: false }),
  );
  water.scale.set(400000, 1, 400000);
  water.renderOrder = 2;
  scene.add(water);

  // ダンジョン用のランタン
  const lantern = new THREE.PointLight(0xffc880, 0, 26, 1.4);
  scene.add(lantern);

  const fog = new THREE.Fog(0xc8dff0, 800, 12000);
  scene.fog = fog;

  const env = {
    sky, hemi, sun, water, lantern,
    /** 外の世界 */
    outdoor(viewDist) {
      sky.visible = true;
      water.visible = true;
      scene.background = null;
      fog.color.setHex(0xc8dff0);
      fog.near = Math.min(1500, viewDist * 0.08);
      fog.far = viewDist;
      hemi.intensity = 1.1;
      hemi.color.setHex(0xdfefff);
      hemi.groundColor.setHex(0x5a6a40);
      sun.intensity = 2.2;
      lantern.intensity = 0;
    },
    /** ダンジョンの中 */
    indoor(theme) {
      sky.visible = false;
      water.visible = false;
      scene.background = new THREE.Color(theme.fog);
      fog.color.setHex(theme.fog);
      fog.near = 6;
      fog.far = 70;
      hemi.intensity = 0.9;
      hemi.color.setHex(0xb8b0d8);
      hemi.groundColor.setHex(0x30283a);
      sun.intensity = 0.25;
      lantern.color.setHex(theme.torch);
      lantern.intensity = 60;
    },
    /** 毎フレーム：プレイヤーについてくる */
    follow(cam, p, t) {
      sky.position.copy(cam.position);
      water.position.set(Math.round(p.x / 1000) * 1000, 0, Math.round(p.z / 1000) * 1000);
      sun.position.set(p.x + sunDir.x * 200, p.y + sunDir.y * 200, p.z + sunDir.z * 200);
      sun.target.position.set(p.x, p.y, p.z);
      lantern.position.set(p.x, p.y + 2.6, p.z);
      if (lantern.intensity > 0) lantern.intensity = 55 + Math.sin(t * 9) * 3 + Math.sin(t * 23) * 2;
    },
  };
  return env;
}
