import { CONFIG } from './config.js?v=20261019201923';
import { t, money, getLang, setLang, LANGS, langName } from './i18n.js?v=20261019201923';
import { esc, store, $, $$ } from './util.js?v=20261019201923';

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
import { api } from './api.js?v=20261019201923';

// ---------------- icons ----------------
const P = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/>',
  cart: '<path d="M2.5 4h2.2l2.3 10.3a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20.5 7H6"/><circle cx="9.5" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  book: '<path d="M3 5.5C5 4.5 8 4.3 12 6c4-1.7 7-1.5 9-.5V19c-2-1-5-1.2-9 .5-4-1.7-7-1.5-9-.5Z"/><path d="M12 6v13.5"/>',
  library: '<rect x="3" y="4" width="4" height="16" rx="1"/><rect x="8.5" y="4" width="4" height="16" rx="1"/><path d="M14.5 5.2l3.8-1 3.7 15-3.8 1z"/>',
  chevL: '<path d="M15 18l-6-6 6-6"/>', chevR: '<path d="M9 6l6 6-6 6"/>', chevD: '<path d="M6 9l6 6 6-6"/>',
  bookmark: '<path d="M6 3h12v18l-6-4.5L6 21z"/>',
  toc: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r=".6"/><circle cx="4.5" cy="12" r=".6"/><circle cx="4.5" cy="18" r=".6"/>',
  type: '<path d="M3 19L8.5 5 14 19M5 14h7"/><path d="M15.5 12.2c.6-1 1.6-1.5 2.8-1.5 1.7 0 2.7 1 2.7 2.8V19M21 15.6c-.7-.3-1.5-.4-2.3-.4-1.7 0-2.9.8-2.9 2 0 1.1.9 1.9 2.2 1.9 1.4 0 2.6-.9 3-2"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21M8 11h6M11 8v6"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21M8 11h6"/>',
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

export const CATS = ['fiction', 'selfhelp', 'health', 'business', 'kids', 'cooking', 'education', 'hobby'];

// ---------------- cart ----------------
export const cart = {
  get() { return store.get('cart', []); },
  has(id) { return this.get().includes(id); },
  add(id) { const c = this.get(); if (!c.includes(id)) { c.push(id); store.set('cart', c); } updateCartCount(); },
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
    <a class="hdr-btn cart-btn" href="#/cart" aria-label="${esc(t('nav.cart'))}">${icon('cart')}<span class="cart-count">0</span><b class="cart-label">${esc(t('nav.cart'))}</b></a>
  </div>
  <div class="wrap hdr-mobile-search">${searchForm('s2')}</div></div>
  <div class="hdr-sub"><nav class="wrap subnav" aria-label="${esc(t('nav.browse'))}">
    <button class="menu-btn" data-drawer>${icon('menu')} ${esc(t('nav.all'))}</button>
    <a href="#/search?sort=newest" data-nav="new">${esc(t('nav.new'))}</a>
    <a href="#/search?deals=1" data-nav="deals">${esc(t('nav.deals'))}</a>
    <a href="#/search?price=free" data-nav="free">${esc(t('nav.free'))}</a>
    ${CATS.map(c => `<a href="#/search?cat=${c}" data-nav="cat-${c}">${esc(t('cat.' + c))}</a>`).join('')}
    <a href="#/library" data-nav="library">${esc(t('nav.library'))}</a>
    ${u?.isAdmin ? `<a href="#/admin" data-nav="admin">${icon('gear')} ${esc(t('nav.admin'))}</a>` : ''}
  </nav></div>`;

  $('#drawer').innerHTML = `
    <div class="drawer-head"><span class="drawer-hello">${icon('user')} ${hello}</span>${langBtn('drawer-lang')}</div>
    <div class="drawer-body">
      <h3>${esc(t('nav.browse'))}</h3>
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
        <div><h4>${esc(t('foot.help'))}</h4><a href="#/help">${esc(t('foot.howRead'))}</a><a href="#/help">${esc(t('foot.payments'))}</a><a href="#/help#legal">${esc(t('foot.legal'))}</a></div>
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
export function cardHTML(b) {
  return `<a class="card" href="#/book/${encodeURIComponent(b.id)}">
    ${coverHTML(b)}
    <div class="card-title">${esc(b.title)}</div>
    <div class="card-author">${esc(b.author)}</div>
    ${ratingHTML(b)}
    <div class="card-meta"><span class="fmt">${esc(t('book.formatShort.' + b.format))}</span></div>
    <div>${priceHTML(b)}</div>
  </a>`;
}
export function rcardHTML(b) {
  return `<a class="rcard" href="#/book/${encodeURIComponent(b.id)}">
    ${coverHTML(b)}
    <div class="rinfo">
      <div class="card-title">${esc(b.title)}</div>
      <div class="card-author">${esc(t('book.by', { author: b.author }))}</div>
      ${ratingHTML(b)}
      <div class="card-meta"><span class="fmt">${esc(t('book.formatShort.' + b.format))}</span>${b.pages ? `<span>${b.pages} p.</span>` : ''}</div>
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
  }
  document.addEventListener('submit', e => {
    const f = e.target.closest('[data-search]');
    if (!f) return;
    e.preventDefault();
    const q = f.q.value.trim(), cat = f.cat.value;
    const p = new URLSearchParams(); if (q) p.set('q', q); if (cat) p.set('cat', cat);
    f.q.blur();
    go('/search?' + p.toString());
  });
  document.addEventListener('click', async e => {
    if (e.target.closest('[data-drawer]')) { openDrawer(true); return; }
    if (e.target.closest('#scrim') || e.target.closest('#drawer-close')) { openDrawer(false); return; }
    if (e.target.closest('#drawer a')) openDrawer(false);
    const tb = e.target.closest('[data-theme-set]');
    if (tb) { store.set('theme', tb.dataset.themeSet); applyTheme(); openDrawer(false); renderChrome(); window.dispatchEvent(new Event('librava:themechange')); return; }
    if (e.target.closest('[data-lang-open]')) { openLangPicker(); return; }
    const lb = e.target.closest('[data-lang]');
    if (lb) {
      lb.closest('.modal-wrap')?.remove();
      await setLang(lb.dataset.lang);
      openDrawer(false);
      window.dispatchEvent(new Event('librava:rerender'));
      return;
    }
    if (e.target.closest('[data-top]')) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (e.target.closest('[data-signout]')) { openDrawer(false); await api.signOut(); go('/'); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { openDrawer(false); document.querySelector('.lang-modal')?.closest('.modal-wrap')?.remove(); } });
}
