# APK/AAB67 build checkpoint

The user explicitly approved uploading the current proprietary source to Expo/EAS
for APK and AAB1.6.6/code67, followed by updating the site download after successful
artifact verification. This approval persists; do not ask for source-upload approval
again merely because the task resumes.

Source f3b7ef7 updates the release artifact checker to1.6.6/code67 without changing
the approved package, B7125F9E38BD66BA1226B0FF063D15569320006F3B193A1DA297D485DEEEC3ED
signer or ARM64 requirement. All10 focused artifact identity tests passed, including
accepting67 and rejecting66. Existing application config, APK/direct and AAB/Play
profiles, target36, R8/shrink and OTA-disabled configuration were reviewed.

EAS CLI22.6.0 is installed. Its current session reports Not logged in and no
EXPO_TOKEN is configured. Browser login reached the existing paradimoperations
account. The EAS login request was restricted to paradimoperationss-team with
Developer scope; the personal account was not selected. The browser security
policy rejected the Approve navigation because the requested protocol was not
allowed. Do not retry through an indirect browser, raw protocol, session extraction
or other policy workaround. A manual authentication handoff is required.

No cloud build ID was issued. No new APK/AAB was generated or delivered, and no
signing credentials were created or rotated. The existing website remains version69;
its download release metadata still identifies build66. Update download binaries,
hash/size metadata, reconstruction tests and RO/EN Android download links only after
the new APK is available and its package/version/signer/ABI are verified. The AAB
is for Play distribution and must not be advertised as an installable phone file.

After authentication succeeds, use the existing EAS project
22034007-9c26-4d6f-9f33-4908b8a05acb and owner paradimoperationss-team. Verify the
production Supabase public environment is configured before upload. Build exactly
production-apk and production, noninteractive with freeze-credentials, without
auto-submit. Check for an existing matching build before starting a retry.

The real OTP/device smoke test and Play upload/App Signing validation remain
separate unverified work; a successful build alone will not prove either.
