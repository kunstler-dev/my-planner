// Single app state; update() saves with a short debounce and re-renders the current view.
export const state = { data: null, view: 'home' };

let render = () => {};
let saveTimer;

export function setRenderer(fn) {
  render = fn;
}

export async function loadState() {
  state.data = await window.api.load();
}

export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.api.save(state.data), 250);
}

/** Mutate state.data inside fn; silent = save without re-rendering (while typing). */
export function update(fn, { silent = false } = {}) {
  fn(state.data);
  save();
  if (!silent) render();
}

export function rerender() {
  render();
}

window.addEventListener('beforeunload', () => {
  clearTimeout(saveTimer);
  window.api.save(state.data);
});
