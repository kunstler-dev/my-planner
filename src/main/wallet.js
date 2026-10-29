// Trust Wallet balances from public addresses only (no keys, no seed): TRON via TronGrid, BNB Smart Chain and
// Ethereum via public JSON-RPC (a main and a fallback endpoint), prices from CoinGecko. Parsing is pure and tested.

const NETWORKS = {
  tron: { coin: 'TRX', decimals: 6, usdt: { contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6 } },
  bsc: {
    coin: 'BNB',
    decimals: 18,
    rpc: ['https://bsc-dataseed.bnbchain.org', 'https://bsc-rpc.publicnode.com'],
    usdt: { contract: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
  },
  eth: {
    coin: 'ETH',
    decimals: 18,
    rpc: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'],
    usdt: { contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
  },
};
const COINGECKO_IDS = { TRX: 'tron', BNB: 'binancecoin', ETH: 'ethereum' };

/** TRON: base58 starting with T, 34 characters. EVM: 0x + 40 hex characters. */
function validAddress(network, address) {
  const a = String(address || '').trim();
  if (network === 'tron') return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);
  if (network === 'bsc' || network === 'eth') return /^0x[0-9a-fA-F]{40}$/.test(a);
  return false;
}

/** 12 or 24 words look like a recovery phrase; such input is never accepted. */
function looksLikeSeed(text) {
  const words = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length >= 12 && words.every((w) => /^[a-zA-Z]+$/.test(w));
}

/** Integer string (decimal or 0x-hex) in the smallest unit → number with `decimals`. */
function fromUnits(raw, decimals) {
  if (raw == null || raw === '' || raw === '0x') return 0;
  let n;
  try {
    n = BigInt(raw);
  } catch {
    return 0;
  }
  const base = 10n ** BigInt(decimals);
  const whole = n / base;
  const frac = n % base;
  return Number(whole) + Number(frac) / Number(base);
}

/** TronGrid /v1/accounts/{address} answer → { native, usdt }. An unactivated address has no data: zeros. */
function parseTron(json) {
  const acc = json?.data?.[0];
  if (!acc) return { native: 0, usdt: 0 };
  const entry = (acc.trc20 || []).find((x) => x && Object.prototype.hasOwnProperty.call(x, NETWORKS.tron.usdt.contract));
  return { native: fromUnits(String(acc.balance ?? 0), 6), usdt: entry ? fromUnits(String(entry[NETWORKS.tron.usdt.contract]), 6) : 0 };
}

/** ERC-20 balanceOf(address) call data. */
const balanceOfData = (address) => `0x70a08231${address.slice(2).toLowerCase().padStart(64, '0')}`;

/** Total in $ and one line per coin and network: [{ network, address, symbol, amount, usd }]. */
function summarize(rows, prices) {
  const lines = rows.map((r) => ({ ...r, usd: r.symbol === 'USDT' ? r.amount : r.amount * (prices[r.symbol] || 0) }));
  return { total: Math.round(lines.reduce((s, l) => s + l.usd, 0) * 100) / 100, lines };
}

async function fetchJson(fetchFn, url, init) {
  const res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { code: 'http' });
  return res.json();
}

async function rpc(fetchFn, urls, method, params) {
  let last;
  for (const url of urls) {
    try {
      const json = await fetchJson(fetchFn, url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      if (typeof json?.result === 'string') return json.result;
      last = new Error(json?.error?.message || 'bad answer');
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

/** Balances of all addresses [{ network, address }] in $; throws only if nothing at all could be read. */
async function walletBalances(addresses, fetchFn = fetch) {
  const rows = [];
  const errors = [];
  for (const { network, address } of addresses) {
    const net = NETWORKS[network];
    try {
      if (network === 'tron') {
        const b = parseTron(await fetchJson(fetchFn, `https://api.trongrid.io/v1/accounts/${address}`));
        rows.push({ network, address, symbol: net.coin, amount: b.native }, { network, address, symbol: 'USDT', amount: b.usdt });
      } else {
        const native = await rpc(fetchFn, net.rpc, 'eth_getBalance', [address, 'latest']);
        const usdt = await rpc(fetchFn, net.rpc, 'eth_call', [{ to: net.usdt.contract, data: balanceOfData(address) }, 'latest']);
        rows.push({ network, address, symbol: net.coin, amount: fromUnits(native, net.decimals) }, { network, address, symbol: 'USDT', amount: fromUnits(usdt, net.usdt.decimals) });
      }
    } catch (err) {
      errors.push({ network, address, message: err.message });
    }
  }
  if (!rows.length && errors.length) throw Object.assign(new Error(errors[0].message), { code: 'network' });
  const symbols = [...new Set(rows.map((r) => r.symbol).filter((s) => COINGECKO_IDS[s]))];
  let prices = {};
  if (symbols.length) {
    const ids = symbols.map((s) => COINGECKO_IDS[s]).join(',');
    const json = await fetchJson(fetchFn, `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
    prices = Object.fromEntries(symbols.map((s) => [s, Number(json?.[COINGECKO_IDS[s]]?.usd) || 0]));
  }
  return { ...summarize(rows, prices), prices, errors };
}

module.exports = { NETWORKS, validAddress, looksLikeSeed, fromUnits, parseTron, balanceOfData, summarize, walletBalances };
