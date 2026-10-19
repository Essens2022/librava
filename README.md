# Librava — magazin propriu de cărți digitale

Magazin online pentru cărți digitale, cu structura unui mare magazin de cărți: căutare, categorii, pagini de carte, coș, plată, conturi și o **bibliotecă personală în care fiecare carte cumpărată se citește direct în browser**, pe telefon, tabletă sau calculator.

- **PDF** pentru cărți color cu pagini fixe (copii, rețete, atlase, ghiduri ilustrate). Se afișează exact ca la tipar, cu două pagini alăturate pe ecran lat.
- **EPUB** pentru text care se adaptează ecranului, cu mărime de font, fundal alb / sepia / noapte și cuprins.
- Pagina la care ai rămas și semnele de carte se salvează automat în cont.
- Vizitatorii pot citi un extras gratuit înainte să cumpere.
- Interfață în 24 de limbi: toate limbile mari ale Europei plus engleza (Anglia, America). Site-ul se deschide automat în limba telefonului sau calculatorului vizitatorului (engleză dacă limba lui nu e disponibilă), iar vizitatorul o poate schimba din butonul cu globul.
- Magazinul arată doar cărțile în limba aleasă. Când adaugi o carte, alegi limba ei în panoul de administrare. Din căutare se pot vedea, la cerere, și cărțile în toate limbile.
- Temă luminoasă implicit, cu opțiune de temă întunecată sau „ca telefonul”.

---

## 1. Probă rapidă (modul demo, fără nicio configurare)

Cât timp `assets/js/config.js` nu are cheile Supabase completate, site-ul rulează în **modul demo**: are 12 cărți de exemplu, iar conturile, cumpărăturile și cărțile adăugate se salvează doar în browserul tău. Plata este simulată.

Site-ul trebuie deschis printr-un server web (dublu-click pe `index.html` nu merge, din cauza modulelor JavaScript). Variante:

- **Pe calculator:** în folderul proiectului rulează `npx serve .` sau `python3 -m http.server 8000`, apoi deschide `http://localhost:8000`.
- **Direct online:** urcă folderul pe GitHub și activează GitHub Pages (pasul 6).

Cont de administrator în demo: `admin@librava.demo` / `admin123` (există și un buton „Intră ca administrator demo” pe pagina de login).

---

## 2. Baza de date (Supabase, plan gratuit)

1. Creează un proiect nou pe [supabase.com](https://supabase.com). **Folosește un proiect nou, separat de ADB Smart și BizScan.**
2. Deschide **SQL Editor → New query**, lipește tot conținutul din `supabase/schema.sql` și apasă **Run**. Se creează tabelele, regulile de securitate și cele trei spații de fișiere:
   - `covers`: coperți (publice)
   - `samples`: extrase gratuite (publice)
   - `books`: fișierele cărților (**private**, le poate deschide doar cine a cumpărat cartea)
3. Din **Project Settings → API** copiază `Project URL` și cheia `anon` / `publishable` în `assets/js/config.js`:

   ```js
   supabaseUrl: 'https://xxxx.supabase.co',
   supabaseAnonKey: 'eyJhbGciOi...',
   ```

   Din acest moment site-ul nu mai este în modul demo.
4. **Authentication → URL Configuration:** la *Site URL* pune adresa site-ului (de exemplu `https://numele-tau.github.io/librava/`) și adaug-o și la *Redirect URLs*.
5. *(Opțional)* **Authentication → Providers → Google**: activează-l pentru butonul „Continuă cu Google”. Dacă nu vrei login cu Google, pune `googleLogin: false` în `config.js`.

## 3. Contul tău de administrator

1. Deschide site-ul și creează-ți cont (Intră în cont → Creează cont).
2. În Supabase → SQL Editor rulează (cu emailul tău):

   ```sql
   update public.profiles set is_admin = true where email = 'emailul-tau@exemplu.com';
   ```
3. Reîncarcă site-ul. În meniu apare **Panou administrare**.

## 4. Plăți cu cardul (Stripe)

1. Creează cont pe [stripe.com](https://stripe.com) și completează datele firmei pentru plăți reale.
2. Instalează [Supabase CLI](https://supabase.com/docs/guides/cli) și, din folderul proiectului:

   ```bash
   supabase login
   supabase link --project-ref ID_PROIECT          # ID-ul din adresa proiectului
   supabase secrets set STRIPE_SECRET_KEY=sk_test_... SITE_URL=https://numele-tau.github.io/librava/
   supabase functions deploy create-checkout
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```
3. În Stripe → **Developers → Webhooks → Add endpoint**:
   - URL: `https://ID_PROIECT.supabase.co/functions/v1/stripe-webhook`
   - evenimente: `checkout.session.completed` și `checkout.session.async_payment_succeeded`
4. Copiază *Signing secret* (`whsec_...`) și rulează:

   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
   ```
5. Testează cu cheia `sk_test_...` și cardul de test Stripe `4242 4242 4242 4242`. Când totul merge, înlocuiește cu cheia `sk_live_...` și creează webhook-ul și în modul live.

Cum funcționează: coșul cere funcției `create-checkout` o sesiune Stripe (prețurile se iau din baza de date, nu din browser), clientul plătește pe pagina Stripe, iar `stripe-webhook` adaugă cărțile în biblioteca lui numai după confirmarea plății. Cărțile gratuite se adaugă direct, fără Stripe.

## 5. Cum încarci o carte

Panou administrare → **Adaugă carte**, în trei pași, ca la KDP:

1. **Detalii carte:** titlu, subtitlu, autor, categorie, descriere, limbă, cuvinte-cheie.
2. **Conținut:** copertă (JPG/PNG, recomandat 1600 × 2560 px), fișierul cărții (EPUB sau PDF; la PDF numărul de pagini se completează singur) și, opțional, un extras gratuit.
3. **Preț și publicare:** preț (0 = gratuită), preț de listă pentru reducere, dată, „Recomandată”, publicată sau ciornă.

Sfaturi:
- Pentru cărțile tale de pe KDP, PDF-ul interior color se poate urca direct.
- Pentru extras, exportă primele pagini într-un PDF separat.
- **Șterge** scoate cartea din magazin, dar cine a cumpărat-o o păstrează în bibliotecă.

## 6. Publicare pe internet (GitHub Pages)

1. Creează un repository nou pe GitHub și urcă tot conținutul folderului (fără folderul `supabase/` dacă nu vrei să fie public; nu conține parole).
2. **Settings → Pages → Deploy from a branch → main / root**.
3. Site-ul apare la `https://numele-tau.github.io/numele-repo/`. Poți lega și un domeniu propriu.
4. După ce treci pe Supabase, folderul `demo/` și fișierul `assets/js/demo-data.js` nu mai sunt folosite și le poți șterge (atunci șterge și importul din `api.js`).

## 7. Înainte de lansare

- Completează termenii de vânzare, politica de confidențialitate și datele firmei: textul `help.legalText` din `assets/js/i18n.js` și emailul `supportEmail` din `config.js`.
- Vânzarea de cărți digitale către clienți din UE are reguli de TVA proprii (TVA-ul țării cumpărătorului, regimul OSS). Verifică cu contabilul cum se aplică la firma ta și cum emiți facturile.
- Protecția fișierelor: cărțile stau într-un spațiu privat și se deschid doar prin linkuri temporare, doar pentru cumpărători, cu emailul cumpărătorului afișat discret în cititor. Este o protecție bună pentru un magazin mic, dar niciun cititor web nu poate împiedica 100% copierea de către cineva hotărât.

## Personalizare

- **Nume:** `siteName` în `config.js` (și titlul din `index.html`, `manifest.webmanifest`).
- **Culori:** variabilele de la începutul `assets/css/style.css` (`--hdr`, `--pista`, `--amber` etc.), cu o variantă pentru modul întunecat.
- **Categorii:** lista `CATS` din `assets/js/ui.js` plus traducerile `cat.*` din `i18n.js`.
- **Texte și limbi:** română, italiană și engleză sunt în `assets/js/i18n.js`; celelalte limbi au câte un fișier în `assets/js/lang/` (de exemplu `fr.js`). Lista limbilor afișate în buton este `LANGS` din `i18n.js`.

## Structura fișierelor

```
index.html                  pagina unică a aplicației
manifest.webmanifest        permite „Adaugă pe ecranul principal”
assets/css/style.css        tot designul
assets/js/config.js         setări (Supabase, monedă, limbă)
assets/js/app.js            pornire și navigare
assets/js/views.js          acasă, căutare, carte, coș, cont, bibliotecă, ajutor
assets/js/reader.js         cititorul integrat (PDF + EPUB)
assets/js/admin.js          panoul de administrare
assets/js/api.js            date: modul demo sau Supabase
assets/js/i18n.js           texte RO / IT / EN
assets/vendor/              PDF.js, epub.js, JSZip, Supabase (incluse, fără CDN)
demo/                       cărțile și coperțile de exemplu
supabase/schema.sql         baza de date + securitate
supabase/functions/         plata Stripe (checkout + webhook)
```
