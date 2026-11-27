// Admin → "Verificator KDP": checks an interior PDF and a full-wrap cover PDF against Amazon KDP print rules,
// entirely in the browser (files never leave the computer). Shows the cover with bleed/safe/spine/barcode guides and the interior page by page.
import { getLang } from './i18n.js?v=20261127142248';
import { esc, $, loadScript } from './util.js?v=20261127142248';

const VENDOR = f => new URL('../vendor/' + f + '?v=' + (f.startsWith('pdf.') ? 'pdfjs-3.11.174-legacy' : '1'), import.meta.url).href;
const X = {
  title: ['Verificator KDP', 'Verificatore KDP', 'KDP checker'],
  sub: ['Verifică interiorul și coperta înainte de încărcarea pe Amazon KDP. Fișierele rămân în browserul tău.', 'Controlla interno e copertina prima di caricarli su Amazon KDP. I file restano nel tuo browser.', 'Check the interior and cover before uploading to Amazon KDP. Files stay in your browser.'],
  trim: ['Format (trim)', 'Formato (trim)', 'Trim size'],
  paper: ['Interior / hârtie', 'Interno / carta', 'Interior / paper'],
  p1: ['Alb-negru, hârtie albă', 'Bianco e nero, carta bianca', 'Black & white, white paper'],
  p2: ['Alb-negru, hârtie crem', 'Bianco e nero, carta crema', 'Black & white, cream paper'],
  p3: ['Color standard, hârtie albă', 'Colore standard, carta bianca', 'Standard color, white paper'],
  p4: ['Color premium, hârtie albă', 'Colore premium, carta bianca', 'Premium color, white paper'],
  pc: ['Număr pagini (gol = din PDF)', 'Numero pagine (vuoto = dal PDF)', 'Page count (empty = from PDF)'],
  fi: ['PDF interior', 'PDF interno', 'Interior PDF'],
  fc: ['PDF copertă completă (spate + cotor + față)', 'PDF copertina completa (retro + dorso + fronte)', 'Full wrap cover PDF (back + spine + front)'],
  pick: ['Apasă sau trage fișierul aici', 'Tocca o trascina il file qui', 'Click or drop the file here'],
  go: ['Verifică', 'Verifica', 'Check'],
  idle: ['Alege fișierele și apasă „Verifică”.', 'Scegli i file e premi «Verifica».', 'Choose the files and press “Check”.'],
  ok: ['✓ Totul în regulă: poți încărca pe KDP', '✓ Tutto a posto: puoi caricare su KDP', '✓ All good: ready to upload to KDP'],
  wr: ['! Verificare incompletă', '! Verifica incompleta', '! Incomplete check'],
  er1: ['✕ 1 eroare: corectează înainte de a încărca pe KDP', '✕ 1 errore: correggi prima di caricare su KDP', '✕ 1 error: fix before uploading to KDP'],
  erN: ['✕ {n} erori: corectează înainte de a încărca pe KDP', '✕ {n} errori: correggi prima di caricare su KDP', '✕ {n} errors: fix before uploading to KDP'],
  tCov: ['Previzualizare copertă', 'Anteprima copertina', 'Cover preview'],
  tInt: ['Previzualizare interior', 'Anteprima interno', 'Interior preview'],
  gBleed: ['Bleed / tăiere', 'Abbondanza / taglio', 'Bleed / trim'],
  gSafe: ['Zonă sigură', 'Area sicura', 'Safe area'],
  gSpine: ['Cotor', 'Dorso', 'Spine'],
  gBar: ['Cod de bare', 'Codice a barre', 'Barcode'],
  mForb: ['Margini interzise', 'Margini vietati', 'Forbidden margins'],
  mCont: ['Conținut detectat', 'Contenuto rilevato', 'Detected content'],
  badPages: ['Pagini cu probleme:', 'Pagine con problemi:', 'Pages with problems:'],
  page: ['Pagina', 'Pagina', 'Page'], pages: ['Paginile', 'Pagine', 'Pages'],
  note: ['Aceleași formule ca Print Cover Calculator KDP: cotor = pagini × 0,002252 in (alb), copertă = 2 × lățime + cotor + 0,25 in, înălțime + 0,25 in. Marginile minime sunt cele cerute de KDP pentru pagini fără bleed.', 'Stesse formule del Print Cover Calculator KDP: dorso = pagine × 0,002252 in (bianco), copertina = 2 × larghezza + dorso + 0,25 in, altezza + 0,25 in. Margini minimi KDP per pagine senza abbondanza.', 'Same formulas as the KDP Print Cover Calculator: spine = pages × 0.002252 in (white), cover = 2 × width + spine + 0.25 in, height + 0.25 in. Minimum margins are KDP’s for pages without bleed.'],
  err: ['Eroare la citirea PDF-ului', 'Errore nella lettura del PDF', 'Could not read the PDF'],
};
const L = () => { const l = getLang(); return l === 'ro' ? 0 : l === 'it' ? 1 : 2; };
const K = (k, o = {}) => X[k][L()].replace(/\{(\w+)\}/g, (_, n) => o[n]);
const fm = (x, d = 3) => (+x).toFixed(d).replace('.', ',');
const gutterMin = n => n <= 150 ? .375 : n <= 300 ? .5 : n <= 500 ? .625 : n <= 700 ? .75 : .875;
const ST = { ok: '✓', wr: '!', er: '✕', in: 'i' };

const CSS = `<style>
.kc{display:grid;grid-template-columns:320px minmax(0,1fr);gap:16px;align-items:start}
@media(max-width:860px){.kc{grid-template-columns:1fr}}
.kc .kcard{background:#fff;border:1px solid #d5d9d9;border-radius:10px;padding:14px;min-width:0}
.kc h2{font-size:15px;margin:0 0 8px}.kc label{display:block;font-weight:600;font-size:12.5px;margin:10px 0 3px}
.kc select,.kc input[type=number]{width:100%;padding:8px;border:1px solid #d5d9d9;border-radius:6px;font:inherit;background:#fff}
.kc .kdrop{border:2px dashed #c4cbcb;border-radius:8px;padding:12px;text-align:center;cursor:pointer;color:#565959;overflow-wrap:anywhere}
.kc .kdrop.on{border-color:#067d62;color:#067d62;background:#e6f4f0}
.kc .kdrop input{display:none}
.kc .kgo{width:100%;margin-top:14px}
.kc .kver{border-radius:8px;padding:12px 14px;font-weight:700;margin-bottom:12px;background:#fff;border:1px solid #d5d9d9;color:#565959;font-weight:500}
.kc .kver.ok{background:#e6f4f0;color:#067d62;border:0;font-weight:700}.kc .kver.er{background:#fdeceb;color:#b12704;border:0;font-weight:700}.kc .kver.wr{background:#fff4e0;color:#b36b00;border:0;font-weight:700}
.kc .kchk{display:flex;gap:10px;padding:8px 0;border-top:1px solid #e7eaea}.kc .kchk:first-child{border-top:0}
.kc .kic{flex:none;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:13px;font-weight:700}
.kc .kic.ok{background:#067d62}.kc .kic.wr{background:#b36b00}.kc .kic.er{background:#b12704}.kc .kic.in{background:#6b7373}
.kc .kchk b{display:block}.kc .kchk span{color:#565959;font-size:13px;overflow-wrap:anywhere}
.kc .ktabs{display:flex;gap:4px;margin-top:14px;border-bottom:1px solid #d5d9d9}
.kc .ktab{padding:8px 14px;border:1px solid transparent;border-bottom:0;border-radius:6px 6px 0 0;cursor:pointer;font-weight:600;color:#565959}
.kc .ktab.on{background:#fff;border-color:#d5d9d9;color:#111;position:relative;top:1px}
.kc .kview{background:#fff;border:1px solid #d5d9d9;border-top:0;padding:12px;border-radius:0 0 8px 8px}
.kc .kstage{background:#cfd4d4;border-radius:6px;padding:12px;overflow:auto;text-align:center}
.kc .kstage canvas{max-width:100%;height:auto;box-shadow:0 2px 8px rgba(0,0,0,.35);background:#fff}
.kc .kspread{display:flex;justify-content:center}.kc .kspread canvas{width:min(46%,520px)}
.kc .krow{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.kc .krow label{display:inline-flex;gap:5px;align-items:center;margin:0;font-weight:500}
.kc .kbad{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.kc .kbad a{background:#fdeceb;color:#b12704;padding:2px 8px;border-radius:10px;cursor:pointer;font-size:12px;font-weight:600}
.kc .kprog{height:6px;background:#e1e5e5;border-radius:3px;margin-top:10px;overflow:hidden}.kc .kprog div{height:100%;width:0;background:#ff9900}
.kc .knote{font-size:12px;color:#565959;margin-top:10px}
</style>`;

export const kdpCheckTitle = () => K('title');

export function kdpCheckAdmin(body) {
  body.innerHTML = `${CSS}<div class="kc">
  <aside class="kcard"><h2>${esc(K('title'))}</h2><p class="knote" style="margin:0 0 6px">${esc(K('sub'))}</p>
    <label>${esc(K('trim'))}</label><select id="kc-trim">${['8.5x11:8,5 × 11', '8x10:8 × 10', '6x9:6 × 9', '5.5x8.5:5,5 × 8,5', '8.25x8.25:8,25 × 8,25', '8.5x8.5:8,5 × 8,5', '7x10:7 × 10', '5x8:5 × 8'].map(s => { const [v, l] = s.split(':'); return `<option value="${v}">${l} in</option>`; }).join('')}</select>
    <label>${esc(K('paper'))}</label><select id="kc-paper"><option value="0.002252">${esc(K('p1'))}</option><option value="0.0025">${esc(K('p2'))}</option><option value="0.002252">${esc(K('p3'))}</option><option value="0.002347">${esc(K('p4'))}</option></select>
    <label>${esc(K('pc'))}</label><input type="number" id="kc-pc" min="24" max="828">
    <label>${esc(K('fi'))}</label><div class="kdrop" id="kc-d1">${esc(K('pick'))}<input type="file" accept="application/pdf" id="kc-f1"></div>
    <label>${esc(K('fc'))}</label><div class="kdrop" id="kc-d2">${esc(K('pick'))}<input type="file" accept="application/pdf" id="kc-f2"></div>
    <button class="btn btn-buy kgo" id="kc-go" disabled>${esc(K('go'))}</button><div class="kprog" id="kc-prog" hidden><div></div></div>
    <p class="knote">${esc(K('note'))}</p></aside>
  <section><div class="kver" id="kc-ver">${esc(K('idle'))}</div><div class="kcard" id="kc-chk" hidden></div>
    <div class="ktabs" id="kc-tabs" hidden><div class="ktab on" data-t="cov">${esc(K('tCov'))}</div><div class="ktab" data-t="int">${esc(K('tInt'))}</div></div>
    <div class="kview" id="kc-vcov" hidden><div class="krow"><label><input type="checkbox" id="kc-g1" checked> ${esc(K('gBleed'))}</label><label><input type="checkbox" id="kc-g2" checked> ${esc(K('gSafe'))}</label><label><input type="checkbox" id="kc-g3" checked> ${esc(K('gSpine'))}</label><label><input type="checkbox" id="kc-g4" checked> ${esc(K('gBar'))}</label></div><div class="kstage"><canvas id="kc-cc"></canvas></div></div>
    <div class="kview" id="kc-vint" hidden><div class="krow"><button class="btn btn-ghost btn-sm" id="kc-pv">◀</button><span id="kc-pg"></span><button class="btn btn-ghost btn-sm" id="kc-nx">▶</button><label><input type="checkbox" id="kc-m1" checked> ${esc(K('mForb'))}</label><label><input type="checkbox" id="kc-m2" checked> ${esc(K('mCont'))}</label></div><div class="kstage"><div class="kspread"><canvas id="kc-pL"></canvas><canvas id="kc-pR"></canvas></div></div><div class="kbad" id="kc-bad"></div></div>
  </section></div>`;
  const q = s => $(s, body);
  const F = {}; let INT = null, COV = null, PAGES = [], LIM = null, spread = 0, pdfjs = null;
  const trim = () => q('#kc-trim').value.split('x').map(Number);
  const bind = n => { const d = q('#kc-d' + n), i = q('#kc-f' + n);
    d.onclick = () => i.click();
    d.ondragover = e => e.preventDefault();
    d.ondrop = e => { e.preventDefault(); if (e.dataTransfer.files[0]) set(n, e.dataTransfer.files[0]); };
    i.onchange = () => i.files[0] && set(n, i.files[0]); };
  const set = (n, f) => { F[n] = f; const d = q('#kc-d' + n); d.classList.add('on'); d.firstChild.textContent = '✓ ' + f.name + ' (' + (f.size / 1048576).toFixed(1) + ' MB)'; q('#kc-go').disabled = false; };
  bind(1); bind(2);
  const lib = async () => { if (pdfjs) return pdfjs; await loadScript(VENDOR('pdf.min.js')); pdfjs = window.pdfjsLib; pdfjs.GlobalWorkerOptions.workerSrc = VENDOR('pdf.worker.min.js'); return pdfjs; };
  const open = async f => (await lib()).getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;

  q('#kc-go').onclick = async () => {
    const btn = q('#kc-go'); btn.disabled = true; const pr = q('#kc-prog'), pb = pr.firstElementChild; pr.hidden = false; pb.style.width = '0';
    const C = [], [tw, th] = trim(), rate = +q('#kc-paper').value; INT = COV = null; PAGES = [];
    try {
      if (F[1]) {
        INT = await open(F[1]); const n = INT.numPages; LIM = { g: gutterMin(n), o: .25, t: .25 };
        const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
        for (let i = 1; i <= n; i++) {
          const p = await INT.getPage(i), v = p.getViewport({ scale: 1 }); cv.width = Math.round(v.width); cv.height = Math.round(v.height);
          cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); await p.render({ canvasContext: cx, viewport: v }).promise;
          const d = cx.getImageData(0, 0, cv.width, cv.height).data, W = cv.width, H = cv.height; let x0 = W, y0 = H, x1 = -1, y1 = -1;
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = (y * W + x) * 4; if (d[k] < 235 || d[k + 1] < 235 || d[k + 2] < 235) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
          PAGES.push({ wi: v.width / 72, hi: v.height / 72, b: x1 < 0 ? null : { l: x0 / 72, t: y0 / 72, r: (W - 1 - x1) / 72, bt: (H - 1 - y1) / 72 } });
          if (i % 5 === 0 || i === n) { pb.style.width = (i / n * 90) + '%'; await new Promise(r => setTimeout(r)); }
        }
        const lst = a => a.slice(0, 15).join(', ') + (a.length > 15 ? ' … (' + a.length + ')' : '');
        C.push([n >= 24 && n <= 828 ? 'ok' : 'er', { ro: 'Număr de pagini: ', it: 'Numero di pagine: ', en: 'Page count: ' }, n, '24 – 828']);
        const wrong = []; PAGES.forEach((p, i) => { if (Math.abs(p.wi - tw) > .01 || Math.abs(p.hi - th) > .01) wrong.push(i + 1); });
        C.push(wrong.length ? ['er', 'size', fm(tw, 2) + ' × ' + fm(th, 2) + ' in', fm(PAGES[0].wi) + ' × ' + fm(PAGES[0].hi) + ' in; ' + lst(wrong)] : ['ok', 'sizeok', fm(tw, 2) + ' × ' + fm(th, 2) + ' in', '']);
        const bad = new Set(), ms = { g: 9, o: 9, t: 9 }, blank = [];
        PAGES.forEach((p, i) => { if (!p.b) { blank.push(i + 1); return; } const rec = (i + 1) % 2 === 1, ins = rec ? p.b.l : p.b.r, out = rec ? p.b.r : p.b.l; p.v = [];
          if (ins < LIM.g - .005) p.v.push('g'); if (out < LIM.o - .005) p.v.push('o'); if (p.b.t < LIM.t - .005 || p.b.bt < LIM.t - .005) p.v.push('t');
          ms.g = Math.min(ms.g, ins); ms.o = Math.min(ms.o, out); ms.t = Math.min(ms.t, p.b.t, p.b.bt); if (p.v.length) bad.add(i + 1); });
        const fv = k => [...bad].filter(i => PAGES[i - 1].v.includes(k));
        C.push([fv('g').length ? 'er' : 'ok', 'gut', fm(ms.g) + ' in / ' + fm(LIM.g) + ' in', lst(fv('g'))]);
        C.push([fv('o').length ? 'er' : 'ok', 'out', fm(ms.o) + ' in / 0,25 in', lst(fv('o'))]);
        C.push([fv('t').length ? 'er' : 'ok', 'tb', fm(ms.t) + ' in / 0,25 in', lst(fv('t'))]);
        C.push([blank.length ? 'in' : 'ok', 'blank', String(blank.length), lst(blank)]);
      }
      if (F[2]) {
        COV = await open(F[2]); C.push([COV.numPages === 1 ? 'ok' : 'er', 'cov1', String(COV.numPages), '']);
        const v = (await COV.getPage(1)).getViewport({ scale: 1 }); COV._w = v.width / 72; COV._h = v.height / 72;
        const n = +q('#kc-pc').value || (INT ? INT.numPages : 0);
        if (!n) C.push(['wr', 'nospine', '', '']); else {
          const sp = n * rate, W = 2 * tw + sp + .25, H = th + .25; COV._sp = sp; COV._W = W; COV._H = H;
          const dw = COV._w - W, dh = COV._h - H, ok = Math.abs(dw) <= .01 && Math.abs(dh) <= .01;
          C.push([ok ? 'ok' : 'er', 'covsz', fm(COV._w) + ' × ' + fm(COV._h) + ' in', fm(W) + ' × ' + fm(H) + ' in (' + n + ') Δ ' + fm(Math.abs(dw)) + ' / ' + fm(Math.abs(dh))]);
          C.push(['in', 'spine', fm(sp) + ' in', n >= 79 ? 'OK ≥ 79' : '< 79']);
        }
      }
    } catch (e) { C.push(['er', 'readerr', '', String(e.message || e)]); }
    pb.style.width = '100%'; setTimeout(() => pr.hidden = true, 400); btn.disabled = false; show(C);
  };
  const MSG = { // [ro, it, en] titles
    size: ['Dimensiunea paginilor nu este cea aleasă', 'La dimensione delle pagine non è quella scelta', 'Page size is not the chosen one'],
    sizeok: ['Toate paginile au formatul ales, fără bleed', 'Tutte le pagine hanno il formato scelto, senza abbondanza', 'All pages match the chosen size, no bleed'],
    gut: ['Margine interioară (cotor) — minim găsit / cerut', 'Margine interno (dorso) — minimo trovato / richiesto', 'Inside (gutter) margin — min found / required'],
    out: ['Margine exterioară — minim găsit / cerut', 'Margine esterno — minimo trovato / richiesto', 'Outside margin — min found / required'],
    tb: ['Margine sus/jos — minim găsit / cerut', 'Margine sopra/sotto — minimo trovato / richiesto', 'Top/bottom margin — min found / required'],
    blank: ['Pagini fără conținut vizibil', 'Pagine senza contenuto visibile', 'Pages with no visible content'],
    cov1: ['Pagini în PDF-ul copertei (trebuie 1)', 'Pagine nel PDF della copertina (deve essere 1)', 'Pages in the cover PDF (must be 1)'],
    nospine: ['Nu pot calcula cotorul: încarcă interiorul sau scrie numărul de pagini', 'Impossibile calcolare il dorso: carica l’interno o scrivi le pagine', 'Cannot compute the spine: upload the interior or enter the page count'],
    covsz: ['Dimensiunea copertei — fișier / calculat KDP', 'Dimensione copertina — file / calcolata KDP', 'Cover size — file / KDP calculated'],
    spine: ['Lățimea cotorului', 'Larghezza del dorso', 'Spine width'],
    readerr: ['Eroare la citirea PDF-ului', 'Errore nella lettura del PDF', 'Could not read the PDF'],
  };
  const show = C => {
    const er = C.filter(c => c[0] === 'er').length, wr = C.filter(c => c[0] === 'wr').length, v = q('#kc-ver');
    v.className = 'kver ' + (er ? 'er' : wr ? 'wr' : 'ok'); v.textContent = er ? (er > 1 ? K('erN', { n: er }) : K('er1')) : wr ? K('wr') : K('ok');
    const k = q('#kc-chk'); k.hidden = false;
    k.innerHTML = C.map(c => { const o = c[1]; const title = typeof o === 'object' ? o[['ro', 'it', 'en'][L()]] + c[2] : MSG[o][L()]; const det = typeof o === 'object' ? c[3] : [c[2], c[3]].filter(Boolean).join(' · ');
      return `<div class="kchk"><div class="kic ${c[0]}">${ST[c[0]]}</div><div><b>${esc(title)}</b><span>${esc(det)}</span></div></div>`; }).join('');
    q('#kc-tabs').hidden = false; tab(COV ? 'cov' : 'int');
    const bp = PAGES.map((p, i) => p.v && p.v.length ? i + 1 : 0).filter(Boolean);
    q('#kc-bad').innerHTML = bp.length ? `<b style="width:100%">${esc(K('badPages'))}</b>` + bp.slice(0, 200).map(i => `<a data-p="${i}">${i}</a>`).join('') : '';
    spread = 0; if (INT) drawSpread();
  };
  body.querySelectorAll('.ktab').forEach(t => t.onclick = () => tab(t.dataset.t));
  function tab(t) { body.querySelectorAll('.ktab').forEach(x => x.classList.toggle('on', x.dataset.t === t)); q('#kc-vcov').hidden = t !== 'cov' || !COV; q('#kc-vint').hidden = t !== 'int' || !INT; if (t === 'cov' && COV) drawCover(); }
  async function drawCover() {
    const p = await COV.getPage(1), W = COV._w, H = COV._h, s = Math.min(2200 / (W * 72), 1.6), v = p.getViewport({ scale: s }), c = q('#kc-cc'), x = c.getContext('2d');
    c.width = v.width; c.height = v.height; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); await p.render({ canvasContext: x, viewport: v }).promise;
    const ppi = c.width / W, B = .125, tw = trim()[0], th = H - 2 * B, sp = COV._sp || (W - 2 * tw - .25), T = B, Lx = B, R = W - B, Bt = H - B, sL = Lx + tw, sR = sL + sp;
    const box = (a, b, w, h, col, dash, fill) => { x.save(); x.strokeStyle = col; x.lineWidth = Math.max(2, ppi * .012); x.setLineDash(dash ? [ppi * .06, ppi * .04] : []); if (fill) { x.fillStyle = fill; x.fillRect(a * ppi, b * ppi, w * ppi, h * ppi); } x.strokeRect(a * ppi, b * ppi, w * ppi, h * ppi); x.restore(); };
    if (q('#kc-g1').checked) { box(0, 0, W, H, '#e11', true); box(Lx, T, R - Lx, Bt - T, '#e11'); }
    if (q('#kc-g2').checked) { const m = .125; box(Lx + m, T + m, tw - 2 * m, th - 2 * m, '#1a9'); box(sR + m, T + m, tw - 2 * m, th - 2 * m, '#1a9'); }
    if (q('#kc-g3').checked) { box(sL, T, sp, th, '#27c', false, '#2277cc22'); if (sp > .12) box(sL + .0625, T + .125, sp - .125, th - .25, '#27c', true); }
    if (q('#kc-g4').checked) { box(sL - .25 - 2, Bt - .25 - 1.2, 2, 1.2, '#555', false, '#fffc'); }
  }
  ['g1', 'g2', 'g3', 'g4'].forEach(i => q('#kc-' + i).onchange = () => COV && drawCover());
  ['m1', 'm2'].forEach(i => q('#kc-' + i).onchange = () => INT && drawSpread());
  async function drawPage(c, n) {
    if (n < 1 || n > INT.numPages) { c.width = 2; c.height = 2; c.style.visibility = 'hidden'; return; } c.style.visibility = 'visible';
    const p = await INT.getPage(n), v = p.getViewport({ scale: 1.4 }), x = c.getContext('2d'); c.width = v.width; c.height = v.height; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    await p.render({ canvasContext: x, viewport: v }).promise;
    const pg = PAGES[n - 1], ppi = v.width / pg.wi, rec = n % 2 === 1, W = pg.wi, H = pg.hi, l = rec ? LIM.g : LIM.o, r = rec ? LIM.o : LIM.g, t = LIM.t;
    if (q('#kc-m1').checked) { x.fillStyle = '#e1131a22'; x.fillRect(0, 0, l * ppi, H * ppi); x.fillRect((W - r) * ppi, 0, r * ppi, H * ppi); x.fillRect(l * ppi, 0, (W - l - r) * ppi, t * ppi); x.fillRect(l * ppi, (H - t) * ppi, (W - l - r) * ppi, t * ppi); }
    if (q('#kc-m2').checked && pg.b) { x.strokeStyle = pg.v && pg.v.length ? '#e11' : '#1a9'; x.lineWidth = 2.5; x.strokeRect(pg.b.l * ppi, pg.b.t * ppi, (W - pg.b.l - pg.b.r) * ppi, (H - pg.b.t - pg.b.bt) * ppi); }
  }
  async function drawSpread() {
    const n = INT.numPages, max = Math.ceil(n / 2); spread = Math.max(0, Math.min(spread, max)); const l = spread === 0 ? 0 : spread * 2, r = spread * 2 + 1;
    q('#kc-pg').textContent = spread === 0 ? K('page') + ' 1' : K('pages') + ' ' + l + (r <= n ? ' – ' + r : '');
    await drawPage(q('#kc-pL'), l); await drawPage(q('#kc-pR'), r);
  }
  q('#kc-pv').onclick = () => { spread--; INT && drawSpread(); }; q('#kc-nx').onclick = () => { spread++; INT && drawSpread(); };
  q('#kc-bad').onclick = e => { const a = e.target.closest('a'); if (a) { spread = Math.floor(+a.dataset.p / 2); drawSpread(); } };
}
