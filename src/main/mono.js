// Monobank personal API (https://api.monobank.ua/docs/): client info and statements with the X-Token header.
// Monobank allows one request per 60 s, so every call goes through one queue with a 60-second pause.

const API = 'https://api.monobank.ua';
const GAP_MS = 60 * 1000;
// One statement request covers at most 31 days + 1 hour.
const MAX_SPAN = 2682000;

/** Account or jar id from client-info, or 0 for the default account. */
const validAccountId = (id) => typeof id === 'string' && /^([A-Za-z0-9_-]{1,64}|0)$/.test(id);

function validRange(from, to) {
  return Number.isInteger(from) && Number.isInteger(to) && from > 0 && to > from && to - from <= MAX_SPAN;
}

/** A queue that runs one task at a time with at least `gap` ms between starts. */
function createQueue(gap = GAP_MS, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms))) {
  let last = null;
  let chain = Promise.resolve();
  return {
    push(task) {
      const run = chain.then(async () => {
        const wait = last == null ? 0 : last + gap - now();
        if (wait > 0) await sleep(wait);
        last = now();
        return task();
      });
      chain = run.catch(() => {});
      return run;
    },
  };
}

function createMono(getToken, fetchFn = fetch, queue = createQueue()) {
  async function call(path) {
    const token = getToken();
    if (!token) return { ok: false, error: 'no_token' };
    return queue.push(async () => {
      try {
        const res = await fetchFn(`${API}${path}`, { headers: { 'X-Token': token }, signal: AbortSignal.timeout(20000) });
        if (res.status === 401 || res.status === 403) return { ok: false, error: 'bad_token' };
        if (res.status === 429) return { ok: false, error: 'rate' };
        if (!res.ok) return { ok: false, error: 'http', status: res.status };
        return { ok: true, data: await res.json() };
      } catch (err) {
        return { ok: false, error: 'network', message: err.message };
      }
    });
  }
  return {
    clientInfo: () => call('/personal/client-info'),
    statement(account, from, to) {
      if (!validAccountId(account) || !validRange(from, to)) return Promise.resolve({ ok: false, error: 'bad_args' });
      return call(`/personal/statement/${account}/${from}/${to}`);
    },
  };
}

module.exports = { createMono, createQueue, validAccountId, validRange, MAX_SPAN, GAP_MS };
