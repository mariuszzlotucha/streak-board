import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const COPIED_RESET_MS = 2000;

const STATUS_TEXT = {
  idle: "",
  copied: "Link copied",
  manual: "Press Ctrl+C (or long-press) to copy the selected link.",
} as const;

interface CopyInviteLinkProps {
  url: string;
}

export default function CopyInviteLink({ url }: CopyInviteLinkProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");

  useEffect(() => {
    // Only the "Copied" confirmation is transient; the manual-copy hint stays until the next click.
    if (status !== "copied") return;
    const timer = window.setTimeout(() => {
      setStatus("idle");
    }, COPIED_RESET_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [status]);

  async function handleCopy() {
    try {
      // navigator.clipboard is undefined outside secure contexts.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- absent in insecure contexts
      if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      // Fallback: select the text so the user can copy it by hand.
      inputRef.current?.focus();
      inputRef.current?.select();
      setStatus("manual");
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          readOnly
          value={url}
          aria-label="Invite link"
          className="min-w-0 flex-1"
          onFocus={(e) => {
            e.currentTarget.select();
          }}
        />
        <Button type="button" variant="outline" onClick={() => void handleCopy()}>
          {status === "copied" ? <Check className="size-4" /> : <Copy className="size-4" />}
          {status === "copied" ? "Copied" : "Copy"}
        </Button>
      </div>
      <p role="status" className="text-muted-foreground min-h-4 text-xs">
        {STATUS_TEXT[status]}
      </p>
    </div>
  );
}
