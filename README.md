# Manager 24/7 by PARADIM 1.6.0 development

> Copyright © 2026 PARADIM Operations SRL. Toate drepturile rezervate.  
> Autor concept și coordonator produs: Marius Paul Nemeșu.  
> Software proprietar — consultați [LICENSE-PROPRIETARY.md](./LICENSE-PROPRIETARY.md) și [NOTICE](./NOTICE).

Aplicație RO/EN pentru costul și profitabilitatea preparatelor HoReCa, disponibilă
ca Android, Web și PWA. Identificator Android: `ro.paradim.professionalfoodcost`.

## Versiunea 1.6.0 development

Daily Operations, AI Daily Manager, Control Mode, documente cu expirare și checklisturi HR complete, cu salvare offline și sincronizare în cont. Demo instant este izolat de conturile reale. 402 teste automate și scenariile noi de interacțiune au trecut; vezi [starea verificărilor](./VERIFICARE-1.6.0.json) și [notele versiunii](./RELEASE-1.6.0.md) pentru build și limitele testării. Versiunea rămâne destinată testării.

## Versiunea 1.5.5 (istoric)

- Nutriție offline fără cost pe calcul: 938 denumiri exacte și 12 aliasuri generice orientative. Modelele cu toate cele nouă valori numerice cresc de la 110 la 160 din 479. Datele generice rămân marcate ca estimări și cer verificarea produsului folosit.
- Simulator pe ingredient: gramaj, preț și ofertă de la alt furnizor, cu recalcularea pierderilor și fără salvarea modificărilor în rețeta publicată.
- Alertele de preț recalculează și semipreparatele; arată rețetele care depășesc ținta și efectul combinat al modificărilor.
- Facturile PDF/foto/XML cer selecția rândurilor și confirmare explicită. Potrivirile produs–furnizor se învață după aplicare; se păstrează și la întreruperea conexiunii. Prețurile negative și monedele străine nu se aplică implicit ca RON.
- Menu engineering folosește vânzările înregistrate și marja, afișează maximum trei acțiuni și deschide simulatorul pentru preparatul ales. Importul recunoaște coloana „Porții”; vânzările offline se reconciliază fără pierderea modificărilor locale.
- SDK Sentry nativ inclus în APK-ul compilat complet, cu filtrarea evenimentelor JavaScript. Activarea cere DSN-ul proiectului și recompilare cu acea configurație; configurare în [SENTRY-SETUP.md](./SENTRY-SETUP.md). Primirea unui crash real nu a fost verificată.
- Plugin Expo local pentru păstrarea fundalului opac, temei light, camerei și configurației de semnare la regenerarea proiectului Android.
- 376 teste automate și 47 scenarii pe componente trecute; TypeScript, lint, verificarea compatibilității Expo și exportul Android Hermes trecute.
- Actualizări compatibile în Expo SDK 57. Auditul rămâne la 33 vulnerabilități: 21 high, 12 moderate, 0 critical. Nu s-a forțat o retrogradare a Expo pentru a ascunde raportul.
- Android 1.5.5 / versionCode 59: build Gradle complet, APK arm64 pentru test, semnătură v2 și aliniere ZIP/ELF la 16 KB verificate. iOS build 30 în configurație; nu s-a compilat un binar iOS.

Starea buildului nativ și probele live sunt descrise în [RELEASE-1.5.5.md](./RELEASE-1.5.5.md) și [VERIFICARE-1.5.5.json](./VERIFICARE-1.5.5.json). Simulările cu adaptoare nu confirmă livrarea OTP, plata, camera, partajarea sau instalarea pe telefon fizic.

## Versiunea 1.5.4 (istoric)

- Nutriție calculată automat în rețeta finală și în exporturile PDF/Excel, la 100 g și pe porție.
- Baza oficială ANSES-Ciqual 2025: 3.484 alimente, inclusă offline; fără cheie API, abonament de date sau cost pe calcul. Datele locale ocupă 494.793 bytes.
- 855 denumiri exacte RO/EN pentru 228 alimente; căutare locală pentru toate înregistrările, cu opțiuni explicite pentru produse ambigue.
- Etichetele și datele introduse manual au prioritate. Referința sursei, codul alimentului, valorile aproximative și conversiile de masă se păstrează la salvare.
- Calcule pe greutatea netă, cu greutate finală măsurată sau estimată din ingredientele curente. Conversiile ml/l/buc cer densitatea ori masa netă efectivă.
- 360 teste automate și 34 scenarii pe componente trecute; TypeScript și lint trecute.
- Android 1.5.4 / versionCode 58; iOS build 29.

Ingredientele fără date complete cer alegerea alimentului potrivit sau completarea din eticheta furnizorului. Lipsa rămâne vizibilă; totalurile parțiale nu sunt afișate ca valori ale întregii rețete. Bibliotecile conțin și denumiri de marcă ori ingrediente ambigue: [auditul de acoperire](./qa-results/nutrition-coverage.json) arată exact starea fiecărei categorii.

APK-ul este pentru test: bundle Hermes recompilat, cu codul nativ păstrat din 1.5.3. Nu s-a executat un build Gradle complet și nu s-a verificat pe telefon. Detalii: [RELEASE-1.5.4.md](./RELEASE-1.5.4.md), [VERIFICARE-1.5.4.json](./VERIFICARE-1.5.4.json), [NUTRITION-DATA-SOURCES.md](./NUTRITION-DATA-SOURCES.md).

## Versiunea 1.5.3 (istoric)

- Foldere cu fotografii offline; grile 2 x 2 în Rețete și Cont.
- HACCP: Azi, Formulare, Înregistrări; căutare, categorie, paginare și favorite salvate separat pentru fiecare cont pe dispozitiv.
- Fotografii de rețete păstrate în schițe după repornire; citirea scanărilor/importurilor funcționează în web și Android.
- Export JSON în browser și mesaje corecte când partajarea nativă lipsește.
- Corecție export Excel HR: rândul de total nu mai suprapune celulele unite.
- 336 teste automate și 26 scenarii pe componente trecute; TypeScript și lint trecute.
- Android 1.5.3 / versionCode 57; iOS build 28.

APK-ul livrat este pentru test, cu bundle Hermes recompilat și codul nativ din APK-ul anterior. Instalarea pe telefon, scanarea AI reală, livrarea OTP și plățile nu sunt confirmate în această sesiune. Migrarea pentru atașarea atomică a fotografiei este pregătită, neaplicată; clientul păstrează compatibilitatea cu serverul actual.

Detalii și limite: [RELEASE-1.5.3.md](./RELEASE-1.5.3.md), [VERIFICARE-1.5.3.json](./VERIFICARE-1.5.3.json). Versiunea anterioară: [RELEASE-1.5.2.md](./RELEASE-1.5.2.md). Secțiunile de mai jos sunt istorice.

## Pornire din sursă

Instalează Node.js compatibil cu Expo SDK 57 și rulează `npm ci`.
Copiază `ENV-PRODUCTION-EXAMPLE.txt` în `.env.production.local`; fișierul conține numai configurația publică.
Pentru crash reporting, completează și configurația din `SENTRY-CONFIG-EXAMPLE.txt`.
Rulează `npm run qa:flows` pentru simulări și `npm test` pentru testele automate.
Pentru Windows/Android Studio, urmează `BUILD-APK-LOCAL-WINDOWS.md` și rulează `BUILD-APK-LOCAL-WINDOWS.bat`.

## Corecție 1.4.5

- căutarea nutrițională după denumire folosește serviciul oficial Search-a-licious;
- exportul PDF al rețetei folosește denumirea rețetei;
- „Rezultat operațional (EBITDA)” are explicație în limbaj simplu;
- angajații și pontajele se sincronizează în cont, iar fișele locale existente
  sunt migrate la prima deschidere;
- fiecare angajat are salariu brut și net lunar, iar totalul brut intră automat
  în raportul P&L;
- pontajul permite o singură înregistrare per angajat și zi, cu editare și ștergere;
- exportul pontajului include denumirea și data raportului, sigla oficială și
  datele PARADIM Operations SRL;
- versiune Android `1.4.5` / `versionCode 49`.

Detalii: [RELEASE-1.4.5.md](./RELEASE-1.4.5.md).

## Corecție 1.2.2

- contul demo trece acum de ecranul OTP și recitește accesul înainte de Home;
- un OTP proaspăt prelungește perioada demo cu trei zile prin funcția securizată
  de pe server, fără reînnoire automată;
- aceeași dovadă OTP nu poate fi folosită de două ori, iar codurile mai vechi de
  10 minute nu pot modifica perioada demo;
- rutarea după autentificare are o revenire sigură și nu mai poate rămâne pe
  ecranul de încărcare din cauza ordinii evenimentelor Auth;
- versiune Android `1.2.2` / `versionCode 41`.

Detalii: [RELEASE-1.2.2.md](./RELEASE-1.2.2.md).

## Corecții și funcții 1.2.1

- salvează rețeta și când serviciul răspunde cu o eroare de rețea în format
  Supabase/PostgREST, păstrând operația în coada offline și afișând diagnosticul real;
- „Dosar / Control” poate precompleta automat 16 dintre cele 19 formulare HACCP,
  fără a suprascrie valorile introduse deja;
- Răcire rapidă, Vizitatori și Consum materii prime rămân exclusiv manuale;
- verificările de temperatură din producție primesc câte trei poziții și
  temperaturi conforme, iar denumirile preparatelor se pot adăuga ulterior;
- versiune Android `1.2.1` / `versionCode 40`.

Detalii: [RELEASE-1.2.1.md](./RELEASE-1.2.1.md).

## Funcții 1.2.0

- HACCP deschide direct rutina „Azi”, cu 5–7 sarcini mari, badge pentru
  restante, temperaturi cu stepper, „Totul conform” și acțiune corectivă
  obligatorie la depășirea limitelor configurate;
- nomenclator de locații și echipamente, antet precompletat, semnătură prin
  identitate + timestamp și grilă lunară verde/roșu/gol;
- „Dosar / Control” păstrează toate cele 19 fișe și exportă pachetul lunar
  HACCP într-un singur PDF;
- eticheta 50×30 / 40×60 mm este în Producție, iar rețetele exportă registrul
  de alergeni structurat după Regulamentul (UE) nr. 1169/2011;
- praguri min/țintă, comenzi grupate pe furnizor, inventar programat pe zone,
  registru de risipă și varianță teoretic–real pe ingredient;
- e-Factura: import local sigur de XML UBL în fluxul de facturi și ecran de
  pregătire SPV/OAuth, fără stocarea tokenurilor ANAF pe telefon;
- versiune Android `1.2.0` / `versionCode 39`.

Detalii: [RELEASE-1.2.0.md](./RELEASE-1.2.0.md).

## Funcții 1.1.0

- completare automată verificabilă a valorilor nutriționale după denumire sau
  cod de bare, cu sursa și produsul exact păstrate;
- invitațiile de echipă trimit acum efectiv email prin funcția securizată
  Supabase și permit retrimiterea când livrarea eșuează;
- ora alertei HACCP zilnice poate fi aleasă de utilizator;
- calendar HACCP de autocontrol pentru probe alimentare, teste de igienă și
  analize de apă, cu introducere manuală, import Excel/CSV, notificări cu dată
  și oră și coadă offline;
- versiune Android `1.1.0` / `versionCode 38`.

Detalii: [RELEASE-1.1.0.md](./RELEASE-1.1.0.md).

## Corecție 1.0.9

- repară ecranul incomplet afișat după validarea codului OTP;
- navighează direct la onboarding sau Home, fără un arbore intermediar gol;
- onboarding-ul folosește un flux vertical derulabil și un selector de limbă
  care nu mai ocupă forțat întreaga lățime;
- aplicația este blocată explicit pe tema light în Expo și în proiectul Android;
- versiune Android `1.0.9` / `versionCode 37`.

Detalii: [RELEASE-1.0.9.md](./RELEASE-1.0.9.md).

## Corecție 1.0.8

- după validarea codului OTP, ecranul principal pornește fără inițializarea
  automată a notificărilor native;
- tranziția critică login → aplicație nu mai folosește transparență, iar Home
  folosește componente React Native simple în primul cadru;
- iconița adaptivă revine la varianta mică și completă, pe fundal bleumarin;
- versiune Android `1.0.8` / `versionCode 36`.

Detalii: [RELEASE-1.0.8.md](./RELEASE-1.0.8.md).

## Corecție 1.0.7

- iconița Android adaptivă folosește fundal alb și logo-ul Manager 24/7 mărit,
  conform exemplului furnizat, fără rama închisă a versiunilor anterioare;
- proiectul Android nativ și corecția opacă de pornire rămân incluse în EAS;
- versiune Android `1.0.7` / `versionCode 35`.

Detalii: [RELEASE-1.0.7.md](./RELEASE-1.0.7.md).

## Corecție 1.0.6

- proiectul Android nativ este inclus explicit în arhiva EAS, astfel încât
  protecția opacă din `MainActivity` și `AppTheme` nu mai poate fi eliminată
  de etapa automată Expo Prebuild;
- APK-ul este verificat după build prin decompilarea metodei native de pornire;
- versiune Android `1.0.6` / `versionCode 34`.

Detalii: [RELEASE-1.0.6.md](./RELEASE-1.0.6.md).

## Corecție 1.0.5

- jurnalul real de pe Samsung/Android 16 confirmă că aplicația rămâne activă,
  dar primul cadru Android este compus cu transparență;
- fereastra nativă, rădăcina React și navigatorul au acum fundal opac explicit;
- versiune Android `1.0.5` / `versionCode 33`.

Detalii: [RELEASE-1.0.5.md](./RELEASE-1.0.5.md).

## Corecție 1.0.4

- elimină ecranul transparent produs când încărcarea fonturilor rămâne în așteptare;
- aplicația continuă pornirea după maximum 1,5 secunde și afișează formularul;
- versiune Android `1.0.4` / `versionCode 32`.

Detalii: [RELEASE-1.0.4.md](./RELEASE-1.0.4.md).

## Corecție 1.0.3

- APK-ul de test pornește fără R8 și fără resource shrinking, eliminând cauza
  probabilă a închiderii imediate pe Android 16;
- modulul nativ de notificări este încărcat doar când utilizatorul activează
  alertele HACCP, nu în traseul critic de pornire;
- EAS rezolvă patch-urile compatibile curente pentru Expo SDK 57, fără lock-ul
  vechi care producea avertismentul `24 packages out of date`;
- versiune Android `1.0.3` / `versionCode 31`.

## Corecție 1.0.2

- ecranul de autentificare are un singur container vertical și nu mai poate
  împinge formularul în afara ecranului;
- cardul de login nu mai depinde de gradientul nativ și este randat ca un card
  React Native simplu, vizibil inclusiv în buildul Android release;
- ecranul de login rămâne pe fundal deschis chiar dacă telefonul folosește tema
  dark și afișează `Manager 24/7 · v1.0.2` pentru verificarea instalării;
- React Compiler experimental a fost dezactivat, iar scripturile Windows
  construiesc cu cache-ul EAS curățat;
- versiune Android `1.0.2`; buildul local folosește `versionCode 28`.
- alternativă fără cota EAS: `BUILD-APK-LOCAL-WINDOWS.bat`, după instalarea
  Android Studio și a componentelor SDK descrise în `BUILD-APK-LOCAL-WINDOWS.md`.

## Corecție 1.0.1

- pornirea nu mai așteaptă verificarea online a abonamentului și are un prag
  de siguranță pentru închiderea splash-ului;
- inițializarea notificărilor este izolată, astfel încât un modul opțional nu
  poate închide aplicația la lansare;
- modulele Google Play Billing au fost eliminate din versiunea beta, deoarece
  plățile și abonamentele sunt amânate;
- iconul Android folosește foreground adaptiv cu zonă de siguranță, iar
  `24/7` nu mai este tăiat de masca launcherului;
- versiune Android `1.0.1` / `versionCode 23`; schema deep-link este
  `manager247://`.

## Nou în 1.0.0

- control operațional: inventar rapid, consum teoretic vs. real, abatere și
  Prime Cost;
- import vânzări CSV/POS, mai multe locații și roluri de echipă;
- acces beta complet, fără paywall și fără procesator de plată activ.

## Funcții introduse în 0.8.0

- logo-ul oficial Manager 24/7 este unificat în iconul Android/PWA, splash,
  interfață și documentele PDF;
- onboarding RO/EN în trei pași, conceput pentru o configurare de aproximativ
  trei minute;
- import factură din fotografie sau PDF: extragere server-side, calcul preț
  unitar, potrivire cu ingredientele și **confirmare obligatorie** înainte de
  orice actualizare;
- potrivirile produs–furnizor confirmate se învață local și în Supabase, cu
  RLS pe utilizator;
- alertele de scumpire sunt vizibile pe Home și există un raport săptămânal
  gata de trimis prin WhatsApp sau email;
- rețeta bulk aplică scăzământul separat pe fiecare ingredient și calculează
  costul din necesarul brut;
- exporturile PDF de rețetă și rețetar folosesc A4 compact, coloane fixe și
  rânduri protejate de tăiere; o fișă cu 12 ingrediente a fost verificată pe
  o singură pagină;
- versiune Android `0.8.0` / `versionCode 20`.

## Funcții introduse în 0.7.0

- **Raport P&L managerial lunar** accesibil direct din Home: managerul introduce
  veniturile și cheltuielile, iar aplicația calculează profitul brut, Prime Cost,
  EBITDA, rezultat net, marjele și pragul de rentabilitate;
- rezumat P&L pe ecranul principal, cu semafor Profitabil / De urmărit /
  Necesită acțiune și cifrele esențiale ale lunii;
- salvare offline și sincronizare Supabase pe utilizator, cu RLS și istoric lunar;
- numele oficial este **Manager 24/7** în aplicație, splash, login, PWA,
  emailurile OTP și toate documentele generate;
- versiune Android `0.7.0` / `versionCode 19`.

Raportul P&L este un instrument managerial orientativ și nu înlocuiește
documentele financiar-contabile sau declarațiile fiscale.

## Funcții introduse în 0.6.0

- brandul vizibil al aplicației este **Manager 24/7**, inclusiv splash, login,
  PWA, emailurile OTP și toate formularele/exporturile HACCP;
- lista de cumpărături se distribuie direct prin WhatsApp sau email, grupată
  pe furnizori și cu totalul estimat;
- bon de consum zilnic: creare manuală, import Excel/CSV, scanare cu camera,
  dată, istoric și salvare offline cu sincronizare Supabase;
- rețetă bulk: alegere din rețetar, introducere manuală, Excel/CSV sau scanare
  foto, gramaj final, porții și calcul automat cost lot/cost porție/cost kg/Food Cost;
- scanările au ecran obligatoriu de confirmare; valorile nu intră direct în
  document fără verificarea utilizatorului;
- interfață compactă Manrope, accente teal/navy/gold, butoane protejate de
  zona de navigație Android și logo Manager 24/7 clar pe primul ecran.

Identificatorul Android rămâne intenționat
`ro.paradim.professionalfoodcost`, ca actualizarea să se instaleze peste
versiunea existentă. Schema deep-link vizibilă este `manager247://`.

## Funcții existente din 0.5.0

- bibliotecă offline cu **59 de modele editabile** extrase din `M1 .xlsx`:
  6 ciorbe/supe, 33 feluri principale, 16 garnituri și 4 salate;
- energia disponibilă în registrul M1 este importată cu referința exactă la
  foaie și rând; valorile absente rămân `necunoscute`, nu sunt transformate în
  zero și nu sunt inventate;
- editor nutrițional complet pe ingredient: kJ, kcal, grăsimi, saturați,
  glucide, zaharuri, fibre, proteine și sare, cu bază 100 g/100 ml/bucată,
  sursă și confirmare;
- calcul automat per porție și per 100 g de preparat finit, folosind cantitățile
  nete și greutatea finală cântărită;
- aditivi, alergeni confirmați și marcaj pentru produs decongelat; exporturile
  PDF/Excel includ declarația nutrițională și marchează vizibil orice rezultat
  incomplet drept `CIORNĂ`;

- modul HACCP complet cu toate cele 19 formulare PARADIM furnizate;
- completare directă pe telefon pentru antet, grile zilnice/lunare și registre
  cu rânduri nelimitate;
- editare și ștergere înregistrări, istoric pe fiecare tip de formular și
  export PDF portret/peisaj;
- salvare HACCP offline și sincronizare Supabase la revenirea conexiunii, cu
  RLS individual pe `auth.uid()`;
- declarația vizitatorului cu reguli interne și generarea etichetelor din
  rețetele salvate;

- Home refăcut ca **Profit Center**: fără antet corporatist, Food Cost dominant, Profit
  Health Score, țintă și priorități acționabile;
- cache offline per utilizator pentru rețete și catalog, afișat înainte de
  răspunsul Supabase;
- coadă offline pentru salvare/ștergere rețete, ingrediente și prețuri, cu
  retrimitere automată la revenirea conexiunii;
- dreptul Pro/Admin păstrat offline maximum 7 zile, apoi revalidat pe server;
- Quick Mode pentru ingrediente: preț ambalaj + cantitate ambalaj = preț unitar;
- monedă de cont (`RON`, `EUR`, `GBP`, `USD`, `HUF`, `PLN`, `BGN`) și TVA implicit;
- sub-rețete, alergeni automați și pierdere exclusiv la nivel de ingredient;
- module operaționale: scalare producție/listă cumpărături, cost bulk real,
  Menu Engineering manual, HACCP complet și Profit Simulator;
- navigație mobilă simplificată în cinci zone: Acasă, Rețete, Producție,
  HACCP și Cont; catalogul de ingrediente este integrat în Rețete;
- dată selectabilă în toate cele 19 formulare HACCP, buton de salvare protejat
  de zona de navigație Android și alertă locală zilnică atunci când nu există
  valori HACCP salvate în ziua respectivă;
- fotografii private pentru preparate, furnizori multipli, istoric de preț cu
  sursă și dată, alertă de scumpire, versiuni restaurabile ale rețetelor și
  import CSV/XLSX pentru Menu Engineering;
- tipografie Manrope, cifre tabulare, contrast îmbunătățit și skeleton loaders;
- export fișă individuală și rețetar complet în PDF/Excel;
- import listă prețuri `.xlsx`/CSV cu previzualizare și confirmare;
- OTP numeric compatibil cu lungimi 6–10 cifre (serverul live trimite momentan
  8), fără trunchiere; limba se alege cu steagurile RO/EN pe ecranul de login;
- icon adaptiv cu fundal contrastant, `SYSTEM_ALERT_WINDOW` blocat și
  `allowBackup=false`;
- profil APK direct și profil AAB Google Play separate; buildul Play ascunde
  plata externă și folosește Google Play Billing.

Detaliile corecției curente sunt în [RELEASE-1.0.3.md](./RELEASE-1.0.3.md),
corecția precedentă este în [RELEASE-1.0.2.md](./RELEASE-1.0.2.md), iar baza
funcțională este în [RELEASE-1.0.0.md](./RELEASE-1.0.0.md).
Detaliile versiunilor anterioare sunt în [RELEASE-0.8.0.md](./RELEASE-0.8.0.md)
și [RELEASE-0.7.0.md](./RELEASE-0.7.0.md).
Originea datelor bibliotecii și limitele de conformitate sunt în
[RELEASE-0.4.0.md](./RELEASE-0.4.0.md). Detaliile HACCP sunt în
[RELEASE-0.3.0.md](./RELEASE-0.3.0.md), iar fundația
versiunii precedente în [RELEASE-0.2.0.md](./RELEASE-0.2.0.md),
iar etapele următoare în [ROADMAP-0.3-0.5.md](./ROADMAP-0.3-0.5.md).

## Verificări trecute

```text
TypeScript:       OK
ESLint:           OK
Teste:            281/281 în 49 de fișiere (plus 9 verificări de componente)
Export web:       OK
Export Android:   OK
Expo Doctor:      21/21
Supabase RLS:     OK (15 tabele publice protejate)
```

## Pornire locală

```bash
npm ci
npm start
```

Pentru demonstrație fără Supabase:

```bash
EXPO_PUBLIC_DEMO_MODE=true npm start
```

## Verificări

```bash
npm run typecheck
npm test
npm run lint
npx expo-doctor
```

## Build Android semnat

Pe Windows, dezarhivează proiectul și pornește:

- `BUILD-APK-LOCAL-WINDOWS.bat` pentru APK local, fără cota EAS;
- `BUILD-APK-WINDOWS.bat` pentru APK de test/distribuție directă;
- `BUILD-PLAY-AAB-WINDOWS.bat` pentru AAB Google Play.

Scripturile instalează exact dependențele din lockfile, rulează verificările,
cer autentificarea Expo dacă lipsește și pornesc EAS Build. Cheia de semnare
rămâne în EAS; nu este inclusă în arhivă.

Comenzi echivalente:

```bash
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile production-apk --non-interactive
npx eas-cli@latest build --platform android --profile production --non-interactive
```

## Autentificare

Vezi [LOGIN-OTP-0.2.0.md](./LOGIN-OTP-0.2.0.md). Aplicația folosește
`signInWithOtp` fără redirect și verifică tokenul prin `verifyOtp`, păstrând
același `auth.uid()` pe Web și Android.

## Configurare

Copiază `.env.example` în `.env`. Secretele SMTP, cheia Google Play și orice
cheie AI rămân numai pe server/Supabase, niciodată în aplicație sau arhivă.
Scanarea foto folosește funcția Supabase `scan-consumption-document` și secretul
server-side `ANTHROPIC_API_KEY`; opțional, `ANTHROPIC_MODEL` poate schimba
modelul fără rebuild al aplicației.

