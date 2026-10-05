# MANAGER 24/7 by PARADIM 1.5.4

Android versionCode 58; iOS build 29. Verificare: 4 octombrie 2026.

Nutriția se completează automat pentru ingrediente cunoscute și apare direct în rețeta finală, la 100 g și pe porție. PDF-ul și Excel-ul folosesc același calculator. Baza oficială ANSES-Ciqual 2025 este inclusă offline și nu cere abonament sau apeluri plătite.

## Modificări

- 3.484 alimente / 9 componente, cu sursă, data publicării, codul exact și limitele analitice păstrate; subsetul JSON are 494.793 bytes.
- Denumiri RO/EN exacte și căutare locală. Produsele ambigue oferă variante explicite, iar eticheta manuală are prioritate.
- Datele se păstrează la salvare, redeschidere și în coada offline. Citirea unei rețete existente poate calcula nutriția fără a modifica versiunea serverului.
- Schimbarea alimentului elimină valorile automate ale alimentului anterior; schimbarea cantităților recalculează valorile rețetei.
- Densitate și masă netă per bucată pentru conversii ml/l/buc; greutatea finală măsurată se folosește la valorile pe 100 g.
- Semipreparatele folosesc cantitatea efectivă produsă, distinct de porții; rotunjirea se face după însumare și scalare.
- Exporturile păstrează sursele, indică „≈” când sursa conține limite analitice și diferențiază rezultatul orientativ de cel cu date lipsă.
- Căutarea Open Food Facts rămâne opțională: cache temporar, reunirea cererilor identice, tratarea 429 și corectarea confuziei între porție, 100 g și volumul ambalajului.
- Fotografii în foldere, grilele 2 x 2, HACCP și favoritele din 1.5.3 sunt păstrate.

## Verificare executată

- 360 teste automate în 57 de fișiere; zero eșecuri.
- 34 scenarii pe componentele reale React cu adaptoare native/servicii: 6 foldere, 9 schițe/fotografii, 11 autentificare/HACCP, 8 nutriție.
- Completarea nutriției, căutarea locală, salvarea și redeschiderea au trecut cu rețeaua simulată ca indisponibilă; zero apeluri de rețea pentru fluxul local.
- Exportul XLSX al rețetei de nutriție a produs un fișier real redeschis cu cititorul instalat; conținutul pentru PDF și XLSX au aceleași valori, coduri și surse.
- Auditul tuturor celor 479 de modele / 4.102 rânduri este în `qa-results/nutrition-coverage.json`; 110 modele au toate cele 9 valori numerice fără completări.
- TypeScript și lint trecute, fără avertismente de lint.
- Bundle Android Hermes compilat în mod producție; configurația și manifestul Android actualizate. Integritatea arhivei, semnătura v2/v3 și alinierea bibliotecilor native verificate.

Comenzi: `npm test`, `npm run typecheck`, `npm run lint`, `npm run qa:flows`, `node scripts/qa/nutrition-coverage.cjs`. Fișierele de export au exclusiv date fictive. Detalii despre surse și metoda de calcul: `NUTRITION-DATA-SOURCES.md`.

## Limite

APK-ul este pentru test, semnat cu aceeași cheie Android Debug ca 1.5.3. Codul nativ și resursele sunt păstrate din APK-ul anterior; nu este un build Gradle complet. Nu s-au verificat instalarea, camera, galeria, tipărirea/partajarea pe telefon sau aspectul vizual pe telefon. iOS are configurația actualizată, fără build iOS în această sesiune.

Nu s-au trimis OTP-uri, procesat plăți sau efectuat scanări AI reale pentru această versiune. Testele acestor fluxuri folosesc adaptoare; starea serverului și migrarea atomică a fotografiilor nu au fost schimbate de această actualizare.

Calculele locale nu implică un serviciu AI. Produsele fără date complete cer asocierea sursei sau completarea din etichetă. Masa finală estimată și valorile limită sunt marcate orientativ; retenția la gătire nu este modelată separat. Verificările nu certifică precizia analitică a fiecărui preparat.

Rezultatele structurate sunt în `VERIFICARE-1.5.4.json`. Pentru build nativ complet pe laptop: `BUILD-APK-LOCAL-WINDOWS.bat` și `BUILD-APK-LOCAL-WINDOWS.md`.
