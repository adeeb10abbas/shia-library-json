#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const roots = process.argv.slice(2);
if (roots.length === 0) roots.push("db", "index", "search", "schema");

const failures = [];
let jsonFiles = 0;
let records = 0;

for (const root of roots) await walk(root);

if (failures.length > 0) {
  console.error(`Validation failed with ${failures.length} issue(s):`);
  for (const failure of failures.slice(0, 50)) console.error(`- ${failure.file}: ${failure.message}`);
  if (failures.length > 50) console.error(`...and ${failures.length - 50} more`);
  process.exit(1);
}
console.log(`Validated ${jsonFiles} JSON files and ${records} content records.`);

async function walk(target) {
  let info;
  try {
    info = await stat(target);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (info.isDirectory()) {
    for (const entry of await readdir(target)) await walk(path.join(target, entry));
    return;
  }
  if (target.endsWith(".jsonl")) {
    await validateJsonl(target);
    return;
  }
  if (!target.endsWith(".json")) return;
  jsonFiles += 1;
  let parsed;
  try {
    parsed = JSON.parse(await readFile(target, "utf8"));
  } catch (error) {
    failures.push({ file: target, message: `invalid JSON: ${error.message}` });
    return;
  }
  validateNoDefaultAi(target, parsed);
  validateSchemaFile(target, parsed);
  validateContentContainer(target, parsed);
}

function validateContentContainer(file, parsed) {
  if (Array.isArray(parsed.records)) for (const record of parsed.records) validateRecord(file, record);
  if (parsed.type === "dua") validateDua(file, parsed);
  if (parsed.type === "narrator") validateNarrator(file, parsed);
  if (Array.isArray(parsed.narrators)) for (const narrator of parsed.narrators) validateNarratorIndexEntry(file, narrator);
}

function validateRecord(file, record) {
  records += 1;
  if (!record.id) failures.push({ file, message: "record missing id" });
  if (!record.type) failures.push({ file, message: `record ${record.id ?? "(unknown)"} missing type` });
  if (!record.source?.provider) failures.push({ file, message: `record ${record.id ?? "(unknown)"} missing source provider` });
  if (record.type === "hadith" || record.type === "quran_verse") {
    const hasArabic = Boolean(record.arabic?.text || record.arabic?.segments?.length);
    const hasTranslation = Object.values(record.translations ?? {}).some((translation) => translation?.text);
    if (!hasArabic && !hasTranslation) failures.push({ file, message: `record ${record.id ?? "(unknown)"} has no text` });
  }
}

function validateDua(file, record) {
  records += 1;
  if (!record.id) failures.push({ file, message: "dua missing id" });
  if (!record.source?.url) failures.push({ file, message: `dua ${record.id ?? "(unknown)"} missing source url` });
  if (!Array.isArray(record.lines) || record.lines.length === 0) failures.push({ file, message: `dua ${record.id ?? "(unknown)"} has no lines` });
  if (!Array.isArray(record.pairs) || record.pairs.length === 0) failures.push({ file, message: `dua ${record.id ?? "(unknown)"} has no paired lines` });
}

function validateNarrator(file, record) {
  records += 1;
  if (!Number.isInteger(record.id)) failures.push({ file, message: "narrator missing integer id" });
  if (record.type !== "narrator") failures.push({ file, message: `narrator ${record.id ?? "(unknown)"} has wrong type` });
  if (!record.source?.provider) failures.push({ file, message: `narrator ${record.id ?? "(unknown)"} missing source provider` });
  if (!record.path) failures.push({ file, message: `narrator ${record.id ?? "(unknown)"} missing path` });
}

function validateNarratorIndexEntry(file, record) {
  records += 1;
  if (!Number.isInteger(record.id)) failures.push({ file, message: "narrator index entry missing integer id" });
  if (!record.source?.provider) failures.push({ file, message: `narrator ${record.id ?? "(unknown)"} missing source provider` });
}

function validateSchemaFile(file, parsed) {
  if (!file.includes(`${path.sep}schema${path.sep}`)) return;
  if (!parsed.$schema) failures.push({ file, message: "schema missing $schema" });
  if (!parsed.title) failures.push({ file, message: "schema missing title" });
  if (!parsed.type) failures.push({ file, message: "schema missing type" });
}

async function validateJsonl(file) {
  const text = await readFile(file, "utf8");
  const lines = text.split("\n").filter(Boolean);
  for (const [index, line] of lines.entries()) {
    try {
      const parsed = JSON.parse(line);
      if (!parsed.id) failures.push({ file, message: `jsonl line ${index + 1} missing id` });
      if (!parsed.type) failures.push({ file, message: `jsonl line ${index + 1} missing type` });
    } catch (error) {
      failures.push({ file, message: `invalid JSONL at line ${index + 1}: ${error.message}` });
    }
  }
}

function validateNoDefaultAi(file, value) {
  if (file.includes(`${path.sep}tmp${path.sep}`)) return;
  const stack = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (Object.prototype.hasOwnProperty.call(current, "ai")) {
      failures.push({ file, message: "default export contains ai key; use --include-ai only for separate AI exports" });
      return;
    }
    for (const child of Object.values(current)) if (child && typeof child === "object") stack.push(child);
  }
}

