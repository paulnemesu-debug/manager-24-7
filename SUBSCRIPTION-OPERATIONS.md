# Operare abonamente — variantă temporară, fără webhook

Până la alegerea și conectarea procesatorului de plăți de pe site, activarea
manuală se face numai din **Supabase SQL Editor**. Funcțiile sunt în schema
`private`, nu sunt expuse aplicației și nu pot fi apelate de un utilizator
autentificat.

## Activează Pro pentru 30 de zile

Contul trebuie să existe deja, adică utilizatorul trebuie să fi finalizat cel
puțin o autentificare OTP.

```sql
select private.activate_manual_subscription(
  'client@example.com',
  30,
  'Plată confirmată — referință internă'
);
```

Al doilea parametru este numărul de zile, între 1 și 3660. Activarea este
salvată ca `platform = 'manual'`, `product_id = 'manual_pro'`, cu dată exactă de
expirare. Orice acțiune este înregistrată în
`private.subscription_access_audit`.

## Dezactivează o activare manuală

```sql
select private.deactivate_manual_subscription(
  'client@example.com',
  'Rambursare / anulare'
);
```

Funcția refuză să modifice un abonament Google Play; acesta se gestionează prin
Play Console și prin verificarea server-side deja inclusă.

## Model Free / Pro decis

- **Free:** calculatorul public de pe site, separat de aplicația autentificată.
- **Professional:** rețete, ingrediente, sincronizare, subrețete și export în
  aplicație, doar pentru admin sau abonament valid.
- **Admin:** acces permanent acordat exclusiv pe server.

Politicile RLS verifică dreptul pentru citire, creare, modificare și ștergere.
Modificarea APK-ului sau a unei variabile locale nu poate acorda acces la date.

## Următoarea etapă

Webhook-ul va înlocui activarea manuală după alegerea procesatorului de plăți.
El trebuie să verifice semnătura evenimentului, să fie idempotent și să scrie
abonamentul folosind cheia server-side; cheia nu va ajunge niciodată în app.

