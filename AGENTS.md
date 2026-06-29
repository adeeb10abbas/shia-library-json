# Agent Instructions

## Rules

- Do not call `https://thaqalayn.net/api/*`; that path is disallowed by the site's `robots.txt`.
- Prefer `THAQALAYN_DATA_DIR=tmp/ThaqalaynData` for full imports.
- Keep source attribution on every exported record.
- Do not claim all narrations are authentic. Preserve gradings as sourced.
- Exclude AI-generated fields from canonical exports unless explicitly requested.
- Treat Quran links as relation indexes, not complete tafsir.
- Run `npm run audit:source` and `npm run validate` after exporter changes.

## Known-Good Flow

```bash
npm run source:clone
THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run build:al-kafi
THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run build:all-hadith
THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run build:quran
THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run build:narrators
npm run build:duas
THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run export:thaqalayn-aux
npm run export:search
THAQALAYN_DATA_DIR=/home/ali/shia-library-json/tmp/ThaqalaynData npm run audit:source
npm run package:release
npm run validate
npm run ci
```

## Next Tasks

- Add LLM-oriented note-generation views on top of the canonical JSON without mutating source records.
- Add deeper schema validation with a JSON Schema engine if dependencies become acceptable.
- Add regression fixtures for known hadith, Quran, dua, and narrator records.
- Improve dua pairing with transliteration if Thaqalayn exposes it separately.
- Add Al-Mizan as a separate source namespace once its source format and license notes are documented.
