# Manager 24/7 0.5.0 — Profit și HACCP mobil

## Schimbările vizibile

- bara de jos: **Acasă · Rețete · Producție · HACCP · Cont**;
- catalogul de ingrediente este în pagina Rețete, nu mai ocupă un tab;
- „Modele M1” este prezentat utilizatorului drept **Biblioteca rețete**;
- Home pune cifra Food Cost și Profit Health Score înaintea brandingului;
- logo-ul rămâne pe splash, autentificare și cont, iar login-ul este compact;
- Manrope, cifre tabulare, auriu cu contrast corect, skeleton loaders și
  animații/haptics discrete;
- fotografie de preparat, card vizual și export de rețetar complet;
- editor compact pe Ingrediente, Cost, Nutriție și Conformitate;
- scăzământul este exclusiv pe ingredient.

## HACCP

- toate cele 19 formulare PARADIM sunt completabile și exportabile PDF;
- fiecare document are selector de dată obligatoriu;
- salvarea și PDF-ul sunt într-o bară fixă care respectă zona sigură Android;
- aplicația poate programa la ora 20:00 o alertă locală pentru zilele fără
  valori HACCP; salvarea unei fișe în acea zi anulează alerta zilei;
- documentele se salvează offline și se sincronizează la reconectare.

## Profit și operare

- cache offline și coadă de sincronizare pentru rețete și catalog;
- preț de ambalaj transformat automat în preț unitar;
- mai mulți furnizori pe ingredient, ofertă activă și economie potențială;
- istoric de preț cu sparkline, sursă și dată;
- alerte locale după import când o scumpire afectează rețete;
- import vânzări CSV/XLSX și matrice SVG Menu Engineering 2×2;
- scalare producție și listă de cumpărături pe furnizor;
- fotografii private în Supabase Storage și versiuni restaurabile de rețetă.

## Backend aplicat

Migrațiile 0.5 au fost aplicate în proiectul Supabase de producție. Sunt active
RLS și politicile de acces pentru `workspace_members`, `haccp_documents`,
`ingredient_price_history`, `ingredient_supplier_offers`, `menu_sales`,
`recipe_versions` și bucketul privat `recipe-images`.

Ambele conturi de test PARADIM sunt `admin`, `active`, `admin_unlimited`, fără
dată de expirare.

## Verificare înainte de build

```text
Versiune aplicație: 0.5.0
Versiune Android locală: 17
TypeScript: OK
ESLint: OK
Teste: 134/134
Export Web/PWA: OK
```

## APK și AAB

Pe calculatorul Windows deja autentificat în Expo:

- `BUILD-APK-WINDOWS.bat` generează APK arm64 + R8 pentru test/distribuție;
- `BUILD-PLAY-AAB-WINDOWS.bat` generează AAB pentru Google Play;
- cheia de semnare rămâne în EAS, astfel încât APK-ul se poate instala peste
  versiunea precedentă dacă aceasta a fost semnată în același proiect.

Buildul Play folosește canalul `play` și nu arată plata externă. APK-ul direct
folosește canalul `direct`. `SYSTEM_ALERT_WINDOW`, `RECORD_AUDIO` și backupul
Android sunt dezactivate.
