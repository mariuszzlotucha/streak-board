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
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useFormSubmitting } from "@/components/hooks/useFormSubmitting";

/** One required choice the dialog collects before confirming (the member who takes over a group). */
export interface ConfirmActionChoice {
  /** The form field the chosen value is posted as. */
  name: string;
  label: string;
  /** The empty first option: while it is selected the browser refuses the submit. */
  placeholder: string;
  options: { value: string; label: string }[];
}

interface ConfirmActionProps {
  action: string;
  fields?: Record<string, string>;
  triggerLabel: string;
  /** Distinguishes repeated triggers (one "Remove" per member) for assistive technology; must contain `triggerLabel`. */
  triggerAriaLabel?: string;
  title: string;
  description: string;
  confirmLabel: string;
  /** The confirm button's variant, and the trigger's unless `triggerVariant` says otherwise. */
  variant?: "destructive" | "outline";
  /** A quiet trigger (`ghost`) for row-level actions that still confirm in the `variant` colour. */
  triggerVariant?: "destructive" | "outline" | "ghost";
  /** A required select in the dialog, posted with the form; without it the dialog only confirms. */
  choice?: ConfirmActionChoice;
}

/**
 * A trigger button that asks for confirmation in an AlertDialog; confirming submits a native POST.
 * The dialog content is portaled out of the tree, so the confirm button cannot be a descendant of the form:
 * the form is rendered next to the dialog and the button points at it with the `form` attribute. A `choice` select joins
 * the form the same way, so the browser's required check runs on it before the submit.
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
  triggerVariant = variant,
  choice,
}: ConfirmActionProps) {
  const formId = useId();
  const choiceId = useId();
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
          <Button type="button" variant={triggerVariant} size="sm" aria-label={triggerAriaLabel}>
            {triggerLabel}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription className="wrap-anywhere">{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {choice && (
            <div className="grid gap-2">
              <Label htmlFor={choiceId}>{choice.label}</Label>
              <NativeSelect id={choiceId} name={choice.name} form={formId} required defaultValue="" className="w-full">
                <NativeSelectOption value="">{choice.placeholder}</NativeSelectOption>
                {choice.options.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          )}
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
