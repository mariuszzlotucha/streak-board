import { useSyncExternalStore } from "react";
import { deltasSnapshot, NO_DELTAS, subscribeDeltas } from "@/lib/checkoff-sync";

/**
 * The viewer's optimistic score change, shared by every island on the page. The server snapshot (React also uses it
 * while hydrating) is the store's empty initial snapshot, so the first client render equals the server HTML and costs
 * no extra render; an island that hydrates after a tap picks up the net change in the render right after.
 */
export function useCheckoffDeltas(): ReadonlyMap<string, number> {
  return useSyncExternalStore(subscribeDeltas, deltasSnapshot, () => NO_DELTAS);
}
