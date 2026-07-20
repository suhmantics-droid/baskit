import { test, expect } from "@playwright/test";

const PROTO = process.env.BASE_PROTO ?? "https://baskit.suhmantics.com";
const APP = process.env.BASE_APP ?? "https://baskit-app-eta.vercel.app";

test.describe("prototype (tester surface)", () => {
  test("first-run journey: profile → segments → tour → samples → cockpit", async ({ page }) => {
    await page.goto(PROTO);
    await expect(page).toHaveTitle(/Baskit/);

    // fresh profile
    await page.fill("#p_name", "E2E");
    await page.fill("#p_budget", "200");
    await page.click("#pSave");

    // segment picker appears with presets; skip it
    await expect(page.locator("#segWrap")).toHaveClass(/open/);
    await expect(page.locator("#segChips .pchip").first()).toBeVisible();
    await page.click("#segSkip");

    // first-run tour fires once
    await expect(page.locator("#tourWrap")).toHaveClass(/open/);
    await expect(page.locator("#tourTitle")).toHaveText(/Save from any store/);
    await page.click("#tourNext");
    await page.click("#tourNext");
    await page.click("#tourNext"); // "Start planning"
    await expect(page.locator("#tourWrap")).not.toHaveClass(/open/);

    // samples light up the cockpit
    await page.click("#empSeed");
    await expect(page.locator("#planWrap .chartbox h4").first()).toContainText("plan");
    await expect(page.locator(".bn-row").first()).toBeVisible();
    await expect(page.locator("#segDash .dseg").first()).toBeVisible();

    // ledger view works
    await page.click('#sidebar .side-item[data-list="__bought"]');
    await expect(page.locator("#listHeader")).toContainText("Purchases");
  });

  test("privacy and terms pages are live", async ({ page }) => {
    for (const path of ["/privacy.html", "/terms.html"]) {
      const res = await page.goto(PROTO + path);
      expect(res?.status()).toBe(200);
    }
    await expect(page.locator("h1")).toContainText(/Terms/);
  });
});

test.describe("app (accounts)", () => {
  test("landing offers sign-in and the API refuses strangers", async ({ page, request }) => {
    await page.goto(APP);
    await expect(page.getByRole("button", { name: /Sign in \/ create your basket/ })).toBeVisible();
    for (const path of ["/api/me", "/api/items", "/api/lists"]) {
      const res = await request.get(APP + path);
      expect(res.status(), path).toBe(401);
    }
  });

  test("unknown share links 404", async ({ request }) => {
    const res = await request.get(`${APP}/s/not-a-real-token`);
    expect(res.status()).toBe(404);
  });
});
