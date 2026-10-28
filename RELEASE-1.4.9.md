# MANAGER 24/7 by PARADIM v1.4.9

Finalizarea și verificarea modificărilor pentru locații și pagina principală.

- Acasă păstrează HR, Alerte, P&L și Profit Health, cu rubrici diferențiate prin culori.
- „Creează rețetă” și instrumentele pentru rețete sunt în Rețete; instrumentele operaționale sunt în Producție.
- La prima autentificare se configurează locația contului. Conturile obișnuite au o singură locație editabilă; adminul poate crea, edita și șterge mai multe.
- Regula de acces este aplicată și în baza de date. Multi-locație pentru clienți rămâne un abonament suplimentar viitor.
- Refuzurile de salvare au mesaje explicite și nu produc locații fictive în memoria locală.
- Verificarea locației are termen de răspuns și opțiune de reîncercare. O eroare de conexiune la prima configurare nu este tratată ca absență confirmată a locației.
- Dacă serverul a salvat locația, o eroare a memoriei telefonului nu raportează fals că salvarea a eșuat.

Android: `versionName 1.4.9`, `versionCode 53`. iOS: `buildNumber 24` (configurație; această livrare include doar APK Android).

Verificări: teste automate, TypeScript, drepturi de acces pe server, semnătură APK și integritatea pachetului. Instalarea și fluxul complet pe un telefon fizic trebuie confirmate separat.
