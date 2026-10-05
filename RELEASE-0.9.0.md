# Manager 24/7 v0.9.0

## Conversie și acces

- trial automat de 14 zile, fără card, pornit o singură dată pe server;
- utilizatorul nou intră în onboarding și în aplicație, fără paywall imediat după login;
- preț lunar și anual afișat în lei, cu TVA inclus;
- prețurile pot fi configurate prin `EXPO_PUBLIC_MONTHLY_PRICE_RON` și `EXPO_PUBLIC_ANNUAL_PRICE_RON`;
- paywall-ul prezintă scanarea facturilor, HACCP, P&L, producția și alertele de preț.

## Brand

- schema publică de autentificare a devenit `manager247://`;
- numele produsului rămâne unitar: Manager 24/7.

## Configurări externe rămase

- checkout-ul web și webhook-ul de plată necesită alegerea și configurarea procesatorului;
- migrarea trebuie aplicată în Supabase înainte de publicarea aplicației;
- integrarea SPV/e-Factura necesită furnizorul de conectare și mandatul clientului.
