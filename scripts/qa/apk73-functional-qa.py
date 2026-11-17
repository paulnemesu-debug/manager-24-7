"""Exercise fresh Instant Demo on the offline APK73 emulator after upgrade QA."""

import argparse
from collections.abc import Callable
from contextlib import closing
from datetime import date, datetime
import importlib.util
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import tempfile
import time
from xml.etree import ElementTree as XML


spec = importlib.util.spec_from_file_location("apk73_native", Path(__file__).with_name("apk73-native-upgrade.py"))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
require = native.require

HACCP_KEY = "professional_foodcost.haccp_documents.v1.demo"
FRIDGE = "Frigider carne"
OTHER_EQUIPMENT = {"Frigider lactate", "Linie caldă"}
MEASURED = {"Temperatură măsurată", "Measured temperature"}
RECORD = {"Înregistrează citirea acum", "Record reading now"}
TEMPERATURE_LOG = {"Termogramă", "Temperature log"}
HR = {"Pontaj", "Attendance"}
DAILY = {"Pontaj zilnic", "Daily attendance"}
EMPLOYEE = {"Angajat", "Employee"}
DANA = {"[DEMO] Dana"}
TODAY = {"Azi", "Today"}
PRESENT = {"Prezent", "Present"}
USE_SCHEDULE = {"Preia programul", "Use schedule"}
CONFIRM = {"Confirmă prezența", "Confirm attendance"}
BACK = {"Înapoi", "Back"}
EMPTY_INPUT = {"", "Introdu temperatura", "Enter temperature"}
DECIMALS = {"2,3", "2.3"}
TOTAL = re.compile(r"8(?:[.,]0)?\s+(?:ore|hours)")
PROGRESS = ("0/3 · 0 °C – 4 °C", "1/3 · 0 °C – 4 °C")
SCREENSHOT_NAMES = ("01-demo-home.png", "02-thermogram-1-of-3.png", "03-saved-attendance.png")
PNG_HEADER = b"\x89PNG\r\n\x1a\n"
PNG_END = bytes.fromhex("0000000049454e44ae426082")
MAX_SCREENSHOT_BYTES = 16 * 1024 * 1024
SAFE_UI = set().union(
    native.DEMO_LABELS, native.HOME_LABELS, {FRIDGE}, OTHER_EQUIPMENT, MEASURED, RECORD,
    TEMPERATURE_LOG, HR, DAILY, EMPLOYEE, DANA, TODAY, PRESENT, USE_SCHEDULE, CONFIRM, BACK,
    EMPTY_INPUT, DECIMALS, PROGRESS, {"10:00", "18:00", "Ora intrării", "Ora ieșirii",
                                    "Clock-in time", "Clock-out time"},
)


def labels(node):
    return {node.get(key, "").strip() for key in ("text", "content-desc")}


def app_nodes(tree):
    return (node for node in tree.iter("node") if node.get("package") == native.PACKAGE)


def box(node):
    match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.get("bounds", ""))
    return tuple(map(int, match.groups())) if match else None


def point(node):
    bounds = box(node) if node is not None else None
    if bounds and bounds[0] < bounds[2] and bounds[1] < bounds[3]:
        return ((bounds[0] + bounds[2]) // 2, (bounds[1] + bounds[3]) // 2)
    return None


def unique(nodes):
    by_point = {point(node): node for node in nodes if point(node)}
    return next(iter(by_point.values())) if len(by_point) == 1 else None


def control(tree, names, clickable=False):
    nodes = list(app_nodes(tree))
    candidates = [node for node in nodes if labels(node) & names]
    if not clickable:
        return unique(candidates)
    parents = {child: parent for parent in nodes for child in parent}
    # React Native may expose a Pressable's label on a descendant Text.
    controls = []
    for node in candidates:
        while node is not None and node.get("clickable") != "true":
            node = parents.get(node)
        if node is not None and node.get("enabled") == "true":
            controls.append(node)
    return unique(controls)


def fridge_target(tree, names, progress, *, entered=None, focused=False):
    nodes = list(app_nodes(tree))
    parents = {child: parent for parent in nodes for child in parent}
    anchor = unique(node for node in nodes if FRIDGE in labels(node))
    card = parents.get(anchor)
    while card is not None:
        texts = set().union(*(labels(node) for node in app_nodes(card)))
        if texts & OTHER_EQUIPMENT:
            return None
        if PROGRESS[progress] in texts:
            if names == MEASURED:
                target = unique(node for node in app_nodes(card)
                                if node.get("class") == "android.widget.EditText" and labels(node) & names)
                if (target is not None and (entered is None or target.get("text", "").strip() in entered)
                        and (not focused or target.get("focused") == "true")):
                    return target
            else:
                target = control(card, names, clickable=names == RECORD)
                if target is not None:
                    return target
        card = parents.get(card)
    return None


def demo_home_visible(tree):
    return control(tree, native.HOME_LABELS) is not None and (
        control(tree, TEMPERATURE_LOG) is not None or control(tree, HR) is not None
    )


def completed_reading(tree):
    return fridge_target(tree, {PROGRESS[1]}, 1)


def saved_attendance(tree):
    return unique(node for node in app_nodes(tree) if any(TOTAL.fullmatch(label) for label in labels(node)))


SCREENSHOT_CHECKS = {
    SCREENSHOT_NAMES[0]: demo_home_visible,
    SCREENSHOT_NAMES[1]: lambda tree: completed_reading(tree) is not None,
    SCREENSHOT_NAMES[2]: lambda tree: saved_attendance(tree) is not None,
}


def save_ui(tree, path):
    snapshot = XML.Element("synthetic-ui")

    def copy_nodes(parent, safe_parent):
        for node in parent:
            next_parent = safe_parent
            if node.get("package") == native.PACKAGE:
                data = {attribute: node.get(attribute) for attribute in ("clickable", "enabled", "focused", "scrollable")
                        if node.get(attribute) in {"true", "false"}}
                if box(node):
                    data["bounds"] = node.get("bounds")
                kind = node.get("class", "")
                if re.fullmatch(r"android\.[a-zA-Z.]+", kind):
                    data["class"] = kind
                for attribute in ("text", "content-desc"):
                    label = node.get(attribute, "").strip()
                    if label:
                        data[attribute] = label if label in SAFE_UI or TOTAL.fullmatch(label) else "[redacted]"
                next_parent = XML.SubElement(safe_parent, "node", data)
            copy_nodes(node, next_parent)

    copy_nodes(tree, snapshot)
    XML.indent(snapshot)
    XML.ElementTree(snapshot).write(path, encoding="utf-8", xml_declaration=True)


def valid_png(data):
    return 45 <= len(data) <= MAX_SCREENSHOT_BYTES and data.startswith(PNG_HEADER) and data.endswith(PNG_END)


def uploadable_screenshots(directory):
    if directory.is_symlink() or not directory.is_dir():
        return []
    selected = []
    for name in SCREENSHOT_NAMES:
        path = directory / name
        if path.is_symlink() or not path.is_file():
            continue
        with path.open("rb") as image:
            if valid_png(image.read(MAX_SCREENSHOT_BYTES + 1)):
                selected.append(path.resolve())
    return selected


class DemoGuest(native.Emulator):
    def focused_app(self):
        window = self.run("Check foreground window", "shell", "dumpsys", "window", "windows", timeout=8)
        focus = re.search(r"^\s*mCurrentFocus=Window\{[^\n}]*\bu0\s+([^\s}]+)", window, re.M)
        return bool(focus and focus[1] in {native.ACTIVITY, f"{native.PACKAGE}/{native.PACKAGE}.MainActivity"})

    def screen_png(self):
        try:
            result = subprocess.run(
                [self.adb, "-s", self.serial, "exec-out", "screencap", "-p"],
                capture_output=True, timeout=12, check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            raise native.CheckError("Guest screenshot command failed") from None
        require(result.returncode == 0 and valid_png(result.stdout), "Guest did not return a complete PNG")
        return result.stdout

    def capture(self, name, directory, screen_is_visible: Callable[[XML.Element], bool]):
        require(name in SCREENSHOT_NAMES, "Unexpected visual evidence filename")
        self.offline()
        tree = self.tree()
        require(tree is not None and screen_is_visible(tree) is True, "Expected synthetic screen is no longer visible")
        require(self.focused_app(), "Manager 24/7 is not the foreground window")
        png = self.screen_png()
        require(self.focused_app(), "Manager 24/7 lost foreground focus during screenshot")
        with (directory / name).open("xb") as image:
            image.write(png)

    def tree(self):
        path = f"/data/local/tmp/manager247-functional-{os.getpid()}.xml"
        self.run("Clear previous observation", "shell", "rm", "-f", path)
        try:
            dumped = self.run("Dump UI hierarchy", "shell", "uiautomator", "dump", path,
                              timeout=14, allow_failure=True)
            if not dumped or "dumped to" not in dumped.lower():
                return None
            return XML.fromstring(self.run("Read UI hierarchy in memory", "exec-out", "cat", path, timeout=8))
        except XML.ParseError:
            return None
        finally:
            self.run("Remove guest UI observation", "shell", "rm", "-f", path)

    def swipe(self, tree):
        regions = [box(node) for node in app_nodes(tree) if node.get("scrollable") == "true" and point(node)]
        if not regions:
            return
        left, top, right, bottom = max(regions, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))
        x = (left + right) // 2
        start = top + (bottom - top) * 7 // 10
        end = top + (bottom - top) * 4 // 10
        self.run("Scroll test screen", "shell", "input", "swipe", x, start, x, end, "300")

    def observe(self, name, directory, selector, *, tap=False, scroll=False):
        last = None
        for attempt in range(8):
            tree = self.tree()
            if tree is not None:
                last = tree
                node = selector(tree)
                location = point(node)
                if location:
                    save_ui(tree, directory / f"{name}.xml")
                    if tap:
                        self.run("Tap observed test control", "shell", "input", "tap", *location)
                    return node
                if scroll and attempt >= 1:
                    self.swipe(tree)
            time.sleep(0.6)
        if last is not None:
            save_ui(last, directory / f"{name}-unverified.xml")
        raise native.CheckError("Could not establish a unique visible target at " + name)

    def keyboard_back(self):
        status = self.run("Inspect software keyboard", "shell", "dumpsys", "input_method")
        if re.search(r"\b(?:mInputShown|mIsInputViewShown)=true\b", status):
            self.run("Dismiss observed keyboard", "shell", "input", "keyevent", "KEYCODE_BACK")

    def demo_value(self, key):
        # Keep the demo and app open. Two identical DB and sidecar copies give a stable snapshot.
        def copy(directory):
            db = directory / "RKStorage"
            files = []
            for suffix in ("", "-wal", "-journal"):
                remote = native.STORAGE_DB + suffix
                local = directory / (db.name + suffix)
                if suffix and self.run("Check SQLite sidecar", "shell", "test", "-f", remote,
                                       allow_failure=True) is None:
                    files.append(None)
                else:
                    self.run("Copy test SQLite bytes into a temporary folder", "pull", remote, local)
                    files.append(native.sha256_file(local))
            return db, files

        for _ in range(3):
            with tempfile.TemporaryDirectory(prefix="apk73-demo-sqlite-") as first, \
                 tempfile.TemporaryDirectory(prefix="apk73-demo-sqlite-") as second:
                _, initial = copy(Path(first))
                db, latest = copy(Path(second))
                if initial != latest:
                    continue
                try:
                    with closing(sqlite3.connect(db.resolve().as_uri() + "?mode=ro", uri=True)) as handle:
                        row = handle.execute("SELECT value FROM catalystLocalStorage WHERE key = ?", (key,)).fetchone()
                except sqlite3.Error:
                    continue
                return row[0] if row else None
        raise native.CheckError("Could not get a stable test SQLite snapshot")


def reading_evidence(documents, day):
    year, month, number = day.split("-")
    matches = [doc for doc in documents if doc["formCode"] == "FO-H-20-02"
               and doc["headerValues"]["year"] == year and doc["headerValues"]["month"] == month
               and doc["headerValues"]["cold_room"] == FRIDGE]
    require(len(matches) == 1, "Expected one monthly document for the demo refrigerator")
    header = matches[0]["headerValues"]
    values = [row["values"] for row in matches[0]["rows"]
              if str(row["values"].get("day", "")).lstrip("0") == number.lstrip("0")]
    require(len(values) == 1, "Expected one temperature row for the guest date")
    row = values[0]
    require(row.get("temperature_1") == "2.3", "Stored measurement differs from the exact decimal")
    require(bool(header.get("_equipment_id")) and header["_equipment_id"] == row.get("_equipment_id"),
            "The reading did not link to the measured demo equipment")
    require(bool(re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", row.get("time_1", "")))
            and bool(row.get("_confirmed_1_at")), "Missing confirmed measurement time")
    require(all(not row.get(f"{prefix}{slot}{suffix}") for prefix, suffix in
                (("temperature_", ""), ("time_", ""), ("_confirmed_", "_at")) for slot in (2, 3)),
            "The single observation wrote extra temperature slots")
    require(not row.get("prepared_by") and not row.get("checked_by"), "The reading populated a signature field")
    return {"temperatureC": row["temperature_1"], "storedLocalTime": row["time_1"], "slotsSaved": 1}


def attendance_evidence(data, day, *, confirmed):
    require(any(employee.get("id") == "demo-employee-dana" and employee.get("name") in DANA
                for employee in data["employees"]), "Expected the synthetic Dana employee")
    shifts = [shift for shift in data["shifts"]
              if shift["employeeId"] == "demo-employee-dana" and shift["workDate"] == day]
    require(len(shifts) == 1 and shifts[0]["id"] == "demo-shift-dana",
            "Expected one existing synthetic Dana shift on the guest date")
    shift = shifts[0]
    require((shift["plannedStart"], shift["plannedEnd"]) == ("10:00", "18:00"),
            "The seeded planned interval changed")
    target = ("present", "10:00", "18:00") if confirmed else ("scheduled", "", "")
    require((shift["status"], shift["actualStart"], shift["actualEnd"]) == target,
            "Stored shift does not match the expected explicit confirmation state")
    if not confirmed:
        return 0
    start, end = (datetime.strptime(shift[key], "%H:%M") for key in ("actualStart", "actualEnd"))
    return int((end - start).total_seconds() // 60)


def run_probes(args, report):
    guest = DemoGuest(args.adb, args.serial)
    prior = json.loads(args.upgrade_report.read_text(encoding="utf-8"))
    checks = prior.get("checks", {})
    native.require_runtime_receipt(prior, args.adapt_bridge_libraries)
    require(prior.get("status") == "PASS"
            and all(checks.get(key) == "PASS" for key in
                    ("apk73_in_place_update", "apk73_launch_after_update", "synthetic_demo_cache")),
            "A completed passing original ARM64 upgrade and cache report is required")
    apks = {apk["versionCode"]: apk["sha256"] for apk in prior["apks"]}
    require(apks == {72: native.APK72_SHA256, 73: args.apk73_sha256}, "Upgrade report has unexpected APK hashes")
    guest.verify_boot()
    guest.offline()
    require(guest.package_info(73) == prior["installed"][-1], "Live APK73 package differs from the test report")
    require(guest.property("ro.debuggable") == "1"
            and guest.run("Inspect guest diagnostic access", "shell", "id", "-u").strip() == "0",
            "Existing read-only diagnostic access is required")
    if args.adapt_bridge_libraries:
        guest.verify_live_bridge_receipt(prior, args.apk73_sha256)
        report["runtimeAdaptation"]["verifiedReceipt"] = True

    observe = lambda name, selector, **options: guest.observe(name, args.evidence, selector, **options)
    click = lambda name, names, **options: observe(name, lambda tree: control(tree, names, clickable=True),
                                                  tap=True, **options)

    def capture(name):
        visual = report["visualEvidence"]
        try:
            guest.capture(name, args.evidence, SCREENSHOT_CHECKS[name])
        except (native.CheckError, OSError) as error:
            visual["unverified"][name] = str(error) if isinstance(error, native.CheckError) else type(error).__name__
        else:
            visual["captured"].append(name)

    report["stage"] = "freshDemoAfterUpgrade"
    guest.stop()
    guest.launch()
    click("enter-instant-demo", native.DEMO_LABELS)
    guest.find_visible(native.HOME_LABELS)
    today = guest.run("Guest local date", "shell", "date", "+%F").strip()
    require(date.fromisoformat(today).isoformat() == today, "Invalid guest date")
    before = guest.demo_value(native.DEMO_HR_KEY)
    require(before and attendance_evidence(json.loads(before), today, confirmed=False) == 0,
            "Fresh demo did not seed the expected HR shift")
    require(json.loads(guest.demo_value(HACCP_KEY) or "[]") == [], "Fresh demo already contains HACCP records")
    report["freshDemoReseeded"] = True
    capture(SCREENSHOT_NAMES[0])

    report["stage"] = "refrigeratorReading"
    click("open-temperature-log", TEMPERATURE_LOG, scroll=True)
    field = observe("empty-fridge-input", lambda tree: fridge_target(tree, MEASURED, 0, entered=EMPTY_INPUT),
                    scroll=True, tap=True)
    observe("focused-fridge-input", lambda tree: fridge_target(tree, MEASURED, 0, focused=True))
    typed = "2.3" if "Measured temperature" in labels(field) else "2,3"
    guest.run("Type test decimal temperature", "shell", "input", "text", typed)
    guest.keyboard_back()
    observe("exact-decimal-before-save", lambda tree: fridge_target(tree, MEASURED, 0, entered=DECIMALS))
    observe("record-reading", lambda tree: fridge_target(tree, RECORD, 0), scroll=True, tap=True)
    observe("one-of-three-readings", completed_reading)
    reading = reading_evidence(json.loads(guest.demo_value(HACCP_KEY) or "[]"), today)
    report["haccp"] = dict(reading, beforeProgress="0/3", afterProgress="1/3")
    capture(SCREENSHOT_NAMES[1])

    report["stage"] = "attendanceConfirmation"
    click("back-to-home", BACK)
    click("open-attendance", HR, scroll=True)
    observe("daily-attendance", lambda tree: control(tree, DAILY))
    click("select-employee", EMPLOYEE)
    click("choose-demo-dana", DANA)
    click("select-guest-date", TODAY, scroll=True)
    click("mark-present-draft", PRESENT, scroll=True)
    click("use-existing-schedule", USE_SCHEDULE, scroll=True)
    after_prefill = guest.demo_value(native.DEMO_HR_KEY)
    require(after_prefill == before, "Using the schedule wrote data before explicit confirmation")
    report["schedulePrefillLeftStorageUnchanged"] = True
    click("confirm-attendance", CONFIRM, scroll=True)
    observe("eight-hour-total", saved_attendance, scroll=True)
    confirmed = guest.demo_value(native.DEMO_HR_KEY)
    require(confirmed and attendance_evidence(json.loads(confirmed), today, confirmed=True) == 480,
            "Confirmed attendance did not persist exactly eight hours")
    report["hr"] = {"actualStart": "10:00", "actualEnd": "18:00", "workedMinutes": 480}
    capture(SCREENSHOT_NAMES[2])
    guest.offline()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adb", default="adb")
    parser.add_argument("--serial")
    parser.add_argument("--upgrade-report", type=Path)
    parser.add_argument("--apk73-sha256")
    parser.add_argument("--evidence", type=Path, help="New local evidence directory")
    parser.add_argument("--execute", action="store_true", help="Confirm reset and writes to synthetic guest demo")
    parser.add_argument("--adapt-bridge-libraries", action="store_true",
                        help="Require and verify the explicit adapted runtime receipt")
    parser.add_argument("--list-screenshots", type=Path, help="Print only existing approved PNG paths for upload")
    args = parser.parse_args()
    if args.list_screenshots:
        for path in uploadable_screenshots(args.list_screenshots):
            print(path)
        return 0
    if not (args.execute and args.serial and args.upgrade_report and args.evidence
            and re.fullmatch(r"[a-f0-9]{64}", args.apk73_sha256 or "")):
        parser.error("Provide --execute, emulator serial, upgrade report, APK73 SHA-256 and evidence directory")
    args.evidence.mkdir(parents=True, exist_ok=False)
    report = {"status": "INCOMPLETE", "scope": "offline-synthetic-demo-only",
              "stage": "preflight", "authenticatedContinuity": "NOT_RUN",
              "visualEvidence": {"captured": [], "unverified": {}}}
    if args.adapt_bridge_libraries:
        report.update(native.runtime_identity(True))
        report["runtimeAdaptation"].pop("versions")
    try:
        run_probes(args, report)
        report.update(status="PASS", stage="complete")
    except native.CheckError as error:
        report["reason"] = str(error)
    except (OSError, ValueError, TypeError, AttributeError, KeyError, IndexError, sqlite3.Error) as error:
        report["reason"] = type(error).__name__
    native.publish(report, args.evidence / "functional-report.json")
    return 0 if report["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
