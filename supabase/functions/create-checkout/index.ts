// Creates a Stripe Checkout session for the books in the cart.
// Secret: STRIPE_SECRET_KEY (Supabase → Edge Functions → Secrets). SUPABASE_* are provided automatically.
// SITE_URL is optional: the shop address is not a secret, https://librava.store is used by default.
import { createClient } from 'npm:@supabase/supabase-js@2';
// same offers engine as the shop (copied from assets/js/offers.js when deploying)
import { applyOffers } from './offers.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function countCoupon(admin: any, id: string) {
  const { data: o } = await admin.from('offers').select('uses,config').eq('id', id).maybeSingle();
  if (o) await admin.from('offers').update({ uses: (o.uses || 0) + 1, config: { ...(o.config || {}), uses: ((o.config?.uses) || 0) + 1 } }).eq('id', id);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    // remove spaces / invisible characters that sneak in when a key is copied from a web page
    const STRIPE = (Deno.env.get('STRIPE_SECRET_KEY') || '').replace(/[^\x21-\x7E]/g, '');
    const SITE = (Deno.env.get('SITE_URL') || 'https://librava.store').replace(/[#?].*$/, '');
    if (!STRIPE) return json({ error: 'pay.notConfigured' }, 503);
    if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/.test(STRIPE)) {
      console.error('STRIPE_SECRET_KEY has the wrong format (starts with: ' + STRIPE.slice(0, 8) + ', length ' + STRIPE.length + ')');
      return json({ error: 'Payments are being set up: the Stripe secret key saved in Supabase is not a valid sk_ key.' }, 503);
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'lib.loginNeeded' }, 401);

    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.book_ids) ? body.book_ids.filter((x: unknown) => typeof x === 'string' && UUID.test(x)).slice(0, 50) : [];
    if (!ids.length) return json({ error: 'cart.empty' }, 400);
    // EU rule for digital content: the buyer must agree to immediate delivery and accept losing the 14-day withdrawal right
    if (body.waiver !== true) return json({ error: 'pay.waiverNeeded' }, 400);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: books, error } = await admin.from('books')
      .select('id,title,author,price_cents,currency,category,categories')
      .in('id', ids).eq('status', 'published').is('deleted_at', null);
    if (error) throw error;
    const { data: owned } = await admin.from('purchases').select('book_id').eq('user_id', user.id).in('book_id', ids);
    const ownedSet = new Set((owned || []).map((p) => p.book_id));
    const toBuy = (books || []).filter((b) => b.price_cents > 0 && !ownedSet.has(b.id));
    if (!toBuy.length) return json({ error: 'cart.empty' }, 400);

    const currency = (toBuy[0].currency || 'eur').toLowerCase();
    // discounts are calculated here on the server, never trusted from the browser
    const code = typeof body.coupon === 'string' ? body.coupon.trim().toUpperCase().slice(0, 40) : '';
    const { data: offerRows } = await admin.from('offers').select('*').eq('active', true);
    const offers = (offerRows || []).filter((o) => o.kind !== 'coupon' || (code && String(o.config?.code || '').toUpperCase() === code));
    const { count: paidOrders } = await admin.from('orders').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'paid');
    const calc = applyOffers(toBuy, offers, { coupon: code, hasOrders: (paidOrders || 0) > 0 });
    const amount = calc.total;
    const usedCoupon = calc.applied.find((a) => a.kind === 'coupon');
    const { data: order, error: oErr } = await admin.from('orders').insert({
      user_id: user.id, email: user.email, method: 'card', currency, amount_cents: amount, waiver_at: new Date().toISOString(),
      livemode: /^(sk|rk)_live_/.test(STRIPE),
      subtotal_cents: calc.subtotal, discount_cents: calc.discount, coupon_code: usedCoupon ? code : null,
      offers: calc.applied.map((a) => ({ id: a.id, kind: a.kind, name: a.name, saving: a.saving })),
      items: toBuy.map((b) => ({ book_id: b.id, title: b.title, price_cents: calc.final[b.id] ?? b.price_cents, list_cents: b.price_cents })),
    }).select('id, reference').single();
    if (oErr) throw oErr;
    // everything is covered by the offers (e.g. a 100% coupon): add the books straight away, no card needed
    if (amount === 0) {
      const rows = toBuy.map((b) => ({ user_id: user.id, book_id: b.id, order_id: order.id, price_cents: 0, currency, customer_email: user.email, test: !/^(sk|rk)_live_/.test(STRIPE) }));
      const { error: pErr } = await admin.from('purchases').upsert(rows, { onConflict: 'user_id,book_id', ignoreDuplicates: true });
      if (pErr) throw pErr;
      await admin.from('orders').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', order.id);
      if (usedCoupon) await countCoupon(admin, usedCoupon.id);
      return json({ mode: 'done' });
    }

    const base = SITE.endsWith('/') ? SITE : SITE + '/';
    const p = new URLSearchParams();
    p.set('mode', 'payment');
    p.set('success_url', `${base}?paid=1#/library`);
    p.set('cancel_url', `${base}#/cart`);
    p.set('client_reference_id', user.id);
    if (user.email) p.set('customer_email', user.email);
    p.set('locale', 'auto');
    p.set('metadata[order_id]', order.id);
    p.set('metadata[reference]', order.reference);
    p.set('payment_intent_data[metadata][order_id]', order.id);
    // the payment page shows "Librava" with the shop's colours, even if the Stripe account has another name
    p.set('branding_settings[display_name]', 'Librava');
    p.set('branding_settings[button_color]', '#4F7F33');
    p.set('branding_settings[background_color]', '#FFFFFF');
    p.set('branding_settings[border_style]', 'rounded');
    // on the buyer's card statement: "<account prefix>* LIBRAVA"
    p.set('payment_intent_data[statement_descriptor_suffix]', 'LIBRAVA');
    toBuy.forEach((b, i) => {
      p.set(`line_items[${i}][quantity]`, '1');
      p.set(`line_items[${i}][price_data][currency]`, currency);
      p.set(`line_items[${i}][price_data][unit_amount]`, String(b.price_cents));
      p.set(`line_items[${i}][price_data][product_data][name]`, b.title.slice(0, 250));
      p.set(`line_items[${i}][price_data][product_data][description]`, `eBook · ${b.author}`.slice(0, 250));
    });

    // the discount appears on Stripe's payment page as one line, with the offer's name
    if (calc.discount > 0) {
      const label = ('Librava: ' + (calc.applied.map((a) => a.name || (a.kind === 'coupon' ? code : 'offer')).join(' + '))).slice(0, 40);
      const cp = new URLSearchParams({ amount_off: String(calc.discount), currency, duration: 'once', max_redemptions: '1', name: label });
      const cr = await fetch('https://api.stripe.com/v1/coupons', { method: 'POST', headers: { Authorization: `Bearer ${STRIPE}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: cp });
      const cj = await cr.json();
      if (!cr.ok) { await admin.from('orders').update({ status: 'cancelled' }).eq('id', order.id); return json({ error: cj?.error?.message || 'Stripe error' }, 502); }
      p.set('discounts[0][coupon]', cj.id);
    }
    const send = () => fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${STRIPE}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: p,
    });
    let res = await send();
    let session = await res.json();
    // if this Stripe account's API version doesn't know the branding options, pay without them rather than fail
    if (!res.ok && /branding_settings|statement_descriptor/.test(String(session?.error?.param || session?.error?.message || ''))) {
      for (const k of [...p.keys()]) if (k.startsWith('branding_settings') || k.includes('statement_descriptor')) p.delete(k);
      res = await send();
      session = await res.json();
    }
    if (!res.ok) {
      await admin.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
      return json({ error: session?.error?.message || 'Stripe error' }, 502);
    }

    await admin.from('orders').update({ stripe_session_id: session.id }).eq('id', order.id);
    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message || 'Server error' }, 500);
  }
});
