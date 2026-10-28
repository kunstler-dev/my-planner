// Boot, sidebar navigation and view switching.
import { state, loadState, setRenderer, update } from './state.js';
import { h, icon } from './ui.js';
import { petCorner } from './pets.js';
import { homeView } from './views/home.js';
import { financeView } from './views/finance.js';
import { channelView } from './views/channel.js';
import { grokView } from './views/grok.js';
import { settingsView } from './views/settings.js';

const VIEWS = {
  home: { title: 'Главная', icon: 'home', render: homeView },
  finance: { title: 'Финансы', icon: 'wallet', render: financeView },
  channel: { title: 'Telegram-канал', icon: 'send', render: channelView },
  grok: { title: 'Grok', icon: 'spark', render: grokView },
  settings: { title: 'Настройки', icon: 'gear', render: settingsView },
};
const NAV = [['home'], ['Учёт', 'finance', 'channel'], ['Помощник', 'grok']];

export function go(view, opts) {
  state.view = view;
  state.viewOpts = opts || null;
  render();
  document.getElementById('main').scrollTop = 0;
}

function navItem(key) {
  const v = VIEWS[key];
  return h(
    'button',
    { class: `nav-item${state.view === key ? ' active' : ''}`, onclick: () => go(key) },
    icon(v.icon),
    v.title,
  );
}

function renderNav() {
  const nav = document.getElementById('nav');
  nav.replaceChildren(
    ...NAV.flatMap((group) => {
      const [first, ...rest] = group;
      return VIEWS[first] ? group.map(navItem) : [h('div', { class: 'nav-group' }, first), ...rest.map(navItem)];
    }),
  );
  const dark = state.data.settings.theme === 'dark';
  document.getElementById('nav-bottom').replaceChildren(
    navItem('settings'),
    h(
      'button',
      { class: 'nav-item', onclick: () => setTheme(dark ? 'light' : 'dark') },
      icon(dark ? 'sun' : 'moon'),
      dark ? 'Светлая тема' : 'Тёмная тема',
    ),
  );
  const slot = document.getElementById('pets-slot');
  const pets = petCorner();
  if (pets.parentNode !== slot) slot.replaceChildren(pets);
}

export function setTheme(theme) {
  update((d) => (d.settings.theme = theme), { silent: true });
  applyTheme();
  render();
}

function applyTheme() {
  document.documentElement.dataset.theme = state.data.settings.theme;
  window.api.setTheme(state.data.settings.theme);
}

function render() {
  renderNav();
  const main = document.getElementById('main');
  const view = VIEWS[state.view] || VIEWS.home;
  const keepScroll = main.scrollTop;
  main.replaceChildren(view.render());
  main.scrollTop = keepScroll;
}

async function boot() {
  await loadState();
  applyTheme();
  setRenderer(render);
  render();
}

boot();
