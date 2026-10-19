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
        s = re.sub(r'(href|src)="(assets/[^"]+\.(?:js|css))"', rf'\1="\2?v={v}"', s)
    else:
        s = re.sub(r"""(from\s+['"]\./[\w./-]+\.js)(['"])""", rf'\1?v={v}\2', s)
        s = re.sub(r"""(import\(\s*['"]\./[\w./-]+\.js)(['"])""", rf'\1?v={v}\2', s)
        s = s.replace("import(`./lang/${l}.js`)", f"import(`./lang/${{l}}.js?v={v}`)")
    f.write_text(s, encoding='utf-8')
print('version', v)
