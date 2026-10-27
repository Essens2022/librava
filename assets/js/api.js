// =====================================================================
//  Data layer. Two implementations with the same interface:
//   - DemoAPI: everything in this browser (localStorage + IndexedDB)
//   - SupabaseAPI: real accounts, database, private file storage, Stripe
// =====================================================================
import { CONFIG } from './config.js?v=20261027203146';
import { applyOffers, offerRunning } from './offers.js?v=20261027203146';
import { scoreBook } from './search.js?v=20261027203146';
import { getLang } from './i18n.js?v=20261027203146';
import { store, uid, blobs, norm, loadScript, fileToDataURL } from './util.js?v=20261027203146';
// Demo mode exists only for local development (localhost). The live site never loads fake books.
export const DEMO_ALLOWED = location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname);
let DEMO_BOOKS = [];


// ---------- shared catalog filtering / sorting ----------
export function filterBooks(all, o = {}) {
  let list = all.slice();
  if (!o.includeDrafts) list = list.filter(b => b.status === 'published');
  if (o.category) list = list.filter(b => b.category === o.category || (b.categories || []).includes(o.category));
  if (o.format) list = list.filter(b => b.format === o.format);
  if (o.color) list = list.filter(b => (b.color || 'color') === o.color);
  if (o.lang) list = list.filter(b => b.language === o.lang);
  if (o.featured) list = list.filter(b => b.is_featured);
  if (o.free) list = list.filter(b => !b.price_cents);
  if (o.deals) list = list.filter(b => b.list_price_cents && b.list_price_cents > b.price_cents);
  if (o.price) {
    const p = o.price;
    list = list.filter(b => p === 'free' ? !b.price_cents : p === 'u5' ? b.price_cents > 0 && b.price_cents < 500
      : p === '5to10' ? b.price_cents >= 500 && b.price_cents <= 1000 : p === 'o10' ? b.price_cents > 1000 : true);
  }
  if (o.rating) list = list.filter(b => (b.rating_avg || 0) >= o.rating);
  let scores = null;
  if (o.q) {
    scores = new Map();
    const strict = list.map(b => [b, scoreBook(b, o.q)]).filter(x => x[1] > 0);
    // nothing matches every word: show books that match at least one (Amazon does the same)
    const hits = strict.length ? strict : list.map(b => [b, scoreBook(b, o.q, { loose: true })]).filter(x => x[1] > 0);
    hits.forEach(([b, s]) => scores.set(b.id, s));
    list = hits.map(x => x[0]);
    list.loose = !strict.length && hits.length > 0;
  }
  // the same title in several formats (EPUB, PDF…) shows once in lists, like Amazon; the book page offers every format
  if (!o.includeDrafts && !o.format && !o.allFormats) list = oneEditionPerWork(list, all);
  const sort = o.sort || (o.q ? 'relevance' : '');
  const by = {
    relevance: (a, b) => (scores ? scores.get(b.id) - scores.get(a.id) : 0) || (b.sales_count || 0) - (a.sales_count || 0),
    priceAsc: (a, b) => a.price_cents - b.price_cents,
    priceDesc: (a, b) => b.price_cents - a.price_cents,
    newest: (a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')),
    rating: (a, b) => (b.rating_avg || 0) - (a.rating_avg || 0) || (b.rating_count || 0) - (a.rating_count || 0),
    bestsellers: (a, b) => (b.sales_count || 0) - (a.sales_count || 0),
  }[sort];
  if (by) list.sort(by);
  const loose = list.loose;
  if (o.limit) list = list.slice(0, o.limit);
  if (loose) list.loose = true;
  return list;
}

// what the store list needs for cards, filters, search and recommendations (the rest is read on the book page)
const CARD_COLS = 'id,title,subtitle,author,contributors,category,categories,language,format,color,pages,price_cents,list_price_cents,currency,cover_path,updated_at,published_at,status,is_featured,rating_avg,rating_count,sales_count,series_name,series_number,keywords,isbn,librava_id,work_id,deleted_at,blurb,sample_path';
const ADMIN_COLS = 'file_path,file_name,recommend_ids';
const CAT_KEY = 'catalog:list', CAT_V = 3;
const FMT_ORDER = { epub: 0, pdf: 1 };
// all published editions of a book (itself included), EPUB first
export function editionsOf(all, b) {
  if (!b?.work_id) return [b];
  const list = all.filter(x => x.work_id === b.work_id && x.status === 'published' && !x.deleted_at);
  if (!list.some(x => x.id === b.id)) list.push(b);
  return list.sort((a, c) => (FMT_ORDER[a.format] ?? 9) - (FMT_ORDER[c.format] ?? 9) || a.price_cents - c.price_cents);
}
// keeps one card per title: the cheapest edition, with the list of formats it is sold in
function oneEditionPerWork(list, all) {
  const best = new Map();
  for (const b of list) {
    if (!b.work_id) continue;
    const cur = best.get(b.work_id);
    if (!cur || (b.price_cents || 0) < (cur.price_cents || 0) || ((b.price_cents || 0) === (cur.price_cents || 0) && (FMT_ORDER[b.format] ?? 9) < (FMT_ORDER[cur.format] ?? 9))) best.set(b.work_id, b);
  }
  if (!best.size) return list;
  const out = [];
  for (const b of list) {
    if (!b.work_id) { out.push(b); continue; }
    if (best.get(b.work_id) !== b) continue;
    const fmts = [...new Set(editionsOf(all, b).map(x => x.format))];
    out.push(fmts.length > 1 ? { ...b, _fmts: fmts } : b);
  }
  if (list.loose) out.loose = true;
  return out;
}

async function sha(s) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('librava:' + s));
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  } catch { return 'plain:' + s; }
}

function fileExt(name) { return (String(name).split('.').pop() || '').toLowerCase(); }

// =====================================================================
//  DEMO
// =====================================================================
const promoRunning = p => p.active !== false && (!p.starts_at || new Date(p.starts_at) <= new Date()) && (!p.ends_at || new Date(p.ends_at) > new Date());
const promoSort = (a, b) => (a.sort || 0) - (b.sort || 0) || String(b.created_at).localeCompare(String(a.created_at));

class DemoAPI {
  constructor() { this.listeners = []; this._user = null; this._catalog = null; this.isDemo = true; }

  async init() {
    if (DEMO_ALLOWED && !DEMO_BOOKS.length) { try { DEMO_BOOKS = (await import('./demo-data.js?v=20261027203146')).DEMO_BOOKS; } catch { DEMO_BOOKS = []; } }
    // older versions created a built-in demo admin with a fixed password: remove it
    let users = store.get('demo:users', []);
    if (users.some(u => u.id === 'u_admin')) {
      users = users.filter(u => u.id !== 'u_admin');
      store.set('demo:users', users);
      if (store.get('demo:session') === 'u_admin') store.del('demo:session');
    }
    // demo only: if this browser has accounts but no administrator, the oldest account becomes administrator
    if (users.length && !users.some(u => u.isAdmin)) {
      users.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0].isAdmin = true;
      store.set('demo:users', users);
    }
    const sid = store.get('demo:session');
    this._user = this._pub(users.find(u => u.id === sid));
    await this._loadCatalog();
  }
  _pub(u) { return u ? { id: u.id, email: u.email, name: u.name, isAdmin: !!u.isAdmin, createdAt: u.createdAt } : null; }
  user() { return this._user; }
  onAuthChange(cb) { this.listeners.push(cb); }
  _emit() { this.listeners.forEach(cb => cb(this._user)); }

  async signUp({ email, password, name }) {
    email = email.trim().toLowerCase();
    if (password.length < 6) throw new Error('acc.err.short');
    const users = store.get('demo:users', []);
    if (users.some(u => u.email === email)) throw new Error('acc.err.exists');
    // demo only: the first account created in this browser becomes the administrator (no fixed password anywhere)
    const isAdmin = !users.some(x => x.isAdmin);
    const u = { id: uid('u_'), email, pass: await sha(password), name: name || email.split('@')[0], isAdmin, createdAt: new Date().toISOString() };
    users.push(u); store.set('demo:users', users); store.set('demo:session', u.id);
    this._user = this._pub(u); this._emit(); return {};
  }
  async signIn({ email, password }) {
    email = email.trim().toLowerCase();
    const users = store.get('demo:users', []);
    const h = await sha(password);
    const u = users.find(x => x.email === email && x.pass === h);
    if (!u) throw new Error('acc.err.invalid');
    store.set('demo:session', u.id); this._user = this._pub(u); this._emit();
  }
  async signInGoogle() { throw new Error('Google login funcționează doar cu Supabase configurat.'); }
  hasPassword() { return true; }
  async changePassword(current, next) {
    if (next.length < 6) throw new Error('acc.err.short');
    const users = store.get('demo:users', []);
    const u = users.find(x => x.id === this._user?.id);
    if (!u) throw new Error('acc.err.invalid');
    if (u.pass !== await sha(current)) throw new Error('acc.err.currentWrong');
    u.pass = await sha(next); store.set('demo:users', users);
  }
  async signOut() { store.del('demo:session'); this._user = null; this._emit(); }
  async resetPassword() { return true; }
  async updateProfile({ name }) {
    const users = store.get('demo:users', []);
    const u = users.find(x => x.id === this._user.id); if (u) u.name = name;
    store.set('demo:users', users); this._user = this._pub(u); this._emit();
  }

  // ---- catalog ----
  async _loadCatalog() {
    const custom = store.get('demo:books', { added: [], overrides: {}, deleted: [] });
    const purchases = store.get('demo:purchases', []);
    const reviews = this._allReviews();
    const books = [];
    for (const b of [...DEMO_BOOKS.map(x => ({ ...x })), ...custom.added.map(x => ({ ...x }))]) {
      if (custom.deleted.includes(b.id)) continue;
      Object.assign(b, custom.overrides[b.id] || {});
      for (const key of ['cover_url', 'file_path', 'sample_path']) {
        if (typeof b[key] === 'string' && b[key].startsWith('idb:')) {
          const blob = await blobs.get(b[key].slice(4));
          b['_' + key] = b[key];
          b[key] = blob ? URL.createObjectURL(blob) : (key === 'cover_url' ? '' : null);
        }
      }
      if (Array.isArray(b.aplus)) {
        b.aplus = await Promise.all(b.aplus.map(async m => ({ ...m, imgs: await Promise.all((m.imgs || []).map(async im => {
          if (!String(im.ref || '').startsWith('idb:')) return { ...im, url: im.ref };
          const blob = await blobs.get(im.ref.slice(4)); return { ...im, url: blob ? URL.createObjectURL(blob) : '' };
        })) })));
      }
      const rs = reviews.filter(r => r.book_id === b.id);
      b.rating_count = rs.length;
      b.rating_avg = rs.length ? Math.round(rs.reduce((s, r) => s + r.rating, 0) / rs.length * 10) / 10 : 0;
      b.sales_count = (b.sales_seed || 0) + purchases.filter(p => p.book_id === b.id).length;
      books.push(b);
    }
    this._catalog = books;
  }
  async listBooks(o = {}) { if (!this._catalog) await this._loadCatalog(); return filterBooks(this._catalog, o); }
  async getBook(id) {
    if (!this._catalog) await this._loadCatalog();
    const b = this._catalog.find(x => x.id === id);
    if (!b) return null;
    if ((b.status !== 'published' || b.deleted_at) && !this._user?.isAdmin && !(await this.owns(id))) return null;
    return b;
  }

  // ---- purchases / library ----
  _purchases() { return store.get('demo:purchases', []).filter(p => this._user && p.user_id === this._user.id); }
  async library() {
    if (!this._user) return [];
    if (!this._catalog) await this._loadCatalog();
    const prog = store.get('demo:progress', {})[this._user.id] || {};
    return this._purchases().map(p => ({ purchase: p, book: this._catalog.find(b => b.id === p.book_id), progress: prog[p.book_id] || null }))
      .filter(x => x.book);
  }
  async owns(bookId) { return this._purchases().find(p => p.book_id === bookId) || null; }
  async orders() {
    if (!this._catalog) await this._loadCatalog();
    return this._purchases().map(p => ({ ...p, book: this._catalog.find(b => b.id === p.book_id) })).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  _addPurchases(bookIds) {
    const all = store.get('demo:purchases', []);
    const now = new Date().toISOString();
    for (const id of bookIds) {
      if (all.some(p => p.user_id === this._user.id && p.book_id === id)) continue;
      const b = this._catalog.find(x => x.id === id);
      all.push({ id: uid('p_'), user_id: this._user.id, book_id: id, price_cents: b ? b.price_cents : 0, currency: CONFIG.currency, created_at: now, customer_email: this._user.email });
    }
    store.set('demo:purchases', all);
    for (const id of bookIds) { const b = this._catalog.find(x => x.id === id); if (b) b.sales_count = (b.sales_count || 0) + 1; }
  }
  async claimFree(bookId) {
    const b = await this.getBook(bookId);
    if (!b || b.price_cents > 0) throw new Error('Not free');
    this._addPurchases([bookId]);
  }
  // returns {mode:'demo', paid:[...], free:[...]} — UI shows the demo payment sheet
  async checkout(bookIds, { coupon } = {}) {
    const books = (await Promise.all(bookIds.map(id => this.getBook(id)))).filter(Boolean);
    const free = books.filter(b => !b.price_cents).map(b => b.id);
    if (free.length) this._addPurchases(free);
    const paid = books.filter(b => b.price_cents > 0);
    const co = coupon ? await this.findCoupon(coupon) : null;
    const r = applyOffers(paid, [...await this.offers(), ...(co ? [co] : [])], { coupon });
    if (paid.length && !r.total) { this._addPurchases(paid.map(b => b.id)); return { mode: 'done' }; }
    return { mode: paid.length ? 'demo' : 'done', paid: paid.map(b => b.id), total: r.total, discount: r.discount };
  }
  async confirmDemoPayment(bookIds) { this._addPurchases(bookIds); }

  // ---- reading ----
  async getReadSource(book, { preview } = {}) {
    const owned = (await this.owns(book.id)) || this._user?.isAdmin;
    if (!owned && !preview) throw new Error('not-owned');
    if (!owned && book.sample_path) return { url: book.sample_path, kind: book.sample_kind || 'pdf', limited: true, sample: true };
    return { url: book.file_path, kind: book.format, limited: !owned };
  }
  async getProgress(bookId) {
    if (!this._user) return store.get('guestprog:' + bookId, null);
    return (store.get('demo:progress', {})[this._user.id] || {})[bookId] || null;
  }
  async saveProgress(bookId, data) {
    if (!this._user) { store.set('guestprog:' + bookId, data); return; }
    const all = store.get('demo:progress', {});
    all[this._user.id] = all[this._user.id] || {};
    all[this._user.id][bookId] = { ...(all[this._user.id][bookId] || {}), ...data, updated_at: new Date().toISOString() };
    store.set('demo:progress', all);
  }

  // ---- reviews ----
  _allReviews() {
    const seeded = DEMO_BOOKS.flatMap(b => (b.seed_reviews || []).map((r, i) => ({ id: `seed_${b.id}_${i}`, book_id: b.id, user_id: null, ...r, created_at: b.published_at, verified: true })));
    const hidden = store.get('demo:hiddenReviews', []);
    return [...seeded, ...store.get('demo:reviews', [])].filter(r => !hidden.includes(r.id));
  }
  async listReviews(bookId) { return this._allReviews().filter(r => r.book_id === bookId).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))); }
  async addReview(bookId, rating, body) {
    if (!await this.owns(bookId)) throw new Error('rev.onlyOwners');
    const all = store.get('demo:reviews', []).filter(r => !(r.book_id === bookId && r.user_id === this._user.id));
    all.push({ id: uid('r_'), book_id: bookId, user_id: this._user.id, rating, body, author_name: this._user.name, created_at: new Date().toISOString(), verified: true });
    store.set('demo:reviews', all);
    await this._loadCatalog();
  }
  async myReview(bookId) { return store.get('demo:reviews', []).find(r => r.book_id === bookId && r.user_id === this._user?.id) || null; }

  // ---- admin ----
  async adminBooks() {
    await this._loadCatalog();
    const P = store.get('demo:purchases', []);
    return filterBooks(this._catalog.filter(b => !b.deleted_at), { includeDrafts: true, sort: 'newest' })
      .map(b => ({ ...b, revenue_cents: P.filter(p => p.book_id === b.id).reduce((s, p) => s + (p.price_cents || 0), 0) }));
  }
  async editionsOf(workId) { await this._loadCatalog(); return this._catalog.filter(b => b.work_id === workId && !b.deleted_at).map(b => ({ ...b, file_path: b._file_path || b.file_path })); }
  async updateBook(id, patch) { await this.saveBook({ id, ...patch }); }
  async newEdition(src, format, extra = {}, files = {}) {
    const work = src.work_id || src.id;
    if (!src.work_id) await this.saveBook({ id: src.id, work_id: work });
    const row = { ...src, work_id: work, format, status: 'draft', ...extra };
    for (const k of ['id', 'sales_count', 'rating_avg', 'rating_count', 'created_at', 'updated_at', 'revenue_cents', '_fmts', 'file_path', 'file_name', 'sample_path', 'file_check', 'librava_id', 'isbn', 'deleted_at']) delete row[k];
    if (src._cover_url) row.cover_url = src._cover_url;
    const id = await this.saveBook(row, files);
    if (src._cover_url) { const c = store.get('demo:books'); const b = c.added.find(x => x.id === id); if (b) { b.cover_url = src._cover_url; store.set('demo:books', c); await this._loadCatalog(); } }
    return id;
  }
  async saveBook(data, files = {}) {
    const custom = store.get('demo:books', { added: [], overrides: {}, deleted: [] });
    const id = data.id || uid('bk_');
    const patch = { ...data, id };
    if (files.cover) { await blobs.put('cover:' + id, files.cover); patch.cover_url = 'idb:cover:' + id; }
    if (files.file) { await blobs.put('file:' + id, files.file); patch.file_path = 'idb:file:' + id; patch.format = fileExt(files.file.name) === 'epub' ? 'epub' : 'pdf'; patch.file_name = files.file.name; }
    if (files.sample) { await blobs.put('sample:' + id, files.sample); patch.sample_path = 'idb:sample:' + id; patch.sample_kind = fileExt(files.sample.name) === 'epub' ? 'epub' : 'pdf'; }
    // keep already stored idb references when no new file was chosen
    for (const key of ['cover_url', 'file_path', 'sample_path']) if (!files[{ cover_url: 'cover', file_path: 'file', sample_path: 'sample' }[key]]) delete patch[key];
    const idx = custom.added.findIndex(b => b.id === id);
    if (data.id && DEMO_BOOKS.some(b => b.id === id)) {
      custom.overrides[id] = { ...(custom.overrides[id] || {}), ...patch };
    } else if (idx >= 0) {
      custom.added[idx] = { ...custom.added[idx], ...patch };
    } else {
      custom.added.push({ rating_avg: 0, rating_count: 0, sales_seed: 0, keywords: [], ...patch, created_at: new Date().toISOString() });
    }
    store.set('demo:books', custom);
    await this._loadCatalog();
    return id;
  }
  async getSetting(key) { return store.get('demo:setting:' + key, null); }
  async saveSetting(key, value) { store.set('demo:setting:' + key, value); }
  // ---- offers & discounts (Admin → Offers) ----
  async offers() { return store.get('demo:offers', []).filter(o => o.kind !== 'coupon' && offerRunning(o)); }
  async findCoupon(code) { const c = String(code || '').trim().toUpperCase(); return store.get('demo:offers', []).find(o => o.kind === 'coupon' && offerRunning(o) && String(o.config?.code || '').toUpperCase() === c) || null; }
  async adminOffers() { return store.get('demo:offers', []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))); }
  async saveOffer(o) { const all = store.get('demo:offers', []); const id = o.id || uid('of_'); const i = all.findIndex(x => x.id === id); const row = { ...(i >= 0 ? all[i] : { created_at: new Date().toISOString(), uses: 0 }), ...o, id, updated_at: new Date().toISOString() }; if (i >= 0) all[i] = row; else all.push(row); store.set('demo:offers', all); return id; }
  async deleteOffer(id) { store.set('demo:offers', store.get('demo:offers', []).filter(o => o.id !== id)); }
  async boughtTogether() { return []; }
  track() { }
  heartbeat() { }
  async analytics(days) {
    const day = i => new Date(Date.now() - (days - 1 - i) * 864e5).toISOString().slice(0, 10);
    return { visitors: 0, sessions: 0, pageviews: 0, orders: 0, revenue: 0, discounts: 0, daily: Array.from({ length: Math.min(days, 90) }, (_, i) => ({ day: day(i), visitors: 0, orders: 0, revenue: 0 })),
      funnel: { sessions: 0, book_view: 0, add_cart: 0, checkout: 0, paid: 0 }, sources: [], countries: [], langs: [], devices: [], campaigns: [], searches: [], books: [], pages: [], hours: [] };
  }
  // ---- promotions (home page banners chosen by the shop owner, per language) ----
  async promos(lang) { return store.get('demo:promos', []).filter(p => promoRunning(p) && (!p.lang || p.lang === lang)).sort(promoSort); }
  async adminPromos() { return store.get('demo:promos', []).sort(promoSort); }
  async savePromo(p, files = {}) {
    const all = store.get('demo:promos', []);
    const id = p.id || uid('pr_');
    const row = { ...(all.find(x => x.id === id) || { created_at: new Date().toISOString(), views: 0, clicks: 0 }), ...p, id, updated_at: new Date().toISOString() };
    if (files.image) row.image_url = await fileToDataURL(files.image);
    if (files.mobile) row.image_mobile_url = await fileToDataURL(files.mobile);
    if (files.removeMobile) row.image_mobile_url = null;
    const i = all.findIndex(x => x.id === id); if (i >= 0) all[i] = row; else all.push(row);
    store.set('demo:promos', all); return id;
  }
  async deletePromo(p) { store.set('demo:promos', store.get('demo:promos', []).filter(x => x.id !== p.id)); }
  async promoHit(id, kind) { const all = store.get('demo:promos', []); const x = all.find(y => y.id === id); if (x) { x[kind === 'click' ? 'clicks' : 'views'] = (x[kind === 'click' ? 'clicks' : 'views'] || 0) + 1; store.set('demo:promos', all); } }
  async myGifts() { if (!this._user) return []; return store.get('demo:purchases', []).filter(p => p.user_id === this._user.id && p.gift).map(p => ({ id: p.id, book_id: p.book_id, created_at: p.created_at })); }
  async notifications() { return store.get('demo:notifications', []).filter(n => n.published !== false); }
  async adminNotifications() { return store.get('demo:notifications', []); }
  async saveNotifications(rows) { const all = store.get('demo:notifications', []); for (const n of rows) all.unshift({ published: true, ...n, id: uid('n_'), created_at: new Date().toISOString() }); store.set('demo:notifications', all); }
  async deleteNotificationBatch(batch) { store.set('demo:notifications', store.get('demo:notifications', []).filter(n => n.batch !== batch)); }
  async saveNotification(n) { const all = store.get('demo:notifications', []); if (n.id) { const i = all.findIndex(x => x.id === n.id); all[i] = { ...all[i], ...n }; } else all.unshift({ published: true, ...n, id: uid('n_'), created_at: new Date().toISOString() }); store.set('demo:notifications', all); }
  async deleteNotification(id) { store.set('demo:notifications', store.get('demo:notifications', []).filter(n => n.id !== id)); }
  async getMarketing() { return !!store.get('demo:marketing:' + this._user?.id, false); }
  async setMarketing(on) { store.set('demo:marketing:' + this._user?.id, !!on); }
  async uploadAplusImage(bookId, file) {
    const key = 'aplus:' + (bookId || 'new') + ':' + uid('');
    await blobs.put(key, file);
    return { ref: 'idb:' + key, url: URL.createObjectURL(file) };
  }
  // soft delete: hidden from the store, buyers keep it in their library (same as the Supabase version)
  async deleteBook(id) {
    const custom = store.get('demo:books', { added: [], overrides: {}, deleted: [] });
    const patch = { status: 'draft', deleted_at: new Date().toISOString() };
    const idx = custom.added.findIndex(b => b.id === id);
    if (idx >= 0) Object.assign(custom.added[idx], patch);
    else custom.overrides[id] = { ...(custom.overrides[id] || {}), ...patch };
    store.set('demo:books', custom);
    await this._loadCatalog();
  }
  async salesStats() {
    if (!this._catalog) await this._loadCatalog();
    const all = store.get('demo:purchases', []);
    return all.map(p => ({ ...p, book: this._catalog.find(b => b.id === p.book_id) }));
  }

  // ---- full admin panel (demo: computed from what is saved in this browser) ----
  _users() { return store.get('demo:users', []); }
  async adminOverview() {
    if (!this._catalog) await this._loadCatalog();
    const P = store.get('demo:purchases', []), users = this._users();
    const day = d => new Date(d).toISOString().slice(0, 10);
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const since = n => P.filter(p => new Date(p.created_at) >= new Date(today - (n - 1) * 864e5));
    const sum = list => list.reduce((s, p) => s + (p.price_cents || 0), 0);
    const daily = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today - i * 864e5).toISOString().slice(0, 10);
      const l = P.filter(p => day(p.created_at) === d);
      daily.push({ date: d, revenue_cents: sum(l), count: l.length });
    }
    const by = {};
    for (const p of P) { by[p.book_id] = by[p.book_id] || { n: 0, sum: 0 }; by[p.book_id].n++; by[p.book_id].sum += p.price_cents || 0; }
    const top = Object.entries(by).map(([id, v]) => ({ book: this._catalog.find(b => b.id === id), ...v })).filter(x => x.book).sort((a, b) => b.sum - a.sum || b.n - a.n).slice(0, 5);
    const books = this._catalog.filter(b => !b.deleted_at);
    return {
      revenue: { today: sum(since(1)), d7: sum(since(7)), d30: sum(since(30)), all: sum(P) },
      counts: { sold: P.filter(p => p.price_cents > 0).length, free: P.filter(p => !p.price_cents).length, pending: 0, customers: users.length,
        new_customers_30: users.filter(u => new Date(u.createdAt) >= new Date(today - 29 * 864e5)).length, books: books.length, published: books.filter(b => b.status === 'published').length },
      currency: CONFIG.currency, daily, top,
      recent: P.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 8)
        .map(p => ({ ...p, email: p.customer_email, title: this._catalog.find(b => b.id === p.book_id)?.title || '', book_id: p.book_id })),
    };
  }
  async adminOrders(status = 'pending') {
    if (status === 'pending' || status === 'cancelled') return [];
    if (!this._catalog) await this._loadCatalog();
    return store.get('demo:purchases', []).filter(p => p.price_cents > 0).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map(p => ({ id: p.id, reference: 'DEMO-' + String(p.id).slice(-6).toUpperCase(), amount_cents: p.price_cents, currency: p.currency || CONFIG.currency, method: 'demo', status: 'paid',
        created_at: p.created_at, email: p.customer_email, items: [{ book_id: p.book_id, title: this._catalog.find(b => b.id === p.book_id)?.title || '', price_cents: p.price_cents }] }));
  }
  async adminVisits() { return []; }
  async adminVisitEvents() { return []; }
  async adminCustomers(q = '', range) {
    const P = store.get('demo:purchases', []), n = norm(q);
    return this._users().filter(u => !n || norm(u.email + ' ' + u.name).includes(n)).map(u => {
      const mine = P.filter(p => p.user_id === u.id);
      return { id: u.id, email: u.email, name: u.name, created_at: u.createdAt, books: mine.length, spent_cents: mine.reduce((s, p) => s + (p.price_cents || 0), 0),
        last_at: mine.map(p => p.created_at).sort().pop() || null, isAdmin: !!u.isAdmin, seen_at: null, visits: 0, sec: 0, searches: 0, opened: 0, carts: 0 };
    }).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }
  async adminCustomer(id, range) {
    if (!this._catalog) await this._loadCatalog();
    const u = this._users().find(x => x.id === id);
    if (!u) throw new Error('Not found.');
    const purchases = store.get('demo:purchases', []).filter(p => p.user_id === id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map(p => { const book = this._catalog.find(b => b.id === p.book_id); return book && { created_at: p.created_at, price_cents: p.price_cents, currency: p.currency, gift: !!p.gift, book }; }).filter(Boolean);
    return { customer: { id: u.id, email: u.email, name: u.name, created_at: u.createdAt, isAdmin: !!u.isAdmin }, events: [], purchases, orders: [] };
  }
  async grantBook(userId, bookId) {
    const all = store.get('demo:purchases', []); const u = this._users().find(x => x.id === userId);
    if (!all.some(p => p.user_id === userId && p.book_id === bookId)) all.push({ id: uid('p_'), user_id: userId, book_id: bookId, price_cents: 0, currency: CONFIG.currency, created_at: new Date().toISOString(), customer_email: u?.email, gift: true });
    store.set('demo:purchases', all); await this._loadCatalog();
  }
  async revokeBook(userId, bookId) { store.set('demo:purchases', store.get('demo:purchases', []).filter(p => !(p.user_id === userId && p.book_id === bookId))); await this._loadCatalog(); }
  async adminReviews() {
    if (!this._catalog) await this._loadCatalog();
    const users = this._users();
    return this._allReviews().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map(r => ({ ...r, book_title: this._catalog.find(b => b.id === r.book_id)?.title || '', email: users.find(u => u.id === r.user_id)?.email || '' }));
  }
  async importReviews(bookId, list, source) {
    const all = store.get('demo:reviews', []), have = new Set(all.filter(r => r.book_id === bookId).map(r => r.ext_key).filter(Boolean)), batch = uid('b_');
    const rows = list.filter(r => !have.has(r.ext_key) && have.add(r.ext_key)).map(r => ({ id: uid('r_'), book_id: bookId, user_id: null, imported: true, source, batch, ...r, verified: !!r.verified, created_at: r.created_at || new Date().toISOString() }));
    const ver = new Set(list.filter(r => r.verified).map(r => r.ext_key)); let updated = 0;
    all.forEach(r => { if (r.book_id === bookId && r.imported && !r.verified && ver.has(r.ext_key)) { r.verified = true; updated++; } });
    store.set('demo:reviews', all.concat(rows)); await this._loadCatalog();
    return { added: rows.length, dupes: list.length - rows.length - updated, updated, batch };
  }
  async deleteReviewBatch(batch) { store.set('demo:reviews', store.get('demo:reviews', []).filter(r => r.batch !== batch)); await this._loadCatalog(); }
  async deleteReview(id) {
    store.set('demo:reviews', store.get('demo:reviews', []).filter(r => r.id !== id));
    const hidden = store.get('demo:hiddenReviews', []); if (!hidden.includes(id)) hidden.push(id); store.set('demo:hiddenReviews', hidden);
    await this._loadCatalog();
  }
  async setBookStatus(id, status) { await this.saveBook({ id, status }); }
  async exportSales() {
    if (!this._catalog) await this._loadCatalog();
    const rows = [['date', 'customer_email', 'book', 'author', 'amount', 'currency']];
    for (const p of store.get('demo:purchases', [])) { const b = this._catalog.find(x => x.id === p.book_id) || {}; rows.push([p.created_at, p.customer_email || '', b.title || '', b.author || '', ((p.price_cents || 0) / 100).toFixed(2).replace('.', ','), p.currency || CONFIG.currency]); }
    const csv = '\ufeff' + rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    return { blob: new Blob([csv], { type: 'text/csv;charset=utf-8' }) };
  }
}

// =====================================================================
//  SUPABASE
// =====================================================================
class SupabaseAPI {
  constructor() { this.listeners = []; this._user = null; this._catalog = null; this._lib = null; this.isDemo = false; }
  // clearing the store list (after any change in Admin) also forgets the full book pages kept in memory
  get _catalog() { return this.__cat; }
  set _catalog(v) { this.__cat = v; if (v == null) { this._full = null; this._catP = null; this._gen = (this._gen || 0) + 1; } }

  async init() {
    await loadScript(new URL('../vendor/supabase.min.js', import.meta.url).href);
    this.sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true } });
    // links from Librava's emails (confirm account, reset password, change email) come back as
    // ?token_hash=...&type=...  — verified here, so they work on any device, not only the one that signed up
    const qp = new URLSearchParams(location.search);
    const th = qp.get('token_hash'), ty = qp.get('type');
    if (th && ty) {
      const { error } = await this.sb.auth.verifyOtp({ token_hash: th, type: ty });
      const target = error ? '#/account?mode=linkexpired' : ty === 'recovery' ? '#/account?mode=newpass' : '#/library?welcome=1';
      history.replaceState(null, '', location.pathname + target);
    }
    const { data } = await this.sb.auth.getSession();
    await this._setSession(data.session);
    this.sb.auth.onAuthStateChange(async (event, session) => {
      // the visitor opened the "reset password" link from the email
      if (event === 'PASSWORD_RECOVERY') setTimeout(() => { location.hash = '#/account?mode=newpass'; }, 0);
      const before = this._user?.id;
      await this._setSession(session);
      if (before !== this._user?.id) { this._lib = null; this.listeners.forEach(cb => cb(this._user)); }
    });
  }
  async _setSession(session) {
    if (!session) { this._user = null; return; }
    const u = session.user;
    let profile = null;
    try { const r = await this.sb.from('profiles').select('full_name,is_admin,created_at').eq('id', u.id).maybeSingle(); profile = r.data; } catch { }
    this._providers = (u.app_metadata && u.app_metadata.providers) || [u.app_metadata?.provider].filter(Boolean);
    this._user = { id: u.id, email: u.email, name: profile?.full_name || u.user_metadata?.full_name || u.email.split('@')[0], isAdmin: !!profile?.is_admin, createdAt: profile?.created_at || u.created_at };
  }
  user() { return this._user; }
  onAuthChange(cb) { this.listeners.push(cb); }
  _err(error) { if (error) throw new Error(error.message || String(error)); }

  async signUp({ email, password, name, marketing }) {
    if (password.length < 6) throw new Error('acc.err.short');
    const { data, error } = await this.sb.auth.signUp({ email, password, options: { data: { full_name: name, lang: getLang(), accepted_terms: 'true', marketing: !!marketing }, emailRedirectTo: location.origin + '/' } });
    if (error && /registered|exists/i.test(error.message)) throw new Error('acc.err.exists');
    this._err(error);
    return { needsConfirm: !data.session };
  }
  async signIn({ email, password }) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error && /invalid/i.test(error.message)) throw new Error('acc.err.invalid');
    this._err(error);
  }
  async signInGoogle() {
    const { error } = await this.sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname + '#/library' } });
    this._err(error);
  }
  // accounts created with Google have no password until they set one
  hasPassword() { return (this._providers || []).includes('email'); }
  async changePassword(current, next) {
    if (next.length < 6) throw new Error('acc.err.short');
    if (current != null && this.hasPassword()) {
      const { error } = await this.sb.auth.signInWithPassword({ email: this._user.email, password: current });
      if (error) throw new Error('acc.err.currentWrong');
    }
    const { error } = await this.sb.auth.updateUser({ password: next });
    this._err(error);
    if (!this._providers.includes('email')) this._providers.push('email');
  }
  async signOut() { await this.sb.auth.signOut(); this._user = null; this._lib = null; this.listeners.forEach(cb => cb(null)); }
  async resetPassword(email) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/' });
    this._err(error);
  }
  async changeEmail(email) {
    const { error } = await this.sb.auth.updateUser({ email }, { emailRedirectTo: location.origin + '/' });
    if (error && /registered|exists/i.test(error.message)) throw new Error('acc.err.exists');
    this._err(error);
  }
  async updateProfile({ name }) {
    const { error } = await this.sb.from('profiles').update({ full_name: name }).eq('id', this._user.id);
    this._err(error); this._user.name = name; this.listeners.forEach(cb => cb(this._user));
  }

  // ---- catalog (small catalogs are loaded once and filtered in the browser) ----
  _coverUrl(b) {
    if (!b.cover_path) return '';
    return this.sb.storage.from('covers').getPublicUrl(b.cover_path).data.publicUrl + (b.updated_at ? '?v=' + encodeURIComponent(b.updated_at) : '');
  }
  // The store list is light (what cards, filters and search need — about 1 KB a book): read in pages of 1000 at once,
  // in parallel, so 5000+ books still arrive in about a second. The full book (description, A+, files) is read only
  // on its page. The list is also kept on this device, so the store opens instantly next time while a fresh copy
  // is fetched in the background.
  async _readBooks(cols, build = q => q) {
    const base = () => build(this.sb.from('books').select(cols).is('deleted_at', null)).order('published_at', { ascending: false, nullsFirst: false }).order('id');
    const first = await build(this.sb.from('books').select(cols, { count: 'exact' }).is('deleted_at', null)).order('published_at', { ascending: false, nullsFirst: false }).order('id').range(0, 999);
    this._err(first.error);
    const out = first.data.slice(), total = first.count ?? out.length;
    const pages = []; for (let f = 1000; f < total; f += 1000) pages.push(base().range(f, f + 999));
    for (const r of await Promise.all(pages)) { this._err(r.error); out.push(...r.data); }
    const seen = new Set();
    return out.filter(b => !seen.has(b.id) && seen.add(b.id)).map(b => ({ ...b, cover_url: this._coverUrl(b) }));
  }
  async _loadCatalog(includeDrafts = false) {
    if (includeDrafts) return this._readBooks(CARD_COLS + ',' + ADMIN_COLS);
    if (this._catP) return this._catP;
    // first visit of this session: start from the copy saved on the device (max 1 day old), refresh behind the scenes
    if (!this._cacheTried) {
      this._cacheTried = true;
      try {
        const c = await blobs.get(CAT_KEY);
        if (c && c.v === CAT_V && Date.now() - c.at < 864e5 && Array.isArray(c.list) && c.list.length) {
          this._catalog = c.list.map(b => ({ ...b, cover_url: this._coverUrl(b) }));
          this._catP = Promise.resolve(this._catalog);
          setTimeout(() => this._fetchCatalog().catch(() => { }), 1500);
          return this._catalog;
        }
      } catch { }
    }
    return this._fetchCatalog();
  }
  _fetchCatalog() {
    const gen = this._gen || 0;
    const p = this._readBooks(CARD_COLS, q => q.eq('status', 'published')).then(list => {
      if ((this._gen || 0) !== gen) return list;            // something changed in Admin meanwhile: a newer read follows
      this.__cat = list; this._catP = Promise.resolve(list);
      try { blobs.put(CAT_KEY, { v: CAT_V, at: Date.now(), list: list.map(({ cover_url, ...b }) => b) }); } catch { }
      return list;
    });
    if (!this.__cat) this._catP = p;                         // nothing to show yet: every page waits for this read
    p.catch(() => { if (this._catP === p) this._catP = null; });
    return p;
  }
  async listBooks(o = {}) { const l = this._catalog || await this._loadCatalog(); return filterBooks(this._catalog || l, o); }
  // the whole book (description, A+ content, files…): kept for a few minutes, read once even if asked twice at the same time
  getBook(id) {
    if (!id) return Promise.resolve(null);
    this._full = this._full || new Map();
    const hit = this._full.get(id);
    if (hit && Date.now() - hit.at < 300000) return hit.p;
    let failed = false;
    const p = this.sb.from('books').select('*').eq('id', id).maybeSingle()
      .then(({ data, error }) => { if (error) throw error; return data ? { ...data, cover_url: this._coverUrl(data) } : null; })
      .catch(() => { failed = true; return this.__cat?.find(x => x.id === id) || null; });   // no connection: the light copy (it has the preview too)
    this._full.set(id, { at: Date.now(), p });
    // a failed read (weak mobile signal) is not kept: the next visit asks again
    p.then(v => { if (!v || failed) this._full?.delete(id); });
    return p;
  }

  // ---- library ----
  async _loadLib() {
    if (!this._user) return [];
    const { data, error } = await this.sb.from('purchases').select('*, book:books(*), order:orders(reference)').eq('user_id', this._user.id).order('created_at', { ascending: false });
    this._err(error);
    this._lib = data.filter(p => p.book).map(p => ({ ...p, book: { ...p.book, cover_url: this._coverUrl(p.book) } }));
    return this._lib;
  }
  async library() {
    if (!this._user) return [];
    const purchases = await this._loadLib();
    const { data: prog } = await this.sb.from('reading_progress').select('*').eq('user_id', this._user.id);
    const pm = Object.fromEntries((prog || []).map(p => [p.book_id, p]));
    return purchases.map(p => ({ purchase: p, book: p.book, progress: pm[p.book_id] || null }));
  }
  async owns(bookId) {
    if (!this._user) return null;
    if (!this._lib) await this._loadLib();
    return this._lib.find(p => p.book_id === bookId) || null;
  }
  async orders() { const l = await this._loadLib(); return l; }
  async claimFree(bookId) {
    const { error } = await this.sb.rpc('claim_free_book', { p_book_id: bookId }); this._err(error); this._lib = null;
  }
  async checkout(bookIds, { coupon } = {}) {
    const books = (await Promise.all(bookIds.map(id => this.getBook(id)))).filter(Boolean);
    const free = books.filter(b => !b.price_cents);
    for (const b of free) await this.claimFree(b.id);
    const paid = books.filter(b => b.price_cents > 0).map(b => b.id);
    if (!paid.length) return { mode: 'done' };
    const { data, error } = await this.sb.functions.invoke('create-checkout', { body: { book_ids: paid, waiver: true, coupon: coupon || null, return_url: location.origin + location.pathname } });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); msg = j.error || msg; } catch { }
      throw new Error(msg);
    }
    if (data.mode === 'done') { this._lib = null; return { mode: 'done' }; }
    return { mode: 'redirect', url: data.url };
  }

  // ---- reading ----
  async getReadSource(book, { preview } = {}) {
    // "Read a sample" always opens the small sample file (what every customer sees), also for the admin:
    // the whole book can be tens of MB and a phone on mobile data would wait a long time for it
    if (preview && book.sample_path) {
      return { url: this.sb.storage.from('samples').getPublicUrl(book.sample_path).data.publicUrl + (book.updated_at ? '?v=' + encodeURIComponent(book.updated_at) : ''), kind: book.sample_path.endsWith('.epub') ? 'epub' : 'pdf', limited: true, sample: true };
    }
    const owned = await this.owns(book.id);
    if (owned || this._user?.isAdmin) {
      const { data, error } = await this.sb.storage.from('books').createSignedUrl(book.file_path, 60 * 60 * 3);
      this._err(error);
      return { url: data.signedUrl, kind: book.format, limited: false };
    }
    throw new Error('not-owned');
  }
  async getProgress(bookId) {
    if (!this._user) return store.get('guestprog:' + bookId, null);
    const { data } = await this.sb.from('reading_progress').select('*').eq('user_id', this._user.id).eq('book_id', bookId).maybeSingle();
    return data;
  }
  async saveProgress(bookId, d) {
    if (!this._user) { store.set('guestprog:' + bookId, d); return; }
    const row = { user_id: this._user.id, book_id: bookId, updated_at: new Date().toISOString() };
    for (const k of ['location', 'percent', 'page', 'bookmarks']) if (k in d) row[k] = d[k];
    await this.sb.from('reading_progress').upsert(row, { onConflict: 'user_id,book_id' });
  }

  // ---- reviews ----
  async listReviews(bookId) {
    const { data, error } = await this.sb.from('reviews').select('*').eq('book_id', bookId).order('created_at', { ascending: false });
    this._err(error); return data.map(r => ({ ...r, verified: r.imported ? !!r.verified : true }));
  }
  async addReview(bookId, rating, body) {
    const { error } = await this.sb.from('reviews').upsert({ book_id: bookId, user_id: this._user.id, rating, body, author_name: this._user.name }, { onConflict: 'user_id,book_id' });
    this._err(error); this._catalog = null;
  }
  async myReview(bookId) {
    if (!this._user) return null;
    const { data } = await this.sb.from('reviews').select('*').eq('book_id', bookId).eq('user_id', this._user.id).maybeSingle();
    return data;
  }

  // ---- admin ----
  async _upload(bucket, path, file) {
    const { error } = await this.sb.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type || undefined, cacheControl: '3600' });
    this._err(error);
  }
  // ---- offers & discounts (Admin → Offers) ----
  async offers() { try { const { data } = await this.sb.from('offers').select('*'); return (data || []).filter(o => o.kind !== 'coupon' && offerRunning(o)); } catch { return []; } }
  async findCoupon(code) { if (!String(code || '').trim()) return null; const { data } = await this.sb.rpc('find_coupon', { c: String(code).trim() }); return (data || [])[0] || null; }
  async adminOffers() { const { data, error } = await this.sb.from('offers').select('*').order('created_at', { ascending: false }); this._err(error); return data || []; }
  async saveOffer(o) { const row = { ...o, updated_at: new Date().toISOString() }; delete row.uses; delete row.created_at; const { data, error } = await this.sb.from('offers').upsert(row).select('id').single(); this._err(error); return data.id; }
  async deleteOffer(id) { const { error } = await this.sb.from('offers').delete().eq('id', id); this._err(error); }
  async boughtTogether(id) { try { const { data } = await this.sb.rpc('bought_together', { b: id, n: 6 }); return (data || []).map(r => r.book_id); } catch { return []; } }
  // ---- promotions (home page banners chosen by the shop owner, per language) ----
  _promoUrl(path, v) { return path ? this.sb.storage.from('covers').getPublicUrl(path).data.publicUrl : null; }
  _promoRow(p) { return { ...p, image_url: this._promoUrl(p.image_path), image_mobile_url: this._promoUrl(p.image_mobile_path) }; }
  async promos(lang) {
    try {
      const { data } = await this.sb.from('promos').select('*').eq('active', true).order('sort');
      return (data || []).filter(p => promoRunning(p) && (!p.lang || p.lang === lang)).sort(promoSort).map(p => this._promoRow(p));
    } catch { return []; }
  }
  async adminPromos() { const { data, error } = await this.sb.from('promos').select('*'); this._err(error); return (data || []).sort(promoSort).map(p => this._promoRow(p)); }
  async savePromo(p, files = {}) {
    const id = p.id || crypto.randomUUID();
    const row = { ...p, id, updated_at: new Date().toISOString() };
    for (const k of ['image_url', 'image_mobile_url', 'views', 'clicks', 'created_at']) delete row[k];
    const { data: old } = await this.sb.from('promos').select('image_path,image_mobile_path').eq('id', id).maybeSingle();
    const ts = Date.now();
    if (files.image) { const path = `promos/${id}/wide-${ts}.${fileExt(files.image.name) || 'webp'}`; await this._upload('covers', path, files.image); row.image_path = path; }
    if (files.mobile) { const path = `promos/${id}/mobile-${ts}.${fileExt(files.mobile.name) || 'webp'}`; await this._upload('covers', path, files.mobile); row.image_mobile_path = path; }
    if (files.removeMobile) row.image_mobile_path = null;
    if (row.kind === 'book' || row.kind === 'books') { row.image_path = null; row.image_mobile_path = null; }
    const { error } = await this.sb.from('promos').upsert(row); this._err(error);
    // old pictures of this banner are removed so they do not take space
    const gone = [old?.image_path, old?.image_mobile_path].filter(x => x && x !== row.image_path && x !== row.image_mobile_path);
    if (gone.length) await this.sb.storage.from('covers').remove(gone).catch(() => { });
    return id;
  }
  async deletePromo(p) {
    const { error } = await this.sb.from('promos').delete().eq('id', p.id); this._err(error);
    const files = [p.image_path, p.image_mobile_path].filter(Boolean);
    if (files.length) await this.sb.storage.from('covers').remove(files).catch(() => { });
  }
  async promoHit(id, kind) { try { await this.sb.rpc('promo_hit', { p: id, k: kind }); } catch { } }
  track(e) { this.sb.rpc('track', { e }).then(() => { }, () => { }); }
  heartbeat(p) { if (this._user) this.sb.rpc('heartbeat', p).then(() => { }, () => { }); }
  async analytics(days) { const { data, error } = await this.sb.rpc('analytics_summary', { days }); this._err(error); return data; }
  // ---- shop settings (company details for the legal pages) and announcements ----
  async getSetting(key) { try { const { data } = await this.sb.from('site_settings').select('value').eq('key', key).maybeSingle(); return data?.value || null; } catch { return null; } }
  async saveSetting(key, value) { const { error } = await this.sb.from('site_settings').upsert({ key, value, updated_at: new Date().toISOString() }); this._err(error); }
  async myGifts() { if (!this._user) return []; const { data } = await this.sb.from('purchases').select('id,book_id,created_at').eq('user_id', this._user.id).eq('gift', true).order('created_at', { ascending: false }).limit(20); return data || []; }
  async notifications() { const { data } = await this.sb.from('notifications').select('*').eq('published', true).order('created_at', { ascending: false }).limit(30); return data || []; }
  async adminNotifications() { const { data, error } = await this.sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(200); this._err(error); return data; }
  async saveNotifications(rows) { const { error } = await this.sb.from('notifications').insert(rows); this._err(error); }
  async deleteNotificationBatch(batch) { const { error } = await this.sb.from('notifications').delete().eq('batch', batch); this._err(error); }
  async saveNotification(n) { const { error } = n.id ? await this.sb.from('notifications').update(n).eq('id', n.id) : await this.sb.from('notifications').insert(n); this._err(error); }
  async deleteNotification(id) { const { error } = await this.sb.from('notifications').delete().eq('id', id); this._err(error); }
  async getMarketing() { if (!this._user) return false; const { data } = await this.sb.from('profiles').select('marketing_opt_in').eq('id', this._user.id).maybeSingle(); return !!data?.marketing_opt_in; }
  async setMarketing(on) { const { error } = await this.sb.from('profiles').update({ marketing_opt_in: !!on }).eq('id', this._user.id); this._err(error); }
  // used by "optimise existing images": swap a book's cover / A+ images for the light versions
  async replaceCover(book, file) {
    const p = `${book.id}/cover-${Date.now()}.${fileExt(file.name) || 'webp'}`;
    await this._upload('covers', p, file);
    const { error } = await this.sb.from('books').update({ cover_path: p, updated_at: new Date().toISOString() }).eq('id', book.id);
    this._err(error);
    if (book.cover_path && book.cover_path !== p) await this.sb.storage.from('covers').remove([book.cover_path]).catch(() => { });
    this._catalog = null; this.refreshShare(); this._cleanFiles(book.id);
  }
  async updateAplus(bookId, aplus) {
    const { error } = await this.sb.from('books').update({ aplus, updated_at: new Date().toISOString() }).eq('id', bookId);
    this._err(error); this._catalog = null; this._cleanFiles(bookId);
  }
  async uploadAplusImage(bookId, file) {
    const ext = fileExt(file.name) || 'jpg';
    const p = `${bookId || 'new'}/aplus/${crypto.randomUUID()}.${ext}`;
    await this._upload('covers', p, file);
    const url = this.sb.storage.from('covers').getPublicUrl(p).data.publicUrl;
    return { ref: url, url };
  }
  async saveBook(data, files = {}) {
    const id = data.id || crypto.randomUUID();
    const row = { ...data, id, updated_at: new Date().toISOString() };
    delete row.cover_url; delete row.sales_count; delete row.rating_avg; delete row.rating_count; delete row.blurb;
    // new names every time, so phones and WhatsApp never keep showing the old picture; the old file is deleted below
    if (files.cover) { const p = `${id}/cover-${Date.now()}.${fileExt(files.cover.name) || 'jpg'}`; await this._upload('covers', p, files.cover); row.cover_path = p; }
    if (files.file) {
      const ext = fileExt(files.file.name);
      const p = `${id}/book.${ext}`; await this._upload('books', p, files.file);
      row.file_path = p; row.format = ext === 'epub' ? 'epub' : 'pdf'; row.file_name = files.file.name;
      // a book made light for screens: its full-size original is kept apart, private (only the admin can get it)
      if (files.file._original) {
        try { const o = `${id}/original.${ext}`; await this._upload('originals', o, files.file._original); row.original_path = o; }
        catch (e) { console.warn('original not kept', e); }
      } else row.original_path = null;
    }
    if (files.sample) { const p = `${id}/sample.${fileExt(files.sample.name)}`; await this._upload('samples', p, files.sample); row.sample_path = p; }
    const { error } = await this.sb.from('books').upsert(row); this._err(error);
    this._catalog = null; this.refreshShare(); this._cleanFiles(id);
    return id;
  }
  // the formats of one book (EPUB, PDF), drafts included — for Admin
  async editionsOf(workId) {
    const { data, error } = await this.sb.from('books').select('id,format,price_cents,list_price_cents,status,file_path,sample_path').eq('work_id', workId).is('deleted_at', null);
    this._err(error); return data || [];
  }
  async updateBook(id, patch) {
    const row = { ...patch, updated_at: new Date().toISOString() };
    const { error } = await this.sb.from('books').update(row).eq('id', id); this._err(error);
    this._catalog = null; this.refreshShare();
  }
  // Admin "Prices": many books at once, in one step (admin only, checked in the database); items: [{ id, price, list }] in cents
  async setPrices(items) {
    const { data, error } = await this.sb.rpc('admin_set_prices', { p_items: items }); this._err(error);
    this._catalog = null; this.refreshShare();
    return data || 0;
  }
  // another format of the same book (Amazon: "create paperback" from the eBook): copies title, description, cover,
  // categories and A+ content into a new draft; the admin then uploads that format's file and sets its own price
  async newEdition(src, format, extra = {}, files = {}) {
    const work = src.work_id || src.id;
    if (!src.work_id) { const { error } = await this.sb.from('books').update({ work_id: work }).eq('id', src.id); this._err(error); }
    const row = { ...src, work_id: work, format, status: 'draft' };
    for (const k of ['id', 'cover_url', 'sales_count', 'rating_avg', 'rating_count', 'created_at', 'updated_at', 'revenue_cents', '_fmts',
      'file_path', 'file_name', 'sample_path', 'file_check', 'librava_id', 'isbn', 'pages', 'deleted_at', 'original_path', 'blurb']) delete row[k];
    Object.assign(row, extra);
    return this.saveBook(row, files);
  }
  // removes files of this book that are no longer used (old covers, replaced A+ pictures, an old PDF after an EPUB…);
  // files shared with its other editions (same cover, same A+ pictures) are kept
  async _cleanFiles(id) {
    try {
      const { data: b } = await this.sb.from('books').select('cover_path,file_path,sample_path,aplus,work_id').eq('id', id).maybeSingle();
      if (!b) return;
      let rows = [b];
      if (b.work_id) { const { data: sib, error } = await this.sb.from('books').select('cover_path,file_path,sample_path,aplus').eq('work_id', b.work_id); if (error) return; rows = rows.concat(sib || []); }
      const used = new Set(rows.flatMap(r => [r.cover_path, r.file_path, r.sample_path]).filter(Boolean));
      const aplus = JSON.stringify(rows.map(r => r.aplus || []));
      const sweep = async (bucket, folder) => {
        const { data } = await this.sb.storage.from(bucket).list(folder, { limit: 1000 });
        const old = (data || []).filter(o => o.id && !used.has(`${folder}/${o.name}`) && !aplus.includes(`${folder}/${o.name}`)).map(o => `${folder}/${o.name}`);
        if (old.length) await this.sb.storage.from(bucket).remove(old);
      };
      await Promise.all([sweep('covers', id), sweep('covers', id + '/aplus'), sweep('books', id), sweep('samples', id)]);
    } catch (e) { console.warn('cleanup', e); }
  }
  // asks Stripe directly about card payments still waiting (backup of the webhook); returns the references now paid
  async confirmPayments() {
    if (!this._user) return { paid: [] };
    try { const { data } = await this.sb.functions.invoke('confirm-payment', { body: {} }); if (data?.paid?.length) this._lib = null; return data || { paid: [] }; }
    catch { return { paid: [] }; }
  }
  // calls cb (debounced) whenever a sale or an order changes — keeps the admin panel up to date without reloading
  onSalesChange(cb) {
    this._salesCbs = this._salesCbs || new Set(); this._salesCbs.add(cb);
    if (!this._salesCh) {
      let tm; const fire = () => { clearTimeout(tm); tm = setTimeout(() => this._salesCbs.forEach(f => { try { f(); } catch { } }), 600); };
      this._salesCh = this.sb.channel('librava-sales')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' }, fire)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fire)
        .subscribe();
    }
    return () => this._salesCbs.delete(cb);
  }
  // rebuild the /book/<id>/ pages so WhatsApp & co. show the cover right away (runs in the background)
  refreshShare() {
    clearTimeout(this._shareT);
    this._shareT = setTimeout(() => this.sb.functions.invoke('share-refresh', { body: {} }).catch(() => { }), 1500);
  }
  async deleteBook(id) {
    const { error } = await this.sb.from('books').update({ status: 'draft', deleted_at: new Date().toISOString() }).eq('id', id);
    this._err(error); this._catalog = null; this.refreshShare();
  }
  async salesStats() {
    const { data, error } = await this.sb.from('purchases').select('*, book:books(id,title,author,cover_path,updated_at)').eq('test', false).order('created_at', { ascending: false }).limit(1000);
    this._err(error);
    return data.map(p => ({ ...p, book: p.book ? { ...p.book, cover_url: this._coverUrl(p.book) } : null }));
  }

  // ---- account ----
  async pendingOrders() {
    if (!this._user) return [];
    const { data } = await this.sb.from('orders').select('*').eq('user_id', this._user.id).eq('status', 'pending').eq('method', 'bank').order('created_at', { ascending: false });
    return data || [];
  }
  async deleteAccount(password) {
    if (this.hasPassword()) {
      const { error } = await this.sb.auth.signInWithPassword({ email: this._user.email, password });
      if (error) throw new Error('acc.err.currentWrong');
    }
    const { error } = await this.sb.functions.invoke('delete-account', { body: {} });
    if (error) { let msg = error.message; try { msg = (await error.context.json()).error || msg; } catch { } throw new Error(msg); }
    await this.sb.auth.signOut().catch(() => { });
    this._user = null; this._lib = null; this.listeners.forEach(cb => cb(null));
  }

  // ---- full admin panel (the database rules let only the administrator read these) ----
  async _all(table, select = '*', build = q => q) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await build(this.sb.from(table).select(select)).range(from, from + 999);
      this._err(error); out.push(...data);
      if (data.length < 1000) return out;
    }
  }
  async adminBooks() {
    const [books, P] = await Promise.all([this._loadCatalog(true), this._all('purchases', 'book_id,price_cents', q => q.eq('test', false))]);
    const rev = {}; for (const p of P) rev[p.book_id] = (rev[p.book_id] || 0) + (p.price_cents || 0);
    return filterBooks(books, { includeDrafts: true, sort: 'newest' }).map(b => ({ ...b, revenue_cents: rev[b.id] || 0 }));
  }
  async adminOverview() {
    const [books, P, users, pend] = await Promise.all([
      this._loadCatalog(true), this._all('purchases', 'book_id,price_cents,currency,created_at,customer_email', q => q.eq('test', false).order('created_at', { ascending: false })),
      this._all('profiles', 'id,created_at'), this.sb.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('method', 'bank'),
    ]);
    const day = d => new Date(d).toISOString().slice(0, 10);
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const since = n => P.filter(p => new Date(p.created_at) >= new Date(today - (n - 1) * 864e5));
    const sum = l => l.reduce((s, p) => s + (p.price_cents || 0), 0);
    const daily = [];
    for (let i = 29; i >= 0; i--) { const d = new Date(today - i * 864e5).toISOString().slice(0, 10); const l = P.filter(p => day(p.created_at) === d); daily.push({ date: d, revenue_cents: sum(l), count: l.length }); }
    const by = {}; for (const p of P) { by[p.book_id] = by[p.book_id] || { n: 0, sum: 0 }; by[p.book_id].n++; by[p.book_id].sum += p.price_cents || 0; }
    const top = Object.entries(by).map(([id, v]) => ({ book: books.find(b => b.id === id), ...v })).filter(x => x.book).sort((a, b) => b.sum - a.sum || b.n - a.n).slice(0, 5);
    const live = books.filter(b => !b.deleted_at);
    return {
      revenue: { today: sum(since(1)), d7: sum(since(7)), d30: sum(since(30)), all: sum(P) },
      counts: { sold: P.filter(p => p.price_cents > 0).length, free: P.filter(p => !p.price_cents).length, pending: pend.count || 0, customers: users.length,
        new_customers_30: users.filter(u => new Date(u.created_at) >= new Date(today - 29 * 864e5)).length, books: live.length, published: live.filter(b => b.status === 'published').length },
      currency: CONFIG.currency, daily, top,
      recent: P.slice(0, 8).map(p => ({ ...p, email: p.customer_email, title: books.find(b => b.id === p.book_id)?.title || '' })),
    };
  }
  async adminOrders(status = 'pending') {
    let q = this.sb.from('orders').select('*').order('created_at', { ascending: false }).limit(1000);
    if (status !== 'all') q = q.eq('status', status);
    const { data, error } = await q; this._err(error);
    return data;
  }
  async confirmOrder(id) { const { error } = await this.sb.rpc('admin_set_order', { p_order: id, p_status: 'paid' }); this._err(error); }
  async cancelOrder(id) { const { error } = await this.sb.rpc('admin_set_order', { p_order: id, p_status: 'cancelled' }); this._err(error); }
  async adminVisits(r) { const { data, error } = await this.sb.rpc('admin_visits', { p_from: r.from, p_to: r.to }); this._err(error); return data || []; }
  async adminVisitEvents(sid) { const { data, error } = await this.sb.rpc('admin_visit_events', { p_sid: sid }); this._err(error); return data || []; }
  async adminCustomers(q = '', range) {
    const r = range || { from: new Date(Date.now() - 30 * 864e5).toISOString(), to: new Date(Date.now() + 864e5).toISOString() };
    const [users, P, S] = await Promise.all([this._all('profiles', '*', x => x.order('created_at', { ascending: false })), this._all('purchases', 'user_id,price_cents,created_at', q => q.eq('test', false)),
      this.sb.rpc('admin_customers_activity', { p_from: r.from, p_to: r.to }).then(x => x.data || [], () => [])]);
    const act = {}; for (const x of S) act[x.user_id] = x;
    const n = norm(q);
    return users.filter(u => !n || norm((u.email || '') + ' ' + (u.full_name || '')).includes(n)).map(u => {
      const mine = P.filter(p => p.user_id === u.id), a = act[u.id] || {};
      return { id: u.id, email: u.email, name: u.full_name, created_at: u.created_at, books: mine.length, spent_cents: mine.reduce((s, p) => s + (p.price_cents || 0), 0),
        last_at: mine.map(p => p.created_at).sort().pop() || null, isAdmin: !!u.is_admin, seen_at: a.last_seen || null, visits: a.visits || 0, sec: a.seconds || 0, searches: a.searches || 0, opened: a.books || 0, carts: a.carts || 0 };
    });
  }
  async adminCustomer(id, range) {
    const { data: u, error } = await this.sb.from('profiles').select('*').eq('id', id).maybeSingle(); this._err(error);
    if (!u) throw new Error('Not found.');
    const [{ data: P }, { data: O }] = await Promise.all([
      this.sb.from('purchases').select('*, book:books(*)').eq('user_id', id).order('created_at', { ascending: false }),
      this.sb.from('orders').select('*').eq('user_id', id).order('created_at', { ascending: false }),
    ]);
    const rg = range || { from: new Date(Date.now() - 30 * 864e5).toISOString(), to: new Date(Date.now() + 864e5).toISOString() };
    let E = [], titles = {};
    try {
      E = (await this.sb.rpc('admin_customer_events', { p_user: id, p_from: rg.from, p_to: rg.to })).data || [];
      const ids = [...new Set(E.map(e => e.book_id).filter(Boolean))];
      if (ids.length) (await this.sb.from('books').select('id,title').in('id', ids)).data?.forEach(b => { titles[b.id] = b.title; });
    } catch { }
    E.forEach(e => { e.book_title = titles[e.book_id] || ''; });
    return {
      events: E,
      customer: { id: u.id, email: u.email, name: u.full_name, created_at: u.created_at, isAdmin: !!u.is_admin },
      purchases: (P || []).filter(p => p.book).map(p => ({ created_at: p.created_at, price_cents: p.price_cents, currency: p.currency, gift: !!p.gift, book: { ...p.book, cover_url: this._coverUrl(p.book) } })),
      orders: O || [],
    };
  }
  async grantBook(userId, bookId) {
    const { data: u } = await this.sb.from('profiles').select('email').eq('id', userId).maybeSingle();
    const { error } = await this.sb.from('purchases').insert({ user_id: userId, book_id: bookId, price_cents: 0, currency: CONFIG.currency.toLowerCase(), gift: true, customer_email: u?.email || null });
    if (error && !/duplicate/i.test(error.message)) this._err(error);
  }
  async revokeBook(userId, bookId) { const { error } = await this.sb.from('purchases').delete().eq('user_id', userId).eq('book_id', bookId); this._err(error); }
  async adminReviews() {
    const [{ data, error }, books, users] = await Promise.all([this.sb.from('reviews').select('*').order('created_at', { ascending: false }).limit(1000), this._loadCatalog(true), this._all('profiles', 'id,email')]);
    this._err(error);
    return data.map(r => ({ ...r, book_title: books.find(b => b.id === r.book_id)?.title || '', email: users.find(u => u.id === r.user_id)?.email || '' }));
  }
  async deleteReview(id) { const { error } = await this.sb.from('reviews').delete().eq('id', id); this._err(error); this._catalog = null; }
  // reviews from another shop, read from a file (see review-import.js); the same review is never added twice
  async importReviews(bookId, list, source) {
    const { data: ex, error: e1 } = await this.sb.from('reviews').select('ext_key').eq('book_id', bookId).not('ext_key', 'is', null); this._err(e1);
    const have = new Set((ex || []).map(r => r.ext_key)), batch = crypto.randomUUID();
    const rows = list.filter(r => !have.has(r.ext_key) && have.add(r.ext_key)).map(r => ({ book_id: bookId, user_id: null, imported: true, source: source || null, batch,
      rating: r.rating, title: r.title || null, body: r.body || null, author_name: r.author_name || null, country: r.country || null, verified: !!r.verified, ext_key: r.ext_key, ...(r.created_at ? { created_at: r.created_at } : {}) }));
    for (let i = 0; i < rows.length; i += 200) { const { error } = await this.sb.from('reviews').insert(rows.slice(i, i + 200)); this._err(error); }
    // the same file uploaded again: reviews already here take the "verified purchase" mark from the file
    const fresh = new Set(rows.map(r => r.ext_key));
    const ver = [...new Set(list.filter(r => r.verified && !fresh.has(r.ext_key)).map(r => r.ext_key))];
    let updated = 0;
    for (let i = 0; i < ver.length; i += 100) {
      const { data, error } = await this.sb.from('reviews').update({ verified: true }).eq('book_id', bookId).eq('imported', true).eq('verified', false).in('ext_key', ver.slice(i, i + 100)).select('id');
      this._err(error); updated += (data || []).length;
    }
    this._catalog = null;
    return { added: rows.length, dupes: list.length - rows.length - updated, updated, batch };
  }
  async deleteReviewBatch(batch) { const { error } = await this.sb.from('reviews').delete().eq('batch', batch); this._err(error); this._catalog = null; }
  async translateReview(id, lang) { const { data, error } = await this.sb.functions.invoke('translate-review', { body: { review_id: id, lang } }); if (error) return { error: 'server' }; return data; }
  async setBookStatus(id, status) { const { error } = await this.sb.from('books').update({ status, updated_at: new Date().toISOString() }).eq('id', id); this._err(error); this._catalog = null; }
  async exportSales() {
    const [P, books] = await Promise.all([this._all('purchases', '*', q => q.eq('test', false).order('created_at', { ascending: false })), this._loadCatalog(true)]);
    const rows = [['date', 'customer_email', 'book', 'author', 'amount', 'currency', 'gift']];
    for (const p of P) { const b = books.find(x => x.id === p.book_id) || {}; rows.push([p.created_at, p.customer_email || '', b.title || '', b.author || '', ((p.price_cents || 0) / 100).toFixed(2).replace('.', ','), (p.currency || CONFIG.currency).toUpperCase(), p.gift ? 'yes' : '']); }
    const csv = '\ufeff' + rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    return { blob: new Blob([csv], { type: 'text/csv;charset=utf-8' }) };
  }
}

// =====================================================================
//  OWN SERVER (PHP + MySQL on Hostinger) — used automatically when /api answers
// =====================================================================
class ServerAPI {
  constructor(health) {
    this.listeners = []; this._user = null; this._catalog = null; this._lib = null;
    this.isDemo = false; this.isServer = true; this.supportsGoogle = false;
    this.payments = (health && health.payments) || { bank: false, card: false };
  }
  async _call(method, path, body, form) {
    const opt = { method, credentials: 'same-origin', headers: { 'X-Librava': '1', 'X-Librava-Lang': getLang() } };
    if (form) opt.body = form;
    else if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    let r;
    try { r = await fetch('/api' + path, opt); } catch { throw new Error('reader.error'); }
    let j = {};
    try { j = await r.json(); } catch { }
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }
  _set(u) { const before = this._user?.id; this._user = u || null; this._lib = null; if (before !== this._user?.id) this.listeners.forEach(cb => cb(this._user)); }

  async init() { const r = await this._call('GET', '/auth/me'); this._user = r.user; }
  user() { return this._user; }
  onAuthChange(cb) { this.listeners.push(cb); }

  async signUp({ email, password, name }) { const r = await this._call('POST', '/auth/register', { email, password, name }); this._set(r.user); return {}; }
  async signIn({ email, password }) { const r = await this._call('POST', '/auth/login', { email, password }); this._set(r.user); }
  async signInGoogle() { throw new Error('Google login is not available.'); }
  async signOut() { await this._call('POST', '/auth/logout').catch(() => { }); this._set(null); }
  async resetPassword(email) { await this._call('POST', '/auth/forgot', { email }); }
  async resetWithToken(token, password) { const r = await this._call('POST', '/auth/reset', { token, password }); this._set(r.user); }
  async updateProfile({ name }) { const r = await this._call('POST', '/profile', { name }); this._user = r.user; this.listeners.forEach(cb => cb(this._user)); }
  hasPassword() { return true; }
  async changePassword(current, next) {
    if (next.length < 6) throw new Error('acc.err.short');
    await this._call('POST', '/auth/password', { current, next });
  }
  async deleteAccount(password) { await this._call('POST', '/auth/delete', { password }); this._set(null); }

  // ---- catalog ----
  async _loadCatalog() { this._catalog = (await this._call('GET', '/books')).books; return this._catalog; }
  async listBooks(o = {}) { if (!this._catalog) await this._loadCatalog(); return filterBooks(this._catalog, o); }
  async getBook(id) {
    if (this._catalog) { const b = this._catalog.find(x => x.id === id); if (b) return b; }
    try { return (await this._call('GET', '/books/' + encodeURIComponent(id))).book; } catch { return null; }
  }

  // ---- library ----
  async _loadLib() { if (!this._user) return []; this._lib = (await this._call('GET', '/library')).items; return this._lib; }
  async library() { return this._user ? await this._loadLib() : []; }
  async owns(bookId) {
    if (!this._user) return null;
    if (!this._lib) await this._loadLib();
    const x = this._lib.find(i => i.book.id === bookId);
    return x ? x.purchase : null;
  }
  async orders() { const l = this._user ? await this._loadLib() : []; return l.map(x => ({ ...x.purchase, book: x.book })); }
  async pendingOrders() { return this._user ? (await this._call('GET', '/orders')).orders : []; }
  async claimFree(bookId) { await this._call('POST', '/claim/' + encodeURIComponent(bookId)); this._lib = null; }
  async checkout(bookIds, method) {
    const r = await this._call('POST', '/checkout', { book_ids: bookIds, method: method || '' });
    this._lib = null; this._catalog = null;
    return r;
  }

  // ---- reading ----
  async getReadSource(book, { preview } = {}) {
    const owned = await this.owns(book.id);
    if (owned || this._user?.isAdmin) return { url: '/api/read/' + encodeURIComponent(book.id), kind: book.format, limited: false };
    if (preview && book.sample_path) return { url: book.sample_path, kind: book.sample_kind || 'pdf', limited: true, sample: true };
    throw new Error('not-owned');
  }
  async getProgress(bookId) {
    if (!this._user) return store.get('guestprog:' + bookId, null);
    return (await this._call('GET', '/progress/' + encodeURIComponent(bookId))).progress;
  }
  async saveProgress(bookId, d) {
    if (!this._user) { store.set('guestprog:' + bookId, d); return; }
    const body = {}; for (const k of ['location', 'percent', 'page', 'bookmarks']) if (k in d) body[k] = d[k];
    await this._call('POST', '/progress/' + encodeURIComponent(bookId), body);
  }

  // ---- reviews ----
  async listReviews(bookId) { return (await this._call('GET', '/reviews/' + encodeURIComponent(bookId))).reviews; }
  async addReview(bookId, rating, body) { await this._call('POST', '/reviews/' + encodeURIComponent(bookId), { rating, body }); this._catalog = null; }
  async myReview(bookId) {
    if (!this._user) return null;
    return (await this.listReviews(bookId)).find(r => r.user_id === this._user.id) || null;
  }

  // ---- admin ----
  async adminBooks() { return filterBooks((await this._call('GET', '/admin/books')).books, { includeDrafts: true, sort: 'newest' }); }
  async saveBook(data, files = {}) {
    const f = new FormData();
    const clean = { ...data }; delete clean.cover_url; delete clean.sample_path; delete clean.rating_avg; delete clean.rating_count; delete clean.sales_count;
    f.append('data', JSON.stringify(clean));
    if (files.cover) f.append('cover', files.cover);
    if (files.file) f.append('file', files.file);
    if (files.sample) f.append('sample', files.sample);
    const r = await this._call('POST', '/admin/books', undefined, f);
    this._catalog = null;
    return r.id;
  }
  async deleteBook(id) { await this._call('POST', '/admin/books/' + encodeURIComponent(id) + '/delete'); this._catalog = null; }
  async salesStats() { return (await this._call('GET', '/admin/sales')).sales; }
  async adminOrders(status = 'pending') { return (await this._call('GET', '/admin/orders?status=' + encodeURIComponent(status))).orders; }
  async adminOverview() { return await this._call('GET', '/admin/overview'); }
  async adminVisits() { return []; }
  async adminVisitEvents() { return []; }
  async adminCustomers(q = '') { return (await this._call('GET', '/admin/customers?q=' + encodeURIComponent(q))).customers; }
  async adminCustomer(id) { return await this._call('GET', '/admin/customers/' + encodeURIComponent(id)); }
  async grantBook(userId, bookId) { await this._call('POST', '/admin/customers/' + userId + '/grant', { book_id: bookId }); }
  async revokeBook(userId, bookId) { await this._call('POST', '/admin/customers/' + userId + '/revoke', { book_id: bookId }); }
  async adminReviews() { return (await this._call('GET', '/admin/reviews')).reviews; }
  async deleteReview(id) { await this._call('POST', '/admin/reviews/' + id + '/delete'); this._catalog = null; }
  async setBookStatus(id, status) { await this._call('POST', '/admin/books/' + encodeURIComponent(id) + '/status', { status }); this._catalog = null; }
  async exportSales() { return { url: '/api/admin/export/sales.csv' }; }
  async confirmOrder(id) { await this._call('POST', '/admin/orders/' + id + '/paid'); }
  async cancelOrder(id) { await this._call('POST', '/admin/orders/' + id + '/cancel'); }
}

// ---------------------------------------------------------------------
//  Which backend? Supabase if configured, otherwise our own server if
//  /api answers (Hostinger), otherwise the in-browser demo (GitHub Pages).
// ---------------------------------------------------------------------
export let api = new DemoAPI();
export async function chooseBackend() {
  if (CONFIG.supabaseUrl && CONFIG.supabaseAnonKey) { api = new SupabaseAPI(); api.supportsGoogle = !!CONFIG.googleLogin; return api; }
  if (location.protocol.startsWith('http')) {
    try {
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 5000);
      const r = await fetch('/api/health', { headers: { 'X-Librava': '1' }, signal: ctl.signal, cache: 'no-store' });
      clearTimeout(tm);
      const ct = r.headers.get('content-type') || '';
      if (r.ok && ct.includes('json')) { const h = await r.json(); if (h.ok) { api = new ServerAPI(h); return api; } }
    } catch { }
  }
  if (!DEMO_ALLOWED) { api = null; return null; }   // live site without a server: no fake store
  return api;
}
