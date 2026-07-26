/** Second pass: the remaining user-facing em-dashes, each replaced in context. */
import { readFileSync, writeFileSync } from "node:fs";

const EDITS = [
  [
    "app/components/budget-view.tsx",
    [
      ["Nothing left after outgoings — adjust the numbers first", "Nothing left after outgoings, adjust the numbers first"],
      ["Never uploaded — not even to your account.", "Never uploaded, not even to your account."],
    ],
  ],
  [
    "prototype/basket-prototype.html",
    [
      ["Auto price-check on — runs when you open Baskit", "Auto price-check on, it runs when you open Baskit"],
      [
        "Tap the ♡ on any card to keep it here — favourites get a small boost in their decision score.",
        "Tap the ♡ on any card to keep it here. Favourites get a small boost in their decision score.",
      ],
      ["' — <span style=\"color:var(--bad)\">'+money(childCaps-cap)+' over-allocated</span>'", "', <span style=\"color:var(--bad)\">'+money(childCaps-cap)+' over-allocated</span>'"],
      ["(' — '+money(cap-childCaps)+' still to allocate')", "(', '+money(cap-childCaps)+' still to allocate')"],
      ["Add rent, bills, subscriptions — the fixed stuff.", "Add rent, bills, subscriptions. The fixed stuff."],
      ["+\" — the plan is live\"", "+\", the plan is live\""],
      ["work it out from your income</a> — that stays on this device only.", "work it out from your income</a>. That stays on this device only."],
      ["No change — still ", "No change, still "],
      ["Couldn't read the price — try the bookmarklet on the page", "Couldn't read the price, try the bookmarklet on the page"],
      ["(over?' — '+money(wantVal-budget)+' over':' — '+money(budget-wantVal)+' left')", "(over?', '+money(wantVal-budget)+' over':', '+money(budget-wantVal)+' left')"],
      [
        "click it to drop the item — name, link, price and image — straight into your basket.",
        "click it to drop the item, name, link, price and image, straight into your basket.",
      ],
      ["Export a backup here — and if you make a free account", "Export a backup here, and if you make a free account"],
      ["Couldn't read that link — add the details and it still works", "Couldn't read that link, add the details and it still works"],
      [
        "can’t catch item-specific discounts — reliable, scheduled checks need the backend.",
        "can’t catch item-specific discounts. Reliable, scheduled checks need the backend.",
      ],
      ["+' — <a id=\"viewSales\">view sales</a>", "+', <a id=\"viewSales\">view sales</a>"],
    ],
  ],
];

let n = 0;
for (const [file, pairs] of EDITS) {
  let t = readFileSync(file, "utf8");
  for (const [from, to] of pairs) {
    if (!t.includes(from)) {
      console.log("  MISS  " + file + "  :: " + from.slice(0, 60));
      continue;
    }
    t = t.split(from).join(to);
    n++;
  }
  writeFileSync(file, t, "utf8");
  console.log("updated " + file);
}
console.log(`\n${n} replacements`);
