# Shia Library JSON

Static JSON exports for Shia hadith collections, Quran relation indexes, narrators, and duas.

The importer prefers the CC0 [ThaqalaynData](https://github.com/narmafraz/ThaqalaynData) static JSON source. For scale runs, clone that source locally and set `THAQALAYN_DATA_DIR`; this avoids thousands of HTTP requests.

## Quickstart

```bash
npm run source:clone
THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run build:sample
npm run build:duas:sample
THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run build:narrators:sample
THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run export:thaqalayn-aux
npm run export:search
npm run audit:source
npm run validate
npm run ci
```

## Full Builds

```bash
THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run build:al-kafi
THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run build:all-hadith
THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run build:quran
THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run build:narrators
npm run build:duas
THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run export:thaqalayn-aux
npm run export:search
npm run audit:source
npm run package:release
npm run validate
npm run ci
```

## Output Layout

```text
db/hadith/<book>/all.json
db/hadith/<book>/all-parts/index.json
db/hadith/<book>/all-parts/part-0001.json
db/hadith/<book>/chapters/<volume>/<book>/<chapter>.json
db/quran/all.json
db/quran/all-parts/index.json
db/quran/by_surah/<surah>.json
db/quran/tafsir_links.json
db/duas/<slug>.json
db/narrators/<id>.json
db/reading-plans/<plan-id>.json
index/books.json
index/duas.json
index/narrators.json
index/narrators-featured.json
index/reading-plans.json
index/source-coverage.json
index/source-title-search.json
index/thaqalayn/
index/import-summary.json
index/manifest.json
search/hadith.jsonl
search/quran.jsonl
search/quran-relations.jsonl
search/duas.jsonl
```

AI-generated fields from ThaqalaynData are excluded from canonical exports unless `--include-ai` is explicitly passed.

Large aggregate exports are automatically split under `all-parts/` to stay below GitHub's 100 MB per-file limit. Consumers should prefer chapter files or call `readRecordCollection()` from `src/thaqalayn-data.mjs` when they need the full book aggregate.

## Validation And CI

Use the same command locally and in GitHub Actions:

```bash
npm run ci
```

`tmp/` and `dist/` are intentionally ignored. Keep source checkouts, HTTP caches, and packaged release archives out of Git history.

## Current Generated Dataset

The latest local build generated:

- 23 hadith books
- 51,092 canonical hadith records
- 6,236 Quran verse records
- 1,789 Quran-to-hadith relation links
- 71 duas
- 4,313 narrator detail records
- 17 reading plans
- 7,781 source title-search entries
- 1,978 mirrored source validation files

`kamal-al-din` has 659 source records with empty canonical text and only AI-derived content; those are skipped by default.
See `docs/COVERAGE.md` and `index/source-coverage.json` for the current source-completeness audit.

## Agent Handoff

Future agents should read:

- [`AGENTS.md`](./AGENTS.md)
- [`docs/SOURCE_POLICY.md`](./docs/SOURCE_POLICY.md)
- [`docs/SCALING_PLAN.md`](./docs/SCALING_PLAN.md)
- [`docs/BUILD_NOTES.md`](./docs/BUILD_NOTES.md)
- [`docs/COVERAGE.md`](./docs/COVERAGE.md)
