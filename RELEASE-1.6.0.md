# MANAGER 24/7 v1.6.0 — development

Bază: arhiva v1.6.0 development furnizată, derivată din v1.5.5.

## Integrare finalizată în această etapă

- Daily Operations alimentează AI Daily Manager cu sarcinile HACCP reale ale zilei, pontaje confirmate, comenzi deschise, inventare scadente, risipă, P&L, Food Cost, prețuri și documente. Programarea unei ture nu mai este tratată ca prezență confirmată. Numărul verificărilor HACCP provine din echipamente și rutină, nu dintr-o constantă.
- Home afișează scorul și prima prioritate; fiecare alertă deschide secțiunea sau fila potrivită. Datele se recitesc la revenirea în ecran și periodic cât ecranul este activ.
- Control Mode folosește aceeași evaluare. Un dosar gol nu este prezentat ca pregătit; indicatorul rămâne o evaluare internă a datelor disponibile.
- Documente: creare, categorie, responsabil, emitere, expirare, observații, editare/reînnoire, arhivare și restaurare. Datele calendaristice sunt validate, iar documentele expirate ieri sunt marcate corect chiar imediat după miezul nopții.
- HR: câte cinci verificări pentru angajare și plecare, date, observații, progres și legătură directă din fișa angajatului. Starea „Plecat” exclude angajatul din personalul activ și păstrează istoricul pontajelor.
- Documentele și ciclul HR au salvare locală, coadă de sincronizare, migrare a datelor locale existente și verificarea versiunilor serverului. Conflictele dintre dispozitive sunt afișate pentru alegerea explicită a versiunii. Reîncercarea după pierderea răspunsului serverului nu dublează datele.
- Migrarea `operational_documents_hr_lifecycle` a fost aplicată proiectului Supabase configurat în aplicație. Izolarea conturilor, protecția angajaților și concurența au fost verificate cu tranzacții de test anulate integral.
- Demo instant resetează doar datele demo la o nouă intrare, ascunde sesiunea reală și blochează cererile către serviciile contului pe durata demonstrației. Datele reale și credențialele sunt păstrate.
- Exportul contului include documentele și ciclul HR.
- Versiunile aplicației și proiectului Android sunt aliniate: 1.6.0 / versionCode 60; configurația iOS folosește build 31.

## Validare

- 402 teste automate, 66 fișiere: trecute.
- TypeScript: trecut.
- ESLint: trecut, fără erori sau avertismente.
- 53 de scenarii automate: trecute, inclusiv șase scenarii noi de interacțiune pentru documente, HR și Daily Manager.
- Verificările bazei de date: trecute înainte și după aplicarea migrării; niciun avertisment nou de securitate pentru obiectele adăugate.
- Build Android local: finalizat cu succes, inclusiv analiza Android Lint pentru probleme critice și optimizarea codului. APK: 1.6.0, build 60, ARM64, 47.417.248 octeți.
- Semnătura APK: verificată; certificat local Android Debug, RSA 2048, schemă APK v2.
- Alinierea arhivei și a tuturor celor 27 de biblioteci native la 16 KB: verificată. Codul Hermes și prezența modulelor operaționale noi în APK: verificate.
- Rezultatul final al build-ului și verificarea semnăturii APK se găsesc în `VERIFICARE-1.6.0.json` și `qa-results/validation-1.6.0/`.

## Limite

Aceasta rămâne o versiune development pentru testare. APK-ul nu a fost testat pe un telefon fizic. OTP real, cameră/OCR, imprimare/partajare nativă, plăți și primirea unui crash în Sentry necesită verificare pe dispozitiv. Configurarea proiectului Sentry nu a fost furnizată; nu se revendică ingestia unui crash real. Previzualizarea în browser nu a încheiat validarea. Nu s-a construit un binar iOS.

APK-ul livrat folosește cheia locală de test din proiect. Nu este o versiune semnată pentru Google Play. Nu dezinstala o aplicație existentă pentru a schimba semnătura înainte de a exporta datele nesincronizate.
