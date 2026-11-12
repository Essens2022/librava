// Admin → Digital products: a short form for planners, calendars, organizers, spreadsheets and templates.
// (ebooks keep their own detailed form; this one has only what a downloadable file needs.)
import { t, getLang, LANGS } from './i18n.js?v=20261112220334';
import { esc, $, $$ } from './util.js?v=20261112220334';
import { api } from './api.js?v=20261112220334';
import { icon, toast, errText, CATS } from './ui.js?v=20261112220334';
import { aplusEditor } from './admin.js?v=20261112220334';
import { PTYPES, FILE_FORMATS, ptypeOf, isDigital } from './ptypes.js?v=20261112220334';

const ext = n => (String(n || '').match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
const cents = v => Math.round(parseFloat(String(v).replace(',', '.')) * 100) || 0;

export async function digitalAdmin(body) {
  const list = (await api.adminBooks()).filter(b => !b.deleted_at && isDigital(b));
  body.innerHTML = `<div class="panel" style="margin-bottom:16px">
    <h2 style="margin:0 0 4px;font-size:18px">Produse digitale</h2>
    <p class="muted" style="margin:0 0 12px">Planificatoare, calendare, organizatoare, foi de calcul, șabloane. Clientul le descarcă imediat după plată din bibliotecă. Formate: ${FILE_FORMATS.filter(f => f !== 'epub').map(f => f.toUpperCase()).join(', ')}.</p>
    <button class="btn btn-buy" id="dg-new">${icon('plus', 'ico')} Adaugă produs digital</button></div>
    <div class="panel"><div id="dg-rows">${list.length ? list.map(b => `<div class="dg-row" style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)">
      <div style="flex:1;min-width:0"><b>${esc(b.title)}</b><div class="muted" style="font-size:13px">${esc(t('ptype1.' + ptypeOf(b)))} · ${esc(String(b.format).toUpperCase())} · ${b.status === 'published' ? 'publicat' : 'ciornă'} · ${(b.price_cents / 100).toFixed(2)} €</div></div>
      <button class="btn btn-ghost btn-sm" data-edit="${esc(b.id)}">Modifică</button></div>`).join('') : '<p class="muted">Niciun produs digital încă.</p>'}</div></div>
    <div id="dg-form"></div>`;
  $('#dg-new', body).onclick = () => form(body, null);
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
