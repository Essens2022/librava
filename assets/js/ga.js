// Google Analytics 4 — loaded ONLY after the visitor chooses "Accept all" in the cookie notice.
// The measurement ID is a public identifier (it is visible in every page that uses Analytics), not a secret.
import { store } from './util.js?v=20261022171649';

const GA_ID = 'G-ZEE5K1Z2RB';
let ready = false;

export const gaAllowed = () => store.get('analytics') === 'granted'
  && /(^|\.)librava\.store$/.test(location.hostname)
  && navigator.globalPrivacyControl !== true;

// clean address for reports: https://librava.store/book/<id> instead of /#/book/<id>?x=y
function pageLocation() {
  const h = location.hash.replace(/^#\/?/, '').replace(/[?].*$/, '');
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
}

// visitor withdrew consent: stop sending and remove the _ga cookies
export function stopGA() {
  ready = false;
  try { window.gtag && window.gtag('consent', 'update', { analytics_storage: 'denied' }); } catch { }
  try { window['ga-disable-' + GA_ID] = true; } catch { }
  const host = location.hostname.split('.').slice(-2).join('.');
  document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(n => /^_ga/.test(n)).forEach(n => {
    document.cookie = `${n}=; Max-Age=0; path=/; domain=.${host}`;
    document.cookie = `${n}=; Max-Age=0; path=/`;
  });
}

const item = b => b && ({ item_id: b.id, item_name: b.title, item_brand: 'Librava', item_category: b.category || undefined, price: (b.price_cents || 0) / 100, quantity: 1 });
const cur = b => String((b && b.currency) || 'eur').toUpperCase();

// one place that turns Librava events into GA4 (recommended e-commerce names)
export function gaEvent(type, data = {}) {
  try {
    if (!gaAllowed()) return;
    if (!ready) initGA();
    const g = window.gtag; if (!g) return;
    switch (type) {
      case 'pageview': g('event', 'page_view', { page_location: pageLocation(), page_title: document.title, language: document.documentElement.lang }); break;
      case 'book_view': if (data.book) g('event', 'view_item', { currency: cur(data.book), value: (data.book.price_cents || 0) / 100, items: [item(data.book)] }); break;
      case 'add_cart': if (data.book) g('event', 'add_to_cart', { currency: cur(data.book), value: (data.book.price_cents || 0) / 100, items: [item(data.book)] }); break;
      case 'checkout': if (data.books) g('event', 'begin_checkout', { currency: cur(data.books[0]), value: data.books.reduce((a, b) => a + (b.price_cents || 0), 0) / 100, items: data.books.map(item) }); break;
      case 'purchase': if (data.books) g('event', 'purchase', { transaction_id: data.id, currency: cur(data.books[0]), value: data.value != null ? data.value / 100 : data.books.reduce((a, b) => a + (b.price_cents || 0), 0) / 100, items: data.books.map(item) }); break;
      case 'search': g('event', 'search', { search_term: data.q }); break;
      case 'signup': g('event', 'sign_up', { method: data.method || 'email' }); break;
      case 'share': g('event', 'share', { item_id: data.book_id, content_type: 'book' }); break;
      case 'sample': g('event', 'select_content', { content_type: 'preview', item_id: data.book_id }); break;
      default: break;
    }
  } catch { }
}
