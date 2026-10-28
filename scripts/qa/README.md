# Simulări funcționale

`npm run qa:flows` rulează componentele reale prin react-test-renderer, cu adaptoare explicite pentru platformă. Nu necesită emulator sau cont de producție și nu trimite emailuri, invitații ori cereri de plată.

Rezultatele implicite sunt în `qa-results/`. Pentru alt director, setează `MANAGER_QA_OUTPUT`.

- `check-folders.cjs`: fotografii distincte, grilă la patru dimensiuni, fonturi mari, stare păstrată, înapoi Android și revenire la Rețetele mele.
- `check-draft-flows.cjs`: autosalvare, recuperare, conflict între versiuni, anulare/refuz cameră și păstrarea fotografiei în schiță.
- `check-auth-haccp.cjs`: email/OTP cu serviciu simulat, favorite persistente pe cont, eșec de stocare, căutare și acces la toate formularele.
- `check-nutrition-flows.cjs`: completare automată fără rețea, tabel în rețeta finală, salvare/redeschidere, alegerea explicită a stării gătite și prioritatea etichetei manuale.
- `check-commercial-flows.cjs`: simulator pe ingredient și ofertă alternativă, preț negativ, confirmarea obligatorie a facturii, monedă străină, acces viewer și vânzări CSV folosite de analiza meniului.
- `check-operational-flows.cjs`: creare și reînnoire document, arhivare/restaurare, toate verificările onboarding, plecare cu dezactivarea angajatului și păstrarea pontajului istoric, navigare din prioritățile Daily Manager.
- `nutrition-coverage.cjs`: auditul celor 479 de modele și 4.102 rânduri de ingrediente, cu denumiri nerecunoscute și câmpuri lipsă din sursă. Rulează separat cu `node scripts/qa/nutrition-coverage.cjs`.

Testele Vitest din `src/lib/*pipeline.test.ts` folosesc scriitorul/cititorul XLSX reale. API-urile native de fișiere, tipărire, partajare și scanare au adaptoare; aceste teste nu confirmă funcționarea pe un telefon fizic.

Evidența v1.6.0 este în `VERIFICARE-1.6.0.json` și `qa-results/validation-1.6.0/`: 402 teste automate și 53 scenarii pe componente (47 existente și șase noi). Verificările SQL din `supabase/tests/operational_sync.sql` se execută într-o tranzacție anulată prin `ROLLBACK`, după aplicarea migrării. Rapoartele v1.5.x sunt istorice. HTML-ul și XLSX-ul `nutrition-automatic` provin din aceeași rețetă fictivă; PDF-ul și aspectul interfeței pe telefon rămân de verificat.

Generatorul PDF istoric poate fi rulat cu `python scripts/qa/create-verification-report.py /cale/raport.pdf`, după instalarea ReportLab. El citește `VERIFICARE-1.5.3.json` și fotografiile proiectului; nu reprezintă raportul acestei versiuni.
