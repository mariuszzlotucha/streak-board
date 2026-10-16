import { describe, expect, it, vi } from "vitest";
import { getOwnNickname, suggestNickname } from "@/lib/nicknames";
import type { createClient } from "@/lib/supabase";

type Supabase = NonNullable<ReturnType<typeof createClient>>;

/** A client whose `from(...).select(...).eq(...).maybeSingle()` answers `result` and records each step. */
function fakeClient(result: { data: { nickname: string } | null; error: unknown }) {
  const maybeSingle = vi.fn(() => Promise.resolve(result));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as Supabase, from, select, eq, maybeSingle };
}

describe("getOwnNickname", () => {
  it("reads the nickname column of the user's own row", async () => {
    const fake = fakeClient({ data: { nickname: "Kasia" }, error: null });
    await expect(getOwnNickname(fake.client, "user-1")).resolves.toBe("Kasia");
    expect(fake.from).toHaveBeenCalledWith("nicknames");
    expect(fake.select).toHaveBeenCalledWith("nickname");
    expect(fake.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(fake.maybeSingle).toHaveBeenCalledOnce();
  });

  it("answers null when the account has no row yet", async () => {
    await expect(getOwnNickname(fakeClient({ data: null, error: null }).client, "user-1")).resolves.toBeNull();
  });

  it("throws the returned error", async () => {
    const error = { code: "XX000", message: "boom" };
    await expect(getOwnNickname(fakeClient({ data: null, error }).client, "user-1")).rejects.toBe(error);
  });
});

describe("suggestNickname", () => {
  it("keeps the current nickname, whatever the metadata says", () => {
    expect(suggestNickname("Kasia", { full_name: "Katarzyna Nowak", name: "Kate" })).toBe("Kasia");
  });

  it("takes full_name before name", () => {
    expect(suggestNickname(null, { full_name: "Katarzyna Nowak", name: "Kate" })).toBe("Katarzyna Nowak");
  });

  it("falls back to name when full_name is missing, not a string or breaks the rules", () => {
    expect(suggestNickname(null, { name: "Kate" })).toBe("Kate");
    expect(suggestNickname(null, { full_name: 42, name: "Kate" })).toBe("Kate");
    expect(suggestNickname(null, { full_name: "K", name: "Kate" })).toBe("Kate");
    expect(suggestNickname(null, { full_name: "Katarzyna Maria Nowak-Kowalska", name: "Kate" })).toBe("Kate");
  });

  it("returns the normalized value", () => {
    expect(suggestNickname(null, { full_name: "  Katarzyna Nowak \n" })).toBe("Katarzyna Nowak");
  });

  it("returns an empty string when nothing passes the rules", () => {
    expect(suggestNickname(null, undefined)).toBe("");
    expect(suggestNickname(null, {})).toBe("");
    expect(suggestNickname(null, { full_name: " ", name: null, picture: "Kasia" })).toBe("");
  });
});
