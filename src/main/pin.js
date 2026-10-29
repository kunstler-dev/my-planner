// PIN for opening the interface: only a scrypt hash with a random salt is kept (the secret «pin»), checks happen
// here in the main process. After 5 wrong tries the next try waits 30 s, then twice as long each time (up to an
// hour); the counter is kept in pin-lock.json so a restart doesn't reset it.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const validPin = (pin) => typeof pin === 'string' && /^\d{4,8}$/.test(pin);

function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `${salt}:${hash}`;
}

function checkPin(pin, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash || !validPin(pin)) return false;
  const test = Buffer.from(hashPin(pin, salt).split(':')[1], 'hex');
  const ref = Buffer.from(hash, 'hex');
  return test.length === ref.length && crypto.timingSafeEqual(test, ref);
}

/** Wait before the next try after `fails` wrong ones: none for the first 5, then 30 s, 60 s, 120 s … up to 1 h. */
const lockoutMs = (fails) => (fails < 5 ? 0 : Math.min(3600000, 30000 * 2 ** (fails - 5)));

function createPin(dir, secrets, now = () => Date.now()) {
  const file = path.join(dir, 'pin-lock.json');
  let state = { fails: 0, until: 0 };
  try {
    state = { ...state, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    // no counter yet
  }
  const persist = () => {
    try {
      fs.writeFileSync(file, JSON.stringify(state));
    } catch {
      // the counter is best effort
    }
  };
  const has = () => secrets.has('pin');
  return {
    has,
    /** { ok } or { ok: false, wait } (ms until the next try is allowed). */
    verify(pin) {
      if (!has()) return { ok: true };
      const t = now();
      if (state.until > t) return { ok: false, wait: state.until - t };
      if (checkPin(String(pin ?? ''), secrets.get('pin'))) {
        state = { fails: 0, until: 0 };
        persist();
        return { ok: true };
      }
      state.fails += 1;
      state.until = t + lockoutMs(state.fails);
      persist();
      return { ok: false, wait: state.until - t, fails: state.fails };
    },
    /** Sets or changes the PIN; changing or removing needs the current one. newPin null removes it. */
    set(newPin, oldPin) {
      if (has()) {
        const v = this.verify(oldPin);
        if (!v.ok) return { ok: false, error: 'wrong', wait: v.wait };
      }
      if (newPin == null) {
        secrets.set('pin', '');
        return { ok: true };
      }
      if (!validPin(newPin)) return { ok: false, error: 'format' };
      secrets.set('pin', hashPin(newPin));
      return { ok: true };
    },
  };
}

module.exports = { createPin, hashPin, checkPin, lockoutMs, validPin };
