// Simple modal dialog; Esc or a click on the backdrop closes it.
import { h } from './ui.js';

export function openModal(title, body, { onSubmit, submitText = 'Сохранить', danger } = {}) {
  const close = () => {
    back.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  const form = h(
    'form',
    {
      class: 'modal',
      onsubmit: (e) => {
        e.preventDefault();
        if (onSubmit?.() !== false) close();
      },
    },
    h('h2', {}, title),
    body,
    h(
      'div',
      { class: 'row' },
      danger,
      h('div', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn ghost', onclick: close }, 'Отмена'),
      onSubmit && h('button', { type: 'submit', class: 'btn primary' }, submitText),
    ),
  );
  const back = h('div', { class: 'modal-back', onmousedown: (e) => e.target === back && close() }, form);
  document.body.append(back);
  document.addEventListener('keydown', onKey);
  setTimeout(() => form.querySelector('input, select, textarea')?.focus(), 0);
  return { close };
}
