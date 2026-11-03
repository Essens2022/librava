// The goal bar: while there are books in the cart it stays on screen on every page and shows the next reward
// ("one more book and the 4th is -80%"). Reuses the cart's own texts, so it is already in every language.
import { api } from './api.js?v=20261103170025';
import { t, money } from './i18n.js?v=20261103170025';
import { cart, go, currentPath } from './ui.js?v=20261103170025';
import { applyOffers } from './offers.js?v=20261103170025';
import { esc } from './util.js?v=20261103170025';

let seq = 0, offersC = null; const bookC = new Map();
async function draw() {
  const my = ++seq; let bar = document.getElementById('goal-bar');
  const ids = cart.get();
  const onCart = /(^|\/)cart\b/.test(currentPath()) || /^#\/(read|admin)/.test(location.hash) || /^\/(read|admin)/.test(location.pathname);
  if (!ids.length || onCart) { bar?.remove(); return; }
  try {
    if (!offersC) offersC = api.offers ? await api.offers().catch(() => []) : [];
    await Promise.all(ids.filter(id => !bookC.has(id)).map(id => api.getBook(id).then(b => bookC.set(id, b)).catch(() => null)));
    if (my !== seq) return;
    const books = ids.map(id => bookC.get(id)).filter(b => b && b.price_cents > 0);
    if (!books.length) { bar?.remove(); return; }
    const r = applyOffers(books, offersC.filter(o => o.kind !== 'coupon'), {}), n = r.nudges[0];
    if (!n) { bar?.remove(); return; }
    const txt = n.kind === 'bxgy' && n.percent >= 100 ? t('cart.nudgeFree', { n: n.more }) : n.gain > 0 ? t('cart.nudgeSave', { n: n.more, amount: money(n.gain) }) : n.kind === 'qty' ? t('cart.nudgeQty', { n: n.more, p: n.percent }) : t('cart.nudgeBxgy', { n: n.more, p: n.percent });
    const total = Math.min(books.length + n.more, 8);
    const html = `<span class="gb-n">${books.length}</span><span class="gb-t">${esc(txt).replace(/(\d+\s?%|free|gratuit\w*|gratis|€\s?[\d.,]+|[\d.,]+\s?€)/gi, '<em>$1</em>')}</span><span class="gb-p">${Array.from({ length: total }, (_, i) => `<i${i < books.length ? ' class="f"' : ''}></i>`).join('')}</span><b>→</b>`;
    if (!bar) { bar = document.createElement('a'); bar.id = 'goal-bar'; bar.href = '#/cart'; bar.onclick = e => { e.preventDefault(); go('/cart'); }; document.body.appendChild(bar); }
    bar.innerHTML = html;
  } catch { }
}
export function goalBar() {
  window.addEventListener('librava:cart', draw);
  window.addEventListener('hashchange', draw); window.addEventListener('popstate', draw);
  setInterval(() => { const has = !!document.getElementById('goal-bar'); if (has !== cart.get().length > 0) draw(); }, 2500);
  draw();
}
