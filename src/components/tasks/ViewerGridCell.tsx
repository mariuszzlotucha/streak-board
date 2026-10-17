import { useCheckedTasks } from "@/components/hooks/useCheckedTasks";
import type { CellState } from "@/lib/grid-rules";
import GridCell from "./GridCell";

interface ViewerGridCellProps {
  taskId: string;
  initialState: CellState;
  labelPrefix: string;
}

/**
 * The viewer's current-period cell: follows the optimistic tick of the row's check-off control (and its rollback)
 * through `checkoff-sync`. The store is empty on the server and while hydrating, so the first render is `initialState`.
 */
export default function ViewerGridCell({ taskId, initialState, labelPrefix }: ViewerGridCellProps) {
  const checked = useCheckedTasks().get(taskId);
  const state: CellState = checked === undefined ? initialState : checked ? "done" : "open";
  return <GridCell state={state} labelPrefix={labelPrefix} />;
}
