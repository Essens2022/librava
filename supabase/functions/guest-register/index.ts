// Guest checkout, step 2: the buyer has paid on Stripe without an account and lands on the "create your account" page.
//   action "info":     tells the page the email used for payment and whether an account with it already exists
//   action "register": creates the account (email from Stripe + the password chosen by the buyer) and puts the books in its library
// Safe because the Stripe session id only exists in the buyer's own address after a real payment, and Stripe is asked directly.
// Deploy with --no-verify-jwt (the buyer is not signed in yet). Secret: STRIPE_SECRET_KEY (already set for create-checkout).
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const STRIPE = (Deno.env.get('STRIPE_SECRET_KEY') || '').replace(/[^\x21-\x7E]/g, '');
    if (!STRIPE) return json({ error: 'pay.notConfigured' }, 503);
    const body = await req.json().catch(() => ({}));
    const sid = typeof body.session_id === 'string' ? body.session_id : '';
    if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sid)) return json({ error: 'welcome.badLink' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(sid), { headers: { Authorization: `Bearer ${STRIPE}` } });
    if (!r.ok) return json({ error: 'welcome.badLink' }, 404);
    const session = await r.json();
    const orderId = session.metadata?.order_id;
    if (!orderId) return json({ error: 'welcome.badLink' }, 404);
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return json({ state: 'unpaid' });

    const { data: order } = await admin.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (!order || order.stripe_session_id && order.stripe_session_id !== sid) return json({ error: 'welcome.badLink' }, 404);
    const email = String(session.customer_details?.email || session.customer_email || order.email || '').trim().toLowerCase();
    if (!email) return json({ error: 'welcome.noEmail' }, 400);

    // mark the order paid here too, in case the Stripe message has not arrived yet (the same thing stripe-webhook does)
    if (order.status === 'pending') {
      const { data: upd } = await admin.from('orders').update({ status: 'paid', paid_at: new Date().toISOString(), stripe_session_id: sid, email, livemode: session.livemode !== false }).eq('id', order.id).eq('status', 'pending').select('id');
      if (upd?.length) {
        for (const a of (order.offers || []) as { id: string; kind: string }[]) {
          if (a.kind !== 'coupon') continue;
          const { data: o } = await admin.from('offers').select('uses,config').eq('id', a.id).maybeSingle();
          if (o) await admin.from('offers').update({ uses: (o.uses || 0) + 1, config: { ...(o.config || {}), uses: ((o.config?.uses) || 0) + 1 } }).eq('id', a.id);
        }
      }
    } else if (order.status !== 'paid') return json({ error: 'welcome.badLink' }, 404);
    else if (!order.email) await admin.from('orders').update({ email }).eq('id', order.id);

    if (order.user_id) return json({ state: 'claimed', email });
    const { data: existing } = await admin.rpc('user_id_by_email', { p_email: email });
    if (body.action !== 'register') return json({ state: existing ? 'exists' : 'new', email });

    // an account with this email already exists: never change it from here. The buyer signs in and the books arrive by themselves.
    if (existing) return json({ state: 'exists', email });
    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < 8) return json({ error: 'welcome.short' }, 400);
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
    const lang = typeof body.lang === 'string' ? body.lang.slice(0, 5) : 'en';
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: name || email.split('@')[0], lang, accepted_terms: 'true', marketing: !!body.marketing, via: 'guest-checkout' },
    });
    if (cErr || !created?.user) {
      if (/registered|exists/i.test(cErr?.message || '')) return json({ state: 'exists', email });
      throw cErr || new Error('Could not create the account');
    }
    const uid = created.user.id;
    const rows = (order.items || []).map((it: { book_id: string; price_cents: number }) => ({
      user_id: uid, book_id: it.book_id, order_id: order.id, price_cents: it.price_cents, currency: order.currency, customer_email: email, test: session.livemode === false,
    }));
    const { error: pErr } = await admin.from('purchases').upsert(rows, { onConflict: 'user_id,book_id', ignoreDuplicates: true });
    if (pErr) throw pErr;
    await admin.from('orders').update({ user_id: uid }).eq('id', order.id).is('user_id', null);
    return json({ state: 'created', email });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message || 'Server error' }, 500);
  }
});
