// Static check: every named import resolves to a real export in the target file.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jsDir = join(root, "js");

function walk(dir) {
  let files = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) files = files.concat(walk(p));
    else if (e.endsWith(".js")) files.push(p);
  }
  return files;
}

function getExports(src) {
  const names = new Set();
  const re = /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/g;
  let m;
  while ((m = re.exec(src))) names.add(m[1]);
  // export { a, b as c }
  const re2 = /export\s*\{([^}]+)\}/g;
  while ((m = re2.exec(src))) {
    m[1].split(",").forEach((part) => {
      const seg = part.trim();
      if (!seg) return;
      const as = seg.split(/\s+as\s+/);
      names.add((as[1] || as[0]).trim());
    });
  }
  if (/export\s+default/.test(src)) names.add("default");
  return names;
}

const files = walk(jsDir);
const exportsCache = new Map();
for (const f of files) exportsCache.set(f, getExports(readFileSync(f, "utf8")));

let problems = 0;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const importRe = /import\s*(?:\{([^}]*)\})?\s*(?:,\s*\*\s*as\s+\w+)?\s*from\s*["']([^"']+)["']/g;
  let m;
  while ((m = importRe.exec(src))) {
    const named = m[1];
    const spec = m[2];
    if (!spec.startsWith(".")) continue; // skip CDN / bare
    const target = resolve(dirname(f), spec);
    if (!exportsCache.has(target)) { console.error(`MISSING FILE: ${rel(f)} -> ${spec}`); problems++; continue; }
    if (!named) continue;
    const exp = exportsCache.get(target);
    named.split(",").forEach((part) => {
      const seg = part.trim();
      if (!seg) return;
      const orig = seg.split(/\s+as\s+/)[0].trim();
      if (orig && !exp.has(orig)) { console.error(`MISSING EXPORT: ${rel(f)} imports { ${orig} } from ${spec} — not exported`); problems++; }
    });
  }
}
function rel(p) { return p.replace(root + "/", ""); }
console.log(problems ? `\n${problems} import problem(s) found.` : "\nAll imports resolve. ✓");
process.exit(problems ? 1 : 0);
