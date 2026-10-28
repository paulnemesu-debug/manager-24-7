# Roadmap Manager 24/7 după 0.3

Ordinea este aleasă după retenție și avantaj comercial, nu după numărul de
ecrane. Fundația offline și cele 19 formulare HACCP sincronizate din 0.3.0
reduc riscul pentru etapele următoare.

## 0.3 — Date care readuc utilizatorul în aplicație

1. **Alerte push la scumpiri**: după import, calculează rețetele peste țintă,
   marja lunară pierdută și trimite o singură notificare agregată.
2. **Raport săptămânal WhatsApp/email**: scumpiri, depășiri și marjă
   recuperabilă; preferințe și dezabonare explicite.
3. **Menu Engineering CSV/XLSX**: import simplu al vânzărilor, mapare confirmată
   la rețete și salvare cloud.
4. **Furnizori multipli**: mai multe oferte pe ingredient, una activă și
   economie potențială calculată.
5. **HACCP multi-locație și audit**: atribuirea formularelor pe locație, roluri,
   aprobări și jurnal de modificări. Salvarea offline/cloud și exportul PDF sunt
   deja disponibile în 0.3.0.

## 0.4 — Eliminarea introducerii manuale

1. **Factură foto/PDF → prețuri** prin Edge Function AI, storage privat,
   extragere structurată și ecran obligatoriu de confirmare.
2. **Rețetă foto/PDF/XLSX → draft**, niciodată salvare automată; validare
   unități, gramaje, sub-rețete și alergeni.
3. **Fotografie preparat** comprimată, stocată privat, cu cache offline și
   eliminarea metadatelor EXIF.
4. **Istoric/audit**: owner, manager, chef, viewer; cine a schimbat prețul,
   versiuni de rețetă și restaurare.

## 0.5 — Diferențiator românesc greu de copiat

1. **Nutriție, aditivi și fișă ANPC** alimentate dintr-o bază autorizată, cu
   sursa și data calculului în document.
2. **Cantine/catering**: meniu pe zile, cost/beneficiar/zi și valori
   nutriționale pentru meniuri școlare.
3. **HACCP/DSV extins**: plan de curățenie configurabil, loturi, trasabilitate,
   termene și etichete tipăribile pe formate uzuale.
4. **Cost teoretic versus real** din bonuri de consum și vânzări, cu explicația
   abaterii: preț, porționare, pierdere sau rețetă nerespectată.

## Condiții înainte de activarea AI și push

- furnizor AI ales și contract/DPA verificat pentru datele de pe facturi;
- secretele ținute numai în Supabase Edge Functions;
- limită de cost per cont, jurnal de procesare și ștergere automată a imaginilor;
- consimțământ pentru notificări și canal de dezabonare;
- validarea conținutului nutrițional și a documentelor cu un specialist înainte
  de a le prezenta ca documente de conformitate.
