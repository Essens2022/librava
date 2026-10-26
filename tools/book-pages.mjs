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
// all published books, read in pages of 1000 (the database never returns more than 1000 rows at once)
async function readBooks() {
  if (process.env.SEO_TEST_BOOKS) return JSON.parse(readFileSync(process.env.SEO_TEST_BOOKS, 'utf8'));
  const q = `${URL_}/rest/v1/books?select=id,title,subtitle,author,description,category,categories,language,format,pages,price_cents,list_price_cents,currency,cover_path,isbn,librava_id,published_at,updated_at,rating_avg,rating_count,series_name,contributors,color,rights,work_id&status=eq.published&deleted_at=is.null&order=published_at.desc,id.asc`;
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(q, { headers: { ...H, Range: `${from}-${from + 999}`, 'Range-Unit': 'items' } });
    if (!r.ok && r.status !== 206) { console.error('Supabase error', r.status, await r.text()); process.exit(1); }
    const page = await r.json(); out.push(...page);
    if (page.length < 1000) return out;
  }
}
const books = await readBooks();

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
    .replace(/<link rel="manifest" href="[^"]*">/, `<link rel="manifest" href="/assets/manifest/${lang}.webmanifest">`)
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
// Digital delivery: free and instant everywhere; EU withdrawal right lost once delivered (consent at checkout).
const COUNTRIES = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','GB','CH','NO','IS','US','CA','AU','NZ','MD','UA'];
const RETURN_POLICY = { '@type': 'MerchantReturnPolicy', applicableCountry: COUNTRIES, returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted', merchantReturnLink: SITE + '/#/legal/withdrawal' };
const shipping = cur => ({ '@type': 'OfferShippingDetails', shippingRate: { '@type': 'MonetaryAmount', value: 0, currency: cur },
  shippingDestination: { '@type': 'DefinedRegion', addressCountry: COUNTRIES },
  deliveryTime: { '@type': 'ShippingDeliveryTime', handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 0, unitCode: 'DAY' }, transitTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 0, unitCode: 'DAY' } } });
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
const mainEd = b => { const e = books.filter(x => (x.work_id || x.id) === (b.work_id || b.id)); return e.find(x => x.id === (b.work_id || b.id)) || e.find(x => x.format === 'pdf') || e[0]; };
const card = (l, b) => `<li><a href="/book/${b.id}/">${coverOf[b.id] ? `<img src="${esc(coverOf[b.id].url)}" alt="${esc(b.title)}" width="120" loading="lazy">` : ''}<span>${esc(b.title)}</span></a> <small>${esc(b.author)} · ${b.price_cents ? esc(money(l, b.price_cents, b.currency)) : esc(tr(l, 'book.free'))}</small></li>`;
const mains = books.filter(b => mainEd(b).id === b.id); // one entry per title in lists
const catsOf = b => [...new Set([b.category, ...(b.categories || [])].filter(c => CATS.includes(c)))];

const urls = []; // for the sitemap
const today = new Date().toISOString().slice(0, 10);

// ---------- /<lang>/ ----------
const catPages = {}; // lang -> [cat]
for (const l of LANGS) catPages[l] = CATS.filter(c => books.some(b => b.language === l && catsOf(b).includes(c)));
for (const l of LANGS) {
  const o = OG[l] || OG.en, mine = mains.filter(b => b.language === l), show = (mine.length ? mine : mains).slice(0, 24);
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
    const list = mains.filter(b => b.language === l && catsOf(b).includes(c));
    const name = tr(l, 'cat.' + c), url = `${SITE}/${l}/${s}/`, title = `${name} — eBook · Librava`;
    const desc = cut(`${name}: ${list.slice(0, 6).map(b => b.title).join(', ')}. ${(OG[l] || OG.en).s}`, 160);
    const alts = LANGS.filter(x => catPages[x].includes(c)).map(x => `<link rel="alternate" hreflang="${x}" href="${SITE}/${x}/${catSlug(x, c)}/">`).join('\n');
    const first = list.find(b => coverOf[b.id]);
    const head = `<title>${esc(title)}</title>\n<meta name="description" content="${esc(desc)}">\n${og(url, title, desc, first ? coverOf[first.id].url : `${SITE}/assets/img/og-${OG[l] ? l : 'en'}.jpg`, first ? coverOf[first.id].w : 1200, first ? coverOf[first.id].h : 630, 'website', l)}\n${alts}\n` +
      ldScript([ORG,
        { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Librava', item: `${SITE}/${l}/` }, { '@type': 'ListItem', position: 2, name, item: url }] },
        { '@type': 'CollectionPage', url, name: title, inLanguage: l, mainEntity: { '@type': 'ItemList', numberOfItems: list.length, itemListElement: list.slice(0, 50).map((b, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/book/${b.id}/`, name: b.title })) } }]);
    const body = `<div class="wrap page seo-pre"><nav class="crumbs"><a href="/${l}/">Librava</a> › ${esc(name)}</nav><h1>${esc(name)}</h1><p>${esc(tr(l, 'search.inCat', { n: list.length, cat: name }).replace(/<[^>]*>/g, ''))}</p><ul class="seo-books">${list.slice(0, 200).map(b => card(l, b)).join('')}</ul></div>`;   // big categories: the first 200 here, every book is in the sitemap
    write(`${l}/${s}`, page({ lang: l, head, body, boot: { lang: l, force: true }, hash: `#/search?cat=${c}` }));
    urls.push({ loc: url, alts: LANGS.filter(x => catPages[x].includes(c)).map(x => [x, `${SITE}/${x}/${catSlug(x, c)}/`]), lastmod: (list[0]?.updated_at || today).slice(0, 10), pri: '0.8' });
  }
  // categories that no longer have books in this language lose their page
  if (existsSync(l)) for (const d of readdirSync(l)) if (statSync(`${l}/${d}`).isDirectory() && !keepCat[l].has(d) && d !== 'guide') rmSync(`${l}/${d}`, { recursive: true, force: true });
}

// ---------- guides (read first: book pages link to them) ----------
const GUIDE_WORD = { en: 'Guides', fr: 'Guides', de: 'Ratgeber', es: 'Guías', it: 'Guide', pt: 'Guias', nl: 'Gidsen', pl: 'Poradniki', ro: 'Ghiduri' };
const GUIDE_UI = {
  en: { k: 'The book behind this guide', get: 'See the book', upd: 'Updated', toc: 'In this guide', faq: 'Frequently asked questions', rel: 'More free guides', all: 'All free guides', lead: 'Free, practical guides written from our books. Read them here, then go deeper with the full book.', by: 'By the Librava editors' },
};
const gu = (l, k) => (GUIDE_UI[l] || GUIDE_UI.en)[k];
const guides = [];
if (existsSync('content/guides')) for (const l of readdirSync('content/guides')) {
  if (!LANGS.includes(l) || !statSync(`content/guides/${l}`).isDirectory()) continue;
  for (const f of readdirSync(`content/guides/${l}`).filter(f => f.endsWith('.json'))) {
    try { const g = JSON.parse(readFileSync(`content/guides/${l}/${f}`, 'utf8')); g.lang = l; g.slug ||= f.replace(/\.json$/, ''); guides.push(g); }
    catch (e) { console.error('guide skipped', l, f, e.message); }
  }
}
const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
for (const g of guides) g.book = mains.find(b => norm(b.title) === norm(g.book_title)) || null;
// ---------- /book/<id>/ ----------
// One title = one indexable page. A title sold as PDF and EPUB has one page per edition (the store links to both),
// but only the main edition (PDF, else the first) is canonical and in the sitemap; it lists every format and price.
// Before: Google saw the two edition pages as duplicates and dropped them ("duplicate, Google chose different canonical").
const editionsOf = {}; for (const b of books) (editionsOf[b.work_id || b.id] ||= []).push(b);
const mainOf = w => { const e = editionsOf[w]; return e.find(x => x.id === w) || e.find(x => x.format === 'pdf') || e[0]; };
const keep = new Set();
for (const b of books) {
  keep.add(b.id);
  const eds = editionsOf[b.work_id || b.id], main = mainOf(b.work_id || b.id), isMain = main.id === b.id;
  const mainUrl = `${SITE}/book/${main.id}/`;
  const l = LANGS.includes(b.language) ? b.language : 'en';
  const url = `${SITE}/book/${b.id}/`, cv = coverOf[b.id];
  const descFull = plain(b.description), desc = cut(descFull.replace(/\n/g, ' '), 160);
  const price = b.price_cents ? money(l, b.price_cents, b.currency) : tr(l, 'book.free');
  const title = `${b.title}${b.subtitle ? ': ' + b.subtitle : ''}`;
  const pageTitle = cut(title, 62) + ' | Librava';
  const fmtName = x => tr(l, 'book.format.' + (x.format === 'epub' ? 'epub' : 'pdf'));
  const offerOf = x => ({ '@type': 'Offer', url: `${SITE}/book/${x.id}/`, name: fmtName(x), price: (x.price_cents / 100).toFixed(2), priceCurrency: (x.currency || 'eur').toUpperCase(), availability: 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition', seller: { '@id': SITE + '/#org' },
      hasMerchantReturnPolicy: RETURN_POLICY, shippingDetails: shipping((x.currency || 'eur').toUpperCase()) });
  const cats = catsOf(b), cat = cats[0];
  const ld = { '@type': ['Book', 'Product'], '@id': mainUrl + '#book', name: b.title, alternativeName: b.subtitle || undefined, url: mainUrl, description: cut(descFull, 5000),
    image: cv ? [cv.url] : undefined, author: { '@type': 'Person', name: b.author }, inLanguage: b.language, bookFormat: 'https://schema.org/EBook',
    isbn: b.isbn || undefined, numberOfPages: b.pages || undefined, datePublished: b.published_at ? String(b.published_at).slice(0, 10) : undefined,
    publisher: { '@id': SITE + '/#org' },
    ...(b.rights === 'public' ? { copyrightNotice: 'Public domain text' } : { copyrightHolder: { '@id': SITE + '/#org' }, copyrightYear: new Date(b.published_at || Date.now()).getFullYear(), copyrightNotice: `© ${new Date(b.published_at || Date.now()).getFullYear()} Librava (librava.store). All rights reserved.` }),
    brand: { '@type': 'Brand', name: 'Librava' }, sku: b.librava_id || b.id, genre: cat ? tr(l, 'cat.' + cat) : undefined,
    offers: eds.length > 1 ? eds.map(offerOf) : offerOf(b),
    aggregateRating: b.rating_count ? { '@type': 'AggregateRating', ratingValue: (+b.rating_avg).toFixed(1), reviewCount: b.rating_count, bestRating: 5, worstRating: 1 } : undefined };
  const crumbs = { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Librava', item: `${SITE}/${l}/` },
    ...(cat ? [{ '@type': 'ListItem', position: 2, name: tr(l, 'cat.' + cat), item: `${SITE}/${l}/${catSlug(l, cat)}/` }] : []),
    { '@type': 'ListItem', position: cat ? 3 : 2, name: b.title, item: url }] };
  const head = `<title>${esc(pageTitle)}</title>\n<meta name="description" content="${esc(desc)}">\n<meta name="author" content="${esc(b.author)}">\n` +
    og(mainUrl, `${title} · ${price}`, `${b.author} · ${desc}`, cv ? cv.url : `${SITE}/assets/img/og-en.jpg`, cv ? cv.w : 1200, cv ? cv.h : 630, 'book', b.language) +
    `\n<meta property="product:price:amount" content="${(b.price_cents / 100).toFixed(2)}"><meta property="product:price:currency" content="${esc((b.currency || 'eur').toUpperCase())}">\n` + ldScript([ORG, ld, crumbs]);
  const related = books.filter(x => (x.work_id || x.id) !== (b.work_id || b.id) && mainOf(x.work_id || x.id).id === x.id && x.language === b.language && catsOf(x).some(c => cats.includes(c))).slice(0, 8);
  const body = `<div class="wrap page seo-pre"><nav class="crumbs"><a href="/${l}/">Librava</a>${cat ? ` › <a href="/${l}/${catSlug(l, cat)}/">${esc(tr(l, 'cat.' + cat))}</a>` : ''}</nav>
    <article class="seo-book">${cv ? `<img src="${esc(cv.url)}" alt="${esc(b.title)}" width="${cv.w}" height="${cv.h}">` : ''}<div><h1>${esc(b.title)}</h1>${b.subtitle ? `<p class="subtitle">${esc(b.subtitle)}</p>` : ''}
    <p>${esc(tr(l, 'book.by', { author: b.author }).replace(/<[^>]*>/g, ''))}</p><p>${eds.map(x => `<a href="/book/${x.id}/"><b>${esc(x.price_cents ? money(l, x.price_cents, x.currency) : tr(l, 'book.free'))}</b> · ${esc(fmtName(x))}</a>`).join(' &nbsp;|&nbsp; ')}</p>
    ${descFull.split('\n').filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('')}</div></article>
    ${guides.filter(g => g.book && (g.book.work_id || g.book.id) === (b.work_id || b.id)).map(g => `<p><a href="/${g.lang}/guide/${esc(g.slug)}/">${esc(g.title)}</a></p>`).join('')}
    ${related.length ? `<h2>${esc(tr(l, 'book.related'))}</h2><ul class="seo-books">${related.map(x => card(l, x)).join('')}</ul>` : ''}</div>`;
  write(`book/${b.id}`, page({ lang: l, head, body, boot: { lang: l }, hash: `#/book/${b.id}` }));
  if (isMain) urls.push({ loc: url, lastmod: String(eds.map(x => x.updated_at || today).sort().pop()).slice(0, 10), pri: '0.9', img: cv?.url, imgTitle: b.title });
}
if (existsSync('book')) for (const d of readdirSync('book')) if (!keep.has(d)) rmSync(`book/${d}`, { recursive: true, force: true });

// ---------- free guides: /<lang>/guide/<slug>/ and /<lang>/guide/ ----------
// Long, genuinely useful answers to what people type into Google ("how to pay off debt on any income"),
// each written from one of our books and pointing to it. Sources: content/guides/<lang>/<slug>.json
const guideUrl = g => `${SITE}/${g.lang}/guide/${g.slug}/`;
const keepGuide = {};
for (const g of guides) {
  const l = g.lang, url = guideUrl(g), b = g.book, cv = b && coverOf[b.id];
  (keepGuide[l] ||= new Set()).add(g.slug);
  const secs = g.sections || [];
  const sameCat = guides.filter(x => x !== g && x.lang === l && x.book && b && catsOf(x.book).some(c => catsOf(b).includes(c)));
  const rel = [...sameCat, ...guides.filter(x => x !== g && x.lang === l && !sameCat.includes(x))].slice(0, 6);
  const bookBox = b ? `<aside class="g-book">${cv ? `<a href="/book/${b.id}/"><img src="${esc(cv.url)}" alt="${esc(b.title)}" width="110" loading="lazy"></a>` : '<span></span>'}<div><div class="g-k">${esc(gu(l, 'k'))}</div><div class="g-t">${esc(b.title)}</div><p>${esc(cut(b.subtitle || '', 170))}</p><a class="g-btn" href="/book/${b.id}/">${esc(gu(l, 'get'))} →</a></div></aside>` : '';
  const body = `<article class="seo-guide" data-guide-path="/${l}/guide/${esc(g.slug)}/" data-guide-lang="${l}">
<nav class="crumbs"><a href="/${l}/">Librava</a> › <a href="/${l}/guide/">${esc(GUIDE_WORD[l] || GUIDE_WORD.en)}</a></nav>
<h1>${esc(g.title)}</h1>
<div class="g-meta">${esc(gu(l, 'by'))} · ${esc(gu(l, 'upd'))} ${esc(g.date || today)}</div>
<div class="g-lead">${g.intro || ''}</div>
${secs.length > 2 ? `<nav class="g-toc"><b>${esc(gu(l, 'toc'))}</b><ol>${secs.map((x, i) => `<li><a href="#s${i + 1}">${esc(x.h2)}</a></li>`).join('')}</ol></nav>` : ''}
${secs.map((x, i) => `<section><h2 id="s${i + 1}">${esc(x.h2)}</h2>${x.html || ''}</section>${i === 1 ? bookBox : ''}`).join('\n')}
${secs.length <= 1 ? bookBox : ''}
${(g.faq || []).length ? `<section class="g-faq"><h2 id="faq">${esc(gu(l, 'faq'))}</h2>${g.faq.map(f => `<details open><summary>${esc(f.q)}</summary><div>${f.a}</div></details>`).join('')}</section>` : ''}
${g.outro || ''}
${bookBox}
${rel.length ? `<h2>${esc(gu(l, 'rel'))}</h2><ul class="g-rel">${rel.map(x => `<li><a href="/${l}/guide/${esc(x.slug)}/">${esc(x.title)}</a></li>`).join('')}</ul>` : ''}
<p><a href="/${l}/guide/">${esc(gu(l, 'all'))} →</a></p>
</article>`;
  const desc = cut(g.description || plain(g.intro), 160);
  const img = cv ? cv.url : `${SITE}/assets/img/og-en.jpg`;
  const ld = [ORG,
    { '@type': 'Article', '@id': url + '#article', headline: cut(g.title, 110), description: desc, url, mainEntityOfPage: url, inLanguage: l, image: [img],
      datePublished: g.date || today, dateModified: g.updated || g.date || today, author: { '@type': 'Organization', name: 'Librava', url: SITE + '/' }, publisher: { '@id': SITE + '/#org' },
      keywords: (g.keywords || []).join(', ') || undefined, about: b ? { '@id': `${SITE}/book/${b.id}/#book` } : undefined },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Librava', item: `${SITE}/${l}/` }, { '@type': 'ListItem', position: 2, name: GUIDE_WORD[l] || GUIDE_WORD.en, item: `${SITE}/${l}/guide/` }, { '@type': 'ListItem', position: 3, name: g.title, item: url }] },
    ...((g.faq || []).length ? [{ '@type': 'FAQPage', mainEntity: g.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: plain(f.a) } })) }] : [])];
  const head = `<title>${esc(cut(g.seo_title || g.title, 62))}</title>\n<meta name="description" content="${esc(desc)}">\n${og(url, g.title, desc, img, cv ? cv.w : 1200, cv ? cv.h : 630, 'article', l)}\n` + ldScript(ld);
  write(`${l}/guide/${g.slug}`, page({ lang: l, head, body, boot: { lang: l, force: true }, hash: `#/guide/${g.slug}` }));
  urls.push({ loc: url, lastmod: String(g.updated || g.date || today).slice(0, 10), pri: '0.8', img: cv?.url, imgTitle: g.title });
}
for (const l of Object.keys(keepGuide)) {
  const list = guides.filter(g => g.lang === l).sort((a, b) => a.title.localeCompare(b.title));
  const url = `${SITE}/${l}/guide/`, name = `${GUIDE_WORD[l] || GUIDE_WORD.en} · Librava`;
  const body = `<article class="seo-guide" data-guide-path="/${l}/guide/" data-guide-lang="${l}"><nav class="crumbs"><a href="/${l}/">Librava</a></nav><h1>${esc(GUIDE_WORD[l] || GUIDE_WORD.en)}</h1><p class="g-lead">${esc(gu(l, 'lead'))}</p>
<ul class="g-list">${list.map(g => `<li><a href="/${l}/guide/${esc(g.slug)}/">${esc(g.title)}</a><p>${esc(cut(g.description || '', 170))}</p></li>`).join('')}</ul></article>`;
  const head = `<title>${esc(name)}</title>\n<meta name="description" content="${esc(gu(l, 'lead'))}">\n${og(url, name, gu(l, 'lead'), `${SITE}/assets/img/og-en.jpg`, 1200, 630, 'website', l)}\n` +
    ldScript([ORG, { '@type': 'CollectionPage', url, name, inLanguage: l, mainEntity: { '@type': 'ItemList', numberOfItems: list.length, itemListElement: list.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: guideUrl(g), name: g.title })) } }]);
  write(`${l}/guide`, page({ lang: l, head, body, boot: { lang: l, force: true }, hash: '#/guide' }));
  urls.push({ loc: url, lastmod: today, pri: '0.7' });
}
// the store shows "Free guide: ..." on each book page: work id -> its guides
{ const m = {}; for (const g of guides) if (g.book) (m[g.book.work_id || g.book.id] ||= []).push({ lang: g.lang, slug: g.slug, title: g.title });
  mkdirSync('feed', { recursive: true }); writeFileSync('feed/guides.json', JSON.stringify(m)); }
// guides that were removed lose their page
for (const l of LANGS) if (existsSync(`${l}/guide`)) for (const d of readdirSync(`${l}/guide`)) if (statSync(`${l}/guide/${d}`).isDirectory() && !keepGuide[l]?.has(d)) rmSync(`${l}/guide/${d}`, { recursive: true, force: true });
for (const l of LANGS) if (!keepGuide[l] && existsSync(`${l}/guide`)) rmSync(`${l}/guide`, { recursive: true, force: true });

// ---------- product feed for the Meta (Facebook/Instagram) catalog: /feed/meta.csv ----------
// Every published edition, with the same id the pixel sends (content_ids), so ads can show the right book
// and remind visitors of the book they looked at. Both editions of a title share item_group_id (work).
{
  const csv = v => { const s = String(v ?? '').replace(/\r?\n+/g, ' ').trim(); return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const eur = c => `${(c / 100).toFixed(2)} ${'EUR'}`;
  const cols = ['id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price', 'link', 'image_link', 'brand', 'item_group_id', 'google_product_category', 'product_type', 'custom_label_0', 'custom_label_1'];
  const rows = books.filter(b => coverOf[b.id] && b.price_cents > 0).map(b => {
    const fmt = b.format === 'epub' ? 'EPUB' : 'PDF';
    const cats = catsOf(b), cat = cats[0];
    const list = b.list_price_cents > b.price_cents ? b.list_price_cents : 0;
    return {
      id: b.id,
      title: cut(`${b.title}${b.subtitle ? ': ' + b.subtitle : ''} (eBook, ${fmt})`, 150),
      description: cut(plain(b.description).replace(/\n/g, ' ') || b.title, 4900),
      availability: 'in stock', condition: 'new',
      price: eur(list || b.price_cents), sale_price: list ? eur(b.price_cents) : '',
      link: `${SITE}/book/${b.id}/?utm_source=facebook&utm_medium=paid&utm_campaign=catalog`,
      image_link: coverOf[b.id].url,
      brand: 'Librava', item_group_id: b.work_id || b.id,
      google_product_category: 'Media > Books',
      product_type: `Books > eBooks${cat ? ' > ' + tr('en', 'cat.' + cat) : ''}`,
      custom_label_0: cat ? tr('en', 'cat.' + cat) : 'Books', custom_label_1: fmt,
    };
  });
  mkdirSync('feed', { recursive: true });
  writeFileSync('feed/meta.csv', [cols.join(','), ...rows.map(r => cols.map(c => csv(r[c])).join(','))].join('\n') + '\n');
  console.log(`Meta feed: ${rows.length} products`);
}

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
