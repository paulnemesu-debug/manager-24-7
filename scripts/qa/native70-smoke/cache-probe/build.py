"""Compile the reviewed read-only cache probe using installed JDK17/SDK36 only."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk', type=Path, required=True)
    parser.add_argument('--jdk', type=Path, required=True)
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    output = args.out or root / 'out'
    extension = '.exe' if os.name == 'nt' else ''
    javac, jar = [args.jdk / f'bin/{name}{extension}' for name in ('javac', 'jar')]
    android = args.sdk / 'platforms/android-36/android.jar'
    d8 = args.sdk / 'build-tools/36.0.0' / ('d8.bat' if os.name == 'nt' else 'd8')
    if not all(path.is_file() for path in (javac, jar, android, d8)):
        raise RuntimeError('Installed JDK17 and Android SDK36 tools are required')
    env = {**os.environ, 'JAVA_HOME': str(args.jdk)}
    def run(command):
        result = subprocess.run([str(value) for value in command], env=env, capture_output=True,
                                timeout=90, check=False)
        if result.returncode:
            raise RuntimeError('Cache probe compilation tool failed: ' + Path(command[0]).name)
    output.mkdir(parents=True, exist_ok=False)
    (output / 'classes').mkdir()
    (output / 'dex').mkdir()
    run([javac, '-source', '8', '-target', '8', '-bootclasspath', android,
         '-d', output / 'classes', root / 'CacheProbe.java'])
    run([jar, 'cf', output / 'classes.jar', '-C', output / 'classes', '.'])
    run([d8, '--min-api', '30', '--lib', android, '--output', output / 'dex', output / 'classes.jar'])
    digest = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
    proof = {'readOnly': True, 'owner': 'nativeC', 'sourceSha256': digest(root / 'CacheProbe.java'),
             'dexSha256': digest(output / 'dex/classes.dex')}
    (output / 'build-evidence.json').write_text(json.dumps(proof, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(proof))


if __name__ == '__main__':
    main()
