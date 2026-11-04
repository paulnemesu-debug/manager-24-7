import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const verifier = require('../../scripts/qa/check-android-release-artifact.cjs') as {
  EXPECTED_RELEASE: {
    packageName: string;
    versionName: string;
    versionCode: string;
    certificateSha256: string;
    requiredNativeAbi: string;
  };
  buildIdentityReport: (result: {
    actual: {
      packageName: string;
      versionName: string;
      versionCode: string;
      certificateSha256: string;
      nativeAbis: string[];
    };
    failures: string[];
  }) => Record<string, unknown>;
  parseAaptBadging: (output: string) => {
    packageName: string;
    versionName: string;
    versionCode: string;
    nativeAbis: string[];
  };
  parseSignerCertificate: (output: string) => string;
  validateReleaseIdentity: (actual: {
    packageName: string;
    versionName: string;
    versionCode: string;
    certificateSha256: string;
    nativeAbis: string[];
  }) => string[];
};

describe('Android publishable-artifact gate', () => {
  it('accepts release 1.6.7 build 70 with the independently verified production signer', () => {
    expect(verifier.validateReleaseIdentity({
      packageName: 'ro.paradim.professionalfoodcost',
      versionName: '1.6.7',
      versionCode: '70',
      certificateSha256: 'B7125F9E38BD66BA1226B0FF063D15569320006F3B193A1DA297D485DEEEC3ED',
      nativeAbis: ['arm64-v8a'],
    })).toEqual([]);
  });

  it('rejects the previous release 1.6.5 build 66 despite its matching package, signer and ABI', () => {
    expect(verifier.validateReleaseIdentity({
      packageName: 'ro.paradim.professionalfoodcost',
      versionName: '1.6.5',
      versionCode: '66',
      certificateSha256: 'B7125F9E38BD66BA1226B0FF063D15569320006F3B193A1DA297D485DEEEC3ED',
      nativeAbis: ['arm64-v8a'],
    })).toEqual([
      'versionName expected 1.6.7, received 1.6.5',
      'versionCode expected 70, received 66',
    ]);
  });

  it('parses the package/version/native ABIs and normalizes the signer digest', () => {
    expect(verifier.parseAaptBadging(
      "package: name='ro.paradim.professionalfoodcost' versionCode='68' versionName='1.6.7' platformBuildVersionName='16'\nnative-code: 'arm64-v8a' 'x86_64'\n",
    )).toEqual({
      packageName: 'ro.paradim.professionalfoodcost',
      versionCode: '68',
      versionName: '1.6.7',
      nativeAbis: ['arm64-v8a', 'x86_64'],
    });
    expect(verifier.parseSignerCertificate(
      'Signer #1 certificate SHA-256 digest: dd:64:e2:16:ca:5f:7d:1e:0e:05:34:9f:8a:0d:2d:d8:e5:4a:5f:5c:22:68:8e:62:0e:c2:87:d4:96:fb:ef:1e',
    )).toBe('DD64E216CA5F7D1E0E05349F8A0D2DD8E54A5F5C22688E620EC287D496FBEF1E');
  });

  it('accepts only the established update identity and expected release certificate', () => {
    expect(verifier.validateReleaseIdentity({
      ...verifier.EXPECTED_RELEASE,
      nativeAbis: ['arm64-v8a'],
    })).toEqual([]);

    const failures = verifier.validateReleaseIdentity({
      packageName: 'com.example.newapp',
      versionName: '1.6.4',
      versionCode: '63',
      certificateSha256: 'DEBUGCERTIFICATE',
      nativeAbis: ['arm64-v8a'],
    });
    expect(failures).toEqual([
      'package expected ro.paradim.professionalfoodcost, received com.example.newapp',
      'versionName expected 1.6.7, received 1.6.4',
      'versionCode expected 70, received 63',
      'certificate SHA-256 does not match the approved release certificate',
    ]);
  });

  it('rejects an emulator-only APK even when its update identity and certificate match', () => {
    const actual = {
      ...verifier.parseAaptBadging(
        "package: name='ro.paradim.professionalfoodcost' versionCode='70' versionName='1.6.7'\nnative-code: 'x86_64'\n",
      ),
      certificateSha256: verifier.EXPECTED_RELEASE.certificateSha256,
    };

    expect(verifier.validateReleaseIdentity(actual)).toEqual([
      'native ABI arm64-v8a required for phone release; received x86_64',
    ]);
  });

  it.each([
    ['absent', ''],
    ['empty', 'native-code:'],
  ])('fails closed when native ABI badging is %s', (_description, nativeCode) => {
    const actual = {
      ...verifier.parseAaptBadging(
        `package: name='ro.paradim.professionalfoodcost' versionCode='70' versionName='1.6.7'\n${nativeCode}\n`,
      ),
      certificateSha256: verifier.EXPECTED_RELEASE.certificateSha256,
    };

    expect(verifier.validateReleaseIdentity(actual)).toEqual([
      'native ABI arm64-v8a required for phone release; received none',
    ]);
  });

  it.each([
    ['ARM64', "native-code: 'arm64-v8a'"],
    ['universal', "native-code: 'armeabi-v7a' 'arm64-v8a' 'x86' 'x86_64'"],
  ])('accepts a matching %s APK with ARM64 phone support', (_description, nativeCode) => {
    const actual = {
      ...verifier.parseAaptBadging(
        `package: name='ro.paradim.professionalfoodcost' versionCode='70' versionName='1.6.7'\n${nativeCode}\n`,
      ),
      certificateSha256: verifier.EXPECTED_RELEASE.certificateSha256,
    };

    expect(verifier.validateReleaseIdentity(actual)).toEqual([]);
  });

  it('reports only the APK identity gate and does not label an artifact publishable', () => {
    const report = verifier.buildIdentityReport({
      actual: { ...verifier.EXPECTED_RELEASE, nativeAbis: ['arm64-v8a'] },
      failures: [],
    });
    expect(report).toMatchObject({ apkIdentityGatePassed: true });
    expect(report).not.toHaveProperty('publishable');

    expect(verifier.buildIdentityReport({
      actual: { ...verifier.EXPECTED_RELEASE, nativeAbis: ['arm64-v8a'] },
      failures: ['certificate mismatch'],
    })).toMatchObject({ apkIdentityGatePassed: false });
  });
});
