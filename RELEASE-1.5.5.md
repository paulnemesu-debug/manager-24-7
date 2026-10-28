# MANAGER 24/7 — 1.5.5

Verificare din 4 octombrie 2026. Android versionCode 59; iOS build 30.
Buildul Gradle Android complet a reușit. APK-ul arm64 pentru test are semnătura
și integritatea verificate; probele pe telefon fizic rămân deschise. Rezultatele
și amprentele fișierelor sunt în `VERIFICARE-1.5.5.json`.

## Ce aduce versiunea

**Nutriție fără cost pe calcul.** Am păstrat baza oficială ANSES-Ciqual 2025,
inclusă offline, și am adăugat 83 de denumiri exacte. Sunt acum 938 de aliasuri
exacte pentru 244 alimente și 12 denumiri generice orientative. Modelele cu toate
cele nouă valori numerice cresc de la 110 la 160 din 479 (+50 modele, aproximativ
45% față de acoperirea anterioară). Se asociază automat 3.704 din 4.102 rânduri;
3.600 au date complete și conversie de masă disponibilă.

Smântâna lichidă, smântâna, oul melanj, sosul de roșii și vinul alb pot primi
valori generice automat, cu ipoteza afișată și statut neconfirmat. Eticheta
produsului real are prioritate. Borșul proaspăt și datele lipsă din sursă rămân
de completat. Cele 160 de modele au valori numerice, nu o certificare a preciziei.
Sursa, licența, limitele și ipotezele sunt în `NUTRITION-DATA-SOURCES.md`.

**Simularea profitului pe ingredient.** Se poate modifica gramajul, prețul sau
alege o ofertă compatibilă de la un alt furnizor, inclusiv una nepreferată în
catalog. Se recalculează costul porției, pierderile și marja. Resetarea revine
la valorile inițiale; simularea nu salvează modificări în rețetă ori catalog.
Datele rețetei încărcate ulterior și introducerea zecimalelor sunt tratate corect.

**Alerte de preț.** Calculul urmărește și ingredientele din semipreparate și
arată food cost înainte/după, ținta și rețetele care trec peste ea. Într-un lot
de modificări, ieftinirile intră în efectul net. Modificarea manuală a unui
ingredient poate înregistra alerta, la fel ca importul. Istoricul de preț
existent folosește tabelul și triggerul din producție; istoricul de preț offline
nu a fost extins în această versiune.

**Facturi confirmate înainte de aplicare.** PDF-ul, fotografia și XML-ul
e-Factura intră în același ecran de verificare. Niciun rând nu este selectat
implicit. Operatorul poate corecta prețul și produsul asociat, apoi confirmă
explicit rândurile selectate. Orice editare invalidează confirmarea precedentă.
Prețurile negative, monedele străine și două prețuri selectate pentru același
produs sunt blocate. Dacă moneda lipsește, confirmarea cere preț net în RON.
Rândurile nerecunoscute sunt semnalate; peste 250 de rânduri documentul este
respins explicit, fără trunchiere ascunsă.

Potrivirile sunt învățate numai după aplicare. METRO și Selgros sunt recunoscute
și prin variantele denumirii societății; distribuitorii locali rămân separați.
Modificările de potrivire se păstrează local pe cont și se retrimit după
reconectare. Aceste teste nu confirmă precizia OCR pe facturi reale și nici
atomicitatea unui import care creează produse și actualizează prețuri în faze
separate.

**Menu engineering.** Matricea folosește popularitatea și marja din vânzările
înregistrate. Datele lipsă nu devin vânzări zero. Sunt afișate maximum trei
acțiuni: recuperarea marjei/țintei, promovarea, revizuirea ori protejarea unui
preparat. Impactul aritmetic se referă la perioada introdusă, fără a fi prezentat
ca prognoză. Acțiunea deschide simulatorul pentru preparatul ales. Importul
CSV/XLSX recunoaște „Porții”, cere confirmare și folosește citirea nativă a
fișierelor. Vânzările offline se păstrează peste copia veche din cloud, pe cont
și lună, și se sincronizează după reconectare.

**Sentry și pornirea Android.** SDK-ul Sentry nativ și integrarea Metro/Expo sunt
incluse. Configurarea proiectului și un crash primit efectiv rămân necesare;
fără `EXPO_PUBLIC_SENTRY_DSN`, raportarea este dezactivată. Filtrul pentru
excepții JavaScript elimină conținutul liber despre utilizator/rețetă și
păstrează informația utilă pentru diagnostic. `SENTRY-SETUP.md` descrie activarea
și proba unui crash nativ. Un plugin local Expo păstrează fundalul opac, tema
light, permisiunea camerei și configurația de semnare la prebuild. Crashurile
foarte timpurii, înainte de inițializarea JavaScript, nu sunt confirmate ca
acoperite de această integrare.

## Verificări și starea funcțiilor

Au trecut 376/376 teste în 61 fișiere și 47/47 scenarii pe componente. TypeScript,
lint și exportul Android Hermes cu source maps au trecut. Verificarea Expo
locală arată dependențe compatibile; în modul offline nu verifică versiunile
noi de pe server. XLSX-urile din probe sunt fișiere reale, scrise și redeschise.
Componentele folosesc adaptoare explicite pentru cameră, autentificare și cloud.

| Funcție | Probă executată | Ce rămâne de verificat |
| --- | --- | --- |
| Înregistrare, OTP și intrare | Email invalid/valid, cooldown, OTP expirat și rutare după succes cu serviciu simulat | Livrare OTP și sesiune reală pe telefon |
| Foldere cu poze | Patru fotografii distincte, grilă 2×2 la patru dimensiuni, font mare, înapoi Android și stare păstrată | Aspectul pe telefoane reale |
| Rețete și schițe | Salvare/redeschidere, conflict, recuperare și redirecționare spre Rețetele mele | Sincronizarea unui cont QA live |
| Bibliotecă, bulk și planificare | Modele, scalare, calcule și listă de cumpărături prin teste automate | Fluxul tactil complet pe telefon |
| Nutriție finală și export | Completare offline, prioritate etichetă, masă comestibilă, sursă și cele nouă valori | Etichetele produselor fără asociere și greutatea finală reală |
| Fotografii de rețetă | Refuz/anulare, păstrare după redeschiderea schiței și ștergere explicită | Cameră/galerie și upload cu autentificare reală |
| HACCP și favorite | Persistență pe cont, căutare cu diacritice, eșec de stocare și acces la toate formularele | Notificări și completări pe dispozitiv |
| HR, P&L și producție | Calcule, documente și exporturi în suita automată | Înregistrări operaționale într-un cont QA live |
| Export Excel | Scriere și recitire cu bibliotecile reale | Deschidere/partajare din Android |
| Export PDF | HTML și conținut generate de exportatorii aplicației | Randare PDF și partajare nativă |
| Scanare document | Două cereri live respinse cu 401: fără autentificare și token invalid | OCR real PDF/foto cu cont eligibil |
| Factură și furnizori | Confirmare, corectare, monedă, duplicate și reconciliere offline cu adaptoare | Facturi reale METRO/Selgros/distribuitor și recitire cloud |
| Prețuri și simulator | Semipreparate, trecere peste țintă, gramaj/furnizor și lipsa modificării rețetei | Trigger și notificare primite după o factură QA live |
| Menu engineering | Vânzări lipsă/zero, clasificare, primele trei acțiuni și import confirmat | Date reale de vânzare pentru o perioadă |
| Cont și abonament | Izolarea datelor și rutele în cod/teste; checkout web pentru distribuție directă | Plata și recitirea accesului; achizițiile native Google Play sunt dezactivate în snapshot |
| Sentry | SDK Java/NDK și versiunea JS 7.11.0 confirmate în APK; filtru și release/dist testate | DSN, recompilare configurată, source maps încărcate și crash primit |

Scannerul de producție `scan-consumption-document` este ACTIVE, versiunea 3,
cu `verify_jwt=true`. Codul citit verifică utilizatorul, accesul profesional și
rezervarea atomică a cotei. Vechiul avertisment că nu există autentificare nu mai
descrie funcția publicată. Cele două probe live sunt negative și nu consumă
apeluri Anthropic. Modelul implicit este încă `claude-sonnet-4-5`; valoarea
secretului `ANTHROPIC_MODEL` nu a fost verificată. Tabelele de istoric de preț,
oferte, vânzări și potriviri au RLS activ, inspectat numai în citire. Nu am
schimbat servicii sau migrări în producție.

## Dependențe și build

Expo instalat este 57.0.26, Sentry 7.11.0 și React Native 0.86.3. Actualizările
compatibile și `npm audit fix` fără forțare nu au eliminat cele 33 de raportări:
21 high, 12 moderate, 0 critical. Sunt predominante în lanțul uneltelor de build;
nu s-a făcut o analiză completă de exploatabilitate a fiecărei dependențe.
`npm audit fix --force` ar cere schimbări incompatibile, deci nu a fost aplicat.
Raportul brut este în `qa-results/validation-1.5.5/npm-audit.json`.

Compilarea Gradle completă a trecut cu JDK 17, Gradle 9.3.1, SDK/Build Tools 36
și NDK 27.1.12297006. S-a folosit un singur lucrător și compilarea Kotlin în
același proces pentru limita de memorie de 8 GB; verificările Android Lint
Vital au fost executate. Ultima rulare a durat 5m 32s și a încheiat 694 taskuri,
137 executate și 557 reutilizate. Codul Java/Kotlin/C++ al dependențelor noi este
compilat, inclusiv Sentry. APK-ul are 47.360.792 bytes și 27 biblioteci arm64.

Au trecut CRC-ul ZIP, `apksigner verify`, `zipalign -c -P 16` și verificarea
segmentelor ELF la minimum 16 KB. Manifestul și configurația din APK confirmă
1.5.5/59, permisiunea camerei, `allowBackup=false`, fără permisiunea de microfon
sau SYSTEM_ALERT_WINDOW. Bundle-ul din APK coincide cu cel generat de Gradle;
source map conține configurația Sentry actuală pentru release/dist.

Semnarea folosește cheia publică Android Debug pentru test, cu același certificat
SHA-256 ca APK-ul anterior 1.5.4. Nu este o semnătură de distribuție comercială.
Nu există un telefon în inventarul ADB; instalarea și pornirea nu sunt probate.
Nu s-a compilat un binar iOS. Nu a fost repachetat un APK vechi. Sentry rămâne
dezactivat fără DSN; încărcarea source maps a fost omisă explicit.

Logul complet și probele pachetului sunt în `qa-results/validation-1.5.5/`.
Pentru compilare pe laptop există `BUILD-APK-LOCAL-WINDOWS.bat` și ghidul asociat,
fără consumarea cotei EAS. Folosirea unei chei de producție și configurarea
Sentry cer un build nou.

## Proba live rămasă

Într-un cont QA, pe două–trei telefoane: instalare și pornire la rece, OTP real,
reluare după repornire, cameră/galerie cu refuz și permisiune acordată, salvare
și recitire a fotografiei, facturi PDF/foto cu corectare și confirmare, preț
actualizat și alertă, export PDF/Excel cu partajare, reconectare după editare
offline, HACCP favorit și notificare, checkout cu confirmarea abonamentului și
crash Sentry primit după redeschidere. Achiziția Google Play cere mai întâi o
integrare nativă funcțională. Ștergerea contului se probează doar pe contul QA.
Nici plata reală, nici ștergerea unui cont de producție nu au fost executate.

Evidența reproductibilă: `VERIFICARE-1.5.5.json`, `qa-results/*checks.json`,
`qa-results/nutrition-coverage.json`, `qa-results/validation-1.5.5/`.
