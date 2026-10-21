// Librava SEO build — runs on GitHub Actions (see .github/workflows/book-pages.yml).
// Writes real, crawlable pages that Google, Bing & co. can index, each with its own content, language,
// structured data (schema.org) and share preview, and that open the store right there:
//   /<lang>/            store home in each of the 24 languages (hreflang cluster)
//   /<lang>/<category>/ every category that has books in that language (like Amazon's browse pages)
//   /book/<id>/         one page per book: title, author, description, price, rating, cover, breadcrumbs
//   /sitemap.xml        every address above, with language alternates;  /robots.txt
// Uses only the PUBLIC Supabase address and key that are already in assets/js/config.js.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync, statSync } from 'node:fs';
import sharp from 'sharp';

const SITE = 'https://librava.store';
const cfg = readFileSync('assets/js/config.js', 'utf8');
const URL_ = /supabaseUrl:\s*'([^']+)'/.exec(cfg)?.[1];
const KEY = /supabaseAnonKey:\s*'([^']+)'/.exec(cfg)?.[1];
if (!URL_ || !KEY) { console.log('No Supabase configured, nothing to do.'); process.exit(0); }

// ---------- translations (24 languages) ----------
const I18N = readFileSync('assets/js/i18n.js', 'utf8');
const LANGS = [...new Set([...I18N.matchAll(/\['([a-z]{2})', '([^']+)'\]/g)].map(m => m[1]))];
const OG = JSON.parse(readFileSync('tools/og-text.json', 'utf8'));
const dicts = {};
for (const l of LANGS) {
  let d = {};
  try { d = (await import(`../assets/js/lang/${l}.js`)).default; } catch {
    const block = I18N.split(`\n  ${l}: {`)[1]?.split('\n  },')[0] || '';
    for (const m of block.matchAll(/'([\w.]+)': '((?:[^'\\]|\\.)*)'/g)) d[m[1]] = m[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  }
  dicts[l] = d;
}
const en = dicts.en;
const tr = (l, k, v = {}) => { let s = dicts[l]?.[k] ?? en[k] ?? k; for (const x in v) s = s.split('{' + x + '}').join(v[x]); return s; };
const CATS = [...readFileSync('assets/js/ui.js', 'utf8').match(/export const CATS = \[([\s\S]*?)\];/)[1].matchAll(/'(\w+)'/g)].map(m => m[1]);
// the same rule as the store (ui.js catSlug): category name in that language, made URL-friendly
export const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' ').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
const catSlug = (l, c) => { const s = slug(tr(l, 'cat.' + c)); return s.length >= 3 ? s : c; };

// ---------- data ----------
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const res = process.env.SEO_TEST_BOOKS ? { ok: true, json: async () => JSON.parse(readFileSync(process.env.SEO_TEST_BOOKS, 'utf8')) } : await fetch(`${URL_}/rest/v1/books?select=id,title,subtitle,author,description,category,categories,language,format,pages,price_cents,list_price_cents,currency,cover_path,isbn,librava_id,published_at,updated_at,rating_avg,rating_count,series_name,contributors,color,rights&status=eq.published&deleted_at=is.null&order=published_at.desc`, { headers: H });
if (!res.ok) { console.error('Supabase error', res.status, await res.text()); process.exit(1); }
const books = await res.json();

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plain = s => String(s || '').replace(/<\s*(br|\/p|\/li|\/h\d)\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*/g, '\n').trim();
const cut = (s, n) => s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s;
const money = (l, c, cur = 'eur') => new Intl.NumberFormat(l === 'no' ? 'nb' : l, { style: 'currency', currency: (cur || 'eur').toUpperCase() }).format(c / 100);
const json = o => JSON.stringify(o).replace(/</g, '\\u003c');

// ---------- the store shell (index.html) with our own head and pre-rendered content ----------
const SHELL = readFileSync('index.html', 'utf8');
function page({ lang, head, body, boot, hash }) {
  const s = SHELL
    .replace(/<html lang="[^"]*">/, `<html lang="${lang}">`)
    .replace(/<!--seo-->[\s\S]*?<!--\/seo-->/, `<!--seo-->\n${head}\n<!--/seo-->`)
    .replace(/<main id="app"([^>]*)><\/main>/, `<main id="app"$1>${body}</main>`)
    .replace('<script type="module"', `<script>document.documentElement.classList.add('js');window.__LIBRAVA_LANG=${json(boot)};${hash ? `if(!location.hash||location.hash==='#')history.replaceState(null,'',location.pathname+location.search+${json(hash)});` : ''}</script>\n<script type="module"`);
  return s;
}
function write(path, html) { mkdirSync(path, { recursive: true }); writeFileSync(`${path}/index.html`, html); }
const og = (url, title, desc, img, w = 1200, h = 630, type = 'website', locale) => `<link rel="canonical" href="${url}">
<meta property="og:type" content="${type}"><meta property="og:site_name" content="Librava"><meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}"><meta property="og:image:width" content="${w}"><meta property="og:image:height" content="${h}">${locale ? `<meta property="og:locale" content="${locale}">` : ''}
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(img)}">`;
const ORG = { '@type': 'Organization', '@id': SITE + '/#org', name: 'Librava', url: SITE + '/', logo: SITE + '/assets/img/icon-512.png' };
const ldScript = graph => `<script type="application/ld+json">${json({ '@context': 'https://schema.org', '@graph': graph })}</script>`;

// ---------- covers: a JPEG copy on librava.store (WhatsApp on iPhone ignores WebP) ----------
const coverOf = {};
for (const b of books) {
  mkdirSync(`book/${b.id}`, { recursive: true });
  const ver = String(Date.parse(b.updated_at || '') || 0);
  let info = null;
  if (b.cover_path) {
    const jpg = `book/${b.id}/cover.jpg`, stamp = `book/${b.id}/.v`;
    try {
      if (!existsSync(jpg) || !existsSync(stamp) || readFileSync(stamp, 'utf8') !== ver) {
        const r = await fetch(`${URL_}/storage/v1/object/public/covers/${b.cover_path.split('/').map(encodeURIComponent).join('/')}`);
        if (!r.ok) throw new Error('cover ' + r.status);
        await sharp(Buffer.from(await r.arrayBuffer())).flatten({ background: '#ffffff' }).resize({ width: 600, height: 960, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(jpg);
        writeFileSync(stamp, ver);
      }
      const m = await sharp(jpg).metadata();
      info = { url: `${SITE}/book/${b.id}/cover.jpg?v=${ver}`, w: m.width, h: m.height };
    } catch (e) { console.error('cover failed for', b.id, e.message); }
  }
  coverOf[b.id] = info;
}
const card = (l, b) => `<li><a href="/book/${b.id}/">${coverOf[b.id] ? `<img src="${esc(coverOf[b.id].url)}" alt="${esc(b.title)}" width="120" loading="lazy">` : ''}<span>${esc(b.title)}</span></a> <small>${esc(b.author)} · ${b.price_cents ? esc(money(l, b.price_cents, b.currency)) : esc(tr(l, 'book.free'))}</small></li>`;
const catsOf = b => [...new Set([b.category, ...(b.categories || [])].filter(c => CATS.includes(c)))];

const urls = []; // for the sitemap
const today = new Date().toISOString().slice(0, 10);

// ---------- /<lang>/ ----------
const catPages = {}; // lang -> [cat]
for (const l of LANGS) catPages[l] = CATS.filter(c => books.some(b => b.language === l && catsOf(b).includes(c)));
for (const l of LANGS) {
  const o = OG[l] || OG.en, mine = books.filter(b => b.language === l), show = (mine.length ? mine : books).slice(0, 24);
  const url = `${SITE}/${l}/`, title = `Librava — ${o.t}`;
  const alts = LANGS.map(x => `<link rel="alternate" hreflang="${x}" href="${SITE}/${x}/">`).join('\n') + `\n<link rel="alternate" hreflang="x-default" href="${SITE}/">`;
  const head = `<title>${esc(title)}</title>\n<meta name="description" content="${esc(o.s)}">\n${og(url, title, o.s, `${SITE}/assets/img/og-${OG[l] ? l : 'en'}.jpg`, 1200, 630, 'website', l)}\n${alts}\n` +
    ldScript([ORG, { '@type': 'WebSite', '@id': SITE + '/#site', url: SITE + '/', name: 'Librava', publisher: { '@id': SITE + '/#org' } },
      { '@type': 'CollectionPage', url, name: title, description: o.s, inLanguage: l, isPartOf: { '@id': SITE + '/#site' } }]);
  const body = `<div class="wrap page seo-pre"><h1>${esc(o.t)}</h1><p>${esc(o.s)}</p>
    ${catPages[l].length ? `<h2>${esc(tr(l, 'home.catCardTitle'))}</h2><ul class="seo-cats">${catPages[l].map(c => `<li><a href="/${l}/${catSlug(l, c)}/">${esc(tr(l, 'cat.' + c))}</a></li>`).join('')}</ul>` : ''}
    <h2>${esc(tr(l, 'home.new'))}</h2><ul class="seo-books">${show.map(b => card(l, b)).join('')}</ul></div>`;
  write(l, page({ lang: l, head, body, boot: { lang: l, force: true } }));
  urls.push({ loc: url, alts: [...LANGS.map(x => [x, `${SITE}/${x}/`]), ['x-default', SITE + '/']], lastmod: today, pri: '1.0' });
}

// ---------- /<lang>/<category>/ ----------
const keepCat = {};
for (const l of LANGS) {
  keepCat[l] = new Set();
  for (const c of catPages[l]) {
    const s = catSlug(l, c); keepCat[l].add(s);
    const list = books.filter(b => b.language === l && catsOf(b).includes(c));
    const name = tr(l, 'cat.' + c), url = `${SITE}/${l}/${s}/`, title = `${name} — eBook · Librava`;
    const desc = cut(`${name}: ${list.slice(0, 6).map(b => b.title).join(', ')}. ${(OG[l] || OG.en).s}`, 160);
    const alts = LANGS.filter(x => catPages[x].includes(c)).map(x => `<link rel="alternate" hreflang="${x}" href="${SITE}/${x}/${catSlug(x, c)}/">`).join('\n');
    const first = list.find(b => coverOf[b.id]);
    const head = `<title>${esc(title)}</title>\n<meta name="description" content="${esc(desc)}">\n${og(url, title, desc, first ? coverOf[first.id].url : `${SITE}/assets/img/og-${OG[l] ? l : 'en'}.jpg`, first ? coverOf[first.id].w : 1200, first ? coverOf[first.id].h : 630, 'website', l)}\n${alts}\n` +
      ldScript([ORG,
        { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Librava', item: `${SITE}/${l}/` }, { '@type': 'ListItem', position: 2, name, item: url }] },
        { '@type': 'CollectionPage', url, name: title, inLanguage: l, mainEntity: { '@type': 'ItemList', numberOfItems: list.length, itemListElement: list.slice(0, 50).map((b, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/book/${b.id}/`, name: b.title })) } }]);
    const body = `<div class="wrap page seo-pre"><nav class="crumbs"><a href="/${l}/">Librava</a> › ${esc(name)}</nav><h1>${esc(name)}</h1><p>${esc(tr(l, 'search.inCat', { n: list.length, cat: name }).replace(/<[^>]*>/g, ''))}</p><ul class="seo-books">${list.map(b => card(l, b)).join('')}</ul></div>`;
    write(`${l}/${s}`, page({ lang: l, head, body, boot: { lang: l, force: true }, hash: `#/search?cat=${c}` }));
    urls.push({ loc: url, alts: LANGS.filter(x => catPages[x].includes(c)).map(x => [x, `${SITE}/${x}/${catSlug(x, c)}/`]), lastmod: (list[0]?.updated_at || today).slice(0, 10), pri: '0.8' });
  }
  // categories that no longer have books in this language lose their page
  if (existsSync(l)) for (const d of readdirSync(l)) if (statSync(`${l}/${d}`).isDirectory() && !keepCat[l].has(d)) rmSync(`${l}/${d}`, { recursive: true, force: true });
}

// ---------- /book/<id>/ ----------
const keep = new Set();
for (const b of books) {
  keep.add(b.id);
  const l = LANGS.includes(b.language) ? b.language : 'en';
  const url = `${SITE}/book/${b.id}/`, cv = coverOf[b.id];
  const descFull = plain(b.description), desc = cut(descFull.replace(/\n/g, ' '), 160);
  const price = b.price_cents ? money(l, b.price_cents, b.currency) : tr(l, 'book.free');
  const title = `${b.title}${b.subtitle ? ': ' + b.subtitle : ''}`;
  const pageTitle = cut(`${title} — ${b.author}`, 70) + ' | Librava';
  const cats = catsOf(b), cat = cats[0];
  const ld = { '@type': ['Book', 'Product'], '@id': url + '#book', name: b.title, alternativeName: b.subtitle || undefined, url, description: cut(descFull, 5000),
    image: cv ? [cv.url] : undefined, author: { '@type': 'Person', name: b.author }, inLanguage: b.language, bookFormat: 'https://schema.org/EBook',
    isbn: b.isbn || undefined, numberOfPages: b.pages || undefined, datePublished: b.published_at ? String(b.published_at).slice(0, 10) : undefined,
    publisher: { '@id': SITE + '/#org' },
    ...(b.rights === 'public' ? { copyrightNotice: 'Public domain text' } : { copyrightHolder: { '@id': SITE + '/#org' }, copyrightYear: new Date(b.published_at || Date.now()).getFullYear(), copyrightNotice: `© ${new Date(b.published_at || Date.now()).getFullYear()} Librava (librava.store). All rights reserved.` }),
    brand: { '@type': 'Brand', name: 'Librava' }, sku: b.librava_id || b.id, genre: cat ? tr(l, 'cat.' + cat) : undefined,
    offers: { '@type': 'Offer', url, price: (b.price_cents / 100).toFixed(2), priceCurrency: (b.currency || 'eur').toUpperCase(), availability: 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition', seller: { '@id': SITE + '/#org' } },
    aggregateRating: b.rating_count ? { '@type': 'AggregateRating', ratingValue: (+b.rating_avg).toFixed(1), reviewCount: b.rating_count, bestRating: 5, worstRating: 1 } : undefined };
  const crumbs = { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Librava', item: `${SITE}/${l}/` },
    ...(cat ? [{ '@type': 'ListItem', position: 2, name: tr(l, 'cat.' + cat), item: `${SITE}/${l}/${catSlug(l, cat)}/` }] : []),
    { '@type': 'ListItem', position: cat ? 3 : 2, name: b.title, item: url }] };
  const head = `<title>${esc(pageTitle)}</title>\n<meta name="description" content="${esc(desc)}">\n<meta name="author" content="${esc(b.author)}">\n` +
    og(url, `${title} · ${price}`, `${b.author} · ${desc}`, cv ? cv.url : `${SITE}/assets/img/og-en.jpg`, cv ? cv.w : 1200, cv ? cv.h : 630, 'book', b.language) +
    `\n<meta property="product:price:amount" content="${(b.price_cents / 100).toFixed(2)}"><meta property="product:price:currency" content="${esc((b.currency || 'eur').toUpperCase())}">\n` + ldScript([ORG, ld, crumbs]);
  const related = books.filter(x => x.id !== b.id && x.language === b.language && catsOf(x).some(c => cats.includes(c))).slice(0, 8);
  const body = `<div class="wrap page seo-pre"><nav class="crumbs"><a href="/${l}/">Librava</a>${cat ? ` › <a href="/${l}/${catSlug(l, cat)}/">${esc(tr(l, 'cat.' + cat))}</a>` : ''}</nav>
    <article class="seo-book">${cv ? `<img src="${esc(cv.url)}" alt="${esc(b.title)}" width="${cv.w}" height="${cv.h}">` : ''}<div><h1>${esc(b.title)}</h1>${b.subtitle ? `<p class="subtitle">${esc(b.subtitle)}</p>` : ''}
    <p>${esc(tr(l, 'book.by', { author: b.author }).replace(/<[^>]*>/g, ''))}</p><p><b>${esc(price)}</b> · ${esc(tr(l, 'book.format.' + (b.format === 'epub' ? 'epub' : 'pdf')))}</p>
    ${descFull.split('\n').filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('')}</div></article>
    ${related.length ? `<h2>${esc(tr(l, 'book.related'))}</h2><ul class="seo-books">${related.map(x => card(l, x)).join('')}</ul>` : ''}</div>`;
  write(`book/${b.id}`, page({ lang: l, head, body, boot: { lang: l }, hash: `#/book/${b.id}` }));
  urls.push({ loc: url, lastmod: String(b.updated_at || today).slice(0, 10), pri: '0.9', img: cv?.url, imgTitle: b.title });
}
if (existsSync('book')) for (const d of readdirSync('book')) if (!keep.has(d)) rmSync(`book/${d}`, { recursive: true, force: true });

// ---------- sitemap + robots ----------
const x = s => esc(s);
const sm = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
<url><loc>${SITE}/</loc><lastmod>${today}</lastmod><priority>1.0</priority>${LANGS.map(l => `<xhtml:link rel="alternate" hreflang="${l}" href="${SITE}/${l}/"/>`).join('')}<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/></url>
${urls.map(u => `<url><loc>${x(u.loc)}</loc><lastmod>${u.lastmod}</lastmod><priority>${u.pri}</priority>${(u.alts || []).map(([h, href]) => `<xhtml:link rel="alternate" hreflang="${h}" href="${x(href)}"/>`).join('')}${u.img ? `<image:image><image:loc>${x(u.img)}</image:loc><image:title>${x(u.imgTitle)}</image:title></image:image>` : ''}</url>`).join('\n')}
</urlset>
`;
writeFileSync('sitemap.xml', sm);
writeFileSync('robots.txt', `User-agent: *
Allow: /
Disallow: /api/
Disallow: /server/
Disallow: /demo/
Disallow: /supabase/
Disallow: /tools/

Sitemap: ${SITE}/sitemap.xml
`);
console.log(`SEO pages: ${LANGS.length} languages, ${Object.values(keepCat).reduce((a, s) => a + s.size, 0)} category pages, ${books.length} books, ${urls.length + 1} sitemap URLs`);
