/**
 * Oracle for the shared delta store (S-04, Phase 5): the viewer's optimistic score change, shared by separate Astro
 * islands (the control in a task row and the Leaderboard card are different React roots).
 *
 * Every expected value is derived by hand from the plan (context/changes/checkoff-and-leaderboard/plan.md, Phase 5 §1):
 *   - the store keeps the NET delta per user id, not a log of events, so an island that hydrates late sees the right state
 *   - a tick publishes +1 and its rollback publishes -1, so the net is back to 0
 *   - the snapshot is an immutable map that is replaced on every publish and is the same object until the next one
 *     (what `useSyncExternalStore` needs to avoid needless renders)
 *
 * The store is module-level state, so every test loads a fresh copy of the module.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Store = typeof import("@/lib/checkoff-sync");

let store: Store;

beforeEach(async () => {
  vi.resetModules();
  store = await import("@/lib/checkoff-sync");
});

describe("checkoff-sync", () => {
  it("starts empty and accumulates the net delta per user", () => {
    expect(store.deltasSnapshot().size).toBe(0);

    store.publishDelta("u1", 1);
    store.publishDelta("u1", 1);
    store.publishDelta("u2", -1);

    expect(store.deltasSnapshot().get("u1")).toBe(2);
    expect(store.deltasSnapshot().get("u2")).toBe(-1);
    expect(store.deltasSnapshot().get("u3")).toBeUndefined();
  });

  it("returns the net delta to zero when a rollback publishes the opposite", () => {
    store.publishDelta("u1", 1);
    store.publishDelta("u1", -1);

    expect(store.deltasSnapshot().get("u1") ?? 0).toBe(0);
  });

  it("shows the net value to a subscriber that arrives after a publish, and notifies it of later ones", () => {
    store.publishDelta("u1", 1);
    const listener = vi.fn();

    const unsubscribe = store.subscribeDeltas(listener);
    expect(store.deltasSnapshot().get("u1")).toBe(1);
    expect(listener).not.toHaveBeenCalled();

    store.publishDelta("u1", 1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.deltasSnapshot().get("u1")).toBe(2);

    unsubscribe();
    store.publishDelta("u1", -1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("changes the snapshot's identity only on a publish and never changes a snapshot already handed out", () => {
    const before = store.deltasSnapshot();
    expect(store.deltasSnapshot()).toBe(before);

    store.publishDelta("u1", 1);
    const after = store.deltasSnapshot();

    expect(after).not.toBe(before);
    expect(store.deltasSnapshot()).toBe(after);
    expect(before.get("u1")).toBeUndefined();
    expect(after.get("u1")).toBe(1);
  });
});
