import { CONTACT_EMAIL } from "astro:env/server";

// Who runs the service and how to reach them; the footer and the privacy policy read these. The contact address is
// runtime configuration (`CONTACT_EMAIL`, a Worker secret in production, `.dev.vars` locally), so it never sits in the
// repo or the bundle. Unset or blank, it is null: the footer drops its Contact link and the policy says so, which smoke
// and the release live check (both require a `mailto:` link on /privacy) report.
export const SITE_OPERATOR = "Mariusz Złotucha";

export function contactEmail(): string | null {
  const email = CONTACT_EMAIL?.trim() ?? "";
  return email.length > 0 ? email : null;
}

// The app's theme colour (manifest, `theme-color`, icon background): the light `--primary` token in
// src/styles/global.css, `oklch(0.508 0.118 165.612)`, which is exactly this value; public/favicon.svg and
// public/manifest.webmanifest repeat it. Change all of them together.
export const THEME_COLOR = "#007a55";
