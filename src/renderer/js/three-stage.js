// Shared helpers for the small three.js characters (kitten, robot): a transparent mini canvas,
// toon materials, and blotchy vertex colouring for fur patterns.
import * as THREE from '../../../node_modules/three/build/three.module.js';

export { THREE };

export function createStage(width, height) {
  const canvas = document.createElement('canvas');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;
  // Synchronous shader validation is a debugging aid; software GL (SwiftShader) can report spurious failures.
  renderer.debug.checkShaderErrors = false;
  canvas.addEventListener('webglcontextlost', () => console.warn(`webgl context lost (${width}x${height})`));
  renderer.setPixelRatio(Math.min((window.devicePixelRatio || 1) * 1.5, 3));
  renderer.setSize(width, height, false);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, width / height, 0.1, 50);
  camera.position.set(0, 1.7, 9);
  camera.lookAt(0, 0.95, 0);
  scene.add(new THREE.HemisphereLight(0xfff8f2, 0xd8c8e8, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(2, 5, 6);
  scene.add(sun);

  // Where the character's feet (world origin) land on the canvas, so controllers can anchor it.
  const p = new THREE.Vector3(0, 0, 0).project(camera);
  const feet = { x: ((p.x + 1) / 2) * width, y: ((1 - p.y) / 2) * height };
  return { canvas, renderer, scene, camera, feet, size: { w: width, h: height } };
}

let gradient;
export function toonMaterial(color, opts = {}) {
  if (!gradient) {
    const data = new Uint8Array([120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]);
    gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...opts });
}

// Small deterministic 3D value noise.
function hash(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function smooth(t) {
  return t * t * (3 - 2 * t);
}
export function noise3(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const zf = smooth(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf),
    l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf,
  );
}

/**
 * Paints a mesh with vertex colours from a palette picked by noise at each vertex's
 * approximate character-space position (so patches continue across body parts).
 */
export function paintPatches(mesh, palette, { freq = 2.4, seed = 0 } = {}) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); // call root.updateMatrixWorld(true) first
    const n =
      noise3(v.x * freq + seed, v.y * freq, v.z * freq) * 0.75 +
      noise3(v.x * freq * 3.1, v.y * freq * 3.1 + seed, v.z * freq * 3.1) * 0.25;
    let c = palette[0].color;
    for (const p of palette) if (n >= p.from) c = p.color;
    col.set(c);
    colors.set([col.r, col.g, col.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  mesh.material = mesh.material.clone();
  mesh.material.vertexColors = true;
  mesh.material.color.set(0xffffff);
}

export const lerp = (a, b, k) => a + (b - a) * k;

export function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
