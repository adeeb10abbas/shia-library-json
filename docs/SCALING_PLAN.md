# Scaling Plan

## Phase 1: Local Source Bootstrap

```bash
npm run source:clone
```

Use the printed `THAQALAYN_DATA_DIR=...` value for all full imports.

## Phase 2: Full Al-Kafi

```bash
THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run build:al-kafi
npm run validate
```

Record runtime, counts, and failures in `docs/BUILD_NOTES.md`.

## Phase 3: All Hadith

```bash
THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run build:all-hadith
npm run validate
```

If memory becomes an issue, rewrite output to JSONL first, then build JSON arrays.

## Phase 4: Narrators

```bash
THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run build:narrators
```

Expected source index size is 4,313 narrators.

## Phase 5: Search And Release

```bash
npm run export:search
npm run package:release
npm run validate
npm run ci
```

Release artifacts are written to ignored `dist/`; `index/manifest.json` is tracked.

## Phase 6: Publish Safety

Before pushing, confirm Git is not tracking generated working artifacts:

```bash
git ls-files | grep -E '^(tmp|dist)/' && exit 1 || true
git ls-files -z | xargs -0 du -b | sort -nr | head -20
```

GitHub rejects individual files above 100 MB. If any export crosses that threshold, split that export before pushing rather than moving it to Git LFS.

The importer already splits oversized aggregate collections into `all-parts/index.json` and numbered part files. Re-run `npm run export:search`, `npm run package:release`, and `npm run ci` after any split or rebuild so search files and `index/manifest.json` match the committed dataset.

## Git LFS Policy

Git LFS is available on the build machine, but do not make it the default storage layer for canonical JSON exports. Plain JSON in Git keeps diffs reviewable and lets users consume files through normal clones and raw URLs without installing LFS.

Use Git LFS only for assets that are not practical as split text files:

- large binary artifacts
- optional compressed snapshots
- future ML/search index blobs

For oversized JSON, prefer deterministic split files first. If a future JSON export cannot be split cleanly, add a `.gitattributes` rule for that specific path and document the LFS requirement in `README.md`.
