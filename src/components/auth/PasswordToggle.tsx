import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PasswordToggleProps {
  visible: boolean;
  onToggle: () => void;
}

export function PasswordToggle({ visible, onToggle }: PasswordToggleProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      onClick={onToggle}
      className="text-muted-foreground absolute top-1/2 right-1.5 -translate-y-1/2"
      aria-label={visible ? "Hide password" : "Show password"}
      aria-pressed={visible}
    >
      {visible ? <EyeOff /> : <Eye />}
    </Button>
  );
}
