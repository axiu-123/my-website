import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const viewport = document.getElementById('viewport');
const statusEl = document.getElementById('status');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 1.2, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.appendChild(renderer.domElement);
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '460px';
renderer.domElement.style.borderRadius = '16px';

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.8, 0);
controls.minDistance = 3;
controls.maxDistance = 12;

// 灯光
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dir = new THREE.DirectionalLight(0xffffff, 1.1);
dir.position.set(3, 5, 4);
scene.add(dir);
const pink = new THREE.PointLight(0xff9bd2, 0.6, 50);
pink.position.set(-3, 2, 3);
scene.add(pink);

let currentModel = null;
const clock = new THREE.Clock();

function setStatus(t) { statusEl.textContent = '模型状态：' + t; }

function clearModel() {
  if (currentModel) {
    scene.remove(currentModel);
    currentModel = null;
  }
}

// 内置 Q 版角色（程序生成，保证离线可用）
function buildChibi() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xffd9b3, roughness: 0.6 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x6d5efc, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const blush = new THREE.MeshStandardMaterial({ color: 0xff8fae, roughness: 0.7 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 32), cloth);
  body.position.y = 0.2; body.scale.y = 1.1;
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(1.0, 32, 32), skin);
  head.position.y = 1.5;
  g.add(head);

  // 眼睛
  const eyeGeo = new THREE.SphereGeometry(0.12, 16, 16);
  const eL = new THREE.Mesh(eyeGeo, dark); eL.position.set(-0.35, 1.6, 0.9);
  const eR = new THREE.Mesh(eyeGeo, dark); eR.position.set(0.35, 1.6, 0.9);
  g.add(eL, eR);
  // 腮红
  const blushGeo = new THREE.SphereGeometry(0.16, 16, 16);
  const bL = new THREE.Mesh(blushGeo, blush); bL.position.set(-0.55, 1.35, 0.82); bL.scale.z = 0.3;
  const bR = new THREE.Mesh(blushGeo, blush); bR.position.set(0.55, 1.35, 0.82); bR.scale.z = 0.3;
  g.add(bL, bR);
  // 天线小圆球
  const ant = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), cloth);
  ant.position.set(0, 2.55, 0);
  g.add(ant);

  return g;
}

function frameModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = 3 / maxDim;
  model.scale.setScalar(scale);
  model.position.sub(center.multiplyScalar(scale));
  model.position.y += (size.y * scale) / 2;
  currentModel = model;
  scene.add(model);
}

function loadChibi() {
  clearModel();
  frameModel(buildChibi());
  setStatus('内置 Q 版模型（程序生成，无需联网）');
}

async function loadFromURL(url) {
  setStatus('正在加载在线模型……');
  clearModel();
  try {
    const loader = url.endsWith('.obj') ? new OBJLoader() :
                  url.endsWith('.fbx') ? new FBXLoader() : new GLTFLoader();
    const obj = await loader.loadAsync(url);
    frameModel(obj.scene || obj);
    setStatus('已加载在线模型：' + url.split('/').pop());
  } catch (e) {
    loadChibi();
    setStatus('在线模型加载失败，已回退内置 Q 版模型。原因：' + e.message);
  }
}

async function loadFromFile(file) {
  setStatus('正在加载本地模型：' + file.name);
  clearModel();
  const url = URL.createObjectURL(file);
  const ext = file.name.split('.').pop().toLowerCase();
  try {
    let obj;
    if (ext === 'obj') obj = await new OBJLoader().loadAsync(url);
    else if (ext === 'fbx') obj = await new FBXLoader().loadAsync(url);
    else obj = await new GLTFLoader().loadAsync(url);
    frameModel(obj.scene || obj);
    setStatus('已加载本地模型：' + file.name);
  } catch (e) {
    loadChibi();
    setStatus('本地模型加载失败，已回退内置 Q 版模型。原因：' + e.message);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function onResize() {
  const w = viewport.clientWidth;
  const h = 460;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  if (currentModel) {
    currentModel.position.y += Math.sin(t * 2) * 0.0025; // 呼吸浮动
    currentModel.rotation.y = Math.sin(t * 0.5) * 0.15;   // 轻轻摇摆
  }
  controls.update();
  renderer.render(scene, camera);
}

// 事件绑定
document.getElementById('loadUrl').addEventListener('click', () => {
  const u = document.getElementById('modelUrl').value.trim();
  if (u) loadFromURL(u);
});
document.getElementById('file').addEventListener('change', (e) => {
  if (e.target.files[0]) loadFromFile(e.target.files[0]);
});
document.getElementById('reset').addEventListener('click', loadChibi);
document.getElementById('widget').addEventListener('click', () => {
  window.open('/pet/widget.html', 'pet_widget',
    'width=320,height=380,resizable=yes');
});

// 初始化
onResize();
loadChibi();
animate();
