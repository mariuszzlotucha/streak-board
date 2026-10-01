import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { sendCheckoff } from "@/lib/checkoff-client";
import { publishDelta } from "@/lib/checkoff-sync";
import { streakValue, type PeriodKey, type StreakSnapshot } from "@/lib/streak-rules";
import type { TaskRecurrence } from "@/lib/task-rules";

const DONE_LABELS: Record<TaskRecurrence, string> = {
  once: "Done",
  daily: "Done today",
  weekly: "Done this week",
};

const FAILURE_MESSAGES = {
  rejected: "This task is no longer available. Reload the page.",
  failed: "Could not save. Try again.",
} as const;

// A button that waits for the server is dimmed and ignored, but not `disabled`: a disabled button cannot take focus, and
// the new button has to take it right after the tap.
const PENDING_STYLE = "aria-disabled:pointer-events-none aria-disabled:opacity-50";

interface CheckoffControlProps {
  taskId: string;
  title: string;
  recurrence: TaskRecurrence;
  snapshot: StreakSnapshot;
  currentPeriod: PeriodKey;
  /** Whose score the tap changes on the Leaderboard. */
  viewerId: string;
}

/**
 * The viewer's own line of a task row: "Mark done", or "Done" with "Undo" once the current period is ticked, and the
 * streak (not for `once` tasks). Plain forms that post to the check-off routes, so it works without JavaScript and
 * before the island hydrates. Once it is interactive a tap flips the row at once, moves the Leaderboard (through
 * `publishDelta`), sends the request in the background and rolls everything back if the server does not confirm. All
 * state starts from the props, so the server HTML equals the first client render.
 */
export default function CheckoffControl({
  taskId,
  title,
  recurrence,
  snapshot,
  currentPeriod,
  viewerId,
}: CheckoffControlProps) {
  const [checked, setChecked] = useState(snapshot.checked);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hasToggled = useRef(false);
  // Each number sits alone in its own element: React inserts a comment between adjacent text nodes in server HTML.
  const streak = streakValue(recurrence, snapshot, currentPeriod, checked);

  // Flipping the row unmounts the tapped button: move focus to the one that replaces it.
  useEffect(() => {
    if (hasToggled.current) buttonRef.current?.focus();
  }, [checked]);

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const next = !checked;
    const delta = streakValue(recurrence, snapshot, currentPeriod, next) - streak;
    hasToggled.current = true;
    setChecked(next);
    setPending(true);
    setMessage(undefined);
    publishDelta(viewerId, delta);

    const result = await sendCheckoff(
      next ? "checkoff" : "uncheck",
      taskId,
      recurrence === "once" ? null : currentPeriod,
    );

    setPending(false);
    if (result.kind === "saved") return;
    if (result.kind === "stale") {
      // The page stayed open across Warsaw midnight: the server recorded another period, so show its state.
      window.location.reload();
      return;
    }
    setChecked(!next);
    publishDelta(viewerId, -delta);
    setMessage(FAILURE_MESSAGES[result.kind]);
  }

  return (
    <div className="flex basis-full flex-wrap items-center gap-x-2 gap-y-2">
      {checked ? (
        <>
          <span className="text-sm font-medium">{DONE_LABELS[recurrence]}</span>
          <form method="POST" action="/api/tasks/uncheck" onSubmit={handleSubmit}>
            <input type="hidden" name="task_id" value={taskId} />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              ref={buttonRef}
              aria-label={`Undo ${title}`}
              aria-disabled={pending || undefined}
              className={PENDING_STYLE}
            >
              Undo
            </Button>
          </form>
        </>
      ) : (
        <form method="POST" action="/api/tasks/checkoff" onSubmit={handleSubmit}>
          <input type="hidden" name="task_id" value={taskId} />
          <Button
            type="submit"
            size="sm"
            ref={buttonRef}
            aria-label={`Mark done ${title}`}
            aria-disabled={pending || undefined}
            className={PENDING_STYLE}
          >
            Mark done
          </Button>
        </form>
      )}
      {recurrence !== "once" && (
        <div className="text-muted-foreground ml-auto flex items-baseline gap-1 text-xs">
          <span>Streak</span>
          <span className="text-foreground text-sm font-semibold">{streak}</span>
        </div>
      )}
      {message && (
        <p role="status" className="text-destructive basis-full text-xs">
          {message}
        </p>
      )}
    </div>
  );
}
