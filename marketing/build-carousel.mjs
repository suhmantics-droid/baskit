/**
 * Renders the three carousel slides to 1080x1080 PNGs.
 *
 * Authoring in HTML and shooting with Playwright keeps the whole thing in the
 * brand's real tokens and real font, costs nothing, and re-renders in seconds
 * when a line of copy changes.
 *
 *   node marketing/build-carousel.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const OUT = `${root}marketing/out`;
mkdirSync(OUT, { recursive: true });

// Poppins is the brand pack's primary face. Google serves three subsets per
// weight; the latin one is the small file, which is all this needs.
const POPPINS = { 400: "poppins-2", 500: "poppins-5", 600: "poppins-8", 700: "poppins-11" };
const fonts = `<style>${Object.entries(POPPINS)
  .map(
    ([weight, file]) =>
      `@font-face{font-family:'Poppins';font-style:normal;font-weight:${weight};font-display:block;
        src:url(data:font/woff2;base64,${readFileSync(`${root}public/fonts/${file}.woff2`).toString("base64")}) format('woff2');}`,
  )
  .join("\n")}</style>`;

/** The mascot, same geometry the product ships. */
function mascot(mood, size, inkColour) {
  const ink = inkColour ?? "#0c1a15";
  const faces = {
    hungry:
      `<circle cx="41" cy="53" r="4" fill="${ink}"/><circle cx="59" cy="53" r="4" fill="${ink}"/>` +
      `<path d="M42 63q8 7 16 0" stroke="${ink}" stroke-width="4" stroke-linecap="round" fill="none"/>` +
      `<path d="M57 66q7 1 7.5 -7" stroke="#e0426e" stroke-width="4.6" stroke-linecap="round" fill="none"/>`,
    hello:
      `<circle cx="41" cy="53" r="4" fill="${ink}"/><circle cx="59" cy="53" r="4" fill="${ink}"/>` +
      `<path d="M43 64q7 6 14 0" stroke="${ink}" stroke-width="4" stroke-linecap="round" fill="none"/>`,
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="none">
    <path d="M35 34a15 15 0 0 1 30 0" stroke="#3fbf9f" stroke-width="5" stroke-linecap="round" fill="none"/>
    <path d="M20 36h60l-7 40a9 9 0 0 1-9 8H36a9 9 0 0 1-9-8Z" fill="#f7efdf"/>
    <path d="M20 36h60l-7 40a9 9 0 0 1-9 8H36a9 9 0 0 1-9-8Z" stroke="${ink}" stroke-width="5" stroke-linejoin="round" fill="none"/>
    <path d="M35 47l-1.5 30M50 47v30M65 47l1.5 30" stroke="${ink}" stroke-width="2.6" opacity=".2" stroke-linecap="round"/>
    ${faces[mood] ?? faces.hello}</svg>`;
}

/**
 * Sagar's supplied logo, used as the artwork itself rather than redrawn, so it
 * cannot drift from the mark he actually owns. Transparent PNG, so it sits on
 * the off-white ground with no plate behind it. Its own colours are the brand:
 * navy #122234 and mint #48b89a, both sampled from this file.
 */
const logoPng = readFileSync(`${root}public/baskit-logo.png`).toString("base64");
// The supplied file is a vertical stack (mark, wordmark, tagline) which goes
// unreadable at corner size, so the lockup shows the MARK cropped out of it and
// sets the lowercase wordmark alongside. Source is 1254 square; the mark sits
// roughly x 470-800, y 195-700.
const SRC = 1254;

/**
 * A crop of the supplied logo, no redraw.
 *
 * The artwork is navy and mint, drawn for a light background, so on the green
 * ground the navy goes muddy and the mint basket sinks into it. Rather than
 * recolour someone's logo, it sits on a white plate, which is what every brand
 * does with a light-background mark on a coloured field.
 *
 * Regions in the 1254 square source:
 *   mark  x 470-800, y 195-700
 *   full  x 180-1080, y 180-1010  (mark, wordmark and tagline together)
 */
const CROPS = {
  mark: { x: 470, y: 195, w: 330, h: 505 },
  full: { x: 180, y: 180, w: 900, h: 830 },
};
const logoCrop = (which, boxW, pad = 0) => {
  const c = CROPS[which];
  const scale = boxW / c.w;
  return `<span style="display:block;width:${Math.round(boxW)}px;height:${Math.round(c.h * scale)}px;
    background-image:url(data:image/png;base64,${logoPng});
    background-repeat:no-repeat;
    background-size:${Math.round(SRC * scale)}px ${Math.round(SRC * scale)}px;
    background-position:-${Math.round(c.x * scale)}px -${Math.round(c.y * scale)}px;
    margin:${pad}px"></span>`;
};

/**
 * The mark, with the basket's straight bar turned into a smile. Same b, same
 * basket, same proportions as the supplied logo; the one bar it already has
 * simply curves. Sagar's ask, and it costs the mark nothing.
 */
/**
 * The mark, drawn clean.
 *
 * Redrawing a supplied logo is normally the wrong call, and I made it the wrong
 * way twice. It is right here for one reason: public/baskit-logo.png carries a
 * grey smudge where the b's bowl crosses the basket, which any faithful crop
 * reproduces. The brand pack shows the two shapes overlapping cleanly, so this
 * follows the pack: navy b, mint basket, crisp intersection.
 *
 * `smile` curves the basket's bar, which is the only change from the pack.
 */
const NAVY = "#0F1D2E";
const MINT = "#2DBF9E";
const mark = (size, { ink = NAVY, basket = MINT, smile = false } = {}) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="none">
    <path d="M25 60h50l-6.5 23a7 7 0 0 1-6.7 5H38.2a7 7 0 0 1-6.7-5Z" stroke="${basket}" stroke-width="7.5" stroke-linejoin="round" fill="none"/>
    ${
      smile
        ? `<path d="M41 71q9 8 18 0" stroke="${basket}" stroke-width="7" stroke-linecap="round" fill="none"/>`
        : `<path d="M41 72h18" stroke="${basket}" stroke-width="7" stroke-linecap="round"/>`
    }
    <path d="M38 12v46" stroke="${ink}" stroke-width="8.5" stroke-linecap="round"/>
    <path d="M38 34h11a17 17 0 0 1 0 34h-3" stroke="${ink}" stroke-width="8.5" stroke-linecap="round" fill="none"/>
  </svg>`;

/** A pile of screenshots, the problem this whole thing exists for. */
const shotPile = () => {
  const shot = (x, y, rot, o) =>
    `<g transform="translate(${x} ${y}) rotate(${rot})" opacity="${o}">
      <rect width="128" height="212" rx="16" fill="#ffffff"/>
      <rect x="12" y="14" width="104" height="118" rx="9" fill="#dfeee8"/>
      <rect x="12" y="144" width="76" height="10" rx="5" fill="#c3d8d1"/>
      <rect x="12" y="162" width="52" height="10" rx="5" fill="#d7e7e1"/>
      <rect x="12" y="184" width="40" height="14" rx="7" fill="#48b89a"/>
    </g>`;
  return `<svg width="430" height="340" viewBox="0 0 430 340" fill="none">
    ${shot(26, 96, -13, 0.55)}${shot(112, 74, -6, 0.78)}${shot(206, 60, 4, 0.92)}${shot(292, 78, 12, 1)}
  </svg>`;
};

const stroke = (d, c = "#0f5f4b", w = 2.2) =>
  `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const tick = (c) =>
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg>`;

let html = readFileSync(`${root}marketing/carousel.html`, "utf8");
html = html
  .replace("<!--FONTS-->", fonts)
  // On the cream ground the body is cream too, so the outline and face must be
  // the warm ink or they vanish into it. Learned the hard way at 300px.
  .replaceAll("MARK_BIG", mark(250, { basket: "#ffffff", smile: true }))
  .replaceAll("SHOT_PILE", shotPile())
  .replaceAll("LOGO_SM", mark(46, { basket: "#ffffff" }))
  .replaceAll("TICK_DK", tick("#0F1D2E"))
  .replaceAll("ICON_LINK", stroke('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7L11.5 5"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12.5 19"/>', "#0F1D2E"))
  .replaceAll("ICON_LIST", stroke('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1.4"/><circle cx="3.5" cy="12" r="1.4"/><circle cx="3.5" cy="18" r="1.4"/>', "#0F1D2E"))
  .replaceAll("ICON_WALLET", stroke('<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/><circle cx="17" cy="14.5" r="1.4"/>', "#0F1D2E"))
  .replaceAll("ICON_TREND", stroke('<path d="M3 17l6-6 4 4 8-8"/><path d="M21 11V7h-4"/>', "#0F1D2E"))
  .replaceAll("ICON_CLOCK", stroke('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', "#0F1D2E"));

const built = `${root}marketing/carousel.built.html`;
writeFileSync(built, html, "utf8");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 2 });
await page.goto(`file:///${built.replace(/\\/g, "/")}`);
await page.waitForTimeout(1200); // let the embedded faces settle before shooting

for (const id of ["s1", "s2", "s3"]) {
  await page.locator(`#${id}`).screenshot({ path: `${OUT}/baskit-${id}.png` });
  console.log(`rendered ${OUT}/baskit-${id}.png`);
}
await browser.close();
console.log("\n3 slides at 1080x1080 (2x)");
