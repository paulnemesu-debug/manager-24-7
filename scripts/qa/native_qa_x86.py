"""Run native demo flows with one separately signed, source-matched x86_64 QA APK."""

import argparse
import importlib.util
import json
from pathlib import Path
import re
import sqlite3
import time

import pack_qa


here = Path(__file__).resolve().parent
helper_dir = here if (here / "apk73_native_extra.py").is_file() else here.parent / "apk74-ci"
spec = importlib.util.spec_from_file_location("apk73_local_extra", helper_dir / "apk73_native_extra.py")
extra = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extra)
native = extra.native


def display_state(power, policy):
    def one(text, key, allowed):
        values = re.findall(r'^\s*' + re.escape(key) + r'=(\S+)\s*$', text or '', re.M)
        return values[0] if len(values) == 1 and values[0] in allowed else 'UNKNOWN'
    def boolean(text, key):
        value = one(text, key, {'true', 'false'})
        return value == 'true' if value != 'UNKNOWN' else None
    keyguard = (policy or '').partition('KeyguardServiceDelegate')[2]
    return {
        'wakefulness': one(power, 'mWakefulness', {'Awake', 'Asleep', 'Dozing', 'Dreaming'}),
        'displayReady': boolean(power, 'mDisplayReady'), 'stayOn': boolean(power, 'mStayOn'),
        'keyguardShowing': boolean(keyguard, 'showing'),
        'screenState': one(keyguard, 'screenState', {'SCREEN_STATE_OFF', 'SCREEN_STATE_TURNING_ON',
                                                   'SCREEN_STATE_ON', 'SCREEN_STATE_TURNING_OFF'}),
        'interactiveState': one(keyguard, 'interactiveState', {'INTERACTIVE_STATE_SLEEP', 'INTERACTIVE_STATE_WAKING',
                                                             'INTERACTIVE_STATE_AWAKE', 'INTERACTIVE_STATE_GOING_TO_SLEEP'}),
    }


def verify_qa_proof(proof, sha, signer):
    pack_qa.require(all(re.fullmatch(r"[a-f0-9]{64}", value) for value in (sha, signer))
                    and signer != pack_qa.PRODUCT_SIGNER, "An exact QA-only artifact hash and test certificate are required")
    expected = {
        "artifactType": pack_qa.QA_MODE, "runtimeSource": pack_qa.RUNTIME_SOURCE,
        "sourceSnapshotSha256": pack_qa.SOURCE_SNAPSHOT,
        "abi": "x86_64", "originalApkSha256": pack_qa.PRODUCT_SHA256, "hbcSha256": pack_qa.PRODUCT_HBC,
        "qaApkSha256": sha, "qaSignerSha256": signer, "package": pack_qa.PRODUCT_PACKAGE, "versionCode": 74,
        "normalArm64RuntimeAcceptance": "NOT_VERIFIED", "apk73To74Upgrade": "NOT_RUN",
    }
    pack_qa.require(all(proof.get(key) == value for key, value in expected.items()),
                    "The QA package proof crosses the reviewed artifact, source or runtime boundary")


class X86QaGuest(extra.ExtraGuest):
    def focus(self):
        # API30 exposes current focus in DisplayContent, not the window-list dump.
        window = self.probe('Foreground display', 'shell', 'dumpsys', 'window', 'displays')
        if window is None:
            return 'UNAVAILABLE'
        fields = re.findall(r'^\s*mCurrentFocus=([^\n]*)$', window, re.M)
        if not fields:
            return 'FOCUS_FIELD_ABSENT'
        if len(fields) != 1:
            return 'AMBIGUOUS_FOCUS'
        if fields[0].strip() == 'null':
            return 'NO_FOCUSED_WINDOW'
        match = re.fullmatch(r'Window\{[^\n}]*\bu(\d+)\s+([^\s}]+)\}', fields[0].strip())
        if not match:
            return 'UNRECOGNIZED_FOCUS'
        return 'MAIN_ACTIVITY' if match[1] == '0' and match[2] in native.MAIN_COMPONENTS else 'OTHER_WINDOW'

    def focused_app(self):
        return self.focus() == 'MAIN_ACTIVITY'

    def display_diagnostics(self):
        return display_state(self.probe('Guest power state', 'shell', 'dumpsys', 'power'),
                             self.probe('Guest keyguard state', 'shell', 'dumpsys', 'window', 'policy'))

    def launch_diagnostics(self):
        return {**super().launch_diagnostics(), 'focusDump': 'window displays', 'display': self.display_diagnostics()}

    def prepare_display(self, evidence):
        evidence.update(status='PREPARING', before=self.display_diagnostics())
        self.run('Keep the disposable guest awake', 'shell', 'svc', 'power', 'stayon', 'true')
        self.run('Dismiss disposable guest keyguard', 'shell', 'wm', 'dismiss-keyguard')
        deadline = time.monotonic() + 10
        after = evidence['before']
        while time.monotonic() < deadline:
            after = self.display_diagnostics()
            if (after['wakefulness'] == 'Awake' and after['displayReady'] is True and after['keyguardShowing'] is False
                    and after['screenState'] == 'SCREEN_STATE_ON' and after['interactiveState'] == 'INTERACTIVE_STATE_AWAKE'):
                evidence.update(status='AWAKE_UNLOCKED', after=after)
                return
            time.sleep(0.5)
        evidence.update(status='NOT_READY', after=after)
        raise native.CheckError('Disposable guest display was not verified awake and unlocked')

    def launch(self, evidence=None):
        evidence = {} if evidence is None else evidence
        self.prepare_display(evidence.setdefault('displayPreparation', {}))
        # Keep exact MainActivity + visible Instant Demo + stable process readiness.
        return super().launch(evidence)

    def verify_boot(self):
        native.require(self.property("ro.kernel.qemu") == "1"
                       and self.property("ro.product.cpu.abi") == "x86_64"
                       and self.property("ro.build.version.sdk") == "30"
                       and self.property("sys.boot_completed") == "1", "Expected a booted disposable API30 x86_64 guest")
        result = self.run("Package service", "shell", "service", "check", "package")
        native.require("Service package: found" in result, "Android package service is unavailable")

    def package_info(self, version):
        return self.package_info_for_abi(version, "x86_64")


def verify_candidate(args, proof):
    verify_qa_proof(proof, args.expected_sha256, args.expected_signer_sha256)
    pack_qa.require(pack_qa.sha256_file(args.apk) == args.expected_sha256, "Exact x86 QA APK SHA-256 did not match")
    pack_qa.verify_badging(args.aapt, args.apk, "x86_64")
    pack_qa.require(pack_qa.signer_digest(args.java, args.apksigner_jar, args.apk) == args.expected_signer_sha256,
                    "The x86 QA APK test signer did not match")
    verified = pack_qa.verify_content(args.apk, {"runtimeEntries": proof["nonNativeEntries"],
                                                "nativeLibraries": proof["nativeLibraries"]})
    pack_qa.require(verified["runtimeEntries"]["assets/index.android.bundle"]["sha256"] == pack_qa.PRODUCT_HBC
                    and len(verified["nativeLibraries"]) == pack_qa.NATIVE_LIBRARY_COUNT, "The released JS bundle or x86_64 library set differs")


def fail_reason(error):
    return str(error) if isinstance(error, (native.CheckError, pack_qa.QaError)) else type(error).__name__


def run(args, report):
    report["checkpoint"] = "qa_package_provenance"
    pack_qa.load_release_manifest(args.release_manifest)
    proof = json.loads(args.package_proof.read_text(encoding="utf-8"))
    verify_candidate(args, proof)
    report["installedArtifact"] = {"sha256": args.expected_sha256, "testSignerSha256": args.expected_signer_sha256}
    report["checkpoint"] = "clean_offline_guest_install"
    guest = X86QaGuest(args.adb, args.serial)
    guest.verify_boot()
    guest.offline(disable=True)
    guest.clean_start()
    guest.install(args.apk)
    report["installed"] = guest.package_info(74)
    launch = report["launch"] = {}
    guest.launch(launch)
    native.require(guest.property("ro.debuggable") == "1", "The disposable test guest must support diagnostic access")
    guest.run("Enable disposable guest diagnostic readback", "root")
    guest.run("Wait for diagnostic ADB transport", "wait-for-device", timeout=25)
    native.require(guest.run("Verify guest diagnostic readback", "shell", "id", "-u").strip() == "0",
                   "Synthetic demo store readback is unavailable")
    guest.offline()
    daily = report["checks"]["dailyForms"] = {"status": "INCOMPLETE", "visualEvidence": {"captured": [], "unverified": {}}}
    try:
        extra.qa.exercise_daily_forms(guest, args.evidence, daily)
        daily["status"] = "PASS"
    except (native.CheckError, OSError, ValueError, TypeError, KeyError, sqlite3.Error) as error:
        daily["reason"] = fail_reason(error)

    for index, probe in enumerate(("pdf", "gallery"), start=1):
        stage = report["checks"][probe] = {"status": "INCOMPLETE", "checkpoint": "fixturePreflight"}
        try:
            guest.offline()
            if probe == "pdf":
                extra.receiver_preflight(guest, args.receiver_apk, args.receiver_evidence, args.aapt)
            title = f"QA Recipe {time.time_ns()}-{index}"
            stage["checkpoint"] = "createAndReopenFixture"
            recipe_id = guest.create_demo_recipe(title)
            finding = extra.pdf_probe(guest, title, stage) if probe == "pdf" else extra.gallery_probe(guest, title, recipe_id, stage)
            guest.offline()
            stage.update(status="PASS", checkpoint="complete", evidence=finding)
        except (native.CheckError, OSError, ValueError, TypeError, KeyError, sqlite3.Error) as error:
            stage["reason"] = fail_reason(error)
    report["checkpoint"] = "completed_probes"
    if all(outcome["status"] == "PASS" for outcome in report["checks"].values()):
        report["status"] = "PASS"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ("release-manifest", "apk", "package-proof", "aapt", "java", "apksigner-jar", "receiver-apk", "receiver-evidence", "evidence"):
        parser.add_argument("--" + option, type=Path, required=True)
    for option in ("expected-sha256", "expected-signer-sha256", "adb", "serial"):
        parser.add_argument("--" + option, required=True)
    parser.add_argument("--execute", action="store_true", help="Install and exercise the app in the disposable emulator")
    args = parser.parse_args()
    import os
    if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("RUNNER_OS") != "Linux":
        parser.error("Execution is restricted to the reviewed disposable Linux CI runner")
    if not args.execute:
        parser.error("Pass --execute to run the offline synthetic guest test")
    args.evidence.mkdir(parents=True, exist_ok=False)
    report = {"status": "INCOMPLETE", "artifactType": pack_qa.QA_MODE, "scope": "offline-synthetic-emulator",
              "normalArm64RuntimeAcceptance": "NOT_VERIFIED", "apk73To74Upgrade": "NOT_RUN",
              "authenticatedContinuity": "NOT_RUN", "checks": {}}
    try:
        run(args, report)
    except (native.CheckError, pack_qa.QaError, OSError, ValueError, TypeError, KeyError, sqlite3.Error) as error:
        report["reason"] = fail_reason(error)
    native.publish(report, args.evidence / "native-x86-qa-report.json")
    return 0 if report["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
