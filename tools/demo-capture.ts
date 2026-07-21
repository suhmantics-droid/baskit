/**
 * Captures the demo assets from the LIVE prototype, shot on a PHONE — that's
 * where testers actually use Baskit, so a desktop reel misrepresents it.
 * Includes a real product fetch (a genuine store read, not a mock) because
 * that's the moment that sells the product.
 *
 * Run: npx tsx tools/demo-capture.ts
 * Writes: public/demo/f1..f7.png + baskit-demo.webm
 */
import { chromium, devices } from "@playwright/test";
import { mkdirSync, renameSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const OUT = join(__dirname, "..", "public", "demo");
const SITE = process.env.BASE_PROTO ?? "https://baskit.suhmantics.com";
/** Fast, reliable UK retailer — the fetch has to land inside the recording. */
const DEMO_URL = "https://www.riverisland.com/p/blue-pleat-front-denim-dress-940801";

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...devices["iPhone 13"],
    colorScheme: "dark",
    recordVideo: { dir: OUT, size: { width: 390, height: 844 } },
  });
  const page = await ctx.newPage();
  const shot = (name: string) => page.screenshot({ path: join(OUT, name) });
  const pause = (ms: number) => page.waitForTimeout(ms);

  await page.goto(SITE);
  await pause(1400);

  // 1 · a real first run, typed at human speed
  await page.fill("#p_name", "Priya");
  await pause(500);
  await page.fill("#p_budget", "400");
  await pause(700);
  await shot("f1-start.png");
  await page.click("#pSave");
  await pause(900);

  // 2 · pick what you're planning for
  for (const label of ["Christmas", "Birthdays", "Kids"]) {
    await page.locator("#segChips .pchip", { hasText: label }).first().click();
    await pause(350);
  }
  await shot("f2-segments.png");
  await page.click("#segSave");
  await pause(900);

  // skip the tour — the reel is the tour
  await page.click("#tourSkip").catch(() => {});
  await pause(700);

  // 3 · samples first, so there's a basket to look at (the button only exists
  //     while the basket is empty — adding an item removes it)
  await page.click("#empSeed");
  await pause(1500);

  // 4 · then paste a real link and let the store answer for itself
  await page.click("#addBtnTop");
  await pause(700);
  await page.fill("#f_url", DEMO_URL);
  await pause(600);
  await page.click("#fetchBtn");
  await page.waitForFunction(
    () => (document.getElementById("f_price") as HTMLInputElement)?.value !== "",
    null,
    { timeout: 20_000 },
  );
  await pause(1000);
  await shot("f3-fetch.png");
  await page.click("#saveBtn");
  await pause(1400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await pause(800);
  await shot("f4-dashboard.png");

  // 5 · the month plan
  await page.locator("#planWrap").scrollIntoViewIfNeeded();
  await pause(1500);
  await shot("f5-plan.png");

  // 6 · where the money sits
  await page.locator("#segDash").scrollIntoViewIfNeeded();
  await pause(1500);
  await shot("f6-spendmap.png");

  // 7 · the verdict, in full
  await page.locator("#gridWrap").scrollIntoViewIfNeeded();
  await pause(1000);
  await page.locator(".card", { hasText: "Sony WH-1000XM6" }).first().click();
  await pause(1700);
  await shot("f7-detail.png");
  await pause(1200);

  await ctx.close();
  await browser.close();

  for (const f of readdirSync(OUT)) {
    if (f.endsWith(".webm") && f !== "baskit-demo.webm") {
      rmSync(join(OUT, "baskit-demo.webm"), { force: true });
      renameSync(join(OUT, f), join(OUT, "baskit-demo.webm"));
      break;
    }
  }
  console.log("captured:", readdirSync(OUT).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
