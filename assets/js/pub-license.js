// Publisher packages: at download time the licence inside the ZIP is replaced with one made out to the buyer
// (name, email, order number, date). The PDF is built in the browser with pdf-lib.
import { loadScript } from './util.js?v=20261128144123';

const VENDOR = f => new URL('../vendor/' + f + '?v=1', import.meta.url).href;
const ascii = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '').trim();

const SECTIONS = [
  ['1. Grant of rights',
    'From the moment of purchase the seller grants the buyer named above an exclusive, worldwide, perpetual and irrevocable licence to publish and sell the book contained in this package under the buyer\'s own name, pen name or brand, in print and as digital downloads, on any platform or shop (including Amazon KDP and Etsy). The buyer may edit, translate and adapt the content, change the title, cover and texts, and register the book under the buyer\'s own ISBN and copyright notice.'],
  ['2. Exclusivity',
    'The package is sold to one buyer only. After this purchase it is removed from the store. The seller will not sell, license, publish or give this package, or its content, to anyone else, and keeps no right to use it for resale.'],
  ['3. Original content',
    'The seller confirms that the content of this package was created for it, and that the seller has the right to grant this licence.'],
  ['4. What the buyer may not do',
    'The buyer may not resell, share or give away the package files as a template, a stock pack or private label rights (PLR), and may not claim that the seller endorses the buyer\'s book. The buyer may pass these rights to a third party only as a whole, together with this licence.'],
  ['5. Platform rules, no guarantee of sales',
    'The buyer is responsible for following the current rules and content guidelines of each platform where the book is published, including any disclosure rules the platform requires. The seller does not guarantee that a platform will accept the book, nor any income, ranking or sales.'],
  ['6. Refunds',
    'This is a digital product delivered immediately. By completing the purchase the buyer agreed to immediate delivery and to the loss of the 14-day withdrawal right, as shown at checkout.'],
];

function wrap(font, text, size, maxW) {
  const out = []; let line = '';
  for (const w of text.split(/\s+/)) {
    const t = line ? line + ' ' + w : w;
    if (font.widthOfTextAtSize(t, size) > maxW && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

export async function buildLicensePdf({ title, name, email, ref, date }) {
  await loadScript(VENDOR('pdf-lib.min.js'));
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const doc = await PDFDocument.create();
  doc.setTitle('Publishing Licence and Rights Transfer'); doc.setProducer('Librava');
  const reg = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 64, maxW = W - 2 * M;
  let page = doc.addPage([W, H]), y = H - M;
  const ink = rgb(.1, .1, .1), grey = rgb(.38, .38, .38);
  const need = h => { if (y - h < M) { page = doc.addPage([W, H]); y = H - M; } };
  const para = (text, size, f, color, gap) => { for (const l of wrap(f, text, size, maxW)) { need(size + 4); page.drawText(l, { x: M, y: y - size, size, font: f, color }); y -= size + 4; } y -= gap; };

  para('Publishing Licence and Rights Transfer', 21, bold, ink, 8);
  para('Package: ' + ascii(title), 11.5, reg, grey, 14);

  // the buyer's box
  const rows = [['Licensed to', ascii(name) || ascii(email)], ['Email', ascii(email)], ['Licence / order no.', ascii(ref) || '-'], ['Date', date]];
  const boxH = rows.length * 19 + 16; need(boxH + 10);
  page.drawRectangle({ x: M, y: y - boxH, width: maxW, height: boxH, borderColor: rgb(.15, .15, .15), borderWidth: 1.2, color: rgb(.97, .97, .97) });
  let ry = y - 20;
  for (const [k, v] of rows) { page.drawText(k, { x: M + 12, y: ry, size: 9.5, font: reg, color: grey }); page.drawText(v.slice(0, 70), { x: M + 140, y: ry, size: 11, font: bold, color: ink }); ry -= 19; }
  y -= boxH + 20;

  for (const [h, t] of SECTIONS) { need(40); para(h, 12, bold, ink, 2); para(t, 10.5, reg, ink, 10); }

  need(60);
  page.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: .6, color: grey }); y -= 16;
  para('Keep this document together with your purchase confirmation as proof of your rights. Issued by Librava (librava.store).', 9.5, reg, grey, 0);
  return await doc.save();
}

// returns a new zip Blob whose licence file is the personalised one (the original blob when anything fails)
export async function personalisePackage(blob, book, user, ref) {
  try {
    await loadScript(VENDOR('jszip.min.js'));
    const zip = await window.JSZip.loadAsync(blob);
    const date = new Date().toISOString().slice(0, 10);
    const pdf = await buildLicensePdf({ title: book.title, name: user.name, email: user.email, ref, date });
    const old = Object.keys(zip.files).filter(n => !zip.files[n].dir && /(^|\/)05_Licen[cs]e\/[^/]+$/i.test(n));
    old.forEach(n => zip.remove(n));
    zip.file('05_License/Publishing_Licence_and_Rights.pdf', pdf);
    return await zip.generateAsync({ type: 'blob', mimeType: 'application/zip', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  } catch (e) { console.warn('licence personalisation skipped', e); return blob; }
}
