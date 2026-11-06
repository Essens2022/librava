// Google Analytics 4 — loaded ONLY after the visitor chooses "Accept all" in the cookie notice.
// The measurement ID is a public identifier (it is visible in every page that uses Analytics), not a secret.
import { store } from './util.js?v=20261106202434';

const GA_ID = 'G-ZEE5K1Z2RB';
// Google Ads tag + purchase conversion label: public identifiers (visible on every page that uses Google Ads)
const ADS_ID = 'AW-18550229876';
const ADS_PURCHASE_LABEL = 'kI85CKHBt7AdEPSWuI1F'; // filled in after the Purchase conversion is created in Google Ads
// Meta Pixel ID: also a public identifier (visible in every page that uses it), not a secret
const META_PIXEL_ID = '2177981823134602';
let ready = false, fbReady = false;

// two separate choices: Statistics (Google Analytics) and Advertising (Google Ads + Meta Pixel + remarketing)
const hostOk = () => /(^|\.)librava\.store$/.test(location.hostname) && navigator.globalPrivacyControl !== true;
export const analyticsOn = () => store.get('analytics') === 'granted' && hostOk();
export const adsOn = () => store.get('ads') === 'granted' && hostOk();
export const gaAllowed = () => analyticsOn() || adsOn();

// clean address for reports: https://librava.store/book/<id> instead of /#/book/<id>?x=y
function pageLocation() {
  const h = /^\/go\/./.test(location.pathname) ? location.pathname.slice(4) : location.hash.replace(/^#\/?/, '').replace(/[?].*$/, '');
  return location.origin + '/' + h;
}

let gaCfg = false, adsCfg = false;
const consentState = () => ({ analytics_storage: analyticsOn() ? 'granted' : 'denied', ad_storage: adsOn() ? 'granted' : 'denied', ad_user_data: adsOn() ? 'granted' : 'denied', ad_personalization: adsOn() ? 'granted' : 'denied' });
function configure() {
  const g = window.gtag;
  if (analyticsOn() && !gaCfg) { gaCfg = true; g('config', GA_ID, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false }); }
  if (adsOn() && !adsCfg) { adsCfg = true; g('config', ADS_ID, { allow_ad_personalization_signals: true }); }  // Google Ads: sales measurement + remarketing list
  if (adsOn()) initPixel();
}
export function initGA() {
  if (ready || !gaAllowed()) return;
  ready = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', consentState());
  window.gtag('js', new Date());
  configure();
  const s = document.createElement('script');
  s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + (analyticsOn() ? GA_ID : ADS_ID);
  document.head.appendChild(s);
}
// the visitor saved new choices: apply them at once (also when something is switched off)
export function applyConsent() {
  if (!gaAllowed()) { stopGA(); return; }
  if (!ready) { initGA(); return; }
  try { window.gtag('consent', 'update', consentState()); } catch { }
  window['ga-disable-' + GA_ID] = !analyticsOn();
  configure();
  const host = location.hostname.split('.').slice(-2).join('.');
  const wipe = re => document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(n => re.test(n)).forEach(n => { document.cookie = `${n}=; Max-Age=0; path=/; domain=.${host}`; document.cookie = `${n}=; Max-Age=0; path=/`; });
  if (!analyticsOn()) { gaCfg = false; wipe(/^_ga/); }
  if (!adsOn()) { adsCfg = false; try { window.fbq && window.fbq('consent', 'revoke'); } catch { } fbReady = false; wipe(/^_fb[pc]$/); }
}

// Meta Pixel: only with the Advertising choice; measures Facebook/Instagram ads
function initPixel() {
  if (fbReady) return; fbReady = true;
  /* eslint-disable */
  !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  window.fbq('consent', 'grant');
  window.fbq('init', META_PIXEL_ID);
}
const fb = (...a) => { try { if (fbReady && window.fbq) window.fbq(...a); } catch { } };

// visitor withdrew consent: stop sending and remove the _ga cookies
export function stopGA() {
  ready = false;
  try { window.gtag && window.gtag('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }); } catch { }
  gaCfg = false; adsCfg = false;
  try { window['ga-disable-' + GA_ID] = true; } catch { }
  try { window.fbq && window.fbq('consent', 'revoke'); } catch { }
  fbReady = false;
  const host = location.hostname.split('.').slice(-2).join('.');
  document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(n => /^_ga|^_fb[pc]$/.test(n)).forEach(n => {
    document.cookie = `${n}=; Max-Age=0; path=/; domain=.${host}`;
    document.cookie = `${n}=; Max-Age=0; path=/`;
  });
}

const item = b => b && ({ item_id: b.id, item_name: b.title, item_brand: 'Librava', item_category: b.category || undefined, price: (b.price_cents || 0) / 100, quantity: 1 });
const cur = b => String((b && b.currency) || 'eur').toUpperCase();

const fbData = books => ({ content_ids: books.map(b => b.id), content_type: 'product', content_name: books.length === 1 ? books[0].title : undefined, content_category: books.length === 1 ? books[0].category : undefined, currency: cur(books[0]), value: books.reduce((a, b) => a + (b.price_cents || 0), 0) / 100 });
// one place that turns Librava events into GA4 (recommended e-commerce names)
export function gaEvent(type, data = {}) {
  try {
    if (!gaAllowed()) return;
    if (!ready) initGA();
    const g = window.gtag; if (!g) return;
    switch (type) {
      case 'pageview': g('event', 'page_view', { page_location: pageLocation(), page_title: document.title, language: document.documentElement.lang }); fb('track', 'PageView'); break;
      case 'book_view': if (data.book) { g('event', 'view_item', { currency: cur(data.book), value: (data.book.price_cents || 0) / 100, items: [item(data.book)] }); fb('track', 'ViewContent', fbData([data.book])); } break;
      case 'add_cart': if (data.book) { g('event', 'add_to_cart', { currency: cur(data.book), value: (data.book.price_cents || 0) / 100, items: [item(data.book)] }); fb('track', 'AddToCart', fbData([data.book])); } break;
      case 'checkout': if (data.books) { g('event', 'begin_checkout', { currency: cur(data.books[0]), value: data.books.reduce((a, b) => a + (b.price_cents || 0), 0) / 100, items: data.books.map(item) }); fb('track', 'InitiateCheckout', { ...fbData(data.books), num_items: data.books.length }); } break;
      case 'purchase': if (data.books) { const value = data.value != null ? data.value / 100 : data.books.reduce((a, b) => a + (b.price_cents || 0), 0) / 100; if (ADS_PURCHASE_LABEL && adsOn()) g('event', 'conversion', { send_to: ADS_ID + '/' + ADS_PURCHASE_LABEL, value, currency: cur(data.books[0]), transaction_id: data.id }); g('event', 'purchase', { transaction_id: data.id, currency: cur(data.books[0]), value, items: data.books.map(item) }); fb('track', 'Purchase', { ...fbData(data.books), value, num_items: data.books.length }, data.id ? { eventID: 'order-' + data.id } : undefined); } break;
      case 'search': g('event', 'search', { search_term: data.q }); fb('track', 'Search', { search_string: data.q }); break;
      case 'signup': g('event', 'sign_up', { method: data.method || 'email' }); fb('track', 'CompleteRegistration'); break;
      case 'share': g('event', 'share', { item_id: data.book_id, content_type: 'book' }); break;
      case 'sample': g('event', 'select_content', { content_type: 'preview', item_id: data.book_id }); break;
      default: break;
    }
  } catch { }
}
