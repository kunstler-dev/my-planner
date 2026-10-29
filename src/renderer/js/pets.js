// Pet corner controller (from Kitten Planner): one persistent element so the WebGL canvas survives
// sidebar re-renders, the scene runs at ~30 fps and pauses while the window is hidden.
import { h } from './ui.js';
import { state } from './state.js';
import { createPetCorner } from './pets3d.js';
import { t } from './i18n.js';

let el = null;
let scene = null;
let raf = 0;
let last = 0;

function loop(now) {
  raf = requestAnimationFrame(loop);
  if (now - last < 32) return;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  scene.tick(dt);
}

function start() {
  if (!scene || raf || el.hidden || document.hidden) return;
  last = performance.now();
  raf = requestAnimationFrame(loop);
}

function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
}

function buildScene() {
  try {
    scene = createPetCorner();
  } catch (err) {
    console.warn('pet corner unavailable', err);
    scene = null;
  }
  if (scene) {
    const zzz = h('div', { class: 'pet-zzz' }, h('span', {}, 'z'), h('span', {}, 'z'), h('span', {}, 'z'));
    const a = scene.sleeperAnchor();
    zzz.style.left = `${a.x}px`;
    zzz.style.top = `${a.y - 14}px`;
    el.append(scene.el, zzz);
    el.addEventListener('mouseenter', () => scene.setHover(true));
    el.addEventListener('mouseleave', () => scene.setHover(false));
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  } else {
    el.append(h('div', { class: 'pet-fallback' }, '😴🐈 🧶🐈‍⬛ 🐕'));
  }
  start();
}

/** The pet corner element for the sidebar (created once, re-used on every render). */
export function petCorner() {
  if (!el) {
    el = h('div', { class: 'pet-corner', 'aria-hidden': 'true', title: t('pets.title') });
    setTimeout(buildScene, 300);
  }
  const s = state.data.settings;
  el.title = t('pets.title');
  el.hidden = s.pets === false;
  el.classList.toggle('mono', !s.petsColor);
  if (el.hidden) stop();
  else start();
  return el;
}
