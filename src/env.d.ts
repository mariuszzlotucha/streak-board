declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    /** The signed-in user's own nickname, read by the middleware on protected paths; null elsewhere or when unset. */
    nickname: string | null;
  }
}

// Only what `src/lib/sentry.ts` reads; the repo has no `@cloudflare/workers-types`.
declare module "cloudflare:workers" {
  export const env: import("./lib/sentry-options").SentryEnv;
}
