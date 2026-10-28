# MANAGER 24/7 by PARADIM — 1.5.2

Android versionCode 56 · iOS build 27 · 4 octombrie 2026

## Corecții urgente

- Pregătirea automată HACCP creează schițe cu date și locație. Nu inventează temperaturi, rezultate conforme, ore de citire sau semnături. Operatorul confirmă verificările și măsurătorile reale.
- Înregistrările vechi generate automat rămân neconfirmate. PDF-urile le marchează drept schițe și elimină măsurătorile și semnăturile neconfirmate, inclusiv din formularele de recepție.
- Rutina, badge-ul și pachetul pentru control folosesc locația activă. Echipamentele au identificatori stabili. „Arhivă HACCP de confirmat” permite atribuirea explicită a documentelor vechi unei locații; atribuirea nu validează măsurătorile.
- Salvările pentru stoc, comenzi, risipă, HACCP, HR și spațiul de rețete sunt serializate. Operațiile locale nesincronizate sunt reluate; confirmările serverului păstrează lucrul adăugat în timpul unei cereri.
- Ștergerile HR sunt păstrate local până la confirmare și au marcaje permanente pe server. Un dispozitiv cu un cache vechi nu poate recrea un angajat sau pontaj șters. Citirea HR este paginată și nu mai are plafonul de 1.500 de pontaje.
- Scanarea AI verifică utilizatorul real, accesul profesional și licența proprietarului pentru membrii echipei. Viewerii nu pot scana. Cota implicită este de 20 de scanări pe zi pentru cont, cu minimum 10 secunde între cereri; rezervarea este atomică și accesibilă numai serviciului serverului.
- Salvarea unei rețete verifică versiunea citită înainte de a modifica antetul sau ingredientele. Conflictele păstrează schița, permit compararea cu cloud-ul și cer confirmarea operatorului înainte de înlocuire. Clienții vechi rămân compatibili; verificarea versiunii este folosită de clienții noi.
- Costurile mici ale ingredientelor sunt însumate înainte de rotunjirea totalului, atât în aplicație, cât și pe server. Testul cu 50 de ingrediente a câte 0,003 RON dă 0,15 RON, nu zero. Înregistrările serverului sunt recalculate la următoarea salvare/recalculare; nu s-a executat un backfill general.

## Valoare pentru manager

- Cardul „Stare food cost” deschide primele trei acțiuni, ordonate după oportunitatea de reducere a costului și porțiile efectiv înregistrate în luna aleasă. Sunt afișate perioada și acoperirea datelor. Volumul necunoscut rămâne necunoscut; o cantitate zero introdusă explicit este tratată separat. Scorul descrie costul rețetelor, iar profitul net rămâne în P&L.
- Schițele se păstrează automat pe dispozitiv și pot fi reluate din „Rețetele mele”. Simplul acces la o rețetă finalizată nu creează o schiță. Salvarea finală elimină schița recuperată; erorile și conflictele o păstrează.
- Exportul contului include rețetele/catalogul vizibile, modulele locale, schițele, coada de sincronizare, HR, HACCP, P&L, inventarele, comenzile, risipa și istoricul din 33 de tabele ale propriului cont. Toate paginile sunt citite, inclusiv locațiile inactive. Raportul din fișier arată modulele disponibile și erorile. Autentificarea și secretele sunt excluse; fotografiile sunt referințe, nu fișiere incluse.
- Erorile React și JavaScript pot fi raportate central în `product_events` în Supabase. Se transmit categoria erorii, funcțiile din stack, versiunea și platforma; mesajele, URL-urile și datele introduse de utilizator nu sunt trimise. Erorile în așteptare sunt păstrate separat pentru fiecare cont. Aceasta nu este raportare completă a crash-urilor native și nu acoperă pornirea înainte de autentificare.

Organizarea cerută rămâne: Health/alerte, P&L, HR la final; foldere care deschid pagini separate; bibliotecă și bulk în Rețete; finalizate în Rețetele mele; Exporturi și alergeni separat; planificare prin căutare și adăugare cu listă de cumpărături; eFactura numai în Producție; limbile prin steaguri lângă siglă.

## Verificări efectuate

- 281 de teste automate în 49 de fișiere, TypeScript și lint fără avertismente de cod.
- 4 verificări cu rendererul React pentru foldere, stare păstrată, butonul Android Înapoi și revenirea în Rețetele mele.
- 5 verificări cu editorul și lista reale: salvare/recuperare schiță, reluare din folder, lipsa schițelor inutile la simpla deschidere, conflict păstrat și salvare după comparare.
- Probele HTTP cu cheia publică, fără utilizator sau folosită ca Bearer, primesc 401 înainte de apelarea furnizorului AI.
- Verificări SQL în tranzacții anulate: ștergeri HR persistente, blocarea recreării, cote zilnice și interval între cereri, conflict de rețetă fără modificarea ingredientelor și precizia costurilor.
- APK: integritate ZIP, bytecode Hermes proaspăt, semnătură identică versiunii anterioare și alinierea bibliotecilor native la 16 KB. Detaliile sunt în `VERIFICARE-1.5.2.json`.

## Limite înainte de distribuția către clienți

APK-ul livrat este un APK de test: JavaScript recompilat, componenta nativă păstrată din APK-ul anterior. Inițializarea Gradle a fost blocată la descărcarea distribuției în acest mediu. Nu a fost efectuat un build Gradle/EAS complet și nu s-a testat instalarea sau autentificarea pe telefon fizic. Fișierul `android/app/debug.keystore` este cheia publică standard de test React Native, cu același certificat ca APK-ul anterior; nu este o cheie de producție.

Înainte de distribuție:

1. Execută buildul complet conform `BUILD-APK-LOCAL-WINDOWS.md` sau profilului EAS potrivit.
2. Instalează peste versiunea precedentă pe cel puțin două telefoane; verifică pornirea, autentificarea, fotografiile, exporturile și salvarea fără conexiune urmată de reconectare.
3. Configurează secretul server `ANTHROPIC_API_KEY` și un `ANTHROPIC_MODEL` explicit. Cheia furnizorului nu este configurată în prezent; scanarea funcțională cu facturi reale nu a fost testată. Nu introduce cheia în aplicație sau în arhiva sursei.
4. Testează conflictul de rețetă și ștergerea HR între două dispozitive. Confirmă măsurătorile HACCP reale înainte de folosirea documentelor pentru control.

Observațiile Supabase existente, separate de aceste schimbări, rămân de revizuit: funcția OTP securizată este apelabilă de utilizatorii autentificați ([detalii](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)); protecția parolelor compromise este dezactivată ([detalii](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)). Noua tabelă pentru cote nu mai apare în avertizarea privind lipsa politicilor RLS.

