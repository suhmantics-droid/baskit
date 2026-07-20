import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke suite (docs/09). Runs against the LIVE surfaces by default — the
 * prototype's flows live entirely in browser storage, so production runs are
 * side-effect-free. Override with BASE_PROTO / BASE_APP for local servers.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  retries: 1,
  use: { ...devices["Desktop Chrome"] },
});
