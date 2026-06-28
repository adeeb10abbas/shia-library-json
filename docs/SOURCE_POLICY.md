# Source Policy

Use these sources in order:

1. Local checkout of `narmafraz/ThaqalaynData` via `THAQALAYN_DATA_DIR`.
2. Static JSON CDN at `https://thaqalayndata.netlify.app/`.
3. Public pages listed in `https://thaqalayn.net/sitemap/*.xml`, only when static JSON does not include the content.

Avoid:

- `https://thaqalayn.net/api/*`
- Search pages as a primary source
- Rendered HTML for hadith/Quran when static JSON exists

Duas currently come from `https://thaqalayn.net/sitemap/duas.xml` and the `CreativeWork` JSON-LD block on each public page.

