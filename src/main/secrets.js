// Named secrets (xAI key, Monobank token, Gmail app password, PIN hash), each encrypted with Electron safeStorage
// (DPAPI on Windows) in its own file. Never stored in data.json; values never go to the renderer.
const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');

const NAMES = ['xai', 'mono', 'imap', 'pin'];

/** The xAI key keeps its original file name, so a key saved by an older version keeps working. */
const fileName = (name) => (name === 'xai' ? 'secret.bin' : `secret-${name}.bin`);

function createSecrets(dir) {
  const fileOf = (name) => {
    if (!NAMES.includes(name)) throw new Error(`unknown secret: ${name}`);
    return path.join(dir, fileName(name));
  };
  return {
    has(name) {
      return fs.existsSync(fileOf(name));
    },
    get(name) {
      const file = fileOf(name);
      if (!fs.existsSync(file)) return null;
      try {
        return safeStorage.decryptString(fs.readFileSync(file));
      } catch {
        return null;
      }
    },
    /** An empty value removes the secret. */
    set(name, value) {
      const file = fileOf(name);
      const v = String(value ?? '').trim();
      if (!v) {
        if (fs.existsSync(file)) fs.unlinkSync(file);
        return;
      }
      if (!safeStorage.isEncryptionAvailable()) throw new Error('encryption unavailable');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, safeStorage.encryptString(v));
    },
  };
}

module.exports = { createSecrets, NAMES, fileName };
