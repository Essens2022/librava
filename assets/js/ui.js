import { CONFIG } from './config.js?v=20261022171235';
import { t, money, getLang, setLang, LANGS, langName } from './i18n.js?v=20261022171235';
import { esc, store, $, $$ } from './util.js?v=20261022171235';

// ---------------- theme: light by default, the visitor can switch ----------------
export const THEMES = ['light', 'dark', 'auto'];
export function getTheme() { const v = store.get('theme'); return THEMES.includes(v) ? v : 'light'; }
export function applyTheme(v = getTheme()) {
  const root = document.documentElement;
  if (v === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', v);
  const dark = v === 'dark' || (v === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#111C1D' : '#1C2B2D');
}
export const themePills = () => `<div class="lang-pills">${THEMES.map(v => `<button class="pill ${v === getTheme() ? 'on' : ''}" data-theme-set="${v}">${esc(t('theme.' + v))}</button>`).join('')}</div>`;
import { legalText, LEGAL_VERSION } from './legal.js?v=20261022171235';
import { suggest, highlight } from './search.js?v=20261022171235';
import { track, trackPage } from './track.js?v=20261022171235';
import { initGA, stopGA } from './ga.js?v=20261022171235';
import { api } from './api.js?v=20261022171235';

// ---------------- icons ----------------
const P = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/>',
  cart: '<path d="M2.5 4h2.2l2.3 10.3a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20.5 7H6"/><circle cx="9.5" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  book: '<path d="M3 5.5C5 4.5 8 4.3 12 6c4-1.7 7-1.5 9-.5V19c-2-1-5-1.2-9 .5-4-1.7-7-1.5-9-.5Z"/><path d="M12 6v13.5"/>',
  library: '<rect x="3" y="4" width="4" height="16" rx="1"/><rect x="8.5" y="4" width="4" height="16" rx="1"/><path d="M14.5 5.2l3.8-1 3.7 15-3.8 1z"/>',
  chevL: '<path d="M15 18l-6-6 6-6"/>', home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>', chevR: '<path d="M9 6l6 6-6 6"/>', chevD: '<path d="M6 9l6 6 6-6"/>',
  bookmark: '<path d="M6 3h12v18l-6-4.5L6 21z"/>',
  toc: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r=".6"/><circle cx="4.5" cy="12" r=".6"/><circle cx="4.5" cy="18" r=".6"/>',
  type: '<path d="M3 19L8.5 5 14 19M5 14h7"/><path d="M15.5 12.2c.6-1 1.6-1.5 2.8-1.5 1.7 0 2.7 1 2.7 2.8V19M21 15.6c-.7-.3-1.5-.4-2.3-.4-1.7 0-2.9.8-2.9 2 0 1.1.9 1.9 2.2 1.9 1.4 0 2.6-.9 3-2"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21M8 11h6M11 8v6"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21M8 11h6"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  devices: '<rect x="2" y="5" width="13" height="10" rx="1.5"/><path d="M5 19h7"/><rect x="16" y="8" width="6" height="12" rx="1.5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  filter: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17.2v.1"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  box: '<path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5L12 12l9-4.5M12 12v9"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.1"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9s1.2-6.4 3.7-9z"/>',
  file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  shield: '<path d="M12 3l8 3v6c0 4.6-3.3 8.3-8 9-4.7-.7-8-4.4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1-.8-1.4-.8-2.3 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};
export function icon(name, cls = 'ico') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}
const STAR = '<path d="M12 2.8l2.8 6.1 6.6.7-4.9 4.5 1.4 6.6L12 17.3l-5.9 3.4 1.4-6.6-4.9-4.5 6.6-.7z"/>';
export function stars(v) {
  let s = '<span class="stars" aria-label="' + (v || 0) + ' / 5">';
  for (let i = 1; i <= 5; i++) {
    const fill = v >= i ? 1 : v >= i - 0.5 ? 0.5 : 0;
    const id = 'g' + Math.random().toString(36).slice(2, 8);
    s += fill === 0.5
      ? `<svg viewBox="0 0 24 24"><defs><linearGradient id="${id}"><stop offset="50%" stop-color="currentColor"/><stop offset="50%" stop-color="transparent"/></linearGradient></defs><path d="${STAR.match(/d="([^"]+)"/)[1]}" fill="url(#${id})" stroke="currentColor" stroke-width="1.4"/></svg>`
      : `<svg viewBox="0 0 24 24"><path d="${STAR.match(/d="([^"]+)"/)[1]}" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.4"/></svg>`;
  }
  return s + '</span>';
}
export const starPath = STAR;

export const LOGO_MARK = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 8.5c3.8-1.6 8-1.4 13 1.2v17.6c-5-2.6-9.2-2.8-13-1.2z" fill="#93C572"/><path d="M29 8.5c-3.8-1.6-8-1.4-13 1.2v17.6c5-2.6 9.2-2.8 13-1.2z" fill="#C9E4AE"/><path d="M16 9.7V27.3" stroke="#1C2B2D" stroke-width="1.2"/><circle cx="16" cy="5" r="2.4" fill="#F2A541"/></svg>`;
export function logoHTML() {
  const n = CONFIG.siteName;
  return `${LOGO_MARK}<span class="logo-word">${esc(n.slice(0, -2))}<i>${esc(n.slice(-2))}</i></span>`;
}

// categories like the Amazon Kindle store; the first ones are shown in the top bar
export const CATS = ['fiction', 'mystery', 'romance', 'scifi', 'kids', 'teen', 'selfhelp', 'health', 'business', 'cooking', 'education', 'hobby',
  'biography', 'history', 'religion', 'parenting', 'science', 'computers', 'arts', 'comics', 'humor', 'travel', 'sports', 'languages',
  'reference', 'politics', 'engineering', 'medical', 'law', 'lgbtq'];
// address of a category page, the same as tools/book-pages.mjs writes: /<lang>/<name-in-that-language>/
export function catSlug(c) { const s = String(t('cat.' + c)).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' ').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, ''); return s.length >= 3 ? s : c; }
export const MAIN_CATS = ['fiction', 'mystery', 'romance', 'scifi', 'kids', 'selfhelp', 'health', 'business', 'cooking', 'education'];

// ---------------- cart ----------------
export const cart = {
  get() { return store.get('cart', []); },
  has(id) { return this.get().includes(id); },
  add(id) { const c = this.get(); if (!c.includes(id)) { c.push(id); store.set('cart', c); track('add_cart', { book_id: id }); } updateCartCount(); },
  remove(id) { store.set('cart', this.get().filter(x => x !== id)); updateCartCount(); },
  set(ids) { store.set('cart', ids); updateCartCount(); },
  clear() { store.set('cart', []); updateCartCount(); },
};
export function updateCartCount() { $$('.cart-count').forEach(el => el.textContent = cart.get().length); }

// ---------------- navigation ----------------
// Two address styles: "#/book/x" (static hosting, e.g. GitHub Pages) or clean "/book/x" (own server).
export let pathMode = false;
export function setPathMode(v) { pathMode = !!v; }
export function currentPath() { return pathMode ? location.pathname + location.search : (location.hash.slice(1) || '/'); }
export function go(path) {
  if (pathMode) {
    if (location.pathname + location.search !== path) history.pushState(null, '', path);
    window.dispatchEvent(new Event('librava:navigate'));
    return;
  }
  if (location.hash === '#' + path) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = path;
}
export function link(path) { return pathMode ? path : '#' + path; }

// ---------------- the visitor's way through the site (for "Back" like Amazon) ----------------
// every page visited in this tab, so "Back" returns to the page before instead of opening a new one
const NAV_KEY = 'librava:nav';
export function navStack() { try { return JSON.parse(sessionStorage.getItem(NAV_KEY)) || []; } catch { return []; } }
export function saveNav(st) { try { sessionStorage.setItem(NAV_KEY, JSON.stringify(st.slice(-60))); } catch { } }
// back to the previous page of the site; with nothing before it (opened from a link), go to `fallback`
export function goBack(fallback = '/') {
  if (navStack().length >= 2) history.back(); else go(fallback);
}
// to `path`: if it is the page we just came from, step back to it (so the phone's Back doesn't loop)
export function backOr(path) {
  const st = navStack();
  if (st.length >= 2 && st[st.length - 2].split('?')[0] === path) history.back(); else go(path);
}
// in clean-address mode every "#/x" link printed by the views becomes "/x"
export function fixLinks(root = document) {
  if (!pathMode) return;
  root.querySelectorAll('a[href^="#/"]').forEach(a => a.setAttribute('href', a.getAttribute('href').slice(1) || '/'));
}

// ---------------- header / drawer / footer ----------------
export function renderChrome() {
  const u = api.user();
  const hello = u ? t('nav.hello', { name: esc(u.name.split(' ')[0]) }) : t('nav.helloGuest');
  const catOpts = CATS.map(c => `<option value="${c}">${esc(t('cat.' + c))}</option>`).join('');
  const searchForm = (id) => `<form class="search" role="search" data-search>
      <select aria-label="${esc(t('search.category'))}" name="cat" id="${id}-cat"><option value="">${esc(t('nav.all'))}</option>${catOpts}</select>
      <input type="search" name="q" id="${id}-q" placeholder="${esc(t('nav.searchPlaceholder'))}" aria-label="${esc(t('nav.searchPlaceholder'))}" autocomplete="off" enterkeyhint="search">
      <button type="submit" aria-label="${esc(t('nav.searchPlaceholder'))}">${icon('search')}</button></form>`;
  $('#hdr').innerHTML = `
  <div class="hdr-main"><div class="wrap hdr-row">
    <button class="hdr-btn menu-icon-only" data-drawer aria-label="${esc(t('nav.menu'))}">${icon('menu')}</button>
    <a class="logo" href="#/" aria-label="${esc(CONFIG.siteName)}">${logoHTML()}</a>
    <span class="spacer"></span>
    ${searchForm('s1')}
    ${langBtn('hdr-btn')}
    <a class="hdr-btn hdr-account" href="#/account"><span><small>${hello}</small><b class="acc-label">${u ? esc(t('nav.account')) : esc(t('acc.signIn'))}</b></span><span class="menu-icon-only">${icon('user')}</span></a>
    <a class="hdr-btn hdr-lib" href="#/library"><span><small>${esc(t('nav.libraryShort'))}</small><b>${esc(t('nav.library'))}</b></span></a>
    <button class="hdr-btn bell-btn" data-bell aria-label="${esc(t('ntf.title'))}">${icon('bell')}<span class="bell-count" hidden></span></button>
    <a class="hdr-btn cart-btn" href="#/cart" aria-label="${esc(t('nav.cart'))}">${icon('cart')}<span class="cart-count">0</span><b class="cart-label">${esc(t('nav.cart'))}</b></a>
  </div>
  <div class="wrap hdr-mobile-search">${searchForm('s2')}</div></div>
  <div class="hdr-sub"><nav class="wrap subnav" aria-label="${esc(t('nav.browse'))}">
    <button class="menu-btn" data-drawer>${icon('menu')} ${esc(t('nav.all'))}</button>
    <a href="#/search?lang=all" data-nav="all">${esc(t('nav.allBooks'))}</a>
    <a href="#/search?sort=newest" data-nav="new">${esc(t('nav.new'))}</a>
    <a href="#/search?deals=1" data-nav="deals">${esc(t('nav.deals'))}</a>
    <a href="#/search?price=free" data-nav="free">${esc(t('nav.free'))}</a>
    ${MAIN_CATS.map(c => `<a href="#/search?cat=${c}" data-nav="cat-${c}">${esc(t('cat.' + c))}</a>`).join('')}
    <a href="#/library" data-nav="library">${esc(t('nav.library'))}</a>
    ${u?.isAdmin ? `<a href="#/admin" data-nav="admin">${icon('gear')} ${esc(t('nav.admin'))}</a>` : ''}
  </nav></div>`;

  $('#drawer').innerHTML = `
    <div class="drawer-head"><span class="drawer-hello">${icon('user')} ${hello}</span>${langBtn('drawer-lang')}</div>
    <div class="drawer-body">
      <h3>${esc(t('nav.browse'))}</h3>
      <a href="#/search?lang=all" class="drawer-all"><b>${esc(t('nav.allBooks'))}</b> ${icon('chevR')}</a>
      ${CATS.map(c => `<a href="#/search?cat=${c}">${esc(t('cat.' + c))} ${icon('chevR')}</a>`).join('')}
      <hr>
      <a href="#/search?sort=newest">${esc(t('nav.new'))}</a>
      <a href="#/search?deals=1">${esc(t('nav.deals'))}</a>
      <a href="#/search?price=free">${esc(t('nav.free'))}</a>
      <hr>
      <a href="#/library">${esc(t('nav.library'))} ${icon('library')}</a>
      <a href="#/account">${esc(u ? t('acc.title') : t('acc.signIn'))} ${icon('user')}</a>
      ${u?.isAdmin ? `<a href="#/admin">${esc(t('nav.admin'))} ${icon('gear')}</a>` : ''}
      <a href="#/help">${esc(t('nav.help'))} ${icon('help')}</a>
      <hr>
      <h3>${esc(t('nav.theme'))}</h3>
      ${themePills()}
      ${u ? `<hr><button class="dlink" data-signout>${esc(t('acc.signOut'))} ${icon('logout')}</button>` : ''}
    </div>`;

  const year = new Date().getFullYear();
  $('#foot').innerHTML = `
    <button class="to-top" data-top>${esc(t('common.backToTop'))}</button>
    <footer class="foot"><div class="wrap">
      <div class="foot-cols">
        <div><h4>${esc(t('foot.about'))}</h4><p>${esc(t('foot.aboutText', { site: CONFIG.siteName }))}</p></div>
        <div><h4>${esc(t('foot.help'))}</h4><a href="#/help">${esc(t('foot.howRead'))}</a><a href="#/help">${esc(t('foot.payments'))}</a><a href="#/legal/withdrawal">${esc(legalText(getLang()).title.withdrawal)}</a></div>
        <div><h4>${esc(t('foot.legal'))}</h4>${['terms', 'privacy', 'cookies', 'imprint'].map(p => `<a href="#/legal/${p}">${esc(legalText(getLang()).title[p])}</a>`).join('')}<a href="javascript:void 0" data-cookie-settings>${esc(legalText(getLang()).consentSettings || 'Cookie settings')}</a></div>
        <div><h4>${esc(t('nav.browse'))}</h4>${CATS.slice(0, 5).map(c => `<a href="#/search?cat=${c}">${esc(t('cat.' + c))}</a>`).join('')}</div>
        <div><h4>${esc(t('foot.contact'))}</h4><p style="user-select:all">${esc(CONFIG.supportEmail)}</p></div>
      </div>
      <div class="foot-bottom">
        ${langBtn('foot-lang')}
        ${themePills()}
        <a class="logo" href="#/">${logoHTML()}</a>
        <span>${esc(t('foot.rights', { year, site: CONFIG.siteName }))}</span>
      </div>
    </div></footer>`;
  updateCartCount();
  refreshBell();
}

// ---------------- language button & picker ----------------
export function langBtn(cls) {
  const l = getLang();
  return `<button class="lang-btn ${cls}" data-lang-open aria-label="${esc(t('nav.chooseLanguage'))}: ${esc(langName(l))}">${icon('globe')}<b>${l.toUpperCase()}</b>${icon('chevD', 'ico chev')}</button>`;
}
export function openLangPicker() {
  const cur = getLang();
  modal(`<div class="lang-head"><h2>${icon('globe')} ${esc(t('nav.chooseLanguage'))}</h2><button class="rd-btn" data-close aria-label="${esc(t('nav.close'))}">${icon('close')}</button></div>
    <div class="lang-list" role="listbox" aria-label="${esc(t('nav.chooseLanguage'))}">
      ${LANGS.map(([code, native]) => `<button role="option" aria-selected="${code === cur}" class="lang-opt ${code === cur ? 'on' : ''}" data-lang="${code}" lang="${code}">
        <span class="lang-code">${code.toUpperCase()}</span><span class="lang-native">${esc(native)}</span>${code === cur ? icon('check') : ''}</button>`).join('')}
    </div>`, { onMount(m) { m.classList.add('lang-modal'); m.querySelector('.lang-opt.on')?.focus(); } });
}

export function openDrawer(open) {
  $('#drawer').classList.toggle('open', open);
  $('#scrim').hidden = !open;
  requestAnimationFrame(() => $('#scrim').classList.toggle('open', open));
  $('#drawer-close').classList.toggle('open', open);
}

// ---------------- book card ----------------
// "From the author" (A+) modules shown on the book page
export function aplusHTML(mods = []) {
  const img = im => im && (im.url || im.ref) ? `<img src="${esc(im.url || im.ref)}" alt="" loading="lazy">` : '';
  const txt = (title, text, tag = 'h3') => `${title ? `<${tag}>${esc(title)}</${tag}>` : ''}${text ? `<p>${esc(text).replace(/\n/g, '<br>')}</p>` : ''}`;
  const filled = m => (m.imgs || []).some(i => i && (i.url || i.ref)) || m.title || m.text || (m.caps || []).some(c => c && (c.title || c.text));
  return `<div class="aplus">${mods.filter(filled).map(m => {
    if (m.type === 'banner') return `<div class="ap-banner">${img(m.imgs?.[0])}${m.title ? `<h3>${esc(m.title)}</h3>` : ''}</div>`;
    if (m.type === 'header') return `<div class="ap-header">${img(m.imgs?.[0])}${txt(m.title, m.text)}</div>`;
    if (m.type === 'image_text') return `<div class="ap-it-view ${m.side === 'right' ? 'right' : ''}">${img(m.imgs?.[0])}<div>${txt(m.title, m.text)}</div></div>`;
    if (m.type === 'three') return `<div class="ap-three-view">${[0, 1, 2].map(k => `<div>${img(m.imgs?.[k])}${txt(m.caps?.[k]?.title, m.caps?.[k]?.text, 'h4')}</div>`).join('')}</div>`;
    if (m.type === 'text') return `<div class="ap-text-view">${txt(m.title, m.text)}</div>`;
    return '';
  }).join('')}</div>`;
}
export function coverHTML(b, { badge = true } = {}) {
  const disc = b.list_price_cents && b.list_price_cents > b.price_cents ? Math.round((1 - b.price_cents / b.list_price_cents) * 100) : 0;
  const bd = !badge ? '' : !b.price_cents ? `<span class="badge free">${esc(t('book.free'))}</span>` : disc ? `<span class="badge">-${disc}%</span>` : '';
  const img = b.cover_url ? `<img src="${esc(b.cover_url)}" alt="${esc(b.title)}" loading="lazy" decoding="async">` : `<span class="ph">${esc(b.title)}</span>`;
  return `<div class="cover">${bd}${img}</div>`;
}
export function priceHTML(b) {
  if (!b.price_cents) return `<span class="price price-free">${esc(t('book.free'))}</span>`;
  const old = b.list_price_cents && b.list_price_cents > b.price_cents ? `<span class="price-old">${money(b.list_price_cents)}</span>` : '';
  return `<span class="price">${money(b.price_cents)}</span>${old}`;
}
export function ratingHTML(b) {
  if (!b.rating_count) return '';
  return `<div class="rating-line">${stars(b.rating_avg)} <span class="muted">${b.rating_count}</span></div>`;
}
const quickAdd = b => `<button type="button" class="quick-add ${cart.has(b.id) ? 'in' : ''}" data-quick-add="${esc(b.id)}" aria-label="${esc(t('book.addToCart'))}" title="${esc(t('book.addToCart'))}">${cart.has(b.id) ? '✓' : '+'}</button>`;
// "Title: Subtitle", like Amazon (no double colon when the title already ends with punctuation)
export function fullTitle(b) {
  const tt = String(b.title || '').trim(), st = String(b.subtitle || '').trim();
  if (!st) return tt;
  return /[:.?!—–-]$/.test(tt) || /^[—–-]/.test(st) ? `${tt} ${st}` : `${tt}: ${st}`;
}
export function cardHTML(b) {
  return `<a class="card" href="#/book/${encodeURIComponent(b.id)}">
    <div class="cover-wrap">${coverHTML(b)}${quickAdd(b)}</div>
    <div class="card-title" title="${esc(fullTitle(b))}">${esc(fullTitle(b))}</div>
    <div class="card-author">${esc(b.author)}</div>
    ${ratingHTML(b)}
    <div class="card-meta"><span class="fmt">${esc(t('book.color.' + (b.color === 'bw' ? 'bw' : 'color')))} · ${esc((b._fmts || [b.format]).map(f => t('book.formatShort.' + f)).join(' · '))}</span></div>
    <div>${priceHTML(b)}</div>
  </a>`;
}
export function rcardHTML(b) {
  return `<a class="rcard" href="#/book/${encodeURIComponent(b.id)}">
    <div class="cover-wrap">${coverHTML(b)}${quickAdd(b)}</div>
    <div class="rinfo">
      <div class="card-title" title="${esc(fullTitle(b))}">${esc(fullTitle(b))}</div>
      <div class="card-author">${esc(t('book.by', { author: b.author }))}</div>
      ${ratingHTML(b)}
      <div class="card-meta"><span class="fmt">${esc(t('book.color.' + (b.color === 'bw' ? 'bw' : 'color')))} · ${esc((b._fmts || [b.format]).map(f => t('book.formatShort.' + f)).join(' · '))}</span>${b.pages ? `<span>${b.pages} p.</span>` : ''}</div>
      <div>${priceHTML(b)}</div>
      <div class="muted" style="font-size:12px">${esc(t('cart.digital'))}</div>
    </div>
  </a>`;
}

// ---------------- toast & modal ----------------
export function toast(msg, { error = false, ms = 3200 } = {}) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (error ? ' err' : '');
  el.setAttribute('role', 'status');
  el.innerHTML = icon(error ? 'info' : 'check') + `<span>${esc(msg)}</span>`;
  box.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 320); }, ms);
}
export function modal(html, { onMount } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  onMount && onMount(wrap.querySelector('.modal'), close);
  return close;
}
export function confirmBox(text, { ok = t('common.confirm'), danger = false } = {}) {
  return new Promise(res => {
    modal(`<p style="margin:0;font-size:16px">${esc(text)}</p>
      <div class="actions"><button class="btn btn-ghost" data-close data-no>${esc(t('admin.cancel'))}</button>
      <button class="btn ${danger ? 'btn-dark' : 'btn-buy'}" data-yes>${esc(ok)}</button></div>`, {
      onMount(m, close) {
        m.querySelector('[data-yes]').onclick = () => { close(); res(true); };
        m.querySelector('[data-no]').onclick = () => { close(); res(false); };
      }
    });
  });
}

export function errText(e) {
  const m = e && e.message ? e.message : String(e);
  return /^[a-z]+\.[a-zA-Z.]+$/.test(m) ? t(m) : m;
}

// Drag & drop for every upload box on the site: drop a file (or photo) on any file field and it is
// picked exactly as if chosen with the button. Boxes that already handle dropping keep their own way.
let dropsReady = false;
export function setupDropZones() {
  if (dropsReady) return; dropsReady = true;
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  const zoneOf = el => {
    if (!(el instanceof Element)) return null;
    if (el.matches('input[type=file]')) return { zone: el.closest('label, .field') || el, input: el };
    const z = el.closest('label, .drop, .field, [data-dropzone]');
    const input = z && (z.querySelector('input[type=file]') || (z.htmlFor && document.getElementById(z.htmlFor)?.matches('input[type=file]') && document.getElementById(z.htmlFor)));
    return input && !input.disabled ? { zone: z, input } : null;
  };
  const accepts = (input, f) => {
    const acc = (input.accept || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    if (!acc.length) return true;
    const name = f.name.toLowerCase(), type = (f.type || '').toLowerCase();
    return acc.some(a => a.startsWith('.') ? name.endsWith(a) : a.endsWith('/*') ? type.startsWith(a.slice(0, -1)) : type === a);
  };
  let lit = null;
  const light = z => { if (lit && lit !== z) lit.classList.remove('drag-over', 'over'); lit = z; z?.classList.add(z.classList.contains('drop') ? 'over' : 'drag-over'); };
  document.addEventListener('dragover', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();                         // never let the browser open the file and leave the page
    const hit = zoneOf(e.target);
    e.dataTransfer.dropEffect = hit ? 'copy' : 'none';
    light(hit && !hit.zone.dataset.drop ? hit.zone : null);
  });
  document.addEventListener('dragleave', e => { if (!e.relatedTarget) light(null); });
  document.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); light(null);
    const hit = zoneOf(e.target); if (!hit) return;
    // boxes with their own drop handling already took the file
    if (hit.zone.classList.contains('drop') && hit.zone.dataset.drop) return;
    const files = [...e.dataTransfer.files].filter(f => accepts(hit.input, f));
    if (!files.length) { toast(t('drop.wrongType'), { error: true }); return; }
    const dt = new DataTransfer(); (hit.input.multiple ? files : files.slice(0, 1)).forEach(f => dt.items.add(f));
    hit.input.files = dt.files;
    hit.input.dispatchEvent(new Event('input', { bubbles: true }));
    hit.input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

export function bindGlobal() {
  if (pathMode) {
    fixLinks();
    let pending = false;
    new MutationObserver(() => { if (pending) return; pending = true; queueMicrotask(() => { pending = false; fixLinks(); }); })
      .observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', e => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      let a = e.target.closest('a[href]');
      if (!a || a.target || a.hasAttribute('download')) return;
      let href = a.getAttribute('href');
      if (href.startsWith('#/')) href = href.slice(1) || '/';
      if (!href.startsWith('/') || href.startsWith('//') || href.startsWith('/api/')) return;
      e.preventDefault();
      go(href);
    });
  } else {
    // hash links stay in the same page even when the address bar shows /it/ or /book/<id>/
    document.addEventListener('click', e => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest('a[href^="#/"]');
      if (!a || a.target) return;
      e.preventDefault();
      const h = a.getAttribute('href');
      if (location.hash === h) window.dispatchEvent(new Event('librava:navigate')); else location.hash = h;
    });
  }
  // book pages open at once: the full book is read as soon as the mouse rests on a card (or a finger touches it)
  const bookIdOf = a => { const m = /(?:^|#)\/book\/([^/?#]+)/.exec(a.getAttribute('href') || ''); return m ? decodeURIComponent(m[1]) : null; };
  let hoverT = null;
  document.addEventListener('pointerover', e => {
    const a = e.target.closest?.('a[href*="/book/"]'); clearTimeout(hoverT); if (!a) return;
    hoverT = setTimeout(() => { const id = bookIdOf(a); if (id) api.getBook(id).catch(() => { }); }, 90);
  }, { passive: true });
  document.addEventListener('touchstart', e => { const a = e.target.closest?.('a[href*="/book/"]'); const id = a && bookIdOf(a); if (id) api.getBook(id).catch(() => { }); }, { passive: true });
  document.addEventListener('submit', e => {
    const f = e.target.closest('[data-search]');
    if (!f) return;
    e.preventDefault();
    const q = f.q.value.trim(), cat = f.cat.value;
    rememberSearch(q);
    const p = new URLSearchParams(); if (q) p.set('q', q); if (cat) p.set('cat', cat);
    f.q.blur();
    go('/search?' + p.toString());
  });
  // the “+” on book covers: add to cart without opening the book
  document.addEventListener('click', async e => {
    const qa = e.target.closest('[data-quick-add]');
    if (qa) {
      e.preventDefault(); e.stopPropagation();
      const id = qa.dataset.quickAdd;
      if (await api.owns(id).catch(() => null)) { toast(t('cart.owned')); return; }
      if (cart.has(id)) { toast(t('book.inCart')); return; }
      cart.add(id); toast(t('cart.added'));
      $$(`[data-quick-add="${CSS.escape(id)}"]`).forEach(b => { b.classList.add('in', 'pop'); b.textContent = '✓'; });
      return;
    }
  }, true);
  document.addEventListener('click', async e => {
    if (e.target.closest('[data-drawer]')) { openDrawer(true); return; }
    if (e.target.closest('#scrim') || e.target.closest('#drawer-close')) { openDrawer(false); return; }
    if (e.target.closest('#drawer a')) openDrawer(false);
    const tb = e.target.closest('[data-theme-set]');
    if (e.target.closest('[data-bell]')) { openBell(); return; }
    if (tb) { store.set('theme', tb.dataset.themeSet); applyTheme(); openDrawer(false); renderChrome(); window.dispatchEvent(new Event('librava:themechange')); return; }
    if (e.target.closest('[data-lang-open]')) { openLangPicker(); return; }
    const lb = e.target.closest('.lang-opt[data-lang]');   // only the language picker (other lists also carry data-lang)
    if (lb) {
      lb.closest('.modal-wrap')?.remove();
      await setLang(lb.dataset.lang);
      openDrawer(false);
      window.dispatchEvent(new Event('librava:rerender'));
      return;
    }
    if (e.target.closest('[data-cookie-settings]')) { e.preventDefault(); showConsent(true); return; }
    if (e.target.closest('[data-goback]')) { e.preventDefault(); goBack('/'); return; }
    if (e.target.closest('[data-top]')) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (e.target.closest('[data-signout]')) { openDrawer(false); await api.signOut(); go('/'); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { openDrawer(false); document.querySelector('.lang-modal')?.closest('.modal-wrap')?.remove(); } });
}

// ---------------------------------------------------------------- consent on the first visit
export function showConsent(force) {
  if (!force && store.get('consent') === LEGAL_VERSION) { initGA(); return; }
  if (document.querySelector('.consent')) return;
  const L = legalText(getLang());
  const box = document.createElement('div');
  box.className = 'consent'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', L.consentTitle);
  box.innerHTML = `<div class="consent-in"><div><b>${esc(L.consentTitle)}</b><p>${esc(L.consentText)}</p>
      <p class="consent-links"><a href="#/legal/terms">${esc(L.title.terms)}</a> · <a href="#/legal/privacy">${esc(L.title.privacy)}</a> · <a href="#/legal/cookies">${esc(L.title.cookies)}</a></p></div>
    <div class="consent-btns"><button class="btn btn-ghost" data-consent-min>${esc(L.consentNecessary || 'Necessary only')}</button><button class="btn btn-buy" data-consent-ok>${esc(L.consentOk)}</button></div></div>`;
  document.body.appendChild(box);
  const save = choice => { store.set('consent', LEGAL_VERSION); store.set('consent_at', new Date().toISOString()); store.set('analytics', choice); box.remove(); };
  box.querySelector('[data-consent-ok]').onclick = () => { save('granted'); initGA(); trackPage(true); };
  box.querySelector('[data-consent-min]').onclick = () => { save('denied'); stopGA(); };
}

// ---------------------------------------------------------------- notifications from Librava (bell in the header)
let notifCache = null;
export async function refreshBell(force) {
  try {
    if (!notifCache || force) notifCache = (await api.notifications?.()) || [];
    const lang = getLang(), read = new Set(store.get('notif:read', []));
    const mine = notifCache.filter(n => !n.lang || n.lang === lang);
    const unread = mine.filter(n => !read.has(n.id)).length;
    $$('.bell-count').forEach(b => { b.textContent = unread > 9 ? '9+' : unread; b.hidden = !unread; });
    // the bell is always visible (also on phones); the red number shows only when there is something new
    return mine;
  } catch { return []; }
}
// one notification, Amazon-style: icon, time, title, text and the books it is about (cover, price, button)
const NTF_ICON = { new_book: 'book', price_drop: 'tag', free_book: 'bolt', sale: 'tag', coupon: 'tag', series: 'library', picks: 'bookmark', new_week: 'bell' };
function ago(d) {
  const s = Math.max(1, (Date.now() - new Date(d)) / 1000), rtf = new Intl.RelativeTimeFormat(getLang(), { numeric: 'auto' });
  return s < 3600 ? rtf.format(-Math.round(s / 60), 'minute') : s < 86400 ? rtf.format(-Math.round(s / 3600), 'hour') : s < 86400 * 30 ? rtf.format(-Math.round(s / 86400), 'day') : new Date(d).toLocaleDateString(getLang());
}
export function ntfCardHTML(n, books = [], { preview = false } = {}) {
  const bs = books.filter(Boolean);
  const link = safeLink(n.link) || (bs.length === 1 ? `#/book/${encodeURIComponent(bs[0].id)}` : '');
  const priceOf = b => { const d = b.list_price_cents > b.price_cents ? Math.round((1 - b.price_cents / b.list_price_cents) * 100) : 0;
    return b.price_cents ? `<b>${money(b.price_cents)}</b>${d ? ` <s>${money(b.list_price_cents)}</s> <span class="badge">-${d}%</span>` : ''}` : `<b>${esc(t('book.free'))}</b>`; };
  const one = bs.length === 1 ? `<div class="ntf-book"><a href="#/book/${encodeURIComponent(bs[0].id)}" data-close>${bs[0].cover_url ? `<img src="${esc(bs[0].cover_url)}" alt="">` : ''}</a>
      <div><a href="#/book/${encodeURIComponent(bs[0].id)}" data-close class="ntf-bt">${esc(bs[0].title)}</a><span class="muted">${esc(t('book.by', { author: bs[0].author }))}</span><span class="ntf-price">${priceOf(bs[0])}</span>
      <a class="btn btn-buy btn-sm" href="#/book/${encodeURIComponent(bs[0].id)}" data-close>${esc(t('promo.ctaBook'))}</a></div></div>` : '';
  const many = bs.length > 1 ? `<div class="ntf-books">${bs.map(b => `<a href="#/book/${encodeURIComponent(b.id)}" data-close title="${esc(b.title)}">${b.cover_url ? `<img src="${esc(b.cover_url)}" alt="${esc(b.title)}">` : `<span class="ph">${esc(b.title)}</span>`}<span class="ntf-price">${priceOf(b)}</span></a>`).join('')}</div>` : '';
  return `<article class="ntf2 ${n.unread ? 'unread' : ''}"><span class="ntf-ico">${icon(NTF_ICON[n.kind] || 'bell')}</span><div class="ntf-main">
    <div class="ntf-top"><span class="ntf-brand" aria-label="${esc(CONFIG.siteName)}">${logoHTML()}</span><small class="muted">${preview ? esc(t('ntf.now')) : esc(ago(n.created_at))}</small></div>
    <div class="ntf-title">${esc(n.title)}</div>${n.body ? `<p>${esc(n.body)}</p>` : ''}${one}${many}
    ${link && bs.length !== 1 ? `<a class="ntf-more" href="${esc(link)}" data-close>${esc(t('ntf.open'))} →</a>` : ''}</div></article>`;
}
export async function openBell() {
  const list = await refreshBell(true);
  const read = new Set(store.get('notif:read', []));
  const ids = [...new Set(list.flatMap(n => n.book_ids || []))];
  const books = Object.fromEntries((await Promise.all(ids.map(id => api.getBook(id).catch(() => null)))).filter(Boolean).map(b => [b.id, b]));
  store.set('notif:read', [...new Set([...store.get('notif:read', []), ...list.map(n => n.id)])].slice(-300));
  refreshBell();
  modal(`<div class="ntf-head"><h2 style="margin:0">${esc(t('ntf.title'))}</h2><button class="btn btn-ghost btn-sm" data-close>✕</button></div>
    ${list.length ? `<div class="ntf-list">${list.map(n => ntfCardHTML({ ...n, unread: !read.has(n.id) }, (n.book_ids || []).map(id => books[id]))).join('')}</div>`
      : `<div class="ntf-empty">${icon('bell')}<p class="muted">${esc(t('ntf.empty'))}</p></div>`}`, { onMount: m => m.classList.add('ntf-modal') });
}

// ---------------------------------------------------------------- promotions (banners chosen by the shop owner)
export const PROMO_THEMES = ['forest', 'night', 'sunset', 'berry', 'ocean', 'sand', 'store', 'midnight', 'orange', 'coral', 'wine', 'gold', 'emerald', 'royal', 'slate', 'mint', 'sky', 'blush', 'lavender', 'cream'];
// light backgrounds get dark text
export const LIGHT_THEMES = ['sand', 'mint', 'sky', 'blush', 'lavender', 'cream'];
// title fonts for banners: Literata is Librava's own; Inter/Figtree are close to Amazon's clean sans
export const PROMO_FONTS = [['literata', "'Literata', Georgia, serif"], ['figtree', "'Figtree', system-ui, sans-serif"], ['inter', "'Inter', system-ui, sans-serif"], ['montserrat', "'Montserrat', system-ui, sans-serif"],
  ['oswald', "'Oswald', 'Arial Narrow', sans-serif"], ['bebas', "'Bebas Neue', 'Oswald', sans-serif"], ['playfair', "'Playfair Display', Georgia, serif"], ['merriweather', "'Merriweather', Georgia, serif"],
  ['dmserif', "'DM Serif Display', Georgia, serif"], ['nunito', "'Nunito', system-ui, sans-serif"]];
const hexOk = c => /^#[0-9a-f]{6}$/i.test(c || '');
const lum = c => { const n = parseInt(c.slice(1), 16), f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(n >> 16) + .7152 * f((n >> 8) & 255) + .0722 * f(n & 255); };
// class + inline style for a banner: a ready theme, or two colours chosen by the owner, plus the title font
export function promoLook(p) {
  const font = PROMO_FONTS.find(f => f[0] === p.font);
  if (p.theme === 'custom' && hexOk(p.bg_from) && hexOk(p.bg_to)) {
    const light = (lum(p.bg_from) + lum(p.bg_to)) / 2 > 0.45;
    return { cls: `theme-custom ${light ? 'theme-light' : ''} ${font ? 'font-' + font[0] : ''}`, style: `--bg:linear-gradient(115deg,${p.bg_from},${p.bg_to});${font ? `--pfont:${font[1]};` : ''}` };
  }
  const th = PROMO_THEMES.includes(p.theme) ? p.theme : 'forest';
  return { cls: `theme-${th} ${LIGHT_THEMES.includes(th) ? 'theme-light' : ''} ${font ? 'font-' + font[0] : ''}`, style: font ? `--pfont:${font[1]};` : '' };
}
export const safeLink = l => { const s = String(l || '').trim(); return /^#\//.test(s) || /^https:\/\//i.test(s) ? s : ''; };
const promoLink = (p, b) => safeLink(p.link) || (b ? `#/book/${encodeURIComponent(b.id)}` : '#/search');
// one slide; `b` is the book when the banner promotes a book
export function promoHTML(p, b, placement = p.placement, list = []) {
  if (p.kind === 'books') return promoBooksHTML(p, list, placement);
  const link = promoLink(p, b), ext = /^https:/i.test(link) ? ' target="_blank" rel="noopener"' : '';
  const title = p.title || (b ? b.title : ''), sub = p.subtitle ?? (b ? b.subtitle || '' : '');
  const cta = p.cta || t(b ? 'promo.ctaBook' : 'promo.cta');
  const look = promoLook(p);
  const attrs = `class="promo promo-${placement} promo-${p.kind} ${look.cls}" style="${esc(look.style)}" data-promo="${esc(p.id)}" href="${esc(link)}"${ext}`;
  if (p.kind === 'image' && p.image_url) {
    return `<a ${attrs} aria-label="${esc(title || cta)}"><picture>${p.image_mobile_url ? `<source media="(max-width: 700px)" srcset="${esc(p.image_mobile_url)}">` : ''}<img src="${esc(p.image_url)}" alt="${esc(title)}" decoding="async"></picture>
      ${title || p.kicker ? `<span class="promo-over"><span class="wrap">${p.kicker ? `<span class="promo-kicker">${esc(p.kicker)}</span>` : ''}${title ? `<b>${esc(title)}</b>` : ''}${sub ? `<span class="promo-sub">${esc(sub)}</span>` : ''}${p.cta ? `<span class="btn btn-buy">${esc(p.cta)}</span>` : ''}</span></span>` : ''}</a>`;
  }
  const disc = b && b.list_price_cents > b.price_cents ? Math.round((1 - b.price_cents / b.list_price_cents) * 100) : 0;
  const price = b ? (b.price_cents ? `<span class="promo-price"><b>${money(b.price_cents)}</b>${disc ? ` <s>${money(b.list_price_cents)}</s> <span class="badge">-${disc}%</span>` : ''}</span>` : `<span class="promo-price"><b>${esc(t('book.free'))}</b></span>`) : '';
  const save = b && disc ? `<span class="promo-save">${esc(t('book.save', { amount: money(b.list_price_cents - b.price_cents), pct: disc }))}</span>` : '';
  const rating = b?.rating_count ? `<span class="promo-rating">${stars(b.rating_avg)} <span>${b.rating_count}</span></span>` : '';
  return `<a ${attrs.replace('class="promo ', 'class="promo promo-one ')}>${b?.cover_url ? `<span class="promo-bg" style="background-image:url('${esc(b.cover_url)}')"></span>` : ''}<span class="wrap promo-in">
      <span class="promo-text">${p.kicker ? `<span class="promo-kicker">${esc(p.kicker)}</span>` : ''}<span class="promo-title">${esc(title)}</span>
        ${sub ? `<span class="promo-sub">${esc(sub)}</span>` : ''}${b ? `<span class="promo-by">${esc(t('book.by', { author: b.author }))}</span>` : ''}${rating}</span>
      ${b?.cover_url ? `<span class="promo-cover"><img src="${esc(b.cover_url)}" alt="${esc(b.title)}" ${placement === 'hero' ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></span>` : ''}
      <span class="promo-act">${price}${save}<span class="btn btn-buy promo-cta">${esc(cta)}</span><span class="promo-note">${icon('bolt')} ${esc(t('book.instant'))}</span></span>
    </span></a>`;
}
// several books in one banner (like Amazon's "Deals in…" cards): each cover opens its book
function promoBooksHTML(p, list, placement) {
  const books = list.filter(Boolean).slice(0, 8);
  const anyDeal = books.some(b => b.list_price_cents > b.price_cents);
  const link = safeLink(p.link) || (anyDeal ? '#/search?deals=1' : '#/search?sort=newest'), ext = /^https:/i.test(link) ? ' target="_blank" rel="noopener"' : '';
  const look = promoLook(p);
  return `<div class="promo promo-${placement} promo-books ${look.cls}" style="${esc(look.style)}" data-promo="${esc(p.id)}"><div class="wrap promo-in">
    <div class="promo-text">${p.kicker ? `<span class="promo-kicker">${esc(p.kicker)}</span>` : ''}${p.title ? `<span class="promo-title">${esc(p.title)}</span>` : ''}
      ${p.subtitle ? `<span class="promo-sub">${esc(p.subtitle)}</span>` : ''}<a class="btn btn-buy promo-cta" href="${esc(link)}"${ext}>${esc(p.cta || t('promo.ctaBooks'))}</a></div>
    <div class="promo-shelf n${books.length}">${books.map(b => { const d = b.list_price_cents > b.price_cents ? Math.round((1 - b.price_cents / b.list_price_cents) * 100) : 0;
      return `<a class="pb" href="#/book/${encodeURIComponent(b.id)}" title="${esc(b.title)} · ${esc(b.price_cents ? money(b.price_cents) : t('book.free'))}">${b.cover_url ? `<img src="${esc(b.cover_url)}" alt="${esc(b.title)}" loading="lazy" decoding="async">` : `<span class="ph">${esc(b.title)}</span>`}${d ? `<span class="badge">-${d}%</span>` : ''}</a>`; }).join('')}</div>
  </div></div>`;
}
// several slides: fade carousel with arrows, dots, swipe and auto-play (paused on hover, focus or reduced motion)
export function carouselHTML(slides, placement) {
  if (slides.length === 1) return `<div class="promo-carousel single ${placement}">${slides[0]}</div>`;
  return `<div class="promo-carousel ${placement}" role="region" aria-roledescription="carousel" aria-label="${esc(t('promo.label'))}">
    <div class="promo-track">${slides.map((s, i) => `<div class="promo-slide ${i ? '' : 'on'}" role="group" aria-roledescription="slide" aria-label="${i + 1} / ${slides.length}" ${i ? 'aria-hidden="true" inert' : ''}>${s}</div>`).join('')}</div>
    <button type="button" class="promo-nav prev" aria-label="${esc(t('promo.prev'))}">‹</button><button type="button" class="promo-nav next" aria-label="${esc(t('promo.next'))}">›</button>
    <div class="promo-dots">${slides.map((_, i) => `<button type="button" class="${i ? '' : 'on'}" aria-label="${esc(t('promo.go', { n: i + 1 }))}"></button>`).join('')}</div></div>`;
}
export function mountPromos(root) {
  const seen = new Set(JSON.parse(sessionStorage.getItem('librava:promoSeen') || '[]'));
  const view = el => { const id = el?.querySelector('[data-promo]')?.dataset.promo || el?.dataset?.promo; if (!id || seen.has(id)) return; seen.add(id); try { sessionStorage.setItem('librava:promoSeen', JSON.stringify([...seen])); } catch { } api.promoHit?.(id, 'view'); };
  root.querySelectorAll('[data-promo]').forEach(a => a.addEventListener('click', () => api.promoHit?.(a.dataset.promo, 'click')));
  root.querySelectorAll('.promo-carousel.single, .promo-strip-wrap').forEach(c => view(c.querySelector('[data-promo]')));
  root.querySelectorAll('.promo-carousel:not(.single)').forEach(c => {
    const slides = [...c.querySelectorAll('.promo-slide')], dots = [...c.querySelectorAll('.promo-dots button')];
    let i = 0, timer = null, paused = false;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const go = n => {
      i = (n + slides.length) % slides.length;
      slides.forEach((s, k) => { s.classList.toggle('on', k === i); s.toggleAttribute('inert', k !== i); s.setAttribute('aria-hidden', k === i ? 'false' : 'true'); });
      dots.forEach((d, k) => d.classList.toggle('on', k === i));
      view(slides[i]);
    };
    const play = () => { clearInterval(timer); if (!reduce && !paused) timer = setInterval(() => { if (!c.isConnected) return clearInterval(timer); if (!document.hidden) go(i + 1); }, 7000); };
    c.querySelector('.prev').onclick = () => { go(i - 1); play(); };
    c.querySelector('.next').onclick = () => { go(i + 1); play(); };
    dots.forEach((d, k) => d.onclick = () => { go(k); play(); });
    c.addEventListener('mouseenter', () => { paused = true; clearInterval(timer); });
    c.addEventListener('mouseleave', () => { paused = false; play(); });
    c.addEventListener('focusin', () => { paused = true; clearInterval(timer); });
    c.addEventListener('focusout', () => { paused = false; play(); });
    let x0 = null, moved = false;
    c.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; moved = false; }, { passive: true });
    c.addEventListener('touchmove', e => { if (x0 != null && Math.abs(e.touches[0].clientX - x0) > 10) moved = true; }, { passive: true });
    c.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 45) { go(i + (dx < 0 ? 1 : -1)); play(); } });
    c.addEventListener('click', e => { if (moved) { e.preventDefault(); moved = false; } }, true);
    view(slides[0]); play();
  });
}

// ---------------------------------------------------------------- search box suggestions (like Amazon)
const RECENT = 'recentSearches';
export function rememberSearch(q) { q = String(q || '').trim(); if (!q) return; const r = store.get(RECENT, []).filter(x => x.toLowerCase() !== q.toLowerCase()); r.unshift(q); store.set(RECENT, r.slice(0, 8)); }
let suggBooks = null;
async function suggCatalog() { if (!suggBooks) { suggBooks = await api.listBooks({}); setTimeout(() => { suggBooks = null; }, 60000); } return suggBooks; }
function setupSuggest() {
  let box = null, form = null, items = [], active = -1, timer = null, lastQ = null;
  const close = () => { box?.remove(); box = null; items = []; active = -1; form?.q?.setAttribute('aria-expanded', 'false'); };
  const pickUrl = it => it.type === 'book' ? '/book/' + encodeURIComponent(it.book.id) : it.type === 'cat' ? '/search?cat=' + it.cat : '/search?q=' + encodeURIComponent(it.label);
  const choose = it => { const q = form.q.value.trim(); if (it.type === 'query' || it.type === 'recent') { rememberSearch(it.label); form.q.value = it.label; } else rememberSearch(q); close(); form.q.blur(); go(it.type === 'query' || it.type === 'recent' ? '/search?' + new URLSearchParams({ q: it.label, ...(form.cat?.value ? { cat: form.cat.value } : {}) }) : pickUrl(it)); };
  const mark = i => { active = i; box?.querySelectorAll('[role=option]').forEach((o, k) => o.setAttribute('aria-selected', k === i ? 'true' : 'false')); const id = i >= 0 ? box?.querySelectorAll('[role=option]')[i]?.id : ''; form.q.setAttribute('aria-activedescendant', id || ''); };
  const render = async () => {
    const q = form.q.value, nq = q.trim(); lastQ = q;
    const cat = form.cat?.value || '';
    let list = [];
    if (!nq) list = store.get(RECENT, []).slice(0, 6).map(label => ({ type: 'recent', label }));
    else {
      let books = await suggCatalog();
      if (cat) books = books.filter(b => b.category === cat || (b.categories || []).includes(cat));
      const L = getLang(), mine = books.filter(b => b.language === L);
      list = suggest(q, mine, 8);
      if (list.filter(x => x.type === 'book').length < 3) { const more = suggest(q, books, 8).filter(x => !list.some(y => y.type === x.type && y.label === x.label && y.book?.id === x.book?.id)); list = [...list, ...more].slice(0, 8); }
      list.unshift({ type: 'query', label: nq });
    }
    if (form.q.value !== lastQ) return;
    if (!list.length) return close();
    items = list;
    if (!box) { box = document.createElement('div'); box.className = 'sugg'; box.id = form.q.id + '-list'; box.setAttribute('role', 'listbox'); form.appendChild(box); form.q.setAttribute('aria-controls', box.id); }
    form.q.setAttribute('aria-expanded', 'true');
    const hl = s => highlight(s, nq, esc);
    box.innerHTML = (nq ? '' : `<div class="sugg-head">${esc(t('sugg.recent'))}</div>`) + list.map((it, i) => {
      const id = `${box.id}-${i}`;
      if (it.type === 'book') { const b = it.book; return `<div role="option" id="${id}" class="sugg-item sugg-book" data-i="${i}">${b.cover_url ? `<img src="${esc(b.cover_url)}" alt="" loading="lazy">` : `<span class="sugg-ph"></span>`}<span class="sugg-txt"><span class="sugg-title">${hl(b.title)}</span><span class="sugg-sub">${esc(t('book.by', { author: b.author }))}${b.language && b.language !== getLang() ? ' · ' + esc(b.language.toUpperCase()) : ''}</span></span><span class="sugg-price">${b.price_cents ? money(b.price_cents) : esc(t('book.free'))}</span></div>`; }
      const ic = { query: 'search', recent: 'clock', author: 'user', series: 'library', cat: 'grid' }[it.type] || 'search';
      const hint = it.type === 'author' ? t('sugg.author') : it.type === 'series' ? t('sugg.series') : it.type === 'cat' ? t('sugg.cat') : '';
      return `<div role="option" id="${id}" class="sugg-item" data-i="${i}">${icon(ic)}<span class="sugg-txt">${it.type === 'recent' ? esc(it.label) : hl(it.label)}${hint ? ` <span class="sugg-hint">${esc(hint)}</span>` : ''}</span>${it.type === 'recent' ? `<button type="button" class="sugg-x" data-x="${i}" aria-label="${esc(t('sugg.remove'))}">×</button>` : ''}</div>`;
    }).join('');
    mark(-1);
  };
  document.addEventListener('input', e => {
    const f = e.target.closest?.('[data-search]'); if (!f || e.target.name !== 'q') return;
    if (form !== f) { close(); form = f; }
    clearTimeout(timer); timer = setTimeout(render, 90);
  });
  document.addEventListener('focusin', e => { const f = e.target.closest?.('[data-search]'); if (f && e.target.name === 'q') { if (form !== f) close(); form = f; render(); } });
  document.addEventListener('keydown', e => {
    if (!box || !form || e.target !== form.q) return;
    const n = items.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); mark((active + 1) % n); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mark(active <= 0 ? n - 1 : active - 1); }
    else if (e.key === 'Escape') { close(); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(items[active]); }
  });
  document.addEventListener('mousedown', e => {
    if (!box) return;
    const x = e.target.closest('.sugg-x');
    if (x) { e.preventDefault(); const it = items[+x.dataset.x]; store.set(RECENT, store.get(RECENT, []).filter(r => r !== it.label)); render(); return; }
    const o = e.target.closest('.sugg-item');
    if (o && box.contains(o)) { e.preventDefault(); choose(items[+o.dataset.i]); return; }
    if (!e.target.closest('[data-search]')) close();
  });
  document.addEventListener('mouseover', e => { const o = e.target.closest?.('.sugg-item'); if (o && box?.contains(o)) mark(+o.dataset.i); });
  window.addEventListener('hashchange', close);
  document.addEventListener('submit', e => { if (e.target.closest('[data-search]')) close(); }, true);
}
setupSuggest();

// pictures in banners fade in once loaded (no flash of half-drawn images)
const fadeIn = img => { if (img.complete && img.naturalWidth) img.classList.add('ld'); else { img.addEventListener('load', () => img.classList.add('ld'), { once: true }); img.addEventListener('error', () => img.classList.add('ld'), { once: true }); } };
new MutationObserver(() => document.querySelectorAll('.promo-cover img:not(.ld), .pb-cover img:not(.ld), .hero-fan img:not(.ld)').forEach(fadeIn)).observe(document.documentElement, { childList: true, subtree: true });

// multi-book banners: covers get the largest height at which they all fit in one row (computer/tablet);
// on phones they keep a fixed size and scroll sideways
function fitShelves() {
  document.querySelectorAll('.promo-books .promo-shelf').forEach(sh => {
    if (innerWidth <= 760 || sh.closest('.pr-live-frame.phone')) { sh.style.removeProperty('--fit'); sh.classList.remove('fit'); return; }
    const pbs = [...sh.querySelectorAll('.pb')]; if (!pbs.length) return;
    const gap = parseFloat(getComputedStyle(sh).columnGap) || 16;
    const max = parseFloat(getComputedStyle(sh).getPropertyValue('--h')) || 250;
    const ratio = pbs.reduce((a, pb) => { const im = pb.querySelector('img'); return a + (im && im.naturalWidth ? im.naturalWidth / im.naturalHeight : 0.625); }, 0);
    const room = sh.clientWidth - 12 - gap * (pbs.length - 1);
    sh.style.setProperty('--fit', Math.max(110, Math.min(max, Math.floor(room / ratio))) + 'px'); sh.classList.add('fit');
  });
}
addEventListener('resize', () => requestAnimationFrame(fitShelves));
document.addEventListener('load', e => { if (e.target.closest?.('.promo-books')) fitShelves(); }, true);
new MutationObserver(() => { if (document.querySelector('.promo-books .promo-shelf:not(.fit)')) requestAnimationFrame(fitShelves); }).observe(document.documentElement, { childList: true, subtree: true });
