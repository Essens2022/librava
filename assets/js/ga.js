// Google Analytics 4 — loaded ONLY after the visitor chooses "Accept all" in the cookie notice.
// The measurement ID is a public identifier (it is visible in every page that uses Analytics), not a secret.
import { store } from './util.js?v=20261028151117';

const GA_ID = 'G-ZEE5K1Z2RB';
// Meta Pixel ID: also a public identifier (visible in every page that uses it), not a secret
const META_PIXEL_ID = '2177981823134602';
let ready = false, fbReady = false;

export const gaAllowed = () => store.get('analytics') === 'granted'
  && /(^|\.)librava\.store$/.test(location.hostname)
  && navigator.globalPrivacyControl !== true;

// clean address for reports: https://librava.store/book/<id> instead of /#/book/<id>?x=y
function pageLocation() {
  const h = /^\/go\/./.test(location.pathname) ? location.pathname.slice(4) : location.hash.replace(/^#\/?/, '').replace(/[?].*$/, '');
  return location.origin + '/' + h;
}

export function initGA() {
  if (ready || !gaAllowed()) return;
  ready = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  window.gtag('js', new Date());
  window.gtag('config', GA_ID, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  const s = document.createElement('script');
  s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);
  initPixel();
}

// Meta Pixel, same consent as Analytics ("Accept all"); measures Facebook/Instagram ads
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
  try { window.gtag && window.gtag('consent', 'update', { analytics_storage: 'denied' }); } catch { }
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
      case 'purchase': if (data.books) { const value = data.value != null ? data.value / 100 : data.books.reduce((a, b) => a + (b.price_cents || 0), 0) / 100; g('event', 'purchase', { transaction_id: data.id, currency: cur(data.books[0]), value, items: data.books.map(item) }); fb('track', 'Purchase', { ...fbData(data.books), value, num_items: data.books.length }, data.id ? { eventID: 'order-' + data.id } : undefined); } break;
      case 'search': g('event', 'search', { search_term: data.q }); fb('track', 'Search', { search_string: data.q }); break;
      case 'signup': g('event', 'sign_up', { method: data.method || 'email' }); fb('track', 'CompleteRegistration'); break;
      case 'share': g('event', 'share', { item_id: data.book_id, content_type: 'book' }); break;
      case 'sample': g('event', 'select_content', { content_type: 'preview', item_id: data.book_id }); break;
      default: break;
    }
  } catch { }
}
