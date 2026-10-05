# MANAGER 24/7 versiunea 1.4.4

## Corecții

- Salvarea unei rețete editate poate crea din nou versiunea de audit fără eroarea `42501`.
- Jurnalul rețetei rămâne protejat: aplicația nu primește drept de inserare directă în `recipe_versions`.
- Editorul rețetei oferă separat **Fă fotografie** și **Alege din galerie**.
- Fotografia făcută cu camera este decupată, optimizată și salvată în fișa preparatului prin același flux securizat ca imaginea din galerie.
- Manifestul Android declară explicit permisiunea nativă `android.permission.CAMERA`.
- APK-ul Android este generat printr-un build nativ curat, cu Hermes și modulele Expo/React Native incluse; nu este un APK repachetat.

## Versiuni native

- Android: `versionCode 48`, `versionName 1.4.4`
- iOS: `buildNumber 19`
