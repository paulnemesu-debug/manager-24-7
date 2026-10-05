# Manager 24/7 0.6.0 — producție, cumpărături și rețete bulk

## Schimbări livrate

- Rebrand complet vizibil la **Manager 24/7**: nume aplicație, splash, login,
  PWA, pagină de instalare, email OTP, exporturi și formulare HACCP.
- Logo-ul furnizat este folosit la deschiderea aplicației și în antetul compact
  al documentelor HACCP.
- Lista de cumpărături poate fi trimisă prin WhatsApp sau email.
- Modul Producție include bonul de consum zilnic, creat manual sau încărcat din
  Excel/CSV; fotografia documentului poate fi scanată și confirmată înainte de
  import.
- Modul Rețete include rețeta bulk: ingrediente efectiv consumate, gramaj final,
  porții, preț cu TVA și calcul Food Cost real.
- Bonurile și loturile sunt salvate întâi local și sincronizate în cont când
  conexiunea este disponibilă.

## Backend aplicat

- `public.consumption_vouchers`
- `public.bulk_batches`
- RLS activ, cu politici separate SELECT/INSERT/UPDATE/DELETE bazate pe
  `(select auth.uid()) = user_id`.
- Funcția autentificată `scan-consumption-document` pentru extragerea asistată
  din fotografie. Este necesar secretul Supabase `ANTHROPIC_API_KEY`.

## Verificări

```text
TypeScript:        OK
ESLint:            OK
Vitest:            24 fișiere / 141 teste
Expo Doctor:       21/21
Export Android JS: OK
Export Web/PWA:    OK
Supabase RLS:      activ, 4 politici/tabel nou
```

## Compatibilitate Android

- Nume afișat: `Manager 24/7`
- Versiune aplicație: `0.6.0`
- Version code local: `18` (EAS auto-incrementează versiunea remote)
- Package păstrat: `ro.paradim.professionalfoodcost`
- Scheme păstrată: `professionalfoodcost://`
- APK direct: arm64 + R8 + resource shrinking
- Google Play: AAB, plățile digitale prin Play Billing

Păstrarea package-ului și schemei permite instalarea peste APK-ul existent,
păstrează semnarea EAS și evită ruperea autentificării/deep-link-urilor.
