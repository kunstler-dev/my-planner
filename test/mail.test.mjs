// Mail: made-up letters only (no real e-mails in the repository). Amounts, dates, sender rules, application
// letters, matching with bank operations, bills, Grok answers, the IMAP search and MIME + PDF parsing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  parseNumber,
  parseAmount,
  findDates,
  parseDueDate,
  merchantFromSubject,
  classifyCareer,
  matchApplication,
  companyKey,
  processLetter,
  findMatchingEntry,
  billPaidBy,
  parseGrokAnswer,
  gmailLink,
  DEFAULT_MAIL_RULES,
} from '../src/renderer/js/mail-parse.js';

const require = createRequire(import.meta.url);
const mail = require('../src/main/mail.js');

test('numbers in German, English and Ukrainian style', () => {
  assert.equal(parseNumber('1.234,56'), 1234.56);
  assert.equal(parseNumber('1,234.56'), 1234.56);
  assert.equal(parseNumber('12,34'), 12.34);
  assert.equal(parseNumber('12.5'), 12.5);
  assert.equal(parseNumber('1 234,5'), 1234.5);
  assert.equal(parseNumber('1.234'), 1234);
  assert.equal(parseNumber('0.990'), 0.99);
});

test('amounts: the total wins over other money in the letter', () => {
  assert.deepEqual(parseAmount('Artikel 9,99 €\nVersand 4,95 €\nGesamtbetrag: 14,94 €'), { amount: 14.94, currency: '€' });
  assert.deepEqual(parseAmount('Amount paid $20.00 · Subtotal $18.00'), { amount: 20, currency: '$' });
  assert.deepEqual(parseAmount('Rechnungsbetrag 39,99 EUR inkl. MwSt.'), { amount: 39.99, currency: '€' });
  assert.deepEqual(parseAmount('Summe: 1.234,56'), { amount: 1234.56, currency: '€' }, 'no currency next to the total → €');
  assert.deepEqual(parseAmount('Оплата 250 грн'), { amount: 250, currency: '₴' });
  assert.deepEqual(parseAmount('Total € 7,50'), { amount: 7.5, currency: '€' });
  assert.equal(parseAmount('Hallo, wie geht es?'), null);
  assert.equal(parseAmount('MwSt 19 %'), null);
});

test('dates and the due / debit date', () => {
  assert.deepEqual(
    findDates('am 29.10.2026, dann 2026-11-05, dann 3. November 2026 und Nov 4, 2026').map((d) => d.date),
    ['2026-10-29', '2026-11-05', '2026-11-03', '2026-11-04'],
  );
  assert.deepEqual(findDates('31.02.2026'), [], 'impossible date');
  assert.equal(parseDueDate('Rechnungsdatum 01.10.2026. Der Betrag wird am 15.10.2026 abgebucht.'), '2026-10-15');
  assert.equal(parseDueDate('Fällig am 20.11.2026'), '2026-11-20');
  assert.equal(parseDueDate('Rechnungsdatum 01.10.2026'), null);
});

test('merchant from a Stripe subject, company names', () => {
  assert.equal(merchantFromSubject('Your receipt from Example Studio #1234-5678'), 'Example Studio');
  assert.equal(merchantFromSubject('Hello'), '');
  assert.equal(companyKey('Muster Logistik GmbH & Co. KG'), 'muster logistik');
  assert.equal(companyKey('Beispiel SE'), 'beispiel');
});

test('application letters: confirmation, invitation, rejection, account mails skipped', () => {
  assert.equal(classifyCareer('Eingangsbestätigung Ihrer Bewerbung', ''), 'sent');
  assert.equal(classifyCareer('Ihre Bewerbung', 'Vielen Dank für deine Bewerbung als Fachinformatiker.'), 'sent');
  assert.equal(classifyCareer('Einladung zum Vorstellungsgespräch', ''), 'interview');
  assert.equal(classifyCareer('Ihre Bewerbung', 'Leider müssen wir Ihnen mitteilen, dass wir uns anderweitig entschieden haben.'), 'rejected');
  assert.equal(classifyCareer('Bitte bestätige deine Registrierung', 'Vielen Dank für deine Bewerbung'), 'skip');
  assert.equal(classifyCareer('Newsletter', 'Neue Angebote'), null);
  const apps = [
    { id: 'a1', company: 'Muster Logistik GmbH' },
    { id: 'a2', company: 'Beispiel AG' },
  ];
  assert.equal(matchApplication(apps, { domain: 'musterlogistik.de', fromName: 'HR', subject: '', text: '' })?.id, 'a1');
  assert.equal(matchApplication(apps, { domain: 'jobs-portal.com', fromName: 'Beispiel AG Recruiting', subject: '', text: '' })?.id, 'a2');
  assert.equal(matchApplication(apps, { domain: 'other.de', fromName: '', subject: 'Hallo', text: '' }), null);
});

const ctx = (extra = {}) => {
  let n = 0;
  return { rules: [], mailRules: DEFAULT_MAIL_RULES, apps: [], finance: [], inbox: [], wishlist: [], rates: { '€': 1, '₴': 50, $: 1.25 }, main: '€', today: '2026-10-29', makeId: () => `id${n++}`, ...extra };
};
const letter = (o) => ({ messageId: `m${Math.random().toString(36).slice(2)}@example.test`, from: 'noreply@example.test', fromName: 'Example', subject: '', date: '2026-10-28T10:00:00.000Z', text: '', pdf: '', ...o });

test('built-in senders: phone bill from the PDF with a debit date, Stripe, Anthropic, Otto, Starlink, Steam', () => {
  const voda = processLetter(letter({ from: 'rechnung@kundenservice.vodafone.com', fromName: 'Vodafone', subject: 'Ihre Rechnung', text: 'Ihre Rechnung ist da.', pdf: 'Rechnungsbetrag 39,99 €\nDer Betrag wird am 15.11.2026 abgebucht.' }), ctx());
  assert.equal(voda.items[0].kind, 'expense');
  assert.equal(voda.items[0].amount, 39.99);
  assert.equal(voda.items[0].category, 'Связь и подписки');
  assert.equal(voda.items[0].dueDate, '2026-11-15');
  assert.equal(voda.bills.length, 1, 'due date ahead → a bill');
  const stripe = processLetter(letter({ from: 'receipts@stripe.com', subject: 'Your receipt from Example Studio #1111-2222', text: 'Amount paid $12.00' }), ctx());
  assert.deepEqual([stripe.items[0].merchant, stripe.items[0].origAmount, stripe.items[0].origCurrency, stripe.items[0].amount], ['Example Studio', 12, '$', 9.6]);
  assert.equal(processLetter(letter({ from: 'billing@mail.anthropic.com', subject: 'Your invoice', text: 'Total 20,00 €' }), ctx()).items[0].category, 'Связь и подписки');
  assert.equal(processLetter(letter({ from: 'service@otto.de', subject: 'Deine Bestellung', text: 'Gesamtsumme 59,90 €' }), ctx()).items[0].category, 'Покупки');
  assert.deepEqual(processLetter(letter({ from: 'service@otto-payments.de', subject: 'Dein SEPA-Lastschriftmandat', text: 'Betrag 0,00 €' }), ctx()).items, []);
  assert.equal(processLetter(letter({ from: 'billing@starlink.com', subject: 'Payment failed', text: 'Your payment failed.' }), ctx()).items[0].kind, 'alert');
  assert.deepEqual(processLetter(letter({ from: 'news@starlink.com', subject: 'New Starlink Mini', text: 'Order now' }), ctx()).items, [], 'adverts ignored');
  const steam = processLetter(letter({ from: 'noreply@steampowered.com', subject: 'Thank you for your Steam purchase!', text: 'Example Quest 2\nTotal: 299,00₴' }), ctx({ wishlist: [{ id: 42, name: 'Example Quest 2' }] }));
  assert.deepEqual([steam.items[0].category, steam.items[0].steamId, steam.items[0].origCurrency], ['Игры', 42, '₴']);
});

test('generic letters: amount found, unknown ones for Grok, repeats skipped, user rules first', () => {
  const generic = processLetter(letter({ from: 'shop@small-store.test', subject: 'Ihre Rechnung', text: 'Gesamt 15,00 €' }), ctx());
  assert.equal(generic.items[0].amount, 15);
  assert.equal(generic.items[0].category, null, 'category is chosen in the inbox');
  const unknown = processLetter(letter({ from: 'info@unknown.test', subject: 'Zahlung', text: 'Bitte melde dich.' }), ctx());
  assert.deepEqual([unknown.items.length, unknown.needsGrok, unknown.unparsed.kind], [0, true, 'unparsed']);
  const l = letter({ from: 'shop@small-store.test', subject: 'Ihre Rechnung', text: 'Gesamt 15,00 €' });
  const first = processLetter(l, ctx());
  assert.deepEqual(processLetter(l, ctx({ inbox: first.items })).items, [], 'same Message-ID');
  const ruled = processLetter(letter({ from: 'shop@small-store.test', subject: 'Rechnung', text: 'Summe 5,00 €' }), ctx({ rules: [{ field: 'domain', value: 'small-store.test', category: 'Еда' }] }));
  assert.equal(ruled.items[0].category, 'Еда');
  assert.deepEqual(processLetter(letter({ from: 'x@spam.test', subject: 'Rechnung', text: 'Summe 5 €' }), ctx({ rules: [{ field: 'domain', value: 'spam.test', kind: 'skip' }] })).items, []);
});

test('status letters become career items for the matching application', () => {
  const apps = [{ id: 'a1', company: 'Muster Logistik GmbH', status: 'sent' }];
  const out = processLetter(letter({ from: 'karriere@musterlogistik.de', fromName: 'Muster Logistik', subject: 'Einladung zum Vorstellungsgespräch', text: 'Wir laden Sie ein.' }), ctx({ apps }));
  assert.deepEqual(out.items[0].career, { status: 'interview', appId: 'a1', company: 'Muster Logistik GmbH' });
  const unknownCompany = processLetter(letter({ from: 'hr@another.test', fromName: 'Another Firma', subject: 'Ihre Bewerbung', text: 'Leider haben wir uns anderweitig entschieden.' }), ctx({ apps }));
  assert.deepEqual(unknownCompany.items[0].career, { status: 'rejected', appId: null, company: 'Another Firma' });
  assert.deepEqual(processLetter(letter({ from: 'no-reply@jobboard.test', subject: 'Bitte bestätige deine Registrierung', text: 'Bewerbung' }), ctx()).items, []);
});

test('bank match: same amount in the original currency or ±2 % within 2 days, then attached', () => {
  const finance = [
    { id: 'e1', type: 'expense', amount: 9.6, origAmount: 12, origCurrency: '$', date: '2026-10-27' },
    { id: 'e2', type: 'expense', amount: 40.5, date: '2026-10-28' },
  ];
  assert.equal(findMatchingEntry(finance, { origAmount: 12, origCurrency: '$', amount: 9.6, date: '2026-10-28' })?.id, 'e1');
  assert.equal(findMatchingEntry(finance, { origAmount: 39.99, origCurrency: '€', amount: 39.99, date: '2026-10-29' })?.id, 'e2', '±2 %');
  assert.equal(findMatchingEntry(finance, { origAmount: 12, origCurrency: '$', amount: 9.6, date: '2026-11-05' }), null, 'too far apart');
  const stripe = processLetter(letter({ from: 'receipts@stripe.com', subject: 'Your receipt from Example Studio #1', text: 'Amount paid $12.00' }), ctx({ finance }));
  assert.equal(stripe.items[0].match, 'e1');
  assert.equal(billPaidBy({ amount: 39.99, dueDate: '2026-10-30' }, finance)?.id, 'e2');
  assert.equal(billPaidBy({ amount: 100, dueDate: '2026-10-30' }, finance), null);
});

test('Grok answers are checked', () => {
  const cats = ['Еда', 'Связь и подписки'];
  assert.deepEqual(parseGrokAnswer('```json\n{"isFinancial": true, "kind": "expense", "amount": 12.5, "currency": "EUR", "date": "2026-10-28", "merchant": "Shop", "category": "Еда", "dueDate": null}\n```', cats), {
    isFinancial: true,
    kind: 'expense',
    amount: 12.5,
    currency: '€',
    date: '2026-10-28',
    merchant: 'Shop',
    category: 'Еда',
    dueDate: null,
  });
  assert.equal(parseGrokAnswer('{"isFinancial": true, "category": "Invented", "amount": -3}', cats).category, null);
  assert.equal(parseGrokAnswer('{"isFinancial": true, "category": "Invented", "amount": -3}', cats).amount, null);
  assert.equal(parseGrokAnswer('not json', cats), null);
  assert.equal(parseGrokAnswer('{"kind": "expense"}', cats), null);
});

test('Gmail link by Message-ID', () => {
  assert.equal(gmailLink('abc@mail.test'), 'https://mail.google.com/mail/u/0/#search/rfc822msgid%3Aabc%40mail.test');
});

test('IMAP search: new letters only, known senders OR subject words', () => {
  const now = Date.UTC(2026, 9, 29);
  const first = mail.buildSearch({ senders: ['stripe.com', 'bad domain'], now });
  assert.equal(first.since.toISOString().slice(0, 10), '2026-08-30');
  assert.deepEqual(first.or[0], { from: 'stripe.com' });
  assert.ok(first.or.some((x) => x.subject === 'Rechnung') && first.or.some((x) => x.subject === 'Absage'));
  assert.ok(!first.or.some((x) => x.from === 'bad domain'));
  assert.deepEqual(mail.buildSearch({ lastUid: 120, sameMailbox: true, now }).uid, '121:*');
  assert.ok(mail.buildSearch({ lastUid: 120, sameMailbox: false, now }).since, 'new UIDVALIDITY → 60 days again');
  assert.ok(mail.validEmail('name@gmail.com') && !mail.validEmail('nope'));
  assert.equal(mail.htmlToText('<p>Total&nbsp;<b>9,99&euro;</b></p><script>x()</script>'), 'Total 9,99€');
});

test('IMAP fetch opens the mailbox read only and reports bad logins', async () => {
  const opened = [];
  class FakeImap {
    async connect() {}
    async mailboxOpen(name, opts) {
      opened.push([name, opts]);
      return { uidValidity: 7n, uidNext: 10 };
    }
    async search() {
      return [5, 8];
    }
    async *fetch(uids, query) {
      opened.push(['fetch', query]);
      for (const uid of uids) yield { uid, size: 100, source: Buffer.from('x') };
    }
    async logout() {}
  }
  const res = await mail.fetchMail({ user: 'a@b.test', pass: 'p', lastUid: 0 }, { ImapFlow: FakeImap, parse: async () => ({ messageId: 'x' }) });
  assert.deepEqual(opened[0], ['INBOX', { readOnly: true }]);
  assert.deepEqual([res.ok, res.uidValidity, res.lastUid, res.letters.length], [true, '7', 8, 2]);
  assert.equal(opened[1][1].source, true);
  class BadLogin {
    async connect() {
      throw Object.assign(new Error('Invalid credentials'), { authenticationFailed: true });
    }
    async logout() {}
  }
  assert.equal((await mail.fetchMail({ user: 'a@b.test', pass: 'p' }, { ImapFlow: BadLogin })).error, 'auth');
});
