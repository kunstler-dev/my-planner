// Pet corner at the bottom of the sidebar: one small three.js scene with a cat asleep on a cushion,
// a tuxedo cat chasing a ball of yarn and a corgi dozing on a mat. Purely decorative; hovering the
// corner wakes the dog up for a wag and makes the sleepy cat twitch an ear.
import { THREE, createStage, toonMaterial, lerp } from './three-stage.js';
import { buildCat } from './kitten3d.js';

const W = 208;
const H = 128;

// Cream cat with soft apricot patches, and a black-and-white tuxedo cat.
const CREAM = [
  { from: 0, color: 0xf7ecdc },
  { from: 0.56, color: 0xedc9a0 },
  { from: 0.68, color: 0xd99d66 },
];
const TUXEDO = [
  { from: 0, color: 0x332f39 },
  { from: 0.8, color: 0x3a3540 },
];

// Sleeper and dog rest at the back; the tuxedo cat plays in front of them.
const SLEEPER_X = -1.9;
const DOG_X = 1.6;
const BACK_Z = -1.3;
const PLAY_Z = 1.5;
const PLAY_MIN = -1.55;
const PLAY_MAX = 1.35;

function poseLying(cat) {
  cat.torso.position.y = -0.36;
  cat.legs.forEach((leg, i) => (leg.rotation.z = i < 2 ? 1.35 : -1.35));
  cat.head.position.y = 1.06;
  cat.head.rotation.z = -0.32;
  for (const e of cat.eyes) e.scale.y = 0.08;
}

function buildCorgi() {
  const ginger = toonMaterial(0xd98a45);
  const white = toonMaterial(0xfff4e8);
  const dark = new THREE.MeshBasicMaterial({ color: 0x1d1716 });
  const pink = toonMaterial(0xf0a3b4);
  const sphere = (r, m, seg = 22) => new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), m);

  const root = new THREE.Group();
  const body = sphere(1, ginger, 30);
  body.scale.set(1.02, 0.4, 0.5);
  body.position.set(0, 0.42, 0);
  root.add(body);
  const belly = sphere(0.42, white);
  belly.scale.set(1.2, 0.55, 1.05);
  belly.position.set(0.55, 0.3, 0);
  root.add(belly);

  // Front legs stretched forward on the mat, back legs tucked in.
  for (const z of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.42, 6, 12), ginger);
    leg.rotation.z = Math.PI / 2;
    leg.position.set(1.0, 0.13, z * 0.2);
    root.add(leg);
    const paw = sphere(0.14, white, 14);
    paw.scale.set(1.2, 0.75, 1);
    paw.position.set(1.32, 0.11, z * 0.2);
    root.add(paw);
    const hip = sphere(0.3, ginger);
    hip.scale.set(1.1, 0.75, 0.6);
    hip.position.set(-0.62, 0.3, z * 0.33);
    root.add(hip);
    const foot = sphere(0.12, white, 12);
    foot.scale.set(1.3, 0.7, 1);
    foot.position.set(-0.32, 0.08, z * 0.38);
    root.add(foot);
  }

  const tail = new THREE.Group();
  tail.position.set(-0.98, 0.55, 0);
  const fluff = sphere(0.2, ginger);
  fluff.scale.set(1.2, 0.85, 0.85);
  fluff.position.x = -0.12;
  tail.add(fluff);
  root.add(tail);

  const head = new THREE.Group();
  head.position.set(1.05, 0.62, 0);
  root.add(head);
  const skull = sphere(0.38, ginger, 28);
  skull.scale.set(1, 0.9, 0.95);
  head.add(skull);
  const blaze = sphere(0.2, white);
  blaze.scale.set(0.9, 1.1, 0.55);
  blaze.position.set(0.24, 0.02, 0);
  head.add(blaze);
  const snout = sphere(0.2, white);
  snout.scale.set(1.25, 0.72, 0.85);
  snout.position.set(0.38, -0.12, 0);
  head.add(snout);
  const nose = sphere(0.06, dark, 12);
  nose.position.set(0.62, -0.06, 0);
  head.add(nose);
  const eyes = [];
  for (const z of [-1, 1]) {
    const eye = sphere(0.05, dark, 12);
    eye.scale.set(0.6, 1, 1);
    eye.position.set(0.3, 0.1, z * 0.17);
    head.add(eye);
    eyes.push(eye);
    const ear = new THREE.Group();
    ear.position.set(-0.04, 0.26, z * 0.2);
    ear.rotation.x = z * 0.38;
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 14), ginger);
    outer.position.y = 0.17;
    ear.add(outer);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 10), pink);
    inner.position.set(0.07, 0.13, 0);
    ear.add(inner);
    head.add(ear);
  }
  const ears = head.children.filter((c) => c.isGroup);
  return { root, head, eyes, ears, tail };
}

function buildYarn() {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), toonMaterial(0xb9a2e0));
  g.add(ball);
  const strand = toonMaterial(0x9a80cc);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 6, 28), strand);
    ring.rotation.set(i * 1.1, i * 0.7, 0);
    g.add(ring);
  }
  g.position.set(0, 0.2, PLAY_Z + 0.1);
  return g;
}

export function createPetCorner() {
  const stage = createStage(W, H);
  if (!stage) return null;
  const { renderer, scene, camera } = stage;
  camera.position.set(0, 3.4, 8.4);
  camera.lookAt(0, 0.85, 0);

  // Sleeping cat on a cushion.
  const cushion = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.2, 0.22, 32), toonMaterial(0xf2b8c8));
  cushion.scale.z = 0.62;
  cushion.position.set(SLEEPER_X, 0.11, BACK_Z);
  scene.add(cushion);
  const sleeper = buildCat({ coat: CREAM, iris: 0x7fb7e6, seed: 9.1 });
  poseLying(sleeper);
  sleeper.root.scale.setScalar(0.85);
  sleeper.root.position.set(SLEEPER_X - 0.1, 0.22, BACK_Z);
  sleeper.root.rotation.y = -0.35;
  sleeper.tail[0].rotation.z = 2.1;
  sleeper.tail.forEach((seg, i) => i && (seg.rotation.z = -0.3));
  scene.add(sleeper.root);

  // Corgi on a mat.
  const mat = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.06, 32), toonMaterial(0xcfc3e4));
  mat.scale.z = 0.5;
  mat.position.set(DOG_X, 0.03, BACK_Z);
  scene.add(mat);
  const dog = buildCorgi();
  dog.root.scale.setScalar(0.9);
  dog.root.position.set(DOG_X + 0.05, 0.04, BACK_Z);
  dog.root.rotation.y = -0.7;
  scene.add(dog.root);

  // Tuxedo cat and its ball of yarn.
  const player = buildCat({ coat: TUXEDO, iris: 0xf2c94c, seed: 1.3 });
  player.root.scale.setScalar(0.7);
  scene.add(player.root);
  const yarn = buildYarn();
  scene.add(yarn);

  const play = { x: -0.6, facing: 1, mode: 'stalk', t: 0, jumpFrom: 0, jumpTo: 0 };
  const ball = { x: 0.6, v: 0 };
  const dogState = { awake: 0, target: 0, next: 6 + Math.random() * 6, until: 0, look: 0 };
  let hover = false;
  // 'happy' | 'sad' | 'sleepy' | 'neutral' (pet-mood.js): reuses the poses, adds only a hop and a slow, low walk.
  let mood = 'neutral';
  let time = 0;
  let earTwitch = 0;
  let nextTwitch = 4;

  function stepPlayer(dt) {
    play.t += dt;
    const dx = ball.x - play.x;
    if (play.mode === 'stalk') {
      play.facing = Math.sign(dx) || play.facing;
      if (Math.abs(dx) > 1.1) play.mode = 'trot';
      else if (play.t > 1.4) {
        play.mode = 'pounce';
        play.t = 0;
        play.jumpFrom = play.x;
        play.jumpTo = ball.x - play.facing * 0.42;
      }
    } else if (play.mode === 'trot') {
      play.facing = Math.sign(dx) || play.facing;
      play.x += play.facing * dt * 1.6;
      if (Math.abs(dx) < 0.85) {
        play.mode = 'stalk';
        play.t = 0;
      }
    } else if (play.mode === 'pounce') {
      const k = Math.min(1, play.t / 0.45);
      play.x = lerp(play.jumpFrom, play.jumpTo, k);
      if (k >= 1) {
        play.mode = 'bat';
        play.t = 0;
        ball.v = play.facing * (1.4 + Math.random() * 1.2);
      }
    } else if (play.mode === 'bat' && play.t > 0.7) {
      play.mode = 'stalk';
      play.t = 0;
    }
    play.x = Math.max(PLAY_MIN - 0.3, Math.min(PLAY_MAX + 0.3, play.x));

    ball.x += ball.v * dt;
    ball.v *= Math.exp(-dt * 1.3);
    if (ball.x < PLAY_MIN || ball.x > PLAY_MAX) {
      ball.x = Math.max(PLAY_MIN, Math.min(PLAY_MAX, ball.x));
      ball.v *= -0.6;
    }
    yarn.position.x = ball.x;
    yarn.rotation.z -= (ball.v * dt) / 0.2;

    const { root, torso, head, legs, tail } = player;
    const crouch = play.mode === 'stalk' ? 1 : 0;
    const jumpK = play.mode === 'pounce' ? Math.min(1, play.t / 0.45) : 0;
    root.position.set(play.x, Math.sin(jumpK * Math.PI) * 0.45, PLAY_Z);
    root.rotation.y = play.facing > 0 ? -0.4 : Math.PI + 0.4;
    torso.position.y = lerp(torso.position.y, -crouch * 0.2, 0.2);
    torso.rotation.z = lerp(torso.rotation.z, crouch * 0.14 - jumpK * 0.2, 0.2);
    // Butt wiggle before the pounce.
    torso.rotation.x = crouch && play.t > 0.8 ? Math.sin(time * 28) * 0.06 : 0;
    const phase = time * 11;
    legs.forEach((leg, i) => {
      const diagonal = i === 0 || i === 3 ? 1 : -1;
      const front = i < 2;
      let r = crouch * (front ? -0.3 : 0.4);
      if (play.mode === 'trot') r = Math.sin(phase) * 0.7 * diagonal;
      if (play.mode === 'pounce') r = front ? 0.9 : -0.9;
      if (play.mode === 'bat' && i === 0) r = -0.9 + Math.sin(play.t * 18) * 0.5;
      leg.rotation.z = lerp(leg.rotation.z, r, 0.3);
    });
    head.rotation.y = lerp(head.rotation.y, 0, 0.1);
    tail.forEach((seg, i) => {
      const fast = play.mode === 'stalk' ? 9 : 4;
      seg.rotation.x = Math.sin(time * fast - i * 0.6) * (i === 0 ? 0.25 : 0.12);
      seg.rotation.z = i === 0 ? 0.9 : -0.1;
    });
  }

  function stepDog(dt) {
    if (time > dogState.next) {
      dogState.target = 1;
      dogState.until = time + 3 + Math.random() * 2;
      dogState.next = time + 10 + Math.random() * 10;
      dogState.look = (Math.random() - 0.5) * 1.2;
    }
    if (time > dogState.until && !hover) dogState.target = 0;
    if (mood === 'happy') dogState.target = 1;
    if (mood === 'sleepy' && !hover) dogState.target = 0;
    if (hover) dogState.target = 1;
    dogState.awake = lerp(dogState.awake, dogState.target, 1 - Math.exp(-dt * 4));
    const a = dogState.awake;
    dog.head.position.y = 0.36 + a * 0.3;
    dog.head.position.x = 1.15 - a * 0.1;
    dog.head.rotation.z = -0.1 + a * 0.25;
    dog.head.rotation.y = a * (hover ? 0.5 : dogState.look);
    const breathe = Math.sin(time * 1.8) * 0.015;
    dog.root.children[0].scale.y = 0.4 + breathe;
    for (const e of dog.eyes) e.scale.y = 0.15 + a * 0.85;
    dog.ears.forEach((ear, i) => (ear.rotation.x = (i ? 1 : -1) * (0.55 - a * 0.25)));
    dog.tail.rotation.y = Math.sin(time * (4 + a * 14)) * (0.1 + a * 0.55);
  }

  function stepSleeper(dt) {
    const breathe = Math.sin(time * 1.5) * 0.02;
    sleeper.torso.scale.set(1, 1 + breathe, 1 + breathe * 0.6);
    if (time > nextTwitch || (hover && earTwitch <= 0)) {
      earTwitch = 0.35;
      nextTwitch = time + 5 + Math.random() * 6;
    }
    earTwitch -= dt;
    sleeper.head.rotation.x = earTwitch > 0 ? Math.sin(earTwitch * 40) * 0.05 : 0;
    sleeper.tail.forEach((seg, i) => i && (seg.rotation.x = Math.sin(time * 0.6 - i * 0.5) * 0.05));
  }

  return {
    el: stage.canvas,
    // Where a "z" bubble should float above the sleeping cat, in canvas pixels.
    sleeperAnchor() {
      camera.updateMatrixWorld();
      const p = new THREE.Vector3(SLEEPER_X + 0.4, 1.2, BACK_Z).project(camera);
      return { x: ((p.x + 1) / 2) * W, y: ((1 - p.y) / 2) * H };
    },
    setHover(v) {
      hover = v;
    },
    setMood(m) {
      mood = m;
    },
    tick(dt) {
      time += dt;
      // Sad and sleepy pets move slower.
      stepPlayer(mood === 'sad' ? dt * 0.5 : mood === 'sleepy' ? dt * 0.3 : dt);
      if (mood === 'happy') player.root.position.y += Math.abs(Math.sin(time * 6)) * 0.12;
      if (mood === 'sad') {
        player.root.position.y -= 0.06;
        player.head.rotation.z = lerp(player.head.rotation.z, -0.25, 0.1);
      } else player.head.rotation.z = lerp(player.head.rotation.z, 0, 0.1);
      stepDog(dt);
      stepSleeper(dt);
      renderer.render(scene, camera);
    },
    dispose() {
      renderer.dispose();
    },
  };
}
