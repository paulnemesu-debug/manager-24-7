# Release 0.2.0 — Profit Center și lucru offline

Data: 13 septembrie 2026

## Rezultat

Versiunea 0.2.0 mută produsul de la un calculator care depinde de conexiune la
un instrument operațional local-first. Rețetele și catalogul apar imediat din
cache, schimbările făcute fără internet intră într-o coadă, iar sincronizarea
se reia automat în fundal.

## Funcționalități livrate

| Zonă | Implementare 0.2.0 |
| --- | --- |
| Home | Profit Center compact, logo 92 px, Food Cost dominant, Health Score și priorități |
| Offline | cache per cont, coadă de operații, indicator stare, retry automat, lease de acces 7 zile |
| Ingrediente | Quick Mode, preț/cantitate ambalaj, preț unitar calculat, câmpuri avansate ascunse |
| Setări | monedă de cont și TVA implicit sincronizate, cu fallback offline |
| Producție | porții planificate, necesar consolidat pe ingredient și furnizor, cost total |
| Bulk | cantități reale scoase din magazie, porții și gramaj servire, cost real/porție |
| Menu Engineering | cantități vândute manual și clasificare Vedetă/Cai de povară/Enigmă/Câine |
| HACCP | temperaturi, curățenie și etichetă PDF din rețetă cu termen și alergeni |
| Simulator | efectul modificării de cost/preț/volum și impactul lunar în moneda contului |
| Export | PDF/Excel per rețetă și rețetar complet, cu o filă pe categorie |
| Autentificare | cod numeric 6–10 cifre, inclusiv codul live de 8 cifre, fără Magic Link obligatoriu |
| Android | arm64, Hermes, R8/resource shrink, icon adaptiv contrastant, profil APK și profil AAB |
| Securitate | fără `SYSTEM_ALERT_WINDOW`, backup Android oprit, XLSX vulnerabil înlocuit |

Migrarea `20260913203000_profit_center_foundation.sql` a fost aplicată și pe
proiectul Supabase live. Ea adaugă setările de cont și prețurile pe ambalaj cu
RLS per utilizator.

## Verificare

- 113 teste automate în 16 fișiere: toate trec;
- TypeScript și ESLint: fără erori;
- Expo Doctor: 21/21;
- export web de producție: reușit;
- bundle Android Hermes de producție: reușit;
- `npm audit --omit=dev`: fără vulnerabilități high sau critical;
- cele două conturi PARADIM verificate live: `admin`, `active`, `admin_grant`,
  fără expirare.

## Limitări asumate

- jurnalele HACCP și vânzările pentru Menu Engineering sunt local-first în
  această versiune; schema cloud/audit multi-utilizator urmează în 0.3;
- alertele de scumpire sunt vizibile ca priorități în aplicație, dar push-ul și
  raportul programat WhatsApp/email cer un serviciu server-side;
- importul sigur acceptă `.xlsx` și CSV; vechiul format binar `.xls` nu este
  acceptat;
- PDF-ul web folosește dialogul nativ de tipărire; pe Android este generat și
  partajat ca fișier PDF;
- fotografia preparatului, OCR-ul facturilor/rețetelor și nutriția nu sunt
  declarate finalizate în această versiune.

## Fișierul Android

Bundle-ul JavaScript Android este verificat, dar APK-ul final trebuie semnat cu
credentialele contului EAS. Acest mediu nu este autentificat în Expo; din acest
motiv arhiva include `BUILD-APK-WINDOWS.bat`, care produce APK-ul semnat în
contul `paradimoperationss-team` fără a expune cheia de semnare.
