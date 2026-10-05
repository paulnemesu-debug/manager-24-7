# Login OTP — configurare și diagnostic 0.2.0

## Cauza capturii cu eroare

Emailul din captura de test conține codul `12262620`, adică 8 cifre. Versiunea
anterioară a aplicației accepta exact 6, deci îl respingea înainte să îl trimită
la Supabase. Versiunea 0.2.0 acceptă integral coduri de 6–10 cifre și nu le
trunchiază. Astfel funcționează atât setarea live actuală (8), cât și setarea
dorită (6).

## Setarea serverului la 6 cifre

În Supabase Dashboard:

1. deschide **Authentication → Providers → Email**;
2. la **Email OTP Length** alege `6` și salvează;
3. în **Authentication → Email Templates → Magic Link**, păstrează
   `{{ .Token }}` în corpul mesajului și elimină butonul bazat pe
   `{{ .ConfirmationURL }}` dacă vrei un flux exclusiv prin cod;
4. aplică aceeași prezentare pentru **Confirm signup**;
5. cere un cod nou după salvare — codurile deja emise își păstrează lungimea.

Documentație oficială: [Supabase — Passwordless email logins](https://supabase.com/docs/guides/auth/auth-email-passwordless).

## Ce face aplicația

- `signInWithOtp({ email })`, fără redirect către web;
- afișează câte o căsuță pentru toate cifrele primite;
- `verifyOtp({ email, token, type: 'email' })`;
- verifică faptul că sesiunea returnată aparține aceleiași adrese;
- păstrează sesiunea securizat și folosește același `auth.uid()` pe Web/APK;
- limitează retrimiterea la o cerere pe minut și explică separat erorile SMTP,
  rețea, rate-limit și cod expirat.

## Conturi administrative verificate live

| Cont | Rol | Stare | Expirare |
| --- | --- | --- | --- |
| `paul.nemesu@gmail.com` | admin | active / admin_grant | fără expirare |
| `paul.nemesu@paradim.ro` | admin | active / admin_grant | fără expirare |

Parola SMTP sau parola de aplicație nu se pune în APK, `eas.json`, `.env`
public sau în arhivă. Emailurile din captură confirmă că șablonul cu token și
livrarea SMTP funcționează; problema rămasă era lungimea validată în client.

