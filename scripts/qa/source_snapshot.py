"""Hash exact tracked source bytes, requiring a clean committed checkout."""
import hashlib
import json
from pathlib import Path
import subprocess

def snapshot(repo):
    repo = Path(repo)
    def git(*args):
        result = subprocess.run(['git','-C',str(repo),*args],capture_output=True,check=True,timeout=30)
        return result.stdout
    if git('status','--porcelain','--untracked-files=normal').strip():
        raise ValueError('Source checkout must be clean and fully committed')
    files = {}
    for raw in git('ls-files','-z').split(b'\0'):
        if not raw: continue
        name = raw.decode('utf-8')
        path = repo / name
        if not path.is_file() or path.is_symlink():
            raise ValueError('Tracked source must consist of regular local files')
        files[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    payload = json.dumps(files,sort_keys=True,separators=(',',':')).encode()
    return {'gitHead':git('rev-parse','HEAD').decode().strip(),
            'sourceSnapshotSha256':hashlib.sha256(payload).hexdigest(),'files':files}
