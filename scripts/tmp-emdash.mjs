/**
 * List em-dashes that sit in USER-FACING copy, ignoring code comments.
 * Heuristic: drop the line if the dash falls inside a // or * comment;
 * keep it if it is inside a quoted string or JSX text.
 */
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

let total = 0;
for (const file of walk(ROOT)) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    const at = line.indexOf(DASH);
    if (at === -1) return;
    const before = line.slice(0, at);
    // inside a // comment, or a /** JSDoc */ continuation line
    const inLineComment = /\/\//.test(before) && !/["'`].*\/\//.test(before);
    const inBlockComment = /^\s*(\*|\/\*)/.test(line);
    if (inLineComment || inBlockComment) return;
    total++;
    console.log(`${relative(ROOT, file)}:${i + 1}  ${line.trim().slice(0, 150)}`);
  });
}
console.log(`\nuser-facing em-dashes: ${total}`);
