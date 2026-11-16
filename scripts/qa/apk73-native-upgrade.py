"""Offline native smoke for the original signed Manager 24/7 APKs."""

import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import tempfile
import time
from urllib.parse import parse_qs, urlsplit
from urllib.request import HTTPRedirectHandler, build_opener
from xml.etree import ElementTree
from zipfile import ZipFile


PACKAGE = "ro.paradim.professionalfoodcost"
ACTIVITY = PACKAGE + "/.MainActivity"
SIGNER = "b7125f9e38bd66ba1226b0ff063d15569320006f3b193a1da297d485deeec3ed"
APK72_SHA256 = "082147d74a7c8801a57fa120436baf44975e1bcc249b9c4fdc5b61432323f996"
# Pin the staging host without writing its address into a public QA branch.
STAGING_HOST_SHA256 = "57834da768f78f6e9072a82f39a54f27dd3b95bb3bd8e647eb9efcc5114b1fbb"
SIGNED_OBJECT_PREFIX = "/storage/v1/object/sign/qa-android-apks/"
DEMO_LABELS = {"Vezi demo instant", "View instant demo"}
HOME_LABELS = {"Acasă", "Home"}
STORAGE_DB = f"/data/user/0/{PACKAGE}/databases/RKStorage"
DEMO_HR_KEY = "manager247.hr.v1.demo"


class CheckError(Exception):
    """Only static, safe messages are allowed to reach the runner summary."""


def require(condition, message):
    if not condition:
        raise CheckError(message)


def command(label, args, timeout=30, allow_failure=False):
    try:
        process = subprocess.run(
            [str(arg) for arg in args], capture_output=True, text=True, encoding="utf-8",
            errors="replace", timeout=timeout, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise CheckError(label + " unavailable or timed out") from None
    if allow_failure and process.returncode:
        return None
    require(process.returncode == 0, label + " failed")
    return process.stdout.replace("\r", "")


def sha256_file(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


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
        require(observed["primaryCpuAbi"] == "arm64-v8a", "Installed application ABI was not ARM64")
        return observed

    def stop(self):
        self.run("Stop isolated test app", "shell", "am", "force-stop", PACKAGE)

    def launch(self):
        result = self.run("Launch Android main activity", "shell", "am", "start", "-W", "-n", ACTIVITY, timeout=60)
        require(re.search(r"^Status:\s+ok\s*$", result, re.M)
                and re.search(r"^Activity:\s+" + re.escape(PACKAGE) + r"/", result, re.M),
                "Android did not launch the expected main activity")
        self.find_visible(DEMO_LABELS)
        pid = self.run("Android app process", "shell", "pidof", PACKAGE).strip()
        require(re.fullmatch(r"\d+(?: \d+)*", pid), "Expected an active app process after loading sign-in")

    def find_visible(self, labels):
        deadline = time.monotonic() + 85
        on_device = "/data/local/tmp/manager247-apk73-qa.xml"
        while time.monotonic() < deadline:
            self.run("Clear prior UI observation", "shell", "rm", "-f", on_device, timeout=5)
            dumped = self.run("Read current UI hierarchy", "shell", "uiautomator", "dump", on_device,
                              timeout=20, allow_failure=True)
            if dumped and "dumped to" in dumped.lower():
                xml = self.run("Inspect test UI in memory", "exec-out", "cat", on_device, timeout=8)
                try:
                    tree = ElementTree.fromstring(xml)
                except ElementTree.ParseError:
                    time.sleep(1)
                    continue
                for node in tree.iter("node"):
                    labels_in_node = {node.get("text", "").strip(), node.get("content-desc", "").strip()}
                    if node.get("package") == PACKAGE and labels & labels_in_node:
                        bounds = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.get("bounds", ""))
                        if bounds:
                            left, top, right, bottom = map(int, bounds.groups())
                            if left < right and top < bottom:
                                return (left + right) // 2, (top + bottom) // 2
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
    args = parser.parse_args()
    report = {"status": "NOT_RUN", "artifactType": "original-signed-arm64-apks", "checks": {},
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
            guest.launch()
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
            stage = "apk73_launch_after_update"
            guest.launch()
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
