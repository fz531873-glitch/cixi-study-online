import json
from pathlib import Path
import fitz

root = Path(__file__).resolve().parent.parent
cat = json.loads((root / 'data/catalog.json').read_text(encoding='utf-8'))
for q in cat['questions']:
    if q['id'] in [1,5,8,9,13,14,16,17,18,26,35,41,19025,24107]:
        print(json.dumps(q, ensure_ascii=False))
for material, pages in [(8, range(1, 8)), (7, range(2, 9))]:
    doc = fitz.open(root / f'public/materials/{material}.pdf')
    for page in pages:
        print(f'\nMATERIAL {material} PAGE {page}\n{doc[page-1].get_text()}')
