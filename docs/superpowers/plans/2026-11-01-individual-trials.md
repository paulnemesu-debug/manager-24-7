# Individual Trial Implementation Plan

> **For agentic workers:** use bounded parallel ownership for independent subsystems, then one whole-change security review before release.

**Goal:** Ship a self-service ten-day trial with isolated fictional data, owner visibility, accurate privacy notices and Google visibility checks.

**Architecture:** Supabase owns timing, registration and entitlements. Expo client gates registration/expiry and seeds only caller-owned local examples. Existing PARADIM Site gets aligned legal/CTA content. Owner updates use existing mail capabilities where configured and a scheduled daily report.

**Tech Stack:** Expo SDK57/ReactNative, Supabase Postgres/Auth/Edge, existing Sites Worker.

**Spec:** docs/superpowers/specs/2026-11-01-individual-trials-design.md

## Global Constraints
- Manager 24/7 display name, existing Android package and paid/admin subscriptions preserved.
- 10 days exact from first server-observed verified login, once per account, no automatic renewal/card collection.
- Terms2026-11-01 and privacy2026-11-01 acknowledged; marketing false by default.
- No nonessential tracker before consent, no shared-account auth data in public responses, never log OTP/secrets.

## Review Focus
- Registration retry/concurrency, expired legacy grants, paid/admin accounts, direct routes/account switching, unconfirmed/spoofed users.
- Seed retries never overwrite existing business data; two testers cannot see each other.
- Missing OTP/mail configuration is reported, never silently described as delivered.

### Task1 Backend
- [ ] Inspect prod/staging schemas and trusted auth/entitlement functions.
- [ ] Add meaningful failing SQL tests for timing, legal version, isolation, admin and restart bypasses.
- [ ] Implement registry/RPC/seed changes and retire legacy14day bypass.
- [ ] Validate locally/staging, independently review, apply additive migration to production and verify.

### Task2 Client
- [ ] Add typed trial API, registration/expiry cache gate and protected owner panel.
- [ ] Add required terms/privacy and restaurant, optional marketing, isolated fictional samples.
- [ ] Verify OTP/session races, expiry, seed idempotency and direct links using meaningful tests/typecheck.

### Task3 Website and updates
- [ ] Inspect existing policies/consent and actual account providers.
- [ ] Update RO/EN privacy/terms/trial CTA and primary contact; preserve existing canonical/downloads.
- [ ] Configure owner update capability and daily report with verified addresses/timestamps.
- [ ] Validate/publish exact tested source, store reproducible app source/web artifacts.

### Task4 Google and release
- [ ] Check existing GSC/GBP under relevant accounts, report observed state/blockers, no duplicate assets.
- [ ] Fresh whole-change review; run appropriate release checks; produce updated client distribution if feasible.
- [ ] Report completed/live versus remaining authentication/mail/payment prerequisites with evidence.
