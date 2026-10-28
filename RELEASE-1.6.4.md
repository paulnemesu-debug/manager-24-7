# MANAGER 24/7 v1.6.4 — porții planificate

Versiune Android: `63`

## Corecție

- Câmpul „Porții planificate” poate fi golit și rescris fără să readauge automat valoarea `1`.
- Sunt acceptate atât virgula, cât și punctul ca separator zecimal.
- Salvarea și duplicarea sunt blocate pentru valori incomplete, nefinite sau mai mici decât `1`.
- Încărcarea unei schițe și restaurarea unei versiuni sincronizează corect textul afișat cu valoarea salvată.

## Verificare efectuată

- Android 15 / API 35, AOSP ATD x86_64, emulare software: câmpul a trecut prin `10 → gol → 2 → 25` fără să reintroducă prefixul vechi.
- Pe același emulator, valoarea zecimală a trecut prin `1, → 1,5` fără normalizare prematură.
- 105 fișiere de test și 828 teste unitare au trecut.
- TypeScript și lint au trecut fără erori.
- Toate cele 67 de verificări ale fluxurilor QA au trecut.
- APK-ul final arm64 a fost construit cu succes pentru versiunea `1.6.4`, build `63`.

APK-ul livrat pentru test este semnat cu certificatul local `PARADIM Test`. Pentru publicare sau actualizarea unei instalări semnate anterior este necesar keystore-ul original de release.
