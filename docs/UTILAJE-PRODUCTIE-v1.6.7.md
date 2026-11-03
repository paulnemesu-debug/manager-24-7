# Utilaje, mentenanță și fișe de producție

Funcțiile sunt implementate în sursa v1.6.7. APK-ul 68 nu este încă disponibil: compilarea semnată așteaptă autentificarea Expo/EAS.

## Utilaje și mentenanță

Deschide **Producție → Utilaje și mentenanță** sau legătura din HACCP. Utilajele HACCP păstrează aceeași identitate; denumirea lor se modifică în HACCP. Poți adăuga separat utilaje care nu necesită monitorizarea temperaturii.

În fișa utilajului completezi locația, marca, modelul, seria, furnizorul de service, datele de achiziție și garanție, referințele pentru manual/fotografie și disponibilitatea. Programezi curățări, întreținere, mentenanță preventivă sau reparații, cu responsabil, termen, recurență în zile și costuri estimate.

La efectuarea lucrării introduci data și costurile reale pentru piese, manoperă, deplasare și consumabile, apoi confirmi finalizarea. O lucrare restantă nu se finalizează automat. Istoricul finalizat rămâne protejat; recurența creează următoarea programare.

## Fișe de producție

Deschide **Producție → Fișe de producție**, alege rețeta, data și numărul planificat de porții. Fișa păstrează rețeta și calculele de la momentul creării.

Completează consumurile reale, loturile/furnizorii, cantitatea și porțiile obținute, responsabilul, utilajele folosite și măsurătorile efectuate. Valorile măsurate nu sunt completate automat. Utilajele indisponibile împiedică validarea.

După verificare, validează fișa. Pentru corecții creează o copie nouă. Bonul de consum se creează prin acțiunea explicită din fișă; repetarea acțiunii nu suprascrie un bon existent și nu reface un bon șters.

## Import și export

Registrele și fișele individuale se exportă în **Excel, CSV sau PDF**. Importul acceptă **Excel și CSV** în structura șabloanelor aplicației. PDF-ul este pentru citire/tipărire.

Pentru utilaje și lucrări, exportă registrul sau fișa și păstrează anteturile. Pentru producție există și **Descarcă șablon Excel**, disponibil înainte de crearea primei fișe. Înlocuiește datele de exemplu și folosește un `source_sheet_id` unic pentru fiecare fișă nouă; rândurile aceleiași fișe păstrează același identificator.

Folosește date în format `YYYY-MM-DD`; cantitățile folosesc unitățile indicate în fișier. La import vezi previzualizarea și erorile înainte de confirmare. Un fișier invalid nu se importă parțial. Identificatorii deja existenți sunt omiși, fără suprascrierea fișelor. Fișele de producție importate devin ciorne; lucrările importate trebuie confirmate separat după verificarea efectuării.

Starea sincronizării este afișată în aplicație. Dacă apare un conflict, compară versiunile și alege explicit versiunea potrivită; o fișă finalizată în cloud nu poate fi înlocuită cu o ciornă locală.
