# Creates the picture shown when a language link (librava.store/<lang>/) is shared on WhatsApp, Facebook…
# One 1200x630 image per language: logo, message and six category covers drawn here (original art).
# Run: python3 tools/og-images.py   -> assets/img/og-<lang>.jpg
import json, re, pathlib, asyncio, io
from playwright.async_api import async_playwright
from PIL import Image
ROOT = pathlib.Path(__file__).resolve().parent.parent
TXT = json.loads((ROOT / 'tools/og-text.json').read_text())
I18N = (ROOT / 'assets/js/i18n.js').read_text()
def cat_name(l, key):
  p = ROOT / f'assets/js/lang/{l}.js'
  if p.exists():
    m = re.search(r'"cat\.' + key + r'": "((?:[^"\\]|\\.)*)"', p.read_text())
    if m: return json.loads('"' + m.group(1) + '"')
  block = I18N.split(f'\n  {l}: {{')[1]
  m = re.search(r"'cat\." + key + r"': '((?:[^'\\]|\\.)*)'", block)
  return m.group(1).replace("\\'", "'") if m else key
LOGO = (ROOT / 'assets/js/ui.js').read_text().split('LOGO_MARK = `')[1].split('`')[0]
ART = {
 'fiction': ('#1B2440', '#3B4F8C', '<circle cx="110" cy="40" r="16" fill="#F6D27A"/><path d="M0 120 L40 80 L70 105 L105 70 L150 120 Z" fill="#26335E"/><path d="M0 130 L50 95 L95 125 L150 92 L150 150 L0 150 Z" fill="#141B30"/><g fill="#fff" opacity=".8"><circle cx="30" cy="30" r="1.6"/><circle cx="60" cy="18" r="1.2"/><circle cx="80" cy="45" r="1.4"/><circle cx="135" cy="70" r="1.2"/></g>'),
 'cooking': ('#FFF4E2', '#F6D9B0', '<ellipse cx="75" cy="118" rx="52" ry="10" fill="#C7683B"/><path d="M25 95 h100 a50 30 0 0 1 -100 0z" fill="#E07A45"/><path d="M50 82 q8 -14 0 -26 M75 80 q8 -16 0 -30 M100 82 q8 -14 0 -26" stroke="#B9874F" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M110 40 q20 -10 28 8 q-18 8 -28 -8z" fill="#6FAE4E"/>'),
 'health': ('#E8F5EC', '#BFE3CB', '<rect x="22" y="70" width="14" height="40" rx="3" fill="#24443A"/><rect x="114" y="70" width="14" height="40" rx="3" fill="#24443A"/><rect x="36" y="84" width="78" height="12" rx="4" fill="#3E7A5E"/><rect x="10" y="78" width="12" height="24" rx="3" fill="#24443A"/><rect x="128" y="78" width="12" height="24" rx="3" fill="#24443A"/><path d="M20 40 h28 l8 -14 l10 26 l8 -12 h56" stroke="#E2554A" stroke-width="5" fill="none" stroke-linejoin="round" stroke-linecap="round"/>'),
 'kids': ('#FFE9F1', '#FFC9DC', '<circle cx="55" cy="60" r="24" fill="#FF7FA6"/><path d="M55 84 q-4 20 6 40" stroke="#B85578" stroke-width="2" fill="none"/><circle cx="100" cy="75" r="20" fill="#7FC8F8"/><path d="M100 95 q4 16 -4 30" stroke="#4D86A8" stroke-width="2" fill="none"/><path d="M118 28 l4 9 10 1 -8 6 3 10 -9 -6 -9 6 3 -10 -8 -6 10 -1z" fill="#FFC23D"/><path d="M28 112 l3 6 7 1 -5 4 2 7 -7 -4 -6 4 2 -7 -5 -4 7 -1z" fill="#FFC23D"/>'),
 'business': ('#0F2A33', '#1E5866', '<rect x="22" y="95" width="18" height="30" rx="2" fill="#7FD3C5"/><rect x="50" y="78" width="18" height="47" rx="2" fill="#5DBFB0"/><rect x="78" y="60" width="18" height="65" rx="2" fill="#3FA796"/><rect x="106" y="40" width="18" height="85" rx="2" fill="#F2A541"/><path d="M20 70 L60 50 L85 58 L128 22" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M118 20 l12 0 0 12" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>'),
 'selfhelp': ('#FFF7E6', '#FCE3B8', '<circle cx="75" cy="105" r="34" fill="#F2A541"/><g stroke="#F2A541" stroke-width="5" stroke-linecap="round"><path d="M75 52 v-14"/><path d="M38 66 l-10 -10"/><path d="M112 66 l10 -10"/><path d="M22 100 h-12"/><path d="M128 100 h12"/></g><rect x="0" y="108" width="150" height="42" fill="#93C572"/><path d="M0 116 q75 -20 150 0" fill="#7FB35F"/>'),
}
ORDER = ['fiction', 'cooking', 'health', 'kids', 'business', 'selfhelp']
DARK_TEXT = {'cooking', 'health', 'kids', 'selfhelp'}
def page(l):
  t = TXT[l]
  covers = ''.join(f'''<div class="cv c{i}" style="background:linear-gradient(160deg,{ART[k][0]},{ART[k][1]});color:{'#2B241A' if k in DARK_TEXT else '#fff'}">
    <span class="tag">{t['e']}</span><b style="font-size:{min(21, int(124 / (0.62 * max(len(w) for w in cat_name(l, k).split()))))}px">{cat_name(l, k)}</b><svg viewBox="0 0 150 150">{ART[k][2]}</svg></div>''' for i, k in enumerate(ORDER))
  return f'''<!doctype html><html lang="{l}"><head><meta charset="utf-8"><link rel="stylesheet" href="{(ROOT / 'assets/css/fonts.css').as_uri()}"><style>
  *{{box-sizing:border-box;margin:0}} body{{width:1200px;height:630px;overflow:hidden;font-family:Figtree,'DejaVu Sans',sans-serif;
  background:radial-gradient(900px 500px at 85% 20%,rgba(147,197,114,.35),transparent 60%),linear-gradient(115deg,#1C2B2D 0%,#24393B 45%,#3F6A3A 100%);color:#fff;position:relative}}
  .left{{position:absolute;left:64px;top:56px;width:560px;display:flex;flex-direction:column;gap:22px}}
  .logo{{display:flex;align-items:center;gap:14px}} .logo svg{{width:62px;height:62px}}
  .logo span{{font-family:Literata,serif;font-weight:700;font-size:54px;letter-spacing:-1px}} .logo i{{font-style:normal;color:#93C572}}
  h1{{font-family:Literata,serif;font-size:{56 if len(t['t'])<30 else 46}px;line-height:1.08;font-weight:700;letter-spacing:-.5px}}
  p{{font-size:23px;line-height:1.4;color:#DCE6E0}}
  .row{{display:flex;gap:12px;align-items:center;flex-wrap:wrap}}
  .chip{{background:#F2A541;color:#1C2B2D;font-weight:800;font-size:22px;padding:10px 20px;border-radius:999px}}
  .dev{{font-size:19px;color:#C9D6CE}}
  .grid{{position:absolute;right:46px;top:58px;width:500px;height:520px}}
  .cv{{position:absolute;width:150px;height:226px;border-radius:6px;box-shadow:0 14px 30px rgba(0,0,0,.45);padding:14px 12px;display:flex;flex-direction:column;gap:6px;overflow:hidden}}
  .cv b{{font-family:Literata,serif;font-size:21px;line-height:1.1;font-weight:700;z-index:1;hyphens:manual}}
  .cv .tag{{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.7}}
  .cv svg{{position:absolute;left:0;bottom:0;width:150px;height:150px}}
  .c0{{left:0;top:10px;transform:rotate(-6deg)}} .c1{{left:170px;top:0;transform:rotate(2deg)}} .c2{{left:340px;top:16px;transform:rotate(7deg)}}
  .c3{{left:10px;top:262px;transform:rotate(-3deg)}} .c4{{left:178px;top:250px;transform:rotate(-1deg)}} .c5{{left:346px;top:268px;transform:rotate(5deg)}}
  </style></head><body><div class="left"><div class="logo">{LOGO}<span>Libra<i>va</i></span></div><h1>{t['t']}</h1><p>{t['s']}</p>
  <div class="row"><span class="chip">⚡ {t['r']}</span></div><span class="dev">{t['d']}</span></div><div class="grid">{covers}</div></body></html>'''
async def main():
  async with async_playwright() as p:
    br = await p.chromium.launch(); pg = await br.new_page(viewport={'width': 1200, 'height': 630})
    for l in TXT:
      tmp = ROOT / f'.og-{l}.html'; tmp.write_text(page(l))
      await pg.goto(tmp.as_uri()); await pg.wait_for_timeout(300); await pg.evaluate('document.fonts.ready')
      png = await pg.screenshot(); tmp.unlink()
      Image.open(io.BytesIO(png)).convert('RGB').save(ROOT / f'assets/img/og-{l}.jpg', quality=84, optimize=True, progressive=True)
    await br.close()
asyncio.run(main())
print('ok')
