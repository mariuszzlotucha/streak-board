import React, { useState } from "react";
import { ListPlus, Plus } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useFormSubmitting } from "@/components/hooks/useFormSubmitting";
import { Label } from "@/components/ui/label";
import { MAX_TASK_TITLE_LENGTH, normalizeTaskTitle, TASK_RECURRENCES } from "@/lib/task-rules";

const RECURRENCE_LABELS: Record<(typeof TASK_RECURRENCES)[number], string> = {
  once: "Once",
  daily: "Daily",
  weekly: "Weekly",
};

export default function CreateTaskForm() {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useFormSubmitting();

  function validate() {
    let next: string | undefined;
    if (!title.trim()) {
      next = "Task title is required";
    } else if (!normalizeTaskTitle(title)) {
      // Counted in code points, like the server and the database; a maxLength attribute would count UTF-16 units.
      next = `Task title must be at most ${MAX_TASK_TITLE_LENGTH} characters`;
    }
    setError(next);
    if (next) document.getElementById("new-task-title")?.focus();
    return !next;
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
      return;
    }
    setSubmitting(true);
  }

  return (
    <form method="POST" action="/api/tasks/create" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="new-task-title"
        name="title"
        label="Task title"
        value={title}
        onChange={(v) => {
          setTitle(v);
          if (error) setError(undefined);
        }}
        placeholder="e.g. Water the plants"
        error={error}
        icon={<ListPlus className="size-4" />}
      />
      <div>
        <Label htmlFor="new-task-recurrence" className="mb-1.5">
          Repeats
        </Label>
        <select
          id="new-task-recurrence"
          name="recurrence"
          defaultValue="once"
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none"
        >
          {TASK_RECURRENCES.map((kind) => (
            <option key={kind} value={kind}>
              {RECURRENCE_LABELS[kind]}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton pending={submitting} pendingText="Adding..." icon={<Plus className="size-4" />}>
        Add task
      </SubmitButton>
    </form>
  );
}
