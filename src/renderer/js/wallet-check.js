// Address checks for the account dialog (the main process checks again before any request). Unit-tested.

/** TRON: base58 starting with T, 34 characters. BNB Smart Chain and Ethereum: 0x + 40 hex characters. */
export const validAddress = (network, a) => (network === 'tron' ? /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a) : /^0x[0-9a-fA-F]{40}$/.test(a));

/** 12 or more plain words look like a recovery phrase; such input is never accepted or kept. */
export function looksLikeSeed(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  return words.length >= 12 && words.every((w) => /^[a-zA-Z]+$/.test(w));
}
