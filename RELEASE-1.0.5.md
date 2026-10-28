# Manager 24/7 v1.0.5

## Corecție pornire Samsung / Android 16

Jurnalul ADB confirmă că aplicația pornește în aproximativ 400 ms, rulează
bundle-ul JavaScript și rămâne în prim-plan. Nu există `FATAL EXCEPTION` sau
crash React Native. Defectul era compunerea unui prim cadru cu transparență,
care lăsa launcherul telefonului vizibil prin fereastra aplicației.

Protecția este aplicată în trei straturi:

- fereastră Android nativă opacă și fundal explicit al containerului Activity;
- rădăcină React și SafeAreaProvider opace;
- fundal explicit pentru toate ecranele Expo Router.

Versiune Android: `1.0.5`; `versionCode 33`.
