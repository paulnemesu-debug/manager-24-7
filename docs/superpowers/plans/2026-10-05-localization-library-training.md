# MANAGER 24/7 localization, recipe catalogue and training plan

> **For agentic workers:** Use superpowers:executing-plans and the independent-domain dispatch workflow. User has authorized implementation and full virtual testing; no additional plan approval is pending.

**Goal:** Complete English UI coverage, integrate the previously discussed Food.com collection, audit the seven approved Helmo-inspired features, and deliver verified software with a illustrated manual and recorded training.

**Architecture:** Preserve the existing recipe/editor and account storage. Localize UI and generated system labels explicitly; never translate user-entered data. The large source collection is a separate searchable catalogue from which a selected recipe becomes a normal editable draft; source nutrition remains distinct from verified ingredient nutrition. Virtual UI evidence uses the actual application with fictional records.

**Tech Stack:** Expo 57, React Native 0.86, TypeScript, Vitest, existing native XLSX adapter; local web browser and Android emulator if this laptop supports it.

**Spec:** User request in this task and recovered conversations “Bază rețete Excel nutrienți” and “Compară și îmbunătățește”.

## Global constraints

- Keep the original v1.6.1 APK/source and synced sources unchanged.
- Preserve the phone-only launcher icon change.
- Requested Helmo items are 2, 3, 5, 6, 7, 8 plus AI Daily Manager. Roles and inter-location transfer were not selected.
- Never invent units, recipe weight, food costs, nutrient values, successful transactions, or test coverage.
- Retain all 479 existing recipe templates.
- Keep test data separate from production data, and label simulated service outcomes.

## Review focus

- Changing RO/EN while a module is open updates labels, derived messages, dates and forms.
- Recipe source quantities missing units stay unresolved and are reviewable before saving.
- Very large library searches remain bounded and do not render hundreds of thousands of rows.
- Demo records persist across navigation, avoid live account requests and recover after errors.
- Captures and videos depict real executed UI paths; external-service limitations remain visible in the report.

## Task 1 — English coverage and web startup

- [ ] Reproduce hardcoded Romanian labels and web Appearance startup exception.
- [ ] Add failing locale/helper regressions and startup regression.
- [x] Add typed bilingual messages, pass locale to domain helpers and guard platform-only appearance APIs.
- [x] Run targeted tests and inspect RO/EN UI.

Locale/helper failures were reproduced and covered by passing targeted regressions. The current web source guards `Appearance.setColorScheme`; a separately recorded startup regression remains unconfirmed, so the two combined reproduction/regression items above stay open. Broad module coverage remains under Task 4.

## Task 2 — Recipe collection

- [x] Download and verify the public source file and metadata; report actual count and missing fields.
- [x] Implement bounded catalogue search/detail and copy into the existing editor, using the chosen online/offline delivery.
- [x] Preserve source provenance and per-serving nutrient semantics; require review of missing units.
- [ ] Verify real source examples, invalid input, duplicates, pagination and existing templates.
- [x] Verify complete browser installation, actual offline search/detail, persistence after final reload and the mandatory copy-review gate through the visible UI.

Manifest: 522,517 records; native download 313,918,560 bytes, installed SQLite 366,206,976 bytes; web download 151,139,013 bytes across 64 chunks. All 479 local templates remain. Public native assets and immutable web manifest/first chunk were verified. Complete browser installation passed after pause/resume. With the browser actually offline, search for lemonade and source detail #40 worked; the installed collection persisted after the final reload. The final UI blocks review acknowledgment for incomplete quantities/prices, clears acknowledgment when a price becomes zero, and preserves that state after save/reopen. The broad examples/duplicates/pagination item remains open rather than extrapolating these cases into exhaustive coverage.

## Task 3 — Helmo feature audit

- [x] Record each approved requirement against its screen, persistence, tests and remaining gap.
- [x] Implement the confirmed Control Mode inspection PDF connection and restore the visible HACCP Records entry, with focused tests.
- [x] Verify actionable routes, document expirations, employee lifecycle and instant populated demo through targeted tests and the recorded browser cases.

See `docs/HELMO-AUDIT-v1.6.2.md`: Daily Operations, HR evidence/leave workflows and alert resolution remain partial. Checking the specific PDF/entry connection above does not close these broader gaps or certify Android PDF layout/sharing.

## Task 4 — Regression, interactive QA and training

- [x] Run full tests, flow checks, typecheck and official lint: final 482 tests / 82 files, 56 flow checks, TypeScript and official lint all passed (`qa-v162-release-*`).
- [x] Record the completed baseline and later runs without adding overlapping counts: 467/78 baseline, 471/78 intermediate, 482/82 final. Final full run started at 04:31:07 and took 175.79 seconds; it includes the final HACCP, local invoice handoff and browser print regressions.
- [ ] Navigate every module at phone size, enter/edit/save/reopen fictional data, exercise validation and exports.
- [x] Open all 19 HACCP form types through the real paginated browser UI and inspect visible English fields. This is screen/field inspection, not a claim that all 19 were fully completed and saved. Hygiene save, temperature checks and equipment-limit validation have separate practical evidence.
- [x] Recapture and review all 19 HACCP form screenshots at phone size; verify final HACCP settings headings in English.
- [x] Verify local UBL file upload and actual invoice-price handoff: QA-VIRTUAL-42 opens one new Cartofi row at 10 RON/kg, initially unselected with apply disabled; explicit selection, acknowledgment and apply create one product.
- [x] Verify web HACCP label produces its 40 × 60 mm iframe HTML without the undefined-URI failure. This does not validate a printed PDF file or native printing.
- [x] Verify actual final English cookbook XLSX (7,521 bytes, four sheets, ZIP/XML valid, pcs present and buc absent) and actual Demo account JSON export (73,945 bytes, 5 recipes, 5 ingredients, 10 local modules, credentials excluded). Demo export correctly reports cloud unavailable/incomplete; no complete cloud export is claimed.
- [x] Try a native Android virtual device without changing laptop security settings. Android 11/API 30 did not boot; no physical-device runtime is claimed.
- [ ] Capture RO/EN key screens and real interaction recordings, indexed by feature.
- [ ] Produce an illustrated manual, training videos and a coverage report with observed results and limitations.
- [x] Build the updated APK and verify its static metadata, signing compatibility, standalone release configuration and white launcher icon. Native installation/runtime is not verified.
- [ ] Publish authorized source updates and deliver the final packaged artifacts while preserving old deliverables.

The Romanian verification report is `deliverables/v1.6.2/verification/RELEASE-REPORT-RO.md` in the project workspace. Actual browser coverage and explicit unverified cases are recorded in `practical-coverage.json` beside it. Full training delivery, final packaging and source publication are tracked separately; this plan does not mark them complete without their evidence.

Final browser observations confirmed Home at RON 37,500 with one pending attendance entry, the completed/offline catalogue and source-review behavior above, the local XML handoff, and corrected HACCP setup headings. Initial recipe Excel evidence containing buc remains a historical defect example; a later actual English cookbook export verifies pcs and no buc (SHA-256 ac50f4ca002f0185a2621f6a14f81c044c948bb6db3af6789ca865882c748d23), alongside passing source export regressions.

The final 56-flow rerun passed. The 18 available English HACCP DOM captures and all 19 recaptured form screenshots were reviewed with no further Romanian system labels found; preserved location/identity data and the Romanian language-selector name were not treated as localization defects.

Final APK: build-v162-final.log reports BUILD SUCCESSFUL in 29m44s, 632 actionable tasks (26 executed, 606 up-to-date). Size 49,672,796 bytes; versionName 1.6.2 / versionCode 61; SHA-256 91b28ea65fde175acd65eef181f2165485127eb2902583b6244f9dbf15539f25. Signature matches the previous APK, debuggable is false, standalone configuration and white icon passed. The Android emulator never booted and no physical runtime was tested. Helmo remains partial as documented in its audit; successful tests/build do not close its functional gaps or certify legal compliance.
