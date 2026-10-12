import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { groupErrorMessage } from "@/lib/group-errors";
import type { MyGroup } from "@/lib/groups";
import type { ReportContext } from "@/lib/log";
import { loadSettings, type SettingsInput } from "@/lib/settings-data";
import type { createClient } from "@/lib/supabase";

vi.mock("@/lib/groups", () => ({ getMyGroup: vi.fn() }));

const groups = await import("@/lib/groups");

type Supabase = NonNullable<ReturnType<typeof createClient>>;

const supabase = {} as Supabase;
const group: MyGroup = { id: "g-1", name: "Runners", join_code: "abc", owner_id: "u-owner" };
const log: ReportContext = { route: "/settings", userId: "u-owner", ray: "ray-1" };

function input(overrides: Partial<SettingsInput> = {}): SettingsInput {
  return { createSupabase: () => supabase, log, ...overrides };
}

let errorSpy: MockInstance<typeof console.error>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(groups.getMyGroup).mockResolvedValue(group);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("loadSettings", () => {
  it("returns the caller's group", async () => {
    const data = await loadSettings(input());
    expect(data).toEqual({ group, loadFailed: false, error: null });
    expect(groups.getMyGroup).toHaveBeenCalledWith(supabase);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("returns no group for a caller outside any group", async () => {
    vi.mocked(groups.getMyGroup).mockResolvedValue(null);
    const data = await loadSettings(input());
    expect(data).toEqual({ group: null, loadFailed: false, error: null });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("returns no group and reads nothing when Supabase is not configured", async () => {
    const data = await loadSettings(input({ createSupabase: () => null }));
    expect(data).toEqual({ group: null, loadFailed: false, error: null });
    expect(groups.getMyGroup).not.toHaveBeenCalled();
  });

  it("ends as loadFailed with one settings.load.failed report carrying the request ids", async () => {
    vi.mocked(groups.getMyGroup).mockRejectedValue(
      Object.assign(new Error("connection refused"), { code: "PGRST000", status: 503 }),
    );
    const data = await loadSettings(input());
    expect(data).toEqual({ group: null, loadFailed: true, error: groupErrorMessage("unknown") });
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

  it("ends as loadFailed with one settings.load.failed report when creating the client throws", async () => {
    const data = await loadSettings(
      input({
        createSupabase: () => {
          throw new Error("boom");
        },
      }),
    );
    expect(data).toEqual({ group: null, loadFailed: true, error: groupErrorMessage("unknown") });
    expect(groups.getMyGroup).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toMatchObject({
      level: "error",
      event: "settings.load.failed",
      route: "/settings",
    });
  });
});
