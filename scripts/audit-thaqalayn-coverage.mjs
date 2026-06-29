#!/usr/bin/env node
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { parseCliArgs, readJson, readRecordCollection, writeJson } from "../src/thaqalayn-data.mjs";

const args = parseCliArgs(process.argv.slice(2));
const sourceDir = path.resolve(args.source ?? process.env.THAQALAYN_DATA_DIR ?? "tmp/ThaqalaynData");
const jsonOut = path.resolve(args["json-out"] ?? "index/source-coverage.json");
const mdOut = path.resolve(args["md-out"] ?? "docs/COVERAGE.md");
const generatedAt = new Date().toISOString();

await assertDir(sourceDir);

const source = {
  provider: "ThaqalaynData",
  localDir: sourceDir,
  revision: gitRevision(sourceDir),
  license: "CC0-1.0"
};

const sourceBooks = await getSourceBooks();
const exportedBooks = await getExportedBooks();
const hadithBooks = await auditHadithBooks(sourceBooks.filter((book) => book.slug !== "quran"));
const quran = await auditQuran();
const narrators = await auditNarrators();
const auxiliary = await auditAuxiliary();
const issues = [
  ...hadithBooks.filter((book) => book.status === "missing" || book.status === "mismatch"),
  ...(quran.status === "complete" ? [] : [{ scope: "quran", status: quran.status }]),
  ...(narrators.status === "complete" ? [] : [{ scope: "narrators", status: narrators.status }]),
  ...auxiliary.required.filter((item) => item.status !== "complete")
];

const report = {
  generatedAt,
  kind: "thaqalayn_coverage_audit",
  source,
  summary: {
    sourceBooks: sourceBooks.length,
    exportedBooks: exportedBooks.length,
    hadithBooks: hadithBooks.length,
    hadithSourceRefs: sum(hadithBooks.map((book) => book.sourceHadithRefs)),
    hadithCanonicalExported: sum(hadithBooks.map((book) => book.exportedCanonicalHadith)),
    knownSkippedEmptyCanonical: sum(hadithBooks.map((book) => book.knownSkippedEmptyCanonical)),
    quranSourceVerses: quran.sourceVerseRefs,
    quranExportedVerses: quran.exportedVerses,
    narratorIndexEntries: narrators.sourceIndexEntries,
    narratorDetailsExported: narrators.exportedDetailFiles,
    issues: issues.length
  },
  books: {
    source: sourceBooks,
    exported: exportedBooks,
    hadith: hadithBooks,
    quran
  },
  narrators,
  auxiliary,
  intentionalExclusions: [
    {
      path: "books/complete/*.json",
      reason: "Raw upstream aggregate files are redundant with normalized db/hadith/*, db/quran/*, and chapter indexes."
    },
    {
      path: "books/<book>/**/*.json navigation files",
      reason: "Traversal/navigation metadata is normalized into db/*/chapters-index.json and index/books.json."
    },
    {
      path: "kamal-al-din empty canonical records",
      reason:
        "The source currently has 659 Kamal al-Din references with no canonical hadith text; only AI-derived fields are present, so canonical exports skip them by default."
    },
    {
      path: "AI-only verse content",
      reason: "Canonical exports exclude AI-generated content unless a separate explicit AI export is requested."
    },
    {
      path: "repository operational files",
      reason: "README, API docs, config, examples, and development files are not library data."
    }
  ],
  issues
};

await writeJson(jsonOut, report);
await writeMarkdown(mdOut, report);
console.log(JSON.stringify(report.summary, null, 2));

async function auditHadithBooks(books) {
  const rows = [];
  for (const book of books) {
    const completePath = path.join(sourceDir, "books", "complete", `${book.slug}.json`);
    const sourceComplete = await readLocalJson(completePath);
    const sourceRefs = countVerseRefs(sourceComplete, "Hadith");
    let exportedCanonicalHadith = 0;
    let exportedLayout = "missing";
    try {
      const exported = await readRecordCollection(path.resolve("db/hadith", book.slug, "all.json"));
      exportedCanonicalHadith = (exported.records ?? []).filter((record) => record.type === "hadith").length;
      exportedLayout = exported.layout ?? "single";
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const knownSkippedEmptyCanonical = Math.max(0, sourceRefs - exportedCanonicalHadith);
    const isCompleteKnownSkip =
      book.slug === "kamal-al-din" && sourceRefs === 659 && exportedCanonicalHadith === 0 && knownSkippedEmptyCanonical === 659;
    rows.push({
      slug: book.slug,
      sourceHadithRefs: sourceRefs,
      exportedCanonicalHadith,
      knownSkippedEmptyCanonical,
      exportedLayout,
      status:
        exportedCanonicalHadith === sourceRefs
          ? "complete"
          : isCompleteKnownSkip
            ? "complete_excluding_empty_canonical_records"
            : exportedCanonicalHadith > 0
              ? "mismatch"
              : "missing"
    });
  }
  return rows;
}

async function auditQuran() {
  const sourceComplete = await readLocalJson(path.join(sourceDir, "books", "complete", "quran.json"));
  const sourceVerseRefs = countVerseRefs(sourceComplete, "Verse");
  let exportedVerses = 0;
  let exportedLayout = "missing";
  try {
    const exported = await readRecordCollection(path.resolve("db/quran/all.json"));
    exportedVerses = (exported.records ?? []).filter((record) => record.type === "quran_verse").length;
    exportedLayout = exported.layout ?? "single";
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return {
    sourceVerseRefs,
    exportedVerses,
    exportedLayout,
    status: sourceVerseRefs === exportedVerses ? "complete" : "mismatch"
  };
}

async function auditNarrators() {
  const sourceIndex = await readSourceWrapped("people/narrators/index.json");
  const sourceIndexEntries = Object.keys(sourceIndex.data ?? {}).length;
  const sourceDetailFiles = (await listFiles(path.join(sourceDir, "people/narrators")))
    .filter((file) => path.basename(file).match(/^\d+\.json$/)).length;
  const sourceFeatured = await readSourceWrapped("people/narrators/featured.json");
  const sourceFeaturedCount = sourceFeatured.data?.featured?.length ?? 0;
  const sourceImamIdCount = Object.keys(sourceFeatured.data?.imam_ids ?? {}).length;
  const exportedDetailFiles = (await listFilesIfExists("db/narrators")).filter((file) => path.basename(file).match(/^\d+\.json$/)).length;
  const exportedIndex = await optionalJson("index/narrators.json");
  const exportedFeatured = await optionalJson("index/narrators-featured.json");
  return {
    sourceIndexEntries,
    sourceDetailFiles,
    sourceFeaturedCount,
    sourceImamIdCount,
    exportedIndexEntries: exportedIndex?.narrators?.length ?? 0,
    exportedDetailFiles,
    exportedFeaturedCount: exportedFeatured?.featured?.length ?? 0,
    exportedImamIdCount: exportedFeatured?.imamIds?.length ?? 0,
    status:
      sourceIndexEntries === exportedIndex?.narrators?.length &&
      sourceDetailFiles === exportedDetailFiles &&
      sourceFeaturedCount === exportedFeatured?.featured?.length &&
      sourceImamIdCount === exportedFeatured?.imamIds?.length
        ? "complete"
        : "mismatch"
  };
}

async function auditAuxiliary() {
  const sourceIndexFiles = await listJsonFiles(path.join(sourceDir, "index"));
  const mirroredIndexFiles = await listJsonFilesIfExists("index/thaqalayn/index");
  const sourcePlanFiles = await listJsonFiles(path.join(sourceDir, "plans"));
  const mirroredPlanFiles = await listJsonFilesIfExists("index/thaqalayn/plans");
  const exportedPlanFiles = await listJsonFilesIfExists("db/reading-plans");
  const sourceValidationFiles = await listJsonFiles(path.join(sourceDir, "validation/cross-validation"));
  const mirroredValidationFiles = await listJsonFilesIfExists("index/thaqalayn/validation/cross-validation");
  const sourceFeaturedExists = await exists(path.join(sourceDir, "people/narrators/featured.json"));
  const mirroredFeaturedExists = await exists("index/thaqalayn/people/narrators/featured.json");
  const sourceTitles = await readLocalJson(path.join(sourceDir, "index/search/titles.json"));
  const sourceTitleSearch = await optionalJson("index/source-title-search.json");
  const readingPlans = await optionalJson("index/reading-plans.json");

  const required = [
    row("source index mirror", sourceIndexFiles.length, mirroredIndexFiles.length),
    row("source plan mirror", sourcePlanFiles.length, mirroredPlanFiles.length),
    row("reading plan exports", Math.max(0, sourcePlanFiles.length - 1), exportedPlanFiles.length),
    row("source validation mirror", sourceValidationFiles.length, mirroredValidationFiles.length),
    row("featured narrator mirror", sourceFeaturedExists ? 1 : 0, mirroredFeaturedExists ? 1 : 0),
    row("source title search convenience export", sourceTitles.length, sourceTitleSearch?.entries?.length ?? 0),
    row("reading plan index convenience export", Math.max(0, sourcePlanFiles.length - 1), readingPlans?.plans?.length ?? 0)
  ];

  return {
    required,
    sourceIndexFiles: sourceIndexFiles.length,
    sourcePlanFiles: sourcePlanFiles.length,
    sourceValidationFiles: sourceValidationFiles.length
  };
}

function row(scope, sourceCount, exportedCount) {
  return { scope, sourceCount, exportedCount, status: sourceCount === exportedCount ? "complete" : "mismatch" };
}

async function getSourceBooks() {
  const wrapped = await readSourceWrapped("books/books.json");
  return (wrapped.data?.chapters ?? [])
    .map((book) => ({ slug: book.path?.slice("/books/".length), path: book.path, titles: book.titles ?? {} }))
    .filter((book) => book.slug)
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

async function getExportedBooks() {
  const exported = await readJson("index/books.json");
  return (exported.books ?? [])
    .map((book) => ({ slug: book.slug, path: book.path, titles: book.titles ?? {} }))
    .filter((book) => book.slug)
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

function countVerseRefs(node, partType) {
  let count = 0;
  const stack = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (Array.isArray(current.verse_refs)) {
      count += current.verse_refs.filter((ref) => ref.part_type === partType).length;
    }
    if (Array.isArray(current.chapters)) stack.push(...current.chapters);
  }
  return count;
}

async function writeMarkdown(filePath, report) {
  const hadithRows = report.books.hadith
    .map(
      (book) =>
        `| \`${book.slug}\` | ${book.sourceHadithRefs} | ${book.exportedCanonicalHadith} | ${book.knownSkippedEmptyCanonical} | ${book.status} |`
    )
    .join("\n");
  const auxRows = report.auxiliary.required
    .map((item) => `| ${item.scope} | ${item.sourceCount} | ${item.exportedCount} | ${item.status} |`)
    .join("\n");
  const issueText = report.issues.length
    ? report.issues.map((issue) => `- ${issue.slug ?? issue.scope}: ${issue.status}`).join("\n")
    : "- None";

  const markdown = `# ThaqalaynData Coverage

Generated: ${report.generatedAt}

Source revision: \`${report.source.revision ?? "unknown"}\`

## Summary

| Scope | Count |
| --- | ---: |
| Source books | ${report.summary.sourceBooks} |
| Exported books | ${report.summary.exportedBooks} |
| Source hadith refs | ${report.summary.hadithSourceRefs} |
| Canonical exported hadith | ${report.summary.hadithCanonicalExported} |
| Known skipped empty canonical records | ${report.summary.knownSkippedEmptyCanonical} |
| Source Quran verses | ${report.summary.quranSourceVerses} |
| Exported Quran verses | ${report.summary.quranExportedVerses} |
| Narrator index entries | ${report.summary.narratorIndexEntries} |
| Narrator detail exports | ${report.summary.narratorDetailsExported} |
| Issues | ${report.summary.issues} |

## Hadith Books

| Book | Source refs | Exported canonical | Skipped empty canonical | Status |
| --- | ---: | ---: | ---: | --- |
${hadithRows}

## Quran

| Source verse refs | Exported verses | Status |
| ---: | ---: | --- |
| ${report.books.quran.sourceVerseRefs} | ${report.books.quran.exportedVerses} | ${report.books.quran.status} |

## Narrators

| Source index | Source details | Exported index | Exported details | Featured | Imam IDs | Status |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| ${report.narrators.sourceIndexEntries} | ${report.narrators.sourceDetailFiles} | ${report.narrators.exportedIndexEntries} | ${report.narrators.exportedDetailFiles} | ${report.narrators.exportedFeaturedCount} | ${report.narrators.exportedImamIdCount} | ${report.narrators.status} |

## Auxiliary Source Data

| Scope | Source count | Exported count | Status |
| --- | ---: | ---: | --- |
${auxRows}

## Intentional Exclusions

${report.intentionalExclusions.map((item) => `- \`${item.path}\`: ${item.reason}`).join("\n")}

## Issues

${issueText}
`;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, markdown, "utf8");
}

async function readSourceWrapped(relativePath) {
  return readLocalJson(path.join(sourceDir, relativePath));
}

async function readLocalJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function optionalJson(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function listJsonFiles(root) {
  return (await listFiles(root)).filter((file) => file.endsWith(".json"));
}

async function listJsonFilesIfExists(root) {
  return (await listFilesIfExists(root)).filter((file) => file.endsWith(".json"));
}

async function listFilesIfExists(root) {
  try {
    return await listFiles(root);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function listFiles(root) {
  const files = [];
  async function walk(current) {
    const info = await stat(current);
    if (info.isDirectory()) {
      for (const entry of await readdir(current)) await walk(path.join(current, entry));
      return;
    }
    files.push(current);
  }
  await walk(root);
  return files.sort();
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function assertDir(target) {
  const info = await stat(target);
  if (!info.isDirectory()) throw new Error(`${target} is not a directory`);
}

function gitRevision(target) {
  const result = spawnSync("git", ["-C", target, "rev-parse", "--short", "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}
