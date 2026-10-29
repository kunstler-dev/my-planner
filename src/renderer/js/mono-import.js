// Monobank statement → finance entries and inbox items (pure, unit-tested). Rules win over MCC; transfers, cash and
// incoming money without a rule go to the inbox; repeats are dropped by the bank's operation id (extId); an
// operation on hold is updated when the final one arrives. Also: statement windows and jar → goal contributions.
import { convert } from './planner-calc.js';
import { CAT } from './finance-calc.js';
import { categoryForMcc, isTransferMcc } from './mcc.js';
import { matchRule } from './rules.js';

/** ISO 4217 codes the planner can convert. */
export const CURRENCY = { 980: '₴', 978: '€', 840: '$' };
// One statement request covers at most 31 days + 1 hour; the first sync takes the last 31 days.
export const MAX_SPAN = 2682000;
export const FIRST_DAYS = 31;

const pad = (n) => String(n).padStart(2, '0');
const localDate = (sec) => {
  const d = new Date(sec * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const round2 = (v) => Math.round(v * 100) / 100;

/** Time windows (unix seconds, oldest first) that cover from..to, each within Monobank's limit. */
export function statementWindows(from, to, span = MAX_SPAN) {
  const out = [];
  for (let a = from; a < to; a += span) out.push([a, Math.min(to, a + span)]);
  return out;
}

/** Where the next sync of an account starts: right after its newest operation, or 31 days back. */
export function nextFrom(lastTime, nowSec) {
  return lastTime ? lastTime + 1 : nowSec - FIRST_DAYS * 86400;
}

/**
 * items: StatementItem[] of one Monobank account. ctx: { accountId (planner account), currency (symbol of the
 * Monobank account), main, rates, rules, finance, inbox, makeId, today }.
 * Returns { add: entries, update: [{ id, patch }], inbox: items, last: newest operation time }.
 */
export function importStatement(items, ctx) {
  const add = [];
  const update = [];
  const inbox = [];
  const byExt = new Map((ctx.finance || []).filter((e) => e.extId).map((e) => [e.extId, e]));
  const inInbox = new Set((ctx.inbox || []).map((x) => x.ref).filter(Boolean));
  let last = 0;
  for (const it of [...items].sort((a, b) => a.time - b.time)) {
    last = Math.max(last, Number(it.time) || 0);
    const signed = (Number(it.amount) || 0) / 100;
    const orig = Math.abs(signed);
    const amount = round2(convert(orig, ctx.currency, ctx.main, ctx.rates));
    const date = localDate(it.time);
    const existing = byExt.get(it.id);
    if (existing) {
      if (existing.hold && !it.hold) update.push({ id: existing.id, patch: { amount, origAmount: orig, date, hold: false } });
      continue;
    }
    if (inInbox.has(it.id)) continue;
    const desc = String(it.description || '').trim();
    const base = { source: 'mono', accountId: ctx.accountId, origAmount: orig, origCurrency: ctx.currency, hold: !!it.hold, desc };
    const toInbox = (kind, category = null) =>
      inbox.push({ id: ctx.makeId(), ...base, kind, title: desc, amount, currency: ctx.main, date, category, ref: it.id, status: 'new', createdAt: ctx.today });
    const rule = matchRule(ctx.rules, { desc });
    if (rule?.kind === 'skip') {
      // Remembered as dismissed, so it isn't asked about again.
      inbox.push({ id: ctx.makeId(), ...base, kind: signed < 0 ? 'expense' : 'income', title: desc, amount, currency: ctx.main, date, category: null, ref: it.id, status: 'dismissed', createdAt: ctx.today, resolvedAt: ctx.today });
      continue;
    }
    if (rule?.category) {
      const type = rule.kind === 'income' || rule.kind === 'expense' ? rule.kind : signed < 0 ? 'expense' : 'income';
      add.push({ id: ctx.makeId(), type, amount, category: rule.category, date, note: desc, extId: it.id, ...base });
      continue;
    }
    if (isTransferMcc(it.mcc)) toInbox('transfer');
    else if (signed > 0) toInbox('income', CAT.other);
    else add.push({ id: ctx.makeId(), type: 'expense', amount, category: categoryForMcc(it.mcc), date, note: desc, extId: it.id, ...base });
  }
  return { add, update, inbox, last };
}

/**
 * A goal linked to a jar follows the jar balance: the difference to what the goal has saved becomes a contribution
 * (in the main currency). Returns the contribution or null.
 */
export function jarContribution(goal, jarBalanceMain, date) {
  const saved = (goal.contributions || []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const delta = round2(jarBalanceMain - saved);
  return Math.abs(delta) >= 0.01 ? { amount: delta, date, auto: true } : null;
}
