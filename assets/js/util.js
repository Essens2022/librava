// Small helpers shared by every module

const PREFIX = 'librava:';
const mem = {};
export const store = {
  get(k, def = null) {
    try { const v = localStorage.getItem(PREFIX + k); return v === null ? (k in mem ? mem[k] : def) : JSON.parse(v); }
    catch { return k in mem ? mem[k] : def; }
  },
  set(k, v) {
    mem[k] = v;
    try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch { /* storage full or blocked: keep in memory */ }
  },
  del(k) { delete mem[k]; try { localStorage.removeItem(PREFIX + k); } catch { } },
};

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function uid(prefix = '') {
  const a = new Uint8Array(8);
  (crypto.getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => a[i] = Math.random() * 256));
  return prefix + Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}

export function debounce(fn, ms) {
  let tm = null, args = null;
  const d = (...a) => { args = a; clearTimeout(tm); tm = setTimeout(() => { tm = null; fn(...args); }, ms); };
  d.flush = () => { if (tm) { clearTimeout(tm); tm = null; fn(...args); } };
  return d;
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

export function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// --- tiny IndexedDB blob store (used only in demo mode for uploaded files) ---
const memBlobs = new Map();
function idb() {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open('librava-demo', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
export const blobs = {
  async put(key, blob) {
    memBlobs.set(key, blob);
    try {
      const db = await idb();
      await new Promise((res, rej) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(blob, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    } catch { /* memory only */ }
  },
  async get(key) {
    if (memBlobs.has(key)) return memBlobs.get(key);
    try {
      const db = await idb();
      return await new Promise((res, rej) => { const r = db.transaction('files').objectStore('files').get(key); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); });
    } catch { return null; }
  },
  async del(key) {
    memBlobs.delete(key);
    try { const db = await idb(); db.transaction('files', 'readwrite').objectStore('files').delete(key); } catch { }
  },
};

export function fileToDataURL(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}

export function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.dataset.src = src; s.onload = res; s.onerror = () => rej(new Error('Nu s-a putut încărca ' + src));
    document.head.appendChild(s);
  });
}
