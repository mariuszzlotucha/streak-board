import React, { useEffect, useRef, useState } from "react";
import { ListPlus, Pencil } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useFormSubmitting } from "@/components/hooks/useFormSubmitting";
import { Button } from "@/components/ui/button";
import { MAX_TASK_TITLE_LENGTH, normalizeTaskTitle } from "@/lib/task-rules";

interface EditTaskFormProps {
  taskId: string;
  title: string;
}

export default function EditTaskForm({ taskId, title: currentTitle }: EditTaskFormProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(currentTitle);
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useFormSubmitting();
  const fieldId = `task-title-${taskId}`;
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const hasToggled = useRef(false);

  // Switching views unmounts the focused control: move focus to the title field, or back to Edit after Cancel.
  useEffect(() => {
    if (!hasToggled.current) return;
    if (editing) document.getElementById(fieldId)?.focus();
    else editButtonRef.current?.focus();
  }, [editing, fieldId]);

  function validate() {
    let next: string | undefined;
    if (!title.trim()) {
      next = "Task title is required";
    } else if (!normalizeTaskTitle(title)) {
      // Counted in code points, like the server and the database; a maxLength attribute would count UTF-16 units.
      next = `Task title must be at most ${MAX_TASK_TITLE_LENGTH} characters`;
    }
    setError(next);
    if (next) document.getElementById(fieldId)?.focus();
    return !next;
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
      return;
    }
    setSubmitting(true);
  }

  function toggleEditing(next: boolean) {
    hasToggled.current = true;
    setEditing(next);
  }

  function cancel() {
    setTitle(currentTitle);
    setError(undefined);
    toggleEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 text-sm break-words">{currentTitle}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          ref={editButtonRef}
          aria-label={`Edit ${currentTitle}`}
          onClick={() => {
            toggleEditing(true);
          }}
        >
          Edit
        </Button>
      </div>
    );
  }

  return (
    <form method="POST" action="/api/tasks/update" className="w-full space-y-2" onSubmit={handleSubmit} noValidate>
      <input type="hidden" name="task_id" value={taskId} />
      <FormField
        id={fieldId}
        name="title"
        label="Task title"
        value={title}
        onChange={(v) => {
          setTitle(v);
          if (error) setError(undefined);
        }}
        error={error}
        icon={<ListPlus className="size-4" />}
      />
      <div className="flex flex-wrap gap-2">
        <div className="min-w-24 flex-1">
          <SubmitButton pending={submitting} pendingText="Saving..." icon={<Pencil className="size-4" />}>
            Save
          </SubmitButton>
        </div>
        <Button type="button" variant="outline" disabled={submitting} onClick={cancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
