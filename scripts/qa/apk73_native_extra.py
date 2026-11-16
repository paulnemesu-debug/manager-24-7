"""Optional local-only recipe PDF and gallery checks on a disposable offline APK73 guest."""

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sqlite3
import struct
import tempfile
import time
import zlib


here = Path(__file__).resolve().parent
source = here / "apk73-functional-qa.py"
if not source.is_file():
    source = here.parent / "apk73-ci" / source.name
spec = importlib.util.spec_from_file_location("apk73_functional", source)
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)
native = qa.native
require = native.require

SINK = "ro.paradim.qa.pdfsink"
SINK_ACTIVITY = SINK + "/.PdfReceiverActivity"
SHARE_PACKAGES = {"android", "com.android.intentresolver", "com.google.android.intentresolver"}
PICKER_PACKAGES = {"com.android.documentsui", "com.google.android.documentsui",
                   "com.android.providers.media.module", "com.google.android.providers.media.module"}
PERMISSION_PACKAGES = {"com.android.permissioncontroller", "com.google.android.permissioncontroller"}
RECIPE_KEY = "professional_foodcost.demo_recipes.v2"
RECIPES = {"Rețete", "Recipes"}
CREATE = {"Creează rețetă", "Create recipe"}
TITLE = {"Denumire preparat", "Dish name"}
INGREDIENT = {"Ingredient"}
QTY = {"Cantitate folosită", "Quantity used"}
PRICE = {"Preț achiziție", "Purchase price"}
SAVE = {"Salvează", "Save", "Salvează rețeta", "Save recipe", "Salvează modificările", "Save changes"}
PHOTO = {"Recipe photo"}


def match(tree, packages, names=(), ids=()):
    return qa.unique(node for node in tree.iter("node") if node.get("package") in packages
                     and (qa.labels(node) & set(names) or node.get("resource-id", "").rsplit("/", 1)[-1] in ids))


def share_target(tree):
    return match(tree, SHARE_PACKAGES, {"QA PDF Save"})


def gallery_target(tree, filename):
    return match(tree, PICKER_PACKAGES, {filename})


def pdf_evidence(path, sha, size, pages):
    require(re.fullmatch(r"[a-f0-9]{64}", sha) and pages > 0 and 5 < size <= 10 * 1024 * 1024,
            "Missing receiver byte count, digest or native render")
    require(path.stat().st_size == size, "The Downloads PDF byte count differs from the recipient")
    with path.open("rb") as saved:
        require(saved.read(5) == b"%PDF-", "Downloads file has no PDF header")
    require(native.sha256_file(path) == sha, "The Downloads PDF differs from the receiver digest")
    return {"bytes": size, "sha256": sha, "renderedPages": pages}


class ExtraGuest(qa.DemoGuest):
    def find(self, step, choose, *, scroll=False):
        for attempt in range(9):
            tree = self.tree()
            if tree is not None:
                node = choose(tree)
                if qa.point(node):
                    return node
                if scroll and attempt > 0:
                    self.swipe(tree)
            time.sleep(0.6)
        raise native.CheckError("Expected one native control at " + step)

    def tap(self, node):
        self.run("Tap the verified native control", "shell", "input", "tap", *qa.point(node))

    def click(self, step, labels, *, scroll=False):
        self.tap(self.find(step, lambda tree: qa.control(tree, labels, clickable=True), scroll=scroll))

    def fill(self, step, labels, value, *, blank=("",)):
        require(re.fullmatch(r"[A-Za-z0-9 -]+", value), "Unexpected synthetic recipe input")

        def field(tree, texts):
            return qa.unique(node for node in qa.app_nodes(tree) if qa.labels(node) & labels
                             and node.get("class") == "android.widget.EditText"
                             and node.get("text", "") in texts)

        self.tap(self.find(step, lambda tree: field(tree, blank), scroll=True))
        self.find(step + "-focused", lambda tree: qa.unique(
            node for node in qa.app_nodes(tree) if qa.labels(node) & labels
            and node.get("class") == "android.widget.EditText" and node.get("focused") == "true"
        ))
        # Existing numeric zero is retained because the app immediately normalizes a cleared number.
        self.run("Type the synthetic recipe input", "shell", "input", "text", value.replace(" ", "%s"))
        self.keyboard_back()
        self.find(step + "-typed", lambda tree: field(tree, {value}))

    def read_recipe(self, title):
        for _ in range(5):
            values = json.loads(self.demo_value(RECIPE_KEY) or "[]")
            recipes = [recipe for recipe in values if recipe["title"] == title]
            require(len(recipes) <= 1, "The synthetic recipe is duplicated")
            if recipes:
                return recipes[0]
            time.sleep(0.5)
        raise native.CheckError("The synthetic recipe was not saved")

    def reopen_recipe(self, title):
        self.click("synthetic-recipe-card", {f"Deschide rețeta {title}", f"Open recipe {title}"}, scroll=True)
        self.find("expected-recipe-editor", lambda tree: qa.unique(node for node in qa.app_nodes(tree)
                  if node.get("class") == "android.widget.EditText" and node.get("text") == title))

    def create_demo_recipe(self, title):
        self.offline()
        self.stop()
        self.launch()
        self.click("instant-demo", native.DEMO_LABELS)
        self.find("demo-home", lambda tree: qa.control(tree, native.HOME_LABELS))
        require(not any(recipe.get("title") == title for recipe in json.loads(self.demo_value(RECIPE_KEY) or "[]")),
                "This synthetic title already exists before fixture creation")
        self.click("recipe-tab", RECIPES)
        self.click("create-recipe", CREATE, scroll=True)
        self.fill("recipe-name", TITLE, title, blank=("", "Ex: Burger PARADIM", "e.g. PARADIM Burger"))
        self.fill("ingredient-name", INGREDIENT, "QACarrot", blank=("", "Ex: piept de pui", "e.g. chicken breast"))
        self.fill("ingredient-quantity", QTY, "125", blank=("0", ""))
        self.fill("ingredient-price", PRICE, "12", blank=("0", ""))
        self.click("save-qa-recipe", SAVE, scroll=True)
        recipe = self.read_recipe(title)
        require(not recipe.get("photoUrl") and any(ing.get("name") == "QACarrot" and ing.get("quantity") == 125
                    and ing.get("purchasePrice") == 12
                    for ing in recipe["ingredients"]), "Unexpected fixture after saving the synthetic recipe")
        self.reopen_recipe(title)
        return recipe["id"]

    def sink_labels(self):
        tree = self.tree()
        require(tree is not None, "The recipient hierarchy could not be read")
        return {value for node in tree.iter("node") if node.get("package") == SINK for value in qa.labels(node)}

    def chooser_visible(self):
        output = self.run("Verify Android share chooser", "shell", "dumpsys", "activity", "activities")
        return any("ResumedActivity" in line and re.search(
            r"\b(?:android|com\.(?:android|google\.android)\.intentresolver)/[.A-Za-z0-9_]*ChooserActivity\b", line)
            for line in output.splitlines())


def receiver_preflight(guest, apk, evidence, aapt):
    build = json.loads(evidence.read_text(encoding="utf-8"))
    require(build["package"] == SINK and build["networkPermission"] is False
            and build["apkSha256"] == native.sha256_file(apk), "The reviewed PDF receiver does not match its build report")
    permissions = native.command("Inspect PDF receiver APK permissions", [aapt, "dump", "permissions", apk])
    require(re.search(rf"^package: {re.escape(SINK)}\s*$", permissions, re.M) and "uses-permission" not in permissions,
            "Expected the exact zero-permission PDF receiver")
    guest.install(apk)
    resolution = guest.run("Verify exact PDF SEND activity", "shell", "cmd", "package", "query-activities", "--brief",
                           "-a", "android.intent.action.SEND", "-c", "android.intent.category.DEFAULT",
                           "-t", "application/pdf", "-p", SINK)
    require(re.search(rf"^\s*{re.escape(SINK)}/(?:\.|{re.escape(SINK)}\.)PdfReceiverActivity\s*$",
                      resolution, re.M), "The local recipient did not resolve application/pdf")
    guest.run("Open the local PDF recipient", "shell", "am", "start", "-W", "-a",
              "android.intent.action.MAIN", "-n", SINK_ACTIVITY)
    guest.find("recipient-ready", lambda tree: match(tree, {SINK}, {"QA PDF sink ready"}))


def pdf_probe(guest, title, stage):
    guest.click("recipe-compliance", {"Conformitate", "Compliance"}, scroll=True)
    guest.click("download-qa-pdf", {"Descarcă PDF", "Download PDF"}, scroll=True)
    stage["checkpoint"] = "localShareTarget"
    guest.offline()
    target = guest.find("local-pdf-save-target", share_target)
    require(guest.chooser_visible(), "The Android share chooser is not in foreground")
    guest.tap(target)
    guest.find("recipient-save", lambda tree: match(tree, {SINK}, {"QA PDF saved"}))
    filename = title.replace(" ", "-").lower() + "-food-cost.pdf"
    labels = guest.sink_labels()
    sha = [text[8:] for text in labels if re.fullmatch(r"SHA256: [a-f0-9]{64}", text)]
    size = [int(text[7:]) for text in labels if re.fullmatch(r"Bytes: [1-9]\d*", text)]
    require(len(sha) == len(size) == 1 and "Saved file: " + filename in labels,
            "The local receiver did not confirm the exact saved PDF")
    stage["checkpoint"] = "reopenSavedPdf"
    guest.run("Restart only the local recipient", "shell", "am", "force-stop", SINK)
    guest.run("Open the saved PDF recipient", "shell", "am", "start", "-W", "-a",
              "android.intent.action.MAIN", "-n", SINK_ACTIVITY)
    guest.tap(guest.find("reopen-saved-pdf", lambda tree: match(tree, {SINK}, {"Reopen saved PDF"})))
    guest.find("pdf-rendered-page", lambda tree: match(tree, {SINK}, {"QA PDF rendered page 1"}))
    reopened = guest.sink_labels()
    pages = [int(text[7:]) for text in reopened if re.fullmatch(r"Pages: [1-9]\d*", text)]
    require("QA PDF saved and reopened" in reopened and len(pages) == 1, "No confirmed PdfRenderer reopen")
    with tempfile.TemporaryDirectory(prefix="apk73-synthetic-pdf-") as folder:
        saved = Path(folder) / filename
        guest.run("Copy only the synthetic QA PDF", "pull", "/sdcard/Download/Manager247-QA/" + filename, saved)
        return pdf_evidence(saved, sha[0], size[0], pages[0])


def image_fixture():
    width, height = 320, 180
    colors = (b"\xeeF2", b"-\xb4d", b"2d\xe6", b"\xf5\xcd<")
    row = b"\0" + b"".join(color * (width // len(colors)) for color in colors)

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    return (qa.PNG_HEADER + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(row * height)) + chunk(b"IEND", b""))


def seed_gallery(guest, filename):
    require(re.fullmatch(r"qa-native-image-[0-9]+-[0-9]+\.png", filename), "Unexpected gallery fixture name")
    image = image_fixture()
    sha = hashlib.sha256(image).hexdigest()
    folder = "/sdcard/Pictures/Manager247-QA"
    remote = folder + "/" + filename
    with tempfile.TemporaryDirectory(prefix="apk73-synthetic-image-") as temporary:
        local = Path(temporary) / filename
        local.write_bytes(image)
        guest.run("Create the synthetic gallery folder", "shell", "mkdir", "-p", folder)
        guest.run("Copy only the generated image to the gallery", "push", local, remote)
    actual = guest.run("Check guest synthetic gallery image bytes", "shell", "sha256sum", remote).split()
    require(actual and actual[0] == sha, "Synthetic gallery image copy failed verification")
    guest.run("Index synthetic gallery file", "shell", "am", "broadcast", "-a",
              "android.intent.action.MEDIA_SCANNER_SCAN_FILE", "-d", "file://" + remote)
    for _ in range(15):
        indexed = guest.run("Query only the synthetic gallery image", "shell",
                            f"content query --uri content://media/external/images/media --projection _display_name:mime_type "
                            f"--where \"_display_name='{filename}'\"")
        if f"_display_name={filename}" in indexed and "mime_type=image/png" in indexed:
            return sha
        time.sleep(1)
    raise native.CheckError("Synthetic gallery PNG was not indexed by Android")


def gallery_probe(guest, title, recipe_id, stage):
    filename = "qa-native-image-" + title.removeprefix("QA Recipe ") + ".png"
    stage["checkpoint"] = "indexedFixture"
    sha = seed_gallery(guest, filename)
    guest.click("recipe-ingredients", {"Ingrediente", "Ingredients"})
    guest.click("open-gallery", {"Alege din galerie", "Choose from gallery"}, scroll=True)
    stage["checkpoint"] = "selectExactGalleryImage"
    for _ in range(6):
        def next_picker_control(tree):
            direct = gallery_target(tree, filename)
            if direct is not None:
                return direct
            permission = match(tree, PERMISSION_PACKAGES,
                               ids={"permission_allow_foreground_only_button", "permission_allow_button"})
            if permission is not None:
                return permission
            for names in ({"Manager247-QA"}, {"Pictures"}, {"Images"}, {"Show roots", "Open navigation drawer"}):
                navigation = match(tree, PICKER_PACKAGES, names)
                if navigation is not None:
                    return navigation
            return None

        option = guest.find("synthetic-image-or-picker-navigation", next_picker_control)
        guest.tap(option)
        if filename in qa.labels(option) and option.get("package") in PICKER_PACKAGES:
            break
    else:
        raise native.CheckError("The exact synthetic gallery image was not selected")
    stage["checkpoint"] = "cropAndReturnToEditor"
    crop = guest.find("image-crop-confirm", lambda tree: match(tree, {native.PACKAGE}, {"Crop", "CROP"},
                                                              {"crop_image_menu_crop"}))
    guest.tap(crop)
    guest.find("recipe-photo-preview", lambda tree: qa.control(tree, PHOTO), scroll=True)
    guest.click("save-recipe-with-qa-photo", SAVE, scroll=True)
    stage["checkpoint"] = "persistedRecipePhoto"
    guest.reopen_recipe(title)
    guest.find("reopened-recipe-photo", lambda tree: qa.control(tree, PHOTO), scroll=True)
    recipe = guest.read_recipe(title)
    uri = recipe.get("photoUrl")
    local = re.fullmatch(rf"file://(/data/(?:user/0|data)/{re.escape(native.PACKAGE)}"
                         r"/files/recipe-photos/demo/recipe-\d+-[0-9a-f]+\.jpg)", uri or "")
    require(recipe["id"] == recipe_id and local is not None, "The photo was not saved to the same synthetic recipe")
    header = guest.run("Inspect only the saved synthetic JPEG header", "shell", "od", "-An", "-tx1", "-N3", local[1])
    require(header.split() == ["ff", "d8", "ff"], "The persisted synthetic photo is not a readable JPEG")
    return {"syntheticGallerySha256": sha, "fixtureSelectedByName": True, "nativeCropCompleted": True,
            "photoPresentAfterSaveAndReopen": True, "privateJpegVerified": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--adb", required=True)
    parser.add_argument("--serial", required=True)
    parser.add_argument("--upgrade-report", type=Path, required=True)
    parser.add_argument("--apk73-sha256", required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--probe", choices=("pdf", "gallery", "both"), default="both")
    parser.add_argument("--receiver-apk", type=Path)
    parser.add_argument("--receiver-evidence", type=Path)
    parser.add_argument("--aapt")
    args = parser.parse_args()
    if not args.execute or not re.fullmatch(r"[a-f0-9]{64}", args.apk73_sha256):
        parser.error("Provide --execute and the exact APK73 SHA-256")
    if args.probe != "gallery" and not all((args.receiver_apk, args.receiver_evidence, args.aapt)):
        parser.error("The PDF probe requires the reviewed receiver APK, build evidence and aapt")
    if args.report.exists() or args.report.is_symlink():
        parser.error("Choose a new supplemental JSON report path")

    report = {"status": "INCOMPLETE", "scope": "disposable-offline-synthetic-demo", "checks": {}}
    try:
        guest = ExtraGuest(args.adb, args.serial)
        prior = json.loads(args.upgrade_report.read_text(encoding="utf-8"))
        apks = {item["versionCode"]: item["sha256"] for item in prior["apks"]}
        require(prior["status"] == "PASS" and prior["artifactType"] == "original-signed-arm64-apks"
                and apks == {72: native.APK72_SHA256, 73: args.apk73_sha256},
                "Expected completed native QA on the exact original APKs")
        guest.verify_boot()
        guest.offline()
        require(guest.package_info(73) == prior["installed"][-1]
                and guest.property("ro.debuggable") == "1"
                and guest.run("Verify existing emulator diagnostic access", "shell", "id", "-u").strip() == "0",
                "The live guest does not match the tested APK73 or lacks diagnostic access")
        for index, probe in enumerate(("pdf", "gallery"), start=1):
            if args.probe not in ("both", probe):
                continue
            stage = report["checks"][probe] = {"status": "INCOMPLETE", "checkpoint": "fixturePreflight"}
            try:
                guest.offline()
                if probe == "pdf":
                    receiver_preflight(guest, args.receiver_apk, args.receiver_evidence, args.aapt)
                title = f"QA Recipe {time.time_ns()}-{index}"
                stage["checkpoint"] = "createAndReopenFixture"
                recipe_id = guest.create_demo_recipe(title)
                findings = pdf_probe(guest, title, stage) if probe == "pdf" else gallery_probe(guest, title, recipe_id, stage)
                guest.offline()
                stage.update(status="PASS", checkpoint="complete", evidence=findings)
            except (native.CheckError, OSError, ValueError, TypeError, KeyError, sqlite3.Error) as error:
                stage["reason"] = str(error) if isinstance(error, native.CheckError) else type(error).__name__
        if report["checks"] and all(check["status"] == "PASS" for check in report["checks"].values()):
            report["status"] = "PASS"
    except (native.CheckError, OSError, ValueError, TypeError, KeyError, IndexError, sqlite3.Error) as error:
        report["reason"] = str(error) if isinstance(error, native.CheckError) else type(error).__name__
    native.publish(report, args.report)
    return 0 if report["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
