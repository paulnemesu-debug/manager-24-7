# MANAGER 24/7 — corecții porții și salarii, 19 octombrie 2026

Bază: ultima sursă GitHub `main` disponibilă la verificare, versiunea 1.6.2, commit `ffe8d2a9ab721c99b31862db490d3eb9d6e6343c`.

Această arhivă conține sursa corectată și testele aferente. Nu este un APK, nu actualizează aplicația instalată și nu reprezintă o lansare publicată. Versiunile native rămân 1.6.2 / Android 61 / iOS 32; nu s-a generat niciun APK/AAB/IPA și nu s-a efectuat deploy.

## Porții obținute

Ștergerea câmpului nu mai reintroduce automat 1. Se pot tasta și salva 1, 2, 10, 50, 99 sau 100 de porții. Sunt acceptate și valori fracționare de cel puțin 1, cu virgulă sau punct. Valorile goale, zero, negative sau nevalide nu pot fi salvate. Costul și gramajul pe porție se recalculează, iar valorile persistă la redeschidere.

## Salarii brute din HR în P&L

Totalul este în continuare calculat automat din HR. În HR se completează salariul brut lunar al fiecărui angajat; în P&L se afișează suma. Acum zero este vizibil, există butonul „Completează salariile în HR” și un mesaj când lipsesc angajați/salarii. Revenirea din HR actualizează totalul fără a șterge veniturile sau costurile introduse. Lunile anterioare salvate păstrează salariul istoric.

Încărcările eșuate fără date locale valide nu mai sunt tratate ca rapoarte/salarii zero. Salvarea este blocată până la reîncercare reușită. Datele locale valide rămân disponibile offline; înregistrările valide aflate în așteptare sunt păstrate la recuperarea unui cache parțial invalid.

## Verificare

- `npm test`: 547/547 teste, 85 fișiere (baza avea 482/482, 82 fișiere).
- `npm run qa:flows`: 56/56 verificări simulate, cu adaptoare pentru platformă.
- `node --test scripts/qa/source-loader.test.cjs`: 3/3 verificări ale infrastructurii QA.
- `npm run typecheck` și `npm run lint`: fără erori de sursă.
- Export JavaScript Android/Hermes: reușit. Acesta NU este build nativ/APK.
- Browser Chromium 151: 13 verificări prin interfața reală locală, date demonstrative, viewport 390×844 și control suplimentar 320×740. Fără acces la servicii externe. Nu este emulator Android.

Testele noi reproduc erorile înaintea remedierilor. Au fost verificate tastarea normală, validarea, salvarea/redeschiderea lotului, HR→P&L, păstrarea lunilor anterioare, reîncărcarea paginii, RO/EN, HACCP Azi, protecția temperaturii neconforme și disponibilitatea celor 19 formulare. Nu s-au completat și salvat toate cele 19 formulare.

## Restanțe de testare / riscuri

- OTP real, trial/permisiuni, sincronizare cloud și conflicte între dispozitive: neverificate în această rundă.
- Instalare/upgrade, tastatura Android, cameră, notificări, partajare PDF/XLSX, imprimare: necesită test pe dispozitiv; nu s-a creat APK.
- Cache-ul existent pentru starea de plecare a unui angajat poate rămâne vechi când serverul nu este disponibil. Testați plecarea pe un dispozitiv și P&L pe alt dispozitiv, online/offline. Acest mecanism comun nu a fost schimbat.
- QA-DATE-01 (P2, confirmat): lista loturilor afișează data 18.10 pentru o valoare stocată 19.10 în fusul America/New_York. Valoarea salvată rămâne 19.10, iar afișarea în Europe/Bucharest este corectă. Restanță separată de cele două remedieri cerute.

Raportul HTML și dovezile text/JSON sunt incluse în folderul QA din arhiva livrată. Niciun rezultat local nu trebuie interpretat ca validare integrală pentru lansare.
