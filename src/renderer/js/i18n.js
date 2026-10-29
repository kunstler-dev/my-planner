// Interface language: t(key, params) with {name} placeholders and plural forms through Intl.PluralRules.
// Dictionaries are ES modules (no JSON fetching, so the CSP stays strict). A plural entry is an object with the
// forms of its language: { one, few, many } in Russian and Ukrainian, { one, other } in German; `n` picks the form.
import ru from './locales/ru.js';
import uk from './locales/uk.js';
import de from './locales/de.js';

export const LANGS = ['ru', 'uk', 'de'];
export const DICTS = { ru, uk, de };
const LOCALES = { ru: 'ru-RU', uk: 'uk-UA', de: 'de-DE' };

let lang = 'ru';
const plurals = {};

export function setLang(next) {
  lang = LANGS.includes(next) ? next : 'ru';
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}
export const getLang = () => lang;
/** BCP 47 locale for numbers and dates: ru-RU, uk-UA or de-DE. */
export const locale = () => LOCALES[lang];

function pluralForm(entry, n, lng) {
  plurals[lng] ||= new Intl.PluralRules(LOCALES[lng]);
  const form = plurals[lng].select(Number(n) || 0);
  return entry[form] ?? entry.other ?? entry.many ?? entry.one ?? '';
}

/** Translated string for `key` (falls back to Russian, then to the key itself). */
export function t(key, params = {}, lng = lang) {
  let s = DICTS[lng]?.[key] ?? DICTS.ru[key];
  let used = lng;
  if (s == null) return key;
  if (DICTS[lng]?.[key] == null) used = 'ru';
  if (typeof s === 'object') s = pluralForm(s, params.n, used);
  return String(s).replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
}

/** True if the key exists in the dictionary (used for optional translations such as standard categories). */
export const has = (key) => DICTS.ru[key] != null;

/** Number in the interface language (1 234,5 · 1.234,5). */
export const num = (n, opts = { maximumFractionDigits: 2 }) => (Number(n) || 0).toLocaleString(locale(), opts);

/** All main-process strings (tray, notifications, dialogs) in the current language. */
export function mainStrings() {
  return Object.fromEntries(Object.keys(DICTS.ru).filter((k) => k.startsWith('main.')).map((k) => [k, t(k)]));
}
