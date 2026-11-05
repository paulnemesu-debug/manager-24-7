"""Build the reviewed Java-only QA receiver using installed SDK/JDK tools, without downloads."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk", type=Path, required=True)
    parser.add_argument("--jdk", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    output = root / "out"
    tools = args.sdk / "build-tools/36.0.0"
    android = args.sdk / "platforms/android-36/android.jar"
    executable = ".exe" if os.name == "nt" else ""
    d8 = tools / ("d8.bat" if os.name == "nt" else "d8")
    env = {**os.environ, "JAVA_HOME": str(args.jdk)}
    required = [android, d8, tools / f"aapt{executable}", tools / f"zipalign{executable}", tools / "lib/apksigner.jar",
                *[args.jdk / f"bin/{name}{executable}" for name in ("java", "javac", "jar", "keytool")]]
    if not all(file.is_file() for file in required):
        raise RuntimeError("The supplied SDK/JDK is missing a required installed tool")
    def run(command, cwd=root):
        result = subprocess.run([str(value) for value in command], cwd=cwd, env=env,
                                capture_output=True, text=True, timeout=90, check=False)
        if result.returncode:
            raise RuntimeError(f"QA receiver tool failed: {Path(command[0]).name}")
        return result.stdout
    output.mkdir(exist_ok=False)
    (output / "classes").mkdir()
    (output / "dex").mkdir()
    run([args.jdk / f"bin/javac{executable}", "-source", "8", "-target", "8", "-bootclasspath", android,
         "-d", output / "classes", root / "PdfReceiverActivity.java"])
    run([args.jdk / f"bin/jar{executable}", "cf", output / "classes.jar", "-C", output / "classes", "."])
    run([d8, "--min-api", "29", "--lib", android, "--output", output / "dex", output / "classes.jar"])
    run([tools / f"aapt{executable}", "package", "-M", root / "AndroidManifest.xml", "-I", android,
         "-F", output / "unsigned.apk"])
    run([tools / f"aapt{executable}", "add", output / "unsigned.apk", "classes.dex"], cwd=output / "dex")
    run([tools / f"zipalign{executable}", "-p", "4", output / "unsigned.apk", output / "aligned.apk"])
    # This signing identity is created solely for this disposable test recipient.
    run([args.jdk / f"bin/keytool{executable}", "-genkeypair", "-keystore", output / "qa-only.p12",
         "-storetype", "PKCS12", "-storepass", "android", "-keypass", "android", "-alias", "qa-only",
         "-keyalg", "RSA", "-keysize", "2048", "-validity", "30", "-dname", "CN=Manager247 Synthetic QA"])
    java = args.jdk / f"bin/java{executable}"
    signer = tools / "lib/apksigner.jar"
    run([java, "-jar", signer, "sign", "--ks", output / "qa-only.p12", "--ks-pass", "pass:android",
         "--key-pass", "pass:android", "--out", output / "qa-pdf-sink.apk", output / "aligned.apk"])
    signature = run([java, "-jar", signer, "verify", "--verbose", "--print-certs", output / "qa-pdf-sink.apk"])
    certificate = re.findall(r"certificate SHA-256 digest: ([a-f0-9]+)", signature)
    if len(certificate) != 1:
        raise RuntimeError("QA receiver signature verification failed")
    badging = run([tools / f"aapt{executable}", "dump", "badging", output / "qa-pdf-sink.apk"])
    permissions = run([tools / f"aapt{executable}", "dump", "permissions", output / "qa-pdf-sink.apk"])
    if ("name='ro.paradim.qa.pdfsink'" not in badging or "application-debuggable" in badging
            or "uses-permission" in permissions):
        raise RuntimeError("QA receiver package, release or zero-permission gate failed")
    digest = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
    evidence = {"package": "ro.paradim.qa.pdfsink", "networkPermission": False,
                "sourceSha256": {name: digest(root / name) for name in ["AndroidManifest.xml", "PdfReceiverActivity.java", "build.py"]},
                "apkSha256": digest(output / "qa-pdf-sink.apk"), "signerSha256": certificate[0]}
    (output / "build-evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps(evidence))


if __name__ == "__main__":
    main()
