// The viewer's optimistic score change, shared by separate Astro islands (each `client:*` component is its own React
// root, so React state cannot carry it from a task row to the Leaderboard card; this module is shared by the bundle).
// Keep this file free of server-only imports so it is safe to bundle for the browser.

type Listener = () => void;

/** The empty store: its initial snapshot, and the one the server (and the first client render) uses. */
export const NO_DELTAS: ReadonlyMap<string, number> = new Map();

const listeners = new Set<Listener>();
let snapshot = NO_DELTAS;

/**
 * The net score change per user id, not a log of events: an island that hydrates after a tap still sees the right
 * state. The map is replaced on every publish and never changed afterwards, which is what `useSyncExternalStore` needs.
 */
export function deltasSnapshot(): ReadonlyMap<string, number> {
  return snapshot;
}

/** Add `delta` to the user's net change (a rolled-back tick publishes the opposite). */
export function publishDelta(userId: string, delta: number): void {
  const next = new Map(snapshot);
  next.set(userId, (snapshot.get(userId) ?? 0) + delta);
  snapshot = next;
  listeners.forEach((listener) => {
    listener();
  });
}

/** Call `listener` after every publish; returns the function that stops it. */
export function subscribeDeltas(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The empty checked store: what the server (and the first client render) uses for the viewer's live grid cells. */
export const NO_CHECKED: ReadonlyMap<string, boolean> = new Map();

const checkedListeners = new Set<Listener>();
let checked = NO_CHECKED;

/** The viewer's optimistic tick per task id; replaced on every publish, like the deltas. */
export function checkedSnapshot(): ReadonlyMap<string, boolean> {
  return checked;
}

/** Record the viewer's current tick on the task (a rollback publishes the restored value). */
export function publishChecked(taskId: string, value: boolean): void {
  const next = new Map(checked);
  next.set(taskId, value);
  checked = next;
  checkedListeners.forEach((listener) => {
    listener();
  });
}

/** Call `listener` after every checked publish; returns the function that stops it. */
export function subscribeChecked(listener: Listener): () => void {
  checkedListeners.add(listener);
  return () => {
    checkedListeners.delete(listener);
  };
}
