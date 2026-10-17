// Renders the PWA icons in public/icons/ from the brand source public/favicon.svg. Run by hand after the mark changes,
// and commit the output:
//
//   node scripts/pwa-icons.mjs
//
// sharp is not a direct dependency (Astro pulls it in); if it is missing, run `npx --yes -p sharp node scripts/pwa-icons.mjs`.
// The background is the brand colour #007a55, the light `--primary` token in src/styles/global.css.
import { Buffer } from "node:buffer";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "icons");
const BRAND = "#007a55";
const source = await readFile(path.join(ROOT, "public", "favicon.svg"), "utf8");
// The flame path alone, so full-bleed icons can place it on their own background.
const flame = source.match(/<path[\s\S]*?\/>/)[0].replace(/transform="[^"]*"/, "");

/** The flame (24×24 Lucide grid) scaled to `ratio` of the side, centred on a full square of the brand colour. */
function fullBleed(side, ratio) {
  const scale = (side * ratio) / 24;
  const offset = (side - 24 * scale) / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}">` +
      `<rect width="${side}" height="${side}" fill="${BRAND}"/>` +
      `<g transform="translate(${offset} ${offset}) scale(${scale})">${flame}</g></svg>`,
  );
}

async function render(svg, side, file, { opaque = false } = {}) {
  const image = sharp(svg, { density: 72 * Math.max(1, side / 32) }).resize(side, side);
  await (opaque ? image.removeAlpha() : image).png().toFile(path.join(OUT, file));
  console.log(`${file} ${side}x${side}`);
}

await mkdir(OUT, { recursive: true });
// "any" icons: the favicon itself (rounded square, transparent corners).
await render(Buffer.from(source), 192, "icon-192.png");
await render(Buffer.from(source), 512, "icon-512.png");
// Maskable: full background, flame inside the 80% safe zone (here 50% of the side).
await render(fullBleed(512, 0.5), 512, "icon-maskable-512.png");
// iOS: full background with no transparency; iOS rounds the corners itself.
await render(fullBleed(180, 0.6), 180, "apple-touch-icon.png", { opaque: true });
