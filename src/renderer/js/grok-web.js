// grok.com with the user's own subscription: one persistent <webview> (own saved session) laid over a
// placeholder in the Grok tab. It stays alive between visits, so the page and the login don't reload.
const GROK_URL = 'https://grok.com/';
let host;
let webview;
let ready = false;
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
  webview.addEventListener('dom-ready', () => (ready = true));
  webview.addEventListener('did-start-loading', () => (ready = false));
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

// Runs inside grok.com: puts the text into the visible message box (textarea or contenteditable) without sending.
const FILL = `(text) => {
  const visible = (el) => el && el.offsetParent !== null;
  const ta = [...document.querySelectorAll('textarea')].find(visible);
  if (ta) {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    set.call(ta, text);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    return true;
  }
  const ce = [...document.querySelectorAll('[contenteditable="true"]')].find(visible);
  if (ce) {
    ce.focus();
    document.execCommand('selectAll', false);
    document.execCommand('insertText', false, text);
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
    if (ready) {
      try {
        if (await webview.executeJavaScript(`(${FILL})(${JSON.stringify(text)})`)) return true;
      } catch {
        // page is navigating
      }
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
