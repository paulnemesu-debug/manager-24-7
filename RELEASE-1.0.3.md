# Manager 24/7 v1.0.3

## Corecție crash la lansare pe Android

- buildul APK de test nu mai activează R8/minify și resource shrinking;
- `expo-notifications` nu mai este inițializat în layout-ul rădăcină, înainte
  de afișarea primului ecran; configurarea rămâne disponibilă la activarea
  alertelor HACCP;
- EAS nu mai folosește lock-ul cu patch-uri Expo depășite și instalează
  versiunile compatibile cu SDK 57 din intervalele declarate în `package.json`;
- Android rămâne `arm64-v8a`, iar numărul de versiune este `1.0.3 (31)`.

## Instalare

Buildul trebuie creat cu profilul `production-apk` și `--clear-cache`. Încearcă
mai întâi instalarea peste buildul EAS anterior. Dacă Android raportează o
semnătură diferită, salvează datele locale și reinstalează aplicația.
