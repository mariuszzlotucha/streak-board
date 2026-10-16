import React, { useState } from "react";
import { Check, UserRound } from "lucide-react";
import { FormField } from "@/components/forms/FormField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { useFormSubmitting } from "@/components/hooks/useFormSubmitting";
import {
  MAX_NICKNAME_LENGTH,
  MIN_NICKNAME_LENGTH,
  isVisibleNickname,
  normalizeNickname,
  trimNickname,
} from "@/lib/nickname-rules";

interface NicknameFormProps {
  /** The current nickname, a suggestion from the sign-in provider, or "". */
  initialValue: string;
  submitLabel: string;
}

export default function NicknameForm({ initialValue, submitLabel }: NicknameFormProps) {
  const [nickname, setNickname] = useState(initialValue);
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useFormSubmitting();

  function validate() {
    let next: string | undefined;
    const trimmed = trimNickname(nickname);
    if (!trimmed) {
      next = "Nickname is required";
    } else if (!isVisibleNickname(trimmed)) {
      next = "Nickname must use visible characters, without control or format characters";
    } else if (!normalizeNickname(nickname)) {
      // Counted in code points, like the server and the database; a maxLength attribute would count UTF-16 units.
      next = `Nickname must be ${MIN_NICKNAME_LENGTH} to ${MAX_NICKNAME_LENGTH} characters`;
    }
    setError(next);
    if (next) document.getElementById("nickname")?.focus();
    return !next;
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
      return;
    }
    setSubmitting(true);
  }

  // The field is `nickname`, never `name`: the smoke test finds the rename form by its `name="name"` field.
  return (
    <form method="POST" action="/api/account/nickname" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="nickname"
        name="nickname"
        label="Nickname"
        value={nickname}
        onChange={(v) => {
          setNickname(v);
          if (error) setError(undefined);
        }}
        placeholder="e.g. Kasia"
        error={error}
        hint={
          <p className="text-muted-foreground mt-1 text-xs">
            {`${MIN_NICKNAME_LENGTH} to ${MAX_NICKNAME_LENGTH} characters. Members of your group will see it.`}
          </p>
        }
        icon={<UserRound className="size-4" />}
      />
      <SubmitButton pending={submitting} pendingText="Saving..." icon={<Check className="size-4" />} className="w-auto">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
