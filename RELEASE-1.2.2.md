# Manager 24/7 v1.2.2

Corecție pentru autentificarea și prelungirea controlată a contului demo.

## Cont demo și OTP

- după expirarea perioadei demo, un cod OTP nou prelungește accesul cu trei zile;
- aplicația apelează funcția securizată Supabase numai pentru adresa demo dedicată;
- serverul verifică din nou utilizatorul, adresa, metoda OTP și vechimea de maximum
  10 minute, iar aceeași dovadă nu poate fi folosită de două ori;
- după activare, dreptul de acces și noua dată de expirare sunt recitite înainte
  de afișarea aplicației;
- rutarea după OTP trece printr-un singur punct pentru acces și onboarding, cu
  reluare automată dacă evenimentul Auth ajunge înaintea handlerului butonului.

## Remediere operațională

- autentificarea OTP reușită din 26 septembrie 2026 a fost verificată în jurnalul
  Auth și perioada demo aferentă a fost activată până la 29 septembrie 2026;
- activarea are `auto_renew = false`; următoarea prelungire cere din nou un OTP.

## Verificări

- versiune Android `1.2.2`; `versionCode 41`; build iOS `13`.
