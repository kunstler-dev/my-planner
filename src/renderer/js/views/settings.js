// Settings: language, Grok key and model, appearance, tray and autostart, notifications, data folder and backups.
import { state, update } from '../state.js';
import { h, card, toast, icon, uid } from '../ui.js';
import { t, LANGS, num } from '../i18n.js';
import { setTheme, setLanguage, applyMedia } from '../app.js';
import { dateTime, prettyDate } from '../dates.js';
import { resetGrokKeyCache } from './grok.js';
import { convert } from '../planner-calc.js';
import { CURRENCY } from '../mono-import.js';
import { accountName } from '../labels.js';
import { checkMono, syncMono, isSyncing, monoErrorText } from '../account-sync.js';
import { monoLabel } from './accounts.js';
import { checkMail, isMailChecking, mailRules, mailErrorText, scheduleMail } from '../mail-sync.js';
import { DEFAULT_MAIL_RULES } from '../mail-parse.js';
import { resolveSteamProfile, syncDota } from '../games-sync.js';
import { catLabel } from '../labels.js';
import { categories } from './finance.js';
import { formModal } from '../modal.js';

let models = null;
let keySet = null;
let backups = null;
let monoSet = null;
let imapSet = null;
let quickStatus = null;
let rulesOpen = false;
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

/** A Monobank card as its own planner account. */
function monoAsAccount(m) {
  const cur = CURRENCY[m.currencyCode];
  update((d) =>
    d.accounts.push({ id: uid(), name: `Monobank${m.pan ? ` ·· ${m.pan}` : ''} ${cur}`, currency: cur, balance: m.balance / 100, updatedAt: '', history: [], sync: { kind: 'mono', monoIds: [m.id], error: '' } }),
  );
  syncMono();
}

/** A goal that follows a jar: its balance and target come from Monobank. */
function jarAsGoal(j) {
  const cur = CURRENCY[j.currencyCode];
  const main = state.data.settings.currency;
  const target = j.goal > 0 ? convert(j.goal / 100, cur, main, state.data.rates) : Math.max(1, convert(j.balance / 100, cur, main, state.data.rates));
  update((d) => d.goals.push({ id: uid(), title: j.title, target: Math.round(target * 100) / 100, deadline: '', contributions: [], jarId: j.id }));
  syncMono();
  toast(t('mono.goalCreated', { title: j.title }));
}

function monoCard() {
  const c = monoCardBody();
  c.dataset.section = 'mono';
  return c;
}

function monoCardBody() {
  if (monoSet === null) {
    monoSet = false;
    window.api.secrets.has('mono').then((v) => {
      monoSet = v;
      if (state.view === 'settings') update(() => {});
    });
  }
  const m = state.data.mono;
  const tokenInput = h('input', { class: 'input', type: 'password', placeholder: monoSet ? t('mono.tokenReplacePh') : t('mono.tokenPh'), style: { width: '280px' } });
  const owner = (id) => state.data.accounts.find((a) => a.sync?.kind === 'mono' && a.sync.monoIds?.includes(id));
  const cards = m.accounts.filter((a) => CURRENCY[a.currencyCode]);
  return card(
    t('mono.title'),
    null,
    h(
      'div',
      { class: 'list' },
      settingRow(
        t('mono.token'),
        h('span', {}, monoSet ? t('settings.keyStored') : t('settings.keyNone'), t('mono.tokenGet'), h('a', { href: 'https://api.monobank.ua/', target: '_blank', style: { color: 'inherit' } }, 'api.monobank.ua'), '.'),
        h(
          'div',
          { class: 'row' },
          tokenInput,
          h(
            'button',
            {
              class: 'btn primary',
              onclick: async () => {
                const v = tokenInput.value.trim();
                if (!v) return;
                monoSet = await window.api.secrets.set('mono', v);
                toast(t('mono.tokenSaved'));
                update(() => {});
              },
            },
            t('common.save'),
          ),
          monoSet &&
            h(
              'button',
              {
                class: 'btn ghost',
                onclick: async () => {
                  monoSet = await window.api.secrets.set('mono', '');
                  toast(t('mono.tokenRemoved'));
                  update(() => {});
                },
              },
              t('common.delete'),
            ),
        ),
      ),
      settingRow(
        t('mono.status'),
        m.error ? `⚠ ${monoErrorText(m.error)}` : m.fetchedAt ? t('mono.fetched', { time: dateTime(m.fetchedAt), accounts: cards.length, jars: m.jars.length }) : t('mono.never'),
        h(
          'button',
          {
            class: 'btn',
            disabled: !monoSet || isSyncing('mono'),
            onclick: async () => {
              toast(t('mono.checking'));
              const res = await checkMono();
              toast(res.ok ? t('mono.checked', { accounts: res.accounts.length, jars: res.jars.length }) : monoErrorText(res.error));
            },
          },
          isSyncing('mono') ? t('sync.running') : t('mono.check'),
        ),
      ),
      ...cards.map((c) => {
        const acc = owner(c.id);
        return h(
          'div',
          { class: 'list-row compact' },
          h('div', { class: 'grow' }, h('div', { class: 'title' }, monoLabel(c)), h('div', { class: 'meta' }, acc ? t('mono.inAccount', { name: accountName(acc) }) : t('mono.notLinked'))),
          !acc && h('button', { class: 'btn ghost sm', title: t('mono.asAccountHint'), onclick: () => monoAsAccount(c) }, t('mono.asAccount')),
        );
      }),
      ...m.jars.map((j) => {
        const goal = state.data.goals.find((g) => g.jarId === j.id);
        const cur = CURRENCY[j.currencyCode] || '';
        return h(
          'div',
          { class: 'list-row compact' },
          h('div', { class: 'grow' }, h('div', { class: 'title' }, `🫙 ${j.title}`), h('div', { class: 'meta' }, [`${num(j.balance / 100)} ${cur}`, j.goal > 0 && t('mono.jarGoal', { v: `${num(j.goal / 100)} ${cur}` }), goal && t('mono.inGoal', { title: goal.title })].filter(Boolean).join(' · '))),
          !goal && cur && h('button', { class: 'btn ghost sm', onclick: () => jarAsGoal(j) }, t('mono.asGoal')),
        );
      }),
      cards.length > 0 && h('p', { class: 'meta', style: { margin: '8px 4px 0' } }, t('mono.pickHint')),
    ),
  );
}

const setMail = (patch) => {
  update((d) => (d.settings.mail = { ...d.settings.mail, ...patch }));
  scheduleMail();
};

/** Saves the sender rules (the first edit copies the built-in ones into data). */
const saveRules = (fn) => update((d) => (d.mailRules = fn(d.mailRules.length ? d.mailRules : DEFAULT_MAIL_RULES.map((r) => ({ ...r })))));

function mailRuleModal(rule) {
  const isNew = !rule;
  formModal(
    isNew ? t('mail.rules.new') : rule.domain,
    [
      { key: 'domain', label: t('mail.rules.domain'), required: true, placeholder: 'example.com' },
      {
        key: 'action',
        label: t('mail.rules.action'),
        type: 'select',
        options: ['expense', 'alert', 'skip'].map((k) => [k, t(`mail.rules.act.${k}`)]),
        half: true,
      },
      { key: 'category', label: t('common.category'), type: 'select', options: [['', '—'], ...categories('expense').map((c) => [c, catLabel(c)])], half: true },
      { key: 'skip', label: t('mail.rules.skipWords'), placeholder: 'SEPA, Mandat' },
      { key: 'only', label: t('mail.rules.onlyWords'), placeholder: 'payment failed' },
    ],
    { domain: '', action: 'expense', category: '', ...rule, skip: (rule?.skip || []).join(', '), only: (rule?.only || []).join(', ') },
    {
      onSave: (v) => {
        const domain = v.domain.toLowerCase().replace(/^.*@/, '').trim();
        if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)) return toast(t('mail.rules.badDomain')), false;
        const words = (x) => x.split(',').map((w) => w.trim()).filter(Boolean);
        const rec = { ...(rule || { id: uid() }), domain, action: v.action, category: v.category || null, skip: words(v.skip), only: words(v.only) };
        if (!rec.only.length) delete rec.only;
        saveRules((list) => (isNew ? [...list, rec] : list.map((r) => (r.id === rule.id ? rec : r))));
      },
      onDelete: isNew ? null : () => saveRules((list) => list.filter((r) => r.id !== rule.id)),
    },
  );
}

/** Steam profile for OpenDota (Dota medal and matches) and the wishlist import. */
function gamesCard() {
  const s = state.data.settings;
  const input = h('input', { class: 'input', value: s.steamId, placeholder: t('steam.profilePh'), style: { width: '300px' } });
  const save = async () => {
    const v = input.value.trim();
    if (!v) return update((d) => (d.settings.steamId = ''));
    const res = await resolveSteamProfile(v);
    if (!res.ok) return toast(t('steam.profileBad'));
    update((d) => (d.settings.steamId = res.id64));
    toast(t('steam.profileSaved'));
    syncDota({ silent: false });
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && save());
  const c = card(
    t('steam.title'),
    null,
    h(
      'div',
      { class: 'list' },
      settingRow(t('steam.profile'), s.steamId ? t('steam.profileId', { id: s.steamId }) : t('steam.profileHint'), h('div', { class: 'row' }, input, h('button', { class: 'btn primary', onclick: save }, t('common.save')))),
      settingRow(t('steam.wishlistSync'), t('steam.wishlistSyncHint'), onOff(s.steamWishlistSync, (v) => update((d) => (d.settings.steamWishlistSync = v)))),
    ),
    h('p', { class: 'meta', style: { margin: '8px 4px 0' } }, t('dota.exposeHint')),
  );
  c.dataset.section = 'games';
  return c;
}

function mailCard() {
  if (imapSet === null) {
    imapSet = false;
    window.api.secrets.has('imap').then((v) => {
      imapSet = v;
      if (state.view === 'settings') update(() => {});
    });
  }
  const m = state.data.settings.mail;
  const sync = state.data.sync.mail || {};
  const address = h('input', { class: 'input', type: 'email', value: m.address, placeholder: 'name@gmail.com', style: { width: '260px' }, onchange: (e) => setMail({ address: e.target.value.trim() }) });
  const pass = h('input', { class: 'input', type: 'password', placeholder: imapSet ? t('mail.passReplacePh') : t('mail.passPh'), style: { width: '220px' } });
  const rules = mailRules();
  const c = card(
    t('mail.title'),
    null,
    h(
      'div',
      { class: 'list' },
      settingRow(t('mail.enabled'), t('mail.enabledHint'), onOff(m.enabled, (v) => setMail({ enabled: v }))),
      settingRow(t('mail.address'), null, address),
      settingRow(
        t('mail.password'),
        h('span', {}, imapSet ? t('settings.keyStored') : t('settings.keyNone'), t('mail.passHow'), h('a', { href: 'https://myaccount.google.com/apppasswords', target: '_blank', style: { color: 'inherit' } }, 'myaccount.google.com/apppasswords'), '.'),
        h(
          'div',
          { class: 'row' },
          pass,
          h(
            'button',
            {
              class: 'btn primary',
              onclick: async () => {
                if (!pass.value.trim()) return;
                imapSet = await window.api.secrets.set('imap', pass.value.trim());
                toast(t('mail.passSaved'));
                update(() => {});
              },
            },
            t('common.save'),
          ),
          imapSet &&
            h(
              'button',
              {
                class: 'btn ghost',
                onclick: async () => {
                  imapSet = await window.api.secrets.set('imap', '');
                  update(() => {});
                },
              },
              t('common.delete'),
            ),
        ),
      ),
      settingRow(
        t('mail.interval'),
        null,
        seg(
          [5, 15, 30, 60].map((n) => [n, t('mail.minutes', { n })]),
          m.interval,
          (v) => setMail({ interval: v }),
        ),
      ),
      settingRow(
        t('mail.status'),
        sync.error ? `⚠ ${mailErrorText(sync.error)}` : sync.lastCheck ? t('mail.lastCheck', { time: dateTime(sync.lastCheck) }) : t('mail.never'),
        h('button', { class: 'btn', disabled: !imapSet || !m.address || isMailChecking(), onclick: () => checkMail({ silent: false }) }, isMailChecking() ? t('sync.running') : t('mail.checkNow')),
      ),
      settingRow(
        t('mail.grok'),
        state.data.settings.grokMode === 'api' ? t('mail.grokHint') : t('mail.grokNeedsApi'),
        onOff(m.grok && state.data.settings.grokMode === 'api', (v) => state.data.settings.grokMode === 'api' && setMail({ grok: v })),
      ),
      settingRow(
        t('mail.rules.title'),
        t('mail.rules.hint', { n: rules.length }),
        h('div', { class: 'row' }, h('button', { class: 'btn ghost sm', onclick: () => ((rulesOpen = !rulesOpen), update(() => {})) }, rulesOpen ? t('common.collapse') : t('mail.rules.show'))),
      ),
      rulesOpen && [
        ...rules.map((r) =>
          h(
            'div',
            { class: 'list-row compact', style: { cursor: 'pointer' }, onclick: () => mailRuleModal(r) },
            h('div', { class: 'grow' }, h('div', { class: 'title' }, r.domain), h('div', { class: 'meta' }, [t(`mail.rules.act.${r.action}`), r.category && catLabel(r.category), r.skip?.length && t('mail.rules.skipShort', { list: r.skip.join(', ') }), r.only?.length && t('mail.rules.onlyShort', { list: r.only.join(', ') })].filter(Boolean).join(' · '))),
            icon('edit', 14),
          ),
        ),
        h(
          'div',
          { class: 'row', style: { padding: '8px 4px' } },
          h('button', { class: 'btn sm', onclick: () => mailRuleModal(null) }, icon('plus', 14), t('mail.rules.add')),
          state.data.mailRules.length > 0 && h('button', { class: 'btn ghost sm', onclick: () => confirm(t('mail.rules.resetConfirm')) && update((d) => (d.mailRules = [])) }, t('mail.rules.reset')),
        ),
      ],
    ),
    h('p', { class: 'meta', style: { margin: '8px 4px 0' } }, t('mail.privacy')),
  );
  c.dataset.section = 'mail';
  return c;
}

/** Global shortcut for the quick entry window; only saved when Windows lets the planner register it. */
function quickKeyControl(s) {
  if (quickStatus === null) {
    quickStatus = { ok: true };
    window.api.quick.status().then((st) => {
      quickStatus = st;
      if (!st.ok && state.view === 'settings') update(() => {});
    });
  }
  const input = h('input', { class: 'input', value: s.quickKey, style: { width: '170px' }, placeholder: 'Ctrl+Alt+Space' });
  const apply = async () => {
    const v = input.value.trim().replace(/\s*\+\s*/g, '+');
    if (!v || v === s.quickKey) return;
    if (await window.api.quick.setKey(v)) {
      quickStatus = { key: v, ok: true };
      update((d) => (d.settings.quickKey = v));
      toast(t('quick.keySaved', { key: v }));
    } else toast(t('quick.keyBusy', { key: v }));
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && apply());
  return h('div', { class: 'row' }, input, h('button', { class: 'btn', onclick: apply }, t('common.save')), h('button', { class: 'btn ghost', onclick: () => window.api.quick.open() }, t('quick.try')));
}

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
      type('bills'),
      type('alerts'),
      type('contracts'),
      type('steam'),
      type('jobs'),
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
          settingRow(t('quick.key'), quickStatus && !quickStatus.ok ? `⚠ ${t('quick.keyBusy', { key: s.quickKey })}` : t('quick.keyHint'), quickKeyControl(s)),
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
      monoCard(),
      mailCard(),
      gamesCard(),
      notificationsCard(),
      card(t('settings.data'), null, h('div', { class: 'list' }, settingRow(t('settings.whereStored'), t('settings.whereStoredHint'), h('button', { class: 'btn', onclick: () => window.api.openDataDir() }, t('settings.openFolder'))))),
      backupsCard(),
    ),
  );
}
