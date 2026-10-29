// Daily copies of data.json in userData/backups (pure helpers are unit-tested).
const fs = require('fs');
const path = require('path');

const DAILY = /^data-(\d{4}-\d{2}-\d{2})\.json$/;
const BEFORE_RESTORE = /^data-before-restore-[\dT-]+\.json$/;

const dailyName = (date) => `data-${date}.json`;

/** Daily backup files to delete so that only the newest `keep` remain (other files are never touched). */
function backupsToDelete(names, keep = 30) {
  const daily = names.filter((n) => DAILY.test(n)).sort();
  const before = names.filter((n) => BEFORE_RESTORE.test(n)).sort();
  return [...daily.slice(0, Math.max(0, daily.length - keep)), ...before.slice(0, Math.max(0, before.length - 10))];
}

/** A file name the renderer may ask to restore: only our own backup names, no paths. */
const isBackupName = (name) => typeof name === 'string' && (DAILY.test(name) || BEFORE_RESTORE.test(name));

function localDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function createBackups(dir) {
  const folder = path.join(dir, 'backups');
  const file = path.join(dir, 'data.json');
  return {
    folder,
    /** Called before data.json is overwritten: the first save of the day keeps the previous file. */
    daily(date = localDate()) {
      if (!fs.existsSync(file)) return false;
      const target = path.join(folder, dailyName(date));
      if (fs.existsSync(target)) return false;
      fs.mkdirSync(folder, { recursive: true });
      fs.copyFileSync(file, target);
      for (const old of backupsToDelete(fs.readdirSync(folder))) fs.unlinkSync(path.join(folder, old));
      return true;
    },
    list() {
      if (!fs.existsSync(folder)) return [];
      return fs
        .readdirSync(folder)
        .filter(isBackupName)
        .map((name) => {
          const st = fs.statSync(path.join(folder, name));
          return { name, size: st.size, mtime: st.mtimeMs, date: DAILY.exec(name)?.[1] || '' };
        })
        .sort((a, b) => b.mtime - a.mtime);
    },
    /** Keeps the current data as data-before-restore-<time>.json and returns the chosen backup's JSON. */
    read(name) {
      if (!isBackupName(name)) return null;
      const src = path.join(folder, name);
      if (!fs.existsSync(src)) return null;
      const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
      if (fs.existsSync(file)) {
        fs.mkdirSync(folder, { recursive: true });
        const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        fs.copyFileSync(file, path.join(folder, `data-before-restore-${stamp}.json`));
      }
      return raw;
    },
  };
}

module.exports = { createBackups, backupsToDelete, isBackupName, dailyName, localDate };
