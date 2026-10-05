# Release Android 0.1.3

## Cele două artefacte

| Canal | Profil EAS | Artefact | Plată afișată |
|---|---|---|---|
| Descărcare directă | `production-apk` | APK arm64 | site-ul PARADIM |
| Google Play | `production` | AAB arm64 | numai Google Play Billing |

Ambele release-uri folosesc Hermes, R8, `shrinkResources` și aceeași identitate
Android `ro.paradim.professionalfoodcost`.

## Semnarea confirmată în EAS

Proiectul are configurate credențialele Android implicite
`Build Credentials LGkkPJqexu`, cu keystore JKS încărcat în EAS la
29 august 2026. Versiunea 0.1.2 (10) a fost construită cu aceste credențiale.
Versiunea 0.1.3 păstrează același package name și trebuie instalată peste
versiunea curentă, fără dezinstalare, pentru verificarea finală a continuității
semnăturii.

Contul de serviciu Google pentru publicarea automată prin EAS Submit nu este
încă configurat. Acest lucru nu blochează buildul și nici încărcarea manuală a
fișierului AAB în Google Play Console.

## Build APK direct

Rulează `BUILD-APK-WINDOWS.bat`. La final descarcă APK-ul din Build details și
instalează-l **fără să dezinstalezi** versiunea existentă. Dacă Android permite
actualizarea peste aplicația curentă, pachetul și semnătura EAS coincid. Dacă
apare un mesaj despre semnătură incompatibilă, oprește publicarea și verifică
keystore-ul în EAS Credentials.

APK-ul este arm64-only, deci funcționează pe telefoane Android moderne pe
64 de biți; nu este destinat emulatorului x86 sau dispozitivelor vechi 32-bit.

## Build AAB pentru Play

Rulează `BUILD-PLAY-AAB-WINDOWS.bat`, descarcă `.aab` și încarcă-l mai întâi în
**Google Play Console → Internal testing**. AAB-ul nu se instalează direct prin
tap; Play generează și livrează APK-urile optimizate pentru dispozitiv.

Înainte de testarea plății, creează și activează abonamentul
`professional_foodcost_pro` în Play Console și configurează contul de serviciu
folosit de funcția `verify-google-play-purchase`.

## Permisiuni și backup

- `SYSTEM_ALERT_WINDOW` a fost eliminată din manifestul release. Ea rămâne doar
  în manifestele `debug` folosite de instrumentele de dezvoltare Expo/React
  Native și nu intră în APK/AAB-ul de producție.
- `android:allowBackup="false"` este setat atât în configurația Expo, cât și în
  manifest.
- Sunt excluse explicit din cloud backup și device transfer: fișierele interne,
  bazele de date, SharedPreferences/AsyncStorage, SecureStore și fișierele
  externe ale aplicației. Rețetele rămân în Supabase și revin după autentificare.

## Politica Google Play

Manager 24/7 vinde acces la funcții digitale consumate în aplicație.
Buildul Play nu afișează linkul de cumpărare externă și folosește Google Play
Billing. Programele de plată alternativă sau link extern din SEE necesită
înscriere, integrarea API-urilor Google, raportarea tranzacțiilor și taxele
aplicabile; simplul buton către site nu este suficient.

Surse oficiale:

- https://support.google.com/googleplay/android-developer/answer/10281818
- https://support.google.com/googleplay/android-developer/answer/12348241
- https://developer.android.com/google/play/billing
