import { useSyncExternalStore } from "react";
import { checkedSnapshot, NO_CHECKED, subscribeChecked } from "@/lib/checkoff-sync";

/**
 * The viewer's optimistic tick per task id, shared by every island on the page. The server snapshot (also used while
 * hydrating) is the empty store, so the first client render equals the server HTML.
 */
export function useCheckedTasks(): ReadonlyMap<string, boolean> {
  return useSyncExternalStore(subscribeChecked, checkedSnapshot, () => NO_CHECKED);
}
