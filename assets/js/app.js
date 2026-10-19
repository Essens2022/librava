import { CONFIG, IS_DEMO } from './config.js';
import { t, getLang, setLang } from './i18n.js';
import { esc, $, $$ } from './util.js';
import { api } from './api.js';
import { renderChrome, bindGlobal, icon, openDrawer } from './ui.js';
import { viewHome, viewSearch, viewBook, viewCart, viewAccount, viewLibrary, viewHelp, spinner } from './views.js';
import { viewReader } from './reader.js';
import { viewAdmin } from './admin.js';

let cleanup = null, seq = 0;

async function route() {
  const raw = decodeURI(location.hash.slice(1)) || '/';
  let [path, qs = ''] = raw.split('?');
  path = path.split('#')[0];
  const q = new URLSearchParams(qs.split('#')[0]);
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (cleanup) { try { cleanup(); } catch { } cleanup = null; }
  const my = ++seq;
  const el = $('#app');
  const reading = parts[0] === 'read';
  $('#hdr').hidden = reading; $('#foot').hidden = reading;
  const bar = $('#demo-bar'); if (bar) bar.hidden = reading || !IS_DEMO;
  openDrawer(false);
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
      case 'account': res = await viewAccount(el, q); break;
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
    el.innerHTML = `<div class="wrap page"><div class="panel empty">${icon('info')}<p>${esc(t('common.error', { msg: e.message || e }))}</p><a class="btn btn-dark" href="#/">${esc(t('book.backHome'))}</a></div></div>`;
  }
  // highlight current strip link
  const navKey = parts[0] === 'search' ? (q.get('cat') ? 'cat-' + q.get('cat') : q.get('price') === 'free' ? 'free' : q.get('deals') ? 'deals' : q.get('sort') === 'newest' ? 'new' : '') : parts[0] || '';
  $$('.subnav [data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === navKey));
}

function rerender() { renderChrome(); route(); }

async function boot() {
  setLang(getLang());
  if (IS_DEMO) {
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
  window.addEventListener('hashchange', route);
  // Stripe sends the buyer back to ?paid=1#/library — move the flag into the hash route
  if (new URLSearchParams(location.search).get('paid')) {
    history.replaceState(null, '', location.pathname + '#/library?paid=1');
  }
  route();
}
boot();
