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

test.describe("mobile (iPhone-size) — the primary surface", () => {
  // Real phone conditions: 375×812, touch (activates @media (hover: none)),
  // device-scale 3. These are the gates that caught real bugs: dropdowns
  // anchored to a wrapped header opening off-screen, and hover-only controls.
  test.use({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  });

  test("prototype: no sideways scroll, menu on-screen, add modal usable", async ({ page }) => {
    await page.goto(PROTO);

    // fresh visitor journey still works at phone size
    await page.fill("#p_name", "Mobile");
    await page.fill("#p_budget", "150");
    await page.click("#pSave");
    await page.click("#segSkip");
    await page.click("#tourSkip");

    // gate: no horizontal scroll
    const hScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hScroll, "horizontal scroll on mobile").toBe(false);

    // gate: nothing sticks out past the right edge. The page-scroll check above
    // can't see this on its own — the root clips overflow-x, so a too-wide panel
    // is silently cut off instead of scrolling (exactly how the cockpit shipped
    // broken: a bare 1fr track couldn't shrink under an un-wrappable row).
    await page.click("#empSeed"); // seed samples so the cockpit actually renders
    const clipped = await page.evaluate(() => {
      const vw = window.innerWidth;
      // Drawers and slide-in panels park off-canvas via transform until opened —
      // that's intentional, so walk up and skip anything translated aside.
      const parked = (el: HTMLElement): boolean => {
        let n: HTMLElement | null = el;
        while (n && n !== document.body) {
          const t = getComputedStyle(n).transform;
          if (t && t !== "none" && Math.abs(new DOMMatrix(t).e) > 20) return true;
          n = n.parentElement;
        }
        return false;
      };
      return Array.from(document.body.querySelectorAll<HTMLElement>("*"))
        .filter((el) => {
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.right > vw + 1 && !parked(el);
        })
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}.${el.className} → ${Math.round(el.getBoundingClientRect().right)}px`);
    });
    expect(clipped, "elements pushed past the right edge").toEqual([]);

    // gate: avatar menu opens fully on-screen (regression: it opened off-screen
    // when the wrapped header moved its anchor)
    await page.click(".avatar");
    const menu = page.locator(".menu");
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box!.x, "menu left edge").toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, "menu right edge").toBeLessThanOrEqual(376);
    await page.keyboard.press("Escape");
    await page.click("body", { position: { x: 10, y: 300 } });

    // gate: add-item modal opens and its fields are 16px+ (no iOS zoom)
    await page.click("#addBtnTop");
    await expect(page.locator("#modalWrap")).toHaveClass(/open/);
    const nameFontPx = await page
      .locator("#f_name")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(nameFontPx, "input font must be ≥16px on phones").toBeGreaterThanOrEqual(16);
  });

  test("app landing fits a phone", async ({ page }) => {
    await page.goto(APP);
    const hScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hScroll).toBe(false);
    await expect(page.getByRole("button", { name: /Sign in/ })).toBeVisible();
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
