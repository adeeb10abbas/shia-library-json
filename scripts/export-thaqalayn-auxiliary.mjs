#!/usr/bin/env node
import { copyFile, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { parseCliArgs, writeJson } from "../src/thaqalayn-data.mjs";

const args = parseCliArgs(process.argv.slice(2));
const sourceDir = path.resolve(args.source ?? process.env.THAQALAYN_DATA_DIR ?? "tmp/ThaqalaynData");
const mirrorRoot = path.resolve(args.out ?? "index/thaqalayn");
const generatedAt = new Date().toISOString();
const source = {
  provider: "ThaqalaynData",
  localDir: sourceDir,
  revision: gitRevision(sourceDir),
  license: "CC0-1.0"
};

await assertDir(sourceDir);
await rm(mirrorRoot, { recursive: true, force: true });
await mkdir(mirrorRoot, { recursive: true });

const mirrored = {
  index: await mirrorTree("index", path.join(mirrorRoot, "index")),
  plans: await mirrorTree("plans", path.join(mirrorRoot, "plans")),
  validationCrossValidation: await mirrorTree("validation/cross-validation", path.join(mirrorRoot, "validation/cross-validation")),
  featuredNarrators: await mirrorFile("people/narrators/featured.json", path.join(mirrorRoot, "people/narrators/featured.json"))
};

await exportTitleSearch();
await exportFeaturedNarrators();
await exportReadingPlans();

await writeJson(path.join(mirrorRoot, "metadata.json"), {
  generatedAt,
  kind: "thaqalayn_auxiliary_mirror",
  source,
  description:
    "Raw ThaqalaynData auxiliary files mirrored for completeness. Canonical hadith, Quran, and narrator records remain normalized under db/.",
  mirrored
});

console.log(JSON.stringify({ mirrorRoot, mirrored }, null, 2));

async function exportTitleSearch() {
  const raw = await readSourceJson("index/search/titles.json");
  const entries = raw.map((entry) => {
    const parsed = parseBookPath(entry.p);
    return {
      path: entry.p,
      book: parsed.book,
      parts: parsed.parts,
      partType: entry.pt,
      titles: {
        en: entry.en ?? "",
        ar: entry.ar ?? "",
        arNormalized: entry.arn ?? ""
      },
      source: {
        ...source,
        dataPath: "/index/search/titles"
      }
    };
  });

  await writeJson("index/source-title-search.json", {
    generatedAt,
    kind: "source_title_search",
    source,
    count: entries.length,
    entries
  });
}

async function exportFeaturedNarrators() {
  const wrapped = await readSourceJson("people/narrators/featured.json");
  const data = wrapped.data ?? {};
  const featured = (data.featured ?? []).map((entry) => ({
    id: entry.id,
    path: `/people/narrators/${entry.id}`,
    names: {
      ar: entry.name_ar ?? "",
      en: entry.name_en ?? ""
    },
    narrations: entry.narrations ?? 0,
    source: {
      ...source,
      dataPath: `/people/narrators/${entry.id}`
    }
  }));
  const imamIds = Object.entries(data.imam_ids ?? {})
    .map(([id, value]) => ({
      id: Number.parseInt(id, 10),
      path: `/people/narrators/${id}`,
      names: {
        ar: value.name_ar ?? "",
        en: value.name_en ?? ""
      },
      source: {
        ...source,
        dataPath: `/people/narrators/${id}`
      }
    }))
    .sort((left, right) => left.id - right.id);

  await writeJson("index/narrators-featured.json", {
    generatedAt,
    kind: "featured_narrators",
    source,
    count: featured.length,
    imamIdCount: imamIds.length,
    featured,
    imamIds
  });
}

async function exportReadingPlans() {
  const plansIndex = await readSourceJson("plans/index.json");
  await rm("db/reading-plans", { recursive: true, force: true });

  const plans = [];
  for (const planSummary of plansIndex.plans ?? []) {
    const plan = await readSourceJson(`plans/${planSummary.id}.json`);
    const output = {
      ...plan,
      type: "reading_plan",
      source: {
        ...source,
        dataPath: `/plans/${planSummary.id}`
      }
    };
    await writeJson(path.join("db/reading-plans", `${planSummary.id}.json`), output);
    plans.push({
      id: planSummary.id,
      titleEn: planSummary.titleEn,
      descEn: planSummary.descEn,
      totalDays: planSummary.totalDays,
      totalVerses: planSummary.totalVerses,
      books: planSummary.books ?? [],
      path: `db/reading-plans/${planSummary.id}.json`,
      source: {
        ...source,
        dataPath: `/plans/${planSummary.id}`
      }
    });
  }

  await writeJson("index/reading-plans.json", {
    generatedAt,
    kind: "reading_plan_index",
    source,
    version: plansIndex.version,
    count: plans.length,
    plans
  });
}

async function mirrorTree(sourceRelativeDir, outputDir) {
  const inputDir = path.join(sourceDir, sourceRelativeDir);
  const files = await listFiles(inputDir);
  let bytes = 0;
  for (const inputFile of files) {
    const relative = path.relative(inputDir, inputFile);
    const outputFile = path.join(outputDir, relative);
    await mkdir(path.dirname(outputFile), { recursive: true });
    await copyFile(inputFile, outputFile);
    bytes += (await stat(inputFile)).size;
  }
  return { sourcePath: sourceRelativeDir, outputPath: path.relative(process.cwd(), outputDir), files: files.length, bytes };
}

async function mirrorFile(sourceRelativeFile, outputFile) {
  const inputFile = path.join(sourceDir, sourceRelativeFile);
  await mkdir(path.dirname(outputFile), { recursive: true });
  await copyFile(inputFile, outputFile);
  return {
    sourcePath: sourceRelativeFile,
    outputPath: path.relative(process.cwd(), outputFile),
    files: 1,
    bytes: (await stat(inputFile)).size
  };
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

async function readSourceJson(relativePath) {
  return JSON.parse(await readFile(path.join(sourceDir, relativePath), "utf8"));
}

async function assertDir(target) {
  const info = await stat(target);
  if (!info.isDirectory()) throw new Error(`${target} is not a directory`);
}

function parseBookPath(sourcePath) {
  if (!sourcePath?.startsWith("/books/")) return { book: undefined, parts: [] };
  const tail = sourcePath.slice("/books/".length);
  const [book, ...rawParts] = tail.split(":");
  return {
    book,
    parts: rawParts.map((part) => Number.parseInt(part, 10)).filter(Number.isFinite)
  };
}

function gitRevision(target) {
  const result = spawnSync("git", ["-C", target, "rev-parse", "--short", "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : undefined;
}
