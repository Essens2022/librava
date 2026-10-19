import { CONFIG } from './config.js';
import { t, money, fmtDate } from './i18n.js';
import { esc, $, $$, loadScript, norm } from './util.js';
import { api } from './api.js';
import { icon, go, toast, coverHTML, confirmBox, errText, CATS } from './ui.js';

export async function viewAdmin(el, parts) {
  const u = api.user();
  if (!u || !u.isAdmin) {
    el.innerHTML = `<div class="wrap page"><div class="panel empty">${icon('gear')}<p>${esc(t('admin.notAdmin'))}</p><a class="btn btn-buy" href="#/account">${esc(t('acc.signIn'))}</a></div></div>`;
    if (!u) sessionStorage.setItem('librava:after', '/admin');
    return;
  }
  const tab = parts[0] || 'books';
  el.innerHTML = `<div class="wrap page" style="max-width:1100px">
    <h1 style="font-size:26px;margin-bottom:12px">${esc(t('admin.title'))}</h1>
    ${api.isDemo ? `<div class="demo-note" style="margin-bottom:14px">${esc(t('admin.demoNote'))}</div>` : ''}
    <div class="tabs" role="tablist">
      <button role="tab" class="${tab === 'books' ? 'on' : ''}" data-go="/admin">${esc(t('admin.books'))}</button>
      <button role="tab" class="${tab === 'new' || tab === 'edit' ? 'on' : ''}" data-go="/admin/new">${icon('plus', 'ico')} ${esc(tab === 'edit' ? t('admin.edit') : t('admin.add'))}</button>
      <button role="tab" class="${tab === 'sales' ? 'on' : ''}" data-go="/admin/sales">${esc(t('admin.sales'))}</button>
    </div>
    <div id="adm-body"></div>
  </div>`;
  $$('[data-go]', el).forEach(b => b.onclick = () => go(b.dataset.go));
  $$('.tabs .ico', el).forEach(i => { i.style.width = '16px'; i.style.height = '16px'; i.style.verticalAlign = '-3px'; });
  const body = $('#adm-body', el);
  if (tab === 'new') return bookForm(body, null);
  if (tab === 'edit') {
    const list = await api.adminBooks();
    return bookForm(body, list.find(b => b.id === parts[1]) || null);
  }
  if (tab === 'sales') return sales(body);
  return booksList(body);
}

async function booksList(body) {
  const books = await api.adminBooks();
  const salesAll = await api.salesStats();
  const salesBy = {};
  for (const s of salesAll) salesBy[s.book_id] = (salesBy[s.book_id] || 0) + 1;
  if (!books.length) {
    body.innerHTML = `<div class="panel empty">${icon('book')}<p>${esc(t('admin.empty'))}</p><a class="btn btn-buy" href="#/admin/new">${esc(t('admin.add'))}</a></div>`;
    return;
  }
  body.innerHTML = `<div class="panel">
    <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:space-between;margin-bottom:12px">
      <input class="input" id="adm-q" type="search" placeholder="${esc(t('admin.search'))}" style="max-width:320px">
      <a class="btn btn-buy btn-sm" href="#/admin/new">${icon('plus')} ${esc(t('admin.add'))}</a>
    </div>
    <div class="table-wrap"><table class="adm-table">
      <thead><tr><th>${esc(t('admin.colTitle'))}</th><th style="text-align:right">${esc(t('admin.colPrice'))}</th><th style="text-align:right">${esc(t('admin.colSales'))}</th><th>${esc(t('admin.colStatus'))}</th><th></th></tr></thead>
      <tbody>${books.map(b => `<tr data-row="${esc(norm(b.title + ' ' + b.author))}">
        <td><div class="adm-book">${coverHTML(b, { badge: false })}<div style="min-width:0"><b>${esc(b.title)}</b><div class="muted" style="font-size:13px">${esc(b.author)} · ${esc(t('cat.' + b.category))} · ${esc(b.format.toUpperCase())}</div></div></div></td>
        <td class="num">${b.price_cents ? money(b.price_cents) : esc(t('book.free'))}</td>
        <td class="num">${salesBy[b.id] || 0}</td>
        <td><span class="status ${b.status === 'published' ? 'live' : 'draft'}">${esc(b.status === 'published' ? t('admin.live') : t('admin.draft'))}</span></td>
        <td style="white-space:nowrap;text-align:right">
          <a class="btn btn-ghost btn-sm" href="#/admin/edit/${encodeURIComponent(b.id)}">${icon('edit', 'ico')} <span class="sr">${esc(t('admin.edit'))}</span></a>
          <a class="btn btn-ghost btn-sm" href="#/book/${encodeURIComponent(b.id)}" aria-label="${esc(b.title)}">${icon('eye', 'ico')}</a>
          <button class="btn btn-ghost btn-sm" data-del="${esc(b.id)}" aria-label="${esc(t('admin.delete'))}">${icon('trash', 'ico')}</button>
        </td></tr>`).join('')}</tbody>
    </table></div></div>`;
  $$('.adm-table .btn .ico', body).forEach(i => { i.style.width = '17px'; i.style.height = '17px'; });
  $('#adm-q', body).oninput = e => { const q = norm(e.target.value); $$('[data-row]', body).forEach(r => r.hidden = q && !r.dataset.row.includes(q)); };
  $$('[data-del]', body).forEach(btn => btn.onclick = async () => {
    const b = books.find(x => x.id === btn.dataset.del);
    if (!await confirmBox(t('admin.confirmDelete', { title: b.title }), { ok: t('admin.delete'), danger: true })) return;
    try { await api.deleteBook(b.id); toast(t('admin.deleted')); booksList(body); } catch (e) { toast(errText(e), { error: true }); }
  });
}

function bookForm(body, b) {
  const v = b || { language: 'ro', status: 'published', price_cents: 0, category: 'fiction', published_at: new Date().toISOString().slice(0, 10) };
  const files = { cover: null, file: null, sample: null };
  const eur = c => c ? (c / 100).toFixed(2) : '';
  body.innerHTML = `<form id="bk-form" novalidate>
    <section class="step"><div class="step-head"><span class="step-num">1</span><h3>${esc(t('admin.step1'))}</h3></div><div class="step-body form-grid">
      <label class="field full"><span>${esc(t('admin.f.title'))} *</span><input id="f-title" required maxlength="200" value="${esc(v.title || '')}"></label>
      <label class="field full"><span>${esc(t('admin.f.subtitle'))}</span><input id="f-subtitle" maxlength="200" value="${esc(v.subtitle || '')}"></label>
      <label class="field"><span>${esc(t('admin.f.author'))} *</span><input id="f-author" required maxlength="120" value="${esc(v.author || '')}"></label>
      <label class="field"><span>${esc(t('admin.f.category'))} *</span><select id="f-category">${CATS.map(c => `<option value="${c}" ${v.category === c ? 'selected' : ''}>${esc(t('cat.' + c))}</option>`).join('')}</select></label>
      <label class="field full"><span>${esc(t('admin.f.description'))}</span><textarea id="f-description" maxlength="4000">${esc(v.description || '')}</textarea><small>${esc(t('admin.f.descriptionHelp'))}</small></label>
      <label class="field"><span>${esc(t('admin.f.language'))}</span><select id="f-language">${['ro', 'it', 'en'].map(l => `<option value="${l}" ${v.language === l ? 'selected' : ''}>${esc(t('lang.' + l))}</option>`).join('')}</select></label>
      <label class="field"><span>${esc(t('admin.f.keywords'))}</span><input id="f-keywords" value="${esc((v.keywords || []).join(', '))}"><small>${esc(t('admin.f.keywordsHelp'))}</small></label>
    </div></section>

    <section class="step"><div class="step-head"><span class="step-num">2</span><h3>${esc(t('admin.step2'))}</h3></div><div class="step-body" style="display:flex;flex-direction:column;gap:16px">
      <div class="field"><span>${esc(t('admin.f.cover'))}</span>
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
          <img class="cover-preview" id="cov-prev" alt="" ${v.cover_url ? `src="${esc(v.cover_url)}"` : 'hidden'}>
          <label class="drop" style="flex:1;min-width:220px" data-drop="cover">${icon('image')}<span><span class="fname" id="n-cover">${esc(t('admin.f.cover'))}</span><br><small>${esc(t('admin.f.coverHelp'))}</small></span><input type="file" id="f-cover" accept="image/jpeg,image/png,image/webp,image/svg+xml"></label>
        </div></div>
      <div class="field"><span>${esc(t('admin.f.file'))} ${b ? '' : '*'}</span>
        <label class="drop" data-drop="file">${icon('file')}<span><span class="fname" id="n-file">${b?.file_name || b?.file_path ? esc(t('admin.f.fileKeep', { name: b.file_name || String(b.file_path).split('/').pop() })) : 'EPUB / PDF'}</span><br><small>${esc(t('admin.f.fileHelp'))}</small></span><input type="file" id="f-file" accept=".epub,.pdf,application/epub+zip,application/pdf"></label></div>
      <div class="field"><span>${esc(t('admin.f.sample'))}</span>
        <label class="drop" data-drop="sample">${icon('eye')}<span><span class="fname" id="n-sample">${b?.sample_path ? '✓' : 'EPUB / PDF'}</span><br><small>${esc(t('admin.f.sampleHelp'))}</small></span><input type="file" id="f-sample" accept=".epub,.pdf,application/epub+zip,application/pdf"></label></div>
      <label class="field" style="max-width:220px"><span>${esc(t('admin.f.pages'))}</span><input id="f-pages" type="number" min="1" inputmode="numeric" value="${v.pages || ''}"><small>${esc(t('admin.f.pagesHelp'))}</small></label>
    </div></section>

    <section class="step"><div class="step-head"><span class="step-num">3</span><h3>${esc(t('admin.step3'))}</h3></div><div class="step-body form-grid">
      <label class="field"><span>${esc(t('admin.f.price'))}</span><input id="f-price" type="number" min="0" step="0.01" inputmode="decimal" value="${eur(v.price_cents) || '0'}"><small>${esc(t('admin.f.priceHelp'))}</small></label>
      <label class="field"><span>${esc(t('admin.f.listPrice'))}</span><input id="f-list" type="number" min="0" step="0.01" inputmode="decimal" value="${eur(v.list_price_cents)}"><small>${esc(t('admin.f.listPriceHelp'))}</small></label>
      <label class="field"><span>${esc(t('admin.f.published'))}</span><input id="f-date" type="date" value="${esc(String(v.published_at || '').slice(0, 10))}"></label>
      <label class="field"><span>${esc(t('admin.f.status'))}</span><select id="f-status"><option value="published" ${v.status === 'published' ? 'selected' : ''}>${esc(t('admin.f.statusPublished'))}</option><option value="draft" ${v.status !== 'published' ? 'selected' : ''}>${esc(t('admin.f.statusDraft'))}</option></select></label>
      <label class="check full"><input type="checkbox" id="f-featured" ${v.is_featured ? 'checked' : ''}> ${esc(t('admin.f.featured'))}</label>
    </div></section>
    <div class="error" id="f-err" hidden></div>
    <div class="sticky-actions"><a class="btn btn-ghost" href="#/admin">${esc(t('admin.cancel'))}</a><button class="btn btn-buy" type="submit" id="f-save">${esc(t('admin.save'))}</button></div>
  </form>`;
  $$('.drop .ico', body).forEach(i => { i.style.flex = 'none'; });

  const pick = async (kind, file) => {
    if (!file) return;
    if (kind !== 'cover' && !/\.(epub|pdf)$/i.test(file.name)) { toast(t('admin.badFile'), { error: true }); return; }
    files[kind] = file;
    $('#n-' + kind, body).textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)} MB`;
    if (kind === 'cover') { const img = $('#cov-prev', body); img.src = URL.createObjectURL(file); img.hidden = false; }
    if (kind === 'file' && /\.pdf$/i.test(file.name)) {
      try {
        await loadScript(new URL('../vendor/pdf.min.js', import.meta.url).href);
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.js', import.meta.url).href;
        const doc = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        $('#f-pages', body).value = doc.numPages; doc.destroy();
      } catch { }
    }
  };
  for (const kind of ['cover', 'file', 'sample']) {
    $('#f-' + kind, body).onchange = e => pick(kind, e.target.files[0]);
    const d = $(`[data-drop="${kind}"]`, body);
    d.addEventListener('dragover', e => { e.preventDefault(); d.classList.add('over'); });
    d.addEventListener('dragleave', () => d.classList.remove('over'));
    d.addEventListener('drop', e => { e.preventDefault(); d.classList.remove('over'); pick(kind, e.dataTransfer.files[0]); });
  }

  $('#bk-form', body).onsubmit = async e => {
    e.preventDefault();
    const err = $('#f-err', body); err.hidden = true;
    const val = id => $('#' + id, body).value.trim();
    const missing = [];
    if (!val('f-title')) missing.push(t('admin.f.title'));
    if (!val('f-author')) missing.push(t('admin.f.author'));
    if (missing.length) { err.textContent = t('admin.required', { fields: missing.join(', ') }); err.hidden = false; err.scrollIntoView({ block: 'center' }); return; }
    if (!b && !files.file) { err.textContent = t('admin.needFile'); err.hidden = false; return; }
    const cents = s => { const n = parseFloat(String(s).replace(',', '.')); return isFinite(n) && n > 0 ? Math.round(n * 100) : 0; };
    const data = {
      title: val('f-title'), subtitle: val('f-subtitle') || null, author: val('f-author'), description: val('f-description'),
      category: val('f-category'), language: val('f-language'),
      keywords: val('f-keywords').split(',').map(s => s.trim()).filter(Boolean),
      pages: parseInt(val('f-pages')) || null,
      price_cents: cents(val('f-price')), list_price_cents: cents(val('f-list')) || null,
      published_at: val('f-date') || null, status: val('f-status'), is_featured: $('#f-featured', body).checked,
    };
    if (b) data.id = b.id;
    const btn = $('#f-save', body); btn.disabled = true; btn.textContent = t('admin.saving');
    try {
      const id = await api.saveBook(data, files);
      toast(t('admin.saved'));
      go('/book/' + encodeURIComponent(id));
    } catch (x) {
      err.textContent = t('common.error', { msg: errText(x) }); err.hidden = false;
      btn.disabled = false; btn.textContent = t('admin.save');
    }
  };
}

async function sales(body) {
  const rows = await api.salesStats();
  const revenue = rows.reduce((s, r) => s + (r.price_cents || 0), 0);
  const customers = new Set(rows.map(r => r.user_id)).size;
  const by = {};
  for (const r of rows) { if (!r.book) continue; by[r.book_id] = by[r.book_id] || { book: r.book, n: 0, sum: 0 }; by[r.book_id].n++; by[r.book_id].sum += r.price_cents || 0; }
  const top = Object.values(by).sort((a, b) => b.sum - a.sum || b.n - a.n).slice(0, 10);
  body.innerHTML = `
    <div class="stats">
      <div class="panel stat"><small>${esc(t('admin.revenue'))}</small><b>${money(revenue)}</b></div>
      <div class="panel stat"><small>${esc(t('admin.orders'))}</small><b>${rows.length}</b></div>
      <div class="panel stat"><small>${esc(t('admin.customers'))}</small><b>${customers}</b></div>
    </div>
    ${!rows.length ? `<div class="panel empty">${icon('chart')}<p>${esc(t('admin.noSales'))}</p></div>` : `
    <section class="panel" style="margin-bottom:14px"><h2 class="section-title" style="font-size:18px;margin-bottom:10px">${esc(t('admin.topBooks'))}</h2>
      <div class="table-wrap"><table class="adm-table"><tbody>${top.map(x => `<tr><td><div class="adm-book">${coverHTML(x.book, { badge: false })}<b>${esc(x.book.title)}</b></div></td><td class="num">${x.n} ×</td><td class="num"><b>${money(x.sum)}</b></td></tr>`).join('')}</tbody></table></div>
    </section>
    <section class="panel"><h2 class="section-title" style="font-size:18px;margin-bottom:10px">${esc(t('admin.latest'))}</h2>
      <div class="table-wrap"><table class="adm-table"><tbody>${rows.slice(0, 50).map(r => `<tr><td style="white-space:nowrap">${esc(fmtDate(r.created_at))}</td><td>${esc(r.book?.title || '—')}</td><td class="muted">${esc(r.customer_email || '')}</td><td class="num">${r.price_cents ? money(r.price_cents) : esc(t('book.free'))}</td></tr>`).join('')}</tbody></table></div>
    </section>`}`;
}
