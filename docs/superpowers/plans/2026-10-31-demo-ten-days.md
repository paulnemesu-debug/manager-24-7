# Separate ten-day demo implementation plan

> **For agentic workers:** Use the existing authorized execution workflow, with regression tests before changes and independent final review.

**Goal:** Let a tester sign in as DEMO using demo@paradim.ro and receive exactly ten days from the first verified email OTP.

**Architecture:** Zoho routes the alias to Paul's existing mailbox. Supabase retains a distinct, non-admin identity. The existing OTP RPC activates one fixed ten-day entitlement; subsequent logins do not restart it. The client respects that expiry online, offline, and while left open.

**Tech Stack:** Expo, TypeScript, React, Supabase/PostgreSQL, Vitest, PGlite, Zoho Mail.

**Spec:** The user's existing request: separate DEMO alias, OTP delivered to paul.nemesu@paradim.ro for manual sharing, ten-day access. The user has authorized continuation and requested no repeat confirmations.

## Global constraints

- Keep demo@paradim.ro distinct from paul.nemesu@paradim.ro in Auth.
- Grant no admin role or membership in Paul's real workspace.
- Ten days start on first verified OTP, with no automatic renewal.
- Preserve the existing paid/admin/member access model outside the dedicated demo.
- Do not claim that source changes are deployed, that an OTP was received, or that a release APK exists without evidence.

## Review focus

- Invalid or missing demo expiry must deny access.
- An open screen must lose demo Pro access at expiry without a reload.
- An expired demo must not renew on another OTP.
- Sign-in routing must keep demo and owner identities distinct.
- Existing paid and admin cache behavior must remain compatible.

### Task 1: Client activation and expiration

**Files:** src/lib/demo-access.ts and tests; src/lib/subscription-cache.ts and tests; src/contexts/subscription-context.tsx and tests.

- [x] Write regressions for the dedicated demo email, owner exclusion, exact offline expiry, missing/invalid expiry and live expiry.
- [x] Run the focused tests and observe the relevant failures.
- [x] Change the demo constant, clamp demo entitlement to its server end, and schedule an expiry render using the existing context conventions.
- [x] Run focused tests, typecheck and lint; record results.

### Task 2: Reconcile backend and mail routing

**Files:** Existing migration history or a CLI-generated demo migration, supabase/tests/demo_ten_day_access.sql, docs/qa/DEMO-10-ZILE-2026-10-31.md.

- [x] Inspect deployed migration history, function ACLs and account isolation. Preserve already-deployed ten-day logic in source.
- [x] Test first activation, repeated OTP, expiry, rejected identities and role restrictions in a rollback-only/local harness.
- [ ] Create or verify the Zoho alias DEMO under Paul's mailbox.
- [ ] Verify a genuine OTP sign-in if the currently available deployment supports the corrected client; otherwise record the precise release blocker.

### Task 3: Verify and preserve

- [x] Run the complete test suite and relevant database checks; review the diff independently.
- [ ] Commit the source and update the persistent checkpoint using the same saved file identity.
- [ ] Report the actual alias, auth, expiry and deployment status, including any remaining blocker.

Execution record: client 29/29 focused tests pass; complete release pipeline 902 Vitest tests, 77 operational checks and 101 local database checks pass. Automatic approval rejected saving the Zoho alias; no live demo account, OTP validation, deployment or new APK is claimed. See docs/qa/DEMO-10-ZILE-2026-10-31.md.
