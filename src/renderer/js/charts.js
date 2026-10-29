// Small monochrome SVG charts with a hover tooltip. Axis labels stay 11px whatever size the chart is drawn at,
// ticks never repeat a label (charts-calc.js), and hovering a line chart shows a vertical guide at the point.
import { h, svg } from './ui.js';
import { valueTicks, categoryTicks } from './charts-calc.js';

let tip;
function tooltip() {
  if (!tip) {
    tip = h('div', { class: 'tooltip' });
    document.body.append(tip);
  }
  return tip;
}
function showTip(e, text) {
  const t = tooltip();
  t.textContent = text;
  const left = Math.min(e.clientX + 12, window.innerWidth - t.offsetWidth - 8);
  t.style.left = `${left}px`;
  t.style.top = `${Math.max(8, e.clientY - t.offsetHeight - 10)}px`;
  t.classList.add('show');
}
const hideTip = () => tooltip().classList.remove('show');

// The viewBox scales the whole drawing; --k scales the label font back so it renders at 11px.
const sizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((entries) => entries.forEach(({ target }) => fitText(target))) : null;
function fitText(el) {
  const w = el.getBoundingClientRect().width;
  if (w > 0) el.style.setProperty('--k', String(Number(el.dataset.w) / w));
}
function chartSvg(W, H) {
  const el = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', 'data-w': W });
  sizeObserver?.observe(el);
  return el;
}

function text(x, y, anchor, label) {
  const el = svg('text', { x, y, 'text-anchor': anchor, class: 'axis' });
  el.textContent = label;
  return el;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
}

// Label width in viewBox units at 11px for the default chart size (used to keep x labels apart).
const labelGap = (labels, slot) => Math.max(1, Math.ceil((Math.max(0, ...labels.map((l) => String(l).length)) * 6.6 + 8) / Math.max(1, slot)));

/**
 * Grouped bars. series: [{ key, label, cls }] where cls is 'ink' | 'ghost';
 * points: [{ label, values: { [key]: number }, tip: string }].
 */
export function barChart({ series, points, height = 220, format = String }) {
  const W = 640;
  const H = height;
  const pad = { l: 56, r: 8, t: 10, b: 26 };
  const max = niceMax(Math.max(0, ...points.flatMap((p) => series.map((s) => p.values[s.key] || 0))));
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const slot = iw / Math.max(1, points.length);
  const bw = Math.min(22, (slot * 0.7) / series.length);
  const el = chartSvg(W, H);
  for (const tk of valueTicks(0, max, { count: 4, format })) {
    const y = pad.t + ih - (tk.value / max) * ih;
    el.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: 'gridline' }), text(pad.l - 8, y + 4, 'end', tk.label));
  }
  const shown = new Set(categoryTicks(points.map((p) => p.label), 1, labelGap(points.map((p) => p.label), slot)));
  points.forEach((p, i) => {
    const cx = pad.l + slot * i + slot / 2;
    const group = svg('g', { class: 'bar-group' });
    series.forEach((s, j) => {
      const v = p.values[s.key] || 0;
      const bh = (v / max) * ih;
      const x = cx - (bw * series.length) / 2 + j * bw + 1;
      const y = pad.t + ih - bh;
      group.append(
        svg('rect', {
          x: s.cls === 'ghost' ? x + 0.7 : x,
          y: s.cls === 'ghost' ? y + 0.7 : y,
          width: Math.max(0, bw - 2 - (s.cls === 'ghost' ? 1.4 : 0)),
          height: Math.max(0, bh - (s.cls === 'ghost' ? 0.7 : 0)),
          rx: 3,
          class: s.cls,
        }),
      );
    });
    if (shown.has(i)) group.append(text(cx, H - 8, 'middle', p.label));
    const hit = svg('rect', { x: cx - slot / 2, y: pad.t, width: slot, height: ih, class: 'tip-hit' });
    hit.addEventListener('mousemove', (e) => (group.classList.add('hover'), showTip(e, p.tip)));
    hit.addEventListener('mouseleave', () => (group.classList.remove('hover'), hideTip()));
    group.prepend(svg('rect', { x: cx - slot / 2 + 2, y: pad.t, width: slot - 4, height: ih, rx: 4, class: 'hover-band' }));
    group.append(hit);
    el.append(group);
  });
  return el;
}

/**
 * Line chart. points: [{ label, value, tip }]. `step` puts value ticks on multiples of it (Deadlock tiers);
 * labels on both axes never repeat.
 */
export function lineChart({ points, height = 200, format = String, labelEvery = 1, width = 640, step = null }) {
  const W = width;
  const H = height;
  const pad = { l: 56, r: 10, t: 12, b: 26 };
  const values = points.map((p) => p.value);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) {
    lo -= step || 1;
    hi += step || 1;
  }
  const span = hi - lo;
  const nonNegative = lo >= 0;
  lo -= span * 0.1;
  if (nonNegative) lo = Math.max(0, lo);
  hi += span * 0.1;
  // With a step (Deadlock tiers) the axis spans whole steps, so the tiers on both sides get a label.
  if (step) {
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
  }
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i) => pad.l + (points.length < 2 ? iw / 2 : (iw * i) / (points.length - 1));
  const y = (v) => pad.t + ih - ((v - lo) / (hi - lo)) * ih;
  const el = chartSvg(W, H);
  for (const tk of valueTicks(lo, hi, { count: 3, step, format })) {
    el.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(tk.value), y2: y(tk.value), class: 'gridline' }), text(pad.l - 8, y(tk.value) + 4, 'end', tk.label));
  }
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
  if (points.length > 1) {
    el.append(svg('path', { d: `${d} L${x(points.length - 1)},${pad.t + ih} L${x(0)},${pad.t + ih} Z`, class: 'area' }));
    el.append(svg('path', { d, class: 'line' }));
  }
  const guide = svg('line', { x1: 0, x2: 0, y1: pad.t, y2: pad.t + ih, class: 'hover-line' });
  const marker = svg('circle', { cx: 0, cy: 0, r: 5, class: 'hover-dot' });
  el.append(guide);
  const labels = points.map((p) => p.label);
  const slot = points.length < 2 ? iw : iw / (points.length - 1);
  const shown = new Set(categoryTicks(labels, labelEvery, labelGap(labels, slot)));
  points.forEach((p, i) => {
    if (points.length <= 40) el.append(svg('circle', { cx: x(i), cy: y(p.value), r: 3.5, class: 'dot' }));
    if (shown.has(i)) el.append(text(x(i), H - 8, 'middle', p.label));
  });
  el.append(marker);
  points.forEach((p, i) => {
    const hit = svg('rect', { x: x(i) - slot / 2, y: pad.t, width: slot, height: ih, class: 'tip-hit' });
    hit.addEventListener('mousemove', (e) => {
      guide.setAttribute('x1', x(i));
      guide.setAttribute('x2', x(i));
      marker.setAttribute('cx', x(i));
      marker.setAttribute('cy', y(p.value));
      el.classList.add('hovering');
      showTip(e, p.tip);
    });
    hit.addEventListener('mouseleave', () => (el.classList.remove('hovering'), hideTip()));
    el.append(hit);
  });
  return el;
}

/** Horizontal bars: rows [{ label, value, share (0..1), text }]. */
export function barList(rows) {
  return h(
    'div',
    {},
    rows.map((r) =>
      h(
        'div',
        { class: 'bar-row' },
        h('div', { class: 'bar-top' }, h('div', { class: 'title' }, r.label), h('div', { class: 'num muted' }, r.text)),
        h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { width: `${Math.max(2, r.share * 100)}%` } })),
      ),
    ),
  );
}
