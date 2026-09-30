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

/** Tasks of the caller's group, oldest first (RLS limits the select to it). Throws on a Supabase error. */
export async function listGroupTasks(supabase: Supabase, groupId: string): Promise<GroupTask[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, recurrence, created_by")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return data.map((row) => {
    const recurrence = normalizeRecurrence(row.recurrence);
    if (!recurrence) throw new Error(`Task ${row.id} has an unknown recurrence`);
    return { ...row, recurrence };
  });
}

export interface TaskParticipant {
  task_id: string;
  user_id: string;
}

/** Participation rows visible to the caller (RLS limits them to tasks of the caller's group). Throws on a Supabase error. */
export async function listTaskParticipants(supabase: Supabase): Promise<TaskParticipant[]> {
  const { data, error } = await supabase
    .from("task_participants")
    .select("task_id, user_id")
    .order("joined_at", { ascending: true })
    .order("user_id", { ascending: true });
  if (error) throw error;
  return data;
}
