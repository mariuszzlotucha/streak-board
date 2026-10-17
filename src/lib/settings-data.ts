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
  /** The VAPID public key (`VAPID_PUBLIC_KEY`, read on the server); null or blank means reminders are unsupported. */
  vapidPublicKey?: string | null;
}

/** What the Reminders card needs from the server; the state of this device is read by the island in the browser. */
export interface RemindersData {
  vapidPublicKey: string | null;
  /** The caller has at least one push subscription, on any device: "Turn off on all devices" is offered. */
  hasSubscriptions: boolean;
}

export interface SettingsData {
  group: MyGroup | null;
  /** The members of the caller's group (the owner chooses a successor among them); empty without a group. */
  members: GroupMember[];
  reminders: RemindersData;
  loadFailed: boolean;
  /** Set only when the load failed: the fixed message the page shows. */
  error: string | null;
}

/**
 * The settings page needs the caller's group and its members: the owner check is `group.owner_id`, the members are the
 * choices of the ownership transfer, and every action posts to a route that acts on the caller's own group. Without a
 * Supabase client there is no group. It also says whether the caller has any push subscription (the Reminders card).
 * A failed read of the group, its members or the subscriptions fails the whole load.
 */
export async function loadSettings({ createSupabase, log, vapidPublicKey }: SettingsInput): Promise<SettingsData> {
  const key = vapidPublicKey?.trim() ? vapidPublicKey.trim() : null;
  try {
    const supabase = createSupabase();
    const group = supabase ? await getMyGroup(supabase) : null;
    const members = supabase && group ? await listGroupMembers(supabase, group.id) : [];
    const hasSubscriptions = supabase ? await hasPushSubscriptions(supabase) : false;
    return {
      group,
      members,
      reminders: { vapidPublicKey: key, hasSubscriptions },
      loadFailed: false,
      error: null,
    };
  } catch (cause) {
    reportError("settings.load.failed", cause, log);
    return {
      group: null,
      members: [],
      reminders: { vapidPublicKey: null, hasSubscriptions: false },
      loadFailed: true,
      error: groupErrorMessage("unknown"),
    };
  }
}

/** Whether the caller has any push subscription (RLS shows only the caller's own rows). A returned error throws. */
async function hasPushSubscriptions(supabase: Supabase): Promise<boolean> {
  const { count, error } = await supabase.from("push_subscriptions").select("id", { count: "exact", head: true });
  if (error) throw error;
  return (count ?? 0) > 0;
}
