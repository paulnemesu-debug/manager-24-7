# Manager 24/7 v1.0.9

## Corecție post-OTP

Diagnosticul de pe telefon a arătat că aplicația rămânea activă și deschidea
onboarding-ul, dar arborele nativ conținea numai logo-ul și selectorul RO/EN.
Nu era o închidere a aplicației și nici transparența launcherului.

Corecția include:

- navigare imperativă după verificarea OTP, direct la onboarding sau Home;
- eliminarea componentelor `Redirect` din traseul critic login → intrare;
- returnarea sesiunii validate din contextul de autentificare;
- layout normal, derulabil, pentru onboarding, fără combinația fragilă
  `flex: 1` și `space-between`;
- selector de limbă fără `width: 100%` într-un antet orizontal;
- temă light impusă în `app.json`, în tema Android și prin AppCompat;
- coadă offline protejată: o operație respinsă de server este izolată după
  trei încercări și nu mai blochează modificările următoare;
- avertizare RO/EN pentru modificările izolate, cu păstrarea locală a ultimelor
  50 de operații eșuate;
- teste de regresie pentru toate aceste condiții.

## Decizii după compararea celor două exemple

- corecția cozii offline a fost preluată și testată;
- tema întunecată experimentală nu a fost integrată: versiunea de lansare
  rămâne intenționat light, pentru a elimina variațiile neverificate de contrast;
- trialul automat de 14 zile nu a fost integrat, deoarece migrarea beta curentă
  acordă deja acces tuturor utilizatorilor autentificați. Adăugarea trialului ar
  putea restricționa inutil accesul după expirare.

## Verificări locale

- `npm test`: 170 teste trecute;
- `npx tsc --noEmit`: trecut;
- `npm run lint`: trecut;
- `npx expo-doctor`: 21/21 verificări trecute;
- `npx expo export --platform android`: export reușit.

Versiune Android: `1.0.9`; `versionCode 37`.
