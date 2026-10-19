// Receives Stripe events and adds paid books to the buyer's library.
// Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets: STRIPE_WEBHOOK_SECRET  (from Stripe → Developers → Webhooks)
// Stripe events to send: checkout.session.completed, checkout.session.async_payment_succeeded
import { createClient } from 'npm:@supabase/supabase-js@2';

const enc = new TextEncoder();

async function verify(raw: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => { const i = kv.indexOf('='); return [kv.slice(0, i), kv.slice(i + 1)]; }));
  const sigs = header.split(',').filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3));
  const ts = Number(parts.t);
  if (!ts || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false; // 5 minute tolerance
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${raw}`)));
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
  return sigs.some((s) => {
    if (s.length !== hex.length) return false;
    let d = 0; for (let i = 0; i < s.length; i++) d |= s.charCodeAt(i) ^ hex.charCodeAt(i);
    return d === 0;
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const raw = await req.text();
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret || !(await verify(raw, req.headers.get('stripe-signature'), secret))) {
    return new Response('Invalid signature', { status: 400 });
  }
  const event = JSON.parse(raw);
  const type = event.type as string;
  if (type !== 'checkout.session.completed' && type !== 'checkout.session.async_payment_succeeded') {
    return new Response('ignored', { status: 200 });
  }
  const session = event.data.object;
  if (session.payment_status !== 'paid') return new Response('not paid yet', { status: 200 });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const orderId = session.metadata?.order_id;
  const { data: order, error } = await admin.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (error || !order) { console.error('order not found', orderId, error); return new Response('order not found', { status: 200 }); }
  if (order.status !== 'pending') return new Response('already processed', { status: 200 });

  const email = session.customer_details?.email || session.customer_email || order.email || null;
  const rows = (order.items as { book_id: string; price_cents: number }[]).map((it) => ({
    user_id: order.user_id, book_id: it.book_id, order_id: order.id,
    price_cents: it.price_cents, currency: order.currency, customer_email: email,
  }));
  const { error: pErr } = await admin.from('purchases').upsert(rows, { onConflict: 'user_id,book_id', ignoreDuplicates: true });
  if (pErr) { console.error(pErr); return new Response('db error', { status: 500 }); } // Stripe will retry

  await admin.from('orders').update({ status: 'paid', paid_at: new Date().toISOString(), stripe_session_id: session.id, email: email || order.email }).eq('id', order.id).eq('status', 'pending');
  return new Response('ok', { status: 200 });
});
