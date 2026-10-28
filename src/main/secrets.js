// xAI API key, encrypted with Electron safeStorage (DPAPI on Windows). Never stored in data.json.
const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');

function createSecrets(dir) {
  const file = path.join(dir, 'secret.bin');
  return {
    has() {
      return fs.existsSync(file);
    },
    get() {
      if (!fs.existsSync(file)) return null;
      try {
        return safeStorage.decryptString(fs.readFileSync(file));
      } catch {
        return null;
      }
    },
    set(key) {
      const value = String(key || '').trim();
      if (!value) {
        if (fs.existsSync(file)) fs.unlinkSync(file);
        return;
      }
      if (!safeStorage.isEncryptionAvailable()) throw new Error('encryption unavailable');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, safeStorage.encryptString(value));
    },
  };
}

module.exports = { createSecrets };
