# Manager 24/7 0.3.0

## Modul HACCP

Versiunea 0.3.0 introduce setul complet de 19 formulare PARADIM furnizate de
beneficiar. Fiecare formular poate fi completat în aplicație, salvat pe
dispozitiv, sincronizat în cont și exportat în PDF.

Formularele incluse sunt:

- FO-H-04-01 - sănătatea și igiena personalului;
- FO-H-05-01 și FO-H-05-02 - dezinsecție și deratizare;
- FO-H-06-02, FO-H-06-03 și FO-H-06-04 - igienizări, apă și teste rapide;
- FO-H-07-01 - consum materii prime, ingrediente și ambalaje;
- FO-H-10-01 - declarație vizitatori și reguli interne;
- FO-H-11-01 - program autocontrol anual;
- FO-H-14-01 și FO-H-14-02 - preparare termică și degustare;
- FO-H-16-01 - răcire rapidă;
- FO-H-17-01 și FO-H-17-02 - sterilizare cuțite și igienizare ouă;
- FO-H-18-01 și FO-H-18-02 - temperaturi pe linie și producție nevândută;
- FO-H-20-01, FO-H-20-02 și FO-H-20-03 - recepție, spații frigorifice,
  temperatură și umiditate.

## Salvare și securitate

- datele sunt scrise întâi în AsyncStorage, astfel încât formularul rămâne
  disponibil fără internet;
- documentele nesincronizate sunt marcate și retransmise când utilizatorul
  revine în modulul HACCP;
- tabela `haccp_documents` folosește RLS și filtrează fiecare operație prin
  `auth.uid() = user_id`;
- rolul `anon` nu are drepturi de citire sau scriere;
- ștergerea contului elimină documentele prin cheia externă cu `ON DELETE
  CASCADE`.

## Export PDF

- formularele cu multe coloane folosesc A4 peisaj;
- declarația vizitatorului și registrele scurte folosesc A4 portret;
- grilele zilnice și anuale păstrează axa de 31 de zile, respectiv 12 luni;
- PDF-ul conține codul formularului, identitatea PARADIM, antetul complet,
  înregistrările, instrucțiunile și data generării;
- pe Android se generează un fișier PDF real și se deschide meniul de
  distribuire; pe web se deschide dialogul de imprimare/salvare PDF.

## Verificări

- TypeScript și ESLint fără erori;
- 119 teste automate trecute;
- catalogul verifică existența celor 19 coduri și traducerile RO/EN;
- generarea HTML pentru PDF verifică tabele, matrici, declarații și escaparea
  sigură a datelor introduse;
- bundle Web și bundle Android Hermes generate cu succes;
- Supabase verificat cu RLS activ, acces anonim blocat și patru politici
  individuale pentru utilizatorul autentificat.

## Limită cunoscută

Câmpul „semnătură” păstrează momentan numele persoanei care semnează. O
semnătură desenată pe ecran și un audit formal al aprobărilor pot fi adăugate
într-o versiune ulterioară, după stabilirea cerințelor juridice și interne.
