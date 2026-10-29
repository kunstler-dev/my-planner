// Comparing a release tag with the app version (pure, unit-tested). «v1.12.0» = «1.12.0»; pre-releases
// («1.12.0-beta.1») come before the release.

function parts(v) {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([\w.]+))?$/i.exec(String(v || '').trim());
  if (!m) return null;
  return { nums: [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)], pre: m[4] || '' };
}

/** −1 / 0 / 1; null when either isn't a version. */
export function compareVersions(a, b) {
  const x = parts(a);
  const y = parts(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] < y.nums[i] ? -1 : 1;
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

export const isNewer = (tag, current) => compareVersions(tag, current) === 1;
