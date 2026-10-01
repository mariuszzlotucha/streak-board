import { Button } from "@/components/ui/button";
import { streakValue, type PeriodKey, type StreakSnapshot } from "@/lib/streak-rules";
import type { TaskRecurrence } from "@/lib/task-rules";

const DONE_LABELS: Record<TaskRecurrence, string> = {
  once: "Done",
  daily: "Done today",
  weekly: "Done this week",
};

interface CheckoffControlProps {
  taskId: string;
  title: string;
  recurrence: TaskRecurrence;
  snapshot: StreakSnapshot;
  currentPeriod: PeriodKey;
  /** The server render does not need it; it keys the viewer's score change once the control is interactive. */
  viewerId: string;
}

/**
 * The viewer's own line of a task row: "Mark done", or "Done" with "Undo" once the current period is ticked, and the
 * streak (not for `once` tasks). Plain forms that post to the check-off routes, so it works without JavaScript. Keep it
 * a pure function of its props: its server HTML has to equal its first client render.
 */
export default function CheckoffControl({ taskId, title, recurrence, snapshot, currentPeriod }: CheckoffControlProps) {
  const checked = snapshot.checked;
  // Each number sits alone in its own element: React inserts a comment between adjacent text nodes in server HTML.
  const streak = streakValue(recurrence, snapshot, currentPeriod);

  return (
    <div className="flex basis-full flex-wrap items-center gap-x-2 gap-y-2">
      {checked ? (
        <>
          <span className="text-sm font-medium">{DONE_LABELS[recurrence]}</span>
          <form method="POST" action="/api/tasks/uncheck">
            <input type="hidden" name="task_id" value={taskId} />
            <Button type="submit" variant="outline" size="sm" aria-label={`Undo ${title}`}>
              Undo
            </Button>
          </form>
        </>
      ) : (
        <form method="POST" action="/api/tasks/checkoff">
          <input type="hidden" name="task_id" value={taskId} />
          <Button type="submit" size="sm" aria-label={`Mark ${title} as done`}>
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
    </div>
  );
}
