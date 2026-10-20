// Ready-made notifications (Admin → Notifications): one text per language, filled in with the chosen book,
// price, code or percentage. {book} {author} {price} {code} {percent} are replaced when sending.
export const NTF_TEMPLATES = [
 {
  "key": "new_book",
  "icon": "book",
  "needs": [
   "book"
  ],
  "link": "book"
 },
 {
  "key": "price_drop",
  "icon": "tag",
  "needs": [
   "book"
  ],
  "link": "book"
 },
 {
  "key": "free_book",
  "icon": "bolt",
  "needs": [
   "book"
  ],
  "link": "book"
 },
 {
  "key": "sale",
  "icon": "tag",
  "needs": [
   "percent"
  ],
  "link": "#/search?deals=1",
  "books": true
 },
 {
  "key": "coupon",
  "icon": "tag",
  "needs": [
   "code",
   "percent"
  ],
  "link": "#/cart"
 },
 {
  "key": "series",
  "icon": "library",
  "needs": [
   "book"
  ],
  "link": "book"
 },
 {
  "key": "picks",
  "icon": "bookmark",
  "needs": [],
  "link": "#/search?sort=bestsellers",
  "books": true
 },
 {
  "key": "new_week",
  "icon": "bell",
  "needs": [],
  "link": "#/search?sort=newest",
  "books": true
 }
];
export const NTF_TEXT = {
"en": {
"new_book": [
"New on Librava: {book}",
"{author} has a new book. Start reading right away, on any device."
],
"price_drop": [
"Price drop: {book} now {price}",
"Limited-time price. Get it now and read it instantly."
],
"free_book": [
"Free for a limited time: {book}",
"Add it to your library today at no cost and read it anywhere."
],
"sale": [
"Sale: up to -{percent}% on selected eBooks",
"Discover the deals while they last."
],
"coupon": [
"Your discount code: {code}",
"Use it in the cart and save {percent}% on your next order."
],
"series": [
"The series continues: {book}",
"The new volume is here. Pick up the story right where you left off."
],
"picks": [
"Recommended for you",
"We picked a few books we think you'll love."
],
"new_week": [
"New this week on Librava",
"Fresh eBooks just arrived: novels, recipes, fitness and more."
]
},
"ro": {
"new_book": [
"Nou pe Librava: {book}",
"{author} are o carte nouă. Începe să o citești imediat, pe orice dispozitiv."
],
"price_drop": [
"Preț redus: {book} acum {price}",
"Preț valabil pentru o perioadă limitată. Cumpără acum și citește imediat."
],
"free_book": [
"Gratuit pentru o perioadă limitată: {book}",
"Adaug-o azi în biblioteca ta, fără niciun cost, și citește oriunde."
],
"sale": [
"Reduceri: până la -{percent}% la eBook-uri selectate",
"Descoperă ofertele cât timp sunt disponibile."
],
"coupon": [
"Codul tău de reducere: {code}",
"Folosește-l în coș și economisești {percent}% la următoarea comandă."
],
"series": [
"Seria continuă: {book}",
"Noul volum a apărut. Continuă povestea exact de unde ai rămas."
],
"picks": [
"Recomandate pentru tine",
"Am ales câteva cărți care credem că o să-ți placă."
],
"new_week": [
"Noutăți săptămâna aceasta pe Librava",
"Au sosit eBook-uri noi: romane, rețete, fitness și multe altele."
]
},
"it": {
"new_book": [
"Novità su Librava: {book}",
"{author} ha un nuovo libro. Inizia a leggerlo subito, su qualsiasi dispositivo."
],
"price_drop": [
"Prezzo ribassato: {book} ora a {price}",
"Prezzo valido per un periodo limitato. Compralo ora e leggilo subito."
],
"free_book": [
"Gratis per un periodo limitato: {book}",
"Aggiungilo oggi alla tua libreria senza costi e leggilo ovunque."
],
"sale": [
"Saldi: fino al -{percent}% su eBook selezionati",
"Scopri le offerte finché sono disponibili."
],
"coupon": [
"Il tuo codice sconto: {code}",
"Usalo nel carrello e risparmi il {percent}% sul prossimo ordine."
],
"series": [
"La serie continua: {book}",
"Il nuovo volume è arrivato. Riprendi la storia da dove l'avevi lasciata."
],
"picks": [
"Consigliati per te",
"Abbiamo scelto alcuni libri che pensiamo ti piaceranno."
],
"new_week": [
"Novità della settimana su Librava",
"Sono arrivati nuovi eBook: romanzi, ricette, fitness e molto altro."
]
},
"fr": {
"new_book": [
"Nouveau sur Librava : {book}",
"{author} publie un nouveau livre. Commencez à le lire tout de suite, sur tous vos appareils."
],
"price_drop": [
"Prix en baisse : {book} à {price}",
"Prix valable pour une durée limitée. Achetez-le maintenant et lisez-le aussitôt."
],
"free_book": [
"Gratuit pour une durée limitée : {book}",
"Ajoutez-le aujourd'hui à votre bibliothèque, sans frais, et lisez-le partout."
],
"sale": [
"Soldes : jusqu'à -{percent} % sur une sélection d'eBooks",
"Découvrez les offres tant qu'elles durent."
],
"coupon": [
"Votre code promo : {code}",
"Utilisez-le dans le panier et économisez {percent} % sur votre prochaine commande."
],
"series": [
"La série continue : {book}",
"Le nouveau tome est arrivé. Reprenez l'histoire là où vous l'aviez laissée."
],
"picks": [
"Recommandés pour vous",
"Nous avons choisi quelques livres qui devraient vous plaire."
],
"new_week": [
"Nouveautés de la semaine sur Librava",
"De nouveaux eBooks viennent d'arriver : romans, recettes, fitness et plus encore."
]
},
"de": {
"new_book": [
"Neu bei Librava: {book}",
"{author} hat ein neues Buch. Sofort lesen, auf jedem Gerät."
],
"price_drop": [
"Preis gesenkt: {book} jetzt für {price}",
"Nur für kurze Zeit. Jetzt kaufen und sofort lesen."
],
"free_book": [
"Für kurze Zeit kostenlos: {book}",
"Füge es heute kostenlos deiner Bibliothek hinzu und lies es überall."
],
"sale": [
"Sale: bis zu -{percent} % auf ausgewählte eBooks",
"Entdecke die Angebote, solange sie gelten."
],
"coupon": [
"Dein Rabattcode: {code}",
"Löse ihn im Warenkorb ein und spare {percent} % bei deiner nächsten Bestellung."
],
"series": [
"Die Reihe geht weiter: {book}",
"Der neue Band ist da. Lies genau dort weiter, wo du aufgehört hast."
],
"picks": [
"Empfehlungen für dich",
"Wir haben ein paar Bücher ausgewählt, die dir gefallen könnten."
],
"new_week": [
"Neu diese Woche bei Librava",
"Neue eBooks sind da: Romane, Rezepte, Fitness und mehr."
]
},
"es": {
"new_book": [
"Novedad en Librava: {book}",
"{author} tiene un libro nuevo. Empieza a leerlo ya, en cualquier dispositivo."
],
"price_drop": [
"Bajada de precio: {book} ahora a {price}",
"Precio por tiempo limitado. Cómpralo ahora y léelo al instante."
],
"free_book": [
"Gratis por tiempo limitado: {book}",
"Añádelo hoy a tu biblioteca sin coste y léelo donde quieras."
],
"sale": [
"Rebajas: hasta -{percent} % en eBooks seleccionados",
"Descubre las ofertas mientras duren."
],
"coupon": [
"Tu código de descuento: {code}",
"Úsalo en el carrito y ahorra un {percent} % en tu próximo pedido."
],
"series": [
"La serie continúa: {book}",
"Ya está aquí el nuevo volumen. Sigue la historia donde la dejaste."
],
"picks": [
"Recomendados para ti",
"Hemos elegido algunos libros que creemos que te encantarán."
],
"new_week": [
"Novedades de la semana en Librava",
"Acaban de llegar nuevos eBooks: novelas, recetas, fitness y más."
]
},
"pt": {
"new_book": [
"Novidade na Librava: {book}",
"{author} tem um livro novo. Comece a ler já, em qualquer dispositivo."
],
"price_drop": [
"Preço reduzido: {book} agora por {price}",
"Preço por tempo limitado. Compre agora e leia de imediato."
],
"free_book": [
"Grátis por tempo limitado: {book}",
"Adicione-o hoje à sua biblioteca sem custos e leia em qualquer lado."
],
"sale": [
"Saldos: até -{percent}% em eBooks selecionados",
"Descubra as ofertas enquanto durarem."
],
"coupon": [
"O seu código de desconto: {code}",
"Use-o no carrinho e poupe {percent}% na próxima encomenda."
],
"series": [
"A série continua: {book}",
"O novo volume chegou. Retome a história onde a deixou."
],
"picks": [
"Recomendados para si",
"Escolhemos alguns livros que achamos que vai adorar."
],
"new_week": [
"Novidades da semana na Librava",
"Chegaram novos eBooks: romances, receitas, fitness e muito mais."
]
},
"nl": {
"new_book": [
"Nieuw bij Librava: {book}",
"{author} heeft een nieuw boek. Begin meteen met lezen, op elk apparaat."
],
"price_drop": [
"Prijsverlaging: {book} nu {price}",
"Tijdelijke prijs. Koop nu en lees meteen."
],
"free_book": [
"Tijdelijk gratis: {book}",
"Voeg het vandaag gratis toe aan je bibliotheek en lees overal."
],
"sale": [
"Uitverkoop: tot -{percent}% op geselecteerde eBooks",
"Ontdek de aanbiedingen zolang ze geldig zijn."
],
"coupon": [
"Je kortingscode: {code}",
"Gebruik hem in de winkelwagen en bespaar {percent}% op je volgende bestelling."
],
"series": [
"De serie gaat verder: {book}",
"Het nieuwe deel is er. Lees verder waar je gebleven was."
],
"picks": [
"Aanbevolen voor jou",
"We hebben een paar boeken gekozen die je vast mooi vindt."
],
"new_week": [
"Nieuw deze week bij Librava",
"Nieuwe eBooks zijn binnen: romans, recepten, fitness en meer."
]
},
"pl": {
"new_book": [
"Nowość w Librava: {book}",
"{author} ma nową książkę. Zacznij czytać od razu, na każdym urządzeniu."
],
"price_drop": [
"Niższa cena: {book} teraz {price}",
"Cena przez ograniczony czas. Kup teraz i czytaj od razu."
],
"free_book": [
"Za darmo przez ograniczony czas: {book}",
"Dodaj ją dziś do swojej biblioteki bez opłat i czytaj wszędzie."
],
"sale": [
"Wyprzedaż: do -{percent}% na wybrane e-booki",
"Odkryj oferty, póki trwają."
],
"coupon": [
"Twój kod rabatowy: {code}",
"Użyj go w koszyku i oszczędź {percent}% przy następnym zamówieniu."
],
"series": [
"Seria trwa dalej: {book}",
"Nowy tom już jest. Wróć do historii tam, gdzie skończyłeś."
],
"picks": [
"Polecane dla Ciebie",
"Wybraliśmy kilka książek, które mogą Ci się spodobać."
],
"new_week": [
"Nowości tygodnia w Librava",
"Przyszły nowe e-booki: powieści, przepisy, fitness i więcej."
]
},
"cs": {
"new_book": [
"Novinka na Librava: {book}",
"{author} má novou knihu. Začněte číst hned, na jakémkoli zařízení."
],
"price_drop": [
"Nižší cena: {book} nyní za {price}",
"Cena platí jen omezenou dobu. Kupte teď a čtěte hned."
],
"free_book": [
"Na omezenou dobu zdarma: {book}",
"Přidejte si ji dnes zdarma do knihovny a čtěte kdekoli."
],
"sale": [
"Výprodej: až -{percent} % na vybrané e-knihy",
"Objevte nabídky, dokud platí."
],
"coupon": [
"Váš slevový kód: {code}",
"Použijte ho v košíku a ušetřete {percent} % na další objednávce."
],
"series": [
"Série pokračuje: {book}",
"Nový díl je tady. Pokračujte v příběhu tam, kde jste skončili."
],
"picks": [
"Doporučeno pro vás",
"Vybrali jsme pár knih, které se vám budou líbit."
],
"new_week": [
"Novinky týdne na Librava",
"Dorazily nové e-knihy: romány, recepty, fitness a další."
]
},
"sk": {
"new_book": [
"Novinka na Librava: {book}",
"{author} má novú knihu. Začnite čítať hneď, na akomkoľvek zariadení."
],
"price_drop": [
"Nižšia cena: {book} teraz za {price}",
"Cena platí len obmedzený čas. Kúpte teraz a čítajte hneď."
],
"free_book": [
"Na obmedzený čas zadarmo: {book}",
"Pridajte si ju dnes zadarmo do knižnice a čítajte kdekoľvek."
],
"sale": [
"Výpredaj: až -{percent} % na vybrané e-knihy",
"Objavte ponuky, kým platia."
],
"coupon": [
"Váš zľavový kód: {code}",
"Použite ho v košíku a ušetrite {percent} % pri ďalšej objednávke."
],
"series": [
"Séria pokračuje: {book}",
"Nový diel je tu. Pokračujte v príbehu tam, kde ste skončili."
],
"picks": [
"Odporúčané pre vás",
"Vybrali sme niekoľko kníh, ktoré sa vám budú páčiť."
],
"new_week": [
"Novinky týždňa na Librava",
"Prišli nové e-knihy: romány, recepty, fitness a ďalšie."
]
},
"hu": {
"new_book": [
"Új a Librava kínálatában: {book}",
"{author} új könyvet adott ki. Kezdd el olvasni azonnal, bármilyen eszközön."
],
"price_drop": [
"Árcsökkenés: {book} most {price}",
"Korlátozott ideig érvényes ár. Vedd meg most, és olvasd azonnal."
],
"free_book": [
"Korlátozott ideig ingyenes: {book}",
"Add hozzá még ma ingyen a könyvtáradhoz, és olvasd bárhol."
],
"sale": [
"Akció: akár -{percent}% kiválasztott e-könyvekre",
"Fedezd fel az ajánlatokat, amíg tartanak."
],
"coupon": [
"Kedvezménykódod: {code}",
"Használd a kosárban, és {percent}%-ot spórolsz a következő rendelésen."
],
"series": [
"Folytatódik a sorozat: {book}",
"Megjelent az új kötet. Folytasd a történetet ott, ahol abbahagytad."
],
"picks": [
"Neked ajánljuk",
"Kiválasztottunk néhány könyvet, amelyek szerintünk tetszeni fognak."
],
"new_week": [
"A hét újdonságai a Librava kínálatában",
"Új e-könyvek érkeztek: regények, receptek, fitnesz és még sok más."
]
},
"bg": {
"new_book": [
"Ново в Librava: {book}",
"{author} има нова книга. Започни да я четеш веднага, на всяко устройство."
],
"price_drop": [
"Намалена цена: {book} сега за {price}",
"Цена за ограничено време. Купи сега и чети веднага."
],
"free_book": [
"Безплатно за ограничено време: {book}",
"Добави я днес в библиотеката си безплатно и чети навсякъде."
],
"sale": [
"Разпродажба: до -{percent}% на избрани е-книги",
"Разгледай офертите, докато са налични."
],
"coupon": [
"Твоят код за отстъпка: {code}",
"Използвай го в количката и спести {percent}% от следващата поръчка."
],
"series": [
"Поредицата продължава: {book}",
"Новият том излезе. Продължи историята оттам, докъдето стигна."
],
"picks": [
"Препоръчани за теб",
"Избрахме няколко книги, които мислим, че ще харесаш."
],
"new_week": [
"Новото тази седмица в Librava",
"Пристигнаха нови е-книги: романи, рецепти, фитнес и още."
]
},
"hr": {
"new_book": [
"Novo na Libravi: {book}",
"{author} ima novu knjigu. Počnite čitati odmah, na bilo kojem uređaju."
],
"price_drop": [
"Niža cijena: {book} sada {price}",
"Cijena vrijedi ograničeno vrijeme. Kupite sada i čitajte odmah."
],
"free_book": [
"Besplatno na ograničeno vrijeme: {book}",
"Dodajte je danas besplatno u svoju knjižnicu i čitajte bilo gdje."
],
"sale": [
"Akcija: do -{percent}% na odabrane e-knjige",
"Otkrijte ponude dok traju."
],
"coupon": [
"Vaš kod za popust: {code}",
"Iskoristite ga u košarici i uštedite {percent}% na sljedećoj narudžbi."
],
"series": [
"Serijal se nastavlja: {book}",
"Novi nastavak je stigao. Nastavite priču ondje gdje ste stali."
],
"picks": [
"Preporučeno za vas",
"Odabrali smo nekoliko knjiga koje bi vam se mogle svidjeti."
],
"new_week": [
"Novo ovog tjedna na Libravi",
"Stigle su nove e-knjige: romani, recepti, fitness i još mnogo toga."
]
},
"sl": {
"new_book": [
"Novo na Libravi: {book}",
"{author} ima novo knjigo. Začnite brati takoj, na kateri koli napravi."
],
"price_drop": [
"Nižja cena: {book} zdaj {price}",
"Cena velja omejen čas. Kupite zdaj in berite takoj."
],
"free_book": [
"Omejen čas brezplačno: {book}",
"Še danes jo brezplačno dodajte v knjižnico in berite kjer koli."
],
"sale": [
"Razprodaja: do -{percent} % na izbrane e-knjige",
"Odkrijte ponudbe, dokler trajajo."
],
"coupon": [
"Vaša koda za popust: {code}",
"Uporabite jo v košarici in prihranite {percent} % pri naslednjem naročilu."
],
"series": [
"Zbirka se nadaljuje: {book}",
"Novi del je tu. Nadaljujte zgodbo tam, kjer ste ostali."
],
"picks": [
"Priporočeno za vas",
"Izbrali smo nekaj knjig, ki vam bodo všeč."
],
"new_week": [
"Novo ta teden na Libravi",
"Prispele so nove e-knjige: romani, recepti, fitnes in še več."
]
},
"el": {
"new_book": [
"Νέο στη Librava: {book}",
"Ο/Η {author} έχει νέο βιβλίο. Ξεκινήστε την ανάγνωση αμέσως, σε κάθε συσκευή."
],
"price_drop": [
"Μειωμένη τιμή: {book} τώρα {price}",
"Τιμή για περιορισμένο διάστημα. Αγοράστε τώρα και διαβάστε αμέσως."
],
"free_book": [
"Δωρεάν για περιορισμένο διάστημα: {book}",
"Προσθέστε το σήμερα δωρεάν στη βιβλιοθήκη σας και διαβάστε παντού."
],
"sale": [
"Εκπτώσεις: έως -{percent}% σε επιλεγμένα eBooks",
"Ανακαλύψτε τις προσφορές όσο διαρκούν."
],
"coupon": [
"Ο κωδικός έκπτωσής σας: {code}",
"Χρησιμοποιήστε τον στο καλάθι και κερδίστε {percent}% στην επόμενη παραγγελία."
],
"series": [
"Η σειρά συνεχίζεται: {book}",
"Ο νέος τόμος κυκλοφόρησε. Συνεχίστε την ιστορία από εκεί που μείνατε."
],
"picks": [
"Προτάσεις για εσάς",
"Επιλέξαμε μερικά βιβλία που πιστεύουμε ότι θα σας αρέσουν."
],
"new_week": [
"Νέα αυτής της εβδομάδας στη Librava",
"Ήρθαν νέα eBooks: μυθιστορήματα, συνταγές, fitness και άλλα."
]
},
"da": {
"new_book": [
"Nyt på Librava: {book}",
"{author} har en ny bog. Begynd at læse med det samme, på alle enheder."
],
"price_drop": [
"Prisfald: {book} nu {price}",
"Pris i begrænset tid. Køb nu og læs med det samme."
],
"free_book": [
"Gratis i begrænset tid: {book}",
"Føj den til dit bibliotek i dag uden beregning, og læs overalt."
],
"sale": [
"Udsalg: op til -{percent} % på udvalgte e-bøger",
"Se tilbuddene, mens de gælder."
],
"coupon": [
"Din rabatkode: {code}",
"Brug den i kurven og spar {percent} % på din næste ordre."
],
"series": [
"Serien fortsætter: {book}",
"Det nye bind er her. Fortsæt historien, hvor du slap."
],
"picks": [
"Anbefalet til dig",
"Vi har valgt nogle bøger, vi tror, du vil elske."
],
"new_week": [
"Nyt i denne uge på Librava",
"Nye e-bøger er kommet: romaner, opskrifter, fitness og mere."
]
},
"sv": {
"new_book": [
"Nytt på Librava: {book}",
"{author} har en ny bok. Börja läsa direkt, på vilken enhet som helst."
],
"price_drop": [
"Sänkt pris: {book} nu {price}",
"Pris under begränsad tid. Köp nu och läs direkt."
],
"free_book": [
"Gratis under begränsad tid: {book}",
"Lägg till den i ditt bibliotek i dag utan kostnad och läs var som helst."
],
"sale": [
"Rea: upp till -{percent} % på utvalda e-böcker",
"Upptäck erbjudandena medan de gäller."
],
"coupon": [
"Din rabattkod: {code}",
"Använd den i varukorgen och spara {percent} % på nästa beställning."
],
"series": [
"Serien fortsätter: {book}",
"Den nya delen är här. Fortsätt berättelsen där du slutade."
],
"picks": [
"Rekommenderat för dig",
"Vi har valt några böcker som vi tror att du kommer att gilla."
],
"new_week": [
"Nytt den här veckan på Librava",
"Nya e-böcker har kommit: romaner, recept, träning och mer."
]
},
"no": {
"new_book": [
"Nytt på Librava: {book}",
"{author} har en ny bok. Begynn å lese med en gang, på alle enheter."
],
"price_drop": [
"Prisfall: {book} nå {price}",
"Pris i en begrenset periode. Kjøp nå og les med en gang."
],
"free_book": [
"Gratis i en begrenset periode: {book}",
"Legg den til i biblioteket ditt i dag uten kostnad, og les overalt."
],
"sale": [
"Salg: opptil -{percent} % på utvalgte e-bøker",
"Oppdag tilbudene mens de varer."
],
"coupon": [
"Rabattkoden din: {code}",
"Bruk den i handlekurven og spar {percent} % på neste bestilling."
],
"series": [
"Serien fortsetter: {book}",
"Det nye bindet er her. Fortsett historien der du slapp."
],
"picks": [
"Anbefalt for deg",
"Vi har valgt noen bøker vi tror du vil like."
],
"new_week": [
"Nytt denne uken på Librava",
"Nye e-bøker har kommet: romaner, oppskrifter, trening og mer."
]
},
"fi": {
"new_book": [
"Uutta Libravassa: {book}",
"{author} on julkaissut uuden kirjan. Aloita lukeminen heti, millä tahansa laitteella."
],
"price_drop": [
"Hinta laski: {book} nyt {price}",
"Hinta voimassa rajoitetun ajan. Osta nyt ja lue heti."
],
"free_book": [
"Ilmainen rajoitetun ajan: {book}",
"Lisää se tänään kirjastoosi maksutta ja lue missä vain."
],
"sale": [
"Ale: jopa -{percent} % valituista e-kirjoista",
"Tutustu tarjouksiin, kun niitä vielä on."
],
"coupon": [
"Alennuskoodisi: {code}",
"Käytä sitä ostoskorissa ja säästä {percent} % seuraavasta tilauksesta."
],
"series": [
"Sarja jatkuu: {book}",
"Uusi osa on ilmestynyt. Jatka tarinaa siitä, mihin jäit."
],
"picks": [
"Suositeltu sinulle",
"Valitsimme muutaman kirjan, joista uskomme sinun pitävän."
],
"new_week": [
"Tämän viikon uutuudet Libravassa",
"Uusia e-kirjoja saapui: romaaneja, reseptejä, kuntoilua ja muuta."
]
},
"et": {
"new_book": [
"Uus Libravas: {book}",
"{author} on avaldanud uue raamatu. Hakka kohe lugema, igas seadmes."
],
"price_drop": [
"Hind langes: {book} nüüd {price}",
"Hind kehtib piiratud aja. Osta kohe ja loe kohe."
],
"free_book": [
"Piiratud ajaks tasuta: {book}",
"Lisa see täna tasuta oma raamatukokku ja loe kõikjal."
],
"sale": [
"Allahindlus: kuni -{percent}% valitud e-raamatutelt",
"Avasta pakkumised, kuni neid jätkub."
],
"coupon": [
"Sinu sooduskood: {code}",
"Kasuta seda ostukorvis ja säästa järgmiselt tellimuselt {percent}%."
],
"series": [
"Sari jätkub: {book}",
"Uus osa on ilmunud. Jätka lugu sealt, kus pooleli jäi."
],
"picks": [
"Sinu jaoks soovitatud",
"Valisime mõned raamatud, mis meie arvates sulle meeldivad."
],
"new_week": [
"Selle nädala uudised Libravas",
"Saabusid uued e-raamatud: romaanid, retseptid, treening ja palju muud."
]
},
"lv": {
"new_book": [
"Jaunums Librava: {book}",
"{author} ir jauna grāmata. Sāc lasīt uzreiz jebkurā ierīcē."
],
"price_drop": [
"Cena samazināta: {book} tagad {price}",
"Cena uz ierobežotu laiku. Pērc tagad un lasi uzreiz."
],
"free_book": [
"Uz ierobežotu laiku bez maksas: {book}",
"Pievieno to šodien savai bibliotēkai bez maksas un lasi jebkur."
],
"sale": [
"Izpārdošana: līdz -{percent}% atlasītām e-grāmatām",
"Atklāj piedāvājumus, kamēr tie ir spēkā."
],
"coupon": [
"Tavs atlaides kods: {code}",
"Izmanto to grozā un ietaupi {percent}% nākamajā pasūtījumā."
],
"series": [
"Sērija turpinās: {book}",
"Iznācis jaunais sējums. Turpini stāstu turpat, kur pārtrauci."
],
"picks": [
"Ieteikts tev",
"Izvēlējāmies dažas grāmatas, kas tev varētu patikt."
],
"new_week": [
"Šīs nedēļas jaunumi Librava",
"Ieradušās jaunas e-grāmatas: romāni, receptes, fitness un vēl."
]
},
"lt": {
"new_book": [
"Naujiena Librava: {book}",
"{author} išleido naują knygą. Pradėkite skaityti iškart, bet kuriame įrenginyje."
],
"price_drop": [
"Kaina sumažinta: {book} dabar {price}",
"Kaina galioja ribotą laiką. Pirkite dabar ir skaitykite iškart."
],
"free_book": [
"Ribotą laiką nemokamai: {book}",
"Pridėkite ją šiandien į savo biblioteką nemokamai ir skaitykite bet kur."
],
"sale": [
"Išpardavimas: iki -{percent}% atrinktoms el. knygoms",
"Atraskite pasiūlymus, kol jie galioja."
],
"coupon": [
"Jūsų nuolaidos kodas: {code}",
"Panaudokite jį krepšelyje ir sutaupykite {percent}% kitam užsakymui."
],
"series": [
"Serija tęsiasi: {book}",
"Išleista nauja dalis. Tęskite istoriją nuo ten, kur sustojote."
],
"picks": [
"Rekomenduojama jums",
"Išrinkome kelias knygas, kurios, manome, jums patiks."
],
"new_week": [
"Šios savaitės naujienos Librava",
"Atkeliavo naujų el. knygų: romanai, receptai, sportas ir dar daugiau."
]
},
"uk": {
"new_book": [
"Новинка в Librava: {book}",
"{author} має нову книгу. Почніть читати одразу, на будь-якому пристрої."
],
"price_drop": [
"Ціну знижено: {book} тепер {price}",
"Ціна діє обмежений час. Купуйте зараз і читайте одразу."
],
"free_book": [
"Безкоштовно обмежений час: {book}",
"Додайте її сьогодні до своєї бібліотеки безкоштовно й читайте будь-де."
],
"sale": [
"Розпродаж: до -{percent}% на вибрані електронні книги",
"Відкрийте пропозиції, поки вони діють."
],
"coupon": [
"Ваш код знижки: {code}",
"Використайте його в кошику й заощадьте {percent}% на наступному замовленні."
],
"series": [
"Серія продовжується: {book}",
"Вийшов новий том. Продовжуйте історію з того місця, де зупинилися."
],
"picks": [
"Рекомендовано для вас",
"Ми вибрали кілька книг, які, на нашу думку, вам сподобаються."
],
"new_week": [
"Новинки тижня в Librava",
"Надійшли нові електронні книги: романи, рецепти, фітнес і не тільки."
]
}
};
export function fillTemplate(key, lang, vals) {
  const pair = (NTF_TEXT[lang] || NTF_TEXT.en)[key] || ['', ''];
  const f = s => s.replace(/\{(book|author|price|code|percent)\}/g, (_, k) => vals[k] ?? '');
  return { title: f(pair[0]), body: f(pair[1]) };
}
