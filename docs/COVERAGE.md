# ThaqalaynData Coverage

Generated: 2026-06-29T16:16:11.454Z

Source revision: `00dbb9207f`

## Summary

| Scope | Count |
| --- | ---: |
| Source books | 24 |
| Exported books | 24 |
| Source hadith refs | 51751 |
| Canonical exported hadith | 51092 |
| Known skipped empty canonical records | 659 |
| Source Quran verses | 6236 |
| Exported Quran verses | 6236 |
| Narrator index entries | 4313 |
| Narrator detail exports | 4313 |
| Issues | 0 |

## Hadith Books

| Book | Source refs | Exported canonical | Skipped empty canonical | Status |
| --- | ---: | ---: | ---: | --- |
| `al-amali-mufid` | 387 | 387 | 0 | complete |
| `al-amali-saduq` | 1082 | 1082 | 0 | complete |
| `al-istibsar` | 4220 | 4220 | 0 | complete |
| `al-kafi` | 15385 | 15385 | 0 | complete |
| `al-khisal` | 1282 | 1282 | 0 | complete |
| `al-tawhid` | 575 | 575 | 0 | complete |
| `fadail-al-shia` | 45 | 45 | 0 | complete |
| `kamal-al-din` | 659 | 0 | 659 | complete_excluding_empty_canonical_records |
| `kamil-al-ziyarat` | 750 | 750 | 0 | complete |
| `kitab-al-duafa` | 226 | 226 | 0 | complete |
| `kitab-al-ghayba-numani` | 468 | 468 | 0 | complete |
| `kitab-al-ghayba-tusi` | 774 | 774 | 0 | complete |
| `kitab-al-mumin` | 201 | 201 | 0 | complete |
| `kitab-al-zuhd` | 290 | 290 | 0 | complete |
| `maani-al-akhbar` | 829 | 829 | 0 | complete |
| `man-la-yahduruhu-al-faqih` | 6382 | 6382 | 0 | complete |
| `mujam-al-ahadith-al-mutabara` | 555 | 555 | 0 | complete |
| `nahj-al-balagha` | 2260 | 2260 | 0 | complete |
| `risalat-al-huquq` | 49 | 49 | 0 | complete |
| `sifat-al-shia` | 71 | 71 | 0 | complete |
| `tahdhib-al-ahkam` | 13201 | 13201 | 0 | complete |
| `thawab-al-amal` | 1106 | 1106 | 0 | complete |
| `uyun-akhbar-al-rida` | 954 | 954 | 0 | complete |

## Quran

| Source verse refs | Exported verses | Status |
| ---: | ---: | --- |
| 6236 | 6236 | complete |

## Narrators

| Source index | Source details | Exported index | Exported details | Featured | Imam IDs | Status |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 4313 | 4313 | 4313 | 4313 | 12 | 107 | complete |

## Auxiliary Source Data

| Scope | Source count | Exported count | Status |
| --- | ---: | ---: | --- |
| source index mirror | 10 | 10 | complete |
| source plan mirror | 18 | 18 | complete |
| reading plan exports | 17 | 17 | complete |
| source validation mirror | 1978 | 1978 | complete |
| featured narrator mirror | 1 | 1 | complete |
| source title search convenience export | 7781 | 7781 | complete |
| reading plan index convenience export | 17 | 17 | complete |

## Intentional Exclusions

- `books/complete/*.json`: Raw upstream aggregate files are redundant with normalized db/hadith/*, db/quran/*, and chapter indexes.
- `books/<book>/**/*.json navigation files`: Traversal/navigation metadata is normalized into db/*/chapters-index.json and index/books.json.
- `kamal-al-din empty canonical records`: The source currently has 659 Kamal al-Din references with no canonical hadith text; only AI-derived fields are present, so canonical exports skip them by default.
- `AI-only verse content`: Canonical exports exclude AI-generated content unless a separate explicit AI export is requested.
- `repository operational files`: README, API docs, config, examples, and development files are not library data.

## Issues

- None
