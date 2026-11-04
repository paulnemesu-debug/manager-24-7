# APK 69 restaurant workflow and data preservation test plan

> **For agentic workers:** Use systematic-debugging and test-driven-development for confirmed defects. Execute and record each task; independent environment preparation and baseline checks run in parallel under dispatching-parallel-agents.

**Goal:** Investigate reported lost recipes/equipment on APK 69, repair reproducible causes, and verify every application module through realistic restaurant workflows before any release recommendation.

**Architecture:** Preserve the delivered APK 69 and its source commit as the baseline. Exercise the actual interface and persistence adapters, supplement with focused fault-injection regressions and SQL access tests. Keep synthetic restaurant records isolated from customer data.

**Tech Stack:** Expo 57, React Native, TypeScript, AsyncStorage, Supabase/PostgreSQL, Vitest, browser and Android emulator.

**Spec:** User reports on 2026-11-04: APK 69 closes the equipment form but the item is absent, recipe/equipment data appears lost between versions; test all functions as a small restaurant user, including virtual testing and evidence.

## Global constraints

- `sources/` is read-only. Preserve the delivered APK 68/69 and existing customer data.
- Never equate mocked tests, web checks, native installation or code review with device workflow success.
- No production data writes, entitlement changes, messages or real purchases for testing. Use synthetic local/staging records.
- Do not publish to Google Play or declare release readiness while data-loss reproduction or essential verification remains open.
- Capture exact test environment, input, action, expected result, observed result and evidence.

## Review focus

- Successful save followed by stale/empty cloud read must not silently discard locally acknowledged work.
- Process termination immediately after save must preserve the visible record or clearly report incomplete saving.
- An in-place APK update must preserve durable records and account ownership.
- Network delay/failure, duplicate presses and account changes must not lose, duplicate or expose records.
- Invalid values, rejected writes and corrupt cache must retain recoverable user input and display an actionable error.

## Tasks

- [ ] Baseline: exact HEAD `5e9b345`, package/version/signature, full existing unit/component/SQL suites; identify mocked coverage and all application routes.
- [ ] Equipment: exercise both HACCP equipment settings and equipment-maintenance creation, save, list, reopen, edit, deactivate and scheduling; reproduce network/refresh failure before any implementation change.
- [ ] Recipes: exercise real editor, ingredients, quantities/prices, subrecipes, photo references, save/reopen/restart, offline retry and durable queue; prove any loss with a failing regression before fixing.
- [ ] Upgrade: seed unique synthetic records in APK68, install APK69 over it, reopen and compare fields; record any emulator/hardware limitation explicitly.
- [ ] Restaurant day: setup/location, ingredients, recipes/catalogue, production plan/sheets/vouchers, HACCP checks, equipment/maintenance, HR/attendance/lifecycle, documents, operations/compliance/waste, financial/simulation/menu tools, daily manager/alerts, account/export and RO/EN.
- [ ] Each writable module: create → save → leave → reopen → edit → save → reload, cancellation, invalid input, duplicate submit, storage/network failure where relevant; reversible deletion or archive on synthetic data only.
- [ ] Transfers: create/export/import representative XLSX/CSV/PDF; inspect actual generated files and native picker/share behavior separately.
- [ ] Verification: rerun relevant regressions and complete suites after integrated fixes, inspect changes independently, replay critical UI cases, publish an honest results matrix and remaining blockers.

## Evidence locations

- `deliverables/qa69-2026-11-04/baseline`: baseline logs and route matrix.
- `deliverables/qa69-2026-11-04/android`: isolated emulator preparation and native checks.
- `deliverables/qa69-2026-11-04/recipe-audit.md`: recipe persistence findings.
- `deliverables/qa69-2026-11-04/ui`: screenshots and reproducible user scenarios.

All paths above are relative to the parent ChatGPT project workspace, outside the source checkout.
