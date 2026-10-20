// =====================================================================
//  Books the reader keeps on this device: download a personal copy (PDF / EPUB)
//  and/or save it inside the browser to read without internet.
// =====================================================================
import { blobs, store, loadScript } from './util.js?v=20261020184123';
import { api } from './api.js?v=20261020184123';

const VENDOR = f => new URL('../vendor/' + f, import.meta.url).href;
const KEY = 'offline:books';
const list = () => store.get(KEY, {});

export const offline = {
  has(id) { return !!list()[id]; },
  all() { return Object.values(list()); },
  async save(book, blob) {
    await blobs.put('offline:' + book.id, blob);
    const l = list();
    l[book.id] = { book: { id: book.id, title: book.title, author: book.author, format: book.format, cover_url: book.cover_url, language: book.language, updated_at: book.updated_at }, size: blob.size, saved_at: new Date().toISOString() };
    store.set(KEY, l);
    // make sure the reader itself (PDF / EPUB engines) is also available without internet
    try { navigator.serviceWorker?.controller?.postMessage({ cache: (book.format === 'epub' ? ['jszip.min.js', 'epub.min.js'] : ['pdf.min.js', 'pdf.worker.min.js']).map(VENDOR) }); } catch { }
    // keep covers too, so the library looks right without internet
    try { if (book.cover_url && 'caches' in window) (await caches.open('librava-covers')).add(book.cover_url); } catch { }
  },
  async get(id, fresh) {
    const e = list()[id]; if (!e) return null;
    if (fresh?.updated_at && e.book.updated_at && fresh.updated_at !== e.book.updated_at) return null;   // the author replaced the file
    const blob = await blobs.get('offline:' + id);
    return blob ? { ...e, blob } : null;
  },
  async remove(id) { const l = list(); delete l[id]; store.set(KEY, l); try { await blobs.del('offline:' + id); } catch { } },
};

const safeName = s => String(s || 'book').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'book';

// fetch the full book file of a book the user owns
export async function fetchBookFile(book, onProgress) {
  const src = await api.getReadSource(book, {});
  const res = await fetch(src.url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const total = +res.headers.get('content-length') || 0;
  if (!res.body || !total || !onProgress) return await res.blob();
  const reader = res.body.getReader(), parts = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; onProgress(got / total); }
  return new Blob(parts, { type: res.headers.get('content-type') || '' });
}

// a personal copy: PDFs get a discreet line on the first page with the buyer's name (like many ebook shops)
export async function downloadBook(book, onProgress) {
  let blob = await fetchBookFile(book, onProgress);
  const u = api.user();
  if (book.format === 'pdf' && book.stamp_downloads !== false && u && blob.size < 200 * 1048576) {
    try {
      await loadScript(VENDOR('pdf-lib.min.js'));
      const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
      const doc = await PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true });
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const ascii = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '');
      const line = ascii(`Licensed to ${u.name || ''} <${u.email}> - librava.store - ${new Date().toISOString().slice(0, 10)}`);
      const first = doc.getPage(0), { width } = first.getSize();
      const size = Math.max(5, Math.min(7, width / 90));
      first.drawText(line, { x: (width - font.widthOfTextAtSize(line, size)) / 2, y: 6, size, font, color: rgb(0.45, 0.45, 0.45), opacity: 0.8 });
      doc.setSubject(line); doc.setProducer('Librava');
      blob = new Blob([await doc.save()], { type: 'application/pdf' });
    } catch (e) { console.warn('stamp skipped', e); }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safeName(book.title)} - ${safeName(book.author)}.${book.format === 'epub' ? 'epub' : 'pdf'}`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
