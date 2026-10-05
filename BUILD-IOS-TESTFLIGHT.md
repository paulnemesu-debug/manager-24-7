# Build iPhone și TestFlight

## Cerințe

- cont Apple Developer activ;
- acces la echipa EAS `paradimoperationss-team`;
- migrațiile Supabase 0.9 și 1.0 aplicate.

## Build

```bash
npx eas-cli login
npx eas-cli build --platform ios --profile production-ios
```

EAS solicită configurarea certificatului și a profilului de provisioning la primul build.

## Trimitere în TestFlight

```bash
npx eas-cli submit --platform ios --latest
```

Versiunea 1.0 nu afișează cumpărare externă în aplicația iPhone. Plata și abonamentele comerciale sunt amânate până la configurarea companiei și vor necesita o decizie separată privind Apple In-App Purchase.
