// Toon cat built from primitives (taken from Kitten Planner), used by the pet corner.
import { THREE, toonMaterial, paintPatches } from './three-stage.js';


// Tortoiseshell: black-brown base with ginger and cream blotches; white muzzle, chest and paws.
const COAT = [
  { from: 0, color: 0x2b211f },
  { from: 0.47, color: 0xb8662a },
  { from: 0.62, color: 0xd98b3c },
  { from: 0.74, color: 0xeccb98 },
];
const COLORS = { white: 0xfff3e6, pink: 0xf0a3b4, iris: 0x9fcf5a, pupil: 0x16110f, shine: 0xffffff };

export function buildCat({ coat = COAT, iris = COLORS.iris, seed = 3.7 } = {}) {
  const fur = toonMaterial(0xffffff);
  const M = {
    white: toonMaterial(COLORS.white),
    pink: toonMaterial(COLORS.pink),
    iris: new THREE.MeshBasicMaterial({ color: iris }),
    pupil: new THREE.MeshBasicMaterial({ color: COLORS.pupil }),
    shine: new THREE.MeshBasicMaterial({ color: COLORS.shine }),
  };
  const furry = [];
  const sphere = (r, m, seg = 24) => new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), m);
  const furSphere = (r, seg = 24) => {
    const mesh = sphere(r, fur, seg);
    furry.push(mesh);
    return mesh;
  };

  const root = new THREE.Group();
  const torso = new THREE.Group();
  root.add(torso);

  const body = furSphere(1, 32);
  body.scale.set(0.78, 0.5, 0.48);
  body.position.set(0, 0.78, 0);
  torso.add(body);

  const chest = sphere(0.3, M.white);
  chest.scale.set(0.55, 1, 1.15);
  chest.position.set(0.56, 0.74, 0);
  torso.add(chest);

  const head = new THREE.Group();
  head.position.set(0.8, 1.2, 0);
  torso.add(head);
  const skull = furSphere(0.5, 32);
  skull.scale.set(0.95, 0.88, 1);
  head.add(skull);
  for (const z of [-1, 1]) {
    const cheek = furSphere(0.2);
    cheek.position.set(0.12, -0.15, z * 0.29);
    head.add(cheek);
  }
  const muzzle = sphere(0.18, M.white);
  muzzle.scale.set(0.8, 0.62, 1.15);
  muzzle.position.set(0.41, -0.13, 0);
  head.add(muzzle);
  const nose = sphere(0.055, M.pink, 12);
  nose.scale.set(0.8, 0.7, 1.2);
  nose.position.set(0.48, -0.04, 0);
  head.add(nose);

  // Big green eyes with dark pupils so they read on dark fur.
  const eyes = [];
  for (const z of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(0.37, 0.06, z * 0.2);
    eye.rotation.y = z * 0.45;
    const iris = sphere(0.1, M.iris, 16);
    iris.scale.set(0.5, 1.05, 0.95);
    eye.add(iris);
    const pupil = sphere(0.062, M.pupil, 12);
    pupil.scale.set(0.5, 1.05, 0.8);
    pupil.position.x = 0.02;
    eye.add(pupil);
    const shine = sphere(0.028, M.shine, 8);
    shine.position.set(0.05, 0.04, 0.015);
    eye.add(shine);
    head.add(eye);
    eyes.push(eye);
  }

  for (const z of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(-0.03, 0.35, z * 0.25);
    ear.rotation.x = z * 0.32;
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.36, 16), fur);
    outer.position.y = 0.12;
    furry.push(outer);
    ear.add(outer);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.23, 12), M.pink);
    inner.position.set(0.08, 0.09, 0);
    ear.add(inner);
    head.add(ear);
  }

  const whiskerMat = new THREE.LineBasicMaterial({ color: 0xf2e6da });
  for (const z of [-1, 1]) {
    for (const dy of [0, -0.06]) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0.43, -0.1 + dy, z * 0.12),
        new THREE.Vector3(0.52, -0.06 + dy * 2, z * 0.5),
      ]);
      head.add(new THREE.Line(g, whiskerMat));
    }
  }

  const legs = [];
  for (const [x, z] of [
    [0.46, 1],
    [0.46, -1],
    [-0.46, 1],
    [-0.46, -1],
  ]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.62, z * 0.23);
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.34, 6, 12), fur);
    limb.position.y = -0.29;
    furry.push(limb);
    leg.add(limb);
    const paw = sphere(0.14, M.white, 14);
    paw.scale.set(1.25, 0.7, 1.05);
    paw.position.set(0.03, -0.55, 0);
    leg.add(paw);
    torso.add(leg);
    legs.push(leg);
  }

  const tail = [];
  let parent = new THREE.Group();
  parent.position.set(-0.72, 0.92, 0);
  torso.add(parent);
  for (let i = 0; i < 8; i++) {
    const seg = new THREE.Group();
    seg.position.y = i === 0 ? 0 : 0.17;
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.085 - i * 0.004, 0.12, 4, 10), fur);
    mesh.position.y = 0.085;
    furry.push(mesh);
    seg.add(mesh);
    parent.add(seg);
    tail.push(seg);
    parent = seg;
  }

  // Default pose, then bake the patch pattern in character space.
  tail[0].rotation.z = 0.75;
  root.updateMatrixWorld(true);
  for (const mesh of furry) paintPatches(mesh, coat, { freq: 2.1, seed });

  return { root, torso, head, eyes, legs, tail };
}

