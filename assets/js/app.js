import { CONFIG } from './config.js?v=20261019201923';
import { t, getLang, setLang } from './i18n.js?v=20261019201923';
import { esc, $, $$ } from './util.js?v=20261019201923';
import { api, chooseBackend } from './api.js?v=20261019201923';
import { renderChrome, bindGlobal, icon, openDrawer, applyTheme, pathMode, setPathMode, currentPath } from './ui.js?v=20261019201923';
import { viewHome, viewSearch, viewBook, viewCart, viewAccount, viewLibrary, viewHelp, spinner } from './views.js?v=20261019201923';
import { viewReader } from './reader.js?v=20261019201923';
import { viewAdmin } from './admin.js?v=20261019201923';

let cleanup = null, seq = 0;

async function route() {
  if (pathMode) {
    // an old "#/x" link opened on the server version → turn it into the clean address
    if (location.hash.startsWith('#/')) history.replaceState(null, '', location.hash.slice(1) || '/');
  } else if (location.hash === '#/' || location.hash === '#') {
    // home page shows as plain https://librava.store (no "#/")
    history.replaceState(null, '', location.pathname + location.search);
  }
  let raw = currentPath();
  try { raw = decodeURI(raw); } catch { }
  let [path, qs = ''] = raw.split('?');
  path = path.split('#')[0];
  const q = new URLSearchParams(qs.split('#')[0]);
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (cleanup) { try { cleanup(); } catch { } cleanup = null; }
  const my = ++seq;
  // every navigation renders into its own fresh container: a slower, older page can never overwrite a newer one
  const app = $('#app');
  const el = document.createElement('div');
  el.className = 'route';
  app.replaceChildren(el);
  const reading = parts[0] === 'read';
  $('#hdr').hidden = reading; $('#foot').hidden = reading;
  const bar = $('#demo-bar'); if (bar) bar.hidden = reading || !api.isDemo;
  openDrawer(false);
  document.querySelectorAll('.modal-wrap').forEach(m => m.remove());
  document.title = CONFIG.siteName;
  if (!reading) window.scrollTo(0, 0);
  el.innerHTML = reading ? '' : spinner;
  try {
    let res;
    switch (parts[0]) {
      case undefined: res = await viewHome(el); break;
      case 'search': res = await viewSearch(el, q); break;
      case 'book': res = await viewBook(el, parts[1]); break;
      case 'cart': res = await viewCart(el); break;
      case 'account': res = await viewAccount(el, q, parts[1]); break;
      case 'library': res = await viewLibrary(el, q); break;
      case 'read': res = await viewReader(el, parts[1], q); break;
      case 'admin': res = await viewAdmin(el, parts.slice(1)); break;
      case 'help': res = viewHelp(el); break;
      default: res = await viewHome(el);
    }
    if (my !== seq) { if (typeof res === 'function') res(); return; }
    cleanup = typeof res === 'function' ? res : null;
  } catch (e) {
    console.error(e);
    if (my !== seq) return;
    if (!el.isConnected) return;
    el.innerHTML = `<div class="wrap page"><div class="panel empty">${icon('info')}<p>${esc(t('common.error', { msg: e.message || e }))}</p><a class="btn btn-dark" href="#/">${esc(t('book.backHome'))}</a></div></div>`;
  }
  // highlight current strip link
  const navKey = parts[0] === 'search' ? (q.get('cat') ? 'cat-' + q.get('cat') : q.get('price') === 'free' ? 'free' : q.get('deals') ? 'deals' : q.get('sort') === 'newest' ? 'new' : '') : parts[0] || '';
  $$('.subnav [data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === navKey));
}

function rerender() { renderChrome(); route(); }

// shown on the live domain while the real server (hosting) is not connected yet
function comingSoon() {
  $('#hdr').hidden = true; $('#foot').hidden = true;
  $('#app').innerHTML = `<div class="soon"><div class="soon-card">
    <div class="soon-logo">${esc(CONFIG.siteName)}</div>
    <h1>${esc(t('soon.title'))}</h1>
    <p>${esc(t('soon.text'))}</p>
    ${CONFIG.supportEmail ? `<a class="btn btn-dark" href="mailto:${esc(CONFIG.supportEmail)}">${esc(CONFIG.supportEmail)}</a>` : ''}
  </div></div>`;
}

async function boot() {
  await setLang(getLang(), { remember: false });
  applyTheme();
  if (!(await chooseBackend())) { comingSoon(); return; }
  setPathMode(!!api.isServer);
  if (api.isDemo) {
    const b = document.createElement('div');
    b.id = 'demo-bar'; b.className = 'demo-bar'; b.textContent = t('common.demoBanner');
    $('#hdr').after(b);
  }
  try { await api.init(); }
  catch (e) {
    $('#app').innerHTML = `<div class="wrap page"><div class="panel empty"><p>${esc(t('common.error', { msg: e.message }))}</p></div></div>`;
    return;
  }
  renderChrome();
  bindGlobal();
  api.onAuthChange(() => rerender());
  window.addEventListener('librava:rerender', () => { const b = $('#demo-bar'); if (b) b.textContent = t('common.demoBanner'); rerender(); });
  window.addEventListener('hashchange', () => { if (!pathMode || location.hash.startsWith('#/')) route(); });
  window.addEventListener('popstate', () => { if (pathMode) route(); });
  window.addEventListener('librava:navigate', route);
  // Stripe sends the buyer back to ?paid=1#/library — move the flag into the hash route
  if (!pathMode && new URLSearchParams(location.search).get('paid')) {
    history.replaceState(null, '', location.pathname + '#/library?paid=1');
  }
  route();
}
boot();
