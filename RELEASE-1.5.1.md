# MANAGER 24/7 · 1.5.1 (Android build 55)

- Rețete: crearea unei rețete, Biblioteca rețete și Rețeta bulk sunt grupate în pagina Rețete, alături de instrumentele pentru meniu și simulare.
- Rețetele mele: preparatele salvate au marcaj „Salvată”, căutare, filtre și paginare. Loturile bulk salvate au propria selecție și pot fi redeschise pentru consultare sau editare.
- După salvarea unei rețete sau a unui lot bulk, aplicația deschide Rețetele mele.
- Exporturile PDF, Excel și meniul de alergeni au o pagină separată, Exporturi și alergeni.
- Un folder deschide numai conținutul său, cu buton Înapoi. Folderele nu se mai extind sub listă. Același comportament se aplică în Producție și Cont.
- Fiecare folder are un simbol relevant și o culoare proprie: preparate, rețete salvate, ingrediente, documente, calendar, cumpărături, facturi, stoc, etichete, profil și siguranță.
- Câmpurile și selecțiile vizitate se păstrează la revenirea între foldere. Butonul Înapoi Android revine întâi la lista folderelor.
- Se păstrează ordinea Health → P&L → HR, e-Factura doar în Producție și selectarea limbii prin steagurile din antet.

Verificări: 246 de teste în 42 de fișiere, TypeScript și lint fără erori sau avertismente, plus 4 verificări ale navigării prin React test renderer cu adaptoare native: pagină izolată și simboluri, păstrarea câmpurilor, revenirea cu Înapoi și redirecționarea după salvare.

APK: bundle Android Hermes recompilat, versiune 1.5.1 / cod 55, integritate ZIP, semnătură v2/v3 identică versiunii 1.5.0 și biblioteci native aliniate la 16 KB. Codul nativ și resursele provin din APK-ul verificat 1.5.0; nu este o compilare Gradle integrală. Instalarea și verificarea vizuală pe un telefon fizic nu au fost efectuate.
