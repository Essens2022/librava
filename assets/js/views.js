import { CONFIG } from './config.js';
import { t, money, fmtDate, getLang, langName, LANGS } from './i18n.js';
import { esc, $, $$ } from './util.js';
import { api, DEMO_ADMIN } from './api.js';
import { icon, stars, starPath, cart, go, cardHTML, rcardHTML, coverHTML, priceHTML, toast, modal, errText, CATS, updateCartCount } from './ui.js';

const spinner = '<div class="spinner" role="progressbar" aria-label="…"></div>';

// =====================================================================
//  HOME
// =====================================================================
export async function viewHome(el) {
  // the store shows only books in the visitor's language
  const L = getLang();
  const [featured, newest, free, deals, all, everything] = await Promise.all([
    api.listBooks({ lang: L, featured: true, sort: 'bestsellers' }),
    api.listBooks({ lang: L, sort: 'newest', limit: 14 }),
    api.listBooks({ lang: L, free: true }),
    api.listBooks({ lang: L, deals: true }),
    api.listBooks({ lang: L }),
    api.listBooks({ sort: 'bestsellers' }),
  ]);
  const noBooks = !all.length;
  let cont = null;
  if (api.user()) {
    const lib = await api.library();
    cont = lib.filter(x => x.progress && x.progress.percent < 0.99).sort((a, b) => String(b.progress.updated_at).localeCompare(String(a.progress.updated_at)))[0];
  }
  const fan = (featured.length >= 4 ? featured : all.length >= 4 ? all : everything).slice(0, 4);
  const shelf = (title, books, more) => !books.length ? '' : `
    <section class="panel"><h2 class="section-title">${esc(title)} ${more ? `<a href="${more}">${esc(t('home.seeAll'))}</a>` : ''}</h2>
    <div class="shelf-track">${books.map(cardHTML).join('')}</div></section>`;
  const catTiles = CATS.map(c => {
    const bs = all.filter(b => b.category === c).slice(0, 4);
    if (!bs.length) return '';
    const n = Math.min(bs.length, window.innerWidth < 700 ? 2 : 3);
    const imgs = bs.slice(0, n).map(b => b.cover_url ? `<img src="${esc(b.cover_url)}" alt="" loading="lazy">` : '').join('');
    return `<a class="cat-tile" href="#/search?cat=${c}"><div class="thumbs n${n}">${imgs}</div><span>${esc(t('cat.' + c))}</span></a>`;
  }).join('');

  el.innerHTML = `
  <section class="hero"><div class="wrap hero-inner">
    <div>
      <div class="hero-kicker">${esc(t('home.heroKicker'))}</div>
      <h1>${esc(t('home.heroTitle'))}</h1>
      <p>${esc(t('home.heroText'))}</p>
      <div class="hero-actions"><a class="btn btn-buy" href="#/search?sort=bestsellers">${esc(t('home.heroCta'))}</a><a class="btn btn-light" href="#/search?price=free">${esc(t('home.heroCta2'))}</a></div>
    </div>
    <div class="hero-fan" aria-hidden="true">${fan.map(b => b.cover_url ? `<img src="${esc(b.cover_url)}" alt="">` : '').join('')}</div>
  </div><div class="hero-fade"></div></section>
  <div class="wrap lift home-stack" style="padding-bottom:40px">
    <div class="panel trust">
      <div>${icon('bolt')} ${esc(t('home.trust1'))}</div>
      <div>${icon('shield')} ${esc(t('home.trust2'))}</div>
      <div>${icon('devices')} ${esc(t('home.trust3'))}</div>
    </div>
    ${cont ? `<section class="panel continue">
      <a href="#/read/${encodeURIComponent(cont.book.id)}">${coverHTML(cont.book, { badge: false })}</a>
      <div style="display:flex;flex-direction:column;gap:8px;min-width:0">
        <h2 class="section-title" style="font-size:18px">${esc(t('home.continue'))}</h2>
        <div class="card-title" style="margin:0">${esc(cont.book.title)}</div>
        <div class="progress"><i style="width:${Math.round(cont.progress.percent * 100)}%"></i></div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><span class="muted" style="font-size:13px">${esc(t('lib.read', { p: Math.round(cont.progress.percent * 100) }))}</span>
        <a class="btn btn-cart btn-sm" href="#/read/${encodeURIComponent(cont.book.id)}">${icon('book')} ${esc(t('book.readNow'))}</a></div>
      </div></section>` : ''}
    ${noBooks ? `<section class="panel empty">${icon('globe')}<h2 style="font-size:20px;color:var(--fg)">${esc(t('lang.noBooks', { lang: langName(L, true) }))}</h2><p>${esc(t('lang.noBooksHint'))}</p><a class="btn btn-buy" href="#/search?lang=all">${esc(t('lang.seeAll'))}</a></section>` : ''}
    ${shelf(t('home.featured'), featured, '#/search?sort=bestsellers')}
    <section class="panel"><h2 class="section-title">${esc(t('home.catCardTitle'))}</h2><div class="cat-grid">${catTiles}</div></section>
    ${shelf(t('home.new'), newest, '#/search?sort=newest')}
    ${shelf(t('home.deals'), deals, '#/search?deals=1')}
    ${shelf(t('home.free'), free, '#/search?price=free')}
  </div>`;
}

// =====================================================================
//  SEARCH
// =====================================================================
export async function viewSearch(el, q) {
  const opts = {
    q: q.get('q') || '', category: q.get('cat') || '', format: q.get('format') || '', price: q.get('price') || '',
    rating: Number(q.get('rating')) || 0, sort: q.get('sort') || '', deals: q.get('deals') === '1',
  };
  // book language: the visitor's language unless they pick another one or "all languages"
  const UI = getLang();
  const langParam = q.get('lang') || '';
  const bookLang = langParam === 'all' ? '' : (langParam || UI);
  opts.lang = bookLang;
  const [books, everything] = await Promise.all([api.listBooks(opts), api.listBooks({})]);
  const otherLangs = [...new Set(everything.map(b => b.language).filter(l => l && l !== UI))]
    .sort((a, b) => langName(a).localeCompare(langName(b)));
  const mk = (patch) => {
    const p = new URLSearchParams(q);
    for (const k in patch) { if (patch[k] === '' || patch[k] == null) p.delete(k); else p.set(k, patch[k]); }
    return '#/search?' + p.toString();
  };
  const radio = (name, key, val, label) => {
    const on = (q.get(key) || '') === val;
    return `<a class="fopt ${on ? 'on' : ''}" href="${mk({ [key]: val })}" role="radio" aria-checked="${on}">${on ? icon('check', 'ico') : '<span style="width:22px;display:inline-block"></span>'}${esc(label)}</a>`;
  };
  const head = opts.q ? t('search.results', { n: books.length, q: esc(opts.q) }) : opts.category ? t('search.inCat', { n: books.length, cat: esc(t('cat.' + opts.category)) }) : t('search.resultsAll', { n: books.length });
  const sortSel = ['relevance', 'bestsellers', 'newest', 'priceAsc', 'priceDesc', 'rating'].map(s => `<option value="${s}" ${(opts.sort || (opts.q ? 'relevance' : 'bestsellers')) === s ? 'selected' : ''}>${esc(t('search.s.' + s))}</option>`).join('');
  const hasFilters = ['cat', 'format', 'price', 'rating', 'deals'].some(k => q.get(k));
  const langNote = bookLang
    ? `<div class="lang-note"><span class="chip">${icon('globe')} ${esc(t('lang.showing', { lang: langName(bookLang, true) }))}</span><a href="${mk({ lang: 'all' })}">${esc(t('lang.seeAll'))}</a></div>`
    : '';

  el.innerHTML = `<div class="wrap page"><div class="search-layout">
    <aside class="filters panel" id="filters" aria-label="${esc(t('search.filters'))}">
      <h4>${esc(t('search.category'))}</h4>
      ${radio('c', 'cat', '', t('search.any'))}${CATS.map(c => radio('c', 'cat', c, t('cat.' + c))).join('')}
      <h4>${esc(t('search.format'))}</h4>
      ${radio('f', 'format', '', t('search.any'))}${radio('f', 'format', 'pdf', t('book.format.pdf'))}${radio('f', 'format', 'epub', t('book.format.epub'))}
      <h4>${esc(t('search.price'))}</h4>
      ${radio('p', 'price', '', t('search.any'))}${radio('p', 'price', 'free', t('search.p.free'))}${radio('p', 'price', 'u5', t('search.p.u5'))}${radio('p', 'price', '5to10', t('search.p.5to10'))}${radio('p', 'price', 'o10', t('search.p.o10'))}
      <h4>${esc(t('search.rating'))}</h4>
      ${radio('r', 'rating', '', t('search.any'))}<a class="fopt ${opts.rating === 4 ? 'on' : ''}" href="${mk({ rating: '4' })}">${stars(4)} ${esc(t('search.r4'))}</a>
      <h4>${esc(t('search.bookLang'))}</h4>
      ${radio('l', 'lang', '', langName(UI))}${otherLangs.map(l => radio('l', 'lang', l, langName(l))).join('')}${radio('l', 'lang', 'all', t('lang.all'))}
      ${hasFilters ? `<p><a href="${opts.q ? '#/search?q=' + encodeURIComponent(opts.q) : '#/search'}">${esc(t('search.clear'))}</a></p>` : ''}
      <div class="filters-actions"><button class="btn btn-dark btn-block" data-close-filters>${esc(t('search.apply'))}</button></div>
    </aside>
    <div style="min-width:0">
      <div class="results-bar">
        <span style="display:flex;flex-direction:column;gap:6px">${head}${langNote}</span>
        <span style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-ghost btn-sm filter-toggle" data-open-filters>${icon('filter')} ${esc(t('search.filters'))}</button>
          <label class="muted" for="sort-sel">${esc(t('search.sort'))}</label>
          <select id="sort-sel">${sortSel}</select>
        </span>
      </div>
      ${books.length ? `<div class="results">${books.map(rcardHTML).join('')}</div>`
        : bookLang && !everything.some(b => b.language === bookLang)
          ? `<div class="panel empty">${icon('globe')}<h2 style="font-size:20px;color:var(--fg)">${esc(t('lang.noBooks', { lang: langName(bookLang, true) }))}</h2><p>${esc(t('lang.noBooksHint'))}</p><a class="btn btn-buy" href="${mk({ lang: 'all' })}">${esc(t('lang.seeAll'))}</a></div>`
          : `<div class="panel empty">${icon('search')}<p>${esc(t('search.none'))}</p>${bookLang ? `<a href="${mk({ lang: 'all' })}">${esc(t('lang.seeAll'))}</a>` : ''}</div>`}
    </div>
  </div></div>`;
  $('#sort-sel', el).onchange = e => go(mk({ sort: e.target.value }).slice(1));
  const fl = $('#filters', el);
  $('[data-open-filters]', el).onclick = () => { fl.classList.add('open'); $('#scrim').hidden = false; $('#scrim').classList.add('open'); };
  const closeF = () => { fl.classList.remove('open'); $('#scrim').classList.remove('open'); $('#scrim').hidden = true; };
  $('[data-close-filters]', el).onclick = closeF;
  $('#scrim').addEventListener('click', closeF, { once: true });
  // keep header search in sync
  $$('[data-search]').forEach(f => { f.q.value = opts.q; f.cat.value = opts.category; });
}

// =====================================================================
//  BOOK PAGE
// =====================================================================
export async function viewBook(el, id) {
  const b = await api.getBook(id);
  if (!b) {
    el.innerHTML = `<div class="wrap page"><div class="panel empty">${icon('book')}<p>${esc(t('book.notFound'))}</p><a class="btn btn-dark" href="#/">${esc(t('book.backHome'))}</a></div></div>`;
    return;
  }
  document.title = `${b.title} — ${CONFIG.siteName}`;
  const [owned, reviews, related, myRev] = await Promise.all([
    api.owns(b.id), api.listReviews(b.id),
    api.listBooks({ category: b.category, lang: b.language, sort: 'bestsellers' }).then(l => l.filter(x => x.id !== b.id).slice(0, 12)),
    api.myReview ? api.myReview(b.id) : null,
  ]);
  const canPreview = !owned && (b.sample_path || api.isDemo);
  const disc = b.list_price_cents && b.list_price_cents > b.price_cents ? b.list_price_cents - b.price_cents : 0;
  const inCart = cart.has(b.id);
  const counts = [5, 4, 3, 2, 1].map(n => reviews.filter(r => r.rating === n).length);
  const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) : 0;

  const buy = owned ? `
      <div class="owned-box">${icon('check', 'ico')} ${esc(t('book.owned', { date: fmtDate(owned.created_at) }))}</div>
      <a class="btn btn-buy btn-block" href="#/read/${encodeURIComponent(b.id)}">${icon('book')} ${esc(t('book.readNow'))}</a>
      <a class="btn btn-ghost btn-block" href="#/library">${esc(t('nav.library'))}</a>`
    : !b.price_cents ? `
      <div class="bigprice price-free">${esc(t('book.free'))}</div>
      <button class="btn btn-buy btn-block" data-free>${esc(t('book.getFree'))}</button>`
    : `
      <div class="bigprice">${money(b.price_cents)}</div>
      ${disc ? `<div><span class="muted" style="font-size:14px">${esc(t('book.listPrice'))} <s>${money(b.list_price_cents)}</s></span><div class="save">${esc(t('book.save', { amount: money(disc), pct: Math.round(disc / b.list_price_cents * 100) }))}</div></div>` : ''}
      <div class="muted" style="font-size:12px">${esc(t('book.vat'))}</div>
      <button class="btn btn-cart btn-block" data-add ${inCart ? 'disabled' : ''}>${esc(inCart ? t('book.inCart') : t('book.addToCart'))}</button>
      <button class="btn btn-buy btn-block" data-buy>${esc(t('book.buyNow'))}</button>`;

  el.innerHTML = `<div class="wrap page">
    <nav class="crumbs"><a href="#/">${esc(CONFIG.siteName)}</a> › <a href="#/search?cat=${b.category}">${esc(t('cat.' + b.category))}</a></nav>
    <div class="book-layout">
      <div class="book-cover-col">
        ${coverHTML(b)}
        ${canPreview ? `<button class="look-inside" data-preview>${icon('eye')} ${esc(t('book.lookInside'))}</button>` : ''}
      </div>
      <div class="book-main book-head">
        <h1>${esc(b.title)}</h1>
        ${b.subtitle ? `<div class="subtitle">${esc(b.subtitle)}</div>` : ''}
        <div class="byline">${t('book.by', { author: `<a href="#/search?q=${encodeURIComponent(b.author)}">${esc(b.author)}</a>` })} <span class="muted">· ${esc(t('book.format.' + b.format))}</span></div>
        <div class="rating-line" style="margin-top:8px">${b.rating_count ? `<b>${avg.toFixed(1)}</b> ${stars(avg)} <a href="#reviews" data-jump="reviews">${esc(t('book.ratings', { n: reviews.length }))}</a>` : `<span class="muted">${esc(t('book.noRatings'))}</span>`}</div>
      </div>
      <div class="book-main book-body">
        <div class="formats"><div class="format-chip"><span class="muted">${esc(t('book.formatShort.' + b.format))}</span><b>${b.price_cents ? money(b.price_cents) : esc(t('book.free'))}</b></div></div>
        <hr>
        <h2 class="section-title" style="font-size:18px;margin-bottom:8px">${esc(t('book.description'))}</h2>
        <div class="desc clamped" id="desc">${esc(b.description || '')}</div>
        <button class="linkbtn" id="desc-more" hidden>${esc(t('book.more'))}</button>
        <hr>
        <h2 class="section-title" style="font-size:18px">${esc(t('book.details'))}</h2>
        <div class="details">
          <div><small>${esc(t('book.d.format'))}</small><b>${esc(t('book.format.' + b.format))}</b></div>
          ${b.pages ? `<div><small>${esc(t('book.d.pages'))}</small><b>${b.pages}</b></div>` : ''}
          <div><small>${esc(t('book.d.language'))}</small><b>${esc(langName(b.language))}</b></div>
          ${b.published_at ? `<div><small>${esc(t('book.d.published'))}</small><b>${esc(fmtDate(b.published_at))}</b></div>` : ''}
          <div><small>${esc(t('book.d.category'))}</small><b><a href="#/search?cat=${b.category}">${esc(t('cat.' + b.category))}</a></b></div>
        </div>
      </div>
      <aside class="buybox">
        ${buy}
        <hr>
        <div class="note">${icon('bolt')} <span>${esc(t('book.instant'))}</span></div>
        <div class="note">${icon('devices')} <span>${esc(t('book.readAnywhere'))}</span></div>
      </aside>
    </div>

    ${related.length ? `<section class="panel" style="margin-top:26px"><h2 class="section-title">${esc(t('book.related'))}</h2><div class="shelf-track">${related.map(cardHTML).join('')}</div></section>` : ''}

    <section class="panel" id="reviews" style="margin-top:18px"><div class="reviews-layout">
      <div>
        <h2 class="section-title">${esc(t('rev.title'))}</h2>
        ${reviews.length ? `<div class="rating-line" style="font-size:16px;margin-top:8px">${stars(avg)} <b>${esc(t('rev.outOf', { avg: avg.toFixed(1) }))}</b></div>
        <div class="muted" style="font-size:14px;margin-top:4px">${esc(t('rev.global', { n: reviews.length }))}</div>
        <div class="histo">${counts.map((c, i) => `<div class="histo-row"><span>${5 - i} ★</span><div class="histo-bar"><i style="width:${reviews.length ? Math.round(c / reviews.length * 100) : 0}%"></i></div><span class="muted">${reviews.length ? Math.round(c / reviews.length * 100) : 0}%</span></div>`).join('')}</div>` : ''}
        <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
        <h3 style="font-size:16px;margin-bottom:8px">${esc(t('rev.write'))}</h3>
        ${owned ? `<form id="rev-form" style="display:flex;flex-direction:column;gap:10px">
            <div><span style="font-size:14px;font-weight:600">${esc(t('rev.yourRating'))}</span>
            <div class="star-input" id="star-input">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-v="${n}" aria-label="${n}"><svg viewBox="0 0 24 24" fill="currentColor">${starPath}</svg></button>`).join('')}</div></div>
            <label class="field"><span class="sr">${esc(t('rev.yourText'))}</span><textarea id="rev-text" placeholder="${esc(t('rev.yourText'))}" maxlength="2000" style="min-height:90px">${esc(myRev?.body || '')}</textarea></label>
            <button class="btn btn-dark" type="submit">${esc(t('rev.submit'))}</button>
          </form>` : `<p class="muted" style="font-size:14px">${esc(t('rev.onlyOwners'))}</p>`}
      </div>
      <div>
        ${reviews.length ? reviews.map(r => `<div class="review">
          <div class="who"><span class="avatar">${esc((r.author_name || '?').slice(0, 1).toUpperCase())}</span>${esc(r.author_name || '')}</div>
          <div class="rating-line" style="margin-top:6px">${stars(r.rating)} <span class="muted">${esc(fmtDate(r.created_at))}</span></div>
          ${r.verified ? `<div class="verified">${esc(t('rev.verified'))}</div>` : ''}
          ${r.body ? `<p>${esc(r.body)}</p>` : ''}
        </div>`).join('') : `<p class="muted">${esc(t('rev.none'))}</p>`}
      </div>
    </div></section>
  </div>`;

  // description clamp
  const desc = $('#desc', el), more = $('#desc-more', el);
  requestAnimationFrame(() => { if (desc.scrollHeight > desc.clientHeight + 4) more.hidden = false; });
  more.onclick = () => { const c = desc.classList.toggle('clamped'); more.textContent = t(c ? 'book.more' : 'book.less'); };
  const jump = $('[data-jump]', el);
  if (jump) jump.onclick = e => { e.preventDefault(); $('#reviews', el).scrollIntoView({ behavior: 'smooth' }); };

  $('[data-preview]', el)?.addEventListener('click', () => go('/read/' + encodeURIComponent(b.id) + '?preview=1'));
  $('[data-add]', el)?.addEventListener('click', e => { cart.add(b.id); e.currentTarget.disabled = true; e.currentTarget.textContent = t('book.inCart'); toast(t('cart.added')); });
  $('[data-buy]', el)?.addEventListener('click', () => { cart.add(b.id); startCheckout([b.id]); });
  $('[data-free]', el)?.addEventListener('click', async () => {
    if (!api.user()) { sessionStorage.setItem('librava:after', '/book/' + b.id); go('/account'); return; }
    try { await api.claimFree(b.id); toast(t('pay.freeAdded')); go('/read/' + encodeURIComponent(b.id)); } catch (e) { toast(errText(e), { error: true }); }
  });

  const form = $('#rev-form', el);
  if (form) {
    let rating = myRev?.rating || 0;
    const paint = () => $$('#star-input button', el).forEach(btn => btn.classList.toggle('on', Number(btn.dataset.v) <= rating));
    paint();
    $$('#star-input button', el).forEach(btn => btn.onclick = () => { rating = Number(btn.dataset.v); paint(); });
    form.onsubmit = async e => {
      e.preventDefault();
      if (!rating) { toast(t('rev.pickRating'), { error: true }); return; }
      try { await api.addReview(b.id, rating, $('#rev-text', el).value.trim()); toast(t('rev.thanks')); viewBook(el, id); }
      catch (err) { toast(errText(err), { error: true }); }
    };
  }
}

// =====================================================================
//  CHECKOUT (shared by cart & buy now)
// =====================================================================
export async function startCheckout(ids) {
  if (!api.user()) { sessionStorage.setItem('librava:after', '/cart'); go('/account'); return; }
  // drop already owned books
  const owned = (await Promise.all(ids.map(id => api.owns(id)))).map(Boolean);
  if (owned.some(Boolean)) {
    ids = ids.filter((_, i) => !owned[i]);
    cart.set(cart.get().filter(id => ids.includes(id)));
    toast(t('cart.ownedRemoved'));
    if (!ids.length) { go('/library'); return; }
  }
  try {
    const res = await api.checkout(ids);
    if (res.mode === 'done') { cart.set(cart.get().filter(id => !ids.includes(id))); toast(t('pay.freeAdded')); go('/library'); return; }
    if (res.mode === 'redirect') { toast(t('cart.redirecting')); location.href = res.url; return; }
    // demo payment sheet
    const books = (await Promise.all(res.paid.map(id => api.getBook(id)))).filter(Boolean);
    modal(`<h2>${esc(t('pay.demoTitle'))}</h2>
      <p class="muted" style="margin:0;font-size:14px">${esc(t('pay.demoText'))}</p>
      <div class="paycard">
        ${books.map(b => `<div class="row"><span>${esc(b.title)}</span><b>${money(b.price_cents)}</b></div>`).join('')}
        <div class="row" style="border-top:1px solid var(--line);padding-top:8px"><b>Total</b><b>${money(res.total)}</b></div>
      </div>
      <div class="actions"><button class="btn btn-ghost" data-close>${esc(t('pay.cancel'))}</button><button class="btn btn-buy" data-pay>${esc(t('pay.pay', { amount: money(res.total) }))}</button></div>`, {
      onMount(m, close) {
        m.querySelector('[data-pay]').onclick = async () => {
          await api.confirmDemoPayment(res.paid);
          cart.set(cart.get().filter(id => !ids.includes(id)));
          close(); toast(t('pay.success')); go('/library');
        };
      }
    });
  } catch (e) { toast(t('pay.error', { msg: errText(e) }), { error: true, ms: 6000 }); }
}

// =====================================================================
//  CART
// =====================================================================
export async function viewCart(el) {
  const ids = cart.get();
  const books = (await Promise.all(ids.map(id => api.getBook(id)))).filter(Boolean);
  if (books.length !== ids.length) cart.set(books.map(b => b.id));
  const total = books.reduce((s, b) => s + (b.price_cents || 0), 0);
  if (!books.length) {
    el.innerHTML = `<div class="wrap page"><div class="panel empty">${icon('cart')}<h1 style="font-size:22px;color:var(--fg)">${esc(t('cart.empty'))}</h1><p>${esc(t('cart.emptyHint'))}</p><a class="btn btn-buy" href="#/">${esc(t('book.backHome'))}</a></div></div>`;
    return;
  }
  el.innerHTML = `<div class="wrap page"><div class="cart-layout">
    <section class="panel"><h1 style="font-size:26px;font-weight:600">${esc(t('cart.title'))}</h1>
      ${books.map(b => `<div class="cart-item">
        <a href="#/book/${encodeURIComponent(b.id)}">${coverHTML(b, { badge: false })}</a>
        <div style="display:flex;flex-direction:column;gap:4px;min-width:0">
          <h3><a href="#/book/${encodeURIComponent(b.id)}" style="color:var(--fg)">${esc(b.title)}</a></h3>
          <div class="card-author">${esc(t('book.by', { author: b.author }))}</div>
          <div class="ok">${esc(t('cart.digital'))}</div>
          <div class="muted" style="font-size:13px">${esc(t('book.format.' + b.format))}</div>
          <div><button class="linkbtn" data-rm="${esc(b.id)}" style="font-size:13px">${esc(t('cart.remove'))}</button></div>
        </div>
        <div class="cprice">${priceHTML(b)}</div>
      </div>`).join('')}
      <div style="text-align:right;margin-top:12px;font-size:18px">${esc(t('cart.subtotal', { n: books.length }))} <b>${money(total)}</b></div>
    </section>
    <aside class="panel cart-sum">
      <div class="tot">${esc(t('cart.subtotal', { n: books.length }))} <b>${money(total)}</b></div>
      <button class="btn btn-buy btn-block" data-checkout>${esc(api.user() ? t('cart.checkout') : t('cart.loginToCheckout'))}</button>
      <div class="note muted" style="font-size:13px;display:flex;gap:8px">${icon('shield', 'ico')} ${esc(t('home.trust2'))}</div>
    </aside>
  </div></div>`;
  $$('[data-rm]', el).forEach(btn => btn.onclick = () => { cart.remove(btn.dataset.rm); viewCart(el); });
  $('[data-checkout]', el).onclick = () => startCheckout(books.map(b => b.id));
}

// =====================================================================
//  ACCOUNT (auth + overview)
// =====================================================================
export async function viewAccount(el, q) {
  const u = api.user();
  if (!u) return viewAuth(el, q.get('mode') === 'register' ? 'register' : 'login');
  const orders = await api.orders();
  el.innerHTML = `<div class="wrap page" style="max-width:1000px">
    <h1 style="font-size:28px;font-weight:600;margin-bottom:4px">${esc(t('acc.title'))}</h1>
    <p class="muted" style="margin:0 0 18px">${esc(u.email)} · ${esc(t('acc.memberSince', { date: fmtDate(u.createdAt) }))}</p>
    <div class="account-grid">
      <a class="panel acc-tile" href="#/library">${icon('library')}<div><b>${esc(t('nav.library'))}</b><span class="muted" style="font-size:14px">${esc(t('lib.emptyHint'))}</span></div></a>
      ${u.isAdmin ? `<a class="panel acc-tile" href="#/admin">${icon('gear')}<div><b>${esc(t('nav.admin'))}</b><span class="muted" style="font-size:14px">${esc(t('admin.add'))} · ${esc(t('admin.sales'))}</span></div></a>` : ''}
      <a class="panel acc-tile" href="#/help">${icon('help')}<div><b>${esc(t('nav.help'))}</b><span class="muted" style="font-size:14px">${esc(t('foot.howRead'))}</span></div></a>
    </div>
    <section class="panel" style="margin-top:18px"><h2 class="section-title" style="font-size:19px">${esc(t('acc.orders'))}</h2>
      ${orders.length ? orders.map(o => `<div class="order">
        <a href="#/book/${encodeURIComponent(o.book_id)}">${o.book ? coverHTML(o.book, { badge: false }) : ''}</a>
        <div style="min-width:0"><b>${esc(o.book?.title || '')}</b><div class="muted" style="font-size:13px">${esc(t('acc.order', { date: fmtDate(o.created_at) }))}</div></div>
        <div style="text-align:right"><div class="price" style="font-size:15px">${o.price_cents ? money(o.price_cents, (o.currency || CONFIG.currency).toUpperCase()) : esc(t('book.free'))}</div><a href="#/read/${encodeURIComponent(o.book_id)}" style="font-size:13px">${esc(t('book.readNow'))}</a></div>
      </div>`).join('') : `<p class="muted">${esc(t('acc.ordersEmpty'))}</p>`}
    </section>
    <section class="panel" style="margin-top:18px"><h2 class="section-title" style="font-size:19px;margin-bottom:12px">${esc(t('acc.profile'))}</h2>
      <form id="prof" style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
        <label class="field" style="flex:1;min-width:200px"><span>${esc(t('acc.name'))}</span><input id="prof-name" value="${esc(u.name)}" required maxlength="80"></label>
        <button class="btn btn-dark" type="submit">${esc(t('acc.save'))}</button>
      </form>
      <button class="btn btn-ghost" style="margin-top:16px" data-signout>${icon('logout')} ${esc(t('acc.signOut'))}</button>
    </section>
  </div>`;
  $('#prof', el).onsubmit = async e => { e.preventDefault(); try { await api.updateProfile({ name: $('#prof-name', el).value.trim() }); toast(t('acc.saved')); } catch (err) { toast(errText(err), { error: true }); } };
}

function viewAuth(el, mode) {
  const reg = mode === 'register';
  el.innerHTML = `<div class="wrap page"><div class="auth">
    <div class="panel">
      <h1>${esc(reg ? t('acc.register') : t('acc.signIn'))}</h1>
      ${api.isDemo ? `<div class="demo-note">${esc(t('acc.demoHint', { email: DEMO_ADMIN.email, pass: DEMO_ADMIN.pass }))}<br><button class="linkbtn" data-demo-admin style="margin-top:6px;font-weight:700">${esc(t('acc.demoAdmin'))}</button></div>` : ''}
      <form id="auth-form" style="display:flex;flex-direction:column;gap:12px" novalidate>
        ${reg ? `<label class="field"><span>${esc(t('acc.name'))}</span><input id="a-name" autocomplete="name" required maxlength="80"></label>` : ''}
        <label class="field"><span>${esc(t('acc.email'))}</span><input id="a-email" type="email" autocomplete="email" required></label>
        <label class="field"><span>${esc(t('acc.password'))}</span><input id="a-pass" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required minlength="6"></label>
        <div class="error" id="a-err" hidden></div>
        <button class="btn btn-buy btn-block" type="submit">${esc(reg ? t('acc.register') : t('acc.signIn'))}</button>
        ${!reg ? `<button type="button" class="linkbtn" data-forgot style="font-size:13px;align-self:flex-start">${esc(t('acc.forgot'))}</button>` : ''}
      </form>
      ${!api.isDemo && CONFIG.googleLogin ? `<div class="or">${esc(t('acc.or'))}</div>
        <button class="btn btn-ghost btn-block" data-google><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>${esc(t('acc.google'))}</button>` : ''}
    </div>
    <div class="auth-switch">${reg ? `${esc(t('acc.haveAccount'))} <a href="#/account">${esc(t('acc.signIn'))}</a>`
      : `${esc(t('acc.newHere', { site: CONFIG.siteName }))} <a href="#/account?mode=register">${esc(t('acc.register'))}</a>`}</div>
  </div></div>`;
  const err = $('#a-err', el);
  const show = m => { err.textContent = m; err.hidden = false; };
  const after = () => { const to = sessionStorage.getItem('librava:after'); sessionStorage.removeItem('librava:after'); go(to || '/library'); };
  $('#auth-form', el).onsubmit = async e => {
    e.preventDefault(); err.hidden = true;
    const email = $('#a-email', el).value.trim(), password = $('#a-pass', el).value;
    if (!email || !password) { show(t('acc.err.invalid')); return; }
    const btn = e.submitter || $('#auth-form button[type=submit]', el); btn.disabled = true;
    try {
      if (reg) {
        const r = await api.signUp({ email, password, name: $('#a-name', el).value.trim() });
        if (r.needsConfirm) { show(t('acc.checkEmail')); err.style.color = 'var(--pista-strong)'; btn.disabled = false; return; }
        toast(t('acc.welcome', { name: api.user().name }));
      } else await api.signIn({ email, password });
      after();
    } catch (x) { show(errText(x)); btn.disabled = false; }
  };
  $('[data-forgot]', el)?.addEventListener('click', async () => {
    const email = $('#a-email', el).value.trim();
    if (!email) { show(t('acc.enterEmail')); return; }
    try { await api.resetPassword(email); toast(t('acc.resetSent')); } catch (x) { show(errText(x)); }
  });
  $('[data-google]', el)?.addEventListener('click', async () => { try { await api.signInGoogle(); } catch (x) { show(errText(x)); } });
  $('[data-demo-admin]', el)?.addEventListener('click', async () => { await api.signIn({ email: DEMO_ADMIN.email, password: DEMO_ADMIN.pass }); go('/admin'); });
}

// =====================================================================
//  LIBRARY
// =====================================================================
export async function viewLibrary(el, q) {
  if (!api.user()) {
    el.innerHTML = `<div class="wrap page"><div class="panel empty">${icon('library')}<p>${esc(t('lib.loginNeeded'))}</p><a class="btn btn-buy" href="#/account">${esc(t('acc.signIn'))}</a></div></div>`;
    sessionStorage.setItem('librava:after', '/library');
    return;
  }
  if (q.get('paid')) {
    toast(t('pay.success'));
    // the payment confirmation from Stripe can take a few seconds to arrive
    setTimeout(() => { if (location.hash.startsWith('#/library')) go('/library'); }, 4000);
  }
  let items = await api.library();
  const sort = q.get('sort') || 'recent';
  const sorters = {
    recent: (a, b) => String(b.progress?.updated_at || b.purchase.created_at).localeCompare(String(a.progress?.updated_at || a.purchase.created_at)),
    bought: (a, b) => String(b.purchase.created_at).localeCompare(String(a.purchase.created_at)),
    title: (a, b) => a.book.title.localeCompare(b.book.title),
  };
  items.sort(sorters[sort] || sorters.recent);
  el.innerHTML = `<div class="wrap page">
    <div class="lib-head"><h1>${esc(t('lib.title'))}</h1>
      ${items.length ? `<label style="display:flex;gap:8px;align-items:center;font-size:14px"><span class="muted">${esc(t('search.sort'))}</span>
      <select id="lib-sort" class="input" style="width:auto;padding:6px 10px;font-size:14px">
        <option value="recent" ${sort === 'recent' ? 'selected' : ''}>${esc(t('lib.sortRecent'))}</option>
        <option value="bought" ${sort === 'bought' ? 'selected' : ''}>${esc(t('lib.sortBought'))}</option>
        <option value="title" ${sort === 'title' ? 'selected' : ''}>${esc(t('lib.sortTitle'))}</option></select></label>` : ''}
    </div>
    ${items.length ? `<div class="panel"><div class="lib-grid">${items.map(({ book: b, progress: p }) => {
      const pct = p?.percent ? Math.round(p.percent * 100) : 0;
      const status = !p ? t('lib.notStarted') : pct >= 99 ? t('lib.finished') : t('lib.read', { p: pct });
      return `<a class="lib-item" href="#/read/${encodeURIComponent(b.id)}">
        ${coverHTML(b, { badge: false })}
        <div class="progress"><i style="width:${pct}%"></i></div>
        <div class="card-title">${esc(b.title)}</div>
        <div class="lib-status">${esc(status)} · ${esc(t('book.formatShort.' + b.format))}</div>
      </a>`;
    }).join('')}</div></div>` : `<div class="panel empty">${icon('library')}<h2 style="font-size:20px;color:var(--fg)">${esc(t('lib.empty'))}</h2><p>${esc(t('lib.emptyHint'))}</p><a class="btn btn-buy" href="#/">${esc(t('book.backHome'))}</a></div>`}
  </div>`;
  $('#lib-sort', el)?.addEventListener('change', e => go('/library?sort=' + e.target.value));
}

// =====================================================================
//  HELP
// =====================================================================
export function viewHelp(el) {
  el.innerHTML = `<div class="wrap page" style="max-width:860px">
    <section class="panel faq"><h1 style="font-size:26px;margin-bottom:6px">${esc(t('help.title'))}</h1>
      ${[1, 2, 3, 4, 5].map(i => `<details ${i === 1 ? 'open' : ''}><summary>${esc(t('help.q' + i))}</summary><p>${esc(t('help.a' + i))}</p></details>`).join('')}
    </section>
    <section class="panel" id="legal" style="margin-top:18px"><h2 class="section-title">${esc(t('help.legalTitle'))}</h2><p style="line-height:1.6">${esc(t('help.legalText'))}</p>
    <p class="muted">${esc(t('foot.contact'))}: <span style="user-select:all">${esc(CONFIG.supportEmail)}</span></p></section>
  </div>`;
  if (location.hash.includes('legal')) setTimeout(() => $('#legal', el)?.scrollIntoView(), 50);
}

export { spinner, updateCartCount };
