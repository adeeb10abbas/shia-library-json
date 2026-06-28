#!/usr/bin/env node
import path from "node:path";
import {
  createLimiter,
  fetchJsonWithCache,
  parseCliArgs,
  pathToDataUrl,
  THAQALAYN_DATA_BASE,
  THAQALAYN_DATA_DIR,
  writeJson
} from "../src/thaqalayn-data.mjs";

const args = parseCliArgs(process.argv.slice(2));
const cacheDir = args.cache === false ? undefined : path.resolve(args.cache ?? "tmp/cache");
const refresh = Boolean(args.refresh);
const outDir = path.resolve(args.out ?? "db/narrators");
const indexOut = path.resolve(args["index-out"] ?? "index/narrators.json");
const concurrency = Number.parseInt(args.concurrency ?? "12", 10);
const maxDetails = Number.parseInt(args["max-details"] ?? "0", 10);
const indexOnly = Boolean(args["index-only"]);
const generatedAt = new Date().toISOString();
const source = {
  provider: "ThaqalaynData",
  baseUrl: THAQALAYN_DATA_BASE,
  localDir: THAQALAYN_DATA_DIR,
  license: "CC0-1.0"
};

const wrapped = await fetchJsonWithCache(pathToDataUrl("/people/narrators/index"), { cacheDir, refresh });
const entries = Object.entries(wrapped.data ?? {}).sort((left, right) => Number(left[0]) - Number(right[0]));
const narrators = entries.map(([id, value]) => normalizeIndexNarrator(id, value));
const detailIds = maxDetails > 0 ? narrators.slice(0, maxDetails).map((n) => n.id) : narrators.map((n) => n.id);
const failures = [];
let detailCount = 0;

if (!indexOnly) {
  const limit = createLimiter(concurrency);
  await Promise.all(
    detailIds.map((id) =>
      limit(async () => {
        try {
          const detail = await fetchJsonWithCache(pathToDataUrl(`/people/narrators/${id}`), { cacheDir, refresh });
          await writeJson(path.join(outDir, `${id}.json`), normalizeDetailNarrator(detail.data, id));
          detailCount += 1;
        } catch (error) {
          failures.push({ id, error: error.message });
        }
      })
    )
  );
}

await writeJson(indexOut, {
  generatedAt,
  kind: "narrator_index",
  source,
  count: narrators.length,
  details: {
    written: detailCount,
    requested: indexOnly ? 0 : detailIds.length,
    limited: maxDetails > 0,
    outDir: path.relative(process.cwd(), outDir)
  },
  failures,
  narrators
});
console.log(JSON.stringify({ narrators: narrators.length, detailsWritten: detailCount, failures: failures.length }, null, 2));

function normalizeIndexNarrator(id, value) {
  const numericId = Number.parseInt(id, 10);
  return {
    id: numericId,
    path: `/people/narrators/${numericId}`,
    titles: value.titles ?? {},
    counts: {
      narrations: value.narrations ?? 0,
      narratedFrom: value.narrated_from ?? 0,
      narratedTo: value.narrated_to ?? 0
    },
    source: {
      ...source,
      dataPath: `/people/narrators/${numericId}`,
      apiUrl: pathToDataUrl(`/people/narrators/${numericId}`)
    }
  };
}

function normalizeDetailNarrator(value, fallbackId) {
  const id = value?.index ?? Number.parseInt(fallbackId, 10);
  return {
    id,
    type: "narrator",
    path: value?.path ?? `/people/narrators/${id}`,
    titles: value?.titles ?? {},
    versePaths: value?.verse_paths ?? [],
    verseCount: value?.verse_count ?? value?.verse_paths?.length ?? 0,
    relations: value?.relations ?? {},
    subchains: value?.subchains ?? {},
    source: {
      ...source,
      dataPath: `/people/narrators/${id}`,
      apiUrl: pathToDataUrl(`/people/narrators/${id}`)
    }
  };
}

