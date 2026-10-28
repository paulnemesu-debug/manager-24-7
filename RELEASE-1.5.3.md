# MANAGER 24/7 by PARADIM 1.5.3

Android versionCode 57; iOS build 28. Verificare: 4 octombrie 2026.

## Modificări

- Folderele folosesc fotografii locale, distincte pentru conținut; funcționează offline.
- Rețete are patru carduri în grilă 2 x 2: Rețete, Rețetele mele, Ingrediente, Exporturi și alergeni.
- Cont are patru carduri: Contul meu, Abonament, Siguranță și date, Despre aplicație. Grila ocupă spațiul disponibil; la fonturi mari sau ecrane foarte scurte permite derulare.
- HACCP separă Azi, Formulare și Înregistrări. Formularele au căutare, categorie și paginare, câte șase rezultate.
- Steaua salvează formularele favorite pe dispozitiv, separat pentru fiecare cont. Favoritele sunt incluse în exportul JSON; nu se sincronizează între dispozitive.
- Fotografiile rețetelor sunt optimizate JPEG și copiate în directorul persistent al aplicației pe Android. Pe web, schița păstrează o reprezentare data URI.
- Încărcarea fotografiei precede salvarea rețetei. Serverul actual atașează fotografia într-un pas separat, cu verificarea versiunii. O atașare eșuată păstrează ID-ul confirmat și schița pentru reluare.
- Scanările și importurile folosesc citirea fișierelor potrivită pentru web și Android. Limite: fotografie scanată 8 MB după optimizare; PDF 18 MB; fotografie rețetă 5 MB.
- Exportul JSON al contului funcționează și în browser. Exporturile native raportează explicit indisponibilitatea partajării.
- Exportul Excel HR corectează rândul de total cu celule unite; fișele individuale includ intrare, ieșire și total ore. PDF-ul HR este matricea lunară de sinteză.

## Verificare executată

- 336 teste automate trecute, zero eșecuri, în 56 de fișiere.
- 26 scenarii pe componentele reale React: navigare între foldere, păstrarea schiței, conflict de salvare, cameră/galerie cu adaptoare, OTP cu serviciu simulat și favorite HACCP.
- Toate cele 19 formulare HACCP au rămas accesibile și au trecut fluxul de generare HTML/export cu adaptoare de tipărire și partajare.
- Exporturile Excel rețetă, rețetar și HR au produs fișiere XLSX reale, redeschise cu cititorul instalat.
- Importurile Excel reale: prețuri din fișier cu mai multe foi, vânzări fracționare, consum și calendar HACCP cu reamintire.
- TypeScript și lint trecute; bundle Android Hermes recompilat; semnături APK v2/v3, integritate ZIP și aliniere 16 KB verificate.

Comenzi reproductibile: `npm test`, `npm run typecheck`, `npm run lint`, `npm run qa:flows`.
Evidența rezultatelor și fișierele de export cu date fictive sunt în `qa-results/`.

## Limite și starea serverului

APK-ul livrat este un pachet de test semnat cu cheia Android Debug, aceeași ca APK-ul 1.5.2. Codul nativ este păstrat din APK-ul anterior; nu reprezintă un build Gradle complet.

Nu s-au efectuat instalarea pe telefon, captura reală, selecția reală din galerie, partajarea nativă, livrarea OTP, plăți, restaurări reale Google Play sau ștergeri de cont. Browserul de test nu a putut accesa serverul local; nu există confirmare vizuală interactivă a acestei versiuni.

Funcția de scanare activă pe server este versiunea 3, cu verify_jwt=true. Bucket-ul fotografiilor este privat, cu limită 5 MiB și patru politici. Scanarea AI reală rămâne neconfirmată: cheia ANTHROPIC_API_KEY lipsea la verificarea anterioară; în această sesiune nu a fost furnizată o cheie de furnizor.

Migrarea `20261004101030_atomic_recipe_photos.sql` este pregătită, dar NU este aplicată pe server. Încercările de aplicare au primit `Invalid or expired requestState`. Clientul livrat păstrează calea compatibilă cu serverul actual și verificarea versiunii înainte de atașarea fotografiei.

e-Factura funcționează pentru importul local de XML UBL. Integrarea ANAF/SPV cu OAuth și certificat nu este implementată. Exportul contului păstrează referințele fotografiilor, fără o arhivă a imaginilor binare. Raportarea erorilor acoperă JavaScript/React, nu crash-uri native Android.

Pentru build nativ complet pe laptop: `BUILD-APK-LOCAL-WINDOWS.bat` și `BUILD-APK-LOCAL-WINDOWS.md`. Accesul la laptop/Android Studio nu a fost disponibil prin suprafețele tehnice ale acestei sesiuni.

Rezultate structurate: [VERIFICARE-1.5.3.json](./VERIFICARE-1.5.3.json).
