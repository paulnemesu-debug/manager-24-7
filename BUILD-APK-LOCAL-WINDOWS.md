# Build APK local pe Windows

Acest flux generează APK-ul fără EAS/Expo Build și nu consumă cota lunară.

## Înainte de prima rulare

1. Pornește Android Studio cel puțin o dată și finalizează `Setup Wizard`.
2. În `More Actions → SDK Manager`, verifică următoarele componente:
   - Android SDK Platform 36;
   - Android SDK Build-Tools 36.0.0;
   - Android SDK Platform-Tools;
   - Android SDK Command-line Tools (latest);
   - NDK (Side by side) 27.1.12297006.
3. Închide Android Studio, pentru a elibera memoria folosită de emulator și Gradle.
4. Instalează [Temurin JDK 17](https://adoptium.net/temurin/releases/?version=17) sau Microsoft OpenJDK 17. Scriptul detectează instalările uzuale; pentru un JDK portabil, setează `JAVA_HOME` către folderul care conține `bin/javac.exe`.

Compilarea cere JDK 17 complet, cu `bin/javac.exe`; un runtime Java care poate
rula `java -version` nu este suficient. Scriptul verifică versiunea înainte de
build. Java 25 din unele versiuni Android Studio emite un avertisment pe care
utilitarul Prefab îl tratează ca eroare. Cerința JDK 17 urmează și
[recomandarea React Native](https://reactnative.dev/docs/set-up-your-environment).

Scriptul limitează compilarea la un lucrător și rulează Kotlin în procesul
Gradle, pentru a reduce consumul de memorie. Închide emulatorul și evită alte
compilări simultane pe un calculator cu 8 GB RAM.

## Generare

Dublu-click pe `BUILD-APK-LOCAL-WINDOWS.bat`. Scriptul detectează Java și SDK-ul,
instalează componentele lipsă când `sdkmanager` este disponibil, rulează toate
verificările și generează în rădăcina proiectului:

`manager24-7-v1.6.1-local.apk`

Durata primei compilări depinde de calculator și de descărcarea componentelor
Android. Scriptul păstrează cache-ul și reutilizează componentele deja compilate.
Fișierele intermediare C++ sunt plasate în `.cxx/`, la rădăcina proiectului,
pentru a evita limita de lungime a căilor Windows. Extrage arhiva într-un
director cu o cale scurtă; păstrează acest cache între compilări.

## Semnare și instalare

Fără `android/keystore.properties`, APK-ul este semnat cu cheia locală de test.
Scriptul o generează automat la prima compilare și o păstrează pe acel calculator.
Este potrivită pentru verificarea directă pe telefon, dar nu pentru Google Play.

Dacă telefonul are deja versiunea semnată de EAS, Android poate refuza actualizarea
deoarece semnătura este diferită. În acest caz:

1. salvează orice date locale nesincronizate;
2. dezinstalează versiunea existentă `Manager 24/7`;
3. instalează `manager24-7-v1.6.1-local.apk`.

Scriptul nu dezinstalează niciodată automat aplicația.

## Folosirea aceleiași chei ca EAS (opțional)

Pentru instalare peste APK-ul EAS, descarcă în siguranță cheia Android existentă
din contul Expo și creează local `android/keystore.properties`, pornind de la
`android/keystore.properties.example`. Nu trimite și nu arhiva fișierul `.jks`
sau parolele lui.

