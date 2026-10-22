// =====================================================================
//  Books the reader keeps on this device: download a personal copy (PDF / EPUB)
//  and/or save it inside the browser to read without internet.
// =====================================================================
import { blobs, store, loadScript } from './util.js?v=20261022174736';
import { api } from './api.js?v=20261022174736';

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
      const ref = (await api.owns?.(book.id).catch(() => null))?.order?.reference || '';
      const line = ascii(`Licensed to ${u.name || ''} <${u.email}>${ref ? ' - order ' + ref : ''} - librava.store - ${new Date().toISOString().slice(0, 10)} - (c) ${new Date(book.published_at || Date.now()).getFullYear()} Librava (librava.store). All rights reserved. Sharing or reselling this file is not permitted.`);
      for (const pg of doc.getPages()) {
        const { width } = pg.getSize();
        let size = Math.max(4.5, Math.min(6.5, width / 95));
        while (font.widthOfTextAtSize(line, size) > width - 20 && size > 3.5) size -= 0.25;
        pg.drawText(line, { x: Math.max(10, (width - font.widthOfTextAtSize(line, size)) / 2), y: 5, size, font, color: rgb(0.5, 0.5, 0.5), opacity: 0.7 });
      }
      doc.setSubject(line); doc.setProducer('Librava');
      blob = new Blob([await doc.save()], { type: 'application/pdf' });
    } catch (e) { console.warn('stamp skipped', e); }
  }
  // EPUB: a personal copy too — a licence page at the start, the buyer in the book's data and a hidden mark in every page
  if (book.format === 'epub' && book.stamp_downloads !== false && u && blob.size < 200 * 1048576) {
    try { blob = await stampEpub(blob, book, u); } catch (e) { console.warn('epub stamp skipped', e); }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safeName(book.title)} - ${safeName(book.author)}.${book.format === 'epub' ? 'epub' : 'pdf'}`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

export async function stampEpub(blob, book, u) {
  await loadScript(VENDOR('jszip.min.js'));
  const zip = await window.JSZip.loadAsync(blob);
  const container = await zip.file('META-INF/container.xml')?.async('string');
  const opfPath = (container || '').match(/full-path="([^"]+)"/)?.[1]; if (!opfPath) return blob;
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  let opf = await zip.file(opfPath).async('string');
  const ref = (await api.owns?.(book.id).catch(() => null))?.order?.reference || '';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const who = `${u.name || ''} <${u.email}>`, date = new Date().toISOString().slice(0, 10);
  const note = `Licensed to ${who}${ref ? ' · order ' + ref : ''} · librava.store · ${date}`;
  // 1) a licence page right after the cover
  const page = `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en"><head><meta charset="utf-8"/><title>Licence</title></head><body style="font-family:sans-serif;text-align:center;margin-top:30%"><p style="font-size:.85em;color:#555">This ebook is licensed for the personal use of</p><p style="font-weight:bold">${esc(who)}</p><p style="font-size:.8em;color:#555">${ref ? 'Order ' + esc(ref) + ' · ' : ''}${date} · librava.store</p><p style="font-size:.75em;color:#777;margin-top:2em">${book.rights === 'public' ? 'Public domain text. Edition and cover © ' + new Date(book.published_at || Date.now()).getFullYear() + ' Librava.' : '© ' + new Date(book.published_at || Date.now()).getFullYear() + ' Librava (librava.store). All rights reserved.'} Copying, sharing or reselling this file is not permitted.</p></body></html>`;
  zip.file(base + 'librava-licence.xhtml', page);
  opf = opf.replace(/<\/manifest>/, '<item id="librava-licence" href="librava-licence.xhtml" media-type="application/xhtml+xml"/></manifest>');
  opf = opf.replace(/(<spine[^>]*>\s*(?:<itemref[^>]*\/>\s*)?)/, m => m.includes('itemref') ? m + '<itemref idref="librava-licence"/>' : m + '<itemref idref="librava-licence"/>');
  // 2) the buyer in the book's data
  opf = opf.replace(/<\/metadata>/, `<meta name="librava:licence" content="${esc(note)}"/></metadata>`);
  zip.file(opfPath, opf);
  // 3) an invisible mark in every page of the book
  const pages = Object.keys(zip.files).filter(n => /\.x?html?$/i.test(n) && !n.endsWith('librava-licence.xhtml'));
  for (const n of pages) {
    const x = await zip.file(n).async('string');
    zip.file(n, x.replace(/<\/body>/i, `<!-- ${note.replace(/--/g, '-')} --></body>`));
  }
  // mimetype must stay first and uncompressed
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  const out = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' }, null);
  return out;
}

