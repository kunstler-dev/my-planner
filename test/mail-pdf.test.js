// MIME letter with a PDF bill, parsed the way the main process does it. CommonJS on purpose: the PDF library
// (pdf.js 1.10 inside pdf-parse) runs in the CommonJS main process and misreads files when loaded from ES modules.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const mail = require('../src/main/mail.js');

/** A one-page PDF with the given line of text (for the parser test only). */
function makePdf(text) {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

test('MIME letter with an HTML body and a PDF bill → text and PDF text', async () => {
  const pdf = makePdf('Rechnungsbetrag 39,99 EUR');
  const eml = [
    'From: "Example Telecom" <rechnung@kundenservice.vodafone.com>',
    'To: someone@example.test',
    'Subject: =?UTF-8?Q?Ihre_Rechnung_f=C3=BCr_Oktober?=',
    'Message-ID: <bill-1@example.test>',
    'Date: Wed, 28 Oct 2026 10:00:00 +0000',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="b1"',
    '',
    '--b1',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<p>Ihre Rechnung ist da.</p>',
    '--b1',
    'Content-Type: application/pdf; name="rechnung.pdf"',
    'Content-Disposition: attachment; filename="rechnung.pdf"',
    'Content-Transfer-Encoding: base64',
    '',
    pdf.toString('base64').replace(/.{76}/g, '$&\r\n'),
    '--b1--',
    '',
  ].join('\r\n');
  const m = await mail.parseMessage(Buffer.from(eml));
  assert.equal(m.messageId, 'bill-1@example.test');
  assert.equal(m.from, 'rechnung@kundenservice.vodafone.com');
  assert.equal(m.subject, 'Ihre Rechnung für Oktober');
  assert.match(m.text, /Ihre Rechnung ist da/);
  assert.match(m.pdf, /Rechnungsbetrag 39,99 EUR/);
});

