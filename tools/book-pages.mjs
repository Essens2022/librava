// Creates a small page for every published book at /book/<id>/ so that links shared on
// WhatsApp, Facebook, Telegram… show the book's cover, title and price instead of the site logo.
// The page immediately opens the book inside the store. Runs on GitHub Actions (see .github/workflows).
// Uses only the PUBLIC Supabase address and public key that are already in assets/js/config.js.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import sharp from 'sharp';

const cfg = readFileSync('assets/js/config.js', 'utf8');
const URL_ = /supabaseUrl:\s*'([^']+)'/.exec(cfg)?.[1];
const KEY = /supabaseAnonKey:\s*'([^']+)'/.exec(cfg)?.[1];
const SITE = 'https://librava.store';
if (!URL_ || !KEY) { console.log('No Supabase configured, nothing to do.'); process.exit(0); }

const res = await fetch(`${URL_}/rest/v1/books?select=id,title,subtitle,author,description,cover_path,price_cents,currency,language,updated_at&status=eq.published&deleted_at=is.null`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
if (!res.ok) { console.error('Supabase error', res.status, await res.text()); process.exit(1); }
const books = await res.json();

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plain = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const money = (c, cur = 'eur') => c ? (c / 100).toFixed(2).replace('.', ',') + ' ' + (cur || 'eur').toUpperCase() : '';

const keep = new Set();
for (const b of books) {
  keep.add(b.id);
  // WhatsApp (especially on iPhone) does not show WebP previews: every cover gets a JPEG copy on librava.store itself
  mkdirSync(`book/${b.id}`, { recursive: true });
  const ver = String(Date.parse(b.updated_at || '') || 0);
  let cover = `${SITE}/assets/img/og.png`, cw = 1200, ch = 630;
  if (b.cover_path) {
    const jpg = `book/${b.id}/cover.jpg`, stampFile = `book/${b.id}/.v`;
    try {
      if (!existsSync(jpg) || !existsSync(stampFile) || readFileSync(stampFile, 'utf8') !== ver) {
        const r = await fetch(`${URL_}/storage/v1/object/public/covers/${b.cover_path.split('/').map(encodeURIComponent).join('/')}`);
        if (!r.ok) throw new Error('cover ' + r.status);
        await sharp(Buffer.from(await r.arrayBuffer())).flatten({ background: '#ffffff' }).resize({ width: 600, height: 960, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(jpg);
        writeFileSync(stampFile, ver);
      }
      const m = await sharp(jpg).metadata(); cw = m.width; ch = m.height;
      cover = `${SITE}/book/${b.id}/cover.jpg?v=${ver}`;
    } catch (e) { console.error('cover failed for', b.id, e.message); }
  }
  const desc = plain(b.description).slice(0, 190) + (plain(b.description).length > 190 ? '…' : '');
  const price = b.price_cents ? money(b.price_cents, b.currency) : '';
  const title = `${b.title}${b.subtitle ? ' — ' + b.subtitle : ''}`;
  const html = `<!doctype html>
<html lang="${esc(b.language || 'en')}"><head><meta charset="utf-8">
<title>${esc(title)} · Librava</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}/book/${b.id}/">
<meta property="og:type" content="book">
<meta property="og:site_name" content="Librava">
<meta property="og:url" content="${SITE}/book/${b.id}/">
<meta property="og:title" content="${esc(title)}${price ? ' · ' + esc(price) : ''}">
<meta property="og:description" content="${esc(b.author ? b.author + ' · ' : '')}${esc(desc)}">
<meta property="og:image" content="${esc(cover)}">
<meta property="og:image:secure_url" content="${esc(cover)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="${cw}">
<meta property="og:image:height" content="${ch}">
<meta property="og:image:alt" content="${esc(b.title)}">
${price ? `<meta property="product:price:amount" content="${(b.price_cents / 100).toFixed(2)}"><meta property="product:price:currency" content="${esc((b.currency || 'eur').toUpperCase())}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:image" content="${esc(cover)}">
<meta name="theme-color" content="#1C2B2D">
<script>location.replace('/#/book/${b.id}');</script>
</head><body style="font-family:sans-serif;background:#EDF0E9;text-align:center;padding:40px 16px">
<p><a href="/#/book/${b.id}">${esc(b.title)} — Librava</a></p>
</body></html>
`;
  writeFileSync(`book/${b.id}/index.html`, html);
}
// books that were unpublished or deleted lose their page
if (existsSync('book')) for (const d of readdirSync('book')) if (!keep.has(d)) rmSync(`book/${d}`, { recursive: true, force: true });
console.log(`Book pages: ${books.length}`);
