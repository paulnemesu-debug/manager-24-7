"""Draft supplemental smoke. Run only after the reviewed offline test leaves APK70 installed."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import struct
import sys
import time
import zlib

sys.dont_write_bytecode = True
SINK = "ro.paradim.qa.pdfsink"
SHARE_TARGET = "QA PDF Save"
COMPLIANCE = ("Conformitate", "Compliance")
INGREDIENTS_TAB = ("Ingrediente", "Ingredients")
DOWNLOAD_PDF = ("Descarcă PDF", "Download PDF")
GALLERY = ("Alege din galerie", "Choose from gallery")
CAMERA = ("Fă fotografie", "Take photo")
PHOTO = ("Recipe photo",)
IMAGE_NAME = "qa-native-image.png"
SYSTEM_PACKAGES = frozenset((SINK, "android", "com.android.intentresolver", "com.google.android.intentresolver",
    "com.android.documentsui", "com.google.android.documentsui", "com.android.providers.media",
    "com.android.providers.media.module", "com.google.android.providers.media.module",
    "com.android.permissioncontroller", "com.google.android.permissioncontroller"))
SYSTEM_TEXT = frozenset((SHARE_TARGET, "QA PDF saved", "QA PDF sink ready", "Reopen saved PDF",
    "QA PDF saved and reopened", "QA PDF rendered page 1", "Share", "Share with", "Sharing",
    "Complete action using", "Just once", "Always", "Files", "Recent", "Images", "Browse",
    "Downloads", "Documents", "Photos", "Open from", "Select", "Allow", "Deny", "Don't allow",
    "While using the app", IMAGE_NAME))
CONTROL_NAMES = frozenset(("QA PDF Save sharesheet target", "native PDF receiver saved confirmation",
    "reopen saved PDF button", "Android PdfRenderer reopen confirmation", "permission or picker control",
    "synthetic gallery image qa-native-image.png", "emulated camera shutter",
    "camera result acceptance", "Expo image crop acceptance"))


class NativeControlError(RuntimeError):
    def __init__(self, description):
        self.control = description if description in CONTROL_NAMES else "unclassified-native-control"
        super().__init__("A reviewed native control was not found")


def system_failure_evidence(device, title):
    """Bounded known-system metadata only. Unknown text or input prevents screenshots."""
    result = {"screenshotCaptured": False, "controls": [], "focusedActivity": "unavailable"}
    if device.phase not in ("supplemental-pdf-share", "supplemental-pdf-reopen", "supplemental-gallery-picker"):
        return result
    try:
        activity = device.adb("inspect known native UI focus", "shell", "dumpsys", "activity", "activities").decode(errors="replace")
        for line in activity.splitlines():
            if "ResumedActivity" not in line:
                continue
            match = re.search(r"\s([A-Za-z][\w.]*)/([A-Za-z0-9_.$]+)", line)
            if match and match[1] in SYSTEM_PACKAGES:
                result["focusedActivity"] = f"{match[1]}/{match[2]}"
                break
    except Exception:
        pass
    nodes = device.visible_hierarchy()
    filename = re.sub(r"[^a-zA-Z0-9]+", "-", title).strip("-").lower() + "-food-cost.pdf"
    def safe_text(value):
        return (value in SYSTEM_TEXT or value == filename or value == "Saved file: " + filename
                or bool(re.fullmatch(r"(?:Bytes|Pages): \d{1,8}|SHA256: [a-f0-9]{64}|QA PDF failed: (?:SecurityException|IOException|FileNotFoundException|IllegalStateException|IllegalArgumentException)", value)))
    counts = {}
    image_safe = result["focusedActivity"] != "unavailable"
    for node in nodes:
        package = node.get("package", "")
        if package == "com.android.systemui":
            chrome = (node.get("text", "").strip(), node.get("content-desc", "").strip())
            if any(value and value not in ("Back", "Home", "Overview", "Recent apps")
                   and not re.fullmatch(r"\d{1,2}:\d{2}(?:\s*[AP]M)?", value) for value in chrome):
                image_safe = False
            continue  # Never retain notification text or capture uncertain chrome.
        values = [value.strip() for value in (node.get("text", ""), node.get("content-desc", "")) if value.strip()]
        if package not in SYSTEM_PACKAGES:
            image_safe = False
            continue
        counts[package] = counts.get(package, 0) + 1
        cls = node.get("class", "")
        if cls == "android.widget.EditText" or any(not safe_text(value) for value in values):
            image_safe = False
        coordinates = [int(value) for value in re.findall(r"\d+", node.get("bounds", ""))]
        item = {"package": package, "class": cls if re.fullmatch(r"(?:android|androidx)\.[\w.$]+", cls) else "other"}
        if len(coordinates) == 4:
            item["bounds"] = coordinates
        resource = node.get("resource-id", "")
        if re.fullmatch(r"[a-z][a-z0-9_.]+:id/[A-Za-z_][A-Za-z0-9_]{0,79}", resource):
            item["resourceId"] = resource
        if cls != "android.widget.EditText":
            label = next((value for value in values if safe_text(value)), None)
            if label is not None:
                item["label"] = label
        if len(result["controls"]) < 100:
            result["controls"].append(item)
    result["knownPackageNodeCounts"] = counts
    result["unknownPackageNodeCount"] = sum(1 for node in nodes if node.get("package", "") not in SYSTEM_PACKAGES | {"com.android.systemui"})
    if image_safe and counts:
        # Refuse a changed screen rather than capture a new unreviewed surface.
        if [node.attrib for node in device.visible_hierarchy()] == [node.attrib for node in nodes]:
            device.save_screenshot("native-system-failure")
            result["screenshotCaptured"] = True
    return result


def system_find(device, choose, description, seconds=45):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        match = choose(device.visible_hierarchy())
        if match is not None:
            return match
        time.sleep(0.5)
    raise NativeControlError(description)


def select(nodes, labels=(), ids=(), packages=()):
    return next((node for node in nodes if node.get("package", "") in packages
                 and (node.get("text", "").strip() in labels
                      or node.get("content-desc", "").strip() in labels
                      or any(node.get("resource-id", "").endswith("/" + key) for key in ids))), None)


def receiver_nodes(device):
    return [node for node in device.visible_hierarchy() if node.get("package") == SINK]


def pdf_smoke(device, base, title, evidence):
    device.phase = "supplemental-pdf-export"
    installed = device.adb("check the reviewed local PDF recipient", "shell", "pm", "path", SINK)
    base.require(installed.startswith(b"package:"), "The reviewed QA PDF receiver is not installed")
    device.click(COMPLIANCE, scroll="both")
    device.click(DOWNLOAD_PDF, scroll="both")
    device.phase = "supplemental-pdf-share"
    choice = system_find(device, lambda nodes: select(nodes, labels=(SHARE_TARGET, "QA PDF saved"),
        packages=("android", "com.android.intentresolver", "com.google.android.intentresolver", SINK)),
        "QA PDF Save sharesheet target")
    if choice.get("package") != SINK:
        device.tap(choice)
    system_find(device, lambda nodes: select(nodes, labels=("QA PDF saved",), packages=(SINK,)),
                "native PDF receiver saved confirmation")
    expected_name = re.sub(r"[^a-zA-Z0-9]+", "-", title).strip("-").lower() + "-food-cost.pdf"
    labels = [node.get("text", "") for node in receiver_nodes(device)]
    base.require("Saved file: " + expected_name in labels, "The receiver saved another file")
    sha = next((line.removeprefix("SHA256: ") for line in labels if re.fullmatch(r"SHA256: [a-f0-9]{64}", line)), None)
    base.require(sha, "The native receiver did not confirm its saved PDF checksum")
    device.save_screenshot("native-pdf-saved")
    device.phase = "supplemental-pdf-reopen"
    device.adb("close the PDF recipient", "shell", "am", "force-stop", SINK)
    device.adb("launch the PDF recipient again", "shell", "am", "start", "-W", "-a",
               "android.intent.action.MAIN", "-n", f"{SINK}/.PdfReceiverActivity")
    button = system_find(device, lambda nodes: select(nodes, labels=("Reopen saved PDF",), packages=(SINK,)),
                         "reopen saved PDF button")
    device.tap(button)
    system_find(device, lambda nodes: select(nodes, labels=("QA PDF saved and reopened",), packages=(SINK,)),
                "Android PdfRenderer reopen confirmation")
    rendered = select(receiver_nodes(device), labels=("QA PDF rendered page 1",), packages=(SINK,))
    base.require(rendered is not None, "The first PDF page was not rendered natively")
    page_text = [node.get("text", "") for node in receiver_nodes(device)]
    pages = next((int(line.removeprefix("Pages: ")) for line in page_text if re.fullmatch(r"Pages: [1-9]\d*", line)), None)
    base.require(pages, "The native PDF page count is missing")
    device.save_screenshot("native-pdf-reopened")
    saved = evidence / "native-recipe.pdf"
    device.adb("pull the synthetic saved PDF", "pull", f"/sdcard/Download/Manager247-QA/{expected_name}", str(saved))
    content = saved.read_bytes()
    base.require(content.startswith(b"%PDF-") and hashlib.sha256(content).hexdigest() == sha,
                 "The reopened public PDF bytes do not match the native save checksum")
    return {"generatedThroughApp": True, "sharedToLocalReceiver": True, "savedToDownloads": True,
            "reopenedAfterReceiverColdStart": True, "nativePageCount": pages,
            "sha256": sha, "bytes": len(content), "file": saved.name, "visualPageReviewRequired": True}


def permission_or_control(device, labels=(), ids=(), packages=(), description="permission or picker control"):
    def choose(nodes):
        permission = select(nodes, ids=("permission_allow_foreground_only_button", "permission_allow_button"),
                            packages=("com.android.permissioncontroller", "com.google.android.permissioncontroller"))
        return permission if permission is not None else select(nodes, labels=labels, ids=ids, packages=packages)
    for _ in range(3):
        control = system_find(device, choose, description)
        if control.get("package", "").endswith("permissioncontroller"):
            device.tap(control)
        else:
            return control
    raise RuntimeError("The bounded permission flow did not reach the picker")


def seed_image(device, evidence):
    # Small deterministic RGB color bars exercise decoding/cropping without external photos.
    width, height = 320, 180
    colors = ((238, 70, 50), (45, 180, 100), (50, 100, 230), (245, 205, 60))
    pixels = b"".join(b"\x00" + b"".join(bytes(colors[x * 4 // width]) for x in range(width)) for _ in range(height))
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    image = evidence / IMAGE_NAME
    image.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
                      + chunk(b"IDAT", zlib.compress(pixels)) + chunk(b"IEND", b""))
    remote = f"/sdcard/Pictures/Manager247-QA/{IMAGE_NAME}"
    device.adb("create the synthetic gallery folder", "shell", "mkdir", "-p", "/sdcard/Pictures/Manager247-QA")
    device.adb("push the synthetic gallery image", "push", str(image), remote)
    device.adb("scan the synthetic gallery image", "shell", "am", "broadcast", "-a",
               "android.intent.action.MEDIA_SCANNER_SCAN_FILE", "-d", "file://" + remote)
    return hashlib.sha256(image.read_bytes()).hexdigest()


def photo_smoke(device, base, title, evidence, mode):
    device.phase = f"supplemental-{mode}-picker"
    device.click(INGREDIENTS_TAB, scroll="both")
    if mode == "gallery":
        fixture_sha = seed_image(device, evidence)
        device.click(GALLERY, scroll="both")
        picked = permission_or_control(device, labels=(IMAGE_NAME,), description="synthetic gallery image qa-native-image.png",
            packages=("com.android.documentsui", "com.google.android.documentsui", "com.android.providers.media.module", "com.google.android.providers.media.module"))
        device.tap(picked)
    else:
        cameras = device.adb("read emulated camera availability", "shell", "dumpsys", "media.camera").decode()
        count = re.search(r"Number of camera devices:\s*(\d+)", cameras)
        base.require(count and int(count[1]) > 0, "Camera smoke requires emulator -camera-back emulated")
        fixture_sha = None
        device.click(CAMERA, scroll="both")
        shutter = permission_or_control(device, labels=("Shutter", "Take photo"), ids=("shutter_button",), description="emulated camera shutter",
            packages=("com.android.camera2", "com.google.android.GoogleCamera"))
        device.tap(shutter)
        accepted = system_find(device, lambda nodes: select(nodes, labels=("Done", "Use photo"),
            ids=("done_button", "review_done"), packages=("com.android.camera2", "com.google.android.GoogleCamera")),
            "camera result acceptance")
        device.tap(accepted)
    device.phase = f"supplemental-{mode}-crop"
    crop = system_find(device, lambda nodes: select(nodes, labels=("Crop", "CROP"), ids=("crop_image_menu_crop",),
        packages=(base.PACKAGE,)), "Expo image crop acceptance")
    device.tap(crop)
    device.find(PHOTO, scroll="both", seconds=60)
    device.screenshot(f"native-{mode}-preview", PHOTO)
    device.phase = f"supplemental-{mode}-save"
    device.click(base.SAVE_RECIPE + ("Salvează modificările", "Save changes"))
    device.find(base.recipe_card(title), scroll="both", seconds=60)
    open_fixture(device, base, title)
    device.phase = f"supplemental-{mode}-reopen"
    device.find(PHOTO, scroll="both", seconds=60)
    device.screenshot(f"native-{mode}-reopened", PHOTO)
    return {"source": mode, "syntheticGallerySha256": fixture_sha, "pickerAndCropAccepted": True,
            "photoPresentAfterRecipeSaveAndColdStart": True, "visualPhotoIdentityReviewRequired": True}


def open_fixture(device, base, title):
    base.relaunch(device)
    device.tab(base.RECIPES)
    device.folder(base.MY_RECIPES)
    device.set_field(base.SEARCH_RECIPE, title, scroll="both")
    device.click(base.recipe_card(title), scroll="both")
    base.require(device.find(base.RECIPE_TITLE, editable=True, scroll="both").get("text") == title,
                 "The supplemental smoke opened another recipe")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-harness", type=Path, required=True)
    parser.add_argument("--base-evidence", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--apk70-sha256", required=True)
    parser.add_argument("--adb", required=True)
    parser.add_argument("--mode", choices=("pdf", "gallery", "camera"), default="pdf")
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    if not args.execute:
        raise RuntimeError("Execution requires the explicit reviewed --execute option")
    args.evidence.mkdir(parents=True, exist_ok=False)
    result = {"status": "failed", "mode": args.mode, "supplementalSmoke": True}
    device = None
    try:
        proof = json.loads((args.base_evidence / "upgrade-results.json").read_text())
        verified = json.loads((args.base_evidence / "verified-apks.json").read_text())
        final = proof["checkpoints"][-1]
        identity = next(item for item in verified if item["versionCode"] == 70)
        spec = importlib.util.spec_from_file_location("base_native_qa", args.base_harness)
        base = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(base)
        if not (base.candidate70_accepted(proof)
                and final["versionCode"] == "70" and final["networkMode"] == "online"
                and identity["sha256"] == args.apk70_sha256.lower()
                and identity["compiledStagingUrlVerified"] is True
                and identity["package"] == "ro.paradim.professionalfoodcost"
                and identity["signerSha256"] == "b7125f9e38bd66ba1226b0ff063d15569320006f3b193a1da297d485deeec3ed"):
            raise RuntimeError("Reviewed offline APK70 acceptance evidence is required")
        title = final["recipe"]
        if not re.fullmatch(r"QA Recipe \d+-\d+", title):
            raise RuntimeError("A synthetic recipe fixture is required")
        device = base.Device(args.adb, os.environ.get("ANDROID_SERIAL", "emulator-5554"), args.evidence)
        installed = device.package_info(70)
        base.require(all(installed[key] == final[key] for key in ("uid", "firstInstallTime")),
                     "The installed package differs from the accepted offline test")
        open_fixture(device, base, title)
        result["result"] = (pdf_smoke(device, base, title, args.evidence) if args.mode == "pdf"
                            else photo_smoke(device, base, title, args.evidence, args.mode))
        result.update(status="passed", recipe=title, evidenceClass=identity["evidenceClass"])
    except Exception as error:
        result["failureClass"] = type(error).__name__
        result["failureStage"] = device.phase if device is not None else "preflight"
        if isinstance(error, NativeControlError):
            result["failureControl"] = error.control
        # Never retain native intents, URLs, editable fields or raw error output.
        if device is not None:
            try:
                result["systemFailure"] = system_failure_evidence(device, title)
            except Exception:
                result["systemDiagnosticUnavailable"] = True
            try:
                device.failure_diagnostics()
            except Exception:
                result["failureDiagnosticsUnavailable"] = True
    finally:
        (args.evidence / "supplemental-results.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"status": result["status"], "mode": args.mode}))
    return 0 if result["status"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
