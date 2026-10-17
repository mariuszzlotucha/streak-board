// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    // The build date: src/pages/.well-known/security.txt.ts derives its `Expires` from it.
    define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString()) },
  },
  adapter: cloudflare(),
  // Content-Security-Policy for rendered pages (Astro hashes its own scripts and styles). src/layouts/Layout.astro adds
  // the Supabase origin to form-action; src/middleware.ts sends the policy as Report-Only (CSP_MODE in
  // src/lib/security-headers.ts). CSP is not applied in `astro dev`; check it on `npm run build && npm run preview`.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "connect-src 'self'",
        "font-src 'self'",
        "manifest-src 'self'",
        "worker-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "form-action 'self' https://accounts.google.com",
        "report-uri /api/csp-report",
      ],
      scriptDirective: {
        // The `is:inline` script of src/components/site/ClearErrorParam.astro (tests/unit/csp-hash.test.ts).
        hashes: ["sha256-PaYt1NefajCcbzvWQNgfon3KXyBxogK9uFqUOGrTqvQ="],
      },
    },
  },
  // Supabase cookies (src/lib/supabase.ts) are the single session source of truth —
  // without this, the Cloudflare adapter auto-provisions a second, unused KV session store.
  session: false,
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      // Not a secret (the privacy policy publishes it), but read at runtime so the address stays out of the repo.
      CONTACT_EMAIL: envField.string({ context: "server", access: "secret", optional: true }),
      // Web Push (S-16): the VAPID key pair (base64url) and the secret that guards the reminder functions. The cron
      // reads them from the scheduled handler's env argument, not through astro:env.
      VAPID_PUBLIC_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      VAPID_PRIVATE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      REMINDER_SECRET: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
