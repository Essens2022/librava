// Creates a Stripe Checkout session for the books in the cart.
// Deploy:  supabase functions deploy create-checkout
// Secret: STRIPE_SECRET_KEY (Supabase → Edge Functions → Secrets). SUPABASE_* are provided automatically.
// SITE_URL is optional: the shop address is not a secret, https://librava.store is used by default.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const STRIPE = Deno.env.get('STRIPE_SECRET_KEY');
    const SITE = (Deno.env.get('SITE_URL') || 'https://librava.store').replace(/[#?].*$/, '');
    if (!STRIPE) return json({ error: 'pay.notConfigured' }, 503);

    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'lib.loginNeeded' }, 401);

    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.book_ids) ? body.book_ids.filter((x: unknown) => typeof x === 'string' && UUID.test(x)).slice(0, 50) : [];
    if (!ids.length) return json({ error: 'cart.empty' }, 400);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: books, error } = await admin.from('books')
      .select('id,title,author,price_cents,currency')
      .in('id', ids).eq('status', 'published').is('deleted_at', null);
    if (error) throw error;
    const { data: owned } = await admin.from('purchases').select('book_id').eq('user_id', user.id).in('book_id', ids);
    const ownedSet = new Set((owned || []).map((p) => p.book_id));
    const toBuy = (books || []).filter((b) => b.price_cents > 0 && !ownedSet.has(b.id));
    if (!toBuy.length) return json({ error: 'cart.empty' }, 400);

    const currency = (toBuy[0].currency || 'eur').toLowerCase();
    const amount = toBuy.reduce((s, b) => s + b.price_cents, 0);
    const { data: order, error: oErr } = await admin.from('orders').insert({
      user_id: user.id, email: user.email, method: 'card', currency, amount_cents: amount,
      items: toBuy.map((b) => ({ book_id: b.id, title: b.title, price_cents: b.price_cents })),
    }).select('id, reference').single();
    if (oErr) throw oErr;

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
    toBuy.forEach((b, i) => {
      p.set(`line_items[${i}][quantity]`, '1');
      p.set(`line_items[${i}][price_data][currency]`, currency);
      p.set(`line_items[${i}][price_data][unit_amount]`, String(b.price_cents));
      p.set(`line_items[${i}][price_data][product_data][name]`, b.title.slice(0, 250));
      p.set(`line_items[${i}][price_data][product_data][description]`, `eBook · ${b.author}`.slice(0, 250));
    });

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${STRIPE}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: p,
    });
    const session = await res.json();
    if (!res.ok) return json({ error: session?.error?.message || 'Stripe error' }, 502);

    await admin.from('orders').update({ stripe_session_id: session.id }).eq('id', order.id);
    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message || 'Server error' }, 500);
  }
});
