// Librava search: forgiving like Amazon. Ignores accents and letter case, matches the beginning of words
// ("yo" finds Yoga), tolerates small typos and common related words (diet = lose weight), looks in title, subtitle, series,
// author, the 7 keyword phrases, categories, ISBN / Librava code and description, and ranks the strongest matches first.
import { norm } from './util.js?v=20261112192149';
import { t, getLang } from './i18n.js?v=20261112192149';

// connecting words never have to match ("yoga per principianti" finds "Yoga Principianti a Casa")
const STOP = new Set(('a an and the of for to in on at by with from or is are de la le les des du un une et en el los las y del al il lo gli di da per con e o un una uno dei delle si din pe cu cartea carte der die das und von zu mit ein eine').split(' '));
const words = s => norm(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
export const queryTerms = q => { const w = words(q); const kept = w.filter(x => !STOP.has(x)); return kept.length ? kept : w; };

// related words (Italian / English): a book that has none of the typed word but has one of its relatives still shows up, lower down
const SYN_GROUPS = [
  'dimagr|perdere peso|perdita di peso|dieta|diete|weight loss|lose weight|diet|slim|fat loss|calorie',
  'ansia|ansie|stress|panico|anxiety|anxious|panic|worry|rilassam|relax',
  'casa|affitto|affitti|mutuo|mutui|immobili|home|house|rent|mortgage|property|real estate',
  'cane|cani|cucciolo|cuccioli|dog|dogs|puppy|puppies|addestramento',
  'gatto|gatti|cat|cats|kitten',
  'fumo|fumare|sigaretta|sigarette|tabacco|smettere di fumare|smoking|quit smoking|cigarette|nicotina|nicotine|svapare|vaping',
  'soldi|denaro|risparmio|risparmiare|money|saving|savings|budget|finanza|finanze|finance|investire|invest|guadagnare|earn|income',
  'sonno|dormire|insonnia|sleep|insomnia',
  'bambini|bambino|figli|genitori|parenting|kids|children|neonato|baby|infanzia|maternita',
  'cucina|ricette|ricetta|cook|cooking|recipe|recipes|kitchen|cibo|food',
  'smartphone|telefono|cellulare|iphone|android|phone|whatsapp',
  'computer|laptop|informatica|tecnologia|technology|internet|digitale|digital',
  'lavoro|carriera|colloquio|career|job|jobs|interview|curriculum|resume',
  'salute|benessere|health|wellness|wellbeing|fitness',
  'yoga|pilates|stretching|meditazione|meditation|mindfulness',
  'memoria|cervello|brain|memory|concentrazione|focus',
  'inglese|english|lingua|lingue|language|languages',
  'dolore|dolori|schiena|mal di schiena|back pain|pain|artrosi|sciatica|cervicale|joints|articolazioni',
  'amore|coppia|relazione|relazioni|couple|relationship|relationships|love|dating|matrimonio|marriage|divorzio|divorce',
  'senior|over 60|over 50|pensione|pensionati|retirement|retired',
].map(g => g.split('|').map(x => words(x).join(' ')));
const synAlts = term => {
  const out = new Set();
  for (const g of SYN_GROUPS) if (g.some(m => !m.includes(' ') && ((term.length >= 4 && m.startsWith(term)) || (m.length >= 4 && term.startsWith(m))))) g.forEach(m => out.add(m));
  return [...out];
};

// the typed text without connecting words left at the end ("yoga per" → "yoga")
export const cleanQuery = q => { const w = String(q || '').trim().split(/\s+/); while (w.length > 1 && STOP.has(norm(w[w.length - 1]))) w.pop(); return w.join(' '); };

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
// how well one typed term matches a list of words: 1 exact, .85 start of the word, .4 inside a word, .45 small typo
function termHit(term, ws, joined, { inside = true, typo = true } = {}) {
  let best = 0;
  for (const w of ws) {
    if (w === term) return 1;
    if (w.startsWith(term)) best = Math.max(best, term.length >= 2 ? .85 : .3);
    else if (inside && term.length >= 4 && w.includes(term)) best = Math.max(best, .4);
  }
  if (best) return best;
  if (typo) { const m = allowed(term); if (m) for (const w of ws) if (w[0] === term[0] && (lev(term, w, m) <= m || lev(term, w.slice(0, term.length), m) <= m)) return .45; }
  if (inside && term.length >= 4 && joined.includes(term)) return .35;   // words written together
  return 0;
}

const phrase = s => words(s).join(' ');
const cache = new WeakMap();
function fields(b) {
  const L = getLang();
  let f = cache.get(b);
  if (f && f.v === b.updated_at && f.l === L) return f;
  const cats = [...new Set([b.category, ...(b.categories || [])].filter(Boolean))];
  const mk = s => { const ws = words(s); return { ws, joined: ws.join(''), s: ws.join(' ') }; };
  const kw = (b.keywords || []).map(phrase).filter(Boolean);
  f = {
    v: b.updated_at, l: L,
    title: mk(b.title), sub: mk(b.subtitle || ''), series: mk(b.series_name || ''),
    author: mk([b.author, ...(b.contributors || []).map(c => c.name)].join(' ')),
    kw: mk(kw.join(' ')), kwp: kw, cat: mk(cats.map(c => `${t('cat.' + c)} ${c}`).join(' ')),
    desc: mk(String(b.description || b.blurb || '').replace(/<[^>]*>/g, ' ')),   // the store list carries only the start (blurb)
    codes: [b.isbn, b.librava_id].filter(Boolean).map(c => norm(c).replace(/[^a-z0-9]/g, '')),
  };
  f.txt = ' ' + [f.title.s, f.sub.s, f.kw.s, f.cat.s, f.series.s].join(' ');
  cache.set(b, f);
  return f;
}
const W = { title: 10, kw: 8, author: 8, series: 7, sub: 4, cat: 4 };   // the whole keyword phrase counts even more (see below)
const KEYS = Object.keys(W);

let PQ = { q: null };
function prep(q) {
  if (PQ.q === q && PQ.L === getLang()) return PQ;
  const terms = queryTerms(q);
  return PQ = { q, L: getLang(), terms, nq: words(q).join(' '), alts: terms.map(x => x.length >= 4 ? synAlts(x) : []), code: norm(q).replace(/[^a-z0-9]/g, '') };
}

// score > 0 when every word of the query is found somewhere (or `loose`: when at least one is)
export function scoreBook(b, q, { loose = false, typo = true } = {}) {
  const P = prep(q), terms = P.terms; if (!terms.length) return 0;
  const f = fields(b);
  if (P.code.length >= 6 && f.codes.some(c => c === P.code)) return 1000;
  let total = 0, found = 0;
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i]; let best = 0;
    for (const k of KEYS) { const h = termHit(term, f[k].ws, f[k].joined, { inside: true, typo }); if (h) best = Math.max(best, h * W[k]); }
    if (!best) { const h = termHit(term, f.desc.ws, '', { inside: false, typo: false }); if (h) best = h * 1.2; }
    if (!best) for (const a of P.alts[i]) if (f.txt.includes(' ' + a)) { best = 4; break; }
    if (best) { found++; total += best; } else if (!loose) return 0;
  }
  if (!found) return 0;
  const nq = P.nq;
  // the whole typed phrase inside one of the 7 keyword phrases counts most, then the title, then the subtitle
  let kb = 0; for (const p of f.kwp) { if (p.startsWith(nq)) { kb = 30; break; } if (kb < 16 && (' ' + p).includes(' ' + nq)) kb = 16; }
  total += kb;
  if (f.title.s.startsWith(nq)) total += 25; else if ((' ' + f.title.s).includes(' ' + nq)) total += 10;
  else if ((' ' + f.sub.s).includes(' ' + nq)) total += 5;
  if (f.title.ws[0] && f.title.ws[0].startsWith(terms[0])) total += 8;       // titles that begin with the typed letters go first
  if (f.author.s === nq) total += 10;
  return total * (found / terms.length) + Math.min(5, (b.sales_count || 0) / 20) + (b.rating_avg || 0) / 5;
}
export const byScore = (a, b) => b[1] - a[1] || (b[0].sales_count || 0) - (a[0].sales_count || 0) || String(b[0].published_at || '').localeCompare(String(a[0].published_at || ''));

// "Did you mean…": replaces misspelled words with the closest word used in the catalogue
const vocabs = new WeakMap();
export function didYouMean(q, books) {
  let vocab = vocabs.get(books);
  if (!vocab) { vocab = new Set(); for (const b of books) { const f = fields(b); for (const k of ['title', 'series', 'author', 'kw', 'cat']) f[k].ws.forEach(w => w.length > 2 && vocab.add(w)); } vocabs.set(books, vocab); }
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

// cut at the end of a word, never in the middle of one
export function cutWords(s, max) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1), sp = cut.lastIndexOf(' ');
  return (sp > max * .5 ? cut.slice(0, sp) : s.slice(0, max)).replace(/[\s,;:.\-–—]+$/, '') + '…';
}

// Everything the box under the search field shows, computed from the catalogue already in memory:
//  completions (the 7 keyword phrases), a category, books of the page language first and the others (with their flag) after them.
export function smartSuggest(q, books, { lang = getLang(), mixed = false, maxBooks = 4 } = {}) {
  const nq = words(q).join(' '), terms = queryTerms(q);
  const out = { rows: [], own: 0, other: 0, loose: false, dym: null };
  if (nq.length < 2 || !terms.length) return out;
  const run = (opts) => { const r = []; for (const b of books) { const s = scoreBook(b, q, opts); if (s > 0) r.push([b, s]); } return r.sort(byScore); };
  let hits = run({ typo: false });
  if (hits.length < 3 && terms.some(x => x.length >= 5)) { const more = run({ typo: true }); if (more.length > hits.length) hits = more; }
  if (!hits.length) { hits = run({ loose: true, typo: false }); out.loose = hits.length > 0; }
  if (!hits.length) { out.dym = didYouMean(q, books); return out; }
  const own = mixed ? hits : hits.filter(x => x[0].language === lang), other = mixed ? [] : hits.filter(x => x[0].language !== lang);
  out.own = own.length; out.other = other.length;
  const rows = out.rows;
  // 1. completions: the keyword phrases of the page language that contain what was typed
  const seen = new Set(), comps = [];
  for (const [b, s] of own.slice(0, 60)) for (const k of b.keywords || []) {
    const p = phrase(k); if (!p || seen.has(p)) continue;
    const pw = p.split(' ');
    if (!terms.every(x => pw.some(w => w.startsWith(x)))) continue;
    seen.add(p); comps.push([k.trim(), (p.startsWith(nq) ? 100 : (' ' + p).includes(' ' + nq) ? 60 : 30) + s * .2]);
  }
  comps.sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([label]) => rows.push({ type: 'query', label }));
  // 2. the best category for the typed words ("yoga in Health & Fitness")
  if (own.length >= 2) {
    const n = new Map(); for (const [b] of own) for (const c of new Set([b.category, ...(b.categories || [])].filter(Boolean))) n.set(c, (n.get(c) || 0) + 1);
    const top = [...n].sort((a, b) => b[1] - a[1])[0];
    if (top) rows.push({ type: 'cat', label: t('cat.' + top[0]), cat: top[0] });
  }
  // 3. the author when the typed words are (the start of) a name
  for (const [b] of hits.slice(0, 12)) { const a = b.author; if (a && terms.every(x => words(a).some(w => w.startsWith(x))) && !rows.some(r => r.type === 'author')) { rows.push({ type: 'author', label: a }); break; } }
  // 4. books: page language first, other languages last
  own.slice(0, maxBooks).forEach(([b]) => rows.push({ type: 'book', book: b }));
  const room = own.length ? 2 : 4;
  other.slice(0, room).forEach(([b]) => rows.push({ type: 'book', book: b, foreign: true }));
  return out;
}

// shows the matching part in bold (book titles); `rest` bolds the completion instead, like Amazon's query suggestions
export function highlight(label, q, esc, rest = false) {
  const terms = (rest ? words(q) : queryTerms(q)).filter(x => x.length > 0);
  const n = Array.from(label, c => norm(c).slice(0, 1) || ' ').join('');   // same length as the label, accents removed
  const marks = new Array(label.length).fill(false);
  for (const term of terms) { const re = new RegExp('(^|[^\\p{L}\\p{N}])(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gu'); let m; while ((m = re.exec(n))) { const s = m.index + m[1].length; for (let i = s; i < s + m[2].length && i < marks.length; i++) marks[i] = true; if (re.lastIndex === m.index) re.lastIndex++; } }
  if (rest) for (let i = 0; i < marks.length; i++) marks[i] = !marks[i];
  let html = '', on = false;
  for (let i = 0; i < label.length; i++) { if (marks[i] !== on) { html += on ? '</b>' : '<b>'; on = marks[i]; } html += esc(label[i]); }
  return html + (on ? '</b>' : '');
}
