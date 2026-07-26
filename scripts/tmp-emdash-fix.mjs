/**
 * Replace em-dashes in user-facing copy. Each replacement is chosen, not
 * blanket-swapped: a dash that joins a label to its explanation becomes a
 * colon, one that separates clauses becomes a comma or a full stop, and the
 * two structural uses (a null-value placeholder, tree indentation) become an
 * en dash and a middot, which are the correct glyphs anyway.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SKIP = /node_modules|\.next|lib[\\/]generated|public[\\/]prototype\.html|[\\/]tests[\\/]|scripts[\\/]tmp-/;
const EXT = /\.(tsx?|html)$/;

/** Ordered: longest and most specific first. */
const MAP = [
  // titles and taglines
  ["Baskit — everything you want, in one place", "Baskit: everything you want, in one place"],
  ["Baskit — decide better, buy intentional", "Baskit. Decide better, buy intentional"],
  // the overclaim that survived in the app tour
  [
    "Prices are checked daily while you sleep. Real drops and target hits land in the bell — turn on notifications and they ping this device.",
    "Prices get re-checked for you. Real drops and target hits land in the bell, and if you turn on notifications they ping this device.",
  ],
  // toasts and inline copy
  ["Couldn't load your basket — refresh to retry", "Couldn't load your basket, refresh to retry"],
  ["Couldn't save that — try again", "Couldn't save that, try again"],
  ["Checked — same price as before", "Checked, same price as before"],
  ["Budget set — the plan is live", "Budget set, the plan is live"],
  ["Notifications on — price drops will ping this device", "Notifications on. Price drops will ping this device"],
  ["Copied — paste it anywhere", "Copied, paste it anywhere"],
  ["Couldn't read that photo — try a different one", "Couldn't read that photo, try a different one"],
  ["That store is slow to answer — type the p", "That store is slow to answer, type the p"],
  [") — it shows on the item card", "), it shows on the item card"],
  ["— safe in your account now", "and they are safe in your account now"],
  ["— your basket is restored ✓", ", your basket is restored ✓"],
  // decision engine
  ["Low stock — may sell out", "Low stock, may sell out"],
  ["Worth getting — the signals line up", "Worth getting, the signals line up"],
  ["Promising — just check the budget", "Promising, just check the budget"],
  ["Cool-off finished — still want it?", "Cool-off finished. Still want it?"],
  ["— a top pick", ": a top pick"],
  // menus and hints
  ["🔐 Sign in — keep your basket safe on any device", "🔐 Sign in and keep your basket safe on any device"],
  ["💷 My money — income, outgoings, what", "💷 My money: income, outgoings, what"],
  ["Nest this inside another list — e.g.", "Nest this inside another list, e.g."],
  ["Pick a few — inside each one", "Pick a few. Inside each one"],
  ["Never uploaded — nobody else can see it, including us.", "Never uploaded, so nobody else can see it, including us."],
  ["No password — we email you a link.", "No password needed, we email you a link."],
  ["Add your email to keep it — no password needed.", "Add your email to keep it, no password needed."],
  ["No segments yet — pick a few to shape your basket.", "No segments yet. Pick a few to shape your basket."],
  ["All the presets are in — type your own below.", "All the presets are in. Type your own below."],
  ["— tap one to add groups inside", ". Tap one to add groups inside"],
  ["No lists yet — create one below", "No lists yet. Create one below"],
  ["Where your saved value sits — hover a slice, click to open", "Where your saved value sits. Hover a slice, click to open"],
  ["Add items with prices — your spend map draws itself as the segments fill up.", "Add items with prices and your spend map draws itself as the segments fill up."],
  ["Tap the ♡ on any card to keep it here — favourites get a small boost in their score.", "Tap the ♡ on any card to keep it here. Favourites get a small boost in their score."],
  ["got your eye on — paste a product link", "got your eye on. Paste a product link"],
  ["⏳ Cooling off — ", "⏳ Cooling off, "],
  ["Your income and outgoings stay on this device — never uploaded.", "Your income and outgoings stay on this device, never uploaded."],
  ["— the workings stay here.", ", and the workings stay here."],
  ["Baskit</a> — your record,", "Baskit</a>: your record,"],
  ["It needs JavaScript to run — enable i", "It needs JavaScript to run, so enable i"],
  ["is a free universal wishlist with budgets", "is a free universal wishlist with budgets"], // no-op guard
  // moments
  [" — at or below your ", ", at or below your "],
  ["% — ", "%, "],
  [" — ${ctx.sale.text}", ", ${ctx.sale.text}"],
  // structural glyphs, not prose
  ['return "—"', 'return "–"'],
  ['if(v==null||v==="") return "—"', 'if(v==null||v==="") return "–"'],
  ['Array(depth+1).join("— ")', 'Array(depth+1).join("· ")'],
  ['+" — "+money(latestPrice(it),it.cur)', '+": "+money(latestPrice(it),it.cur)'],
  ["worker:check — not implemented yet", "worker:check is not implemented yet"],
];

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

let changedFiles = 0;
let changes = 0;
for (const file of walk(ROOT)) {
  const before = readFileSync(file, "utf8");
  let after = before;
  for (const [from, to] of MAP) {
    if (from === to) continue;
    let idx = after.indexOf(from);
    while (idx !== -1) {
      after = after.slice(0, idx) + to + after.slice(idx + from.length);
      changes++;
      idx = after.indexOf(from, idx + to.length);
    }
  }
  if (after !== before) {
    writeFileSync(file, after, "utf8");
    changedFiles++;
    console.log("updated " + relative(ROOT, file));
  }
}
console.log(`\n${changes} replacements across ${changedFiles} files`);
