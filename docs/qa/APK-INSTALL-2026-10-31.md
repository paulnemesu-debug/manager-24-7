# APK install failure — verified 31 October 2026

## Exact uploaded artifact

- File: `app-release.apk`, 62,459,977 bytes.
- SHA-256: `4113796e838482be476a83f75ea9a9874834eebaf94d6302cd8a9b185f0a2f1f`.
- Package: `ro.paradim.professionalfoodcost`.
- Version: 1.6.5, versionCode 64; minSdk 24, targetSdk 36.
- All 28 native libraries are **x86_64**, ELF machine 62. No ARM64 libraries exist.
- SDK Build Tools 36.0.0 `aapt dump badging` confirms `native-code: 'x86_64'`.
- SDK `apksigner verify --verbose --print-certs` succeeds: v2 signature; certificate `CN=Android Debug, O=Android, C=US`.
- Actual certificate SHA-256: `108E1115A12418D2AC2B2D04717563BA095AFCCBE26608CF3E40DD5C79602AF7`.
- ZIP CRC, signature/content digest and 16 KiB native entry alignment are valid.

## Finding and scope

This is an emulator APK. It cannot install on the user's ARM64 phone. The user confirmed that no MANAGER 24/7 installation currently exists on the phone, so an existing-app signature conflict is not needed to explain this failure. The debug certificate also differs from the expected release signer; that matters for future upgrades of copies signed with another key.

The current source targets 1.6.5/versionCode 65 and `arm64-v8a`. No replacement APK is claimed to have been generated or installed during this investigation.

## Regression correction

The release artifact gate now parses `aapt` native ABI output and requires `arm64-v8a`. It rejects x86-only or missing ABI output, accepts universal APKs containing ARM64, and retains package/version/certificate checks. The uploaded APK fails all three applicable gates: code 64, different signer, and x86-only ABI.

TDD: four new regressions failed before the fix. Final focused tests: 8/8 PASS. Independent review: no actionable issues. Full `npm run qa:release`: typecheck, lint, 907 Vitest tests in 114 files, 77 operational checks and 101 local database checks PASS.

## Build status

JDK 17, Android SDK/build tools/platform 36, NDK 27.1.12297006 and CMake 3.30.5 were prepared. The local Gradle 9.3.1 download is blocked by the inherited proxy with HTTP 403 CONNECT for `services.gradle.org`. No alternate route was used to bypass that denial.

EAS CLI 27.2.0 reports `Not logged in`. The `production-apk` profile uses remote signing credentials and remains the supported alternate build route after Expo account authentication. The existing production key was not changed. A temporary unused local test signer was removed after the local-build blocker; no artifact was signed with it.

Before delivery: complete an ARM64 native build with the intended signer, verify the final APK's ABI/version/signature, and test installation and launch. A web ZIP, source checkpoint or passing source tests is not a replacement APK.
