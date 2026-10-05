# Manager 24/7 0.1.2 — Android

Aceasta este sursa verificată pentru următorul APK semnat. Aplicația folosește
autentificare Supabase prin cod primit pe e-mail și nu mai cere deschiderea unui
magic link în browser.

## Ce este rezolvat în aplicație

- Trimitere OTP fără adresă de redirecționare și verificare `type: email`.
- Introducere și validare strictă a unui cod de exact 6 cifre.
- Codurile cu zero la început și cele lipite cu spații sunt păstrate corect.
- Retrimitere după 60 de secunde și opțiunea „Am deja un cod”.
- Selector Română / English vizibil înainte de logare.
- Ecran compact, derulabil și adaptat telefoanelor cu ecran mic și tastatură deschisă.
- Versiune aplicație `0.1.2`, Android `versionCode 2`, pachet
  `ro.paradim.professionalfoodcost`.
- Profil EAS cu paralelism Gradle limitat și arhitecturi ARM pentru telefoane
  fizice, pentru a evita întreruperea workerului în timpul compilării native.

## Configurația serverului — aplicată la 1 septembrie 2026

- SMTP propriu activat prin Zoho EU, cu expeditorul Manager 24/7 by PARADIM.
- Șablonul „Magic link or OTP” folosește `{{ .Token }}`, fără
  `{{ .ConfirmationURL }}`.
- Șablonul „Confirm sign up” folosește `{{ .Token }}`, fără
  `{{ .ConfirmationURL }}`.
- Confirmarea e-mailului este activată, iar utilizatorii noi sunt permiși.

Supabase generează OTP-ul e-mail cu 6 cifre. Expirarea recomandată este 600 de
secunde și trebuie verificată în **Authentication → Sign In / Providers → Email**
înainte de testul final. Livrarea într-un inbox real și consumarea unui cod real
nu au fost încă validate cap-coadă; cere întotdeauna un cod nou după schimbarea
șablonului.

Nu introduce parola SMTP, cheia secretă Supabase sau coduri OTP în fișierele
aplicației, arhivă, chat ori variabile `EXPO_PUBLIC_*`.

Documentație: [Supabase email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless).

## Conturi admin — verificate live

| E-mail | Rol | Abonament | Expirare |
| --- | --- | --- | --- |
| paul.nemesu@gmail.com | admin | active / admin_unlimited | fără expirare |
| paul.nemesu@paradim.ro | admin | active / admin_unlimited | fără expirare |

Accesul este stabilit pe server. Utilizatorii nu își pot acorda singuri rolul sau
abonamentul din aplicație.

## Verificări efectuate

- 80/80 teste automate: trecute.
- TypeScript: trecut.
- Export Android Metro/Hermes: trecut, 1.902 module.
- Nu există secrete de server în sursa distribuită.

Exportul Metro/Hermes verifică pachetul JavaScript, dar nu produce un APK nativ.
Buildul nativ local nu a putut descărca distribuția Gradle din mediul de lucru.
APK-ul final trebuie construit în EAS, unde se păstrează cheia de semnare folosită
de versiunea deja instalată.

## Generarea APK-ului semnat pe Windows

1. Extrage arhiva într-un folder nou. Nu șterge mai întâi aplicația instalată.
2. Rulează `BUILD-APK-WINDOWS.bat` prin dublu-click.
3. Autentifică-te în Expo dacă se cere; proiectul corect este
   `paradimoperationss-team/paradim`.
4. La final, deschide linkul EAS, descarcă APK-ul și instalează-l peste versiunea
   existentă.

Scriptul folosește EAS CLI 23, dezactivează dependența de Git pentru arhiva locală,
rulează typecheck + toate testele și pornește profilul `production-apk` în mod
non-interactiv. Dacă workerul Expo pierde conexiunea, scriptul reîncearcă automat
o singură dată. Nu rula din alt director și nu inițializa un proiect Expo nou.

Proiect EAS: `22034007-9c26-4d6f-9f33-4908b8a05acb`.

## Test final obligatoriu după instalare

1. Selectează RO, cere cod pentru primul cont admin și confirmă că mesajul conține
   șase cifre, nu buton/link de autentificare.
2. Introdu codul în APK și verifică rolul admin și accesul nelimitat.
3. Repetă în EN cu al doilea cont admin.
4. Verifică un cod greșit, un cod expirat și retrimiterea după 60 de secunde.
5. Verifică ecranul cu tastatura deschisă pe telefonul pe care interfața nu încăpea.

Nu rula `supabase db push` pentru aceste corecții de autentificare. Migrațiile din
arhivă includ și funcții mai vechi și trebuie reconciliate separat cu schema live.
