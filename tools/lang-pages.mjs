// Creates /<lang>/index.html for every language: a link like librava.store/it/ shows the
// site's title and description in that language when shared (WhatsApp, Facebook…), then opens the store.
// Run: node tools/lang-pages.mjs   (static files, committed with the site)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const SITE = 'https://librava.store';
const src = readFileSync('assets/js/i18n.js', 'utf8');
const codes = [...src.matchAll(/\['([a-z]{2})', '([^']+)'\]/g)].map(m => m[1]);
const fromBundled = (l, key) => { const block = src.split(`  ${l}: {`)[1]; return block ? new RegExp(`'${key.replace('.', '\\.')}': '((?:[^'\\\\]|\\\\.)*)'`).exec(block)?.[1].replace(/\\'/g, "'") : null; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let n = 0;
for (const l of [...new Set(codes)]) {
  let get;
  try { const d = (await import(`../assets/js/lang/${l}.js`)).default; get = k => d[k]; } catch { get = k => fromBundled(l, k); }
  const kicker = get('home.heroKicker') || 'Digital books', title = get('home.heroTitle') || '', text = get('home.heroText') || '';
  mkdirSync(l, { recursive: true });
  writeFileSync(`${l}/index.html`, `<!doctype html>
<html lang="${l}"><head><meta charset="utf-8">
<title>Librava — ${esc(kicker)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${esc(text)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Librava">
<meta property="og:url" content="${SITE}/${l}/">
<meta property="og:title" content="Librava — ${esc(kicker)}">
<meta property="og:description" content="${esc(title)}">
<meta property="og:image" content="${SITE}/assets/img/og.png">
<meta property="og:locale" content="${l}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#1C2B2D">
<script>location.replace('/' + location.search + location.hash);</script>
</head><body style="background:#EDF0E9"></body></html>
`);
  n++;
}
console.log('language pages:', n);
