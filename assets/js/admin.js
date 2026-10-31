// =====================================================================
//  ADMIN PANEL: overview, books, add/edit, orders, customers, reviews
// =====================================================================
import { CONFIG } from './config.js?v=20261031120940';
import { t, money, fmtDate, getLang, langName, LANGS } from './i18n.js?v=20261031120940';
import { esc, $, $$, loadScript, norm, debounce, safeHTML, plainText, compressImage } from './util.js?v=20261031120940';
import { resetCompanyCache } from './views.js?v=20261031120940';
import { NTF_TEMPLATES, fillTemplate } from './ntf-templates.js?v=20261031120940';
import { REVIEW_FIELDS, readReviewFile, guessMapping, buildReviews } from './review-import.js?v=20261031120940';
import { OFFER_KINDS, describeOffer } from './offers.js?v=20261031120940';
import { optimizeBook } from './optimize.js?v=20261031120940';
import { api } from './api.js?v=20261031120940';
import { icon, go, currentPath, toast, coverHTML, confirmBox, errText, CATS, modal, stars, aplusHTML, refreshBell, promoHTML, PROMO_THEMES, PROMO_FONTS, safeLink, ntfCardHTML } from './ui.js?v=20261031120940';

const TABS = [
  ['overview', '/admin', 'chart', 'admin.tab.overview'],
  ['stats', '/admin/stats', 'eye', 'st.title'],
  ['books', '/admin/books', 'library', 'admin.books'],
  ['prices', '/admin/prices', 'tag', 'bp.tab'],
  ['new', '/admin/new', 'plus', 'admin.add'],
  ['import', '/admin/import', 'upload', 'imp.tab'],
  ['orders', '/admin/orders', 'box', 'admin.tab.orders'],
  ['customers', '/admin/customers', 'user', 'admin.tab.customers'],
  ['visitors', '/admin/visitors', 'eye', 'admin.tab.visitors'],
  ['reviews', '/admin/reviews', 'eye', 'admin.tab.reviews'],
  ['offers', '/admin/offers', 'tag', 'of.title'],
  ['promos', '/admin/promos', 'bolt', 'pr.title'],
  ['notifications', '/admin/notifications', 'bell', 'ntf.title'],
  ['settings', '/admin/settings', 'gear', 'set.title'],
];
const full = !!api.adminOverview; // the extended panel needs these data methods


// a book picker you can type in: the matching books appear as you write (used instead of long lists)
function bookComboHTML(id, items, selId, ph) {
  const cur = items.find(b => b.id === selId);
  return `<div class="bp" data-bp="${esc(id)}"><input class="input" id="${esc(id)}-q" autocomplete="off" placeholder="${esc(ph)}" value="${esc(cur ? cur.label : '')}"><input type="hidden" id="${esc(id)}" value="${esc(cur ? cur.id : '')}"><div class="bp-list" hidden></div></div>`;
}
function bindBookCombo(root, id, items) {
  const box = root.querySelector(`[data-bp="${id}"]`); if (!box) return;
  const q = box.querySelector('input.input'), hid = box.querySelector('input[type=hidden]'), list = box.querySelector('.bp-list');
  const norm = x => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let sel = -1, shown = [];
  const draw = () => {
    const w = norm(q.value).split(/\s+/).filter(Boolean);
    shown = (w.length ? items.filter(b => w.every(x => norm(b.label).includes(x))) : items).slice(0, 12); sel = shown.length ? 0 : -1;
    list.innerHTML = shown.length ? shown.map((b, k) => `<button type="button" class="bp-opt ${k === sel ? 'on' : ''}" data-i="${k}">${esc(b.label)}</button>`).join('') : `<div class="bp-none">${esc(t('ri.noBook'))}</div>`;
    list.hidden = false;
    list.querySelectorAll('.bp-opt').forEach(o => o.onmousedown = e => { e.preventDefault(); pick(shown[+o.dataset.i]); });
  };
  const fire = () => { hid.dispatchEvent(new Event('input', { bubbles: true })); hid.dispatchEvent(new Event('change', { bubbles: true })); };
  const pick = b => { if (!b) return; hid.value = b.id; q.value = b.label; q.classList.remove('invalid'); list.hidden = true; fire(); };
  q.oninput = e => { e.stopPropagation(); if (hid.value) { hid.value = ''; fire(); } draw(); };
  q.onchange = e => e.stopPropagation();
  q.onfocus = () => { q.select(); draw(); };
  q.onblur = () => setTimeout(() => { list.hidden = true; }, 120);
  q.onkeydown = e => {
    const opts = () => [...list.querySelectorAll('.bp-opt')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!shown.length) return; sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length; opts().forEach((o, k) => o.classList.toggle('on', k === sel)); opts()[sel]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(shown[sel]); }
    else if (e.key === 'Escape') list.hidden = true;
  };
}

export async function viewAdmin(el, parts) {
  const u = api.user();
  if (!u || !u.isAdmin) {
    el.innerHTML = `<div class="wrap page"><div class="panel empty">${icon('gear')}<p>${esc(t('admin.notAdmin'))}</p><a class="btn btn-buy" href="#/account">${esc(t('acc.signIn'))}</a></div></div>`;
    if (!u) sessionStorage.setItem('librava:after', '/admin');
    return;
  }
  let tab = parts[0] || 'overview';
  if (tab === 'sales') tab = 'overview';
  const active = tab === 'edit' ? 'new' : tab;
  el.innerHTML = `<div class="wrap page adm" style="max-width:1700px">
    <div class="adm-head"><h1>${esc(t('admin.title'))}</h1><span class="adm-head-btns"><a class="btn btn-ghost btn-sm" href="#/admin/import">${icon('upload')} ${esc(t('imp.tab'))}</a><a class="btn btn-buy btn-sm" href="#/admin/new">${icon('plus')} ${esc(t('admin.add'))}</a></span></div>
    ${api.isDemo ? `<div class="demo-note" style="margin-bottom:14px">${esc(t('admin.demoNote'))}</div>` : ''}
    <nav class="tabs adm-tabs" aria-label="${esc(t('admin.title'))}">
      ${TABS.map(([k, href, ic, label]) => `<a class="${k === active ? 'on' : ''}" href="#${href}" ${k === active ? 'aria-current="page"' : ''}>${icon(ic, 'ico')} ${esc(tab === 'edit' && k === 'new' ? t('admin.edit') : t(label))}</a>`).join('')}
    </nav>
    <div id="adm-body"></div>
  </div>`;
  // the tab bar scrolls sideways on phones: keep the open section in view (it used to jump back to the first tab)
  const nav = $('.adm-tabs', el), on = nav?.querySelector('a.on');
  const centre = () => { if (nav && on) nav.scrollLeft = Math.max(0, on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2); };
  centre(); requestAnimationFrame(centre); setTimeout(centre, 250);
  const body = $('#adm-body', el);
  liveAdmin(tab, parts, body);
  switch (tab) {
    case 'new': return bookForm(body, null);
    case 'edit': { const book = await api.getBook(parts[1]).catch(() => null); return bookForm(body, book || null, Math.min(4, Math.max(1, parseInt(parts[2]) || 1))); }  // the whole book, not the light list
    case 'books': return booksList(body);
    case 'prices': return pricesAdmin(body);
    case 'import': return importBooks(body);
    case 'orders': return orders(body, parts[1] || 'pending');
    case 'customers': return parts[1] ? customer(body, parts[1]) : customers(body);
    case 'visitors': return visitorsAdmin(body);
    case 'reviews': return reviews(body);
    case 'stats': return statsAdmin(body);
    case 'offers': return parts[1] ? offerForm(body, parts[1]) : offersAdmin(body);
    case 'promos': return parts[1] ? promoForm(body, parts[1]) : promosAdmin(body);
    case 'notifications': return notificationsAdmin(body);
    case 'settings': return settingsAdmin(body);
    default: return overview(body);
  }
}

// ---------------------------------------------------------------- live updates
// A sale, a payment or a new order refreshes the open tab by itself (no reload needed).
let stopLive = null, lastConfirm = 0;
function liveAdmin(tab, parts, body) {
  if (stopLive) { stopLive(); stopLive = null; }
  // payments still waiting are checked directly with Stripe (backup of the webhook), at most once a minute
  const confirm = () => { if (Date.now() - lastConfirm > 60000) { lastConfirm = Date.now(); api.confirmPayments?.(); } };
  confirm();
  const LIVE = { overview, books: booksList, stats: statsAdmin, orders: b => orders(b, parts[1] || 'pending'), customers: b => parts[1] ? customer(b, parts[1]) : customers(b) };
  if (!LIVE[tab] || !api.onSalesChange) return;
  const path = currentPath();
  const refresh = () => {
    if (!body.isConnected || currentPath() !== path || document.hidden) return;
    // don't redraw under the admin's hands: a dialog is open or a field has focus
    if (document.querySelector('.modal, dialog[open]') || body.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    const y = scrollY; Promise.resolve(LIVE[tab](body)).then(() => scrollTo(0, y)).catch(() => { });
  };
  const off = api.onSalesChange(refresh);
  const vis = () => { if (!document.hidden) { confirm(); refresh(); } };
  document.addEventListener('visibilitychange', vis);
  stopLive = () => { off(); document.removeEventListener('visibilitychange', vis); };
}

const cur = c => (c || CONFIG.currency).toUpperCase();
const methodLabel = m => t('admin.method.' + (m === 'card' ? 'card' : m === 'bank' ? 'bank' : 'demo'));

// ---------------------------------------------------------------- overview
async function overview(body) {
  const o = await api.adminOverview();
  const c = o.counts, R = o.revenue, C = cur(o.currency);
  const max = Math.max(1, ...o.daily.map(d => d.revenue_cents));
  const W = 720, H = 200, padL = 52, padB = 26, padT = 10, bw = (W - padL - 8) / o.daily.length;
  const ticks = [0, 0.5, 1].map(f => Math.round(max * f));
  const bars = o.daily.map((d, i) => {
    const h = d.revenue_cents ? Math.max(3, (d.revenue_cents / max) * (H - padB - padT)) : 0;
    const x = padL + i * bw + 2, y = H - padB - h, w = Math.max(2, bw - 4);
    const label = `${fmtDate(d.date)} — ${t('admin.chartSales', { n: d.count, amount: money(d.revenue_cents, C) })}`;
    return `<g class="bar" tabindex="0" aria-label="${esc(label)}" data-tip="${esc(label)}">
      <rect class="hit" x="${padL + i * bw}" y="${padT}" width="${bw}" height="${H - padB - padT}"></rect>
      ${h ? `<path class="mark" d="M${x},${H - padB} V${y + Math.min(4, h)} q0,-4 4,-4 h${w - 8} q4,0 4,4 V${H - padB} Z"></path>` : ''}</g>`;
  }).join('');
  const xl = o.daily.map((d, i) => i % 7 === 0 || i === o.daily.length - 1 ? `<text x="${padL + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(new Date(d.date).getUTCDate() + '.' + (new Date(d.date).getUTCMonth() + 1))}</text>` : '').join('');
  const yl = ticks.map(v => { const y = H - padB - (v / max) * (H - padB - padT); return `<line x1="${padL}" x2="${W - 4}" y1="${y}" y2="${y}"></line><text x="${padL - 8}" y="${y + 4}" text-anchor="end">${esc(money(v, C).replace(/[,.]00(?=\D|$)/, ''))}</text>`; }).join('');
  body.innerHTML = `
    ${c.pending ? `<a class="panel alert-pending" href="#/admin/orders/pending">${icon('info')} <b>${esc(t('admin.pendingAlert', { n: c.pending }))}</b><span>${esc(t('admin.seeOrders'))} ${icon('chevR', 'ico')}</span></a>` : ''}
    <div class="kpis">
      ${[['admin.revToday', R.today], ['admin.rev7', R.d7], ['admin.rev30', R.d30], ['admin.revAll', R.all]].map(([k, v]) => `<div class="panel kpi"><small>${esc(t(k))}</small><b>${esc(money(v, C))}</b></div>`).join('')}
    </div>
    <div class="kpis kpis-sm">
      <div class="panel kpi"><small>${esc(t('admin.soldPaid'))}</small><b>${c.sold}</b></div>
      <div class="panel kpi"><small>${esc(t('admin.freeTaken'))}</small><b>${c.free}</b></div>
      <div class="panel kpi"><small>${esc(t('admin.customersNew', { n: c.new_customers_30 }))}</small><b>${c.customers}</b></div>
      <div class="panel kpi"><small>${esc(t('admin.booksPublished'))}</small><b>${esc(t('admin.booksOf', { p: c.published, n: c.books }))}</b></div>
    </div>
    <section class="panel chart-panel"><h2 class="section-title" style="font-size:17px">${esc(t('admin.chartTitle'))}</h2>
      <div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" class="rev-chart" role="img" aria-label="${esc(t('admin.chartTitle'))}">
        <g class="grid">${yl}</g><g class="xl">${xl}</g>${bars}</svg><div class="chart-tip" hidden></div></div>
    </section>
    <div class="adm-two">
      <section class="panel"><h2 class="section-title" style="font-size:17px;margin-bottom:8px">${esc(t('admin.topBooks'))}</h2>
        ${o.top.length ? o.top.map(x => `<a class="adm-line" href="#/admin/edit/${encodeURIComponent(x.book.id)}"><span class="adm-book">${coverHTML(x.book, { badge: false })}<span><b>${esc(x.book.title)}</b><small class="muted">${x.n} ×</small></span></span><b class="num">${esc(money(x.sum, C))}</b></a>`).join('') : `<p class="muted">${esc(t('admin.noSales'))}</p>`}
      </section>
      <section class="panel"><h2 class="section-title" style="font-size:17px;margin-bottom:8px">${esc(t('admin.recent'))}</h2>
        ${o.recent.length ? o.recent.map(r => `<div class="adm-line"><span><b>${esc(r.title)}</b><small class="muted">${esc(r.email || '')} · ${esc(fmtDate(r.created_at))}</small></span><b class="num">${r.price_cents ? esc(money(r.price_cents, cur(r.currency))) : esc(t('book.free'))}</b></div>`).join('') : `<p class="muted">${esc(t('admin.noSales'))}</p>`}
      </section>
    </div>
    <section class="panel export-box"><div><b>${esc(t('admin.export'))}</b><p class="muted">${esc(t('admin.exportHelp'))}</p></div><button class="btn btn-dark" data-export>${icon('upload', 'ico')} CSV</button></section>`;
  // hover / keyboard tooltip on the chart
  const tip = $('.chart-tip', body), wrap = $('.chart-wrap', body);
  const show = g => { const r = g.getBoundingClientRect(), w = wrap.getBoundingClientRect(); tip.textContent = g.dataset.tip; tip.hidden = false;
    tip.style.left = Math.min(Math.max(0, r.left - w.left + r.width / 2 - tip.offsetWidth / 2), w.width - tip.offsetWidth) + 'px'; tip.style.top = '0px'; $$('.bar', body).forEach(b => b.classList.toggle('on', b === g)); };
  $$('.bar', body).forEach(g => { g.addEventListener('pointerenter', () => show(g)); g.addEventListener('focus', () => show(g)); });
  $('.rev-chart', body).addEventListener('pointerleave', () => { tip.hidden = true; $$('.bar', body).forEach(b => b.classList.remove('on')); });
  $('[data-export]', body).onclick = exportCSV;
}

async function exportCSV() {
  try {
    const r = await api.exportSales();
    const a = document.createElement('a');
    a.href = r.url || URL.createObjectURL(r.blob);
    a.download = 'librava-vanzari-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { toast(errText(e), { error: true }); }
}

// ---------------------------------------------------------------- prices (many books at once)
// One price for all books, for all EPUB or all PDF, or for one category; each book can still be changed on "My books".
// Each format of a book is its own row with its own price and crossed-out price, so the changes are per format.
async function pricesAdmin(body) {
  const books = (await api.adminBooks()).filter(b => !b.deleted_at);
  const eur = c => (c / 100).toFixed(2).replace('.', ',');
  const cents = v => { v = String(v || '').trim().replace(/\s|€/g, '').replace(',', '.'); if (!v) return null; const n = Math.round(parseFloat(v) * 100); return Number.isFinite(n) && n >= 0 ? n : NaN; };
  const cats = CATS.filter(c => books.some(b => b.category === c || (b.categories || []).includes(c)));
  const fmtCount = f => books.filter(b => b.format === f).length;
  body.innerHTML = `<form class="panel bp-form" id="bp-form" novalidate style="padding:0">
    <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('bp.which'))}</h3><p>${esc(t('bp.whichHelp'))}</p></div>
      <div class="kdp-fields">
        <div class="bp-row"><label class="field"><span>${esc(t('bp.scope'))}</span><select class="input" id="bp-cat"><option value="">${esc(t('bp.allBooks', { n: books.length }))}</option>${cats.map(c => `<option value="${c}">${esc(t('cat.' + c))}</option>`).join('')}</select></label>
          <label class="field"><span>${esc(t('bp.format'))}</span><select class="input" id="bp-fmt"><option value="">${esc(t('bp.fmtAll'))}</option><option value="epub">${esc(t('bp.fmtOnly', { fmt: 'EPUB' }))} (${fmtCount('epub')})</option><option value="pdf">${esc(t('bp.fmtOnly', { fmt: 'PDF' }))} (${fmtCount('pdf')})</option></select></label></div>
        <label class="check"><input type="checkbox" id="bp-pub"> ${esc(t('bp.onlyPublished'))}</label>
        <label class="check"><input type="checkbox" id="bp-free"> ${esc(t('bp.inclFree'))}</label>
      </div></div>
    <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('bp.newPrices'))}</h3><p>${esc(t('bp.newPricesHelp'))}</p></div>
      <div class="kdp-fields">
        <label class="field"><span>${esc(t('qp.price'))}</span><input class="input" id="bp-price" inputmode="decimal" autocomplete="off" placeholder="${esc(t('bp.keepPh'))}"><small>${esc(t('bp.priceHelp'))}</small></label>
        <div class="bp-row"><label class="field"><span>${esc(t('qp.list'))}</span><select class="input" id="bp-lmode">
            <option value="keep">${esc(t('bp.l.keep'))}</option><option value="pct">${esc(t('bp.l.pct'))}</option><option value="set">${esc(t('bp.l.set'))}</option><option value="none">${esc(t('bp.l.none'))}</option></select></label>
          <label class="field" id="bp-pct-box" hidden><span>${esc(t('bp.pct'))}</span><input class="input" id="bp-pct" type="number" min="1" max="95" value="67"></label>
          <label class="field" id="bp-list-box" hidden><span>${esc(t('qp.list'))}</span><input class="input" id="bp-list" inputmode="decimal" autocomplete="off" placeholder="21,37"></label></div>
        <small class="muted" id="bp-lhelp"></small>
      </div></div>
    <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('bp.preview'))}</h3><p>${esc(t('bp.previewHelp'))}</p></div>
      <div class="kdp-fields">
        <p class="bp-sum" id="bp-sum"></p>
        <div class="table-wrap"><table class="adm-table bp-table"><thead><tr><th>${esc(t('admin.colTitle'))}</th><th class="num">${esc(t('bp.before'))}</th><th class="num">${esc(t('bp.after'))}</th></tr></thead><tbody id="bp-rows"></tbody></table></div>
        <div class="bp-btns"><button type="submit" class="btn btn-buy" id="bp-apply" disabled>${esc(t('bp.apply'))}</button><a class="btn btn-ghost" href="#/admin/books">${icon('edit', 'ico')} ${esc(t('bp.oneBook'))}</a></div>
      </div></div>
  </form>`;
  const v = s => $(s, body).value;
  // what each chosen book would get: the new price and crossed-out price (null when nothing would change)
  const plan = () => {
    const cat = v('#bp-cat'), fmt = v('#bp-fmt'), pub = $('#bp-pub', body).checked, free = $('#bp-free', body).checked;
    const p = cents(v('#bp-price')), mode = v('#bp-lmode'), pct = parseInt(v('#bp-pct')), lst = cents(v('#bp-list'));
    let err = '';
    if (Number.isNaN(p) || (mode === 'set' && Number.isNaN(lst))) err = t('qp.bad');
    else if (p != null && p > 0 && p < 50) err = t('qp.min');
    else if (mode === 'pct' && !(pct >= 1 && pct <= 95)) err = t('bp.badPct');
    else if (mode === 'set' && lst == null) err = t('bp.needList');
    else if (p == null && mode === 'keep') err = t('bp.nothing');
    else if (mode === 'set' && p != null && lst <= p) err = t('qp.listLow');
    const chosen = books.filter(b => (!cat || b.category === cat || (b.categories || []).includes(cat)) && (!fmt || b.format === fmt) && (!pub || b.status === 'published') && (free || b.price_cents > 0));
    if (err) return { err, chosen, items: [] };
    const items = [];
    for (const b of chosen) {
      const price = p ?? b.price_cents;
      let list = mode === 'keep' ? b.list_price_cents : mode === 'none' ? null : mode === 'set' ? lst : null;
      if (mode === 'pct' && price > 0) {
        // the crossed-out price that shows exactly "-pct%" in the shop
        list = Math.round(price / (1 - pct / 100));
        for (let i = 0; i < 50 && Math.round((1 - price / list) * 100) !== pct; i++) list += Math.round((1 - price / list) * 100) < pct ? 1 : -1;
      }
      if (!price || (list != null && list <= price)) list = null;   // a crossed-out price lower than the price is not shown
      if (price === b.price_cents && (list || null) === (b.list_price_cents || null)) continue;
      items.push({ b, price, list });
    }
    return { err, chosen, items };
  };
  const cell = (pr, li) => `<b>${pr ? money(pr) : esc(t('book.free'))}</b>${li > pr ? ` <s>${money(li)}</s> <span class="badge">-${Math.round((1 - pr / li) * 100)}%</span>` : ''}`;
  const draw = () => {
    const mode = v('#bp-lmode');
    $('#bp-pct-box', body).hidden = mode !== 'pct'; $('#bp-list-box', body).hidden = mode !== 'set';
    $('#bp-lhelp', body).textContent = t('bp.lh.' + mode);
    const r = plan();
    $('#bp-sum', body).innerHTML = r.err ? `<span class="bp-err">${esc(r.err)}</span>` : esc(t('bp.willChange', { n: r.items.length, total: r.chosen.length }));
    $('#bp-rows', body).innerHTML = r.items.slice(0, 30).map(x => `<tr><td><span class="fp-chip fmt-${esc(x.b.format)}">${esc(t('book.formatShort.' + x.b.format))}</span> ${esc(x.b.title)}</td><td class="num">${cell(x.b.price_cents, x.b.list_price_cents)}</td><td class="num">${cell(x.price, x.list)}</td></tr>`).join('')
      + (r.items.length > 30 ? `<tr><td colspan="3" class="muted">${esc(t('bp.more', { n: r.items.length - 30 }))}</td></tr>` : '');
    $('#bp-apply', body).disabled = !!r.err || !r.items.length;
    return r;
  };
  $('#bp-form', body).addEventListener('input', draw);
  $('#bp-form', body).addEventListener('change', draw);
  $('#bp-form', body).addEventListener('submit', async e => {
    e.preventDefault();
    const r = draw(); if (r.err || !r.items.length) return;
    if (!await confirmBox(t('bp.confirm', { n: r.items.length }), { ok: t('bp.apply') })) return;
    const btn = $('#bp-apply', body); btn.disabled = true;
    try {
      const rows = r.items.map(x => ({ id: x.b.id, price: x.price, list: x.list }));
      let n = 0;
      if (api.setPrices) n = await api.setPrices(rows);
      else for (const x of rows) { await api.updateBook(x.id, { price_cents: x.price, list_price_cents: x.list }); n++; }
      for (const x of r.items) { x.b.price_cents = x.price; x.b.list_price_cents = x.list; }
      toast(t('bp.done', { n }), { ms: 6000 });
      draw();
    } catch (err) { toast(errText(err), { error: true }); draw(); }
  });
  draw();
}

// ---------------------------------------------------------------- books
async function booksList(body) {
  const books = await api.adminBooks();
  if (!books.length) {
    body.innerHTML = `<div class="panel empty">${icon('book')}<p>${esc(t('admin.empty'))}</p><a class="btn btn-buy" href="#/admin/new">${esc(t('admin.add'))}</a></div>`;
    return;
  }
  const langs = [...new Set(books.map(b => b.language))];
  // editions: the same book in EPUB and PDF, each with its own file and price (linked like Kindle / paperback on Amazon)
  const byWork = new Map(); for (const x of books) if (x.work_id) { if (!byWork.has(x.work_id)) byWork.set(x.work_id, []); byWork.get(x.work_id).push(x); }
  const sibs = b => b.work_id ? byWork.get(b.work_id) || [b] : [b];
  const edLinks = b => {
    const have = new Set(sibs(b).map(x => x.format));
    const tag = sibs(b).length > 1 ? `<span class="ed-tag" title="${esc(t('ed.linked'))}">${icon('book', 'ico')} ${esc(sibs(b).map(x => t('book.formatShort.' + x.format)).join(' + '))}</span>` : '';
    return tag + (api.newEdition ? ['epub', 'pdf'].filter(f => !have.has(f)).map(f => `<button type="button" class="ed-add" data-edition="${esc(b.id)}" data-fmt="${f}">+ ${esc(t('ed.add', { fmt: t('book.formatShort.' + f) }))}</button>`).join('') : '');
  };
  // the price can be changed right here, like on KDP's bookshelf: tap it, type the new price (and the crossed-out one), Save
  const priceCell = b => `<button type="button" class="qp-show" data-qp="${esc(b.id)}" title="${esc(t('qp.edit'))}">
      <b>${b.price_cents ? money(b.price_cents) : esc(t('book.free'))}</b>${b.list_price_cents > b.price_cents ? `<s>${money(b.list_price_cents)}</s>` : ''}${icon('edit', 'ico')}</button>`;
  const eur = c => c ? (c / 100).toFixed(2).replace('.', ',') : '';
  const priceForm = b => `<form class="qp-form" data-qpf="${esc(b.id)}">
      <label><span>${esc(t('qp.price'))}</span><input class="input" name="p" inputmode="decimal" value="${eur(b.price_cents)}" required></label>
      <label><span>${esc(t('qp.list'))}</span><input class="input" name="l" inputmode="decimal" value="${eur(b.list_price_cents)}" placeholder="—"></label>
      <div class="qp-btns"><button type="submit" class="btn btn-buy btn-sm">${esc(t('qp.save'))}</button><button type="button" class="btn btn-ghost btn-sm" data-qpx>${esc(t('qp.cancel'))}</button></div></form>`;
  const rowHTML = (b, pos = '') => `<tr class="${pos}">
        <td><div class="adm-book">${coverHTML(b, { badge: false })}<div style="min-width:0"><b><span class="fp-chip fmt-${esc(b.format)}">${esc(t('book.formatShort.' + b.format))}</span> ${esc(b.title)}</b><div class="muted" style="font-size:13px">${esc(b.author)} · ${esc(t('cat.' + b.category))} · ${esc(String(b.file_path || b.file_name ? b.format || '' : '—').toUpperCase())} · ${esc(String(b.language || '').toUpperCase())}</div>
          <div class="shelf-links">${b.status !== 'published' ? `<a class="continue" href="#/admin/edit/${encodeURIComponent(b.id)}">${esc(t('kdp.continueSetup'))} →</a>` : ''}${[[1, 'kdp.edit1'], [2, 'kdp.edit2'], ...(api.uploadAplusImage ? [[3, 'kdp.editAplus']] : []), [4, 'kdp.edit3']].map(([n, k]) => `<a href="#/admin/edit/${encodeURIComponent(b.id)}/${n}">${esc(t(k))}</a>`).join('')}${edLinks(b)}</div></div></div></td>
        <td class="num">${priceCell(b)}</td>
        <td class="num">${b.sales_count || 0}</td>
        <td class="num">${money(b.revenue_cents || 0)}</td>
        <td style="white-space:nowrap">${b.rating_count ? `${stars(b.rating_avg)} <span class="muted">${b.rating_count}</span>` : '<span class="muted">—</span>'}</td>
        <td><button class="status ${b.status === 'published' ? 'live' : 'draft'} status-btn" data-toggle="${esc(b.id)}" data-next="${b.status === 'published' ? 'draft' : 'published'}" title="${esc(b.status === 'published' ? t('admin.unpublish') : t('admin.publish'))}">${esc(b.status === 'published' ? t('admin.live') : t('admin.draft'))}</button></td>
        <td class="row-actions">
          <a class="btn btn-ghost btn-sm" href="#/admin/edit/${encodeURIComponent(b.id)}" title="${esc(t('admin.edit'))}">${icon('edit', 'ico')}<span class="sr">${esc(t('admin.edit'))}</span></a>
          <a class="btn btn-ghost btn-sm" href="#/book/${encodeURIComponent(b.id)}" title="${esc(t('admin.viewStore'))}">${icon('eye', 'ico')}<span class="sr">${esc(t('admin.viewStore'))}</span></a>
          <button class="btn btn-ghost btn-sm" data-del="${esc(b.id)}" title="${esc(t('admin.delete'))}">${icon('trash', 'ico')}<span class="sr">${esc(t('admin.delete'))}</span></button>
        </td></tr>`;
  body.innerHTML = `<div class="img-opt"><span>${icon('tag')} ${esc(t('bp.hint'))}</span><a class="btn btn-ghost btn-sm" href="#/admin/prices">${esc(t('bp.tab'))}</a></div>${api.replaceCover ? `<div class="img-opt"><span>${icon('image')} ${esc(t('img.optHelp'))}</span><button type="button" class="btn btn-ghost btn-sm" id="b-optimize">${esc(t('img.optBtn'))}</button></div>` : ''}<div class="panel">
    <div class="adm-filters">
      <input class="input" id="adm-q" type="search" placeholder="${esc(t('admin.search'))}" aria-label="${esc(t('admin.search'))}">
      <select class="input" id="adm-st" aria-label="${esc(t('admin.colStatus'))}"><option value="">${esc(t('admin.filter.all'))}</option><option value="published">${esc(t('admin.filter.published'))}</option><option value="draft">${esc(t('admin.filter.draft'))}</option></select>
      <select class="input" id="adm-lang" aria-label="${esc(t('search.bookLang'))}"><option value="">${esc(t('lang.all'))}</option>${langs.map(l => `<option value="${l}">${esc(langName(l))}</option>`).join('')}</select>
      <select class="input" id="adm-cat" aria-label="${esc(t('search.category'))}"><option value="">${esc(t('search.any'))}</option>${CATS.map(c => `<option value="${c}">${esc(t('cat.' + c))}</option>`).join('')}</select>
    </div>
    <p class="muted adm-count" id="adm-count"></p>
    <div class="table-wrap"><table class="adm-table">
      <thead><tr><th>${esc(t('admin.colTitle'))}</th><th class="num">${esc(t('admin.colPrice'))}</th><th class="num">${esc(t('admin.colSales'))}</th><th class="num">${esc(t('admin.colRevenue'))}</th><th>${esc(t('admin.colRating'))}</th><th>${esc(t('admin.colStatus'))}</th><th></th></tr></thead>
      <tbody id="adm-rows"></tbody>
    </table></div>
    <div style="text-align:center;margin-top:14px"><button type="button" class="btn btn-ghost" id="adm-more" hidden></button></div></div>`;
  $('#b-optimize', body)?.addEventListener('click', async e => {
    const btn = e.currentTarget; btn.disabled = true;
    const r = await optimizeExisting(btn);
    toast(r.done ? t('img.optDone', { n: r.done, kb: Math.round(r.saved / 1024) }) : t('img.optNothing'), { ms: 6000 });
    booksList(body);
  });
  // with thousands of books the table shows 100 rows at a time; the filters work on the whole list
  const STEP = 100; let shown = STEP, list = books;
  const qOf = new Map(books.map(b => [b.id, norm(b.title + ' ' + (b.subtitle || '') + ' ' + b.author + ' ' + (b.isbn || '') + ' ' + (b.librava_id || ''))]));
  const draw = () => {
    // the formats of one book stay together, one under the other (PDF, then EPUB)
    const order = [], seen = new Set();
    for (const b of list) {
      if (seen.has(b.id)) continue;
      const group = b.work_id ? list.filter(x => x.work_id === b.work_id).sort((x, y) => (x.format === 'pdf' ? 0 : 1) - (y.format === 'pdf' ? 0 : 1)) : [b];
      group.forEach((x, i) => { seen.add(x.id); order.push([x, group.length < 2 ? '' : i === 0 ? 'ed-first' : i === group.length - 1 ? 'ed-sub ed-last' : 'ed-sub']); });
    }
    $('#adm-rows', body).innerHTML = order.slice(0, shown).map(([x, pos]) => rowHTML(x, pos)).join('');
    $('#adm-count', body).textContent = t('admin.countShown', { n: Math.min(shown, list.length), total: list.length });
    const more = $('#adm-more', body); more.hidden = list.length <= shown; more.textContent = t('admin.showMore', { n: Math.min(STEP, list.length - shown) });
  };
  const apply = () => {
    const q = norm($('#adm-q', body).value.trim()), st = $('#adm-st', body).value, l = $('#adm-lang', body).value, c = $('#adm-cat', body).value;
    list = books.filter(b => !((q && !qOf.get(b.id).includes(q)) || (st && b.status !== st) || (l && b.language !== l) || (c && b.category !== c && !(b.categories || []).includes(c))));
    shown = STEP; draw();
  };
  ['#adm-q', '#adm-st', '#adm-lang', '#adm-cat'].forEach(s => $(s, body).addEventListener('input', apply));
  $('#adm-more', body).onclick = () => { shown += STEP; draw(); };
  draw();
  // one listener for all rows (rows are drawn again when filtering)
  $('#adm-rows', body).addEventListener('submit', async e => {
    const f = e.target.closest('[data-qpf]'); if (!f) return;
    e.preventDefault();
    const b = books.find(x => x.id === f.dataset.qpf);
    const cents = v => { v = String(v || '').trim().replace(/\s|€/g, '').replace(',', '.'); if (!v) return null; const n = Math.round(parseFloat(v) * 100); return Number.isFinite(n) && n >= 0 ? n : NaN; };
    const p = cents(f.p.value), l = cents(f.l.value);
    if (p == null || Number.isNaN(p) || Number.isNaN(l)) { toast(t('qp.bad'), { error: true }); return; }
    if (p > 0 && p < 50) { toast(t('qp.min'), { error: true }); return; }
    if (l != null && l <= p) { toast(t('qp.listLow'), { error: true }); return; }
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try {
      await api.updateBook(b.id, { price_cents: p, list_price_cents: l });
      b.price_cents = p; b.list_price_cents = l;
      f.parentElement.innerHTML = priceCell(b);
      toast(t('qp.saved', { title: b.title, fmt: t('book.formatShort.' + b.format) }));
    } catch (err) { btn.disabled = false; toast(errText(err), { error: true }); }
  });
  $('#adm-rows', body).addEventListener('keydown', e => { if (e.key === 'Escape') e.target.closest('[data-qpf]')?.querySelector('[data-qpx]')?.click(); });
  $('#adm-rows', body).addEventListener('click', async e => {
    const tg = e.target.closest('[data-toggle]'), ed = e.target.closest('[data-edition]'), del = e.target.closest('[data-del]');
    const qp = e.target.closest('[data-qp]'), qx = e.target.closest('[data-qpx]');
    if (qp) {
      const b = books.find(x => x.id === qp.dataset.qp); const td = qp.parentElement;
      td.innerHTML = priceForm(b); td.querySelector('input').select(); return;
    }
    if (qx) { const f = qx.closest('form'); const b = books.find(x => x.id === f.dataset.qpf); f.parentElement.innerHTML = priceCell(b); return; }
    if (tg) {
      if (!api.setBookStatus) return;
      try { await api.setBookStatus(tg.dataset.toggle, tg.dataset.next); toast(t(tg.dataset.next === 'published' ? 'admin.nowPublished' : 'admin.nowHidden')); booksList(body); }
      catch (err) { toast(errText(err), { error: true }); }
    } else if (ed) {
      e.preventDefault(); e.stopPropagation();
      const b = books.find(x => x.id === ed.dataset.edition), fmt = t('book.formatShort.' + ed.dataset.fmt);
      if (!await confirmBox(t('ed.confirm', { title: b.title, fmt }), { ok: t('ed.add', { fmt }) })) return;
      try {
        const full = await api.getBook(b.id);   // copy the whole book (description, A+…), not the light list row
        if (!full) throw new Error(t('book.notFound'));
        const id = await api.newEdition(full, ed.dataset.fmt); toast(t('ed.created', { fmt })); go('/admin/edit/' + encodeURIComponent(id) + '/2');
      } catch (err) { toast(errText(err), { error: true }); }
    } else if (del) {
      const b = books.find(x => x.id === del.dataset.del);
      if (!await confirmBox(t('admin.confirmDelete', { title: b.title }), { ok: t('admin.delete'), danger: true })) return;
      try { await api.deleteBook(b.id); toast(t('admin.deleted')); booksList(body); } catch (err) { toast(errText(err), { error: true }); }
    }
  });
}

// ---------------------------------------------------------------- orders
async function orders(body, status) {
  const list = await api.adminOrders(status === 'all' ? 'all' : status);
  const sts = ['pending', 'paid', 'cancelled', 'all'];
  body.innerHTML = `<div class="seg-tabs">${sts.map(s => `<a class="${s === status ? 'on' : ''}" href="#/admin/orders/${s}">${esc(t('admin.ord.' + s))}</a>`).join('')}</div>
    <div class="panel">${list.length ? `<div class="table-wrap"><table class="adm-table">
      <thead><tr><th>${esc(t('admin.colOrder'))}</th><th>${esc(t('admin.colCustomer'))}</th><th>${esc(t('admin.colBooks'))}</th><th>${esc(t('admin.colMethod'))}</th><th class="num">${esc(t('admin.colTotal'))}</th><th></th></tr></thead>
      <tbody>${list.map(o => `<tr>
        <td style="white-space:nowrap"><b>${esc(o.reference)}</b><div class="muted" style="font-size:12px">${esc(fmtDate(o.created_at))}</div></td>
        <td>${esc(o.email || '')}</td>
        <td style="min-width:180px;font-size:13px">${o.items.map(i => esc(i.title)).join('<br>')}</td>
        <td style="white-space:nowrap">${esc(methodLabel(o.method))}<div><span class="status ${o.status === 'paid' ? 'live' : 'draft'}">${esc(t('admin.ord.' + o.status))}</span>${o.livemode === false ? ' <span class="status draft" title="Stripe test">TEST</span>' : ''}</div></td>
        <td class="num"><b>${esc(money(o.amount_cents, cur(o.currency)))}</b></td>
        <td class="row-actions">${o.status === 'pending' ? `<button class="btn btn-cart btn-sm" data-paid="${o.id}" data-ref="${esc(o.reference)}" data-amount="${esc(money(o.amount_cents, cur(o.currency)))}">${esc(t('admin.confirmPaid'))}</button>
          <button class="btn btn-ghost btn-sm" data-cancel="${o.id}">${esc(t('admin.cancelOrder'))}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : `<p class="muted" style="margin:0">${esc(status === 'pending' ? t('admin.noPending') : t('admin.noOrders'))}</p>`}</div>`;
  $$('[data-paid]', body).forEach(b => b.onclick = async () => {
    if (!await confirmBox(t('admin.confirmPaidQ', { amount: b.dataset.amount, ref: b.dataset.ref }), { ok: t('admin.confirmPaid') })) return;
    try { await api.confirmOrder(b.dataset.paid); toast(t('admin.orderConfirmed')); orders(body, status); } catch (e) { toast(errText(e), { error: true }); }
  });
  $$('[data-cancel]', body).forEach(b => b.onclick = async () => {
    if (!await confirmBox(t('admin.cancelOrder') + '?', { ok: t('admin.cancelOrder'), danger: true })) return;
    try { await api.cancelOrder(b.dataset.cancel); toast(t('admin.orderCancelled')); orders(body, status); } catch (e) { toast(errText(e), { error: true }); }
  });
}


// ---- customer activity: visits and time on the site (logged-in customers, from user_sessions) ----
function durText(sec) {
  sec = Math.round(sec || 0);
  if (sec < 60) return t('admin.act.sec', { n: sec });
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? t('admin.act.hm', { h, m }) : t('admin.act.min', { n: m });
}
function agoText(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 120) return t('admin.act.now');
  if (s < 3600) return t('admin.act.minAgo', { n: Math.round(s / 60) });
  if (s < 86400) return t('admin.act.hAgo', { n: Math.round(s / 3600) });
  return fmtDate(iso);
}
// date range shared by the customers list and the customer page (kept for the browser tab)
const CU_KEY = 'librava:cuRange';
const ymd = d => { const z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); };
const daysAgo = n => ymd(new Date(Date.now() - n * 864e5));
function cuRange() {
  let r = null; try { r = JSON.parse(sessionStorage.getItem(CU_KEY)); } catch { }
  return r && r.from && r.to ? r : { from: daysAgo(29), to: ymd(new Date()), p: '30' };
}
function cuISO(r) { const f = new Date(r.from + 'T00:00:00'), e = new Date(r.to + 'T00:00:00'); e.setDate(e.getDate() + 1); return { from: f.toISOString(), to: e.toISOString() }; }
function rangeBarHTML(r) {
  const P = [['today', t('admin.act2.p.today')], ['7', t('admin.act2.p.7')], ['30', t('admin.act2.p.30')], ['90', t('admin.act2.p.90')], ['all', t('admin.act2.p.all')]];
  return `<div class="cu-range">
    <div class="cu-presets">${P.map(([k, l]) => `<button type="button" class="chip${r.p === k ? ' on' : ''}" data-preset="${k}">${esc(l)}</button>`).join('')}</div>
    <label class="cu-date"><span>${esc(t('admin.act2.rFrom'))}</span><input class="input" type="date" id="cu-from" value="${esc(r.from)}" max="${esc(ymd(new Date()))}"></label>
    <label class="cu-date"><span>${esc(t('admin.act2.rTo'))}</span><input class="input" type="date" id="cu-to" value="${esc(r.to)}" max="${esc(ymd(new Date()))}"></label>
    <button type="button" class="btn btn-buy btn-sm" id="cu-apply">${esc(t('admin.act2.rApply'))}</button></div>`;
}
function bindRange(root, onChange) {
  const save = r => { try { sessionStorage.setItem(CU_KEY, JSON.stringify(r)); } catch { } onChange(); };
  $$('[data-preset]', root).forEach(b => b.onclick = () => {
    const k = b.dataset.preset, today = ymd(new Date());
    save(k === 'today' ? { from: today, to: today, p: k } : k === 'all' ? { from: '2020-01-01', to: today, p: k } : { from: daysAgo(+k - 1), to: today, p: k });
  });
  $('#cu-apply', root).onclick = () => {
    let from = $('#cu-from', root).value, to = $('#cu-to', root).value;
    if (!from || !to) return;
    if (from > to) [from, to] = [to, from];
    save({ from, to, p: 'custom' });
  };
}
function pageLabel(path) {
  const base = (path || '').split('#')[0], h = ((path || '').split('#')[1] || '').split('?')[0];
  if (/^\/cart/.test(h)) return t('admin.act2.pg.cart');
  if (/^\/(library|my)/.test(h)) return t('admin.act2.pg.library');
  if (/^\/(account|profile|settings)/.test(h)) return t('admin.act2.pg.account');
  if (/^\/search/.test(h)) return t('admin.act2.pg.search');
  if (/^\/(category|cat)\//.test(h)) return t('admin.act2.pg.category', { c: decodeURIComponent(h.split('/')[2] || '') });
  if (/\/guide\//.test(base) || /^\/guide/.test(h)) return t('admin.act2.pg.guide');
  if ((!h || h === '/') && /^\/([a-z]{2}\/)?$/.test(base)) return t('admin.act2.pg.home');
  return t('admin.act2.pg.other', { p: (h || base || '/').slice(0, 60) });
}
const bookLink = e => e.book_id ? `<a href="#/book/${encodeURIComponent(e.book_id)}">${esc(e.book_title || t('admin.act2.noBook'))}</a>` : esc(e.book_title || t('admin.act2.noBook'));
const evLine = e => {
  switch (e.type) {
    case 'pageview': return /\/book\//.test(e.path || '') ? '' : esc(t('admin.act2.ev.pageview', { p: pageLabel(e.path) }));
    case 'book_view': return t('admin.act2.ev.book_view', { b: '\u0001' }).split('\u0001').map(esc).join(bookLink(e));
    case 'add_cart': return t('admin.act2.ev.add_cart', { b: '\u0001' }).split('\u0001').map(esc).join(bookLink(e));
    case 'search': return esc(t('admin.act2.ev.search', { q: e.q || '', n: e.results ?? 0 }));
    default: return esc(t('admin.act2.ev.' + e.type));
  }
};
function activityHTML(E, r) {
  // group the steps by visit (sid); events arrive newest first
  const by = new Map();
  [...E].reverse().forEach(e => { if (!by.has(e.sid)) by.set(e.sid, []); by.get(e.sid).push(e); });
  const visits = [...by.values()].map(list => {
    let sec = 0;
    list.forEach((e, i) => { const nx = list[i + 1]; sec += Math.min(nx ? (new Date(nx.created_at) - new Date(e.created_at)) / 1000 : 20, 300); });
    return { list, sec: Math.round(sec), start: list[0].created_at };
  }).sort((a, b) => String(b.start).localeCompare(String(a.start)));
  const sum = f => E.filter(f).length, secAll = visits.reduce((a, v) => a + v.sec, 0);
  const opened = new Set(E.filter(e => e.type === 'book_view' && e.book_id).map(e => e.book_id)).size;
  const kpi = (l, v, sub) => `<div class="panel kpi" style="margin:0"><small>${esc(l)}</small><b>${esc(String(v))}</b>${sub ? `<span class="muted" style="font-size:13px;display:block">${esc(sub)}</span>` : ''}</div>`;
  const dev = d => t('admin.act.dev.' + (d || 'desktop'));
  const icons = { search: 'search', book_view: 'eye', add_cart: 'cart', checkout: 'card', purchase: 'check' };
  const visitHTML = (v, i) => {
    const f = v.list[0], rows = [];
    let lastTxt = '';
    v.list.forEach(e => { const txt = evLine(e); if (!txt || txt === lastTxt) return; lastTxt = txt;
      rows.push(`<li class="tl-ev tl-${esc(e.type)}"><time>${esc(new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))}</time><span>${txt}</span></li>`); });
    const meta = [dev(f.device) + (f.os && f.os !== 'other' ? ' · ' + f.os : ''), f.country, f.source && f.source !== 'direct' ? t('admin.act2.src', { s: f.source }) : ''].filter(Boolean).join(' · ');
    return `<details class="tl-visit"${i < 3 ? ' open' : ''}><summary><b>${esc(fmtDate(v.start))} ${esc(new Date(v.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</b>
      <span class="muted"> · ${esc(durText(v.sec))} · ${esc(meta)}</span></summary><ul class="tl-list">${rows.join('')}</ul></details>`;
  };
  return `<section class="panel" style="margin-top:14px"><h2 class="section-title" style="font-size:17px;margin-bottom:8px">${esc(t('admin.act.title'))}</h2>
    ${rangeBarHTML(r)}
    ${E.length ? `<div class="cu-kpis">${kpi(t('admin.act2.kVisits'), visits.length, t('admin.act2.tlLast') + ': ' + agoText(E[0].created_at))}${kpi(t('admin.act2.kTime'), durText(secAll))}${kpi(t('admin.act2.kAvg'), durText(visits.length ? secAll / visits.length : 0))}
      ${kpi(t('admin.act2.kPages'), sum(e => e.type === 'pageview'))}${kpi(t('admin.act2.kSearch'), sum(e => e.type === 'search'))}${kpi(t('admin.act2.kBooks'), opened)}${kpi(t('admin.act2.kCart'), sum(e => e.type === 'add_cart'))}</div>
    <h3 style="font-size:15px;margin:16px 0 6px">${esc(t('admin.act2.tlTitle'))}</h3>${visits.map(visitHTML).join('')}`
    : `<p class="muted" style="margin:12px 0 0">${esc(t('admin.act2.tlNone'))}</p>`}</section>`;
}


// ---------------------------------------------------------------- visitors (everyone on the site, logged in or not; "live" = last 5 minutes)
async function visitorsAdmin(body) {
  const r = cuRange();
  body.innerHTML = `<div class="panel">${rangeBarHTML(r)}<div id="vi-sum"></div><div id="vi-list"><div class="spinner"></div></div></div>`;
  bindRange(body, () => visitorsAdmin(body));
  const who = v => v.user_id ? `<b>${esc(v.name || v.email || '')}</b><div class="muted" style="font-size:13px">${esc(v.email || '')}</div>` : `<span class="muted">${esc(t('admin.vis.guest'))}</span>`;
  const draw = async () => {
    if (!body.isConnected || !$('#vi-list', body)) return;
    let L = []; try { L = await api.adminVisits(cuISO(cuRange())); } catch (x) { $('#vi-list', body).innerHTML = `<p class="muted">${esc(errText(x))}</p>`; return; }
    const live = L.filter(v => Date.now() - new Date(v.ended) < 5 * 60e3);
    const sum = (f) => L.filter(f).length;
    $('#vi-sum', body).innerHTML = `<div class="cu-kpis" style="margin-bottom:14px">
      <div class="panel kpi" style="margin:0"><small>${esc(t('admin.vis.live'))}</small><b style="color:#2f8f4e">${live.length}</b></div>
      <div class="panel kpi" style="margin:0"><small>${esc(t('admin.act2.kVisits'))}</small><b>${L.length}</b></div>
      <div class="panel kpi" style="margin:0"><small>${esc(t('admin.act2.kSearch'))}</small><b>${L.reduce((a, v) => a + v.searches, 0)}</b></div>
      <div class="panel kpi" style="margin:0"><small>${esc(t('admin.act2.kCart'))}</small><b>${sum(v => v.carts > 0)}</b></div>
      <div class="panel kpi" style="margin:0"><small>${esc(t('admin.vis.checkout'))}</small><b>${sum(v => v.checkouts > 0)}</b></div>
      <div class="panel kpi" style="margin:0"><small>${esc(t('admin.vis.accounts'))}</small><b>${sum(v => v.user_id)}</b></div></div>`;
    const open = new Set($$('details[open][data-sid]', body).map(d => d.dataset.sid));
    $('#vi-list', body).innerHTML = L.length ? L.map(v => {
      const isLive = Date.now() - new Date(v.ended) < 5 * 60e3;
      const meta = [t('admin.act.dev.' + (v.device || 'desktop')) + (v.os && v.os !== 'other' ? ' · ' + v.os : ''), v.country, v.source && v.source !== 'direct' ? t('admin.act2.src', { s: v.source }) : t('admin.vis.direct')].filter(Boolean).join(' · ');
      const acts = [v.searches ? t('admin.vis.nSearch', { n: v.searches }) : '', v.books ? t('admin.vis.nBooks', { n: v.books }) : '', v.carts ? '🛒 ' + t('admin.vis.inCart') : '', v.checkouts ? t('admin.vis.checkout') : '', v.purchases ? '✔ ' + t('admin.vis.bought') : ''].filter(Boolean).join(' · ');
      return `<details class="tl-visit" data-sid="${esc(v.sid)}"${open.has(v.sid) ? ' open' : ''}><summary>
        <b>${isLive ? '<span class="vi-live"></span>' : ''}${esc(fmtDate(v.started))} ${esc(new Date(v.started).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</b>
        <span class="muted"> · ${esc(durText(v.seconds))} · ${esc(meta)}</span>${acts ? `<div style="font-size:14px;margin-top:2px">${esc(acts)}</div>` : ''}
        <div style="margin-top:2px">${who(v)}</div></summary><ul class="tl-list" data-ev="${esc(v.sid)}"></ul></details>`;
    }).join('') : `<p class="muted" style="margin:0">${esc(t('admin.vis.none'))}</p>`;
    $$('details[data-sid]', body).forEach(d => { const load = async () => { const ul = $('[data-ev]', d); if (ul.dataset.done) return; ul.dataset.done = 1;
      try { const E = await api.adminVisitEvents(d.dataset.sid); let last = '';
        ul.innerHTML = E.map(e => { const txt = evLine(e); if (!txt || txt === last) return ''; last = txt;
          return `<li class="tl-ev tl-${esc(e.type)}"><time>${esc(new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))}</time><span>${txt}</span></li>`; }).join('') || `<li class="muted">—</li>`;
      } catch (x) { ul.innerHTML = `<li class="muted">${esc(errText(x))}</li>`; } };
      d.addEventListener('toggle', () => { if (d.open) load(); }); if (d.open) load(); });
  };
  await draw();
  const timer = setInterval(() => { if (!body.isConnected || !$('#vi-list', body)) return clearInterval(timer); draw(); }, 30000);
}

// ---------------------------------------------------------------- customers
async function customers(body) {
  body.innerHTML = `<div class="panel">
    <div class="adm-filters"><input class="input" id="cu-q" type="search" placeholder="${esc(t('admin.searchCustomers'))}" aria-label="${esc(t('admin.searchCustomers'))}"></div>
    <div id="cu-rng">${rangeBarHTML(cuRange())}</div>
    <div id="cu-list"><div class="spinner"></div></div></div>`;
  const draw = async () => {
    const list = await api.adminCustomers($('#cu-q', body).value.trim(), cuISO(cuRange()));
    $('#cu-list', body).innerHTML = list.length ? `<div class="table-wrap"><table class="adm-table">
      <thead><tr><th>${esc(t('admin.colCustomer'))}</th><th>${esc(t('admin.colJoined'))}</th><th class="num">${esc(t('admin.colBooks'))}</th><th class="num">${esc(t('admin.colSpent'))}</th><th>${esc(t('admin.colLast'))}</th><th>${esc(t('admin.act2.colSeen'))}</th><th class="num">${esc(t('admin.act2.colVisits'))}</th><th class="num">${esc(t('admin.act2.colTime'))}</th><th class="num">${esc(t('admin.act2.colSearch'))}</th><th class="num">${esc(t('admin.act2.colOpened'))}</th></tr></thead>
      <tbody>${list.map(c => `<tr class="click-row" data-href="/admin/customers/${encodeURIComponent(c.id)}">
        <td><a href="#/admin/customers/${encodeURIComponent(c.id)}"><b>${esc(c.name || c.email)}</b></a>${c.isAdmin ? ` <span class="status live">${esc(t('admin.roleAdmin'))}</span>` : ''}<div class="muted" style="font-size:13px">${esc(c.email)}</div></td>
        <td style="white-space:nowrap">${esc(fmtDate(c.created_at))}</td>
        <td class="num">${c.books}</td><td class="num">${esc(money(c.spent_cents))}</td>
        <td style="white-space:nowrap">${c.last_at ? esc(fmtDate(c.last_at)) : '<span class="muted">—</span>'}</td>
        <td style="white-space:nowrap">${c.seen_at ? esc(agoText(c.seen_at)) : '<span class="muted">—</span>'}</td>
        <td class="num">${c.visits || '<span class="muted">—</span>'}</td>
        <td class="num" style="white-space:nowrap">${c.sec ? esc(durText(c.sec)) : '<span class="muted">—</span>'}</td>
        <td class="num">${c.searches || '<span class="muted">—</span>'}</td><td class="num">${c.opened || '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>`
      : `<p class="muted" style="margin:0">${esc(t('admin.noCustomers'))}</p>`;
    $$('.click-row', body).forEach(r => r.addEventListener('click', e => { if (!e.target.closest('a')) go(r.dataset.href); }));
  };
  $('#cu-q', body).addEventListener('input', debounce(draw, 250));
  const onRange = () => { $('#cu-rng', body).innerHTML = rangeBarHTML(cuRange()); bindRange($('#cu-rng', body), onRange); draw(); };
  bindRange($('#cu-rng', body), onRange);
  draw();
}

async function customer(body, id) {
  const cid = /^\d+$/.test(id) ? Number(id) : id;
  const rg = cuRange(), d = await api.adminCustomer(cid, cuISO(rg));
  const c = d.customer;
  const owned = new Set(d.purchases.map(p => p.book.id));
  const catalog = (await api.adminBooks()).filter(b => !owned.has(b.id));
  const grItems = catalog.map(b => ({ id: b.id, label: b.title + ' (' + (b.language || '').toUpperCase() + ')' }));
  body.innerHTML = `<a class="back-link" href="#/admin/customers">${icon('chevL', 'ico')} ${esc(t('admin.backCustomers'))}</a>
    <section class="panel"><h2 style="font-size:22px">${esc(c.name || c.email)} ${c.isAdmin ? `<span class="status live">${esc(t('admin.roleAdmin'))}</span>` : ''}</h2>
      <p class="muted" style="margin:4px 0 0"><span style="user-select:all">${esc(c.email)}</span> · ${esc(t('acc.memberSince', { date: fmtDate(c.created_at) }))}</p></section>
    <div id="cu-act">${activityHTML(d.events || [], rg)}</div>
    <section class="panel" style="margin-top:14px"><h2 class="section-title" style="font-size:17px;margin-bottom:8px">${esc(t('admin.customerBooks'))} (${d.purchases.length})</h2>
      ${d.purchases.length ? d.purchases.map(p => `<div class="adm-line"><span class="adm-book">${coverHTML(p.book, { badge: false })}<span><b>${esc(p.book.title)}</b><small class="muted">${esc(fmtDate(p.created_at))} · ${p.price_cents ? esc(money(p.price_cents, cur(p.currency))) : esc(p.gift ? t('admin.gift') : t('book.free'))}</small></span></span>
        <button class="btn btn-ghost btn-sm" data-revoke="${esc(p.book.id)}" data-title="${esc(p.book.title)}">${esc(t('admin.revoke'))}</button></div>`).join('') : `<p class="muted">${esc(t('lib.empty'))}</p>`}
    </section>
    <section class="panel" style="margin-top:14px"><h2 class="section-title" style="font-size:17px;margin-bottom:6px">${esc(t('admin.grant'))}</h2>
      <p class="muted" style="margin:0 0 10px;font-size:14px">${esc(t('admin.grantHelp'))}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><div style="flex:1;min-width:220px">${bookComboHTML('gr-book', grItems, '', t('ri.typeBook'))}</div>
      <button class="btn btn-buy" data-grant>${esc(t('admin.grant'))}</button></div>
    </section>
    ${d.orders.length ? `<section class="panel" style="margin-top:14px"><h2 class="section-title" style="font-size:17px;margin-bottom:8px">${esc(t('admin.customerOrders'))}</h2>
      ${d.orders.map(o => `<div class="adm-line"><span><b>${esc(o.reference)}</b><small class="muted">${esc(fmtDate(o.created_at))} · ${esc(methodLabel(o.method))} · ${esc(t('admin.ord.' + o.status))}</small></span><b class="num">${esc(money(o.amount_cents, cur(o.currency)))}</b></div>`).join('')}</section>` : ''}`;
  bindRange($('#cu-act', body), () => customer(body, id));
  bindBookCombo(body, 'gr-book', grItems);
  $('[data-grant]', body).onclick = async () => {
    const bid = $('#gr-book', body).value; if (!bid) return;
    try { await api.grantBook(c.id, bid); toast(t('admin.granted')); customer(body, id); } catch (e) { toast(errText(e), { error: true }); }
  };
  $$('[data-revoke]', body).forEach(b => b.onclick = async () => {
    if (!await confirmBox(t('admin.confirmRevoke', { title: b.dataset.title, email: c.email }), { ok: t('admin.revoke'), danger: true })) return;
    try { await api.revokeBook(c.id, b.dataset.revoke); toast(t('admin.revoked')); customer(body, id); } catch (e) { toast(errText(e), { error: true }); }
  });
}

// ---------------------------------------------------------------- reviews
async function reviews(body) {
  const [list, books] = await Promise.all([api.adminReviews(), api.adminBooks()]);
  // earlier imports, so one can be undone in one click
  const batches = {}; for (const r of list) if (r.batch) { const b = batches[r.batch] = batches[r.batch] || { n: 0, book: r.book_title, source: r.source || '—' }; b.n++; }
  const gm = {}; for (const r of list) { const g = gm[r.book_id] = gm[r.book_id] || { id: r.book_id, title: r.book_title, items: [], imp: 0, sum: 0, batches: [] }; g.items.push(r); g.sum += r.rating || 0; if (r.imported) g.imp++; }
  for (const [id, b] of Object.entries(batches)) { const r = list.find(x => x.batch === id); if (r && gm[r.book_id]) gm[r.book_id].batches.push([id, b]); }
  const groups = Object.values(gm).map(g => ({ ...g, avg: g.items.length ? g.sum / g.items.length : 0 })).sort((a, b) => String(a.title).localeCompare(String(b.title)));
  body.innerHTML = `<section class="panel ri" id="ri">
      <h2 class="section-title" style="font-size:18px;margin:0 0 4px">${icon('upload', 'ico')} ${esc(t('ri.title'))}</h2>
      <p class="muted" style="margin:0 0 12px;max-width:80ch">${esc(t('ri.help'))}</p>
      <div class="ri-top">
        <label class="field"><span>${esc(t('ri.book'))}</span><div class="bp"><input class="input" id="ri-bookq" autocomplete="off" placeholder="${esc(t('ri.typeBook'))}"><input type="hidden" id="ri-book"><div class="bp-list" id="ri-booklist" hidden></div></div></label>
        <label class="field"><span>${esc(t('ri.source'))} <small class="muted" style="font-weight:400">${esc(t('ri.sourceNote'))}</small></span><input class="input" id="ri-source" list="ri-sources" maxlength="60" placeholder="${esc(t('ri.sourcePh'))}"><datalist id="ri-sources">${['Amazon', 'Amazon.it', 'Amazon.de', 'Amazon.com', 'Etsy', 'Payhip', 'Gumroad', 'Google Play Books', 'Kobo', 'Apple Books', 'Shopify', 'WooCommerce'].map(x => `<option value="${x}">`).join('')}</datalist></label>
        <div class="field ri-filebox"><span>${esc(t('ri.file'))}</span>
          <label class="drop" id="ri-drop">${icon('upload')}<span><span class="fname">${esc(t('ri.dropHere'))}</span><br><small class="muted">${esc(t('ri.formats'))}</small></span><input type="file" id="ri-file" accept=".csv,.tsv,.txt,.xlsx,.xls,.ods,.json"></label>
          <div class="ri-chip" id="ri-chip" hidden>${icon('file')}<span class="ri-chip-txt"><b id="ri-fname"></b><small class="muted" id="ri-fmeta"></small></span><button type="button" class="btn btn-ghost btn-sm" id="ri-remove">✕ ${esc(t('ri.remove'))}</button></div>
        </div>
      </div>
      <p class="muted" style="font-size:13px;margin:8px 0 0"><button type="button" class="linkbtn" id="ri-template">${esc(t('ri.template'))}</button> · ${esc(t('ri.verifiedHint'))}</p>
      <div class="ri-err" id="ri-err" role="alert" hidden></div>
      <div id="ri-step"></div>
      <p class="ri-legal">${icon('info', 'ico')} ${esc(t('ri.legal'))}</p>
    </section>
    ${list.length ? `<section class="panel rv-tools"><input class="input" id="rv-q" type="search" placeholder="${esc(t('rv.searchBook'))}">
      <div class="rv-filter" role="group">${['all', 'imp', 'site'].map((k, i) => `<button type="button" class="btn btn-ghost btn-sm${i ? '' : ' on'}" data-rvf="${k}">${esc(t({ all: 'rv.fAll', imp: 'rv.fImported', site: 'rv.fSite' }[k]))}</button>`).join('')}</div>
      <button type="button" class="linkbtn" id="rv-exp">${esc(t('rv.expandAll'))}</button></section>
    ${groups.map(g => `<details class="panel rv-book" data-title="${esc((g.title || '').toLowerCase())}"${groups.length === 1 ? ' open' : ''}>
      <summary><span class="rv-head"><b>${esc(g.title)}</b><small class="muted">${esc(t('ri.count', { n: g.items.length }))} · ★ ${g.avg.toFixed(1)}${g.imp ? ' · ' + esc(t('rv.importedN', { n: g.imp })) : ''}${g.items.length - g.imp ? ' · ' + esc(t('rv.siteN', { n: g.items.length - g.imp })) : ''}</small></span><span class="rv-count">${g.items.length}</span></summary>
      <div class="rv-actions"><a class="btn btn-ghost btn-sm" href="#/book/${encodeURIComponent(g.id)}">${esc(t('rv.openBook'))}</a>${g.batches.map(([id, b]) => `<button class="btn btn-ghost btn-sm" data-undo="${esc(id)}">${icon('trash', 'ico')} ${esc(t('ri.undo'))} · ${esc(b.source)} (${b.n})</button>`).join('')}</div>
      ${g.items.map(r => `<div class="review adm-review" data-kind="${r.imported ? 'imp' : 'site'}">
      <div class="who" style="justify-content:space-between;flex-wrap:wrap"><span style="display:flex;gap:10px;align-items:center"><span class="avatar">${esc((r.author_name || '?').slice(0, 1).toUpperCase())}</span><span>${esc(r.author_name || t('rev.anon'))}<small class="muted" style="display:block;font-weight:400">${r.imported ? esc(t('ri.importedTag') + (r.source ? ' · ' + r.source : '')) : esc(r.email || '')}</small></span></span>
        <button class="btn btn-ghost btn-sm" data-delrev="${esc(r.id)}" data-name="${esc(r.author_name || '')}">${icon('trash', 'ico')} ${esc(t('admin.deleteReview'))}</button></div>
      <div class="rating-line" style="margin-top:6px">${stars(r.rating)} <span class="muted">· ${esc(fmtDate(r.created_at))}</span></div>
      ${(r.imported ? r.verified : true) ? `<div class="verified">${esc(t('rev.verified'))}</div>` : ''}${r.title ? `<b style="display:block;margin-top:6px">${esc(r.title)}</b>` : ''}${r.body ? `<p>${esc(r.body)}</p>` : ''}</div>`).join('')}</details>`).join('')}` : `<div class="panel"><p class="muted" style="margin:0">${esc(t('admin.noReviews'))}</p></div>`}`;
  $$('[data-delrev]', body).forEach(b => b.onclick = async () => {
    if (!await confirmBox(t('admin.confirmDeleteReview', { name: b.dataset.name }), { ok: t('admin.deleteReview'), danger: true })) return;
    try { await api.deleteReview(b.dataset.delrev); toast(t('admin.reviewDeleted')); reviews(body); } catch (e) { toast(errText(e), { error: true }); }
  });
  $$('[data-undo]', body).forEach(b => b.onclick = async () => {
    const x = batches[b.dataset.undo];
    if (!await confirmBox(t('ri.confirmUndo', { n: x.n, book: x.book }), { ok: t('ri.undo'), danger: true })) return;
    try { await api.deleteReviewBatch(b.dataset.undo); toast(t('ri.undone')); reviews(body); } catch (e) { toast(errText(e), { error: true }); }
  });
  const q = $('#rv-q', body);
  const apply = () => { const v = (q?.value || '').trim().toLowerCase(), f = $('[data-rvf].on', body)?.dataset.rvf || 'all';
    $$('.rv-book', body).forEach(d => { let n = 0; $$('.adm-review', d).forEach(c => { const ok = f === 'all' || c.dataset.kind === f; c.hidden = !ok; if (ok) n++; }); d.hidden = (v && !d.dataset.title.includes(v)) || !n; if (v && !d.hidden) d.open = true; }); };
  if (q) q.oninput = apply;
  $$('[data-rvf]', body).forEach(b => b.onclick = () => { $$('[data-rvf]', body).forEach(x => x.classList.toggle('on', x === b)); apply(); });
  const ex = $('#rv-exp', body); if (ex) ex.onclick = () => { const open = !$$('.rv-book', body).every(d => d.open); $$('.rv-book', body).forEach(d => { if (!d.hidden) d.open = open; }); ex.textContent = t(open ? 'rv.collapseAll' : 'rv.expandAll'); };
  importReviewsUI(body, books);
}

function importReviewsUI(body, books) {
  const step = $('#ri-step', body), fileIn = $('#ri-file', body), bookSel = $('#ri-book', body), srcIn = $('#ri-source', body);
  const errBox = $('#ri-err', body), drop = $('#ri-drop', body), chip = $('#ri-chip', body);
  let data = null, map = {}, dayFirst = true, product = '', allVerified = false;
  // problems are written in red inside the box, not only in a message that disappears
  const showErr = (msg, look = false) => { errBox.innerHTML = `${icon('info', 'ico')}<span>${esc(msg)}</span>`; errBox.hidden = false; if (look) errBox.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  const clearErr = () => { errBox.hidden = true; errBox.textContent = ''; };
  const removeFile = () => { data = null; map = {}; product = ''; allVerified = false; fileIn.value = ''; chip.hidden = true; drop.hidden = false; step.innerHTML = ''; clearErr(); };
  $('#ri-remove', body).onclick = removeFile;
  $('#ri-template', body).onclick = () => {
    const csv = '﻿name;rating;title;review;date;time;country;verified\r\nMaria R.;5;Bellissimo;"Libro chiaro, esercizi facili da seguire.";12/03/2025;14:35;Italia;yes\r\nJohn D.;4;Good book;Useful for beginners.;2025-02-01;09:10;USA;no\r\n';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'librava-recenzii-model.csv'; document.body.appendChild(a); a.click(); a.remove();
  };
  const render = () => {
    if (!data) { step.innerHTML = ''; return; }
    const { ok, skipped } = buildReviews(data.rows, map, { dayFirst, product });
    if (!map.verified && allVerified) ok.forEach(r => r.verified = true);
    const products = map.product ? [...new Set(data.rows.map(r => String(r[map.product] ?? '').trim()).filter(Boolean))].slice(0, 200) : [];
    const sel = f => `<label class="field"><span>${esc(t('ri.f.' + f))}</span><select class="input" data-map="${f}"><option value="">—</option>${data.headers.map(h => `<option ${map[f] === h ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></label>`;
    step.innerHTML = `<div class="ri-map"><h3>${esc(t('ri.map'))}</h3><div class="ri-grid">${REVIEW_FIELDS.map(sel).join('')}
        <label class="field"><span>${esc(t('ri.dateOrder'))}</span><select class="input" id="ri-dmy"><option value="1" ${dayFirst ? 'selected' : ''}>${esc(t('ri.dmy'))}</option><option value="0" ${dayFirst ? '' : 'selected'}>${esc(t('ri.mdy'))}</option></select></label>
        ${map.verified ? '' : `<label class="check ri-allver"><input type="checkbox" id="ri-allver" ${allVerified ? 'checked' : ''}> ${esc(t('ri.allVerified'))}</label>`}
        ${products.length > 1 ? `<label class="field"><span>${esc(t('ri.product'))}</span><select class="input" id="ri-prod"><option value="">${esc(t('ri.allRows'))}</option>${products.map(p => `<option ${p === product ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>` : ''}</div></div>
      <div class="ri-sum"><b>${esc(t('ri.ready', { n: ok.length }))}</b>${skipped.length ? `<div class="ri-warn">${esc(t('ri.skipped', { n: skipped.length, lines: skipped.slice(0, 8).map(x => x.line).join(', ') + (skipped.length > 8 ? '…' : '') }))}</div>` : ''}</div>
      ${ok.length ? `<div class="ri-preview">${ok.slice(0, 4).map(r => `<div class="review"><div class="who"><span class="avatar">${esc((r.author_name || '?').slice(0, 1).toUpperCase())}</span>${esc(r.author_name || t('rev.anon'))}</div>
        <div class="rating-line" style="margin-top:6px">${stars(r.rating)} ${r.title ? `<b>${esc(r.title)}</b>` : ''}</div>
        ${r.verified ? `<div class="verified">${esc(t('rev.verified'))}</div>` : ''}<div class="muted" style="font-size:13px">${r.created_at ? esc(new Date(r.created_at).toLocaleString(getLang(), { dateStyle: 'medium', timeStyle: 'short' })) : esc(t('ri.noDate'))}${r.country ? ' · ' + esc(r.country) : ''}</div>
        ${r.body ? `<p>${esc(r.body.length > 280 ? r.body.slice(0, 280) + '…' : r.body)}</p>` : ''}</div>`).join('')}</div>` : ''}
      <button class="btn btn-buy" id="ri-go" ${ok.length ? '' : 'disabled'}>${icon('upload', 'ico')} ${esc(t('ri.publish', { n: ok.length }))}</button>`;
    if (!ok.length) showErr(t('ri.noneValid')); else if (!errBox.textContent.includes(t('ri.pubErr'))) clearErr();
    $$('[data-map]', step).forEach(x => x.onchange = () => { map[x.dataset.map] = x.value || undefined; if (x.dataset.map === 'product') product = ''; render(); });
    $('#ri-dmy', step).onchange = e => { dayFirst = e.target.value === '1'; render(); };
    const av = $('#ri-allver', step); if (av) av.onchange = e => { allVerified = e.target.checked; render(); };
    const pr = $('#ri-prod', step); if (pr) pr.onchange = e => { product = e.target.value; render(); };
    $('#ri-go', step).onclick = async e => {
      if (!bookSel.value) { showErr(t('ri.pickBook'), true); $('#ri-bookq', body).focus({ preventScroll: true }); $('#ri-bookq', body).classList.add('invalid'); bookSel.classList.add('invalid'); return; }
      const btn = e.currentTarget; btn.disabled = true; clearErr();
      try {
        const r = await api.importReviews(bookSel.value, ok, srcIn.value.trim());
        toast(t('ri.done', { n: r.added }) + (r.updated ? ' ' + t('ri.updated', { n: r.updated }) : '') + (r.dupes ? ' ' + t('ri.dupes', { n: r.dupes }) : ''));
        reviews(body);
      } catch (x) { btn.disabled = false; showErr(t('ri.pubErr') + ' ' + errText(x), true); }
    };
  };
  fileIn.onchange = async () => {
    const f = fileIn.files[0]; if (!f) return;
    clearErr(); drop.hidden = true; chip.hidden = false;
    const size = f.size < 1024 ? f.size + ' B' : kb(f.size);
    $('#ri-fname', body).textContent = f.name; $('#ri-fmeta', body).textContent = size;
    step.innerHTML = `<div class="spinner" style="margin:16px auto"></div>`;
    try {
      data = await readReviewFile(f, async () => { await loadScript(VENDOR('xlsx.full.min.js')); return window.XLSX; });
      if (!data.rows.length) throw new Error(t('ri.empty'));
      map = guessMapping(data.headers);
      // guess the source and the book from the file when possible
      if (!srcIn.value) { const m = f.name.match(/amazon|etsy|payhip|gumroad|kobo|shopify|woo/i); if (m) srcIn.value = m[0][0].toUpperCase() + m[0].slice(1).toLowerCase(); }
      if (map.product) {
        const vals = [...new Set(data.rows.map(r => String(r[map.product] ?? '').trim()))];
        const bt = books.find(b => b.id === bookSel.value)?.title;
        product = vals.length > 1 ? (vals.find(v => bt && norm(v).includes(norm(bt).slice(0, 20))) || '') : '';
      }
      $('#ri-fmeta', body).textContent = size + ' · ' + t('ri.rows', { n: data.rows.length });
      render();
    } catch (x) { data = null; step.innerHTML = ''; showErr(t('ri.readErr') + ' ' + (x.message || '')); }
  };
  // search box instead of a long list: type a few letters of the title and the matching books appear at once
  { const q = $('#ri-bookq', body), list = $('#ri-booklist', body);
    const all = books.filter(b => !b.deleted_at).map(b => ({ id: b.id, title: b.title, label: b.title + (b.language ? ' · ' + b.language.toUpperCase() : '') + (b.format ? ' · ' + String(b.format).toUpperCase() : '') }));
    const norm = x => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let sel = -1, shown = [];
    const draw = () => {
      const w = norm(q.value).split(/\s+/).filter(Boolean);
      shown = (w.length ? all.filter(b => w.every(x => norm(b.label).includes(x))) : all).slice(0, 12); sel = shown.length ? 0 : -1;
      list.innerHTML = shown.length ? shown.map((b, k) => `<button type="button" class="bp-opt ${k === sel ? 'on' : ''}" data-i="${k}">${esc(b.label)}</button>`).join('') : `<div class="bp-none">${esc(t('ri.noBook'))}</div>`;
      list.hidden = false;
      $$('.bp-opt', list).forEach(o => o.onmousedown = e => { e.preventDefault(); pick(shown[+o.dataset.i]); });
    };
    const pick = b => { if (!b) return; bookSel.value = b.id; q.value = b.label; q.classList.remove('invalid'); list.hidden = true; bookSel.onchange && bookSel.onchange(); };
    q.oninput = () => { bookSel.value = ''; draw(); };
    q.onfocus = () => { q.select(); draw(); };
    q.onblur = () => setTimeout(() => { list.hidden = true; }, 120);
    q.onkeydown = e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!shown.length) return; sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length; $$('.bp-opt', list).forEach((o, k) => o.classList.toggle('on', k === sel)); $$('.bp-opt', list)[sel]?.scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'Enter') { e.preventDefault(); pick(shown[sel]); }
      else if (e.key === 'Escape') list.hidden = true;
    };
  }
  bookSel.onchange = () => { bookSel.classList.remove('invalid'); if (errBox.textContent === t('ri.pickBook')) clearErr(); if (data && map.product && !product) { const bt = books.find(b => b.id === bookSel.value)?.title; const vals = [...new Set(data.rows.map(r => String(r[map.product] ?? '').trim()))]; product = vals.find(v => bt && norm(v).includes(norm(bt).slice(0, 20))) || ''; render(); } };
}

// ---------------------------------------------------------------- manuscript check (sizes, readability on phone & tablet)
// the version in the address makes phones fetch a new library file instead of an old saved copy
const VENDOR = f => new URL('../vendor/' + f + '?v=' + (f.startsWith('pdf.') ? 'pdfjs-3.11.174-legacy' : '1'), import.meta.url).href;
const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.round(n / 1024) + ' KB';
async function pdfLib() {
  await loadScript(VENDOR('pdf.min.js'));
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = VENDOR('pdf.worker.min.js');
  return window.pdfjsLib;
}
const cm = pt => (pt / 72 * 2.54).toFixed(1).replace('.', ',');
async function analyzeManuscript(file, bookLang) {
  const items = [], meta = { name: file.name, size: file.size };
  const add = (level, key, vars) => items.push({ level, text: t(key, vars) });
  const mb = file.size / 1048576;
  if (mb > 500) add('error', 'fc.tooBig', { mb: mb.toFixed(0) });
  else if (mb > 150) add('warn', 'fc.big', { mb: mb.toFixed(0) });
  else add('ok', 'fc.sizeOk', { mb: mb.toFixed(1) });
  if (/\.pdf$/i.test(file.name)) {
    meta.kind = 'pdf';
    let doc;
    try { const lib = await pdfLib(); doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise; }
    catch (e) { add('error', /password/i.test(e?.name + e?.message) ? 'fc.pdfLocked' : 'fc.pdfBroken'); return { items, meta }; }
    meta.pages = doc.numPages;
    const sizes = new Map();
    const n = Math.min(doc.numPages, 400);
    for (let i = 1; i <= n; i++) {
      const pg = await doc.getPage(i); const vp = pg.getViewport({ scale: 1 });
      const k = Math.round(vp.width / 3) * 3 + 'x' + Math.round(vp.height / 3) * 3;
      sizes.set(k, (sizes.get(k) || 0) + 1); pg.cleanup();
    }
    const [main] = [...sizes.entries()].sort((a, b) => b[1] - a[1]);
    const [w, h] = main[0].split('x').map(Number);
    meta.page = { w, h };
    add('ok', 'fc.pages', { n: doc.numPages });
    const ratio = h / w;
    const dims = { w: cm(w), h: cm(h), r: ratio.toFixed(2).replace('.', ',') };
    if (ratio < 1) add('warn', 'fc.landscape', dims);
    else if (ratio < 1.2) add('warn', 'fc.square', dims);
    else if (ratio > 1.85) add('warn', 'fc.tall', dims);
    else add('ok', 'fc.ratioOk', dims);
    if (w / 72 * 2.54 > 30) add('warn', 'fc.hugePage', dims);
    else if (w / 72 * 2.54 < 8) add('warn', 'fc.tinyPage', dims);
    if (sizes.size > 1) add('warn', 'fc.mixed', { n: doc.numPages - main[1] });
    // standard book sizes (like KDP) and how the pages will look on each kind of device
    const inW = w / 72, inH = h / 72;
    const STD = [['5 × 8 in', 5, 8], ['5,5 × 8,5 in', 5.5, 8.5], ['6 × 9 in', 6, 9], ['7 × 10 in', 7, 10], ['8 × 10 in', 8, 10], ['8,25 × 11 in', 8.25, 11], ['8,5 × 11 in', 8.5, 11], ['A5', 5.83, 8.27], ['A4', 8.27, 11.69]];
    const std = STD.find(([, a, b]) => Math.abs(a - inW) < 0.08 && Math.abs(b - inH) < 0.08);
    meta.trim = std ? std[0] : null;
    if (std) add('ok', 'fc.trimStd', { s: std[0] }); else if (ratio >= 1 && ratio <= 1.85) add('warn', 'fc.trimOdd', dims);
    meta.ereader = inW <= 6.6 ? 'good' : inW <= 8.6 ? 'zoom' : 'small';
    add(meta.ereader === 'good' ? 'ok' : 'warn', 'fc.ereader.' + meta.ereader);
    // text or only pictures? and how sharp are the pictures?
    let textPages = 0, minDpi = null;
    const OPS = window.pdfjsLib.OPS;
    for (let i = 1; i <= Math.min(doc.numPages, 6); i++) {
      const pg = await doc.getPage(i);
      try { const tc = await pg.getTextContent(); if (tc.items.some(x => (x.str || '').trim())) textPages++; } catch { }
      try {
        // follow the drawing transforms to know how big each picture is on the page → its real dpi
        const ol = await pg.getOperatorList(); const vp = pg.getViewport({ scale: 1 });
        let m = [1, 0, 0, 1, 0, 0]; const stack = [];
        const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
        for (let j = 0; j < ol.fnArray.length; j++) {
          const fn = ol.fnArray[j], args = ol.argsArray[j];
          if (fn === OPS.save) stack.push(m);
          else if (fn === OPS.restore) m = stack.pop() || [1, 0, 0, 1, 0, 0];
          else if (fn === OPS.transform) m = mul(m, args);
          else if (fn === OPS.paintImageXObject && args && args[1]) {
            const drawnW = Math.hypot(m[0], m[1]);
            if (drawnW > vp.width * 0.4) { const dpi = args[1] / (drawnW / 72); minDpi = minDpi === null ? dpi : Math.min(minDpi, dpi); }
          }
        }
      } catch { }
      pg.cleanup();
    }
    if (!textPages) add('warn', 'fc.noText');
    if (minDpi !== null) {
      const d = Math.round(minDpi);
      if (d < 120) add('warn', 'fc.lowDpi', { dpi: d }); else if (d < 200) add('warn', 'fc.midDpi', { dpi: d }); else add('ok', 'fc.dpiOk', { dpi: d });
      meta.dpi = d;
    }
    meta.doc = doc;   // kept for the phone / tablet preview, removed before saving
  } else if (/\.epub$/i.test(file.name)) {
    meta.kind = 'epub';
    try {
      await loadScript(VENDOR('jszip.min.js'));
      const zip = await window.JSZip.loadAsync(file);
      if (zip.file('META-INF/encryption.xml')) { add('error', 'fc.epubDrm'); return { items, meta }; }
      const cont = await zip.file('META-INF/container.xml')?.async('string');
      const opfPath = cont && /full-path="([^"]+)"/.exec(cont)?.[1];
      const opfTxt = opfPath && await zip.file(opfPath)?.async('string');
      if (!opfTxt) { add('error', 'fc.epubBroken'); return { items, meta }; }
      const opf = new DOMParser().parseFromString(opfTxt, 'application/xml');
      const version = opf.documentElement.getAttribute('version') || '?';
      const manifest = [...opf.getElementsByTagName('item')];
      const spine = opf.getElementsByTagName('itemref').length;
      const images = manifest.filter(i => /^image\//.test(i.getAttribute('media-type') || ''));
      const fixed = /pre-paginated/.test(opfTxt);
      const hasToc = manifest.some(i => /\bnav\b/.test(i.getAttribute('properties') || '') || /ncx/.test(i.getAttribute('media-type') || ''));
      const hasCover = manifest.some(i => /cover-image/.test(i.getAttribute('properties') || '')) || /name="cover"/.test(opfTxt);
      const lang = (opf.getElementsByTagName('dc:language')[0]?.textContent || '').trim().slice(0, 2).toLowerCase();
      meta.epub = { version, chapters: spine, images: images.length, fixed };
      add('ok', 'fc.epubOk', { v: version, n: spine });
      // pages: counted from the words of the book, like a printed book (about 250 words a page)
      if (!fixed) {
        const base = opfPath.includes('/') ? opfPath.replace(/[^/]+$/, '') : '';
        const byId = Object.fromEntries(manifest.map(i => [i.getAttribute('id'), i.getAttribute('href')]));
        let words = 0;
        for (const ref of [...opf.getElementsByTagName('itemref')]) {
          const f = zip.file(base + decodeURIComponent(byId[ref.getAttribute('idref')] || '')); if (!f) continue;
          const txt = (await f.async('string')).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
          words += (txt.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
        }
        if (words) { meta.pages = Math.max(1, Math.round(words / 250)); meta.words = words; add('ok', 'fc.epubPages', { n: meta.pages, w: words.toLocaleString(getLang()) }); }
      } else meta.pages = spine;
      if (fixed) add('warn', 'fc.epubFixed'); else { add('ok', 'fc.epubReflow'); add('ok', 'fc.ereader.epub'); }
      meta.ereader = fixed ? 'zoom' : 'epub';
      if (!hasToc) add('warn', 'fc.epubNoToc');
      if (!hasCover) add('warn', 'fc.epubNoCover');
      if (lang && bookLang && lang !== bookLang) add('warn', 'fc.epubLang', { a: lang.toUpperCase(), b: bookLang.toUpperCase() });
      // very large pictures make phones slow
      let big = 0;
      for (const im of images.slice(0, 60)) {
        const href = im.getAttribute('href'); const base = opfPath.includes('/') ? opfPath.replace(/[^/]+$/, '') : '';
        const f = zip.file(base + decodeURIComponent(href)); if (!f) continue;
        const sz = (await f.async('uint8array')).length; if (sz > 3 * 1048576) big++;
      }
      if (big) add('warn', 'fc.epubBigImages', { n: big });
    } catch { add('error', 'fc.epubBroken'); }
  }
  return { items, meta };
}

// shows the first page inside a phone and a tablet frame, at the size the reader will use
async function devicePreview(box, doc) {
  box.innerHTML = `<div class="dev-row"><figure class="dev phone"><div class="screen"><canvas></canvas></div><figcaption>${esc(t('fc.onPhone'))}</figcaption></figure>
    <figure class="dev tablet"><div class="screen"><canvas></canvas></div><figcaption>${esc(t('fc.onTablet'))}</figcaption></figure></div>`;
  const page = await doc.getPage(1);
  for (const fig of box.querySelectorAll('.dev')) {
    const scr = fig.querySelector('.screen'), cv = fig.querySelector('canvas');
    const W = scr.clientWidth, H = scr.clientHeight;
    const vp1 = page.getViewport({ scale: 1 });
    const scale = Math.min(W / vp1.width, H / vp1.height);
    const vp = page.getViewport({ scale: scale * 2 });
    cv.width = vp.width; cv.height = vp.height; cv.style.width = (vp.width / 2) + 'px'; cv.style.height = (vp.height / 2) + 'px';
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
  }
}

// ---------------------------------------------------------------- make the images already uploaded light (max 105 KB)
async function optimizeExisting(btn) {
  const fetchFile = async (url, name) => { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); const b = await r.blob(); return new File([b], name, { type: b.type }); };
  const books = await api.adminBooks();
  let done = 0, saved = 0, checked = 0;
  for (const b of books) {
    btn.textContent = t('img.working', { n: ++checked, total: books.length });
    try {
      if (b.cover_url && !/\.svg(\?|$)/i.test(b.cover_url)) {
        const f = await fetchFile(b.cover_url, 'cover');
        if (f.size > 105 * 1024) { const light = await compressImage(f, { maxW: 1200, maxH: 1920, name: 'cover' }); if (light.size < f.size) { await api.replaceCover(b, light); saved += f.size - light.size; done++; } }
      }
      const aplus = b.aplus !== undefined ? b.aplus : (await api.getBook(b.id).catch(() => null))?.aplus;   // the admin list is light
      if ((aplus || []).length) {
        let changed = false;
        const mods = [];
        for (const m of aplus) {
          const spec = APLUS[m.type] || {};
          const imgs = [];
          for (const im of (m.imgs || [])) {
            if (!im) { imgs.push(null); continue; }
            const clean = { ref: im.ref, w: im.w, h: im.h };
            try {
              const f = await fetchFile(im.url || im.ref, 'aplus');
              if (f.size > 105 * 1024) {
                const big = spec.rec && spec.rec[0] > 1000;
                const light = await compressImage(f, { maxW: big ? 1600 : (spec.rec?.[0] || 970), maxH: big ? 500 : (spec.rec?.[1] || 600), name: 'aplus' });
                if (light.size < f.size) { const up = await api.uploadAplusImage(b.id, light); clean.ref = up.ref; changed = true; saved += f.size - light.size; done++; }
              }
            } catch { }
            imgs.push(clean);
          }
          mods.push({ ...m, imgs });
        }
        if (changed) await api.updateAplus(b.id, mods.map(m => ({ ...m, imgs: m.imgs.map(i => i && { ref: i.ref, w: i.w, h: i.h }) })));
      }
    } catch (e) { console.warn('optimize', b.id, e); }
  }
  return { done, saved };
}

// ---------------------------------------------------------------- previewer (like KDP: see the book on phone, tablet and computer before publishing)
const DEVICES = { phone: [375, 740], tablet: [768, 1024], desktop: [1180, 760] };
async function openPreviewer(source, kind) {
  modal(`<div class="pv"><div class="pv-top"><b>${esc(t('pv.title'))}</b>
      <div class="seg">${Object.keys(DEVICES).map(d => `<button type="button" data-dev="${d}" class="${d === 'phone' ? 'on' : ''}">${esc(t('pv.' + d))}</button>`).join('')}</div>
      <button type="button" class="btn btn-ghost btn-sm" data-close>✕</button></div>
    <div class="pv-stage"><div class="pv-device"><div class="pv-screen"></div></div></div>
    <div class="pv-nav"><button type="button" class="btn btn-ghost" data-pv="prev">‹ ${esc(t('pv.prev'))}</button><span class="pv-pos muted"></span><button type="button" class="btn btn-ghost" data-pv="next">${esc(t('pv.next'))} ›</button></div>
    <p class="muted pv-note">${esc(t('pv.note'))}</p></div>`, {
    onMount: async (m, close) => {
      m.classList.add('modal-wide');
      const stage = m.querySelector('.pv-stage'), dev = m.querySelector('.pv-device'), scr = m.querySelector('.pv-screen'), pos = m.querySelector('.pv-pos');
      const buf = source instanceof Blob ? await source.arrayBuffer() : await (await fetch(source)).arrayBuffer();
      let device = 'phone', engine = null;
      const fit = () => {
        const [w, h] = DEVICES[device];
        scr.style.width = w + 'px'; scr.style.height = h + 'px';
        const k = Math.min(1, (stage.clientWidth - 20) / (w + 24), (window.innerHeight * 0.62) / (h + 24));
        dev.style.transform = `scale(${k})`; dev.style.width = (w + 24) + 'px'; dev.style.height = (h + 24) + 'px';
        stage.style.height = ((h + 24) * k + 8) + 'px'; dev.dataset.dev = device;
      };
      if (kind === 'pdf') {
        const lib = await pdfLib(); const doc = await lib.getDocument({ data: buf.slice(0) }).promise;
        let n = 1; const cv = document.createElement('canvas'); scr.appendChild(cv); scr.classList.add('pdf');
        const draw = async () => {
          const page = await doc.getPage(n), [w, h] = DEVICES[device], vp1 = page.getViewport({ scale: 1 });
          const scale = Math.min(w / vp1.width, h / vp1.height), vp = page.getViewport({ scale: scale * 2 });
          cv.width = vp.width; cv.height = vp.height; cv.style.width = vp.width / 2 + 'px'; cv.style.height = vp.height / 2 + 'px';
          await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
          pos.textContent = t('reader.pageShort', { n, total: doc.numPages });
        };
        engine = { draw, next: () => { if (n < doc.numPages) { n++; draw(); } }, prev: () => { if (n > 1) { n--; draw(); } } };
      } else {
        await loadScript(VENDOR('jszip.min.js')); await loadScript(VENDOR('epub.min.js'));
        const book = window.ePub(buf); let rendition = null;
        const draw = async () => {
          const loc = rendition?.currentLocation()?.start?.cfi; rendition?.destroy(); scr.innerHTML = '';
          const [w, h] = DEVICES[device];
          rendition = book.renderTo(scr, { width: w, height: h, flow: 'paginated', spread: device === 'desktop' ? 'auto' : 'none', allowScriptedContent: false });
          rendition.themes.default({ body: { 'font-size': device === 'phone' ? '17px' : '18px', 'line-height': '1.55', padding: '0 6px' } });
          rendition.on('relocated', l => { pos.textContent = l?.start?.displayed ? t('pv.screen', { n: l.start.displayed.page, total: l.start.displayed.total }) : ''; });
          await rendition.display(loc || undefined);
        };
        engine = { draw, next: () => rendition?.next(), prev: () => rendition?.prev() };
      }
      fit(); await engine.draw();
      m.querySelectorAll('[data-dev]').forEach(b => b.onclick = async () => { device = b.dataset.dev; m.querySelectorAll('[data-dev]').forEach(x => x.classList.toggle('on', x === b)); fit(); await engine.draw(); });
      m.querySelector('[data-pv="next"]').onclick = () => engine.next();
      m.querySelector('[data-pv="prev"]').onclick = () => engine.prev();
      const key = e => { if (!m.isConnected) { document.removeEventListener('keydown', key); return; } if (e.key === 'ArrowRight') engine.next(); if (e.key === 'ArrowLeft') engine.prev(); if (e.key === 'Escape') close(); };
      document.addEventListener('keydown', key);
    },
  });
}

// ---------------------------------------------------------------- automatic free sample ("Look inside")
const SAMPLE_PAGES = 6;
// the free preview: the first N pages (PDF) — for EPUB the first N pages of real text (about 250 words a page,
// like a printed book). Cover, title page, copyright and contents come along but don't count.
export async function makeSample(file, pages = SAMPLE_PAGES) {
  pages = Math.max(1, Math.min(200, Math.round(+pages || SAMPLE_PAGES)));
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    await loadScript(VENDOR('pdf-lib.min.js'));
    const { PDFDocument } = window.PDFLib;
    const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
    const out = await PDFDocument.create();
    const n = Math.min(pages, src.getPageCount());
    (await out.copyPages(src, [...Array(n).keys()])).forEach(p => out.addPage(p));
    out.setTitle((src.getTitle() || '') + ' (sample)');
    return { file: new File([await out.save()], 'sample.pdf', { type: 'application/pdf' }), pages: n };
  }
  await loadScript(VENDOR('jszip.min.js'));
  const zip = await window.JSZip.loadAsync(file);
  const cont = await zip.file('META-INF/container.xml').async('string');
  const opfPath = /full-path="([^"]+)"/.exec(cont)[1];
  const base = opfPath.includes('/') ? opfPath.replace(/[^/]+$/, '') : '';
  const opf = new DOMParser().parseFromString(await zip.file(opfPath).async('string'), 'application/xml');
  const items = Object.fromEntries([...opf.getElementsByTagName('item')].map(i => [i.getAttribute('id'), i]));
  const refs = [...opf.getElementsByTagName('itemref')];
  const target = pages * 250, count = s => (s.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
  let words = 0, done = false, started = false; const removed = new Set();
  for (const r of refs) {
    const it = items[r.getAttribute('idref')]; if (!it) continue;
    const path = base + decodeURIComponent(it.getAttribute('href'));
    const isNav = /\bnav\b/.test(it.getAttribute('properties') || '');
    if (done) { if (!isNav) { zip.remove(path); removed.add(path); it.remove(); } r.remove(); continue; }
    if (isNav) continue;
    const src = await zip.file(path)?.async('string'); if (!src) continue;
    const doc = new DOMParser().parseFromString(src, 'application/xhtml+xml');
    const bodyEl = doc.getElementsByTagName('body')[0]; if (!bodyEl) continue;
    const w = count(bodyEl.textContent || '');
    // short front pages (cover, title, copyright, dedication) before the story starts: kept, not counted
    if (!started && w < 400) continue;
    started = true;
    if (words + w <= target) { words += w; continue; }
    // this chapter goes over: keep it up to the paragraph where the preview ends
    const blocks = [...bodyEl.querySelectorAll('p, li, blockquote, h1, h2, h3, h4, h5, h6')];
    let cut = null;
    for (const b of blocks) { words += count(b.textContent || ''); if (words >= target) { cut = b; break; } }
    if (cut) {
      const all = [...bodyEl.getElementsByTagName('*')]; const after = all.slice(all.indexOf(cut) + 1).filter(n => !n.contains(cut));
      after.forEach(n => n.parentNode && n.parentNode.removeChild(n));
      const end = doc.createElementNS('http://www.w3.org/1999/xhtml', 'p');
      end.setAttribute('style', 'text-align:center;text-indent:0;margin-top:2em;letter-spacing:.4em'); end.textContent = '✦ ✦ ✦';
      cut.parentNode.insertBefore(end, cut.nextSibling);
      zip.file(path, new XMLSerializer().serializeToString(doc));
    }
    done = true;
  }
  // like Amazon: the contents keep every chapter; those not in the preview open a short "in the full book" page
  if (removed.size) {
    const morePath = base + 'librava-more.xhtml';
    zip.file(morePath, `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en"><head><meta charset="utf-8"/><title>Full book</title></head><body style="text-align:center;margin-top:30%;font-family:Georgia,serif"><p style="letter-spacing:.4em">✦ ✦ ✦</p><p>This chapter is in the full book.</p></body></html>`);
    const man = opf.getElementsByTagName('manifest')[0], spineEl = opf.getElementsByTagName('spine')[0];
    const item = opf.createElementNS(man.namespaceURI, 'item'); item.setAttribute('id', 'librava-more'); item.setAttribute('href', 'librava-more.xhtml'); item.setAttribute('media-type', 'application/xhtml+xml'); man.appendChild(item);
    const ir = opf.createElementNS(spineEl.namespaceURI, 'itemref'); ir.setAttribute('idref', 'librava-more'); spineEl.appendChild(ir);
    const gone = href => { const f = decodeURIComponent(String(href || '').split('#')[0]); return !!f && [...removed].some(p => p === f || p.endsWith('/' + f)); };
    const relTo = (fromPath, toPath) => { const a = fromPath.split('/').slice(0, -1), b = toPath.split('/'); while (a.length && b.length > 1 && a[0] === b[0]) { a.shift(); b.shift(); } return '../'.repeat(a.length) + b.join('/'); };
    for (const it of Object.values(items)) {
      if (!it.parentNode) continue;
      const isNav = /\bnav\b/.test(it.getAttribute('properties') || ''), isNcx = /ncx/.test(it.getAttribute('media-type') || '');
      if (!isNav && !isNcx) continue;
      const path = base + decodeURIComponent(it.getAttribute('href')), src = await zip.file(path)?.async('string'); if (!src) continue;
      const doc = new DOMParser().parseFromString(src, 'application/xml'), to = relTo(path, morePath);
      if (isNav) [...doc.getElementsByTagName('a')].filter(a => gone(a.getAttribute('href'))).forEach(a => a.setAttribute('href', to));
      else [...doc.getElementsByTagName('content')].filter(c => gone(c.getAttribute('src'))).forEach(c => c.setAttribute('src', to));
      zip.file(path, new XMLSerializer().serializeToString(doc));
    }
  }
  // pictures used only in the chapters left out are removed too (otherwise the free sample weighs as much as the book)
  {
    const texts = [];
    for (const it of [...opf.getElementsByTagName('item')]) {
      if (!/xhtml|html|css|ncx|svg/.test(it.getAttribute('media-type') || '')) continue;
      const s = await zip.file(base + decodeURIComponent(it.getAttribute('href') || ''))?.async('string'); if (s) texts.push(s);
    }
    const all = texts.join('\n');
    const coverId = [...opf.getElementsByTagName('meta')].find(m => m.getAttribute('name') === 'cover')?.getAttribute('content');
    for (const it of [...opf.getElementsByTagName('item')]) {
      if (!/^image\//.test(it.getAttribute('media-type') || '')) continue;
      if (/cover-image/.test(it.getAttribute('properties') || '') || it.getAttribute('id') === coverId) continue;
      const href = decodeURIComponent(it.getAttribute('href') || ''), name = href.split('/').pop();
      if (all.includes(name)) continue;
      zip.remove(base + href); it.parentNode.removeChild(it);
    }
  }
  zip.file(opfPath, new XMLSerializer().serializeToString(opf));
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' });
  return { file: new File([blob], 'sample.epub', { type: 'application/epub+zip' }), pages: Math.min(pages, Math.max(1, Math.round(words / 250))) };
}

// ---------------------------------------------------------------- A+ content editor
const APLUS = {
  banner: { imgs: 1, rec: [1940, 600], min: [970, 300] },
  header: { imgs: 1, rec: [970, 600], min: [485, 300] },
  image_text: { imgs: 1, rec: [600, 600], min: [300, 300] },
  three: { imgs: 3, rec: [600, 600], min: [300, 300] },
  text: { imgs: 0 },
};
function imgSize(file) {
  return new Promise(res => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ w: 0, h: 0 }); im.src = u; });
}
function aplusEditor(root, modules, getBookId) {
  const draw = () => {
    root.innerHTML = `${modules.length ? '' : `<p class="muted" style="margin:0">${esc(t('ap.empty'))}</p>`}
      ${modules.map((m, i) => {
        const spec = APLUS[m.type];
        const imgSlot = k => { const im = (m.imgs || [])[k]; return `<label class="ap-img ${im ? 'has' : ''}" data-img="${i}:${k}">${im ? `<img src="${esc(im.url || im.ref)}" alt="">` : `${icon('image')}<small>${esc(t('ap.addImage'))}<br>${spec.rec[0]} × ${spec.rec[1]} px</small>`}<input type="file" accept="image/jpeg,image/png,image/webp" hidden></label>${im?.warn ? `<div class="kdp-warn">${esc(im.warn)}</div>` : ''}`; };
        return `<div class="ap-mod" data-i="${i}"><div class="ap-head"><b>${i + 1}. ${esc(t('ap.type.' + m.type))}</b>
          <span><button type="button" class="btn btn-ghost btn-sm" data-up="${i}" ${i ? '' : 'disabled'} aria-label="↑">↑</button><button type="button" class="btn btn-ghost btn-sm" data-down="${i}" ${i < modules.length - 1 ? '' : 'disabled'} aria-label="↓">↓</button><button type="button" class="btn btn-ghost btn-sm" data-rm="${i}">${esc(t('admin.delete'))}</button></span></div>
          ${m.type === 'banner' ? `${imgSlot(0)}<input class="input" data-f="title" maxlength="120" placeholder="${esc(t('ap.headline'))}" value="${esc(m.title || '')}">` : ''}
          ${m.type === 'header' ? `${imgSlot(0)}<input class="input" data-f="title" maxlength="120" placeholder="${esc(t('ap.title'))}" value="${esc(m.title || '')}"><textarea class="input" data-f="text" maxlength="2000" rows="4" placeholder="${esc(t('ap.text'))}">${esc(m.text || '')}</textarea>` : ''}
          ${m.type === 'image_text' ? `<div class="ap-it ${m.side === 'right' ? 'right' : ''}">${imgSlot(0)}<div class="ap-col"><input class="input" data-f="title" maxlength="120" placeholder="${esc(t('ap.title'))}" value="${esc(m.title || '')}"><textarea class="input" data-f="text" maxlength="1500" rows="5" placeholder="${esc(t('ap.text'))}">${esc(m.text || '')}</textarea>
            <label class="check"><input type="checkbox" data-side ${m.side === 'right' ? 'checked' : ''}> ${esc(t('ap.imageRight'))}</label></div></div>` : ''}
          ${m.type === 'three' ? `<div class="ap-three">${[0, 1, 2].map(k => `<div>${imgSlot(k)}<input class="input" data-cap="${k}" data-cf="title" maxlength="80" placeholder="${esc(t('ap.title'))}" value="${esc(m.caps?.[k]?.title || '')}"><textarea class="input" data-cap="${k}" data-cf="text" maxlength="400" rows="3" placeholder="${esc(t('ap.text'))}">${esc(m.caps?.[k]?.text || '')}</textarea></div>`).join('')}</div>` : ''}
          ${m.type === 'text' ? `<input class="input" data-f="title" maxlength="120" placeholder="${esc(t('ap.title'))}" value="${esc(m.title || '')}"><textarea class="input" data-f="text" maxlength="3000" rows="6" placeholder="${esc(t('ap.text'))}">${esc(m.text || '')}</textarea>` : ''}
        </div>`;
      }).join('')}
      ${modules.length < 7 ? `<div class="ap-add"><span class="muted">${esc(t('ap.addModule'))}</span>${Object.keys(APLUS).map(k => `<button type="button" class="btn btn-ghost btn-sm" data-add="${k}">+ ${esc(t('ap.type.' + k))}</button>`).join('')}</div>` : `<p class="muted">${esc(t('ap.max'))}</p>`}
      ${modules.length ? `<button type="button" class="btn btn-ghost btn-sm" data-preview-aplus>${icon('eye')} ${esc(t('ap.preview'))}</button>` : ''}`;
  };
  draw();
  root.addEventListener('input', e => {
    const mod = e.target.closest('.ap-mod'); if (!mod) return; const m = modules[+mod.dataset.i];
    if (e.target.dataset.f) m[e.target.dataset.f] = e.target.value;
    if (e.target.dataset.cap != null) { m.caps = m.caps || [{}, {}, {}]; m.caps[+e.target.dataset.cap] = { ...(m.caps[+e.target.dataset.cap] || {}), [e.target.dataset.cf]: e.target.value }; }
  });
  root.addEventListener('change', async e => {
    const mod = e.target.closest('.ap-mod'); if (!mod) return; const m = modules[+mod.dataset.i];
    if (e.target.matches('[data-side]')) { m.side = e.target.checked ? 'right' : 'left'; draw(); return; }
    if (e.target.type === 'file') {
      const file = e.target.files[0]; if (!file) return;
      const [mi, k] = e.target.closest('[data-img]').dataset.img.split(':').map(Number);
      const spec = APLUS[modules[mi].type], { w, h } = await imgSize(file);
      let warn = '';
      if (w < spec.min[0] || h < spec.min[1]) warn = t('ap.tooSmall', { w, h, mw: spec.min[0], mh: spec.min[1] });
      else if (Math.abs(w / h - spec.rec[0] / spec.rec[1]) > 0.15 * (spec.rec[0] / spec.rec[1])) warn = t('ap.ratio', { w, h, rw: spec.rec[0], rh: spec.rec[1] });
      const slot = e.target.closest('[data-img]'); slot.classList.add('busy');
      try {
        const light = await compressImage(file, { maxW: spec.rec[0] > 1000 ? 1600 : spec.rec[0], maxH: spec.rec[0] > 1000 ? 500 : spec.rec[1], name: 'aplus' });
        const up = await api.uploadAplusImage(getBookId(), light);
        m.imgs = m.imgs || []; m.imgs[k] = { ref: up.ref, url: up.url, w, h, warn };
      } catch (x) { toast(errText(x), { error: true }); }
      draw();
    }
  });
  root.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.add) { modules.push({ type: b.dataset.add, title: '', text: '', side: 'left', imgs: [], caps: [{}, {}, {}] }); draw(); }
    else if (b.dataset.rm != null) { modules.splice(+b.dataset.rm, 1); draw(); }
    else if (b.dataset.up != null) { const i = +b.dataset.up; [modules[i - 1], modules[i]] = [modules[i], modules[i - 1]]; draw(); }
    else if (b.dataset.down != null) { const i = +b.dataset.down; [modules[i + 1], modules[i]] = [modules[i], modules[i + 1]]; draw(); }
    else if (b.matches('[data-preview-aplus]')) modal(`<h2 style="margin-top:0">${esc(t('book.fromAuthor'))}</h2>${aplusHTML(modules)}`, {});
  });
  return () => modules.map(m => ({ type: m.type, title: m.title || '', text: m.text || '', side: m.side || 'left',
    imgs: (m.imgs || []).map(im => im ? { ref: im.ref, w: im.w, h: im.h } : null), caps: m.type === 'three' ? (m.caps || []).slice(0, 3).map(c => ({ title: c?.title || '', text: c?.text || '' })) : undefined }));
}

// ---------------------------------------------------------------- publish an eBook (3 steps, like KDP)
const ROLES = ['author', 'illustrator', 'translator', 'editor', 'foreword', 'photographer'];
async function bookForm(body, b, startStep = 1) {
  const allBooks = (await api.adminBooks().catch(() => [])).filter(x => x.status === 'published' && !x.deleted_at && x.price_cents > 0 && x.id !== b?.id);
  const recOpts = sel => allBooks.sort((x, y) => (y.language === (b?.language || getLang())) - (x.language === (b?.language || getLang()))).map(x => `<option value="${esc(x.id)}" ${sel === x.id ? 'selected' : ''}>${esc(x.title)} · ${esc((x.language || '').toUpperCase())}</option>`).join('');
  const v = b ? { ...b } : { language: getLang(), status: 'draft', price_cents: null, category: 'fiction', categories: [], contributors: [], keywords: [], rights: 'own', adult: false, published_at: new Date().toISOString().slice(0, 10) };
  // unsaved changes kept on this device (survive a reload, a closed tab or a lost connection)
  const DKEY = id => 'librava:bookdraft:' + (id || 'new');
  let restored = false;
  try {
    const snap = JSON.parse(localStorage.getItem(DKEY(b?.id)) || 'null');
    if (snap?.data && (!b || !b.updated_at || snap.at > Date.parse(b.updated_at))) {
      const { status, id, ...rest } = snap.data; Object.assign(v, rest); restored = true;
    }
  } catch { }
  let bookId = v.id || null;
  const draftId = bookId || crypto.randomUUID(); // new books: images uploaded before the first save go in the book's own folder
  const hasAplus = !!api.uploadAplusImage;
  const STEPS = hasAplus ? [1, 2, 3, 4] : [1, 2, 4];
  const TABK = { 1: 'kdp.tab1', 2: 'kdp.tab2', 3: 'kdp.tabAplus', 4: 'kdp.tab3' };
  let step = STEPS.includes(startStep) ? startStep : 1;
  let fileCheck = v.file_check || null;
  const aplusModules = JSON.parse(JSON.stringify(v.aplus || [])).map((m, i) => ({ ...m, imgs: (m.imgs || []).map((im, k) => im && { ...im, url: (b?.aplus?.[i]?.imgs?.[k]?.url) || im.ref }) }));
  const files = { cover: null, file: null, sample: null };
  let lastFile = null;
  const eur = c => c ? (c / 100).toFixed(2) : '';
  const [first0, ...rest0] = String(v.author || '').trim().split(/\s+/);
  const kws = [...(v.keywords || []), '', '', '', '', '', '', ''].slice(0, 7);
  const secCats = (v.categories || []).filter(c => c !== v.category);
  const contribRow = (c = {}) => `<div class="contrib-row"><select class="c-role input" aria-label="${esc(t('kdp.role'))}">${ROLES.map(r => `<option value="${r}" ${c.role === r ? 'selected' : ''}>${esc(t('kdp.role.' + r))}</option>`).join('')}</select>
    <input class="c-name input" maxlength="120" placeholder="${esc(t('kdp.fullName'))}" value="${esc(c.name || '')}"><button type="button" class="btn btn-ghost btn-sm" data-rm-contrib aria-label="${esc(t('admin.delete'))}">✕</button></div>`;

  body.innerHTML = `<form id="bk-form" class="kdp" novalidate>
    <div class="kdp-top"><div><span class="muted">${esc(b ? t('kdp.editing') : t('kdp.newEbook'))}</span><h2 id="kdp-title">${esc(v.title || t('kdp.untitled'))}</h2></div>
      <span class="status ${v.status === 'published' ? 'live' : 'draft'}" id="kdp-status">${esc(v.status === 'published' ? t('kdp.live') : t('kdp.draft'))}</span></div>
    <nav class="kdp-tabs ${hasAplus ? 'four' : ''}" role="tablist">${STEPS.map(n => `<button type="button" role="tab" class="kdp-tab" data-step="${n}"><b>${esc(t(TABK[n]))}</b><span class="kdp-state" id="st-${n}"></span></button>`).join('')}</nav>

    <section class="kdp-step" data-pane="1">
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('admin.f.language'))}</h3><p>${esc(t('kdp.langHelp'))}</p></div>
        <div class="kdp-fields"><select id="f-language" class="input">${LANGS.map(([l, native]) => `<option value="${l}" ${v.language === l ? 'selected' : ''}>${esc(langName(l))} · ${esc(native)}</option>`).join('')}</select></div></div>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('kdp.bookTitle'))}</h3><p>${esc(t('kdp.titleHelp'))}</p></div>
        <div class="kdp-fields"><label class="field"><span>${esc(t('admin.f.title'))} *</span><input id="f-title" maxlength="200" value="${esc(v.title || '')}"></label>
          <label class="field"><span>${esc(t('admin.f.subtitle'))} (${esc(t('kdp.optional'))})</span><input id="f-subtitle" maxlength="200" value="${esc(v.subtitle || '')}"></label></div></div>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('kdp.series'))}</h3><p>${esc(t('kdp.seriesHelp'))}</p></div>
        <div class="kdp-fields two"><label class="field"><span>${esc(t('kdp.seriesName'))}</span><input id="f-series" maxlength="160" value="${esc(v.series_name || '')}"></label>
          <label class="field"><span>${esc(t('kdp.seriesNumber'))}</span><input id="f-seriesn" type="number" min="1" inputmode="numeric" value="${v.series_number || ''}"></label></div></div>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('kdp.edition'))}</h3><p>${esc(t('kdp.editionHelp'))}</p></div>
        <div class="kdp-fields"><label class="field" style="max-width:180px"><span>${esc(t('kdp.editionNumber'))} (${esc(t('kdp.optional'))})</span><input id="f-edition" type="number" min="1" inputmode="numeric" value="${v.edition || ''}"></label></div></div>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('admin.f.author'))}</h3><p>${esc(t('kdp.authorHelp'))}</p></div>
        <div class="kdp-fields two"><label class="field"><span>${esc(t('kdp.firstName'))} *</span><input id="f-first" maxlength="60" autocomplete="off" value="${esc(first0 || '')}"></label>
          <label class="field"><span>${esc(t('kdp.lastName'))}</span><input id="f-last" maxlength="60" autocomplete="off" value="${esc(rest0.join(' '))}"></label></div></div>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('kdp.contributors'))}</h3><p>${esc(t('kdp.contributorsHelp'))}</p></div>
        <div class="kdp-fields"><div id="contribs">${(v.contributors || []).map(contribRow).join('')}</div><button type="button" class="btn btn-ghost btn-sm" id="add-contrib">+ ${esc(t('kdp.addContributor'))}</button></div></div>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('admin.f.description'))}</h3><p>${esc(t('admin.f.descriptionHelp'))}</p></div>
        <div class="kdp-fields"><div class="desc-ed">
          <div class="desc-bar" role="toolbar"><div class="desc-tools">${[['b', '<b>B</b>'], ['i', '<i>I</i>'], ['u', '<u>U</u>'], ['h4', 'H'], ['ul', '• ' + esc(t('kdp.list'))], ['p', '¶']].map(([k, l]) => `<button type="button" class="btn btn-ghost btn-sm" data-wrap="${k}" title="${esc(t('kdp.fmt.' + k))}">${l}</button>`).join('')}</div>
            <div class="seg"><button type="button" class="on" data-dmode="code">${esc(t('kdp.descCode'))}</button><button type="button" data-dmode="view">${esc(t('kdp.descView'))}</button></div></div>
          <textarea id="f-description" class="input" maxlength="4000" rows="10" spellcheck="true">${esc(v.description || '')}</textarea>
          <div class="desc rich desc-view" id="desc-view" hidden></div></div>
          <small class="muted"><span id="desc-count"></span> · ${esc(t('kdp.descTags'))}</small></div></div>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('kdp.rights'))}</h3><p>${esc(t('kdp.rightsHelp'))}</p></div>
        <div class="kdp-fields radios"><label class="check"><input type="radio" name="rights" value="own" ${v.rights !== 'public' ? 'checked' : ''}> ${esc(t('kdp.rightsOwn'))}</label>
          <label class="check"><input type="radio" name="rights" value="public" ${v.rights === 'public' ? 'checked' : ''}> ${esc(t('kdp.rightsPublic'))}</label></div></div>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('kdp.audience'))}</h3><p>${esc(t('kdp.audienceHelp'))}</p></div>
        <div class="kdp-fields"><div class="radios"><span class="muted" style="font-size:14px">${esc(t('kdp.adultQ'))}</span>
          <label class="check"><input type="radio" name="adult" value="no" ${!v.adult ? 'checked' : ''}> ${esc(t('kdp.no'))}</label><label class="check"><input type="radio" name="adult" value="yes" ${v.adult ? 'checked' : ''}> ${esc(t('kdp.yes'))}</label></div>
          <div class="two" style="margin-top:10px"><label class="field"><span>${esc(t('kdp.ageMin'))} (${esc(t('kdp.optional'))})</span><select id="f-agemin"><option value="">—</option>${Array.from({ length: 19 }, (_, i) => `<option ${v.age_min === i ? 'selected' : ''}>${i}</option>`).join('')}</select></label>
          <label class="field"><span>${esc(t('kdp.ageMax'))} (${esc(t('kdp.optional'))})</span><select id="f-agemax"><option value="">—</option>${Array.from({ length: 19 }, (_, i) => `<option ${v.age_max === i ? 'selected' : ''}>${i}</option>`).join('')}<option value="99" ${v.age_max === 99 ? 'selected' : ''}>18+</option></select></label></div></div></div>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('kdp.categories'))}</h3><p>${esc(t('kdp.categoriesHelp'))}</p></div>
        <div class="kdp-fields"><label class="field"><span>${esc(t('kdp.primaryCat'))} *</span><select id="f-category">${CATS.map(c => `<option value="${c}" ${v.category === c ? 'selected' : ''}>${esc(t('cat.' + c))}</option>`).join('')}</select></label>
          <span class="muted" style="font-size:14px;margin-top:6px">${esc(t('kdp.moreCats'))}</span><div class="cat-checks" id="cat-checks">${CATS.map(c => `<label class="check"><input type="checkbox" value="${c}" ${secCats.includes(c) ? 'checked' : ''}> ${esc(t('cat.' + c))}</label>`).join('')}</div></div></div>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('admin.f.keywords'))}</h3><p>${esc(t('kdp.keywordsHelp'))}</p></div>
        <div class="kdp-fields kw-grid">${kws.map((k, i) => `<input class="kw input" maxlength="50" aria-label="${esc(t('admin.f.keywords'))} ${i + 1}" placeholder="${i + 1}" value="${esc(k)}">`).join('')}</div></div>
    </section>

    <section class="kdp-step" data-pane="2" hidden>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('bt.title'))}</h3><p>${esc(t('bt.help'))}</p></div>
        <div class="kdp-fields">
          <span class="muted" style="font-size:14px">${esc(t('bt.colorQ'))}</span>
          <div class="radios"><label class="check"><input type="radio" name="bcolor" value="color" ${v.color !== 'bw' ? 'checked' : ''}> ${esc(t('book.color.color'))}</label><label class="check"><input type="radio" name="bcolor" value="bw" ${v.color === 'bw' ? 'checked' : ''}> ${esc(t('book.color.bw'))}</label></div>
          <div class="bt-cards">
            <div class="bt-card"><b>PDF · ${esc(t('book.layout.fixed'))}</b><p>${esc(t('bt.pdfFor'))}</p>
              <ul><li>${esc(t('bt.pdf1'))}</li><li>${esc(t('bt.pdf2'))}</li><li>${esc(t('bt.pdf3'))}</li><li>${esc(t('bt.pdf4'))}</li></ul>
              <small>${esc(t('bt.pdfDev'))}</small></div>
            <div class="bt-card"><b>EPUB · ${esc(t('book.layout.reflow'))}</b><p>${esc(t('bt.epubFor'))}</p>
              <ul><li>${esc(t('bt.epub1'))}</li><li>${esc(t('bt.epub2'))}</li><li>${esc(t('bt.epub3'))}</li><li>${esc(t('bt.epub4'))}</li></ul>
              <small>${esc(t('bt.epubDev'))}</small></div>
          </div>
          <details class="bt-sizes"><summary>${esc(t('bt.sizesTitle'))}</summary>
            <table><thead><tr><th>${esc(t('bt.sizeUse'))}</th><th>${esc(t('book.d.pageSize'))}</th></tr></thead><tbody>
              ${[['bt.u.novel', '5 × 8 in · 12,7 × 20,3 cm'], ['bt.u.general', '6 × 9 in · 15,2 × 22,9 cm'], ['bt.u.a5', 'A5 · 14,8 × 21 cm'], ['bt.u.manual', '7 × 10 in · 17,8 × 25,4 cm'], ['bt.u.big', '8,5 × 11 in · 21,6 × 27,9 cm'], ['bt.u.a4', 'A4 · 21 × 29,7 cm']].map(([k, sz]) => `<tr><td>${esc(t(k))}</td><td>${sz}</td></tr>`).join('')}
            </tbody></table><small class="muted">${esc(t('bt.sizesNote'))}</small></details>
        </div></div>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('kdp.manuscript'))}</h3><p>${esc(t('admin.f.fileHelp'))}</p></div>
        <div class="kdp-fields"><div class="fmt-files">${['pdf', 'epub'].map(f => `<div class="fmt-file" data-slot="${f}">
            <div class="fp-head"><span class="fp-chip fmt-${f}">${esc(t('book.formatShort.' + f))}</span><b>${esc(t('upl.fileFor', { fmt: t('book.formatShort.' + f) }))}</b></div>
            <label class="drop" data-slot-drop="${f}">${icon('file')}<span><span class="fname" data-slot-name="${f}"></span><br><small>${esc(t('upl.only', { fmt: t('book.formatShort.' + f) }))} · max 500 MB</small></span><input type="file" data-slot-input="${f}" accept="${f === 'epub' ? '.epub,application/epub+zip' : '.pdf,application/pdf'}"></label>
            <div class="kdp-ok" data-slot-ok="${f}" hidden></div>
            <button type="button" class="btn btn-ghost btn-sm" data-slot-rm="${f}" hidden>${esc(t('ed2.remove'))}</button></div>`).join('')}</div>
          <p class="muted fmt-files-note">${esc(t('upl.note'))}</p>
          <div hidden><span id="n-file"></span><div id="file-ok"></div><input type="file" id="f-file"></div>
          <div class="fcheck" id="fcheck" ${fileCheck ? '' : 'hidden'}></div><div id="devprev"></div>
          <button type="button" class="btn btn-dark" data-open-preview ${v.file_path || v.file_name ? '' : 'hidden'}>${icon('eye')} ${esc(t('pv.open'))}</button>
          <p class="kdp-note">${icon('shield')} ${esc(t('kdp.drm'))}</p>
          <label class="check"><input type="checkbox" id="f-dl" ${v.allow_download !== false ? 'checked' : ''}> ${esc(t('kdp.allowDownload'))}</label>
          <label class="check" style="margin-left:26px"><input type="checkbox" id="f-stamp" ${v.stamp_downloads !== false ? 'checked' : ''}> ${esc(t('kdp.stampDownload'))}</label></div></div>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('admin.f.cover'))}</h3><p>${esc(t('kdp.coverHelp'))}</p></div>
        <div class="kdp-fields"><div class="cover-up"><div class="cover-box">${v.cover_url ? `<img id="cov-prev" alt="" src="${esc(v.cover_url)}">` : `<img id="cov-prev" alt="" hidden><span id="cov-empty">${icon('image')}</span>`}</div>
          <div style="flex:1;min-width:220px"><label class="drop" data-drop="cover">${icon('image')}<span><span class="fname" id="n-cover">${esc(t('kdp.uploadCover'))}</span><br><small>${esc(t('admin.f.coverHelp'))}</small></span><input type="file" id="f-cover" accept="image/jpeg,image/png,image/webp"></label>
          <div class="kdp-warn" id="cov-warn" hidden></div></div></div></div></div>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('admin.f.sample'))}</h3><p>${esc(t('admin.f.sampleHelp'))}</p></div>
        <div class="kdp-fields"><label class="drop" data-drop="sample">${icon('eye')}<span><span class="fname" id="n-sample">${v.sample_path ? '✓ ' + esc(t('kdp.sampleKept')) : 'EPUB / PDF'}</span><br><small>${esc(t('kdp.sampleTip'))}</small></span><input type="file" id="f-sample" accept=".epub,.pdf,application/epub+zip,application/pdf"></label>
          <div class="kdp-ok" id="sample-ok" ${v.sample_path ? '' : 'hidden'}>✓ ${esc(t('kdp.sampleReady'))}</div>
          <div class="sample-pages"><label class="field"><span>${esc(t('kdp.samplePages'))}</span><input id="f-samplepages" type="number" min="1" max="200" inputmode="numeric" value="${v.sample_pages || SAMPLE_PAGES}"></label>
          <button type="button" class="btn btn-ghost btn-sm" id="b-mksample" ${(v.file_path || v.file_name) ? '' : 'hidden'}>${icon('eye')} ${esc(t('kdp.makeSample'))}</button></div>
          <small class="muted">${esc(t('kdp.samplePagesHelp'))}</small></div></div>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('kdp.details'))}</h3><p>${esc(t('kdp.detailsHelp'))}</p></div>
        <div class="kdp-fields two"><label class="field"><span>${esc(t('admin.f.pages'))}</span><input id="f-pages" type="number" min="1" inputmode="numeric" value="${v.pages || ''}"><small>${esc(t('admin.f.pagesHelp'))}</small></label>
          <label class="field"><span>ISBN (${esc(t('kdp.optional'))})</span><input id="f-isbn" maxlength="20" inputmode="numeric" value="${esc(v.isbn || '')}"><small>${esc(t('kdp.isbnHelp'))}</small></label>
          <div class="field" style="grid-column:1/-1"><span>${esc(t('kdp.lid'))} (${esc(t('kdp.optional'))})</span>
            <div class="lid-row"><input id="f-lid" class="input" readonly placeholder="—" value="${esc(v.librava_id || '')}"><button type="button" class="btn btn-ghost btn-sm" id="b-lid">${esc(v.librava_id ? t('kdp.lidNew') : t('kdp.lidMake'))}</button><button type="button" class="btn btn-ghost btn-sm" id="b-lid-rm" ${v.librava_id ? '' : 'hidden'}>${esc(t('admin.delete'))}</button></div>
            <small>${esc(t('kdp.lidHelp'))}</small></div></div></div>
    </section>

    <section class="kdp-step" data-pane="3" hidden>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('ap.heading'))}</h3><p>${esc(t('ap.help'))}</p>
        <ul class="ap-specs"><li>${esc(t('ap.type.banner'))}: 1940 × 600 px</li><li>${esc(t('ap.type.header'))}: 970 × 600 px</li><li>${esc(t('ap.type.image_text'))}: 600 × 600 px</li><li>${esc(t('ap.type.three'))}: 3 × 600 × 600 px</li></ul></div>
        <div class="kdp-fields" id="aplus-root"></div></div>
    </section>

    <section class="kdp-step" data-pane="4" hidden>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('kdp.pricing'))}</h3><p>${esc(t('kdp.pricingHelp'))}</p></div>
        <div class="kdp-fields"><div class="radios"><label class="check"><input type="radio" name="ptype" value="paid" ${v.price_cents !== 0 ? 'checked' : ''}> ${esc(t('kdp.paid'))}</label><label class="check"><input type="radio" name="ptype" value="free" ${v.price_cents === 0 ? 'checked' : ''}> ${esc(t('kdp.free'))}</label></div>
          <div class="price-table" id="price-box"><div class="fmt-prices">
            <div class="fmt-price"><div class="fp-head"><span class="fp-chip" id="fp1-fmt"></span><b id="fp1-title"></b></div>
              <div class="two"><label class="field"><span>${esc(t('kdp.listPriceEur'))} *</span><input id="f-price" type="text" inputmode="decimal" autocomplete="off" placeholder="3,99" value="${eur(v.price_cents).replace('.', ',')}"></label>
              <label class="field"><span>${esc(t('admin.f.listPrice'))}</span><input id="f-list" type="text" inputmode="decimal" autocomplete="off" value="${eur(v.list_price_cents).replace('.', ',')}"><small>${esc(t('admin.f.listPriceHelp'))}</small></label></div>
              <table class="royalty"><tbody><tr><td>${esc(t('kdp.buyerPays'))}</td><td id="r-price">—</td></tr><tr><td>${esc(t('kdp.stripeFee'))}</td><td id="r-fee">—</td></tr><tr class="tot"><td>${esc(t('kdp.youGet'))}</td><td id="r-net">—</td></tr></tbody></table></div>
            <div class="fmt-price" id="price2-box" hidden><div class="fp-head"><span class="fp-chip" id="fp2-fmt"></span><b id="fp2-title"></b></div>
              <div class="two"><label class="field"><span id="price2-label">${esc(t('kdp.listPriceEur'))} *</span><input id="f-price2" type="text" inputmode="decimal" autocomplete="off" placeholder="3,99"></label>
              <label class="field"><span id="list2-label">${esc(t('admin.f.listPrice'))}</span><input id="f-list2" type="text" inputmode="decimal" autocomplete="off"><small>${esc(t('admin.f.listPriceHelp'))}</small></label></div>
              <table class="royalty"><tbody><tr><td>${esc(t('kdp.buyerPays'))}</td><td id="r2-price">—</td></tr><tr><td>${esc(t('kdp.stripeFee'))}</td><td id="r2-fee">—</td></tr><tr class="tot"><td>${esc(t('kdp.youGet'))}</td><td id="r2-net">—</td></tr></tbody></table></div>
          </div>
            <small class="muted">${esc(t('kdp.feeNote'))}</small></div></div></div>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('fbt.adminTitle'))}</h3><p>${esc(t('fbt.adminHelp'))}</p></div>
        <div class="kdp-fields two">${[0, 1].map(i => `<label class="field"><span>${esc(t('fbt.adminPick', { n: i + 1 }))}</span><select class="f-rec"><option value="">${esc(t('fbt.auto'))}</option>${recOpts((v.recommend_ids || [])[i])}</select></label>`).join('')}</div></div>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('kdp.release'))}</h3><p>${esc(t('kdp.releaseHelp'))}</p></div>
        <div class="kdp-fields"><label class="field" style="max-width:220px"><span>${esc(t('admin.f.published'))}</span><input id="f-date" type="date" value="${esc(String(v.published_at || '').slice(0, 10))}"></label>
          <label class="check"><input type="checkbox" id="f-featured" ${v.is_featured ? 'checked' : ''}> ${esc(t('admin.f.featured'))}</label></div></div>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('kdp.checklist'))}</h3><p>${esc(t('kdp.checklistHelp'))}</p></div>
        <div class="kdp-fields"><ul class="checklist" id="checklist"></ul>
          <button type="button" class="btn btn-ghost" data-open-preview ${v.file_path || v.file_name ? '' : 'hidden'}>${icon('eye')} ${esc(t('pv.open'))}</button></div></div>
    </section>

    <div class="error" id="f-err" hidden></div>
    <div class="kdp-bar"><button type="button" class="btn btn-ghost" id="b-back">← ${esc(t('kdp.back'))}</button>
      <span class="spacer"></span><button type="button" class="btn btn-ghost" id="b-draft">${esc(t('kdp.saveDraft'))}</button>
      <button type="button" class="btn btn-buy" id="b-next"></button></div>
  </form>`;
  $$('.drop .ico', body).forEach(i => { i.style.flex = 'none'; });

  const val = id => ($('#' + id, body)?.value || '').trim();
  const radio = n => body.querySelector(`input[name="${n}"]:checked`)?.value;
  const cents = s => { const n = parseFloat(String(s).replace(/[^\d,.]/g, '').replace(',', '.')); return isFinite(n) && n > 0 ? Math.round(n * 100) : 0; };
  const authorName = () => [val('f-first'), val('f-last')].filter(Boolean).join(' ');
  const has = { file: !!(v.file_path || v.file_name), cover: !!v.cover_url, sample: !!v.sample_path };
  let ownSample = false;
  const autoSample = async (src) => {
    const ok = $('#sample-ok', body), btn = $('#b-mksample', body);
    ok.hidden = false; ok.textContent = t('kdp.sampleMaking');
    try {
      const r = await makeSample(src, parseInt(val('f-samplepages')) || SAMPLE_PAGES);
      files.sample = r.file; has.sample = true;
      ok.textContent = '✓ ' + t('kdp.sampleAutoPdf', { n: r.pages });
      $('#n-sample', body).textContent = r.file.name + ' · ' + (r.file.size / 1048576).toFixed(1) + ' MB';
      ownSample = false;
    } catch (e) { console.warn(e); ok.textContent = '⚠ ' + t('kdp.sampleFail'); }
    refresh();
  };

  const fmtOf = f => t('book.formatShort.' + (/\.epub$/i.test(f.name) ? 'epub' : 'pdf'));
  let sib = null;   // the other format of this book (EPUB ↔ PDF), once there is one
  // what both formats of a book share (each keeps its own file, pages, preview, ISBN and price)
  const SHARED = ['title', 'subtitle', 'author', 'contributors', 'description', 'language', 'category', 'categories', 'series_name', 'series_number', 'edition',
    'rights', 'adult', 'age_min', 'age_max', 'keywords', 'color', 'published_at', 'is_featured', 'recommend_ids', 'allow_download', 'stamp_downloads'];
  const fmtFile = f => /\.epub$/i.test(f.name) ? 'epub' : 'pdf';
  const mainFmt = () => files.file ? fmtFile(files.file) : lastFile ? fmtFile(lastFile) : (v.file_path || v.file_name ? v.format : null);
  // ---- what each step still needs (shown on the tabs and in the final checklist)
  const checks = () => {
    const free = radio('ptype') === 'free', price = cents(val('f-price'));
    return [
      { step: 1, ok: !!val('f-title'), label: t('kdp.ck.title') },
      { step: 1, ok: !!val('f-first'), label: t('kdp.ck.author') },
      { step: 1, ok: plainText(val('f-description')).trim().length >= 30, label: t('kdp.ck.description') },
      { step: 2, ok: has.file || !!files.file, label: t('kdp.ck.manuscript') },
      { step: 2, ok: has.cover || !!files.cover, label: t('kdp.ck.cover') },
      { step: 2, ok: !(fileCheck?.items || []).some(x => x.level === 'error'), label: t('kdp.ck.fileOk') },
      { step: 2, ok: has.sample || !!files.sample, label: t('kdp.ck.sample') },
      { step: 4, ok: free || price >= 49, label: t('kdp.ck.price') },
      ...(files.file2 || sib ? [{ step: 4, ok: free || cents(val('f-price2')) >= 49, label: t('ed2.ckPrice', { fmt: files.file2 ? fmtOf(files.file2) : t('book.formatShort.' + sib.format) }) }] : []),
    ];
  };
  const refresh = () => {
    const c = checks();
    for (const n of STEPS) {
      const mine = c.filter(x => x.step === n), done = mine.filter(x => x.ok).length;
      const el = $('#st-' + n, body);
      if (n === 3) { const k = aplusModules.length; el.className = 'kdp-state ' + (k ? 'done' : 'none'); el.textContent = k ? t('ap.modules', { n: k }) : t('kdp.optionalTab'); continue; }
      el.className = 'kdp-state ' + (done === mine.length ? 'done' : done ? 'part' : 'none');
      el.textContent = done === mine.length ? '✓ ' + t('kdp.complete') : done ? t('kdp.inProgress') : t('kdp.notStarted');
    }
    $('#checklist', body).innerHTML = c.map(x => `<li class="${x.ok ? 'ok' : ''}"><span>${x.ok ? '✓' : '○'}</span>${esc(x.label)}${x.ok ? '' : ` <a href="#" data-goto="${x.step}">${esc(t('kdp.fix'))}</a>`}</li>`).join('');
    $$('[data-goto]', body).forEach(a => a.onclick = e => { e.preventDefault(); show(+a.dataset.goto); });
    $('#desc-count', body).textContent = t('kdp.chars', { n: val('f-description').length, max: 4000 });
    $('#kdp-title', body).textContent = val('f-title') || t('kdp.untitled');
    const free = radio('ptype') === 'free';
    $('#price-box', body).hidden = free;
    // what the buyer pays, the Stripe fee and what is left — for each format
    const royalty = (k, p) => { const fee = p ? Math.round(p * 0.015 + 25) : 0;
      $(`#${k}-price`, body).textContent = p ? money(p, CONFIG.currency) : '—';
      $(`#${k}-fee`, body).textContent = p ? '− ' + money(fee, CONFIG.currency) : '—';
      $(`#${k}-net`, body).textContent = p ? money(Math.max(p - fee, 0), CONFIG.currency) : '—'; };
    royalty('r', cents(val('f-price'))); royalty('r2', cents(val('f-price2')));
    const f1 = mainFmt(), two = !$('#price2-box', body).hidden;
    // always PDF on the left and EPUB on the right, like the upload boxes
    const boxes = $$('#price-box .fmt-price', body); if (boxes[0]) { boxes[0].style.order = f1 === 'epub' ? 2 : 1; boxes[1].style.order = f1 === 'epub' ? 1 : 2; }
    $('#fp1-fmt', body).textContent = f1 ? t('book.formatShort.' + f1) : 'eBook'; $('#fp1-fmt', body).hidden = !f1 && !two;
    $('#fp1-fmt', body).className = 'fp-chip fmt-' + (f1 || ''); $('#fp2-fmt', body).className = 'fp-chip fmt-' + (f1 === 'epub' ? 'pdf' : 'epub');
    $('#fp1-title', body).textContent = two && f1 ? t('ed2.priceFor', { fmt: t('book.formatShort.' + f1) }) : t('kdp.pricing');
  };
  const show = n => {
    step = n;
    $$('.kdp-step', body).forEach(s => s.hidden = +s.dataset.pane !== n);
    $$('.kdp-tab', body).forEach(tb => { tb.classList.toggle('on', +tb.dataset.step === n); tb.setAttribute('aria-selected', +tb.dataset.step === n); });
    $('#b-back', body).style.visibility = n === STEPS[0] ? 'hidden' : 'visible';
    $('#b-next', body).textContent = n < 4 ? t('kdp.saveContinue') + ' →' : t('kdp.publish');
    $('#f-err', body).hidden = true;
    refresh();
    body.querySelector('.kdp-tabs').scrollIntoView({ block: 'nearest' });
  };
  $$('.kdp-tab', body).forEach(tb => tb.onclick = () => show(+tb.dataset.step));
  // description: HTML code like on KDP, with a button that shows how it will look
  const ta = $('#f-description', body), dv = $('#desc-view', body);
  const setMode = m => {
    $$('[data-dmode]', body).forEach(x => x.classList.toggle('on', x.dataset.dmode === m));
    if (m === 'view') { dv.innerHTML = safeHTML(ta.value) || `<p class="muted">${esc(t('kdp.descEmpty'))}</p>`; dv.style.minHeight = ta.offsetHeight + 'px'; }
    ta.hidden = m === 'view'; dv.hidden = m !== 'view'; $('.desc-tools', body).style.visibility = m === 'view' ? 'hidden' : 'visible';
  };
  $$('[data-dmode]', body).forEach(x => x.onclick = () => setMode(x.dataset.dmode));
  $$('[data-wrap]', body).forEach(x => x.onclick = () => {
    const k = x.dataset.wrap, a = ta.selectionStart, z = ta.selectionEnd, sel = ta.value.slice(a, z) || t('kdp.fmt.' + k);
    const ins = k === 'ul' ? '<ul>\n' + sel.split('\n').map(l => '<li>' + l + '</li>').join('\n') + '\n</ul>' : `<${k}>${sel}</${k}>`;
    ta.setRangeText(ins, a, z, 'end'); ta.focus(); refresh();
  });
  body.addEventListener('input', refresh);
  body.addEventListener('change', refresh);

  // contributors
  $('#add-contrib', body).onclick = () => { if ($$('.contrib-row', body).length < 9) $('#contribs', body).insertAdjacentHTML('beforeend', contribRow()); };
  $('#contribs', body).addEventListener('click', e => { if (e.target.closest('[data-rm-contrib]')) e.target.closest('.contrib-row').remove(); });
  // at most 2 extra categories, like KDP's 3 categories in total
  $('#cat-checks', body).addEventListener('change', e => {
    const on = $$('#cat-checks input:checked', body);
    if (on.length > 2) { e.target.checked = false; toast(t('kdp.max3cats'), { error: true }); }
  });

  // files
  const pick = async (kind, file) => {
    if (!file) return;
    if (kind === 'file2') {
      if (!/\.(epub|pdf)$/i.test(file.name)) { toast(t('admin.badFile'), { error: true }); return; }
      const main = mainFmt();
      if (main && fmtOf(file) === t('book.formatShort.' + main)) { toast(t('ed2.same'), { error: true }); return; }
      files.file2 = file; edition2UI(); refresh(); keep(); return;
    }
    if (kind !== 'cover' && !/\.(epub|pdf)$/i.test(file.name)) { toast(t('admin.badFile'), { error: true }); return; }
    // a linked edition only takes its own format (drag & drop skips the file picker's filter)
    if (kind === 'file' && v.work_id && !new RegExp('\\.' + v.format + '$', 'i').test(file.name)) { toast(t('ed.only', { fmt: t('book.formatShort.' + v.format) }), { error: true }); return; }
    if (kind === 'cover' && !/\.(jpe?g|png|webp)$/i.test(file.name)) { toast(t('admin.badFile'), { error: true }); return; }
    if (kind === 'cover') {
      const dim = await new Promise(res => { const im = new Image(); im.onload = () => res([im.naturalWidth, im.naturalHeight]); im.onerror = () => res([0, 0]); im.src = URL.createObjectURL(file); });
      if (dim[0] < 625 || dim[1] < 1000) { toast(t('kdp.coverTooSmall', { w: dim[0], h: dim[1] }), { error: true }); return; }
      const original = file;
      file = await compressImage(original, { maxW: 1200, maxH: 1920, name: 'cover' });
      file._original = original;
    }
    files[kind] = file;
    if (kind === 'file') lastFile = file; // kept for the preview even after the upload clears files.file
    $('#n-' + kind, body).textContent = file.optimized
      ? t('img.optimized', { from: kb(file.optimized.from), to: kb(file.optimized.to), w: file.optimized.w, h: file.optimized.h })
      : `${file.name} · ${(file.size / 1048576).toFixed(1)} MB`;
    if (kind === 'file') $('#file-ok', body).hidden = false;
    if (kind === 'cover') {
      const img = $('#cov-prev', body), url = URL.createObjectURL(file);
      img.src = url; img.hidden = false; $('#cov-empty', body)?.remove();
      const probe = new Image();
      probe.onload = () => {
        const w = probe.naturalWidth, h = probe.naturalHeight, warn = $('#cov-warn', body), msgs = [];
        if (w < 1600 || h < 2560) msgs.push(t('kdp.coverSmall', { w, h }));
        const r = h / w; if (r < 1.55 || r > 1.65) msgs.push(t('kdp.coverRatio', { w, h, r: r.toFixed(2).replace('.', ',') }));
        warn.innerHTML = msgs.map(esc).join('<br>'); warn.hidden = !msgs.length;
      };
      probe.src = URL.createObjectURL(file._original || file);
    }
    if (kind === 'file') {
      $$('[data-open-preview]', body).forEach(x => x.hidden = false);
      const box = $('#fcheck', body); box.hidden = false; box.innerHTML = `<div class="spinner"></div> ${esc(t('fc.checking'))}`;
      $('#devprev', body).innerHTML = '';
      fileCheck = await analyzeManuscript(file, val('f-language'));
      drawCheck();
      if (fileCheck.meta.pages) $('#f-pages', body).value = fileCheck.meta.pages;
      if (fileCheck.meta.doc) { try { await devicePreview($('#devprev', body), fileCheck.meta.doc); } catch { } }
      if (!ownSample && !fileCheck.items.some(x => x.level === 'error')) await autoSample(file);
    }
    if (kind === 'sample') { ownSample = true; has.sample = true; $('#sample-ok', body).hidden = false; $('#sample-ok', body).textContent = '✓ ' + t('kdp.sampleOwn'); $('#b-mksample', body).hidden = true; }
    refresh();
  };
  for (const kind of ['cover', 'sample']) {   // the book files have their own PDF / EPUB boxes (below)
    if (!$('#f-' + kind, body)) continue;
    $('#f-' + kind, body).onchange = e => pick(kind, e.target.files[0]);
    const d = $(`[data-drop="${kind}"]`, body);
    d.addEventListener('dragover', e => { e.preventDefault(); d.classList.add('over'); });
    d.addEventListener('dragleave', () => d.classList.remove('over'));
    d.addEventListener('drop', e => { e.preventDefault(); d.classList.remove('over'); pick(kind, e.dataTransfer.files[0]); });
  }

  // the second format chosen on "Content": shows its name here and its own price on "Pricing"
  function edition2UI() {
    const f = files.file2, ok = $('#file2-ok', body);
    if (ok) {
      ok.hidden = !f; $('#b-file2-rm', body).hidden = !f;
      $('#n-file2', body).textContent = f ? `${f.name} · ${(f.size / 1048576).toFixed(1)} MB` : t('ed2.upload');
      if (f) ok.textContent = '✓ ' + t('ed2.ready', { fmt: fmtOf(f) });
    }
    // the other format's own price, here on "Pricing" — for a file just chosen or a format already linked
    const fmt = f ? fmtOf(f) : sib ? t('book.formatShort.' + sib.format) : null, box = $('#price2-box', body);
    if (!box) return;
    box.hidden = !fmt;
    if (fmt) {
      $('#fp2-fmt', body).textContent = fmt; $('#fp2-title', body).textContent = t('ed2.priceFor', { fmt });
      const inp = $('#f-price2', body), lst = $('#f-list2', body);
      if (sib && !inp.dataset.filled) { inp.dataset.filled = '1'; if (sib.price_cents) inp.value = eur(sib.price_cents).replace('.', ','); if (sib.list_price_cents) lst.value = eur(sib.list_price_cents).replace('.', ','); }
    }
  }
  // the two upload boxes: the first file becomes this book's file, the other format is added next to it
  // (its own file and price); a format that already exists as its own edition is shown as done, with a link to it
  const slotRole = f => (sib && sib.format === f) ? 'sib' : (!mainFmt() || mainFmt() === f) ? 'file' : api.newEdition ? 'file2' : 'none';
  // a book over 7 MB is made light for phones before it is uploaded (pictures redrawn at screen size, quality kept);
  // the full-size original is kept apart, private
  async function lighten(file, f) {
    const ok = $(`[data-slot-ok="${f}"]`, body), drop = $(`[data-slot-drop="${f}"]`, body);
    if (file.size <= 7 * 1048576) return file;
    ok.hidden = false; ok.innerHTML = `<span class="spinner" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin:0"></span><span> ${esc(t('opt.start', { mb: (file.size / 1048576).toFixed(1).replace('.', ',') }))}</span>`;
    drop.classList.add('locked');
    try {
      const light = await optimizeBook(file, p => { if (p.total) ok.lastChild.textContent = ' ' + t('opt.working', { n: p.n, total: p.total, step: p.level, steps: p.levels }); else if (p.saving) ok.lastChild.textContent = ' ' + t('opt.saving'); });
      return light || file;
    } catch (e) { console.warn('optimize', e); return file; }
    finally { drop.classList.remove('locked'); }
  }
  const optNote = file => file?.optimizedBook ? ` <span class="opt-note">${esc(t(file.optimizedBook.reached ? 'opt.done' : 'opt.doneMore', { from: kb(file.optimizedBook.from), to: kb(file.optimizedBook.to) }))}</span>` : '';
  function drawSlots() {
    for (const f of ['pdf', 'epub']) {
      const role = slotRole(f), fmt = t('book.formatShort.' + f);
      const name = $(`[data-slot-name="${f}"]`, body), ok = $(`[data-slot-ok="${f}"]`, body), rm = $(`[data-slot-rm="${f}"]`, body), drop = $(`[data-slot-drop="${f}"]`, body), box = $(`[data-slot="${f}"]`, body);
      if (!name) continue;
      let label = t('upl.choose', { fmt }), okHTML = '', canRemove = false, done = false;
      if (role === 'sib') { label = t('upl.sibDone', { fmt }); okHTML = `✓ ${esc(t('upl.sibOk', { fmt }))} <a href="#/admin/edit/${encodeURIComponent(sib.id)}/2">${esc(t('upl.sibEdit'))}</a>`; done = true; }
      else if (role === 'file') {
        const cur = files.file || lastFile;
        if (cur) label = `${cur.name} · ${(cur.size / 1048576).toFixed(1)} MB`;
        else if (v.file_path || v.file_name) label = t('admin.f.fileKeep', { name: v.file_name || String(v.file_path).split('/').pop() });
        if (cur || v.file_path || v.file_name) okHTML = '✓ ' + esc(t('kdp.manuscriptOk')) + optNote(cur);
      } else if (role === 'file2' && files.file2) { label = `${files.file2.name} · ${(files.file2.size / 1048576).toFixed(1)} MB`; okHTML = '✓ ' + esc(t('ed2.ready', { fmt })) + optNote(files.file2); canRemove = true; }
      name.textContent = label; ok.innerHTML = okHTML; ok.hidden = !okHTML; rm.hidden = !canRemove;
      drop.classList.toggle('locked', done); $(`[data-slot-input="${f}"]`, body).disabled = done;
      box.classList.toggle('has', !!okHTML);
    }
  }
  for (const f of ['pdf', 'epub']) {
    const input = $(`[data-slot-input="${f}"]`, body), drop = $(`[data-slot-drop="${f}"]`, body);
    if (!input) continue;
    const take = async file => {
      if (!file) return;
      if (fmtFile(file) !== f || !/\.(epub|pdf)$/i.test(file.name)) { toast(t('upl.wrong', { fmt: t('book.formatShort.' + f) }), { error: true }); return; }
      const role = slotRole(f);
      if (role === 'sib' || role === 'none') return;
      file = await lighten(file, f);
      await pick(role, file); drawSlots(); refresh();
    };
    input.onchange = e => { take(e.target.files[0]); e.target.value = ''; };
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); take(e.dataTransfer.files[0]); });
    $(`[data-slot-rm="${f}"]`, body).onclick = () => { if (slotRole(f) === 'file2') { files.file2 = null; edition2UI(); drawSlots(); refresh(); } };
  }
  drawSlots();
  // the other format of this book (EPUB ↔ PDF), if there is one: its price is set here and it is published together
  if (v.work_id && v.id && api.editionsOf) api.editionsOf(v.work_id).then(l => { sib = l.find(x => x.id !== v.id) || null; edition2UI(); drawSlots(); refresh(); }).catch(() => { });
  $('#b-file2-rm', body)?.addEventListener('click', () => { files.file2 = null; $('#f-file2', body).value = ''; edition2UI(); refresh(); });

  function drawCheck() {
    const box = $('#fcheck', body); if (!fileCheck) { box.hidden = true; return; }
    const ic = { ok: '✓', warn: '⚠', error: '✕' };
    const worst = fileCheck.items.some(x => x.level === 'error') ? 'error' : fileCheck.items.some(x => x.level === 'warn') ? 'warn' : 'ok';
    box.hidden = false; box.className = 'fcheck ' + worst;
    box.innerHTML = `<b>${esc(t('fc.title.' + worst))}</b><ul>${fileCheck.items.map(x => `<li class="${x.level}"><span>${ic[x.level]}</span>${esc(x.text)}</li>`).join('')}</ul>
      ${fileCheck.meta.kind === 'epub' ? `<small class="muted">${esc(t('fc.epubAdapts'))}</small>` : ''}`;
  }
  if (fileCheck) drawCheck();
  $$('[data-open-preview]', body).forEach(btn => btn.onclick = async () => {
    btn.disabled = true;
    try {
      const local = files.file || lastFile;
      if (local) await openPreviewer(local, /\.epub$/i.test(local.name) ? 'epub' : 'pdf');
      else {
        // book already saved: read where its file is stored straight from the database (the form may not know it yet)
        let book = v.file_path ? v : null;
        if (!book && bookId) { if (api._catalog) api._catalog = null; book = await api.getBook(bookId); }
        if (!book?.file_path) throw new Error(t('kdp.ck.manuscript') + ' ✕');
        const src = await api.getReadSource({ ...book, id: bookId }, {});
        await openPreviewer(src.url, (book.format || src.kind) === 'epub' ? 'epub' : 'pdf');
      }
    } catch (x) { toast(errText(x), { error: true }); }
    btn.disabled = false;
  });
  // internal Librava code (like Amazon's ASIN). It is NOT an ISBN: real ISBNs come only from the national ISBN agency.
  const newLid = () => { const A = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'; const r = crypto.getRandomValues(new Uint8Array(7)); return 'LBV' + [...r].map(x => A[x % A.length]).join(''); };
  $('#b-lid', body).onclick = e => { $('#f-lid', body).value = newLid(); e.currentTarget.textContent = t('kdp.lidNew'); $('#b-lid-rm', body).hidden = false; };
  $('#b-lid-rm', body).onclick = e => { $('#f-lid', body).value = ''; e.currentTarget.hidden = true; $('#b-lid', body).textContent = t('kdp.lidMake'); };
  const remakeSample = async () => {
    const local = files.file || lastFile;
    if (local) return autoSample(local);
    const srcInfo = await api.getReadSource({ ...v, id: bookId }, {});
    const blob = await (await fetch(srcInfo.url)).blob();
    return autoSample(new File([blob], v.format === 'epub' ? 'book.epub' : 'book.pdf', { type: blob.type }));
  };
  // changing the number of preview pages makes the preview again (unless you uploaded your own)
  $('#f-samplepages', body).addEventListener('change', debounce(async () => {
    if (ownSample || !(files.file || lastFile || v.file_path)) return;
    try { await remakeSample(); } catch (x) { toast(errText(x), { error: true }); }
  }, 400));
  $('#b-mksample', body).onclick = async e => {
    const btn = e.currentTarget; btn.disabled = true;
    try { await remakeSample(); } catch (x) { toast(errText(x), { error: true }); }
    btn.disabled = false;
  };
  
  const getAplus = hasAplus ? aplusEditor($('#aplus-root', body), aplusModules, () => bookId || draftId) : () => [];
  if (!hasAplus) $('[data-pane="3"]', body).remove();

  // ---- save (draft) or publish
  const collect = status => {
    const free = radio('ptype') === 'free';
    const amin = val('f-agemin'), amax = val('f-agemax');
    const extra = $$('#cat-checks input:checked', body).map(i => i.value).filter(c => c !== val('f-category'));
    return {
      title: val('f-title'), subtitle: val('f-subtitle') || null, author: authorName(), description: val('f-description'),
      language: val('f-language'), category: val('f-category'), categories: [val('f-category'), ...extra],
      series_name: val('f-series') || null, series_number: parseInt(val('f-seriesn')) || null, edition: parseInt(val('f-edition')) || null,
      contributors: $$('.contrib-row', body).map(r => ({ role: r.querySelector('.c-role').value, name: r.querySelector('.c-name').value.trim() })).filter(c => c.name),
      rights: radio('rights') || 'own', adult: radio('adult') === 'yes',
      age_min: amin === '' ? null : +amin, age_max: amax === '' ? null : +amax,
      keywords: $$('.kw', body).map(i => i.value.trim()).filter(Boolean),
      color: radio('bcolor') === 'bw' ? 'bw' : 'color',
      recommend_ids: [...new Set($$('.f-rec', body).map(x => x.value).filter(Boolean))],
      pages: parseInt(val('f-pages')) || null, sample_pages: Math.max(1, Math.min(200, parseInt(val('f-samplepages')) || SAMPLE_PAGES)), isbn: val('f-isbn') || null, librava_id: val('f-lid') || null,
      allow_download: $('#f-dl', body).checked, stamp_downloads: $('#f-stamp', body).checked,
      price_cents: free ? 0 : cents(val('f-price')), list_price_cents: free ? null : (cents(val('f-list')) || null),
      published_at: val('f-date') || null, is_featured: $('#f-featured', body).checked, status,
      ...(hasAplus ? { aplus: getAplus() } : {}),
      ...(fileCheck ? { file_check: { items: fileCheck.items, meta: { ...fileCheck.meta, doc: undefined } } } : {}),
    };
  };
  // every change is copied on this device at once; the copy is removed after a successful save
  const keep = debounce(() => { try { localStorage.setItem(DKEY(bookId), JSON.stringify({ at: Date.now(), data: collect(v.status || 'draft') })); window.__libravaDirty = true; } catch { } }, 500);
  // (the form can be drawn again in the same box: replace the previous listeners, don't add more)
  if (body._keepOff) body._keepOff();
  const onClickKeep = e => { if (e.target.closest('.ap-mod, [data-add], .contrib-row, [data-addkw]')) keep(); };
  ['input', 'change'].forEach(ev => body.addEventListener(ev, keep)); body.addEventListener('click', onClickKeep);
  body._keepOff = () => { ['input', 'change'].forEach(ev => body.removeEventListener(ev, keep)); body.removeEventListener('click', onClickKeep); };
  if (restored) {
    const bar = document.createElement('div'); bar.className = 'panel kdp-restored';
    bar.innerHTML = `${icon('info', 'ico')}<span>${esc(t('kdp.restored'))}</span><button type="button" class="btn btn-ghost btn-sm">${esc(t('kdp.discard'))}</button>`;
    body.prepend(bar);
    bar.querySelector('button').onclick = () => { try { localStorage.removeItem(DKEY(b?.id)); } catch { } window.__libravaDirty = false; bookForm(body, b, step); };
  }
  const save = async (status, btn) => {
    const err = $('#f-err', body); err.hidden = true;
    const fail = m => { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: 'center' }); };
    if (!val('f-title') || !val('f-first')) { show(1); return fail(t('kdp.needTitleAuthor')); }
    if (status === 'published') {
      const missing = checks().filter(c => !c.ok);
      if (missing.length) { show(missing[0].step); return fail(t('kdp.cannotPublish', { list: missing.map(m => m.label).join(', ') })); }
    }
    if (files.file2 && mainFmt() && fmtOf(files.file2) === t('book.formatShort.' + mainFmt())) { show(2); return fail(t('ed2.same')); }
    const data = collect(status);
    data.id = bookId || draftId;
    const old = btn.textContent; btn.disabled = true; btn.textContent = t('admin.saving');
    try {
      bookId = await api.saveBook(data, files);
      // a new book, once saved, gets its own address: a reload reopens it and "Add book" always starts empty
      if (/^#\/admin\/new/.test(location.hash)) { try { history.replaceState(null, '', location.pathname + location.search + '#/admin/edit/' + encodeURIComponent(bookId) + '/' + step); } catch { } }
      // the same book in the other format: its own edition (own file and price), linked to this one
      if (files.file2) {
        const f2 = files.file2, fmt2 = /\.epub$/i.test(f2.name) ? 'epub' : 'pdf';
        const src = await api.getBook(bookId);
        let sample = null, pages = null;
        try { sample = (await makeSample(f2, data.sample_pages)).file; } catch { }
        // its own page count (PDF: real pages; EPUB: estimated like a printed book), never the other format's
        try { pages = (await analyzeManuscript(f2, data.language))?.meta?.pages || null; } catch { }
        const free = radio('ptype') === 'free', p2 = free ? 0 : cents(val('f-price2'));
        // published together with this one only once it has its price (otherwise it waits as a draft)
        const st2 = status === 'published' && (free || p2 >= 49) ? 'published' : 'draft';
        const id2 = await api.newEdition(src, fmt2, { price_cents: p2 || 0, list_price_cents: free ? null : (cents(val('f-list2')) || null), status: st2, pages }, { file: f2, ...(sample ? { sample } : {}) });
        v.work_id = src.work_id || bookId; files.file2 = null;
        sib = { id: id2, format: fmt2, price_cents: p2 || 0, status: st2, file_path: 'yes' };
        edition2UI(); drawSlots();
        toast(t('ed2.created', { fmt: t('book.formatShort.' + fmt2) }), { ms: 6000 });
      } else if (sib && api.updateBook) {
        // the linked format follows: same details, cover and A+ (each keeps its own file, pages and price)
        const full = await api.getBook(bookId);
        const patch = {};
        for (const k of SHARED) if (k in data) patch[k] = data[k];
        if (full) { patch.cover_path = full.cover_path; if (full.aplus !== undefined) patch.aplus = full.aplus; }
        const free = radio('ptype') === 'free', p2 = free ? 0 : cents(val('f-price2'));
        if (free || p2 >= 49) { patch.price_cents = p2; patch.list_price_cents = free ? null : (cents(val('f-list2')) || null); }
        if (status === 'published' && sib.file_path && (free || p2 >= 49)) patch.status = 'published';
        await api.updateBook(sib.id, patch);
        Object.assign(sib, { price_cents: patch.price_cents ?? sib.price_cents, status: patch.status || sib.status });
      }
      try { localStorage.removeItem(DKEY(null)); localStorage.removeItem(DKEY(bookId)); } catch { } window.__libravaDirty = false;
      // the safety copy is written half a second after typing: make sure a late one does not come back after saving
      { const id = bookId; setTimeout(() => { try { localStorage.removeItem(DKEY(null)); localStorage.removeItem(DKEY(id)); } catch { } window.__libravaDirty = false; }, 800); }
      if (files.file) has.file = true; if (files.cover) has.cover = true;
      files.cover = files.file = files.sample = null;
      $('#kdp-status', body).className = 'status ' + (status === 'published' ? 'live' : 'draft');
      $('#kdp-status', body).textContent = status === 'published' ? t('kdp.live') : t('kdp.draft');
      v.status = status;
      btn.disabled = false; btn.textContent = old;
      return true;
    } catch (x) { fail(t('common.error', { msg: errText(x) })); btn.disabled = false; btn.textContent = old; return false; }
  };
  const prevStep = () => STEPS[Math.max(0, STEPS.indexOf(step) - 1)], nextStep = () => STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(step) + 1)];
  $('#b-back', body).onclick = () => show(prevStep());
  $('#b-draft', body).onclick = async e => { if (await save(v.status === 'published' ? 'published' : 'draft', e.currentTarget)) toast(t('kdp.savedDraft')); };
  $('#b-next', body).onclick = async e => {
    if (step < 4) { if (await save(v.status === 'published' ? 'published' : 'draft', e.currentTarget)) show(nextStep()); return; }
    if (await save('published', e.currentTarget)) {
      modal(`<div style="text-align:center"><div style="font-size:44px">🎉</div><h2>${esc(t('kdp.publishedTitle'))}</h2><p class="muted">${esc(t('kdp.publishedText'))}</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px"><a class="btn btn-buy" href="#/book/${encodeURIComponent(bookId)}" data-close>${esc(t('kdp.viewInStore'))}</a><a class="btn btn-ghost" href="#/admin/books" data-close>${esc(t('kdp.toBookshelf'))}</a></div></div>`);
    }
  };
  show(startStep);
}

// ---------------------------------------------------------------- import a whole book from one .zip ("Librava book package")
// The package holds everything a book needs; each thing goes to its place by itself:
//   book.json      title, subtitle, author, description, language, categories, keywords, series, prices of each format, A+
//   *.pdf / *.epub the book files (one per format)
//   cover.*        the cover (jpg / png / webp)
//   aplus/…        the A+ pictures named in book.json
// book.json example:
// { "title": "…", "subtitle": "…", "author": "Clara Bennett", "language": "en", "description": "<p>…</p>",
//   "category": "cooking", "categories": ["cooking", "hobby"], "keywords": ["…"], "series": { "name": "…", "number": 4 },
//   "color": "color", "sample_pages": 10, "published_at": "2026-10-22",
//   "formats": { "pdf": { "file": "Book.pdf", "price": 6.97, "list_price": 21.37 }, "epub": { "file": "Book.epub", "price": 3.97, "list_price": 12.37 } },
//   "aplus": [ { "type": "banner", "image": "aplus/01.jpg", "title": "…" },
//              { "type": "three", "items": [ { "image": "…", "title": "…", "text": "…" }, … ] },
//              { "type": "image_text", "side": "right", "image": "…", "title": "…", "text": "…" },
//              { "type": "header", "image": "…", "title": "…", "text": "…" }, { "type": "text", "title": "…", "text": "…" } ] }
const IMP_FMTS = ['pdf', 'epub'];
const zipName = p => p.split('/').pop();
async function readPackage(zipFile) {
  await loadScript(VENDOR('jszip.min.js'));
  const zip = await window.JSZip.loadAsync(zipFile);
  // a zip made from a folder has everything inside that folder: work from the folder that holds book.json
  const entries = Object.values(zip.files).filter(e => !e.dir && !/(^|\/)(__MACOSX|\.DS_Store)/.test(e.name));
  const jsonEntry = entries.find(e => /(^|\/)book\.json$/i.test(e.name));
  const root = jsonEntry ? jsonEntry.name.replace(/book\.json$/i, '') : '';
  const inRoot = entries.filter(e => e.name.startsWith(root));
  const byPath = p => p && inRoot.find(e => e.name === root + p.replace(/^\.?\//, '')) || null;
  const asFile = async (e, type) => e ? new File([await e.async('blob')], zipName(e.name), { type: type || (/\.pdf$/i.test(e.name) ? 'application/pdf' : /\.epub$/i.test(e.name) ? 'application/epub+zip' : /\.png$/i.test(e.name) ? 'image/png' : /\.webp$/i.test(e.name) ? 'image/webp' : 'image/jpeg') }) : null;
  const issues = [], err = (k, v) => issues.push({ level: 'error', text: t(k, v) }), warn = (k, v) => issues.push({ level: 'warn', text: t(k, v) });
  let meta = {};
  if (!jsonEntry) err('imp.noJson');
  else { try { meta = JSON.parse(await jsonEntry.async('string')); } catch { err('imp.badJson'); } }
  if (!meta.description) { const d = inRoot.find(e => /description\.html?$/i.test(e.name)); if (d) meta.description = await d.async('string'); }
  const pkg = { name: zipFile.name, meta, files: {}, prices: {}, aplus: [], issues };
  // the book files: as named in book.json, or the only PDF / EPUB of the package
  for (const f of IMP_FMTS) {
    const spec = meta.formats?.[f] || null;
    const e = byPath(spec?.file) || (inRoot.filter(x => new RegExp('\\.' + f + '$', 'i').test(x.name) && !/\/(aplus|a-plus)\//i.test(x.name)).length === 1 ? inRoot.find(x => new RegExp('\\.' + f + '$', 'i').test(x.name) && !/\/(aplus|a-plus)\//i.test(x.name)) : null);
    if (spec?.file && !e) err('imp.missingFile', { f: spec.file });
    if (!e) continue;
    pkg.files[f] = await asFile(e);
    const num = v => v == null || v === '' ? null : Math.round(parseFloat(String(v).replace(',', '.')) * 100);
    const price = num(spec?.price), list = num(spec?.list_price);
    pkg.prices[f] = { price: Number.isFinite(price) ? price : null, list: Number.isFinite(list) && list > (price || 0) ? list : null };
    if (pkg.prices[f].price == null) warn('imp.noPrice', { fmt: f.toUpperCase() });
    else if (price > 0 && price < 50) err('imp.lowPrice', { fmt: f.toUpperCase() });
  }
  if (!Object.keys(pkg.files).length) err('imp.noBook');
  const coverE = byPath(meta.cover) || inRoot.find(e => /(^|\/)cover[^/]*\.(jpe?g|png|webp)$/i.test(e.name) && !/\/(aplus|a-plus)\//i.test(e.name));
  pkg.files.cover = await asFile(coverE);
  if (!pkg.files.cover) err('imp.noCover');
  for (const [k, key] of [['title', 'imp.f.title'], ['author', 'imp.f.author'], ['language', 'imp.f.language'], ['category', 'imp.f.category']]) if (!String(meta[k] || '').trim()) err('imp.needField', { f: t(key) });
  if (meta.category && !CATS.includes(meta.category)) err('imp.badCat', { c: meta.category, list: CATS.join(', ') });
  if (/&/.test(meta.title || '')) warn('imp.amp');
  // A+ modules, with their pictures
  for (const [i, m] of (Array.isArray(meta.aplus) ? meta.aplus : []).slice(0, 7).entries()) {
    if (!APLUS[m?.type]) { warn('imp.badAplus', { n: i + 1 }); continue; }
    const list = m.type === 'three' ? (m.items || []).slice(0, 3) : [m];
    const imgs = [];
    for (const it of list) {
      if (!APLUS[m.type].imgs) break;
      const e = byPath(it.image); if (it.image && !e) warn('imp.missingImg', { f: it.image });
      imgs.push(await asFile(e));
    }
    pkg.aplus.push({ ...m, files: imgs, caps: m.type === 'three' ? (m.items || []).slice(0, 3).map(x => ({ title: x.title || '', text: x.text || '' })) : undefined });
  }
  return pkg;
}

async function importBooks(body) {
  body.innerHTML = `<div class="panel imp">
      <h2 class="section-title" style="margin-top:0">${esc(t('imp.title'))}</h2>
      <p class="muted" style="margin-top:0">${esc(t('imp.help'))}</p>
      <label class="drop imp-drop" id="imp-drop">${icon('upload')}<span><b>${esc(t('imp.drop'))}</b><br><small>${esc(t('imp.dropHint'))}</small></span><input type="file" id="imp-input" accept=".zip,application/zip" multiple></label>
      <div id="imp-list"></div></div>`;
  const list = $('#imp-list', body), drop = $('#imp-drop', body);
  const all = await api.adminBooks().catch(() => []);
  const add = async zipFile => {
    const card = document.createElement('div'); card.className = 'imp-card'; list.prepend(card);
    card.innerHTML = `<div class="imp-row"><span class="spinner" style="margin:0"></span><span>${esc(t('imp.reading', { name: zipFile.name }))}</span></div>`;
    let pkg;
    try { pkg = await readPackage(zipFile); } catch (e) { card.innerHTML = `<div class="kdp-err">${esc(t('imp.broken', { name: zipFile.name }))} — ${esc(errText(e))}</div>`; return; }
    const m = pkg.meta, fmts = IMP_FMTS.filter(f => pkg.files[f]);
    // the same book already in the store (same title, author and language): update it instead of making a copy
    const same = all.filter(b => !b.deleted_at && norm(b.title) === norm(m.title || '') && norm(b.author) === norm(m.author || '') && b.language === m.language);
    const bad = pkg.issues.some(x => x.level === 'error');
    const cov = pkg.files.cover ? URL.createObjectURL(pkg.files.cover) : '';
    card.innerHTML = `<div class="imp-sum">
        ${cov ? `<img class="imp-cover" src="${cov}" alt="">` : '<div class="imp-cover"></div>'}
        <div class="imp-info"><b class="imp-t">${esc(m.title || '—')}</b>${m.subtitle ? `<div class="muted imp-sub">${esc(m.subtitle)}</div>` : ''}
          <div class="muted">${esc(m.author || '')} · ${esc(String(m.language || '').toUpperCase())} · ${esc(m.category ? t('cat.' + m.category) : '')}${m.series?.name ? ' · ' + esc(m.series.name) + (m.series.number ? ' #' + m.series.number : '') : ''}</div>
          <div class="imp-fmts">${fmts.map(f => `<span class="imp-fmt"><span class="fp-chip fmt-${f}">${f.toUpperCase()}</span> ${(pkg.files[f].size / 1048576).toFixed(1).replace('.', ',')} MB · <b>${pkg.prices[f].price == null ? '—' : pkg.prices[f].price ? money(pkg.prices[f].price) : esc(t('book.free'))}</b>${pkg.prices[f].list ? ` <s>${money(pkg.prices[f].list)}</s>` : ''}</span>`).join('')}</div>
          <div class="muted" style="font-size:13px">${esc(t('imp.aplusN', { n: pkg.aplus.length }))} · ${esc(t('imp.kwN', { n: (m.keywords || []).length }))}</div>
          ${pkg.issues.length ? `<ul class="imp-issues">${pkg.issues.map(x => `<li class="${x.level}">${x.level === 'error' ? '✕' : '⚠'} ${esc(x.text)}</li>`).join('')}</ul>` : `<div class="ok" style="font-size:14px">✓ ${esc(t('imp.allOk'))}</div>`}
          ${same.length && !bad ? `<div class="imp-same">${icon('info', 'ico')} ${esc(t('imp.exists'))}
            <label class="check"><input type="radio" name="imp-mode-${card.dataset.k = Math.random().toString(36).slice(2)}" value="update" checked> ${esc(t('imp.update'))}</label>
            <label class="check"><input type="radio" name="imp-mode-${card.dataset.k}" value="new"> ${esc(t('imp.asNew'))}</label></div>` : ''}
          ${bad ? '' : `<div class="imp-btns"><button type="button" class="btn btn-buy" data-imp="published">${esc(t('imp.publish'))}</button><button type="button" class="btn btn-ghost" data-imp="draft">${esc(t('imp.draft'))}</button></div>`}
          <div class="imp-log" hidden></div></div></div>`;
    card.querySelectorAll('[data-imp]').forEach(btn => btn.onclick = async () => {
      const mode = card.querySelector('input[type=radio]:checked')?.value || 'new';
      card.querySelectorAll('[data-imp]').forEach(b => b.disabled = true);
      const log = card.querySelector('.imp-log'); log.hidden = false;
      const say = txt => { log.innerHTML = `<span class="spinner" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin:0"></span> ${esc(txt)}`; };
      try {
        const res = await runImport(pkg, { status: btn.dataset.imp, update: mode === 'update' ? same : [], say });
        log.innerHTML = `<div class="ok">✓ ${esc(t(btn.dataset.imp === 'published' ? 'imp.donePub' : 'imp.doneDraft'))}</div>${res.notes.map(n => `<div class="opt-note">${esc(n)}</div>`).join('')}
          <div class="imp-btns"><a class="btn btn-ghost btn-sm" href="#/book/${encodeURIComponent(res.id)}">${esc(t('kdp.viewInStore'))}</a><a class="btn btn-ghost btn-sm" href="#/admin/edit/${encodeURIComponent(res.id)}">${esc(t('admin.edit'))}</a></div>`;
        card.querySelector('.imp-btns')?.remove();
      } catch (e) {
        log.innerHTML = `<div class="kdp-err">${esc(t('common.error', { msg: errText(e) }))}</div>`;
        card.querySelectorAll('[data-imp]').forEach(b => b.disabled = false);
      }
    });
  };
  const take = files => [...files].filter(f => /\.zip$/i.test(f.name)).forEach(add);
  $('#imp-input', body).onchange = e => { take(e.target.files); e.target.value = ''; };
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); take(e.dataTransfer.files); });
}

async function runImport(pkg, { status, update = [], say }) {
  const m = pkg.meta, notes = [];
  const fmts = IMP_FMTS.filter(f => pkg.files[f]);
  const existing = Object.fromEntries(update.map(b => [b.format, b]));
  const mainFmt = fmts.find(f => existing[f]) || fmts[0];
  const id = existing[mainFmt]?.id || crypto.randomUUID();
  // 1. the book files: made light for phones when they are heavy (originals kept apart), pages counted, free sample made
  const ready = {};
  for (const f of fmts) {
    let file = pkg.files[f];
    if (file.size > 7 * 1048576) {
      say(t('opt.start', { mb: (file.size / 1048576).toFixed(1).replace('.', ',') }));
      try { file = (await optimizeBook(file, p => { if (p.total) say(f.toUpperCase() + ' · ' + t('opt.working', { n: p.n, total: p.total, step: p.level, steps: p.levels })); else if (p.saving) say(t('opt.saving')); })) || file; } catch (e) { console.warn('optimize', e); }
      if (file.optimizedBook) notes.push(f.toUpperCase() + ': ' + t(file.optimizedBook.reached ? 'opt.done' : 'opt.doneMore', { from: kb(file.optimizedBook.from), to: kb(file.optimizedBook.to) }));
    }
    say(t('imp.checking', { fmt: f.toUpperCase() }));
    let pages = null, check = null;
    try { const a = await analyzeManuscript(file, m.language); pages = a.meta.pages || null; check = { items: a.items, meta: { ...a.meta, doc: undefined } }; } catch { }
    let sample = null;
    try { sample = (await makeSample(file, m.sample_pages || SAMPLE_PAGES)).file; } catch { }
    ready[f] = { file, pages, check, sample };
  }
  // 2. the cover, light like every cover
  say(t('imp.cover'));
  const cover = await compressImage(pkg.files.cover, { maxW: 1200, maxH: 1920, name: 'cover' });
  // 3. A+ pictures (light), into the same modules the A+ editor makes
  const aplus = [];
  if (api.uploadAplusImage) {
    for (const [i, mod] of pkg.aplus.entries()) {
      say(t('imp.aplus', { n: i + 1, total: pkg.aplus.length }));
      const spec = APLUS[mod.type], imgs = [];
      for (const f of mod.files || []) {
        if (!f) { imgs.push(null); continue; }
        const { w, h } = await imgSize(f);
        const light = await compressImage(f, { maxW: spec.rec[0] > 1000 ? 1600 : spec.rec[0], maxH: spec.rec[0] > 1000 ? 500 : spec.rec[1], name: 'aplus' });
        const up = await api.uploadAplusImage(id, light);
        imgs.push({ ref: up.ref, w, h });
      }
      aplus.push({ type: mod.type, title: mod.title || '', text: mod.text || '', side: mod.side === 'right' ? 'right' : 'left', imgs, ...(mod.type === 'three' ? { caps: mod.caps } : {}) });
    }
  }
  // 4. the details shared by every format
  const shared = {
    title: String(m.title).trim(), subtitle: m.subtitle || null, author: String(m.author).trim(), description: m.description || '',
    language: m.language, category: m.category, categories: [...new Set([m.category, ...(m.categories || [])].filter(c => CATS.includes(c)))].slice(0, 3),
    series_name: m.series?.name || null, series_number: m.series?.number ? +m.series.number : null,
    contributors: Array.isArray(m.contributors) ? m.contributors : [], keywords: (m.keywords || []).slice(0, 7), color: m.color === 'bw' ? 'bw' : 'color',
    rights: 'own', adult: !!m.adult, allow_download: m.allow_download !== false, stamp_downloads: true,
    sample_pages: Math.max(1, Math.min(200, +m.sample_pages || SAMPLE_PAGES)), published_at: m.published_at || new Date().toISOString().slice(0, 10),
    ...(aplus.length ? { aplus } : {}),
  };
  // a format without a price waits as a draft (never published free by mistake)
  const statusFor = f => status === 'published' && pkg.prices[f].price != null && (pkg.prices[f].price === 0 || pkg.prices[f].price >= 50) ? 'published' : 'draft';
  const rowFor = f => ({ ...shared, format: f, price_cents: pkg.prices[f].price ?? 0, list_price_cents: pkg.prices[f].list, pages: ready[f].pages, file_check: ready[f].check, status: statusFor(f) });
  // 5. the first format, then the other one linked to it (its own file, pages and price)
  say(t('imp.saving', { fmt: mainFmt.toUpperCase() }));
  const first = { ...rowFor(mainFmt), id };
  if (!existing[mainFmt]) first.librava_id = 'LBV' + [...crypto.getRandomValues(new Uint8Array(7))].map(x => '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'[x % 34]).join('');
  await api.saveBook(first, { file: ready[mainFmt].file, cover, ...(ready[mainFmt].sample ? { sample: ready[mainFmt].sample } : {}) });
  for (const f of fmts.filter(x => x !== mainFmt)) {
    say(t('imp.saving', { fmt: f.toUpperCase() }));
    const files = { file: ready[f].file, ...(ready[f].sample ? { sample: ready[f].sample } : {}) };
    if (existing[f]) {
      const src = await api.getBook(id);
      await api.saveBook({ ...rowFor(f), id: existing[f].id, work_id: src.work_id || id, cover_path: src.cover_path }, files);
      if (!src.work_id) await api.updateBook(id, { work_id: id });
    } else {
      const src = await api.getBook(id);
      const r = rowFor(f);
      await api.newEdition(src, f, { price_cents: r.price_cents, list_price_cents: r.list_price_cents, pages: r.pages, file_check: r.file_check, status: r.status }, files);
    }
  }
  for (const f of fmts) if (status === 'published' && statusFor(f) !== 'published') notes.push(t('imp.leftDraft', { fmt: f.toUpperCase() }));
  return { id, notes };
}

// ---------------------------------------------------------------- announcements shown under the bell
async function notificationsAdmin(body) {
  const [list, books] = await Promise.all([api.adminNotifications(), api.adminBooks()]);
  const pub = books.filter(b => b.status === 'published' && !b.deleted_at);
  const byId = Object.fromEntries(books.map(b => [b.id, b]));
  const UI = getLang();
  let tpl = null, chosen = [];
  // sent notifications: copies of one send (one per language) are shown together
  const groups = []; const seen = {};
  for (const n of list) { const k = n.batch || n.id; if (!seen[k]) { seen[k] = { key: k, batch: n.batch, items: [] }; groups.push(seen[k]); } seen[k].items.push(n); }
  body.innerHTML = `<div class="panel"><h2 class="section-title" style="font-size:19px;margin:0 0 4px">${esc(t('ntf.tplTitle'))}</h2><p class="muted" style="margin:0 0 12px">${esc(t('ntf.tplHelp'))}</p>
      <div class="ntf-tpls">${NTF_TEMPLATES.map(x => { const f = fillTemplate(x.key, UI, { book: '…', author: '…', price: '…', code: 'CODE', percent: '20' }); return `<button type="button" class="ntf-tpl" data-tpl="${x.key}">${icon(x.icon)}<b>${esc(t('ntf.tpl.' + x.key))}</b><small>${esc(f.title)}</small></button>`; }).join('')}
        <button type="button" class="ntf-tpl blank" data-tpl="">${icon('edit')}<b>${esc(t('ntf.blank'))}</b><small>${esc(t('ntf.blankHelp'))}</small></button></div></div>
    <div class="adm-two ntf-adm">
    <form class="panel" id="ntf-form" style="display:flex;flex-direction:column;gap:12px">
      <h2 class="section-title" style="font-size:19px;margin:0" id="n-head">${esc(t('ntf.new'))}</h2>
      <label class="field"><span>${esc(t('ntf.lang'))}</span><select id="n-lang"><option value="">${esc(t('ntf.allLangs'))}</option>${LANGS.map(([l, nm]) => `<option value="${l}">${esc(langName(l))} · ${esc(nm)}</option>`).join('')}</select><small class="muted" id="n-langhelp"></small></label>
      <div id="n-books-box"><span class="field-l">${esc(t('ntf.books'))}</span><small class="muted" style="display:block">${esc(t('ntf.booksHelp'))}</small>
        <input class="input" id="n-find" type="search" placeholder="${esc(t('nav.searchPlaceholder'))}" style="margin-top:6px"><div class="pr-chosen" id="n-chosen" style="margin-top:6px"></div><div class="pr-pick" id="n-pick" style="max-height:220px;margin-top:6px"></div></div>
      <div class="two" id="n-vars"><label class="field" data-v="code"><span>${esc(t('of.code'))}</span><input id="n-code" maxlength="30" style="text-transform:uppercase"></label><label class="field" data-v="percent"><span>${esc(t('of.percent'))}</span><input id="n-pct" type="number" min="1" max="90" value="20"></label></div>
      <label class="field"><span>${esc(t('ap.title'))} *</span><input id="n-title" maxlength="120" required></label>
      <div class="field"><span>${esc(t('ap.text'))}</span>
        <div class="ntf-fmt"><button type="button" class="btn btn-ghost btn-sm" id="n-bold" title="${esc(t('ntf.boldHelp'))}"><b>B</b> ${esc(t('ntf.bold'))}</button><select class="input" id="n-size" title="${esc(t('ntf.bigHelp'))}" style="width:auto;padding:6px 10px"><option value="">${esc(t('ntf.size'))}…</option><option value="1">${esc(t('ntf.sz1'))}</option><option value="2">${esc(t('ntf.sz2'))}</option><option value="3">${esc(t('ntf.sz3'))}</option><option value="4">${esc(t('ntf.sz4'))}</option></select><button type="button" class="btn btn-ghost btn-sm" id="n-emo">😊 Emoji</button><small class="muted">${esc(t('ntf.boldHelp'))}</small></div>
        <div class="ntf-emojis" id="n-emojis" hidden>${['🎉', '🎊', '🥳', '🎁', '🎈', '🏆', '🌟', '✨', '⭐', '❤️', '💚', '🔥', '💥', '🚀', '👏', '🙌', '😍', '😊', '👍', '🙏', '📚', '📖', '🔖', '🏷️', '💸', '💰', '🛒', '⏰', '⚡', '🆕', '🆓', '✅', '👉', '🎯', '📣', '🍂', '🎃', '🎄', '☀️', '🌈'].map(e => `<button type="button" data-emo="${e}">${e}</button>`).join('')}</div>
        <textarea id="n-body" maxlength="600" rows="3"></textarea></div>
      <label class="field"><span>${esc(t('ntf.link'))}</span><input id="n-link" maxlength="300" placeholder="${esc(t('ntf.linkAuto'))}"></label>
      <div class="ntf-preview"><span class="field-l">${esc(t('pr.preview'))}</span><div id="n-prev"></div></div>
      <button class="btn btn-buy" type="submit" id="n-send">${esc(t('ntf.send'))}</button>
      <small class="muted">${esc(t('ntf.help'))}</small>
    </form>
    <div class="panel"><h2 class="section-title" style="font-size:19px">${esc(t('ntf.sent'))}</h2>
      ${groups.length ? groups.map(g => { const n = g.items.find(x => x.lang === UI) || g.items[0]; const bs = (n.book_ids || []).map(id => byId[id]).filter(Boolean);
        return `<div class="adm-line" style="align-items:flex-start;gap:10px"><span style="display:flex;gap:10px;min-width:0">${bs[0]?.cover_url ? `<img src="${esc(bs[0].cover_url)}" alt="" style="width:34px;height:52px;object-fit:contain;flex:none">` : ''}<span style="min-width:0"><b>${esc(n.title)}</b>
          <small class="muted" style="display:block">${esc(fmtDate(n.created_at))} · ${g.items.length > 1 ? esc(t('ntf.inLangs', { n: g.items.length })) : n.lang ? esc(n.lang.toUpperCase()) : esc(t('ntf.allLangs'))}${bs.length ? ' · ' + esc(t('ntf.nBooks', { n: bs.length })) : ''}</small>${n.body ? `<small style="display:block">${esc(n.body)}</small>` : ''}</span></span>
          <button class="btn btn-ghost btn-sm" data-del-ntf="${esc(g.batch || n.id)}" data-is-batch="${g.batch ? 1 : ''}">${esc(t('admin.delete'))}</button></div>`; }).join('') : `<p class="muted">${esc(t('ntf.none'))}</p>`}
    </div></div>`;
  const f = $('#ntf-form', body), v = sel => ($(sel, f)?.value || '').trim();
  // wrap the selected words in a marker (** bold, ++ bigger)
  const wrapSel = mark => {
    const ta = $('#n-body', f), a = ta.selectionStart, b = ta.selectionEnd, val = ta.value, L = mark.length;
    if (a === b) return toast(t('ntf.boldPick'), { error: true });
    const sel = val.slice(a, b), wrapped = val.slice(a - L, a) === mark && val.slice(b, b + L) === mark;
    ta.value = wrapped ? val.slice(0, a - L) + sel + val.slice(b + L) : val.slice(0, a) + mark + sel + mark + val.slice(b);
    ta.focus(); ta.setSelectionRange(wrapped ? a - L : a + L, wrapped ? b - L : b + L);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  };
  // size of the selected text or emoji: normal / big / very big / huge
  $('#n-size', f).onchange = e => {
    const lvl = e.target.value; e.target.value = ''; if (!lvl) return;
    const ta = $('#n-body', f); let a = ta.selectionStart, b = ta.selectionEnd, val = ta.value;
    if (a === b) return toast(t('ntf.boldPick'), { error: true });
    // remove an existing size marker around the selection
    for (const n of [4, 3, 2]) { const m = '+'.repeat(n); if (val.slice(a - n, a) === m && val.slice(b, b + n) === m) { val = val.slice(0, a - n) + val.slice(a, b) + val.slice(b + n); a -= n; b -= n; break; } }
    const m = lvl === '1' ? '' : '+'.repeat(+lvl);
    ta.value = val.slice(0, a) + m + val.slice(a, b) + m + val.slice(b);
    ta.focus(); ta.setSelectionRange(a + m.length, b + m.length); ta.dispatchEvent(new Event('input', { bubbles: true }));
  };
  $('#n-emo', f).onclick = () => { const bx = $('#n-emojis', f); bx.hidden = !bx.hidden; };
  $('#n-emojis', f).onclick = e => {
    const b = e.target.closest('[data-emo]'); if (!b) return;
    const ta = $('#n-body', f), a = ta.selectionStart ?? ta.value.length, z = ta.selectionEnd ?? a;
    ta.value = ta.value.slice(0, a) + b.dataset.emo + ta.value.slice(z); ta.focus(); ta.setSelectionRange(a + b.dataset.emo.length, a + b.dataset.emo.length);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  };
  // highlight the selected words: they are wrapped in ** ** (shown bold and marked in the notification)
  $('#n-bold', f).onclick = () => wrapSel('**');
  let edited = false;
  const meta = () => NTF_TEMPLATES.find(x => x.key === tpl);
  const valsFor = l => { const b = byId[chosen[0]]; return { book: b?.title || '', author: b?.author || '', price: b ? (b.price_cents ? new Intl.NumberFormat(l === 'no' ? 'nb' : l, { style: 'currency', currency: (b.currency || CONFIG.currency || 'eur').toUpperCase() }).format(b.price_cents / 100) : t('book.free')) : '', code: v('#n-code').toUpperCase(), percent: v('#n-pct') }; };
  const autoLink = () => { const m = meta(); if (v('#n-link')) return v('#n-link'); if (m?.link === 'book' || (!m && chosen.length === 1)) return chosen[0] ? '#/book/' + chosen[0] : null; return m?.link || null; };
  const fill = () => { if (!tpl || edited) return; const l = v('#n-lang') || UI; const x = fillTemplate(tpl, l, valsFor(l)); $('#n-title', f).value = x.title; $('#n-body', f).value = x.body; };
  const drawPick = () => {
    const q = norm(v('#n-find')), L = v('#n-lang') || UI;
    $('#n-chosen', f).innerHTML = chosen.map(id => { const b = byId[id]; return b ? `<span class="pr-chip">${b.cover_url ? `<img src="${esc(b.cover_url)}" alt="">` : ''}<span>${esc(b.title)}</span><button type="button" data-rm="${esc(id)}">×</button></span>` : ''; }).join('') || `<span class="muted" style="font-size:14px">${esc(t('pr.booksNone'))}</span>`;
    $('#n-pick', f).innerHTML = pub.filter(b => !q || norm(b.title + ' ' + b.author).includes(q)).sort((a, b2) => (b2.language === L) - (a.language === L)).slice(0, 40).map(b => `<label class="pr-opt ${chosen.includes(b.id) ? 'on' : ''}"><input type="checkbox" value="${esc(b.id)}" ${chosen.includes(b.id) ? 'checked' : ''}>${b.cover_url ? `<img src="${esc(b.cover_url)}" alt="">` : ''}<span><b>${esc(b.title)}</b><small class="muted">${esc((b.language || '').toUpperCase())} · ${b.price_cents ? money(b.price_cents) : esc(t('book.free'))}</small></span></label>`).join('');
  };
  const draw = () => {
    const m = meta(), all = !v('#n-lang');
    $$('[data-v]', f).forEach(el => { el.hidden = !(m?.needs || []).includes(el.dataset.v); });
    $('#n-vars', f).hidden = !(m?.needs || []).some(x => x === 'code' || x === 'percent');
    $('#n-langhelp', f).textContent = tpl && all ? t('ntf.allLangsTpl') : all ? t('ntf.allLangsSame') : '';
    $('#n-title', f).readOnly = $('#n-body', f).readOnly = !!(tpl && all);
    $('#n-head', f).textContent = tpl ? t('ntf.tpl.' + tpl) : t('ntf.new');
    $$('.ntf-tpl', body).forEach(x => x.classList.toggle('on', x.dataset.tpl === (tpl || '') && x.dataset.picked === '1'));
    fill(); drawPick();
    $('#n-prev', f).innerHTML = ntfCardHTML({ title: v('#n-title') || '…', body: v('#n-body'), link: autoLink(), kind: tpl }, chosen.map(id => byId[id]), { preview: true });
    $('#n-prev', f).querySelectorAll('a').forEach(a => a.addEventListener('click', e => e.preventDefault()));
  };
  $$('.ntf-tpl', body).forEach(btn => btn.onclick = () => { $$('.ntf-tpl', body).forEach(x => x.dataset.picked = ''); btn.dataset.picked = '1'; tpl = btn.dataset.tpl || null; edited = false; if (!tpl) { $('#n-title', f).value = ''; $('#n-body', f).value = ''; } draw(); f.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  $('#n-title', f).addEventListener('input', () => { edited = true; }); $('#n-body', f).addEventListener('input', () => { edited = true; });
  $('#n-lang', f).addEventListener('change', () => { edited = false; });
  $('#n-pick', f).addEventListener('input', e => { e.stopPropagation(); const cb = e.target.closest('input[type=checkbox]'); if (!cb) return; chosen = cb.checked ? [...chosen, cb.value].slice(0, 6) : chosen.filter(x => x !== cb.value); edited = false; draw(); });
  $('#n-pick', f).addEventListener('change', e => e.stopPropagation());
  $('#n-chosen', f).addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { chosen = chosen.filter(x => x !== b.dataset.rm); edited = false; draw(); } });
  $('#n-find', f).addEventListener('input', e => { e.stopPropagation(); drawPick(); });
  f.addEventListener('input', draw); f.addEventListener('change', draw);
  f.onsubmit = async e => {
    e.preventDefault();
    const m = meta();
    if ((m?.needs || []).includes('book') && !chosen.length) return toast(t('ntf.needBook'), { error: true });
    if ((m?.needs || []).includes('code') && !v('#n-code')) return toast(t('ntf.needCode'), { error: true });
    if (!v('#n-title')) return toast(t('ntf.needTitle'), { error: true });
    const link = autoLink();
    if (link && !safeLink(link)) return toast(t('pr.badLink'), { error: true });
    const batch = crypto.randomUUID(), base = { link, published: true, book_ids: chosen, kind: tpl, batch };
    // a ready-made text for "all languages": each language gets its own translation
    const rows = tpl && !v('#n-lang') ? LANGS.map(([l]) => ({ ...base, lang: l, ...fillTemplate(tpl, l, valsFor(l)) }))
      : [{ ...base, lang: v('#n-lang') || null, title: v('#n-title'), body: v('#n-body') }];
    const btn = $('#n-send', f); btn.disabled = true;
    try { await (api.saveNotifications ? api.saveNotifications(rows) : Promise.all(rows.map(r => api.saveNotification(r)))); toast(t('ntf.sentOk')); notificationsAdmin(body); refreshBell(true); }
    catch (x) { toast(errText(x), { error: true }); btn.disabled = false; }
  };
  $$('[data-del-ntf]', body).forEach(b => b.onclick = async () => {
    if (!await confirmBox(t('admin.delete') + '?', { danger: true })) return;
    try { if (b.dataset.isBatch) await api.deleteNotificationBatch(b.dataset.delNtf); else await api.deleteNotification(b.dataset.delNtf); notificationsAdmin(body); refreshBell(true); } catch (x) { toast(errText(x), { error: true }); }
  });
  draw();
}

// ---------------------------------------------------------------- advertising: home page banners per language
const PROMO_SPEC = { hero: { w: 1500, h: 600, mw: 1200, mh: 900 }, strip: { w: 1500, h: 300, mw: 900, mh: 300 } };
const promoStatus = p => !p.active ? 'off' : p.starts_at && new Date(p.starts_at) > new Date() ? 'soon' : p.ends_at && new Date(p.ends_at) <= new Date() ? 'ended' : 'live';
const langLabel = l => l ? `${langName(l)} (${l.toUpperCase()})` : t('pr.allLangs');
async function promosAdmin(body) {
  const filter = sessionStorage.getItem('librava:prLang') || '';
  const [all, books] = await Promise.all([api.adminPromos(), api.adminBooks()]);
  const byId = Object.fromEntries(books.map(b => [b.id, b]));
  const list = all.filter(p => !filter || p.lang === filter || (filter === '*' && !p.lang));
  const used = [...new Set(all.map(p => p.lang).filter(Boolean))];
  const row = p => {
    const st = promoStatus(p), ctr = p.views ? (p.clicks / p.views * 100).toFixed(1).replace('.', ',') + '%' : '—';
    const b = byId[p.book_id];
    return `<div class="pr-row">
      <div class="pr-prev ${esc(p.placement)}"><div class="pr-scale">${p.kind === 'image' && p.image_url ? `<img src="${esc(p.image_url)}" alt="">` : promoHTML(p, b, p.placement, (p.book_ids || []).map(id => byId[id]))}</div></div>
      <div class="pr-info"><b>${esc(p.title || b?.title || (p.kind === 'books' ? t('pr.booksN', { n: (p.book_ids || []).length }) : t('pr.untitled')))}</b>
        <span class="muted">${esc(t('pr.place.' + p.placement))} · ${esc(langLabel(p.lang))} · ${esc(t('pr.kind.' + p.kind))}</span>
        <span><span class="status ${st === 'live' ? 'live' : 'draft'}">${esc(t('pr.st.' + st))}</span>
          ${p.starts_at || p.ends_at ? `<span class="muted" style="font-size:13px">${esc(p.starts_at ? fmtDate(p.starts_at) : '…')} → ${esc(p.ends_at ? fmtDate(p.ends_at) : '…')}</span>` : ''}</span>
        <span class="pr-stats"><span>${esc(t('pr.views'))}: <b>${p.views || 0}</b></span><span>${esc(t('pr.clicks'))}: <b>${p.clicks || 0}</b></span><span>CTR: <b>${ctr}</b></span></span></div>
      <div class="pr-acts">
        <button type="button" class="btn btn-ghost btn-sm" data-up="${esc(p.id)}" aria-label="${esc(t('pr.up'))}" title="${esc(t('pr.up'))}">↑</button>
        <button type="button" class="btn btn-ghost btn-sm" data-down="${esc(p.id)}" aria-label="${esc(t('pr.down'))}" title="${esc(t('pr.down'))}">↓</button>
        <a class="btn btn-ghost btn-sm" href="#/admin/promos/${esc(p.id)}">${esc(t('pr.editBtn'))}</a>
        <button type="button" class="btn btn-ghost btn-sm" data-toggle="${esc(p.id)}">${esc(t(p.active ? 'pr.pause' : 'pr.activate'))}</button>
        <button type="button" class="btn btn-ghost btn-sm" data-del="${esc(p.id)}" style="color:var(--deal)">${esc(t('admin.delete'))}</button></div></div>`;
  };
  body.innerHTML = `<div class="panel pr-head">
      <div><h2 class="section-title" style="font-size:19px;margin:0">${esc(t('pr.title'))}</h2><p class="muted" style="margin:4px 0 0;max-width:70ch">${esc(t('pr.help'))}</p></div>
      <div class="pr-tools"><label class="field" style="margin:0"><span>${esc(t('pr.showLang'))}</span><select id="pr-lang">
        <option value="">${esc(t('pr.everything'))}</option><option value="*" ${filter === '*' ? 'selected' : ''}>${esc(t('pr.allLangs'))}</option>
        ${LANGS.map(([l, n]) => `<option value="${l}" ${filter === l ? 'selected' : ''}>${esc(langName(l))} · ${esc(n)}${used.includes(l) ? ' ●' : ''}</option>`).join('')}</select></label>
        <a class="btn btn-buy" href="#/admin/promos/new">${icon('plus')} ${esc(t('pr.new'))}</a></div></div>
    ${['hero', 'strip'].map(pl => { const items = list.filter(p => p.placement === pl); return `<section class="panel"><h3 style="margin:0 0 4px">${esc(t('pr.place.' + pl))}</h3><p class="muted" style="margin:0 0 12px;font-size:14px">${esc(t('pr.placeHelp.' + pl))}</p>
      ${items.length ? `<div class="pr-list">${items.map(row).join('')}</div>` : `<p class="muted">${esc(t('pr.none'))}</p>`}</section>`; }).join('')}`;
  $('#pr-lang', body).onchange = e => { sessionStorage.setItem('librava:prLang', e.target.value); promosAdmin(body); };
  const move = async (id, dir) => {
    const p = all.find(x => x.id === id); const group = all.filter(x => x.placement === p.placement);
    const i = group.indexOf(p), j = i + dir; if (j < 0 || j >= group.length) return;
    [group[i], group[j]] = [group[j], group[i]];
    try { await Promise.all(group.map((x, k) => x.sort === k ? null : api.savePromo({ id: x.id, sort: k }))); promosAdmin(body); } catch (x) { toast(errText(x), { error: true }); }
  };
  $$('[data-up]', body).forEach(b => b.onclick = () => move(b.dataset.up, -1));
  $$('[data-down]', body).forEach(b => b.onclick = () => move(b.dataset.down, 1));
  $$('[data-toggle]', body).forEach(b => b.onclick = async () => { const p = all.find(x => x.id === b.dataset.toggle); try { await api.savePromo({ id: p.id, active: !p.active }); promosAdmin(body); } catch (x) { toast(errText(x), { error: true }); } });
  $$('[data-del]', body).forEach(b => b.onclick = async () => {
    if (!await confirmBox(t('pr.delAsk'), { danger: true })) return;
    try { await api.deletePromo(all.find(x => x.id === b.dataset.del)); toast(t('pr.deleted')); promosAdmin(body); } catch (x) { toast(errText(x), { error: true }); }
  });
}

async function promoForm(body, id) {
  const [all, books] = await Promise.all([api.adminPromos(), api.adminBooks()]);
  const pub = books.filter(b => b.status === 'published' && !b.deleted_at);
  const prItems = pub.map(b => ({ id: b.id, label: b.title + ' · ' + (b.language || '').toUpperCase() + (b.format ? ' · ' + String(b.format).toUpperCase() : '') }));
  const p = all.find(x => x.id === id) || { placement: 'hero', kind: pub.length ? 'book' : 'image', lang: sessionStorage.getItem('librava:prLang')?.replace('*', '') || getLang(), theme: 'forest', active: true, sort: all.length };
  const files = {};
  let chosen = (p.book_ids || []).filter(id => pub.some(b => b.id === id));
  const local = iso => { if (!iso) return ''; const d = new Date(iso); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  body.innerHTML = `<form class="panel pr-form" id="pr-form" novalidate>
    <div class="pr-form-head"><h2 class="section-title" style="font-size:19px;margin:0">${esc(id === 'new' ? t('pr.new') : t('pr.edit'))}</h2><a class="btn btn-ghost btn-sm" href="#/admin/promos">← ${esc(t('pr.back'))}</a></div>
    <div class="pr-live"><div class="pr-live-bar"><b>${esc(t('pr.preview'))}</b><div class="seg"><button type="button" data-pv="desk" class="on">${esc(t('pv.desktop'))}</button><button type="button" data-pv="phone">${esc(t('pv.phone'))}</button></div></div>
      <div class="pr-live-stage"><div class="pr-live-frame" id="pr-live"></div></div></div>
    <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('pr.where'))}</h3><p>${esc(t('pr.whereHelp'))}</p></div>
      <div class="kdp-fields">
        <div class="radios">${['hero', 'strip'].map(v => `<label class="check"><input type="radio" name="pl" value="${v}" ${p.placement === v ? 'checked' : ''}> ${esc(t('pr.place.' + v))}</label>`).join('')}</div>
        <label class="field"><span>${esc(t('pr.lang'))} *</span><select id="pr-l"><option value="">${esc(t('pr.allLangs'))}</option>${LANGS.map(([l, n]) => `<option value="${l}" ${p.lang === l ? 'selected' : ''}>${esc(langName(l))} · ${esc(n)}</option>`).join('')}</select><small>${esc(t('pr.langHelp'))}</small></label></div></div>
    <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('pr.what'))}</h3><p>${esc(t('pr.whatHelp'))}</p></div>
      <div class="kdp-fields">
        <div class="radios">${['book', 'books', 'image'].map(v => `<label class="check"><input type="radio" name="kd" value="${v}" ${p.kind === v ? 'checked' : ''}> ${esc(t('pr.kind.' + v))}</label>`).join('')}</div>
        <div id="pr-bookbox"><label class="field"><span>${esc(t('pr.book'))} *</span>${bookComboHTML('pr-book', prItems, p.book_id, t('ri.typeBook'))}<small id="pr-booklang" class="muted"></small></label>
        </div>
        <div id="pr-booksbox"><span class="field-l">${esc(t('pr.books'))} *</span><small class="muted">${esc(t('pr.booksHelp'))}</small>
          <input class="input" id="pr-bfind" type="search" placeholder="${esc(t('nav.searchPlaceholder'))}" autocomplete="off">
          <div class="pr-chosen" id="pr-chosen"></div>
          <div class="pr-pick" id="pr-pick"></div></div>
        <div id="pr-themebox"><span class="muted" style="font-size:14px">${esc(t('pr.theme'))}</span><div class="pr-themes">${PROMO_THEMES.map(th => `<label class="pr-theme theme-${th}" title="${th}"><input type="radio" name="th" value="${th}" ${p.theme === th ? 'checked' : ''}><span></span></label>`).join('')}</div>
          <div class="pr-custom"><label class="pr-theme theme-custom" id="pr-cswatch" style="--bg:linear-gradient(115deg,${esc(p.bg_from || '#1F3A93')},${esc(p.bg_to || '#D9485F')})" title="${esc(t('pr.custom'))}"><input type="radio" name="th" value="custom" ${p.theme === 'custom' ? 'checked' : ''}><span></span></label>
            <span>${esc(t('pr.custom'))}:</span><input type="color" id="pr-c1" value="${esc(p.bg_from || '#1F3A93')}" aria-label="${esc(t('pr.color1'))}"><input type="color" id="pr-c2" value="${esc(p.bg_to || '#D9485F')}" aria-label="${esc(t('pr.color2'))}"></div></div>
        <div id="pr-fontbox"><span class="muted" style="font-size:14px">${esc(t('pr.font'))}</span><div class="pr-fonts">${[['', "'Literata', Georgia, serif"], ...PROMO_FONTS.filter(f => f[0] !== 'literata')].map(([k, fam]) => `<label class="pr-font"><input type="radio" name="pf" value="${k}" ${(p.font || '') === k ? 'checked' : ''}><b style="font-family:${fam};${k === 'bebas' || k === 'dmserif' ? 'font-weight:400' : ''}">Aa Librava</b><small>${esc(k ? t('pr.f.' + k) : t('pr.f.default'))}</small></label>`).join('')}</div></div>
        <div id="pr-imgbox">
          <label class="drop" data-drop="image">${icon('image')}<span><span class="fname" id="n-image">${p.image_url ? '✓ ' + esc(t('pr.imgKept')) : esc(t('pr.imgWide'))}</span><br><small id="spec-wide"></small></span><input type="file" id="pr-image" accept="image/jpeg,image/png,image/webp"></label>
          <div class="kdp-warn" id="w-image" hidden></div>
          <label class="drop" data-drop="mobile">${icon('devices')}<span><span class="fname" id="n-mobile">${p.image_mobile_url ? '✓ ' + esc(t('pr.imgKept')) : esc(t('pr.imgMobile'))}</span><br><small id="spec-mobile"></small></span><input type="file" id="pr-mobile" accept="image/jpeg,image/png,image/webp"></label>
          <div class="kdp-warn" id="w-mobile" hidden></div>
          ${p.image_mobile_url ? `<button type="button" class="btn btn-ghost btn-sm" id="pr-rm-mobile">${esc(t('pr.rmMobile'))}</button>` : ''}</div></div></div>
    <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('pr.texts'))}</h3><p>${esc(t('pr.textsHelp'))}</p></div>
      <div class="kdp-fields">
        <label class="field"><span>${esc(t('pr.kicker'))}</span><input id="pr-kicker" maxlength="40" value="${esc(p.kicker || '')}" placeholder="${esc(t('pr.kickerPh'))}"></label>
        <label class="field"><span>${esc(t('pr.titleF'))}</span><input id="pr-title" maxlength="90" value="${esc(p.title || '')}"><small id="pr-title-ph" class="muted"></small></label>
        <label class="field"><span>${esc(t('pr.sub'))}</span><input id="pr-sub" maxlength="160" value="${esc(p.subtitle || '')}"></label>
        <div class="two"><label class="field"><span>${esc(t('pr.cta'))}</span><input id="pr-cta" maxlength="30" value="${esc(p.cta || '')}" placeholder="${esc(t('promo.ctaBook'))}"></label>
          <label class="field"><span>${esc(t('pr.link'))}</span><select id="pr-linkpick"><option value="">${esc(t('pr.link.auto'))}</option><option value="#/search?sort=newest">${esc(t('home.new'))}</option><option value="#/search?deals=1">${esc(t('home.deals'))}</option><option value="#/search?price=free">${esc(t('home.free'))}</option><option value="#/search?sort=bestsellers">${esc(t('home.featured'))}</option>${CATS.map(c => `<option value="#/search?cat=${c}">${esc(t('cat.' + c))}</option>`).join('')}<option value="custom">${esc(t('pr.link.custom'))}</option></select></label></div>
        <label class="field" id="pr-linkbox" hidden><span>${esc(t('pr.link.customF'))}</span><input id="pr-link" maxlength="300" placeholder="#/book/…  ·  https://…" value="${esc(p.link || '')}"><small>${esc(t('pr.link.help'))}</small></label></div></div>
    <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('pr.when'))}</h3><p>${esc(t('pr.whenHelp'))}</p></div>
      <div class="kdp-fields"><div class="two"><label class="field"><span>${esc(t('pr.start'))}</span><input type="datetime-local" id="pr-start" value="${local(p.starts_at)}"></label>
        <label class="field"><span>${esc(t('pr.end'))}</span><input type="datetime-local" id="pr-end" value="${local(p.ends_at)}"></label></div>
        <div class="two"><label class="field"><span>${esc(t('pr.seconds'))}</span><input type="number" id="pr-sec" min="3" max="30" step="1" value="${esc(p.seconds || 7)}"></label>
          <label class="field"><span>${esc(t('pr.transition'))}</span><select id="pr-tr">${['fade', 'slide', 'zoom', 'flip'].map(k => `<option value="${k}" ${(p.transition || 'fade') === k ? 'selected' : ''}>${esc(t('pr.tr.' + k))}</option>`).join('')}</select></label></div>
        <small class="muted">${esc(t('pr.motionHelp'))}</small>
        <label class="check"><input type="checkbox" id="pr-active" ${p.active !== false ? 'checked' : ''}> ${esc(t('pr.activeF'))}</label></div></div>
    <div class="error" id="pr-err" hidden></div>
    <div class="kdp-bar"><a class="btn btn-ghost" href="#/admin/promos">${esc(t('admin.cancel'))}</a><span class="spacer"></span><button class="btn btn-buy" type="submit">${esc(t('pr.save'))}</button></div>
  </form>`;
  bindBookCombo(body, 'pr-book', prItems);
  const f = $('#pr-form', body), val = sel => ($(sel, f)?.value || '').trim(), rad = n => f.querySelector(`input[name="${n}"]:checked`)?.value;
  // link: known destinations in a list, anything else as a custom link
  const pick = $('#pr-linkpick', f), known = [...pick.options].map(o => o.value);
  if (p.link && known.includes(p.link)) pick.value = p.link; else if (p.link) { pick.value = 'custom'; $('#pr-linkbox', f).hidden = false; }
  pick.onchange = () => { $('#pr-linkbox', f).hidden = pick.value !== 'custom'; draw(); };
  const current = () => ({
    ...p, placement: rad('pl'), lang: val('#pr-l') || null, kind: rad('kd'), book_id: rad('kd') === 'book' ? val('#pr-book') || null : null, book_ids: rad('kd') === 'books' ? chosen.slice() : [],
    theme: rad('th') || 'forest', bg_from: $('#pr-c1', f).value, bg_to: $('#pr-c2', f).value, font: rad('pf') || null, kicker: val('#pr-kicker') || null, title: val('#pr-title') || null, subtitle: val('#pr-sub') || null, cta: val('#pr-cta') || null,
    link: pick.value === 'custom' ? val('#pr-link') || null : pick.value || null,
    starts_at: val('#pr-start') ? new Date(val('#pr-start')).toISOString() : null, ends_at: val('#pr-end') ? new Date(val('#pr-end')).toISOString() : null,
    active: $('#pr-active', f).checked, seconds: Math.min(30, Math.max(3, parseInt(val('#pr-sec'), 10) || 7)), transition: val('#pr-tr') || 'fade',
    image_url: files.imageUrl || p.image_url, image_mobile_url: files.removeMobile ? null : files.mobileUrl || p.image_mobile_url,
  });
  let dev = 'desk';
  const draw = () => {
    const c = current(), spec = PROMO_SPEC[c.placement] || PROMO_SPEC.hero;
    $('#pr-bookbox', f).hidden = c.kind !== 'book'; $('#pr-imgbox', f).hidden = c.kind !== 'image';
    $('#pr-booksbox', f).hidden = c.kind !== 'books'; $('#pr-cta', f).placeholder = t(c.kind === 'books' ? 'promo.ctaBooks' : c.kind === 'book' ? 'promo.ctaBook' : 'promo.cta'); $('#pr-themebox', f).hidden = c.kind === 'image';
    drawPick();
    $('#spec-wide', f).textContent = t('pr.specWide', { w: spec.w, h: spec.h });
    $('#spec-mobile', f).textContent = t('pr.specMobile', { w: spec.mw, h: spec.mh });
    const b = pub.find(x => x.id === c.book_id);
    $('#pr-title-ph', f).textContent = c.kind === 'book' ? t('pr.titleAuto') : '';
    const bl = $('#pr-booklang', f); bl.textContent = b && c.lang && b.language && b.language !== c.lang ? t('pr.bookOtherLang', { a: (b.language || '').toUpperCase(), b: c.lang.toUpperCase() }) : '';
    const live = $('#pr-live', f);
    live.className = 'pr-live-frame ' + dev;
    const list = c.book_ids.map(id => pub.find(x => x.id === id)).filter(Boolean);
    const ok = c.kind === 'image' ? c.image_url : c.kind === 'books' ? list.length >= 2 : b;
    live.innerHTML = ok ? (c.placement === 'hero' ? `<div class="hero hero-promos" style="padding-bottom:0">${promoHTML(c, b, 'hero', list)}</div>` : `<div class="promo-strip-wrap" style="padding:12px">${promoHTML(c, b, 'strip', list)}</div>`) : `<div class="pr-empty">${esc(t(c.kind === 'image' ? 'pr.needImage' : c.kind === 'books' ? 'pr.needBooks' : 'pr.needBook'))}</div>`;
    live.querySelectorAll('a').forEach(a => a.addEventListener('click', e => e.preventDefault()));
  };
  // choosing several books: search, tick up to 8, order = order of choosing (× removes, ‹ › move)
  function drawPick() {
    const q = norm($('#pr-bfind', f).value || ''), L = val('#pr-l');
    const opts = pub.filter(b => !q || norm(b.title + ' ' + b.author).includes(q)).sort((a, b2) => (b2.language === L) - (a.language === L));
    $('#pr-chosen', f).innerHTML = chosen.map((id, i) => { const b = pub.find(x => x.id === id); return b ? `<span class="pr-chip">${b.cover_url ? `<img src="${esc(b.cover_url)}" alt="">` : ''}<span>${esc(b.title)}</span>
      <button type="button" data-mv="${i}" data-d="-1" aria-label="${esc(t('pr.up'))}" ${i ? '' : 'disabled'}>‹</button><button type="button" data-mv="${i}" data-d="1" aria-label="${esc(t('pr.down'))}" ${i < chosen.length - 1 ? '' : 'disabled'}>›</button><button type="button" data-rm="${esc(id)}" aria-label="${esc(t('admin.delete'))}">×</button></span>` : ''; }).join('') || `<span class="muted" style="font-size:14px">${esc(t('pr.booksNone'))}</span>`;
    $('#pr-pick', f).innerHTML = opts.slice(0, 60).map(b => `<label class="pr-opt ${chosen.includes(b.id) ? 'on' : ''}"><input type="checkbox" value="${esc(b.id)}" ${chosen.includes(b.id) ? 'checked' : ''} ${!chosen.includes(b.id) && chosen.length >= 8 ? 'disabled' : ''}>
      ${b.cover_url ? `<img src="${esc(b.cover_url)}" alt="">` : '<span class="sugg-ph"></span>'}<span><b>${esc(b.title)}</b><small class="muted">${esc(b.author)} · ${esc((b.language || '').toUpperCase())} · ${b.price_cents ? money(b.price_cents) : esc(t('book.free'))}</small></span></label>`).join('');
  }
  $('#pr-pick', f).addEventListener('change', e => e.stopPropagation());
  $('#pr-pick', f).addEventListener('input', e => { const cb = e.target.closest('input[type=checkbox]'); if (!cb) return; e.stopPropagation(); chosen = cb.checked ? [...chosen, cb.value].slice(0, 8) : chosen.filter(x => x !== cb.value); draw(); });
  $('#pr-chosen', f).addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]'), mv = e.target.closest('[data-mv]');
    if (rm) chosen = chosen.filter(x => x !== rm.dataset.rm);
    if (mv) { const i = +mv.dataset.mv, j = i + +mv.dataset.d; [chosen[i], chosen[j]] = [chosen[j], chosen[i]]; }
    if (rm || mv) draw();
  });
  $('#pr-bfind', f).addEventListener('input', e => { e.stopPropagation(); drawPick(); });
  ['#pr-c1', '#pr-c2'].forEach(sel => $(sel, f).addEventListener('input', () => { $('#pr-cswatch', f).style.setProperty('--bg', `linear-gradient(115deg,${$('#pr-c1', f).value},${$('#pr-c2', f).value})`); f.querySelector('input[name=th][value=custom]').checked = true; }));
  f.addEventListener('input', draw); f.addEventListener('change', draw);
  $$('[data-pv]', f).forEach(b => b.onclick = () => { dev = b.dataset.pv; $$('[data-pv]', f).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $('#pr-rm-mobile', f)?.addEventListener('click', e => { files.removeMobile = true; files.mobile = null; e.target.remove(); $('#n-mobile', f).textContent = t('pr.imgMobile'); draw(); });
  const take = async (kind, file) => {
    if (!file) return;
    if (!/\.(jpe?g|png|webp)$/i.test(file.name)) { toast(t('admin.badFile'), { error: true }); return; }
    const spec = PROMO_SPEC[rad('pl')] || PROMO_SPEC.hero, tw = kind === 'image' ? spec.w : spec.mw, th = kind === 'image' ? spec.h : spec.mh;
    const dim = await new Promise(res => { const im = new Image(); im.onload = () => res([im.naturalWidth, im.naturalHeight]); im.onerror = () => res([0, 0]); im.src = URL.createObjectURL(file); });
    const warn = $('#w-' + kind, f), msgs = [];
    if (dim[0] < tw * 0.66) msgs.push(t('pr.imgSmall', { w: dim[0], h: dim[1], tw, th }));
    if (Math.abs(dim[0] / dim[1] - tw / th) / (tw / th) > 0.06) msgs.push(t('pr.imgRatio', { w: dim[0], h: dim[1], tw, th }));
    warn.innerHTML = msgs.map(esc).join('<br>'); warn.hidden = !msgs.length;
    const light = await compressImage(file, { maxW: tw, maxH: th * 2, name: kind === 'image' ? 'banner' : 'banner-mobile' });
    files[kind] = light; files[kind + 'Url'] = URL.createObjectURL(light); if (kind === 'mobile') files.removeMobile = false;
    $('#n-' + kind, f).textContent = light.optimized ? t('img.optimized', { from: kb(light.optimized.from), to: kb(light.optimized.to), w: light.optimized.w, h: light.optimized.h }) : file.name;
    draw();
  };
  $('#pr-image', f).onchange = e => take('image', e.target.files[0]);
  $('#pr-mobile', f).onchange = e => take('mobile', e.target.files[0]);
  $$('.drop', f).forEach(d => { d.addEventListener('dragover', e => { e.preventDefault(); d.classList.add('over'); }); d.addEventListener('dragleave', () => d.classList.remove('over')); d.addEventListener('drop', e => { e.preventDefault(); d.classList.remove('over'); take(d.dataset.drop, e.dataTransfer.files[0]); }); });
  f.onsubmit = async e => {
    e.preventDefault();
    const c = current(), err = $('#pr-err', f), fail = m => { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: 'center' }); };
    err.hidden = true;
    if (c.kind === 'book' && !c.book_id) return fail(t('pr.needBook'));
    if (c.kind === 'image' && !c.image_url) return fail(t('pr.needImage'));
    if (c.kind === 'books' && c.book_ids.length < 2) return fail(t('pr.needBooks'));
    if (c.link && !safeLink(c.link)) return fail(t('pr.badLink'));
    if (c.starts_at && c.ends_at && c.ends_at <= c.starts_at) return fail(t('pr.badDates'));
    const row = { id: p.id, placement: c.placement, lang: c.lang, kind: c.kind, book_id: c.book_id, book_ids: c.book_ids, theme: c.theme, bg_from: c.theme === 'custom' ? c.bg_from : null, bg_to: c.theme === 'custom' ? c.bg_to : null, font: c.font, kicker: c.kicker, title: c.title, subtitle: c.subtitle, cta: c.cta, link: c.link, starts_at: c.starts_at, ends_at: c.ends_at, active: c.active, seconds: c.seconds, transition: c.transition, sort: p.sort ?? all.length };
    if (!row.id) delete row.id;
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    try { await api.savePromo(row, { image: c.kind === 'image' ? files.image : null, mobile: c.kind === 'image' ? files.mobile : null, removeMobile: !!files.removeMobile }); toast(t('pr.saved')); go('/admin/promos'); }
    catch (x) { fail(errText(x)); btn.disabled = false; }
  };
  draw();
}

// ---------------------------------------------------------------- offers: bundles, quantity discounts, 3-for-2, sales, coupons
const offerStatus = o => !o.active ? 'off' : o.starts_at && new Date(o.starts_at) > new Date() ? 'soon' : o.ends_at && new Date(o.ends_at) <= new Date() ? 'ended' : 'live';
const ofDesc = o => describeOffer(o, t, c => t('cat.' + c));
async function offersAdmin(body) {
  const list = await api.adminOffers();
  body.innerHTML = `<div class="panel pr-head"><div><h2 class="section-title" style="font-size:19px;margin:0">${esc(t('of.title'))}</h2>
      <p class="muted" style="margin:4px 0 0;max-width:75ch">${esc(t('of.help'))}</p></div>
      <a class="btn btn-buy" href="#/admin/offers/new">${icon('plus')} ${esc(t('of.new'))}</a></div>
    <div class="panel of-rules"><b>${esc(t('of.rulesTitle'))}</b><ul><li>${esc(t('of.rule1'))}</li><li>${esc(t('of.rule2'))}</li><li>${esc(t('of.rule3'))}</li><li>${esc(t('of.rule4'))}</li></ul></div>
    <section class="panel">${list.length ? `<div class="of-list">${list.map(o => { const st = offerStatus(o); return `<div class="of-row">
      <span class="of-ico">${icon(o.kind === 'coupon' ? 'tag' : o.kind === 'bundle' ? 'library' : o.kind === 'category' ? 'grid' : 'bolt')}</span>
      <div class="pr-info"><b>${esc(o.name || t('of.kind.' + o.kind))}</b><span>${esc(ofDesc(o))}</span>
        <span><span class="status ${st === 'live' ? 'live' : 'draft'}">${esc(t('pr.st.' + st))}</span><span class="muted" style="font-size:13px">${esc(t('of.kind.' + o.kind))}${o.stackable ? ' · ' + esc(t('of.stackShort')) : ''}${o.kind === 'coupon' ? ' · ' + esc(t('of.usesN', { n: o.config?.uses || o.uses || 0, max: o.config?.max_uses || '∞' })) : ''}</span>
        ${o.starts_at || o.ends_at ? `<span class="muted" style="font-size:13px">${esc(o.starts_at ? fmtDate(o.starts_at) : '…')} → ${esc(o.ends_at ? fmtDate(o.ends_at) : '…')}</span>` : ''}</span></div>
      <div class="pr-acts"><a class="btn btn-ghost btn-sm" href="#/admin/offers/${esc(o.id)}">${esc(t('pr.editBtn'))}</a>
        <button class="btn btn-ghost btn-sm" data-tg="${esc(o.id)}">${esc(t(o.active ? 'pr.pause' : 'pr.activate'))}</button>
        <button class="btn btn-ghost btn-sm" data-del="${esc(o.id)}" style="color:var(--deal)">${esc(t('admin.delete'))}</button></div></div>`; }).join('')}</div>` : `<p class="muted">${esc(t('of.none'))}</p>`}</section>`;
  $$('[data-tg]', body).forEach(b => b.onclick = async () => { const o = list.find(x => x.id === b.dataset.tg); try { await api.saveOffer({ id: o.id, kind: o.kind, config: o.config, active: !o.active }); offersAdmin(body); } catch (x) { toast(errText(x), { error: true }); } });
  $$('[data-del]', body).forEach(b => b.onclick = async () => { if (!await confirmBox(t('of.delAsk'), { danger: true })) return; try { await api.deleteOffer(b.dataset.del); toast(t('of.deleted')); offersAdmin(body); } catch (x) { toast(errText(x), { error: true }); } });
}

async function offerForm(body, id) {
  const [all, books] = await Promise.all([api.adminOffers(), api.adminBooks()]);
  const pub = books.filter(b => b.status === 'published' && !b.deleted_at && b.price_cents > 0);
  const o = all.find(x => x.id === id) || { kind: 'qty', active: true, stackable: false, priority: 0, show_badge: true, config: { tiers: [{ min: 2, percent: 10 }, { min: 3, percent: 15 }] } };
  const c = { ...(o.config || {}) };
  let chosen = (c.book_ids || []).filter(x => pub.some(b => b.id === x));
  let tiers = (c.tiers || [{ min: 2, percent: 10 }]).map(x => ({ ...x }));
  const local = iso => { if (!iso) return ''; const d = new Date(iso); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  const catSel = (idv, v, any = true) => `<select id="${idv}">${any ? `<option value="">${esc(t('of.allBooks'))}</option>` : ''}${CATS.map(k => `<option value="${k}" ${v === k ? 'selected' : ''}>${esc(t('cat.' + k))}</option>`).join('')}</select>`;
  body.innerHTML = `<form class="panel pr-form" id="of-form" novalidate>
    <div class="pr-form-head"><h2 class="section-title" style="font-size:19px;margin:0">${esc(id === 'new' ? t('of.new') : t('of.edit'))}</h2><a class="btn btn-ghost btn-sm" href="#/admin/offers">← ${esc(t('of.back'))}</a></div>
    <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('of.type'))}</h3><p>${esc(t('of.typeHelp'))}</p></div>
      <div class="kdp-fields"><div class="of-kinds">${OFFER_KINDS.map(k => `<label class="of-kind"><input type="radio" name="ok" value="${k}" ${o.kind === k ? 'checked' : ''}><b>${esc(t('of.kind.' + k))}</b><small>${esc(t('of.kindHelp.' + k))}</small></label>`).join('')}</div></div></div>
    <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('of.rule'))}</h3><p id="of-example" class="of-example"></p></div>
      <div class="kdp-fields">
        <div data-for="bundle"><span class="field-l">${esc(t('of.bundleBooks'))}</span><input class="input" id="of-find" type="search" placeholder="${esc(t('nav.searchPlaceholder'))}"><div class="pr-chosen" id="of-chosen"></div><div class="pr-pick" id="of-pick"></div></div>
        <div data-for="qty"><span class="field-l">${esc(t('of.tiers'))}</span><div id="of-tiers"></div><button type="button" class="btn btn-ghost btn-sm" id="of-addtier">+ ${esc(t('of.addTier'))}</button></div>
        <div data-for="bxgy" class="two"><label class="field"><span>${esc(t('of.buy'))}</span><input id="of-buy" type="number" min="1" max="10" value="${esc(c.buy || 2)}"></label><label class="field"><span>${esc(t('of.get'))}</span><input id="of-get" type="number" min="1" max="5" value="${esc(c.get || 1)}"></label>
          <label class="field" style="grid-column:1/-1"><span>${esc(t('of.getPct'))}</span><input id="of-getp" type="number" min="1" max="100" value="${esc(c.percent ?? 100)}"><small>${esc(t('of.getPctHelp'))}</small></label></div>
        <div data-for="bundle category coupon" class="two"><label class="field" data-for="bundle category"><span>${esc(t('of.percent'))}</span><input id="of-pct" type="number" min="1" max="90" value="${esc(c.percent || 10)}"></label></div>
        <div data-for="qty bxgy category"><label class="field"><span>${esc(t('of.category'))}</span>${catSel('of-cat', c.category)}</label></div>
        <div data-for="coupon" class="of-coupon">
          <label class="field"><span>${esc(t('of.code'))} *</span><div class="lid-row"><input id="of-code" class="input" maxlength="30" value="${esc(c.code || '')}" style="text-transform:uppercase" placeholder="BENVENUTO10"><button type="button" class="btn btn-ghost btn-sm" id="of-gen">${esc(t('of.genCode'))}</button></div></label>
          <div class="radios"><label class="check"><input type="radio" name="ct" value="p" ${c.amount_cents ? '' : 'checked'}> ${esc(t('of.cPercent'))}</label><label class="check"><input type="radio" name="ct" value="a" ${c.amount_cents ? 'checked' : ''}> ${esc(t('of.cAmount'))}</label></div>
          <div class="two"><label class="field" id="of-cp-box"><span>${esc(t('of.percent'))}</span><input id="of-cpct" type="number" min="1" max="90" value="${esc(c.percent || 10)}"></label>
            <label class="field" id="of-ca-box"><span>${esc(t('of.amount'))}</span><input id="of-camt" type="number" min="0.5" step="0.01" value="${c.amount_cents ? (c.amount_cents / 100).toFixed(2) : '2.00'}"></label>
            <label class="field"><span>${esc(t('of.minOrder'))}</span><input id="of-min" type="number" min="0" step="0.01" value="${c.min_cents ? (c.min_cents / 100).toFixed(2) : ''}" placeholder="0"></label>
            <label class="field"><span>${esc(t('of.maxUses'))}</span><input id="of-max" type="number" min="1" value="${esc(c.max_uses || '')}" placeholder="∞"></label></div>
          <label class="check"><input type="checkbox" id="of-new" ${c.new_only ? 'checked' : ''}> ${esc(t('of.newOnly'))}</label></div>
      </div></div>
    <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('of.settings'))}</h3><p>${esc(t('of.settingsHelp'))}</p></div>
      <div class="kdp-fields">
        <label class="field"><span>${esc(t('of.name'))}</span><input id="of-name" maxlength="80" value="${esc(o.name || '')}" placeholder="${esc(t('of.namePh'))}"></label>
        <div class="two"><label class="field"><span>${esc(t('pr.start'))}</span><input type="datetime-local" id="of-start" value="${local(o.starts_at)}"></label><label class="field"><span>${esc(t('pr.end'))}</span><input type="datetime-local" id="of-end" value="${local(o.ends_at)}"></label></div>
        <label class="check" data-for="bundle qty bxgy category"><input type="checkbox" id="of-stack" ${o.stackable ? 'checked' : ''}> ${esc(t('of.stackable'))}</label>
        <label class="check"><input type="checkbox" id="of-badge" ${o.show_badge !== false ? 'checked' : ''}> ${esc(t('of.badge'))}</label>
        <label class="check"><input type="checkbox" id="of-active" ${o.active !== false ? 'checked' : ''}> ${esc(t('of.active'))}</label></div></div>
    <div class="error" id="of-err" hidden></div>
    <div class="kdp-bar"><a class="btn btn-ghost" href="#/admin/offers">${esc(t('admin.cancel'))}</a><span class="spacer"></span><button class="btn btn-buy" type="submit">${esc(t('of.save'))}</button></div></form>`;
  const f = $('#of-form', body), v = sel => ($(sel, f)?.value || '').trim(), kind = () => f.querySelector('input[name=ok]:checked').value;
  const cents = x => Math.round(parseFloat(String(x).replace(',', '.')) * 100) || 0;
  const cfg = () => {
    const k = kind();
    if (k === 'bundle') return { book_ids: chosen.slice(), percent: +v('#of-pct') };
    if (k === 'qty') return { tiers: tiers.filter(x => x.min > 0 && x.percent > 0), category: v('#of-cat') || null };
    if (k === 'bxgy') return { buy: +v('#of-buy') || 2, get: +v('#of-get') || 1, percent: +v('#of-getp') || 100, category: v('#of-cat') || null };
    if (k === 'category') return { category: v('#of-cat') || CATS[0], percent: +v('#of-pct') };
    const amount = f.querySelector('input[name=ct]:checked').value === 'a';
    return { code: v('#of-code').toUpperCase().replace(/\s+/g, ''), percent: amount ? null : +v('#of-cpct'), amount_cents: amount ? cents(v('#of-camt')) : null, min_cents: cents(v('#of-min')) || null, max_uses: +v('#of-max') || null, uses: c.uses || 0, new_only: $('#of-new', f).checked };
  };
  const drawTiers = () => { $('#of-tiers', f).innerHTML = tiers.map((x, i) => `<div class="of-tier"><span>${esc(t('of.from'))}</span><input type="number" min="2" max="50" data-tmin="${i}" value="${x.min}"><span>${esc(t('of.booksPct'))}</span><input type="number" min="1" max="90" data-tpct="${i}" value="${x.percent}"><span>%</span>${tiers.length > 1 ? `<button type="button" class="btn btn-ghost btn-sm" data-trm="${i}">×</button>` : ''}</div>`).join(''); };
  const drawPick = () => {
    const q = norm(v('#of-find'));
    $('#of-chosen', f).innerHTML = chosen.map(idv => { const b = pub.find(x => x.id === idv); return b ? `<span class="pr-chip">${b.cover_url ? `<img src="${esc(b.cover_url)}" alt="">` : ''}<span>${esc(b.title)}</span><button type="button" data-rm="${esc(idv)}">×</button></span>` : ''; }).join('') || `<span class="muted" style="font-size:14px">${esc(t('pr.booksNone'))}</span>`;
    $('#of-pick', f).innerHTML = pub.filter(b => !q || norm(b.title + ' ' + b.author).includes(q)).slice(0, 60).map(b => `<label class="pr-opt ${chosen.includes(b.id) ? 'on' : ''}"><input type="checkbox" value="${esc(b.id)}" ${chosen.includes(b.id) ? 'checked' : ''}>${b.cover_url ? `<img src="${esc(b.cover_url)}" alt="">` : ''}<span><b>${esc(b.title)}</b><small class="muted">${esc((b.language || '').toUpperCase())} · ${money(b.price_cents)}</small></span></label>`).join('');
  };
  const draw = () => {
    const k = kind();
    $$('[data-for]', f).forEach(el => { el.hidden = !el.dataset.for.split(' ').includes(k); });
    const amount = f.querySelector('input[name=ct]:checked')?.value === 'a';
    $('#of-cp-box', f).hidden = amount; $('#of-ca-box', f).hidden = !amount;
    $('#of-example', f).textContent = t('of.exampleLabel') + ' ' + ofDesc({ kind: k, config: cfg() });
    if (k === 'bundle') drawPick();
  };
  $('#of-tiers', f).addEventListener('input', e => { const i = e.target.dataset.tmin ?? e.target.dataset.tpct; if (i == null) return; tiers[+i][e.target.dataset.tmin != null ? 'min' : 'percent'] = +e.target.value; e.stopPropagation(); draw(); });
  $('#of-tiers', f).addEventListener('click', e => { const b = e.target.closest('[data-trm]'); if (b) { tiers.splice(+b.dataset.trm, 1); drawTiers(); draw(); } });
  $('#of-addtier', f).onclick = () => { const last = tiers[tiers.length - 1] || { min: 1, percent: 5 }; tiers.push({ min: last.min + 1, percent: Math.min(90, last.percent + 5) }); drawTiers(); draw(); };
  $('#of-pick', f).addEventListener('input', e => { e.stopPropagation(); const cb = e.target.closest('input[type=checkbox]'); if (!cb) return; chosen = cb.checked ? [...chosen, cb.value].slice(0, 6) : chosen.filter(x => x !== cb.value); draw(); });
  $('#of-pick', f).addEventListener('change', e => e.stopPropagation());
  $('#of-chosen', f).addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { chosen = chosen.filter(x => x !== b.dataset.rm); draw(); } });
  $('#of-find', f).addEventListener('input', e => { e.stopPropagation(); drawPick(); });
  $('#of-gen', f).onclick = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const r = crypto.getRandomValues(new Uint8Array(6)); $('#of-code', f).value = 'LIB' + [...r].map(x => A[x % A.length]).join(''); draw(); };
  f.addEventListener('input', draw); f.addEventListener('change', draw);
  f.onsubmit = async e => {
    e.preventDefault();
    const err = $('#of-err', f), fail = m => { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: 'center' }); };
    err.hidden = true;
    const k = kind(), conf = cfg();
    if (k === 'bundle' && conf.book_ids.length < 2) return fail(t('of.needBooks'));
    if ((k === 'bundle' || k === 'category') && !(conf.percent > 0 && conf.percent <= 90)) return fail(t('of.badPct'));
    if (k === 'qty' && !conf.tiers.length) return fail(t('of.needTier'));
    if (k === 'coupon') {
      if (!/^[A-Z0-9_-]{3,30}$/.test(conf.code)) return fail(t('of.badCode'));
      if (all.some(x => x.kind === 'coupon' && x.id !== o.id && String(x.config?.code || '').toUpperCase() === conf.code)) return fail(t('of.dupCode'));
      if (!conf.amount_cents && !(conf.percent > 0 && conf.percent <= 90)) return fail(t('of.badPct'));
    }
    const s0 = v('#of-start'), s1 = v('#of-end');
    if (s0 && s1 && new Date(s1) <= new Date(s0)) return fail(t('pr.badDates'));
    const row = { kind: k, name: v('#of-name') || null, config: conf, starts_at: s0 ? new Date(s0).toISOString() : null, ends_at: s1 ? new Date(s1).toISOString() : null,
      stackable: $('#of-stack', f).checked, show_badge: $('#of-badge', f).checked, active: $('#of-active', f).checked, priority: o.priority || 0 };
    if (o.id) row.id = o.id;
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    try { await api.saveOffer(row); toast(t('of.saved')); go('/admin/offers'); } catch (x) { fail(errText(x)); btn.disabled = false; }
  };
  drawTiers(); draw();
}

// ---------------------------------------------------------------- statistics: visitors, sources, countries, searches, books, sales funnel
const FLAG = cc => cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : '🌐';
// builds the tracked link for a campaign (what the visitor sees is just a normal link to the shop)
function utmMaker(root) {
  const src = $('#utm-src', root), name = $('#utm-name', root), out = $('#utm-link', root), copy = $('#utm-copy', root), page = $('#utm-page', root);
  if (!src) return;
  const slug = v => norm(v).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const make = () => { const p = new URLSearchParams({ utm_source: src.value === 'other' ? 'altro' : src.value }); const c = slug(name.value); if (c) p.set('utm_campaign', c); const pg = page?.value || ''; out.textContent = 'https://librava.store/' + (pg ? 'book/' + pg + '/' : '') + '?' + p.toString(); };
  if (page) page.onchange = make;
  src.onchange = make; name.oninput = make; make();
  copy.onclick = async () => { try { await navigator.clipboard.writeText(out.textContent); } catch { const r = document.createRange(); r.selectNodeContents(out); getSelection().removeAllRanges(); getSelection().addRange(r); document.execCommand('copy'); } toast(t('st.c.copied')); };
}

async function statsAdmin(body, days = +(sessionStorage.getItem('librava:stDays') || 30)) {
  body.innerHTML = `<div class="panel"><div class="spinner"></div></div>`;
  let d;
  let utmBooks = [];
  try { d = await api.analytics(days); } catch (x) { body.innerHTML = `<div class="panel">${esc(errText(x))}</div>`; return; }
  try { utmBooks = (await api.adminBooks()).filter(b => b.status !== 'draft').sort((a, b) => String(a.title).localeCompare(b.title)); } catch { }
  const n = v => new Intl.NumberFormat(getLang()).format(v || 0);
  const pct = (a, b) => b ? (a / b * 100).toFixed(1).replace('.', ',') + '%' : '—';
  const delta = (now, before) => { if (!before) return ''; const ch = Math.round((now - before) / before * 100); return `<span class="st-delta ${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch)}%</span>`; };
  const conv = d.sessions ? d.orders / d.sessions : 0;
  const kpi = (label, val, extra = '', help = '') => `<div class="st-kpi" title="${esc(help)}"><small>${esc(label)}</small><b>${val}</b>${extra}</div>`;
  const maxV = Math.max(1, ...d.daily.map(x => x.visitors)), maxR = Math.max(1, ...d.daily.map(x => x.revenue));
  const chart = (key, max, color, fmt) => `<div class="st-chart" role="img" aria-label="${esc(t('st.' + key))}">${d.daily.map(x => `<div class="st-bar" style="--h:${(x[key] / max * 100).toFixed(1)}%;--c:${color}"><span class="st-tip">${esc(fmtDate(x.day))}<br><b>${fmt(x[key])}</b></span></div>`).join('')}</div>
    <div class="st-axis"><span>${esc(fmtDate(d.daily[0]?.day))}</span><span>${esc(fmtDate(d.daily[d.daily.length - 1]?.day))}</span></div>`;
  const list = (items, label, fmtK = k => esc(k)) => { const max = Math.max(1, ...items.map(x => x.n)); const tot = items.reduce((a, x) => a + x.n, 0);
    return items.length ? `<ul class="st-list">${items.map(x => `<li><span class="st-k">${fmtK(x.k, x)}</span><span class="st-v">${n(x.n)} <small>${pct(x.n, tot)}</small></span><i style="width:${(x.n / max * 100).toFixed(1)}%"></i></li>`).join('')}</ul>` : `<p class="muted">${esc(t('st.noData'))}</p>`; };
  const srcName = k => esc({ direct: t('st.direct'), google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo', yahoo: 'Yahoo', ecosia: 'Ecosia', yandex: 'Yandex', facebook: 'Facebook', instagram: 'Instagram', whatsapp: 'WhatsApp', tiktok: 'TikTok', youtube: 'YouTube', pinterest: 'Pinterest', x: 'X / Twitter', telegram: 'Telegram', chatgpt: 'ChatGPT', 'google-ads': 'Google Ads' }[k] || k);
  const f = d.funnel, steps = [['sessions', f.sessions], ['book_view', f.book_view], ['add_cart', f.add_cart], ['checkout', f.checkout], ['paid', f.paid]];
  const bookRows = (d.books || []).filter(b => b.views || b.sold || b.carts);
  body.innerHTML = `<div class="panel st-head"><div><h2 class="section-title" style="font-size:19px;margin:0">${esc(t('st.title'))}</h2><p class="muted" style="margin:4px 0 0;max-width:80ch">${esc(t('st.help'))}</p></div>
      <div class="seg" role="group">${[1, 7, 30, 90, 365].map(x => `<button type="button" data-days="${x}" class="${x === days ? 'on' : ''}">${esc(x === 1 ? t('st.today') : t('st.days', { n: x }))}</button>`).join('')}</div></div>
    <div class="st-kpis">
      ${kpi(t('st.visitors'), n(d.visitors), delta(d.visitors, d.prev_visitors) + (d.bots ? `<small class="muted" style="display:block">${esc(t('st.bots', { n: n(d.bots) }))}</small>` : ''), t('st.visitorsHelp'))}
      ${kpi(t('st.sessions'), n(d.sessions), delta(d.sessions, d.prev_sessions))}
      ${kpi(t('st.pageviews'), n(d.pageviews), `<small class="muted">${d.sessions ? (d.pageviews / d.sessions).toFixed(1).replace('.', ',') : '0'} / ${esc(t('st.perVisit'))}</small>`)}
      ${kpi(t('st.orders'), n(d.orders), delta(d.orders, d.prev_orders))}
      ${kpi(t('st.revenue'), money(d.revenue), delta(d.revenue, d.prev_revenue))}
      ${kpi(t('st.conversion'), pct(d.orders, d.sessions), '', t('st.conversionHelp'))}
      ${kpi(t('st.aov'), d.orders ? money(Math.round(d.revenue / d.orders)) : '—')}
      ${kpi(t('st.discounts'), money(d.discounts))}
    </div>
    <div class="st-grid">
      <section class="panel st-wide"><h3>${esc(t('st.visitorsDay'))}</h3>${chart('visitors', maxV, 'var(--pista-strong)', n)}</section>
      <section class="panel st-wide"><h3>${esc(t('st.revenueDay'))}</h3>${chart('revenue', maxR, '#E8A33D', v => money(v))}</section>
      <section class="panel st-wide"><h3>${esc(t('st.funnel'))}</h3><p class="muted st-sub">${esc(t('st.funnelHelp'))}</p>
        <div class="st-funnel">${steps.map(([k, v], i) => `<div class="st-step"><span>${esc(t('st.f.' + k))}</span><div class="st-fbar"><i style="width:${(v / Math.max(1, f.sessions) * 100).toFixed(1)}%"></i></div><b>${n(v)}</b><small>${i ? pct(v, steps[i - 1][1]) : ''}</small></div>`).join('')}</div></section>
      <section class="panel"><h3>${esc(t('st.sources'))}</h3><p class="muted st-sub">${esc(t('st.sourcesHelp'))}</p>${list(d.sources, '', srcName)}</section>
      <section class="panel"><h3>${esc(t('st.countries'))}</h3>${list(d.countries, '', k => `${FLAG(k)} ${esc(k === '?' ? t('st.unknown') : (() => { try { return new Intl.DisplayNames([getLang()], { type: 'region' }).of(k); } catch { return k; } })())}`)}</section>
      <section class="panel"><h3>${esc(t('st.langs'))}</h3>${list(d.langs, '', k => esc(k === '?' ? t('st.unknown') : langName(k)))}</section>
      <section class="panel"><h3>${esc(t('st.devices'))}</h3>${list(d.devices, '', k => esc(t('st.dev.' + k)))}</section>
      <section class="panel"><h3>${esc(t('st.searches'))}</h3><p class="muted st-sub">${esc(t('st.searchesHelp'))}</p>${list(d.searches, '', (k, x) => `${esc(k)}${x.zero ? ` <span class="st-zero">${esc(t('st.zero'))}</span>` : ''}`)}</section>
      <section class="panel"><h3>${esc(t('st.campaigns'))}</h3><p class="muted st-sub">${esc(t('st.campaignsHelp'))}</p>
        <div class="utm-make">
          <label class="field"><span>${esc(t('st.c.source'))}</span><select class="input" id="utm-src">${['instagram', 'facebook', 'tiktok', 'youtube', 'pinterest', 'whatsapp', 'email', 'other'].map(k => `<option value="${k}">${esc(k === 'other' ? t('st.c.other') : k === 'email' ? 'E-mail' : k === 'tiktok' ? 'TikTok' : k === 'youtube' ? 'YouTube' : k === 'whatsapp' ? 'WhatsApp' : k[0].toUpperCase() + k.slice(1))}</option>`).join('')}</select></label>
          <label class="field"><span>${esc(t('st.c.page'))}</span><select class="input" id="utm-page"><option value="">${esc(t('st.c.home'))}</option>${(utmBooks || []).map(b => `<option value="${esc(b.id)}">${esc(b.title)}</option>`).join('')}</select></label>
          <label class="field"><span>${esc(t('st.c.name'))}</span><input class="input" id="utm-name" maxlength="40" placeholder="${esc(t('st.c.namePh'))}"></label>
          <div class="utm-out"><small class="muted">${esc(t('st.c.link'))}</small><div class="utm-link"><code id="utm-link"></code><button type="button" class="btn btn-sm btn-dark" id="utm-copy">${esc(t('st.c.copy'))}</button></div></div>
        </div>
        ${list(d.campaigns, '')}</section>
      <section class="panel st-wide"><h3>${esc(t('st.books'))}</h3>${bookRows.length ? `<div class="table-scroll"><table class="adm-table"><thead><tr><th>${esc(t('admin.colTitle'))}</th><th class="num">${esc(t('st.b.views'))}</th><th class="num">${esc(t('st.b.samples'))}</th><th class="num">${esc(t('st.b.carts'))}</th><th class="num">${esc(t('st.b.sold'))}</th><th class="num">${esc(t('st.conversion'))}</th></tr></thead><tbody>
        ${bookRows.map(b => `<tr><td><a href="#/book/${esc(b.id)}">${esc(b.title)}</a> <small class="muted">${esc((b.lang || '').toUpperCase())}</small></td><td class="num">${n(b.views)}</td><td class="num">${n(b.samples)}</td><td class="num">${n(b.carts)}</td><td class="num">${n(b.sold)}</td><td class="num">${pct(b.sold, b.views)}</td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">${esc(t('st.noData'))}</p>`}</section>
      <section class="panel"><h3>${esc(t('st.pages'))}</h3>${list(d.pages, '')}</section>
      <section class="panel"><h3>${esc(t('st.hours'))}</h3><div class="st-hours">${Array.from({ length: 24 }, (_, h) => { const v = (d.hours.find(x => x.h === h) || { n: 0 }).n, mx = Math.max(1, ...d.hours.map(x => x.n)); return `<div class="st-bar" style="--h:${(v / mx * 100).toFixed(1)}%;--c:var(--pista-strong)"><span class="st-tip">${h}:00<br><b>${n(v)}</b></span></div>`; }).join('')}</div><div class="st-axis"><span>0:00</span><span>12:00</span><span>23:00</span></div></section>
      <section class="panel st-wide st-google"><h3>${esc(t('st.google'))}</h3><p>${esc(t('st.googleHelp'))}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-dark" href="https://search.google.com/search-console" target="_blank" rel="noopener">Google Search Console</a><a class="btn btn-ghost" href="https://www.bing.com/webmasters" target="_blank" rel="noopener">Bing Webmaster Tools</a><a class="btn btn-ghost" href="/sitemap.xml" target="_blank" rel="noopener">sitemap.xml</a></div></section>
    </div>`;
  $$('[data-days]', body).forEach(b => b.onclick = () => { sessionStorage.setItem('librava:stDays', b.dataset.days); statsAdmin(body, +b.dataset.days); });
  utmMaker(body);
}

// ---------------------------------------------------------------- company details (shown on the legal pages)
async function settingsAdmin(body) {
  const c = (await api.getSetting('company')) || {};
  const f = (k, label, ph = '') => `<label class="field"><span>${esc(label)}</span><input id="c-${k}" maxlength="200" value="${esc(c[k] || '')}" placeholder="${esc(ph)}"></label>`;
  body.innerHTML = `<form class="panel" id="set-form" style="display:flex;flex-direction:column;gap:12px;max-width:640px">
    <h2 class="section-title" style="font-size:19px;margin:0">${esc(t('set.company'))}</h2>
    <p class="muted" style="margin:0">${esc(t('set.companyHelp'))}</p>
    ${f('company', t('set.name'), 'Ion Bondari / Librava S.R.L.')}
    ${f('address', t('set.address'), 'Via …, 00000 Città')}
    ${f('country', t('set.country'), 'Italia')}
    ${f('vat', t('set.vat'), 'IT01234567890')}
    ${f('email', t('set.email'), 'contact@librava.store')}
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-buy" type="submit">${esc(t('acc.save'))}</button><a class="btn btn-ghost" href="#/legal/imprint">${esc(t('set.view'))}</a></div>
  </form>`;
  // order of the categories on the home page and in the top bar
  const cur = (await api.getSetting('home_cats'))?.order || [];
  let order = [...cur.filter(c => CATS.includes(c)), ...CATS.filter(c => !cur.includes(c))];
  const box = document.createElement('form'); box.className = 'panel'; box.style.cssText = 'display:flex;flex-direction:column;gap:12px;max-width:640px;margin-top:16px';
  body.appendChild(box);
  const draw = () => {
    box.innerHTML = `<h2 class="section-title" style="font-size:19px;margin:0">${esc(t('set.catOrder'))}</h2>
      <p class="muted" style="margin:0">${esc(t('set.catOrderHelp'))}</p>
      <ol style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px">${order.map((c, i) => `<li style="display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--line,#d8ddd2);border-radius:10px">
        <b style="width:26px;color:var(--muted,#667)">${i + 1}</b><span style="flex:1">${esc(t('cat.' + c))}</span>
        <button type="button" class="btn btn-ghost btn-sm" data-up="${i}" ${i ? '' : 'disabled'} aria-label="↑">↑</button>
        <button type="button" class="btn btn-ghost btn-sm" data-top="${i}" ${i ? '' : 'disabled'}>⇈</button>
        <button type="button" class="btn btn-ghost btn-sm" data-down="${i}" ${i < order.length - 1 ? '' : 'disabled'} aria-label="↓">↓</button></li>`).join('')}</ol>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-buy" type="submit">${esc(t('acc.save'))}</button><button type="button" class="btn btn-ghost" data-reset>${esc(t('set.catReset'))}</button></div>`;
    const mv = (i, j) => { const x = order.splice(i, 1)[0]; order.splice(j, 0, x); draw(); };
    $$('[data-up]', box).forEach(b => b.onclick = () => mv(+b.dataset.up, +b.dataset.up - 1));
    $$('[data-down]', box).forEach(b => b.onclick = () => mv(+b.dataset.down, +b.dataset.down + 1));
    $$('[data-top]', box).forEach(b => b.onclick = () => mv(+b.dataset.top, 0));
    $('[data-reset]', box).onclick = () => { order = [...CATS]; draw(); };
  };
  draw();
  box.onsubmit = async e => {
    e.preventDefault();
    try { await api.saveSetting('home_cats', { order }); try { localStorage.removeItem('librava:catorder'); } catch { } toast(t('acc.saved')); } catch (x) { toast(errText(x), { error: true }); }
  };
  // free preview length: one number for every PDF, one for every EPUB
  if (api.replaceSample) {
    const sp = (await api.getSetting('sample_pages')) || {};
    const pbox = document.createElement('form'); pbox.className = 'panel'; pbox.style.cssText = 'display:flex;flex-direction:column;gap:12px;max-width:640px;margin-top:16px';
    body.appendChild(pbox);
    pbox.innerHTML = `<h2 class="section-title" style="font-size:19px;margin:0">${esc(t('sp.title'))}</h2>
      <p class="muted" style="margin:0">${esc(t('sp.help'))}</p>
      <div class="two"><label class="field"><span>${esc(t('sp.pdf'))}</span><input id="sp-pdf" type="number" min="1" max="200" value="${esc(sp.pdf || 12)}"></label>
        <label class="field"><span>${esc(t('sp.epub'))}</span><input id="sp-epub" type="number" min="1" max="200" value="${esc(sp.epub || 12)}"></label></div>
      <small class="muted">${esc(t('sp.safe'))}</small>
      <div class="progress" id="sp-bar" hidden><i style="width:0"></i></div><div class="muted" id="sp-msg" aria-live="polite"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-buy" type="submit" id="sp-go">${esc(t('sp.apply'))}</button><button class="btn btn-ghost" type="button" id="sp-stop" hidden>${esc(t('sp.stop'))}</button></div>`;
    let stop = false;
    $('#sp-stop', pbox).onclick = () => { stop = true; };
    pbox.onsubmit = async e => {
      e.preventDefault();
      const n = k => Math.max(1, Math.min(200, parseInt($('#sp-' + k, pbox).value, 10) || 12)), want = { pdf: n('pdf'), epub: n('epub') };
      const all = (await api.adminBooks()).filter(b => !b.deleted_at && b.file_path && (b.format === 'pdf' || b.format === 'epub'));
      // a preview is never more than half of a short book
      const target = b => Math.max(1, Math.min(want[b.format], b.pages ? Math.floor(b.pages / 2) : want[b.format]));
      const todo = all.filter(b => !b.sample_path || +b.sample_pages !== target(b));
      await api.saveSetting('sample_pages', want);
      if (!todo.length) { toast(t('sp.nothing')); return; }
      if (!await confirmBox(t('sp.confirm', { n: todo.length, pdf: want.pdf, epub: want.epub }), { ok: t('sp.apply') })) return;
      stop = false; const bar = $('#sp-bar', pbox), msg = $('#sp-msg', pbox), go = $('#sp-go', pbox), st = $('#sp-stop', pbox);
      go.disabled = true; st.hidden = false; bar.hidden = false;
      let ok = 0, bad = 0;
      for (const [i, b] of todo.entries()) {
        if (stop) break;
        msg.textContent = t('sp.progress', { i: i + 1, n: todo.length, title: b.title });
        try {
          const full = await api.fullFileFor(b), pg = target(b);
          const r = await makeSample(full, pg);
          await api.replaceSample(b, r.file, pg); ok++;
        } catch (x) { bad++; console.warn('sample not rebuilt', b.id, x); }
        bar.firstElementChild.style.width = Math.round((i + 1) / todo.length * 100) + '%';
      }
      go.disabled = false; st.hidden = true;
      msg.textContent = t(stop ? 'sp.stopped' : 'sp.done', { ok, bad });
    };
  }
  $('#set-form', body).onsubmit = async e => {
    e.preventDefault();
    const v = {}; for (const k of ['company', 'address', 'country', 'vat', 'email']) v[k] = $('#c-' + k, body).value.trim();
    try { await api.saveSetting('company', v); resetCompanyCache(); toast(t('acc.saved')); } catch (x) { toast(errText(x), { error: true }); }
  };
}
