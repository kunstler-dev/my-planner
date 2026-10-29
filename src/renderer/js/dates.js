// Dates are local 'YYYY-MM-DD' strings; months are 'YYYY-MM'. Names of months and days follow the interface language.
import { locale } from './i18n.js';

const pad = (n) => String(n).padStart(2, '0');

export function iso(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const today = () => iso();
export const monthKey = (dateStr) => dateStr.slice(0, 7);
export const thisMonth = () => monthKey(today());

export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return iso(new Date(y, m - 1, d + delta));
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);
const dateOf = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
};

/** Monday-first short weekday names in the interface language. */
export function weekdays() {
  return Array.from({ length: 7 }, (_, i) => cap(new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: 'short' }).replace('.', '')));
}

export function monthTitle(key) {
  const d = dateOf(`${key}-01`);
  return `${cap(d.toLocaleDateString(locale(), { month: 'long' }))} ${d.getFullYear()}`;
}
export const monthShort = (key) => dateOf(`${key}-01`).toLocaleDateString(locale(), { month: 'short' }).replace('.', '');

/** «29 окт.» / «29. Okt.» for the date column of one-line rows. */
export const shortDate = (dateStr) => dateOf(dateStr).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });

export const prettyDate = (dateStr) => dateOf(dateStr).toLocaleDateString(locale(), { day: 'numeric', month: 'long' });

export const longToday = () => cap(new Date().toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }));

/** Date and time for timestamps (fetchedAt, posts): «3 окт., 14:05». */
export const dateTime = (ms) => new Date(ms).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Monday-first weekday index 0..6. */
export const weekdayIdx = (d) => (d.getDay() + 6) % 7;
