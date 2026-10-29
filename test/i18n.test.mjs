// Interface languages: the three dictionaries match, every used key exists, no Cyrillic left in screens and the
// main process, plural forms and number formats per language.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DICTS, LANGS, t, setLang, mainStrings } from '../src/renderer/js/i18n.js';
import { catLabel, catValue, accountName, accountNameValue, docTitle, rateSource } from '../src/renderer/js/labels.js';
import { CATEGORY_KEYS, DEFAULT_CATEGORIES } from '../src/renderer/js/finance-calc.js';
import { dotaMedal, MEDAL_KEYS } from '../src/renderer/js/games-calc.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = (dir) =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []));
const CYRILLIC = /\p{Script=Cyrillic}/u;
const placeholders = (v) => [...new Set((typeof v === 'object' ? Object.values(v).join(' ') : v).match(/\{\w+\}/g) || [])].sort();

test('every key exists in all three languages, with the same placeholders', () => {
  const keys = Object.keys(DICTS.ru);
  for (const lang of ['uk', 'de']) {
    const dict = DICTS[lang];
    assert.deepEqual(
      keys.filter((k) => !(k in dict)),
      [],
      `missing in ${lang}`,
    );
    assert.deepEqual(
      Object.keys(dict).filter((k) => !(k in DICTS.ru)),
      [],
      `extra in ${lang}`,
    );
    for (const k of keys) assert.deepEqual(placeholders(dict[k]), placeholders(DICTS.ru[k]), `${lang}: placeholders of ${k}`);
  }
});

test('plural entries have the forms of their language', () => {
  const forms = { ru: ['few', 'many', 'one', 'other'], uk: ['few', 'many', 'one', 'other'], de: ['one', 'other'] };
  for (const lang of LANGS) {
    for (const [k, v] of Object.entries(DICTS[lang])) {
      if (typeof v !== 'object') continue;
      assert.deepEqual(Object.keys(v).sort(), forms[lang], `${lang}: ${k}`);
      assert.equal(typeof DICTS.ru[k], 'object', `${k} is plural in ru too`);
    }
  }
});

test('every key used in the code is in the dictionary', () => {
  const used = new Set();
  for (const f of files('src/renderer/js')) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([\w.]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/\bt\(\s*\w+(?:\.\w+)* === '\w+' \? '([\w.]+)' : '([\w.]+)'/g)) used.add(m[1]).add(m[2]);
  }
  for (const m of fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8').matchAll(/str\('([\w.]+)'/g)) used.add(m[1]);
  assert.ok(used.size > 300);
  assert.deepEqual(
    [...used].filter((k) => !(k in DICTS.ru)),
    [],
  );
});

test('no Cyrillic in screens and the main process outside the dictionaries', () => {
  // Explicit exceptions: none yet (keywords for parsing e-mails will be listed here).
  const allowed = [];
  const offenders = [];
  for (const f of [...files('src/renderer/js/views'), ...files('src/main')]) {
    fs.readFileSync(path.join(root, f), 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (CYRILLIC.test(line) && !allowed.some((a) => line.includes(a))) offenders.push(`${f}:${i + 1}: ${line.trim().slice(0, 80)}`);
      });
  }
  assert.deepEqual(offenders, []);
});

test('t(): placeholders, plural forms and fallback', () => {
  setLang('ru');
  assert.equal(t('tasks.streak', { n: 1 }), '🔥 1 день подряд');
  assert.equal(t('tasks.streak', { n: 3 }), '🔥 3 дня подряд');
  assert.equal(t('tasks.streak', { n: 11 }), '🔥 11 дней подряд');
  assert.equal(t('tasks.streak', { n: 21 }), '🔥 21 день подряд');
  setLang('uk');
  assert.equal(t('tasks.streak', { n: 2 }), '🔥 2 дні поспіль');
  assert.equal(t('tasks.streak', { n: 5 }), '🔥 5 днів поспіль');
  setLang('de');
  assert.equal(t('tasks.streak', { n: 1 }), '🔥 1 Tag in Folge');
  assert.equal(t('tasks.streak', { n: 4 }), '🔥 4 Tage in Folge');
  assert.equal(t('common.nOfM', { n: 2, m: 5 }), '2 von 5');
  assert.equal(t('no.such.key'), 'no.such.key');
  setLang('xx');
  assert.equal(t('nav.home'), 'Главная');
});

test('main-process strings follow the language', () => {
  setLang('de');
  const s = mainStrings();
  assert.equal(s['main.tray.quit'], 'Beenden');
  assert.ok(Object.keys(s).every((k) => k.startsWith('main.')));
  setLang('ru');
});

test('numbers in the interface language', () => {
  const de = (1234.56).toLocaleString('de-DE', { maximumFractionDigits: 2 });
  assert.equal(`${de} €`, '1.234,56 €');
});

test('standard categories are shown translated and stored in Russian', () => {
  for (const c of [...DEFAULT_CATEGORIES.income, ...DEFAULT_CATEGORIES.expense]) assert.ok(CATEGORY_KEYS[c], `${c} has a key`);
  setLang('de');
  assert.equal(catLabel('Еда'), 'Essen');
  assert.equal(catLabel('Мои траты'), 'Мои траты', 'own categories as written');
  assert.equal(catValue('Essen'), 'Еда');
  assert.equal(catValue('їжа'), 'Еда', 'any language');
  assert.equal(catValue('Еда'), 'Еда');
  assert.equal(catValue(' Sushi '), 'Sushi');
  setLang('ru');
});

test('default accounts and documents are translated until renamed', () => {
  setLang('uk');
  assert.equal(accountName({ id: 'ua', name: '' }), 'Українська картка');
  assert.equal(accountName({ id: 'ua', name: 'Украинская карта' }), 'Українська картка', 'name written by v3');
  assert.equal(accountName({ id: 'ua', name: 'Monobank' }), 'Monobank');
  assert.equal(accountNameValue({ id: 'ua', name: '' }, 'Українська картка'), '', 'untouched name stays as stored');
  assert.equal(accountNameValue({ id: 'ua', name: '' }, 'Mono'), 'Mono');
  assert.equal(docTitle({ id: 'doc3', title: 'Sprachzertifikat (B1/B2)' }), 'Sprachzertifikat (B1/B2)');
  assert.equal(docTitle({ id: 'doc6', title: 'Профиль на Arbeitsagentur / Azubiyo / Indeed' }), 'Профіль на Arbeitsagentur / Azubiyo / Indeed');
  assert.equal(docTitle({ id: 'doc6', title: 'Мой профиль' }), 'Мой профиль');
  assert.equal(rateSource({ source: 'вручную' }), 'manual');
  assert.equal(rateSource({ source: 'nbu' }), 'nbu');
  setLang('ru');
});

test('Dota medals in every language', () => {
  for (const lang of LANGS) {
    setLang(lang);
    const names = MEDAL_KEYS.map((k) => t(`medal.${k}`));
    assert.ok(dotaMedal(3100, names).endsWith(' 1'));
    assert.equal(dotaMedal(6000, names), t('medal.immortal'));
  }
  setLang('ru');
});
