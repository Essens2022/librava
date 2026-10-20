// Rebuilds the /book/<id>/ share pages right after an administrator publishes or changes a book,
// so a link sent on WhatsApp shows the cover and title within ~2 minutes.
// Secret (Supabase → Edge Functions → Secrets): GITHUB_TOKEN — a fine-grained GitHub token for
// Essens2022/librava with only "Actions: Read and write". It is never in the site's code.
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
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'login' }, 401);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: p } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    if (!p?.is_admin) return json({ error: 'forbidden' }, 403);

    const token = (Deno.env.get('GITHUB_TOKEN') || '').replace(/[^\x21-\x7E]/g, '');
    if (!token) return json({ ok: false, reason: 'no-token' });
    const r = await fetch('https://api.github.com/repos/Essens2022/librava/actions/workflows/book-pages.yml/dispatches', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'librava', 'X-GitHub-Api-Version': '2022-11-28' },
      body: JSON.stringify({ ref: 'main' }),
    });
    if (!r.ok) { console.error('GitHub', r.status, await r.text()); return json({ ok: false, reason: 'github-' + r.status }); }
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
