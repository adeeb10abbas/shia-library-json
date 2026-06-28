#!/usr/bin/env node
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  ensureSafeSegment,
  parseCliArgs,
  stripHtml,
  THAQALAYN_SITE_BASE,
  writeJson
} from "./thaqalayn-data.mjs";

const args = parseCliArgs(process.argv.slice(2));
const outDir = path.resolve(args.out ?? "db/duas");
const max = Number.parseInt(args.max ?? "0", 10);
const delayMs = Number.parseInt(args["delay-ms"] ?? "750", 10);
const sitemapUrl = args.sitemap ?? `${THAQALAYN_SITE_BASE}/sitemap/duas.xml`;

await mkdir(outDir, { recursive: true });
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const urls = await fetchDuaUrls(sitemapUrl);
const selectedUrls = max > 0 ? urls.slice(0, max) : urls;
const generatedAt = new Date().toISOString();
const records = [];

console.log(`Dua sitemap: ${sitemapUrl}`);
console.log(`Duas selected: ${selectedUrls.length}`);

for (const [index, url] of selectedUrls.entries()) {
  if (index > 0 && delayMs > 0) await sleep(delayMs);
  try {
    const record = await fetchDua(url, generatedAt);
    records.push(record);
    await writeJson(path.join(outDir, `${record.slug}.json`), record);
    console.log(`Imported ${record.slug}`);
  } catch (error) {
    console.error(`Failed ${url}: ${error.message}`);
  }
}

await writeJson(path.resolve("index/duas.json"), {
  generatedAt,
  source: {
    provider: "Thaqalayn public pages",
    sitemap: sitemapUrl,
    robots: `${THAQALAYN_SITE_BASE}/robots.txt`
  },
  count: records.length,
  duas: records.map((record) => ({
    slug: record.slug,
    title: record.title,
    alternateName: record.alternateName,
    url: record.source.url,
    lineCount: record.lines.length,
    pairCount: record.pairs.length
  }))
});

async function fetchDuaUrls(url) {
  const xml = await fetchText(url, "application/xml,text/xml,text/plain,*/*");
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]).filter(Boolean);
}

async function fetchDua(url, generatedAt) {
  const html = await fetchText(url, "text/html,*/*");
  const jsonLdBlocks = extractJsonLd(html);
  const creativeWork = jsonLdBlocks.find((block) => {
    const type = block?.["@type"];
    return type === "CreativeWork" || (Array.isArray(type) && type.includes("CreativeWork"));
  });
  if (!creativeWork?.text) throw new Error("Could not find CreativeWork JSON-LD text");

  const slug = ensureSafeSegment(new URL(url).pathname.split("/").filter(Boolean).at(-1));
  const lines = String(creativeWork.text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text, index) => ({
      index: index + 1,
      kind: /[\u0600-\u06ff]/.test(text) ? "arabic" : "translation",
      text
    }));
  const pairs = pairDuaLines(lines);

  return {
    id: slug,
    type: "dua",
    slug,
    title: creativeWork.name ?? slug,
    alternateName: creativeWork.alternateName,
    description: creativeWork.description ? stripHtml(creativeWork.description) : undefined,
    fullText: creativeWork.text,
    lines,
    pairs,
    source: {
      provider: "Thaqalayn public pages",
      url,
      extractedFrom: "application/ld+json CreativeWork",
      fetchedAt: generatedAt
    }
  };
}

function pairDuaLines(lines) {
  const pairs = [];
  let current = null;
  for (const line of lines) {
    if (line.kind === "arabic") {
      current = { index: pairs.length + 1, arabic: line.text, translations: [] };
      pairs.push(current);
      continue;
    }
    if (!current) {
      current = { index: pairs.length + 1, arabic: "", translations: [] };
      pairs.push(current);
    }
    current.translations.push({ language: "en", text: line.text });
  }
  return pairs;
}

function extractJsonLd(html) {
  const blocks = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(regex)) {
    try {
      blocks.push(JSON.parse(match[1]));
    } catch {
      // Ignore non-JSON script blocks.
    }
  }
  return blocks;
}

async function fetchText(url, accept) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept,
        "user-agent": "shia-library-json/0.2 respectful-public-page-ingest"
      }
    });
    if (!response.ok) throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

