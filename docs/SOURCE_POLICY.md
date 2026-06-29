# Source Policy

Use these sources in order:

1. Local checkout of `narmafraz/ThaqalaynData` via `THAQALAYN_DATA_DIR`.
2. Static JSON CDN at `https://thaqalayndata.netlify.app/`.
3. Public pages listed in `https://thaqalayn.net/sitemap/*.xml`, only when static JSON does not include the content.

Avoid:

- `https://thaqalayn.net/api/*`
- Search pages as a primary source
- Rendered HTML for hadith/Quran when static JSON exists

Mirror these `ThaqalaynData` auxiliary files for completeness before a release:

- `index/**` into `index/thaqalayn/index/**`
- `plans/**` into `index/thaqalayn/plans/**`
- `validation/cross-validation/**` into `index/thaqalayn/validation/cross-validation/**`
- `people/narrators/featured.json` into `index/thaqalayn/people/narrators/featured.json`

Also export normalized convenience files for downstream tools:

- `index/source-title-search.json`
- `index/narrators-featured.json`
- `index/reading-plans.json`
- `db/reading-plans/<plan-id>.json`

Duas currently come from `https://thaqalayn.net/sitemap/duas.xml` and the `CreativeWork` JSON-LD block on each public page.

Run `npm run audit:source` after source or exporter changes. The audit writes `index/source-coverage.json` and `docs/COVERAGE.md`; those files are the source of truth for whether a build is complete enough for LLM note-generation work.
