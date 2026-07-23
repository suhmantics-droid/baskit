import { chromium } from "@playwright/test";
const [, , input] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.setViewportSize({ width: 1320, height: 1200 });
await page.goto("file:///" + input.replace(/\\/g, "/"), { waitUntil: "networkidle" });
const d = await page.evaluate(() => {
  const f = document.querySelector(".frame").getBoundingClientRect();
  const w = document.querySelector(".win").getBoundingClientRect();
  const doc = document.querySelector(".doc").getBoundingClientRect();
  return {
    bodyScrollH: document.body.scrollHeight,
    bodyScrollW: document.body.scrollWidth,
    docEl_scrollH: document.documentElement.scrollHeight,
    frame: { h: Math.round(f.height), w: Math.round(f.width), top: Math.round(f.top) },
    win: { h: Math.round(w.height) },
    doc: { h: Math.round(doc.height) },
  };
});
console.log(JSON.stringify(d, null, 2));
await browser.close();
