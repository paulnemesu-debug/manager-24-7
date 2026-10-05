# Manager 24/7 v1.0.1

## Corecții critice Android

- splash-ul nativ se închide după încărcarea fonturilor și are fallback la
  3,5 secunde; restaurarea sesiunii sau verificarea online nu mai poate ține
  aplicația blocată la pornire;
- inițializarea notificărilor este izolată de fluxul de lansare;
- verificările de sesiune și acces au timeout vizual, păstrând funcționarea
  offline și accesul beta complet;
- integrarea nativă Google Play Billing/Nitro a fost scoasă din acest build,
  conform deciziei de a amâna plățile și abonamentele;
- iconul folosește sigla rotundă oficială pe un foreground adaptiv separat,
  cu zona de siguranță Android și fundal PARADIM navy;
- splash-ul și logo-ul din interfață folosesc varianta transparentă, fără
  colțuri negre;
- schema Android a fost sincronizată la `manager247://`, iar codul versiunii
  a fost mărit la `23` pentru instalare sigură peste buildul anterior.
- testele rulează cu maximum doi workeri și timeout de 20 de secunde, pentru
  a evita blocarea falsă a buildului pe Windows la prima încărcare HACCP.

## Verificare

- TypeScript, ESLint și testele automate trebuie să treacă înainte de build;
- exporturile Metro Android și Web trebuie să se finalizeze fără erori;
- build recomandat: profil EAS `production-apk`, apoi instalare peste versiunea
  veche. Dacă launcherul păstrează imaginea în cache, telefonul poate necesita
  eliminarea scurtăturii vechi și adăugarea ei din nou.
