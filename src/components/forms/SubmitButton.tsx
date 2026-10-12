import type { ReactNode } from "react";
import type { VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { Button, type buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SubmitButtonProps {
  pending: boolean;
  pendingText: string;
  icon: ReactNode;
  children: ReactNode;
  /** Defaults to the primary button; the auth pages rely on that. */
  variant?: VariantProps<typeof buttonVariants>["variant"];
  /** Merged after the default `w-full`, so a form can size the button to its text. */
  className?: string;
}

export function SubmitButton({ pending, pendingText, icon, children, variant, className }: SubmitButtonProps) {
  return (
    <Button type="submit" variant={variant} disabled={pending} className={cn("w-full", className)}>
      {pending ? (
        <>
          <LoaderCircle className="animate-spin" />
          {pendingText}
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </Button>
  );
}
