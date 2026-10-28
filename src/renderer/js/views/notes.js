// Notes: quick notes and ideas with search and pinning.
import { state, update } from '../state.js';
import { h, icon, uid, card, empty } from '../ui.js';
import { formModal } from '../modal.js';
import { today, prettyDate } from '../dates.js';

let query = '';

function noteModal(n) {
  const isNew = !n;
  formModal(
    isNew ? 'Новая заметка' : 'Заметка',
    [
      { key: 'title', label: 'Заголовок', placeholder: 'Необязательно' },
      { key: 'text', label: 'Текст', type: 'textarea', rows: 10, required: true },
      { key: 'pinned', label: 'Закрепить сверху', type: 'checkbox' },
    ],
    { title: '', text: '', pinned: false, ...n },
    {
      onSave: (v) =>
        update((d) => {
          if (isNew) d.notes.push({ id: uid(), ...v, updatedAt: today() });
          else Object.assign(d.notes.find((x) => x.id === n.id), v, { updatedAt: today() });
        }),
      onDelete: isNew ? null : () => update((d) => (d.notes = d.notes.filter((x) => x.id !== n.id))),
    },
  );
}

export function notesView() {
  const q = query.toLowerCase();
  const notes = state.data.notes
    .filter((n) => !q || `${n.title} ${n.text}`.toLowerCase().includes(q))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const search = h('input', {
    class: 'input',
    id: 'notes-search',
    placeholder: 'Поиск по заметкам',
    value: query,
    style: { width: '240px' },
    oninput: (e) => {
      query = e.target.value;
      const pos = e.target.selectionStart;
      update(() => {});
      const again = document.getElementById('notes-search');
      again?.focus();
      again?.setSelectionRange(pos, pos);
    },
  });
  return h(
    'div',
    { class: 'page' },
    h(
      'div',
      { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Заметки'), h('div', { class: 'sub' }, `${state.data.notes.length} заметок`)),
      h('div', { class: 'row' }, search, h('button', { class: 'btn primary', onclick: () => noteModal(null) }, icon('plus', 16), 'Заметка')),
    ),
    notes.length
      ? h(
          'div',
          { class: 'notes-grid' },
          notes.map((n) =>
            h(
              'button',
              { class: `card note${n.pinned ? ' pinned' : ''}`, onclick: () => noteModal(n) },
              n.title && h('h3', {}, n.title),
              h('div', { class: 'note-text' }, n.text),
              h('div', { class: 'meta' }, `${n.pinned ? '📌 ' : ''}${n.updatedAt ? prettyDate(n.updatedAt) : ''}`),
            ),
          ),
        )
      : card(null, null, empty(query ? 'Ничего не найдено' : 'Идеи постов, мысли о проектах, вопросы к собеседованию — всё сюда.')),
  );
}
