"""Exercise the installed staging APKs through Android's visible UI."""

import argparse
from contextlib import contextmanager, nullcontext
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import time
from urllib.parse import unquote
import xml.etree.ElementTree as ET

PACKAGE = "ro.paradim.professionalfoodcost"
ACTIVITY = f"{PACKAGE}/.MainActivity"
HOME = ("Acasă", "Home")
RECIPES = ("Rețete", "Recipes")
PRODUCTION = ("Producție", "Production")
EMAIL = ("Adresa de email", "Email address")
EMAIL_HINT = ("nume@restaurant.ro", "name@restaurant.com")
HAVE_CODE = ("Am deja un cod", "I already have a code")
SEND_CODE = ("Trimite codul de acces", "Send access code")
OTP = ("Cod din email", "Code from email")
VERIFY = ("Intră în aplicație", "Enter the app")
ONBOARDING = ("Sari peste", "Skip", "Intră în Manager 24/7", "Open Manager 24/7")
LOCATION_SETUP = ("Configurează locația", "Set up your location")
LOCATION_NAME = ("Denumirea locației", "Location name")
LOCATION_ADDRESS = ("Adresa", "Address")
CREATE_LOCATION = ("Creează locația și continuă", "Create location and continue")
CREATE_RECIPE = ("Creează rețetă", "Create recipe")
MY_RECIPES = ("Rețetele mele", "My recipes")
SEARCH_RECIPE = ("Caută o rețetă", "Search a recipe")
RECIPE_TITLE = ("Denumire preparat", "Dish name")
INGREDIENT = ("Ingredient",)
INGREDIENT_PLACEHOLDERS = ("", "Ex: piept de pui", "e.g. chicken breast")
QUANTITY = ("Cantitate folosită", "Quantity used")
PRICE = ("Preț achiziție", "Purchase price")
SAVE_RECIPE = ("Salvează rețeta", "Save recipe", "Salvează", "Save")
EQUIPMENT_FOLDER = ("Utilaje și mentenanță", "Equipment and maintenance")
OPEN_EQUIPMENT = ("Deschide registrul de utilaje", "Open equipment register")
EQUIPMENT_REGISTRY = ("Registru utilaje", "Equipment registry")
ADD_EQUIPMENT = ("Adaugă utilaj fără temperatură", "Add equipment without temperatures")
EQUIPMENT_NAME = ("Denumire", "Name")
EQUIPMENT_BRAND = ("Marcă", "Brand")
EQUIPMENT_SHEET = ("Fișă și istoric", "Sheet and history")
SAVE_EQUIPMENT = ("Salvează utilaj", "Save equipment")
INITIAL_LABELS = EMAIL + HAVE_CODE + SEND_CODE + ONBOARDING + HOME + (
    "Manager 24/7", "Manager 24/7 by PARADIM", "Loading", "Se încarcă", "Close app",
)
FAILURE_LABELS = (HOME + RECIPES + PRODUCTION + ONBOARDING + LOCATION_SETUP + CREATE_LOCATION
                  + HAVE_CODE + SEND_CODE + VERIFY + (
                      "Nu am putut verifica locația", "Could not verify your location",
                      "Costuri clare. Profit controlat.", "Clear costs. Controlled profit.",
                      "Reîncearcă", "Retry", "Deconectare", "Sign out", "Loading", "Se încarcă",
                  ))


class QAError(Exception):
    """A safe diagnostic with no raw command, auth input or device output."""


def require(condition, message):
    if not condition:
        raise QAError(message)


def bounds(node):
    coordinates = [int(part) for part in re.findall(r"\d+", node.get("bounds", ""))]
    if len(coordinates) != 4:
        return None
    x1, y1, x2, y2 = coordinates
    return (x1, y1, x2, y2) if x2 > x1 and y2 > y1 else None


def label_matches(node, labels):
    values = (node.get("text", "").strip(), node.get("content-desc", "").strip())
    return any(value == label or value.startswith(f"{label}, tab") for value in values for label in labels)


def safe_exception_message(message):
    message = unquote(message.replace(r"\/", "/"))
    message = re.sub(r"\\u00([0-7][0-9a-fA-F])", lambda match: chr(int(match[1], 16)), message)
    message = re.sub(r"[\x00-\x1f\x7f]", " ", message).strip()
    if re.search(
        r"\b(?:authorization|bearer|credentials?|password|passphrase|passcode|otp|cookie|token|secret|"
        r"(?:api|client|private|secret|access)[ _-]?(?:key|secret)|(?:access|refresh|auth)[ _-]?token|"
        r"(?:verification|one[ -]time)[ _-]?code)\b",
        message, re.I,
    ):
        return "[redacted credential message]"
    for pattern in (
        r"\b(?:[a-z][a-z0-9+.-]*://|www\.)[^\s<>\"']+",
        r"[a-z0-9.!#$%&'*+/=?^_\x60{|}~-]+@(?:[a-z0-9.-]+\.[a-z]{2,63}\b|\[[^\]\s]+\])",
        r"\b(?:[a-z0-9-]+\.)+[a-z]{2,63}(?::\d{2,5}|/)[^\s<>\"']*",
        r"\b(?:[a-z0-9-]+\.)+(?:com|org|net|io|dev|co|app|ro|invalid|example|local)\b",
        r"(?<![\w-])[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}(?![\w-])",
        r"\bsb_[a-z0-9_-]+",
        r"(?<![\w+/=-])[a-z0-9+/_-]{24,}={0,2}(?![\w+/=-])",
    ):
        message = re.sub(pattern, "[redacted]", message, flags=re.I)
    return message[:220]


def crash_records(log, dropbox):
    current = []
    for raw in log.splitlines():
        line = re.sub(r"^\d{2}-\d{2}\s+\d\d:\d\d:\d\d\.\d+\s+\d+\s+\d+\s+[VDIWEFAS]\s+[^:]+:\s*", "", raw).strip()
        if dropbox:
            boundary = re.fullmatch(r"={5,}", line) or re.match(
                r"^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}.*\bdata_app_crash\b", line,
            )
        else:
            boundary = line.startswith(("FATAL EXCEPTION:", "*** *** ***"))
        if boundary and current:
            yield current
            current = []
        current.append(line)
    if current:
        yield current


def filtered_crashes(log, *, dropbox=False, include_messages=False):
    process_pattern = re.compile(r"^(?:Process:|Cmdline:)\s*([\w.$:-]+)(?=[,\s]|$)|>>>\s+([\w.$:-]+)\s+<<<")
    exception_pattern = re.compile(r"^(?:(Caused by|Suppressed):\s*)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)(?::\s*(.*))?$")
    frame_pattern = re.compile(r"^at\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$<>][\w$<>]*)+)\(")
    evidence = []
    for record in crash_records(log, dropbox):
        anchors = [(index, match[1] or match[2]) for index, line in enumerate(record)
                   if (match := process_pattern.search(line))]
        if {process for _, process in anchors} != {PACKAGE}:
            continue
        if not dropbox and not record[0].startswith(("FATAL EXCEPTION:", "*** *** ***")):
            record = record[anchors[0][0]:]
        exceptions = []
        java_frames = []
        for line in record:
            exception = exception_pattern.fullmatch(line)
            # R8 may rename throwable classes to names without an Error or Exception suffix.
            if exception:
                role = {"Caused by": "cause", "Suppressed": "suppressed"}.get(exception[1], "root")
                item = {"role": role, "exceptionClass": exception[2]}
                if include_messages and exception[3]:
                    item["message"] = safe_exception_message(exception[3])
                if len(exceptions) < 8:
                    exceptions.append(item)
            frame = frame_pattern.match(line)
            if frame and frame[1] not in java_frames and len(java_frames) < 12:
                java_frames.append(frame[1])
        detail = "\n".join(record)
        signal = re.search(r"\bsignal (\d+) \((SIG[A-Z]+)\)", detail)
        native_frames = re.findall(r"#[0-9]+\s+pc\s+[0-9a-fA-F]+\s+[^\s]*(lib[\w.-]+\.so)\b", detail)
        entry = {"process": PACKAGE, "source": "dropbox" if dropbox else "logcat"}
        if exceptions:
            entry["exceptions"] = exceptions
        if java_frames:
            entry["javaFrames"] = java_frames
        if signal:
            entry["signal"] = f"{signal[1]} {signal[2]}"
        if native_frames:
            entry["nativeLibraries"] = native_frames[:8]
        if entry not in evidence:
            evidence.append(entry)
    return evidence[-3:]


class Device:
    def __init__(self, adb, serial, evidence):
        self.command = [adb, "-s", serial]
        self.evidence = evidence
        self.phase = "initialization"
        resolution = self.adb("read display dimensions", "shell", "wm", "size").decode()
        match = re.findall(r"(\d+)x(\d+)", resolution)
        require(match, "Android display dimensions are unavailable")
        self.width, self.height = map(int, match[-1])

    def adb(self, action, *arguments, timeout=20):
        try:
            result = subprocess.run(
                [*self.command, *arguments], capture_output=True, timeout=timeout, check=False,
            )
        except subprocess.TimeoutExpired:
            raise QAError(f"Android timed out while attempting to {action}") from None
        require(result.returncode == 0, f"Android failed to {action}")
        return result.stdout

    def visible_hierarchy(self):
        # Remove the old file first so a failed dump cannot return a stale screen.
        script = (
            "rm -f /sdcard/qa-hierarchy.xml && "
            "uiautomator dump /sdcard/qa-hierarchy.xml >/dev/null && "
            "cat /sdcard/qa-hierarchy.xml && rm /sdcard/qa-hierarchy.xml"
        )
        try:
            root = ET.fromstring(self.adb("read the visible accessibility hierarchy", "shell", script))
        except (ET.ParseError, QAError):
            self.hierarchy_status = "unreadable"
            return []
        self.hierarchy_status = "ok"
        return [
            node for node in root.iter("node")
            if node.get("enabled") == "true" and bounds(node)
        ]

    def hierarchy(self):
        return [node for node in self.visible_hierarchy() if node.get("package") == PACKAGE]

    @staticmethod
    def labels(nodes, labels, editable=False):
        return [
            node for node in nodes
            if label_matches(node, labels) and (not editable or node.get("class") == "android.widget.EditText")
        ]

    def wait(self, description, choose, scroll=None, seconds=40):
        deadline = time.monotonic() + seconds
        direction = "down" if scroll == "both" else scroll
        previous_view = None
        while time.monotonic() < deadline:
            nodes = self.hierarchy()
            match = choose(nodes)
            if match is not None:
                return match
            if direction and nodes:
                if scroll == "both":
                    view = [node.attrib for node in nodes]
                    if view == previous_view:
                        direction = "up" if direction == "down" else "down"
                    previous_view = view
                self.swipe(direction)
            else:
                time.sleep(0.4)
        raise QAError(f"Visible control or expected data missing: {description}")

    def find(self, labels, *, scroll=None, editable=False, seconds=40):
        def choose(nodes):
            matches = self.labels(nodes, labels, editable)
            if not matches:
                return None
            return max(matches, key=lambda node: node.get("clickable") == "true")

        return self.wait(labels[0], choose, scroll=scroll, seconds=seconds)

    def tap(self, node):
        x1, y1, x2, y2 = bounds(node)
        self.adb("tap a visible control", "shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2))

    def click(self, labels, **options):
        self.tap(self.find(labels, **options))

    def tab(self, labels):
        def choose(nodes):
            matches = [
                node for node in self.labels(nodes, labels)
                if bounds(node)[1] > self.height * 0.78
            ]
            return max(matches, key=lambda node: bounds(node)[3], default=None)

        self.tap(self.wait(f"{labels[0]} navigation tab", choose))

    def folder(self, labels):
        def choose(nodes):
            matches = self.labels(nodes, labels)
            with_id = next((
                node for node in matches
                if node.get("resource-id", "").endswith(("folder-photo-tile", "folder-photo-link"))
            ), None)
            if with_id is not None:
                return with_id
            return next((
                node for node in matches
                if node.get("clickable") == "true" and bounds(node)[1] < self.height * 0.82
            ), None)

        self.tap(self.wait(f"{labels[0]} folder", choose, scroll="down"))

    def swipe(self, direction):
        start, end = (0.76, 0.43) if direction == "down" else (0.35, 0.68)
        center = str(self.width // 2)
        self.adb("scroll the active screen", "shell", "input", "swipe",
                 center, str(round(self.height * start)), center, str(round(self.height * end)), "400")

    def hide_keyboard(self):
        ime = self.adb("check keyboard visibility", "shell", "dumpsys", "input_method")
        if b"mInputShown=true" in ime or b"mIsInputViewShown=true" in ime:
            self.adb("dismiss the keyboard", "shell", "input", "keyevent", "KEYCODE_BACK")

    def type(self, node, value, *, keep_numeric_zero=False):
        require(re.fullmatch(r"[A-Za-z0-9@._+ -]+", value), "The QA input has unsupported characters")
        self.tap(node)
        self.adb("move to the end of the input", "shell", "input", "keyevent", "KEYCODE_MOVE_END")
        if node.get("class") == "android.widget.EditText":
            existing = node.get("text", "")
            require(len(existing) <= 128, "The QA field has unexpected existing text")
            # React Native immediately normalizes an empty ingredient number to zero.
            if existing and (existing != "0" or not keep_numeric_zero):
                self.adb("clear the current field", "shell", "input", "keyevent", *(["KEYCODE_DEL"] * len(existing)))
        self.adb("enter QA input", "shell", f"input text {shlex.quote(value.replace(' ', '%s'))}")
        self.hide_keyboard()

    def set_field(self, labels, value, scroll=None):
        self.type(self.find(labels, editable=True, scroll=scroll), value)

    def install(self, apk, upgrade=False):
        arguments = ("install", "-r", str(apk)) if upgrade else ("install", str(apk))
        output = self.adb("install the verified APK", *arguments, timeout=120)
        require(b"Success" in output, "Android did not confirm APK installation")

    def package_info(self, version):
        metadata = self.adb("read installed package metadata", "shell", "dumpsys", "package", PACKAGE).decode()
        info = {}
        for key, pattern in {
            "versionCode": r"\bversionCode=(\d+)",
            "uid": r"\b(?:userId|appId)=(\d+)",
            "firstInstallTime": r"\bfirstInstallTime=([^\r\n]+)",
        }.items():
            match = re.search(pattern, metadata)
            require(match, f"Installed package metadata missing {key}")
            info[key] = match[1].strip()
        require(info["versionCode"] == str(version), "Android installed an unexpected version code")
        return info

    def launch(self):
        output = self.adb("start the Manager 24/7 activity", "shell", "am", "start", "-W", "-n", ACTIVITY).decode()
        status = re.search(r"^Status:\s*(ok|timeout)\s*$", output, re.M)
        return status[1] if status else "unreported"

    def stop(self):
        self.adb("force stop Manager 24/7", "shell", "am", "force-stop", PACKAGE)

    def require_fixture_screen(self, expected):
        require(self.labels(self.hierarchy(), expected), "Fixture screen changed before the evidence capture")

    def save_screenshot(self, name):
        png = self.adb("capture the fixture screen", "exec-out", "screencap", "-p")
        require(png.startswith(b"\x89PNG\r\n\x1a\n"), "Android did not provide a PNG screenshot")
        (self.evidence / f"{name}.png").write_bytes(png)

    def screenshot(self, name, expected):
        self.require_fixture_screen(expected)
        self.save_screenshot(name)

    def initial_diagnostics(self, launch_status, email_found, *, include_messages=False):
        # Call only before any credentials have been typed on the fresh install.
        def read(*command):
            try:
                return self.adb("inspect initial Android state", "shell", *command).decode(errors="replace")
            except QAError:
                return ""

        windows = read("dumpsys", "window", "windows")
        focus_line = next((line for line in windows.splitlines() if "mCurrentFocus=" in line), "")
        focus = re.search(r"\b([A-Za-z0-9_.]+/[A-Za-z0-9_.$]+)\b", focus_line)
        focused_activity = focus[1] if focus and focus[1].startswith((
            f"{PACKAGE}/", "com.android.", "com.google.android.",
        )) else "unavailable"
        exits = read("dumpsys", "activity", "exit-info", PACKAGE)
        reason = re.search(r"\breason=(\d+)\b", exits)
        crashes = filtered_crashes(
            read("logcat", "-b", "crash", "-d", "-v", "raw", "-t", "300"),
            include_messages=include_messages,
        )
        if not any(
            item["role"] == "cause" or item["exceptionClass"] != "java.lang.RuntimeException"
            for crash in crashes for item in crash.get("exceptions", [])
        ):
            fallback = filtered_crashes(
                read("dumpsys", "dropbox", "--print", "data_app_crash"),
                dropbox=True, include_messages=include_messages,
            )
            if fallback:
                crashes = (crashes + fallback)[-3:]

        nodes = self.visible_hierarchy()
        safe_nodes = []
        for node in nodes[:80]:
            package = node.get("package", "")
            cls = node.get("class", "")
            safe = {
                "source": "app" if package == PACKAGE else "system" if package.startswith(
                    ("com.android.", "com.google.android.", "android")
                ) else "other",
                "class": cls if re.fullmatch(r"android\.[\w.$]+", cls) else "other",
                "bounds": bounds(node),
            }
            label = next((label for label in INITIAL_LABELS if label_matches(node, (label,))), None)
            if label and package == PACKAGE:
                safe["label"] = label
            safe_nodes.append(safe)
        diagnostic = {
            "activityStartStatus": launch_status,
            "focusedActivity": focused_activity,
            "appProcessAlive": bool(re.fullmatch(r"\d+(?:\s+\d+)*", read("pidof", PACKAGE).strip())),
            "lastAppExitReasonCode": int(reason[1]) if reason else None,
            "appCrashes": crashes,
            "hierarchyStatus": self.hierarchy_status,
            "visibleAppNodeCount": sum(node.get("package") == PACKAGE for node in nodes),
            "emailControlDetected": email_found,
            "visibleNodes": safe_nodes,
            "screenshotCaptured": False,
        }
        try:
            self.save_screenshot("initial-screen")
            diagnostic["screenshotCaptured"] = True
        except QAError:
            pass
        (self.evidence / "initial-diagnostics.json").write_text(
            json.dumps(diagnostic, indent=2) + "\n", encoding="utf-8",
        )

    def failure_diagnostics(self):
        """Retain fixed navigation labels only after credentials may have been entered."""
        def read(*command):
            try:
                return self.adb("inspect failed Android navigation", "shell", *command,
                                timeout=5).decode(errors="replace")
            except QAError:
                return ""

        nodes = self.hierarchy()
        safe_nodes = []
        for node in nodes[:120]:
            cls = node.get("class", "")
            # Editable text and descriptions can contain email, OTP or fixture input.
            if cls == "android.widget.EditText":
                continue
            label = next((value for value in FAILURE_LABELS if label_matches(node, (value,))), None)
            if label:
                safe_nodes.append({"label": label, "class": cls if re.fullmatch(
                    r"android\.[\w.$]+", cls) else "other", "bounds": bounds(node)})
        activities = read("dumpsys", "activity", "activities")
        resumed = next((line for line in activities.splitlines()
                        if "mResumedActivity" in line or "topResumedActivity" in line), "")
        activity = re.search(rf"\b{re.escape(PACKAGE)}/([A-Za-z0-9_.$]+)\b", resumed)
        exits = read("dumpsys", "activity", "exit-info", PACKAGE)
        reason = re.search(r"\breason=(\d+)\b", exits)
        crashes = filtered_crashes(read("logcat", "-b", "crash", "-d", "-v", "raw", "-t", "300"))
        if not crashes:
            crashes = filtered_crashes(read("dumpsys", "dropbox", "--print", "data_app_crash"),
                                       dropbox=True)
        diagnostic = {
            "phase": self.phase,
            "focusedAppActivity": f"{PACKAGE}/{activity[1]}" if activity else "unavailable",
            "appProcessAlive": bool(re.fullmatch(r"\d+(?:\s+\d+)*", read("pidof", PACKAGE).strip())),
            "lastAppExitReasonCode": int(reason[1]) if reason else None,
            "appCrashes": crashes,
            "hierarchyStatus": self.hierarchy_status,
            "visibleAppNodeCount": len(nodes),
            "authControlsVisible": email_control(nodes) is not None or bool(self.labels(nodes, OTP, editable=True)),
            "visibleNavigation": safe_nodes,
            "screenshotCaptured": False,
        }
        (self.evidence / "failure-diagnostics.json").write_text(
            json.dumps(diagnostic, indent=2) + "\n", encoding="utf-8",
        )

    @contextmanager
    def recording(self, filename, expected):
        self.require_fixture_screen(expected)
        remote = "/sdcard/manager247-upgrade-qa.mp4"
        pending = self.evidence / f"{filename}.partial"
        self.adb("remove stale screen recording", "shell", "rm", "-f", remote)
        recorder = subprocess.Popen(
            [*self.command, "shell", "screenrecord", "--time-limit", "20", "--size", "480x976",
             "--bit-rate", "1200000", remote],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        try:
            yield
            try:
                exit_code = recorder.wait(timeout=30)
            except subprocess.TimeoutExpired:
                raise QAError("The Android screen recording did not stop") from None
            require(exit_code == 0, "Android failed to record the fixture screen")
            self.adb("pull the finished screen recording", "pull", remote, str(pending))
            with pending.open("rb") as video:
                require(video.read(8)[4:] == b"ftyp" and pending.stat().st_size > 1024,
                        "The Android screen recording is not a usable MP4")
            pending.replace(self.evidence / filename)
        finally:
            if recorder.poll() is None:
                recorder.kill()
                recorder.wait()
            pending.unlink(missing_ok=True)


def email_control(nodes):
    inputs = [node for node in nodes if node.get("class") == "android.widget.EditText"]
    known = Device.labels(inputs, EMAIL + EMAIL_HINT)
    if len(known) == 1:
        return known[0]
    if len(inputs) == 1 and Device.labels(nodes, HAVE_CODE) and Device.labels(nodes, SEND_CODE):
        return inputs[0]
    return None


def wait_for_sign_in(device):
    return device.wait("the initial sign-in email field", email_control, scroll="both", seconds=90)


def sign_in(device, email_field, email, code, location_name, entry):
    device.phase = "login-email"
    device.type(email_field, email)
    device.phase = "login-existing-code"
    device.click(HAVE_CODE, scroll="down")
    device.phase = "login-code-entry"
    device.type(device.find(OTP, scroll="down"), code)
    device.phase = "login-submit"
    device.click(VERIFY, scroll="down")
    entry["emailCodeSubmitted"] = True

    def choose(nodes):
        if device.labels(nodes, HOME):
            return "home", None
        if not entry.get("firstLocationSubmitted") and device.labels(nodes, LOCATION_SETUP):
            return "location", None
        if not entry.get("onboardingDismissed"):
            controls = device.labels(nodes, ONBOARDING)
            if controls:
                return "onboarding", max(controls, key=lambda node: node.get("clickable") == "true")
        return None

    # A new owner passes onboarding and first-location setup before the app exposes tabs.
    device.phase = "login-route"
    for _ in range(3):
        route, control = device.wait("signed-in home, onboarding or first-location setup", choose,
                                     scroll="both", seconds=90)
        if route == "home":
            entry["homeConfirmed"] = True
            entry["firstLocationCreated"] = bool(entry.get("firstLocationSubmitted"))
            device.phase = "home-ready"
            print("Synthetic staging owner authenticated through the email-code UI.", flush=True)
            return
        if route == "onboarding":
            device.phase = "onboarding-dismiss"
            device.tap(control)
            entry["onboardingDismissed"] = True
            device.phase = "await-home-after-onboarding"
        else:
            device.phase = "first-location-fill"
            device.set_field(LOCATION_NAME, location_name, scroll="both")
            device.set_field(LOCATION_ADDRESS, "1 Test Street", scroll="both")
            device.phase = "first-location-save"
            device.click(CREATE_LOCATION, scroll="both")
            entry["firstLocationSubmitted"] = True
            device.phase = "await-home-after-location"
    raise QAError("The bounded first-use route did not reach Home")


def ingredient_field(device, name, labels):
    """Select the first matching field below this ingredient's name, before the next row."""
    def choose(nodes):
        names = device.labels(nodes, INGREDIENT, editable=True)
        anchors = [node for node in names if node.get("text") == name]
        if not anchors:
            return None
        top = bounds(anchors[0])[1]
        next_row = min((bounds(node)[1] for node in names if bounds(node)[1] > top), default=device.height)
        candidates = [
            node for node in device.labels(nodes, labels, editable=True)
            if top < bounds(node)[1] < next_row
        ]
        return min(candidates, key=lambda node: bounds(node)[1], default=None)

    return device.wait(f"{labels[0]} for {name}", choose, scroll="both")


def fill_ingredient(device, name, quantity, price):
    def next_blank(nodes):
        return next((
            node for node in device.labels(nodes, INGREDIENT, editable=True)
            if node.get("text", "") in INGREDIENT_PLACEHOLDERS
        ), None)

    device.type(device.wait("blank ingredient row", next_blank, scroll="both"), name)
    # These new numeric fields start at 0 and normalize the typed decimal input on change.
    device.type(ingredient_field(device, name, QUANTITY), quantity, keep_numeric_zero=True)
    device.type(ingredient_field(device, name, PRICE), price, keep_numeric_zero=True)


def create_recipe(device, title, ingredients):
    device.tab(RECIPES)
    device.folder(RECIPES)
    device.click(CREATE_RECIPE)
    device.set_field(RECIPE_TITLE, title, scroll="down")
    for name, quantity, price in ingredients:
        fill_ingredient(device, name, quantity, price)
    device.click(SAVE_RECIPE)
    device.find(recipe_card(title), scroll="down", seconds=60)


def equipment_registry(device):
    device.tab(PRODUCTION)
    device.folder(EQUIPMENT_FOLDER)
    device.folder(OPEN_EQUIPMENT)
    device.find(EQUIPMENT_REGISTRY, scroll="down")


def create_equipment(device, name, brand):
    equipment_registry(device)
    device.click(ADD_EQUIPMENT, scroll="down")
    device.set_field(EQUIPMENT_NAME, name, scroll="down")
    device.set_field(EQUIPMENT_BRAND, brand, scroll="down")
    device.click(SAVE_EQUIPMENT, scroll="down")
    device.wait("saved equipment in the registry", lambda nodes: next((
        node for node in device.labels(nodes, (name,)) if node.get("class") != "android.widget.EditText"
    ), None), scroll="up")


def recipe_card(title):
    return (f"Deschide rețeta {title}", f"Open recipe {title}")


def assert_recipe(device, title, ingredients, phase, record=False):
    device.tab(RECIPES)
    device.folder(MY_RECIPES)
    device.set_field(SEARCH_RECIPE, title, scroll="down")
    card = recipe_card(title)
    device.find(card, scroll="down")
    require(len(device.labels(device.hierarchy(), card)) == 1, "The unique QA recipe is missing or duplicated")
    device.screenshot(f"{phase}-recipe", card)
    filename = f"{phase}-recipe.mp4"
    with device.recording(filename, card) if record else nullcontext():
        device.click(card)
        # Compact APK 68/69 editors place the coverage summary before the dish field.
        coverage = re.compile(rf"^\d+/{len(ingredients)} (?:ingrediente|ingredients)\b")
        device.wait("the expected ingredient count", lambda nodes: next((
            node for node in nodes if coverage.match(node.get("text", "").strip())
        ), None), scroll="both")
        require(device.find(RECIPE_TITLE, editable=True, scroll="both").get("text") == title, "The recipe title changed")
        for name, quantity, price in ingredients:
            require(ingredient_field(device, name, QUANTITY).get("text") == quantity, "An ingredient quantity changed")
            require(ingredient_field(device, name, PRICE).get("text") == price, "An ingredient purchase price changed")
            device.screenshot(f"{phase}-{name.lower()}", (name,))
    return filename if record else None


def assert_equipment(device, name, brand, phase):
    equipment_registry(device)
    device.find((name,), scroll="down")

    def sheet(nodes):
        names = device.labels(nodes, (name,))
        if not names:
            return None
        require(len(names) == 1, "The unique QA equipment is duplicated")
        top = bounds(names[0])[1]
        candidates = [node for node in device.labels(nodes, EQUIPMENT_SHEET) if bounds(node)[1] > top]
        return min(candidates, key=lambda node: bounds(node)[1], default=None)

    device.tap(device.wait("sheet and history for QA equipment", sheet, scroll="both"))
    name_field = device.find(EQUIPMENT_NAME, editable=True, scroll="down")
    require(name_field.get("text") == name, "The equipment name changed or a different equipment sheet opened")
    require(device.find(EQUIPMENT_BRAND, editable=True, scroll="down").get("text") == brand, "The equipment brand changed")
    device.screenshot(f"{phase}-equipment", (name,))


def relaunch(device):
    device.stop()
    device.launch()
    device.find(HOME, seconds=75)


def run(device, apk_dir, verified, result):
    email = os.environ.get("QA_STAGING_EMAIL", "")
    code = os.environ.get("QA_STAGING_OTP", "")
    require(re.fullmatch(r"[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", email)
            and re.fullmatch(r"\d{6,10}", code), "A synthetic staging owner and a fresh email code are required")
    run_id = os.environ.get("GITHUB_RUN_ID", "0")
    attempt = os.environ.get("GITHUB_RUN_ATTEMPT", "1")
    require(run_id.isdecimal() and attempt.isdecimal(), "The QA run identifier is invalid")
    suffix = f"{run_id}-{attempt}"
    title = f"QA Recipe {suffix}"
    equipment = f"QA Oven {suffix}"
    brand = "QABrand"
    ingredients = (("QACarrot", "125", "12"), ("QARice", "250", "8"))

    device.phase = "install-baseline"
    device.install(apk_dir / "apk68.apk")
    original = device.package_info(68)
    launch_status = "failed"
    try:
        launch_status = device.launch()
        email_field = wait_for_sign_in(device)
    except QAError:
        device.initial_diagnostics(launch_status, email_found=False)
        raise
    entry = {"emailCodeSubmitted": False, "homeConfirmed": False}
    result["entry"] = entry
    sign_in(device, email_field, email, code, f"QA Kitchen {suffix}", entry)
    device.phase = "create-recipe"
    create_recipe(device, title, ingredients)
    # Start from the app's normal entry point before going to another module.
    relaunch(device)
    device.phase = "create-equipment"
    create_equipment(device, equipment, brand)

    versions = [entry["versionCode"] for entry in verified]
    for version in versions:
        phase = f"apk{version}"
        device.phase = f"verify-{phase}"
        if version != 68:
            device.stop()
            device.install(apk_dir / f"{phase}.apk", upgrade=True)
        observed = device.package_info(version)
        require(all(observed[key] == original[key] for key in ("uid", "firstInstallTime")),
                "Android package UID or first installation time changed across the update")
        relaunch(device)
        recording = assert_recipe(device, title, ingredients, phase, record=version == versions[-1])
        relaunch(device)
        assert_equipment(device, equipment, brand, phase)
        checkpoint = {
            **observed,
            "signedInAfterRelaunch": True,
            "recipe": title,
            "ingredientsVerified": len(ingredients),
            "equipment": equipment,
            "equipmentBrand": brand,
        }
        if recording:
            checkpoint["screenRecording"] = recording
        result["checkpoints"].append(checkpoint)
        print(f"APK {version}: retained signed-in access, recipe and equipment fields verified.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adb", required=True)
    parser.add_argument("--apk-dir", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--diagnostics-only", action="store_true")
    args = parser.parse_args()
    result = {"status": "failed", "checkpoints": []}
    device = None
    args.evidence.mkdir(parents=True, exist_ok=True)
    try:
        verified = json.loads((args.evidence / "verified-apks.json").read_text(encoding="utf-8"))
        expected = ([68],) if args.diagnostics_only else ([68, 69], [68, 69, 70])
        require([item["versionCode"] for item in verified] in expected,
                "The ordered APK verification record is missing or invalid")
        identities = {(item.get("artifactSet", "arm64-original"),
                       item.get("evidenceClass", "original-arm64-staging-apk"), item["nativeAbi"])
                      for item in verified}
        require(len(identities) == 1, "The APK evidence mixes different artifact sets or architectures")
        artifact_set, evidence_class, native_abi = identities.pop()
        result.update(artifactSet=artifact_set, evidenceClass=evidence_class, nativeAbi=native_abi)
        device = Device(args.adb, os.environ.get("ANDROID_SERIAL", "emulator-5554"), args.evidence)
        if args.diagnostics_only:
            device.install(args.apk_dir / "apk68.apk")
            result["installedBaseline"] = device.package_info(68)
            launch_status = "failed"
            try:
                launch_status = device.launch()
                device.wait("the initial sign-in email field", email_control, seconds=90)
                email_found = True
            except QAError:
                email_found = False
            device.initial_diagnostics(launch_status, email_found, include_messages=True)
            result["status"] = "diagnostic"
            print("Initial Android diagnostics collected before credential input.")
        else:
            run(device, args.apk_dir, verified, result)
            result["status"] = "passed"
    except QAError as error:
        result["failure"] = str(error)
    except Exception as error:
        result["failure"] = f"Unexpected harness error ({type(error).__name__})"
    finally:
        if result["status"] == "failed" and device is not None:
            try:
                device.failure_diagnostics()
                result["failureDiagnosticsCaptured"] = True
            except Exception:
                result["failureDiagnosticsCaptured"] = False
        (args.evidence / "upgrade-results.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    if result["status"] == "failed":
        print(result["failure"], file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
