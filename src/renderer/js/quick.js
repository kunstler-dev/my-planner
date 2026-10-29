// The quick entry window (opened by the global shortcut or the tray): one field, a live preview of what will be
// saved, Enter saves through the main window (the only one writing data), Esc closes.
import { h, money } from './ui.js';
import { t, setLang } from './i18n.js';
import { catLabel } from './labels.js';
import { today, prettyDate } from './dates.js';
import { state } from './state.js';
import { parseQuick } from './quick-parse.js';

export async function quickBoot() {
  state.readOnly = true;
  state.data = await window.api.load();
  setLang(state.data.settings.lang);
  document.documentElement.dataset.theme = state.data.settings.theme;
  document.documentElement.classList.add('quick-mode');
  const input = h('input', { class: 'input quick-input', placeholder: t('quick.placeholder'), autofocus: true });
  const preview = h('div', { class: 'quick-preview muted' }, t('quick.hint'));
  const show = () => {
    const p = parseQuick(input.value, { today: today(), rules: state.data.rules });
    preview.classList.toggle('muted', !p);
    preview.replaceChildren(
      ...(p
        ? [
            h('b', {}, money(p.type === 'income' ? p.amount : -p.amount, { sign: true })),
            ` · ${catLabel(p.category)}`,
            p.note ? ` · ${p.note}` : '',
            ` · ${p.date === today() ? t('common.today') : prettyDate(p.date)}`,
          ]
        : [t('quick.hint')]),
    );
    return p;
  };
  input.addEventListener('input', show);
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') return window.api.quick.close();
    if (e.key !== 'Enter') return;
    const p = show();
    if (!p) return;
    if (await window.api.quick.add(p)) input.value = '';
    show();
  });
  window.api.onCommand(async (msg) => {
    if (msg?.cmd !== 'quick-reset') return;
    state.data = await window.api.load();
    input.value = '';
    show();
    input.focus();
  });
  document.body.replaceChildren(h('div', { class: 'quick' }, h('div', { class: 'quick-title' }, t('quick.title'), h('span', { class: 'muted' }, 'Enter · Esc')), input, preview));
  setTimeout(() => input.focus(), 50);
}
