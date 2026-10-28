# MANAGER 24/7 v1.6.5 — candidat Android

Identitate Android păstrată pentru actualizarea utilizatorilor existenți:

- package: `ro.paradim.professionalfoodcost`;
- version name: `1.6.5`;
- version code: `64`;
- produs Google Play: `professional_foodcost_pro`;
- certificat SHA-256 așteptat pentru artefactul publicabil: `DD64E216CA5F7D1E0E05349F8A0D2DD8E54A5F5C22688E620EC287D496FBEF1E`.

## Modificări incluse

- starea nutrițională este „completă” numai când toate cele nouă valori declarate sunt cunoscute;
- staging și producție sunt separate fail-closed, fără coordonate Supabase urmărite în Git;
- izolarea RLS a fost verificată cu două conturi;
- cumpărarea și restaurarea abonamentului folosesc Google Play Billing 9.1;
- accesul este actualizat numai după verificarea server-side a achiziției;
- tokenurile de cumpărare nu sunt afișate, logate sau confirmate local;
- pachetul local de test este numit explicit `manager24-7-v1.6.5-local-test.apk`.

## Gate de semnare

Rulează pentru APK-ul obținut cu credentialele remote de release:

```text
npm run qa:android-release -- <cale-apk>
```

Verificarea eșuează dacă package-ul, versiunea, codul sau certificatul diferă.
Un APK semnat local cu cheia de test este util pentru emulator/dispozitiv, dar
nu este publicabil și nu trebuie încărcat pe site ca versiune oficială.

## Stare de lansare

Acest fișier descrie candidatul și gate-urile, nu declară automat GO. Lansarea
rămâne NO-GO până când sunt documentate: migrațiile și funcțiile Edge pe staging,
testele tuturor modulelor pe Android 15, un flux Google Play real pe track intern,
buildul final și semnătura certificatului de mai sus.
