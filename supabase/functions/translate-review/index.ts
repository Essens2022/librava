// Translates one review into the visitor's language (the language of their phone / computer).
// Each review is translated only once per language and kept, so it is fast and almost free.
// Secret (Supabase → Edge Functions → Secrets): OPENAI_API_KEY (or DEEPL_API_KEY; free DeepL keys end in ":fx").
// Optional: OPENAI_MODEL to choose the OpenAI model (a small, cheap one is used by default).
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
    const OAI = (Deno.env.get('OPENAI_API_KEY') || '').replace(/[^\x21-\x7E]/g, '');
    if (!KEY && !OAI) return json({ error: 'not-configured' });
    const parts = [r.title || '', r.body || ''];
    const store = async (title: string | null, text: string | null, src: string) => {
      if (src && !r.lang) await admin.from('reviews').update({ lang: src }).eq('id', id);
      const row = { review_id: id, lang, title: r.title ? title : null, body: r.body ? text : null, src };
      await admin.from('review_translations').upsert(row);
      return json({ title: row.title, body: row.body, src, same: src === lang });
    };
    // OpenAI: all 24 languages, natural translations of reviews
    if (OAI && (!KEY || !TARGET[lang])) {
      const NAMES: Record<string, string> = { ro: 'Romanian', it: 'Italian', en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese (Portugal)', nl: 'Dutch', pl: 'Polish', sv: 'Swedish', da: 'Danish', no: 'Norwegian (Bokmål)', fi: 'Finnish', cs: 'Czech', sk: 'Slovak', sl: 'Slovenian', hr: 'Croatian', hu: 'Hungarian', bg: 'Bulgarian', el: 'Greek', et: 'Estonian', lv: 'Latvian', lt: 'Lithuanian', uk: 'Ukrainian' };
      if (!NAMES[lang]) return json({ error: 'unsupported' });
      const models = [Deno.env.get('OPENAI_MODEL'), 'gpt-4.1-mini', 'gpt-4o-mini'].filter(Boolean) as string[];
      for (const model of models) {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${OAI}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, temperature: 0.2, response_format: { type: 'json_object' }, messages: [
            { role: 'system', content: `You translate customer book reviews into ${NAMES[lang]}. Keep the meaning, tone, emojis and line breaks; do not add anything. Reply only with JSON: {"src":"<ISO 639-1 code of the original language>","title":"<translated title or empty>","body":"<translated review or empty>"}.` },
            { role: 'user', content: JSON.stringify({ title: parts[0], body: parts[1] }) }] }),
        });
        if (res.status === 404 || res.status === 400) { console.error('openai model', model, res.status, await res.text()); continue; }
        if (!res.ok) { console.error('openai', res.status, await res.text()); return json({ error: res.status === 429 ? 'quota' : 'provider' }); }
        const out = await res.json();
        let j: any = {}; try { j = JSON.parse(out.choices?.[0]?.message?.content || '{}'); } catch { }
        const src = String(j.src || '').toLowerCase().slice(0, 2);
        return await store(String(j.title || ''), String(j.body || ''), src);
      }
      return json({ error: 'provider' });
    }
    if (!TARGET[lang]) return json({ error: 'unsupported' });
    const res = await fetch(KEY.endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate', {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: parts, target_lang: TARGET[lang] }),
    });
    if (!res.ok) { console.error('deepl', res.status, await res.text()); return json({ error: res.status === 456 ? 'quota' : 'provider' }); }
    const out = await res.json();
    const src = String(out.translations?.[1]?.detected_source_language || out.translations?.[0]?.detected_source_language || '').toLowerCase().slice(0, 2);
    return await store(out.translations[0].text, out.translations[1].text, src);
  } catch (e) {
    console.error(e);
    return json({ error: 'server' }, 500);
  }
});
