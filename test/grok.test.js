const { test } = require('node:test');
const assert = require('node:assert/strict');
const { streamChat, GrokError } = require('../src/main/grok.js');

function sse(lines) {
  const enc = new TextEncoder();
  const body = lines.map((l) => `data: ${l}\n\n`).join('');
  // Split mid-line to exercise buffering.
  const mid = Math.floor(body.length / 2);
  return { ok: true, status: 200, body: [enc.encode(body.slice(0, mid)), enc.encode(body.slice(mid))] };
}

test('streams deltas and returns full text', async () => {
  const chunks = [];
  const text = await streamChat({ key: 'k', model: 'grok-4', messages: [], onDelta: (d) => chunks.push(d) }, async (url, opts) => {
    assert.equal(url, 'https://api.x.ai/v1/chat/completions');
    assert.equal(opts.headers.Authorization, 'Bearer k');
    assert.equal(JSON.parse(opts.body).stream, true);
    return sse([
      JSON.stringify({ choices: [{ delta: { content: 'При' } }] }),
      JSON.stringify({ choices: [{ delta: { content: 'вет' } }] }),
      '[DONE]',
    ]);
  });
  assert.equal(text, 'Привет');
  assert.deepEqual(chunks, ['При', 'вет']);
});

test('maps HTTP errors to codes', async () => {
  await assert.rejects(streamChat({ key: '', messages: [] }), (e) => e instanceof GrokError && e.code === 'no_key');
  const fail = (status) => async () => ({ ok: false, status, statusText: 'x', json: async () => ({ error: 'nope' }) });
  await assert.rejects(streamChat({ key: 'k', messages: [] }, fail(401)), { code: 'bad_key' });
  await assert.rejects(streamChat({ key: 'k', messages: [] }, fail(429)), { code: 'rate_limit' });
});

test('xAI 400 for a wrong key is reported as bad_key', async () => {
  const res = async () => ({ ok: false, status: 400, json: async () => ({ error: 'Incorrect API key provided.' }) });
  await assert.rejects(streamChat({ key: 'k', messages: [] }, res), { code: 'bad_key' });
});
