# Manager 24/7 v1.0.8

## Corecție după autentificare

- modulele native de notificări sunt încărcate numai după o acțiune explicită
  a utilizatorului, nu automat în primul cadru de după codul OTP;
- starea alertelor săptămânale este citită local, fără inițializarea modulului
  `expo-notifications` la deschiderea Home;
- Home pornește cu suprafețe React Native simple, fără gradient, SVG sau animație
  native în cadrul critic de după autentificare;
- schimbarea dintre login și aplicație este opacă și fără tranziție `fade` pe
  Samsung/Android 16;
- iconița Android este varianta mică, completă, cu zonă adaptivă de siguranță pe
  fundal bleumarin.

Versiune Android: `1.0.8`; `versionCode 36`.
