import React, { useEffect, useRef, useState } from "react";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkoffFailureCode, reportCheckoffFailure, sendCheckoff } from "@/lib/checkoff-client";
import { publishChecked, publishDelta } from "@/lib/checkoff-sync";
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
  /** Whose total the tap changes on the Leaderboard. */
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
  const focusAfterRender = useRef(false);
  // Counts taps: the answer to an earlier tap no longer owns the row once a newer tap has started.
  const tapId = useRef(0);
  // Each number sits alone in its own element: React inserts a comment between adjacent text nodes in server HTML.
  const streak = streakValue(recurrence, snapshot, currentPeriod, checked);

  // Flipping the row unmounts the tapped button: move focus to the one that replaces it, once.
  useEffect(() => {
    if (!focusAfterRender.current) return;
    focusAfterRender.current = false;
    buttonRef.current?.focus();
  }, [checked]);

  // A page restored from the back/forward cache keeps this state in memory, and the request that set `pending` may have
  // been cut off with the page: give the button back (like `useFormSubmitting`). A late answer of the old request still
  // rolls the row back, unless a newer tap has started by then (see `tapId`).
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) setPending(false);
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const tap = ++tapId.current;
    const next = !checked;
    const delta = streakValue(recurrence, snapshot, currentPeriod, next) - streak;
    focusAfterRender.current = true;
    setChecked(next);
    publishChecked(taskId, next);
    setPending(true);
    setMessage(undefined);
    publishDelta(viewerId, delta);

    const action = next ? "checkoff" : "uncheck";
    const result = await sendCheckoff(action, taskId, recurrence === "once" ? null : currentPeriod);

    const superseded = tapId.current !== tap;
    if (result.kind === "saved") {
      if (!superseded) setPending(false);
      return;
    }
    if (result.kind === "stale") {
      // The page stayed open across Warsaw midnight: the server recorded another period, so show its state. The button
      // stays pending until the new page replaces this one.
      window.location.reload();
      return;
    }
    // The session is gone whichever tap this was, so `expired` still reloads below; any other answer to a superseded tap
    // is dropped: its rollback, message and beacon would describe a row that a newer tap now owns.
    if (superseded && result.kind !== "expired") return;
    // A rollback can come long after the tap: give focus back only if the user has not moved on in the meantime.
    focusAfterRender.current = document.activeElement === buttonRef.current || document.activeElement === document.body;
    setChecked(!next);
    publishChecked(taskId, !next);
    publishDelta(viewerId, -delta);
    if (result.kind === "expired") {
      // The session is gone, so a retry cannot succeed: reload, and the middleware sends the user to the sign-in page.
      window.location.reload();
      return;
    }
    setPending(false);
    setMessage(FAILURE_MESSAGES[result.kind]);
    if (result.kind === "failed") {
      // Tell the operator about a failure the server never saw; `status` has no code, the route logs it (an answer that
      // never reached the route is a known blind spot).
      const code = checkoffFailureCode(action, result.reason);
      if (code !== null) reportCheckoffFailure(code);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      {checked ? (
        <>
          {/* The label stays the element's only text: the icon is an svg, never a text glyph. */}
          <span className="text-success inline-flex items-center gap-1 text-sm font-medium">
            <CircleCheck className="size-4" aria-hidden="true" />
            {DONE_LABELS[recurrence]}
          </span>
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
        <div className="text-muted-foreground ml-auto flex items-baseline gap-1.5 text-xs">
          <span>Streak</span>
          <span className="text-foreground text-lg font-semibold tabular-nums">{streak}</span>
        </div>
      )}
      {message && (
        <p role="alert" className="text-destructive basis-full text-xs">
          {message}
        </p>
      )}
    </div>
  );
}
