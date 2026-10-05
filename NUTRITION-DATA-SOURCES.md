# Sursele nutriționale — MANAGER 24/7 1.5.5

Verificate la 4 octombrie 2026. Soluția implementată folosește o bază locală gratuită pentru ingrediente generice și păstrează căutarea opțională a produselor ambalate. Calculul rețetei nu trimite rețeta unui serviciu extern.

| Sursă | Costul datelor / calculului | Rol și limită |
| --- | --- | --- |
| ANSES-Ciqual 2025 | 0, fără cost pe utilizator sau calcul | Baza inclusă: 3.484 alimente; 9 componente relevante pentru rețetă. Unele câmpuri sunt necunoscute sau au limite analitice. |
| Open Food Facts | Acces public fără abonament, cu limite de trafic | Căutare opțională, explicită, după produs/cod de bare. Date comunitare, de verificat cu eticheta. Nu este baza implicită. |
| USDA FoodData Central | Date gratuite CC0; API cu cheie și limite | Evaluat ca alternativă. Nu este inclus în această versiune; ar necesita asociere, conversii de definiții și o sursă suplimentară. |
| Edamam Nutrition Analysis | Basic 29 USD/lună; Core 299 USD/lună | Evaluat, neintegrat. Basic exclude utilizarea comercială și stocarea; Core permite stocarea doar a patru macronutrienți și cere abonament activ cât timp datele sunt folosite. Nu acoperă simplu salvarea locală a întregii declarații. |

Costul de 0 se referă la licența bazei incluse și apelurile pentru calculul local. Lucrul de integrare, actualizările, infrastructura aplicației și căutările online au propriile costuri operaționale.

## Sursa locală și licența

**Anses. 2025. Table de composition nutritionnelle des aliments Ciqual.** Publicată la **19 noiembrie 2025**, versiunea 1.0, DOI **10.57745/RDMHWY**.

- Tabelul oficial: https://ciqual.anses.fr/cms/en/2025-anses-ciqual-table
- Pachetul oficial și licența Etalab 2.0: https://doi.org/10.57745/RDMHWY
- Descărcarea XLSX oficial: https://entrepot.recherche.data.gouv.fr/api/access/datafile/666260
- MD5 XLSX: `0d9758ce23f3f13dd63a005bc1bb4f2c` — verificat înaintea conversiei.
- Licența: Licence Ouverte / Open Licence Etalab 2.0; permite reutilizarea, inclusiv comercială, cu atribuirea sursei și datei.
- JSON livrat: `src/constants/nutrition-ciqual.json`, 494.793 bytes.
- SHA-256 JSON: `ae7b02c1110fcabeda0643ecc9933c374354c38809263399f5452416901e509e`.

Datele nu devin proprietare prin includerea în aplicație. Includerea nu reprezintă o aprobare a produsului de către ANSES. Sursa/datele și codul exact al alimentului apar în datele salvate, în interfață și în exporturi. JSON-ul păstrează denumirile originale franceze și șirurile originale ale celor nouă valori; au fost adăugate denumiri RO/EN pentru căutare.

Reproducere: instalează `openpyxl`, descarcă XLSX-ul de mai sus și rulează `python scripts/generate-ciqual-data.py /cale/ciqual-2025.xlsx`. Scriptul verifică MD5, folosește energia UE și proteinele N×6,25 și regenerează JSON-ul.

## Comportamentul calculului

La introducerea unei denumiri exacte cunoscute, valorile se completează local. Pentru „smântână lichidă”, „smântână”, „ou melanj/melange”, „sos roșii” și „vin alb”, versiunea 1.5.5 poate propune automat un aliment generic. Aceste 12 denumiri normalizate au toate valorile marcate ca estimări neconfirmate și păstrează ipoteza în referința sursei. Smântâna lichidă folosește media de 24,2% grăsime, smântâna groasă media de 14,7%; melanjul presupune ou întreg fără adaosuri, sosul presupune sos de roșii gătit pentru pizza, iar vinul presupune vin alb sec. Utilizatorul trebuie să verifice produsul real și poate alege alt aliment sau completa eticheta.

Pentru alte denumiri ambigue, precum „bacon” sau „amidon”, căutarea locală oferă variante și utilizatorul alege alimentul concret. „Borș proaspăt” rămâne fără asociere: nu a fost găsită o corespondență suficient de sigură. Asocierea se păstrează în rețetă sau în ingredientul din catalog. Alegerea stării crude/gătite și a procentului de grăsime contează.

Datele complete sau parțiale introduse manual nu sunt înlocuite și nu sunt amestecate automat cu alt aliment. Vechile rânduri din bibliotecă, neconfirmate și cu numai energie, se pot completa din Ciqual. Redenumirea unui ingredient completat automat recalculează asocierea sau elimină datele rămase de la alimentul anterior.

Cantitățile în g/kg folosesc valorile la 100 g de parte comestibilă. Pentru ml/l sau bucăți se introduce densitatea ori masa netă efectivă; aplicația nu echivalează arbitrar 1 ml cu 1 g și nu presupune masa unui ou. Greutatea finală măsurată ajustează concentrația la 100 g. Până la măsurare, suma maselor compatibile este o estimare care urmărește cantitățile curente. Modelele noi nu fixează o greutate estimată care să devină învechită la editare.

Totalul unui nutrient este calculat numai dacă toate ingredientele active au valoarea și conversia necesare. Un ingredient fără date nu este ignorat și o lipsă nu devine zero. Valoarea necunoscută apare ca „—”, cu denumirea ingredientului de completat. Semipreparatele propagă valori conform cantității efective produse în kg/l/buc, distinct de numărul de porții.

Politica aplicației pentru limite analitice: „traces” se aproximează cu zero, iar „< x” se calculează conservator cu limita x. Șirul original rămâne păstrat, valoarea rețetei primește „≈”, iar rezultatul nu este considerat complet verificat. Aceasta este o politică de calcul orientativ a aplicației, nu o valoare analitică exactă comunicată de ANSES. „-” rămâne necunoscut.

Calculul nu modelează separat retenția la gătire, absorbția/scurgerea grăsimii ori volatilizarea alcoolului. Cantitățile alimentare efectiv folosite și greutatea finală trebuie introduse corect. Datele generice și completarea câmpurilor nu reprezintă o garanție de precizie analitică.

## Auditul bibliotecii

Pe cele 479 de modele / 4.102 rânduri de ingrediente incluse:

- 3.704 rânduri au asociere automată exactă sau generică orientativă; 3.600 au toate câmpurile obligatorii și conversia necesară.
- 160 modele au toate cele nouă valori numerice fără completare suplimentară, față de 110 anterior; acestea pot fi încă orientative și neconfirmate.
- 461 au energia calculabilă, inclusiv energia istorică din fișierele sursă. Macros complete sunt calculabile la 210 modele; 189 au grăsimi saturate și 175 au zaharuri pentru toate ingredientele.
- 938 denumiri exacte pentru 244 alimente sunt localizate, plus 12 aliasuri generice orientative; cele 3.484 de înregistrări se pot căuta și după denumirea originală franceză. În această versiune au fost adăugate 83 denumiri exacte.

Restul modelelor cer date suplimentare pentru produse, mărci, preparate proprii ori nutrienți lipsă din sursă. Ele nu au fost declarate artificial „complete”. Lista exactă este în `qa-results/nutrition-coverage.json`.

## Căutarea produselor ambalate

Open Food Facts este consultat numai prin acțiunea explicită a utilizatorului. Sunt cerute valorile normalizate la 100 g; valorile unei porții nu sunt confundate cu cele la 100 g, iar volumul ambalajului nu stabilește baza declarației. Verifică baza cu eticheta și schimb-o dacă produsul este declarat la 100 ml.

Cereri repetate identice sunt reunite și memorate temporar 10 minute; un răspuns 429 nu declanșează o cerere suplimentară de rezervă. Produsul selectat este salvat în ingredient, pentru reutilizare. Aplicația nu include o copie a bazei Open Food Facts; baza și conținutul au licențele proprii ODbL / DbCL. Căutarea nu trimite fotografia sau rețeta către Open Food Facts.

Documentație oficială: https://openfoodfacts.github.io/openfoodfacts-server/api/ și https://world.openfoodfacts.org/terms-of-use

Alternative evaluate: https://fdc.nal.usda.gov/api-guide/ și https://developer.edamam.com/edamam-nutrition-api
