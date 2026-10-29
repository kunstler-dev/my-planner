// Gmail over IMAP, read only: the mailbox is opened with EXAMINE (readOnly), bodies are fetched with BODY.PEEK, so
// nothing is marked read, moved or deleted. Only letters from known senders or with bill / application words in
// the subject are searched on the server; only those are downloaded. Text of PDF attachments is extracted here.
// Libraries: imapflow (IMAP), mailparser (MIME), pdf-parse 1.1.1 (small, pure JS, CommonJS).
const { SUBJECT_KEYWORDS } = require('./mail-keywords');

const DAY = 86400000;
const FIRST_DAYS = 60;
const MAX_LETTERS = 150;
const MAX_SIZE = 15 * 1024 * 1024;
const TEXT_LIMIT = 6000;

const validEmail = (s) => typeof s === 'string' && /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(s);
const validDomain = (s) => typeof s === 'string' && /^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(s) && s.length <= 100;

/**
 * IMAP search: new letters only (after the last seen UID of the same UIDVALIDITY, else the last 60 days), from a
 * known sender domain OR with a keyword in the subject.
 */
function buildSearch({ lastUid = 0, sameMailbox = false, senders = [], now = Date.now() }) {
  const base = sameMailbox && lastUid > 0 ? { uid: `${lastUid + 1}:*` } : { since: new Date(now - FIRST_DAYS * DAY) };
  const or = [...senders.filter(validDomain).map((d) => ({ from: d })), ...SUBJECT_KEYWORDS.map((k) => ({ subject: k }))];
  return { ...base, or };
}

/** Plain text from HTML when a letter has no text part. */
function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&euro;/g, '€')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}

async function pdfText(buffer) {
  // The package entry runs a debug self-test when required directly; the library file doesn't.
  const parse = require('pdf-parse/lib/pdf-parse.js');
  const res = await parse(buffer, { max: 5 });
  return res.text || '';
}

/** One raw message → the fields the planner parses (kept in memory only, never written to disk). */
async function parseMessage(source, { simpleParser = require('mailparser').simpleParser, readPdf = pdfText } = {}) {
  const m = await simpleParser(source, { skipImageLinks: true, skipTextToHtml: true });
  const from = m.from?.value?.[0] || {};
  let pdf = '';
  for (const a of m.attachments || []) {
    if (!/pdf/i.test(a.contentType || '') && !/\.pdf$/i.test(a.filename || '')) continue;
    try {
      pdf += `${await readPdf(a.content)}\n`;
    } catch {
      // a broken PDF only loses its text
    }
    if (pdf.length > TEXT_LIMIT) break;
  }
  return {
    messageId: String(m.messageId || '').replace(/^<|>$/g, ''),
    from: String(from.address || '').toLowerCase(),
    fromName: String(from.name || ''),
    subject: String(m.subject || ''),
    date: (m.date || new Date()).toISOString(),
    text: (m.text || htmlToText(m.html)).slice(0, TEXT_LIMIT),
    pdf: pdf.slice(0, TEXT_LIMIT),
  };
}

/**
 * New letters since the last check. state: { lastUid, uidValidity } from data.sync.mail.
 * Returns { ok, uidValidity, lastUid, letters } or { ok: false, error: 'auth' | 'network' | … }.
 */
async function fetchMail({ user, pass, lastUid = 0, uidValidity = '', senders = [] }, { ImapFlow = require('imapflow').ImapFlow, parse = parseMessage } = {}) {
  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user, pass }, logger: false, emitLogs: false });
  try {
    await client.connect();
  } catch (err) {
    return { ok: false, error: err.authenticationFailed || /auth|credentials|invalid/i.test(err.responseText || err.message) ? 'auth' : 'network', message: err.message };
  }
  try {
    const box = await client.mailboxOpen('INBOX', { readOnly: true });
    const validity = String(box.uidValidity);
    const same = validity === String(uidValidity);
    let uids = (await client.search(buildSearch({ lastUid, sameMailbox: same, senders }), { uid: true })) || [];
    // «N:*» always returns the newest letter, even when it is older than N.
    if (same) uids = uids.filter((u) => u > lastUid);
    uids = uids.sort((a, b) => a - b).slice(-MAX_LETTERS);
    const letters = [];
    let maxUid = same ? lastUid : 0;
    if (uids.length) {
      for await (const msg of client.fetch(uids, { uid: true, size: true, source: true }, { uid: true })) {
        maxUid = Math.max(maxUid, msg.uid);
        if (!msg.source || msg.size > MAX_SIZE) continue;
        try {
          letters.push({ uid: msg.uid, ...(await parse(msg.source)) });
        } catch {
          // an unreadable letter is skipped
        }
      }
    }
    if (!uids.length && !same) maxUid = Math.max(0, (box.uidNext || 1) - 1);
    return { ok: true, uidValidity: validity, lastUid: maxUid, letters };
  } catch (err) {
    return { ok: false, error: 'imap', message: err.message };
  } finally {
    await client.logout().catch(() => {});
  }
}

/** Asks Grok for strict JSON about one unknown letter: only sender, subject, date and the first 3000 characters. */
function grokMailMessages({ from, subject, date, text, categories }) {
  return [
    {
      role: 'system',
      content:
        'You read one e-mail and answer with strict JSON only, no prose, no code fences: ' +
        '{"isFinancial": boolean, "kind": "expense" | "income" | "alert" | null, "amount": number | null, "currency": "EUR" | "UAH" | "USD" | null, ' +
        '"date": "YYYY-MM-DD" | null, "merchant": string | null, "category": string | null, "dueDate": "YYYY-MM-DD" | null}. ' +
        `category must be exactly one of: ${JSON.stringify(categories)} or null.`,
    },
    { role: 'user', content: `From: ${from}\nSubject: ${subject}\nDate: ${date}\n\n${String(text || '').slice(0, 3000)}` },
  ];
}

module.exports = { buildSearch, htmlToText, parseMessage, fetchMail, grokMailMessages, validEmail, validDomain, FIRST_DAYS };
