// =====================================================================
//  ADMIN PANEL: overview, books, add/edit, orders, customers, reviews
// =====================================================================
import { CONFIG } from './config.js?v=20261019185522';
import { t, money, fmtDate, getLang, langName, LANGS } from './i18n.js?v=20261019185522';
import { esc, $, $$, loadScript, norm, debounce } from './util.js?v=20261019185522';
import { api } from './api.js?v=20261019185522';
import { icon, go, toast, coverHTML, confirmBox, errText, CATS, modal, stars } from './ui.js?v=20261019185522';

const TABS = [
  ['overview', '/admin', 'chart', 'admin.tab.overview'],
  ['books', '/admin/books', 'library', 'admin.books'],
  ['new', '/admin/new', 'plus', 'admin.add'],
  ['orders', '/admin/orders', 'box', 'admin.tab.orders'],
  ['customers', '/admin/customers', 'user', 'admin.tab.customers'],
  ['reviews', '/admin/reviews', 'eye', 'admin.tab.reviews'],
];
const full = !!api.adminOverview; // the extended panel needs these data methods

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
  el.innerHTML = `<div class="wrap page adm" style="max-width:1200px">
    <div class="adm-head"><h1>${esc(t('admin.title'))}</h1><a class="btn btn-buy btn-sm" href="#/admin/new">${icon('plus')} ${esc(t('admin.add'))}</a></div>
    ${api.isDemo ? `<div class="demo-note" style="margin-bottom:14px">${esc(t('admin.demoNote'))}</div>` : ''}
    <nav class="tabs adm-tabs" aria-label="${esc(t('admin.title'))}">
      ${TABS.map(([k, href, ic, label]) => `<a class="${k === active ? 'on' : ''}" href="#${href}" ${k === active ? 'aria-current="page"' : ''}>${icon(ic, 'ico')} ${esc(tab === 'edit' && k === 'new' ? t('admin.edit') : t(label))}</a>`).join('')}
    </nav>
    <div id="adm-body"></div>
  </div>`;
  const body = $('#adm-body', el);
  switch (tab) {
    case 'new': return bookForm(body, null);
    case 'edit': { const list = await api.adminBooks(); return bookForm(body, list.find(b => b.id === parts[1]) || null, Math.min(3, Math.max(1, parseInt(parts[2]) || 1))); }
    case 'books': return booksList(body);
    case 'orders': return orders(body, parts[1] || 'pending');
    case 'customers': return parts[1] ? customer(body, parts[1]) : customers(body);
    case 'reviews': return reviews(body);
    default: return overview(body);
  }
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

// ---------------------------------------------------------------- books
async function booksList(body) {
  const books = await api.adminBooks();
  if (!books.length) {
    body.innerHTML = `<div class="panel empty">${icon('book')}<p>${esc(t('admin.empty'))}</p><a class="btn btn-buy" href="#/admin/new">${esc(t('admin.add'))}</a></div>`;
    return;
  }
  const langs = [...new Set(books.map(b => b.language))];
  body.innerHTML = `<div class="panel">
    <div class="adm-filters">
      <input class="input" id="adm-q" type="search" placeholder="${esc(t('admin.search'))}" aria-label="${esc(t('admin.search'))}">
      <select class="input" id="adm-st" aria-label="${esc(t('admin.colStatus'))}"><option value="">${esc(t('admin.filter.all'))}</option><option value="published">${esc(t('admin.filter.published'))}</option><option value="draft">${esc(t('admin.filter.draft'))}</option></select>
      <select class="input" id="adm-lang" aria-label="${esc(t('search.bookLang'))}"><option value="">${esc(t('lang.all'))}</option>${langs.map(l => `<option value="${l}">${esc(langName(l))}</option>`).join('')}</select>
      <select class="input" id="adm-cat" aria-label="${esc(t('search.category'))}"><option value="">${esc(t('search.any'))}</option>${CATS.map(c => `<option value="${c}">${esc(t('cat.' + c))}</option>`).join('')}</select>
    </div>
    <div class="table-wrap"><table class="adm-table">
      <thead><tr><th>${esc(t('admin.colTitle'))}</th><th class="num">${esc(t('admin.colPrice'))}</th><th class="num">${esc(t('admin.colSales'))}</th><th class="num">${esc(t('admin.colRevenue'))}</th><th>${esc(t('admin.colRating'))}</th><th>${esc(t('admin.colStatus'))}</th><th></th></tr></thead>
      <tbody>${books.map(b => `<tr data-row data-q="${esc(norm(b.title + ' ' + b.author))}" data-st="${b.status}" data-lang="${b.language}" data-cat="${b.category}">
        <td><div class="adm-book">${coverHTML(b, { badge: false })}<div style="min-width:0"><b>${esc(b.title)}</b><div class="muted" style="font-size:13px">${esc(b.author)} · ${esc(t('cat.' + b.category))} · ${esc(String(b.file_path || b.file_name ? b.format || '' : '—').toUpperCase())} · ${esc(String(b.language || '').toUpperCase())}</div>
          <div class="shelf-links">${b.status !== 'published' ? `<a class="continue" href="#/admin/edit/${encodeURIComponent(b.id)}">${esc(t('kdp.continueSetup'))} →</a>` : ''}${[1, 2, 3].map(n => `<a href="#/admin/edit/${encodeURIComponent(b.id)}/${n}">${esc(t('kdp.edit' + n))}</a>`).join('')}</div></div></div></td>
        <td class="num">${b.price_cents ? money(b.price_cents) : esc(t('book.free'))}</td>
        <td class="num">${b.sales_count || 0}</td>
        <td class="num">${money(b.revenue_cents || 0)}</td>
        <td style="white-space:nowrap">${b.rating_count ? `${stars(b.rating_avg)} <span class="muted">${b.rating_count}</span>` : '<span class="muted">—</span>'}</td>
        <td><button class="status ${b.status === 'published' ? 'live' : 'draft'} status-btn" data-toggle="${esc(b.id)}" data-next="${b.status === 'published' ? 'draft' : 'published'}" title="${esc(b.status === 'published' ? t('admin.unpublish') : t('admin.publish'))}">${esc(b.status === 'published' ? t('admin.live') : t('admin.draft'))}</button></td>
        <td class="row-actions">
          <a class="btn btn-ghost btn-sm" href="#/admin/edit/${encodeURIComponent(b.id)}" title="${esc(t('admin.edit'))}">${icon('edit', 'ico')}<span class="sr">${esc(t('admin.edit'))}</span></a>
          <a class="btn btn-ghost btn-sm" href="#/book/${encodeURIComponent(b.id)}" title="${esc(t('admin.viewStore'))}">${icon('eye', 'ico')}<span class="sr">${esc(t('admin.viewStore'))}</span></a>
          <button class="btn btn-ghost btn-sm" data-del="${esc(b.id)}" title="${esc(t('admin.delete'))}">${icon('trash', 'ico')}<span class="sr">${esc(t('admin.delete'))}</span></button>
        </td></tr>`).join('')}</tbody>
    </table></div></div>`;
  const apply = () => {
    const q = norm($('#adm-q', body).value), st = $('#adm-st', body).value, l = $('#adm-lang', body).value, c = $('#adm-cat', body).value;
    $$('[data-row]', body).forEach(r => { r.hidden = (q && !r.dataset.q.includes(q)) || (st && r.dataset.st !== st) || (l && r.dataset.lang !== l) || (c && r.dataset.cat !== c); });
  };
  ['#adm-q', '#adm-st', '#adm-lang', '#adm-cat'].forEach(s => $(s, body).addEventListener('input', apply));
  $$('[data-toggle]', body).forEach(btn => btn.onclick = async () => {
    if (!api.setBookStatus) return;
    try { await api.setBookStatus(btn.dataset.toggle, btn.dataset.next); toast(t(btn.dataset.next === 'published' ? 'admin.nowPublished' : 'admin.nowHidden')); booksList(body); }
    catch (e) { toast(errText(e), { error: true }); }
  });
  $$('[data-del]', body).forEach(btn => btn.onclick = async () => {
    const b = books.find(x => x.id === btn.dataset.del);
    if (!await confirmBox(t('admin.confirmDelete', { title: b.title }), { ok: t('admin.delete'), danger: true })) return;
    try { await api.deleteBook(b.id); toast(t('admin.deleted')); booksList(body); } catch (e) { toast(errText(e), { error: true }); }
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
        <td style="white-space:nowrap">${esc(methodLabel(o.method))}<div><span class="status ${o.status === 'paid' ? 'live' : 'draft'}">${esc(t('admin.ord.' + o.status))}</span></div></td>
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

// ---------------------------------------------------------------- customers
async function customers(body) {
  body.innerHTML = `<div class="panel">
    <div class="adm-filters"><input class="input" id="cu-q" type="search" placeholder="${esc(t('admin.searchCustomers'))}" aria-label="${esc(t('admin.searchCustomers'))}"></div>
    <div id="cu-list"><div class="spinner"></div></div></div>`;
  const draw = async () => {
    const list = await api.adminCustomers($('#cu-q', body).value.trim());
    $('#cu-list', body).innerHTML = list.length ? `<div class="table-wrap"><table class="adm-table">
      <thead><tr><th>${esc(t('admin.colCustomer'))}</th><th>${esc(t('admin.colJoined'))}</th><th class="num">${esc(t('admin.colBooks'))}</th><th class="num">${esc(t('admin.colSpent'))}</th><th>${esc(t('admin.colLast'))}</th></tr></thead>
      <tbody>${list.map(c => `<tr class="click-row" data-href="/admin/customers/${encodeURIComponent(c.id)}">
        <td><a href="#/admin/customers/${encodeURIComponent(c.id)}"><b>${esc(c.name || c.email)}</b></a>${c.isAdmin ? ` <span class="status live">${esc(t('admin.roleAdmin'))}</span>` : ''}<div class="muted" style="font-size:13px">${esc(c.email)}</div></td>
        <td style="white-space:nowrap">${esc(fmtDate(c.created_at))}</td>
        <td class="num">${c.books}</td><td class="num">${esc(money(c.spent_cents))}</td>
        <td style="white-space:nowrap">${c.last_at ? esc(fmtDate(c.last_at)) : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>`
      : `<p class="muted" style="margin:0">${esc(t('admin.noCustomers'))}</p>`;
    $$('.click-row', body).forEach(r => r.addEventListener('click', e => { if (!e.target.closest('a')) go(r.dataset.href); }));
  };
  $('#cu-q', body).addEventListener('input', debounce(draw, 250));
  draw();
}

async function customer(body, id) {
  const cid = /^\d+$/.test(id) ? Number(id) : id;
  const d = await api.adminCustomer(cid);
  const c = d.customer;
  const owned = new Set(d.purchases.map(p => p.book.id));
  const catalog = (await api.adminBooks()).filter(b => !owned.has(b.id));
  body.innerHTML = `<a class="back-link" href="#/admin/customers">${icon('chevL', 'ico')} ${esc(t('admin.backCustomers'))}</a>
    <section class="panel"><h2 style="font-size:22px">${esc(c.name || c.email)} ${c.isAdmin ? `<span class="status live">${esc(t('admin.roleAdmin'))}</span>` : ''}</h2>
      <p class="muted" style="margin:4px 0 0"><span style="user-select:all">${esc(c.email)}</span> · ${esc(t('acc.memberSince', { date: fmtDate(c.created_at) }))}</p></section>
    <section class="panel" style="margin-top:14px"><h2 class="section-title" style="font-size:17px;margin-bottom:8px">${esc(t('admin.customerBooks'))} (${d.purchases.length})</h2>
      ${d.purchases.length ? d.purchases.map(p => `<div class="adm-line"><span class="adm-book">${coverHTML(p.book, { badge: false })}<span><b>${esc(p.book.title)}</b><small class="muted">${esc(fmtDate(p.created_at))} · ${p.price_cents ? esc(money(p.price_cents, cur(p.currency))) : esc(p.gift ? t('admin.gift') : t('book.free'))}</small></span></span>
        <button class="btn btn-ghost btn-sm" data-revoke="${esc(p.book.id)}" data-title="${esc(p.book.title)}">${esc(t('admin.revoke'))}</button></div>`).join('') : `<p class="muted">${esc(t('lib.empty'))}</p>`}
    </section>
    <section class="panel" style="margin-top:14px"><h2 class="section-title" style="font-size:17px;margin-bottom:6px">${esc(t('admin.grant'))}</h2>
      <p class="muted" style="margin:0 0 10px;font-size:14px">${esc(t('admin.grantHelp'))}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><select class="input" id="gr-book" style="flex:1;min-width:220px" aria-label="${esc(t('admin.chooseBook'))}"><option value="">${esc(t('admin.chooseBook'))}…</option>${catalog.map(b => `<option value="${esc(b.id)}">${esc(b.title)} (${esc(b.language.toUpperCase())})</option>`).join('')}</select>
      <button class="btn btn-buy" data-grant>${esc(t('admin.grant'))}</button></div>
    </section>
    ${d.orders.length ? `<section class="panel" style="margin-top:14px"><h2 class="section-title" style="font-size:17px;margin-bottom:8px">${esc(t('admin.customerOrders'))}</h2>
      ${d.orders.map(o => `<div class="adm-line"><span><b>${esc(o.reference)}</b><small class="muted">${esc(fmtDate(o.created_at))} · ${esc(methodLabel(o.method))} · ${esc(t('admin.ord.' + o.status))}</small></span><b class="num">${esc(money(o.amount_cents, cur(o.currency)))}</b></div>`).join('')}</section>` : ''}`;
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
  const list = await api.adminReviews();
  body.innerHTML = `<div class="panel">${list.length ? list.map(r => `<div class="review adm-review">
      <div class="who" style="justify-content:space-between;flex-wrap:wrap"><span style="display:flex;gap:10px;align-items:center"><span class="avatar">${esc((r.author_name || '?').slice(0, 1).toUpperCase())}</span><span>${esc(r.author_name || '')}<small class="muted" style="display:block;font-weight:400">${esc(r.email || '')}</small></span></span>
        <button class="btn btn-ghost btn-sm" data-delrev="${esc(r.id)}" data-name="${esc(r.author_name || '')}">${icon('trash', 'ico')} ${esc(t('admin.deleteReview'))}</button></div>
      <div class="rating-line" style="margin-top:6px">${stars(r.rating)} <a href="#/book/${encodeURIComponent(r.book_id)}">${esc(r.book_title)}</a> <span class="muted">· ${esc(fmtDate(r.created_at))}</span></div>
      ${r.body ? `<p>${esc(r.body)}</p>` : ''}</div>`).join('') : `<p class="muted" style="margin:0">${esc(t('admin.noReviews'))}</p>`}</div>`;
  $$('[data-delrev]', body).forEach(b => b.onclick = async () => {
    if (!await confirmBox(t('admin.confirmDeleteReview', { name: b.dataset.name }), { ok: t('admin.deleteReview'), danger: true })) return;
    try { await api.deleteReview(b.dataset.delrev); toast(t('admin.reviewDeleted')); reviews(body); } catch (e) { toast(errText(e), { error: true }); }
  });
}

// ---------------------------------------------------------------- publish an eBook (3 steps, like KDP)
const ROLES = ['author', 'illustrator', 'translator', 'editor', 'foreword', 'photographer'];
function bookForm(body, b, startStep = 1) {
  const v = b ? { ...b } : { language: getLang(), status: 'draft', price_cents: null, category: 'fiction', categories: [], contributors: [], keywords: [], rights: 'own', adult: false, published_at: new Date().toISOString().slice(0, 10) };
  let bookId = v.id || null;
  let step = startStep;
  const files = { cover: null, file: null, sample: null };
  const eur = c => c ? (c / 100).toFixed(2) : '';
  const [first0, ...rest0] = String(v.author || '').trim().split(/\s+/);
  const kws = [...(v.keywords || []), '', '', '', '', '', '', ''].slice(0, 7);
  const secCats = (v.categories || []).filter(c => c !== v.category);
  const contribRow = (c = {}) => `<div class="contrib-row"><select class="c-role input" aria-label="${esc(t('kdp.role'))}">${ROLES.map(r => `<option value="${r}" ${c.role === r ? 'selected' : ''}>${esc(t('kdp.role.' + r))}</option>`).join('')}</select>
    <input class="c-name input" maxlength="120" placeholder="${esc(t('kdp.fullName'))}" value="${esc(c.name || '')}"><button type="button" class="btn btn-ghost btn-sm" data-rm-contrib aria-label="${esc(t('admin.delete'))}">✕</button></div>`;

  body.innerHTML = `<form id="bk-form" class="kdp" novalidate>
    <div class="kdp-top"><div><span class="muted">${esc(b ? t('kdp.editing') : t('kdp.newEbook'))}</span><h2 id="kdp-title">${esc(v.title || t('kdp.untitled'))}</h2></div>
      <span class="status ${v.status === 'published' ? 'live' : 'draft'}" id="kdp-status">${esc(v.status === 'published' ? t('kdp.live') : t('kdp.draft'))}</span></div>
    <nav class="kdp-tabs" role="tablist">${[1, 2, 3].map(n => `<button type="button" role="tab" class="kdp-tab" data-step="${n}"><b>${esc(t('kdp.tab' + n))}</b><span class="kdp-state" id="st-${n}"></span></button>`).join('')}</nav>

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
        <div class="kdp-fields"><textarea id="f-description" class="input" maxlength="4000" rows="9">${esc(v.description || '')}</textarea><small class="muted" id="desc-count"></small></div></div>
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
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('kdp.manuscript'))}</h3><p>${esc(t('admin.f.fileHelp'))}</p></div>
        <div class="kdp-fields"><label class="drop" data-drop="file">${icon('file')}<span><span class="fname" id="n-file">${v.file_name || v.file_path ? esc(t('admin.f.fileKeep', { name: v.file_name || String(v.file_path).split('/').pop() })) : esc(t('kdp.uploadManuscript'))}</span><br><small>EPUB / PDF · max 500 MB</small></span><input type="file" id="f-file" accept=".epub,.pdf,application/epub+zip,application/pdf"></label>
          <div class="kdp-ok" id="file-ok" ${v.file_path || v.file_name ? '' : 'hidden'}>✓ ${esc(t('kdp.manuscriptOk'))}</div>
          <p class="kdp-note">${icon('shield')} ${esc(t('kdp.drm'))}</p></div></div>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('admin.f.cover'))}</h3><p>${esc(t('kdp.coverHelp'))}</p></div>
        <div class="kdp-fields"><div class="cover-up"><div class="cover-box">${v.cover_url ? `<img id="cov-prev" alt="" src="${esc(v.cover_url)}">` : `<img id="cov-prev" alt="" hidden><span id="cov-empty">${icon('image')}</span>`}</div>
          <div style="flex:1;min-width:220px"><label class="drop" data-drop="cover">${icon('image')}<span><span class="fname" id="n-cover">${esc(t('kdp.uploadCover'))}</span><br><small>${esc(t('admin.f.coverHelp'))}</small></span><input type="file" id="f-cover" accept="image/jpeg,image/png,image/webp"></label>
          <div class="kdp-warn" id="cov-warn" hidden></div></div></div></div></div>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('admin.f.sample'))}</h3><p>${esc(t('admin.f.sampleHelp'))}</p></div>
        <div class="kdp-fields"><label class="drop" data-drop="sample">${icon('eye')}<span><span class="fname" id="n-sample">${v.sample_path ? '✓ ' + esc(t('kdp.sampleKept')) : 'EPUB / PDF'}</span><br><small>${esc(t('kdp.sampleTip'))}</small></span><input type="file" id="f-sample" accept=".epub,.pdf,application/epub+zip,application/pdf"></label></div></div>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('kdp.details'))}</h3><p>${esc(t('kdp.detailsHelp'))}</p></div>
        <div class="kdp-fields two"><label class="field"><span>${esc(t('admin.f.pages'))}</span><input id="f-pages" type="number" min="1" inputmode="numeric" value="${v.pages || ''}"><small>${esc(t('admin.f.pagesHelp'))}</small></label>
          <label class="field"><span>ISBN (${esc(t('kdp.optional'))})</span><input id="f-isbn" maxlength="20" inputmode="numeric" value="${esc(v.isbn || '')}"><small>${esc(t('kdp.isbnHelp'))}</small></label></div></div>
    </section>

    <section class="kdp-step" data-pane="3" hidden>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('kdp.pricing'))}</h3><p>${esc(t('kdp.pricingHelp'))}</p></div>
        <div class="kdp-fields"><div class="radios"><label class="check"><input type="radio" name="ptype" value="paid" ${v.price_cents !== 0 ? 'checked' : ''}> ${esc(t('kdp.paid'))}</label><label class="check"><input type="radio" name="ptype" value="free" ${v.price_cents === 0 ? 'checked' : ''}> ${esc(t('kdp.free'))}</label></div>
          <div class="price-table" id="price-box"><div class="two"><label class="field"><span>${esc(t('kdp.listPriceEur'))} *</span><input id="f-price" type="number" min="0.49" step="0.01" inputmode="decimal" value="${eur(v.price_cents)}"></label>
            <label class="field"><span>${esc(t('admin.f.listPrice'))}</span><input id="f-list" type="number" min="0" step="0.01" inputmode="decimal" value="${eur(v.list_price_cents)}"><small>${esc(t('admin.f.listPriceHelp'))}</small></label></div>
            <table class="royalty"><tbody><tr><td>${esc(t('kdp.buyerPays'))}</td><td id="r-price">—</td></tr><tr><td>${esc(t('kdp.stripeFee'))}</td><td id="r-fee">—</td></tr><tr class="tot"><td>${esc(t('kdp.youGet'))}</td><td id="r-net">—</td></tr></tbody></table>
            <small class="muted">${esc(t('kdp.feeNote'))}</small></div></div></div>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('kdp.release'))}</h3><p>${esc(t('kdp.releaseHelp'))}</p></div>
        <div class="kdp-fields"><label class="field" style="max-width:220px"><span>${esc(t('admin.f.published'))}</span><input id="f-date" type="date" value="${esc(String(v.published_at || '').slice(0, 10))}"></label>
          <label class="check"><input type="checkbox" id="f-featured" ${v.is_featured ? 'checked' : ''}> ${esc(t('admin.f.featured'))}</label></div></div>
      <div class="kdp-block"><div class="kdp-label"><h3>${esc(t('kdp.checklist'))}</h3><p>${esc(t('kdp.checklistHelp'))}</p></div>
        <div class="kdp-fields"><ul class="checklist" id="checklist"></ul></div></div>
    </section>

    <div class="error" id="f-err" hidden></div>
    <div class="kdp-bar"><button type="button" class="btn btn-ghost" id="b-back">← ${esc(t('kdp.back'))}</button>
      <span class="spacer"></span><button type="button" class="btn btn-ghost" id="b-draft">${esc(t('kdp.saveDraft'))}</button>
      <button type="button" class="btn btn-buy" id="b-next"></button></div>
  </form>`;
  $$('.drop .ico', body).forEach(i => { i.style.flex = 'none'; });

  const val = id => ($('#' + id, body)?.value || '').trim();
  const radio = n => body.querySelector(`input[name="${n}"]:checked`)?.value;
  const cents = s => { const n = parseFloat(String(s).replace(',', '.')); return isFinite(n) && n > 0 ? Math.round(n * 100) : 0; };
  const authorName = () => [val('f-first'), val('f-last')].filter(Boolean).join(' ');
  const has = { file: !!(v.file_path || v.file_name), cover: !!v.cover_url };

  // ---- what each step still needs (shown on the tabs and in the final checklist)
  const checks = () => {
    const free = radio('ptype') === 'free', price = cents(val('f-price'));
    return [
      { step: 1, ok: !!val('f-title'), label: t('kdp.ck.title') },
      { step: 1, ok: !!val('f-first'), label: t('kdp.ck.author') },
      { step: 1, ok: val('f-description').length >= 30, label: t('kdp.ck.description') },
      { step: 2, ok: has.file || !!files.file, label: t('kdp.ck.manuscript') },
      { step: 2, ok: has.cover || !!files.cover, label: t('kdp.ck.cover') },
      { step: 3, ok: free || price >= 49, label: t('kdp.ck.price') },
    ];
  };
  const refresh = () => {
    const c = checks();
    for (const n of [1, 2, 3]) {
      const mine = c.filter(x => x.step === n), done = mine.filter(x => x.ok).length;
      const el = $('#st-' + n, body);
      el.className = 'kdp-state ' + (done === mine.length ? 'done' : done ? 'part' : 'none');
      el.textContent = done === mine.length ? '✓ ' + t('kdp.complete') : done ? t('kdp.inProgress') : t('kdp.notStarted');
    }
    $('#checklist', body).innerHTML = c.map(x => `<li class="${x.ok ? 'ok' : ''}"><span>${x.ok ? '✓' : '○'}</span>${esc(x.label)}${x.ok ? '' : ` <a href="#" data-goto="${x.step}">${esc(t('kdp.fix'))}</a>`}</li>`).join('');
    $$('[data-goto]', body).forEach(a => a.onclick = e => { e.preventDefault(); show(+a.dataset.goto); });
    $('#desc-count', body).textContent = t('kdp.chars', { n: val('f-description').length, max: 4000 });
    $('#kdp-title', body).textContent = val('f-title') || t('kdp.untitled');
    const free = radio('ptype') === 'free';
    $('#price-box', body).hidden = free;
    const p = cents(val('f-price')), fee = p ? Math.round(p * 0.015 + 25) : 0;
    $('#r-price', body).textContent = p ? money(p, CONFIG.currency) : '—';
    $('#r-fee', body).textContent = p ? '− ' + money(fee, CONFIG.currency) : '—';
    $('#r-net', body).textContent = p ? money(Math.max(p - fee, 0), CONFIG.currency) : '—';
  };
  const show = n => {
    step = n;
    $$('.kdp-step', body).forEach(s => s.hidden = +s.dataset.pane !== n);
    $$('.kdp-tab', body).forEach(tb => { tb.classList.toggle('on', +tb.dataset.step === n); tb.setAttribute('aria-selected', +tb.dataset.step === n); });
    $('#b-back', body).style.visibility = n === 1 ? 'hidden' : 'visible';
    $('#b-next', body).textContent = n < 3 ? t('kdp.saveContinue') + ' →' : t('kdp.publish');
    $('#f-err', body).hidden = true;
    refresh();
    body.querySelector('.kdp-tabs').scrollIntoView({ block: 'nearest' });
  };
  $$('.kdp-tab', body).forEach(tb => tb.onclick = () => show(+tb.dataset.step));
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
    if (kind !== 'cover' && !/\.(epub|pdf)$/i.test(file.name)) { toast(t('admin.badFile'), { error: true }); return; }
    if (kind === 'cover' && !/\.(jpe?g|png|webp)$/i.test(file.name)) { toast(t('admin.badFile'), { error: true }); return; }
    files[kind] = file;
    $('#n-' + kind, body).textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)} MB`;
    if (kind === 'file') $('#file-ok', body).hidden = false;
    if (kind === 'cover') {
      const img = $('#cov-prev', body), url = URL.createObjectURL(file);
      img.src = url; img.hidden = false; $('#cov-empty', body)?.remove();
      const probe = new Image();
      probe.onload = () => {
        const w = probe.naturalWidth, h = probe.naturalHeight, warn = $('#cov-warn', body), msgs = [];
        if (w < 625 || h < 1000) msgs.push(t('kdp.coverSmall', { w, h }));
        const r = h / w; if (r < 1.4 || r > 1.75) msgs.push(t('kdp.coverRatio', { w, h }));
        warn.innerHTML = msgs.map(esc).join('<br>'); warn.hidden = !msgs.length;
      };
      probe.src = url;
    }
    if (kind === 'file' && /\.pdf$/i.test(file.name)) {
      try {
        await loadScript(new URL('../vendor/pdf.min.js', import.meta.url).href);
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.js', import.meta.url).href;
        const doc = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        $('#f-pages', body).value = doc.numPages; doc.destroy();
      } catch { }
    }
    refresh();
  };
  for (const kind of ['cover', 'file', 'sample']) {
    $('#f-' + kind, body).onchange = e => pick(kind, e.target.files[0]);
    const d = $(`[data-drop="${kind}"]`, body);
    d.addEventListener('dragover', e => { e.preventDefault(); d.classList.add('over'); });
    d.addEventListener('dragleave', () => d.classList.remove('over'));
    d.addEventListener('drop', e => { e.preventDefault(); d.classList.remove('over'); pick(kind, e.dataTransfer.files[0]); });
  }

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
      pages: parseInt(val('f-pages')) || null, isbn: val('f-isbn') || null,
      price_cents: free ? 0 : cents(val('f-price')), list_price_cents: free ? null : (cents(val('f-list')) || null),
      published_at: val('f-date') || null, is_featured: $('#f-featured', body).checked, status,
    };
  };
  const save = async (status, btn) => {
    const err = $('#f-err', body); err.hidden = true;
    const fail = m => { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: 'center' }); };
    if (!val('f-title') || !val('f-first')) { show(1); return fail(t('kdp.needTitleAuthor')); }
    if (status === 'published') {
      const missing = checks().filter(c => !c.ok);
      if (missing.length) { show(missing[0].step); return fail(t('kdp.cannotPublish', { list: missing.map(m => m.label).join(', ') })); }
    }
    const data = collect(status);
    if (bookId) data.id = bookId;
    const old = btn.textContent; btn.disabled = true; btn.textContent = t('admin.saving');
    try {
      bookId = await api.saveBook(data, files);
      if (files.file) has.file = true; if (files.cover) has.cover = true;
      files.cover = files.file = files.sample = null;
      $('#kdp-status', body).className = 'status ' + (status === 'published' ? 'live' : 'draft');
      $('#kdp-status', body).textContent = status === 'published' ? t('kdp.live') : t('kdp.draft');
      v.status = status;
      btn.disabled = false; btn.textContent = old;
      return true;
    } catch (x) { fail(t('common.error', { msg: errText(x) })); btn.disabled = false; btn.textContent = old; return false; }
  };
  $('#b-back', body).onclick = () => show(Math.max(1, step - 1));
  $('#b-draft', body).onclick = async e => { if (await save(v.status === 'published' ? 'published' : 'draft', e.currentTarget)) toast(t('kdp.savedDraft')); };
  $('#b-next', body).onclick = async e => {
    if (step < 3) { if (await save(v.status === 'published' ? 'published' : 'draft', e.currentTarget)) show(step + 1); return; }
    if (await save('published', e.currentTarget)) {
      modal(`<div style="text-align:center"><div style="font-size:44px">🎉</div><h2>${esc(t('kdp.publishedTitle'))}</h2><p class="muted">${esc(t('kdp.publishedText'))}</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px"><a class="btn btn-buy" href="#/book/${encodeURIComponent(bookId)}" data-close>${esc(t('kdp.viewInStore'))}</a><a class="btn btn-ghost" href="#/admin/books" data-close>${esc(t('kdp.toBookshelf'))}</a></div></div>`);
    }
  };
  show(startStep);
}
