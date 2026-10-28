# Release Android 0.1.4

## Corecții livrate

- Salvarea unei rețete folosește RPC-ul tranzacțional `foodcost_save_recipe`.
  Rețeta și ingredientele sunt scrise împreună; un eșec nu mai poate lăsa o
  rețetă incompletă.
- Citirea rețetelor folosește explicit relația părinte a ingredientelor, astfel
  încât PostgREST nu mai răspunde cu `300 Multiple Choices` când există și o
  relație spre un semipreparat.
- Schema live acceptă atât câmpurile canonice (`output_quantity`,
  `subrecipe_id`), cât și APK-ul 0.1.3 deja instalat. Compatibilitatea este
  sincronizată pe server și poate fi retrasă după migrarea tuturor instalărilor.
- Adaptorul server `save_recipe(recipe, ingredients)` traduce cererea APK-ului
  0.1.3 spre tranzacția nouă și ignoră identitatea sau totalurile trimise de
  client. Salvarea a fost probată cu payloadul exact al versiunii instalate.
- Editorul mobil este împărțit în șase pași compacți. O singură secțiune este
  deschisă odată, iar Food Cost, prețul recomandat și butonul de salvare rămân
  vizibile.
- Tabloul de bord, autentificarea, câmpurile, cardurile și bara de navigare au
  densitate adaptivă pentru telefoane.
- Selectorul RO/EN folosește steagurile României și Regatului Unit.

## Verificări înainte de build

- TypeScript: fără erori.
- Vitest: 86/86 teste trecute, inclusiv calculele de cost și contractul de salvare.
- Expo Web și bundle Android: exportate cu succes.
- Supabase: RPC-ul de salvare, recalcularea, coloanele canonice și relația
  PostgREST au fost verificate pe proiectul live.
- Android: `arm64-v8a`, Hermes, R8 și `shrinkResources` sunt active;
  `allowBackup=false`; `SYSTEM_ALERT_WINDOW` este absent din manifestul release.

## Instalare de test

Instalează APK-ul peste versiunea curentă, fără dezinstalare. Android confirmă
astfel că package name-ul și semnătura EAS sunt aceleași. După actualizare:

1. intră cu email și codul OTP;
2. creează o rețetă cu minimum un ingredient și salveaz-o;
3. redeschide rețeta din listă și verifică exportul PDF/Excel;
4. editează rețeta și confirmă că totalurile se recalculează.

Package: `ro.paradim.professionalfoodcost`  
Versiune: `0.1.4` (`versionCode` local 12; EAS poate auto-incrementa codul).
