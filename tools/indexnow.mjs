// Tells Bing, Yandex, Seznam, Naver & co. (IndexNow) which pages changed, so they are crawled within minutes.
// Bing's index also feeds ChatGPT search, Copilot and DuckDuckGo. The key is public by design (it only proves we own the site).
// Usage: node tools/indexnow.mjs <changed files...>   or   node tools/indexnow.mjs --all   (every URL in sitemap.xml)
import { readFileSync } from 'node:fs';
const SITE = 'https://librava.store', KEY = '43fc4ec4d5b02191ac11bbeab7f4992c';
const args = process.argv.slice(2);
let urls;
if (args[0] === '--all') urls = [...readFileSync('sitemap.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
else urls = [...new Set(args.filter(f => /(^|\/)index\.html$/.test(f) && !f.startsWith('tools/')).map(f => SITE + '/' + f.replace(/(^|\/)index\.html$/, '$1')))];
const inSitemap = new Set([...readFileSync('sitemap.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]));
urls = urls.filter(u => inSitemap.has(u));   // only canonical pages
if (!urls.length) { console.log('IndexNow: nothing to send'); process.exit(0); }
for (let i = 0; i < urls.length; i += 10000) {
  const r = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: 'librava.store', key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: urls.slice(i, i + 10000) }) });
  console.log('IndexNow', r.status, urls.slice(i, i + 10000).length, 'URLs');
}
