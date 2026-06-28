#!/usr/bin/env node
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  classifyVerse,
  createLimiter,
  ensureSafeSegment,
  fetchJsonWithCache,
  flattenTextSegments,
  normalizeBookPath,
  normalizeGradings,
  normalizeNarratorChain,
  normalizeTranslations,
  parseCliArgs,
  pathToDataUrl,
  stripHtml,
  THAQALAYN_DATA_BASE,
  THAQALAYN_DATA_DIR,
  writeJson,
  writeRecordCollection
} from "./thaqalayn-data.mjs";

const args = parseCliArgs(process.argv.slice(2));
const outDir = path.resolve(args.out ?? "db");
const cacheDir = args.cache === false ? undefined : path.resolve(args.cache ?? "tmp/cache");
const concurrency = Number.parseInt(args.concurrency ?? "8", 10);
const progressEvery = Number.parseInt(args["progress-every"] ?? "500", 10);
const includeQuran = Boolean(args["include-quran"]);
const includeAi = Boolean(args["include-ai"]);
const refresh = Boolean(args.refresh);
const maxHadiths = Number.parseInt(args["max-hadiths"] ?? "0", 10);
const maxQuranVerses = Number.parseInt(args["max-quran-verses"] ?? "0", 10);
const requestedBooks = collectRequestedBooks(args);

if (!requestedBooks.length && !args["all-hadith"] && !includeQuran) {
  console.error("Nothing to ingest. Use --book al-kafi, --all-hadith, and/or --include-quran.");
  process.exit(2);
}

await mkdir(outDir, { recursive: true });
await mkdir("index", { recursive: true });

const bookIndex = await fetchJsonWithCache(pathToDataUrl("/books/books"), { cacheDir, refresh });
const allBooks = bookIndex.data?.chapters ?? [];
const bookBySlug = new Map(
  allBooks.filter((book) => book.path?.startsWith("/books/")).map((book) => [book.path.slice("/books/".length), book])
);
const booksToImport = resolveBooks({ allBooks, requestedBooks, includeQuran, allHadith: args["all-hadith"] });
const summary = {
  generatedAt: new Date().toISOString(),
  source: {
    provider: "ThaqalaynData",
    baseUrl: THAQALAYN_DATA_BASE,
    localDir: THAQALAYN_DATA_DIR,
    license: "CC0-1.0",
    apiDocs: "https://github.com/narmafraz/ThaqalaynData/blob/master/API.md"
  },
  options: {
    books: booksToImport.map((book) => book.slug),
    includeQuran,
    includeAi,
    maxHadiths,
    maxQuranVerses,
    concurrency
  },
  counts: {
    books: 0,
    hadith: 0,
    quranVerses: 0,
    headings: 0,
    chapters: 0,
    skippedEmptyRecords: 0,
    failedFetches: 0
  },
  failures: []
};

console.log(`Using ${THAQALAYN_DATA_DIR ? `local ${THAQALAYN_DATA_DIR}` : THAQALAYN_DATA_BASE}`);
console.log(`Output: ${outDir}`);
console.log(`Books: ${booksToImport.map((book) => book.slug).join(", ") || "(none)"}`);

for (const book of booksToImport) {
  const records = await ingestBook(book);
  if (book.slug === "quran") await writeQuranOutputs(records);
  else await writeHadithOutputs(book, records);
}

await writeJson(path.resolve("index/books.json"), {
  generatedAt: summary.generatedAt,
  source: summary.source,
  books: allBooks.map((book) => ({
    slug: book.path?.slice("/books/".length),
    path: book.path,
    titles: cleanTitles(book.titles),
    author: book.author,
    descriptions: book.descriptions,
    sourceUrl: book.source_url
  }))
});
await writeJson(path.resolve("index/import-summary.json"), summary);
console.log(JSON.stringify(summary.counts, null, 2));

function collectRequestedBooks(parsedArgs) {
  const raw = parsedArgs.book;
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((book) => book.trim())
    .filter(Boolean);
}

function resolveBooks({ allBooks, requestedBooks, includeQuran: shouldIncludeQuran, allHadith }) {
  const books = [];
  const seen = new Set();
  function addBook(slug) {
    if (seen.has(slug)) return;
    const meta = bookBySlug.get(slug);
    if (!meta) throw new Error(`Unknown book slug: ${slug}`);
    seen.add(slug);
    books.push({ slug, meta });
  }
  if (allHadith) {
    for (const book of allBooks) {
      const slug = book.path?.slice("/books/".length);
      if (slug && slug !== "quran") addBook(slug);
    }
  }
  for (const slug of requestedBooks) addBook(slug);
  if (shouldIncludeQuran) addBook("quran");
  return books;
}

async function ingestBook(book) {
  console.log(`Ingesting ${book.slug}`);
  const queue = [book.meta.path];
  const queued = new Set(queue);
  const detailPaths = [];
  const chapters = [];
  const detailLimit = detailPathLimit(book.slug);
  let visitedPaths = 0;

  while (queue.length > 0) {
    const sourcePath = queue.shift();
    visitedPaths += 1;
    if (progressEvery > 0 && visitedPaths % progressEvery === 0) {
      console.log(
        `[${book.slug}] traversed=${visitedPaths} queued=${queue.length} chapters=${chapters.length} detailPaths=${detailPaths.length}`
      );
    }
    let wrapped;
    try {
      wrapped = await fetchWrapped(sourcePath);
    } catch (error) {
      summary.counts.failedFetches += 1;
      summary.failures.push({ sourcePath, stage: "traversal", error: error.message });
      continue;
    }
    const data = wrapped.data ?? {};
    if (Array.isArray(data.chapters)) {
      chapters.push(normalizeChapter(data, wrapped));
      for (const chapter of data.chapters) {
        if (chapter.verse_count === 0) continue;
        if (chapter.path && !queued.has(chapter.path)) {
          queued.add(chapter.path);
          queue.push(chapter.path);
        }
      }
      continue;
    }
    if (Array.isArray(data.verse_refs)) {
      chapters.push(normalizeChapter(data, wrapped));
      for (const ref of data.verse_refs) {
        if (!ref.path) continue;
        if (detailLimit > 0 && detailPaths.length >= detailLimit) break;
        detailPaths.push(ref.path);
      }
      if (detailLimit > 0 && detailPaths.length >= detailLimit) break;
      continue;
    }
    if (wrapped.kind === "verse_detail" && data.verse?.path) {
      detailPaths.push(data.verse.path);
      if (detailLimit > 0 && detailPaths.length >= detailLimit) break;
    }
  }

  summary.counts.chapters += chapters.length;
  const limitedDetailPaths = limitDetailPaths(book.slug, detailPaths);
  const limit = createLimiter(concurrency);
  const records = [];
  let completedDetails = 0;
  console.log(
    `[${book.slug}] traversal complete: chapters=${chapters.length} detailPaths=${detailPaths.length} fetching=${limitedDetailPaths.length}`
  );

  await Promise.all(
    limitedDetailPaths.map((sourcePath) =>
      limit(async () => {
        try {
          const wrapped = await fetchWrapped(sourcePath);
          const record = normalizeVerseDetail({ wrapped, book });
          if (!includeAi) delete record.ai;
          if (!hasCanonicalText(record)) {
            summary.counts.skippedEmptyRecords += 1;
            return;
          }
          records.push(record);
          if (record.type === "hadith") summary.counts.hadith += 1;
          else if (record.type === "quran_verse") summary.counts.quranVerses += 1;
          else if (record.type === "heading") summary.counts.headings += 1;
        } catch (error) {
          summary.counts.failedFetches += 1;
          summary.failures.push({ sourcePath, error: error.message });
        } finally {
          completedDetails += 1;
          if (progressEvery > 0 && (completedDetails % progressEvery === 0 || completedDetails === limitedDetailPaths.length)) {
            console.log(`[${book.slug}] fetched=${completedDetails}/${limitedDetailPaths.length}`);
          }
        }
      })
    )
  );

  records.sort((a, b) => compareNumericArrays(a.path.parts, b.path.parts));
  summary.counts.books += 1;
  const chapterIndexPath =
    book.slug === "quran"
      ? path.join(outDir, "quran", "chapters-index.json")
      : path.join(outDir, "hadith", book.slug, "chapters-index.json");
  await writeJson(chapterIndexPath, { book: book.slug, generatedAt: summary.generatedAt, chapters });
  return records;
}

function detailPathLimit(slug) {
  if (slug === "quran" && maxQuranVerses > 0) return maxQuranVerses;
  if (slug !== "quran" && maxHadiths > 0) return maxHadiths;
  return 0;
}

function limitDetailPaths(slug, detailPaths) {
  if (slug === "quran" && maxQuranVerses > 0) return detailPaths.slice(0, maxQuranVerses);
  if (slug !== "quran" && maxHadiths > 0) return detailPaths.slice(0, maxHadiths);
  if (slug !== "quran" && maxHadiths === 0 && args["max-hadiths"] === "0") return [];
  return detailPaths;
}

async function fetchWrapped(sourcePath) {
  return fetchJsonWithCache(pathToDataUrl(sourcePath), { cacheDir, refresh });
}

function normalizeChapter(data, wrapped) {
  return {
    index: wrapped.index,
    path: data.path,
    partType: data.part_type,
    localIndex: data.local_index,
    titles: cleanTitles(data.titles),
    verseCount: data.verse_count,
    verseStartIndex: data.verse_start_index,
    verseTranslations: data.verse_translations,
    nav: data.nav
  };
}

function normalizeVerseDetail({ wrapped, book }) {
  const data = wrapped.data ?? {};
  const verse = data.verse ?? {};
  const parsed = normalizeBookPath(verse.path);
  const type = classifyVerse(verse);
  const record = {
    id: wrapped.index,
    type,
    book: {
      slug: book.slug,
      titles: cleanTitles(book.meta.titles),
      author: book.meta.author
    },
    path: {
      source: verse.path,
      parts: parsed.parts
    },
    numbering: numberRecord(parsed.parts, type),
    chapter: {
      path: data.chapter_path,
      titles: cleanTitles(data.chapter_title)
    },
    arabic: {
      segments: Array.isArray(verse.text) ? verse.text : [],
      text: flattenTextSegments(verse.text)
    },
    translations: normalizeTranslations(verse.translations),
    gradings: normalizeGradings(verse.gradings ?? data.gradings),
    narratorChain: normalizeNarratorChain(verse.narrator_chain),
    relations: verse.relations ?? {},
    source: {
      provider: "ThaqalaynData",
      dataPath: verse.path,
      apiUrl: pathToDataUrl(verse.path),
      sourceUrl: verse.source_url ?? book.meta.source_url,
      license: "CC0-1.0"
    }
  };
  if (includeAi && verse.ai) record.ai = verse.ai;
  return record;
}

function hasCanonicalText(record) {
  const hasArabic = Boolean(record.arabic?.text || record.arabic?.segments?.length);
  const hasTranslation = Object.values(record.translations ?? {}).some((translation) => translation?.text);
  return hasArabic || hasTranslation || record.type === "heading";
}

function numberRecord(parts, type) {
  if (type === "quran_verse") return { surah: parts[0], ayah: parts[1] };
  return { volume: parts[0], book: parts[1], chapter: parts[2], hadith: parts[3] };
}

async function writeHadithOutputs(book, records) {
  const bookDir = path.join(outDir, "hadith", ensureSafeSegment(book.slug));
  await rm(path.join(bookDir, "chapters"), { recursive: true, force: true });
  await writeRecordCollection(path.join(bookDir, "all.json"), {
    generatedAt: summary.generatedAt,
    book: book.slug,
    source: summary.source
  }, records);
  const byChapter = new Map();
  for (const record of records.filter((item) => item.type === "hadith")) {
    const key = record.path.parts.slice(0, -1).join("/");
    if (!byChapter.has(key)) byChapter.set(key, []);
    byChapter.get(key).push(record);
  }
  for (const [chapterKey, chapterRecords] of byChapter.entries()) {
    await writeJson(path.join(bookDir, "chapters", `${chapterKey}.json`), {
      generatedAt: summary.generatedAt,
      book: book.slug,
      chapterPath: chapterRecords[0]?.chapter?.path,
      chapter: chapterRecords[0]?.chapter,
      count: chapterRecords.length,
      records: chapterRecords
    });
  }
}

async function writeQuranOutputs(records) {
  const quranDir = path.join(outDir, "quran");
  await rm(path.join(quranDir, "by_surah"), { recursive: true, force: true });
  const verses = records.filter((record) => record.type === "quran_verse");
  const bySurah = new Map();
  const tafsirLinks = [];
  for (const verse of verses) {
    const surah = verse.numbering.surah;
    if (!bySurah.has(surah)) bySurah.set(surah, []);
    bySurah.get(surah).push(verse);
    const mentionedIn = verse.relations?.["Mentioned In"] ?? [];
    if (mentionedIn.length > 0) {
      tafsirLinks.push({
        quranPath: verse.path.source,
        surah: verse.numbering.surah,
        ayah: verse.numbering.ayah,
        mentionedIn
      });
    }
  }
  await writeRecordCollection(path.join(quranDir, "all.json"), {
    generatedAt: summary.generatedAt,
    source: summary.source
  }, verses);
  for (const [surah, surahVerses] of bySurah.entries()) {
    await writeJson(path.join(quranDir, "by_surah", `${surah}.json`), {
      generatedAt: summary.generatedAt,
      surah,
      count: surahVerses.length,
      records: surahVerses
    });
  }
  await writeJson(path.join(quranDir, "tafsir_links.json"), {
    generatedAt: summary.generatedAt,
    description: "Hadith paths that ThaqalaynData relates to Quran verses. This is an index of source relations, not a claim that each item is formal tafsir.",
    count: tafsirLinks.length,
    links: tafsirLinks
  });
}

function cleanTitles(titles) {
  if (!titles || typeof titles !== "object") return {};
  const cleaned = {};
  for (const [language, value] of Object.entries(titles)) cleaned[language] = stripHtml(value);
  return cleaned;
}

function compareNumericArrays(left = [], right = []) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
