// Librava offers engine — the same file runs in the shop (to show prices) and on the server
// (create-checkout, to charge them), so what the customer sees is exactly what they pay.
// No imports: plain JavaScript that works in the browser and in Deno.
//
// Offer kinds (offer.config):
//   bundle   { book_ids:[…], percent }                 these books together: -percent on them
//   qty      { tiers:[{min,percent}], category?, book_ids? }  N or more books (optionally of a category / list): -percent
//   bxgy     { buy, get, percent=100, category? }      buy X, get Y (the cheapest) free or -percent
//   category { category, percent }                      every book of a category -percent (a sale)
//   coupon   { code, percent | amount_cents, min_cents?, max_uses?, uses?, new_only? }  code typed in the cart
// offer.stackable = can be added on top of the best non-stackable offer; offer.priority breaks ties.
// Discount codes always come on top of the automatic offers (as on Amazon).

export const OFFER_KINDS = ['bundle', 'qty', 'bxgy', 'category', 'coupon'];
const MIN_CHARGE = 50; // Stripe needs at least 0,50 € per payment

export function offerRunning(o, now = new Date()) {
  return o && o.active !== false && (!o.starts_at || new Date(o.starts_at) <= now) && (!o.ends_at || new Date(o.ends_at) > now);
}
const inCat = (b, c) => !c || b.category === c || (b.categories || []).includes(c);
const pct = (cents, p) => Math.round(cents * Math.min(100, Math.max(0, +p || 0)) / 100);

// ---- rounds ladder ("buy 1 get 1 -30%", "buy 2 get 1 -45%" … "buy 4 get 1 free"): the steps repeat in rounds ----
// Every full round (top step, e.g. 5 products) gives its last product at the top step's discount (e.g. free); the products
// left over start a new round and get the discount of the step they reach (2nd product -30%, 3rd -45% …).
// The cheapest products of the cart are the discounted ones. Offers with a category, timed welcome gifts and
// "get more than one" are not part of the ladder: they are separate offers.
export const isStep = o => o && o.kind === 'bxgy' && !o.config?.category && !o.config?.welcome && (+o.config?.get || 1) === 1 && !o.stackable;
export function ladderSteps(offers) {
  return (offers || []).filter(isStep).map(o => ({ size: (+o.config.buy || 1) + 1, percent: +(o.config.percent ?? 100), offer: o })).sort((a, b) => a.size - b.size);
}
// where a cart with n products stands: completed rounds, products in the current round, the step reached
export function ladderState(steps, n) {
  if (!steps.length || n < 1) return { top: 0, rounds: 0, pos: 0, cur: null, next: null };
  const top = steps[steps.length - 1].size, rounds = Math.floor(n / top), pos = n % top;
  const cur = [...steps].reverse().find(x => x.size <= pos) || null;
  const next = steps.find(x => x.size > pos) || null;
  return { top, rounds, pos, cur, next };
}
function ladderSaving(steps, paid) {
  const per = {}, lines = [];
  if (!steps.length) return { saving: 0, per, lines };
  const st = ladderState(steps, paid.length), topStep = steps[steps.length - 1];
  const asc = [...paid].sort((a, b) => a.price_cents - b.price_cents || String(a.id).localeCompare(String(b.id)));
  const give = (item, step, round, free) => { const v = pct(item.price_cents, step.percent); if (v > 0) { per[item.id] = (per[item.id] || 0) + v; lines.push({ step, round, saving: v, free }); } };
  for (let k = 0; k < st.rounds; k++) give(asc[k], topStep, k + 1, topStep.percent >= 100);
  if (st.cur) give(asc[st.rounds], st.cur, st.rounds + 1, false);
  return { saving: Object.values(per).reduce((a, b) => a + b, 0), per, lines };
}

// what one offer saves on the given items (each item: {id, price_cents, category, categories}); returns {saving, per:{id:cents}}
export function offerSaving(o, items, ctx = {}) {
  const c = o.config || {}, per = {}; let detail = {};
  const add = (id, v) => { if (v > 0) per[id] = (per[id] || 0) + v; };
  const paid = items.filter(i => i.price_cents > 0);
  if (o.kind === 'bundle') {
    const ids = c.book_ids || [];
    if (ids.length >= 2 && ids.every(id => paid.some(i => i.id === id))) paid.filter(i => ids.includes(i.id)).forEach(i => add(i.id, pct(i.price_cents, c.percent)));
  } else if (o.kind === 'qty') {
    const elig = paid.filter(i => inCat(i, c.category) && (!c.book_ids?.length || c.book_ids.includes(i.id)));
    const tier = (c.tiers || []).filter(t => elig.length >= +t.min).sort((a, b) => b.percent - a.percent)[0];
    if (tier) { elig.forEach(i => add(i.id, pct(i.price_cents, tier.percent))); detail = { n: elig.length, min: +tier.min, percent: +tier.percent }; }
  } else if (o.kind === 'bxgy') {
    const buy = Math.max(1, +c.buy || 2), get = Math.max(1, +c.get || 1);
    const elig = paid.filter(i => inCat(i, c.category)).sort((a, b) => b.price_cents - a.price_cents);
    const groups = Math.floor(elig.length / (buy + get)); detail = { groups };
    // the cheapest books of the cart are the free ones (as in "3 for 2")
    elig.slice(elig.length - groups * get).forEach(i => add(i.id, pct(i.price_cents, c.percent ?? 100)));
  } else if (o.kind === 'category') {
    paid.filter(i => inCat(i, c.category)).forEach(i => add(i.id, pct(i.price_cents, c.percent)));
  } else if (o.kind === 'coupon') {
    const sub = paid.reduce((s, i) => s + i.price_cents, 0);
    if (!ctx.coupon || String(ctx.coupon).trim().toUpperCase() !== String(c.code || '').trim().toUpperCase()) return { saving: 0, per };
    if (c.min_cents && sub < c.min_cents) return { saving: 0, per, reason: 'min' };
    if (c.max_uses && (c.uses || 0) >= c.max_uses) return { saving: 0, per, reason: 'used' };
    if (c.new_only && ctx.hasOrders) return { saving: 0, per, reason: 'new' };
    if (c.percent) paid.forEach(i => add(i.id, pct(i.price_cents, c.percent)));
    else if (c.amount_cents && sub) {
      // a fixed amount is shared over the books in proportion to their price
      let left = Math.min(c.amount_cents, sub);
      paid.forEach((i, k) => { const v = k === paid.length - 1 ? left : Math.round(Math.min(c.amount_cents, sub) * i.price_cents / sub); add(i.id, Math.min(v, left)); left -= Math.min(v, left); });
    }
  }
  const saving = Object.values(per).reduce((a, b) => a + b, 0);
  return { saving, per, detail };
}

// best combination: the single best non-stackable offer + every stackable offer on what is left
export function applyOffers(items, offers, ctx = {}) {
  const now = ctx.now || new Date();
  // offers marked config.welcome only run inside the visitor's timed window (ctx.welcome, or the browser's saved window end) and for visitors without paid orders
  let wl = ctx.welcome;
  if (wl === undefined) { try { wl = Number(localStorage.getItem('librava:welcome-until')) > Date.now(); } catch { wl = false; } }
  const run = (offers || []).filter(o => offerRunning(o, now) && (!o.config?.welcome || (wl && !ctx.hasOrders)));
  const paid = items.filter(i => i.price_cents > 0);
  const price = Object.fromEntries(paid.map(i => [i.id, i.price_cents]));
  const subtotal = paid.reduce((s, i) => s + i.price_cents, 0);
  const applied = [];
  const take = (o, r) => { for (const id in r.per) { const v = Math.min(r.per[id], price[id]); price[id] -= v; } applied.push({ id: o.id, kind: o.kind, name: o.name || '', offer: o, detail: r.detail || {}, saving: Object.values(r.per).reduce((a, b) => a + b, 0) }); };
  const stacks = o => o.stackable || o.kind === 'coupon';
  const steps = ladderSteps(run);
  const lad = steps.length ? ladderSaving(steps, paid) : null;
  const solo = run.filter(o => !stacks(o) && !isStep(o)).map(o => [o, offerSaving(o, paid, ctx)]).filter(([, r]) => r.saving > 0)
    .concat(lad && lad.saving > 0 ? [[{ ...steps[steps.length - 1].offer, __ladder: true }, lad]] : [])
    .sort((a, b) => b[1].saving - a[1].saving || (b[0].priority || 0) - (a[0].priority || 0));
  if (solo[0] && solo[0][0].__ladder) {
    // one line per round: "5 for the price of 4" for every full round, then the step the leftover products reached
    for (const id in lad.per) price[id] -= Math.min(lad.per[id], price[id]);
    for (const l of lad.lines) applied.push({ id: l.step.offer.id, kind: 'bxgy', name: l.step.offer.name || '', offer: l.step.offer, detail: { round: l.round, free: l.free ? 1 : 0, ladder: true }, saving: l.saving });
  } else if (solo[0]) take(solo[0][0], solo[0][1]);
  for (const o of run.filter(stacks).sort((a, b) => ((a.kind === 'coupon') - (b.kind === 'coupon')) || (b.priority || 0) - (a.priority || 0))) {
    const r = offerSaving(o, paid.map(i => ({ ...i, price_cents: price[i.id] })), ctx);
    if (r.saving > 0) take(o, r);
  }
  let total = Object.values(price).reduce((a, b) => a + b, 0);
  // never below the minimum card payment: give back the difference on the last offer
  if (total > 0 && total < MIN_CHARGE && subtotal >= MIN_CHARGE) {
    const restore = MIN_CHARGE - total; let back = restore;
    for (const id of Object.keys(price)) { const room = paid.find(i => i.id === id).price_cents - price[id]; const v = Math.min(room, back); price[id] += v; back -= v; if (!back) break; }
    total = MIN_CHARGE;
    const last = applied[applied.length - 1]; if (last) last.saving -= restore;
  }
  const discount = subtotal - total;
  // coupon typed but not used: tell why
  let couponState = null;
  if (ctx.coupon) {
    const co = run.find(o => o.kind === 'coupon' && String(o.config?.code || '').toUpperCase() === String(ctx.coupon).trim().toUpperCase());
    couponState = !co ? 'invalid' : applied.some(a => a.id === co.id) ? 'ok' : (offerSaving(co, paid, ctx).reason || 'notBest');
  }
  return { subtotal, total, discount, applied, final: price, couponState, nudges: ctx.noNudge ? [] : nudges(paid, run, offers, ctx, discount, applied) };
}

// "add 1 more book to get -15%": like Amazon, only ONE automatic offer applies (the best one for the customer),
// so a hint is shown only if it is really what the customer will get. Each hint is checked by adding the books it
// asks for (priced like the cheapest eligible book in the cart) and running the same calculation: if another offer
// would win instead, or the customer would not save more, the hint is dropped. Only the best hint is shown.
function nudges(paid, run, offers, ctx, discountNow, applied = []) {
  const out = [];
  // a customer who already has an offer at least as generous (same kind) is never pushed towards a "lower" step
  const have = k => Math.max(0, ...applied.filter(a => a.kind === k).map(a => k === 'qty' ? +(a.detail?.percent || 0) : +(a.offer?.config?.percent ?? 100)));
  for (const o of run) {
    const c = o.config || {};
    if (o.kind === 'bxgy' && !isStep(o) && have('bxgy') >= (c.percent ?? 100)) continue;
    let n0 = null;
    if (o.kind === 'qty') {
      const n = paid.filter(i => inCat(i, c.category) && (!c.book_ids?.length || c.book_ids.includes(i.id))).length;
      const next = (c.tiers || []).filter(t => +t.min > n).sort((a, b) => a.min - b.min)[0];
      if (next && +next.percent > have('qty') && +next.min - n <= 2) n0 = { id: o.id, kind: 'qty', more: +next.min - n, percent: +next.percent, category: c.category || null };
    } else if (o.kind === 'bxgy') {
      // always the NEXT step up: a better offer than the one the customer has now, that needs the fewest more books
      const total = paid.filter(i => inCat(i, c.category)).length, size = (+c.buy || 2) + (+c.get || 1);
      // ladder steps repeat in rounds: only the products of the current round count
      const lt = isStep(o) ? ladderState(ladderSteps(run), total).top : 0;
      const n = lt ? total % lt : total;
      if (n > 0 && size > n) { out.push({ id: o.id, kind: 'bxgy', more: size - n, buy: +c.buy || 2, get: +c.get || 1, percent: c.percent ?? 100, category: c.category || null }); }
      continue;
    }
    if (!n0 || o.config?.book_ids?.length) continue;
    const elig = paid.filter(i => inCat(i, c.category));
    if (!elig.length) continue;
    const p = Math.min(...elig.map(i => i.price_cents));
    const extra = Array.from({ length: n0.more }, (_, k) => ({ id: '__more' + k, price_cents: p, category: c.category || (elig[0].category), categories: c.category ? [c.category] : elig[0].categories }));
    const r = applyOffers([...paid, ...extra], offers, { ...ctx, noNudge: true });
    const wins = r.applied.some(a => a.id === o.id && !(a.offer?.stackable));
    const gain = r.discount - discountNow;
    if (wins && gain > 0) out.push({ ...n0, gain });
  }
  out.sort((a, b) => a.more - b.more || (a.percent - b.percent) || ((b.gain || 0) - (a.gain || 0)));
  return out.slice(0, 1);
}

// short text for an offer, in the visitor's language (t = translation function)
export function describeOffer(o, t, catName = c => c) {
  const c = o.config || {};
  if (o.kind === 'bundle') return t('of.d.bundle', { p: c.percent, n: (c.book_ids || []).length });
  if (o.kind === 'qty') { const best = (c.tiers || []).slice().sort((a, b) => a.min - b.min); return best.map(x => t('of.d.qty', { n: x.min, p: x.percent })).join(' · ') + (c.category ? ' · ' + catName(c.category) : ''); }
  if (o.kind === 'bxgy') return ((c.percent ?? 100) >= 100 ? t('of.d.bxgyFree', { a: (+c.buy || 2) + (+c.get || 1), b: +c.buy || 2, n: +c.get || 1 }) : t('of.d.bxgy', { buy: c.buy, get: c.get, p: c.percent })) + (c.category ? ' · ' + catName(c.category) : '');
  if (o.kind === 'category') return t('of.d.category', { p: c.percent, cat: catName(c.category) });
  if (o.kind === 'coupon') return c.percent ? t('of.d.couponP', { code: c.code, p: c.percent }) : t('of.d.couponA', { code: c.code, a: ((c.amount_cents || 0) / 100).toFixed(2).replace('.', ',') + ' €' });
  return o.name || '';
}
// which offers mention this book (for the badges on the book page)
export function offersForBook(b, offers) {
  let wl = false; try { wl = Number(localStorage.getItem('librava:welcome-until')) > Date.now(); } catch { }
  return (offers || []).filter(o => offerRunning(o) && o.kind !== 'coupon' && (!o.config?.welcome || wl) && (
    (o.kind === 'bundle' && (o.config?.book_ids || []).includes(b.id)) ||
    ((o.kind === 'qty') && inCat(b, o.config?.category) && (!o.config?.book_ids?.length || o.config.book_ids.includes(b.id))) ||
    ((o.kind === 'bxgy' || o.kind === 'category') && inCat(b, o.config?.category))));
}

// one line in the cart for an offer that was applied: exactly what the customer got ("2 books -10%", "Code X -10%")
export function appliedLabel(a, t, catName = c => c) {
  const o = a.offer || {}, c = o.config || {}, d = a.detail || {};
  let txt;
  if (a.kind === 'qty') txt = t('of.a.qty', { n: d.n || d.min, p: d.percent }) + (c.category ? ' · ' + catName(c.category) : '');
  else if (a.kind === 'coupon') txt = t('of.a.coupon', { code: c.code, v: c.percent ? '-' + c.percent + '%' : '-' + ((c.amount_cents || 0) / 100).toFixed(2).replace('.', ',') + ' €' });
  else txt = describeOffer(o, t, catName);
  return o.name && a.kind !== 'coupon' ? `${o.name}: ${txt}` : txt;
}
