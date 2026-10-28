# Manager 24/7 v1.2.0

Release operațional concentrat pe rutina HACCP din tură și pe controlul
pierderilor din stoc.

## HACCP · Azi

- tab-ul HACCP deschide implicit 5–7 sarcini de tură, nu catalogul de fișe;
- badge-ul tab-ului arată numărul sarcinilor obligatorii restante;
- temperaturi tactile cu stepper ±0,5 °C, limite vizibile și stare conformă;
- depășirea unei limite configurate obligă introducerea acțiunii corective;
- „Totul conform” completează verificările repetate din igienă și curățenie;
- locațiile, echipamentele, responsabilul și antetul lunar sunt precompletate;
- identitatea autentificată și ora înlocuiesc numele tastat ca semnătură de
  bază; semnătura desenată rămâne etapă ulterioară;
- grilă lunară 31 zile și buton „Gata, următoarea sarcină”.

## Dosar / Control

- cele 19 formulare PARADIM și modelul document + rânduri rămân intacte;
- filtrare logică pe lună și pachet PDF unic pentru control DSV;
- exportul include copertă și câte o pagină pentru fiecare document;
- reminderul și calendarul de autocontrol rămân în vederea de control.

## Producție și conformitate

- generatorul de etichete este mutat în Producție;
- data și ora de pornire sunt native, iar etichetele au format 50×30 sau
  40×60 mm;
- export PDF de alergeni pentru meniu, cu lista celor 14 alergeni din Anexa II
  și avertizare distinctă pentru ingrediente neverificate.

## Stoc, comenzi și risipă

- prag minim și stoc țintă pe ingredient și locație;
- propuneri automate de reaprovizionare, grupate pe furnizor, salvabile și
  partajabile prin WhatsApp;
- registru de deșeuri/risipă cu motiv, cantitate, cost și locație;
- inventar săptămânal sau lunar, numărat pe zone de depozitare;
- raport teoretic vs. consum real și abatere valorică pentru fiecare
  ingredient, inclusiv desfacerea semipreparatelor.

## e-Factura / SPV

- citire locală a documentelor UBL Invoice/CreditNote;
- validare de structură și câmpuri esențiale, blocare DTD/ENTITY și limită de
  10 MB;
- liniile UBL pot intra în fluxul existent de revizuire a prețurilor;
- ecran de pregătire OAuth/certificat/backend. Trimiterea live către ANAF nu
  este activată fără autorizarea și credențialele unității.

## Backend și verificări

- tabele noi pentru profilul HACCP, echipamente, praguri, comenzi, risipă și
  programări de inventar;
- RLS pe `auth.uid()`, acces anonim blocat și privilegii limitate la CRUD;
- PDF-urile HACCP și alergeni au fost randate în imagini și verificate vizual.

Versiune Android: `1.2.0`; `versionCode 39`. Build iOS: `11`.
Nu se generează APK în această etapă.
