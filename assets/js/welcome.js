// First visit: one festive window with a gift and one button (same look as the gift window), almost no text.
import { api } from './api.js?v=20261103171040';
import { store, esc } from './util.js?v=20261103171040';
import { getLang } from './i18n.js?v=20261103171040';
import { modal, GIFT_SVG, currentPath } from './ui.js?v=20261103171040';
const T = {
  en: ['A gift for you', 'Get it'], ro: ['Un cadou pentru tine', 'Ia-l'], it: ['Un regalo per te', 'Prendilo'], fr: ['Un cadeau pour vous', 'Je le prends'], de: ['Ein Geschenk für Sie', 'Holen'],
  es: ['Un regalo para ti', 'Cogerlo'], pt: ['Um presente para si', 'Aproveitar'], nl: ['Een cadeau voor jou', 'Pakken'], pl: ['Prezent dla Ciebie', 'Odbierz'], cs: ['Dárek pro vás', 'Vzít'],
  sk: ['Darček pre vás', 'Vziať'], hu: ['Ajándék neked', 'Elfogadom'], bg: ['Подарък за вас', 'Вземи го'], hr: ['Poklon za vas', 'Uzmi'], sl: ['Darilo za vas', 'Vzemi'],
  el: ['Ένα δώρο για σας', 'Το παίρνω'], da: ['En gave til dig', 'Tag den'], sv: ['En present till dig', 'Ta den'], no: ['En gave til deg', 'Ta den'], fi: ['Lahja sinulle', 'Ota'],
  et: ['Kingitus sulle', 'Võta'], lv: ['Dāvana jums', 'Paņemt'], lt: ['Dovana jums', 'Paimti'], uk: ['Подарунок для вас', 'Забрати'],
};
const CODE = 'WELCOME10';
export function welcomeGift() {
  try {
    if (store.get('welcome-seen') || store.get('staff') || window.__welcome) return;
    window.__welcome = 1;
    setTimeout(async function tryShow(n = 0) {
      try {
        if (store.get('welcome-seen')) return;
        if (api.user?.()?.isAdmin || /(^|\/)(read|admin|cart)\b/.test(currentPath())) return;
        if (document.querySelector('.consent, .modal, .gift-modal, #why-box')) { if (n < 8) setTimeout(() => tryShow(n + 1), 4000); return; }
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
          { onMount: m => { m.classList.add('gift-modal'); m.querySelector('[data-take]').addEventListener('click', () => { try { sessionStorage.setItem('librava:coupon', CODE); } catch { } }); } });
      } catch { }
    }, 6000);
  } catch { }
}
