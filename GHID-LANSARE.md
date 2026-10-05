# Ghid de lansare — Manager 24/7 by PARADIM

> **Actualizare 0.5.0:** folosește cu prioritate `RELEASE-0.5.0.md` pentru
> navigația nouă, alertele HACCP, fotografii, furnizori, istoric și build.
> Migrațiile bazei de date pentru această versiune au fost deja aplicate în
> proiectul Supabase `mnaaibsmijziutxuluvv` la 13.09.2026.

> **Actualizare 0.4.0:** pentru modelele M1, nutriție și limitele datelor sursă
> folosește `RELEASE-0.4.0.md`; pentru HACCP folosește `RELEASE-0.3.0.md`, iar
> pentru autentificare folosește `LOGIN-OTP-0.2.0.md`.
> Aplicația acceptă acum atât codul live de 8 cifre, cât și setarea dorită de 6.

> **Actualizare 0.1.3:** folosește cu prioritate `RELEASE-ANDROID-0.1.3.md`,
> `LOGIN-OTP-0.1.3.md` și `SUBSCRIPTION-OPERATIONS.md`. Secțiunile vechi despre
> magic link și plata externă în buildul Play nu mai descriu release-ul curent.

> **Actualizare 0.1.2:** pentru logare, conturile admin și APK folosește
> `LOGIN-OTP-0.1.2.md`. Instrucțiunile de mai jos descriu varianta veche cu linkuri.
> Nu aplica automat migrațiile vechi și nu readuce șabloanele cu magic link.

Pașii de mai jos se execută în conturile tale (Supabase, hosting, Expo, Google Play).
Codul din arhivă este deja pregătit pentru fiecare dintre ei.

---

## 1. Supabase — bază de date și autentificare

### 1.1 Rulează migrația nouă

Migrația `supabase/migrations/20260830120000_subrecipes_allergens_locale.sql` adaugă:
semipreparate, alergeni, categorii standardizate, preferința de limbă și politicile
de izolare pe utilizator pentru rețete.

```bash
npx supabase link --project-ref mnaaibsmijziutxuluvv
npx supabase db push
```

Migrația a fost testată pe PostgreSQL 16 cu date vechi în tabele: categoriile scrise
ca text liber („Ciorbe", „Fel principal") sunt convertite automat în valorile
standard, iar rețetele fără corespondent rămân fără categorie.

### 1.2 Adresele de retur pentru autentificare

**Authentication → URL Configuration**

- Site URL: `https://foodcost.paradim.ro` — este cel pe care îl ai deja setat, nu îl schimba.
- Redirect URLs (adaugă toate):
  - `https://foodcost.paradim.ro/auth/callback`
  - `https://foodcost.paradim.ro/**`
  - `professionalfoodcost://auth/callback`

Ultima este esențială pentru aplicația Android: fără ea, Supabase ignoră adresa
de retur cerută de aplicație și trimite utilizatorul pe Site URL, adică în
browser, în loc să îl întoarcă în aplicație.

### 1.3 Emailul cu link și cod

**Authentication → Email Templates**

Șablonul implicit Supabase trimite **doar** linkul. Codul de 6 cifre apare în
email numai dacă pui `{{ .Token }}` în șablon — altfel autentificarea din
aplicația Android nu are ce introduce.

Modifică **Magic Link** (folosit pentru conturile existente) și **Confirm signup**
(folosit la prima autentificare a unei adrese noi). Același conținut în ambele:

Subiect: `Link-ul tău Manager 24/7`

```html
<p>Salut,</p>

<p>Deschide FoodCost cu un click (expiră în 60 de minute):<br>
<a href="{{ .ConfirmationURL }}">{{ .ConfirmationURL }}</a></p>

<p>Sau introdu în aplicație codul:<br>
<span style="font-size:32px;font-weight:bold;letter-spacing:6px">{{ .Token }}</span></p>

<p style="color:#667482;font-size:12px">Dacă nu ai cerut accesul, ignoră mailul.<br>
PARADIM Operations</p>
```

Apasă **Save changes** după fiecare șablon. Emailurile deja trimise păstrează
formatul vechi — cere un cod nou după salvare.

**Authentication → Providers → Email**: „Enable Email provider" pornit,
„Confirm email" pornit, parola poate rămâne dezactivată — aplicația nu mai folosește parole.

### 1.4 SMTP propriu — primul lucru de făcut, nu ultimul

Serverul de email implicit al Supabase trimite **doar câteva mesaje pe oră pe
tot proiectul** și este marcat de ei ca fiind pentru testare. La depășire,
aplicația primește `email rate limit exceeded`, iar mesajele pur și simplu nu
mai pleacă — indiferent de adresa folosită. Se întâmplă după câteva încercări de
autentificare, deci apare exact când testezi.

**Project Settings → Authentication → SMTP Settings**: completează un furnizor
(Resend, Brevo, Postmark, SendGrid) cu expeditor `no-reply@paradim.ro`.
Resend are un plan gratuit generos și se configurează în câteva minute dacă ai
deja controlul DNS pentru `paradim.ro`.

După ce SMTP-ul propriu este activ, limita dispare, emailurile pleacă de pe
domeniul tău și nu mai ajung în Spam.

### 1.5 Când ai doar link, nu și cod

Aplicația are, sub formularul de autentificare, opțiunea
**„Ai primit doar link-ul? Lipește-l aici"**. Copiezi din email adresa completă
a linkului (apăsare lungă pe link → „Copiază link-ul") și o lipești acolo:
aplicația extrage din ea datele de acces și deschide sesiunea.

Este util în două situații:

- șablonul de email nu conține încă `{{ .Token }}`, deci nu primești cod;
- ai cerut linkul din aplicație, dar l-ai deschis în browser. Linkul cerut de
  aplicație nu poate fi finalizat în browser: verificarea de securitate care
  însoțește cererea rămâne în aplicație, iar browserul primește o eroare în
  adresă. Lipit înapoi în aplicație, linkul funcționează.

Nu deschide linkul înainte de a-l copia — se poate folosi o singură dată.

---

## 2. Aplicația web + PWA pe foodcost.paradim.ro

### 2.1 Generarea fișierelor

```bash
npm install
npx expo export --platform web
```

Rezultatul este în folderul `dist/`. Conține deja `manifest.webmanifest`, `sw.js`
și iconurile din `icons/`, deci aplicația se poate instala pe ecranul principal
atât pe Android, cât și pe iPhone (Safari → Partajare → „Adaugă pe ecranul principal").

### 2.2 Publicarea

Urcă tot conținutul din `dist/` în rădăcina lui `foodcost.paradim.ro`.

Aplicația web este o singură pagină cu rutare pe client (`web.output: "single"`
în `app.json`), iar coaja HTML vine din `public/index.html`.

Setări necesare pe server:

- **Fallback SPA (obligatoriu)**: orice adresă care nu corespunde unui fișier
  servește `index.html`. Fără asta, o reîmprospătare pe `/recipes` sau un link
  direct către o rețetă dau eroare 404.
- **`sw.js` fără cache**: `Cache-Control: no-cache` pentru `/sw.js` și
  `/manifest.webmanifest`, altfel actualizările nu ajung la utilizatori.
- **HTTPS obligatoriu** — fără el, PWA-ul nu se instalează.

### 2.3 Pagina de callback

Nu mai trebuie găzduită separat: aplicația are propria rută `/auth/callback`,
iar linkul din email aterizează direct acolo, pe același domeniu unde se află
sesiunea. Cu fallback-ul SPA de mai sus, funcționează fără nicio configurare în plus.

Fișierul `web/auth-callback.html` rămâne în arhivă ca soluție de rezervă: îl
poți urca la `https://paradim.ro/auth/callback` dacă vrei ca linkurile vechi,
trimise către domeniul principal, să ducă tot în aplicație.

### 2.4 Înlocuirea aplicației web existente

Aplicația nouă ia locul calculatorului de pe `foodcost.paradim.ro`. Baza de date
este aceeași, deci conturile și rețetele existente rămân — utilizatorii se
autentifică la fel și își găsesc datele. Păstrează o copie a fișierelor vechi
înainte de a le înlocui, ca să poți reveni rapid dacă apare ceva neașteptat.

---

## 3. APK-ul Android

### 3.1 Buildul semnat

```bash
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile production-apk --non-interactive
```

Profilul `production-apk` produce un APK semnat, cu variabilele de producție și
cu incrementarea automată a `versionCode`. La prima rulare, EAS generează și
păstrează cheia de semnare (keystore) — **nu o pierde**: fără ea, actualizările
viitoare nu se pot instala peste versiunea existentă.

Descarcă APK-ul din linkul afișat de EAS („Build details" → butonul **Install**)
și redenumește-l `manager24-7.apk`. Codul QR afișat în terminal duce
la aceeași pagină, deci îl poți scana direct cu telefonul Android.

La final, EAS întreabă „Install and run the Android build on an emulator?".
Răspunde **no** dacă nu ai Android Studio instalat — altfel comanda se oprește
cu `spawn adb ENOENT`, deși APK-ul este deja construit și disponibil la link.
Comanda de mai sus include `--non-interactive`, care sare peste această întrebare.

### 3.2 Găzduirea

Urcă fișierul la `https://app.paradim.ro/manager24-7.apk`.

Serverul trebuie să îl trimită cu tipul corect, altfel Android nu îl recunoaște:

```
Content-Type: application/vnd.android.package-archive
```

Pe nginx:

```nginx
location = /manager24-7.apk {
    default_type application/vnd.android.package-archive;
    add_header Content-Disposition 'attachment; filename="manager24-7.apk"';
}
```

### 3.3 Pagina de instalare

Urcă `web/install.html` și `web/qr-foodcost-paradim.png` la
`https://foodcost.paradim.ro/install.html`. Pagina explică cerințele, cei 3 pași de
instalare și autentificarea prin email, în română și engleză.

QR-ul din `web/qr-foodcost-paradim.svg` / `.png` trimite la `https://foodcost.paradim.ro` —
îl poți folosi pe materiale tipărite. **Nu mai folosi QR-ul vechi cu UUID-ul Expo**:
acela expiră odată cu buildul.

---

## 4. Butoanele de pe paradim.ro/foodcost-pro

Conținutul din `web/foodcost-pro-cta.html` se lipește ca bloc HTML în pagină.
Are stiluri proprii, limitate la clasa `.pdm-cta`, deci nu afectează restul site-ului.
Butoanele duc către `foodcost.paradim.ro` și către pagina de instalare Android.

---

## 5. Plata pe site, Google Play ca înveliș

Aplicația deschide acum plata pe `paradim.ro/foodcost-pro`, cu emailul contului
completat automat în adresă. După plată, marchează abonamentul în tabelul
`subscriptions` cu `platform = 'web'` și `status = 'active'` pentru `user_id`-ul
respectiv; aplicația îl citește la următoarea deschidere, iar butonul
„Am plătit deja" reîncarcă starea imediat.

**De reținut înainte de a urca aplicația în Google Play:** politica Google cere ca
abonamentele digitale consumate în aplicație să treacă prin Google Play Billing, iar
trimiterea utilizatorului către o plată externă din interiorul aplicației este motiv
frecvent de respingere. Ai două variante curate:

1. **Distribuție directă (recomandat acum):** APK-ul de pe `foodcost.paradim.ro` plus
   PWA-ul. Nicio restricție, controlezi complet plata și prețul.
2. **Play cu Billing:** păstrezi codul de facturare deja existent
   (`src/hooks/use-billing.native.ts` și funcția `verify-google-play-purchase`),
   creezi produsul `professional_foodcost_pro` în Play Console și lași butonul
   „Activează Professional" ca metodă de plată în versiunea din magazin.

Codul suportă ambele: butonul Google Play apare doar când facturarea este
configurată și disponibilă pe dispozitiv.

---

## 6. iPhone

Până la TestFlight, iPhone-ul folosește PWA-ul: `foodcost.paradim.ro` → Safari →
Partajare → „Adaugă pe ecranul principal". Aplicația pornește pe tot ecranul,
cu iconul PARADIM și fără bara de adresă.

Pentru TestFlight vei avea nevoie de un cont Apple Developer (99 USD/an) și de
un build `--platform ios`; restul codului este deja compatibil.

---

## 8. Contul de administrator

`paul.nemesu@gmail.com` are acces nelimitat în aplicație, fără abonament și fără
dată de expirare. Este configurat în migrația
`supabase/migrations/20260830140000_admin_access.sql` și se activează singur
la `supabase db push`.

Cum funcționează:

- lista de administratori stă în tabelul `private.admin_emails`, într-o schemă
  care nu este expusă prin API — clientul nu o poate citi și nu se poate adăuga în ea;
- la crearea contului, dacă adresa se află în listă, primește rolul `admin`
  și un abonament permanent marcat `admin_grant`, valabil până în 2099;
- conturile care există deja primesc accesul la rularea migrației;
- potrivirea ignoră majusculele, deci `Paul.Nemesu@Gmail.com` este aceeași adresă;
- migrația se poate rula de câte ori vrei fără să strice nimic.

În aplicație, ecranul Cont afișează „Cont administrator" în locul stării de
abonament, iar secțiunea de administrare a abonamentului dispare.

Verificat pe PostgreSQL 16: accesul se acordă corect atât la cont nou, cât și la
cont existent, iar un utilizator obișnuit nu își poate seta singur rolul de
administrator și nu poate citi lista (`permission denied`).

### Adaugă sau scoate un administrator

Din SQL Editor în Supabase:

```sql
-- adaugă
insert into private.admin_emails (email, note)
values ('adresa@exemplu.ro', 'motivul')
on conflict (email) do nothing;

-- acordă accesul imediat, dacă are deja cont
select private.grant_admin_access(u.id)
from auth.users u
where lower(u.email) = lower('adresa@exemplu.ro');

-- scoate din listă (nu retrage accesul deja acordat)
delete from private.admin_emails where lower(email) = lower('adresa@exemplu.ro');

-- retrage accesul
update public.profiles set role = 'owner'
where user_id = (select id from auth.users where lower(email) = lower('adresa@exemplu.ro'));
delete from public.subscriptions
where platform = 'admin_grant'
  and user_id = (select id from auth.users where lower(email) = lower('adresa@exemplu.ro'));
```

### Contul Expo/EAS

Acesta este separat de accesul în aplicație. Pe expo.dev, în organizația
`paradimoperationss-team` → **Members**, verifică faptul că
`paul.nemesu@gmail.com` are rolul **Owner** (sau **Admin**). Owner-ul este
singurul care poate transfera proiectul, administra cheia de semnare și șterge
organizația — de aceea merită să fie contul tău personal, nu unul de serviciu.

---

## 9. Ce mai trebuie completat de tine în cod

| Fișier | Ce | De ce |
| --- | --- | --- |
| `src/constants/paradim.ts` | `WHATSAPP_NUMBER` | Momentan `40700000000`, un număr de test. Bannerul de consultanță trimite acolo. |
| `src/constants/paradim.ts` | `CHECKOUT_URL` | Confirmă adresa exactă a paginii de plată. |

Restul adreselor (`foodcost.paradim.ro`, pagina de callback, APK-ul) sunt deja setate.
