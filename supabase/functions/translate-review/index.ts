// Translates one review into the visitor's language (the language of their phone / computer).
// Each review is translated only once per language and kept, so it is fast and almost free.
// Secret: DEEPL_API_KEY (Supabase → Edge Functions → Secrets). Free DeepL keys end in ":fx".
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// the shop's 24 languages → DeepL target codes (Croatian is not offered by DeepL)
const TARGET: Record<string, string> = { ro: 'RO', it: 'IT', en: 'EN-GB', es: 'ES', fr: 'FR', de: 'DE', pt: 'PT-PT', nl: 'NL', pl: 'PL', sv: 'SV', da: 'DA', no: 'NB', nb: 'NB', fi: 'FI', cs: 'CS', sk: 'SK', sl: 'SL', hu: 'HU', bg: 'BG', el: 'EL', et: 'ET', lv: 'LV', lt: 'LT', uk: 'UK' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.review_id || ''), lang = String(body.lang || '').toLowerCase().slice(0, 2);
    if (!UUID.test(id) || !/^[a-z]{2}$/.test(lang)) return json({ error: 'bad-request' }, 400);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: cached } = await admin.from('review_translations').select('title,body,src').eq('review_id', id).eq('lang', lang).maybeSingle();
    if (cached) return json({ ...cached, same: cached.src === lang });
    const { data: r } = await admin.from('reviews').select('id,title,body,lang').eq('id', id).maybeSingle();
    if (!r) return json({ error: 'not-found' }, 404);
    if (r.lang === lang) return json({ same: true, src: lang });

    const KEY = (Deno.env.get('DEEPL_API_KEY') || '').trim();
    if (!KEY) return json({ error: 'not-configured' });
    if (!TARGET[lang]) return json({ error: 'unsupported' });
    const parts = [r.title || '', r.body || ''];
    const res = await fetch(KEY.endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate', {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: parts, target_lang: TARGET[lang] }),
    });
    if (!res.ok) { console.error('deepl', res.status, await res.text()); return json({ error: res.status === 456 ? 'quota' : 'provider' }); }
    const out = await res.json();
    const src = String(out.translations?.[1]?.detected_source_language || out.translations?.[0]?.detected_source_language || '').toLowerCase().slice(0, 2);
    if (src && !r.lang) await admin.from('reviews').update({ lang: src }).eq('id', id);
    const row = { review_id: id, lang, title: r.title ? out.translations[0].text : null, body: r.body ? out.translations[1].text : null, src };
    await admin.from('review_translations').upsert(row);
    return json({ title: row.title, body: row.body, src, same: src === lang });
  } catch (e) {
    console.error(e);
    return json({ error: 'server' }, 500);
  }
});
