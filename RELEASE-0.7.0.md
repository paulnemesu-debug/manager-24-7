# Manager 24/7 0.7.0 — P&L managerial

## Ce este nou

- card **P&L lunar** pe ecranul Home;
- ecran complet pentru introducerea lunară a veniturilor și costurilor;
- calcul automat pentru venituri totale, COGS, profit și marjă brută,
  Prime Cost, EBITDA, rezultat și marjă netă;
- prag de rentabilitate și diferența față de acesta;
- semafor managerial: Profitabil, De urmărit, Necesită acțiune sau De completat;
- istoric pe luni, cache offline și coadă de sincronizare;
- tabel Supabase `pnl_reports`, protejat cu RLS per `auth.uid()`;
- rebrand complet la **Manager 24/7**.

## Limita raportului

Raportul este o estimare managerială construită din valorile introduse de
utilizator. Nu înlocuiește contabilitatea, balanța, declarațiile fiscale sau
situațiile financiare întocmite și verificate de profesioniști autorizați.

## Android

- Nume afișat: `Manager 24/7`
- Versiune: `0.7.0`
- Version code: `19`
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
npx expo export --platform android --output-dir dist-android-070
npx expo export --platform web --output-dir dist-web-070
```
