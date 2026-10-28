// Librava book optimizer: makes heavy books (over 7 MB) light for phones, without visible loss of quality.
// What makes a book heavy is almost always its pictures, prepared for print (very large, very high quality).
// On a screen a picture never needs more than about 1200–1800 pixels, so the pictures are redrawn at that size,
// step by step, until the book fits in 5 MB — but never below a floor that still looks the same on a screen.
// If a book cannot reach 5 MB without visible loss, it stays at the best quality (e.g. 7 MB): pictures are never ruined.
// Text, fonts, layout, chapters and links are not touched. The original file is kept apart (private) by the caller.
import { loadScript } from './util.js?v=20261028040209';

const VENDOR = f => new URL('../vendor/' + f + '?v=' + (f.startsWith('pdf.') ? 'pdfjs-3.11.174-legacy' : '1'), import.meta.url).href;
const MB = 1048576;
export const OPT_FROM = 7 * MB;      // books lighter than this are left as they are
export const OPT_TARGET = 5 * MB;    // the size we aim for
// from the best quality to the floor (all of them look the same on phone, tablet and computer screens)
const LEVELS = [{ max: 1800, q: 0.86 }, { max: 1600, q: 0.84 }, { max: 1400, q: 0.82 }, { max: 1280, q: 0.80 }, { max: 1200, q: 0.78 }];
const SMALL = 40 * 1024;             // tiny pictures (icons, ornaments) are not worth touching

const decode = blob => new Promise((res, rej) => { const u = URL.createObjectURL(blob), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('image')); }; im.src = u; });
// one picture at one level: a new picture only if it is really lighter
async function redraw(bytes, mime, { max, q }) {
  const im = await decode(new Blob([bytes], { type: mime }));
  const w0 = im.naturalWidth, h0 = im.naturalHeight, k = Math.min(1, max / Math.max(w0, h0));
  if (mime === 'image/png' && k === 1) return null;          // PNG (drawings, transparency): only made smaller in size
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
  const ctx = c.getContext('2d');
  if (mime === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(im, 0, 0, c.width, c.height);
  const out = await new Promise(r => c.toBlob(r, mime, mime === 'image/jpeg' ? q : undefined));
  c.width = c.height = 0;
  if (!out || out.size >= bytes.length * 0.97) return null;
  return { bytes: new Uint8Array(await out.arrayBuffer()), w: Math.round(w0 * k), h: Math.round(h0 * k) };
}

// tries the levels from the best down and keeps the first one that fits; returns the chosen pictures
async function pickLevel(images, otherBytes, onProgress) {
  let best = null;
  for (let li = 0; li < LEVELS.length; li++) {
    const lv = LEVELS[li], out = new Map(); let total = otherBytes;
    for (let i = 0; i < images.length; i++) {
      const im = images[i];
      onProgress?.({ level: li + 1, levels: LEVELS.length, n: i + 1, total: images.length });
      let r = null;
      if (im.bytes.length > SMALL) { try { r = await redraw(im.bytes, im.mime, lv); } catch { r = null; } }
      if (r) out.set(im, r);
      total += r ? r.bytes.length : im.bytes.length;
    }
    best = { level: li, out, size: total };
    if (total <= OPT_TARGET) break;
  }
  return best;
}

// ---- EPUB: the pictures inside the book are replaced, same names, same places
async function optimizeEpub(file, onProgress) {
  await loadScript(VENDOR('jszip.min.js'));
  const zip = await window.JSZip.loadAsync(file);
  const images = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const mime = /\.jpe?g$/i.test(path) ? 'image/jpeg' : /\.png$/i.test(path) ? 'image/png' : null;
    if (!mime) continue;
    images.push({ path, mime, bytes: await entry.async('uint8array') });
  }
  if (!images.length) return null;
  const imgBytes = images.reduce((s, i) => s + i.bytes.length, 0);
  const pick = await pickLevel(images, Math.max(0, file.size - imgBytes), onProgress);
  if (!pick.out.size) return null;
  for (const [im, r] of pick.out) zip.file(im.path, r.bytes, { compression: 'STORE' });
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  onProgress?.({ saving: true });
  // the mimetype file must be the first one in an EPUB
  const names = Object.keys(zip.files); const order = ['mimetype', ...names.filter(n => n !== 'mimetype')];
  const z2 = new window.JSZip();
  for (const n of order) { const e = zip.files[n]; if (e.dir) continue; const isImg = /\.(jpe?g|png|gif|webp)$/i.test(n); z2.file(n, await e.async('uint8array'), { compression: n === 'mimetype' || isImg ? 'STORE' : 'DEFLATE', date: e.date }); }
  const blob = await z2.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compressionOptions: { level: 9 } });
  return { blob, level: pick.level, images: pick.out.size };
}

// ---- PDF: the photos (JPEG pictures) inside the pages are replaced; pages, text and fonts stay exactly the same
async function optimizePdf(file, onProgress) {
  await loadScript(VENDOR('pdf-lib.min.js'));
  const { PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFArray, PDFDict, PDFRef, PDFBool } = window.PDFLib;
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false });
  const N = n => PDFName.of(n), ctx = doc.context;
  const look = v => v instanceof PDFRef ? ctx.lookup(v) : v;
  const images = [];
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const d = obj.dict;
    if (look(d.get(N('Subtype'))) !== N('Image')) continue;
    let f = look(d.get(N('Filter'))); if (f instanceof PDFArray) f = f.size() === 1 ? look(f.get(0)) : null;
    if (f !== N('DCTDecode')) continue;                                   // only photos (JPEG) — safe to redraw
    if (d.get(N('Decode')) || d.get(N('Mask')) || look(d.get(N('ImageMask'))) === PDFBool.True) continue;
    if (Number(look(d.get(N('BitsPerComponent')))?.asNumber?.() ?? 8) !== 8) continue;
    // colours: only RGB / grey (a CMYK print photo would change colour on a screen)
    let cs = look(d.get(N('ColorSpace')));
    if (cs === N('DeviceCMYK')) continue;
    if (cs instanceof PDFArray) {
      const kind = look(cs.get(0));
      if (kind === N('ICCBased')) { const icc = look(cs.get(1)); const n = icc?.dict ? look(icc.dict.get(N('N')))?.asNumber?.() : null; if (n !== 3 && n !== 1) continue; }
      else if (kind !== N('CalRGB') && kind !== N('CalGray')) continue;
    } else if (cs && cs !== N('DeviceRGB') && cs !== N('DeviceGray')) continue;
    images.push({ ref, obj, mime: 'image/jpeg', bytes: obj.contents });
  }
  if (!images.length) return null;
  const imgBytes = images.reduce((s, i) => s + i.bytes.length, 0);
  const pick = await pickLevel(images, Math.max(0, file.size - imgBytes), onProgress);
  if (!pick.out.size) return null;
  for (const [im, r] of pick.out) {
    const d = im.obj.dict;
    d.set(N('Width'), PDFNumber.of(r.w)); d.set(N('Height'), PDFNumber.of(r.h));
    d.set(N('Filter'), N('DCTDecode')); d.delete(N('DecodeParms'));
    d.set(N('Length'), PDFNumber.of(r.bytes.length));
    ctx.assign(im.ref, PDFRawStream.of(d, r.bytes));
  }
  onProgress?.({ saving: true });
  const bytes = await doc.save({ useObjectStreams: true, updateFieldAppearances: false });
  return { blob: new Blob([bytes], { type: 'application/pdf' }), level: pick.level, images: pick.out.size };
}

// file → { file (light), original, from, to, images } or null when nothing needs doing (light already, or no gain)
export async function optimizeBook(file, onProgress) {
  if (!file || file.size <= OPT_FROM) return null;
  const isEpub = /\.epub$/i.test(file.name), isPdf = /\.pdf$/i.test(file.name);
  if (!isEpub && !isPdf) return null;
  const r = isEpub ? await optimizeEpub(file, onProgress) : await optimizePdf(file, onProgress);
  if (!r || r.blob.size >= file.size * 0.95) return null;
  const light = new File([r.blob], file.name, { type: isEpub ? 'application/epub+zip' : 'application/pdf', lastModified: Date.now() });
  light._original = file;
  light.optimizedBook = { from: file.size, to: light.size, images: r.images, reached: light.size <= OPT_TARGET };
  return light;
}
