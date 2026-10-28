// Settings: Grok key and model, currency, theme, pets, data folder.
import { state, update } from '../state.js';
import { h, card, toast } from '../ui.js';
import { setTheme, applyMedia } from '../app.js';
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

/** Choose / remove a background or banner file (copied into the data folder, never uploaded anywhere). */
function mediaRow(kind, title, note) {
  const s = state.data.settings;
  const current = s[kind];
  return settingRow(
    title,
    current ? `${note}. Сейчас: свой файл` : note,
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          class: 'btn',
          onclick: async () => {
            const name = await window.api.media.choose(kind);
            if (!name) return;
            update((d) => (d.settings[kind] = name));
            toast(kind === 'banner' ? 'Баннер обновлён' : 'Фон обновлён');
          },
        },
        current ? 'Заменить' : 'Выбрать файл',
      ),
      current &&
        h(
          'button',
          {
            class: 'btn ghost',
            onclick: async () => {
              await window.api.media.remove(kind);
              update((d) => (d.settings[kind] = ''));
            },
          },
          'Убрать',
        ),
    ),
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

  const keyControls = () =>
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
    );
  const modelRow = () =>
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
    );

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
            'Режим',
            'Подписка — grok.com внутри планера с твоим аккаунтом, без оплаты за токены. API-ключ — свой чат через xAI API, токены оплачиваются отдельно.',
            seg(
              [
                ['web', 'Подписка grok.com'],
                ['api', 'API-ключ'],
              ],
              s.grokMode,
              (v) => update((d) => (d.settings.grokMode = v)),
            ),
          ),
          s.grokMode === 'api' &&
            settingRow(
              'Ключ API',
              h('span', {}, keySet ? 'Сохранён, зашифрован на этом компьютере. ' : 'Не задан. ', 'Получить: ', h('a', { href: 'https://console.x.ai', target: '_blank', style: { color: 'inherit' } }, 'console.x.ai'), ' → API Keys.'),
              keyControls(),
            ),
          s.grokMode === 'api' && modelRow(),
          s.grokMode !== 'api' &&
            settingRow(
              'Аккаунт grok.com',
              'Вход хранится только в планере. Выйти можно здесь или на вкладке Grok.',
              h(
                'button',
                {
                  class: 'btn',
                  onclick: async () => {
                    await window.api.grokWeb.logout();
                    toast('Вышел из grok.com');
                  },
                },
                'Выйти из grok.com',
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
          mediaRow('background', 'Фон приложения', 'Картинка на заднем фоне (JPG, PNG, WebP, GIF)'),
          s.background &&
            settingRow(
              'Затемнение фона',
              'Чем больше — тем спокойнее фон и читабельнее текст',
              h('input', {
                type: 'range',
                class: 'range',
                min: 0,
                max: 95,
                value: s.veil ?? 70,
                oninput: (e) => {
                  state.data.settings.veil = Number(e.target.value);
                  applyMedia();
                },
                onchange: () => update(() => {}, { silent: true }),
              }),
            ),
          mediaRow('banner', 'Баннер в меню', 'Видео, GIF или картинка за логотипом слева сверху (MP4, WebM, GIF, PNG, JPG)'),
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
