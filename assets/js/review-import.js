// Reads a file of reviews exported from another shop (CSV, TSV, Excel, JSON) and turns it into
// Librava reviews: stars, title, text, name, date + time, country. Column names are recognised in
// many languages; the admin can correct the choice before importing.

export const REVIEW_FIELDS = ['rating', 'title', 'body', 'name', 'date', 'time', 'country', 'product'];

const strip = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const HINTS = {
  rating: ['rating', 'stars', 'star', 'score', 'stelle', 'stele', 'stea', 'nota', 'voto', 'valutazione', 'punteggio', 'note', 'bewertung', 'sterne', 'estrellas', 'puntuacion', 'etoiles', 'review_rating', 'rating_value', 'review score', 'calificacion', 'evaluare'],
  title: ['title', 'review title', 'review_title', 'titolo', 'titlu', 'headline', 'summary', 'subject', 'titre', 'titel', 'titulo', 'oggetto'],
  body: ['body', 'review', 'review text', 'review_text', 'text', 'content', 'comment', 'comments', 'recensione', 'recenzie', 'commento', 'comentariu', 'comentarii', 'testo', 'message', 'avis', 'kommentar', 'opinion', 'descrizione', 'review body', 'review_body', 'feedback'],
  name: ['name', 'author', 'reviewer', 'reviewer name', 'reviewer_name', 'nome', 'nume', 'customer', 'customer name', 'user', 'username', 'display name', 'display_name', 'autore', 'autor', 'nom', 'cliente', 'client', 'buyer'],
  date: ['date', 'data', 'created', 'created_at', 'created at', 'review date', 'review_date', 'datum', 'fecha', 'published', 'published_at', 'submitted', 'submitted_at', 'date_created', 'timestamp', 'data recensione'],
  time: ['time', 'ora', 'hour', 'heure', 'zeit', 'orario'],
  country: ['country', 'paese', 'tara', 'location', 'pays', 'land', 'nazione', 'pais', 'region'],
  product: ['product', 'product title', 'product_title', 'book', 'item', 'listing', 'sku', 'asin', 'prodotto', 'produs', 'carte', 'libro', 'handle', 'product_handle', 'product name'],
};

// ---------------------------------------------------------------- reading the file
function parseDelimited(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/).find(l => l.trim()) || '';
  const delim = ['\t', ';', ',', '|'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"' && cell === '') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some(x => x.trim())) rows.push(row);
  const head = (rows.shift() || []).map((h, i) => h.trim() || 'col' + (i + 1));
  return { headers: head, rows: rows.map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()]))) };
}
function fromObjects(list) {
  const flat = o => { const out = {}; const walk = (v, k) => { if (v && typeof v === 'object' && !Array.isArray(v)) for (const [kk, vv] of Object.entries(v)) walk(vv, k ? k + '.' + kk : kk); else out[k] = Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v); }; walk(o, ''); return out; };
  const rows = list.filter(x => x && typeof x === 'object').map(flat);
  const headers = [...new Set(rows.flatMap(r => Object.keys(r)))];
  return { headers, rows };
}
export async function readReviewFile(file, loadXlsx) {
  const name = file.name.toLowerCase();
  if (/\.(xlsx|xls|ods)$/.test(name)) {
    const XLSX = await loadXlsx();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const sh = wb.Sheets[wb.SheetNames[0]];
    const list = XLSX.utils.sheet_to_json(sh, { defval: '', raw: false, dateNF: 'yyyy-mm-dd hh:mm' });
    return fromObjects(list);
  }
  const text = await file.text();
  if (/\.json$/.test(name) || /^\s*[[{]/.test(text)) {
    let j = JSON.parse(text);
    if (!Array.isArray(j)) j = j.reviews || j.data || j.items || Object.values(j).find(Array.isArray) || [j];
    return fromObjects(j);
  }
  return parseDelimited(text);
}

// ---------------------------------------------------------------- which column is what
export function guessMapping(headers) {
  const map = {}, used = new Set();
  const score = (h, f) => { const s = strip(h).replace(/[_\-.]+/g, ' '); let best = 0;
    for (const k of HINTS[f]) { if (s === k) best = Math.max(best, 3); else if (s.endsWith(' ' + k) || s.startsWith(k + ' ')) best = Math.max(best, 2); else if (k.length > 3 && s.includes(k)) best = Math.max(best, 1); }
    return best; };
  for (const f of ['rating', 'body', 'title', 'name', 'date', 'time', 'country', 'product']) {
    const c = headers.map(h => [h, score(h, f)]).filter(([h, s]) => s && !used.has(h)).sort((a, b) => b[1] - a[1])[0];
    if (c) { map[f] = c[0]; used.add(c[0]); }
  }
  return map;
}

// ---------------------------------------------------------------- values
export function parseRating(v) {
  const s = String(v ?? '').trim(); if (!s) return null;
  const stars = (s.match(/★/g) || []).length; if (stars) return Math.min(5, stars);
  const m = s.replace(',', '.').match(/(\d+(?:\.\d+)?)(?:\s*(?:\/|out of|su|din|de|von|sur|of)\s*(\d+))?/i); if (!m) return null;
  let n = parseFloat(m[1]); const of = m[2] ? parseFloat(m[2]) : n > 5 ? (n <= 10 ? 10 : 100) : 5;
  n = n / of * 5;
  const r = Math.round(n); return r >= 1 && r <= 5 ? r : null;
}
const MONTHS = { jan: 1, ian: 1, gen: 1, ene: 1, janv: 1, januar: 1, feb: 2, febr: 2, fev: 2, mar: 3, marz: 3, mars: 3, apr: 4, avr: 4, abr: 4, may: 5, mai: 5, mag: 5, jun: 6, iun: 6, giu: 6, juin: 6, jul: 7, iul: 7, lug: 7, juil: 7, aug: 8, ago: 8, aout: 8, sep: 9, set: 9, sept: 9, oct: 10, ott: 10, okt: 10, nov: 11, dec: 12, dic: 12, dez: 12, dic_: 12 };
const monthOf = w => { w = strip(w).replace(/\./g, ''); for (const len of [5, 4, 3]) { const k = w.slice(0, len); if (MONTHS[k]) return MONTHS[k]; } return null; };
// returns an ISO date-time, or null; dayFirst decides 03/04/2025 (Europe: 3 April)
export function parseWhen(dateV, timeV, dayFirst = true) {
  let s = String(dateV ?? '').trim(); const t = String(timeV ?? '').trim();
  if (!s && !t) return null;
  if (/^\d{10,13}$/.test(s)) { const n = +s; return new Date(s.length === 10 ? n * 1000 : n).toISOString(); }
  // Excel serial day number
  if (/^\d{5}(\.\d+)?$/.test(s)) return new Date(Math.round((+s - 25569) * 864e5)).toISOString();
  let y, mo, d, hh = 12, mm = 0, ss = 0, iso = null;
  const tm = (t || s).match(/(\d{1,2})[:.h](\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
  let m;
  if ((m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?/))) {
    [y, mo, d] = [+m[1], +m[2], +m[3]];
    if (m[4]) { hh = +m[4]; mm = +m[5]; ss = +(m[6] || 0); if (m[7]) iso = `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}${m[7] === 'Z' ? 'Z' : m[7].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2')}`; }
  } else if ((m = s.match(/(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/))) {
    let a = +m[1], b = +m[2]; y = +m[3]; if (y < 100) y += 2000;
    if (a > 12) dayFirst = true; else if (b > 12) dayFirst = false;
    [d, mo] = dayFirst ? [a, b] : [b, a];
  } else if ((m = s.match(/(\d{1,2})\.?\s+(?:de\s+)?([A-Za-zÀ-ÿ.]+)\s+(?:de\s+)?(\d{4})/)) && monthOf(m[2])) {
    [d, mo, y] = [+m[1], monthOf(m[2]), +m[3]];          // 12 March 2025 · 12 marzo 2025 · 12. März 2025
  } else if ((m = s.match(/([A-Za-zÀ-ÿ.]+)\s+(\d{1,2}),?\s+(\d{4})/)) && monthOf(m[1])) {
    [mo, d, y] = [monthOf(m[1]), +m[2], +m[3]];          // March 12, 2025
  } else {
    const p = Date.parse(s); return isNaN(p) ? null : new Date(p).toISOString();
  }
  if (iso) { const p = Date.parse(iso); return isNaN(p) ? null : new Date(p).toISOString(); }
  if (tm && !(s.match(/\d{4}-\d{1,2}-\d{1,2}[T ]\d/))) { hh = +tm[1]; mm = +tm[2]; ss = +(tm[3] || 0); if (tm[4]) { const pm = /pm/i.test(tm[4]); if (pm && hh < 12) hh += 12; if (!pm && hh === 12) hh = 0; } }
  if (!y || !mo || !d || mo > 12 || d > 31) return null;
  // no time zone in the file: the shop's own time (Italy)
  const local = new Date(Date.UTC(y, mo - 1, d, hh, mm, ss));
  const off = (() => { try { const p = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Rome', timeZoneName: 'shortOffset' }).formatToParts(local).find(x => x.type === 'timeZoneName').value; const q = p.match(/([+-])(\d{1,2})(?::(\d{2}))?/); return q ? (q[1] === '-' ? -1 : 1) * (+q[2] * 60 + +(q[3] || 0)) : 0; } catch { return 0; } })();
  return new Date(local.getTime() - off * 6e4).toISOString();
}
// "Reviewed in Italy on 12 March 2025" → the date part is found by parseWhen; the country is kept separately
export function countryFrom(s) { const m = String(s || '').match(/(?:reviewed in|recensito in|recenzat în|évalué en|bewertet in|revisado en)\s+(?:the\s+)?([^0-9]+?)\s+(?:on|il|pe|le|am|el)\s/i); return m ? m[1].trim() : ''; }

const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

// file rows + mapping → clean reviews (and the rows that had to be skipped, with why)
export function buildReviews(rows, map, { dayFirst = true, product = '' } = {}) {
  const ok = [], skipped = [];
  rows.forEach((r, i) => {
    const g = f => map[f] ? String(r[map[f]] ?? '').trim() : '';
    if (product && map.product && g('product') !== product) return;
    const rating = parseRating(g('rating'));
    const body = g('body').replace(/\r\n?/g, '\n').slice(0, 8000), title = g('title').slice(0, 300);
    if (!rating) { skipped.push({ line: i + 2, why: 'rating' }); return; }
    const when = parseWhen(g('date'), g('time'), dayFirst);
    const name = g('name').slice(0, 80);
    const country = (g('country') || countryFrom(g('date'))).slice(0, 60);
    ok.push({ rating, title, body, author_name: name, created_at: when, country, line: i + 2,
      ext_key: hash([strip(name), (when || '').slice(0, 10), rating, strip(title), strip(body).slice(0, 300)].join('|')) });
  });
  return { ok, skipped };
}
