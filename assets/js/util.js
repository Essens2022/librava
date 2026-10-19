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

// ---- book descriptions with simple formatting, like Amazon KDP (only safe tags, no attributes, no scripts)
const DESC_TAGS = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'SUB', 'SUP']);
export const hasTags = s => /<\/?(p|br|b|strong|i|em|u|h[4-6]|ul|ol|li|sub|sup)\b/i.test(String(s || ''));
export function safeHTML(src) {
  const s = String(src || '');
  if (!hasTags(s)) return esc(s);
  const doc = new DOMParser().parseFromString('<div>' + s + '</div>', 'text/html');
  const walk = node => [...node.childNodes].map(n => {
    if (n.nodeType === 3) return esc(n.textContent);
    if (n.nodeType !== 1) return '';
    if (/^(SCRIPT|STYLE|IFRAME|OBJECT|NOSCRIPT|TEMPLATE|SVG|MATH)$/.test(n.tagName)) return '';   // dropped with their content
    const tag = n.tagName === 'H1' || n.tagName === 'H2' || n.tagName === 'H3' ? 'H4' : n.tagName;
    if (!DESC_TAGS.has(tag)) return walk(n);           // unknown tag: keep its text only
    const t = tag.toLowerCase();
    return t === 'br' ? '<br>' : `<${t}>${walk(n)}</${t}>`;
  }).join('');
  return walk(doc.body.firstChild);
}
export const plainText = s => hasTags(s) ? (new DOMParser().parseFromString(String(s), 'text/html').body.textContent || '') : String(s || '');

// ---- every uploaded image is made light (default max 60 KB) while keeping it sharp:
// resized to the size the site really shows, saved as WebP (JPEG where the browser can't make WebP),
// quality lowered step by step only as much as needed.
export async function compressImage(file, { maxW = 1200, maxH = 1200, maxBytes = 60 * 1024, name = 'image' } = {}) {
  if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type)) return file;
  const bmp = await new Promise((res, rej) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = rej; im.src = u; });
  let scale = Math.min(1, maxW / bmp.naturalWidth, maxH / bmp.naturalHeight);
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  const encode = (type, q) => new Promise(r => canvas.toBlob(r, type, q));
  let best = null;
  for (let round = 0; round < 8; round++) {
    canvas.width = Math.max(1, Math.round(bmp.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(bmp.naturalHeight * scale));
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    let type = 'image/webp';
    const probe = await encode(type, 0.9);
    if (!probe || probe.type !== 'image/webp') type = 'image/jpeg';
    // highest quality that still fits
    let lo = 0.5, hi = 0.95, fit = null;
    for (let i = 0; i < 7; i++) {
      const q = (lo + hi) / 2, b = await encode(type, q);
      if (b && b.size <= maxBytes) { fit = b; lo = q; } else hi = q;
    }
    if (!fit) { const b = await encode(type, 0.5); if (b && b.size <= maxBytes) fit = b; }
    if (fit) { best = fit; break; }
    scale *= 0.85;                       // still too heavy at good quality: make it a bit smaller
  }
  if (!best) best = await encode('image/jpeg', 0.6);
  if (best.size >= file.size && file.size <= maxBytes) return file;   // the original was already light
  const ext = best.type === 'image/webp' ? 'webp' : 'jpg';
  const out = new File([best], `${name}.${ext}`, { type: best.type });
  out.optimized = { from: file.size, to: best.size, w: canvas.width, h: canvas.height };
  return out;
}
