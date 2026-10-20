import { CONFIG } from './config.js?v=20261021012315';
import { t, money, fmtDate, getLang, langName, LANGS } from './i18n.js?v=20261021012315';
import { esc, $, $$, safeHTML, hasTags, store } from './util.js?v=20261021012315';
import { offline, downloadBook, fetchBookFile } from './offline.js?v=20261021012315';
import { legalText, LEGAL_PAGES, LEGAL_VERSION } from './legal.js?v=20261021012315';
import { applyOffers, describeOffer, offersForBook, appliedLabel } from './offers.js?v=20261021012315';
import { track } from './track.js?v=20261021012315';
import { didYouMean } from './search.js?v=20261021012315';
import { api } from './api.js?v=20261021012315';
import { icon, stars, starPath, cart, go, currentPath, confirmBox, cardHTML, rcardHTML, coverHTML, priceHTML, toast, modal, errText, CATS, updateCartCount, langBtn, themePills, aplusHTML, promoHTML, carouselHTML, mountPromos } from './ui.js?v=20261021012315';

const spinner = '<div class="spinner" role="progressbar" aria-label="…"></div>';

// =====================================================================
//  HOME
// =====================================================================
export async function viewHome(el) {
  // the store shows only books in the visitor's language
  const L = getLang();
  const promosP = api.promos ? api.promos(L).catch(() => []) : Promise.resolve([]); // loads together with the books
  const [featured, newest, free, deals, all, everything] = await Promise.all([
    api.listBooks({ lang: L, featured: true, sort: 'bestsellers' }),
    api.listBooks({ lang: L, sort: 'newest', limit: 14 }),
    api.listBooks({ lang: L, free: true }),
    api.listBooks({ lang: L, deals: true }),
    api.listBooks({ lang: L }),
    api.listBooks({ sort: 'bestsellers' }),
  ]);
  // banners chosen in Admin → Advertising, only those for this language (or for all languages)
  const promos = await promosP;
  const byId = Object.fromEntries(everything.map(b => [b.id, b]));
  const many = p => (p.book_ids || []).map(id => byId[id]).filter(Boolean);
  const ok = p => p.kind === 'image' ? !!p.image_url : p.kind === 'books' ? many(p).length >= 2 : !!byId[p.book_id];
  const heroSlides = promos.filter(p => p.placement === 'hero' && ok(p)).map(p => promoHTML(p, byId[p.book_id], 'hero', many(p)));
  const strips = promos.filter(p => p.placement === 'strip' && ok(p)).map(p => `<div class="promo-strip-wrap">${promoHTML(p, byId[p.book_id], 'strip', many(p))}</div>`);
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
    const bs = all.filter(b => b.category === c || (b.categories || []).includes(c)).slice(0, 4);
    if (!bs.length) return '';
    const n = Math.min(bs.length, window.innerWidth < 700 ? 2 : 3);
    const imgs = bs.slice(0, n).map(b => b.cover_url ? `<img src="${esc(b.cover_url)}" alt="" loading="lazy">` : '').join('');
    return `<a class="cat-tile" href="#/search?cat=${c}"><div class="thumbs n${n}">${imgs}</div><span>${esc(t('cat.' + c))}</span></a>`;
  }).join('');

  el.innerHTML = `
  ${heroSlides.length ? `<section class="hero hero-promos">${carouselHTML(heroSlides, 'hero')}<div class="hero-fade"></div></section>` : `<section class="hero"><div class="wrap hero-inner">
    <div>
      <div class="hero-kicker">${esc(t('home.heroKicker'))}</div>
      <h1>${esc(t('home.heroTitle'))}</h1>
      <p>${esc(t('home.heroText'))}</p>
      <div class="hero-actions"><a class="btn btn-buy" href="#/search?sort=bestsellers">${esc(t('home.heroCta'))}</a><a class="btn btn-light" href="#/search?price=free">${esc(t('home.heroCta2'))}</a></div>
    </div>
    <div class="hero-fan" aria-hidden="true">${fan.map(b => b.cover_url ? `<img src="${esc(b.cover_url)}" alt="">` : '').join('')}</div>
  </div><div class="hero-fade"></div></section>`}
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
    ${strips[0] || ''}
    <section class="panel"><h2 class="section-title">${esc(t('home.catCardTitle'))}</h2><div class="cat-grid">${catTiles}</div></section>
    ${strips[1] || ''}
    ${shelf(t('home.new'), newest, '#/search?sort=newest')}
    ${strips[2] || ''}
    ${shelf(t('home.deals'), deals, '#/search?deals=1')}
    ${strips.slice(3).join('')}
    ${shelf(t('home.free'), free, '#/search?price=free')}
  </div>`;
  mountPromos(el);
}

// =====================================================================
//  SEARCH
// =====================================================================
export async function viewSearch(el, q) {
  const opts = {
    q: q.get('q') || '', category: q.get('cat') || '', format: q.get('format') || '', color: q.get('color') || '', price: q.get('price') || '',
    rating: Number(q.get('rating')) || 0, sort: q.get('sort') || '', deals: q.get('deals') === '1',
  };
  // book language: the visitor's language unless they pick another one or "all languages"
  const UI = getLang();
  const langParam = q.get('lang') || '';
  const bookLang = langParam === 'all' ? '' : (langParam || UI);
  opts.lang = bookLang;
  let [books, everything] = await Promise.all([api.listBooks(opts), api.listBooks({})]);
  // nothing in the visitor's language: show matches in other languages instead of an empty page
  let otherLangHits = false;
  if (opts.q && !books.length && bookLang && !langParam) { books = await api.listBooks({ ...opts, lang: '' }); otherLangHits = books.length > 0; }
  const dym = opts.q && (!books.length || books.loose) ? didYouMean(opts.q, everything) : null;
  // keep the words in the search box, like Amazon
  setTimeout(() => document.querySelectorAll('[data-search] input[name=q]').forEach(i => { if (document.activeElement !== i) i.value = opts.q; }), 0);
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
  if (opts.q) track('search', { q: opts.q, results: books.length });
  const head = opts.q ? t('search.results', { n: books.length, q: esc(opts.q) }) : opts.category ? t('search.inCat', { n: books.length, cat: esc(t('cat.' + opts.category)) }) : t('search.resultsAll', { n: books.length });
  const sortSel = ['relevance', 'bestsellers', 'newest', 'priceAsc', 'priceDesc', 'rating'].map(s => `<option value="${s}" ${(opts.sort || (opts.q ? 'relevance' : 'bestsellers')) === s ? 'selected' : ''}>${esc(t('search.s.' + s))}</option>`).join('');
  const hasFilters = ['cat', 'format', 'price', 'rating', 'deals'].some(k => q.get(k));
  const langNote = bookLang
    ? `<div class="lang-note"><span class="chip">${icon('globe')} ${esc(t('lang.showing', { lang: langName(bookLang, true) }))}</span><a href="${mk({ lang: 'all' })}">${esc(t('lang.seeAll'))}</a></div>`
    : '';

  el.innerHTML = `<div class="wrap page"><div class="search-layout">
    <aside class="filters panel" id="filters" aria-label="${esc(t('search.filters'))}">
      <h4>${esc(t('search.category'))}</h4>
      ${radio('c', 'cat', '', t('search.any'))}${CATS.slice(0, 10).map(c => radio('c', 'cat', c, t('cat.' + c))).join('')}
      <details class="more-cats" ${CATS.indexOf(q.get('cat')) >= 10 ? 'open' : ''}><summary>${esc(t('search.moreCats', { n: CATS.length - 10 }))}</summary>${CATS.slice(10).map(c => radio('c', 'cat', c, t('cat.' + c))).join('')}</details>
      <h4>${esc(t('search.format'))}</h4>
      ${radio('f', 'format', '', t('search.any'))}${radio('f', 'format', 'pdf', t('book.format.pdf'))}${radio('f', 'format', 'epub', t('book.format.epub'))}
      <h4>${esc(t('book.d.color'))}</h4>
      ${radio('k', 'color', '', t('search.any'))}${radio('k', 'color', 'color', t('book.color.color'))}${radio('k', 'color', 'bw', t('book.color.bw'))}
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
        <span style="display:flex;flex-direction:column;gap:6px">${head}${dym ? `<span class="dym">${esc(t('search.dym'))} <a href="#/search?${new URLSearchParams({ q: dym })}"><b><i>${esc(dym)}</i></b></a></span>` : ''}${books.loose ? `<span class="muted" style="font-size:14px">${esc(t('search.loose'))}</span>` : ''}${otherLangHits ? `<span class="muted" style="font-size:14px">${esc(t('search.otherLangs', { lang: langName(bookLang, true) }))}</span>` : langNote}</span>
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
  track('book_view', { book_id: b.id });
  const [owned, reviews, related, myRev] = await Promise.all([
    api.owns(b.id), api.listReviews(b.id),
    api.listBooks({ category: b.category, lang: b.language, sort: 'bestsellers' }).then(l => l.filter(x => x.id !== b.id).slice(0, 12)),
    api.myReview ? api.myReview(b.id) : null,
  ]);
  const offers = api.offers ? await api.offers().catch(() => []) : [];
  const badges = offersForBook(b, offers).filter(o => o.show_badge !== false);
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
      ${badges.length ? `<div class="offer-badges">${badges.map(o => `<span class="offer-chip">${icon('tag')} ${esc(describeOffer(o, t, c => t('cat.' + c)))}</span>`).join('')}</div>` : ''}
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
        ${b.series_name ? `<div class="series-line"><a href="#/search?q=${encodeURIComponent(b.series_name)}">${esc(t('book.series'))}: ${esc(b.series_name)}${b.series_number ? ' · ' + b.series_number : ''}</a></div>` : ''}
        <div class="byline">${t('book.by', { author: `<a href="#/search?q=${encodeURIComponent(b.author)}">${esc(b.author)}</a>` })}${(b.contributors || []).map(c => `, ${esc(c.name)} <span class="muted">(${esc(t('kdp.role.' + c.role))})</span>`).join('')} <span class="muted">· ${esc(t('book.format.' + b.format))}</span></div>
        <div class="rating-line" style="margin-top:8px">${b.rating_count ? `<b>${avg.toFixed(1)}</b> ${stars(avg)} <a href="#reviews" data-jump="reviews">${esc(t('book.ratings', { n: reviews.length }))}</a>` : `<span class="muted">${esc(t('book.noRatings'))}</span>`}</div>
      </div>
      <div class="book-main book-body">
        <div class="formats"><div class="format-chip"><span class="muted">${esc(t('book.color.' + (b.color === 'bw' ? 'bw' : 'color')))} · ${esc(t('book.formatShort.' + b.format))}</span><b>${b.price_cents ? money(b.price_cents) : esc(t('book.free'))}</b></div></div>
        <hr>
        <h2 class="section-title" style="font-size:18px;margin-bottom:8px">${esc(t('book.description'))}</h2>
        <div class="desc clamped ${hasTags(b.description) ? 'rich' : ''}" id="desc">${safeHTML(b.description)}</div>
        <button class="linkbtn" id="desc-more" hidden>${esc(t('book.more'))}</button>
        <hr>
        <div id="fbt"></div>
        ${(b.aplus || []).some(m => (m.imgs || []).some(Boolean) || m.title || m.text) ? `<h2 class="section-title" style="font-size:18px;margin-bottom:12px">${esc(t('book.fromAuthor'))}</h2>${aplusHTML(b.aplus)}<hr>` : ''}
        <h2 class="section-title" style="font-size:18px">${esc(t('book.details'))}</h2>
        <div class="details">
          <div><small>${esc(t('book.d.format'))}</small><b>${esc(t('book.format.' + b.format))}</b></div>
          <div><small>${esc(t('book.d.color'))}</small><b>${esc(t('book.color.' + (b.color === 'bw' ? 'bw' : 'color')))}</b></div>
          ${b.pages ? `<div><small>${esc(t('book.d.pages'))}</small><b>${b.pages}</b></div>` : ''}
          ${bookSpecs(b)}
          <div><small>${esc(t('book.d.language'))}</small><b>${esc(langName(b.language))}</b></div>
          ${b.published_at ? `<div><small>${esc(t('book.d.published'))}</small><b>${esc(fmtDate(b.published_at))}</b></div>` : ''}
          <div><small>${esc(t('book.d.category'))}</small><b>${[...new Set([b.category, ...(b.categories || [])])].map(c => `<a href="#/search?cat=${c}">${esc(t('cat.' + c))}</a>`).join(', ')}</b></div>
          ${b.edition ? `<div><small>${esc(t('book.edition'))}</small><b>${b.edition}</b></div>` : ''}
          ${b.age_min != null || b.age_max != null ? `<div><small>${esc(t('book.age'))}</small><b>${esc(b.age_max != null && b.age_max < 99 ? t('book.ageRange', { a: b.age_min ?? 0, b: b.age_max }) : t('book.agePlus', { a: b.age_min ?? 0 }))}</b></div>` : ''}
          ${b.isbn ? `<div><small>ISBN</small><b>${esc(b.isbn)}</b></div>` : ''}
          ${b.librava_id ? `<div><small>${esc(t('kdp.lidShort'))}</small><b>${esc(b.librava_id)}</b></div>` : ''}
        </div>
      </div>
      <aside class="buybox">
        ${buy}
        <hr>
        <div class="note">${icon('bolt')} <span>${esc(t('book.instant'))}</span></div>
        <div class="note">${icon('devices')} <span>${esc(t('book.readAnywhere'))}</span></div>
        <button class="btn btn-ghost btn-block share-btn" data-share>${icon('share')} ${esc(t('book.share'))}</button>
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
  // share: the /book/<id>/ address shows the cover, title and price in WhatsApp & co.
  renderBoughtTogether($('#fbt', el), b, owned, offers);
  $('[data-share]', el)?.addEventListener('click', async () => {
    track('share', { book_id: b.id });
    const url = location.origin + '/book/' + encodeURIComponent(b.id) + '/';
    try {
      if (navigator.share) { await navigator.share({ title: b.title, text: b.title + ' — ' + b.author, url }); return; }
      await navigator.clipboard.writeText(url); toast(t('book.linkCopied'));
    } catch (e) { if (e?.name !== 'AbortError') { try { await navigator.clipboard.writeText(url); toast(t('book.linkCopied')); } catch { prompt('', url); } } }
  });
  const jump = $('[data-jump]', el);
  if (jump) jump.onclick = e => { e.preventDefault(); $('#reviews', el).scrollIntoView({ behavior: 'smooth' }); };

  $('[data-preview]', el)?.addEventListener('click', () => track('sample', { book_id: b.id }));
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
  if (!await waiverConfirm()) return;
  track('checkout', { value_cents: null });
  try {
    const res = await api.checkout(ids, { coupon: sessionStorage.getItem(COUPON) || null });
    if (res.mode === 'done') { sessionStorage.removeItem(COUPON); cart.set(cart.get().filter(id => !ids.includes(id))); toast(t('pay.freeAdded')); go('/library'); return; }
    if (res.mode === 'redirect') { sessionStorage.removeItem(COUPON); toast(t('cart.redirecting')); location.href = res.url; return; }
    if (res.mode === 'bank') { cart.set(cart.get().filter(id => !ids.includes(id))); showBankOrder(res); return; }
    // demo payment sheet
    const books = (await Promise.all(res.paid.map(id => api.getBook(id)))).filter(Boolean);
    modal(`<h2>${esc(t('pay.demoTitle'))}</h2>
      <p class="muted" style="margin:0;font-size:14px">${esc(t('pay.demoText'))}</p>
      <div class="paycard">
        ${books.map(b => `<div class="row"><span>${esc(b.title)}</span><b>${money(b.price_cents)}</b></div>`).join('')}
        ${res.discount ? `<div class="row"><span>${esc(t('cart.discount'))}</span><b>−${money(res.discount)}</b></div>` : ''}
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

// bank-transfer instructions after an order (own server)
function showBankOrder(res) {
  const o = res.order, b = res.bank || {};
  const amount = money(o.amount_cents, (o.currency || CONFIG.currency).toUpperCase());
  const row = (label, value, copy) => !value ? '' : `<div class="bank-row"><span class="muted">${esc(label)}</span><b class="bank-val">${esc(value)}</b>${copy ? `<button class="btn btn-ghost btn-sm" data-copy="${esc(value)}">${esc(t('pay.copy'))}</button>` : ''}</div>`;
  modal(`<h2>${esc(t('pay.bankTitle'))}</h2>
    <p style="margin:0;font-size:15px;line-height:1.5">${esc(t('pay.bankText', { ref: o.reference, amount }))}</p>
    <div class="paycard bank-card">
      ${row(t('pay.holder'), b.holder, true)}
      ${row(t('pay.iban'), b.iban, true)}
      ${row(t('pay.bic'), b.bic, true)}
      ${row(t('pay.bankName'), b.bank, false)}
      ${row(t('pay.reference'), o.reference, true)}
      <div class="bank-row" style="border-top:1px solid var(--line);padding-top:8px"><span class="muted">Total</span><b class="bank-val">${esc(amount)}</b></div>
    </div>
    ${res.emailed ? `<p class="muted" style="margin:0;font-size:13px">${esc(t('pay.emailSent'))}</p>` : ''}
    <div class="actions"><button class="btn btn-buy" data-close>${esc(t('pay.close'))}</button></div>`, {
    onMount(m, close) {
      m.querySelectorAll('[data-copy]').forEach(btn => btn.onclick = async () => {
        try { await navigator.clipboard.writeText(btn.dataset.copy); btn.textContent = t('pay.copied'); }
        catch { const r = document.createRange(); r.selectNodeContents(btn.previousElementSibling); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
      });
      m.querySelector('[data-close]').addEventListener('click', () => go('/account'));
    }
  });
}

// =====================================================================
//  CART
// =====================================================================
// ---------------------------------------------------------------- "Frequently bought together" (like Amazon)
async function boughtTogetherFor(b) {
  const all = await api.listBooks({});
  const ok = x => x && x.id !== b.id && x.status !== 'draft' && x.price_cents > 0;
  const byId = Object.fromEntries(all.map(x => [x.id, x]));
  const out = [], add = x => { if (ok(x) && !out.some(y => y.id === x.id)) out.push(x); };
  (b.recommend_ids || []).forEach(id => add(byId[id]));                       // chosen by the shop owner
  if (out.length < 2) (await (api.boughtTogether?.(b.id) || [])).forEach(id => add(byId[id])); // bought by the same customers
  const same = all.filter(x => x.language === b.language);
  if (out.length < 2 && b.series_name) same.filter(x => x.series_name === b.series_name).forEach(add);
  if (out.length < 2) same.filter(x => x.author === b.author).forEach(add);
  if (out.length < 2) same.filter(x => x.category === b.category || (x.categories || []).includes(b.category)).sort((x, y) => (y.sales_count || 0) - (x.sales_count || 0)).forEach(add);
  const mine = await Promise.all(out.map(x => api.owns(x.id)));
  return out.filter((_, i) => !mine[i]).slice(0, 2);
}
async function renderBoughtTogether(box, b, owned, offers) {
  if (!box || !b.price_cents) return;
  const others = await boughtTogetherFor(b).catch(() => []);
  if (!others.length || !box.isConnected) return;
  const list = owned ? others : [b, ...others];
  if (list.length < 2) return;
  const sel = new Set(list.map(x => x.id));
  const draw = () => {
    const chosen = list.filter(x => sel.has(x.id));
    const r = applyOffers(chosen, offers);
    box.innerHTML = `<section class="fbt"><h2 class="section-title" style="font-size:18px">${esc(t('fbt.title'))}</h2>
      <div class="fbt-row">${list.map((x, i) => `${i ? '<span class="fbt-plus">+</span>' : ''}<a href="#/book/${encodeURIComponent(x.id)}" class="fbt-cover ${sel.has(x.id) ? '' : 'off'}">${coverHTML(x, { badge: false })}</a>`).join('')}
        <div class="fbt-buy"><div>${esc(t('fbt.total'))} <b class="fbt-total">${money(r.total)}</b>${r.discount ? ` <s class="muted">${money(r.subtotal)}</s>` : ''}</div>
          ${r.discount ? `<div class="save">${esc(t('fbt.save', { amount: money(r.discount) }))}</div>` : ''}
          <button class="btn btn-cart" data-fbt-add ${chosen.length ? '' : 'disabled'}>${esc(chosen.length === list.length ? t('fbt.addAll', { n: chosen.length }) : t('fbt.addSome', { n: chosen.length }))}</button></div></div>
      <div class="fbt-list">${list.map(x => `<label class="check"><input type="checkbox" value="${esc(x.id)}" ${sel.has(x.id) ? 'checked' : ''}>
        <span>${x.id === b.id ? `<b>${esc(t('fbt.thisItem'))}</b> ` : ''}<a href="#/book/${encodeURIComponent(x.id)}">${esc(x.title)}</a> <span class="muted">· ${esc(x.author)}</span> · <b>${money(x.price_cents)}</b>${r.final[x.id] != null && r.final[x.id] < x.price_cents && sel.has(x.id) ? ` <span class="save">→ ${money(r.final[x.id])}</span>` : ''}</span></label>`).join('')}</div>
    </section><hr>`;
    box.querySelectorAll('.fbt-list input').forEach(cb => cb.onchange = () => { cb.checked ? sel.add(cb.value) : sel.delete(cb.value); draw(); });
    box.querySelector('[data-fbt-add]').onclick = () => { list.filter(x => sel.has(x.id)).forEach(x => cart.add(x.id)); toast(t('fbt.added', { n: sel.size })); go('/cart'); };
  };
  draw();
}

// ---------------------------------------------------------------- cart with offers, coupon and "add 1 more" hints
const COUPON = 'librava:coupon';
export async function viewCart(el) {
  const ids = cart.get();
  const found = (await Promise.all(ids.map(id => api.getBook(id)))).filter(Boolean);
  // books already bought (or no longer for sale) leave the cart by themselves
  const mine = await Promise.all(found.map(b => api.owns(b.id).catch(() => null)));
  const books = found.filter((b, i) => !mine[i]);
  if (books.length !== ids.length) cart.set(books.map(b => b.id));
  if (!books.length) {
    el.innerHTML = `<div class="wrap page"><div class="panel empty">${icon('cart')}<h1 style="font-size:22px;color:var(--fg)">${esc(t('cart.empty'))}</h1><p>${esc(t('cart.emptyHint'))}</p><a class="btn btn-buy" href="#/">${esc(t('book.backHome'))}</a></div></div>`;
    return;
  }
  const code = sessionStorage.getItem(COUPON) || '';
  const [offers, coupon] = await Promise.all([api.offers ? api.offers().catch(() => []) : [], code && api.findCoupon ? api.findCoupon(code).catch(() => null) : null]);
  const r = applyOffers(books, [...offers, ...(coupon ? [coupon] : [])], { coupon: code });
  const desc = o => describeOffer(o, t, c => t('cat.' + c));
  const line = b => { const f = r.final[b.id]; return f != null && f < b.price_cents ? `<span class="price">${f ? money(f) : esc(t('book.free'))}</span><span class="price-old">${money(b.price_cents)}</span>` : priceHTML(b); };
  const nudge = n => {
    const where = n.category ? '#/search?cat=' + n.category : '#/search?sort=bestsellers';
    const txt = n.kind === 'qty' ? t('cart.nudgeQty', { n: n.more, p: n.percent }) : n.percent >= 100 ? t('cart.nudgeFree', { n: n.more }) : t('cart.nudgeBxgy', { n: n.more, p: n.percent });
    return `<a class="nudge" href="${where}">${icon('tag')} <span>${esc(txt)}${n.category ? ' · ' + esc(t('cat.' + n.category)) : ''}</span> <b>→</b></a>`;
  };
  const cmsg = { invalid: 'cart.cInvalid', min: 'cart.cMin', used: 'cart.cUsed', new: 'cart.cNew', notBest: 'cart.cNotBest', ok: 'cart.cOk' }[r.couponState];
  el.innerHTML = `<div class="wrap page"><div class="cart-layout">
    <section class="panel"><h1 style="font-size:26px;font-weight:600">${esc(t('cart.title'))}</h1>
      ${r.nudges.length ? `<div class="nudges">${r.nudges.map(nudge).join('')}</div>` : ''}
      ${books.map(b => `<div class="cart-item">
        <a href="#/book/${encodeURIComponent(b.id)}">${coverHTML(b, { badge: false })}</a>
        <div style="display:flex;flex-direction:column;gap:4px;min-width:0">
          <h3><a href="#/book/${encodeURIComponent(b.id)}" style="color:var(--fg)">${esc(b.title)}</a></h3>
          <div class="card-author">${esc(t('book.by', { author: b.author }))}</div>
          <div class="ok">${esc(t('cart.digital'))}</div>
          <div class="muted" style="font-size:13px">${esc(t('book.format.' + b.format))}</div>
          <div><button class="linkbtn" data-rm="${esc(b.id)}" style="font-size:13px">${esc(t('cart.remove'))}</button></div>
        </div>
        <div class="cprice">${line(b)}</div>
      </div>`).join('')}
      <div style="text-align:right;margin-top:12px;font-size:18px">${esc(t('cart.subtotal', { n: books.length }))} <b>${money(r.total)}</b></div>
    </section>
    <aside class="panel cart-sum">
      <div class="sum-rows">
        <div><span>${esc(t('cart.items', { n: books.length }))}</span><span>${money(r.subtotal)}</span></div>
        ${r.applied.map(a => `<div class="sum-off"><span>${icon('tag')} ${esc(appliedLabel(a, t, c => t('cat.' + c)))}</span><span>−${money(a.saving)}</span></div>`).join('')}
        <div class="sum-total"><span>${esc(t('cart.total'))}</span><b>${money(r.total)}</b></div>
        ${r.discount ? `<div class="save" style="text-align:right">${esc(t('fbt.save', { amount: money(r.discount) }))}</div>` : ''}
      </div>
      <button class="btn btn-buy btn-block" data-checkout>${esc(api.user() ? t('cart.checkout') : t('cart.loginToCheckout'))}</button>
      <form class="coupon" id="coupon-form"><label for="cp">${esc(t('cart.haveCode'))}</label>
        <div class="coupon-row"><input id="cp" class="input" maxlength="40" autocomplete="off" autocapitalize="characters" value="${esc(code)}" placeholder="${esc(t('cart.codePh'))}">
        ${code ? `<button type="button" class="btn btn-ghost btn-sm" id="cp-rm">×</button>` : ''}<button class="btn btn-dark btn-sm" type="submit">${esc(t('cart.apply'))}</button></div>
        ${code && cmsg ? `<small class="${r.couponState === 'ok' ? 'save' : 'muted'}">${esc(t(cmsg))}</small>` : ''}</form>
      <div class="note muted" style="font-size:13px;display:flex;gap:8px">${icon('shield', 'ico')} ${esc(t('home.trust2'))}</div>
    </aside>
  </div></div>`;
  $$('[data-rm]', el).forEach(btn => btn.onclick = () => { cart.remove(btn.dataset.rm); viewCart(el); });
  $('[data-checkout]', el).onclick = () => startCheckout(books.map(b => b.id));
  $('#coupon-form', el).onsubmit = e => { e.preventDefault(); const v = $('#cp', el).value.trim().toUpperCase(); if (v) sessionStorage.setItem(COUPON, v); else sessionStorage.removeItem(COUPON); viewCart(el); };
  $('#cp-rm', el)?.addEventListener('click', () => { sessionStorage.removeItem(COUPON); viewCart(el); });
}

// =====================================================================
//  ACCOUNT (auth + overview)
// =====================================================================
export async function viewAccount(el, q, sub) {
  if (q.get('mode') === 'reset' && q.get('token') && api.resetWithToken) return viewReset(el, q.get('token'));
  const u = api.user();
  if (!u) {
    const r = viewAuth(el, q.get('mode') === 'register' ? 'register' : 'login');
    if (q.get('mode') === 'linkexpired') { const n = document.createElement('div'); n.className = 'demo-note'; n.textContent = t('acc.linkExpired'); el.querySelector('.auth .panel h1')?.after(n); }
    return r;
  }
  // the "new password" link from the email opens the security page with the password form ready
  if (q.get('mode') === 'newpass') return accSecurity(el, u, true);
  if (sub === 'security') return accSecurity(el, u, false);
  if (sub === 'orders') return accOrders(el);
  if (sub === 'preferences') return accPreferences(el);
  return accHome(el, u);
}

const crumbs = (here) => `<nav class="acc-crumbs"><a href="#/account">${esc(t('acc.title'))}</a><span>›</span><b>${esc(here)}</b></nav>`;
const initials = n => (String(n || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('') || '?').toUpperCase();
const cur = o => (o.currency || CONFIG.currency).toUpperCase();

async function accHome(el, u) {
  const [orders, pending] = await Promise.all([api.orders(), api.pendingOrders ? api.pendingOrders().catch(() => []) : []]);
  const tile = (href, ic, title, desc) => `<a class="acc-card" href="${href}"><span class="acc-ico">${icon(ic)}</span><span><b>${esc(title)}</b><span>${esc(desc)}</span></span></a>`;
  el.innerHTML = `<div class="wrap page acc-wrap">
    <section class="acc-hero">
      <div class="acc-avatar" aria-hidden="true">${esc(initials(u.name))}</div>
      <div class="acc-who"><h1>${esc(t('acc.hello', { name: u.name.split(' ')[0] }))}</h1>
        <p>${esc(u.email)}</p><p class="muted">${esc(t('acc.memberSince', { date: fmtDate(u.createdAt) }))}</p></div>
      <div class="acc-stats"><div><b>${orders.length}</b><span>${esc(t('acc.statBooks'))}</span></div>
        ${u.isAdmin ? `<span class="acc-badge">${icon('gear')} ${esc(t('admin.roleAdmin'))}</span>` : ''}</div>
    </section>
    ${pending.length ? `<section class="panel acc-pending"><h2>${esc(t('acc.pending'))}</h2>
      ${pending.map(o => `<div class="pending-order"><span>${esc(t('acc.pendingItem', { ref: o.reference, amount: money(o.amount_cents, cur(o)) }))}</span>
        <span class="muted" style="font-size:13px">${(o.items || []).map(i => esc(i.title)).join(' · ')}</span></div>`).join('')}</section>` : ''}
    <div class="acc-cards">
      ${tile('#/account/orders', 'box', t('acc.tile.orders'), t('acc.tile.ordersDesc'))}
      ${tile('#/library', 'library', t('nav.library'), t('acc.tile.libraryDesc'))}
      ${tile('#/account/security', 'shield', t('acc.tile.security'), t('acc.tile.securityDesc'))}
      ${tile('#/account/preferences', 'palette', t('acc.tile.prefs'), t('acc.tile.prefsDesc'))}
      ${tile('#/help', 'help', t('acc.tile.help'), t('acc.tile.helpDesc'))}
      ${u.isAdmin ? tile('#/admin', 'chart', t('nav.admin'), t('acc.tile.adminDesc')) : ''}
    </div>
    <section class="panel acc-recent">
      <div class="acc-sec-head"><h2>${esc(t('acc.recentOrders'))}</h2>${orders.length ? `<a href="#/account/orders">${esc(t('acc.seeAllOrders'))}</a>` : ''}</div>
      ${orders.length ? `<div class="acc-recent-row">${orders.slice(0, 6).map(o => o.book ? `<a class="acc-mini" href="#/read/${encodeURIComponent(o.book_id)}" title="${esc(o.book.title)}">${coverHTML(o.book, { badge: false })}<span>${esc(o.book.title)}</span></a>` : '').join('')}</div>`
        : `<p class="muted" style="margin:0">${esc(t('acc.ordersEmpty'))} <a href="#/">${esc(t('acc.startShopping'))}</a></p>`}
    </section>
    <div class="acc-signout"><button class="btn btn-ghost" data-signout>${icon('logout')} ${esc(t('acc.signOut'))}</button></div>
  </div>`;
}

async function accOrders(el) {
  const list = await api.orders();
  // group the books bought together into one order, like a receipt
  const groups = [];
  for (const p of list) {
    const key = p.order_id || ('p' + p.id);
    let g = groups.find(x => x.key === key);
    if (!g) { g = { key, ref: p.order?.reference || p.reference || null, date: p.created_at, items: [], total: 0, currency: cur(p), gift: !!p.gift }; groups.push(g); }
    g.items.push(p); g.total += p.price_cents || 0;
  }
  el.innerHTML = `<div class="wrap page acc-wrap">${crumbs(t('acc.tile.orders'))}
    <h1 class="acc-h1">${esc(t('acc.tile.orders'))}</h1>
    ${groups.length ? groups.map(g => `<article class="order-card">
      <header><div><span>${esc(t('ord.date'))}</span><b>${esc(fmtDate(g.date))}</b></div>
        <div><span>${esc(t('ord.total'))}</span><b>${g.total ? esc(money(g.total, g.currency)) : esc(g.gift ? t('ord.gift') : t('book.free'))}</b></div>
        <div class="ord-num"><span>${esc(t('ord.number'))}</span><b>${esc(g.ref || '—')}</b></div></header>
      ${g.items.map(p => `<div class="order-line">
        <a href="#/book/${encodeURIComponent(p.book_id)}" class="ol-cover">${p.book ? coverHTML(p.book, { badge: false }) : ''}</a>
        <div class="ol-info"><a href="#/book/${encodeURIComponent(p.book_id)}"><b>${esc(p.book?.title || '')}</b></a>
          <div class="muted">${esc(p.book?.author || '')}</div>
          <div class="ol-price">${p.price_cents ? esc(money(p.price_cents, cur(p))) : esc(p.gift ? t('ord.gift') : t('book.free'))}</div></div>
        <div class="ol-actions"><a class="btn btn-cart btn-sm" href="#/read/${encodeURIComponent(p.book_id)}">${esc(t('book.readNow'))}</a>
          <a class="btn btn-ghost btn-sm" href="#/book/${encodeURIComponent(p.book_id)}#reviews">${esc(t('ord.review'))}</a></div>
      </div>`).join('')}
    </article>`).join('') : `<div class="panel empty">${icon('box')}<p>${esc(t('acc.ordersEmpty'))}</p><a class="btn btn-buy" href="#/">${esc(t('acc.startShopping'))}</a></div>`}
  </div>`;
}

function accPreferences(el) {
  const draw = () => {
    el.innerHTML = `<div class="wrap page acc-wrap">${crumbs(t('acc.tile.prefs'))}
      <h1 class="acc-h1">${esc(t('acc.tile.prefs'))}</h1>
      <div class="sec-list">
        <div class="sec-row"><div><b>${esc(t('nav.chooseLanguage'))}</b><span>${esc(langName(getLang()))}</span><small class="muted">${esc(t('acc.prefLangHint'))}</small></div>${langBtn('lang-btn-light')}</div>
        <div class="sec-row"><div><b>${esc(t('nav.theme'))}</b><small class="muted">${esc(t('acc.prefThemeHint'))}</small></div>${themePills()}</div>
        ${api.setMarketing ? `<div class="sec-row"><div><b>${esc(t('legal.newsTitle'))}</b><small class="muted">${esc(t('legal.newsHint'))}</small></div><label class="switch"><input type="checkbox" id="pref-news"><span></span></label></div>` : ''}
      </div></div>`;
  };
  draw();
  const bindNews = async () => {
    const cb = $('#pref-news', el); if (!cb) return;
    cb.checked = await api.getMarketing().catch(() => false);
    cb.onchange = async () => { try { await api.setMarketing(cb.checked); toast(t('acc.saved')); } catch (x) { cb.checked = !cb.checked; toast(errText(x), { error: true }); } };
  };
  bindNews();
  const re = () => { draw(); bindNews(); };
  window.addEventListener('librava:themechange', re);
  return () => window.removeEventListener('librava:themechange', re);
}

function accSecurity(el, u, recovery) {
  const needCurrent = !recovery && api.hasPassword();
  const canEmail = !!api.changeEmail;
  el.innerHTML = `<div class="wrap page acc-wrap">${crumbs(t('acc.tile.security'))}
    <h1 class="acc-h1">${esc(t('acc.tile.security'))}</h1>
    <div class="sec-list">
      <div class="sec-row" data-row="name"><div><b>${esc(t('acc.name'))}</b><span>${esc(u.name)}</span></div><button class="btn btn-ghost btn-sm" data-edit="name">${esc(t('sec.edit'))}</button>
        <form class="sec-form" id="f-name" hidden><label class="field"><span>${esc(t('acc.name'))}</span><input id="prof-name" value="${esc(u.name)}" required maxlength="80" autocomplete="name"></label>
          <div class="sec-btns"><button class="btn btn-dark btn-sm" type="submit">${esc(t('acc.save'))}</button><button class="btn btn-ghost btn-sm" type="button" data-cancel>${esc(t('sec.cancel'))}</button></div></form></div>
      <div class="sec-row" data-row="email"><div><b>${esc(t('acc.email'))}</b><span>${esc(u.email)}</span></div>${canEmail ? `<button class="btn btn-ghost btn-sm" data-edit="email">${esc(t('sec.edit'))}</button>` : ''}
        ${canEmail ? `<form class="sec-form" id="f-email" hidden novalidate><label class="field"><span>${esc(t('sec.newEmail'))}</span><input id="new-email" type="email" required autocomplete="email"></label>
          <small class="muted">${esc(t('sec.emailHint'))}</small><div class="error" id="em-err" hidden></div>
          <div class="sec-btns"><button class="btn btn-dark btn-sm" type="submit">${esc(t('acc.save'))}</button><button class="btn btn-ghost btn-sm" type="button" data-cancel>${esc(t('sec.cancel'))}</button></div></form>` : ''}</div>
      <div class="sec-row ${recovery ? 'open pass-recovery' : ''}" data-row="password" id="password"><div><b>${esc(recovery ? t('acc.setNewPass') : t('acc.password'))}</b><span>••••••••</span></div>${recovery ? '' : `<button class="btn btn-ghost btn-sm" data-edit="password">${esc(t('sec.edit'))}</button>`}
        <form id="pass-form" class="sec-form form-grid" ${recovery ? '' : 'hidden'} novalidate autocomplete="on">
          <input type="email" autocomplete="username" value="${esc(u.email)}" hidden>
          ${needCurrent ? `<label class="field full"><span>${esc(t('acc.currentPass'))}</span><input id="pw-cur" type="password" autocomplete="current-password" required></label>` : ''}
          <label class="field"><span>${esc(t('acc.newPass'))}</span><input id="pw-new" type="password" autocomplete="new-password" required minlength="6"></label>
          <label class="field"><span>${esc(t('acc.confirmPass'))}</span><input id="pw-new2" type="password" autocomplete="new-password" required minlength="6"></label>
          <div class="error full" id="pw-err" hidden></div>
          <div class="full sec-btns"><button class="btn btn-dark btn-sm" type="submit">${esc(t('acc.save'))}</button>${recovery ? '' : `<button class="btn btn-ghost btn-sm" type="button" data-cancel>${esc(t('sec.cancel'))}</button>`}</div>
        </form></div>
    </div>
    ${api.deleteAccount && !u.isAdmin ? `<details class="sec-close"><summary>${esc(t('sec.closeAccount'))}</summary>
      <div class="panel danger-zone"><p class="muted" style="margin:0 0 12px;font-size:14px">${esc(t('acc.deleteText'))}</p>
      <form id="del-form" style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap" novalidate>
        <label class="field" style="flex:1;min-width:200px"><span>${esc(t('acc.deleteConfirm'))}</span><input id="del-pass" type="password" autocomplete="current-password" required></label>
        <button class="btn btn-ghost" type="submit" style="color:var(--deal);border-color:var(--deal)">${esc(t('acc.deleteBtn'))}</button>
      </form><div class="error" id="del-err" hidden></div></div></details>` : ''}
  </div>`;
  const open = (row, on) => { const r = $(`[data-row="${row}"]`, el); r.classList.toggle('open', on); const f = r.querySelector('form'); if (f) { f.hidden = !on; if (on) f.querySelector('input:not([hidden])')?.focus(); } };
  $$('[data-edit]', el).forEach(b => b.onclick = () => open(b.dataset.edit, true));
  $$('[data-cancel]', el).forEach(b => b.onclick = () => open(b.closest('[data-row]').dataset.row, false));
  $('#f-name', el).onsubmit = async e => {
    e.preventDefault();
    try { await api.updateProfile({ name: $('#prof-name', el).value.trim() }); toast(t('acc.saved')); accSecurity(el, api.user(), false); }
    catch (x) { toast(errText(x), { error: true }); }
  };
  $('#f-email', el)?.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#em-err', el); err.hidden = true;
    const v = $('#new-email', el).value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { err.textContent = t('acc.err.emailInvalid'); err.hidden = false; return; }
    try { await api.changeEmail(v); toast(t('sec.emailSent', { email: v }), { ms: 6000 }); open('email', false); }
    catch (x) { err.textContent = errText(x); err.hidden = false; }
  });
  const pf = $('#pass-form', el);
  pf.onsubmit = async e => {
    e.preventDefault();
    const err = $('#pw-err', el); err.hidden = true;
    const c = needCurrent ? $('#pw-cur', el).value : null, n1 = $('#pw-new', el).value, n2 = $('#pw-new2', el).value;
    const fail = m => { err.textContent = m; err.hidden = false; };
    if (needCurrent && !c) return fail(t('acc.err.currentWrong'));
    if (n1.length < 6) return fail(t('acc.err.short'));
    if (n1 !== n2) return fail(t('acc.err.mismatch'));
    const btn = pf.querySelector('button[type=submit]'); btn.disabled = true;
    try { await api.changePassword(c, n1); toast(t('acc.passChanged')); go('/account/security'); }
    catch (x) { fail(errText(x)); }
    btn.disabled = false;
  };
  if (recovery) setTimeout(() => $('#pw-new', el)?.focus(), 50);
  $('#del-form', el)?.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#del-err', el); err.hidden = true;
    const pw = $('#del-pass', el).value;
    if (!pw) { err.textContent = t('acc.err.currentWrong'); err.hidden = false; return; }
    if (!await confirmBox(t('acc.deleteText'), { ok: t('acc.deleteBtn'), danger: true })) return;
    try { await api.deleteAccount(pw); toast(t('acc.deleted')); go('/'); }
    catch (x) { err.textContent = errText(x); err.hidden = false; }
  });
}

// opened from the "reset password" email (own server)
function viewReset(el, token) {
  el.innerHTML = `<div class="wrap page"><div class="auth"><div class="panel">
    <h1>${esc(t('acc.setNewPass'))}</h1>
    <form id="rs-form" style="display:flex;flex-direction:column;gap:12px" novalidate>
      <label class="field"><span>${esc(t('acc.newPass'))}</span><input id="rs-1" type="password" autocomplete="new-password" minlength="6" required></label>
      <label class="field"><span>${esc(t('acc.confirmPass'))}</span><input id="rs-2" type="password" autocomplete="new-password" minlength="6" required></label>
      <div class="error" id="rs-err" hidden></div>
      <button class="btn btn-buy btn-block" type="submit">${esc(t('acc.save'))}</button>
    </form></div></div></div>`;
  $('#rs-form', el).onsubmit = async e => {
    e.preventDefault();
    const err = $('#rs-err', el); err.hidden = true;
    const a = $('#rs-1', el).value, b = $('#rs-2', el).value;
    const fail = m => { err.textContent = m; err.hidden = false; };
    if (a.length < 6) return fail(t('acc.err.short'));
    if (a !== b) return fail(t('acc.err.mismatch'));
    try { await api.resetWithToken(token, a); toast(t('acc.passChanged')); go('/library'); }
    catch (x) { fail(errText(x)); }
  };
}

function viewAuth(el, mode) {
  const reg = mode === 'register';
  el.innerHTML = `<div class="wrap page"><div class="auth">
    <div class="panel">
      <h1>${esc(reg ? t('acc.register') : t('acc.signIn'))}</h1>
      ${api.isDemo && reg ? `<div class="demo-note">${esc(t('acc.demoFirstAdmin'))}</div>` : ''}
      <form id="auth-form" style="display:flex;flex-direction:column;gap:12px" novalidate>
        ${reg ? `<label class="field"><span>${esc(t('acc.name'))}</span><input id="a-name" autocomplete="name" required maxlength="80"></label>` : ''}
        <label class="field"><span>${esc(t('acc.email'))}</span><input id="a-email" type="email" autocomplete="email" required></label>
        <label class="field"><span>${esc(t('acc.password'))}</span><input id="a-pass" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required minlength="6"></label>
        <div class="error" id="a-err" hidden></div>
        ${reg ? `<label class="check consent-check"><input type="checkbox" id="a-terms" required> <span>${t('legal.acceptTerms', { terms: `<a href="#/legal/terms" target="_blank">${esc(legalText(getLang()).title.terms)}</a>`, privacy: `<a href="#/legal/privacy" target="_blank">${esc(legalText(getLang()).title.privacy)}</a>` })}</span></label>
          <label class="check consent-check"><input type="checkbox" id="a-news"> <span>${esc(t('legal.newsOptIn'))}</span></label>` : ''}
        <button class="btn btn-buy btn-block" type="submit">${esc(reg ? t('acc.register') : t('acc.signIn'))}</button>
        ${!reg ? `<button type="button" class="linkbtn" data-forgot style="font-size:13px;align-self:flex-start">${esc(t('acc.forgot'))}</button>` : ''}
      </form>
      ${api.supportsGoogle && CONFIG.googleLogin ? `<div class="or">${esc(t('acc.or'))}</div>
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
        if (!$('#a-terms', el).checked) { show(t('legal.mustAccept')); btn.disabled = false; return; }
        track('signup');
        const r = await api.signUp({ email, password, name: $('#a-name', el).value.trim(), marketing: $('#a-news', el).checked });
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
  if (q.get('welcome')) toast(t('acc.emailConfirmed'));
  if (q.get('paid')) {
    toast(t('pay.success'));
    // ask Stripe straight away (does not wait for the webhook); try a few times while the payment settles
    (async () => {
      for (let i = 0; i < 6; i++) {
        const r = await api.confirmPayments?.() || {};
        if (!currentPath().startsWith('/library')) return;
        if (r.paid?.length || !r.checked) { go('/library'); return; }
        await new Promise(res => setTimeout(res, 2500));
      }
    })();
  }
  let items, offlineMode = false;
  try {
    items = await api.library();
    // what is in the library is no longer in the cart
    const have = new Set(items.map(x => x.book?.id));
    const c = cart.get(); if (c.some(id => have.has(id))) cart.set(c.filter(id => !have.has(id)));
  }
  catch (e) {
    // no internet: show the books saved on this device
    items = offline.all().map(o => ({ book: o.book, purchase: { created_at: o.saved_at }, progress: store.get('guestprog:' + o.book.id, null) }));
    offlineMode = true;
  }
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
      const off = offline.has(b.id);
      return `<div class="lib-item"><a href="#/read/${encodeURIComponent(b.id)}">
        ${coverHTML(b, { badge: false })}
        <div class="progress"><i style="width:${pct}%"></i></div>
        <div class="card-title">${esc(b.title)}</div>
        <div class="lib-status">${esc(status)} · ${esc(t('book.formatShort.' + b.format))}${off ? ` · <span class="off-tag">${icon('check')} ${esc(t('off.saved'))}</span>` : ''}</div></a>
        <div class="lib-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-offline="${esc(b.id)}" title="${esc(off ? t('off.removeHint') : t('off.saveHint'))}">${icon(off ? 'trash' : 'devices')} ${esc(off ? t('off.remove') : t('off.save'))}</button>
          ${b.allow_download !== false && !offlineMode ? `<button type="button" class="btn btn-ghost btn-sm" data-download="${esc(b.id)}" title="${esc(t('off.downloadHint'))}">${icon('download')} ${esc(t('off.download'))}</button>` : ''}
        </div></div>`;
    }).join('')}</div></div>` : `<div class="panel empty">${icon('library')}<h2 style="font-size:20px;color:var(--fg)">${esc(t('lib.empty'))}</h2><p>${esc(t('lib.emptyHint'))}</p><a class="btn btn-buy" href="#/">${esc(t('book.backHome'))}</a></div>`}
  </div>`;
  $('#lib-sort', el)?.addEventListener('change', e => go('/library?sort=' + e.target.value));
  if (offlineMode) $('.lib-head', el).insertAdjacentHTML('afterend', `<div class="demo-note" style="margin-bottom:12px">${esc(t('off.noInternet'))}</div>`);
  const byId = id => items.find(x => x.book.id === id)?.book;
  $$('[data-download]', el).forEach(btn => btn.onclick = async () => {
    const b = byId(btn.dataset.download); const label = btn.innerHTML; btn.disabled = true;
    try { await downloadBook(b, p => { btn.textContent = Math.round(p * 100) + '%'; }); toast(t('off.downloaded')); }
    catch (x) { toast(errText(x), { error: true }); }
    btn.disabled = false; btn.innerHTML = label;
  });
  $$('[data-offline]', el).forEach(btn => btn.onclick = async () => {
    const b = byId(btn.dataset.offline); btn.disabled = true;
    try {
      if (offline.has(b.id)) { await offline.remove(b.id); toast(t('off.removed')); }
      else {
        const blob = await fetchBookFile(b, p => { btn.textContent = Math.round(p * 100) + '%'; });
        await offline.save(b, blob); toast(t('off.savedToast', { mb: (blob.size / 1048576).toFixed(1) }));
        navigator.storage?.persist?.().catch(() => { });
      }
    } catch (x) { toast(x?.name === 'QuotaExceededError' ? t('off.full') : errText(x), { error: true }); }
    viewLibrary(el, q);
  });
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

// =====================================================================
//  LEGAL PAGES  (#/legal/terms | privacy | cookies | withdrawal | imprint)
// =====================================================================
let companyCache = null;
export async function companyInfo() {
  if (!companyCache) companyCache = (await api.getSetting?.('company').catch(() => null)) || {};
  return companyCache;
}
export function resetCompanyCache() { companyCache = null; }
// Kindle-style technical details: layout, text size, devices, page size, file size
function bookSpecs(b) {
  const m = b.file_check?.meta || {};
  const reflow = b.format === 'epub' && !m.epub?.fixed;
  const row = (k, v) => `<div><small>${esc(t(k))}</small><b>${esc(v)}</b></div>`;
  const dev = reflow ? 'book.dev.all' : m.ereader === 'good' ? 'book.dev.pdfGood' : 'book.dev.pdf';
  const cm = pt => (pt / 72 * 2.54).toFixed(1).replace('.', ',');
  return row('book.d.layout', t(reflow ? 'book.layout.reflow' : 'book.layout.fixed'))
    + row('book.d.textSize', t(reflow ? 'book.yes' : 'book.zoomOnly'))
    + row('book.d.devices', t(dev))
    + (!reflow && m.page ? row('book.d.pageSize', (m.trim ? m.trim + ' · ' : '') + `${cm(m.page.w)} × ${cm(m.page.h)} cm`) : '')
    + (m.size ? row('book.d.fileSize', m.size > 1048576 ? (m.size / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.round(m.size / 1024) + ' KB') : '');
}

export async function viewLegal(el, page) {
  const L = legalText(getLang());
  if (!LEGAL_PAGES.includes(page)) page = 'terms';
  const c = await companyInfo();
  const fill = s => esc(s).replace(/\{(company|address|vat|country|email)\}/g, (_, k) => c[k] ? esc(c[k]) : (k === 'email' && CONFIG.supportEmail ? esc(CONFIG.supportEmail) : `<mark class="todo">[${esc(L.todo)}]</mark>`));
  document.title = L.title[page] + ' · ' + CONFIG.siteName;
  el.innerHTML = `<div class="wrap page legal-wrap">
    <nav class="legal-nav">${LEGAL_PAGES.map(p => `<a href="#/legal/${p}" class="${p === page ? 'on' : ''}">${esc(L.title[p])}</a>`).join('')}</nav>
    <article class="panel legal">
      <h1>${esc(L.title[page])}</h1>
      <p class="muted">${esc(L.updated.replace('{date}', fmtDate(LEGAL_VERSION)))}</p>
      ${page === 'imprint'
        ? `<dl class="imprint">${L.imprint.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${fill(v)}</dd>`).join('')}</dl>`
        : L[page].map(([h, p]) => `<h2>${esc(h)}</h2><p>${fill(p)}</p>`).join('')}
    </article></div>`;
}

// EU: for digital content delivered immediately the buyer must agree and accept losing the 14-day withdrawal right
function waiverConfirm() {
  return new Promise(resolve => {
    let ok = false;
    const L = legalText(getLang());
    const close = modal(`<h2 style="margin:0">${esc(t('legal.waiverTitle'))}</h2>
      <label class="check consent-check"><input type="checkbox" id="w-ok"> <span>${esc(t('legal.waiverText'))}</span></label>
      <p class="muted" style="margin:0;font-size:13px">${t('legal.waiverTerms', { terms: `<a href="#/legal/terms" target="_blank">${esc(L.title.terms)}</a>`, withdrawal: `<a href="#/legal/withdrawal" target="_blank">${esc(L.title.withdrawal)}</a>` })}</p>
      <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap"><button class="btn btn-ghost" data-close>${esc(t('admin.cancel'))}</button><button class="btn btn-buy" id="w-go" disabled>${esc(t('legal.waiverGo'))}</button></div>`, {
      onMount: (m, closeFn) => {
        const cb = m.querySelector('#w-ok'), go2 = m.querySelector('#w-go');
        cb.onchange = () => { go2.disabled = !cb.checked; };
        go2.onclick = () => { ok = true; closeFn(); resolve(true); };
        new MutationObserver((_, obs) => { if (!m.isConnected) { obs.disconnect(); if (!ok) resolve(false); } }).observe(document.body, { childList: true });
      },
    });
  });
}
