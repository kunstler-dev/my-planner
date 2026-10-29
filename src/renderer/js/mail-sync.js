// Gmail check through the shared scheduler (interval from settings) and the «Check now» button: new letters are
// parsed into inbox items and bills; unknown ones go to Grok when the user turned that on. Bills are marked paid
// when a matching expense appears.
import { state, update } from './state.js';
import { t } from './i18n.js';
import { toast, uid } from './ui.js';
import { today } from './dates.js';
import { register } from './scheduler.js';
import { MINUTE } from './notify-calc.js';
import { categories } from './views/finance.js';
import { DEFAULT_MAIL_RULES, processLetter, parseGrokAnswer, expenseFromMoney, billPaidBy } from './mail-parse.js';

let running = false;
export const isMailChecking = () => running;
export const mailRules = () => (state.data.mailRules.length ? state.data.mailRules : DEFAULT_MAIL_RULES);
export const mailErrorText = (code) => t(`mail.error.${['auth', 'network', 'no_password', 'bad_address', 'imap', 'busy'].includes(code) ? code : 'other'}`);

/** Grok reads an unknown letter (sender, subject, date, first 3000 characters) and answers in strict JSON. */
async function askGrok(letter, base, ctx) {
  const cats = categories('expense');
  const res = await window.api.mail.grok({ from: letter.from, subject: letter.subject, date: letter.date, text: `${letter.text}\n${letter.pdf || ''}`, categories: cats, model: state.data.settings.grokModel });
  const a = res.ok ? parseGrokAnswer(res.text, cats) : null;
  if (!a) return null;
  if (!a.isFinancial) return { items: [], bills: [] };
  if (a.kind === 'alert') return { items: [{ ...base, kind: 'alert' }], bills: [] };
  if (!a.amount) return null;
  return expenseFromMoney(base, { money: { amount: a.amount, currency: a.currency || '€' }, merchant: a.merchant, dueDate: a.dueDate, category: a.category, kind: a.kind === 'income' ? 'income' : 'expense', date: a.date }, ctx);
}

export async function checkMail({ silent = true } = {}) {
  const m = state.data.settings.mail;
  if (running || !m.address) return;
  running = true;
  update(() => {});
  try {
    const prev = state.data.sync.mail || {};
    const senders = [...new Set(mailRules().map((r) => r.domain).concat(state.data.rules.filter((r) => r.field === 'domain').map((r) => r.value)))];
    const res = await window.api.mail.fetch({ user: m.address, lastUid: prev.lastUid || 0, uidValidity: prev.uidValidity || '', senders });
    if (!res.ok) {
      update((d) => (d.sync.mail = { ...prev, error: res.error, lastTry: Date.now() }));
      if (!silent) toast(mailErrorText(res.error));
      return;
    }
    const useGrok = m.grok && state.data.settings.grokMode === 'api';
    let added = 0;
    for (const letter of res.letters) {
      const ctx = { rules: state.data.rules, mailRules: mailRules(), apps: state.data.career.applications, finance: state.data.finance, inbox: state.data.inbox, wishlist: state.data.wishlist, rates: state.data.rates, main: state.data.settings.currency, today: today(), makeId: uid };
      let out = processLetter(letter, ctx);
      if (out.needsGrok) out = (useGrok && (await askGrok(letter, out.unparsed, ctx))) || { items: [out.unparsed], bills: [] };
      if (!out.items.length && !out.bills.length) continue;
      added += out.items.length;
      update((d) => {
        d.inbox.push(...out.items);
        d.bills.push(...out.bills);
      });
    }
    update((d) => (d.sync.mail = { uidValidity: res.uidValidity, lastUid: res.lastUid, lastCheck: Date.now(), error: '' }));
    if (!silent) toast(added ? t('mail.found', { n: added }) : t('mail.nothingNew'));
  } finally {
    running = false;
    update(() => {});
  }
}

/** Unpaid bills get paid by a matching expense (bank import or typed in). */
export function settleBills() {
  const open = state.data.bills.filter((b) => !b.paid);
  const paid = open.map((b) => [b.id, billPaidBy(b, state.data.finance)]).filter(([, e]) => e);
  if (!paid.length) return;
  update((d) => {
    for (const [id, e] of paid) Object.assign(d.bills.find((b) => b.id === id), { paid: true, paidBy: e.id, paidAt: today() });
  });
}

/** (Re)registers the mail task with the interval from settings; off when mail is disabled. */
export function scheduleMail() {
  const m = state.data.settings.mail;
  register('mail-check', (m.enabled && m.address ? m.interval : 24 * 60) * MINUTE, () => (state.data.settings.mail.enabled ? checkMail() : null));
  register('bills', 30 * MINUTE, settleBills);
}
