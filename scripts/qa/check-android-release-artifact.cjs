#!/usr/bin/env node

const { existsSync, readdirSync } = require('node:fs');
const { isAbsolute, join } = require('node:path');
const { spawnSync } = require('node:child_process');

const EXPECTED_RELEASE = Object.freeze({
  packageName: 'ro.paradim.professionalfoodcost',
  versionName: '1.6.7',
  versionCode: '69',
  // Existing EAS production-apk keystore, verified against the generated APK.
  // Evidence and limits for previous-install/Play compatibility: docs/qa/APK-INSTALL-2026-10-31.md.
  certificateSha256: 'B7125F9E38BD66BA1226B0FF063D15569320006F3B193A1DA297D485DEEEC3ED',
  requiredNativeAbi: 'arm64-v8a',
});

function normalizeDigest(value) {
  return String(value ?? '').replace(/[^a-fA-F0-9]/g, '').toUpperCase();
}

function parseAaptBadging(output) {
  const lines = String(output).split(/\r?\n/);
  const line = lines.find((entry) => entry.startsWith('package:')) ?? '';
  const nativeCodeLine = lines.find((entry) => entry.startsWith('native-code:')) ?? '';
  const read = (name) => line.match(new RegExp(`${name}='([^']*)'`))?.[1] ?? '';
  return {
    packageName: read('name'),
    versionCode: read('versionCode'),
    versionName: read('versionName'),
    nativeAbis: Array.from(nativeCodeLine.matchAll(/'([^']+)'/g), (match) => match[1]),
  };
}

function parseSignerCertificate(output) {
  const match = String(output).match(/certificate SHA-256 digest:\s*([^\r\n]+)/i);
  return normalizeDigest(match?.[1]);
}

function validateReleaseIdentity(actual) {
  const failures = [];
  if (actual.packageName !== EXPECTED_RELEASE.packageName) {
    failures.push(`package expected ${EXPECTED_RELEASE.packageName}, received ${actual.packageName}`);
  }
  if (actual.versionName !== EXPECTED_RELEASE.versionName) {
    failures.push(`versionName expected ${EXPECTED_RELEASE.versionName}, received ${actual.versionName}`);
  }
  if (String(actual.versionCode) !== EXPECTED_RELEASE.versionCode) {
    failures.push(`versionCode expected ${EXPECTED_RELEASE.versionCode}, received ${actual.versionCode}`);
  }
  if (normalizeDigest(actual.certificateSha256) !== EXPECTED_RELEASE.certificateSha256) {
    failures.push('certificate SHA-256 does not match the approved release certificate');
  }
  const nativeAbis = Array.isArray(actual.nativeAbis) ? actual.nativeAbis : [];
  if (!nativeAbis.includes(EXPECTED_RELEASE.requiredNativeAbi)) {
    failures.push(`native ABI ${EXPECTED_RELEASE.requiredNativeAbi} required for phone release; received ${nativeAbis.join(', ') || 'none'}`);
  }
  return failures;
}

function sdkBuildToolCandidates(name) {
  const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
  const executableNames = process.platform === 'win32'
    ? [`${name}.bat`, `${name}.exe`, name]
    : [name];
  if (!sdk) return executableNames;
  const root = join(sdk, 'build-tools');
  let versions = [];
  try {
    versions = readdirSync(root).sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  } catch {
    // Fall through to PATH lookup.
  }
  return [
    ...versions.flatMap((version) => executableNames.map((entry) => join(root, version, entry))),
    ...executableNames,
  ];
}

function runBuildTool(name, args) {
  const candidates = sdkBuildToolCandidates(name);
  for (const candidate of candidates) {
    if (isAbsolute(candidate) && !existsSync(candidate)) continue;
    const result = spawnSync(candidate, args, {
      encoding: 'utf8',
      shell: process.platform === 'win32' && candidate.endsWith('.bat'),
    });
    if (!result.error && result.status === 0) return result.stdout;
  }
  throw new Error(`Android build tool '${name}' is unavailable or failed`);
}

function verifyApk(apkPath) {
  if (!apkPath || !existsSync(apkPath)) throw new Error('APK path does not exist');
  const metadata = parseAaptBadging(runBuildTool('aapt', ['dump', 'badging', apkPath]));
  const certificateSha256 = parseSignerCertificate(
    runBuildTool('apksigner', ['verify', '--print-certs', apkPath]),
  );
  const actual = { ...metadata, certificateSha256 };
  return { actual, failures: validateReleaseIdentity(actual) };
}

function buildIdentityReport(result) {
  return {
    expected: EXPECTED_RELEASE,
    ...result,
    apkIdentityGatePassed: result.failures.length === 0,
  };
}

if (require.main === module) {
  try {
    const result = verifyApk(process.argv[2]);
    process.stdout.write(`${JSON.stringify(buildIdentityReport(result), null, 2)}\n`);
    if (result.failures.length > 0) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Artifact verification failed'}\n`);
    process.exitCode = 2;
  }
}

module.exports = {
  EXPECTED_RELEASE,
  buildIdentityReport,
  normalizeDigest,
  parseAaptBadging,
  parseSignerCertificate,
  validateReleaseIdentity,
  verifyApk,
};
