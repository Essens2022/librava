import { CONFIG } from './config.js?v=20261020205531';
import { t, getLang, setLang } from './i18n.js?v=20261020205531';
import { esc, $, $$ } from './util.js?v=20261020205531';
import { api, chooseBackend } from './api.js?v=20261020205531';
import { renderChrome, bindGlobal, icon, openDrawer, applyTheme, pathMode, setPathMode, currentPath, go, showConsent } from './ui.js?v=20261020205531';
import { viewHome, viewSearch, viewBook, viewCart, viewAccount, viewLibrary, viewHelp, viewLegal, spinner } from './views.js?v=20261020205531';
import { offline } from './offline.js?v=20261020205531';
import { viewReader } from './reader.js?v=20261020205531';
import { viewAdmin } from './admin.js?v=20261020205531';

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
  document.documentElement.classList.toggle('reading', reading);
  const bar = $('#demo-bar'); if (bar) bar.hidden = reading || !api.isDemo;
  openDrawer(false);
  document.querySelectorAll('.modal-wrap').forEach(m => m.remove());
  document.title = CONFIG.siteName;
  if (!reading) window.scrollTo(0, 0);
  el.innerHTML = reading ? '' : spinner;
  try {
    let res;
    switch (parts[0]) {
      case undefined: if (!navigator.onLine && offline.all().length && api.user()) { go('/library'); return; } res = await viewHome(el); break;
      case 'search': res = await viewSearch(el, q); break;
      case 'book': res = await viewBook(el, parts[1]); break;
      case 'cart': res = await viewCart(el); break;
      case 'account': res = await viewAccount(el, q, parts[1]); break;
      case 'library': res = await viewLibrary(el, q); break;
      case 'read': res = await viewReader(el, parts[1], q); break;
      case 'admin': res = await viewAdmin(el, parts.slice(1)); break;
      case 'help': res = viewHelp(el); break;
      case 'legal': res = await viewLegal(el, parts[1]); break;
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
  // on librava.store the address bar shows a shareable address: /book/<id>/ for a book (its cover appears
  // in WhatsApp & co.) and /<language>/ elsewhere (the site preview appears in the language of the person sharing)
  if (!pathMode && /(^|\.)librava\.store$/.test(location.hostname)) {
    const pretty = parts[0] === 'book' && parts[1] ? '/book/' + encodeURIComponent(parts[1]) + '/' : '/' + getLang() + '/';
    if (location.pathname !== pretty) try { history.replaceState(history.state, '', pretty + location.search + location.hash); } catch { }
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
  setTimeout(showConsent, 400);
}
boot();

// offline support on the live site (see /sw.js)
if ('serviceWorker' in navigator && /(^|\.)librava\.store$/.test(location.hostname)) {
  navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).then(reg => {
    const files = performance.getEntriesByType('resource').map(r => r.name).filter(u => u.startsWith(location.origin + '/assets/'));
    reg.active?.postMessage({ cache: files });
  }).catch(() => { });
}

// always run the newest version: if the site was updated since this page loaded (a phone may keep an old copy
// for a few minutes), reload once — on start and whenever the visitor comes back to the tab
(() => {
  const mine = (new URL(import.meta.url).searchParams.get('v')) || '';
  if (!mine || !/(^|\.)librava\.store$/.test(location.hostname)) return;
  let last = 0;
  const check = async () => {
    if (Date.now() - last < 60000) return; last = Date.now();
    try {
      const html = await (await fetch('/index.html', { cache: 'no-store' })).text();
      const live = /assets\/js\/app\.js\?v=(\d+)/.exec(html)?.[1];
      if (live && live !== mine && sessionStorage.getItem('librava:reloadedFor') !== live) {
        sessionStorage.setItem('librava:reloadedFor', live);
        location.reload();
      }
    } catch { }
  };
  check();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
})();
