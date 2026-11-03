# Equipment and production — v1.6.7 / Android code 68

## Implemented

- Equipment and maintenance route, reachable from Production and HACCP; shared HACCP equipment identities, additional assets, availability, metadata, scheduled cleaning/upkeep/preventive/repair work, recurrence and estimated/actual cost breakdowns.
- Dated production sheets from immutable recipe snapshots, planned and actual consumption, lots/suppliers, measured yields and process readings, equipment selection, validation, correction copies and explicit consumption voucher creation.
- Excel/CSV lists and individual sheets, previewed imports and PDF export. Production has an editable Excel template available before the first sheet. Imports do not confer confirmation or validated signatures.
- Owner-scoped offline persistence and cloud synchronization; account export/deletion integration. Completed maintenance and validated production history cannot be overwritten. POLIDOM remains pending API documentation.
- Version 1.6.7 / code 68; package and production signing identity unchanged.

## Verification completed on 2026-11-03

`npm run qa:release` exited 0 on the final implementation, including the new production template:

- TypeScript and ESLint passed.
- Vitest: **1,030 tests across 133 files passed**.
- Existing rendered application flow checks passed.
- Database suite passed, including real PostgreSQL-compatible SQL tests for owner isolation, professional access, grants, stale revisions, retries, immutable history and atomic production voucher issuance.

`npx expo export --platform android --output-dir dist-android-v167` exited 0. Final Hermes bundle: `entry-8aac8193183c7d475e8eed5bcf603e08.hbc`. This is an Android JavaScript compilation check, not a native APK build.

Migration `20261103063909_equipment_production_modules.sql` was applied to the configured Supabase project. Live metadata checks confirmed RLS, authenticated grants, no anonymous table reads, no authenticated deletes and security-invoker RPCs. The issuance ledger prevents overwriting remotely edited vouchers and prevents recreation after deletion.

Review findings fixed and covered by regressions: XLSX empty cells and native Excel dates; large compressed worksheets without Web Workers; raw decimal editing; draft reopening and conflict refresh; cross-account queued synchronization; conflict handling against finalized remote records; duplicate voucher creation and deletion retries.

## Remaining verification and limitations

- No native APK was produced. EAS CLI 22.6.0 `whoami` exited 1 with `Not logged in`; no cloud build ID was issued. The local environment has no configured production signing credentials/Android SDK fallback. No keystore was created or rotated.
- No physical Android installation, native picker/share/print smoke test or live OTP smoke test was performed. PDF HTML generation is tested; final native print layout remains a device check.
- Some low-level validation/import error text remains English. Primary screens and PDF labels support Romanian and English.
- Equipment manual/photo fields store references; they do not upload attachments. POLIDOM sends no requests until its API is specified.

## Resume signed APK build

Restore approved Expo/EAS authentication in the build environment, without extracting browser sessions or bypassing the earlier browser-policy block described in `2026-11-02-build67-auth-checkpoint.md`. Existing source-upload/build authorization persists.

Use project `22034007-9c26-4d6f-9f33-4908b8a05acb`, owner `paradimoperationss-team`, and the existing `production-apk` profile. Check production public environment values and existing matching builds before starting a new one:

```sh
eas build --platform android --profile production-apk --non-interactive --freeze-credentials --no-wait
```

After the artifact exists, verify it using `scripts/qa/check-android-release-artifact.cjs`: package `ro.paradim.professionalfoodcost`, version 1.6.7, code 68, ARM64, and certificate SHA-256 `B7125F9E38BD66BA1226B0FF063D15569320006F3B193A1DA297D485DEEEC3ED`. Do not substitute an earlier APK or publish download metadata before verification. This task did not modify site downloads.
