// Deletes the signed-in customer's own account. Their sales records stay (without the account).
// The password is checked in the browser just before this is called.
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
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'lib.loginNeeded' }, 401);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    if (prof?.is_admin) return json({ error: 'The administrator account cannot be deleted here.' }, 403);
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message || 'Server error' }, 500);
  }
});
