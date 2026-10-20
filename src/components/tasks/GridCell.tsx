import { Check, Minus, X } from "lucide-react";
import { cellLabel } from "@/lib/grid-labels";
import type { CellState } from "@/lib/grid-rules";
import { cn } from "@/lib/utils";

// Only pairs `scripts/token-contrast.mjs` checks: success-foreground on success, destructive on its tint, primary on card
// (the open cell's border and dash) and muted-foreground on muted.
const STATE_CLASSES: Record<CellState, string> = {
  done: "bg-success text-success-foreground",
  missed: "bg-destructive/10 text-destructive",
  open: "border-2 border-primary bg-card text-primary",
  notJoined: "bg-muted text-muted-foreground",
};

interface GridCellProps {
  state: CellState;
  /** "Kasia, Mon 13 Oct": the label before the state. */
  labelPrefix: string;
}

/**
 * The content of one grid cell: a coloured square with the state's icon and a screen-reader label. Rendered statically
 * by the grid and inside the viewer's live cell, so both produce the same markup.
 */
export default function GridCell({ state, labelPrefix }: GridCellProps) {
  const Icon = state === "done" ? Check : state === "missed" ? X : state === "open" ? Minus : null;
  return (
    <span className={cn("mx-auto flex size-7 items-center justify-center rounded-md", STATE_CLASSES[state])}>
      {Icon && <Icon className="size-4" aria-hidden="true" />}
      <span className="sr-only">{cellLabel(labelPrefix, state)}</span>
    </span>
  );
}
