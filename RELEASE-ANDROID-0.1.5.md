# Release Android 0.1.5

## Corecții livrate

- Primul ecran folosește un singur panou luminos și coerent, fără blocul bleumarin
  care fragmenta pagina. Pe telefoane mici se comprimă automat și rămâne scrollabil
  doar ca rezervă pentru tastatură sau setări de accesibilitate.
- Sigla PARADIM este redată din fișierul transparent de rezoluție mare, cu lățime
  adaptivă în ecranul de autentificare. Splash-ul Android folosește aceeași siglă,
  fără text secundar mic sau margini vizuale inutile.
- Dashboardul de telefon are antet, hero, indicatori și priorități mai compacte;
  spațiul artificial de 88 px de sub conținut a fost eliminat.
- Editorul are cinci pași. Secțiunea globală de scăzământ a fost eliminată;
  scăzământul se introduce și se calculează numai pe fiecare ingredient.
- Rețetele vechi cu o pierdere globală se deschid fără dublarea costului. La salvare,
  câmpurile vechi sunt neutralizate pentru compatibilitate cu schema existentă.
- Fișa tehnică și cardurile rețetelor nu mai afișează randamentul global redundant.

## APK verificat și configurație corectată

APK-ul 0.1.4 primit pentru verificare are 123 MB și conține `arm64-v8a`,
`armeabi-v7a`, `x86` și `x86_64`. Fișierul `assets/app.config` din acel APK arată că
EAS a primit numai `compileSdkVersion` și `targetSdkVersion`; setările native pentru
arm64 și R8 nu au intrat în arhiva de build, deoarece folderul `android` este generat.

În 0.1.5, `buildArchs`, minificarea R8 și `shrinkResources` sunt declarate direct
în pluginul `expo-build-properties` din `app.json`. Astfel sunt aplicate și atunci
când EAS regenerează proiectul Android.

## Verificări

- TypeScript: fără erori.
- Vitest: 87/87 teste trecute.
- Expo prebuild: resurse Android regenerate; splash și setările release verificate.
- Configurație: `arm64-v8a`, R8, resource shrinking, `allowBackup=false` și eliminarea
  `SYSTEM_ALERT_WINDOW` din manifestul release.

## Build semnat

Pe Windows, rulează `BUILD-APK-WINDOWS.bat`. Buildul folosește profilul
`production-apk`, proiectul Expo `paradim` și credentialele Android păstrate în EAS.
Instalează noul APK peste cel existent pentru a confirma aceeași semnătură și
păstrarea datelor aplicației.
