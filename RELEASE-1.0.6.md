# Manager 24/7 v1.0.6

## Păstrarea corecției native în EAS

Buildul 1.0.5 a demonstrat că setarea veche `.easignore` excludea întregul
director `android/`. Expo regenera proiectul nativ și elimina astfel protecția
opacă implementată în `MainActivity` și `AppTheme`.

Versiunea 1.0.6 include proiectul Android în arhiva EAS. După build se verifică
direct APK-ul compilat pentru existența apelurilor native care colorează
fereastra și containerul aplicației înainte de afișarea interfeței React.

Versiune Android: `1.0.6`; `versionCode 34`.
