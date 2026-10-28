# MANAGER 24/7 by PARADIM — remedieri 1.6.3

19 octombrie 2026. Android versionCode 62. Bază: commit 83b3c2722cf7cca4f2ca97704bd1b0d3c03369bd.

Defectele funcționale reproduse în audit au fost remediate în sursă și retestate. Logo-ul PARADIM este păstrat. Această sursă nu constituie o validare completă pe Android și nu este încă acceptată pentru publicare în Google Play.

## Ce s-a corectat

- Salvări concurente, intenții de sincronizare persistate înaintea scrierilor, reluare idempotentă și protejarea datelor locale nesincronizate. Cache-urile corupte nu sunt înlocuite în tăcere; recuperarea P&L păstrează și originalul.
- HACCP: câmpul de acțiune corectivă, păstrarea zilei selectate, respingerea zilelor duplicate/imposibile, cantități și temperaturi valide, resetarea echipamentului la anulare, validarea datelor importate.
- Exporturi: antete HR aliniate; perioade invalide respinse; etichete cu conținut integral sau eroare explicită de încadrare. Termenul de valabilitate este calculat în ore efectiv scurse, inclusiv la schimbarea orei.
- HR/P&L: sume RO/EN corecte, fără transformarea valorilor negative în pozitive; păstrarea textului în timpul editării.
- Operațiuni: prețuri și pierderi valide, plan de producție persistent separat pe cont, porții fracționare introduse manual, redeschiderea bonurilor din istoric, însumarea rândurilor CSV repetate, zi lunară validă.
- Importuri: XML strict, limite explicite, normalizarea prețului prin BaseQuantity, neaplicarea repetată a rândurilor deja salvate când memorarea asocierilor eșuează.
- Acces: refuzul explicit al serverului prevalează asupra cache-ului; timestamp-urile viitoare sunt respinse; linkurile directe către unelte sunt protejate; contul și comenzile pentru export/ștergere rămân accesibile după expirare.
- Demo: sesiunea reală este încheiată local înaintea activării izolării, iar răspunsurile întârziate nu o pot reactiva la ieșirea din demo. Probele suplimentare folosesc SDK-ul Supabase real cu transport inert.
- Demo configurat pentru producție: rețetele și ingredientele folosesc depozitele locale pentru citire, editare, ștergere și recalculare. Reintrarea resetează numai datele demo. Preferințele demo rămân locale, iar operațiile întârziate ale unui cont anterior nu modifică noul workspace sau preferințele lui.
- Server, pregătit în sursă: identitate de echipă bazată pe email Auth confirmat și accesul curent al proprietarului; verificare atomică a abonamentelor Google; ștergere Storage prin API înaintea eliminării contului și curățare locală după confirmarea serverului.

## Starea serverului

Aplicarea primei migrații a fost încercată de două ori. Conectorul Supabase a returnat `Invalid or expired requestState`. Verificarea ulterioară a catalogului confirmă că modificarea nu s-a aplicat. Nicio funcție Edge nouă nu a fost publicată. Remedierile serverului sunt validate local, nu active în producție.

Ordinea pregătită pentru un mediu QA separat; aplicarea în producție nu face parte din această livrare și necesită o autorizare ulterioară explicită:

1. `supabase/migrations/20261004101030_atomic_recipe_photos.sql`
2. `supabase/migrations/20261019173014_harden_workspace_identity_and_entitlements.sql`
3. `supabase/migrations/20261019173107_account_deletion_storage_listing.sql`
4. `supabase/migrations/20261019173510_atomic_google_play_verification.sql`
5. Publicarea funcțiilor `send-team-invitation`, `delete-account`, `verify-google-play-purchase` numai după migrațiile lor.
6. Verificarea privilegiilor/catalogului și testarea cu conturi dedicate; scriptul SQL de echipă este tranzacțional și se încheie cu ROLLBACK.

Nu aplica automat toate migrațiile istorice: proiectul live are denumiri/timestamp-uri istorice diferite. Aplică migrațiile revizuite, în ordinea de mai sus. Niciun email de invitație, cont real șters sau plată nu a fost folosit în această retestare.

## Reproducerea verificărilor

Cu dependențele instalate prin lockfile: `npm test`, `npm run qa:flows`, `npm run typecheck`, `npm run lint`. Scriptul postinstall păstrează adaptorul XLSX nativ.

Testele SQL folosesc PGlite 0.3.15 instalat separat de dependențele aplicației:

- `QA_PGLITE_PATH=/cale/catre/@electric-sql/pglite node scripts/qa/check-workspace-security.mjs`
- `QA_PGLITE_MODULE=/cale/catre/@electric-sql/pglite node scripts/qa/check-google-purchases.cjs`

Aceste teste rulează migrațiile și codul Edge real într-o bază izolată; serviciile Google/Auth sunt simulate. PGlite folosește o singură sesiune, deci nu demonstrează concurența dintre sesiuni PostgreSQL reale.

## Validarea Android rămasă

Exportul pentru platforma Android și bytecode-ul Hermes au fost generate. În mediul de lucru lipsesc Android SDK, ADB și emulatorul; wrapperul Gradle nu a putut descărca distribuția din cauza rețelei. Nu s-a produs un APK nou, nu s-a instalat aplicația pe telefon și nu s-a controlat Android Studio de pe calculatorul utilizatorului.

Pe emulator/dispozitiv trebuie executate înainte de acceptare:

1. Compilare/instalare, pornire rece și autentificare; navigare în toate modulele, tastatură, Back și revenire din fundal.
2. Salvare în fiecare modul, închidere forțată și redeschidere; mod avion, reluarea conexiunii și verificarea sincronizării fără duplicate.
3. PDF/XLSX/JSON: alegerea destinației Android, anulare, salvare, partajare și deschidere într-o aplicație externă. Verificarea conținutului efectiv al documentelor.
4. HACCP: toate cele 19 formulare, etichete de ambele dimensiuni, alerte/notificări, ora de vară/iarnă și tipărire.
5. Cameră și fișiere: permisiune refuzată/acordată, anularea alegerii, XML/PDF/fotografie, păstrarea schiței.
6. Conturi de test separate: schimbarea contului, abonament expirat, invitație/revocare, export date, ștergere cont cu fotografie și curățarea locală.

## Limite păstrate explicit

- Rapoartele zilnice vechi care pot fi parțial încărcate fără ID-uri stabile rămân păstrate și marcate pentru reconciliere; nu se inventează o sincronizare reușită.
- Dacă răspunsul HTTP final al ștergerii contului se pierde după ștergerea Auth, clientul nu presupune succesul și păstrează datele locale. Necesită confirmare/reconciliere de asistență.
- După o ștergere confirmată, marcajul local de ștergere este păstrat. Scrierile deja pornite care se încheie după curățare sunt eliminate la următoarea pornire sau revenire în prim-plan; nu sunt anulate global în momentul ștergerii.
- Exportul contului include raportul modulelor care nu au putut fi citite; accesibilitatea comenzii după expirare nu garantează citirea tuturor datelor cloud restricționate de politicile serverului.
- Integrarea nativă Google Play Billing, checkout-ul/webhook-urile, testele de cumpărare, semnarea de publicare și cerințele Play Console rămân etapa următoare cerută de utilizator. Corectarea verificatorului existent nu înseamnă integrare comercială completă.
