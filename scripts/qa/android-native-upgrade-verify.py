"""Verify the exact staging APKs before Android is allowed to install them."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from zipfile import ZipFile

PACKAGE = "ro.paradim.professionalfoodcost"
SIGNER = "b7125f9e38bd66ba1226b0ff063d15569320006f3b193a1da297d485deeec3ed"
EXPECTED_SHA256 = {
    68: "477fa2c7c1c8065af66734dcddff3ca1a5ca9b5f16ecb7413c5d5b4b2e171211",
    69: "5caf7d4cc6a77607ecce7a44656832c37c2225c18e4353bd26fc17005464c826",
}
# Hash the known URLs so the public workflow does not publish the staging address.
STAGING_URL_SHA256 = "830aee7e33e91f0f2ba7216beb4a316be0c635a8b6629ecc1efb6010d6f6aa5f"
PRODUCTION_URL_SHA256 = "7c3a2d74cc5b9e43d0362c4ba1e89822c3c763bfd53cc2f49ca66a4cea5d2710"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def tool_output(command):
    result = subprocess.run(command, capture_output=True, text=True, timeout=60, check=False)
    require(result.returncode == 0, f"{Path(command[0]).stem} rejected the APK")
    return result.stdout


def verify(apk, version, expected_sha, aapt, apksigner):
    with apk.open("rb") as artifact:
        actual_sha = hashlib.file_digest(artifact, "sha256").hexdigest()
    require(actual_sha == expected_sha, f"APK {version} SHA-256 mismatch")
    badging = tool_output([aapt, "dump", "badging", str(apk)])
    package = re.search(r"^package: name='([^']+)' versionCode='([^']+)'", badging, re.M)
    require(package and package.groups() == (PACKAGE, str(version)),
            f"APK {version} application ID or version code mismatch")
    min_sdk = re.search(r"^sdkVersion:'(\d+)'", badging, re.M)
    require(min_sdk and int(min_sdk[1]) <= 30, f"APK {version} requires Android newer than API 30")
    require("application-debuggable" not in badging, f"APK {version} is debuggable")
    require(re.search(r"^native-code: 'arm64-v8a'\s*$", badging, re.M),
            f"APK {version} native ABI mismatch")

    signing = tool_output([apksigner, "verify", "--print-certs", str(apk)])
    certs = re.findall(r"^Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]+)\s*$", signing, re.M)
    require([cert.lower() for cert in certs] == [SIGNER], f"APK {version} signer mismatch")

    with ZipFile(apk) as archive:
        bundle = archive.read("assets/index.android.bundle")
    url_hashes = {
        hashlib.sha256(url).hexdigest()
        for url in re.findall(rb"https://[a-z0-9]+\.supabase\.co", bundle)
    }
    require(STAGING_URL_SHA256 in url_hashes and PRODUCTION_URL_SHA256 not in url_hashes,
            f"APK {version} compiled staging URL gate failed")
    return {
        "versionCode": version,
        "package": PACKAGE,
        "sha256": actual_sha,
        "signerSha256": SIGNER,
        "nativeAbi": "arm64-v8a",
        "compiledStagingUrlVerified": True,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apk-dir", type=Path, required=True)
    parser.add_argument("--aapt", required=True)
    parser.add_argument("--apksigner", required=True)
    parser.add_argument("--apk70-sha256", default="")
    parser.add_argument("--diagnostics-only", action="store_true")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    try:
        versions = {68: EXPECTED_SHA256[68]} if args.diagnostics_only else EXPECTED_SHA256.copy()
        if args.apk70_sha256:
            require(not args.diagnostics_only, "APK 70 is only accepted in upgrade mode")
            require(re.fullmatch(r"[0-9a-fA-F]{64}", args.apk70_sha256), "Invalid APK 70 SHA-256")
            versions[70] = args.apk70_sha256.lower()
        verified = [
            verify(args.apk_dir / f"apk{version}.apk", version, expected, args.aapt, args.apksigner)
            for version, expected in versions.items()
        ]
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(verified, indent=2) + "\n", encoding="utf-8")
    except ValueError as error:
        print(f"APK verification failed: {error}", file=sys.stderr)
        return 1
    except Exception as error:
        print(f"APK verification failed ({type(error).__name__})", file=sys.stderr)
        return 1
    print("Verified the staging APK package, version codes, signer, hashes, ABI and compiled URL.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
