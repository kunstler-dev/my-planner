// Single app state; update() saves with a short debounce and re-renders the current view.
// readOnly: a secondary window (quick entry) that only reads data and must never write its copy back.
export const state = { data: null, view: 'home', readOnly: false };

let render = () => {};
let saveTimer;

export function setRenderer(fn) {
  render = fn;
}

export async function loadState() {
  state.data = await window.api.load();
}

export function save() {
  if (state.readOnly) return;
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
  if (state.readOnly || !state.data) return;
  clearTimeout(saveTimer);
  window.api.save(state.data);
});
