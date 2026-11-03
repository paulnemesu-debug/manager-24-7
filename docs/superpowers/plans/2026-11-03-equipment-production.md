# Equipment and Production Implementation Plan

**Goal:** Deliver both operational modules, portable lists/sheets and signed APK.
**Architecture:** Shared file transfer utilities; independent equipment and production domain/UI modules; existing operational sync with new owner-isolated tables. Parent integrates navigation, cloud schema, backup and release.
**Tech Stack:** Current Expo 57, React Native, TypeScript, Vitest, Supabase.
**Spec:** docs/superpowers/specs/2026-11-03-equipment-production.md

## Global Constraints
- Preserve current package/signing identity, RO/EN, actual measurements and existing data.
- Imports preview before saving, no destructive replacement, errors surfaced, no secrets in APK.
- POLIDOM stays visibly unconfigured until actual API documentation is available.

## Review Focus
- Concurrent or repeated finalize/consumption actions must not duplicate vouchers.
- Malformed files, decimal commas, spreadsheet formulas and HTML in user text.
- Account switch during asynchronous reads/imports and persisted corruption.
- HACCP equipment rename/disable preserves history and identity; non-temperature assets add no HACCP tasks.
- Cloud import identities and versions cannot overwrite another owner or validated records.

### Task 1: Shared transfer and cloud foundation (parent)
- Create src/lib/operations-transfer.ts with pure parseCsv/stringifyCsv and grid helpers; src/lib/operations-transfer-files.ts for pick/read/write/PDF using existing dependencies. Test quotes, decimal commas, invalid formats, formula safety and HTML escaping.
- Extend operational-sync table union to asset_profiles, maintenance_entries, production_sheets. Create additive version-checked RPC and RLS migration, test in PGlite and apply via connected Supabase when validated.
- Include three stores in account backup/deletion; route both screens, version bump and QA.

### Task 2: Equipment and maintenance module
- Create src/types/equipment-maintenance.ts, src/lib/equipment-maintenance.ts, src/lib/equipment-maintenance-transfer.ts, src/app/tools/equipment-maintenance.tsx and tests.
- Expose loadEquipmentRegistry(userId): Promise<EquipmentAsset[]> merging HACCP into profiles by same id; each EquipmentAsset has id, name, available:boolean. Production consumes this interface.
- Cloud stores use asset_profiles and maintenance_entries; local prefixes manager247.asset-profiles.v1. and manager247.maintenance-entries.v1.
- Implement spec complete maintenance and transfers; TDD calculations, linkage, recurrence, import validation and persistence isolation. Commit only owned files.

### Task 3: Production sheets module
- Create src/types/production-sheet.ts, src/lib/production-sheets.ts, src/lib/production-sheets-transfer.ts, src/app/tools/production-sheets.tsx and tests.
- Use production_sheets store and manager247.production-sheets.v1. local prefix.
- Equipment read dependency: loadEquipmentRegistry(userId) from equipment-maintenance; id/name/available. Create from recipes and optional recipeId/portions route params.
- Implement spec complete lifecycle, snapshots, real measurements and transfers; TDD costs, yield, no fake values, immutable validation, duplicate voucher protection and import validation. Commit only owned files.

### Task 4: Review and APK
- Independent review of completed modules and shared integration; address material findings with regression tests.
- Run release checks and Android JS bundling, then new signed native APK with existing EAS project if authenticated. Verify package/version/cert/ABI; persist source and deliver actual binary or precise authentication blocker.
