// A chainable, thenable stand-in for the supabase-js client, scripted by results and written against the call chain
// (`from(table).select(...).eq(...).maybeSingle()`, `rpc(name, params)`), not against any route's internals. This file
// must not import tests/helpers/supabase.ts: that module registers database cleanup hooks on import.
import type { createClient } from "@/lib/supabase";

export type Supabase = NonNullable<ReturnType<typeof createClient>>;

/** The shape a route destructures from an awaited query. `data` defaults to null, `error` to null, `status` to 200. */
export interface ScriptedResult {
  data?: unknown;
  error?: { code?: string; message?: string; details?: string; hint?: string } | null;
  status?: number;
}

export interface QueryResult {
  data: unknown;
  error: ScriptedResult["error"];
  status: number;
}

export interface RecordedStep {
  method: string;
  args: unknown[];
}

/** One `from(table)` or `rpc(name)` call with the methods chained on it, in call order. */
export interface RecordedCall {
  kind: "from" | "rpc";
  name: string;
  chain: RecordedStep[];
}

export interface FakeSupabase {
  client: Supabase;
  /** Every `from` and `rpc` call, with its chain, in the order the route made them. */
  calls: RecordedCall[];
  /** Scripted results not yet consumed; negative when the route awaited more queries than were scripted. */
  remaining: () => number;
}

// Every builder method the routes and the data helpers chain; each returns the chain and records itself.
const CHAIN_METHODS = [
  "select",
  "insert",
  "upsert",
  "update",
  "delete",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "is",
  "like",
  "ilike",
  "not",
  "or",
  "filter",
  "match",
  "order",
  "limit",
  "range",
] as const;

// Each of these consumes one scripted result: a terminal call, or awaiting the chain itself.
const TERMINAL_METHODS = ["maybeSingle", "single"] as const;

type Chain = Record<string, (...args: unknown[]) => unknown> & PromiseLike<QueryResult>;

/**
 * Builds a client whose queries answer with `script`, one result per awaited query, in order. A `maybeSingle()`, a
 * `single()`, a chain awaited directly and an `rpc()` each consume one result; every other method returns the chain.
 * An await beyond the script throws (and `remaining()` goes negative), so a test can assert exact consumption.
 */
export function createFakeSupabase(script: readonly ScriptedResult[]): FakeSupabase {
  const calls: RecordedCall[] = [];
  let consumed = 0;

  function consume(call: RecordedCall): QueryResult {
    const index = consumed++;
    if (index >= script.length) {
      const chain = call.chain.map((step) => step.method).join(".");
      throw new Error(
        `fake supabase: no scripted result for query #${index + 1} (${call.kind} ${call.name}: ${chain}); ` +
          `the script has ${script.length} result(s)`,
      );
    }
    const scripted = script[index];
    return { data: scripted.data ?? null, error: scripted.error ?? null, status: scripted.status ?? 200 };
  }

  function chainFor(call: RecordedCall): Chain {
    const chain = {} as Chain;
    for (const method of CHAIN_METHODS) {
      chain[method] = (...args: unknown[]) => {
        call.chain.push({ method, args });
        return chain;
      };
    }
    for (const method of TERMINAL_METHODS) {
      chain[method] = (...args: unknown[]) => {
        call.chain.push({ method, args });
        return new Promise<QueryResult>((resolve) => {
          resolve(consume(call));
        });
      };
    }
    chain.then = <R1 = QueryResult, R2 = never>(
      onFulfilled?: ((value: QueryResult) => R1 | PromiseLike<R1>) | null,
      onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
    ): Promise<R1 | R2> =>
      new Promise<QueryResult>((resolve) => {
        resolve(consume(call));
      }).then(onFulfilled, onRejected);
    return chain;
  }

  const client = {
    from(table: string) {
      const call: RecordedCall = { kind: "from", name: table, chain: [] };
      calls.push(call);
      return chainFor(call);
    },
    rpc(name: string, ...args: unknown[]) {
      const call: RecordedCall = { kind: "rpc", name, chain: [{ method: "rpc", args }] };
      calls.push(call);
      return chainFor(call);
    },
  } as unknown as Supabase;

  return { client, calls, remaining: () => script.length - consumed };
}
