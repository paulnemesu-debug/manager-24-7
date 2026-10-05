# Manager 24/7 — analiză concurență și roadmap

Analiză actualizată la 12 septembrie 2026, pe baza paginilor oficiale ale meez,
Apicbase, MarketMan și MarginEdge.

## Ce oferă deja concurența

| Produs | Puncte puternice observate | Implicație pentru PARADIM |
| --- | --- | --- |
| meez | rețete ca sursă unică, costing live, import AI din documente și notițe scrise de mână, training foto/video, menu engineering, alergeni, mai multe locații | un simplu calculator nu este suficient; viteza introducerii și utilizarea zilnică în bucătărie devin decisive |
| Apicbase | rețete, stoc, achiziții, COGS, POS, facturi, prognoză, conformitate, multi-site și interogare AI | avantajul enterprise vine din integrarea întregului flux, nu doar din calcul |
| MarketMan | inventar mobil, comenzi, alerte de preț, integrări furnizori/POS, recipe costing în timp real și AI ordering | utilizatorii plătesc pentru automatizarea prețurilor și a aprovizionării |
| MarginEdge | procesare automată a facturilor, costuri actualizate, inventar, consum real, daily P&L și menu engineering pe baza vânzărilor | diferența majoră este „cost teoretic versus cost real”, alimentată de facturi, stoc și POS |

Surse: [meez](https://www.getmeez.com/), [Apicbase](https://get.apicbase.com/),
[MarketMan](https://www.marketman.com/), [MarginEdge](https://www.marginedge.com/).

## Poziționarea recomandată

PARADIM nu trebuie să copieze imediat un ERP internațional. Poziția cu șanse mai
bune este: **cea mai simplă aplicație RO/EN pentru profitabilitatea preparatelor din
HoReCa România, cu prețuri locale și recomandări de consultant transformate în
acțiuni în maximum 48 de ore**.

Avantajul defensabil este combinația dintre localizare și serviciu:

- TVA și documente adaptate României, cu istoric al cotei și dată de verificare;
- cataloage și facturi de la furnizori locali, pornind cu METRO, fără introducere manuală;
- 14 alergeni UE, fișă tehnică RO/EN și sub-rețete cu recalculare în cascadă;
- aplicație foarte simplă pentru patron sau chef, nu implementare enterprise de câteva săptămâni;
- diagnostic PARADIM și plan de acțiune 48h pe baza datelor reale din cont.

## Roadmap prioritizat

### P0 — încredere și activare

1. Salvare, OTP, export și actualizare APK fără erori, măsurate prin evenimente anonime.
2. Onboarding de 3 minute: prima rețetă demonstrativă, apoi importul propriilor ingrediente.
3. Istoric preț ingredient, dată/sursă și alertă atunci când o modificare împinge o rețetă peste țintă.
4. Mod „ce se întâmplă dacă”: preț, gramaj sau furnizor alternativ, fără modificarea rețetei publicate.

### P1 — diferențiator local comercial

1. Import factură PDF/foto cu ecran obligatoriu de confirmare; învață potrivirea produs-furnizor.
2. Importuri standard pentru METRO, Selgros și principalii distribuitori ai clienților.
3. Menu engineering simplu: popularitate × marjă, pe categorii, cu lista primelor 3 acțiuni.
4. Raport săptămânal pe email/WhatsApp: scumpiri, rețete peste țintă și marjă recuperabilă.
5. Roluri clare: owner, manager, chef, viewer; jurnal al schimbărilor și versiuni de rețetă.

### P2 — trecerea de la calculator la sistem operațional

1. Integrare POS sau import vânzări pentru mixul real de produse.
2. Inventar rapid cu scanare cod de bare și numărare vocală.
3. Cost teoretic versus cost real și explicația abaterilor: preț, porționare, pierdere, furt sau rețetă nerespectată.
4. Multi-locație, prețuri pe locație, rețete centrale și aprobarea modificărilor.
5. Comenzi sugerate pe baza vânzărilor, stocului și necesarului de producție.

### P3 — AI care economisește timp, nu doar impresionează

1. Scanare rețetă scrisă de mână sau PDF, cu maparea unităților și validare umană.
2. Fotografiere factură și actualizare de preț după confirmarea diferențelor.
3. Asistent care răspunde din datele restaurantului: „ce preparate au trecut de 35%?”
4. Sugestii explicabile de înlocuire/gramaj, cu economie estimată și impact asupra alergenilor.

## Indicatori de produs

- timpul până la prima rețetă salvată: sub 5 minute;
- procentul utilizatorilor care salvează 5 rețete în 7 zile;
- proporția ingredientelor cu preț actualizat în ultimele 30 zile;
- marja recuperabilă identificată și acceptată de client;
- numărul de recomandări care duc la o modificare de preț, gramaj sau furnizor;
- retenția la 30/90 zile pe locație, nu doar numărul de conturi create.

## Ce nu aș construi încă

- OCR complet automat fără confirmare — o eroare de unitate sau TVA distruge încrederea;
- stoc și contabilitate complete înainte ca importul de prețuri și menu engineering să fie excelente;
- recomandări AI fără explicație numerică și sursa prețului;
- zeci de grafice: pe telefon trebuie afișată acțiunea următoare, nu un dashboard enterprise micșorat.
