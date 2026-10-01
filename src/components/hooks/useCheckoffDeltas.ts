import { useSyncExternalStore } from "react";
import { deltasSnapshot, subscribeDeltas } from "@/lib/checkoff-sync";

const NO_DELTAS: ReadonlyMap<string, number> = new Map();

/**
 * The viewer's optimistic score change, shared by every island on the page. The server snapshot (React also uses it
 * while hydrating) is empty, so the first client render equals the server HTML; an island that hydrates after a tap
 * picks up the net change in the render right after.
 */
export function useCheckoffDeltas(): ReadonlyMap<string, number> {
  return useSyncExternalStore(subscribeDeltas, deltasSnapshot, () => NO_DELTAS);
}
