// Lock screen: with a PIN set, the interface starts locked, locks after N idle minutes and when it is opened from
// the tray after that long. While locked no section is rendered at all — only this screen.
import { state } from './state.js';
import { h, icon } from './ui.js';
import { t } from './i18n.js';

let hasPin = false;
let locked = false;
let lastActive = Date.now();
let rerender = () => {};
let waitTimer = 0;

export const isLocked = () => locked;
export const pinIsSet = () => hasPin;
const idleMs = () => Math.max(1, Number(state.data.settings.lockMinutes) || 10) * 60000;

export async function initLock(render) {
  rerender = render;
  hasPin = await window.api.pin.has();
  locked = hasPin;
  for (const ev of ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, () => (lastActive = Date.now()), { passive: true, capture: true });
  setInterval(() => {
    if (hasPin && !locked && Date.now() - lastActive > idleMs()) lock();
  }, 15000);
}

export function setPinState(v) {
  hasPin = v;
  if (!v) locked = false;
}

export function lock() {
  if (!hasPin) return;
  locked = true;
  // Nothing of the app stays on screen: dialogs and the search close too.
  document.querySelectorAll('.modal-back, .search-back').forEach((el) => el.remove());
  rerender();
}

/** The window came back from the tray. */
export function onShown() {
  if (hasPin && !locked && Date.now() - lastActive > idleMs()) lock();
}

export function lockScreen() {
  const input = h('input', { class: 'input lock-input', type: 'password', inputmode: 'numeric', maxlength: 8, autocomplete: 'off', placeholder: '••••' });
  const msg = h('div', { class: 'meta lock-msg' }, t('lock.hint'));
  const showWait = (ms) => {
    clearInterval(waitTimer);
    const until = Date.now() + ms;
    input.disabled = true;
    const tick = () => {
      const left = Math.ceil((until - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(waitTimer);
        input.disabled = false;
        msg.textContent = t('lock.hint');
        input.focus();
        return;
      }
      msg.textContent = t('lock.wait', { n: left });
    };
    tick();
    waitTimer = setInterval(tick, 500);
  };
  const submit = async () => {
    if (!input.value) return;
    const res = await window.api.pin.verify(input.value);
    input.value = '';
    if (res.ok) {
      locked = false;
      lastActive = Date.now();
      rerender();
    } else if (res.wait > 0) showWait(res.wait);
    else msg.textContent = t('lock.wrong');
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
  setTimeout(() => input.focus(), 50);
  return h('div', { class: 'lock-screen' }, h('div', { class: 'lock-box' }, icon('lock', 28), h('h2', {}, t('lock.title')), input, msg));
}
