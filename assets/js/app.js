import { CONFIG } from './config.js?v=20261028134158';
import { t, getLang, setLang } from './i18n.js?v=20261028134158';
import { esc, $, $$ } from './util.js?v=20261028134158';
import { api, chooseBackend } from './api.js?v=20261028134158';
import { renderChrome, bindGlobal, icon, openDrawer, applyTheme, pathMode, setPathMode, currentPath, go, showConsent, catSlug, setupDropZones, navStack, saveNav } from './ui.js?v=20261028134158';
import { viewHome, viewSearch, viewBook, viewCart, viewAccount, viewLibrary, viewWelcome, viewHelp, viewLegal, spinner } from './views.js?v=20261028134158';
import { trackPage } from './track.js?v=20261028134158';
import { offline } from './offline.js?v=20261028134158';
import { viewReader } from './reader.js?v=20261028134158';
import { viewAdmin } from './admin.js?v=20261028134158';

// the store draws its pages itself: the browser must not jump to an old scroll position after a refresh
try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch { }
let firstShown = false;
// free guides (/<lang>/guide/<slug>/) are written out on the server for Google; the store only shows them again
const PRE_GUIDE = document.querySelector('#app .seo-guide')?.outerHTML || null;
async function viewGuide(el, slug) {
  const want = `/${(document.querySelector('#app [data-guide-lang]')?.dataset.guideLang) || 'en'}/guide/${slug ? encodeURIComponent(slug) + '/' : ''}`;
  let html = PRE_GUIDE && document.createRange().createContextualFragment(PRE_GUIDE).firstElementChild?.dataset.guidePath === want ? PRE_GUIDE : null;
  if (!html) {
    const r = await fetch(want, { cache: 'no-cache' });
    if (!r.ok) throw new Error('Not found');
    html = new DOMParser().parseFromString(await r.text(), 'text/html').querySelector('.seo-guide')?.outerHTML;
    if (!html) throw new Error('Not found');
  }
  el.innerHTML = html;
  const h1 = el.querySelector('h1'); if (h1) document.title = h1.textContent + ' | ' + CONFIG.siteName;
}
let cleanup = null, seq = 0;
// "Back" like Amazon: where the visitor was on each page, to put them back there
let lastKey = null; const scrollMem = {};

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
  // the pages visited in this tab: coming back to the previous one restores its scroll position
  const key = raw || '/';
  if (lastKey != null && lastKey !== key) scrollMem[lastKey] = window.scrollY;
  const st = navStack(); let isBack = false;
  if (st.length >= 2 && st[st.length - 2] === key) { st.pop(); isBack = true; }
  else if (st[st.length - 1] !== key) st.push(key);
  saveNav(st); lastKey = key;
  // every navigation renders into its own fresh container: a slower, older page can never overwrite a newer one
  const app = $('#app');
  const el = document.createElement('div');
  el.className = 'route';
  app.replaceChildren(el);
  const reading = parts[0] === 'read';
  $('#hdr').hidden = reading; $('#foot').hidden = reading;
  document.documentElement.classList.toggle('reading', reading);
  const bar = $('#demo-bar'); if (bar) bar.hidden = reading || !api.isDemo;
  // on phones: a "‹ Back" bar under the header on every page but the home page
  let bb = $('#backbar');
  if (!bb) { $('#hdr').insertAdjacentHTML('afterend', '<nav id="backbar" class="backbar" hidden></nav>'); bb = $('#backbar'); }
  bb.hidden = reading || !parts[0];
  if (!bb.hidden) bb.innerHTML = `<button type="button" class="bb-back" data-goback>${icon('chevL')} ${esc(t('nav.back'))}</button><a class="bb-home" href="#/">${icon('home')} ${esc(t('nav.home'))}</a>`;
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
      case 'welcome': res = await viewWelcome(el, q); break;
      case 'read': res = await viewReader(el, parts[1], q); break;
      case 'admin': res = await viewAdmin(el, parts.slice(1)); break;
      case 'help': res = viewHelp(el); break;
      case 'legal': res = await viewLegal(el, parts[1]); break;
      case 'guide': res = await viewGuide(el, parts[1]); break;
      default: res = await viewHome(el);
    }
    if (my !== seq) { if (typeof res === 'function') res(); return; }
    // a refresh opens at the top of the page, not half hidden under the bar (the phone used to put back an old position)
    if (!reading && !firstShown) { firstShown = true; window.scrollTo(0, 0); requestAnimationFrame(() => window.scrollTo(0, 0)); }
    else if (!reading && isBack && scrollMem[key]) { const y = scrollMem[key]; requestAnimationFrame(() => window.scrollTo(0, y)); setTimeout(() => { if (my === seq) window.scrollTo(0, y); }, 300); }
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
    // the same addresses Google knows: /book/<id>/, /<lang>/<category>/ and /<lang>/
    const onlyCat = parts[0] === 'search' && q.get('cat') && [...q.keys()].every(k => k === 'cat');
    const gp = parts[0] === 'guide' ? el.querySelector('[data-guide-path]')?.dataset.guidePath : null;
    // public pages without a page of their own (all books, new, deals, free, a search, help, legal) get /go/<page>:
    // some apps cut everything after "#" when a link is sent, so the address itself must name the page (404.html opens it)
    const goPage = !gp && ['search', 'help', 'legal'].includes(parts[0]) && !onlyCat;
    const pretty = gp ? gp : parts[0] === 'book' && parts[1] ? '/book/' + encodeURIComponent(parts[1]) + '/' : onlyCat ? `/${getLang()}/${catSlug(q.get('cat'))}/` : goPage ? '/go' + (path.startsWith('/') ? '' : '/') + encodeURI(path) + (qs ? '?' + qs.split('#')[0] : '') : '/' + getLang() + '/';
    if (goPage) { const u = pretty; if (location.pathname + location.search !== u || location.hash) try { history.replaceState(history.state, '', u); } catch { } }
    else if (location.pathname !== pretty) try { history.replaceState(history.state, '', pretty + location.search + location.hash); } catch { }
  }
  trackPage();
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
  setupDropZones();
  api.onAuthChange(() => rerender());
  window.addEventListener('librava:rerender', () => { const b = $('#demo-bar'); if (b) b.textContent = t('common.demoBanner'); rerender(); });
  // the browser's Back/Forward: on librava.store the address also changes its path (/book/<id>/), and then Chrome
  // sends only "popstate", not "hashchange" — listen to both and draw the page once
  const onNav = () => {
    let k = currentPath(); try { k = decodeURI(k); } catch { }
    if ((k || '/') !== lastKey) route();
  };
  window.addEventListener('hashchange', () => { if (!pathMode || location.hash.startsWith('#/')) onNav(); });
  window.addEventListener('popstate', () => { if (pathMode) route(); else onNav(); });
  window.addEventListener('librava:navigate', route);
  // Stripe sends the buyer back to ?paid=1#/library — move the flag into the hash route
  if (!pathMode && new URLSearchParams(location.search).get('paid')) {
    // paid without an account: Stripe also adds sid=<session> and the buyer creates the account on /welcome
    const sid = new URLSearchParams(location.search).get('sid');
    history.replaceState(null, '', location.pathname + (sid ? '#/welcome?sid=' + encodeURIComponent(sid) : '#/library?paid=1'));
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
      // the page a reload would actually give (the /ro/, /it/… pages are rebuilt a minute after the main one)
      const html = await (await fetch(location.pathname + (location.pathname.endsWith('/') ? 'index.html' : ''), { cache: 'no-store' })).text();
      const live = /assets\/js\/app\.js\?v=(\d+)/.exec(html)?.[1];
      const here = location.hash.slice(1) || location.pathname;
      const busy = window.__libravaDirty || /^\/(admin\/(new|edit|offers\/|promos\/|notifications|settings)|read\/|cart)/.test(here) || document.activeElement?.matches?.('input, textarea, select');
      if (live && live !== mine && busy) return;   // later, when the page is free — never lose what someone is typing
      if (live && live !== mine && sessionStorage.getItem('librava:reloadedFor') !== live) {
        sessionStorage.setItem('librava:reloadedFor', live);
        location.reload();
      }
    } catch { }
  };
  check();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('hashchange', () => check());   // moving around the site (e.g. between admin tabs)
})();
