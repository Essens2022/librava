// =====================================================================
//  Built-in reader: colored fixed-page books (PDF via PDF.js) and
//  reflowable eBooks (EPUB via epub.js). Opens full-screen on any device.
// =====================================================================
import { CONFIG } from './config.js?v=20261028134529';
import { t } from './i18n.js?v=20261028134529';
import { esc, $, $$, store, debounce, loadScript } from './util.js?v=20261028134529';
import { offline } from './offline.js?v=20261028134529';
import { api } from './api.js?v=20261028134529';
import { icon, go, backOr, toast, cart, errText, priceHTML, stars } from './ui.js?v=20261028134529';
import { startCheckout, alsoReadFor, warmCovers } from './views.js?v=20261028134529';

// the version in the address makes phones fetch a new library file instead of an old saved copy
const VENDOR = f => new URL('../vendor/' + f + '?v=' + (f.startsWith('pdf.') ? 'pdfjs-3.11.174-legacy' : '1'), import.meta.url).href;
const defaults = { theme: 'light', fontSize: 105, font: 'serif', spread: true };

export async function viewReader(el, id, q) {
  const preview = q.get('preview') === '1';
  let book = null;
  try { book = await api.getBook(id); } catch { }
  const saved = preview ? null : await offline.get(id, book);
  if (!book && saved) book = saved.book;
  // for the copy note (title · author) and the copy limit
  window.__libravaBook = book ? { title: book.title, author: book.author, year: new Date(book.published_at || Date.now()).getFullYear() } : null;
  // the end-of-preview screen is prepared while the sample is read: recommendations and pictures are ready
  // before it opens, so it appears complete at once (no jump when they arrive)
  let recList = null;
  if (book) warmCovers([book.cover_url]);
  const recP = book ? alsoReadFor(book, 12).catch(() => []).then(l => { recList = l; return l; }) : Promise.resolve([]);
  if (!window.__libravaCopyHook) { window.__libravaCopyHook = true; window.addEventListener('librava:copylimit', () => toast(t('rd.copyLimit'))); }
  if (!book) { go('/'); return; }
  let src;
  if (saved) src = { url: URL.createObjectURL(saved.blob), kind: saved.book.format, limited: false, local: true };
  else {
    try { src = await api.getReadSource(book, { preview }); }
    catch (e) {
      if (e.message === 'not-owned') { go('/book/' + encodeURIComponent(id)); return; }
      throw e;
    }
  }
  const settings = { ...defaults, ...(store.get('reader:settings') || {}) };
  const saveSettings = () => store.set('reader:settings', settings);
  let progress = null;
  if (!(src.limited || preview)) { try { progress = await api.getProgress(id); } catch { progress = store.get('guestprog:' + id, null); } }
  let bookmarks = Array.isArray(progress?.bookmarks) ? progress.bookmarks : [];
  const user = api.user();

  document.body.classList.add('reading');
  el.innerHTML = `
  <div class="reader t-${settings.theme}" id="reader" role="application" aria-label="${esc(book.title)}">
    <div class="rd-stage" id="rd-stage">
      <div class="${src.kind === 'pdf' ? 'rd-pdf' : 'rd-epub'}" id="rd-content"></div>
      <button class="rd-zone prev" aria-label="‹"></button>
      <button class="rd-zone mid" aria-label="${esc(t('reader.settings'))}"></button>
      <button class="rd-zone next" aria-label="›"></button>
      ${user && !api.isDemo ? `<div class="rd-watermark">${esc(t('reader.licensed', { email: user.email }))}</div>` : ''}
      <div class="rd-msg" id="rd-loading"><div class="box"><div class="spinner" style="margin:0"></div><span>${esc(t('reader.loading'))}</span></div></div>
    </div>
    <button class="rd-float-back" data-back aria-label="${esc(t('reader.back'))}">${icon('chevL')}</button>
    <div class="rd-bar top">
      <button class="rd-btn" data-back aria-label="${esc(t('reader.back'))}">${icon('chevL')}</button>
      <div class="rd-title">${esc(book.title)}</div>
      ${src.limited || preview ? `<span class="rd-badge">${esc(t('reader.preview'))}</span>` : ''}
      <button class="rd-btn" data-panel="toc" aria-label="${esc(t('reader.toc'))}">${icon('toc')}</button>
      <button class="rd-btn" data-panel="settings" aria-label="${esc(t('reader.settings'))}">${icon('type')}</button>
      ${!(src.limited || preview) ? `<button class="rd-btn" data-bookmark aria-label="${esc(t('reader.bookmark'))}">${icon('bookmark')}</button>` : ''}
    </div>
    <div class="rd-bar bottom">
      <div class="rd-progress"><input type="range" id="rd-range" min="1" max="1" value="1" aria-label="${esc(t('reader.page', { n: 1, total: 1 }))}"><span id="rd-label">…</span></div>
      <div class="rd-tools">
        <button class="rd-btn" data-prev aria-label="‹">${icon('chevL')}</button>
        <span style="display:flex;gap:2px">
          ${src.kind === 'pdf' ? `<button class="rd-btn" data-zoom="-1" aria-label="${esc(t('reader.zoom'))} −">${icon('zoomOut')}</button><button class="rd-btn" data-zoom="1" aria-label="${esc(t('reader.zoom'))} +">${icon('zoomIn')}</button>` : ''}
          <button class="rd-btn" data-full aria-label="${esc(t('reader.fullscreen'))}">${icon('full')}</button>
        </span>
        <button class="rd-btn" data-next aria-label="›">${icon('chevR')}</button>
      </div>
    </div>
    <aside class="rd-panel" id="rd-panel" aria-hidden="true"><div class="rd-panel-head"><span id="rd-panel-title"></span><button class="rd-btn" data-panel-close aria-label="${esc(t('reader.close'))}">${icon('close')}</button></div><div class="rd-panel-body" id="rd-panel-body"></div></aside>
  </div>`;

  const R = $('#reader', el), stage = $('#rd-stage', el), content = $('#rd-content', el);
  const range = $('#rd-range', el), label = $('#rd-label', el);
  let engine = null, destroyed = false, chromeHidden = false, wakeLock = null;

  const setChrome = (hide) => { chromeHidden = hide; R.classList.toggle('chrome-hidden', hide); };
  // back to the page the reader came from (the book page or the library), not a new copy of it
  const backTo = () => backOr(preview || src.limited ? '/book/' + encodeURIComponent(id) : '/library');

  // ---- progress saving ----
  const persist = debounce(() => {
    if (src.limited || preview || !engine) return;
    if (src.local) store.set('guestprog:' + id, { ...engine.state(), bookmarks, updated_at: new Date().toISOString() });
    api.saveProgress(id, { ...engine.state(), bookmarks }).catch(() => { });
  }, 1200);

  // ---- preview end ----
  const showLimit = () => {
    if ($('.rd-end', stage)) return;
    const box = document.createElement('div');
    box.className = 'rd-msg rd-end';
    // like Amazon: buy the book right here, then "customers who read this book also read"
    box.innerHTML = `<div class="box end-box">
      <button class="linkbtn end-back" data-end-back>‹ ${esc(t('reader.back'))}</button>
      <div class="end-buy">${book.cover_url ? `<img class="end-cover" src="${esc(book.cover_url)}" alt="">` : ''}
        <div class="end-info"><h2>${esc(t('reader.enjoy'))}</h2>
          <p class="end-title"><b>${esc(book.title)}</b><span>${esc(book.author || '')}</span></p>
          ${book.price_cents ? `<div class="end-price">${priceHTML(book)}</div>` : ''}
          <p class="muted end-text">${esc(t('reader.previewText'))}</p></div>
        <div class="end-actions">${book.price_cents
          ? `<button class="btn btn-buy" data-end-buy>${esc(t('book.buyNow'))}</button><button class="btn btn-cart" data-end-cart>${esc(cart.has(book.id) ? t('book.inCart') : t('book.addToCart'))}</button>`
          : `<button class="btn btn-buy" data-end-free>${esc(t('book.getFree'))}</button>`}
          <button class="linkbtn end-store" data-end-store>${esc(t('reader.seeBook'))} ›</button></div></div>
      <div class="end-more" hidden><h3>${esc(t('reader.alsoRead'))}</h3><div class="end-row"></div></div></div>`;
    stage.appendChild(box);
    box.querySelector('[data-end-back]').onclick = () => { box.remove(); engine?.prev(); };
    box.querySelector('[data-end-buy]')?.addEventListener('click', () => { cart.add(book.id); cleanup(); startCheckout([book.id]); });
    box.querySelector('[data-end-cart]')?.addEventListener('click', e => { cart.add(book.id); e.currentTarget.textContent = t('book.inCart'); e.currentTarget.disabled = true; toast(t('cart.added')); });
    box.querySelector('[data-end-free]')?.addEventListener('click', () => { cleanup(); go('/book/' + encodeURIComponent(id)); });
    box.querySelector('[data-end-store]').onclick = () => { cleanup(); backOr('/book/' + encodeURIComponent(id)); };
    const more = box.querySelector('.end-more'), row = more.querySelector('.end-row');
    const fill = list => {
      if (!box.isConnected) return;
      if (!list.length) { more.hidden = true; return; }
      // small cards, like Amazon's "customers also read": cover, title, stars, price
      row.innerHTML = list.map(x => `<a class="mini" href="#/book/${encodeURIComponent(x.id)}">
          <span class="mini-cover">${x.cover_url ? `<img src="${esc(x.cover_url)}" alt="">` : `<span class="ph">${esc(x.title)}</span>`}</span>
          <span class="mini-title">${esc(x.title)}</span>
          ${x.rating_count ? `<span class="mini-stars">${stars(x.rating_avg)}<small>${x.rating_count}</small></span>` : ''}
          <span class="mini-price">${x.price_cents ? priceHTML(x) : esc(t('book.free'))}</span></a>`).join('');
      row.querySelectorAll('a.mini').forEach(a => a.addEventListener('click', () => cleanup()));
    };
    if (recList) { if (recList.length) { more.hidden = false; fill(recList); } }
    else {
      // not ready yet: keep their place with grey cards of the same size, so nothing moves when they arrive
      more.hidden = false;
      row.innerHTML = Array.from({ length: 6 }, () => '<span class="mini skel"><span class="mini-cover"></span><span class="mini-title">&nbsp;<br>&nbsp;</span><span class="mini-price">&nbsp;</span></span>').join('');
      recP.then(fill);
    }
  };

  const update = (info) => {
    range.max = info.max; range.value = info.value;
    label.textContent = info.label;
    range.setAttribute('aria-valuetext', info.label);
    const bm = $('[data-bookmark]', R);
    if (bm) bm.classList.toggle('on', bookmarks.some(b => b.loc === info.loc));
    persist();
  };

  try {
    engine = src.kind === 'pdf'
      ? new PdfEngine(content, stage, src, settings, { onUpdate: update, onLimit: showLimit, progress })
      : new EpubEngine(content, stage, src, settings, { onUpdate: update, onLimit: showLimit, progress });
    await engine.init();
    if (destroyed) return engine.destroy();
    $('#rd-loading', el)?.remove();
  } catch (e) {
    console.error(e);
    const l = $('#rd-loading', el);
    if (l) l.innerHTML = `<div class="box"><p>${esc(t('reader.error'))}</p><p class="muted" style="font-size:12px">${esc(errText(e))}</p><button class="btn btn-ghost" data-back>${esc(t('reader.back'))}</button></div>`;
  }

  // ---- first-time hint ----
  if (!store.get('reader:hinted')) {
    store.set('reader:hinted', true);
    const h = document.createElement('div'); h.className = 'rd-hint'; h.textContent = t('reader.hint');
    stage.appendChild(h); setTimeout(() => { h.style.opacity = '0'; setTimeout(() => h.remove(), 700); }, 3200);
  }

  // ---- input: taps, swipes, keys ----
  let sx = 0, sy = 0, st = 0, swiped = false;
  stage.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; st = Date.now(); swiped = false; });
  stage.addEventListener('pointerup', e => {
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3 && Date.now() - st < 800 && !engine?.zoomed) {
      swiped = true; if (dx < 0) engine?.next(); else engine?.prev(); setChrome(true);
    }
  });
  $('.rd-zone.prev', R).onclick = () => { if (swiped) return; engine?.prev(); setChrome(true); };
  $('.rd-zone.next', R).onclick = () => { if (swiped) return; engine?.next(); setChrome(true); };
  $('.rd-zone.mid', R).onclick = () => { if (swiped) return; setChrome(!chromeHidden); };
  $('[data-prev]', R).onclick = () => engine?.prev();
  $('[data-next]', R).onclick = () => engine?.next();
  range.oninput = () => engine?.preview?.(Number(range.value));
  range.onchange = () => engine?.seek(Number(range.value));
  $$('[data-zoom]', R).forEach(b => b.onclick = () => engine?.zoom?.(Number(b.dataset.zoom)));
  $('[data-full]', R).onclick = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { }
  };
  R.addEventListener('click', e => { if (e.target.closest('[data-back]')) { cleanup(); backTo(); } });

  const onKey = (e) => {
    if (e.target.closest('input,textarea,select')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); engine?.next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); engine?.prev(); }
    else if (e.key === 'Escape') { if ($('#rd-panel', R).classList.contains('open')) closePanel(); else { cleanup(); backTo(); } }
  };
  document.addEventListener('keydown', onKey);
  const onResize = debounce(() => engine?.resize?.(), 180);
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  const onVis = () => { if (document.visibilityState === 'hidden') persist.flush?.(); else requestWake(); };
  document.addEventListener('visibilitychange', onVis);
  async function requestWake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { } }
  requestWake();

  // ---- bookmarks ----
  $('[data-bookmark]', R)?.addEventListener('click', () => {
    if (!engine) return;
    const s = engine.bookmarkInfo();
    const i = bookmarks.findIndex(b => b.loc === s.loc);
    if (i >= 0) { bookmarks.splice(i, 1); toast(t('reader.bookmarkRemoved')); }
    else { bookmarks.push({ ...s, at: new Date().toISOString() }); toast(t('reader.bookmarkAdded')); }
    $('[data-bookmark]', R).classList.toggle('on', i < 0);
    persist();
  });

  // ---- side panel (contents / settings) ----
  const panel = $('#rd-panel', R), pBody = $('#rd-panel-body', R), pTitle = $('#rd-panel-title', R);
  const closePanel = () => { panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true'); };
  $('[data-panel-close]', R).onclick = closePanel;
  $$('[data-panel]', R).forEach(b => b.onclick = async () => {
    const which = b.dataset.panel;
    if (panel.classList.contains('open') && panel.dataset.which === which) return closePanel();
    panel.dataset.which = which;
    if (which === 'toc') {
      pTitle.textContent = t('reader.toc');
      const toc = engine ? await engine.toc() : [];
      pBody.innerHTML = toc.map((it, i) => `<button class="item ${it.sub ? 'sub' : ''}" data-toc="${i}">${esc(it.label)}</button>`).join('')
        + (src.limited || preview ? '' : `<div class="rd-set"><span>${esc(t('reader.bookmarks'))}</span>${bookmarks.length ? '' : `<small style="opacity:.75">${esc(t('reader.noBookmarks'))}</small>`}</div>`
          + bookmarks.map((bm, i) => `<button class="item" data-bm="${i}">${icon('bookmark', 'ico')} ${esc(bm.label)}</button>`).join(''));
      $$('[data-toc]', pBody).forEach(x => x.onclick = () => { engine.goToc(toc[Number(x.dataset.toc)]); closePanel(); });
      $$('[data-bm]', pBody).forEach(x => x.onclick = () => { engine.goBookmark(bookmarks[Number(x.dataset.bm)]); closePanel(); });
      $$('.item .ico', pBody).forEach(i => { i.style.width = '16px'; i.style.height = '16px'; i.style.verticalAlign = '-3px'; });
    } else {
      pTitle.textContent = t('reader.settings');
      const seg = (key, vals) => `<div class="seg">${vals.map(([v, lab, cls]) => `<button class="${cls || ''} ${settings[key] === v ? 'on' : ''}" data-set="${key}" data-val="${v}">${esc(lab)}</button>`).join('')}</div>`;
      pBody.innerHTML = `
        <div class="rd-set"><span>${esc(t('reader.theme'))}</span>${seg('theme', [['light', t('reader.t.light'), 'sw-light'], ['sepia', t('reader.t.sepia'), 'sw-sepia'], ['dark', t('reader.t.dark'), 'sw-dark']])}</div>
        ${src.kind === 'epub' ? `
        <div class="rd-set"><span>${esc(t('reader.fontSize'))}</span><div class="seg"><button data-fs="-10" style="font-size:14px">A−</button><button disabled style="opacity:1" id="fs-val">${settings.fontSize}%</button><button data-fs="10" style="font-size:19px">A+</button></div></div>
        <div class="rd-set"><span>${esc(t('reader.font'))}</span>${seg('font', [['serif', t('reader.f.serif')], ['sans', t('reader.f.sans')]])}</div>` : ''}
        <div class="rd-set"><label class="check" style="font-size:15px"><input type="checkbox" id="rd-spread" ${settings.spread ? 'checked' : ''}> ${esc(t('reader.spread'))}</label></div>`;
      $$('[data-set]', pBody).forEach(x => x.onclick = () => {
        settings[x.dataset.set] = x.dataset.val; saveSettings();
        $$(`[data-set="${x.dataset.set}"]`, pBody).forEach(y => y.classList.toggle('on', y === x));
        if (x.dataset.set === 'theme') { R.className = R.className.replace(/t-\w+/, 't-' + settings.theme); document.body.style.setProperty('--rd-bg', getComputedStyle(R).getPropertyValue('--rd-bg')); }
        engine?.applySettings();
      });
      $$('[data-fs]', pBody).forEach(x => x.onclick = () => {
        settings.fontSize = Math.max(70, Math.min(200, settings.fontSize + Number(x.dataset.fs))); saveSettings();
        $('#fs-val', pBody).textContent = settings.fontSize + '%'; engine?.applySettings();
      });
      $('#rd-spread', pBody).onchange = e => { settings.spread = e.target.checked; saveSettings(); engine?.applySettings(true); };
    }
    panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false');
  });
  document.body.style.setProperty('--rd-bg', getComputedStyle(R).getPropertyValue('--rd-bg'));

  function cleanup() {
    if (destroyed) return;
    destroyed = true;
    persist.flush?.();
    if (!(src.limited || preview) && engine) api.saveProgress(id, { ...engine.state(), bookmarks }).catch(() => { });
    engine?.destroy();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    window.visualViewport?.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    try { wakeLock?.release(); } catch { }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
    document.body.classList.remove('reading');
    document.body.style.removeProperty('--rd-bg');
  }
  return cleanup;
}

// =====================================================================
//  PDF engine
// =====================================================================
class PdfEngine {
  constructor(box, stage, src, settings, cb) {
    Object.assign(this, { box, stage, src, settings, cb });
    this.cur = 1; this.zoomLevel = 0; this.cache = new Map(); this.task = null; this.zoomed = false;
  }
  get ZOOMS() { return [1, 1.5, 2, 3]; }
  async init() {
    await loadScript(VENDOR('pdf.min.js'));
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = VENDOR('pdf.worker.min.js');
    this.doc = await lib.getDocument({ url: this.src.url, isEvalSupported: false }).promise;
    this.total = this.doc.numPages;
    // a separate sample file is shown whole; otherwise only the first pages of the full book
    this.limit = this.src.limited && !this.src.sample ? Math.min(this.total, CONFIG.previewPages) : this.total;
    this.vps = [];
    const start = Math.min(Math.max(1, Number(this.cb.progress?.page) || 1), this.limit);
    await this.show(start);
  }
  spreadOn() { return this.settings.spread && this.stage.clientWidth > this.stage.clientHeight * 1.15 && this.stage.clientWidth >= 700 && this.zoomLevel === 0; }
  pagesFor(p) {
    if (!this.spreadOn() || p === 1) return [p];
    const a = p % 2 === 0 ? p : p - 1;
    return [a, a + 1].filter(n => n <= this.total);
  }
  async vp(n) {
    if (!this.vps[n]) { const page = await this.doc.getPage(n); this.vps[n] = { page, vp: page.getViewport({ scale: 1 }) }; }
    return this.vps[n];
  }
  async layout(pages) {
    const pad = 24;
    const W = Math.max(100, this.stage.clientWidth - pad), H = Math.max(100, this.stage.clientHeight - pad);
    const vs = await Promise.all(pages.map(n => this.vp(n)));
    const tw = vs.reduce((s, v) => s + v.vp.width, 0), mh = Math.max(...vs.map(v => v.vp.height));
    const scale = Math.min(W / tw, H / mh) * this.ZOOMS[this.zoomLevel];
    return { vs, scale };
  }
  async renderPage(n, scale) {
    const key = `${n}@${scale.toFixed(4)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const { page } = await this.vp(n);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const vp = page.getViewport({ scale });
    let out = dpr;
    if (vp.width * vp.height * out * out > 14e6) out = Math.sqrt(14e6 / (vp.width * vp.height));
    const c = document.createElement('canvas');
    c.width = Math.floor(vp.width * out); c.height = Math.floor(vp.height * out);
    c.style.width = Math.floor(vp.width) + 'px'; c.style.height = Math.floor(vp.height) + 'px';
    c.setAttribute('aria-label', t('reader.page', { n, total: this.total }));
    await page.render({ canvasContext: c.getContext('2d', { alpha: false }), viewport: vp, transform: out !== 1 ? [out, 0, 0, out, 0, 0] : null }).promise;
    this.cache.set(key, c);
    if (this.cache.size > 10) this.cache.delete(this.cache.keys().next().value);
    return c;
  }
  async show(p, { anim = true } = {}) {
    if (p > this.limit) { this.cb.onLimit(); return; }
    p = Math.max(1, Math.min(p, this.total));
    const pages = this.pagesFor(p).filter(n => n <= this.limit);
    this.cur = pages[0];
    const token = this.token = Symbol();
    const { scale } = await this.layout(pages);
    const canvases = await Promise.all(pages.map(n => this.renderPage(n, scale)));
    if (token !== this.token) return;
    this.box.classList.toggle('zoomed', this.zoomed);
    this.box.replaceChildren(...canvases);
    if (anim) { this.box.classList.remove('page-anim'); void this.box.offsetWidth; this.box.classList.add('page-anim'); }
    if (this.zoomed) this.box.scrollTo(0, 0);
    const last = pages[pages.length - 1];
    const lbl = pages.length > 1 ? `${pages[0]}–${last} / ${this.total}` : t('reader.pageShort', { n: pages[0], total: this.total });
    this.cb.onUpdate({ max: this.limit, value: pages[0], label: lbl, loc: String(pages[0]) });
    // prefetch neighbours
    setTimeout(async () => {
      if (token !== this.token) return;
      const nx = this.pagesFor(Math.min(last + 1, this.limit)).filter(n => n <= this.limit && n > last);
      const { scale: s2 } = nx.length ? await this.layout(nx) : { scale };
      for (const n of nx) await this.renderPage(n, s2).catch(() => { });
    }, 150);
  }
  next() {
    const pages = this.pagesFor(this.cur);
    const n = pages[pages.length - 1] + 1;
    if (n > this.limit) { if (this.src.limited) this.cb.onLimit(); return; }
    this.show(n);
  }
  prev() { const n = this.pagesFor(this.cur)[0] - 1; if (n >= 1) this.show(n); }
  seek(v) { this.show(v); }
  preview(v) { this.cb.onUpdate({ max: this.limit, value: v, label: t('reader.pageShort', { n: v, total: this.total }), loc: String(v) }); }
  zoom(d) {
    this.zoomLevel = Math.max(0, Math.min(this.ZOOMS.length - 1, this.zoomLevel + d));
    this.zoomed = this.zoomLevel > 0; this.cache.clear(); this.show(this.cur, { anim: false });
  }
  resize() { this.cache.clear(); this.show(this.cur, { anim: false }); }
  applySettings(layoutChanged) { if (layoutChanged) this.resize(); }
  state() { return { page: this.cur, location: String(this.cur), percent: Math.min(1, this.total ? (this.pagesFor(this.cur).slice(-1)[0]) / this.total : 0) }; }
  bookmarkInfo() { return { loc: String(this.cur), label: t('reader.page', { n: this.cur, total: this.total }) }; }
  goBookmark(b) { this.show(Number(b.loc)); }
  async toc() {
    let items = [];
    try {
      const outline = await this.doc.getOutline();
      if (outline && outline.length) {
        const walk = async (arr, sub) => { for (const o of arr) { items.push({ label: o.title, dest: o.dest, sub }); if (o.items?.length && !sub) await walk(o.items, true); } };
        await walk(outline, false);
      }
    } catch { }
    if (!items.length) items = Array.from({ length: this.limit }, (_, i) => ({ label: t('reader.page', { n: i + 1, total: this.total }), page: i + 1 }));
    return items;
  }
  async goToc(it) {
    if (it.page) return this.show(it.page);
    try {
      const dest = typeof it.dest === 'string' ? await this.doc.getDestination(it.dest) : it.dest;
      const idx = await this.doc.getPageIndex(dest[0]);
      this.show(idx + 1);
    } catch { }
  }
  destroy() { this.token = null; this.cache.clear(); try { this.doc?.destroy(); } catch { } }
}

// =====================================================================
//  EPUB engine
// =====================================================================
const EPUB_THEMES = {
  light: { color: '#1C1C1C', link: '#2C6A55' },
  sepia: { color: '#3B2F20', link: '#7A4E1D' },
  dark: { color: '#D9DEDA', link: '#A4D17F' },
};
class EpubEngine {
  constructor(box, stage, src, settings, cb) { Object.assign(this, { box, stage, src, settings, cb }); this.percent = 0; this.ready = false; this.limitPct = src.sample ? 0.985 : CONFIG.previewPercent; }
  async init() {
    await loadScript(VENDOR('jszip.min.js'));
    await loadScript(VENDOR('epub.min.js'));
    const res = await fetch(this.src.url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let buf;
    if (/\.b64\.txt(\?|$)/.test(this.src.url)) {
      // hosting that cannot serve .epub files gets them as base64 text
      const bin = atob((await res.text()).trim());
      buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      buf = buf.buffer;
    } else buf = await res.arrayBuffer();
    this.book = window.ePub(buf);
    this.box.style.padding = '52px max(18px, env(safe-area-inset-right, 0px)) 74px max(18px, env(safe-area-inset-left, 0px))';
    const holder = document.createElement('div'); holder.style.height = '100%'; this.box.appendChild(holder);
    this.rendition = this.book.renderTo(holder, { width: '100%', height: '100%', flow: 'paginated', spread: this.settings.spread ? 'auto' : 'none', minSpreadWidth: 900, allowScriptedContent: false });
    for (const [name, c] of Object.entries(EPUB_THEMES)) {
      this.rendition.themes.register(name, { html: { 'touch-action': 'manipulation' }, body: { color: c.color + ' !important', background: 'transparent !important', 'overflow-wrap': 'anywhere', 'word-wrap': 'break-word', 'touch-action': 'manipulation' }, 'p, li, span, div, h1, h2, h3, h4': { color: c.color + ' !important' }, a: { color: c.link + ' !important' }, img: { 'max-width': '100% !important' },
        // nothing may stick out of the page: pictures, tables, code and very long words stay inside the margins
        'img, svg, video, canvas, image': { 'max-width': '100% !important', 'max-height': '92vh !important', height: 'auto !important', 'object-fit': 'contain', 'box-sizing': 'border-box' },
        'figure, div, section, p, blockquote, ul, ol': { 'max-width': '100% !important', 'box-sizing': 'border-box' },
        table: { 'max-width': '100% !important', 'table-layout': 'fixed !important', width: '100% !important', 'word-break': 'break-word' },
        'td, th': { 'word-break': 'break-all !important', 'overflow-wrap': 'anywhere !important', 'min-width': '0 !important' },
        'pre, code': { 'white-space': 'pre-wrap !important', 'word-break': 'break-word', 'max-width': '100% !important' } });
    }
    this.applySettings();
    // copying: short quotes only (like Kindle), always with the book, author and shop added
    // boxes with their own background (key points, tips...) always keep readable text, whatever the reader theme
    this.rendition.hooks.content.register(contents => {
      const doc = contents.document, win = doc.defaultView;
      const fix = () => {
        const rgb = c => (c.match(/[\d.]+/g) || []).map(Number);
        const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
        doc.body && doc.body.querySelectorAll('*').forEach(el => {
          const c = rgb(win.getComputedStyle(el).backgroundColor); if (c.length < 3 || (c.length > 3 && c[3] < .5)) return;
          const ink = lum(c) < .25 ? '#ffffff' : lum(c) > .55 ? '#1f2328' : null; if (!ink) return;
          [el, ...el.querySelectorAll('*')].forEach(x => { if (x !== el && rgb(win.getComputedStyle(x).backgroundColor)[3] !== 0 && win.getComputedStyle(x).backgroundColor !== 'rgba(0, 0, 0, 0)') return; x.style.setProperty('color', ink, 'important'); });
        });
      };
      setTimeout(fix, 0); setTimeout(fix, 400);
    });
    this.rendition.hooks.content.register(contents => {
      const doc = contents.document;
      doc.addEventListener('copy', e => {
        const sel = String(doc.getSelection() || '').trim(); if (!sel || !e.clipboardData) return;
        const b = window.__libravaBook || {}, max = 400;
        const part = sel.length > max ? sel.slice(0, max).replace(/\s+\S*$/, '') + '…' : sel;
        e.clipboardData.setData('text/plain', `${part}\n\n— ${b.title || ''}${b.author ? ', ' + b.author : ''} · © ${b.year || ''} Librava · librava.store`);
        e.preventDefault();
        if (sel.length > max) window.dispatchEvent(new CustomEvent('librava:copylimit'));
      });
    });
    this.rendition.on('relocated', loc => this.onRel(loc));
    const navP = this.book.loaded.navigation.then(n => { this.nav = n; }).catch(() => { });
    await this.rendition.display(this.cb.progress?.location || undefined);
    await navP;
    // percentages need generated locations
    this.book.ready.then(() => this.book.locations.generate(900)).then(() => {
      this.ready = true;
      if (this.lastLoc) this.onRel(this.lastLoc);
    }).catch(() => { });
  }
  onRel(loc) {
    this.lastLoc = loc;
    const cfi = loc.start.cfi;
    this.cfi = cfi;
    let pct = 0;
    if (this.ready) pct = this.book.locations.percentageFromCfi(cfi) || 0;
    else pct = loc.start.percentage || 0;
    if (loc.atEnd) pct = 1;
    this.percent = pct;
    if (this.src.limited && this.ready && pct > this.limitPct) this.cb.onLimit();
    const chap = this.chapterLabel(loc.start.href);
    const p = Math.round(pct * 100);
    this.cb.onUpdate({ max: 1000, value: Math.round(pct * 1000), label: (chap ? chap + ' · ' : '') + t('reader.percent', { p }), loc: cfi });
  }
  chapterLabel(href) {
    if (!this.nav || !href) return '';
    const base = href.split('#')[0].split('/').pop();
    const it = this.nav.toc.find(x => x.href.split('#')[0].split('/').pop() === base);
    return it ? it.label.trim() : '';
  }
  applySettings(layoutChanged) {
    const r = this.rendition; if (!r) return;
    r.themes.select(this.settings.theme);
    r.themes.fontSize(this.settings.fontSize + '%');
    r.themes.override('font-family', this.settings.font === 'sans' ? "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif" : "'Literata', Georgia, 'Times New Roman', serif");
    r.themes.override('line-height', '1.6');
    if (layoutChanged) { try { r.spread(this.settings.spread ? 'auto' : 'none', 900); } catch { } }
  }
  next() {
    if (this.src.limited && this.ready && this.percent >= this.limitPct) { this.cb.onLimit(); return; }
    this.rendition?.next();
  }
  prev() { this.rendition?.prev(); }
  preview(v) { this.cb.onUpdate({ max: 1000, value: v, label: t('reader.percent', { p: Math.round(v / 10) }), loc: this.cfi }); }
  seek(v) {
    if (!this.ready) return;
    let pct = v / 1000;
    if (this.src.limited) pct = Math.min(pct, this.limitPct);
    this.rendition.display(this.book.locations.cfiFromPercentage(pct));
  }
  resize() { try { this.rendition?.resize(); } catch { } }
  state() { return { location: this.cfi || null, percent: this.percent || 0 }; }
  bookmarkInfo() { const chap = this.chapterLabel(this.lastLoc?.start?.href); return { loc: this.cfi, label: (chap ? chap + ' · ' : '') + Math.round(this.percent * 100) + '%' }; }
  goBookmark(b) { this.rendition.display(b.loc); }
  async toc() {
    const out = [];
    const walk = (arr, sub) => arr.forEach(i => { out.push({ label: i.label.trim(), href: i.href, sub }); if (i.subitems?.length) walk(i.subitems, true); });
    walk(this.nav?.toc || [], false);
    return out;
  }
  goToc(it) { this.rendition.display(it.href); }
  destroy() { try { this.rendition?.destroy(); this.book?.destroy(); } catch { } }
}
