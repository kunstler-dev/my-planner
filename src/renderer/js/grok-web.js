// grok.com with the user's own subscription: one persistent <webview> (own saved session) laid over a
// placeholder in the Grok tab. It stays alive between visits, so the page and the login don't reload.
const GROK_URL = 'https://grok.com/';
let host;
let webview;
let placeholder = null;
let raf = 0;

function ensure() {
  if (host) return;
  host = document.createElement('div');
  host.id = 'grok-web-host';
  webview = document.createElement('webview');
  webview.setAttribute('partition', 'persist:grok');
  webview.setAttribute('allowpopups', '');
  webview.setAttribute('src', GROK_URL);
  host.append(webview);
  document.body.append(host);
}

function follow() {
  raf = requestAnimationFrame(follow);
  if (!placeholder?.isConnected) return hideGrokWeb();
  const r = placeholder.getBoundingClientRect();
  host.style.transform = `translate(${r.left}px, ${r.top}px)`;
  host.style.width = `${r.width}px`;
  host.style.height = `${r.height}px`;
}

export function showGrokWeb(el) {
  ensure();
  placeholder = el;
  host.classList.add('visible');
  cancelAnimationFrame(raf);
  follow();
}

export function hideGrokWeb() {
  cancelAnimationFrame(raf);
  placeholder = null;
  host?.classList.remove('visible');
}

// Runs inside grok.com: puts the text into the message box without sending. The box is a ProseMirror editor
// (contenteditable); a synthetic paste keeps line breaks. A plain textarea is the fallback.
const FILL = `(text) => {
  const visible = (el) => el && el.offsetParent !== null;
  const editor = [...document.querySelectorAll('.ProseMirror[contenteditable="true"], [contenteditable="true"]')].find(visible);
  const head = text.slice(0, 20).trim();
  if (editor) {
    if (head && editor.innerText.includes(head)) return true;
    editor.focus();
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    if (editor.innerText.includes(head)) return true;
    document.execCommand('insertText', false, text);
    return editor.innerText.includes(head);
  }
  const ta = [...document.querySelectorAll('textarea')].find((t) => visible(t) && t.offsetHeight > 20);
  if (ta) {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    set.call(ta, text);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    return true;
  }
  return false;
}`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Puts `text` into grok.com's message box (the user presses Enter). Resolves false if the box wasn't found. */
export async function fillGrokWeb(text) {
  ensure();
  // The page is a SPA: wait for it to load and render the input (up to ~15 s).
  for (let i = 0; i < 30; i++) {
    try {
      if (await webview.executeJavaScript(`(${FILL})(${JSON.stringify(text)})`)) return true;
    } catch {
      // not attached yet or navigating
    }
    await wait(500);
  }
  return false;
}

export const grokWeb = {
  back: () => webview?.canGoBack?.() && webview.goBack(),
  reload: () => webview?.reload?.(),
  home: () => webview?.loadURL?.(GROK_URL),
  async logout() {
    await window.api.grokWeb.logout();
    webview?.loadURL?.(GROK_URL);
  },
};
