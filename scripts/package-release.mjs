#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeJson } from "../src/thaqalayn-data.mjs";

const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const distDir = path.resolve("dist");
const releaseName = `shia-library-json-${date}`;
await mkdir(distDir, { recursive: true });

const roots = ["db", "index", "search", "schema"].filter((root) => commandOk("test", ["-e", root]));
const files = [];
for (const root of roots) {
  for (const file of await listFiles(root)) files.push(await fileEntry(file));
}

const manifest = {
  generatedAt: new Date().toISOString(),
  releaseName,
  roots,
  counts: {
    files: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    records: files.reduce((sum, file) => sum + (file.records ?? 0), 0)
  },
  files
};
await writeJson("index/manifest.json", manifest);
await writeFile(path.join(distDir, "checksums.txt"), files.map((file) => `${file.sha256}  ${file.path}`).join("\n") + "\n", "utf8");

const tarPath = path.join(distDir, `${releaseName}.tar.gz`);
run("tar", ["-czf", tarPath, ...roots, "README.md", "LICENSE"]);
let zipPath = null;
if (commandOk("sh", ["-lc", "command -v zip >/dev/null 2>&1"])) {
  zipPath = path.join(distDir, `${releaseName}.zip`);
  run("zip", ["-qr", zipPath, ...roots, "README.md", "LICENSE"]);
}
console.log(JSON.stringify({ manifest: "index/manifest.json", tar: path.relative(process.cwd(), tarPath), zip: zipPath ? path.relative(process.cwd(), zipPath) : null, files: files.length }, null, 2));

async function fileEntry(filePath) {
  const bytes = await readFile(filePath);
  const entry = { path: filePath, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  if (filePath.endsWith(".json")) {
    try {
      entry.records = countJsonRecords(JSON.parse(bytes.toString("utf8")));
    } catch {
      entry.records = 0;
    }
  } else if (filePath.endsWith(".jsonl")) {
    entry.records = bytes.toString("utf8").split("\n").filter(Boolean).length;
  }
  return entry;
}

function countJsonRecords(json) {
  if (Array.isArray(json.records)) return json.records.length;
  if (Array.isArray(json.links)) return json.links.length;
  if (Array.isArray(json.duas)) return json.duas.length;
  if (Array.isArray(json.narrators)) return json.narrators.length;
  if (json.type === "dua" || json.type === "narrator") return 1;
  if (typeof json.count === "number") return json.count;
  return 0;
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

function commandOk(command, args) {
  return spawnSync(command, args).status === 0;
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
}

