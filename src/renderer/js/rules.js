// User rules for imported operations and e-mails: «always this category for this description / sender / domain».
// Rules win over MCC codes. Rule: { id, field: 'desc' | 'sender' | 'domain', value, category, kind?, createdAt }
// where kind 'skip' means «don't import». Unit-tested.

/** Bank descriptions differ only in case and spaces between operations of the same shop. */
export const normalizeKey = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** First rule that matches the operation's description, sender address or sender domain. */
export function matchRule(rules, { desc, sender, domain } = {}) {
  const keys = { desc: normalizeKey(desc), sender: normalizeKey(sender), domain: normalizeKey(domain) };
  return (rules || []).find((r) => keys[r.field] && normalizeKey(r.value) === keys[r.field]) || null;
}

/** Adds a rule or replaces the one for the same field and value. */
export function upsertRule(rules, rule) {
  const value = normalizeKey(rule.value);
  if (!value) return rules || [];
  const rest = (rules || []).filter((r) => !(r.field === rule.field && normalizeKey(r.value) === value));
  return [...rest, { ...rule, value }];
}
