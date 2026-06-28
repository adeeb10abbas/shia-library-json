#!/usr/bin/env node
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { readJson, readRecordCollection, writeJson, writeJsonl } from "../src/thaqalayn-data.mjs";

const outDir = path.resolve("search");
await rm(outDir, { recursive: true, force: true });

const generatedAt = new Date().toISOString();
const hadithLines = [];
const quranLines = [];
const quranRelationLines = [];
const duaLines = [];

await collectHadith();
await collectQuran();
await collectDuas();

await writeJsonl(path.join(outDir, "hadith.jsonl"), hadithLines);
await writeJsonl(path.join(outDir, "quran.jsonl"), quranLines);
await writeJsonl(path.join(outDir, "quran-relations.jsonl"), quranRelationLines);
await writeJsonl(path.join(outDir, "duas.jsonl"), duaLines);
await writeJson(path.join(outDir, "summary.json"), {
  generatedAt,
  counts: {
    hadith: hadithLines.length,
    quran: quranLines.length,
    quranRelations: quranRelationLines.length,
    duas: duaLines.length
  }
});
console.log(JSON.stringify({ hadith: hadithLines.length, quran: quranLines.length, quranRelations: quranRelationLines.length, duas: duaLines.length }, null, 2));

async function collectHadith() {
  const root = path.resolve("db/hadith");
  if (!(await exists(root))) return;
  for (const book of await readdir(root)) {
    const allPath = path.join(root, book, "all.json");
    if (!(await exists(allPath)) && !(await exists(path.join(root, book, "all-parts", "index.json")))) continue;
    const parsed = await readRecordCollection(allPath);
    for (const record of parsed.records ?? []) {
      if (record.type !== "hadith") continue;
      hadithLines.push({
        id: record.id,
        type: record.type,
        title: record.chapter?.titles?.en ?? record.book?.titles?.en ?? record.book?.slug,
        arabic: record.arabic?.text ?? "",
        english: preferredEnglish(record.translations),
        book: record.book?.slug,
        path: record.path?.source,
        source: record.source,
        gradings: (record.gradings ?? []).map((grading) => grading.text),
        narratorPaths: record.narratorChain?.narratorPaths ?? []
      });
    }
  }
}

async function collectQuran() {
  const allPath = path.resolve("db/quran/all.json");
  if (!(await exists(allPath)) && !(await exists(path.resolve("db/quran/all-parts/index.json")))) return;
  const parsed = await readRecordCollection(allPath);
  for (const record of parsed.records ?? []) {
    if (record.type !== "quran_verse") continue;
    quranLines.push({
      id: record.id,
      type: record.type,
      title: `Quran ${record.numbering?.surah}:${record.numbering?.ayah}`,
      arabic: record.arabic?.text ?? "",
      english: preferredEnglish(record.translations),
      book: "quran",
      path: record.path?.source,
      source: record.source
    });
  }
  const relationPath = path.resolve("db/quran/tafsir_links.json");
  if (!(await exists(relationPath))) return;
  const relations = await readJson(relationPath);
  for (const link of relations.links ?? []) {
    quranRelationLines.push({
      id: `quran:${link.surah}:${link.ayah}`,
      type: "quran_relation",
      title: `Quran ${link.surah}:${link.ayah} related hadith`,
      quranPath: link.quranPath,
      mentionedIn: link.mentionedIn
    });
  }
}

async function collectDuas() {
  const root = path.resolve("db/duas");
  if (!(await exists(root))) return;
  for (const file of await listJsonFiles(root)) {
    const record = await readJson(file);
    if (record.type !== "dua") continue;
    duaLines.push({
      id: record.id,
      type: "dua",
      title: record.title,
      alternateName: record.alternateName,
      arabic: (record.pairs ?? []).map((pair) => pair.arabic).filter(Boolean).join("\n"),
      english: (record.pairs ?? []).flatMap((pair) => pair.translations ?? []).map((translation) => translation.text).filter(Boolean).join("\n"),
      path: record.slug,
      source: record.source
    });
  }
}

function preferredEnglish(translations = {}) {
  const preferred = ["en.sarwar", "en.hubeali", "en.qarai", "en.shakir", "en.yusufali"];
  for (const key of preferred) if (translations[key]?.text) return translations[key].text;
  const first = Object.entries(translations).find(([key, value]) => key.startsWith("en.") && value?.text);
  return first?.[1]?.text ?? "";
}

async function listJsonFiles(root) {
  const files = [];
  async function walk(current) {
    const info = await stat(current);
    if (info.isDirectory()) {
      for (const entry of await readdir(current)) await walk(path.join(current, entry));
      return;
    }
    if (current.endsWith(".json")) files.push(current);
  }
  await walk(root);
  return files;
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
