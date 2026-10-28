# Manager 24/7 v1.1.0

Versiunea funcțională de după `1.0.9`, pregătită pentru validare înaintea unui
nou APK.

## Valori nutriționale

- căutare manual declanșată după denumire sau cod de bare;
- importă valori la 100 g sau 100 ml din Open Food Facts, cu atribuire ODbL;
- valorile lipsă rămân necunoscute, nu sunt transformate în zero;
- datele importate rămân neconfirmate până când utilizatorul le compară cu
  eticheta ori fișa furnizorului;
- confirmarea este blocată dacă lipsesc sursa, referința sau una dintre cele
  opt valori obligatorii UE.

## Invitații de echipă

- funcția Supabase `send-team-invitation` validează JWT-ul apelantului;
- emailul este trimis prin Resend când este configurat, cu fallback pe SMTP-ul
  Supabase și cod OTP;
- starea livrării este salvată și afișată, iar invitația poate fi retrimisă;
- apelurile anonime sunt respinse înainte de executarea funcției.

## HACCP

- ora alertei zilnice este configurabilă;
- calendar lunar de autocontrol pentru probe alimentare, teste de igienă și
  analize de apă;
- adăugare și editare manuală, marcarea activității ca efectuată și ștergere;
- reamintire individuală cu dată și oră;
- import `.xlsx`, `.csv` sau `.txt`, cu confirmarea numărului de activități;
- cache și coadă offline inclusiv pentru ștergeri;
- RLS pe `auth.uid()` și privilegii restrânse la CRUD, fără `TRUNCATE`.

## Backend aplicat

- migrarea `haccp_autocontrol_and_team_invites`;
- migrarea `harden_haccp_autocontrol_grants`;
- migrarea `harden_workspace_member_grants`;
- Edge Function `send-team-invitation` v1, cu `verify_jwt=true`.

Versiune Android: `1.1.0`; `versionCode 38`. Nu se generează APK până când
testele, TypeScript, lint, Expo Doctor și exportul Android local sunt curate.
