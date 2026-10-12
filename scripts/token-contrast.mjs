// Token contrast gate: recomputes the WCAG contrast of the design-token pairs the UI relies on, from the `:root` values
// in src/styles/global.css, and exits 1 when a gating pair is below its threshold. Zero dependencies on purpose.
// Run: node scripts/token-contrast.mjs (CI runs it in the `ci` job, right after lint).
//
// Method (the one the S-11 `dashboard-ui` research used): OKLCH -> OKLab -> linear sRGB with Ottosson's matrices,
// clipped to the sRGB gamut; a colour with alpha is composited over its background in gamma-encoded sRGB, as browsers
// blend; relative luminance 0.2126 R + 0.7152 G + 0.0722 B; contrast (L1 + 0.05) / (L2 + 0.05).

import { readFileSync } from "node:fs";
import { URL } from "node:url";

const CSS_PATH = new URL("../src/styles/global.css", import.meta.url);

// [label, foreground, background, threshold, gating]. A colour is `token` or `token/alpha` (alpha in percent), and a
// background with alpha is composited over the card, the surface every dashboard pair sits on.
const PAIRS = [
  ["ring on card", "ring", "card", 3, true],
  ["ring on muted", "ring", "muted", 3, true],
  ["ring on its own 50 % halo", "ring", "ring/50", 3, true],
  ["destructive on card", "destructive", "card", 4.5, true],
  ["destructive on its 10 % tint", "destructive", "destructive/10", 4.5, true],
  ["destructive on its 20 % tint (hover)", "destructive", "destructive/20", 4.5, true],
  ["muted-foreground on muted", "muted-foreground", "muted", 4.5, true],
  ["muted-foreground on card", "muted-foreground", "card", 4.5, true],
  ["success on card", "success", "card", 4.5, true],
  ["success on its 10 % tint", "success", "success/10", 4.5, true],
  ["success-foreground on success", "success-foreground", "success", 4.5, true],
  ["warning on card", "warning", "card", 4.5, true],
  ["warning at 90 % on card", "warning/90", "card", 4.5, true],
  ["warning-foreground on warning", "warning-foreground", "warning", 4.5, true],
  ["primary-foreground on primary", "primary-foreground", "primary", 4.5, true],
  ["secondary-foreground on secondary", "secondary-foreground", "secondary", 4.5, true],
  ["foreground on card", "foreground", "card", 4.5, true],
  // Deferred D6 of `dashboard-ui`: `hover:bg-primary/80` in ui/button.tsx. Reported, never gating.
  ["primary-foreground on the 80 % hover tint (D6)", "primary-foreground", "primary/80", 4.5, false],
];

/** The `--name: oklch(L C H [/ A])` declarations of the first `:root` block, as { name: [L, C, H, alpha] }. */
function rootTokens(css) {
  const block = css.match(/:root\s*\{([^}]*)\}/)?.[1];
  if (!block) throw new Error("no :root block in src/styles/global.css");
  const tokens = {};
  const declaration = /--([\w-]+):\s*oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?))?\s*\)/g;
  for (const [, name, l, c, h, a] of block.matchAll(declaration)) {
    const lightness = l.endsWith("%") ? Number(l.slice(0, -1)) / 100 : Number(l);
    const alpha = a === undefined ? 1 : a.endsWith("%") ? Number(a.slice(0, -1)) / 100 : Number(a);
    tokens[name] = [lightness, Number(c), Number(h), alpha];
  }
  return tokens;
}

const encode = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const decode = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const clip = (v) => Math.min(1, Math.max(0, v));

/** OKLCH to gamma-encoded sRGB in [0, 1] (Ottosson's OKLab matrices, gamut clipped per channel). */
function oklchToSrgb([l, c, h]) {
  const hue = (h * Math.PI) / 180;
  const a = c * Math.cos(hue);
  const b = c * Math.sin(hue);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return linear.map((v) => encode(clip(v)));
}

/** A `token` or `token/alpha` reference, composited over `under` (gamma-encoded sRGB) when it is not opaque. */
function resolve(tokens, ref, under) {
  const [name, percent] = ref.split("/");
  const token = tokens[name];
  if (!token) throw new Error(`token --${name} not found in :root`);
  const alpha = token[3] * (percent === undefined ? 1 : Number(percent) / 100);
  const rgb = oklchToSrgb(token);
  if (alpha >= 1) return rgb;
  if (!under) throw new Error(`${ref} has alpha but nothing to composite over`);
  return rgb.map((v, i) => alpha * v + (1 - alpha) * under[i]);
}

function luminance(rgb) {
  const [r, g, b] = rgb.map(decode);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const tokens = rootTokens(readFileSync(CSS_PATH, "utf8"));
const card = resolve(tokens, "card");
let failed = 0;
for (const [label, fgRef, bgRef, threshold, gating] of PAIRS) {
  const background = resolve(tokens, bgRef, card);
  const foreground = resolve(tokens, fgRef, background);
  const ratio = contrast(foreground, background);
  const pass = ratio >= threshold;
  if (gating && !pass) failed++;
  const status = gating ? (pass ? "PASS" : "FAIL") : "INFO";
  console.log(`${status}  ${label}: ${ratio.toFixed(2)}:1 (threshold ${threshold}:1${gating ? "" : ", not gating"})`);
}

console.log(failed ? `\n${failed} gating pair(s) below threshold` : "\nAll gating pairs pass");
process.exit(failed ? 1 : 0);
