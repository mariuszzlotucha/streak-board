import { useState, type ReactNode } from "react";
import { CircleAlert, ListPlus, Plus, TriangleAlert } from "lucide-react";
import { FormField } from "@/components/forms/FormField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import ConfirmAction from "@/components/groups/ConfirmAction";
import CheckoffControl from "@/components/tasks/CheckoffControl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RECURRENCE_LABELS, TASK_RECURRENCES } from "@/lib/task-rules";
import { cn } from "@/lib/utils";

// The button variants and sizes the dashboard uses.
const BUTTON_VARIANTS = ["default", "outline", "ghost", "destructive"] as const;
const BUTTON_SIZES = ["default", "sm"] as const;
const BADGE_VARIANTS = ["default", "secondary", "outline", "destructive", "ghost", "link"] as const;
// The same classes as the "Add a task" disclosure in `TasksCard.astro`.
const SUMMARY_CLASS = cn(buttonVariants({ variant: "outline" }), "list-none [&::-webkit-details-marker]:hidden");
// Ids no task has: a tap on the done state's Undo only reaches the real route, which answers that the task is gone.
const DEMO_TASK_ID = "00000000-0000-4000-9000-0000000000ff";
const DEMO_VIEWER_ID = "00000000-0000-4000-8000-0000000000ff";

function StateCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h3">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function RecurrenceOptions() {
  return TASK_RECURRENCES.map((kind) => (
    <NativeSelectOption key={kind} value={kind}>
      {RECURRENCE_LABELS[kind]}
    </NativeSelectOption>
  ));
}

/**
 * The controls of the dashboard in the states a page fixture cannot show: disabled, pending and with a field error,
 * plus the row's quiet and destructive dialog triggers, the done state, the notice and the disclosure side by side.
 * Hover and focus-visible are captured by `scripts/ui-screenshots.mjs` (set `controls`).
 */
export default function DashboardControlStates() {
  const [title, setTitle] = useState("");

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <StateCard title="Buttons" description="Each variant the view uses, enabled and disabled, at both sizes">
        {BUTTON_VARIANTS.map((variant) => (
          <div key={variant} className="flex flex-wrap items-center gap-2">
            {BUTTON_SIZES.map((size) => (
              <div key={size} className="contents">
                <Button type="button" variant={variant} size={size}>
                  {variant}
                </Button>
                <Button type="button" variant={variant} size={size} disabled>
                  {variant}, disabled
                </Button>
              </div>
            ))}
          </div>
        ))}
      </StateCard>

      <StateCard title="Submit button" description="Idle and pending (pending is disabled)">
        <SubmitButton pending={false} pendingText="Adding..." icon={<Plus className="size-4" />}>
          Add task
        </SubmitButton>
        <SubmitButton pending pendingText="Adding..." icon={<Plus className="size-4" />}>
          Add task
        </SubmitButton>
      </StateCard>

      <StateCard title="Text fields" description="A field with an error, and a disabled input">
        <FormField
          id="ks-field-error"
          name="title"
          label="Task title"
          value={title}
          onChange={setTitle}
          placeholder="e.g. Water the plants"
          error="Task title is required"
          icon={<ListPlus className="size-4" />}
        />
        <div>
          <Label htmlFor="ks-input-disabled" className="mb-1.5">
            Group name
          </Label>
          <Input id="ks-input-disabled" placeholder="e.g. Friday football" disabled />
        </div>
      </StateCard>

      <StateCard title="Select" description="The recurrence field, default and disabled">
        <div>
          <Label htmlFor="ks-select-default" className="mb-1.5">
            How often
          </Label>
          <NativeSelect id="ks-select-default" defaultValue="once" className="w-full">
            <RecurrenceOptions />
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor="ks-select-disabled" className="mb-1.5">
            How often
          </Label>
          <NativeSelect id="ks-select-disabled" defaultValue="weekly" className="w-full" disabled>
            <RecurrenceOptions />
          </NativeSelect>
        </div>
      </StateCard>

      <StateCard title="Badges" description="Every variant; the view uses secondary and outline">
        <div className="flex flex-wrap items-center gap-2">
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </div>
      </StateCard>

      <StateCard title="Alerts" description="The error of a failed action, and the notice of a partial failure">
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>You are not allowed to do that.</AlertDescription>
        </Alert>
        <Alert variant="warning" role="status">
          <TriangleAlert />
          <AlertDescription>Participants are unavailable right now. Reload to try again.</AlertDescription>
        </Alert>
      </StateCard>

      <StateCard
        title="Dialog triggers"
        description="A row's quiet trigger and the settings card's destructive one; both confirm in red"
      >
        <div className="flex flex-wrap items-center gap-2">
          <ConfirmAction
            action="/api/tasks/delete"
            fields={{ task_id: DEMO_TASK_ID }}
            triggerLabel="Delete"
            triggerAriaLabel="Delete Water the plants"
            title="Delete this task?"
            description="Water the plants will be deleted permanently. This cannot be undone."
            confirmLabel="Delete task"
            triggerVariant="ghost"
          />
          <ConfirmAction
            action="/api/groups/delete"
            triggerLabel="Delete group"
            title="Delete this group?"
            description="Morning crew will be deleted permanently and all of its members will lose it. This cannot be undone."
            confirmLabel="Delete group"
          />
        </div>
      </StateCard>

      <StateCard title="Done state" description="A ticked daily and once task: the success colour, the icon and Undo">
        <CheckoffControl
          taskId={DEMO_TASK_ID}
          title="Water the plants"
          recurrence="daily"
          snapshot={{ base: { value: 3, period: "2026-10-10" }, checked: true }}
          currentPeriod="2026-10-11"
          viewerId={DEMO_VIEWER_ID}
        />
        <CheckoffControl
          taskId={DEMO_TASK_ID}
          title="Book the summer trip"
          recurrence="once"
          snapshot={{ base: null, checked: true }}
          currentPeriod="2026-10-11"
          viewerId={DEMO_VIEWER_ID}
        />
      </StateCard>

      <StateCard title="Disclosure" description="The Add a task summary, closed and open">
        <details>
          <summary className={SUMMARY_CLASS}>
            <Plus />
            Add a task
          </summary>
          <p className="text-muted-foreground pt-4">The add-task form opens here.</p>
        </details>
        <details open>
          <summary className={SUMMARY_CLASS}>
            <Plus />
            Add a task
          </summary>
          <p className="text-muted-foreground pt-4">The add-task form opens here.</p>
        </details>
      </StateCard>
    </div>
  );
}
