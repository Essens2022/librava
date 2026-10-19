// =====================================================================
//  Data layer. Two implementations with the same interface:
//   - DemoAPI: everything in this browser (localStorage + IndexedDB)
//   - SupabaseAPI: real accounts, database, private file storage, Stripe
// =====================================================================
import { CONFIG, IS_DEMO } from './config.js';
import { store, uid, blobs, norm, loadScript } from './util.js';
import { DEMO_BOOKS } from './demo-data.js';

export const DEMO_ADMIN = { email: 'admin@librava.demo', pass: 'admin123' };

// ---------- shared catalog filtering / sorting ----------
export function filterBooks(all, o = {}) {
  let list = all.slice();
  if (!o.includeDrafts) list = list.filter(b => b.status === 'published');
  if (o.category) list = list.filter(b => b.category === o.category);
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
    let users = store.get('demo:users', []);
    if (!users.some(u => u.email === DEMO_ADMIN.email)) {
      users.push({ id: 'u_admin', email: DEMO_ADMIN.email, pass: await sha(DEMO_ADMIN.pass), name: 'Admin', isAdmin: true, createdAt: '2026-01-10T10:00:00Z' });
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
    const u = { id: uid('u_'), email, pass: await sha(password), name: name || email.split('@')[0], isAdmin: false, createdAt: new Date().toISOString() };
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
    if (!owned && book.sample_path) return { url: book.sample_path, kind: book.sample_kind || 'pdf', limited: false };
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
    return [...seeded, ...store.get('demo:reviews', [])];
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
  async adminBooks() { await this._loadCatalog(); return filterBooks(this._catalog.filter(b => !b.deleted_at), { includeDrafts: true, sort: 'newest' }); }
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
}

// =====================================================================
//  SUPABASE
// =====================================================================
class SupabaseAPI {
  constructor() { this.listeners = []; this._user = null; this._catalog = null; this._lib = null; this.isDemo = false; }

  async init() {
    await loadScript(new URL('../vendor/supabase.min.js', import.meta.url).href);
    this.sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true } });
    const { data } = await this.sb.auth.getSession();
    await this._setSession(data.session);
    this.sb.auth.onAuthStateChange(async (_e, session) => {
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
    this._user = { id: u.id, email: u.email, name: profile?.full_name || u.user_metadata?.full_name || u.email.split('@')[0], isAdmin: !!profile?.is_admin, createdAt: profile?.created_at || u.created_at };
  }
  user() { return this._user; }
  onAuthChange(cb) { this.listeners.push(cb); }
  _err(error) { if (error) throw new Error(error.message || String(error)); }

  async signUp({ email, password, name }) {
    if (password.length < 6) throw new Error('acc.err.short');
    const { data, error } = await this.sb.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: location.origin + location.pathname + '#/account' } });
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
  async signOut() { await this.sb.auth.signOut(); this._user = null; this._lib = null; this.listeners.forEach(cb => cb(null)); }
  async resetPassword(email) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + '#/account' });
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
    const { data, error } = await this.sb.from('purchases').select('*, book:books(*)').eq('user_id', this._user.id).order('created_at', { ascending: false });
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
      return { url: this.sb.storage.from('samples').getPublicUrl(book.sample_path).data.publicUrl, kind: book.sample_path.endsWith('.epub') ? 'epub' : 'pdf', limited: false };
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
  async adminBooks() { return filterBooks(await this._loadCatalog(true), { includeDrafts: true, sort: 'newest' }); }
  async _upload(bucket, path, file) {
    const { error } = await this.sb.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type || undefined, cacheControl: '3600' });
    this._err(error);
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
}

export const api = IS_DEMO ? new DemoAPI() : new SupabaseAPI();
