// First visit: one festive window with a gift and one button (same look as the gift window), almost no text.
import { api } from './api.js?v=20261103182150';
import { store, esc } from './util.js?v=20261103182150';
import { getLang, t } from './i18n.js?v=20261103182150';
import { modal, GIFT_SVG, currentPath, go } from './ui.js?v=20261103182150';
const T = {
  en: ['A gift for you', 'Get it'], ro: ['Un cadou pentru tine', 'Ia-l'], it: ['Un regalo per te', 'Prendilo'], fr: ['Un cadeau pour vous', 'Je le prends'], de: ['Ein Geschenk für Sie', 'Holen'],
  es: ['Un regalo para ti', 'Cogerlo'], pt: ['Um presente para si', 'Aproveitar'], nl: ['Een cadeau voor jou', 'Pakken'], pl: ['Prezent dla Ciebie', 'Odbierz'], cs: ['Dárek pro vás', 'Vzít'],
  sk: ['Darček pre vás', 'Vziať'], hu: ['Ajándék neked', 'Elfogadom'], bg: ['Подарък за вас', 'Вземи го'], hr: ['Poklon za vas', 'Uzmi'], sl: ['Darilo za vas', 'Vzemi'],
  el: ['Ένα δώρο για σας', 'Το παίρνω'], da: ['En gave til dig', 'Tag den'], sv: ['En present till dig', 'Ta den'], no: ['En gave til deg', 'Ta den'], fi: ['Lahja sinulle', 'Ota'],
  et: ['Kingitus sulle', 'Võta'], lv: ['Dāvana jums', 'Paņemt'], lt: ['Dovana jums', 'Paimti'], uk: ['Подарунок для вас', 'Забрати'],
};
const CODE = 'WELCOME10';
const winMin = () => Math.min(60, Math.max(1, +store.get('welcome-min', 15) || 15));
// the timer is real: after 15 minutes the code stops working in the cart and at payment, and it never restarts by refreshing the page
export function couponLive(code) {
  if (String(code || '').toUpperCase() !== CODE) return true;
  const until = store.get('welcome-until', 0);
  return !until || Date.now() < until;
}
let tick = null;
let fresh = false, openedBy = 0, collapseT = null, lastLeftFlag = 0;
function peek(el, ms) { clearTimeout(collapseT); el.classList.remove('min'); collapseT = setTimeout(() => { if (Date.now() - openedBy > 9000) el.classList.add('min'); }, ms); }
function pill(pct) {
  const until = store.get('welcome-until', 0);
  let el = document.getElementById('wl-box');
  if (!until || Date.now() >= until) {
    el?.remove(); clearInterval(tick); tick = null;
    try { if (sessionStorage.getItem('librava:coupon') === CODE) sessionStorage.removeItem('librava:coupon'); } catch { }
    return;
  }
  const left = Math.max(0, Math.round((until - Date.now()) / 1000)), time = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
  if (!el) {
    el = document.createElement('div'); el.id = 'wl-box';
    el.innerHTML = `<span class="wl-open"><button type="button" class="wl-c" aria-label="Close"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button><span class="wl-g">${GIFT_SVG.replace('width="20" height="20"', 'width="14" height="14"')}</span><b>−${+pct}%</b><span class="wl-t"></span></span><span class="wl-ring"><span class="wl-t2"></span></span>`;
    el.classList.toggle('min', !fresh);   // a new page load starts folded; only the moment the gift is taken starts open
    document.body.appendChild(el);
    if (fresh) { peek(el, 5000); fresh = false; }
    // smart: folds itself as soon as the visitor starts browsing (scroll or another page)
    const fold = () => { if (Date.now() - openedBy > 9000) { clearTimeout(collapseT); el.classList.add('min'); } };
    window.addEventListener('scroll', () => { if (window.scrollY > 90) fold(); }, { passive: true });
    window.addEventListener('hashchange', fold); window.addEventListener('popstate', fold);
    // ...and opens by itself for a moment when it matters: a book was added, or time is running out
    window.addEventListener('librava:cart', () => { const e = document.getElementById('wl-box'); if (e) peek(e, 4500); });
    el.addEventListener('click', e => {
      const min = el.classList.contains('min');
      if (e.target.closest('.wl-c')) { clearTimeout(collapseT); el.classList.add('min'); return; }
      if (min) { openedBy = Date.now(); clearTimeout(collapseT); el.classList.remove('min'); return; }
      go('/cart');
    });
  }
  el.classList.toggle('low', left < 120);
  if (left <= 120 && left > 0 && lastLeftFlag !== 120) { lastLeftFlag = 120; peek(el, 6000); }
  if (left <= 30 && lastLeftFlag !== 30) { lastLeftFlag = 30; peek(el, 6000); }
  el.style.setProperty('--p', Math.round(100 * left / (winMin() * 60)) + '%');
  const bonus = store.get('welcome-bonus', ''); el.querySelector('.wl-open b').textContent = bonus || '−' + (+pct) + '%';
  el.querySelector('.wl-t').textContent = time; el.querySelector('.wl-t2').textContent = time;
}

// the timed extra offer (admin: any offer marked "new visitors, welcome countdown")
async function welOffer() { try { return (await api.offers()).find(o => o.kind === 'bxgy' && o.config?.welcome) || null; } catch { return null; } }
async function takeGift(c) {
  const wo = await welOffer();
  const m = Math.min(60, Math.max(1, Math.max(+c?.config?.minutes || 0, +wo?.config?.minutes || 0) || 15));
  store.set('welcome-min', m); store.set('welcome-until', Date.now() + m * 60e3); store.set('welcome-bonus', '');
  fresh = true; openedBy = 0; resumePill();
  if (wo) setTimeout(function show(n = 0) {
    const until = store.get('welcome-until', 0);
    if (!until || Date.now() >= until - 20000 || store.get('welcome-bonus')) return;
    if (document.querySelector('.modal, .gift-modal, #why-wrap') || /(^|\/)(read|admin|cart)\b/.test(currentPath())) { if (n < 12) setTimeout(() => show(n + 1), 1500); return; }
    const b = +wo.config.buy || 3, g = +wo.config.get || 3, tag = b + '+' + g;
    store.set('welcome-bonus', tag);
    const conf = Array.from({ length: 28 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i % 7) * .18}s;--c:${['#F4A340', '#E85D75', '#4FA3D9', '#7BC47F', '#B48CE0'][i % 5]}"></i>`).join('');
    const [, btn] = T[getLang()] || T.en;
    modal(`<div class="gift-confetti" aria-hidden="true">${conf}</div>
      <div class="gift-hero">${GIFT_SVG.replace('width="20" height="20"', 'width="44" height="44"')}</div>
      <div class="welcome-big">${b} + ${g}</div>
      <h2>${esc(t('book.free'))}</h2>
      <div class="actions" style="justify-content:center"><button class="btn btn-buy" data-close>${esc(btn)}</button></div>`,
      { onMount: m2 => { m2.classList.add('gift-modal'); } });
    resumePill(); const el = document.getElementById('wl-box'); if (el) peek(el, 6000);
  }, 10000);
}
export function resumePill() {
  try {
    if (!store.get('welcome-until', 0) || tick) return;
    api.findCoupon?.(CODE).then(c => { const pct = c?.config?.percent; if (!pct) return; pill(pct); clearInterval(tick); tick = setInterval(() => pill(pct), 1000); }).catch(() => { });
  } catch { }
}
export function welcomeGift() {
  try {
    resumePill();
    if (store.get('welcome-seen') || store.get('staff') || window.__welcome) return;
    window.__welcome = 1;
    setTimeout(async function tryShow(n = 0) {
      try {
        if (store.get('welcome-seen')) return;
        if (api.user?.()?.isAdmin || /(^|\/)(read|admin|cart)\b/.test(currentPath())) return;
        if (document.querySelector('.modal, .gift-modal, #why-wrap')) { if (n < 12) setTimeout(() => tryShow(n + 1), 1500); return; }
        const c = await api.findCoupon?.(CODE).catch(() => null);
        const pct = c?.config?.percent, mu = c?.config?.max_uses; if (!pct || (mu && (c.config.uses || 0) >= mu)) return;   // never promise a gift the code cannot give
        const [title, btn] = T[getLang()] || T.en;
        const conf = Array.from({ length: 28 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i % 7) * .18}s;--c:${['#F4A340', '#E85D75', '#4FA3D9', '#7BC47F', '#B48CE0'][i % 5]}"></i>`).join('');
        store.set('welcome-seen', 1);
        modal(`<div class="gift-confetti" aria-hidden="true">${conf}</div>
          <div class="gift-hero">${GIFT_SVG.replace('width="20" height="20"', 'width="44" height="44"')}</div>
          <h2>${esc(title)}</h2>
          <div class="welcome-big">−${+pct}%</div>
          <div class="actions" style="justify-content:center"><button class="btn btn-buy" data-close data-take>${esc(btn)}</button></div>`,
          { onMount: m => { m.classList.add('gift-modal'); m.querySelector('[data-take]').addEventListener('click', () => { try { sessionStorage.setItem('librava:coupon', CODE); } catch { } takeGift(c); }); } });
      } catch { }
    }, 2000);
  } catch { }
}
