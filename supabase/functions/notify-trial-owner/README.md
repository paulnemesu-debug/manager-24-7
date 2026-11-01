# Trial owner notifications

This function dispatches operational new-trial notices to the fixed owner address
`admin@paradimoperations.com`. It never sends marketing or sign-in mail.

The caller must supply a user bearer token. Supabase Auth validates the user, then
the caller-scoped `admin_list_trial_users` RPC verifies the current confirmed Auth
identity and the trusted database administrator role. The service client is only
created after that authorization succeeds. Request body fields cannot choose the
recipient or notification content.

The function reuses `RESEND_API_KEY` and `INVITATION_FROM_EMAIL`, together with the
standard Supabase function environment. Without either mail setting it returns
HTTP 503 with `delivery_not_configured` and leaves the private outbox unclaimed.
The source alone does not establish that those settings exist or that mail was
delivered. There is no OTP fallback.

Each invocation reserves up to five queued items using the service-only
`claim_trial_owner_notifications` RPC. It sends only the outbox snapshot of the
verified email, declared restaurant, and trial/registration timestamps. The exact
reservation timestamp must match when the service-only
`finish_trial_owner_notification` RPC acknowledges success or failure. Provider
errors are stored as bounded codes rather than provider response bodies.

The database prevents a completed notification from being sent again. The
provider also receives a stable `manager247-trial-owner:<outbox-id>` idempotency
key. [Resend retains those keys for 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys).
If the provider accepts mail but the acknowledgment cannot be persisted, a retry
beyond that provider window can duplicate the notice; this is not an exactly-once
delivery guarantee. Outbox payload fields must remain stable across retries.
The JSON `sent` count means the provider accepted the request and the database
acknowledgment succeeded; it does not confirm inbox delivery.

Run local behavior tests without network access or mail sends:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/notify-trial-owner.test.mjs
```

Deployment and invocation require the reviewed migration's two service-only
outbox RPCs. No timer, database webhook, or external email send is installed by
these source files. A dispatcher must invoke the function with the authorized
administrator session after release.
