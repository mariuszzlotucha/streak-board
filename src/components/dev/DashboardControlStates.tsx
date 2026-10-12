import { useState, type ReactNode } from "react";
import { CircleAlert, ListPlus, Plus } from "lucide-react";
import { FormField } from "@/components/forms/FormField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RECURRENCE_LABELS, TASK_RECURRENCES } from "@/lib/task-rules";

// The button variants and sizes the dashboard uses.
const BUTTON_VARIANTS = ["default", "outline", "destructive"] as const;
const BUTTON_SIZES = ["default", "sm"] as const;
const BADGE_VARIANTS = ["default", "secondary", "outline", "destructive", "ghost", "link"] as const;

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
 * The controls of the dashboard in the states a page fixture cannot show: disabled, pending and with a field error.
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
            Repeats
          </Label>
          <NativeSelect id="ks-select-default" defaultValue="once" className="w-full">
            <RecurrenceOptions />
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor="ks-select-disabled" className="mb-1.5">
            Repeats
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

      <StateCard title="Alert" description="The destructive alert of a failed action">
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>You are not allowed to do that.</AlertDescription>
        </Alert>
      </StateCard>
    </div>
  );
}
