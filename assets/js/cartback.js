// Return visit with books left in the cart: a quiet bar "your books are waiting", one tap to the cart.
// Shown at most once a day, only when the visitor was away for at least 2 hours. Never on the cart page.
import { store, esc } from './util.js?v=20261112191337';
import { getLang } from './i18n.js?v=20261112191337';
import { cart, go, currentPath } from './ui.js?v=20261112191337';
const T = {
  en: ['Your books are waiting in your cart', 'Go to cart'], ro: ['Cărțile tale te așteaptă în coș', 'Mergi la coș'], it: ['I tuoi libri ti aspettano nel carrello', 'Vai al carrello'],
  fr: ['Vos livres vous attendent dans votre panier', 'Voir le panier'], de: ['Deine Bücher warten im Warenkorb', 'Zum Warenkorb'], es: ['Tus libros te esperan en el carrito', 'Ir al carrito'],
  pt: ['Os seus livros esperam no carrinho', 'Ir ao carrinho'], nl: ['Je boeken wachten in je winkelwagen', 'Naar winkelwagen'], pl: ['Twoje książki czekają w koszyku', 'Przejdź do koszyka'],
  cs: ['Vaše knihy čekají v košíku', 'Do košíku'], sk: ['Vaše knihy čakajú v košíku', 'Do košíka'], hu: ['A könyveid várnak a kosárban', 'Irány a kosár'],
  bg: ['Книгите ви чакат в количката', 'Към количката'], hr: ['Vaše knjige čekaju u košarici', 'Idi u košaricu'], sl: ['Vaše knjige čakajo v košarici', 'V košarico'],
  el: ['Τα βιβλία σας περιμένουν στο καλάθι', 'Στο καλάθι'], da: ['Dine bøger venter i kurven', 'Gå til kurv'], sv: ['Dina böcker väntar i varukorgen', 'Till varukorgen'],
  no: ['Bøkene dine venter i handlekurven', 'Til handlekurv'], fi: ['Kirjasi odottavat ostoskorissa', 'Ostoskoriin'], et: ['Sinu raamatud ootavad ostukorvis', 'Ostukorvi'],
  lv: ['Jūsu grāmatas gaida grozā', 'Uz grozu'], lt: ['Jūsų knygos laukia krepšelyje', 'Į krepšelį'], uk: ['Ваші книги чекають у кошику', 'До кошика'],
};
export function cartBack() {
  try {
    const now = Date.now(), last = store.get('seen-at', 0), shown = store.get('cartback-at', 0);
    store.set('seen-at', now);
    const ids = cart.get();
    if (!ids.length || !last || now - last < 2 * 3600e3 || now - shown < 24 * 3600e3 || store.get('staff')) return;
    setTimeout(() => {
      if (/^\/?cart|\/cart/.test(currentPath()) || document.getElementById('cb-bar') || document.querySelector('.consent, .modal')) return;
      const [msg, btn] = T[getLang()] || T.en;
      const bar = document.createElement('div'); bar.id = 'cb-bar'; bar.setAttribute('role', 'status');
      bar.innerHTML = `<span>${esc(msg)}</span><button type="button" class="btn btn-buy" data-go>${esc(btn)}</button><button type="button" class="cb-x" aria-label="Close">×</button>`;
      bar.querySelector('[data-go]').onclick = () => { bar.remove(); go('/cart'); };
      bar.querySelector('.cb-x').onclick = () => bar.remove();
      document.body.appendChild(bar); store.set('cartback-at', now);
    }, 2500);
  } catch { }
}
