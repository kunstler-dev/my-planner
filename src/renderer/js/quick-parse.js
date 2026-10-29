// Quick entry line → finance entry (pure, unit-tested): «кофе 3.5», «3,5 кофе», «+1200 зарплата», «такси 12 вчера»,
// «Kaffee 4,20 gestern», «taxi 12 25.10». A leading «+» means income. Category: the user's rules first, then
// keywords in Russian, Ukrainian, German and English, else «Other».
import { CAT } from './finance-calc.js';
import { matchRule, normalizeKey } from './rules.js';

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shift = (today, n) => {
  const [y, m, d] = today.split('-').map(Number);
  return iso(new Date(y, m - 1, d + n));
};

const DAY_WORDS = {
  0: ['сегодня', 'сьогодні', 'heute', 'today'],
  '-1': ['вчера', 'вчора', 'gestern', 'yesterday'],
  '-2': ['позавчера', 'позавчора', 'vorgestern'],
};

// Word stems → stored category. Matched against the start of each word.
const KEYWORDS = [
  [CAT.food, ['кофе', 'кава', 'каву', 'еда', 'їжа', 'продукт', 'обед', 'обід', 'ужин', 'вечер', 'сніданок', 'завтрак', 'пицц', 'піц', 'шаурм', 'бургер', 'суши', 'kaffee', 'coffee', 'essen', 'lunch', 'dinner', 'rewe', 'lidl', 'aldi', 'edeka', 'silpo', 'сільпо', 'атб', 'döner', 'doner', 'bäcker', 'pizza']],
  [CAT.transport, ['такси', 'таксі', 'taxi', 'uber', 'bolt', 'uklon', 'метро', 'автобус', 'bus', 'bahn', 'zug', 'ticket', 'бензин', 'tank', 'парковк', 'parken', 'deutschlandticket']],
  [CAT.subscriptions, ['spotify', 'netflix', 'youtube', 'telegram', 'интернет', 'інтернет', 'internet', 'телефон', 'handy', 'vodafone', 'подписк', 'підписк', 'abo', 'icloud', 'chatgpt', 'claude']],
  [CAT.games, ['steam', 'игр', 'гра', 'ігр', 'spiel', 'game', 'dota', 'faceit', 'psn', 'xbox']],
  [CAT.clothes, ['одежд', 'одяг', 'кросс', 'куртк', 'kleid', 'schuh', 'jacke', 'zara', 'h&m', 'hm']],
  [CAT.health, ['аптек', 'лекарств', 'ліки', 'apotheke', 'arzt', 'врач', 'лікар', 'pharmacy']],
  [CAT.fun, ['кино', 'кіно', 'kino', 'cinema', 'бар', 'bar', 'клуб', 'club', 'концерт', 'konzert']],
  [CAT.education, ['курс', 'kurs', 'книг', 'buch', 'book', 'udemy', 'школ', 'schule', 'deutschkurs']],
  [CAT.housing, ['аренд', 'оренд', 'квартир', 'miete', 'wohnung', 'rent', 'strom', 'свет']],
  [CAT.shopping, ['amazon', 'otto', 'покупк', 'einkauf']],
];
const INCOME_KEYWORDS = [
  [CAT.salary, ['зарплат', 'зп', 'gehalt', 'lohn', 'salary']],
  [CAT.freelance, ['фриланс', 'freelance', 'заказ', 'замовлен', 'auftrag']],
  [CAT.gift, ['подарок', 'подарун', 'geschenk', 'gift']],
  [CAT.benefits, ['kindergeld', 'пособ', 'допомог', 'bafög', 'bafoeg']],
  [CAT.sales, ['продаж', 'verkauf', 'sale']],
];

const findCategory = (words, table) => {
  for (const [cat, stems] of table) if (words.some((w) => stems.some((s) => w.startsWith(s)))) return cat;
  return null;
};

/**
 * Returns { type, amount, category, date, note } or null when the line has no amount.
 * ctx: { today, rules }.
 */
export function parseQuick(text, { today, rules = [] }) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  let date = today;
  let amount = null;
  let income = false;
  const rest = [];
  for (const token of raw.split(/\s+/)) {
    const low = token.toLowerCase();
    const day = Object.entries(DAY_WORDS).find(([, words]) => words.includes(low));
    if (day) {
      date = shift(today, Number(day[0]));
      continue;
    }
    const dm = /^(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?$/.exec(token);
    if (dm && amount != null) {
      const y = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : Number(today.slice(0, 4));
      const d = new Date(y, Number(dm[2]) - 1, Number(dm[1]));
      if (d.getDate() === Number(dm[1])) {
        date = iso(d);
        continue;
      }
    }
    const num = /^([+\-−]?)(\d+(?:[.,]\d{1,2})?)(€|₴|\$|eur|грн)?$/i.exec(token);
    if (num && amount == null) {
      amount = Number(num[2].replace(',', '.'));
      income = num[1] === '+';
      continue;
    }
    rest.push(token);
  }
  if (!(amount > 0)) return null;
  const note = rest.join(' ');
  const words = rest.map((w) => w.toLowerCase());
  const rule = matchRule(rules, { desc: note });
  const type = income || rule?.kind === 'income' ? 'income' : 'expense';
  const category = rule?.category || findCategory(words, type === 'income' ? INCOME_KEYWORDS : KEYWORDS) || CAT.other;
  return { type, amount: Math.round(amount * 100) / 100, category, date, note: normalizeKey(note) === '' ? '' : note };
}
