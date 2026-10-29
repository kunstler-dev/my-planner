// Ctrl+K: one window over everything — notes, tasks, operations, applications, projects, games, channels, the
// inbox and commands. Arrows choose, Enter opens the section with the found item highlighted, Esc closes.
import { state, update } from './state.js';
import { h, icon, money } from './ui.js';
import { t } from './i18n.js';
import { catLabel } from './labels.js';
import { buildIndex, search } from './search-index.js';

const KIND_ICON = { note: 'note', task: 'list', entry: 'wallet', application: 'briefcase', project: 'rocket', game: 'gamepad', channel: 'send', inbox: 'inbox', cmd: 'right' };

/** actions: { go(view, opts), expense(), income(), newNote(), toggleTheme(), views: [keys] } from app.js. */
export function openSearch(actions) {
  if (document.querySelector('.search-back')) return;
  const commands = [
    { kind: 'cmd', title: t('search.cmd.expense'), run: actions.expense },
    { kind: 'cmd', title: t('search.cmd.income'), run: actions.income },
    { kind: 'cmd', title: t('search.cmd.note'), run: actions.newNote },
    { kind: 'cmd', title: state.data.settings.theme === 'dark' ? t('nav.lightTheme') : t('nav.darkTheme'), run: actions.toggleTheme },
    ...actions.views.map((v) => ({ kind: 'cmd', title: t('search.goTo', { name: t(`nav.${v}`) }), run: () => actions.go(v) })),
  ];
  const index = buildIndex(state.data, { category: catLabel, money: (n) => money(n) });
  const input = h('input', { class: 'input search-input', placeholder: t('search.placeholder') });
  const list = h('div', { class: 'search-list' });
  let results = [];
  let sel = 0;
  const close = () => back.remove();
  const choose = (r) => {
    close();
    if (r.kind === 'cmd') return r.run();
    if (r.kind === 'channel') update((d) => (d.settings.activeChannel = r.id), { silent: true });
    actions.go(r.view, { highlight: r.id, ref: r.ref, kind: r.kind });
  };
  const draw = () => {
    const q = input.value;
    const cmds = q ? search(commands, q, 6) : commands.slice(0, 4);
    results = [...cmds, ...(q ? search(index, q, 30) : search(index, '', 8))];
    sel = Math.min(sel, Math.max(0, results.length - 1));
    list.replaceChildren(
      ...(results.length
        ? results.map((r, i) =>
            h(
              'div',
              { class: `search-row${i === sel ? ' on' : ''}`, onmousedown: (e) => (e.preventDefault(), choose(r)) },
              icon(KIND_ICON[r.kind] || 'right', 15),
              h('div', { class: 'grow' }, h('div', { class: 'title' }, r.title), r.sub && h('div', { class: 'meta' }, r.sub)),
              h('span', { class: 'meta' }, t(`search.kind.${r.kind}`)),
            ),
          )
        : [h('p', { class: 'meta', style: { padding: '8px 12px' } }, t('common.nothingFound'))]),
    );
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };
  input.addEventListener('input', () => ((sel = 0), draw()));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return close();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(1, results.length);
      draw();
    } else if (e.key === 'Enter' && results[sel]) choose(results[sel]);
  });
  const back = h('div', { class: 'search-back', onmousedown: (e) => e.target === back && close() }, h('div', { class: 'search-box' }, input, list, h('div', { class: 'search-foot meta' }, t('search.keys'))));
  document.body.append(back);
  draw();
  setTimeout(() => input.focus(), 0);
}
