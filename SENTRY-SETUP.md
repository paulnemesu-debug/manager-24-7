# Raportarea crashurilor — 1.5.5

SDK-ul `@sentry/react-native` 7.11.0 și integrarea Expo/Metro sunt incluse. SDK-ul
pornește la încărcarea modulului rădăcină, înainte de fonturi, autentificare și
primul ecran. Raportarea este dezactivată când lipsește DSN-ul; nu există un proiect
Sentry configurat și primirea evenimentelor nu a fost demonstrată în această sesiune.

## Configurare

1. Folosește un proiect React Native din contul Sentry și completează
   `EXPO_PUBLIC_SENTRY_DSN` în configurația publică de build. DSN-ul poate fi public.
2. Configurează `SENTRY_ORG`, `SENTRY_PROJECT` și tokenul privat `SENTRY_AUTH_TOKEN`
   numai în mediul de build, cu acces pentru încărcarea source maps. Nu folosi un
   nume `EXPO_PUBLIC_` pentru token și nu îl include în arhiva sursei.
3. Elimină `SENTRY_DISABLE_AUTO_UPLOAD=true` pentru buildul configurat. Scriptul
   Windows îl setează automat numai când tokenul de build lipsește.
4. Generează un APK nativ complet din proiectul Android inclus. Adăugarea SDK-ului
   nativ cere recompilare Gradle; înlocuirea bundle-ului într-un APK vechi nu este
   suficientă. Pentru Windows: `BUILD-APK-LOCAL-WINDOWS.md`.

Documentație oficială: https://docs.expo.dev/guides/using-sentry/ și
https://docs.sentry.io/platforms/react-native/guides/expo/ .

## Verificare înainte de lansare

Pe un build de test separat, configurat cu DSN, provoacă o excepție JavaScript
controlată și un crash nativ cu `Sentry.nativeCrash()`. SDK-ul exportă această
metodă; nu există un buton de crash în aplicația destinată clienților.
Redeschide aplicația pentru trimiterea evenimentului nativ și confirmă în Sentry:
release `ro.paradim.professionalfoodcost@1.5.5+59`, distribuție Android `59`, stack
JavaScript lizibil prin source maps și evenimentul nativ. Eticheta de release
include buildul, la fel ca taskul de upload Gradle. Elimină declanșatorul
de test înaintea buildului final și verifică din nou pornirea, loginul și camera.

SDK-ul nativ nu rulează în Expo Go. Crashurile produse înainte de inițializarea
JavaScript trebuie testate separat pe telefon; această integrare nu demonstrează
capturarea lor. Verificarea trebuie repetată pe cel puțin două telefoane, inclusiv
un Samsung cu versiunea Android folosită anterior.

## Conținutul evenimentelor

PII implicit, screenshot, view hierarchy, breadcrumbs, loguri, tracing și replay
sunt dezactivate. Filtrul JavaScript păstrează tipul excepției, cadrele, versiunea
și Debug IDs, eliminând mesajele libere și datele despre utilizator, cerere sau
rețetă. Testele filtrului nu constituie o verificare a unui payload nativ primit.
Jurnalul existent `product_events` rămâne util pentru evenimentele operaționale.
