import { Button } from "@/components/ui/button";
import { usePushReminders } from "@/components/hooks/usePushReminders";
import type { PushState } from "@/lib/pwa/push";

interface RemindersToggleProps {
  /** The server's VAPID public key; null renders the unsupported state. */
  vapidPublicKey: string | null;
  /** The caller has a subscription on some device (read by `loadSettings`). */
  hasSubscriptions: boolean;
  /** The dev kitchen sink pins a state; the real page reads it from the browser. */
  fixedState?: PushState;
}

const STATUS: Record<PushState, string> = {
  unsupported: "Install StreakBoard on your home screen to get reminders.",
  denied:
    "Notifications are blocked for StreakBoard. Allow them in your browser or system settings, then reload this page.",
  off: "Reminders are off on this device.",
  on: "Reminders are on for this device.",
};

const FAILED = "Something went wrong. Please try again.";

// The device part of the Reminders card: the state, one button for this device, and "Turn off on all devices" while the
// account has any subscription. Buttons hold only their text.
export default function RemindersToggle({ vapidPublicKey, hasSubscriptions, fixedState }: RemindersToggleProps) {
  const reminders = usePushReminders({ vapidPublicKey, hasSubscriptions, fixedState });
  const { state, pending } = reminders;

  return (
    <div className="flex flex-col items-start gap-3">
      <p role="status" className="text-sm" data-reminders-state={state}>
        {STATUS[state]}
      </p>
      {reminders.failed ? (
        <p role="alert" className="text-destructive text-sm">
          {FAILED}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {state === "off" || state === "on" ? (
          // One button for both states, so keyboard focus stays on it when it flips; aria-disabled (not disabled)
          // keeps it focusable while the request runs.
          <Button
            type="button"
            size="sm"
            variant={state === "on" ? "outline" : "default"}
            aria-disabled={pending !== null}
            onClick={() => {
              if (pending === null) void reminders.run(state === "on" ? "disable" : "enable");
            }}
          >
            {pending === "enable"
              ? "Turning on..."
              : pending === "disable"
                ? "Turning off..."
                : state === "on"
                  ? "Turn off"
                  : "Turn on"}
          </Button>
        ) : null}
        {reminders.hasSubscriptions ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending !== null}
            onClick={() => void reminders.run("disable-all")}
          >
            {pending === "disable-all" ? "Turning off..." : "Turn off on all devices"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
