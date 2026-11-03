// A tiny one-tap question for people who look at a book and do not add it to the cart:
// "What is stopping you?" Asked once per visitor, anonymous, easy to close. Answers show in Admin → Statistics.
import { api } from './api.js?v=20261103231414';
import { track } from './track.js?v=20261103231414';
import { store, esc } from './util.js?v=20261103231414';
import { getLang } from './i18n.js?v=20261103231414';
import { WHY_TEXT } from './why-i18n.js?v=20261103231414';

const KEYS = ['price', 'value', 'look', 'trust', 'amazon', 'format'];
// the free-text line under the answers: [placeholder, send button] in every language of the site
const WT = {
  en: ['Or write what stops you…', 'Send'], ro: ['Sau scrie ce te oprește…', 'Trimite'], it: ['Oppure scrivi cosa ti frena…', 'Invia'], fr: ['Ou écrivez ce qui vous retient…', 'Envoyer'], de: ['Oder schreiben Sie, was Sie zögern lässt …', 'Senden'],
  es: ['O escribe qué te frena…', 'Enviar'], pt: ['Ou escreva o que o impede…', 'Enviar'], nl: ['Of schrijf wat je tegenhoudt…', 'Verstuur'], pl: ['Albo napisz, co Cię powstrzymuje…', 'Wyślij'], cs: ['Nebo napište, co vás brzdí…', 'Odeslat'],
  sk: ['Alebo napíšte, čo vás brzdí…', 'Odoslať'], hu: ['Vagy írd le, mi tart vissza…', 'Küldés'], bg: ['Или напишете какво ви спира…', 'Изпрати'], hr: ['Ili napišite što vas koči…', 'Pošalji'], sl: ['Ali napišite, kaj vas ustavlja…', 'Pošlji'],
  el: ['Ή γράψτε τι σας εμποδίζει…', 'Αποστολή'], da: ['Eller skriv, hvad der holder dig tilbage…', 'Send'], sv: ['Eller skriv vad som håller dig tillbaka…', 'Skicka'], no: ['Eller skriv hva som holder deg tilbake…', 'Send'], fi: ['Tai kirjoita, mikä estää sinua…', 'Lähetä'],
  et: ['Või kirjuta, mis sind takistab…', 'Saada'], lv: ['Vai uzraksti, kas tevi attur…', 'Sūtīt'], lt: ['Arba parašykite, kas jus stabdo…', 'Siųsti'], uk: ['Або напишіть, що вас зупиняє…', 'Надіслати'],
};
const TXT = {
  en: { q: 'Quick question: what is stopping you from getting this book?', price: 'The price', value: 'Not sure it is worth it', look: 'I was only looking', trust: 'I am not sure about paying here', amazon: 'I prefer a paperback or Amazon', format: 'I cannot read this format', other: 'Something else', thanks: 'Thank you! This helps us a lot.' },
  ro: { q: 'O întrebare rapidă: ce te oprește să iei această carte?', price: 'Prețul', value: 'Nu sunt sigur că merită', look: 'Doar mă uitam', trust: 'Nu sunt sigur să plătesc aici', amazon: 'Prefer cartea tipărită sau Amazon', format: 'Nu pot citi acest format', other: 'Altceva', thanks: 'Mulțumim! Ne ajută foarte mult.' },
  it: { q: 'Una domanda veloce: cosa ti frena dall’acquistare questo libro?', price: 'Il prezzo', value: 'Non sono sicuro che valga', look: 'Stavo solo guardando', trust: 'Non mi fido a pagare qui', amazon: 'Preferisco il cartaceo o Amazon', format: 'Non posso leggere questo formato', other: 'Altro', thanks: 'Grazie! Ci aiuta molto.' },
};
// Honest follow-up after the answer: real facts only (no fake timers, no invented stock or buyers).
const FU = {
  en: { price: 'Fair. Check the price above: many of our books cost less than a coffee, and some are free.', value: 'Smart to check. Read the free sample first, then decide.', look: 'No pressure. When you are ready, the book opens on your phone right after payment.', trust: 'Payment is handled by Stripe, a secure payment provider. You read the book at once in your account.', amazon: 'Paperback is great too. This ebook is instant: no shipping, and you can read it today on your phone.', format: 'You read it right here in your browser, on phone or computer. No app needed.', other: 'Thank you. The book is one tap away whenever you want it.', buy: 'Get this book', sample: 'Read a free sample' },
  ro: { price: 'Corect. Vezi prețul de mai sus: multe cărți costă mai puțin decât o cafea, iar unele sunt gratuite.', value: 'E înțelept să verifici. Citește mai întâi fragmentul gratuit, apoi alegi.', look: 'Fără presiune. Când ești gata, cartea se deschide pe telefon imediat după plată.', trust: 'Plata se face prin Stripe, un procesator sigur. Citești cartea imediat, în contul tău.', amazon: 'Și cartea tipărită e bună. Ebook-ul e imediat: fără transport, o citești azi pe telefon.', format: 'O citești chiar aici, în browser, pe telefon sau calculator. Nu ai nevoie de aplicație.', other: 'Mulțumim. Cartea e la un singur tap distanță când vrei.', buy: 'Ia această carte', sample: 'Citește un fragment gratuit' },
  it: { price: 'Giusto. Guarda il prezzo qui sopra: molti libri costano meno di un caffè e alcuni sono gratis.', value: 'Bene controllare. Leggi prima l’anteprima gratuita, poi decidi.', look: 'Nessuna pressione. Quando vuoi, il libro si apre sul telefono subito dopo il pagamento.', trust: 'Il pagamento è gestito da Stripe, un sistema sicuro. Leggi subito il libro nel tuo account.', amazon: 'Anche il cartaceo va bene. L’ebook è immediato: niente spedizione, lo leggi oggi dal telefono.', format: 'Lo leggi qui nel browser, da telefono o computer. Nessuna app.', other: 'Grazie. Il libro è a un tocco quando vuoi.', buy: 'Prendi questo libro', sample: 'Leggi un’anteprima gratuita' },
};
let timer = null;
let state = null;   // { book, answer }
const textsFor = () => {
  const L = getLang(), W = WHY_TEXT[L];
  const d = TXT[L] || W || TXT.en;
  const f = FU[L] || (W && { price: W.fp, value: W.fv, look: W.fl, trust: W.ft, amazon: W.fa, format: W.ff, other: W.fo, buy: W.buy, sample: W.sample }) || FU.en;
  return { d, f };
};
function closeAll() { document.getElementById('why-wrap')?.remove(); state = null; }
// (re)draws the window in the language the visitor has right now
function paint() {
  const wrap = document.getElementById('why-wrap'); if (!wrap || !state) return;
  const { d, f } = textsFor(), wt = WT[getLang()] || WT.en, box = wrap.querySelector('#why-box'), { book, answer } = state;
  box.setAttribute('aria-label', d.q);
  if (!answer) {
    box.innerHTML = `<button type="button" class="why-x" aria-label="Close">×</button><p>${esc(d.q)}</p><div class="why-opts">${KEYS.map(k => `<button type="button" data-k="${k}">${esc(d[k])}</button>`).join('')}</div>
      <form class="why-w"><input type="text" maxlength="140" autocomplete="off" enterkeyhint="send" placeholder="${esc(wt[0])}" value="${esc(state.draft || '')}" aria-label="${esc(wt[0])}"><button type="submit">${esc(wt[1])}</button></form>`;
    const inp = box.querySelector('.why-w input');
    inp.oninput = () => { state.draft = inp.value; };
    box.querySelector('.why-w').onsubmit = e => {
      e.preventDefault(); const txt = inp.value.replace(/\s+/g, ' ').trim().slice(0, 140); if (!txt) { inp.focus(); return; }
      track('survey', { book_id: book.id, note: 'why=text: ' + txt });
      state.answer = 'other'; store.set('why-done', 1); paint();
    };
    box.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
      track('survey', { book_id: book.id, note: 'why=' + b.dataset.k });
      state.answer = b.dataset.k; store.set('why-done', 1); paint();
    });
  } else {
    const k = answer, hasSample = !!document.querySelector('.g-preview, .g-shots');
    box.innerHTML = `<button type="button" class="why-x" aria-label="Close">×</button><p>${esc(d.thanks)}</p><p style="font-weight:500">${esc(f[k] || f.other)}</p><div class="why-opts">${(k === 'value' && hasSample) ? `<button type="button" data-go="s">${esc(f.sample)}</button>` : ''}<button type="button" data-go="b" class="why-buy">${esc(f.buy)}</button></div>`;
    box.querySelector('[data-go="b"]').onclick = () => { closeAll(); document.querySelector('[data-buy],[data-free]')?.click(); };
    box.querySelector('[data-go="s"]')?.addEventListener('click', () => { closeAll(); document.querySelector('.g-preview, .g-shots')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  }
  box.querySelector('.why-x').onclick = () => { store.set('why-done', 1); closeAll(); };
}
window.addEventListener('librava:lang', paint);
window.addEventListener('hashchange', () => { if (!location.hash.includes('/book/')) closeAll(); });
window.addEventListener('popstate', () => { if (!location.hash.includes('/book/') && !/^\/book\//.test(location.pathname)) closeAll(); });
export function askWhy(book) {
  clearTimeout(timer); closeAll();
  try {
    if (store.get('why-done') || store.get('staff') || api.user()?.isAdmin || !book) return;
    timer = setTimeout(async function show() {
      try {
        if (!(location.hash.includes('/book/') || /^\/book\//.test(location.pathname)) || document.hidden || document.getElementById('why-wrap') || store.get('why-done')) return;
        if (document.querySelector('.modal, dialog[open], .consent, .gift-modal')) { timer = setTimeout(show, 3000); return; }
        if (await api.owns?.(book.id)) return;
        const wrap = document.createElement('div'); wrap.id = 'why-wrap';
        wrap.innerHTML = '<div id="why-box" role="dialog"></div>';
        wrap.addEventListener('click', e => { if (e.target === wrap) { store.set('why-done', 1); closeAll(); } });
        document.body.appendChild(wrap);
        state = { book, answer: null }; paint();
      } catch { }
    }, 14000);
  } catch { }
}
