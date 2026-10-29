// Subject words that make the server-side Gmail search pick up a letter (bills, receipts, applications).
// Listed as an explicit exception in the «no Cyrillic in src/main» test: these are search terms, not interface text.
const SUBJECT_KEYWORDS = [
  'Rechnung',
  'Receipt',
  'Quittung',
  'Invoice',
  'Beleg',
  'Zahlung',
  'Bestellung',
  'чек',
  'оплата',
  'квитанция',
  'Bewerbung',
  'Einladung',
  'Vorstellungsgespräch',
  'Absage',
];

module.exports = { SUBJECT_KEYWORDS };
