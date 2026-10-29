import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const verifier = require('../../scripts/qa/check-android-release-artifact.cjs') as {
  EXPECTED_RELEASE: {
    packageName: string;
    versionName: string;
    versionCode: string;
    certificateSha256: string;
  };
  buildIdentityReport: (result: {
    actual: {
      packageName: string;
      versionName: string;
      versionCode: string;
      certificateSha256: string;
    };
    failures: string[];
  }) => Record<string, unknown>;
  parseAaptBadging: (output: string) => {
    packageName: string;
    versionName: string;
    versionCode: string;
  };
  parseSignerCertificate: (output: string) => string;
  validateReleaseIdentity: (actual: {
    packageName: string;
    versionName: string;
    versionCode: string;
    certificateSha256: string;
  }) => string[];
};

describe('Android publishable-artifact gate', () => {
  it('parses the package/version and normalizes the signer digest', () => {
    expect(verifier.parseAaptBadging(
      "package: name='ro.paradim.professionalfoodcost' versionCode='64' versionName='1.6.5' platformBuildVersionName='16'\n",
    )).toEqual({
      packageName: 'ro.paradim.professionalfoodcost',
      versionCode: '64',
      versionName: '1.6.5',
    });
    expect(verifier.parseSignerCertificate(
      'Signer #1 certificate SHA-256 digest: dd:64:e2:16:ca:5f:7d:1e:0e:05:34:9f:8a:0d:2d:d8:e5:4a:5f:5c:22:68:8e:62:0e:c2:87:d4:96:fb:ef:1e',
    )).toBe('DD64E216CA5F7D1E0E05349F8A0D2DD8E54A5F5C22688E620EC287D496FBEF1E');
  });

  it('accepts only the established update identity and expected release certificate', () => {
    expect(verifier.validateReleaseIdentity({
      ...verifier.EXPECTED_RELEASE,
    })).toEqual([]);

    const failures = verifier.validateReleaseIdentity({
      packageName: 'com.example.newapp',
      versionName: '1.6.4',
      versionCode: '63',
      certificateSha256: 'DEBUGCERTIFICATE',
    });
    expect(failures).toEqual([
      'package expected ro.paradim.professionalfoodcost, received com.example.newapp',
      'versionName expected 1.6.5, received 1.6.4',
      'versionCode expected 64, received 63',
      'certificate SHA-256 does not match the approved release certificate',
    ]);
  });

  it('reports only the APK identity gate and does not label an artifact publishable', () => {
    const report = verifier.buildIdentityReport({
      actual: { ...verifier.EXPECTED_RELEASE },
      failures: [],
    });
    expect(report).toMatchObject({ apkIdentityGatePassed: true });
    expect(report).not.toHaveProperty('publishable');

    expect(verifier.buildIdentityReport({
      actual: { ...verifier.EXPECTED_RELEASE },
      failures: ['certificate mismatch'],
    })).toMatchObject({ apkIdentityGatePassed: false });
  });
});
