// =====================================================================
//  Legal pages (model texts — have them checked by a lawyer / accountant).
//  {company} {address} {vat} {country} {email} come from Admin → Settings → Company details.
// =====================================================================
export const LEGAL_PAGES = ['terms', 'privacy', 'cookies', 'withdrawal', 'imprint'];

const RO = {
  updated: 'Ultima actualizare: {date}',
  todo: 'de completat',
  title: { terms: 'Termeni și condiții', privacy: 'Politica de confidențialitate', cookies: 'Politica de cookie-uri', withdrawal: 'Dreptul de retragere', imprint: 'Date despre vânzător' },
  terms: [
    ['1. Cine suntem', 'Librava (librava.store) este un magazin online de cărți digitale (eBook-uri) operat de {company}, {address}, {country}, cod fiscal / P.IVA {vat}, email {email} („noi”). Folosind site-ul sau cumpărând o carte, accepți acești termeni.'],
    ['2. Contul tău', 'Pentru a cumpăra și a citi cărți ai nevoie de un cont. Ești responsabil pentru păstrarea în siguranță a parolei și pentru activitatea din contul tău. Trebuie să ai cel puțin 16 ani sau acordul unui părinte. Ne poți cere oricând ștergerea contului, din pagina Contul meu → Autentificare și securitate.'],
    ['3. Ce cumperi: o licență de citire', 'Când cumperi o carte primești o licență personală, neexclusivă și netransferabilă de a o citi în biblioteca ta Librava și, dacă autorul permite, de a descărca un exemplar pentru uz personal. Nu ai voie să copiezi, să revinzi, să distribui, să publici sau să faci disponibilă cartea altor persoane. Exemplarele descărcate pot conține numele și emailul tău.'],
    ['4. Prețuri și plată', 'Prețurile sunt afișate în euro și includ TVA, unde se aplică. Plata se face cu cardul sau prin alte metode oferite de procesatorul nostru de plăți, Stripe. Nu vedem și nu păstrăm datele cardului tău. Contractul se încheie în momentul în care plata este confirmată.'],
    ['5. Livrarea', 'Cartea apare imediat după plată în Biblioteca mea. Dacă nu apare în câteva minute, scrie-ne la {email}.'],
    ['6. Dreptul de retragere', 'Pentru conținutul digital livrat imediat, la plată ți se cere acordul expres pentru livrarea imediată și confirmarea că îți pierzi astfel dreptul de retragere de 14 zile. Detalii în pagina Dreptul de retragere.'],
    ['7. Probleme cu o carte', 'Dacă o carte nu se deschide sau are un defect, scrie-ne la {email}: o reparăm, o înlocuim sau îți returnăm banii.'],
    ['8. Utilizare corectă', 'Nu ai voie să încerci să ocolești protecțiile site-ului, să accesezi conturile altora, să folosești roboți pentru a copia conținut sau să publici recenzii false sau jignitoare. Putem șterge recenziile care încalcă aceste reguli și putem suspenda conturile folosite abuziv.'],
    ['9. Răspundere', 'Facem tot posibilul ca site-ul să funcționeze fără întrerupere, dar nu putem garanta acest lucru. Nu răspundem pentru daune indirecte, în limitele permise de lege. Drepturile tale legale de consumator rămân neatinse.'],
    ['10. Modificări și lege aplicabilă', 'Putem actualiza acești termeni; versiunea nouă se aplică cumpărăturilor făcute după publicare. Se aplică legea țării vânzătorului ({country}), fără a-ți restrânge protecția oferită de legea țării tale de reședință. Pentru orice nemulțumire scrie-ne la {email}; poți apela și la autoritatea pentru protecția consumatorilor din țara ta.'],
  ],
  privacy: [
    ['1. Operatorul datelor', '{company}, {address}, {country}, cod fiscal / P.IVA {vat}, email {email}, este operatorul datelor tale personale, conform Regulamentului (UE) 2016/679 (GDPR).'],
    ['2. Ce date folosim', 'Datele contului: nume, email, parolă (păstrată criptat). Datele cumpărăturilor: cărțile cumpărate, sumele, data, numărul comenzii. Datele de citire: pagina la care ai rămas și semnele de carte. Recenziile pe care le scrii. Consimțămintele tale (termeni, noutăți pe email). Nu primim și nu păstrăm datele cardului: plata este procesată de Stripe.'],
    ['3. De ce le folosim (temeiul legal)', 'Pentru a-ți crea contul și a-ți livra cărțile (executarea contractului). Pentru facturare și evidența vânzărilor (obligație legală). Pentru siguranța site-ului și prevenirea fraudelor (interes legitim). Pentru noutăți pe email doar dacă ai bifat acest lucru (consimțământ, pe care îl poți retrage oricând).'],
    ['4. Cui le transmitem', 'Supabase (găzduirea bazei de date și a fișierelor, servere în Uniunea Europeană, Irlanda); Stripe (procesarea plăților); GitHub Pages (găzduirea paginilor site-ului); furnizorul nostru de email (trimiterea emailurilor despre cont). Acești furnizori prelucrează datele doar în numele nostru, pe baza unor contracte conforme GDPR. Unii pot transfera date în afara UE, cu garanții adecvate (clauze contractuale standard). Nu vindem datele tale.'],
    ['5. Cât timp le păstrăm', 'Datele contului, până când îți ștergi contul. Datele despre vânzări, cât cere legea fiscală (de regulă 10 ani), fără legătură cu contul după ștergerea lui. Datele de citire și recenziile se șterg odată cu contul.'],
    ['6. Drepturile tale', 'Ai dreptul de acces, rectificare, ștergere, restricționare, portabilitate și opoziție, precum și dreptul de a-ți retrage consimțământul. Multe le poți exercita singur din Contul meu; pentru restul scrie-ne la {email}. Ai dreptul să depui o plângere la autoritatea de protecție a datelor din țara ta.'],
    ['7. Siguranță', 'Conexiunea este criptată (HTTPS), parolele sunt păstrate criptat, iar fiecare client are acces doar la datele și cărțile proprii.'],
  ],
  cookies: [
    ['Ce folosim', 'Librava nu folosește cookie-uri de publicitate sau de urmărire și nu folosește instrumente de analiză a vizitatorilor. Folosim doar stocarea necesară în browserul tău (localStorage, IndexedDB și memoria cache a site-ului) pentru: a te ține conectat la cont, coșul de cumpărături, limba și tema alese, progresul de citire și cărțile salvate pentru citit offline.'],
    ['Furnizori', 'La plată ești dus pe pagina securizată Stripe, care folosește propriile cookie-uri necesare pentru siguranța plății și prevenirea fraudelor. Fonturile și toate fișierele site-ului sunt servite direct de noi.'],
    ['Cum le controlezi', 'Poți șterge oricând aceste date din setările browserului. Atunci vei fi deconectat, coșul se golește, iar cărțile salvate offline trebuie descărcate din nou.'],
  ],
  withdrawal: [
    ['Regula generală', 'Ca și consumator din Uniunea Europeană ai, în general, dreptul de a te retrage dintr-un contract încheiat la distanță în 14 zile, fără motiv.'],
    ['Excepția pentru conținut digital', 'Pentru conținutul digital care nu este livrat pe un suport fizic (eBook-uri), dreptul de retragere se pierde dacă livrarea a început cu acordul tău expres prealabil și ai confirmat că știi că îți pierzi astfel acest drept (art. 16 lit. m din Directiva 2011/83/UE). La plată îți cerem această confirmare, iar cartea este livrată imediat în biblioteca ta.'],
    ['Când îți returnăm banii', 'Dacă o carte nu se deschide, are un defect sau nu corespunde descrierii, scrie-ne la {email} în cel mult 14 zile de la cumpărare, cu numărul comenzii (LIB-…). Reparăm problema sau îți returnăm integral banii pe aceeași metodă de plată.'],
  ],
  imprint: [
    ['Vânzător', '{company}'],
    ['Adresă', '{address}, {country}'],
    ['Cod fiscal / P.IVA', '{vat}'],
    ['Contact', '{email}'],
    ['Plăți', 'Procesate de Stripe Payments Europe Ltd.'],
  ],
  consentTitle: 'Confidențialitatea ta',
  consentText: 'Librava nu folosește reclame și nu te urmărește. Folosim doar stocarea necesară în browser pentru cont, coș, limbă și citirea offline. Continuând, accepți Termenii și condițiile și Politica de confidențialitate.',
  consentOk: 'Accept și continui',
  consentMore: 'Citește detaliile',
};

const IT = {
  updated: 'Ultimo aggiornamento: {date}',
  todo: 'da completare',
  title: { terms: 'Termini e condizioni', privacy: 'Informativa sulla privacy', cookies: 'Cookie policy', withdrawal: 'Diritto di recesso', imprint: 'Dati del venditore' },
  terms: [
    ['1. Chi siamo', 'Librava (librava.store) è un negozio online di libri digitali (eBook) gestito da {company}, {address}, {country}, P.IVA / codice fiscale {vat}, email {email} („noi”). Usando il sito o acquistando un libro accetti questi termini.'],
    ['2. Il tuo account', 'Per acquistare e leggere i libri ti serve un account. Sei responsabile della custodia della password e delle attività svolte con il tuo account. Devi avere almeno 16 anni o il consenso di un genitore. Puoi chiedere in qualsiasi momento la cancellazione dell\'account da Il mio account → Accesso e sicurezza.'],
    ['3. Cosa acquisti: una licenza di lettura', 'Acquistando un libro ricevi una licenza personale, non esclusiva e non trasferibile per leggerlo nella tua libreria Librava e, se l\'autore lo consente, per scaricarne una copia per uso personale. Non puoi copiare, rivendere, distribuire, pubblicare o rendere disponibile il libro ad altri. Le copie scaricate possono riportare il tuo nome e la tua email.'],
    ['4. Prezzi e pagamento', 'I prezzi sono in euro e comprendono l\'IVA, ove applicabile. Il pagamento avviene con carta o con gli altri metodi offerti dal nostro processore di pagamento, Stripe. Non vediamo né conserviamo i dati della tua carta. Il contratto si conclude quando il pagamento viene confermato.'],
    ['5. Consegna', 'Il libro compare subito dopo il pagamento nella tua Libreria. Se non compare entro pochi minuti, scrivici a {email}.'],
    ['6. Diritto di recesso', 'Per i contenuti digitali forniti subito, al pagamento ti chiediamo il consenso espresso alla fornitura immediata e la conferma di sapere che così perdi il diritto di recesso di 14 giorni. Dettagli nella pagina Diritto di recesso.'],
    ['7. Problemi con un libro', 'Se un libro non si apre o è difettoso, scrivici a {email}: lo correggiamo, lo sostituiamo o ti rimborsiamo.'],
    ['8. Uso corretto', 'Non puoi aggirare le protezioni del sito, accedere agli account altrui, usare robot per copiare contenuti o pubblicare recensioni false od offensive. Possiamo rimuovere le recensioni che violano queste regole e sospendere gli account usati in modo abusivo.'],
    ['9. Responsabilità', 'Facciamo il possibile perché il sito funzioni senza interruzioni, ma non possiamo garantirlo. Nei limiti di legge non rispondiamo di danni indiretti. I tuoi diritti di consumatore restano invariati.'],
    ['10. Modifiche e legge applicabile', 'Possiamo aggiornare questi termini; la nuova versione vale per gli acquisti successivi alla pubblicazione. Si applica la legge del paese del venditore ({country}), senza ridurre la protezione che ti offre la legge del tuo paese di residenza. Per qualsiasi reclamo scrivici a {email}; puoi rivolgerti anche alle autorità di tutela dei consumatori del tuo paese.'],
  ],
  privacy: [
    ['1. Titolare del trattamento', '{company}, {address}, {country}, P.IVA / codice fiscale {vat}, email {email}, è titolare del trattamento dei tuoi dati personali ai sensi del Regolamento (UE) 2016/679 (GDPR).'],
    ['2. Quali dati trattiamo', 'Dati dell\'account: nome, email, password (conservata cifrata). Dati degli acquisti: libri acquistati, importi, data, numero d\'ordine. Dati di lettura: pagina raggiunta e segnalibri. Le recensioni che scrivi. I tuoi consensi (termini, novità via email). Non riceviamo né conserviamo i dati della carta: il pagamento è gestito da Stripe.'],
    ['3. Perché (base giuridica)', 'Per creare l\'account e consegnarti i libri (esecuzione del contratto). Per fatturazione e registri delle vendite (obbligo di legge). Per la sicurezza del sito e la prevenzione delle frodi (legittimo interesse). Per le novità via email solo se l\'hai scelto (consenso, revocabile in qualsiasi momento).'],
    ['4. A chi li comunichiamo', 'Supabase (database e file, server nell\'Unione Europea, Irlanda); Stripe (pagamenti); GitHub Pages (pubblicazione delle pagine del sito); il nostro fornitore di email (email relative all\'account). Questi fornitori trattano i dati solo per nostro conto, con contratti conformi al GDPR. Alcuni possono trasferire dati fuori dall\'UE con garanzie adeguate (clausole contrattuali standard). Non vendiamo i tuoi dati.'],
    ['5. Per quanto tempo', 'I dati dell\'account fino alla sua cancellazione. I dati di vendita per il tempo richiesto dalla normativa fiscale (di regola 10 anni), scollegati dall\'account dopo la cancellazione. Dati di lettura e recensioni vengono cancellati con l\'account.'],
    ['6. I tuoi diritti', 'Hai diritto di accesso, rettifica, cancellazione, limitazione, portabilità e opposizione, e di revocare il consenso. Molti puoi esercitarli da solo da Il mio account; per gli altri scrivici a {email}. Puoi proporre reclamo all\'autorità di controllo (in Italia, il Garante per la protezione dei dati personali).'],
    ['7. Sicurezza', 'La connessione è cifrata (HTTPS), le password sono conservate cifrate e ogni cliente accede solo ai propri dati e libri.'],
  ],
  cookies: [
    ['Cosa usiamo', 'Librava non usa cookie pubblicitari o di tracciamento né strumenti di analisi dei visitatori. Usiamo solo l\'archiviazione tecnica necessaria nel tuo browser (localStorage, IndexedDB e cache del sito) per: mantenere l\'accesso all\'account, il carrello, lingua e tema scelti, i progressi di lettura e i libri salvati per la lettura offline.'],
    ['Fornitori', 'Al pagamento vieni portato sulla pagina sicura di Stripe, che usa propri cookie tecnici per la sicurezza del pagamento e la prevenzione delle frodi. I caratteri e tutti i file del sito sono serviti direttamente da noi.'],
    ['Come gestirli', 'Puoi cancellare questi dati in qualsiasi momento dalle impostazioni del browser. Verrai disconnesso, il carrello si svuoterà e i libri salvati offline andranno scaricati di nuovo.'],
  ],
  withdrawal: [
    ['Regola generale', 'Come consumatore nell\'Unione Europea hai, in generale, il diritto di recedere da un contratto a distanza entro 14 giorni senza motivo.'],
    ['Eccezione per i contenuti digitali', 'Per i contenuti digitali non forniti su supporto materiale (eBook) il diritto di recesso si perde se la fornitura è iniziata con il tuo previo consenso espresso e hai riconosciuto di perdere così tale diritto (art. 16, lett. m, Direttiva 2011/83/UE; art. 59, lett. o, Codice del Consumo). Al pagamento ti chiediamo questa conferma e il libro viene consegnato subito nella tua libreria.'],
    ['Quando rimborsiamo', 'Se un libro non si apre, è difettoso o non corrisponde alla descrizione, scrivici a {email} entro 14 giorni dall\'acquisto indicando il numero d\'ordine (LIB-…). Risolviamo il problema o ti rimborsiamo integralmente con lo stesso metodo di pagamento.'],
  ],
  imprint: [['Venditore', '{company}'], ['Indirizzo', '{address}, {country}'], ['P.IVA / Codice fiscale', '{vat}'], ['Contatto', '{email}'], ['Pagamenti', 'Gestiti da Stripe Payments Europe Ltd.']],
  consentTitle: 'La tua privacy',
  consentText: 'Librava non usa pubblicità e non ti traccia. Usiamo solo l\'archiviazione tecnica necessaria nel browser per account, carrello, lingua e lettura offline. Continuando accetti i Termini e condizioni e l\'Informativa sulla privacy.',
  consentOk: 'Accetto e continuo',
  consentMore: 'Leggi i dettagli',
};

const EN = {
  updated: 'Last updated: {date}',
  todo: 'to be completed',
  title: { terms: 'Terms and conditions', privacy: 'Privacy policy', cookies: 'Cookie policy', withdrawal: 'Right of withdrawal', imprint: 'Seller information' },
  terms: [
    ['1. Who we are', 'Librava (librava.store) is an online shop for digital books (eBooks) run by {company}, {address}, {country}, VAT / tax number {vat}, email {email} ("we"). By using the site or buying a book you accept these terms.'],
    ['2. Your account', 'You need an account to buy and read books. You are responsible for keeping your password safe and for activity in your account. You must be at least 16 or have a parent\'s consent. You can delete your account at any time from Your account → Login & security.'],
    ['3. What you buy: a reading licence', 'When you buy a book you receive a personal, non-exclusive, non-transferable licence to read it in your Librava library and, where the author allows it, to download a copy for personal use. You may not copy, resell, distribute, publish or make the book available to others. Downloaded copies may show your name and email.'],
    ['4. Prices and payment', 'Prices are in euro and include VAT where applicable. Payment is made by card or other methods offered by our payment processor, Stripe. We never see or store your card details. The contract is concluded when the payment is confirmed.'],
    ['5. Delivery', 'The book appears in My library right after payment. If it does not appear within a few minutes, write to {email}.'],
    ['6. Right of withdrawal', 'For digital content delivered immediately, at checkout we ask for your express consent to immediate delivery and your acknowledgement that you thereby lose the 14-day right of withdrawal. Details on the Right of withdrawal page.'],
    ['7. Problems with a book', 'If a book does not open or is faulty, write to {email}: we fix it, replace it or refund you.'],
    ['8. Fair use', 'You may not try to get around the site\'s protections, access other people\'s accounts, use robots to copy content or post false or abusive reviews. We may remove reviews that break these rules and suspend accounts used abusively.'],
    ['9. Liability', 'We do our best to keep the site running without interruption but cannot guarantee it. To the extent permitted by law we are not liable for indirect damages. Your statutory consumer rights are not affected.'],
    ['10. Changes and governing law', 'We may update these terms; the new version applies to purchases made after publication. The law of the seller\'s country ({country}) applies, without reducing the protection you enjoy under the law of your country of residence. For any complaint write to {email}; you can also contact the consumer protection authority in your country.'],
  ],
  privacy: [
    ['1. Data controller', '{company}, {address}, {country}, VAT / tax number {vat}, email {email}, is the controller of your personal data under Regulation (EU) 2016/679 (GDPR).'],
    ['2. What data we use', 'Account data: name, email, password (stored encrypted). Purchase data: books bought, amounts, date, order number. Reading data: the page you reached and your bookmarks. Reviews you write. Your consents (terms, email news). We never receive or store card details: payments are handled by Stripe.'],
    ['3. Why (legal basis)', 'To create your account and deliver your books (performance of the contract). For invoicing and sales records (legal obligation). For site security and fraud prevention (legitimate interest). For email news only if you opted in (consent, which you can withdraw at any time).'],
    ['4. Who we share it with', 'Supabase (database and file hosting, servers in the European Union, Ireland); Stripe (payments); GitHub Pages (hosting of the site\'s pages); our email provider (account emails). These providers process data only on our behalf under GDPR-compliant contracts. Some may transfer data outside the EU with appropriate safeguards (standard contractual clauses). We do not sell your data.'],
    ['5. How long we keep it', 'Account data until you delete your account. Sales data for as long as tax law requires (usually 10 years), detached from your account after deletion. Reading data and reviews are deleted with your account.'],
    ['6. Your rights', 'You have the right of access, rectification, erasure, restriction, portability and objection, and to withdraw consent. Many you can exercise yourself from Your account; for the others write to {email}. You can lodge a complaint with the data protection authority in your country.'],
    ['7. Security', 'The connection is encrypted (HTTPS), passwords are stored encrypted and each customer can only access their own data and books.'],
  ],
  cookies: [
    ['What we use', 'Librava does not use advertising or tracking cookies and no visitor analytics. We only use the storage your browser needs (localStorage, IndexedDB and the site cache) to keep you signed in, keep your cart, your chosen language and theme, your reading progress and the books saved for offline reading.'],
    ['Providers', 'At checkout you are taken to Stripe\'s secure page, which uses its own necessary cookies for payment security and fraud prevention. Fonts and all site files are served by us directly.'],
    ['How to control it', 'You can clear this data at any time in your browser settings. You will then be signed out, your cart will be emptied and books saved offline will need to be saved again.'],
  ],
  withdrawal: [
    ['General rule', 'As a consumer in the European Union you generally have the right to withdraw from a distance contract within 14 days without giving a reason.'],
    ['Exception for digital content', 'For digital content not supplied on a physical medium (eBooks), the right of withdrawal is lost if delivery has begun with your prior express consent and your acknowledgement that you thereby lose this right (Art. 16(m) Directive 2011/83/EU). At checkout we ask for this confirmation and the book is delivered to your library immediately.'],
    ['When we refund', 'If a book does not open, is faulty or does not match its description, write to {email} within 14 days of purchase with your order number (LIB-…). We fix the problem or refund you in full using the same payment method.'],
  ],
  imprint: [['Seller', '{company}'], ['Address', '{address}, {country}'], ['VAT / tax number', '{vat}'], ['Contact', '{email}'], ['Payments', 'Processed by Stripe Payments Europe Ltd.']],
  consentTitle: 'Your privacy',
  consentText: 'Librava shows no ads and does not track you. We only use the browser storage needed for your account, cart, language and offline reading. By continuing you accept the Terms and conditions and the Privacy policy.',
  consentOk: 'Accept and continue',
  consentMore: 'Read the details',
};

export const LEGAL_VERSION = '2026-10-20';
export function legalText(lang) { return lang === 'ro' ? RO : lang === 'it' ? IT : EN; }
