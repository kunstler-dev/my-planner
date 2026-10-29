// Pure tick helpers for the SVG charts (unit-tested): axis ticks never repeat the same label.

/**
 * Value-axis ticks between lo and hi: `count` even steps, or every multiple of `step` (e.g. one Deadlock tier = 6).
 * Ticks whose formatted label equals an already kept one are dropped, so «Phantom, Phantom» can't happen.
 * Returns [{ value, label }] from bottom to top.
 */
export function valueTicks(lo, hi, { count = 4, step = null, format = String } = {}) {
  let values;
  if (step) {
    const first = Math.ceil(lo / step) * step;
    values = [];
    for (let v = first; v <= hi + 1e-9 && values.length < 50; v += step) values.push(v);
    if (!values.length) values = [lo];
  } else {
    values = Array.from({ length: count + 1 }, (_, i) => lo + ((hi - lo) * i) / count);
  }
  return uniqueLabels(values.map((value) => ({ value, label: format(value) })));
}

/** Keeps the first tick of every label (labels may repeat after rounding or when names cover a range). */
export function uniqueLabels(ticks) {
  const seen = new Set();
  return ticks.filter((t) => {
    if (seen.has(t.label)) return false;
    seen.add(t.label);
    return true;
  });
}

/**
 * Indices of category-axis points that get a label: every `every`-th point and the last one, skipping a label that
 * equals the previous shown label and one that would sit closer than `minGap` points to the previous.
 */
export function categoryTicks(labels, every = 1, minGap = 1) {
  const out = [];
  labels.forEach((label, i) => {
    if (!label) return;
    if (i % every !== 0 && i !== labels.length - 1) return;
    const prev = out.at(-1);
    if (prev != null && (labels[prev] === label || i - prev < minGap)) return;
    out.push(i);
  });
  return out;
}
