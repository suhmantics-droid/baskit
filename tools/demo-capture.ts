/**
 * Captures the demo assets: drives the LIVE prototype like a first-time user
 * (dark mode, human pacing), saving key frames + a webm screen recording into
 * deploy-prototype/demo/. Run: npx tsx tools/demo-capture.ts
 */
import { chromium } from "@playwright/test";
import { mkdirSync, renameSync, readdirSync } from "node:fs";
import { join } from "node:path";

const OUT = join(__dirname, "..", "deploy-prototype", "demo");
const SITE = process.env.BASE_PROTO ?? "https://baskit.suhmantics.com";

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: "dark",
    recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
  });
  const page = await ctx.newPage();
  const shot = (name: string) => page.screenshot({ path: join(OUT, name) });
  const pause = (ms: number) => page.waitForTimeout(ms);

  await page.goto(SITE);
  await pause(1200);

  // first-run: profile
  await page.fill("#p_name", "Alex");
  await pause(400);
  await page.fill("#p_budget", "250");
  await pause(600);
  await page.click("#pSave");
  await pause(900);

  // segments: accept the preselected four
  await page.click("#segSave");
  await pause(900);

  // tour: read each slide briefly
  for (let i = 0; i < 3; i++) {
    await pause(1400);
    await page.click("#tourNext");
  }
  await pause(600);

  // samples in
  await page.click("#empSeed");
  await pause(1600);
  await shot("f1-dashboard.png");

  // cockpit
  await page.locator("#planWrap").scrollIntoViewIfNeeded();
  await pause(1400);
  await shot("f2-plan.png");

  // spend map + segments
  await page.locator("#segDash").scrollIntoViewIfNeeded();
  await pause(1500);
  await shot("f3-spendmap.png");

  // the grid with verdicts
  await page.locator("#gridWrap").scrollIntoViewIfNeeded();
  await pause(1400);
  await shot("f4-grid.png");

  // detail panel: score ring + sparkline (headphones have history)
  await page.locator(".card", { hasText: "Sony WH-1000XM6" }).first().click();
  await pause(1600);
  await shot("f5-detail.png");
  await page.click("#panelClose");
  await pause(600);

  // purchases ledger
  await page.click('#sidebar .side-item[data-list="__bought"]');
  await pause(1400);
  await shot("f6-purchases.png");
  await pause(1200);

  await ctx.close();
  await browser.close();

  // the recording lands with a random name; claim it
  const webm = readdirSync(OUT).find((f) => f.endsWith(".webm") && f !== "baskit-demo.webm");
  if (webm) renameSync(join(OUT, webm), join(OUT, "baskit-demo.webm"));
  console.log("captured:", readdirSync(OUT).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
