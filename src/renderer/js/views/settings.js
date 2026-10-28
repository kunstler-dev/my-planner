// Settings: Grok key and model, currency, theme, pets, data folder.
import { state, update } from '../state.js';
import { h, card, toast } from '../ui.js';
import { setTheme } from '../app.js';
import { resetGrokKeyCache } from './grok.js';

let models = null;
let keySet = null;

function seg(options, value, onPick) {
  return h(
    'div',
    { class: 'seg' },
    options.map(([k, label]) => h('button', { type: 'button', class: value === k ? 'on' : '', onclick: () => onPick(k) }, label)),
  );
}

function settingRow(title, note, control) {
  return h(
    'div',
    { class: 'list-row', style: { padding: '14px 4px' } },
    h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, title), note && h('div', { class: 'meta' }, note)),
    control,
  );
}

export function settingsView() {
  const s = state.data.settings;
  if (keySet === null) {
    window.api.grok.hasKey().then((v) => {
      keySet = v;
      update(() => {});
    });
  }

  const keyInput = h('input', { class: 'input', type: 'password', placeholder: keySet ? 'Ключ сохранён — вставь новый, чтобы заменить' : 'xai-…', style: { width: '320px' } });
  const modelInput = h('input', {
    class: 'input',
    value: s.grokModel,
    list: 'grok-models',
    style: { width: '220px' },
    onchange: (e) => update((d) => (d.settings.grokModel = e.target.value.trim() || 'grok-4'), { silent: true }),
  });

  return h(
    'div',
    { class: 'page', style: { maxWidth: '820px' } },
    h('div', { class: 'page-head' }, h('h1', {}, 'Настройки')),
    h(
      'div',
      { class: 'stack' },
      card(
        'Grok (xAI)',
        null,
        h(
          'div',
          { class: 'list' },
          settingRow(
            'Ключ API',
            h('span', {}, keySet ? 'Сохранён, зашифрован на этом компьютере. ' : 'Не задан. ', 'Получить: ', h('a', { href: 'https://console.x.ai', target: '_blank', style: { color: 'inherit' } }, 'console.x.ai'), ' → API Keys.'),
            h(
              'div',
              { class: 'row' },
              keyInput,
              h(
                'button',
                {
                  class: 'btn primary',
                  onclick: async () => {
                    if (!keyInput.value.trim()) return;
                    keySet = await window.api.grok.setKey(keyInput.value.trim());
                    resetGrokKeyCache();
                    models = null;
                    toast('Ключ сохранён');
                    update(() => {});
                  },
                },
                'Сохранить',
              ),
              keySet &&
                h(
                  'button',
                  {
                    class: 'btn ghost',
                    onclick: async () => {
                      keySet = await window.api.grok.setKey('');
                      resetGrokKeyCache();
                      toast('Ключ удалён');
                      update(() => {});
                    },
                  },
                  'Удалить',
                ),
            ),
          ),
          settingRow(
            'Модель',
            models ? `Доступно моделей: ${models.length}` : 'По умолчанию grok-4. Список доступных моделей можно загрузить с xAI.',
            h(
              'div',
              { class: 'row' },
              modelInput,
              h('datalist', { id: 'grok-models' }, (models || []).map((m) => h('option', { value: m }))),
              h(
                'button',
                {
                  class: 'btn',
                  disabled: !keySet,
                  onclick: async () => {
                    const res = await window.api.grok.models();
                    if (!res.ok) return toast(res.code === 'bad_key' ? 'Ключ не подошёл' : `Не удалось: ${res.message || res.code}`);
                    models = res.models;
                    toast(`Моделей: ${models.length}. Выбери в поле «Модель».`);
                    update(() => {});
                  },
                },
                'Загрузить список моделей',
              ),
            ),
          ),
        ),
      ),
      card(
        'Внешний вид',
        null,
        h(
          'div',
          { class: 'list' },
          settingRow('Тема', null, seg([['light', 'Светлая'], ['dark', 'Тёмная']], s.theme, setTheme)),
          settingRow('Питомцы', 'Сефирка, Гудсик и корги Бублик внизу меню', seg([[true, 'Показывать'], [false, 'Скрыть']], s.pets !== false, (v) => update((d) => (d.settings.pets = v)))),
          s.pets !== false && settingRow('Цвет питомцев', 'Чёрно-белые под стиль приложения или в цвете', seg([[false, 'Ч/б'], [true, 'Цветные']], !!s.petsColor, (v) => update((d) => (d.settings.petsColor = v)))),
          settingRow(
            'Валюта',
            'Символ в суммах',
            seg(
              [
                ['€', 'Евро €'],
                ['₴', 'Гривна ₴'],
              ],
              s.currency,
              (v) => update((d) => (d.settings.currency = v)),
            ),
          ),
        ),
      ),
      card(
        'Данные',
        null,
        h(
          'div',
          { class: 'list' },
          settingRow('Где хранятся', 'Всё лежит только на этом компьютере (data.json + резервная копия). Синхронизации нет.', h('button', { class: 'btn', onclick: () => window.api.openDataDir() }, 'Открыть папку')),
        ),
      ),
    ),
  );
}
