// Librava search: forgiving like Amazon. Ignores accents and letter case, matches the beginning of words,
// tolerates small typos ("calistenics" → "calisthenics"), looks in title, series, author, keywords, categories,
// ISBN / Librava code and description, and ranks the strongest matches first.
import { norm } from './util.js?v=20261027064338';
import { t } from './i18n.js?v=20261027064338';

const STOP = new Set(('a an and the of for to in on at by with from or is are de la le les des du un une et en el los las y del al il lo gli di da per con e o un una uno dei delle si din pe cu cartea carte der die das und von zu mit ein eine').split(' '));
const words = s => norm(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
export const queryTerms = q => { const w = words(q); const kept = w.filter(x => !STOP.has(x)); return kept.length ? kept : w; };

// edit distance with an early exit (only small distances matter)
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
const allowed = term => term.length >= 8 ? 2 : term.length >= 5 ? 1 : 0;
// how well one term matches a list of words: 1 exact, .8 start of word, .5 inside, .45 typo
function termHit(term, ws, joined, inside = true) {
  let best = 0;
  for (const w of ws) {
    if (w === term) return 1;
    if (w.startsWith(term)) best = Math.max(best, term.length >= 2 ? .8 : .3);
    else if (inside && term.length >= 3 && w.includes(term)) best = Math.max(best, .5);
    else if (best < .45) { const m = allowed(term); if (m && lev(term, w.slice(0, term.length + m), m) <= m && lev(term, w, m) <= m) best = .45; }
  }
  if (!best && inside && term.length >= 4 && joined.includes(term)) best = .4; // e.g. words written together
  return best;
}

const cache = new WeakMap();
function fields(b) {
  let f = cache.get(b);
  if (f && f.v === b.updated_at) return f;
  const cats = [...new Set([b.category, ...(b.categories || [])].filter(Boolean))];
  const mk = s => { const ws = words(s); return { ws, joined: ws.join('') }; };
  f = {
    v: b.updated_at,
    title: mk(`${b.title} ${b.subtitle || ''}`), series: mk(b.series_name || ''),
    author: mk([b.author, ...(b.contributors || []).map(c => c.name)].join(' ')),
    kw: mk((b.keywords || []).join(' ')), cat: mk(cats.map(c => `${t('cat.' + c)} ${c}`).join(' ')),
    desc: mk(String(b.description || b.blurb || '').replace(/<[^>]*>/g, ' ')),   // the store list carries only the start (blurb)
    codes: [b.isbn, b.librava_id].filter(Boolean).map(c => norm(c).replace(/[^a-z0-9]/g, '')),
  };
  cache.set(b, f);
  return f;
}
const W = { title: 10, series: 7, author: 8, kw: 5, cat: 4, desc: 1.2 };

// score > 0 when every word of the query is found somewhere (or `loose`: when at least one is)
export function scoreBook(b, q, { loose = false } = {}) {
  const terms = queryTerms(q); if (!terms.length) return 0;
  const f = fields(b);
  const code = norm(q).replace(/[^a-z0-9]/g, '');
  if (code.length >= 6 && f.codes.some(c => c === code)) return 1000;
  let total = 0, found = 0;
  for (const term of terms) {
    let best = 0;
    for (const k in W) { const h = termHit(term, f[k].ws, f[k].joined, k !== 'desc'); if (h) best = Math.max(best, h * W[k]); }
    if (best) { found++; total += best; } else if (!loose) return 0;
  }
  if (!found) return 0;
  // the whole phrase at the start of the title counts most
  const nq = words(q).join(' '), title = f.title.ws.join(' ');
  if (title.startsWith(nq)) total += 12; else if (title.includes(nq)) total += 6;
  if (words(b.author).join(' ') === nq) total += 10;
  return total * (found / terms.length) + Math.min(5, (b.sales_count || 0) / 20) + (b.rating_avg || 0) / 5;
}

// "Did you mean…": replaces misspelled words with the closest word used in the catalogue
export function didYouMean(q, books) {
  const vocab = new Set();
  for (const b of books) { const f = fields(b); for (const k of ['title', 'series', 'author', 'kw', 'cat']) f[k].ws.forEach(w => w.length > 2 && vocab.add(w)); }
  let changed = false;
  const out = words(q).map(w => {
    if (vocab.has(w) || w.length < 3) return w;
    let best = null, bd = 3;
    for (const v of vocab) { const d = lev(w, v, 2); if (d < bd || (d === bd && best && v.length < best.length)) { bd = d; best = v; } }
    if (best && bd <= Math.max(1, allowed(w))) { changed = true; return best; }
    return w;
  });
  return changed ? out.join(' ') : null;
}

// suggestions under the search box: books, authors, series and categories
export function suggest(q, books, limit = 8) {
  const nq = norm(q).trim(); if (!nq) return [];
  const ranked = books.map(b => [b, scoreBook(b, q, { loose: false })]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
  const out = [], seen = new Set();
  for (const [b] of ranked.slice(0, 5)) out.push({ type: 'book', book: b, label: b.title });
  const terms = queryTerms(q);
  const add = (type, label, extra) => { const k = type + ':' + norm(label); if (seen.has(k) || out.length >= limit) return; seen.add(k); out.push({ type, label, ...extra }); };
  for (const b of books) {
    const a = b.author; if (a && terms.every(x => words(a).some(w => w.startsWith(x)))) add('author', a);
    if (b.series_name && terms.every(x => words(b.series_name).some(w => w.startsWith(x)))) add('series', b.series_name);
  }
  const cats = new Set(books.flatMap(b => [b.category, ...(b.categories || [])]).filter(Boolean));
  for (const c of cats) { const name = t('cat.' + c); if (terms.every(x => words(name).some(w => w.startsWith(x)))) add('cat', name, { cat: c }); }
  return out.slice(0, limit);
}
// shows the typed part in bold, like Amazon's suggestions
export function highlight(label, q, esc) {
  const terms = queryTerms(q).filter(x => x.length > 0);
  const n = norm(label);
  const marks = new Array(label.length).fill(false);
  for (const term of terms) { const re = new RegExp('(^|[^\\p{L}\\p{N}])(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gu'); let m; while ((m = re.exec(n))) { const s = m.index + m[1].length; for (let i = s; i < s + m[2].length && i < marks.length; i++) marks[i] = true; if (re.lastIndex === m.index) re.lastIndex++; } }
  let html = '', on = false;
  for (let i = 0; i < label.length; i++) { if (marks[i] !== on) { html += on ? '</b>' : '<b>'; on = marks[i]; } html += esc(label[i]); }
  return html + (on ? '</b>' : '');
}
