// Parsing letters into inbox items (pure, unit-tested on made-up letters): amounts and dates in German, English,
// Ukrainian and Russian bills, built-in sender rules, application status letters, matching with Monobank
// operations and bills with a due date. Letter bodies are never stored — only the fields found here.
import { CAT } from './finance-calc.js';
import { convert } from './planner-calc.js';
import { matchRule } from './rules.js';

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayDiff = (a, b) => Math.round((new Date(`${a}T12:00`) - new Date(`${b}T12:00`)) / 86400000);
const round2 = (v) => Math.round(v * 100) / 100;

// ---- built-in sender rules (editable in Settings → Mail → Rules) ----

/**
 * { id, domain, action: 'expense' | 'alert' | 'skip', category, pdf?: amount from the PDF first,
 *   skip?: subject words that mean «ignore», only?: words that must be present (else ignore), merchantFromSubject?,
 *   steam?: mark a wishlist game bought }
 */
export const DEFAULT_MAIL_RULES = [
  { id: 'vodafone', domain: 'kundenservice.vodafone.com', action: 'expense', category: CAT.subscriptions, pdf: true },
  { id: 'stripe', domain: 'stripe.com', action: 'expense', category: CAT.subscriptions, merchantFromSubject: true },
  { id: 'anthropic', domain: 'mail.anthropic.com', action: 'expense', category: CAT.subscriptions },
  { id: 'otto', domain: 'otto.de', action: 'expense', category: CAT.shopping, skip: ['SEPA', 'Mandat'] },
  { id: 'otto-payments', domain: 'otto-payments.de', action: 'expense', category: CAT.shopping, skip: ['SEPA', 'Mandat'] },
  { id: 'starlink', domain: 'starlink.com', action: 'alert', only: ['payment failed', 'payment declined', 'unsuccessful', 'fehlgeschlagen', 'abgelehnt', 'past due', 'überfällig'] },
  { id: 'steam', domain: 'steampowered.com', action: 'expense', category: CAT.games, steam: true, only: ['purchase', 'kauf', 'receipt', 'beleg'] },
];

export const domainOf = (address) => String(address || '').toLowerCase().split('@')[1] || '';
const domainMatches = (domain, ruleDomain) => !!domain && (domain === ruleDomain || domain.endsWith(`.${ruleDomain}`));
export const findMailRule = (rules, domain) => (rules || []).find((r) => domainMatches(domain, String(r.domain || '').toLowerCase())) || null;
const hasWord = (text, words) => (words || []).some((w) => text.toLowerCase().includes(String(w).toLowerCase()));

// ---- amounts ----

const CURRENCY = { '€': '€', eur: '€', euro: '€', $: '$', usd: '$', '₴': '₴', uah: '₴', грн: '₴' };
const NUM = String.raw`\d{1,3}(?:[.\s ']\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const CUR = String.raw`€|EUR|Euro|USD|\$|₴|UAH|грн`;
const KEYWORDS = /(?<!\p{L})(rechnungsbetrag|gesamtbetrag|gesamtsumme|endbetrag|zu zahlen|zahlbetrag|amount paid|amount due|total|gesamt|summe|betrag|итого|сума|сумма|разом)/giu;

/** «1.234,56» / «1,234.56» / «12,5» / «1 234» → number. */
export function parseNumber(raw) {
  let s = String(raw).replace(/[\s ']/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? ',' : '.';
    s = s.split(dec === ',' ? '.' : ',').join('').replace(dec, '.');
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const tail = s.length - s.lastIndexOf(sep) - 1;
    s = tail === 3 && s.split(sep).length > 1 && !/^0/.test(s) ? s.split(sep).join('') : s.split(sep).join('.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * The bill's amount: money next to «Rechnungsbetrag / Gesamt / Total / Summe …» wins (the last such one),
 * otherwise the largest amount with a currency. A number right after such a word without a currency is taken in €.
 * Returns { amount, currency } or null.
 */
export function parseAmount(text) {
  const t = String(text || '');
  const found = [];
  const re = new RegExp(String.raw`(?:(${CUR})\s?(${NUM}))|(?:(${NUM})\s?(${CUR}))`, 'gi');
  for (const m of t.matchAll(re)) {
    const cur = CURRENCY[(m[1] || m[4]).toLowerCase()];
    const amount = parseNumber(m[2] || m[3]);
    if (amount != null && amount > 0) found.push({ amount, currency: cur, index: m.index });
  }
  const keyed = [];
  for (const k of t.matchAll(KEYWORDS)) {
    const after = t.slice(k.index + k[0].length, k.index + k[0].length + 80);
    const near = found.find((f) => f.index >= k.index && f.index <= k.index + k[0].length + 80);
    if (near) keyed.push(near);
    else {
      const bare = new RegExp(String.raw`^[\s:.\-–]*(?:inkl\.?\s*MwSt\.?|brutto)?[\s:]*(${NUM})(?!\s*%)`, 'i').exec(after);
      const amount = bare && parseNumber(bare[1]);
      if (amount) keyed.push({ amount, currency: '€', index: k.index });
    }
  }
  const pick = keyed.at(-1) || [...found].sort((a, b) => b.amount - a.amount)[0];
  return pick ? { amount: round2(pick.amount), currency: pick.currency } : null;
}

// ---- dates ----

const MONTHS = {
  jan: 1, januar: 1, january: 1, feb: 2, februar: 2, february: 2, mär: 3, märz: 3, mar: 3, march: 3, apr: 4, april: 4, mai: 5, may: 5,
  jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, november: 11, dez: 12, dezember: 12, dec: 12, december: 12,
};

/** All dates in the text with their position: 29.10.2026, 29.10.26, 2026-10-29, 29. Oktober 2026, Oct 29, 2026. */
export function findDates(text) {
  const t = String(text || '');
  const out = [];
  const push = (y, m, d, index) => {
    const year = y < 100 ? 2000 + y : y;
    const date = new Date(year, m - 1, d);
    if (date.getMonth() === m - 1 && date.getDate() === d && year > 2000 && year < 2100) out.push({ date: isoOf(date), index });
  };
  for (const m of t.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})\b/g)) push(Number(m[3]), Number(m[2]), Number(m[1]), m.index);
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) push(Number(m[1]), Number(m[2]), Number(m[3]), m.index);
  for (const m of t.matchAll(/\b(\d{1,2})\.?\s+([A-Za-zäÄ]{3,9})\.?\s+(\d{4})\b/g)) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo) push(Number(m[3]), mo, Number(m[1]), m.index);
  }
  for (const m of t.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s+(\d{4})\b/g)) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo) push(Number(m[3]), mo, Number(m[2]), m.index);
  }
  return out.sort((a, b) => a.index - b.index);
}

/** The date after «fällig / abgebucht am / due / zahlbar bis …», or null. */
export function parseDueDate(text) {
  const t = String(text || '');
  const dates = findDates(t);
  const keys = /(fällig(?:keit)?|abgebucht am|abbuchung am|wird am|eingezogen am|zahlbar bis|due date|due on|payment due|оплатити до|оплатить до|срок оплаты)/gi;
  let best = null;
  for (const k of t.matchAll(keys)) {
    const d = dates.find((x) => x.index >= k.index && x.index - k.index < 80);
    if (d) best = d.date;
  }
  return best;
}

// ---- merchants, Steam ----

/** «Your receipt from Example Ltd #1234-5678» → «Example Ltd». */
export function merchantFromSubject(subject) {
  const m = /(?:receipt from|quittung von|beleg von|rechnung von)\s+(.+?)(?:\s+#[\w-]+|\s*$)/i.exec(String(subject || ''));
  return m ? m[1].trim() : '';
}

/** A Steam receipt that names a game from the wishlist → that wishlist item. */
export function steamGame(text, wishlist) {
  const t = String(text || '').toLowerCase();
  return (wishlist || []).find((g) => g.name && g.name.length > 2 && t.includes(g.name.toLowerCase())) || null;
}

// ---- applications ----

const LEGAL = /\b(gmbh|mbh|ag|se|kg|ohg|ug|e\.?\s?v\.?|co\.?|&|inc\.?|ltd\.?|llc|haftungsbeschränkt)\b/gi;

/** Company name for matching: lower case, no legal form or punctuation. «DB Netz AG» → «db netz». */
export const companyKey = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(LEGAL, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** The application a letter is about: by the sender domain or the company name in sender, subject or text. */
export function matchApplication(apps, { domain, fromName, subject, text }) {
  const root = String(domain || '').split('.').slice(0, -1).join('').replace(/[^a-z0-9]/g, '');
  const hay = ` ${companyKey(`${fromName} ${subject} ${String(text || '').slice(0, 2000)}`)} `;
  return (
    (apps || []).find((a) => {
      const k = companyKey(a.company);
      if (!k) return false;
      const compact = k.replace(/\s/g, '');
      return (compact.length >= 3 && root.length >= 3 && (root.includes(compact) || compact.includes(root))) || hay.includes(` ${k} `);
    }) || null
  );
}

const CAREER = {
  skip: ['registrierung', 'registrieren', 'konto bestätigen', 'account bestätigen', 'e-mail-adresse bestätigen', 'verify your', 'verifizierung', 'identität', 'passwort', 'password'],
  rejected: ['leider', 'absage', 'nicht berücksichtigen', 'nicht weiter berücksichtigen', 'anderweitig entschieden', 'unfortunately', 'not to proceed'],
  interview: ['einladung', 'vorstellungsgespräch', 'interview', 'kennenlernen', 'termin'],
  sent: ['eingangsbestätigung', 'vielen dank für deine bewerbung', 'vielen dank für ihre bewerbung', 'danke für deine bewerbung', 'danke für ihre bewerbung', 'bewerbung erhalten', 'application received', 'thank you for your application'],
};

/** Status from the subject and the first 2000 characters: 'sent' | 'interview' | 'rejected' | 'skip' | null. */
export function classifyCareer(subject, text) {
  const t = `${subject}\n${String(text || '').slice(0, 2000)}`.toLowerCase();
  for (const kind of ['skip', 'rejected', 'interview', 'sent']) if (CAREER[kind].some((w) => t.includes(w))) return kind;
  return null;
}

const looksLikeApplication = (t) => /bewerb|application|ausbildung|stelle|position|vacancy|vakanz/i.test(t);

// ---- links, Grok answers ----

/** Opens the letter in Gmail by its Message-ID. */
export const gmailLink = (messageId) => `https://mail.google.com/mail/u/0/#search/rfc822msgid%3A${encodeURIComponent(messageId)}`;

const GROK_CURRENCY = { EUR: '€', UAH: '₴', USD: '$' };
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Grok's strict JSON (possibly wrapped in a code fence) → checked fields, or null when it isn't usable. */
export function parseGrokAnswer(text, categories) {
  const m = /\{[\s\S]*\}/.exec(String(text || ''));
  if (!m) return null;
  let j;
  try {
    j = JSON.parse(m[0]);
  } catch {
    return null;
  }
  if (typeof j !== 'object' || j === null || typeof j.isFinancial !== 'boolean') return null;
  return {
    isFinancial: j.isFinancial,
    kind: ['expense', 'income', 'alert'].includes(j.kind) ? j.kind : null,
    amount: typeof j.amount === 'number' && j.amount > 0 && j.amount < 1e7 ? round2(j.amount) : null,
    currency: GROK_CURRENCY[j.currency] || null,
    date: isDate(j.date) ? j.date : null,
    merchant: typeof j.merchant === 'string' ? j.merchant.slice(0, 80) : null,
    category: categories.includes(j.category) ? j.category : null,
    dueDate: isDate(j.dueDate) ? j.dueDate : null,
  };
}

// ---- matching with bank operations ----

/**
 * The Monobank (or any) operation this bill is about: the same amount in the original currency, or within 2 % after
 * conversion, at most 2 days apart.
 */
export function findMatchingEntry(finance, { origAmount, origCurrency, amount, date }) {
  return (
    (finance || []).find((e) => {
      if (e.type !== 'expense' || !e.date || Math.abs(dayDiff(e.date, date)) > 2) return false;
      if (e.origCurrency && e.origCurrency === origCurrency && Math.abs(Number(e.origAmount) - origAmount) < 0.005) return true;
      return amount > 0 && Math.abs(Number(e.amount) - amount) <= amount * 0.02;
    }) || null
  );
}

/** A bill counts as paid once an expense of about the same amount (±2 %) appears within 5 days of its due date. */
export function billPaidBy(bill, finance) {
  return (finance || []).find((e) => e.type === 'expense' && e.date && Math.abs(dayDiff(e.date, bill.dueDate)) <= 5 && Math.abs(Number(e.amount) - bill.amount) <= bill.amount * 0.02) || null;
}

// ---- one letter → inbox items ----

/**
 * letter: { messageId, from, fromName, subject, date (ISO), text, pdf }.
 * ctx: { rules (user rules), mailRules, apps, finance, inbox, wishlist, rates, main, today, makeId }.
 * Returns { items: inbox items, bills, needsGrok } — needsGrok: nothing known matched, the caller may ask Grok.
 */
export function processLetter(letter, ctx) {
  const ref = `mail:${letter.messageId}`;
  const none = { items: [], bills: [], needsGrok: false };
  if (!letter.messageId || (ctx.inbox || []).some((x) => x.ref === ref)) return none;
  const domain = domainOf(letter.from);
  const date = isoOf(new Date(letter.date));
  const text = `${letter.text || ''}`;
  const all = `${letter.subject}\n${text}\n${letter.pdf || ''}`;
  const base = { id: ctx.makeId(), source: 'mail', ref, messageId: letter.messageId, title: letter.subject || letter.fromName || letter.from, subject: letter.subject, sender: letter.from, domain, date, status: 'new', createdAt: ctx.today, link: gmailLink(letter.messageId) };
  const mailRule = findMailRule(ctx.mailRules, domain);
  const userRule = matchRule(ctx.rules, { sender: letter.from, domain });
  if (userRule?.kind === 'skip') return none;

  // Applications: not from a known bill sender, about a Bewerbung or a company we applied to.
  if (!mailRule) {
    const status = classifyCareer(letter.subject, text);
    if (status === 'skip') return none;
    const app = matchApplication(ctx.apps, { domain, fromName: letter.fromName, subject: letter.subject, text });
    if (status && (app || looksLikeApplication(all))) {
      return { items: [{ ...base, kind: 'career', career: { status, appId: app?.id || null, company: app?.company || letter.fromName || domain } }], bills: [], needsGrok: false };
    }
  }

  if (mailRule) {
    if (mailRule.action === 'skip' || hasWord(letter.subject, mailRule.skip)) return none;
    if (mailRule.only && !hasWord(all, mailRule.only)) return none;
    if (mailRule.action === 'alert') return { items: [{ ...base, kind: 'alert', title: letter.subject || domain }], bills: [], needsGrok: false };
  }

  const money = parseAmount(mailRule?.pdf ? `${letter.pdf || ''}\n${text}` : `${text}\n${letter.pdf || ''}`);
  const merchant = (mailRule?.merchantFromSubject && merchantFromSubject(letter.subject)) || letter.fromName || domain;
  if (!money) return { items: mailRule ? [{ ...base, kind: 'unparsed', title: letter.subject || merchant }] : [], bills: [], needsGrok: !mailRule, unparsed: { ...base, kind: 'unparsed' } };
  return expenseFromMoney(base, { money, merchant, dueDate: parseDueDate(all), category: userRule?.category || mailRule?.category || null, steam: mailRule?.steam ? steamGame(all, ctx.wishlist)?.id ?? null : null }, ctx);
}

/** Inbox item (and a bill when the due date is ahead) for a found amount; also used for Grok answers. */
export function expenseFromMoney(base, { money, merchant, dueDate, category, steam = null, kind = 'expense', date }, ctx) {
  const cur = money.currency || '€';
  const amount = round2(convert(money.amount, cur, ctx.main, ctx.rates));
  // A debit date that has passed is the operation date; a due date ahead stays a bill until paid.
  const when = date || (dueDate && dueDate <= ctx.today ? dueDate : base.date);
  const item = { ...base, kind, title: merchant || base.title, merchant, amount, currency: ctx.main, origAmount: money.amount, origCurrency: cur, date: when, dueDate: dueDate || null, category, suggested: category };
  if (steam != null) item.steamId = steam;
  const match = kind === 'expense' ? findMatchingEntry(ctx.finance, { origAmount: money.amount, origCurrency: cur, amount, date: item.date }) : null;
  if (match) item.match = match.id;
  const bills = kind === 'expense' && dueDate && dueDate > ctx.today && !match ? [{ id: ctx.makeId(), title: merchant || base.title, amount, dueDate, paid: false, ref: base.ref, category }] : [];
  return { items: [item], bills, needsGrok: false };
}
