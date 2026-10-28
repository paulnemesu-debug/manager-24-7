# Manager 24/7 v1.0.0

## Control operațional

- inventar rapid: stoc inițial + intrări − stoc final;
- cost teoretic din rețete comparat cu consumul real;
- abatere valorică și procentuală, cu posibile cauze operaționale;
- import vânzări CSV/POS și potrivire automată cu rețetele;
- costul real al turei și indicator Prime Cost;
- salvare offline și sincronizare când serviciul este disponibil.

## Companie și echipă

- mai multe locații sub același cont;
- roluri manager, bucătar-șef și acces doar pentru citire;
- date operaționale pregătite pentru separare pe locație;
- export complet JSON al datelor contului.

## Experiență și stabilitate

- dark mode după setarea sistemului;
- fundal navy unificat pentru icon și splash;
- zone de atingere mărite la minimum 44–48 px;
- ecran sigur de recuperare după erori de randare;
- evenimente anonime minimale pentru măsurarea utilizării;
- configurație iOS/TestFlight: bundle identifier, build number și permisiuni.

## Excluse intenționat

- plățile comerciale, abonamentele automate și integrarea SPV/e-Factura vor fi configurate după disponibilitatea datelor companiei;
- accesul este complet în perioada beta, fără paywall și fără procesator de plată activ.

## Publicare

Înainte de instalarea versiunii trebuie aplicate migrările Supabase:

1. `20260917090000_manager247_operations_100.sql`.
