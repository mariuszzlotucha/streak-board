declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    /** The signed-in user's own nickname, read by the middleware on protected paths; null elsewhere or when unset. */
    nickname: string | null;
  }
}

// Only what `src/lib/sentry.ts` and `src/worker.ts` use; the repo has no `@cloudflare/workers-types`.
declare module "cloudflare:workers" {
  export const env: import("./lib/sentry-options").SentryEnv;
  export abstract class WorkerEntrypoint<Env = unknown> {
    protected env: Env;
    protected ctx: unknown;
    constructor(ctx: unknown, env: Env);
  }
}

/** The build's ISO date, from `vite.define` in astro.config.mjs; undefined under Vitest. */
declare const __BUILD_DATE__: string;
