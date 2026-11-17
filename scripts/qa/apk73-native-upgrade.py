"""Offline native smoke for the original signed Manager 24/7 APKs."""

import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import sqlite3
import stat
import subprocess
import tempfile
import time
from urllib.parse import parse_qs, urlsplit
from urllib.request import HTTPRedirectHandler, build_opener
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile


PACKAGE = "ro.paradim.professionalfoodcost"
ACTIVITY = PACKAGE + "/.MainActivity"
MAIN_COMPONENTS = {ACTIVITY, f"{PACKAGE}/{PACKAGE}.MainActivity"}
LAUNCH_READY_SECONDS = 150
SIGNER = "b7125f9e38bd66ba1226b0ff063d15569320006f3b193a1da297d485deeec3ed"
APK72_SHA256 = "082147d74a7c8801a57fa120436baf44975e1bcc249b9c4fdc5b61432323f996"
# Pin the staging host without writing its address into a public QA branch.
STAGING_HOST_SHA256 = "57834da768f78f6e9072a82f39a54f27dd3b95bb3bd8e647eb9efcc5114b1fbb"
SIGNED_OBJECT_PREFIX = "/storage/v1/object/sign/qa-android-apks/"
DEMO_LABELS = {"Vezi demo instant", "View instant demo"}
HOME_LABELS = {"Acasă", "Home"}
STORAGE_DB = f"/data/user/0/{PACKAGE}/databases/RKStorage"
DEMO_HR_KEY = "manager247.hr.v1.demo"
NORMAL_ARTIFACT = "original-signed-arm64-apks"
ADAPTED_ARTIFACT = "original-signed-arm64-apks-file-library-compatibility"
BRIDGE_ADAPTATION = "verified-arm64-files-in-installed-native-library-dir"
ARM64_ENTRY = re.compile(r"lib/arm64-v8a/(lib[A-Za-z0-9_.+-]+\.so)")


class CheckError(Exception):
    """Only static, safe messages are allowed to reach the runner summary."""


class CommandTimeout(CheckError):
    """A bounded host-side command exceeded its time budget."""


def require(condition, message):
    if not condition:
        raise CheckError(message)


def command(label, args, timeout=30, allow_failure=False, include_stderr=False):
    try:
        process = subprocess.run(
            [str(arg) for arg in args], capture_output=True, text=True, encoding="utf-8",
            errors="replace", timeout=timeout, check=False,
        )
    except subprocess.TimeoutExpired:
        raise CommandTimeout(label + " timed out") from None
    except OSError:
        raise CheckError(label + " unavailable") from None
    if allow_failure and process.returncode:
        return None
    require(process.returncode == 0, label + " failed")
    output = process.stdout + ("\n" + process.stderr if include_stderr else "")
    return output.replace("\r", "")


def crash_findings(log):
    """Identify fixed error categories only from crash records anchored to this package."""
    process = re.compile(r"(?m)^(?:Process:|Cmdline:)\s*([^,\s]+)|>>>\s+([^\s<]+)\s+<<<")
    patterns = {
        "JAVA_RUNTIME": r"(?m)^java\.lang\.RuntimeException\b",
        "REACT_NATIVE_JS": r"\bcom\.facebook\.react\.common\.JavascriptException\b",
        "REACT_NATIVE_DSO_NOT_FOUND": r"\bcouldn't find DSO to load: libreactnative\.so\b",
        "SOLOADER_APK_ABI_MISMATCH": (
            r"(?s)ApplicationSoSource[^\n]*/lib/arm64\b.*?DirectApkSoSource[^\n]*!/lib/x86_64\b"
        ),
        "UNSATISFIED_LINK": r"\bjava\.lang\.UnsatisfiedLinkError\b",
        "CLASS_NOT_FOUND": r"\b(?:java\.lang\.ClassNotFoundException|java\.lang\.NoClassDefFoundError)\b",
        "SIGSEGV": r"\bsignal \d+ \(SIGSEGV\)",
        "SIGABRT": r"\bsignal \d+ \(SIGABRT\)",
        "SIGILL": r"\bsignal \d+ \(SIGILL\)",
        "NATIVE_BRIDGE_FRAME": r"(?m)^\s*#\d+\s+pc\s+[0-9a-fA-F]+\s+[^\s]*libndk_translation\.so\b",
    }
    records = re.split(r"(?m)(?=^FATAL EXCEPTION:|^\*\*\* \*\*\* \*\*\*)", log)
    scoped = [record for record in records if {m[1] or m[2] for m in process.finditer(record)} == {PACKAGE}]
    return [name for name, pattern in patterns.items() if any(re.search(pattern, record) for record in scoped)]


def sha256_file(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def bridge_install_paths(metadata, pm_paths):
    def read_one(key):
        values = re.findall(rf"^\s*{key}=([^\s]+)\s*$", metadata, re.M)
        require(len(values) == 1, "Installed native library metadata is ambiguous")
        return values[0]

    code = read_one("codePath")
    install_root = rf"/data/app/(?:~~[A-Za-z0-9_-]+={{0,2}}/)?{re.escape(PACKAGE)}-[A-Za-z0-9_-]+={{0,2}}"
    require(re.fullmatch(install_root, code), "Installed package code path is outside the reviewed /data/app layout")
    require(read_one("primaryCpuAbi") == "arm64-v8a" and read_one("legacyNativeLibraryDir") == code + "/lib",
            "Installed native library directory does not match the ARM64 app code path")
    require(pm_paths.strip().splitlines() == [f"package:{code}/base.apk"],
            "PackageManager did not report the same single installed base APK")
    return code, code + "/lib/arm64"


def extract_arm64_libraries(apk, directory):
    results = {}
    try:
        with ZipFile(apk) as archive:
            for entry in archive.infolist():
                if not entry.filename.startswith("lib/arm64-v8a/") or entry.is_dir():
                    continue
                match = ARM64_ENTRY.fullmatch(entry.filename)
                require(match and stat.S_IFMT(entry.external_attr >> 16) in (0, stat.S_IFREG),
                        "Invalid ARM64 native library archive path or file type")
                name = match[1]
                require(name not in results, "Duplicate ARM64 native library name")
                target = directory / name
                with archive.open(entry) as source:
                    header = source.read(64)
                    require(len(header) == 64 and header[:7] == b"\x7fELF\x02\x01\x01"
                            and header[16:20] == b"\x03\x00\xb7\x00",
                            "Native library is not a little-endian ELF64 AArch64 shared object")
                    with target.open("xb") as destination:
                        destination.write(header)
                        # Consuming the ZIP stream to EOF verifies this entry's CRC.
                        shutil.copyfileobj(source, destination)
                require(target.stat().st_size == entry.file_size, "Native library archive byte count mismatch")
                results[name] = {"name": name, "sha256": sha256_file(target), "crc32": f"{entry.CRC:08x}"}
    except BadZipFile:
        raise CheckError("ARM64 native library archive is corrupt or failed CRC verification") from None
    require("libreactnative.so" in results, "The original ARM64 React Native library was not found")
    return [results[name] for name in sorted(results)]


def runtime_identity(adapted):
    if not adapted:
        return {"artifactType": NORMAL_ARTIFACT}
    return {"artifactType": ADAPTED_ARTIFACT, "normalRuntimeAcceptance": "NOT_VERIFIED",
            "runtimeAdaptation": {"method": BRIDGE_ADAPTATION, "versions": {}}}


def require_runtime_receipt(report, adapted):
    require(report.get("artifactType") == (ADAPTED_ARTIFACT if adapted else NORMAL_ARTIFACT),
            "The native result does not match the explicitly requested runtime mode")
    if adapted:
        adaptation = report.get("runtimeAdaptation", {})
        versions = adaptation.get("versions", {})
        checks = report.get("checks", {})
        apks = {str(item.get("versionCode")): item.get("sha256") for item in report.get("apks", [])}
        require(report.get("normalRuntimeAcceptance") == "NOT_VERIFIED"
                and adaptation.get("method") == BRIDGE_ADAPTATION and set(versions) == set(apks) == {"72", "73"}
                and all(checks.get(f"apk{version}_bridge_library_adaptation") == "PASS"
                        and proof.get("signedApkBytesUnchanged") is True and proof.get("installedApkSha256") == apks[version]
                        and re.fullmatch(r"[a-f0-9]{64}", apks[version] or "")
                        and re.fullmatch(r"[a-f0-9]{64}", proof.get("installationPathSha256", ""))
                        and proof.get("elf") == "ELF64-AArch64" and proof.get("libraries")
                        for version, proof in versions.items())
                and versions["72"]["installationPathSha256"] != versions["73"]["installationPathSha256"],
                "The adapted runtime result lacks matching signed APK evidence")
    else:
        require("runtimeAdaptation" not in report and "normalRuntimeAcceptance" not in report,
                "An adapted runtime result cannot be used for normal runtime acceptance")


def protected_urls(value):
    urls = [line.strip() for line in value.splitlines() if line.strip()]
    require(urls, "A protected staging delivery URL is required")
    for url in urls:
        parsed = urlsplit(url)
        require(
            parsed.scheme == "https" and hashlib.sha256(parsed.netloc.encode("utf-8")).hexdigest() == STAGING_HOST_SHA256
            and bool(re.fullmatch(re.escape(SIGNED_OBJECT_PREFIX) + r"(?:72|73)/[a-zA-Z0-9][a-zA-Z0-9._-]*", parsed.path))
            and not parsed.fragment and bool(parse_qs(parsed.query).get("token")),
            "Expected a protected staging delivery URL",
        )
    return urls


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def download_apk(destination, urls, version):
    opener = build_opener(NoRedirect)
    temporary = destination.with_suffix(".download")
    try:
        with temporary.open("xb") as target:
            for url in urls:
                with opener.open(url, timeout=40) as source:
                    shutil.copyfileobj(source, target)
        temporary.replace(destination)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise CheckError(f"Protected download for APK {version} failed") from None


def verify_apk(apk, version, expected_sha, aapt, apksigner):
    actual_sha = sha256_file(apk)
    require(actual_sha == expected_sha, f"APK {version} SHA-256 mismatch")
    manifest = command("APK manifest verification", [aapt, "dump", "badging", apk], timeout=60)
    identity = re.search(r"^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", manifest, re.M)
    require(identity and identity.groups() == (PACKAGE, str(version), "1.6.7"), f"APK {version} package or version mismatch")
    minimum = re.search(r"^sdkVersion:'(\d+)'", manifest, re.M)
    require(minimum and int(minimum[1]) <= 30, f"APK {version} requires Android newer than API 30")
    require("application-debuggable" not in manifest, f"APK {version} is debuggable")
    require(re.search(r"^native-code: 'arm64-v8a'\s*$", manifest, re.M), f"APK {version} native ABI mismatch")
    signing = command("APK signature verification", [
        apksigner, "verify", "--min-sdk-version", "30", "--max-sdk-version", "30", "--print-certs", apk,
    ], timeout=60)
    signers = re.findall(r"^Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9]+)\s*$", signing, re.M)
    require([signer.lower() for signer in signers] == [SIGNER], f"APK {version} signer mismatch")
    with ZipFile(apk) as package:
        libraries = {name for name in package.namelist() if re.fullmatch(r"lib/[^/]+/[^/]+\.so", name)}
    require(
        {name.split("/")[1] for name in libraries} == {"arm64-v8a"}
        and "lib/arm64-v8a/libreactnative.so" in libraries,
        f"APK {version} packaged ABI mismatch",
    )
    return {"versionCode": version, "versionName": "1.6.7", "package": PACKAGE,
            "sha256": actual_sha, "signerSha256": SIGNER, "nativeAbi": "arm64-v8a", "minSdk": int(minimum[1])}


def demo_cache_digest(path):
    with closing(sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)) as database:
        row = database.execute("select value from catalystLocalStorage where key = ?", (DEMO_HR_KEY,)).fetchone()
    require(row and isinstance(row[0], str), "Synthetic demo cache fixture is missing")
    data = json.loads(row[0])
    require(isinstance(data, dict) and isinstance(data.get("employees"), list), "Synthetic demo cache fixture was not found")
    require(any(
        item.get("id") == "demo-employee-dana" and item.get("name") == "[DEMO] Dana"
        for item in data["employees"] if isinstance(item, dict)
    ), "Synthetic demo cache fixture was not found")
    return hashlib.sha256(row[0].encode("utf-8")).hexdigest()


class Emulator:
    def __init__(self, adb, serial):
        require(re.fullmatch(r"emulator-\d+", serial), "A disposable Android emulator serial is required")
        self.adb = adb
        self.serial = serial

    def run(self, label, *args, **options):
        return command(label, [self.adb, "-s", self.serial, *args], **options)

    def property(self, name):
        return self.run("Android property", "shell", "getprop", name).strip()

    def verify_boot(self):
        require(self.property("ro.kernel.qemu") == "1", "Android target did not identify itself as an emulator")
        require(self.property("sys.boot_completed") == "1", "Android boot was incomplete")
        require("Service package: found" in self.run("Package service", "shell", "service", "check", "package"),
                "Android package service is unavailable")
        require(self.property("ro.build.version.sdk") == "30", "Expected Android API 30")
        require("arm64-v8a" in self.property("ro.product.cpu.abilist").split(",")
                and self.property("ro.dalvik.vm.native.bridge") == "libndk_translation.so",
                "Expected the ARM64 native bridge")

    def offline(self, disable=False):
        if disable:
            for network in ("wifi", "data"):
                self.run("Disable guest network", "shell", "svc", network, "disable")
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            wifi = self.run("Guest Wi-Fi status", "shell", "settings", "get", "global", "wifi_on", timeout=7).strip()
            data = self.run("Guest mobile-data status", "shell", "settings", "get", "global", "mobile_data", timeout=7).strip()
            state = self.run("Guest default network status", "shell", "dumpsys", "connectivity", timeout=7)
            if wifi == data == "0" and re.search(r"^\s*Active default network:\s*none\s*$", state, re.M):
                return
            time.sleep(1)
        raise CheckError("Android guest isolation could not be verified")

    def clean_start(self):
        packages = self.run("Initial package list", "shell", "pm", "list", "packages", PACKAGE)
        require("package:" + PACKAGE not in packages, "Test requires an emulator without Manager 24/7")

    def install(self, apk, upgrade=False):
        flags = ["-r"] if upgrade else []
        result = self.run("Android APK installation", "install", *flags, apk, timeout=180)
        require(re.search(r"^Success\s*$", result, re.M), "Android did not confirm APK installation")

    def package_info(self, version):
        return self.package_info_for_abi(version, "arm64-v8a")

    def package_info_for_abi(self, version, abi):
        info = self.run("Installed package identity", "shell", "dumpsys", "package", PACKAGE)
        observed = {}
        for key, pattern in {
            "versionCode": r"\bversionCode=(\d+)",
            "uid": r"\b(?:userId|appId)=(\d+)",
            "firstInstallTime": r"\bfirstInstallTime=([^\n]+)",
            "primaryCpuAbi": r"\bprimaryCpuAbi=([^\s]+)",
        }.items():
            match = re.search(pattern, info)
            require(match, "Installed package metadata is incomplete")
            observed[key] = match[1]
        require(observed["versionCode"] == str(version), "Installed version code was unexpected")
        require(observed["primaryCpuAbi"] == abi, "Installed application ABI differs from the required runtime ABI")
        return observed

    def stop(self):
        self.run("Stop isolated test app", "shell", "am", "force-stop", PACKAGE)

    def bridge_file_sha(self, path, *, absent=False):
        quoted = shlex.quote(path)
        check = f"p={quoted}; test ! -L \"$p\" || exit 1; "
        if absent:
            check += 'if test ! -e "$p"; then printf absent; exit 0; fi; '
        check += 'test -f "$p" && test "$(readlink -f "$p")" = "$p" && sha256sum "$p"'
        value = self.run("Verify a scoped emulator file", "shell", check, timeout=50).strip()
        if absent and value == "absent":
            return None
        match = re.fullmatch(r"([a-f0-9]{64})\s+" + re.escape(path), value)
        require(match, "The scoped emulator file SHA-256 could not be read")
        return match[1]

    def current_bridge_paths(self):
        package = self.run("Read installed package native library metadata", "shell", "dumpsys", "package", PACKAGE)
        paths = self.run("Read current installed package APK path", "shell", "pm", "path", "--user", "0", PACKAGE)
        return bridge_install_paths(package, paths)

    def verify_live_bridge_receipt(self, prior, expected_sha):
        require(self.property("ro.product.cpu.abi") == "x86_64",
                "The adapted runtime receipt applies to an x86_64 bridge guest")
        code, lib = self.current_bridge_paths()
        proof = prior["runtimeAdaptation"]["versions"]["73"]
        require(hashlib.sha256(code.encode()).hexdigest() == proof["installationPathSha256"]
                and self.bridge_file_sha(code + "/base.apk") == expected_sha,
                "The current guest APK73 installation does not match the adapted runtime receipt")
        for entry in proof["libraries"]:
            name = entry["name"]
            require(ARM64_ENTRY.fullmatch("lib/arm64-v8a/" + name)
                    and self.bridge_file_sha(lib + "/" + name) == entry["sha256"],
                    "Live APK73 native libraries do not match the adapted runtime receipt")

    def adapt_bridge_libraries(self, apk, expected_sha, version, *, previous_code=None):
        self.verify_boot()
        require(self.property("ro.product.cpu.abi") == "x86_64" and self.property("ro.debuggable") == "1",
                "Bridge adaptation requires the verified debuggable x86_64 emulator")
        self.offline()
        self.run("Open disposable emulator diagnostic access", "root")
        self.run("Wait for diagnostic ADB transport", "wait-for-device", timeout=25)
        require(self.run("Verify diagnostic UID", "shell", "id", "-u").strip() == "0",
                "Bridge adaptation requires diagnostic root in the disposable emulator")
        self.verify_boot()
        self.offline()
        self.package_info(version)
        self.stop()
        state = self.run("Verify the installed application is stopped", "shell",
                         f"pidof {PACKAGE} >/dev/null; [ $? -eq 1 ] && printf stopped")
        require(state.strip() == "stopped", "The installed application was not stopped before adaptation")
        code, lib = self.current_bridge_paths()
        require(code != previous_code, "APK73 did not get a new code path after the exact in-place upgrade")
        base = code + "/base.apk"
        require(sha256_file(apk) == expected_sha and self.bridge_file_sha(base) == expected_sha,
                "The installed APK bytes differ from the original verified artifact")

        roots = (code + "/lib", lib)
        for directory in roots:
            quoted = shlex.quote(directory)
            self.run("Reject links or noncanonical native library directories", "shell",
                     f"p={quoted}; test ! -L \"$p\" && {{ test ! -e \"$p\" || "
                     ' { test -d "$p" && test "$(readlink -f "$p")" = "$p"; }; }')

        with tempfile.TemporaryDirectory(prefix="apk73-arm64-libraries-") as temporary:
            source = Path(temporary)
            libraries = extract_arm64_libraries(apk, source)
            missing = []
            for record in libraries:
                actual = self.bridge_file_sha(f"{lib}/{record['name']}", absent=True)
                require(actual in (None, record["sha256"]), "A different native library already exists in the emulator")
                if actual is None:
                    missing.append(record)
            if missing:
                self.install_bridge_files(source, roots, missing)
            for record in libraries:
                require(self.bridge_file_sha(f"{lib}/{record['name']}") == record["sha256"],
                        "An installed ARM64 library failed SHA-256 readback")

        require(sha256_file(apk) == expected_sha and self.bridge_file_sha(base) == expected_sha,
                "The original APK bytes did not remain identical after bridge adaptation")
        self.offline()
        proof = {"signedApkBytesUnchanged": True, "installedApkSha256": expected_sha,
                 "installationPathSha256": hashlib.sha256(code.encode()).hexdigest(),
                 "elf": "ELF64-AArch64", "libraries": libraries, "newFileCount": len(missing)}
        return code, proof

    def install_bridge_files(self, source, roots, files):
        for directory in roots:
            quoted = shlex.quote(directory)
            self.run("Prepare only the installed package native library directory", "shell",
                     f"set -e; p={quoted}; test ! -L \"$p\"; "
                     'if test ! -e "$p"; then mkdir -m 0755 "$p"; restorecon "$p"; fi; '
                     'test -d "$p"; test "$(readlink -f "$p")" = "$p"')
        stage = self.run("Create a disposable guest transfer directory", "shell", "mktemp", "-d",
                         "/data/local/tmp/manager247-bridge.XXXXXXXX").strip()
        require(re.fullmatch(r"/data/local/tmp/manager247-bridge\.[A-Za-z0-9]{8}", stage),
                "Guest transfer directory did not use the reviewed temporary path")
        try:
            for record in files:
                name = record["name"]
                staged = stage + "/" + name
                dest = roots[-1] + "/" + name
                self.run("Copy one verified ARM64 archive entry to staging", "push", source / name, staged, timeout=45)
                require(self.bridge_file_sha(staged) == record["sha256"], "Staged ARM64 library hash differs")
                destination = shlex.quote(dest)
                entry = shlex.quote(staged)
                self.run("Install the ARM64 library without replacing an existing file", "shell",
                         f"set -eC; p={destination}; test ! -L \"$p\"; test ! -e \"$p\"; "
                         f'cat {entry} > "$p"; chmod 0755 "$p"; restorecon "$p"')
        finally:
            for record in files:
                self.probe("Remove the exact staged ARM64 entry", "shell", "rm", "-f", stage + "/" + record["name"])
            self.probe("Remove the empty guest transfer directory", "shell", "rmdir", stage)

    def probe(self, label, *args, timeout=8):
        try:
            return self.run(label, *args, timeout=timeout, allow_failure=True)
        except CheckError:
            return None

    def focus(self):
        window = self.probe("Foreground window", "shell", "dumpsys", "window", "windows")
        if window is None:
            return "UNAVAILABLE"
        match = re.search(r"^\s*mCurrentFocus=Window\{[^\n}]*\bu0\s+([^\s}]+)", window, re.M)
        if not match:
            return "NO_FOCUSED_WINDOW"
        if match[1] in MAIN_COMPONENTS:
            return "MAIN_ACTIVITY"
        return "OTHER_WINDOW"

    def app_process(self):
        pid = self.probe("Android app process", "shell", "pidof", PACKAGE)
        if pid and re.fullmatch(r"\d+(?: \d+)*", pid.strip()):
            return pid.strip()
        return None

    def launch_diagnostics(self):
        transport = self.probe("Guest ADB transport", "get-state", timeout=5)
        exit_info = self.probe("Android app exit information", "shell", "dumpsys", "activity", "exit-info", PACKAGE)
        crashes = self.probe("Recent app crash records", "shell", "logcat", "-b", "crash",
                             "-d", "-v", "raw", "-t", "240")
        bridge = self.probe("Recent native bridge errors", "shell", "logcat", "-b", "main", "-b", "system",
                            "-d", "-v", "raw", "-t", "240", "NativeBridge:W", "*:S")
        bridge_errors = [
            name for name, pattern in {
                "BRIDGE_LOAD_FAILURE": r"(?:fail|unable|cannot|couldn't)[^\n]*(?:load|initialize|open)",
                "BRIDGE_UNSUPPORTED_ABI": r"unsupported[^\n]*\b(?:abi|arm64)\b",
            }.items()
            if bridge and re.search(pattern, bridge, re.I)
        ]
        return {
            "adbConnected": transport.strip() == "device" if transport else None,
            "foreground": self.focus(),
            "processAlive": self.app_process() is not None,
            "recentAppExitReasonCodes": [
                int(reason) for reason in re.findall(r"\breason=(\d{1,2})\b", exit_info or "")[:5]
            ] if exit_info is not None else None,
            "appCrashCategories": crash_findings(crashes) if crashes is not None else None,
            "guestNativeBridgeErrors": bridge_errors if bridge is not None else None,
        }

    def launch(self, evidence=None):
        evidence = {} if evidence is None else evidence
        start = time.monotonic()
        evidence.update(launcher="UNVERIFIED", dispatch="NOT_RUN", readiness="NOT_RUN", uiProbeTimeouts=0)
        intent = ("-a", "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER")
        try:
            resolution = self.run("Resolve Android package launcher", "shell", "cmd", "package", "resolve-activity",
                                  "--brief", "--user", "0", *intent, "-p", PACKAGE, timeout=10)
            components = {line.strip() for line in resolution.splitlines() if line.strip() in MAIN_COMPONENTS}
            require(len(components) == 1, "Android did not resolve the exact Manager 24/7 launcher")
            component = next(iter(components))
            evidence["launcher"] = "MATCHED"
            try:
                # Issue the launcher request without tying ADB lifetime to Android's draw wait.
                result = self.run("Dispatch Android main activity", "shell", "am", "start", "--user", "0",
                                  *intent, "-n", component, timeout=15, include_stderr=True)
            except CommandTimeout:
                evidence["dispatch"] = "TIMED_OUT"
                raise
            except CheckError:
                evidence["dispatch"] = "COMMAND_FAILED"
                raise
            started = re.search(r"^Starting: [^\n]*\bcmp=([^\s}]+)", result, re.M)
            if not started or started[1] not in MAIN_COMPONENTS or re.search(r"^\s*Error\b", result, re.M):
                evidence["dispatch"] = "REJECTED"
                raise CheckError("Android rejected or did not confirm the launcher request")
            evidence.update(dispatch="ACCEPTED", readiness="WAITING_FOR_SIGN_IN")
            deadline = time.monotonic() + LAUNCH_READY_SECONDS
            while time.monotonic() < deadline:
                if self.focus() == "MAIN_ACTIVITY" and (pid := self.app_process()) is not None:
                    try:
                        demo = self.visible_once(DEMO_LABELS)
                    except CommandTimeout:
                        evidence["uiProbeTimeouts"] += 1
                    except CheckError:
                        pass
                    else:
                        if demo is not None and self.focus() == "MAIN_ACTIVITY" and self.app_process() == pid:
                            evidence["readiness"] = "SIGN_IN_VISIBLE"
                            return
                time.sleep(1)
            evidence["readiness"] = "TIMED_OUT"
            raise CheckError("Expected foreground MainActivity, visible Instant Demo sign-in control and stable process")
        except CheckError:
            evidence["diagnostics"] = self.launch_diagnostics()
            raise
        finally:
            evidence["elapsedMs"] = round((time.monotonic() - start) * 1000)

    def visible_once(self, labels):
        on_device = "/data/local/tmp/manager247-apk73-qa.xml"
        self.run("Clear prior UI observation", "shell", "rm", "-f", on_device, timeout=5)
        try:
            dumped = self.run("Read current UI hierarchy", "shell", "uiautomator", "dump", on_device,
                              timeout=20, allow_failure=True)
            if not dumped or "dumped to" not in dumped.lower():
                return None
            xml = self.run("Inspect test UI in memory", "exec-out", "cat", on_device, timeout=8)
            tree = ElementTree.fromstring(xml)
            for node in tree.iter("node"):
                labels_in_node = {node.get("text", "").strip(), node.get("content-desc", "").strip()}
                if node.get("package") == PACKAGE and labels & labels_in_node:
                    bounds = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.get("bounds", ""))
                    if bounds:
                        left, top, right, bottom = map(int, bounds.groups())
                        if left < right and top < bottom:
                            return (left + right) // 2, (top + bottom) // 2
        except ElementTree.ParseError:
            return None
        finally:
            self.probe("Remove the guest UI observation", "shell", "rm", "-f", on_device, timeout=5)
        return None

    def find_visible(self, labels):
        deadline = time.monotonic() + 85
        while time.monotonic() < deadline:
            try:
                location = self.visible_once(labels)
                if location is not None:
                    return location
            except CommandTimeout:
                pass
            time.sleep(1)
        raise CheckError("Expected native UI was not observed before the deadline")

    def create_demo_cache(self):
        x, y = self.find_visible(DEMO_LABELS)
        self.run("Enter local demo on isolated emulator", "shell", "input", "tap", str(x), str(y))
        self.find_visible(HOME_LABELS)
        self.stop()
        return self.cache_digest()

    def cache_digest(self):
        require(self.property("ro.debuggable") == "1", "Root cache read requires a debuggable emulator image")
        self.run("Enable guest diagnostic access", "root")
        self.run("Wait for guest diagnostic transport", "wait-for-device", timeout=25)
        require(self.run("Confirm guest diagnostic access", "shell", "id", "-u").strip() == "0",
                "Read-only guest cache access unavailable")
        with tempfile.TemporaryDirectory(prefix="apk73-synthetic-cache-") as directory:
            path = Path(directory) / "RKStorage"
            self.run("Copy stopped synthetic cache", "pull", STORAGE_DB, path)
            for suffix in ("-wal", "-shm"):
                remote = STORAGE_DB + suffix
                if self.run("Check optional cache companion", "shell", "test", "-f", remote, allow_failure=True) is not None:
                    self.run("Copy synthetic cache companion", "pull", remote, str(path) + suffix)
            return demo_cache_digest(path)


def publish(report, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    safe_json = json.dumps(report, indent=2) + "\n"
    path.write_text(safe_json, encoding="utf-8")
    print(safe_json, end="")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["prepare", "native"])
    parser.add_argument("--apk-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--aapt", required=True)
    parser.add_argument("--apksigner", required=True)
    parser.add_argument("--adb", default="adb")
    parser.add_argument("--serial", default="emulator-5554")
    parser.add_argument("--probe-demo-cache", action="store_true")
    parser.add_argument("--adapt-bridge-libraries", action="store_true",
                        help="Use the explicit file-based library compatibility mode in a disposable x86_64 guest")
    args = parser.parse_args()
    if args.adapt_bridge_libraries and args.phase != "native":
        parser.error("Bridge library adaptation applies only to the native compatibility test")
    report = {"status": "NOT_RUN", **runtime_identity(args.adapt_bridge_libraries), "checks": {},
              "authenticatedContinuity": "NOT_RUN", "hrAndHaccpFunctionalCoverage": "NOT_RUN"}
    checks = report["checks"]
    stage = "apk_provenance"
    status = 1
    try:
        expected73 = os.environ.get("APK73_SHA256", "").strip().lower()
        require(re.fullmatch(r"[a-f0-9]{64}", expected73), "APK 73 SHA-256 was not provided in the required format")
        artifacts = {72: APK72_SHA256, 73: expected73}
        files = {version: args.apk_dir / f"apk{version}.apk" for version in artifacts}
        if args.phase == "prepare":
            args.apk_dir.mkdir(parents=True, exist_ok=True)
            for version, location in files.items():
                sources = []
                for part in range(1, 5):
                    value = os.environ.pop(f"QA_APK{version}_URL_{part}", "").strip()
                    if not value:
                        continue
                    require("\n" not in value and part == len(sources) + 1, "APK link positions are not consecutive")
                    sources.extend(protected_urls(value))
                require(sources, f"No protected staging link supplied for APK {version}")
                download_apk(location, sources, version)
        report["apks"] = [verify_apk(files[v], v, digest, args.aapt, args.apksigner) for v, digest in artifacts.items()]
        checks[stage] = "PASS"
        if args.phase == "prepare":
            report["status"] = "PROVENANCE_VERIFIED"
            status = 0
        else:
            guest = Emulator(args.adb, args.serial)
            stage = "isolated_guest"
            guest.verify_boot()
            guest.offline(disable=True)
            guest.clean_start()
            checks[stage] = "PASS"
            stage = "apk72_install_and_launch"
            guest.install(files[72])
            baseline = guest.package_info(72)
            report["installed"] = [baseline]
            initial_code = None
            if args.adapt_bridge_libraries:
                stage = "apk72_bridge_library_adaptation"
                initial_code, proof = guest.adapt_bridge_libraries(files[72], artifacts[72], 72)
                report["runtimeAdaptation"]["versions"]["72"] = proof
                checks[stage] = "PASS"
                stage = "apk72_install_and_launch"
            launches = report["launch"] = {"apk72": {}}
            guest.launch(launches["apk72"])
            checks[stage] = "PASS"
            before_cache = None
            checks["synthetic_demo_cache"] = "NOT_RUN"
            if args.probe_demo_cache:
                try:
                    before_cache = guest.create_demo_cache()
                except (CheckError, sqlite3.Error, ValueError, OSError):
                    checks["synthetic_demo_cache"] = "UNVERIFIED"
            guest.stop()
            stage = "apk73_in_place_update"
            guest.offline()
            guest.install(files[73], upgrade=True)
            update = guest.package_info(73)
            require(all(baseline[key] == update[key] for key in ("uid", "firstInstallTime")),
                    "Android changed package UID or first-install time")
            report["installed"] = [baseline, update]
            checks[stage] = "PASS"
            after_install_cache = None
            if before_cache:
                try:
                    after_install_cache = guest.cache_digest()
                    report["syntheticCacheSha256"] = {"before": before_cache, "afterInstall": after_install_cache}
                    checks["synthetic_demo_cache"] = "UNVERIFIED" if before_cache == after_install_cache else "FAIL"
                except (CheckError, sqlite3.Error, ValueError, OSError):
                    checks["synthetic_demo_cache"] = "UNVERIFIED"
            if args.adapt_bridge_libraries:
                stage = "apk73_bridge_library_adaptation"
                _, proof = guest.adapt_bridge_libraries(files[73], artifacts[73], 73, previous_code=initial_code)
                report["runtimeAdaptation"]["versions"]["73"] = proof
                checks[stage] = "PASS"
            stage = "apk73_launch_after_update"
            launches["apk73"] = {}
            guest.launch(launches["apk73"])
            guest.offline()
            checks[stage] = "PASS"
            if after_install_cache and checks["synthetic_demo_cache"] != "FAIL":
                try:
                    guest.stop()
                    after_launch_cache = guest.cache_digest()
                    report["syntheticCacheSha256"]["afterLaunchBeforeDemoReset"] = after_launch_cache
                    checks["synthetic_demo_cache"] = "PASS" if before_cache == after_launch_cache else "FAIL"
                except (CheckError, sqlite3.Error, ValueError, OSError):
                    checks["synthetic_demo_cache"] = "UNVERIFIED"
            if checks["synthetic_demo_cache"] == "PASS":
                report["status"], status = "PASS", 0
            elif checks["synthetic_demo_cache"] == "FAIL":
                report["status"] = "FAIL"
            else:
                report["status"], status = "INCOMPLETE", 2
    except (CheckError, OSError, ValueError, sqlite3.Error) as error:
        report["status"] = "FAIL"
        checks[stage] = "FAIL"
        report["error"] = str(error) if isinstance(error, CheckError) else type(error).__name__
    except Exception as error:
        report["status"] = "FAIL"
        checks[stage] = "FAIL"
        report["error"] = type(error).__name__
    publish(report, args.report)
    return status


if __name__ == "__main__":
    raise SystemExit(main())
