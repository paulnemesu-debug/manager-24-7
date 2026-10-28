# Manager 24/7 v1.0.2

## Corecție ecran de autentificare Android

- formularul de autentificare este acum într-un singur container vertical,
  astfel încât logo-ul, selectorul RO/EN și cardul nu se mai pot așeza pe un
  rând și împinge în afara ecranului;
- cardul de autentificare folosește un `View` React Native stabil, fără stratul
  nativ de gradient care putea ascunde cardul și copiii lui în buildul release;
- ecranul de autentificare păstrează fundalul deschis indiferent de tema
  telefonului și rămâne derulabil pe dispozitivele scurte;
- versiunea este afișată sub formular (`Manager 24/7 · v1.0.2`) pentru a putea
  confirma imediat ce APK este instalat;
- React Compiler experimental este dezactivat pentru buildurile de producție;
- buildurile Windows cer curățarea cache-ului EAS, iar versiunea Android este
  `1.0.2`; buildul local folosește `versionCode 28`, peste contoarele EAS 26–27.
- `BUILD-APK-LOCAL-WINDOWS.bat` generează APK-ul direct cu Android Studio/SDK,
  fără să consume cota lunară EAS; verifică automat Platform 36, Build-Tools,
  Command-line Tools și NDK 27.1.12297006.

## Verificare pe telefon

După instalare, primul ecran trebuie să arate în ordine: logo, steagurile RO/EN,
formularul de email și textul versiunii. Dacă textul de jos nu este `v1.0.2`,
telefonul rulează încă APK-ul anterior.
