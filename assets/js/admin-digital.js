// Admin → Digital products: a short form for planners, calendars, organizers, spreadsheets and templates.
// (ebooks keep their own detailed form; this one has only what a downloadable file needs.)
import { t, getLang, LANGS } from './i18n.js?v=20261113152750';
import { esc, $, $$, loadScript, norm, compressImage } from './util.js?v=20261113152750';
import { api } from './api.js?v=20261113152750';
import { icon, toast, errText, CATS } from './ui.js?v=20261113152750';
import { aplusEditor } from './admin.js?v=20261113152750';
import { PTYPES, FILE_FORMATS, ptypeOf, isDigital } from './ptypes.js?v=20261113152750';

const ext = n => (String(n || '').match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
const cents = v => Math.round(parseFloat(String(v).replace(',', '.')) * 100) || 0;

export async function digitalAdmin(body) {
  const list = (await api.adminBooks()).filter(b => !b.deleted_at && isDigital(b));
  body.innerHTML = `<div class="panel" style="margin-bottom:16px">
    <h2 style="margin:0 0 4px;font-size:18px">Produse digitale</h2>
    <p class="muted" style="margin:0 0 12px">Planificatoare, calendare, organizatoare, foi de calcul, șabloane. Clientul le descarcă imediat după plată din bibliotecă. Formate: ${FILE_FORMATS.filter(f => f !== 'epub').map(f => f.toUpperCase()).join(', ')}.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-buy" id="dg-new">${icon('plus', 'ico')} Adaugă produs digital</button>
    <label class="btn btn-ghost" style="cursor:pointer">${icon('upload', 'ico')} Importă produs dintr-un fișier (.zip)<input type="file" id="dg-imp" accept=".zip,application/zip" multiple hidden></label></div>
    <div id="dg-imp-list"></div></div>
    <div class="panel"><div id="dg-rows">${list.length ? list.map(b => `<div class="dg-row" style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)">
      <div style="flex:1;min-width:0"><b>${esc(b.title)}</b><div class="muted" style="font-size:13px">${esc(t('ptype1.' + ptypeOf(b)))} · ${esc(String(b.format).toUpperCase())} · ${b.status === 'published' ? 'publicat' : 'ciornă'} · ${(b.price_cents / 100).toFixed(2)} €</div></div>
      <button class="btn btn-ghost btn-sm" data-edit="${esc(b.id)}">Modifică</button><button class="btn btn-ghost btn-sm" data-del="${esc(b.id)}" style="color:#b91c1c">Șterge</button></div>`).join('') : '<p class="muted">Niciun produs digital încă.</p>'}</div></div>
    <div id="dg-form"></div>`;
  $('#dg-new', body).onclick = () => form(body, null);
  $$('[data-del]', body).forEach(x => x.onclick = async () => {
    const b = list.find(y => y.id === x.dataset.del); if (!b) return;
    if (!confirm('Ștergi produsul „' + b.title + '”? Dispare din magazin (clienții care l-au cumpărat îl păstrează în bibliotecă).')) return;
    x.disabled = true; try { await api.deleteBook(b.id); toast('Șters'); await digitalAdmin(body); } catch (e) { toast(errText(e)); x.disabled = false; }
  });
  $('#dg-imp', body).onchange = async e => { const fs = [...e.target.files]; e.target.value = ''; for (const f of fs) await importCard(body, f, list); };
  $$('[data-edit]', body).forEach(x => x.onclick = async () => form(body, await api.getBook(x.dataset.edit).catch(() => list.find(b => b.id === x.dataset.edit))));
}

function form(body, b) {
  const v = b || { product_type: 'planner', language: getLang(), category: CATS[0], status: 'draft', price_cents: 0 };
  const box = $('#dg-form', body);
  const files = {};
  const draftId = b?.id || crypto.randomUUID();
  const kws = [...(v.keywords || []), '', '', '', '', '', '', ''].slice(0, 7);
  const aplusModules = JSON.parse(JSON.stringify(v.aplus || [])).map(m => ({ ...m, imgs: (m.imgs || []).map(im => im && { ...im, url: im.url || im.ref }) }));
  box.innerHTML = `<div class="panel" style="margin-top:16px"><h3 style="margin:0 0 12px">${b ? 'Modifică produsul' : 'Produs digital nou'}</h3>
    <div style="display:grid;gap:12px;max-width:640px">
      <label class="field"><span>Titlu * (cum caută oamenii pe internet)</span><input class="input" id="dg-title" maxlength="140" value="${esc(v.title || '')}"></label>
      <label class="field"><span>Subtitlu (cifre concrete: câte pagini, câte foi, ce conține)</span><input class="input" id="dg-sub" maxlength="200" value="${esc(v.subtitle || '')}"></label>
      <label class="field"><span>Tip produs *</span><select class="input" id="dg-type">${PTYPES.map(p => `<option value="${p}" ${ptypeOf(v) === p ? 'selected' : ''}>${esc(t('ptype1.' + p))}</option>`).join('')}</select></label>
      <label class="field"><span>Limba</span><select class="input" id="dg-lang">${LANGS.map(([c, n]) => `<option value="${c}" ${v.language === c ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <label class="field"><span>Categorie</span><select class="input" id="dg-cat">${CATS.map(c => `<option value="${c}" ${v.category === c ? 'selected' : ''}>${esc(t('cat.' + c))}</option>`).join('')}</select></label>
      <div class="field"><span>Cuvinte-cheie (max. 7, nu repeta titlul)</span><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">${kws.map((k, i) => `<input class="input dg-kw" maxlength="50" placeholder="${i + 1}" value="${esc(k)}">`).join('')}</div></div>
      <label class="field"><span>Descriere *</span><textarea class="input" id="dg-desc" rows="6">${esc(v.description || '')}</textarea></label>
      <div style="display:flex;gap:12px"><label class="field" style="flex:1"><span>Preț (€) *</span><input class="input" id="dg-price" inputmode="decimal" value="${v.price_cents ? (v.price_cents / 100).toFixed(2) : ''}"></label>
        <label class="field" style="flex:1"><span>Preț întreg (opțional)</span><input class="input" id="dg-list" inputmode="decimal" value="${v.list_price_cents ? (v.list_price_cents / 100).toFixed(2) : ''}"></label></div>
      <label class="field"><span>Fișier (${FILE_FORMATS.map(f => '.' + f).join(' ')}) ${b ? '— lasă gol ca să-l păstrezi' : '*'}</span><input type="file" id="dg-file" accept=".pdf,.xlsx,.docx,.zip"></label>
      <label class="field"><span>Copertă / imagine ${b ? '— lasă gol ca s-o păstrezi' : '*'}</span><input type="file" id="dg-cover" accept="image/*"></label>
      <div class="field"><span>Ce primește clientul — imagini și text (modulele A+, ca la carte)</span><div id="dg-aplus"></div></div>
      <div class="error" id="dg-err" hidden></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-buy" id="dg-pub">Publică</button><button class="btn btn-ghost" id="dg-draft">Salvează ciornă</button></div>
    </div></div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const getAplus = aplusEditor($('#dg-aplus', box), aplusModules, () => draftId);
  $('#dg-file', box).onchange = e => files.file = e.target.files[0];
  $('#dg-cover', box).onchange = e => files.cover = e.target.files[0];
  const save = async (status, btn) => {
    const err = $('#dg-err', box); err.hidden = true;
    const fail = m => { err.textContent = m; err.hidden = false; };
    const title = $('#dg-title', box).value.trim(), desc = $('#dg-desc', box).value.trim(), price = cents($('#dg-price', box).value);
    if (!title || !desc) return fail('Completează titlul și descrierea.');
    if (!b && !files.file) return fail('Alege fișierul produsului.');
    if (files.file && !FILE_FORMATS.includes(ext(files.file.name))) return fail('Format nerecunoscut. Acceptate: ' + FILE_FORMATS.join(', '));
    if (status === 'published' && (!(b?.cover_url || files.cover))) return fail('Adaugă o imagine de copertă înainte de publicare.');
    if (status === 'published' && price < 49 && price !== 0) return fail('Prețul minim este 0,49 € (sau gratuit).');
    const data = {
      id: draftId, title, subtitle: $('#dg-sub', box).value.trim() || null, keywords: $$('.dg-kw', box).map(i => i.value.trim()).filter(Boolean), aplus: getAplus(), author: v.author || 'Librava', description: desc,
      product_type: $('#dg-type', box).value, language: $('#dg-lang', box).value, category: $('#dg-cat', box).value, categories: [$('#dg-cat', box).value],
      price_cents: price, list_price_cents: cents($('#dg-list', box).value) || null,
      allow_download: true, stamp_downloads: false, status, rights: 'own',
      published_at: b?.published_at || new Date().toISOString().slice(0, 10),
    };
    const old = btn.textContent; btn.disabled = true; btn.textContent = '…';
    try { await api.saveBook(data, files); toast('Salvat'); await digitalAdmin(body); }
    catch (e) { fail(errText(e)); btn.disabled = false; btn.textContent = old; }
  };
  $('#dg-pub', box).onclick = e => save('published', e.target);
  $('#dg-draft', box).onclick = e => save('draft', e.target);
}


// ---------------------------------------------------------------- import a whole digital product from one .zip
// product.json  title, subtitle, product_type, language, category, keywords, description, price, list_price, file, cover, aplus[]
// the product file (.zip/.pdf/.xlsx/.docx), cover.jpg and aplus/*.jpg sit next to it (aplus: same modules as book.json)
const APL = { banner: { imgs: 1, rec: [1940, 600] }, header: { imgs: 1, rec: [970, 600] }, image_text: { imgs: 1, rec: [600, 600] }, three: { imgs: 3, rec: [600, 600] }, text: { imgs: 0 } };
const imgSize = file => new Promise(res => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ w: 0, h: 0 }); im.src = u; });
const PROD_EXT = /\.(zip|pdf|xlsx|docx)$/i, PIMG = /\.(jpe?g|png|webp)$/i;
async function readProduct(zipFile) {
  await loadScript(new URL('../vendor/jszip.min.js?v=1', import.meta.url).href);
  const zip = await window.JSZip.loadAsync(zipFile);
  const entries = Object.values(zip.files).filter(e => !e.dir && !/(^|\/)(__MACOSX|\.DS_Store)/.test(e.name));
  const je = entries.find(e => /(^|\/)product\.json$/i.test(e.name));
  const issues = []; const err = t => issues.push({ level: 'error', text: t }), warn = t => issues.push({ level: 'warn', text: t });
  if (!je) err('Lipsește product.json din fișier.');
  const root = je ? je.name.replace(/product\.json$/i, '') : '';
  let meta = {}; if (je) { try { meta = JSON.parse(await je.async('string')); } catch { err('product.json nu se poate citi.'); } }
  const inRoot = entries.filter(e => e.name.startsWith(root));
  const byPath = p => p && inRoot.find(e => e.name === root + String(p).replace(/^\.?\//, '')) || null;
  const asFile = async (e, type) => e ? new File([await e.async('blob')], e.name.split('/').pop(), type ? { type } : {}) : null;
  const notApl = e => !/\/(aplus|a-plus)\//i.test(e.name) && e.name !== je?.name;
  const fe = byPath(meta.file) || inRoot.find(e => PROD_EXT.test(e.name) && notApl(e));
  const file = await asFile(fe);
  if (!file) err('Lipsește fișierul produsului (.zip, .pdf, .xlsx sau .docx).');
  const ce = byPath(meta.cover) || inRoot.find(e => /(^|\/)cover[^/]*\.(jpe?g|png|webp)$/i.test(e.name) && notApl(e));
  const cover = await asFile(ce);
  if (!cover) err('Lipsește coperta (cover.jpg).');
  for (const [k, n] of [['title', 'titlul'], ['description', 'descrierea'], ['language', 'limba'], ['product_type', 'tipul produsului'], ['category', 'categoria']]) if (!String(meta[k] || '').trim()) err('Lipsește ' + n + ' în product.json.');
  if (meta.product_type && !PTYPES.includes(meta.product_type)) err('Tip necunoscut: ' + meta.product_type + ' (acceptate: ' + PTYPES.join(', ') + ').');
  if (meta.category && !CATS.includes(meta.category)) err('Categorie necunoscută: ' + meta.category + '.');
  const num = v => v == null || v === '' ? null : Math.round(parseFloat(String(v).replace(',', '.')) * 100);
  const price = num(meta.price), list = num(meta.list_price);
  if (price == null || !Number.isFinite(price)) warn('Nu are preț: se salvează ca ciornă.'); else if (price > 0 && price < 49) err('Prețul minim este 0,49 €.');
  const aplus = [];
  for (const [i, m] of (Array.isArray(meta.aplus) ? meta.aplus : []).slice(0, 7).entries()) {
    if (!APL[m?.type]) { warn('Modul A+ necunoscut la poziția ' + (i + 1) + '.'); continue; }
    const items = m.type === 'three' ? (m.items || []).slice(0, 3) : [m], imgs = [];
    for (const it of items) { if (!APL[m.type].imgs) break; const e = byPath(it.image); if (it.image && !e) warn('Lipsește imaginea ' + it.image); imgs.push(await asFile(e)); }
    aplus.push({ ...m, files: imgs, caps: m.type === 'three' ? items.map(x => ({ title: x.title || '', text: x.text || '' })) : undefined });
  }
  return { name: zipFile.name, meta, file, cover, price, list: Number.isFinite(list) && list > (price || 0) ? list : null, aplus, issues };
}
async function importCard(body, zipFile, books) {
  const host = $('#dg-imp-list', body), card = document.createElement('div'); card.className = 'panel'; card.style.marginTop = '12px'; host.prepend(card);
  card.innerHTML = `<span class="muted">Citesc ${esc(zipFile.name)}…</span>`;
  let pkg; try { pkg = await readProduct(zipFile); } catch (e) { card.innerHTML = `<div class="error">Fișierul ${esc(zipFile.name)} nu se poate citi: ${esc(errText(e))}</div>`; return; }
  const m = pkg.meta, bad = pkg.issues.some(x => x.level === 'error');
  const same = books.filter(b => !b.deleted_at && norm(b.title) === norm(m.title || '') && b.language === m.language);
  const cov = pkg.cover ? URL.createObjectURL(pkg.cover) : '';
  card.innerHTML = `<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">${cov ? `<img src="${cov}" alt="" style="width:120px;border-radius:8px">` : ''}
    <div style="flex:1;min-width:220px"><b>${esc(m.title || '—')}</b>${m.subtitle ? `<div class="muted">${esc(m.subtitle)}</div>` : ''}
    <div class="muted" style="font-size:13px">${esc(String(m.language || '').toUpperCase())} · ${esc(m.product_type || '')} · ${pkg.file ? (pkg.file.size / 1048576).toFixed(1).replace('.', ',') + ' MB' : '—'} · ${pkg.price == null ? 'fără preț' : (pkg.price / 100).toFixed(2).replace('.', ',') + ' €'}${pkg.list ? ' (întreg ' + (pkg.list / 100).toFixed(2).replace('.', ',') + ' €)' : ''}</div>
    <div class="muted" style="font-size:13px">${pkg.aplus.length} module A+ · ${(m.keywords || []).length} cuvinte-cheie</div>
    ${pkg.issues.length ? `<ul style="margin:6px 0">${pkg.issues.map(x => `<li style="color:${x.level === 'error' ? '#b91c1c' : '#92400e'}">${x.level === 'error' ? '✕' : '⚠'} ${esc(x.text)}</li>`).join('')}</ul>` : '<div style="color:#15803d;font-size:14px">✓ Totul e în regulă</div>'}
    ${same.length && !bad ? `<div style="margin:8px 0">Există deja acest produs în ${esc(String(m.language).toUpperCase())}. <label><input type="radio" name="m${zipFile.size}${zipFile.lastModified}" value="update" checked> Actualizează-l</label> <label><input type="radio" name="m${zipFile.size}${zipFile.lastModified}" value="new"> Adaugă ca produs nou</label></div>` : ''}
    ${bad ? '' : '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px"><button class="btn btn-buy" data-st="published">Publică</button><button class="btn btn-ghost" data-st="draft">Salvează ca ciornă</button></div>'}
    <div class="imp-log muted" style="margin-top:8px"></div></div></div>`;
  $$('[data-st]', card).forEach(btn => btn.onclick = async () => {
    const log = $('.imp-log', card), say = x => { log.textContent = x; };
    $$('[data-st]', card).forEach(b => b.disabled = true);
    const mode = card.querySelector('input[type=radio]:checked')?.value;
    try {
      const id = (mode === 'update' && same[0]?.id) || crypto.randomUUID();
      say('Pregătesc coperta…'); const cover = await compressImage(pkg.cover, { maxW: 1200, maxH: 1920, name: 'cover' });
      const aplus = [];
      for (const [i, mod] of pkg.aplus.entries()) {
        say(`Încarc imaginile A+ (${i + 1}/${pkg.aplus.length})…`);
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
        allow_download: true, stamp_downloads: false, status: ok ? 'published' : 'draft', rights: 'own', published_at: new Date().toISOString().slice(0, 10) };
      say('Salvez produsul…'); await api.saveBook(data, { file: pkg.file, cover });
      card.innerHTML = `<div style="color:#15803d">✓ ${esc(m.title)} — ${ok ? 'publicat' : 'salvat ca ciornă'}.</div>`;
      setTimeout(() => digitalAdmin(body), 900);
    } catch (e) { say('Eroare: ' + errText(e)); $$('[data-st]', card).forEach(b => b.disabled = false); }
  });
}
