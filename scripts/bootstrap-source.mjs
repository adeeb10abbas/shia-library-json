#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { parseCliArgs } from "../src/thaqalayn-data.mjs";

const args = parseCliArgs(process.argv.slice(2));
const target = path.resolve(args.dir ?? "tmp/ThaqalaynData");
const repo = args.repo ?? "https://github.com/narmafraz/ThaqalaynData.git";

await mkdir(path.dirname(target), { recursive: true });

if (await exists(path.join(target, ".git"))) {
  run("git", ["-C", target, "pull", "--ff-only"]);
} else {
  run("git", ["clone", "--depth", "1", repo, target]);
}

console.log(`THAQALAYN_DATA_DIR=${target}`);
console.log(`Use: THAQALAYN_DATA_DIR=${target} npm run build:al-kafi`);

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
}

async function exists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

