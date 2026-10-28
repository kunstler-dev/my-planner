// Streaming client for the xAI API (OpenAI-compatible Chat Completions with SSE).
const API = 'https://api.x.ai/v1';

class GrokError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

function codeFor(status, msg = '') {
  // xAI answers a wrong key with 400 "Incorrect API key provided".
  if (status === 401 || status === 403 || /api key/i.test(msg)) return 'bad_key';
  if (status === 400 && /model/i.test(msg)) return 'model';
  if (status === 429) return 'rate_limit';
  if (status === 404) return 'model';
  return 'http';
}

async function readError(res) {
  try {
    const body = await res.json();
    return body.error?.message || body.error || body.code || JSON.stringify(body);
  } catch {
    return res.statusText;
  }
}

async function listModels(key, fetchImpl = fetch) {
  if (!key) throw new GrokError('no_key');
  let res;
  try {
    res = await fetchImpl(`${API}/models`, { headers: { Authorization: `Bearer ${key}` } });
  } catch (err) {
    throw new GrokError('network', err.message);
  }
  if (!res.ok) {
    const msg = String(await readError(res));
    throw new GrokError(codeFor(res.status, msg), msg);
  }
  const body = await res.json();
  return (body.data || []).map((m) => m.id).sort();
}

/** Streams a chat completion; calls onDelta(text) for every chunk and resolves with the full text. */
async function streamChat({ key, model, messages, signal, onDelta }, fetchImpl = fetch) {
  if (!key) throw new GrokError('no_key');
  let res;
  try {
    res = await fetchImpl(`${API}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') return '';
    throw new GrokError('network', err.message);
  }
  if (!res.ok) {
    const msg = String(await readError(res));
    throw new GrokError(codeFor(res.status, msg), msg);
  }

  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  try {
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return full;
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            onDelta(delta);
          }
        } catch {
          // keep-alive or partial line
        }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') throw new GrokError('network', err.message);
  }
  return full;
}

module.exports = { streamChat, listModels, GrokError, API };
