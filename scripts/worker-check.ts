/**
 * Local price-check worker entry point (placeholder).
 *
 * The real implementation lands with backlog ticket E3-5: select "due" items
 * (tiered — hot daily, warm every 3 days, cold weekly), run the extraction
 * pipeline (docs/05), write PricePoints, update Item.price, and emit deduped
 * Moment candidates via lib/moments.ts. For now this just documents the entry
 * point so `npm run worker:check` resolves.
 */
async function main() {
  console.log("worker:check is not implemented yet (see backlog E3-5 / docs/05).");
}

main();
