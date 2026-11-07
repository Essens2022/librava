// The goal bar: while there are books in the cart it stays on screen on every page and shows the next reward
// ("one more book and the 4th is -80%"). Reuses the cart's own texts, so it is already in every language.
import { api } from './api.js?v=20261107230141';
import { t, money, getLang } from './i18n.js?v=20261107230141';
import { cart, go, currentPath, GIFT_SVG } from './ui.js?v=20261107230141';
import { applyOffers, appliedLabel } from './offers.js?v=20261107230141';
import { esc, store } from './util.js?v=20261107230141';

const UN = { en: 'Unlocked!', ro: 'Deblocat!', it: 'Sbloccato!', fr: 'Débloqué !', de: 'Freigeschaltet!', es: '¡Desbloqueado!', pt: 'Desbloqueado!', nl: 'Ontgrendeld!', pl: 'Odblokowane!', cs: 'Odemčeno!', sk: 'Odomknuté!', hu: 'Feloldva!', bg: 'Отключено!', hr: 'Otključano!', sl: 'Odklenjeno!', el: 'Ξεκλειδώθηκε!', da: 'Låst op!', sv: 'Upplåst!', no: 'Låst opp!', fi: 'Avattu!', et: 'Avatud!', lv: 'Atbloķēts!', lt: 'Atrakinta!', uk: 'Розблоковано!' };
let prevSaving = null, prevCount = 0;
function pop(label, saving, next) {
  document.getElementById('goal-pop')?.remove();
  const el = document.createElement('a'); el.id = 'goal-pop'; el.href = '#/cart';
  el.innerHTML = `<div class="gift-confetti" aria-hidden="true">${Array.from({ length: 16 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i % 5) * .15}s;--c:${['#F4A340', '#E85D75', '#4FA3D9', '#7BC47F', '#B48CE0'][i % 5]}"></i>`).join('')}</div><span class="gp-i"><i></i><i></i><i></i></span><span class="gp-b"><b>${esc(UN[getLang()] || UN.en)} <u>−${esc(money(saving))}</u></b><small>${esc(label)}</small>${next ? `<small class="gp-n">${esc(next)}</small>` : ''}</span><button type="button" aria-label="Close">×</button>`;
  el.onclick = e => { e.preventDefault(); el.remove(); if (!e.target.closest('button')) go('/cart'); };
  // like a chat notification: right under the goal bar (or the header), about 3 seconds, then a soft fade
  const anchor = document.getElementById('goal-bar') || document.getElementById('hdr');
  el.style.top = Math.round((anchor ? anchor.getBoundingClientRect().bottom : 0) + 8) + 'px';
  document.body.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 700); }, 1400);
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
    // instant: the light catalogue the page already holds has the price and category; only a book missing from it is fetched
    for (const id of ids) if (!bookC.has(id)) { const l = api.__cat?.find(x => x.id === id); if (l) bookC.set(id, l); }
    const need = ids.filter(id => !bookC.has(id));
    if (need.length) await Promise.all(need.map(id => api.getBook(id).then(b => { if (b) bookC.set(id, b); }).catch(() => null)));
    if (my !== seq) return;
    const books = ids.map(id => bookC.get(id)).filter(b => b && b.price_cents > 0);
    if (!books.length) { bar?.remove(); return; }
    const r = applyOffers(books, offersC.filter(o => o.kind !== 'coupon'), {}), n = r.nudges[0];
    const saving = r.discount || 0, grew = prevSaving !== null && books.length > prevCount && saving > prevSaving;
    const top = r.applied.find(a => a.kind !== 'coupon');
    prevSaving = saving; prevCount = books.length;
    if (grew && top) {
      if (!n && bar) { bar.remove(); bar = null; }   // goal reached: the bar leaves and the notice takes its place
      const nx = n ? (n.kind === 'bxgy' && n.percent >= 100 ? t('cart.nudgeFree', { n: n.more }) : n.gain > 0 ? t('cart.nudgeSave', { n: n.more, amount: money(n.gain) }) : n.kind === 'qty' ? t('cart.nudgeQty', { n: n.more, p: n.percent }) : t('cart.nudgeBxgy', { n: n.more, p: n.percent })) : '';
      try { pop(appliedLabel(top, t, c => t('cat.' + c)), saving, nx); } catch { }   // a failing pop-up must never block the bar
    }
    if (!n) { bar?.remove(); return; }
    const txt = n.kind === 'bxgy' && n.percent >= 100 ? t('cart.nudgeFree', { n: n.more }) : n.gain > 0 ? t('cart.nudgeSave', { n: n.more, amount: money(n.gain) }) : n.kind === 'qty' ? t('cart.nudgeQty', { n: n.more, p: n.percent }) : t('cart.nudgeBxgy', { n: n.more, p: n.percent });
    const total = Math.min(books.length + n.more, 8);
    const pct = Math.round(100 * books.length / total);
    const html = `<span class="gb-g">${GIFT_SVG.replace('width="20" height="20"', 'width="20" height="20"')}</span><span class="gb-t">${esc(txt).replace(/(\d+\s?%|free|gratuit\w*|gratis|€\s?[\d.,]+|[\d.,]+\s?€)/gi, '<em>$1</em>')}</span><span class="gb-p"><i style="width:${pct}%"></i></span><span class="gb-go">${esc(t('nav.cart'))} (${ids.length}) →</span>`;
    if (!bar) { bar = document.createElement('a'); bar.id = 'goal-bar'; bar.href = '#/cart'; bar.onclick = e => { e.preventDefault(); go('/cart'); }; document.body.appendChild(bar); }
    const changed = bar.innerHTML && bar.innerHTML !== html;
    bar.innerHTML = html;
    if (changed) { bar.classList.remove('tick'); void bar.offsetWidth; bar.classList.add('tick'); }
    place();
  } catch { }
}
// the strip sits right under the header. The header is sticky, so its bottom edge never moves while the page
// scrolls: measure only when the header or the bar changes size (ResizeObserver / resize), never on scroll
// (a layout read + a root custom property write on every scroll event made iOS Safari stutter).
let raf = 0, lastTop = null, lastH = null;
function place() {
  const bar = document.getElementById('goal-bar'); if (!bar) { lastTop = lastH = null; return; }
  const h = document.getElementById('hdr');
  const top = Math.max(0, Math.round(h ? h.getBoundingClientRect().bottom : 0)), bh = bar.offsetHeight;
  if (top !== lastTop) { bar.style.top = top + 'px'; lastTop = top; }
  if (bh !== lastH) { document.documentElement.style.setProperty('--gb-h', bh + 'px'); lastH = bh; }   // reserve exactly the bar's height so it never covers the page
}
export function goalBar() {
  const again = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; place(); }); };
  window.addEventListener('resize', again); window.addEventListener('orientationchange', again);
  try { const h = document.getElementById('hdr'); if (h && 'ResizeObserver' in window) new ResizeObserver(again).observe(h); } catch { }
  window.addEventListener('librava:cart', draw); window.addEventListener('librava:lang', draw);
  window.addEventListener('hashchange', draw); window.addEventListener('popstate', draw);
  setInterval(() => { const has = !!document.getElementById('goal-bar'); if (has !== cart.get().length > 0) draw(); }, 2500);
  draw();
}
