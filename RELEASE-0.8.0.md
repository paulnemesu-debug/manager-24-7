# Manager 24/7 0.8.0 — facturi, alerte și export A4

## Ce este nou

- onboarding RO/EN în trei pași, cu acces direct la primul import de factură;
- import factură foto/PDF prin funcția Supabase `scan-consumption-document`;
- previzualizare și confirmare obligatorie pentru fiecare preț înainte de
  actualizarea catalogului;
- memorarea potrivirilor produs–furnizor, local și în Supabase, cu RLS;
- alerte de scumpire vizibile pe Home și raport săptămânal distribuibil prin
  WhatsApp sau email;
- scăzământ per ingredient în modul Rețetă bulk;
- export PDF A4 compact pentru fișa individuală și rețetarul complet;
- logo Manager 24/7 unificat în icon, splash, PWA și PDF.

## PDF verificat

Fișa tehnică folosește A4 portret, margini de 7–8 mm, lățimi fixe pentru
coloane și reguli care evită ruperea unui rând între pagini. Verificarea
vizuală a confirmat că o rețetă cu 12 ingrediente, rezumat economic, alergeni,
declarație nutrițională și subsol încape pe o singură pagină.

## Backend Supabase

- migrarea `manager247_invoice_mappings_080` adaugă tabela
  `supplier_product_mappings`;
- toate operațiile sunt limitate la `(select auth.uid()) = user_id`;
- cheia externă leagă obligatoriu mappingul de un ingredient al aceluiași
  utilizator;
- funcția `scan-consumption-document` v2 acceptă JPEG, PNG, WebP și PDF și
  păstrează verificarea JWT activă.

## Android

- Nume afișat: `Manager 24/7`
- Versiune: `0.8.0`
- Version code: `20`
- Pachet păstrat pentru actualizare: `ro.paradim.professionalfoodcost`
- APK direct: profil EAS `production-apk`, arm64 + R8
- Google Play: profil EAS `production`, AAB

## Verificare înainte de publicare

```bash
npm ci
npm test
npm run typecheck
npm run lint
npx expo-doctor
npx expo export --platform android --output-dir dist-android-080
npx expo export --platform web --output-dir dist-web-080
```
