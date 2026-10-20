// Asks Stripe directly whether a card payment went through, and if so adds the books to the buyer's library.
// It is the backup of stripe-webhook: called when the buyer comes back from the payment page and when an
// administrator opens the admin panel, so a sale is never lost even if a webhook is missing or late.
// Secret: STRIPE_SECRET_KEY (already used by create-checkout). Nothing secret is in the site's code.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// same work as stripe-webhook: books into the library, order paid, coupon counted (only once)
async function fulfill(admin: any, order: any, session: any) {
  const email = session.customer_details?.email || session.customer_email || order.email || null;
  const test = session.livemode === false;
  const rows = (order.items || []).map((it: { book_id: string; price_cents: number }) => ({
    user_id: order.user_id, book_id: it.book_id, order_id: order.id,
    price_cents: it.price_cents, currency: order.currency, customer_email: email, test,
  }));
  const { error } = await admin.from('purchases').upsert(rows, { onConflict: 'user_id,book_id', ignoreDuplicates: true });
  if (error) throw error;
  const { data: upd } = await admin.from('orders')
    .update({ status: 'paid', paid_at: new Date().toISOString(), email: email || order.email, livemode: session.livemode !== false })
    .eq('id', order.id).eq('status', 'pending').select('id');
  if (upd?.length) {
    for (const a of (order.offers || []) as { id: string; kind: string }[]) {
      if (a.kind !== 'coupon') continue;
      const { data: o } = await admin.from('offers').select('uses,config').eq('id', a.id).maybeSingle();
      if (o) await admin.from('offers').update({ uses: (o.uses || 0) + 1, config: { ...(o.config || {}), uses: ((o.config?.uses) || 0) + 1 } }).eq('id', a.id);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const STRIPE = (Deno.env.get('STRIPE_SECRET_KEY') || '').replace(/[^\x21-\x7E]/g, '');
    if (!STRIPE) return json({ checked: 0, paid: [] });
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'login' }, 401);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();

    // card orders still waiting, from the last 3 days (Stripe payment pages expire after 24 hours)
    let q = admin.from('orders').select('*').eq('status', 'pending').eq('method', 'card').not('stripe_session_id', 'is', null)
      .gte('created_at', new Date(Date.now() - 3 * 864e5).toISOString()).order('created_at', { ascending: false }).limit(25);
    if (!prof?.is_admin) q = q.eq('user_id', user.id);
    const { data: orders, error } = await q;
    if (error) throw error;

    const keyLive = /^(sk|rk)_live_/.test(STRIPE);
    const paid: string[] = [];
    let cancelled = 0;
    for (const o of orders || []) {
      // a test-mode payment page can't be looked up with the live key (and the other way round)
      if (String(o.stripe_session_id).startsWith('cs_live_') !== keyLive) continue;
      const r = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(o.stripe_session_id), {
        headers: { Authorization: `Bearer ${STRIPE}` },
      });
      if (!r.ok) { console.error('stripe', r.status, await r.text()); continue; }
      const s = await r.json();
      if (s.payment_status === 'paid' || s.payment_status === 'no_payment_required') { await fulfill(admin, o, s); paid.push(o.reference); }
      else if (s.status === 'expired') { await admin.from('orders').update({ status: 'cancelled' }).eq('id', o.id).eq('status', 'pending'); cancelled++; }
    }
    return json({ checked: (orders || []).length, paid, cancelled });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message || 'Server error' }, 500);
  }
});
