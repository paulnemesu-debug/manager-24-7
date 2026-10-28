# Manager 24/7 v1.0.4

Corecție pentru ecranul transparent observat pe Samsung cu Android 16.

## Corecții

- aplicația nu mai returnează o rădăcină React goală în timpul încărcării fonturilor;
- este afișată permanent o suprafață proprie, crem, în locul launcherului telefonului;
- încărcarea fonturilor are un timp-limită de 1,5 secunde și nu mai poate bloca interfața;
- formularul de autentificare pornește și dacă fontul personalizat nu se încarcă;
- versiune Android `1.0.4`, `versionCode 32`.

## Verificări

- TypeScript: trecut;
- ESLint: trecut;
- 164 teste automate: trecute;
- export bundle Android: trecut, cu fonturile Manrope incluse.
