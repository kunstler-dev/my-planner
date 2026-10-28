// Small monochrome SVG charts with a hover tooltip.
import { h, svg } from './ui.js';

let tip;
function tooltip() {
  if (!tip) {
    tip = h('div', { class: 'tooltip' });
    document.body.append(tip);
  }
  return tip;
}
function bindTip(el, text) {
  el.addEventListener('mousemove', (e) => {
    const t = tooltip();
    t.textContent = text;
    t.style.left = `${e.clientX + 12}px`;
    t.style.top = `${e.clientY - 34}px`;
    t.classList.add('show');
  });
  el.addEventListener('mouseleave', () => tooltip().classList.remove('show'));
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
}

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
  const el = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart' });
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ih - (ih * i) / 4;
    el.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: 'gridline' }));
    const label = svg('text', { x: pad.l - 8, y: y + 4, 'text-anchor': 'end', class: 'axis' });
    label.textContent = format((max * i) / 4);
    el.append(label);
  }
  points.forEach((p, i) => {
    const cx = pad.l + slot * i + slot / 2;
    const group = svg('g');
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
    const label = svg('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'axis' });
    label.textContent = p.label;
    group.append(label);
    const hit = svg('rect', { x: cx - slot / 2, y: pad.t, width: slot, height: ih, class: 'tip-hit' });
    bindTip(hit, p.tip);
    group.append(hit);
    el.append(group);
  });
  return el;
}

/** Line chart. points: [{ label, value, tip }]. */
export function lineChart({ points, height = 200, format = String, labelEvery = 1, width = 640 }) {
  const W = width;
  const H = height;
  const pad = { l: 56, r: 10, t: 12, b: 26 };
  const values = points.map((p) => p.value);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const span = hi - lo;
  const nonNegative = lo >= 0;
  lo -= span * 0.1;
  if (nonNegative) lo = Math.max(0, lo);
  hi += span * 0.1;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i) => pad.l + (points.length < 2 ? iw / 2 : (iw * i) / (points.length - 1));
  const y = (v) => pad.t + ih - ((v - lo) / (hi - lo)) * ih;
  const el = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart' });
  for (let i = 0; i <= 3; i++) {
    const v = lo + ((hi - lo) * i) / 3;
    el.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'gridline' }));
    const label = svg('text', { x: pad.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'axis' });
    label.textContent = format(v);
    el.append(label);
  }
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
  if (points.length > 1) {
    el.append(svg('path', { d: `${d} L${x(points.length - 1)},${pad.t + ih} L${x(0)},${pad.t + ih} Z`, class: 'area' }));
    el.append(svg('path', { d, class: 'line' }));
  }
  points.forEach((p, i) => {
    if (points.length <= 40) el.append(svg('circle', { cx: x(i), cy: y(p.value), r: 3.5, class: 'dot' }));
    if (i % labelEvery === 0 || i === points.length - 1) {
      const label = svg('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', class: 'axis' });
      label.textContent = p.label;
      el.append(label);
    }
    const w = points.length < 2 ? iw : iw / (points.length - 1);
    const hit = svg('rect', { x: x(i) - w / 2, y: pad.t, width: w, height: ih, class: 'tip-hit' });
    bindTip(hit, p.tip);
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
