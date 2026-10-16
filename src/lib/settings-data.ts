import { groupErrorMessage } from "@/lib/group-errors";
import { getMyGroup, listGroupMembers, type GroupMember, type MyGroup } from "@/lib/groups";
import { reportError, type ReportContext } from "@/lib/log";
import type { createClient } from "@/lib/supabase";

type Supabase = NonNullable<ReturnType<typeof createClient>>;

export interface SettingsInput {
  /** Called inside the load's try, so a throw while creating the client ends as `loadFailed` like any other. */
  createSupabase: () => Supabase | null;
  /** The request's ids for the failure report (`requestFields`): never an e-mail, cookie or invite code. */
  log: ReportContext;
}

export interface SettingsData {
  group: MyGroup | null;
  /** The members of the caller's group (the owner chooses a successor among them); empty without a group. */
  members: GroupMember[];
  loadFailed: boolean;
  /** Set only when the load failed: the fixed message the page shows. */
  error: string | null;
}

/**
 * The settings page needs the caller's group and its members: the owner check is `group.owner_id`, the members are the
 * choices of the ownership transfer, and every action posts to a route that acts on the caller's own group. Without a
 * Supabase client there is no group. A failed read of the group or of its members fails the whole load.
 */
export async function loadSettings({ createSupabase, log }: SettingsInput): Promise<SettingsData> {
  try {
    const supabase = createSupabase();
    const group = supabase ? await getMyGroup(supabase) : null;
    const members = supabase && group ? await listGroupMembers(supabase, group.id) : [];
    return { group, members, loadFailed: false, error: null };
  } catch (cause) {
    reportError("settings.load.failed", cause, log);
    return { group: null, members: [], loadFailed: true, error: groupErrorMessage("unknown") };
  }
}
