# Autentificare OTP — Manager 24/7 0.1.3

## Diagnostic confirmat la 2 septembrie 2026

Aplicația trimite corect cererea `signInWithOtp` către Supabase. Cererile de
test ajung la serviciul Auth, dar expedierea se oprește pe server cu:

```text
535 Authentication Failed
error_code: unexpected_failure
```

Aceasta este o eroare de autentificare a contului SMTP Zoho. Nu este o eroare
de adresă, de cod OTP sau de APK. Până la corectarea SMTP, nici web-ul, nici
APK-ul nu pot primi codul de șase cifre.

## Corectarea SMTP Zoho

1. Intră în contul Zoho al adresei `paul.nemesu@paradim.ro`.
2. Deschide **Zoho Accounts → Security → App Passwords**.
3. Generează o parolă nouă cu numele `Supabase FoodCost` și copiaz-o imediat.
   Nu folosi parola obișnuită a căsuței poștale.
4. În Zoho Mail deschide **Settings → Mail Accounts → Server Configuration** și
   verifică serverul afișat pentru acel cont. Pentru un cont organizațional
   plătit din centrul de date european este, în mod normal,
   `smtppro.zoho.eu`, port `465`, SSL. Setarea din cont are prioritate.
5. În Supabase deschide **Project Settings → Authentication → SMTP Settings**:
   - Sender email: `paul.nemesu@paradim.ro`
   - Sender name: `Manager 24/7 by PARADIM`
   - Username: `paul.nemesu@paradim.ro`
   - Password: parola de aplicație nouă
   - Host și port: valorile confirmate la pasul 4
6. Salvează și cere **un singur** cod nou din aplicație. Verifică Inbox și Spam.

Parola de aplicație este secretă: nu se pune în cod, în `eas.json`, în arhivă
sau într-un mesaj. Ea se introduce numai în câmpul protejat din Supabase.

Referință oficială pentru serverele și parolele SMTP Zoho:
https://www.zoho.com/mail/help/zoho-smtp.html

## Șabloanele email

Șabloanele **Magic Link / OTP** și **Confirm signup** trebuie să includă
`{{ .Token }}`. Aplicația 0.1.3 nu trimite o adresă de redirect și verifică
direct codul cu `verifyOtp({ email, token, type: 'email' })`.

## Conturi administrative verificate pe server

| Cont | Rol | Abonament | Expirare |
|---|---|---|---|
| `paul.nemesu@gmail.com` | admin | active / admin_unlimited | fără expirare |
| `paul.nemesu@paradim.ro` | admin | active / admin_unlimited | fără expirare |

Rolul și accesul sunt acordate în baza de date, nu prin adresa scrisă în APK.
