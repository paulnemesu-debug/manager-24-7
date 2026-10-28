# MANAGER24/7 QA Remediation Plan

Goal: correct all locally reproduced defects from qa-all-20261019 and outstanding qa-launch-20261019 findings; retest actual outputs; validate Android only with executed native evidence.

Base: 83b3c2722cf7cca4f2ca97704bd1b0d3c03369bd, existing isolated worktree. User explicitly requested remediation and Android validation. Preserve proprietary brand, RO/EN, existing data and offline functionality. No production data deletion or real payment/message actions. No release APK publication; Android test build only if native validation becomes feasible.

Architecture: retain repository and screen interfaces, add durable intent/serialization and explicit input validation. Fix exporters at template/source boundaries. Tests must assert desired behavior; prior probes that asserted defects must be updated to expect corrected behavior.

Review focus: existing cache migration; failed ancillary writes after successful primary import; two tab locks; dates and localized numeric inputs; fixed physical label limits.

## Ownership / independently testable tasks
- [ ] Storage: storage-lock, operations-storage, haccp/production-documents/pnl/management/haccp-routine/waste-compliance repositories. Close SF01–SF12. Preserve pending data, idempotent replay and corrupt-cache recovery. Use existing fault-probes before/after.
- [ ] HACCP: forms/screens/settings and autocontrol import. Close prior H01–H06 plus H07/H08. Coordinate haccp-routine repository through storage owner.
- [ ] Exports: haccp-label-card, hr-report/export. Close EXP001/002; prevent clipped required text and invalid month in export functions. Actual render/read checks.
- [ ] HR/P&L: hr.tsx, pnl.tsx input validation and report controls. Close HD01/02. Preserve current payroll refresh and historical snapshots.
- [ ] Operations: ingredients, production plan, consumption UI, CSV sales import, waste/schedule validation. Close OP02/12/16/18/20/22. Coordinate repository changes through storage owner.
- [ ] Invoice imports: efactura parser, import orchestration. Close IMP01/02/03 without duplicate mutation on retry.
- [ ] Access/account: existing launch findings server entitlements, identity binding, delete-account workflow, expiry routing and cache/purchase verifier. Do not fabricate checkout credentials or Play Console configuration.
- [ ] Verification: full unit/flow/typecheck/lint; actual PDF/XLSX/browser regression; source review; native toolchain assessment and available Android checks.

For each task: reproduce failing desired-behavior test; minimal root fix; targeted regression; report file ownership and evidence. Root runs full suite after integration and reviews changes before commit.

Delivery: committed corrected source archive and QA report; every issue marked fixed/tested, source-only pending deployment, or blocked with concrete reason. Never describe JavaScript export as native Android validation.
