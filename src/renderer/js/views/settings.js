// Settings: language, Grok key and model, appearance, tray and autostart, notifications, data folder and backups.
import { state, update } from '../state.js';
import { h, card, toast, icon } from '../ui.js';
import { t, LANGS, num } from '../i18n.js';
import { setTheme, setLanguage, applyMedia } from '../app.js';
import { dateTime, prettyDate } from '../dates.js';
import { resetGrokKeyCache } from './grok.js';

let models = null;
let keySet = null;
let backups = null;
let backupsAt = 0;

function seg(options, value, onPick) {
  return h(
    'div',
    { class: 'seg' },
    options.map(([k, label]) => h('button', { type: 'button', class: value === k ? 'on' : '', 'data-value': String(k), onclick: () => onPick(k) }, label)),
  );
}

const onOff = (value, onPick) =>
  seg(
    [
      [true, t('common.on')],
      [false, t('common.off')],
    ],
    !!value,
    onPick,
  );

/** Choose / remove a background or banner file (copied into the data folder, never uploaded anywhere). */
function mediaRow(kind, title, note) {
  const s = state.data.settings;
  const current = s[kind];
  return settingRow(
    title,
    current ? `${note}. ${t('settings.ownFile')}` : note,
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
            toast(kind === 'banner' ? t('settings.bannerUpdated') : t('settings.bgUpdated'));
          },
        },
        current ? t('settings.replace') : t('settings.chooseFile'),
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
          t('settings.remove'),
        ),
    ),
  );
}

function settingRow(title, note, control) {
  return h('div', { class: 'list-row setting-row' }, h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, title), note && h('div', { class: 'meta' }, note)), control);
}

function timeInput(value, onChange) {
  return h('input', { class: 'input', type: 'time', value, style: { width: '110px' }, onchange: (e) => e.target.value && onChange(e.target.value) });
}

const setNotify = (key, value) => update((d) => (d.settings.notify[key] = value));

function notificationsCard() {
  const n = state.data.settings.notify;
  const type = (key) => settingRow(t(`settings.notify.${key}`), t(`settings.notify.${key}Hint`), onOff(n[key], (v) => setNotify(key, v)));
  return card(
    t('settings.notifications'),
    null,
    h(
      'div',
      { class: 'list' },
      type('recurring'),
      type('budget'),
      type('followUp'),
      type('habits'),
      n.habits && settingRow(t('settings.notify.habitsAt'), null, timeInput(n.habitsAt, (v) => setNotify('habitsAt', v))),
      settingRow(
        t('settings.quietHours'),
        t('settings.quietHint'),
        h('div', { class: 'row' }, timeInput(n.quietFrom, (v) => setNotify('quietFrom', v)), '—', timeInput(n.quietTo, (v) => setNotify('quietTo', v))),
      ),
    ),
  );
}

function sizeText(bytes) {
  return bytes >= 1024 * 1024 ? t('settings.sizeMb', { v: num(bytes / 1024 / 1024, { maximumFractionDigits: 1 }) }) : t('settings.sizeKb', { v: num(Math.max(1, Math.round(bytes / 1024))) });
}

async function restore(b) {
  if (!confirm(t('settings.restoreConfirm', { name: b.date ? prettyDate(b.date) : b.name }))) return;
  const res = await window.api.backups.restore(b.name);
  if (!res.ok) return toast(t('settings.restoreFailed'));
  state.data = res.data;
  backups = null;
  setTheme(state.data.settings.theme);
  setLanguage(state.data.settings.lang);
  toast(t('settings.restored'));
}

function backupsCard() {
  // The list is re-read when the screen is opened again (a new daily copy may have appeared).
  if (backups === null || Date.now() - backupsAt > 30000) {
    backups ||= [];
    backupsAt = Date.now();
    window.api.backups.list().then((list) => {
      backups = list;
      if (state.view === 'settings') update(() => {}, { silent: false });
    });
  }
  return card(
    t('settings.backups'),
    h('button', { class: 'btn ghost sm', onclick: () => window.api.backups.open() }, icon('folder', 14), t('settings.openFolder')),
    h('p', { class: 'muted', style: { margin: '0 0 6px' } }, t('settings.backupsHint')),
    backups.length
      ? h(
          'div',
          { class: 'list backup-list' },
          backups.map((b) =>
            h(
              'div',
              { class: 'list-row compact' },
              h('div', { class: 'grow' }, h('div', { class: 'title' }, b.date ? prettyDate(b.date) : t('settings.beforeRestore')), h('div', { class: 'meta' }, `${dateTime(b.mtime)} · ${sizeText(b.size)}`)),
              h('button', { class: 'btn ghost sm', onclick: () => restore(b) }, t('settings.restore')),
            ),
          ),
        )
      : h('p', { class: 'meta' }, t('settings.noBackups')),
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

  const keyInput = h('input', { class: 'input', type: 'password', placeholder: keySet ? t('settings.keyReplacePh') : 'xai-…', style: { width: '320px' } });
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
            toast(t('settings.keySaved'));
            update(() => {});
          },
        },
        t('common.save'),
      ),
      keySet &&
        h(
          'button',
          {
            class: 'btn ghost',
            onclick: async () => {
              keySet = await window.api.grok.setKey('');
              resetGrokKeyCache();
              toast(t('settings.keyRemoved'));
              update(() => {});
            },
          },
          t('common.delete'),
        ),
    );
  const modelRow = () =>
    settingRow(
      t('settings.model'),
      models ? t('settings.modelsCount', { n: models.length }) : t('settings.modelHint'),
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
              if (!res.ok) return toast(res.code === 'bad_key' ? t('settings.keyBad') : t('settings.failed', { reason: res.message || res.code }));
              models = res.models;
              toast(t('settings.modelsLoaded', { n: models.length }));
              update(() => {});
            },
          },
          t('settings.loadModels'),
        ),
      ),
    );

  return h(
    'div',
    { class: 'page', style: { maxWidth: '820px' } },
    h('div', { class: 'page-head' }, h('h1', {}, t('nav.settings'))),
    h(
      'div',
      { class: 'stack' },
      card(
        t('settings.general'),
        null,
        h(
          'div',
          { class: 'list' },
          settingRow(
            t('settings.language'),
            t('settings.languageHint'),
            seg(
              LANGS.map((l) => [l, t(`lang.${l}`)]),
              s.lang,
              setLanguage,
            ),
          ),
          settingRow(t('settings.closeToTray'), t('settings.closeToTrayHint'), onOff(s.closeToTray, (v) => update((d) => (d.settings.closeToTray = v)))),
          settingRow(t('settings.autoStart'), t('settings.autoStartHint'), onOff(s.autoStart, (v) => update((d) => (d.settings.autoStart = v)))),
        ),
      ),
      card(
        'Grok (xAI)',
        null,
        h(
          'div',
          { class: 'list' },
          settingRow(
            t('settings.grokMode'),
            t('settings.grokModeHint'),
            seg(
              [
                ['web', t('settings.grokWeb')],
                ['browser', t('grok.mode.browser')],
                ['api', t('grok.mode.api')],
              ],
              s.grokMode,
              (v) => update((d) => (d.settings.grokMode = v)),
            ),
          ),
          s.grokMode === 'api' &&
            settingRow(
              t('settings.apiKey'),
              h('span', {}, keySet ? t('settings.keyStored') : t('settings.keyNone'), t('settings.keyGet'), h('a', { href: 'https://console.x.ai', target: '_blank', style: { color: 'inherit' } }, 'console.x.ai'), ' → API Keys.'),
              keyControls(),
            ),
          s.grokMode === 'api' && modelRow(),
          s.grokMode === 'web' &&
            settingRow(
              t('settings.grokAccount'),
              t('settings.grokAccountHint'),
              h(
                'button',
                {
                  class: 'btn',
                  onclick: async () => {
                    await window.api.grokWeb.logout();
                    toast(t('grok.loggedOut'));
                  },
                },
                t('settings.grokLogout'),
              ),
            ),
        ),
      ),
      card(
        t('settings.appearance'),
        null,
        h(
          'div',
          { class: 'list' },
          settingRow(
            t('settings.theme'),
            null,
            seg(
              [
                ['light', t('settings.themeLight')],
                ['dark', t('settings.themeDark')],
              ],
              s.theme,
              setTheme,
            ),
          ),
          settingRow(
            t('settings.density'),
            t('settings.densityHint'),
            seg(
              [
                ['compact', t('settings.compact')],
                ['spacious', t('settings.spacious')],
              ],
              s.density,
              (v) => update((d) => (d.settings.density = v)),
            ),
          ),
          mediaRow('background', t('settings.background'), t('settings.backgroundHint')),
          s.background &&
            settingRow(
              t('settings.veil'),
              t('settings.veilHint'),
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
          mediaRow('banner', t('settings.banner'), t('settings.bannerHint')),
          settingRow(
            t('settings.pets'),
            t('settings.petsHint'),
            seg(
              [
                [true, t('settings.show')],
                [false, t('settings.hide')],
              ],
              s.pets !== false,
              (v) => update((d) => (d.settings.pets = v)),
            ),
          ),
          s.pets !== false &&
            settingRow(
              t('settings.petsColor'),
              t('settings.petsColorHint'),
              seg(
                [
                  [false, t('settings.mono')],
                  [true, t('settings.color')],
                ],
                !!s.petsColor,
                (v) => update((d) => (d.settings.petsColor = v)),
              ),
            ),
          settingRow(
            t('common.currency'),
            t('settings.currencyHint'),
            seg(
              [
                ['€', t('cur.eurShort')],
                ['₴', t('cur.uahShort')],
              ],
              s.currency,
              (v) => update((d) => (d.settings.currency = v)),
            ),
          ),
        ),
      ),
      notificationsCard(),
      card(t('settings.data'), null, h('div', { class: 'list' }, settingRow(t('settings.whereStored'), t('settings.whereStoredHint'), h('button', { class: 'btn', onclick: () => window.api.openDataDir() }, t('settings.openFolder'))))),
      backupsCard(),
    ),
  );
}
