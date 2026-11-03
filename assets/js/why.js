// A tiny one-tap question for people who look at a book and do not add it to the cart:
// "What is stopping you?" Asked once per visitor, anonymous, easy to close. Answers show in Admin → Statistics.
import { api } from './api.js?v=20261103110507';
import { track } from './track.js?v=20261103110507';
import { store, esc } from './util.js?v=20261103110507';
import { getLang } from './i18n.js?v=20261103110507';

const KEYS = ['price', 'value', 'look', 'trust', 'amazon', 'format', 'other'];
const TXT = {
  en: { q: 'Quick question: what is stopping you from getting this book?', price: 'The price', value: 'Not sure it is worth it', look: 'I was only looking', trust: 'I am not sure about paying here', amazon: 'I prefer a paperback or Amazon', format: 'I cannot read this format', other: 'Something else', thanks: 'Thank you! This helps us a lot.' },
  ro: { q: 'O întrebare rapidă: ce te oprește să iei această carte?', price: 'Prețul', value: 'Nu sunt sigur că merită', look: 'Doar mă uitam', trust: 'Nu sunt sigur să plătesc aici', amazon: 'Prefer cartea tipărită sau Amazon', format: 'Nu pot citi acest format', other: 'Altceva', thanks: 'Mulțumim! Ne ajută foarte mult.' },
  it: { q: 'Una domanda veloce: cosa ti frena dall’acquistare questo libro?', price: 'Il prezzo', value: 'Non sono sicuro che valga', look: 'Stavo solo guardando', trust: 'Non mi fido a pagare qui', amazon: 'Preferisco il cartaceo o Amazon', format: 'Non posso leggere questo formato', other: 'Altro', thanks: 'Grazie! Ci aiuta molto.' },
};
let timer = null;
export function askWhy(book) {
  clearTimeout(timer); document.getElementById('why-box')?.remove();
  try {
    if (store.get('why-done') || store.get('staff') || api.user()?.isAdmin || !book) return;
    timer = setTimeout(async () => {
      try {
        if (!location.hash.includes('/book/') || document.hidden || document.getElementById('why-box') || store.get('why-done')) return;
        if (document.querySelector('.modal, dialog[open], .cookie, .ck')) return;
        if (await api.owns?.(book.id)) return;
        const d = TXT[getLang()] || TXT.en;
        const box = document.createElement('div'); box.id = 'why-box'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', d.q);
        box.innerHTML = `<button type="button" class="why-x" aria-label="Close">×</button><p>${esc(d.q)}</p><div class="why-opts">${KEYS.map(k => `<button type="button" data-k="${k}">${esc(d[k])}</button>`).join('')}</div>`;
        const close = () => { box.remove(); store.set('why-done', 1); };
        box.querySelector('.why-x').onclick = close;
        box.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
          track('survey', { book_id: book.id, note: 'why=' + b.dataset.k });
          box.innerHTML = `<p>${esc(d.thanks)}</p>`; store.set('why-done', 1); setTimeout(() => box.remove(), 2200);
        });
        document.body.appendChild(box);
      } catch { }
    }, 14000);
  } catch { }
}
