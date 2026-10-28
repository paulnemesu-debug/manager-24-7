# Portions and P&L payroll correction plan

> Implementation: parallel scoped debugging and regression tests, followed by independent review and local browser exploration.

**Goal:** Correct the two fields reported on 19 October 2026 and deliver a source archive with an evidence-based QA report, without building an APK.

**Baseline:** GitHub main `ffe8d2a9ab721c99b31862db490d3eb9d6e6343c`, package/app version 1.6.2. Target launch date requested: 2 November 2026.

**Constraints:** Preserve existing functionality and branding. No deployment, APK/native build, customer data mutations, or authentication messages. Test local demo data. Keep live/device checks clearly separate from simulations.

## Work

- [x] Inspect both supplied screenshots and confirm latest available source against GitHub.
- [x] Isolate changes in a working branch; establish automated baseline.
- [x] Bulk: reproduce clear/retype of portions, then retain editable text without restoring 1 on every keystroke. Validate positive values at save. Verify 1, 2, 10, 50, 99, 100, decimal comma, invalid/empty input, saved reopen, and cost/portion.
- [x] P&L: reproduce blank zero, stale HR on return and replacement of historical payroll. Display zero clearly, link to HR, refresh payroll on return while preserving other inputs, protect saved historical totals, and handle load failures without silently saving zero.
- [x] Run focused regression checks and full tests, typecheck, lint and simulated operational flows.
- [x] Exercise local rendered app with mouse/keyboard, mobile viewport, save/reopen and reload. Record limits: no proof of native keyboard, hardware, OTP or cloud synchronization.
- [x] Independently review changed code; fix confirmed regressions.
- [x] Deliver source ZIP plus QA results and prioritized 14-day test plan. Keep app/native version numbers unchanged; identify this source correction by branch/commit and date.

## Review focus

1. Clear a numeric field and type a smaller number normally.
2. Reject invalid portions without silently changing their meaning.
3. Editing HR and returning to an unsaved P&L must not erase revenue/cost edits.
4. Opening an old P&L must not replace its historical salary total.
5. Failed loading must be visible and must not produce a misleading successful zero-payroll save.
