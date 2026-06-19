// Simple syntax checker: parses every .js file under js/ as an ES module.
// Usage: node tools/check.js
import { readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jsDir = join(root, "js");

function walk(dir) {
  let files = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) files = files.concat(walk(p));
    else if (entry.endsWith(".js")) files.push(p);
  }
  return files;
}

const files = walk(jsDir);
let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: "pipe", env: { ...process.env, NODE_OPTIONS: "" } });
    console.log("ok   " + f.replace(root + "/", ""));
  } catch (e) {
    failed++;
    console.error("FAIL " + f.replace(root + "/", ""));
    console.error((e.stderr || e.stdout || e).toString());
  }
}
console.log(`\n${files.length - failed}/${files.length} files passed syntax check.`);
process.exit(failed ? 1 : 0);
