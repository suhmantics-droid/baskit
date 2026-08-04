# Baskit brand

From the Baskit Brand Pack sheet. These are the authority; the product CSS has
drifted from them and should be brought back over time.

## Colour

| Role | Hex | RGB | Pantone |
|---|---|---|---|
| Primary navy | `#0F1D2E` | 15, 29, 46 | 2965 C |
| Primary mint | `#2DBF9E` | 45, 191, 158 | 3252 C |
| White | `#FFFFFF` | 255, 255, 255 | |

Two supporting neutrals, added 4 Aug from a web mockup that extended the pack
sensibly: `#E6F7F2` mint tint for icon plates and quiet panels, and `#F5F7FA`
cool grey for page grounds and card separation.

There is no other green. Deep pine and forest greens are off-brand.

Mint carries navy type well (about 7:1) but not white (about 2.2:1), so on a
mint ground the words are navy and white is for panels. Navy grounds take white
type and mint accents, which is the pack's own reversed treatment.

## Type

- Primary **Poppins** — Bold, Semibold, Regular
- Secondary **Inter** — Regular, Medium
- Web-safe fallbacks: Montserrat, Lato, Open Sans, then Roboto, Arial, Helvetica

Poppins latin subsets are vendored at `public/fonts/poppins-{2,5,8,11}.woff2`
for weights 400, 500, 600, 700.

## Logo

`Baskit_Logo.png` is the supplied artwork: transparent, 1254px square, stacked
mark over lowercase wordmark over the tagline "Decide better. Buy intentional."

**Known defect.** Both supplied PNGs carry a grey smudge where the `b`'s bowl
crosses the basket's left rim, the two shapes blended rather than cleanly
overlapping. The brand sheet shows them crisp, so this is a fault in the raster
export rather than the design. Any faithful crop reproduces the smudge, which is
why `marketing/build-carousel.mjs` draws the mark as vector instead, following
the sheet.

The pack lists SVG, PDF, EPS and AI among its formats. **Getting the SVG removes
the need to redraw anything**, and is worth doing before this mark is used
anywhere at size.

## Usage

Do not stretch, recolour, add effects to, or rearrange the elements. Minimum
size 30px on screen, 10mm in print. A white reversed variant exists for dark
grounds, so the mark never needs a white plate behind it.
