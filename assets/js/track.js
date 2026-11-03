// Librava statistics: anonymous, first-party (no cookies, no IP addresses, no names or e-mails).
// Google Analytics 4 receives the same events only if the visitor chose "Accept all" (see ga.js).
// What a visit looks like: where people come from, which country/language/device, what they search, which
// books they open, add to the cart and buy. Read in Admin → Statistics.
import { api } from './api.js?v=20261103110507';
import { store } from './util.js?v=20261103110507';
import { gaEvent } from './ga.js?v=20261103110507';

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
// how long the person stayed on the current step and how far down they read (sent when they leave)
let pageStart = Date.now(), maxScroll = 0, sent50 = false, sent90 = false;
const resetPage = () => { pageStart = Date.now(); maxScroll = 0; sent50 = sent90 = false; seenFields.clear(); };
const seenFields = new Set();
// /go/search?x → the same name the reports always used (/en/#/search)
const hereKey = () => /^\/go\/./.test(location.pathname) ? '/' + (document.documentElement.lang || 'en') + '/#' + location.pathname.slice(3) : location.pathname + location.hash.replace(/[?].*$/, '');
export function track(type, data = {}) {
  try {
    if (off() || !api.track) return;
    const o = origin(), d = device();
    const lang = document.documentElement.lang;
    api.track({ type, sid: sid(), vid: vid(), lang, country: country(), ...d, ...o, path: hereKey(), ...data });
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
// the person left (closed the tab, went to another app or tab): the admin stops showing them as live at once;
// when they come back a sign of life is sent straight away
let leftSent = false;
function leaveNow() {
  try {
    if (leftSent || off() || !api.trackLeave) return; leftSent = true;
    const o = origin(), d = device();
    api.trackLeave({ type: 'leave', sid: sid(), vid: vid(), lang: document.documentElement.lang, country: country(), ...d, ...o, path: hereKey(), note: 's=' + Math.round((Date.now() - pageStart) / 1000) + ';sc=' + maxScroll });
  } catch { }
}
addEventListener('pagehide', leaveNow);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') leaveNow();
  else if (leftSent) { leftSent = false; lastInput = Date.now(); track('ping'); }
});
// problems the visitor runs into (a few per visit, short text) so the admin can see where people get stuck
let errN = 0;
const reportError = msg => { try { if (errN >= 3 || !msg) return; errN++; track('error', { note: String(msg).slice(0, 150) }); } catch { } };
addEventListener('error', e => { if (e && e.filename && e.filename.startsWith(location.origin) && !/ResizeObserver/i.test(e.message || '')) reportError(e.message); });
addEventListener('unhandledrejection', e => { const m = e && e.reason && (e.reason.message || e.reason); if (typeof m === 'string' && !/abort|network|fetch|load failed/i.test(m)) reportError(m); });
export function trackPage(again) {
  const p = location.pathname + location.search + location.hash;
  if (p === lastPath && !again) return; lastPath = p;
  if (again) { gaEvent('pageview'); return; }
  resetPage();
  track('pageview');
}

// Customer activity (Admin → Customers): for logged-in customers only, how often they visit and how long they stay.
// Every 30 seconds while the tab is visible and the person was active in the last 5 minutes, 30 seconds are added.
let pagesSince = 0, lastInput = Date.now();
['pointerdown', 'keydown', 'scroll', 'touchstart', 'wheel'].forEach(ev => addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true }));
addEventListener('hashchange', () => { pagesSince++; });
addEventListener('popstate', () => { pagesSince++; });
function beat(first) {
  try {
    const u = api.user && api.user();
    if (!u || u.isAdmin || !api.heartbeat || off()) return;
    if (!first && (document.visibilityState !== 'visible' || Date.now() - lastInput > 5 * 60e3)) return;
    api.heartbeat({ p_sid: sid(), p_sec: first ? 0 : 30, p_pages: first ? 1 : pagesSince, p_device: device().device });
    pagesSince = 0;
  } catch { }
}
setTimeout(() => beat(true), 4000);
setInterval(() => beat(false), 30e3);

// Time on the site for every visitor (also without an account): a small "still here" signal every 15 seconds,
// only while the page is visible and the person scrolled, tapped or typed in the last 90 seconds. Visits that
// never do anything (automatic link checks) send none, so their time stays tiny instead of looking real.
setInterval(() => {
  try {
    if (document.visibilityState !== 'visible' || Date.now() - lastInput > 90e3) return;
    track('ping');
  } catch { }
}, 15e3);

// What the person pressed and how far they read: short labels only (never what they type), a limited number per visit,
// so the admin can see why a step was taken and where people stop.
let clicksN = 0;
const clean = x => String(x || '').replace(/\s+/g, ' ').trim().slice(0, 45);
function hrefOf(a) { try { const u = new URL(a.href, location.href); if (u.origin !== location.origin) return u.hostname; return (u.pathname.replace(/^\/go/, '') + u.hash.replace(/[?].*$/, '')).slice(0, 50); } catch { return ''; } }
document.addEventListener('click', e => {
  try {
    if (off() || clicksN >= 60) return;
    const el = e.target && e.target.closest && e.target.closest('a,button,[role=button],summary,select,input[type=checkbox],input[type=radio],input[type=submit]');
    if (!el) return;
    let label = clean(el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || el.value || el.getAttribute('data-nav') || el.id);
    if (!label) { const img = el.querySelector && el.querySelector('img[alt]'); label = clean(img && img.alt) || (el.tagName === 'A' ? 'link' : el.tagName.toLowerCase()); }
    const where = el.tagName === 'A' ? hrefOf(el) : '';
    clicksN++; track('click', { note: where && where !== '/' ? label + ' → ' + where : label });
  } catch { }
}, { capture: true, passive: true });
// which form field the person started to fill in (field name only)
document.addEventListener('focusin', e => {
  try {
    const el = e.target; if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || /^(checkbox|radio|submit|button|hidden)$/.test(el.type) || off() || clicksN >= 60) return;
    const f = clean(el.getAttribute('autocomplete') || el.name || el.id || el.type); if (!f || seenFields.has(f)) return; seenFields.add(f); clicksN++;
    track('click', { note: 'field:' + f });
  } catch { }
}, { capture: true });
addEventListener('scroll', () => {
  try {
    const h = document.documentElement.scrollHeight, v = innerHeight; if (h <= v + 80) return;
    const p = Math.min(100, Math.round((scrollY + v) / h * 100)); if (p > maxScroll) maxScroll = p;
    if (!sent50 && p >= 50) { sent50 = true; track('scroll', { note: '50' }); }
    if (!sent90 && p >= 90) { sent90 = true; track('scroll', { note: '90' }); }
  } catch { }
}, { passive: true });
