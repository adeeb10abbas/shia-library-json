import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const THAQALAYN_DATA_BASE =
  process.env.THAQALAYN_DATA_BASE ?? "https://thaqalayndata.netlify.app";
export const THAQALAYN_DATA_DIR = process.env.THAQALAYN_DATA_DIR;
export const THAQALAYN_SITE_BASE =
  process.env.THAQALAYN_SITE_BASE ?? "https://thaqalayn.net";

const FETCH_TIMEOUT_MS = Number.parseInt(process.env.FETCH_TIMEOUT_MS ?? "20000", 10);
const FETCH_RETRIES = Number.parseInt(process.env.FETCH_RETRIES ?? "3", 10);
export const GITHUB_HARD_FILE_LIMIT_BYTES = 100_000_000;
export const RECORD_COLLECTION_SPLIT_THRESHOLD_BYTES = Number.parseInt(
  process.env.RECORD_COLLECTION_SPLIT_THRESHOLD_BYTES ?? "95000000",
  10
);
export const RECORD_COLLECTION_SPLIT_TARGET_BYTES = Number.parseInt(
  process.env.RECORD_COLLECTION_SPLIT_TARGET_BYTES ?? "75000000",
  10
);

export function pathToDataUrl(sourcePath) {
  if (!sourcePath || typeof sourcePath !== "string") {
    throw new Error(`Invalid ThaqalaynData path: ${sourcePath}`);
  }
  const normalized = sourcePath.startsWith("/") ? sourcePath : `/${sourcePath}`;
  if (THAQALAYN_DATA_DIR) {
    const localPath = path.resolve(THAQALAYN_DATA_DIR, `${normalized.slice(1).replaceAll(":", "/")}.json`);
    return `file://${localPath}`;
  }
  return `${THAQALAYN_DATA_BASE}${normalized.replaceAll(":", "/")}.json`;
}

export function normalizeBookPath(sourcePath) {
  const normalized = sourcePath.startsWith("/") ? sourcePath : `/${sourcePath}`;
  if (!normalized.startsWith("/books/")) {
    throw new Error(`Expected /books/ path, got ${sourcePath}`);
  }
  const tail = normalized.slice("/books/".length);
  const [book, ...rawParts] = tail.split(":");
  return {
    book,
    parts: rawParts.map((part) => Number.parseInt(part, 10)),
    sourcePath: normalized
  };
}

export function ensureSafeSegment(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function stripHtml(value) {
  if (!value || typeof value !== "string") return value ?? "";
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function writeJson(filePath, value) {
  return mkdir(path.dirname(filePath), { recursive: true }).then(() =>
    writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
  );
}

export function writeJsonl(filePath, values) {
  return mkdir(path.dirname(filePath), { recursive: true }).then(() =>
    writeFile(filePath, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`, "utf8")
  );
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function writeRecordCollection(filePath, metadata, records, options = {}) {
  const thresholdBytes = Number.parseInt(options.thresholdBytes ?? RECORD_COLLECTION_SPLIT_THRESHOLD_BYTES, 10);
  const targetBytes = Number.parseInt(options.targetBytes ?? RECORD_COLLECTION_SPLIT_TARGET_BYTES, 10);
  const hardLimitBytes = Number.parseInt(options.hardLimitBytes ?? GITHUB_HARD_FILE_LIMIT_BYTES, 10);
  const payload = { ...metadata, count: records.length, records };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  const byteLength = Buffer.byteLength(serialized, "utf8");
  const partsDir = recordCollectionPartsDir(filePath);

  if (byteLength <= thresholdBytes) {
    await rm(partsDir, { recursive: true, force: true });
    await writeJson(filePath, payload);
    return { layout: "single", path: filePath, count: records.length, bytes: byteLength };
  }

  await rm(filePath, { force: true });
  await rm(partsDir, { recursive: true, force: true });
  await mkdir(partsDir, { recursive: true });

  const parts = splitRecordsByApproximateBytes(records, targetBytes);
  const partEntries = [];
  for (const [index, partRecords] of parts.entries()) {
    const partName = `part-${String(index + 1).padStart(4, "0")}.json`;
    const partPath = path.join(partsDir, partName);
    await writeJson(partPath, {
      ...metadata,
      layout: "split-record-collection-part",
      part: {
        index: index + 1,
        total: parts.length,
        firstRecordId: partRecords[0]?.id,
        lastRecordId: partRecords.at(-1)?.id
      },
      count: partRecords.length,
      totalCount: records.length,
      records: partRecords
    });
    const partStats = await stat(partPath);
    if (partStats.size > hardLimitBytes) {
      throw new Error(`${partPath} is ${partStats.size} bytes, above publish hard limit ${hardLimitBytes}`);
    }
    partEntries.push({ path: partName, count: partRecords.length, bytes: partStats.size });
  }

  await writeJson(path.join(partsDir, "index.json"), {
    ...metadata,
    layout: "split-record-collection",
    splitOf: path.basename(filePath),
    count: records.length,
    partCount: partEntries.length,
    parts: partEntries
  });
  return { layout: "split", path: partsDir, count: records.length, partCount: partEntries.length };
}

export async function readRecordCollection(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const partsDir = recordCollectionPartsDir(filePath);
  const index = await readJson(path.join(partsDir, "index.json"));
  const records = [];
  for (const part of index.parts ?? []) {
    const parsed = await readJson(path.join(partsDir, part.path));
    records.push(...(parsed.records ?? []));
  }
  return { ...index, records };
}

function recordCollectionPartsDir(filePath) {
  if (!filePath.endsWith(".json")) return `${filePath}-parts`;
  return `${filePath.slice(0, -".json".length)}-parts`;
}

function splitRecordsByApproximateBytes(records, targetBytes) {
  const safeTargetBytes = Math.max(1_000_000, targetBytes);
  const parts = [];
  let current = [];
  let currentBytes = 0;

  for (const record of records) {
    const recordBytes = Buffer.byteLength(JSON.stringify(record), "utf8") + 4;
    if (current.length > 0 && currentBytes + recordBytes > safeTargetBytes) {
      parts.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(record);
    currentBytes += recordBytes;
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

export function flattenTextSegments(segments) {
  if (!Array.isArray(segments)) return "";
  return segments.map((segment) => String(segment ?? "").trim()).filter(Boolean).join("\n\n");
}

export function normalizeTranslations(translations = {}) {
  const normalized = {};
  for (const [translationId, segments] of Object.entries(translations ?? {})) {
    normalized[translationId] = {
      segments: Array.isArray(segments) ? segments : [String(segments ?? "")],
      text: Array.isArray(segments) ? flattenTextSegments(segments) : String(segments ?? "")
    };
  }
  return normalized;
}

export function normalizeGradings(gradings = []) {
  return (Array.isArray(gradings) ? gradings : [])
    .filter(Boolean)
    .map((raw) => {
      const labelMatch = String(raw).match(/<span[^>]*>(.*?)<\/span>/i);
      return {
        raw,
        label: labelMatch ? stripHtml(labelMatch[1]) : undefined,
        text: stripHtml(raw)
      };
    });
}

export function normalizeNarratorChain(narratorChain) {
  if (!narratorChain?.parts || !Array.isArray(narratorChain.parts)) return undefined;
  return {
    raw: narratorChain.parts.map((part) => part.text ?? "").join("").trim(),
    parts: narratorChain.parts.map((part) => ({
      kind: part.kind,
      text: part.text,
      path: part.path
    })),
    narratorPaths: narratorChain.parts
      .filter((part) => part.kind === "narrator" && part.path)
      .map((part) => part.path)
  };
}

export function classifyVerse(verse) {
  if (verse?.part_type === "Verse") return "quran_verse";
  if (verse?.part_type === "Hadith") return "hadith";
  if (verse?.part_type === "Heading") return "heading";
  return "text";
}

export async function fetchJsonWithCache(url, { cacheDir, refresh = false } = {}) {
  if (url.startsWith("file://")) return fetchJson(url);
  if (!cacheDir) return fetchJson(url);

  const cacheKey = Buffer.from(url).toString("base64url");
  const cachePath = path.join(cacheDir, `${cacheKey}.json`);
  if (!refresh) {
    try {
      return JSON.parse(await readFile(cachePath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  const json = await fetchJson(url);
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cachePath, JSON.stringify(json), "utf8");
  return json;
}

async function fetchJson(url) {
  if (url.startsWith("file://")) {
    return JSON.parse(await readFile(new URL(url), "utf8"));
  }

  let lastError;
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "user-agent": "shia-library-json/0.2 (+https://github.com/local/shia-library-json)"
        }
      });
      if (!response.ok) {
        const error = new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
        error.status = response.status;
        throw error;
      }
      return response.json();
    } catch (error) {
      lastError = error;
      const retryableStatus = error.status === 429 || (error.status >= 500 && error.status <= 599);
      const retryableError = error.name === "AbortError" || error.name === "TimeoutError" || retryableStatus;
      if (!retryableError || attempt === FETCH_RETRIES) break;
      await sleep(250 * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

export function createLimiter(concurrency) {
  const max = Math.max(1, Number.parseInt(concurrency, 10) || 1);
  let active = 0;
  const queue = [];

  function pump() {
    while (active < max && queue.length > 0) {
      const job = queue.shift();
      active += 1;
      Promise.resolve()
        .then(job.fn)
        .then(job.resolve, job.reject)
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  }

  return function limit(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      pump();
    });
  };
}

export function parseCliArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
