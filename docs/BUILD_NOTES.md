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

## 2026-06-29 Full Al-Kafi Verification

Environment:

```text
Node: v22.22.0
Working directory: /home/ali/shia-library-json
Source checkout: /home/ali/shia-library-json/tmp/ThaqalaynData
Source revision: 00dbb9207f
```

The local `ThaqalaynData` checkout was checked with `git pull --ff-only` and was already up to date.

Commands:

```bash
env THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run build:al-kafi
npm run export:search
npm run package:release
npm run ci
```

Full Al-Kafi result:

```json
{
  "books": 1,
  "hadith": 15385,
  "quranVerses": 0,
  "headings": 0,
  "chapters": 2366,
  "skippedEmptyRecords": 0,
  "failedFetches": 0
}
```

Aggregate layout:

```json
{
  "count": 15385,
  "layout": "split-record-collection",
  "partCount": 2,
  "first": "al-kafi:1:1:1:1",
  "last": "al-kafi:8:1:52:11"
}
```

Validation:

```text
Validated 13050 JSON files and 123353 content records.
```

No source-content changes were found compared with the committed dataset; the rebuild only produced generated timestamp and checksum churn, so the canonical JSON exports were left unchanged.

## 2026-06-29 Full ThaqalaynData Completeness Gate

Environment:

```text
Node: v22.22.0
Working directory: /home/ali/shia-library-json
Source checkout: /home/ali/shia-library-json/tmp/ThaqalaynData
Source revision: 00dbb9207f
```

The local `ThaqalaynData` checkout was checked with `git pull --ff-only` and was already up to date.

Commands:

```bash
env THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run export:thaqalayn-aux
env THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run audit:source
npm run export:search
npm run package:release
npm run ci
```

Auxiliary source mirror:

```json
{
  "sourceIndexFiles": 10,
  "sourcePlanFiles": 18,
  "sourceValidationFiles": 1978,
  "featuredNarratorFiles": 1,
  "readingPlans": 17,
  "sourceTitleSearchEntries": 7781
}
```

Coverage audit:

```json
{
  "sourceBooks": 24,
  "exportedBooks": 24,
  "hadithBooks": 23,
  "hadithSourceRefs": 51751,
  "hadithCanonicalExported": 51092,
  "knownSkippedEmptyCanonical": 659,
  "quranSourceVerses": 6236,
  "quranExportedVerses": 6236,
  "narratorIndexEntries": 4313,
  "narratorDetailsExported": 4313,
  "issues": 0
}
```

Release packaging:

```text
index/manifest.json
dist/shia-library-json-20260629.tar.gz
dist/shia-library-json-20260629.zip
files: 15083
```

Validation:

```text
Validated 15079 JSON files and 123353 content records.
```

Notes:

- `docs/COVERAGE.md` and `index/source-coverage.json` are now the release gate for ThaqalaynData completeness.
- Canonical outputs cover all non-empty canonical hadith, Quran verse records, Quran relation links, duas, and narrator details currently available from the source pipeline.
- `kamal-al-din` remains intentionally excluded from canonical hadith records because its 659 source references currently have no canonical hadith text and only AI-derived fields.
- Raw `books/complete/*.json` and navigation trees are not duplicated because normalized `db/*`, `index/books.json`, and chapter indexes already cover that content.
