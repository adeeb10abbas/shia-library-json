# Build Notes

## 2026-06-27 Baseline

Node:

```text
v22.22.0
```

The initial HTTP full Al-Kafi attempt was interrupted after slow CDN fetches. The importer now supports `THAQALAYN_DATA_DIR` so scale runs can read from a local `ThaqalaynData` checkout instead of making thousands of requests.

## 2026-06-27 Full Local Scale Build

Environment:

```text
Node: v22.22.0
Working directory: /home/ali/shia-library-json
Source checkout: /home/ali/shia-library-json/tmp/ThaqalaynData
```

Commands:

```bash
npm run source:clone
env THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run build:al-kafi
env THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run build:all-hadith
env THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run build:quran
env THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run build:narrators
npm run build:duas
npm run export:search
npm run package:release
npm run validate
```

Key runtimes:

```text
Full Al-Kafi from local source: 2.57s
All hadith from local source: 6.72s
Quran from local source: 1.51s
Narrator details from local source: 0.66s
Public dua page import: 68.77s
```

Final content counts:

```json
{
  "hadithBooks": 23,
  "hadith": 51092,
  "quranVerses": 6236,
  "quranRelationLinks": 1789,
  "duas": 71,
  "narrators": 4313,
  "narratorDetails": 4313,
  "skippedEmptyCanonicalHadith": 659,
  "failedFetches": 0
}
```

Validation:

```text
Validated 13048 JSON files and 123353 content records.
```

Generated sizes:

```text
db/: 850M
index/: 5.1M
search/: 96M
schema/: 20K
dist/: 230M
tmp/ThaqalaynData/: 3.8G
```

Release artifacts:

```text
index/manifest.json
dist/shia-library-json-20260627.tar.gz
dist/shia-library-json-20260627.zip
dist/checksums.txt
```

Notes:

- `dist/` and `tmp/` are intentionally ignored by git.
- `kamal-al-din` currently has 659 records with empty canonical `verse.text` and no human translations in the source JSON. These are skipped by default because their visible content is only under `verse.ai`.
- Canonical exports exclude `ai` fields by default.
