"""Build the optional read-only catalogue from the exact Kaggle v2 Parquet source.

Usage: python build-foodcom-catalogue.py --source recipes.parquet --output /outside/git
Requires pyarrow. No network access and no application/workspace database writes.
"""
import argparse
import gzip
import hashlib
import json
import pathlib
import sqlite3
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument('--source', type=pathlib.Path, required=True)
parser.add_argument('--output', type=pathlib.Path, required=True)
parser.add_argument('--python-packages', type=pathlib.Path)
args = parser.parse_args()
if args.python_packages:
    sys.path.insert(0, str(args.python_packages))
import pyarrow.parquet as pq

EXPECTED_SHA = '9f591abe9f8d1c691bbc630b0431ec6613f09fabe93f1789af87a06484aae9fb'
EXPECTED_COUNT = 522517
with args.source.open('rb') as stream:
    source_sha = hashlib.file_digest(stream, 'sha256').hexdigest()
if source_sha != EXPECTED_SHA:
    raise ValueError('Source does not match audited Kaggle version 2')
args.output.mkdir(parents=True, exist_ok=True)
database = args.output / 'foodcom-v2.sqlite'
if database.exists():
    raise FileExistsError(f'Refusing to overwrite existing catalogue: {database}')
connection = sqlite3.connect(database)
connection.executescript('''
PRAGMA journal_mode=OFF;
PRAGMA synchronous=OFF;
CREATE TABLE recipes(id INTEGER PRIMARY KEY, title TEXT NOT NULL, category TEXT, payload_gzip BLOB NOT NULL);
CREATE TABLE catalogue_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE VIRTUAL TABLE recipe_search USING fts5(title, category, content='recipes', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
PRAGMA user_version=2;
''')
nutrients = ['Calories','FatContent','SaturatedFatContent','CholesterolContent','SodiumContent','CarbohydrateContent','FiberContent','SugarContent','ProteinContent']
fields=['RecipeId','Name','RecipeCategory','RecipeIngredientParts','RecipeIngredientQuantities','RecipeServings','RecipeYield','RecipeInstructions']+nutrients
rows=0
raw_bytes=0
individual_gzip_bytes=0
web_rows=[]
web_chunks=[]
start=time.monotonic()
def digest(path):
    with path.open('rb') as stream:
        sha=hashlib.file_digest(stream,'sha256').hexdigest()
    with path.open('rb') as stream:
        md5=hashlib.file_digest(stream,'md5').hexdigest()
    return {'file':path.name,'bytes':path.stat().st_size,'sha256':sha,'md5':md5}
def flush_web():
    if not web_rows: return
    path=args.output / f'foodcom-v2-part-{len(web_chunks):03d}.jsonl.gz'
    with path.open('wb') as stream:
        with gzip.GzipFile(fileobj=stream,mode='wb',compresslevel=6,mtime=0,filename='') as zipped:
            zipped.write(b'\n'.join(web_rows)+b'\n')
    web_chunks.append({**digest(path),'rows':len(web_rows)})
    web_rows.clear()
for batch in pq.ParquetFile(args.source).iter_batches(batch_size=8192,columns=fields):
    records=[]
    for row in batch.to_pylist():
        identity=row['RecipeId']
        if int(identity)!=identity or identity<=0: raise ValueError('Invalid recipe id')
        record={'id':int(identity),'title':row['Name'],'category':row['RecipeCategory'],'ingredients':row['RecipeIngredientParts'] or [],'quantities':row['RecipeIngredientQuantities'] or [],'servings':row['RecipeServings'],'yield':row['RecipeYield'],'instructions':row['RecipeInstructions'] or [],'nutrition':[row[key] for key in nutrients]}
        encoded=json.dumps(record,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode('utf-8')
        zipped=gzip.compress(encoded,compresslevel=6,mtime=0)
        raw_bytes+=len(encoded)
        individual_gzip_bytes+=len(zipped)
        records.append((record['id'],record['title'],record['category'],zipped))
        web_rows.append(encoded)
        rows+=1
        if len(web_rows)==8192: flush_web()
        if rows==10000:
            print(json.dumps({'sample_rows':rows,'individual_gzip_bytes':individual_gzip_bytes,'extrapolated_all_gzip_bytes':round(individual_gzip_bytes/rows*EXPECTED_COUNT)}),flush=True)
    connection.executemany('INSERT INTO recipes VALUES(?,?,?,?)',records)
    connection.commit()
    if rows%65536==0: print(f'Built {rows:,} recipes',flush=True)
flush_web()
if rows!=EXPECTED_COUNT: raise ValueError(f'Wrong total: {rows}')
connection.execute("INSERT INTO recipe_search(recipe_search) VALUES ('rebuild')")
connection.execute("INSERT INTO recipe_search(recipe_search) VALUES ('optimize')")
connection.executemany('INSERT INTO catalogue_meta VALUES(?,?)',[('dataset','irkaal/foodcom-recipes-and-reviews'),('version','2'),('rows',str(rows)),('source_sha256',source_sha)])
connection.commit()
assert connection.execute('PRAGMA quick_check').fetchone()[0]=='ok'
assert connection.execute('SELECT count(*) FROM recipes').fetchone()[0]==EXPECTED_COUNT
assert connection.execute("SELECT count(*) FROM recipe_search WHERE recipe_search MATCH 'chicken'").fetchone()[0]>0
connection.close()
database_manifest=digest(database)
compressed=database.with_suffix('.sqlite.gz')
with database.open('rb') as source,compressed.open('wb') as target:
    with gzip.GzipFile(fileobj=target,mode='wb',compresslevel=6,mtime=0,filename='') as zipped:
        while block:=source.read(1024*1024): zipped.write(block)
manifest={'schemaVersion':1,'datasetVersion':2,'count':rows,'source':'https://www.kaggle.com/datasets/irkaal/foodcom-recipes-and-reviews','license':'CC0: Public Domain (as declared by Kaggle uploader)','sourceSha256':source_sha,'nutritionBasis':'per source serving; no serving mass in dataset','nutritionFields':nutrients,'database':database_manifest,'download':digest(compressed),'webChunks':web_chunks,'rawPayloadBytes':raw_bytes,'individualGzipBytes':individual_gzip_bytes,'buildSeconds':round(time.monotonic()-start,1)}
(args.output/'foodcom-v2-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps({key:value for key,value in manifest.items() if key!='webChunks'},indent=2),flush=True)
