"""Build a QA-signed x86 APK from verified native outputs and exact release entries."""

import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile
from source_snapshot import snapshot
from zipfile import BadZipFile, ZIP_STORED, ZipFile, ZipInfo


PRODUCT_PACKAGE = "ro.paradim.professionalfoodcost"
PRODUCT_SHA256 = None
PRODUCT_SIGNER = "b7125f9e38bd66ba1226b0ff063d15569320006f3b193a1da297d485deeec3ed"
PRODUCT_HBC = None
RUNTIME_SOURCE = None
BUILD_HEAD = None
SOURCE_SNAPSHOT = None
NATIVE_LIBRARY_COUNT = None
QA_MODE = "source-matched-x86-qa"
QA_NAME = "Manager-24-7-v1.6.7-build74-x86_64-QA-only.apk"
SIGNER_ENTRY = re.compile(r"META-INF/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC)|SIG-[^/]+)", re.I)
LIBRARY_NAME = re.compile(r"lib[A-Za-z0-9_.+-]+\.so")
DEX_ENTRY = re.compile(r"classes(?:[2-9]|[1-9]\d+)?\.dex")


class QaError(Exception):
    """Error messages contain no credential values or raw tool output."""


def require(condition, message):
    if not condition:
        raise QaError(message)


def validate_release_manifest(value):
    require(isinstance(value, dict) and value.get('schemaVersion') == 1
            and value.get('package') == PRODUCT_PACKAGE and value.get('versionCode') == 74
            and value.get('versionName') == '1.6.7'
            and value.get('originalSignerSha256') == PRODUCT_SIGNER
            and isinstance(value.get('gitHead'), str) and re.fullmatch(r'[a-f0-9]{40}', value['gitHead'])
            and all(isinstance(value.get(k), str) and re.fullmatch(r'[a-f0-9]{64}', value[k]) for k in
                    ['sourceSnapshotSha256', 'originalApkSha256', 'originalSignerSha256', 'hbcSha256'])
            and type(value.get('nativeLibraryCount')) is int and value['nativeLibraryCount'] > 0,
            'The approved APK74 release manifest is missing or mismatched')
    return value


def validate_native_build(proof, release, log):
    expected_args = [':app:stripReleaseDebugSymbols', '--offline', '--no-daemon', '--max-workers=2', '--console=plain',
                     '-PreactNativeArchitectures=x86_64', '-Pkotlin.compiler.execution.strategy=in-process']
    try:
        times = [datetime.datetime.fromisoformat(value) for value in
                 [release['capturedAt'], proof['startedAt'], proof['finishedAt']]]
        chronological = all(value.tzinfo for value in times) and times[0] <= times[1] <= times[2]
    except (KeyError, TypeError, ValueError):
        chronological = False
    require(proof.get('exitCode') == 0 and proof.get('runtimeSource') == release['gitHead']
            and proof.get('buildHead') == release['gitHead'] and proof.get('abi') == 'x86_64'
            and proof.get('sourceSnapshotSha256') == release['sourceSnapshotSha256']
            and isinstance(proof.get('nativeLibraries'), dict) and proof['nativeLibraries']
            and proof.get('gradleArgs') == expected_args and chronological
            and proof.get('originalApkSha256') == release['originalApkSha256']
            and proof.get('trackedSourceUnchanged') is True and proof.get('originalApkUnchanged') is True
            and log.is_file() and not log.is_symlink() and sha256_file(log) == proof.get('logSha256')
            and 'BUILD SUCCESSFUL' in log.read_text(encoding='utf-8', errors='replace'),
            'The offline x86 native build proof is missing or mismatched')


def load_release_manifest(path):
    global PRODUCT_SHA256, PRODUCT_HBC, RUNTIME_SOURCE, BUILD_HEAD, SOURCE_SNAPSHOT, NATIVE_LIBRARY_COUNT
    value = validate_release_manifest(json.loads(path.read_text(encoding='utf-8-sig')))
    PRODUCT_SHA256 = value['originalApkSha256']
    PRODUCT_HBC = value['hbcSha256']
    RUNTIME_SOURCE = BUILD_HEAD = value['gitHead']
    SOURCE_SNAPSHOT = value['sourceSnapshotSha256']
    NATIVE_LIBRARY_COUNT = value['nativeLibraryCount']
    return value


def sha256_file(path):
    with path.open("rb") as data:
        return hashlib.file_digest(data, "sha256").hexdigest()


def validate_elf(header, machine):
    require(len(header) == 64 and header[:7] == b"\x7fELF\x02\x01\x01"
            and header[16:18] == b"\x03\x00" and int.from_bytes(header[18:20], "little") == machine,
            "Native library is not the expected ELF64 x86_64 shared object" if machine == 62
            else "The released ARM64 ELF metadata is unexpected")


def entry_record(archive, entry):
    with archive.open(entry) as data:
        return {"sha256": hashlib.file_digest(data, "sha256").hexdigest(), "bytes": entry.file_size,
                "compression": entry.compress_type}


def inventory_apk(path):
    runtime = {}
    libraries = {}
    signatures = []
    seen = set()
    with ZipFile(path) as archive:
        for entry in archive.infolist():
            name = entry.filename
            require(name not in seen and chr(92) not in name and not name.startswith("/")
                    and all(part not in (".", "..") for part in name.split("/")), "Unexpected or duplicate APK entry")
            seen.add(name)
            if entry.is_dir():
                continue
            if SIGNER_ENTRY.fullmatch(name):
                signatures.append(name)
            elif name.startswith("lib/"):
                parts = name.split("/")
                require(len(parts) == 3 and parts[1] in ("arm64-v8a", "x86_64")
                        and LIBRARY_NAME.fullmatch(parts[2]), "Unexpected APK native library layout")
                with archive.open(entry) as data:
                    machine = 183 if parts[1] == "arm64-v8a" else 62
                    validate_elf(data.read(64), machine)
                libraries[name] = {"elfMachine": machine, **entry_record(archive, entry)}
            else:
                runtime[name] = entry_record(archive, entry)
    require({"AndroidManifest.xml", "resources.arsc", "assets/app.config", "assets/index.android.bundle"} <= runtime.keys()
            and "classes.dex" in runtime and libraries, "Incomplete release runtime entries")
    return {"runtimeEntries": runtime, "nativeLibraries": libraries, "signingEntries": signatures}


def inventory_x86_libraries(directory, expected_names):
    require(directory.is_dir() and not directory.is_symlink(), "The stripped x86_64 library directory is missing")
    files = sorted(directory.iterdir())
    require({item.name for item in files} == expected_names, "The x86_64 library set differs from the signed release")
    native = {}
    for item in files:
        require(item.is_file() and not item.is_symlink(), "The stripped x86_64 library is not a regular file")
        with item.open("rb") as data:
            validate_elf(data.read(64), 62)
        native[f"lib/x86_64/{item.name}"] = {"elfMachine": 62, "sha256": sha256_file(item),
                                           "bytes": item.stat().st_size, "compression": ZIP_STORED}
    return native


def assemble_unsigned(original, stripped, output):
    require(not output.exists() and not output.is_symlink() and original.resolve() != output.resolve(),
            "A separate fresh QA APK output is required")
    proof = inventory_apk(original)
    source_libraries = proof["nativeLibraries"]
    require(all(entry["elfMachine"] == 183 for entry in source_libraries.values()),
            "The verified original library set is not exclusively ARM64")
    expected_names = {name.rsplit("/", 1)[1] for name in source_libraries}
    proof["nativeLibraries"] = inventory_x86_libraries(stripped, expected_names)
    with ZipFile(original) as source, ZipFile(output, "x", allowZip64=False) as destination:
        for name in proof["runtimeEntries"]:
            existing = source.getinfo(name)
            entry = ZipInfo(name, existing.date_time)
            entry.compress_type = existing.compress_type
            entry.external_attr = existing.external_attr
            with source.open(existing) as input_data, destination.open(entry, "w") as output_data:
                shutil.copyfileobj(input_data, output_data)
        for name in proof["nativeLibraries"]:
            destination.write(stripped / name.rsplit("/", 1)[1], name, compress_type=ZIP_STORED)
    return proof


def verify_content(apk, expected):
    verified = inventory_apk(apk)
    require(verified["runtimeEntries"] == expected["runtimeEntries"],
            "QA APK non-native entry hashes, sizes or compression differ from the original")
    require(verified["nativeLibraries"] == expected["nativeLibraries"], "QA APK native entry hashes or ELF metadata differ")
    require(not verified["signingEntries"], "Unexpected v1 signing entries in the QA-only APK")
    return verified


def command(label, args, env=None, timeout=120):
    try:
        result = subprocess.run([str(value) for value in args], capture_output=True, text=True, encoding="utf-8",
                                errors="replace", check=False, timeout=timeout, env=env)
    except (OSError, subprocess.TimeoutExpired):
        raise QaError(label + " unavailable or timed out") from None
    require(result.returncode == 0, label + " failed")
    return result.stdout


def signer_digest(java, signer, apk):
    output = command("APK signature verification", [java, "-jar", signer, "verify", "--print-certs", "--verbose", apk])
    candidates = re.findall(r"Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9]{64})", output)
    require(len(candidates) == 1, "Expected one verifiable APK signer")
    return candidates[0].lower()


def verify_badging(aapt, apk, abi):
    output = command("APK Android metadata verification", [aapt, "dump", "badging", apk])
    require(f"package: name='{PRODUCT_PACKAGE}' versionCode='74' versionName='1.6.7'" in output
            and re.search(r"^sdkVersion:'24'\s*$", output, re.M)
            and re.findall(r"^native-code:\s*(.+)$", output, re.M) == [f"'{abi}'"]
            and "application-debuggable" not in output, "APK release metadata or ABI is unexpected")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release-manifest", type=Path, required=True)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--original", type=Path, required=True)
    parser.add_argument("--build-proof", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--sdk", type=Path, required=True)
    parser.add_argument("--jdk", type=Path, required=True)
    args = parser.parse_args()
    try:
        release = load_release_manifest(args.release_manifest)
        proof = json.loads(args.build_proof.read_text(encoding="utf-8-sig"))
        validate_native_build(proof, release, args.build_proof.with_name('strip-release-x86.log'))
        git = ["git", "-C", args.repo]
        current_source = snapshot(args.repo)
        require(current_source["gitHead"] == BUILD_HEAD and current_source["sourceSnapshotSha256"] == SOURCE_SNAPSHOT,
                "The exact committed release source changed")
        changes = ""
        require(not (args.repo / "android/keystore.properties").exists(),
                "A release signing configuration is present in the source checkout")
        require(sha256_file(args.original) == PRODUCT_SHA256, "The original released ARM64 APK SHA-256 differs")

        build_tools = args.sdk / "build-tools/36.0.0"
        suffix = ".exe" if os.name == "nt" else ""
        java = args.jdk / "bin" / ("java" + suffix)
        keytool = args.jdk / "bin" / ("keytool" + suffix)
        aapt = build_tools / ("aapt" + suffix)
        align = build_tools / ("zipalign" + suffix)
        signer = build_tools / "lib/apksigner.jar"
        require(all(path.is_file() for path in (java, keytool, aapt, align, signer)), "Required local Android tools are missing")
        verify_badging(aapt, args.original, "arm64-v8a")
        require(signer_digest(java, signer, args.original) == PRODUCT_SIGNER, "Original production APK signer differs")

        target = args.out / QA_NAME
        report_path = args.out / "qa-package-proof.json"
        require(args.out.is_dir() and not args.out.is_symlink() and not target.exists() and not target.is_symlink()
                and not report_path.exists() and not report_path.is_symlink(), "A fresh QA package and proof path are required")
        stripped = args.repo / "android/app/build/intermediates/stripped_native_libs/release/stripReleaseDebugSymbols/out/lib/x86_64"
        with tempfile.TemporaryDirectory(prefix="pack-qa-x86-", dir=args.out) as directory:
            work = Path(directory)
            unsigned = work / "unsigned.apk"
            aligned = work / "aligned.apk"
            signed = work / "signed-qa.apk"
            key = work / "isolated-qa-signing.p12"
            contents = assemble_unsigned(args.original, stripped, unsigned)
            require(contents["runtimeEntries"]["assets/index.android.bundle"]["sha256"] == PRODUCT_HBC
                    and len(contents["nativeLibraries"]) == NATIVE_LIBRARY_COUNT
                    and contents["nativeLibraries"] == proof["nativeLibraries"], "Published HBC or native library count differs")
            command("QA APK zip alignment", [align, "-P", "16", "-v", "4", unsigned, aligned])
            password_var = "APK74_X86_QA_SIGNER_PASSWORD"
            key_env = {**os.environ, password_var: secrets.token_hex(24)}
            command("Generate an isolated QA-only signing key",
                    [keytool, "-genkeypair", "-keystore", key, "-storetype", "PKCS12",
                     "-storepass:env", password_var, "-keypass:env", password_var, "-alias", "apk74-x86-qa",
                     "-keyalg", "RSA", "-keysize", "2048", "-validity", "30", "-dname", "CN=Manager 247 APK74 Emulator QA"],
                    env=key_env)
            command("Sign the separate QA-only APK",
                    [java, "-jar", signer, "sign", "--ks", key, "--ks-key-alias", "apk74-x86-qa",
                     "--ks-pass", f"env:{password_var}", "--key-pass", f"env:{password_var}",
                     "--v1-signing-enabled", "false", "--v2-signing-enabled", "true", "--v3-signing-enabled", "true",
                     "--v4-signing-enabled", "false", "--out", signed, aligned], env=key_env)
            command("Check signed QA APK zip alignment", [align, "-c", "-P", "16", "-v", "4", signed])
            verify_badging(aapt, signed, "x86_64")
            certificate = signer_digest(java, signer, signed)
            require(certificate != PRODUCT_SIGNER, "The QA certificate unexpectedly matches production")
            verified = verify_content(signed, contents)
            require(sha256_file(args.original) == PRODUCT_SHA256, "Original APK bytes changed during QA packaging")
            result = {
                "artifactType": QA_MODE, "normalArm64RuntimeAcceptance": "NOT_VERIFIED", "apk73To74Upgrade": "NOT_RUN",
                "runtimeSource": RUNTIME_SOURCE, "nativeBuildHead": BUILD_HEAD,
                "sourceSnapshotSha256": SOURCE_SNAPSHOT, "releaseManifest": release,
                "runtimeSourceTree": command("Read release source tree", [*git, "rev-parse", RUNTIME_SOURCE + "^{tree}"]).strip(),
                "nativeBuildTree": command("Read QA build source tree", [*git, "rev-parse", BUILD_HEAD + "^{tree}"]).strip(),
                "trackedSourceDifferences": changes.splitlines(), "gradleBuild": proof,
                "buildInputsSha256": {
                    name: sha256_file(args.repo / name) for name in (
                        "package-lock.json", "android/gradle.properties", "android/app/build.gradle",
                        "android/gradle/wrapper/gradle-wrapper.properties",
                    )
                },
                "originalApkSha256": PRODUCT_SHA256, "originalApkBytesUnchanged": True, "originalSignerSha256": PRODUCT_SIGNER,
                "qaApkName": QA_NAME, "qaApkSha256": sha256_file(signed), "qaSignerSha256": certificate,
                "package": PRODUCT_PACKAGE, "versionCode": 74, "abi": "x86_64",
                "hbcSha256": PRODUCT_HBC,
                "dexSha256": {name: data["sha256"] for name, data in verified["runtimeEntries"].items() if DEX_ENTRY.fullmatch(name)},
                "nonNativeEntries": verified["runtimeEntries"], "nativeLibraries": verified["nativeLibraries"],
            }
            with target.open("xb") as local, signed.open("rb") as built:
                shutil.copyfileobj(built, local)
            require(sha256_file(target) == result["qaApkSha256"], "The final QA output did not match the verified APK")
            with report_path.open("x", encoding="utf-8") as evidence:
                json.dump(result, evidence, indent=2)
                evidence.write("\n")
        print(json.dumps({key: result[key] for key in ("artifactType", "qaApkName", "qaApkSha256", "qaSignerSha256", "hbcSha256")}))
        return 0
    except (QaError, OSError, ValueError, BadZipFile) as error:
        print(str(error) if isinstance(error, QaError) else type(error).__name__)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
