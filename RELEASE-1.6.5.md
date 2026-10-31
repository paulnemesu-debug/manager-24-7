# MANAGER 24/7 v1.6.5 — candidat Android

Identitate Android pentru APK-ul distribuit direct:

- package: `ro.paradim.professionalfoodcost`;
- version name: `1.6.5`;
- version code: `66`;
- produs Google Play: `professional_foodcost_pro`;
- certificat SHA-256 pentru cheia existentă EAS `production-apk`: `B7125F9E38BD66BA1226B0FF063D15569320006F3B193A1DA297D485DEEEC3ED`.

Pe 31 octombrie 2026, metadatele autentificate EAS pentru proiectul
`22034007-9c26-4d6f-9f33-4908b8a05acb`, aplicația de mai sus și configurația
implicită `Build Credentials LGkkPJqexu` au confirmat certificatul B712…,
identic cu APK-ul build 65. Cheia era configurată de două luni și nu a fost
înlocuită. Valoarea DD64… din planul inițial nu are în repo o verificare
independentă legată de un binar anterior; nu mai este folosită ca etalon pentru
APK-ul direct. Compatibilitatea cu o instalare veche semnată cu altă cheie și
certificatul Google Play App Signing necesită verificare separată.

## Modificări incluse

- starea nutrițională este „completă” numai când toate cele nouă valori declarate sunt cunoscute;
- staging și producție sunt separate fail-closed, fără coordonate Supabase urmărite în Git;
- izolarea RLS a fost verificată cu două conturi;
- cumpărarea și restaurarea abonamentului folosesc Google Play Billing 9.1;
- accesul este actualizat numai după verificarea server-side a achiziției;
- tokenurile de cumpărare nu sunt afișate, logate sau confirmate local;
- corecția de izolare a abonamentului la schimbarea contului respinge răspunsurile și cache-ul întârziat ale sesiunii precedente;
- pachetul local de test este numit explicit `manager24-7-v1.6.5-local-test.apk`.

## Gate de semnare

Rulează pentru APK-ul obținut cu credentialele remote de release:

```text
npm run qa:android-release -- <cale-apk>
```

Verificarea eșuează dacă package-ul, versiunea, codul, certificatul sau ABI-ul
ARM64 necesar telefonului diferă. Nu dezactivează verificarea semnăturii.
Un APK semnat local cu cheia de test este util pentru emulator/dispozitiv, dar
nu este publicabil și nu trebuie încărcat pe site ca versiune oficială.

## Stare de lansare

Acest fișier descrie candidatul și gate-urile, nu declară automat GO. Lansarea
rămâne NO-GO până când sunt documentate: migrațiile și funcțiile Edge pe staging,
testele tuturor modulelor pe Android 15, un flux Google Play real pe track intern,
buildul final și semnătura certificatului de mai sus.
