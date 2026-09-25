import React, { useState } from "react";
import { KeyRound, LogIn } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useFormSubmitting } from "@/components/hooks/useFormSubmitting";
import { normalizeJoinCode } from "@/lib/join-code";

export default function JoinGroupForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useFormSubmitting();

  function validate() {
    let next: string | undefined;
    if (!code.trim()) {
      next = "Invite code or link is required";
    } else if (!normalizeJoinCode(code)) {
      next = "Enter a valid invite code or link";
    }
    setError(next);
    if (next) document.getElementById("code")?.focus();
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
    <form method="POST" action="/api/groups/join" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="code"
        label="Invite code or link"
        value={code}
        onChange={(v) => {
          setCode(v);
          if (error) setError(undefined);
        }}
        placeholder="Paste an invite link or code"
        error={error}
        icon={<KeyRound className="size-4" />}
      />
      <SubmitButton pending={submitting} pendingText="Joining..." icon={<LogIn className="size-4" />}>
        Join group
      </SubmitButton>
    </form>
  );
}
