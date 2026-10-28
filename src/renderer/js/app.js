// Boot, sidebar navigation and view switching.
import { state, loadState, setRenderer, update } from './state.js';
import { h, icon, toast } from './ui.js';
import { petCorner } from './pets.js';
import { today } from './dates.js';
import { homeView } from './views/home.js';
import { financeView } from './views/finance.js';
import { syncRecurring } from './views/finance-extra.js';
import { accountsView } from './views/accounts.js';
import { channelView } from './views/channel.js';
import { careerView } from './views/career.js';
import { projectsView } from './views/projects.js';
import { tasksView } from './views/tasks.js';
import { notesView } from './views/notes.js';
import { gamesView } from './views/games.js';
import { grokView } from './views/grok.js';
import { settingsView } from './views/settings.js';

const VIEWS = {
  home: { title: 'Главная', icon: 'home', render: homeView },
  finance: { title: 'Финансы', icon: 'wallet', render: financeView },
  accounts: { title: 'Счета', icon: 'card', render: accountsView },
  career: { title: 'Карьера', icon: 'briefcase', render: careerView },
  projects: { title: 'Проекты', icon: 'rocket', render: projectsView },
  channel: { title: 'Telegram-каналы', icon: 'send', render: channelView },
  tasks: { title: 'Задачи и привычки', icon: 'list', render: tasksView },
  notes: { title: 'Заметки', icon: 'note', render: notesView },
  games: { title: 'Игры', icon: 'gamepad', render: gamesView },
  grok: { title: 'Grok', icon: 'spark', render: grokView },
  settings: { title: 'Настройки', icon: 'gear', render: settingsView },
};
const NAV = [['home'], ['Деньги', 'finance', 'accounts'], ['Работа', 'career', 'projects', 'channel'], ['Личное', 'tasks', 'notes', 'games'], ['Помощник', 'grok']];

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

const mediaUrl = (name) => `planner-media://media/${encodeURIComponent(name)}`;

/** The user's background picture (with a veil so cards stay readable) and the banner behind the logo. */
export function applyMedia() {
  const s = state.data.settings;
  const root = document.documentElement;
  if (s.background) {
    root.dataset.bg = '1';
    root.style.setProperty('--bg-image', `url("${mediaUrl(s.background)}")`);
  } else {
    delete root.dataset.bg;
    root.style.removeProperty('--bg-image');
  }
  root.style.setProperty('--veil', String((s.veil ?? 70) / 100));

  const brand = document.getElementById('brand');
  const current = brand.querySelector('.brand-media');
  if (current?.dataset.name === (s.banner || '')) return;
  current?.remove();
  brand.classList.toggle('has-banner', !!s.banner);
  if (!s.banner) return;
  const video = /\.(mp4|webm)$/i.test(s.banner);
  const el = video
    ? h('video', { class: 'brand-media', src: mediaUrl(s.banner), autoplay: true, muted: true, loop: true, playsinline: true })
    : h('img', { class: 'brand-media', src: mediaUrl(s.banner), alt: '' });
  if (video) el.muted = true;
  el.dataset.name = s.banner;
  brand.prepend(el);
}

/** Picks up media files that are already in the data folder but not chosen in settings yet. */
async function adoptMedia() {
  const files = await window.api.media.list();
  const s = state.data.settings;
  const pick = (kind) => files.filter((f) => f.startsWith(`${kind}-`)).sort().at(-1);
  const bg = !s.background && pick('background');
  const banner = !s.banner && pick('banner');
  if (bg || banner) {
    update(
      (d) => {
        if (bg) d.settings.background = bg;
        if (banner) d.settings.banner = banner;
      },
      { silent: true },
    );
  }
}

// Recurring payments are written once per day (on start, and when the app stays open past midnight).
let recurringChecked = '';
function checkRecurring() {
  if (recurringChecked === today()) return;
  recurringChecked = today();
  const n = syncRecurring();
  if (n) toast(`Записаны регулярные платежи: ${n}`);
}

function render() {
  checkRecurring();
  applyMedia();
  renderNav();
  const main = document.getElementById('main');
  const view = VIEWS[state.view] || VIEWS.home;
  const keepScroll = main.scrollTop;
  main.replaceChildren(view.render());
  main.scrollTop = keepScroll;
}

async function boot() {
  await loadState();
  await adoptMedia();
  applyTheme();
  setRenderer(render);
  render();
}

boot();
