import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { groupErrorMessage } from "@/lib/group-errors";
import type { GroupMember, MyGroup } from "@/lib/groups";
import type { ReportContext } from "@/lib/log";
import { loadSettings, type SettingsInput } from "@/lib/settings-data";
import type { createClient } from "@/lib/supabase";

vi.mock("@/lib/groups", () => ({ getMyGroup: vi.fn(), listGroupMembers: vi.fn() }));

const groups = await import("@/lib/groups");

type Supabase = NonNullable<ReturnType<typeof createClient>>;

// The only direct read is the head count of the caller's push subscriptions (RLS: own rows).
const countResult: { count: number | null; error: unknown } = { count: 0, error: null };
const select = vi.fn(() => Promise.resolve(countResult));
const from = vi.fn(() => ({ select }));
const supabase = { from } as unknown as Supabase;
const noReminders = { vapidPublicKey: null, hasSubscriptions: false };
const group: MyGroup = {
  id: "g-1",
  name: "Runners",
  join_code: "abc",
  owner_id: "u-owner",
  owner_notice_pending: false,
};
const members: GroupMember[] = [
  { user_id: "u-owner", nickname: "Olivia", joined_at: "2026-09-28T08:00:00Z", is_owner: true },
  { user_id: "u-member", nickname: null, joined_at: "2026-09-29T08:00:00Z", is_owner: false },
];
const log: ReportContext = { route: "/settings", userId: "u-owner", ray: "ray-1" };

function input(overrides: Partial<SettingsInput> = {}): SettingsInput {
  return { createSupabase: () => supabase, log, ...overrides };
}

let errorSpy: MockInstance<typeof console.error>;

beforeEach(() => {
  countResult.count = 0;
  countResult.error = null;
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(groups.getMyGroup).mockResolvedValue(group);
  vi.mocked(groups.listGroupMembers).mockResolvedValue(members);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("loadSettings", () => {
  it("returns the caller's group and its members", async () => {
    const data = await loadSettings(input());
    expect(data).toEqual({ group, members, reminders: noReminders, loadFailed: false, error: null });
    expect(groups.getMyGroup).toHaveBeenCalledWith(supabase);
    expect(groups.listGroupMembers).toHaveBeenCalledExactlyOnceWith(supabase, group.id);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("returns no group and no members, and reads no members, for a caller outside any group", async () => {
    vi.mocked(groups.getMyGroup).mockResolvedValue(null);
    const data = await loadSettings(input());
    expect(data).toEqual({ group: null, members: [], reminders: noReminders, loadFailed: false, error: null });
    expect(groups.listGroupMembers).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("returns no group and reads nothing when Supabase is not configured", async () => {
    const data = await loadSettings(input({ createSupabase: () => null }));
    expect(data).toEqual({ group: null, members: [], reminders: noReminders, loadFailed: false, error: null });
    expect(groups.getMyGroup).not.toHaveBeenCalled();
    expect(groups.listGroupMembers).not.toHaveBeenCalled();
  });

  it("ends as loadFailed with one settings.load.failed report carrying the request ids", async () => {
    vi.mocked(groups.getMyGroup).mockRejectedValue(
      Object.assign(new Error("connection refused"), { code: "PGRST000", status: 503 }),
    );
    const data = await loadSettings(input());
    expect(data).toEqual({
      group: null,
      members: [],
      reminders: noReminders,
      loadFailed: true,
      error: groupErrorMessage("unknown"),
    });
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({
      level: "error",
      event: "settings.load.failed",
      route: "/settings",
      userId: "u-owner",
      ray: "ray-1",
      error: { code: "PGRST000", status: 503 },
    });
  });

  it("ends as loadFailed, without the group, when the members cannot be read", async () => {
    vi.mocked(groups.listGroupMembers).mockRejectedValue(
      Object.assign(new Error("upstream timeout"), { code: "PGRST003", status: 504 }),
    );
    const data = await loadSettings(input());
    expect(data).toEqual({
      group: null,
      members: [],
      reminders: noReminders,
      loadFailed: true,
      error: groupErrorMessage("unknown"),
    });
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({
      level: "error",
      event: "settings.load.failed",
      route: "/settings",
      userId: "u-owner",
      error: { code: "PGRST003", status: 504 },
    });
  });

  it("ends as loadFailed with one settings.load.failed report when creating the client throws", async () => {
    const data = await loadSettings(
      input({
        createSupabase: () => {
          throw new Error("boom");
        },
      }),
    );
    expect(data).toEqual({
      group: null,
      members: [],
      reminders: noReminders,
      loadFailed: true,
      error: groupErrorMessage("unknown"),
    });
    expect(groups.getMyGroup).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({
      level: "error",
      event: "settings.load.failed",
      route: "/settings",
    });
  });

  it("passes the trimmed VAPID key and reports whether the caller has any push subscription", async () => {
    countResult.count = 2;
    const data = await loadSettings(input({ vapidPublicKey: "  BKey  " }));
    expect(data.reminders).toEqual({ vapidPublicKey: "BKey", hasSubscriptions: true });
    expect(from).toHaveBeenCalledWith("push_subscriptions");
    expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true });
  });

  it("treats a blank VAPID key as none", async () => {
    const data = await loadSettings(input({ vapidPublicKey: " " }));
    expect(data.reminders).toEqual(noReminders);
  });

  it("ends as loadFailed with one settings.load.failed report when the subscriptions cannot be read", async () => {
    countResult.error = { code: "PGRST000", message: "down", status: 503 };
    const data = await loadSettings(input({ vapidPublicKey: "BKey" }));
    expect(data.loadFailed).toBe(true);
    expect(data.reminders).toEqual(noReminders);
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({ event: "settings.load.failed", error: { code: "PGRST000" } });
  });
});
