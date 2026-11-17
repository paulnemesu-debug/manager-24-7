"""Fetch one private QA-only APK without disclosing its short-lived URL."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
from urllib.parse import parse_qs,urlsplit
from urllib.request import HTTPRedirectHandler,build_opener
import pack_qa

ORIGIN='ujyamyekrktaapzzkhaj.supabase.co'
PREFIX='/storage/v1/object/sign/qa-android-apks/74/'
CHUNK=24*1024*1024
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args): return None

def drive_url(value,policy):
    try:
        url=urlsplit(value)
        origin=urlsplit(policy.get('allowedOrigin') or '')
        query=parse_qs(url.query,keep_blank_values=True)
        valid=(policy.get('schemaVersion')==1 and policy.get('transport')=='private-drive'
            and policy.get('status')=='REVIEWED' and policy.get('allowRedirects') is False
            and origin.scheme=='https' and origin.netloc and not origin.path and not origin.query and not origin.fragment
            and url.scheme=='https' and url.netloc==origin.netloc and not url.username and not url.password and not url.fragment
            and isinstance(policy.get('allowedPathPattern'),str)
            and re.fullmatch(policy['allowedPathPattern'],url.path)
            and isinstance(policy.get('allowedQueryKeys'),list) and set(query)==set(policy['allowedQueryKeys'])
            and all(len(values)==1 and values[0] for values in query.values())
            and datetime.datetime.fromisoformat(query['se'][0])>datetime.datetime.now(datetime.timezone.utc))
    except (ValueError,TypeError,re.error):
        valid=False
    pack_qa.require(valid,'Protected private download URL did not match the reviewed transport policy')
    return value

def signed_urls(environment):
    values=[environment.get('QA_APK74_URL_'+str(i),'') for i in range(1,5)]
    count=sum(bool(v) for v in values)
    pack_qa.require(count>0 and all(values[:count]) and not any(values[count:]),'QA chunk URLs must be contiguous')
    tag=None
    for i,value in enumerate(values[:count],1):
        url=urlsplit(value)
        match=re.fullmatch(re.escape(PREFIX)+rf'part-{i}-([a-f0-9]{{20}})',url.path)
        pack_qa.require(url.scheme=='https' and url.netloc==ORIGIN and not url.fragment
                        and match and set(parse_qs(url.query))=={'token'},'Protected QA staging URL did not match')
        pack_qa.require(tag is None or tag==match[1],'QA chunks must share one transfer receipt')
        tag=match[1]
    return values[:count]

def download(output,urls,expected,part_limit=CHUNK):
    pack_qa.require(not output.exists(),'A fresh QA download path is required')
    temporary=output.with_suffix('.download')
    try:
        with temporary.open('xb') as target:
            for url in urls:
                with build_opener(NoRedirect).open(url,timeout=40) as response:
                    part=response.read(part_limit+1)
                    pack_qa.require(0<len(part)<=part_limit,'QA download exceeded its byte bound')
                    target.write(part)
        pack_qa.require(pack_qa.sha256_file(temporary)==expected,'Exact QA APK hash mismatch')
        temporary.replace(output)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise pack_qa.QaError('Protected QA download or hash verification failed') from None

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--proof',type=Path,required=True)
    p.add_argument('--expected-sha256',required=True)
    p.add_argument('--url-policy',type=Path,required=True)
    a=p.parse_args()
    proof=json.loads(a.proof.read_text())
    pack_qa.require(proof.get('artifactType')=='source-matched-x86-qa' and proof.get('versionCode')==74
                    and proof.get('qaApkSha256')==a.expected_sha256 and re.fullmatch('[a-f0-9]{64}',a.expected_sha256),
                    'Expected reviewed QA APK74 proof')
    a.output.parent.mkdir(parents=True,exist_ok=True)
    direct=os.environ.pop('QA_APK74_DOWNLOAD_URL','')
    if direct:
        pack_qa.require(not any(os.environ.get('QA_APK74_URL_'+str(i)) for i in range(1,5)),
                        'Exactly one private QA download transport is allowed')
        policy=json.loads(a.url_policy.read_text(encoding='utf-8'))
        download(a.output,[drive_url(direct,policy)],a.expected_sha256,4*CHUNK)
    else:
        download(a.output,signed_urls(os.environ),a.expected_sha256)
if __name__=='__main__':
    try: main()
    except Exception as error:
        print(str(error) if isinstance(error,pack_qa.QaError) else 'Protected QA input validation failed')
        raise SystemExit(1) from None
