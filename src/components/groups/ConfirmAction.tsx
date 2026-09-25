import { useId } from "react";
import { LoaderCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useFormSubmitting } from "@/components/hooks/useFormSubmitting";

interface ConfirmActionProps {
  action: string;
  fields?: Record<string, string>;
  triggerLabel: string;
  /** Distinguishes repeated triggers (one "Remove" per member) for assistive technology; must contain `triggerLabel`. */
  triggerAriaLabel?: string;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: "destructive" | "outline";
}

/**
 * A trigger button that asks for confirmation in an AlertDialog; confirming submits a native POST.
 * The dialog content is portaled out of the tree, so the confirm button cannot be a descendant of the form:
 * the form is rendered next to the dialog and the button points at it with the `form` attribute.
 */
export default function ConfirmAction({
  action,
  fields = {},
  triggerLabel,
  triggerAriaLabel,
  title,
  description,
  confirmLabel,
  variant = "destructive",
}: ConfirmActionProps) {
  const formId = useId();
  const [submitting, setSubmitting] = useFormSubmitting();

  function handleSubmit() {
    setSubmitting(true);
  }

  return (
    <>
      <form id={formId} method="POST" action={action} onSubmit={handleSubmit}>
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      </form>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant={variant} size="sm" aria-label={triggerAriaLabel}>
            {triggerLabel}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription className="wrap-anywhere">{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            {/* A plain button, not AlertDialogAction: closing the dialog on click would unmount the button
                (and drop its form owner) before the browser runs the submit. The page navigates away instead. */}
            <Button type="submit" form={formId} variant={variant} disabled={submitting}>
              {submitting && <LoaderCircle className="animate-spin" />}
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
