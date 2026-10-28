# Manager 24/7 v1.2.1

Actualizare pentru salvarea rețetelor și completarea controlată a dosarului HACCP.

## Salvare rețetă

- erorile Supabase/PostgREST transmise ca obiect sunt interpretate corect;
- o eroare reală de conexiune păstrează rețeta local și o adaugă în coada de
  sincronizare, în loc să afișeze doar mesajul generic „Încearcă din nou”;
- erorile de validare rămân vizibile și nu sunt confundate cu lipsa rețelei.

## Completare automată HACCP

- buton nou în `Dosar / Control`, cu dată selectabilă și confirmare explicită;
- completează 16 dintre cele 19 formulare și păstrează orice valoare existentă;
- nu completează automat `FO-H-16-01 Răcire rapidă`, `FO-H-10-01 Vizitatori`
  și `FO-H-07-01 Consum materii prime`;
- `FO-H-14-01 Temperaturi preparare` și `FO-H-18-01 Temperaturi pe linie`
  primesc câte trei poziții cu ore și temperaturi; denumirile preparatelor sunt
  marcate pentru completare ulterioară;
- spațiile frigorifice primesc automat cele trei citiri configurate, pentru
  fiecare echipament activ;
- identitatea, ora și metadatele completării automate sunt păstrate în document;
- completarea este repetabilă: nu dublează rândurile și nu suprascrie denumirile
  sau valorile completate ulterior de operator.

## Verificări

- TypeScript, lint și 201 teste automate trecute;
- versiune Android `1.2.1`; `versionCode 40`; build iOS `12`.
