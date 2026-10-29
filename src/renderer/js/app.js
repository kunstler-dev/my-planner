// Boot, sidebar navigation and view switching; the background scheduler, notifications and tray commands.
import { state, loadState, setRenderer, update } from './state.js';
import { h, icon, toast, uid, money } from './ui.js';
import { CAT } from './finance-calc.js';
import { quickBoot } from './quick.js';
import { t, setLang, LANGS, mainStrings } from './i18n.js';
import { petCorner } from './pets.js';
import { homeView } from './views/home.js';
import { financeView, entryModal } from './views/finance.js';
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
import { reviewView } from './views/review.js';
import { stopTimer, startTimer, syncTray, tickTimerDom } from './timer.js';
import { autoHabitMarks, elapsedText } from './productivity-calc.js';
import { today } from './dates.js';
import { inboxView } from './views/inbox.js';
import { newItems } from './inbox.js';
import { startAccountSync } from './account-sync.js';
import { register, onDayChange, startScheduler } from './scheduler.js';
import { checkNotifications } from './notifications.js';
import { MINUTE } from './notify-calc.js';

const VIEWS = {
  home: { icon: 'home', render: homeView },
  finance: { icon: 'wallet', render: financeView },
  accounts: { icon: 'card', render: accountsView },
  inbox: { icon: 'inbox', render: inboxView },
  career: { icon: 'briefcase', render: careerView },
  projects: { icon: 'rocket', render: projectsView },
  channel: { icon: 'send', render: channelView },
  tasks: { icon: 'list', render: tasksView },
  notes: { icon: 'note', render: notesView },
  games: { icon: 'gamepad', render: gamesView },
  review: { icon: 'chart', render: reviewView },
  grok: { icon: 'spark', render: grokView },
  settings: { icon: 'gear', render: settingsView },
};
const NAV = [['home'], ['money', 'finance', 'accounts', 'inbox'], ['work', 'career', 'projects', 'channel'], ['personal', 'tasks', 'notes', 'games', 'review'], ['assistant', 'grok']];

export function go(view, opts) {
  state.view = view;
  state.viewOpts = opts || null;
  render();
  document.getElementById('main').scrollTop = 0;
}

function navItem(key) {
  const v = VIEWS[key];
  const label = t(`nav.${key}`);
  // The inbox shows how many items wait for a decision.
  const count = key === 'inbox' ? newItems(state.data.inbox).length : 0;
  return h(
    'button',
    { class: `nav-item${state.view === key ? ' active' : ''}`, 'data-view': key, title: count ? `${label}: ${count}` : label, onclick: () => go(key) },
    icon(v.icon),
    h('span', { class: 'nav-label' }, label),
    count > 0 && h('span', { class: 'nav-count' }, String(count)),
  );
}

// Below this width the menu collapses to icons on its own.
const narrow = window.matchMedia('(max-width: 1099px)');
narrow.addEventListener('change', () => render());

/** Density and the collapsed menu are attributes on <html>; CSS does the rest. */
function applyLayout() {
  const s = state.data.settings;
  const root = document.documentElement;
  root.dataset.density = s.density;
  if (s.sidebarCollapsed || narrow.matches) root.dataset.sidebar = 'collapsed';
  else delete root.dataset.sidebar;
  const brand = document.getElementById('brand');
  let toggle = brand.querySelector('.sidebar-toggle');
  if (!toggle) {
    toggle = h('button', { class: 'sidebar-toggle', onclick: () => update((d) => (d.settings.sidebarCollapsed = !(d.settings.sidebarCollapsed || narrow.matches))) });
    brand.append(toggle);
  }
  const collapsed = !!root.dataset.sidebar;
  toggle.title = collapsed ? t('nav.expand') : t('nav.collapse');
  toggle.replaceChildren(icon(collapsed ? 'right' : 'left', 16));
}

function renderNav() {
  const nav = document.getElementById('nav');
  nav.replaceChildren(
    ...NAV.flatMap((group) => {
      const [first, ...rest] = group;
      return VIEWS[first] ? group.map(navItem) : [h('div', { class: 'nav-group' }, t(`nav.group.${first}`)), ...rest.map(navItem)];
    }),
  );
  const s = state.data.settings;
  const dark = s.theme === 'dark';
  const nextLang = LANGS[(LANGS.indexOf(s.lang) + 1) % LANGS.length];
  const tm = state.data.timer;
  const running = tm && state.data.projects.find((p) => p.id === tm.projectId);
  document.getElementById('nav-bottom').replaceChildren(
    // The running project timer, always in sight.
    running &&
      h(
        'button',
        { class: 'nav-item nav-timer', title: running.name, onclick: () => go('projects') },
        icon('clock'),
        h('span', { class: 'nav-label' }, running.name),
        h('span', { class: 'nav-lang', 'data-timer-start': tm.startedAt }, elapsedText(Date.now() - tm.startedAt)),
      ),
    navItem('settings'),
    h(
      'button',
      { class: 'nav-item', 'data-action': 'theme', title: dark ? t('nav.lightTheme') : t('nav.darkTheme'), onclick: () => setTheme(dark ? 'light' : 'dark') },
      icon(dark ? 'sun' : 'moon'),
      h('span', { class: 'nav-label' }, dark ? t('nav.lightTheme') : t('nav.darkTheme')),
    ),
    h(
      'button',
      { class: 'nav-item', 'data-action': 'lang', title: `${t('nav.language')}: ${t('nav.langHint')}`, onclick: () => setLanguage(nextLang) },
      icon('globe'),
      h('span', { class: 'nav-label' }, t('nav.language')),
      h('span', { class: 'nav-lang' }, s.lang.toUpperCase()),
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

/** Switches the interface language at once, including the tray menu and system dialogs. */
export function setLanguage(lang) {
  update((d) => (d.settings.lang = lang), { silent: true });
  applyLang();
  render();
}

function applyLang() {
  setLang(state.data.settings.lang);
  window.api.setStrings(mainStrings());
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

// Recurring payments are written once per day: on start and when the date changes with the app open.
function checkRecurring() {
  const n = syncRecurring();
  if (n) {
    toast(t('finance.recurringWritten', { n }));
    render();
  }
}

/** Tray menu and notification clicks. */
function onCommand(msg) {
  if (msg?.cmd === 'go' && VIEWS[msg.view]) go(msg.view);
  else if (msg?.cmd === 'expense' || msg?.cmd === 'income') entryModal({ type: msg.cmd });
  else if (msg?.cmd === 'timer-stop') stopTimer();
  else if (msg?.cmd === 'timer-start' && state.data.timerLast) startTimer(state.data.timerLast);
  else if (msg?.cmd === 'add-entry' && msg.entry) {
    // From the quick entry window: saved here, the only window that writes data.
    const e = { id: uid(), ...msg.entry, category: msg.entry.category || CAT.other };
    update((d) => d.finance.push(e));
    toast(t(e.type === 'income' ? 'finance.incomeSaved' : 'finance.expenseSaved', { amount: money(e.amount) }));
  }
}

function applyAutoHabits() {
  const marks = autoHabitMarks(state.data, today());
  if (!marks.length) return;
  update((d) => {
    for (const m of marks) {
      const hb = d.habits.find((x) => x.id === m.habitId);
      if (hb && !hb.days.includes(m.date)) hb.days = [...hb.days, m.date].sort();
    }
  });
}

function render() {
  applyLayout();
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
  applyLang();
  await adoptMedia();
  applyTheme();
  setRenderer(render);
  window.api.onCommand(onCommand);
  onDayChange(checkRecurring);
  register('notify', MINUTE, () => checkNotifications());
  // Habits with a rule check themselves; the tray shows the running timer.
  register('habits-auto', 5 * MINUTE, applyAutoHabits);
  register('timer-tray', MINUTE, syncTray);
  onDayChange(applyAutoHabits);
  setInterval(tickTimerDom, 15000);
  render();
  // Background tasks are registered before the first check, so they run right after start.
  await startAccountSync();
  startScheduler();
}

// The quick entry window loads the same page with ?quick=1 and shows only its field.
if (new URLSearchParams(location.search).get('quick')) quickBoot();
else boot();
