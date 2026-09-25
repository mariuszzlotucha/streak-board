import React, { useState } from "react";
import { Plus, Users } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useFormSubmitting } from "@/components/hooks/useFormSubmitting";
import { MAX_GROUP_NAME_LENGTH, normalizeGroupName, trimGroupName } from "@/lib/group-rules";

export default function CreateGroupForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useFormSubmitting();

  function validate() {
    let next: string | undefined;
    if (!trimGroupName(name)) {
      next = "Group name is required";
    } else if (!normalizeGroupName(name)) {
      // Counted in code points, like the server and the database; a maxLength attribute would count UTF-16 units.
      next = `Group name must be at most ${MAX_GROUP_NAME_LENGTH} characters`;
    }
    setError(next);
    if (next) document.getElementById("name")?.focus();
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
    <form method="POST" action="/api/groups/create" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="name"
        label="Group name"
        value={name}
        onChange={(v) => {
          setName(v);
          if (error) setError(undefined);
        }}
        placeholder="e.g. Friday football"
        error={error}
        icon={<Users className="size-4" />}
      />
      <SubmitButton pending={submitting} pendingText="Creating..." icon={<Plus className="size-4" />}>
        Create group
      </SubmitButton>
    </form>
  );
}
