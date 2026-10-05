"""Extract only recipe nutrients from the official ANSES-Ciqual 2025 workbook.

Usage: python scripts/generate-ciqual-data.py /path/to/ciqual-2025.xlsx
Requires openpyxl at build time only. Never runs on a user's device.
"""
import hashlib
import json
from pathlib import Path
import sys
import openpyxl

source = Path(sys.argv[1])
expected_md5 = '0d9758ce23f3f13dd63a005bc1bb4f2c'
assert hashlib.md5(source.read_bytes()).hexdigest() == expected_md5, 'Unexpected source workbook'
sheet = openpyxl.load_workbook(source, read_only=True, data_only=True).worksheets[0]
rows = list(sheet.values)
# EU energy columns and N x 6.25 protein; carbohydrate already excludes fibre.
columns = [9, 10, 17, 31, 16, 18, 26, 15, 49]
foods = [{'code': str(row[6]), 'name': ' '.join(str(row[7]).split()),
          'nutrients': [' '.join(str(row[column]).split()) if row[column] is not None else '-'
                        for column in columns]} for row in rows[1:]]
assert len(foods) == 3484 and len({food['code'] for food in foods}) == 3484
data = {'source': 'Anses. 2025. Table de composition nutritionnelle des aliments Ciqual',
        'releaseDate': '2025-11-19', 'licence': 'etalab-2.0',
        'sourceUrl': 'https://doi.org/10.57745/RDMHWY',
        'downloadUrl': 'https://entrepot.recherche.data.gouv.fr/api/access/datafile/666260',
        'sourceMd5': expected_md5,
        'nutrientOrder': ['energyKj', 'energyKcal', 'fat', 'saturates', 'carbohydrates',
                          'sugars', 'fibre', 'protein', 'salt'], 'foods': foods}
target = Path(__file__).resolve().parents[1] / 'src/constants/nutrition-ciqual.json'
target.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')
print(json.dumps({'foods': len(foods), 'bytes': target.stat().st_size,
                  'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}))
