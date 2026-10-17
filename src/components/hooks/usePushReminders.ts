import { useEffect, useState } from "react";
import {
  browserPushEnvironment,
  detectPushState,
  disableAllPush,
  disablePush,
  enablePush,
  type PushOutcome,
  type PushState,
} from "@/lib/pwa/push";

export type PushAction = "enable" | "disable" | "disable-all";

/**
 * The reminders state of this device. The server renders `initialState`; in the browser the real state is read once,
 * unless `fixedState` pins it (the dev kitchen sink). `hasSubscriptions` starts from the server and follows the actions.
 */
export function usePushReminders({
  vapidPublicKey,
  hasSubscriptions: initialHasSubscriptions,
  fixedState,
}: {
  vapidPublicKey: string | null;
  hasSubscriptions: boolean;
  fixedState?: PushState;
}) {
  const [state, setState] = useState<PushState>(fixedState ?? (vapidPublicKey ? "off" : "unsupported"));
  const [hasSubscriptions, setHasSubscriptions] = useState(initialHasSubscriptions);
  const [pending, setPending] = useState<PushAction | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (fixedState) return;
    let active = true;
    void detectPushState(browserPushEnvironment(), vapidPublicKey).then((detected) => {
      if (active) setState(detected);
    });
    return () => {
      active = false;
    };
  }, [vapidPublicKey, fixedState]);

  async function run(action: PushAction) {
    if (pending) return;
    setPending(action);
    setFailed(false);
    const env = browserPushEnvironment();
    let outcome: PushOutcome;
    if (action === "enable") outcome = await enablePush(env, vapidPublicKey);
    else if (action === "disable") outcome = await disablePush(env);
    else outcome = await disableAllPush(env, state);
    setState(outcome.state);
    setFailed(outcome.error !== undefined);
    if (!outcome.error) {
      if (action === "enable" && outcome.state === "on") setHasSubscriptions(true);
      if (action === "disable-all") setHasSubscriptions(false);
    }
    setPending(null);
  }

  return { state, hasSubscriptions, pending, failed, run };
}
