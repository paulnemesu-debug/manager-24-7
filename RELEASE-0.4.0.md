# Manager 24/7 0.4.0 — Modele M1 și nutriție

## Rezultat

Versiunea 0.4.0 adaugă în ecranul Rețete butonul **Modele M1**. Biblioteca
conține 59 de rețete extrase din fișierul primit `M1 .xlsx`:

- 6 ciorbe/supe;
- 33 feluri principale;
- 16 garnituri;
- 4 salate.

Modelele sunt disponibile și offline. Alegerea unui model creează o copie
normală, complet editabilă; biblioteca originală nu este modificată. Copia
poate fi salvată, recalculată și exportată ca orice altă rețetă.

## Proveniența datelor

Pentru fiecare model sunt păstrate foaia și rândul rețetei. Pentru fiecare
ingredient este păstrat rândul din foaia `Calorii Ingrediente` atunci când
acesta există. Cantitățile au fost interpretate ca grame per porție, conform
antetului registrului, iar modelul pornește de la o porție.

Registrul sursă conține preț și energie în kcal, dar nu conține setul complet
de macronutrienți, aditivi, alergeni validați ori greutatea preparatului finit.
Prețurile sunt cele istorice din foile datate 30–31 ianuarie 2023 și trebuie
actualizate înainte de folosirea economică a rețetelor.
Din acest motiv:

- kcal disponibile sunt importate, iar kJ sunt convertiți;
- grăsimile, acizii grași saturați, glucidele, zaharurile, proteinele și sarea
  rămân necunoscute până la completarea dintr-o sursă verificabilă;
- o valoare lipsă nu este niciodată tratată drept zero;
- alergenii sugerați automat rămân neconfirmați;
- orice rezultat incomplet este afișat și exportat drept **CIORNĂ**.

În sursă există un ingredient denumit `chifte` care nu apare în nomenclator și
două ingrediente fără energie completată (`spata porc`, `cartofi curatati`).
Acestea au fost păstrate fidel și sunt semnalate prin starea de verificare.

## Calcul și control de conformitate

Editorul de ingredient acceptă valori raportate la 100 g, 100 ml sau bucată și
surse de tip etichetă, fișă de furnizor, laborator ori bază de date acceptată.
Rezultatul rețetei include:

- energie în kJ și kcal;
- grăsimi și acizi grași saturați;
- glucide și zaharuri;
- fibre (opțional);
- proteine și sare;
- valori per porție și per 100 g;
- aditivi agregați, alergeni și marcajul decongelat.

Starea **Complet verificat** este permisă numai dacă toate valorile obligatorii
sunt prezente, toate ingredientele și alergenii sunt confirmați, unitățile sunt
compatibile cu baza nutrițională și greutatea finală a preparatului este
cântărită. Energia calculată din macronutrienți folosește factorii din anexa XIV
la Regulamentul (UE) 1169/2011, nu o formulă simplificată proprie.

Responsabilul operatorului alimentar trebuie să confrunte valorile cu rețeta
reală, etichetele/fișele produselor, randamentul după preparare și riscurile de
contaminare încrucișată înainte de publicarea în meniu.

## Baza de date

Migrarea `recipe_nutrition_and_templates` adaugă câmpurile nutriționale și de
trasabilitate în `ingredient_catalog`, `recipe_ingredients` și `recipes` și
actualizează salvarea atomică `foodcost_save_recipe`. RLS existent rămâne activ.

## Verificări release

```text
TypeScript:       OK
ESLint:           OK
Teste:            128/128
Migrare Supabase: OK
Salvare live:     OK (tranzacție de test anulată)
```

## Referințe normative urmărite

- Ordinul ANPC nr. 201/2022, forma consolidată;
- Regulamentul (UE) nr. 1169/2011, în special articolele 30–33, anexa II și
  anexa XIV;
- ghidul METRO România privind calculul și afișarea valorilor nutriționale.

Acest modul asistă documentarea și calculul; nu înlocuiește analiza de laborator
sau verificarea de conformitate a operatorului pentru rețeta efectiv servită.
