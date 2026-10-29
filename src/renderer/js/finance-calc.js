// Pure finance math (unit-tested). Entry: { id, type: 'income'|'expense', amount, category, date, note }.

export const DEFAULT_CATEGORIES = {
  income: ['Зарплата', 'Фриланс', 'Реклама в канале', 'Продажи', 'Kindergeld / пособия', 'Подарок', 'Другое'],
  expense: ['Еда', 'Транспорт', 'Жильё', 'Связь и подписки', 'Реклама канала', 'Развлечения', 'Игры', 'Учёба и курсы', 'Одежда', 'Здоровье', 'Другое'],
};

// Standard categories are stored by their Russian name (the key for budgets, rules and MCC) and shown translated.
export const CATEGORY_KEYS = {
  Зарплата: 'salary',
  Фриланс: 'freelance',
  'Реклама в канале': 'adsIncome',
  Продажи: 'sales',
  'Kindergeld / пособия': 'benefits',
  Подарок: 'gift',
  Еда: 'food',
  Транспорт: 'transport',
  Жильё: 'housing',
  'Связь и подписки': 'subscriptions',
  'Реклама канала': 'adsExpense',
  Развлечения: 'fun',
  Игры: 'games',
  'Учёба и курсы': 'education',
  Одежда: 'clothes',
  Здоровье: 'health',
  Другое: 'other',
};

/** Stored value of a standard category by its key: CAT.other → 'Другое'. */
export const CAT = Object.fromEntries(Object.entries(CATEGORY_KEYS).map(([name, key]) => [key, name]));

const num = (v) => Number(v) || 0;

export function totals(entries) {
  let income = 0;
  let expense = 0;
  for (const e of entries) {
    if (e.type === 'income') income += num(e.amount);
    else expense += num(e.amount);
  }
  return { income, expense, net: income - expense };
}

export const inMonth = (entries, key) => entries.filter((e) => e.date?.startsWith(key));

/** [{ category, sum, share }] sorted by sum, share of the type's total (0..1). */
export function byCategory(entries, type) {
  const map = new Map();
  let total = 0;
  for (const e of entries) {
    if (e.type !== type) continue;
    const c = e.category || 'Другое';
    map.set(c, (map.get(c) || 0) + num(e.amount));
    total += num(e.amount);
  }
  return [...map]
    .map(([category, sum]) => ({ category, sum, share: total ? sum / total : 0 }))
    .sort((a, b) => b.sum - a.sum);
}

/** Totals for each month key in `keys` (oldest first). */
export function monthlySeries(entries, keys) {
  return keys.map((key) => ({ key, ...totals(inMonth(entries, key)) }));
}

/** Average daily expense in a month, counting days up to `todayStr` for the current month. */
export function dailyAverage(entries, key, todayStr) {
  const [y, m] = key.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const days = todayStr.startsWith(key) ? Number(todayStr.slice(8, 10)) : daysInMonth;
  return totals(inMonth(entries, key)).expense / Math.max(1, days);
}

const CSV_RU = { headers: ['Дата', 'Тип', 'Категория', 'Сумма', 'Комментарий'], income: 'Доход', expense: 'Расход', category: (c) => c };

/** Semicolon CSV for Excel; `labels` gives headers, type names and category names in the interface language. */
export function toCSV(entries, labels = {}) {
  const L = { ...CSV_RU, ...labels };
  const esc = (v) => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [L.headers];
  for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([e.date, e.type === 'income' ? L.income : L.expense, L.category(e.category), String(num(e.amount)).replace('.', ','), e.note]);
  }
  return rows.map((r) => r.map(esc).join(';')).join('\n');
}
