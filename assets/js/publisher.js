// Publisher: complete book packages (manuscript, covers, A+ images, listing texts, license) sold to ONE buyer only.
// Same Librava header, cards, cart and offers; only the product is different. Packages are books with product_type = 'publisher'.
import { api } from './api.js?v=20261127145606';
import { t, getLang, langName } from './i18n.js?v=20261127145606';
import { esc } from './util.js?v=20261127145606';
import { icon, pubCardHTML } from './ui.js?v=20261127145606';
import { isPub } from './ptypes.js?v=20261127145606';
import { CONFIG } from './config.js?v=20261127145606';

// the electric-blue strip (home + Publisher page): same compact size as the other strips, readable on any phone
export function pubBannerHTML(covers = []) {
  // each cover once (never the same book repeated); thumb first, the full cover if the thumb is not built yet
  const imgs = covers.slice(0, 4);
  const books = imgs.length ? imgs.map(c => `<img src="${esc(c.thumb)}" alt="" decoding="async" onerror="this.onerror=null;this.src='${esc(c.full)}'">`).join('') : '<b></b><b></b><b></b><b></b>';
  return `<a class="pub-wow" href="#/publisher" aria-label="Publisher"><i class="pw-rays"></i><i class="pw-sp s1">✦</i><i class="pw-sp s2">✦</i><i class="pw-sp s3">✦</i>
    <div class="pw-in"><div class="pw-tx"><b class="pw-ttl">${esc(t('pub.nav')).toUpperCase()}</b><span class="pw-rv">${esc(t('pub.buyResell'))}</span><span class="pw-pl">© ${esc(t('pub.rights'))}</span></div>
    <div class="pw-mid"><span><b>©</b>${esc(t('pub.rightsYours'))}</span><span><b>★</b>${esc(t('pub.oneBuyer'))}</span><span><b>ZIP</b>${esc(t('pub.allIncluded'))}</span></div>
    <div class="pw-cv">${books}<i class="pw-shelf"></i><span class="pw-exc">★ ${esc(t('pub.exclusive'))}</span></div></div></a>`;
}
// fills the covers of the strip once the catalogue is known (the strip itself is on screen at once)
export async function mountPubBanner(root) {
  const slot = root.querySelector('[data-pub-banner]');
  if (!slot) return;
  slot.innerHTML = pubBannerHTML();
  try {
    const list = (await api.listBooks({ ptype: 'publisher' })).filter(b => b.cover_url && !(b.sold_at)).slice(0, 4);
    if (!list.length || !slot.isConnected) return;
    slot.innerHTML = pubBannerHTML(list.map(b => ({ thumb: `/book/${b.id}/thumb.webp`, full: b.cover_url })));
  } catch { }
}

const PLAT = [['a', 'Amazon KDP'], ['e', 'Etsy'], ['k', 'Kobo'], ['b', 'Apple Books'], ['g', 'Google Play']];

export async function viewPublisher(el) {
  document.title = t('pub.nav') + ' · ' + CONFIG.siteName;
  let list = [];
  try { list = (await api.listBooks({ ptype: 'publisher' })).filter(isPub); } catch { }
  const q = new URLSearchParams((location.hash.split('?')[1]) || '');
  const langs = [...new Set(list.map(b => b.language).filter(Boolean))];
  // each language page shows its own packages first; "all languages" is the visitor's choice (all shown when there is none in this language)
  let lang = q.get('lang');
  if (lang === null) lang = langs.includes(getLang()) ? getLang() : ''; else if (lang === 'all') lang = '';
  const shown = (lang ? list.filter(b => b.language === lang) : list).slice().sort((a, b) =>
    (!!(a.sold_at) - !!(b.sold_at)) || String(b.published_at || b.created_at || '').localeCompare(String(a.published_at || a.created_at || '')));
  const chips = langs.length > 1 ? `<span class="pub-chips"><a class="chip${lang ? '' : ' on'}" href="#/publisher?lang=all">${esc(t('pub.allLangs'))}</a>${langs.map(l => `<a class="chip${lang === l ? ' on' : ''}" href="#/publisher?lang=${encodeURIComponent(l)}">${icon('globe')} ${esc(langName(l, true))}</a>`).join('')}</span>` : langs.length ? `<span class="chip">${icon('globe')} ${esc(langName(langs[0], true))}</span>` : '';
  el.innerHTML = `<div class="wrap page pub-page">
    <div class="pub-banner-slot" data-pub-banner></div>
    <div class="panel pub-ben"><div><b>©</b>${esc(t('pub.rightsYours'))}</div><div><b>★</b>${esc(t('pub.oneBuyer'))}</div><div><b>${icon('box')}</b>${esc(t('pub.allIncluded'))}</div></div>
    <div class="pub-on"><span class="pub-on-l">${esc(t('pub.publishOn'))}</span>${PLAT.map(([c, n]) => `<span class="pp pp-${c}">${n}</span>`).join('')}</div>
    <div class="panel results-bar pub-bar"><span class="pub-count"><b>${esc(t('pub.packages', { n: shown.length }))}</b>${chips}</span></div>
    <div class="promo-slot" data-slot="publisher-top"></div>
    ${shown.length ? `<div class="results">${shown.map(pubCardHTML).join('')}</div>` : `<div class="panel empty">${icon('box')}<h2 style="font-size:20px;color:var(--fg)">${esc(t('pub.nav'))}</h2><p>${esc(t('pub.empty'))}</p></div>`}
    <section class="panel pub-fx"><h2 class="section-title" style="font-size:18px">${esc(t('pub.readyTitle'))}</h2>
      <div><b>Amazon KDP</b><span>${esc(t('pub.kdp'))}</span></div>
      <div><b>Etsy</b><span>${esc(t('pub.etsy'))}</span></div>
      <div><b>Kobo · Apple · Google</b><span>${esc(t('pub.others'))}</span></div>
      <div><b>★</b><span>${esc(t('pub.all'))}</span></div></section>
    <p class="muted pub-ai">${esc(t('pub.ai'))}</p></div>`;
  mountPubBanner(el);
}
