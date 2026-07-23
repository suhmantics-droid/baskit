import { chromium } from "@playwright/test";

const [, , input, output] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setViewportSize({ width: 1320, height: 1200 });
await page.goto("file:///" + input.replace(/\\/g, "/"), { waitUntil: "networkidle" });
await page.emulateMedia({ reducedMotion: "reduce" }); // freeze the blinking cursor
// Screenshot-only fix: body{display:flex} stretches .frame to viewport height,
// so tall content overflows the pink border. Block flow lets it grow naturally.
await page.addStyleTag({
  content: `body{display:block !important;} .frame{margin:0 auto !important;}`,
});
await page.waitForTimeout(400);
await page.screenshot({ path: output, fullPage: true });
await browser.close();
console.log("wrote " + output);
