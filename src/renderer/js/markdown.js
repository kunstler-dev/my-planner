// Minimal, safe Markdown → HTML for chat answers: everything is escaped first, then a small set of
// constructs (code, bold, italic, links, headings, lists, paragraphs) is turned into tags.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
}

export function markdown(src) {
  const blocks = [];
  const parts = String(src).split(/```[\w-]*\n?([\s\S]*?)(?:```|$)/);
  parts.forEach((part, i) => {
    if (i % 2) {
      blocks.push(`<pre><code>${esc(part.replace(/\n$/, ''))}</code></pre>`);
      return;
    }
    let list = null;
    let para = [];
    const flushPara = () => {
      if (para.length) blocks.push(`<p>${para.join('<br>')}</p>`);
      para = [];
    };
    const flushList = () => {
      if (list) blocks.push(`<${list.tag}>${list.items.map((x) => `<li>${x}</li>`).join('')}</${list.tag}>`);
      list = null;
    };
    for (const raw of part.split('\n')) {
      const line = inline(esc(raw));
      const head = raw.match(/^(#{1,4})\s+(.*)/);
      const ul = raw.match(/^\s*[-*•]\s+(.*)/);
      const ol = raw.match(/^\s*\d+[.)]\s+(.*)/);
      if (!raw.trim()) {
        flushPara();
        flushList();
      } else if (head) {
        flushPara();
        flushList();
        blocks.push(`<h${head[1].length < 3 ? 3 : 4}>${inline(esc(head[2]))}</h${head[1].length < 3 ? 3 : 4}>`);
      } else if (ul || ol) {
        flushPara();
        const tag = ul ? 'ul' : 'ol';
        if (list?.tag !== tag) {
          flushList();
          list = { tag, items: [] };
        }
        list.items.push(inline(esc((ul || ol)[1])));
      } else if (/^\s*(---|\*\*\*)\s*$/.test(raw)) {
        flushPara();
        flushList();
      } else {
        flushList();
        para.push(line);
      }
    }
    flushPara();
    flushList();
  });
  return blocks.join('');
}
