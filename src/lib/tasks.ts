import type { createClient } from "@/lib/supabase";
import { normalizeRecurrence, type TaskRecurrence } from "@/lib/task-rules";

type Supabase = NonNullable<ReturnType<typeof createClient>>;

export interface GroupTask {
  id: string;
  title: string;
  recurrence: TaskRecurrence;
  created_by: string;
}

/** A task by id, or null when RLS hides it (other group) or it does not exist. Throws on a Supabase error. */
export async function getTask(supabase: Supabase, taskId: string): Promise<GroupTask | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, recurrence, created_by")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  // The column is plain text in the generated types; the CHECK limits it to the recurrence kinds.
  const recurrence = normalizeRecurrence(data.recurrence);
  if (!recurrence) throw new Error(`Task ${data.id} has an unknown recurrence`);
  return { ...data, recurrence };
}
