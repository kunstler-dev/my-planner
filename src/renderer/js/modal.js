// Modal dialogs: openModal() for custom content and formModal() for simple record editors.
import { h, icon } from './ui.js';
import { t } from './i18n.js';

export function openModal(title, body, { onSubmit, submitText = t('common.save'), danger } = {}) {
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
      h('button', { type: 'button', class: 'btn ghost', onclick: close }, t('common.cancel')),
      onSubmit && h('button', { type: 'submit', class: 'btn primary' }, submitText),
    ),
  );
  const back = h('div', { class: 'modal-back', onmousedown: (e) => e.target === back && close() }, form);
  document.body.append(back);
  document.addEventListener('keydown', onKey);
  setTimeout(() => form.querySelector('input, select, textarea')?.focus(), 0);
  return { close };
}

/**
 * Record editor. fields: [{ key, label, type: 'text'|'number'|'date'|'select'|'textarea'|'checkbox',
 * options: [[value, label]], placeholder, required, half, list: [suggestions] }].
 * onSave(values) may return false to keep the dialog open; onDelete adds a delete button.
 */
export function formModal(title, fields, values, { onSave, onDelete, submitText } = {}) {
  const inputs = {};
  const control = (f) => {
    const v = values[f.key] ?? f.default ?? '';
    if (f.type === 'select') {
      return h(
        'select',
        { class: 'input' },
        f.options.map(([val, label]) => h('option', { value: val, selected: String(val) === String(v) ? 'selected' : null }, label)),
      );
    }
    if (f.type === 'textarea') return h('textarea', { class: 'input', rows: f.rows || 5, placeholder: f.placeholder || '', value: v });
    if (f.type === 'checkbox') return h('input', { type: 'checkbox', checked: !!v });
    const listId = f.list ? `l-${f.key}-${Math.random().toString(36).slice(2, 7)}` : null;
    const input = h('input', {
      class: 'input',
      type: f.type || 'text',
      value: v,
      placeholder: f.placeholder || '',
      required: f.required || null,
      step: f.type === 'number' ? f.step || 'any' : null,
      list: listId,
    });
    return listId ? [input, h('datalist', { id: listId }, f.list.map((x) => h('option', { value: x })))] : input;
  };
  const rows = [];
  let pair = [];
  for (const f of fields) {
    const c = control(f);
    inputs[f.key] = Array.isArray(c) ? c[0] : c;
    const el =
      f.type === 'checkbox'
        ? h('label', { class: 'row', style: { gap: '8px', fontSize: '14px' } }, c, f.label)
        : h('label', { class: 'field' }, f.label, c);
    if (f.half) {
      pair.push(el);
      if (pair.length === 2) {
        rows.push(h('div', { class: 'grid cols-2', style: { gap: '12px' } }, pair));
        pair = [];
      }
    } else {
      if (pair.length) rows.push(h('div', { class: 'grid cols-2', style: { gap: '12px' } }, pair));
      pair = [];
      rows.push(el);
    }
  }
  if (pair.length) rows.push(h('div', { class: 'grid cols-2', style: { gap: '12px' } }, pair));

  const read = () => {
    const out = {};
    for (const f of fields) {
      const el = inputs[f.key];
      if (f.type === 'checkbox') out[f.key] = el.checked;
      else if (f.type === 'number') out[f.key] = el.value === '' ? null : Number(String(el.value).replace(',', '.'));
      else out[f.key] = el.value.trim();
    }
    return out;
  };

  const modal = openModal(title, h('div', { class: 'stack', style: { gap: '12px' } }, rows), {
    submitText,
    onSubmit: () => {
      for (const f of fields) {
        if (f.required && !inputs[f.key].value.trim()) {
          inputs[f.key].focus();
          return false;
        }
      }
      return onSave(read());
    },
    danger:
      onDelete &&
      h(
        'button',
        {
          type: 'button',
          class: 'btn ghost',
          onclick: () => {
            onDelete();
            modal.close();
          },
        },
        icon('trash', 16),
        t('common.delete'),
      ),
  });
  return modal;
}
