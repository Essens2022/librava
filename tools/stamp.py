#!/usr/bin/env python3
"""Stamps a version on every script/style address so phones and browsers
always load the newest files after an update (no stale cache mixing old and new files).
Run before each publish:  python3 tools/stamp.py"""
import re, time, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
v = time.strftime('%Y%m%d%H%M%S')
strip = lambda s: re.sub(r'(\.(?:js|css))\?v=\d+', r'\1', s)
for f in [root / 'index.html', *(root / 'assets/js').glob('*.js')]:
    s = strip(f.read_text(encoding='utf-8'))
    if f.name == 'index.html':
        s = re.sub(r'(href|src)="(assets/(?!vendor/)[^"]+\.(?:js|css))"', rf'\1="\2?v={v}"', s)
    else:
        s = re.sub(r"""(from\s+['"]\./[\w./-]+\.js)(['"])""", rf'\1?v={v}\2', s)
        s = re.sub(r"""(import\(\s*['"]\./[\w./-]+\.js)(['"])""", rf'\1?v={v}\2', s)
        s = s.replace("import(`./lang/${l}.js`)", f"import(`./lang/${{l}}.js?v={v}`)")
    f.write_text(s, encoding='utf-8')
# modulepreload: the browser starts downloading every module at once instead of discovering them level by level
js = root / 'assets/js'
seen, st = [], ['app.js']
while st:
    f = st.pop(0)
    if f in seen: continue
    seen.append(f)
    src = (js / f).read_text(encoding='utf-8')
    st += re.findall(r"""(?:import|export)\s[^;'"]*?from\s+['"]\./([\w.-]+\.js)""", src)
    st += re.findall(r"""\bimport\s+['"]\./([\w.-]+\.js)""", src)
block = '<!--preload-->' + ''.join(f'<link rel="modulepreload" href="assets/js/{f}?v={v}">' for f in seen) + '<link rel="preload" as="script" href="assets/vendor/supabase.min.js"><!--/preload-->'
h = (root / 'index.html').read_text(encoding='utf-8')
h = re.sub(r'<!--preload-->.*?<!--/preload-->', '', h, flags=re.S)
h = h.replace('<script type="module" src="assets/js/app.js', block + '\n<script type="module" src="assets/js/app.js', 1)
(root / 'index.html').write_text(h, encoding='utf-8')
print('version', v, 'preload', len(seen))
