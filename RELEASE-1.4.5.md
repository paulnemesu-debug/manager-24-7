# Manager 24/7 v1.4.5

## Corecții livrate

- Căutarea valorilor nutriționale folosește serviciul oficial Search-a-licious, cu rezervă pe endpointul vechi.
- PDF-ul unei rețete este distribuit cu denumirea rețetei, nu cu un UUID.
- EBITDA este afișată ca „Rezultat operațional (EBITDA)” și explicată în limbaj simplu.
- Angajații, salariile și pontajele se sincronizează în contul administratorului; datele locale v1.4.4 încă prezente sunt migrate automat.
- Tariful orar a fost înlocuit cu salariu brut și salariu net lunar.
- Totalul salariilor brute ale angajaților activi este preluat automat în P&L.
- Există maximum un pontaj per angajat și zi; înregistrările pot fi editate și șterse.
- Exporturile de prezență includ numele raportului, perioada și data generării în fișier.
- Raportul PDF de prezență include sigla oficială și datele PARADIM Operations SRL.

## Bază de date

Migrarea `20261003110000_hr_cloud_sync_and_salary.sql` adaugă tabelele securizate `hr_employees` și `hr_shifts`, cu RLS pe `auth.uid()` și unicitate angajat/zi.

