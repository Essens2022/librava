// =====================================================================
//  Data layer. Two implementations with the same interface:
//   - DemoAPI: everything in this browser (localStorage + IndexedDB)
//   - SupabaseAPI: real accounts, database, private file storage, Stripe
// =====================================================================
import { CONFIG } from './config.js?v=20261019203508';
import { getLang } from './i18n.js?v=20261019203508';
import { store, uid, blobs, norm, loadScript } from './util.js?v=20261019203508';
// Demo mode exists only for local development (localhost). The live site never loads fake books.
export const DEMO_ALLOWED = location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname);
let DEMO_BOOKS = [];


// ---------- shared catalog filtering / sorting ----------
export function filterBooks(all, o = {}) {
  let list = all.slice();
  if (!o.includeDrafts) list = list.filter(b => b.status === 'published');
  if (o.category) list = list.filter(b => b.category === o.category || (b.categories || []).includes(o.category));
  if (o.format) list = list.filter(b => b.format === o.format);
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
    const terms = norm(o.q).split(/\s+/).filter(Boolean);
    scores = new Map();
    list = list.filter(b => {
      const title = norm(b.title + ' ' + (b.subtitle || '')), author = norm(b.author);
      const rest = norm((b.description || '') + ' ' + (b.keywords || []).join(' ') + ' ' + b.category);
      let s = 0;
      for (const t of terms) {
        if (title.includes(t)) s += 5; else if (author.includes(t)) s += 4; else if (rest.includes(t)) s += 1; else return false;
      }
      scores.set(b.id, s); return true;
    });
  }
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
  if (o.limit) list = list.slice(0, o.limit);
  return list;
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
class DemoAPI {
  constructor() { this.listeners = []; this._user = null; this._catalog = null; this.isDemo = true; }

  async init() {
    if (DEMO_ALLOWED && !DEMO_BOOKS.length) { try { DEMO_BOOKS = (await import('./demo-data.js?v=20261019203508')).DEMO_BOOKS; } catch { DEMO_BOOKS = []; } }
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
  async checkout(bookIds) {
    const books = (await Promise.all(bookIds.map(id => this.getBook(id)))).filter(Boolean);
    const free = books.filter(b => !b.price_cents).map(b => b.id);
    if (free.length) this._addPurchases(free);
    const paid = books.filter(b => b.price_cents > 0);
    return { mode: paid.length ? 'demo' : 'done', paid: paid.map(b => b.id), total: paid.reduce((s, b) => s + b.price_cents, 0) };
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
  async adminCustomers(q = '') {
    const P = store.get('demo:purchases', []), n = norm(q);
    return this._users().filter(u => !n || norm(u.email + ' ' + u.name).includes(n)).map(u => {
      const mine = P.filter(p => p.user_id === u.id);
      return { id: u.id, email: u.email, name: u.name, created_at: u.createdAt, books: mine.length, spent_cents: mine.reduce((s, p) => s + (p.price_cents || 0), 0),
        last_at: mine.map(p => p.created_at).sort().pop() || null, isAdmin: !!u.isAdmin };
    }).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }
  async adminCustomer(id) {
    if (!this._catalog) await this._loadCatalog();
    const u = this._users().find(x => x.id === id);
    if (!u) throw new Error('Not found.');
    const purchases = store.get('demo:purchases', []).filter(p => p.user_id === id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map(p => { const book = this._catalog.find(b => b.id === p.book_id); return book && { created_at: p.created_at, price_cents: p.price_cents, currency: p.currency, gift: !!p.gift, book }; }).filter(Boolean);
    return { customer: { id: u.id, email: u.email, name: u.name, created_at: u.createdAt, isAdmin: !!u.isAdmin }, purchases, orders: [] };
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

  async signUp({ email, password, name }) {
    if (password.length < 6) throw new Error('acc.err.short');
    const { data, error } = await this.sb.auth.signUp({ email, password, options: { data: { full_name: name, lang: getLang() }, emailRedirectTo: location.origin + '/' } });
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
  async _loadCatalog(includeDrafts = false) {
    let q = this.sb.from('books').select('*').order('published_at', { ascending: false });
    q = q.is('deleted_at', null);
    if (!includeDrafts) q = q.eq('status', 'published');
    const { data, error } = await q; this._err(error);
    const list = data.map(b => ({ ...b, cover_url: this._coverUrl(b) }));
    if (!includeDrafts) this._catalog = list;
    return list;
  }
  async listBooks(o = {}) { if (!this._catalog) await this._loadCatalog(); return filterBooks(this._catalog, o); }
  async getBook(id) {
    if (this._catalog) { const b = this._catalog.find(x => x.id === id); if (b) return b; }
    const { data, error } = await this.sb.from('books').select('*').eq('id', id).maybeSingle();
    if (error || !data) return null;
    return { ...data, cover_url: this._coverUrl(data) };
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
  async checkout(bookIds) {
    const books = (await Promise.all(bookIds.map(id => this.getBook(id)))).filter(Boolean);
    const free = books.filter(b => !b.price_cents);
    for (const b of free) await this.claimFree(b.id);
    const paid = books.filter(b => b.price_cents > 0).map(b => b.id);
    if (!paid.length) return { mode: 'done' };
    const { data, error } = await this.sb.functions.invoke('create-checkout', { body: { book_ids: paid, return_url: location.origin + location.pathname } });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); msg = j.error || msg; } catch { }
      throw new Error(msg);
    }
    return { mode: 'redirect', url: data.url };
  }

  // ---- reading ----
  async getReadSource(book, { preview } = {}) {
    const owned = await this.owns(book.id);
    if (owned || this._user?.isAdmin) {
      const { data, error } = await this.sb.storage.from('books').createSignedUrl(book.file_path, 60 * 60 * 3);
      this._err(error);
      return { url: data.signedUrl, kind: book.format, limited: false };
    }
    if (preview && book.sample_path) {
      return { url: this.sb.storage.from('samples').getPublicUrl(book.sample_path).data.publicUrl + (book.updated_at ? '?v=' + encodeURIComponent(book.updated_at) : ''), kind: book.sample_path.endsWith('.epub') ? 'epub' : 'pdf', limited: true, sample: true };
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
    this._err(error); return data.map(r => ({ ...r, verified: true }));
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
    delete row.cover_url; delete row.sales_count; delete row.rating_avg; delete row.rating_count;
    if (files.cover) { const p = `${id}/cover.${fileExt(files.cover.name) || 'jpg'}`; await this._upload('covers', p, files.cover); row.cover_path = p; }
    if (files.file) {
      const ext = fileExt(files.file.name);
      const p = `${id}/book.${ext}`; await this._upload('books', p, files.file);
      row.file_path = p; row.format = ext === 'epub' ? 'epub' : 'pdf'; row.file_name = files.file.name;
    }
    if (files.sample) { const p = `${id}/sample.${fileExt(files.sample.name)}`; await this._upload('samples', p, files.sample); row.sample_path = p; }
    const { error } = await this.sb.from('books').upsert(row); this._err(error);
    this._catalog = null;
    return id;
  }
  async deleteBook(id) {
    const { error } = await this.sb.from('books').update({ status: 'draft', deleted_at: new Date().toISOString() }).eq('id', id);
    this._err(error); this._catalog = null;
  }
  async salesStats() {
    const { data, error } = await this.sb.from('purchases').select('*, book:books(id,title,author,cover_path,updated_at)').order('created_at', { ascending: false }).limit(1000);
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
    const [books, P] = await Promise.all([this._loadCatalog(true), this._all('purchases', 'book_id,price_cents')]);
    const rev = {}; for (const p of P) rev[p.book_id] = (rev[p.book_id] || 0) + (p.price_cents || 0);
    return filterBooks(books, { includeDrafts: true, sort: 'newest' }).map(b => ({ ...b, revenue_cents: rev[b.id] || 0 }));
  }
  async adminOverview() {
    const [books, P, users, pend] = await Promise.all([
      this._loadCatalog(true), this._all('purchases', 'book_id,price_cents,currency,created_at,customer_email', q => q.order('created_at', { ascending: false })),
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
  async adminCustomers(q = '') {
    const [users, P] = await Promise.all([this._all('profiles', '*', x => x.order('created_at', { ascending: false })), this._all('purchases', 'user_id,price_cents,created_at')]);
    const n = norm(q);
    return users.filter(u => !n || norm((u.email || '') + ' ' + (u.full_name || '')).includes(n)).map(u => {
      const mine = P.filter(p => p.user_id === u.id);
      return { id: u.id, email: u.email, name: u.full_name, created_at: u.created_at, books: mine.length, spent_cents: mine.reduce((s, p) => s + (p.price_cents || 0), 0),
        last_at: mine.map(p => p.created_at).sort().pop() || null, isAdmin: !!u.is_admin };
    });
  }
  async adminCustomer(id) {
    const { data: u, error } = await this.sb.from('profiles').select('*').eq('id', id).maybeSingle(); this._err(error);
    if (!u) throw new Error('Not found.');
    const [{ data: P }, { data: O }] = await Promise.all([
      this.sb.from('purchases').select('*, book:books(*)').eq('user_id', id).order('created_at', { ascending: false }),
      this.sb.from('orders').select('*').eq('user_id', id).order('created_at', { ascending: false }),
    ]);
    return {
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
  async setBookStatus(id, status) { const { error } = await this.sb.from('books').update({ status, updated_at: new Date().toISOString() }).eq('id', id); this._err(error); this._catalog = null; }
  async exportSales() {
    const [P, books] = await Promise.all([this._all('purchases', '*', q => q.order('created_at', { ascending: false })), this._loadCatalog(true)]);
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
