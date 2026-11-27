// Admin → Digital products: a short form for planners, calendars, organizers, spreadsheets and templates.
// (ebooks keep their own detailed form; this one has only what a downloadable file needs.)
import { tAdmin as t, getLang, LANGS } from './i18n.js?v=20261127015111';
import { TA } from './admin-it.js?v=20261127015111';
import { esc, $, $$, loadScript, norm, compressImage } from './util.js?v=20261127015111';
import { api } from './api.js?v=20261127015111';
import { icon, toast, errText, CATS, go } from './ui.js?v=20261127015111';
import { aplusEditor } from './admin.js?v=20261127015111';
import { PTYPES, FILE_FORMATS, ptypeOf, isDigital } from './ptypes.js?v=20261127015111';

const ext = n => (String(n || '').match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
const cents = v => Math.round(parseFloat(String(v).replace(',', '.')) * 100) || 0;

const SVG = { back: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>' };
const ROUTE = '/admin/digital';
const fmtEur = c => (c / 100).toFixed(2).replace('.', ',') + ' €';
const langOf = c => (LANGS.find(l => l[0] === c) || [c, c])[1];
const pageHead = (title, sub) => `<div class="dg-top"><a class="dg-back" href="#${ROUTE}" aria-label="${TA('Înapoi')}">${SVG.back}</a><h2>${esc(title)}</h2>${sub ? `<p class="muted">${sub}</p>` : ''}</div>`;

export async function digitalAdmin(body, sub, id) {
  body.classList.add('dg');
  if (sub === 'new') return form(body, null);
  if (sub === 'import') return importPage(body);
  if (sub === 'edit' && id) { const b = await api.getBook(id).catch(() => null); if (b) return form(body, b); }
  return listPage(body);
}

async function listPage(body) {
  const all = (await api.adminBooks()).filter(b => !b.deleted_at && isDigital(b));
  const st = { q: '', status: 'all', lang: 'all' };
  const pub = all.filter(b => b.status === 'published').length;
  const langs = [...new Set(all.map(b => b.language))].sort();
  body.innerHTML = `${all.length ? `<div class="dg-sum"><b>${all.length}</b> produse · <b>${pub}</b> ${TA('publicat')}e · <b>${all.length - pub}</b> ciorne · <b>${langs.length}</b> limbi</div>` : ''}
    ${all.length ? `<div class="dg-bar"><input class="input" id="dg-q" type="search" placeholder="${TA('Caută…')}" autocomplete="off">
      <select class="input" id="dg-st"><option value="all">Stare</option><option value="published">${TA('Publicat')}e</option><option value="draft">Ciorne</option></select>
      <select class="input" id="dg-ln"><option value="all">Limbi</option>${langs.map(l => `<option value="${l}">${esc(langOf(l))}</option>`).join('')}</select></div>
    <div id="dg-rows" class="dg-list"></div>` : `<div class="panel dg-empty"><div class="dg-empty-ico">${icon('box')}</div><h3>${TA('Nu ai încă produse digitale')}</h3><p class="muted">${TA('Adaugă primul produs: planificator, calendar, organizator, foaie de calcul sau șablon. Clientul îl descarcă imediat după plată.')}</p><div class="dg-cta"><a class="btn btn-buy" href="#${ROUTE}/new">${icon('plus')} ${TA('Adaugă produs digital')}</a><a class="btn btn-ghost" href="#${ROUTE}/import">${icon('upload')} ${TA('Importă un produs gata făcut (.zip)')}</a></div></div>`}`;
  if (!all.length) return;
  const draw = () => {
    const w = norm(st.q).split(/\s+/).filter(Boolean);
    const rows = all.filter(b => (st.status === 'all' || b.status === st.status) && (st.lang === 'all' || b.language === st.lang) && w.every(x => norm(b.title + ' ' + (b.subtitle || '')).includes(x)));
    $('#dg-rows', body).innerHTML = rows.length ? rows.map(b => {
      const isPub = b.status === 'published';
      return `<div class="dg-row"><a class="dg-thumb" href="#/admin/digital/edit/${esc(b.id)}">${b.cover_url ? `<img src="${esc(b.cover_url)}" alt="" loading="lazy">` : icon('box')}</a>
      <div class="dg-info"><a class="dg-ttl" href="#/admin/digital/edit/${esc(b.id)}">${esc(b.title)}</a>
        <div class="dg-meta"><span class="dg-badge ${isPub ? 'ok' : 'draft'}">${isPub ? TA('Publicat') : TA('Ciornă')}</span><span>${esc(t('ptype1.' + ptypeOf(b)))} · ${esc(String(b.format).toUpperCase())} · ${esc(String(b.language).toUpperCase())}</span><b class="dg-price">${b.price_cents ? fmtEur(b.price_cents) : 'Gratuit'}</b></div></div>
      <div class="dg-act"><a class="btn btn-ghost btn-sm" href="#/admin/digital/edit/${esc(b.id)}">${TA('Modifică')}</a>${isPub ? `<a class="dg-ic" title="${TA('Vezi în magazin')}" aria-label="${TA('Vezi în magazin')}" href="#/book/${encodeURIComponent(b.id)}" target="_blank" rel="noopener">↗</a>` : ''}<button class="dg-ic dg-del" title="${TA('Șterge')}" aria-label="${TA('Șterge')}" data-del="${esc(b.id)}">🗑</button></div></div>`;
    }).join('') : ('<p class="muted" style="padding:18px 4px">' + TA('Niciun produs nu se potrivește filtrelor.') + '</p>');
    $$('[data-del]', body).forEach(x => x.onclick = async () => {
      const b = all.find(y => y.id === x.dataset.del); if (!b) return;
      if (!confirm(TA('Ștergi produsul „') + b.title + TA('”?\n\nDispare din magazin. Clienții care l-au cumpărat îl păstrează în bibliotecă.'))) return;
      x.disabled = true; try { await api.deleteBook(b.id); toast(TA('Produs șters')); await listPage(body); } catch (e) { toast(errText(e)); x.disabled = false; }
    });
  };
  $('#dg-q', body).oninput = e => { st.q = e.target.value; draw(); };
  $('#dg-st', body).onchange = e => { st.status = e.target.value; draw(); };
  $('#dg-ln', body).onchange = e => { st.lang = e.target.value; draw(); };
  draw();
}

function importPage(body) {
  body.innerHTML = `${pageHead(TA('Importă produse dintr-un fișier'), TA('Un fișier .zip = un produs complet (text, preț, fișier, copertă, imagini A+). Îl poți modifica sau șterge oricând.'))}
    <label class="dg-drop" id="dg-drop"><input type="file" id="dg-imp" accept=".zip,application/zip" multiple hidden>
      <span class="dg-drop-ico">${icon('upload')}</span><b>${TA('Alege fișierele .zip sau trage-le aici')}</b><span class="muted">${TA('Poți încărca mai multe produse deodată')}</span></label>
    <div id="dg-imp-list"></div>
    <details class="panel dg-help"><summary>${TA('Ce trebuie să conțină fișierul .zip?')}</summary>
      <ul><li><b>product.json</b>${TA(': titlu, subtitlu, descriere, limbă, tip, categorie, cuvinte-cheie, preț')}</li><li><b>${TA('fișierul produsului')}</b> ${TA('(.zip, .pdf, .xlsx sau .docx), exact cel pe care îl descarcă clientul')}</li><li><b>cover.jpg</b>: coperta</li><li><b>aplus/</b>${TA(': imaginile din pagina de produs')}</li></ul></details>`;
  const inp = $('#dg-imp', body), drop = $('#dg-drop', body);
  const run = async fs => { for (const f of fs) await importCard(body, f, await api.adminBooks()); };
  inp.onchange = e => { const fs = [...e.target.files]; e.target.value = ''; run(fs); };
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => run([...e.dataTransfer.files].filter(f => /\.zip$/i.test(f.name))));
}

function form(body, b) {
  const v = b || { product_type: 'planner', language: getLang(), category: CATS[0], status: 'draft', price_cents: 0 };
  const files = {};
  const draftId = b?.id || crypto.randomUUID();
  const kws = [...(v.keywords || []), '', '', '', '', '', '', ''].slice(0, 7);
  const aplusModules = JSON.parse(JSON.stringify(v.aplus || [])).map(m => ({ ...m, imgs: (m.imgs || []).map(im => im && { ...im, url: im.url || im.ref }) }));
  body.innerHTML = `${pageHead(b ? TA('Modifică produsul') : TA('Produs digital nou'))}
    <div class="dg-form">
    <section class="panel dg-sec"><h3><i>1</i> ${TA('Informații de bază')}</h3>
      <label class="field"><span>${TA('Titlu *')} <small class="muted">${TA('cum caută oamenii pe internet')}</small></span><input class="input" id="dg-title" maxlength="140" value="${esc(v.title || '')}"><em class="dg-cnt" data-for="dg-title" data-max="140"></em></label>
      <label class="field"><span>Subtitlu <small class="muted">${TA('cifre concrete: câte pagini, câte foi, ce conține')}</small></span><input class="input" id="dg-sub" maxlength="200" value="${esc(v.subtitle || '')}"><em class="dg-cnt" data-for="dg-sub" data-max="200"></em></label>
      <div class="dg-grid3"><label class="field"><span>${TA('Tip produs *')}</span><select class="input" id="dg-type">${[...PTYPES, 'publisher'].map(p => `<option value="${p}" ${ptypeOf(v) === p ? 'selected' : ''}>${esc(t('ptype1.' + p))}</option>`).join('')}</select></label>
      <label class="field"><span>${TA('Limba produsului')}</span><select class="input" id="dg-lang">${LANGS.map(([c, n]) => `<option value="${c}" ${v.language === c ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <label class="field"><span>Categorie</span><select class="input" id="dg-cat">${CATS.map(c => `<option value="${c}" ${v.category === c ? 'selected' : ''}>${esc(t('cat.' + c))}</option>`).join('')}</select></label></div></section>
    <section class="panel dg-sec"><h3><i>2</i> ${TA('Fișierul și coperta')}</h3>
      <div class="dg-grid2"><div class="field"><span>${TA('Fișierul produsului *')} <small class="muted">${FILE_FORMATS.filter(f => f !== 'epub').map(f => '.' + f).join(' ')}</small></span><label class="dg-pick" id="dg-filebox"><input type="file" id="dg-file" accept=".pdf,.xlsx,.docx,.zip" hidden><b id="dg-filename">${b ? (TA('Fișier existent:') + ' ') + esc(String(b.format).toUpperCase()) + (' ' + TA('(alege altul ca să-l înlocuiești)')) : TA('Alege fișierul')}</b></label></div>
      <div class="field"><span>Coperta * <small class="muted">${TA('imagine verticală')}</small></span><label class="dg-pick dg-cover" id="dg-coverbox"><input type="file" id="dg-cover" accept="image/*" hidden><img id="dg-coverimg" alt="" ${v.cover_url ? `src="${esc(v.cover_url)}"` : 'hidden'}><b id="dg-covername">${v.cover_url ? TA('Schimbă coperta') : TA('Alege coperta')}</b></label></div></div></section>
    <section class="panel dg-sec"><h3><i>3</i> ${TA('Preț')}</h3>
      <div class="dg-grid2"><label class="field"><span>${TA('Preț de vânzare (€) *')}</span><input class="input" id="dg-price" inputmode="decimal" placeholder="ex. 4,99" value="${v.price_cents ? (v.price_cents / 100).toFixed(2) : ''}"></label>
      <label class="field"><span>${TA('Preț întreg tăiat (€)')} <small class="muted">${TA('opțional')}</small></span><input class="input" id="dg-list" inputmode="decimal" placeholder="ex. 9,99" value="${v.list_price_cents ? (v.list_price_cents / 100).toFixed(2) : ''}"></label></div><p class="muted dg-hint">${TA('Minim 0,49 €. Lasă 0 pentru produs gratuit.')}</p>
      <div class="dg-sib" id="dg-sib" hidden></div></section>
    <section class="panel dg-sec"><h3><i>4</i> ${TA('Descriere și căutare')}</h3>
      <label class="field"><span>Descriere *</span><textarea class="input" id="dg-desc" rows="4">${esc(v.description || '')}</textarea></label>
      <div class="field"><span>Cuvinte-cheie <small class="muted">${TA('max. 7, nu repeta titlul')}</small></span><div class="dg-kws">${kws.map((k, i) => `<input class="input dg-kw" maxlength="50" placeholder="${TA('Cuvânt')} ${i + 1}" value="${esc(k)}">`).join('')}</div></div></section>
    <section class="panel dg-sec"><h3><i>5</i> ${TA('Pagina de produs')} <small class="muted">${TA('imagini și text, ca la cărți (A+)')}</small></h3><div id="dg-aplus"></div></section>
    </div>
    <div class="dg-bottom"><div class="dg-check" id="dg-check"></div><div class="error" id="dg-err" hidden></div>
      <div class="dg-bbtn"><button class="btn btn-buy" id="dg-pub">${b && b.status === 'published' ? TA('Salvează modificările') : TA('Publică')}</button><button class="btn btn-ghost" id="dg-draft">${TA('Salvează ciornă')}</button>${b ? ('<button class="btn btn-ghost dg-del" id="dg-rm">' + TA('Șterge') + '</button>') : ''}</div></div>`;
  window.scrollTo({ top: 0 });
  const getAplus = aplusEditor($('#dg-aplus', body), aplusModules, () => draftId);
  const val = id => $('#' + id, body).value.trim();
  const checks = () => [['Titlu', !!val('dg-title')], ['Descriere', !!val('dg-desc')], [TA('Fișier'), !!(b || files.file)], [TA('Copertă'), !!(b?.cover_url || files.cover)], [TA('Preț'), (() => { const c = cents(val('dg-price')); return c >= 49 || (c === 0 && val('dg-price') !== ''); })()]];
  const paint = () => {
    $$('.dg-cnt', body).forEach(c => { const n = $('#' + c.dataset.for, body).value.length; c.textContent = n + ' / ' + c.dataset.max; });
    const ck = checks(), miss = ck.filter(x => !x[1]).map(x => x[0]);
    $('#dg-check', body).innerHTML = miss.length ? `<span>${TA('Mai lipsește:')} ${miss.join(', ')}</span>` : ('<span class="ok">' + TA('✓ Gata de publicare') + '</span>');
  };
  body.addEventListener('input', paint); paint();
  // the same product in other languages: tick where the same price should be applied too
  let sibs = [];
  if (b?.id && api.langSiblings) api.langSiblings(b.id).then(list => {
    sibs = list; if (!list.length) return;
    const box = $('#dg-sib', body), m = c => (c / 100).toFixed(2).replace('.', ',') + ' €';
    box.innerHTML = `<b>${TA('Același produs în alte limbi')}</b><small class="muted">${TA('Bifează unde vrei să se aplice același preț (și prețul tăiat) când salvezi.')}</small>
      ${list.map(x => `<label class="dg-sibrow"><input type="checkbox" value="${esc(x.id)}"><span class="dg-sibl">${esc(String(x.language).toUpperCase())}</span><span class="dg-sibt">${esc(x.title)}</span><span class="dg-sibp">${m(x.price_cents)}${x.list_price_cents > x.price_cents ? ' <s>' + m(x.list_price_cents) + '</s>' : ''}</span></label>`).join('')}
      <button type="button" class="btn btn-ghost dg-siball" id="dg-siball">${TA('Bifează toate')}</button>`;
    box.hidden = false;
    $('#dg-siball', body).onclick = () => { const cs = $$('#dg-sib input', body), all = cs.every(c => c.checked); cs.forEach(c => { c.checked = !all; }); };
  }).catch(() => {});
  $('#dg-file', body).onchange = e => { files.file = e.target.files[0]; if (files.file) $('#dg-filename', body).textContent = files.file.name + ' · ' + (files.file.size / 1048576).toFixed(1).replace('.', ',') + ' MB'; paint(); };
  $('#dg-cover', body).onchange = e => { files.cover = e.target.files[0]; if (files.cover) { const im = $('#dg-coverimg', body); im.src = URL.createObjectURL(files.cover); im.hidden = false; $('#dg-covername', body).textContent = TA('Schimbă coperta'); } paint(); };
  const save = async (status, btn) => {
    const err = $('#dg-err', body); err.hidden = true;
    const fail = m => { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    const title = val('dg-title'), desc = val('dg-desc'), price = cents(val('dg-price'));
    if (!title || !desc) return fail(TA('Completează titlul și descrierea.'));
    if (!b && !files.file) return fail(TA('Alege fișierul produsului.'));
    if (files.file && !FILE_FORMATS.includes(ext(files.file.name))) return fail('Format nerecunoscut. Acceptate: ' + FILE_FORMATS.join(', '));
    if (status === 'published' && (!(b?.cover_url || files.cover))) return fail(TA('Adaugă o imagine de copertă înainte de publicare.'));
    if (status === 'published' && price < 49 && !(price === 0 && val('dg-price') !== '')) return fail(TA('Prețul minim este 0,49 € (sau 0 pentru gratuit).'));
    const data = {
      id: draftId, title, subtitle: val('dg-sub') || null, keywords: $$('.dg-kw', body).map(i => i.value.trim()).filter(Boolean), aplus: getAplus(), author: v.author || 'Librava', description: desc,
      product_type: val('dg-type'), language: val('dg-lang'), category: val('dg-cat'), categories: [val('dg-cat')],
      price_cents: price, list_price_cents: cents(val('dg-list')) || null,
      allow_download: true, stamp_downloads: false, status, rights: 'own',
      published_at: b?.published_at || new Date().toISOString().slice(0, 10),
    };
    const ids = $$('#dg-sib input:checked', body).map(c => c.value);
    if (ids.length && (val('dg-price') === '' || !(price === 0 || (price >= 49 && (!data.list_price_cents || data.list_price_cents > price))))) return fail(TA('Prețul nu se poate aplica la celelalte limbi: minim 0,49 € (sau 0 pentru gratuit), iar prețul tăiat trebuie să fie mai mare decât prețul. Corectează sau debifează limbile.'));
    const old = btn.textContent; $$('#dg-pub, #dg-draft', body).forEach(x => { x.disabled = true; }); btn.textContent = TA('Se salvează…');
    try {
      await api.saveBook(data, files);
      let extra = '';
      if (ids.length) {
        try { if (!api.setPrices) throw new Error('indisponibil'); await api.setPrices(ids.map(id => ({ id, price, list: data.list_price_cents }))); extra = (' ' + TA('· prețul aplicat și la') + ' ') + ids.length + ' limbi'; }
        catch (e) { toast((TA('Produsul a fost salvat, dar prețul nu s-a putut aplica la celelalte limbi:') + ' ') + errText(e), { error: true }); go(ROUTE); return; }
      }
      toast((status === 'published' ? ((TA('Produs') + ' ') + TA('publicat')) : TA('Ciornă salvată')) + extra); go(ROUTE);
    }
    catch (e) { fail(errText(e)); $$('#dg-pub, #dg-draft', body).forEach(x => { x.disabled = false; }); btn.textContent = old; }
  };
  $('#dg-pub', body).onclick = e => save('published', e.target);
  $('#dg-draft', body).onclick = e => save('draft', e.target);
  const rm = $('#dg-rm', body);
  if (rm) rm.onclick = async () => {
    if (!confirm(TA('Ștergi produsul „') + b.title + TA('”?\n\nDispare din magazin. Clienții care l-au cumpărat îl păstrează în bibliotecă.'))) return;
    try { await api.deleteBook(b.id); toast(TA('Produs șters')); go(ROUTE); } catch (e) { toast(errText(e)); }
  };
}


// ---------------------------------------------------------------- import a whole digital product from one .zip
// product.json  title, subtitle, product_type, language, category, keywords, description, price, list_price, file, cover, aplus[]
// the product file (.zip/.pdf/.xlsx/.docx), cover.jpg and aplus/*.jpg sit next to it (aplus: same modules as book.json)
const APL = { banner: { imgs: 1, rec: [1940, 600] }, header: { imgs: 1, rec: [970, 600] }, image_text: { imgs: 1, rec: [600, 600] }, three: { imgs: 3, rec: [600, 600] }, text: { imgs: 0 } };
const imgSize = file => new Promise(res => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ w: 0, h: 0 }); im.src = u; });
const PROD_EXT = /\.(zip|pdf|xlsx|docx)$/i, PIMG = /\.(jpe?g|png|webp)$/i;
async function readProduct(zipFile) {
  await loadScript(new URL('../vendor/jszip.min.js', import.meta.url).href);
  const zip = await window.JSZip.loadAsync(zipFile);
  const entries = Object.values(zip.files).filter(e => !e.dir && !/(^|\/)(__MACOSX|\.DS_Store)/.test(e.name));
  const je = entries.find(e => /(^|\/)product\.json$/i.test(e.name));
  const issues = []; const err = t => issues.push({ level: 'error', text: t }), warn = t => issues.push({ level: 'warn', text: t });
  if (!je) err(TA('Lipsește product.json din fișier.'));
  const root = je ? je.name.replace(/product\.json$/i, '') : '';
  let meta = {}; if (je) { try { meta = JSON.parse(await je.async('string')); } catch { err(TA('product.json nu se poate citi.')); } }
  const inRoot = entries.filter(e => e.name.startsWith(root));
  const byPath = p => p && inRoot.find(e => e.name === root + String(p).replace(/^\.?\//, '')) || null;
  const asFile = async (e, type) => e ? new File([await e.async('blob')], e.name.split('/').pop(), type ? { type } : {}) : null;
  const notApl = e => !/\/(aplus|a-plus)\//i.test(e.name) && e.name !== je?.name;
  const fe = byPath(meta.file) || inRoot.find(e => PROD_EXT.test(e.name) && notApl(e));
  const file = await asFile(fe);
  if (!file) err(TA('Lipsește fișierul produsului (.zip, .pdf, .xlsx sau .docx).'));
  const ce = byPath(meta.cover) || inRoot.find(e => /(^|\/)cover[^/]*\.(jpe?g|png|webp)$/i.test(e.name) && notApl(e));
  const cover = await asFile(ce);
  if (!cover) err(TA('Lipsește coperta (cover.jpg).'));
  for (const [k, n] of [['title', 'titlul'], ['description', 'descrierea'], ['language', 'limba'], ['product_type', 'tipul produsului'], ['category', 'categoria']]) if (!String(meta[k] || '').trim()) err((TA('Lipsește') + ' ') + n + (' ' + TA('în product.json.')));
  if (meta.product_type && !PTYPES.includes(meta.product_type) && meta.product_type !== 'publisher') err('Tip necunoscut: ' + meta.product_type + ' (acceptate: ' + PTYPES.join(', ') + ').');
  if (meta.category && !CATS.includes(meta.category)) err((TA('Categorie necunoscută:') + ' ') + meta.category + '.');
  const num = v => v == null || v === '' ? null : Math.round(parseFloat(String(v).replace(',', '.')) * 100);
  const price = num(meta.price), list = num(meta.list_price);
  if (price == null || !Number.isFinite(price)) warn(TA('Nu are preț: se salvează ca ciornă.')); else if (price > 0 && price < 49) err(TA('Prețul minim este 0,49 €.'));
  const aplus = [];
  for (const [i, m] of (Array.isArray(meta.aplus) ? meta.aplus : []).slice(0, 7).entries()) {
    if (!APL[m?.type]) { warn((TA('Modul A+ necunoscut la poziția') + ' ') + (i + 1) + '.'); continue; }
    const items = m.type === 'three' ? (m.items || []).slice(0, 3) : [m], imgs = [];
    for (const it of items) { if (!APL[m.type].imgs) break; const e = byPath(it.image); if (it.image && !e) warn((TA('Lipsește imaginea') + ' ') + it.image); imgs.push(await asFile(e)); }
    aplus.push({ ...m, files: imgs, caps: m.type === 'three' ? items.map(x => ({ title: x.title || '', text: x.text || '' })) : undefined });
  }
  return { name: zipFile.name, meta, file, cover, price, list: Number.isFinite(list) && list > (price || 0) ? list : null, aplus, issues };
}
async function importCard(body, zipFile, books) {
  const host = $('#dg-imp-list', body), card = document.createElement('div'); card.className = 'panel'; card.style.marginTop = '12px'; host.prepend(card);
  card.innerHTML = `<span class="muted">Citesc ${esc(zipFile.name)}…</span>`;
  let pkg; try { pkg = await readProduct(zipFile); } catch (e) { card.innerHTML = `<div class="error">${TA('Fișierul')} ${esc(zipFile.name)} ${TA('nu se poate citi:')} ${esc(errText(e))}</div>`; return; }
  const m = pkg.meta, bad = pkg.issues.some(x => x.level === 'error');
  const same = books.filter(b => !b.deleted_at && norm(b.title) === norm(m.title || '') && b.language === m.language);
  const cov = pkg.cover ? URL.createObjectURL(pkg.cover) : '';
  card.innerHTML = `<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">${cov ? `<img src="${cov}" alt="" style="width:120px;border-radius:8px">` : ''}
    <div style="flex:1;min-width:220px"><b>${esc(m.title || '—')}</b>${m.subtitle ? `<div class="muted">${esc(m.subtitle)}</div>` : ''}
    <div class="muted" style="font-size:13px">${esc(String(m.language || '').toUpperCase())} · ${esc(m.product_type || '')} · ${pkg.file ? (pkg.file.size / 1048576).toFixed(1).replace('.', ',') + ' MB' : '—'} · ${pkg.price == null ? TA('fără preț') : (pkg.price / 100).toFixed(2).replace('.', ',') + ' €'}${pkg.list ? (' ' + TA('(întreg') + ' ') + (pkg.list / 100).toFixed(2).replace('.', ',') + ' €)' : ''}</div>
    <div class="muted" style="font-size:13px">${pkg.aplus.length} module A+ · ${(m.keywords || []).length} cuvinte-cheie</div>
    ${pkg.issues.length ? `<ul style="margin:6px 0">${pkg.issues.map(x => `<li style="color:${x.level === 'error' ? '#b91c1c' : '#92400e'}">${x.level === 'error' ? '✕' : '⚠'} ${esc(x.text)}</li>`).join('')}</ul>` : ('<div style="color:#15803d;font-size:14px">' + TA('✓ Totul e în regulă') + '</div>')}
    ${same.length && !bad ? `<div style="margin:8px 0">${TA('Există deja acest produs în')} ${esc(String(m.language).toUpperCase())}. <label><input type="radio" name="m${zipFile.size}${zipFile.lastModified}" value="update" checked> ${TA('Actualizează-l')}</label> <label><input type="radio" name="m${zipFile.size}${zipFile.lastModified}" value="new"> ${TA('Adaugă ca produs nou')}</label></div>` : ''}
    ${bad ? '' : ('<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px"><button class="btn btn-buy" data-st="published">' + TA('Publică') + '</button><button class="btn btn-ghost" data-st="draft">' + TA('Salvează ca ciornă') + '</button></div>')}
    <div class="imp-log muted" style="margin-top:8px"></div></div></div>`;
  $$('[data-st]', card).forEach(btn => btn.onclick = async () => {
    const log = $('.imp-log', card), say = x => { log.textContent = x; };
    $$('[data-st]', card).forEach(b => b.disabled = true);
    const mode = card.querySelector('input[type=radio]:checked')?.value;
    try {
      const id = (mode === 'update' && same[0]?.id) || crypto.randomUUID();
      say(TA('Pregătesc coperta…')); const cover = await compressImage(pkg.cover, { maxW: 1200, maxH: 1920, name: 'cover' });
      const aplus = [];
      for (const [i, mod] of pkg.aplus.entries()) {
        say(`${TA('Încarc imaginile A+ (')}${i + 1}/${pkg.aplus.length})…`);
        const spec = APL[mod.type], imgs = [];
        for (const f of mod.files || []) {
          if (!f) { imgs.push(null); continue; }
          const { w, h } = await imgSize(f);
          const light = await compressImage(f, { maxW: spec.rec[0] > 1000 ? 2400 : spec.rec[0] * 2, maxH: spec.rec[0] > 1000 ? 744 : spec.rec[1] * 2, maxBytes: spec.rec[0] > 1000 ? 420 * 1024 : 280 * 1024, name: 'aplus' });
          const up = await api.uploadAplusImage(id, light); imgs.push({ ref: up.ref, w, h });
        }
        aplus.push({ type: mod.type, title: mod.title || '', text: mod.text || '', side: mod.side === 'right' ? 'right' : 'left', imgs, ...(mod.type === 'three' ? { caps: mod.caps } : {}) });
      }
      const ok = btn.dataset.st === 'published' && pkg.price != null && (pkg.price === 0 || pkg.price >= 49);
      const data = { id, title: String(m.title).trim(), subtitle: m.subtitle || null, keywords: (m.keywords || []).slice(0, 7), aplus, author: 'Librava', description: m.description,
        product_type: m.product_type, language: m.language, category: m.category, categories: [m.category], price_cents: pkg.price ?? 0, list_price_cents: pkg.list,
        allow_download: true, stamp_downloads: false, status: ok ? 'published' : 'draft', rights: 'own', published_at: new Date().toISOString().slice(0, 10), ...(/^[0-9a-f-]{36}$/i.test(m.group || '') ? { lang_group: m.group } : {}) };
      say('Salvez produsul…'); await api.saveBook(data, { file: pkg.file, cover });
      card.innerHTML = `<div style="color:#15803d">✓ ${esc(m.title)} — ${ok ? TA('publicat') : TA('salvat ca ciornă')}. <a href="#${ROUTE}">${TA('Vezi produsele')}</a></div>`;
    } catch (e) { say('Eroare: ' + errText(e)); $$('[data-st]', card).forEach(b => b.disabled = false); }
  });
}
