// Librava statistics: anonymous, first-party (no cookies, no IP addresses, no names or e-mails).
// Google Analytics 4 receives the same events only if the visitor chose "Accept all" (see ga.js).
// What a visit looks like: where people come from, which country/language/device, what they search, which
// books they open, add to the cart and buy. Read in Admin → Statistics.
import { api } from './api.js?v=20261022142807';
import { store } from './util.js?v=20261022142807';
import { gaEvent } from './ga.js?v=20261022142807';

const TZ = { 'Europe/Rome': 'IT', 'Europe/Bucharest': 'RO', 'Europe/Chisinau': 'MD', 'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES', 'Europe/Lisbon': 'PT', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Luxembourg': 'LU', 'Europe/Vienna': 'AT', 'Europe/Zurich': 'CH', 'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ', 'Europe/Bratislava': 'SK', 'Europe/Budapest': 'HU', 'Europe/Sofia': 'BG', 'Europe/Zagreb': 'HR', 'Europe/Ljubljana': 'SI', 'Europe/Athens': 'GR', 'Asia/Nicosia': 'CY', 'Europe/Copenhagen': 'DK', 'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Helsinki': 'FI', 'Europe/Tallinn': 'EE', 'Europe/Riga': 'LV', 'Europe/Vilnius': 'LT', 'Europe/Kyiv': 'UA', 'Europe/Kiev': 'UA', 'Europe/Malta': 'MT', 'Europe/Belgrade': 'RS', 'Europe/Istanbul': 'TR', 'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU' };
function country() {
  try { const z = Intl.DateTimeFormat().resolvedOptions().timeZone; if (TZ[z]) return TZ[z]; } catch { }
  const m = /-([A-Z]{2})$/.exec(navigator.language || ''); return m ? m[1] : null;
}
function device() {
  const ua = navigator.userAgent;
  const d = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)) ? 'tablet' : /Mobi|iPhone|Android/i.test(ua) ? 'mobile' : 'desktop';
  const os = /iPhone|iPad|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'other';
  return { device: d, os };
}
const ENGINES = [['google', /(^|\.)google\./], ['bing', /(^|\.)bing\.com$/], ['duckduckgo', /duckduckgo\.com$/], ['yahoo', /yahoo\./], ['ecosia', /ecosia\.org$/], ['yandex', /yandex\./], ['seznam', /seznam\.cz$/], ['qwant', /qwant\.com$/],
  ['facebook', /(^|\.)(facebook|fb)\.com$|^l\.facebook/], ['instagram', /instagram\.com$/], ['whatsapp', /whatsapp\.(com|net)$/], ['tiktok', /tiktok\.com$/], ['youtube', /youtube\.com$|youtu\.be$/], ['pinterest', /pinterest\./], ['x', /(^|\.)(t\.co|x\.com|twitter\.com)$/], ['telegram', /t\.me$|telegram\./], ['linkedin', /linkedin\.com$/], ['reddit', /reddit\.com$/], ['chatgpt', /chatgpt\.com$|openai\.com$/]];
// where this visit came from; kept for the whole visit
function origin() {
  let o = null; try { o = JSON.parse(sessionStorage.getItem('librava:origin')); } catch { }
  if (o) return o;
  const p = new URLSearchParams(location.search);
  let ref = '', source = null;
  try { const r = document.referrer && new URL(document.referrer); if (r && r.hostname !== location.hostname) { ref = r.hostname.replace(/^www\./, ''); source = (ENGINES.find(([, re]) => re.test(ref)) || [ref])[0]; } } catch { }
  if (p.get('utm_source')) source = p.get('utm_source').toLowerCase().slice(0, 40);
  if (!source && p.get('fbclid')) source = 'facebook';
  if (!source && p.get('gclid')) source = 'google-ads';
  o = { source: source || 'direct', ref, campaign: p.get('utm_campaign') || null };
  try { sessionStorage.setItem('librava:origin', JSON.stringify(o)); } catch { }
  return o;
}
// read the campaign from the address as soon as the page opens, before the app tidies the address bar
try { origin(); } catch { }
const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), b => b.toString(36).padStart(2, '0')).join('');
function sid() { let s = null; try { s = sessionStorage.getItem('librava:sid'); if (!s) { s = rnd(); sessionStorage.setItem('librava:sid', s); } } catch { s = s || rnd(); } return s; }
// a returning-visitor number only after the visitor accepted the notice on the first visit
function vid() { if (!store.get('consent')) return null; let v = store.get('vid'); if (!v) { v = rnd(); store.set('vid', v); } return v; }

// robots (Googlebot, Bing, Lighthouse, automated browsers) also run the site's JavaScript; they are not visitors
const BOT = /bot|crawl|spider|slurp|google-inspectiontool|googleother|lighthouse|headless|pagespeed|preview|facebookexternalhit|phantom|puppeteer|playwright|selenium/i;
// a device where the admin has logged in once stays out of the statistics, also after logging out
function staff() {
  try { if (api.user()?.isAdmin) { store.set('staff', 1); return true; } return !!store.get('staff'); } catch { return false; }
}
const off = () => navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || !/(^|\.)librava\.store$/.test(location.hostname)
  || navigator.webdriver === true || BOT.test(navigator.userAgent) || staff();
let lastPath = '';
export function track(type, data = {}) {
  try {
    if (off() || !api.track) return;
    const o = origin(), d = device();
    const lang = document.documentElement.lang;
    api.track({ type, sid: sid(), vid: vid(), lang, country: country(), ...d, ...o, path: location.pathname + location.hash.replace(/[?].*$/, ''), ...data });
  } catch { }
  toGA(type, data);
}
// mirror to Google Analytics (only with consent; ga.js checks it)
function toGA(type, data) {
  try {
    if (off()) return;
    if ((type === 'book_view' || type === 'add_cart') && data.book_id) api.getBook(data.book_id).then(b => b && gaEvent(type, { book: b }), () => { });
    else if (type !== 'checkout') gaEvent(type, data);
  } catch { }
}
export function trackPage(again) {
  const p = location.pathname + location.hash;
  if (p === lastPath && !again) return; lastPath = p;
  if (again) { gaEvent('pageview'); return; }
  track('pageview');
}
