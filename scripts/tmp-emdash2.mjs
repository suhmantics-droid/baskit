import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
const ROOT = process.cwd();
const DASH = "—";
const SKIP = /node_modules|\.next|lib[\\/]generated|public[\\/]prototype\.html|[\\/]tests[\\/]|scripts[\\/]tmp-/;
const EXT = /\.(tsx?|html)$/;
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (SKIP.test(p)) continue;
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (EXT.test(p)) out.push(p);
  }
  return out;
}
for (const file of walk(ROOT)) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/^\s*(\*|\/\*)/.test(line)) return;
    let idx = line.indexOf(DASH);
    while (idx !== -1) {
      const before = line.slice(0, idx);
      if (!(/\/\//.test(before) && !/["'`].*\/\//.test(before))) {
        console.log(`${relative(ROOT, file)}:${i + 1}  …${line.slice(Math.max(0, idx - 70), idx + 70)}…`);
      }
      idx = line.indexOf(DASH, idx + 1);
    }
  });
}
