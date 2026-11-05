"""Prepared Food.com native UI smoke. No execution is implied by this file.

Only use on an isolated synthetic staging emulator after accepted APK70
offline/online evidence. No login, API calls, private-storage reads or dispatch.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys
import time

sys.dont_write_bytecode = True
PACKAGE = "ro.paradim.professionalfoodcost"
LIBRARY = ("Biblioteca rețete", "Recipe library")
OPEN_CATALOGUE = ("Explorează catalogul Food.com", "Explore the Food.com catalogue")
TITLE = ("Catalog Food.com", "Food.com catalogue")
START = ("Descarcă / reia instalarea", "Download / resume installation")
READY = ("Biblioteca completă este disponibilă offline", "The complete library is available offline")
SEARCH = ("Caută după titlu sau categorie, în engleză", "Search recipe titles or categories in English")
SUBTITLE = ("522.517 rețete de referință · sursă în limba engleză",
            "522,517 reference recipes · original English content")
DETAIL_TITLE = "Classic Chicken and Coconut Soup"
DETAIL_ID = "Food.com #194"
INGREDIENT_HEAD = ("Denumiri de ingrediente în sursă", "Source ingredient names")
FOODCOM_COUNT = 522517
MIN_FREE_BYTES = 1_073_741_824
TOTAL_SECONDS = 1200
WORK_SECONDS = 1080
INSTALL_SECONDS = 840
EXPECTED_DOWNLOAD_SHA256 = "44520299056363fe78cd3421e3fc9daaf4d092be0fc7653d21e6defb8d2ddac1"
EXPECTED_DATABASE_SHA256 = "4a186b2fa856d560f21bac0f368eff28799504717b69d408d33e96259c8cb81f"
SAFE_ERRORS = (
    ("storage", ("Spațiul disponibil este insuficient.", "There is not enough storage.")),
    ("checksum", ("Fișierul descărcat nu a trecut verificarea.", "The downloaded file did not pass verification.")),
    ("network", ("Descărcarea nu este disponibilă momentan.", "The download is currently unavailable.")),
    ("load", ("Biblioteca nu a putut fi încărcată.", "The library could not be loaded.")),
)


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def matching(nodes, labels):
    return next((n for n in nodes
                 if n.get("text", "").strip() in labels
                 or n.get("content-desc", "").strip() in labels), None)


def remaining(deadline, minimum=1):
    seconds = deadline - time.monotonic()
    require(seconds >= minimum, "Prepared smoke work budget exceeded")
    return seconds


def find(device, labels, deadline, *, editable=False, scroll="both", seconds=40):
    return device.find(labels, editable=editable, scroll=scroll,
                       seconds=min(seconds, remaining(deadline)))


def public_screenshot(device, filename):
    # The catalogue contains public reference data. No other app screen is captured.
    require(matching(device.hierarchy(), TITLE), "Public catalogue header missing before screenshot")
    device.save_screenshot(filename)


def open_catalogue(device, base, deadline):
    remaining(deadline, 80)
    device.phase = "foodcom-normal-ui-navigation"
    base.relaunch(device)
    device.tab(base.RECIPES)
    device.folder(base.RECIPES)
    device.click(LIBRARY, scroll="both", seconds=min(40, remaining(deadline)))
    device.click(OPEN_CATALOGUE, scroll="both", seconds=min(40, remaining(deadline)))
    find(device, TITLE, deadline, scroll=None)


def read_progress(nodes):
    result = []
    for node in nodes:
        label = node.get("text", "").strip()
        if re.fullmatch(r"(?:Downloading|Installing|Checking the library|Se descarcă|Se instalează|Se verifică biblioteca) · (?:100|\d{1,2})%", label):
            result.append(label)
    return result


def wait_installed(device, deadline, observations):
    last = []
    while time.monotonic() < deadline:
        try:
            nodes = device.hierarchy()
        except Exception:
            # Busy native install may temporarily prevent a hierarchy dump.
            nodes = []
        if matching(nodes, READY):
            return
        for category, labels in SAFE_ERRORS:
            if any(node.get("text", "").startswith(labels) for node in nodes):
                raise RuntimeError("Catalogue installer visible failure: " + category)
        values = read_progress(nodes)
        if values and values != last:
            observations.append({"elapsedSeconds":round(time.monotonic() - observations.started, 2),
                                 "visibleProgress":values})
            last = values
        time.sleep(min(6, max(0, deadline - time.monotonic())))
    raise RuntimeError("Native catalogue did not reach ready within the install budget")


class Progress(list):
    pass


def verify_detail_offline(device, base, deadline, result):
    # Both radio controls and the validated network state are verified.
    original = device.connectivity_state()
    require(original["defaultNetworkValidated"], "A validated online network is required before offline mode")
    result["network"] = {"before":original}
    try:
        device.phase = "foodcom-disconnect-radios"
        device.adb("disable isolated emulator Wi-Fi", "shell", "svc", "wifi", "disable")
        device.adb("disable isolated emulator mobile data", "shell", "svc", "data", "disable")
        result["network"]["offline"] = device.wait_connectivity(False, seconds=min(30, remaining(deadline)))
        open_catalogue(device, base, deadline)  # force-stop/cold start, no data clearing
        device.phase = "foodcom-offline-readiness"
        find(device, READY, deadline)
        find(device, SUBTITLE, deadline)
        public_screenshot(device, "foodcom-offline-ready")
        device.phase = "foodcom-offline-search"
        device.set_field(SEARCH, "chicken soup", scroll="both")
        device.click((DETAIL_TITLE,), scroll="both", seconds=min(45, remaining(deadline)))
        device.phase = "foodcom-offline-detail"
        find(device, (DETAIL_TITLE,), deadline, scroll=None)
        device.wait("public Food.com detail ID 194", lambda nodes: next((
            n for n in nodes if re.search(r"(?:^|\s)Food\.com #194$", n.get("text", "").strip())
        ), None), scroll="both", seconds=min(40, remaining(deadline)))
        public_screenshot(device, "foodcom-offline-detail-194")
        find(device, INGREDIENT_HEAD, deadline)
        result["detail"] = {"id":194, "title":DETAIL_TITLE, "search":"chicken soup",
                            "sourceUrl":"https://www.food.com/recipe/classic-chicken-and-coconut-soup-194",
                            "ingredientsHeaderVisible":True}
    finally:
        # Restore even if cold start, search, assertions or screenshots fail.
        result["network"]["restoreAttempted"] = True
        try:
            result["network"]["restored"] = device.restore_connectivity(original)
        except Exception as error:
            result["network"]["restorationErrorClass"] = type(error).__name__
            raise


def guarded_manifest(path):
    value = json.loads(path.read_text(encoding="utf-8-sig"))
    require(value["schemaVersion"] == 1 and value["datasetVersion"] == 2
            and value["count"] == FOODCOM_COUNT, "Unexpected captured public catalogue manifest")
    require(value["download"]["bytes"] == 313918560
            and value["download"]["sha256"] == EXPECTED_DOWNLOAD_SHA256
            and value["database"]["bytes"] == 366206976
            and value["database"]["sha256"] == EXPECTED_DATABASE_SHA256,
            "Captured public catalogue asset identity changed")
    return value


def installed_apk_sha(device):
    paths = device.adb("read installed public APK path", "shell", "pm", "path", PACKAGE).decode().splitlines()
    require(len(paths) == 1 and paths[0].startswith("package:/data/app/"), "Unexpected installed APK layout")
    path = paths[0].removeprefix("package:")
    require(re.fullmatch(r"/data/app/[A-Za-z0-9/+=._~\-]+/base\.apk", path), "Unexpected installed APK path")
    output = device.adb("hash installed public APK code", "shell", "sha256sum", path).decode()
    value = output.split()[0] if output.split() else ""
    require(re.fullmatch(r"[a-fA-F0-9]{64}", value), "Installed APK checksum unavailable")
    return value.lower()


def read_free_bytes(device):
    output = device.adb("read emulator available data storage", "shell", "df", "-Pk", "/data").decode()
    lines = [line.split() for line in output.splitlines() if line.strip()]
    require(len(lines) >= 2 and len(lines[-1]) >= 6 and lines[-1][3].isdigit(), "Unrecognized /data free-space output")
    return int(lines[-1][3]) * 1024


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-harness", type=Path, required=True)
    parser.add_argument("--base-harness-sha256", required=True)
    parser.add_argument("--base-evidence", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--apk70-sha256", required=True)
    parser.add_argument("--fixture-title", required=True)
    parser.add_argument("--adb", required=True)
    parser.add_argument("--serial", required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    # No module import, device command or evidence creation before this opt-in.
    require(args.execute, "Prepared helper only. Coordinator review and --execute are required.")
    require(re.fullmatch(r"emulator-\d+", args.serial), "Only a named isolated emulator is supported")
    require(re.fullmatch(r"QA Recipe \d+-\d+", args.fixture_title), "An exact synthetic recipe title is required")
    require(re.fullmatch(r"[a-fA-F0-9]{64}", args.apk70_sha256), "Pinned APK70 SHA256 is required")
    require(sha(args.base_harness) == args.base_harness_sha256.lower(), "Reviewed base UI harness changed")
    manifest = guarded_manifest(args.manifest)
    proof = json.loads((args.base_evidence / "upgrade-results.json").read_text(encoding="utf-8"))
    verified = json.loads((args.base_evidence / "verified-apks.json").read_text(encoding="utf-8"))
    spec = importlib.util.spec_from_file_location("reviewed_foodcom_base", args.base_harness)
    base = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(base)
    require(base.candidate70_accepted(proof), "Passing APK70 offline/online evidence is required")
    final = proof["checkpoints"][-1]
    identity = next(entry for entry in verified if entry["versionCode"] == 70)
    require(final["versionCode"] == "70" and final["networkMode"] == "online"
            and final["recipe"] == args.fixture_title, "Accepted named synthetic fixture is required")
    require(identity["sha256"].lower() == args.apk70_sha256.lower()
            and identity["compiledStagingUrlVerified"] is True
            and identity["package"] == PACKAGE, "The exact verified staging APK70 is required")
    args.evidence.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    deadline = started + WORK_SECONDS
    result = {"status":"failed", "scope":"optional-native-public-foodcom",
              "executed":True, "expectedCount":FOODCOM_COUNT,
              "manifestSha256":sha(args.manifest), "baseHarnessSha256":sha(args.base_harness)}
    device = None
    try:
        device = base.Device(args.adb, args.serial, args.evidence)
        device.phase = "foodcom-installed-apk-preflight"
        require(installed_apk_sha(device) == args.apk70_sha256.lower(), "Installed APK70 differs from pinned artifact")
        installed = device.package_info(70)
        require(all(installed[key] == final[key] for key in ("uid","firstInstallTime")),
                "Installed application differs from the accepted fixture")
        require(device.connectivity_state()["defaultNetworkValidated"], "Online installation is required")
        free = read_free_bytes(device)
        require(free >= MIN_FREE_BYTES, "At least 1 GiB free /data storage is required for the fresh QA attempt")
        result["freeBytesBefore"] = free
        device.phase = "foodcom-named-fixture-preflight"
        base.relaunch(device)
        device.tab(base.RECIPES)
        device.folder(base.MY_RECIPES)
        device.set_field(base.SEARCH_RECIPE, args.fixture_title, scroll="both")
        device.click(base.recipe_card(args.fixture_title), scroll="both")
        require(find(device, base.RECIPE_TITLE, deadline, editable=True).get("text") == args.fixture_title,
                "The current normal UI session does not match the accepted fixture")
        open_catalogue(device, base, deadline)
        require(not matching(device.hierarchy(), READY), "Catalogue is already installed; fresh-download coverage would be absent")
        find(device, START, deadline)
        public_screenshot(device, "foodcom-native-before-download")
        device.click(START, scroll="both", seconds=min(40, remaining(deadline)))
        device.phase = "foodcom-download-install"
        progress = Progress()
        progress.started = started
        wait_installed(device, min(time.monotonic()+INSTALL_SECONDS, deadline-140), progress)
        result["installationProgress"] = progress
        find(device, SUBTITLE, deadline)
        public_screenshot(device, "foodcom-native-installed")
        result["install"] = {"normalUiInstallStarted":True, "readyVisible":True,
            "displayedReferenceCount":FOODCOM_COUNT,
            "downloadPhaseObserved":any(any(v.startswith(("Downloading", "Se descarcă")) for v in p["visibleProgress"]) for p in progress),
            "resumeState":"Private checkpoint bytes are not inspected. Freshness depends on the untouched isolated fixture.",
            "countAssurance":"Subtitle is static. Fresh native ready is reached only after the install COUNT(*)=522517 guard and the catalogue_meta check.",
            "downloadBytes":manifest["download"]["bytes"], "databaseBytes":manifest["database"]["bytes"]}
        verify_detail_offline(device, base, deadline, result)
        result["status"] = "passed"
    except Exception as error:
        # Retain only stage/class, never arbitrary exception text, intents or hierarchy dumps.
        result["failureClass"] = type(error).__name__
        result["failureStage"] = device.phase if device else "preflight"
    finally:
        result["elapsedSeconds"] = round(time.monotonic()-started, 3)
        result["within20MinuteBudget"] = result["elapsedSeconds"] <= TOTAL_SECONDS
        (args.evidence/"foodcom-native-result.json").write_text(
            json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return 0 if result["status"] == "passed" and result["within20MinuteBudget"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
