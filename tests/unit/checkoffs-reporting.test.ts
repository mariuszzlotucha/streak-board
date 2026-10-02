import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { checkOff, uncheck } from "@/lib/checkoffs";
import type { createClient } from "@/lib/supabase";
import type { GroupTask } from "@/lib/tasks";

type Supabase = NonNullable<ReturnType<typeof createClient>>;
interface Result {
  data?: unknown[] | null;
  error: { code?: string; message?: string } | null;
  status: number;
}

// A chainable stand-in for the two query shapes the library uses: `insert(...)` resolves directly, and
// `delete().eq()...select()` resolves at `select`.
function fakeSupabase(result: Result): Supabase {
  const chain: Record<string, unknown> = {};
  for (const method of ["delete", "eq", "gte", "lte"]) chain[method] = () => chain;
  chain.select = () => Promise.resolve(result);
  chain.insert = () => Promise.resolve(result);
  return { from: () => chain } as unknown as Supabase;
}

const task: GroupTask = { id: "task-1", title: "Run", recurrence: "daily", created_by: "u-owner" };
const now = new Date("2026-10-02T10:00:00Z");

let errorSpy: MockInstance<typeof console.error>;
let infoSpy: MockInstance<typeof console.info>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("checkOff reporting", () => {
  it("answers forbidden and logs one error with code, status and ids for 42501", async () => {
    const outcome = await checkOff(
      fakeSupabase({ error: { code: "42501", message: "denied" }, status: 403 }),
      "u1",
      task,
      now,
    );

    expect(outcome).toEqual({ kind: "forbidden" });
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({
      level: "error",
      event: "checkoff.forbidden",
      userId: "u1",
      taskId: "task-1",
      status: 403,
      error: { code: "42501" },
    });
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("answers forbidden and logs an info line for 23503", async () => {
    const outcome = await checkOff(fakeSupabase({ error: { code: "23503" }, status: 409 }), "u1", task, now);

    expect(outcome).toEqual({ kind: "forbidden" });
    expect(infoSpy).toHaveBeenCalledOnce();
    expect(infoSpy.mock.calls[0][0]).toMatchObject({ event: "checkoff.not_enrolled", userId: "u1", taskId: "task-1" });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("stays silent and answers ok for an already ticked period (23505)", async () => {
    const outcome = await checkOff(fakeSupabase({ error: { code: "23505" }, status: 409 }), "u1", task, now);

    expect(outcome).toEqual({ kind: "ok", period: "2026-10-02" });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("returns unknown without output for any other code (the route reports it)", async () => {
    const error = { code: "XX000", message: "boom" };
    const outcome = await checkOff(fakeSupabase({ error, status: 500 }), "u1", task, now);

    expect(outcome).toEqual({ kind: "unknown", error });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });
});

describe("uncheck reporting", () => {
  it("logs uncheck.forbidden as an error for 42501", async () => {
    const outcome = await uncheck(fakeSupabase({ error: { code: "42501" }, status: 403 }), "u1", task, now);

    expect(outcome).toEqual({ kind: "forbidden" });
    expect(errorSpy.mock.calls[0][0]).toMatchObject({ event: "uncheck.forbidden", status: 403, taskId: "task-1" });
  });

  it("logs uncheck.not_enrolled as info for 23503", async () => {
    const outcome = await uncheck(fakeSupabase({ error: { code: "23503" }, status: 409 }), "u1", task, now);

    expect(outcome).toEqual({ kind: "forbidden" });
    expect(infoSpy.mock.calls[0][0]).toMatchObject({ event: "uncheck.not_enrolled" });
  });

  it("answers ok and logs uncheck.nothing_removed when the delete removes zero rows", async () => {
    const outcome = await uncheck(fakeSupabase({ data: [], error: null, status: 200 }), "u1", task, now);

    expect(outcome).toEqual({ kind: "ok", period: "2026-10-02" });
    expect(infoSpy).toHaveBeenCalledOnce();
    expect(infoSpy.mock.calls[0][0]).toMatchObject({
      event: "uncheck.nothing_removed",
      userId: "u1",
      taskId: "task-1",
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("answers ok without output when rows were removed", async () => {
    const outcome = await uncheck(
      fakeSupabase({ data: [{ period: "2026-10-02" }], error: null, status: 200 }),
      "u1",
      task,
      now,
    );

    expect(outcome).toEqual({ kind: "ok", period: "2026-10-02" });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });
});
