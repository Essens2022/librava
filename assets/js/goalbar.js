// The goal bar: while there are books in the cart it stays on screen on every page and shows the next reward
// ("one more book and the 4th is -80%"). Reuses the cart's own texts, so it is already in every language.
import { api } from './api.js?v=20261103195720';
import { t, money } from './i18n.js?v=20261103195720';
import { cart, go, currentPath } from './ui.js?v=20261103195720';
import { applyOffers, appliedLabel } from './offers.js?v=20261103195720';
import { esc, store } from './util.js?v=20261103195720';

const UN = { en: 'Unlocked!', ro: 'Deblocat!', it: 'Sbloccato!', fr: 'Débloqué !', de: 'Freigeschaltet!', es: '¡Desbloqueado!', pt: 'Desbloqueado!', nl: 'Ontgrendeld!', pl: 'Odblokowane!', cs: 'Odemčeno!', sk: 'Odomknuté!', hu: 'Feloldva!', bg: 'Отключено!', hr: 'Otključano!', sl: 'Odklenjeno!', el: 'Ξεκλειδώθηκε!', da: 'Låst op!', sv: 'Upplåst!', no: 'Låst opp!', fi: 'Avattu!', et: 'Avatud!', lv: 'Atbloķēts!', lt: 'Atrakinta!', uk: 'Розблоковано!' };
let prevSaving = null, prevCount = 0;
function pop(label, saving, next) {
  document.getElementById('goal-pop')?.remove();
  const el = document.createElement('a'); el.id = 'goal-pop'; el.href = '#/cart';
  el.innerHTML = `<div class="gift-confetti" aria-hidden="true">${Array.from({ length: 16 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i % 5) * .15}s;--c:${['#F4A340', '#E85D75', '#4FA3D9', '#7BC47F', '#B48CE0'][i % 5]}"></i>`).join('')}</div><span class="gp-i"><i></i><i></i><i></i></span><span class="gp-b"><b>${esc(UN[getLang()] || UN.en)} <u>−${esc(money(saving))}</u></b><small>${esc(label)}</small>${next ? `<small class="gp-n">${esc(next)}</small>` : ''}</span><button type="button" aria-label="Close">×</button>`;
  el.onclick = e => { e.preventDefault(); el.remove(); if (!e.target.closest('button')) go('/cart'); };
  document.body.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 6500);
}
let seq = 0, offersC = null; const bookC = new Map();
async function draw() {
  const my = ++seq; let bar = document.getElementById('goal-bar');
  const ids = cart.get();
  const onCart = /(^|\/)cart\b/.test(currentPath()) || /^#\/(read|admin)/.test(location.hash) || /^\/(read|admin)/.test(location.pathname);
  if (!ids.length) { prevSaving = null; prevCount = 0; }
  const guided = !!store.get('welcome-bonus', '') && store.get('welcome-until', 0) > Date.now();   // the side panel guides the visitor while the timed gift runs
  if (!ids.length || onCart || guided) { bar?.remove(); return; }
  try {
    if (!offersC) offersC = api.offers ? await api.offers().catch(() => []) : [];
    await Promise.all(ids.filter(id => !bookC.has(id)).map(id => api.getBook(id).then(b => bookC.set(id, b)).catch(() => null)));
    if (my !== seq) return;
    const books = ids.map(id => bookC.get(id)).filter(b => b && b.price_cents > 0);
    if (!books.length) { bar?.remove(); return; }
    const r = applyOffers(books, offersC.filter(o => o.kind !== 'coupon'), {}), n = r.nudges[0];
    const saving = r.discount || 0, grew = prevSaving !== null && books.length > prevCount && saving > prevSaving;
    const top = r.applied.find(a => a.kind !== 'coupon');
    prevSaving = saving; prevCount = books.length;
    if (grew && top) {
      const nx = n ? (n.kind === 'bxgy' && n.percent >= 100 ? t('cart.nudgeFree', { n: n.more }) : n.gain > 0 ? t('cart.nudgeSave', { n: n.more, amount: money(n.gain) }) : n.kind === 'qty' ? t('cart.nudgeQty', { n: n.more, p: n.percent }) : t('cart.nudgeBxgy', { n: n.more, p: n.percent })) : '';
      pop(appliedLabel(top, t, c => t('cat.' + c)), saving, nx);
    }
    if (!n) { bar?.remove(); return; }
    const txt = n.kind === 'bxgy' && n.percent >= 100 ? t('cart.nudgeFree', { n: n.more }) : n.gain > 0 ? t('cart.nudgeSave', { n: n.more, amount: money(n.gain) }) : n.kind === 'qty' ? t('cart.nudgeQty', { n: n.more, p: n.percent }) : t('cart.nudgeBxgy', { n: n.more, p: n.percent });
    const total = Math.min(books.length + n.more, 8);
    const html = `<span class="gb-n">${books.length}</span><span class="gb-t">${esc(txt).replace(/(\d+\s?%|free|gratuit\w*|gratis|€\s?[\d.,]+|[\d.,]+\s?€)/gi, '<em>$1</em>')}</span><span class="gb-p">${Array.from({ length: total }, (_, i) => `<i${i < books.length ? ' class="f"' : ''}></i>`).join('')}</span><b>→</b>`;
    if (!bar) { bar = document.createElement('a'); bar.id = 'goal-bar'; bar.href = '#/cart'; bar.onclick = e => { e.preventDefault(); go('/cart'); }; document.body.appendChild(bar); }
    const changed = bar.innerHTML && bar.innerHTML !== html;
    bar.innerHTML = html;
    if (changed) { bar.classList.remove('tick'); void bar.offsetWidth; bar.classList.add('tick'); }
    place();
  } catch { }
}
// the strip sits right under the header and follows it while the page scrolls
let raf = 0;
function place() {
  const bar = document.getElementById('goal-bar'); if (!bar) return;
  const h = document.getElementById('hdr');
  bar.style.top = Math.max(0, Math.round(h ? h.getBoundingClientRect().bottom : 0)) + 'px';
}
export function goalBar() {
  const again = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; place(); }); };
  window.addEventListener('scroll', again, { passive: true }); window.addEventListener('resize', again);
  window.addEventListener('librava:cart', draw); window.addEventListener('librava:lang', draw);
  window.addEventListener('hashchange', draw); window.addEventListener('popstate', draw);
  setInterval(() => { const has = !!document.getElementById('goal-bar'); if (has !== cart.get().length > 0) draw(); }, 2500);
  draw();
}
