"""Verify already downloaded QA bytes, signer and source proof before emulator setup."""
import argparse
import json
from pathlib import Path
import pack_qa
from native_qa_x86 import verify_candidate

def main():
    p=argparse.ArgumentParser(description=__doc__)
    for key in ['apk','release-manifest','package-proof','aapt','java','apksigner-jar']:
        p.add_argument('--'+key,type=Path,required=True)
    p.add_argument('--expected-sha256',required=True)
    a=p.parse_args()
    pack_qa.load_release_manifest(a.release_manifest)
    proof=json.loads(a.package_proof.read_text(encoding='utf-8'))
    a.expected_signer_sha256=proof['qaSignerSha256']
    verify_candidate(a,proof)
    print('QA APK74 byte hash, isolated signer and full runtime proof verified.')

if __name__=='__main__': main()
