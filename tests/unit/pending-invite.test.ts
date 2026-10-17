import type { AstroCookies } from "astro";
import type { User } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { JOIN_CODE_COOKIE } from "@/lib/join-code";
import { INVITE_METADATA_KEY, inviteForSignUp, joinPendingInvite } from "@/lib/pending-invite";
import { createFakeSupabase, type ScriptedResult } from "../helpers/fake-supabase";

// Oracle: the owner's decision of 2026-10-18 (invite-auto-join). An opened invite link, or the code stored with the
// account at sign-up, joins the group on the next dashboard visit without a click; a refused invite is spent and named;
// a transient failure keeps the invite for the "Join <group>?" card. Redirect targets are spelled out, not built.

const CODE = "a1b2c3d4e5f6";
const STORED = "0123456789ab";
const LOG = { route: "/dashboard", userId: "u1", ray: null };

// Behaves like AstroCookies for one request: a value set or deleted during the request is what get() answers next.
function cookieJar(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(JOIN_CODE_COOKIE, initial);
  const jar = {
    get: vi.fn((name: string) => (values.has(name) ? { value: values.get(name) } : undefined)),
    set: vi.fn((name: string, value: string) => values.set(name, value)),
    delete: vi.fn((name: string) => values.delete(name)),
  };
  return { jar, cookies: jar as unknown as AstroCookies, value: () => values.get(JOIN_CODE_COOKIE) };
}

const userWith = (metadata: Record<string, unknown> = {}) => ({ id: "u1", user_metadata: metadata }) as unknown as User;
const sqlError = (code: string, status = 400): ScriptedResult => ({
  error: { code, message: `sqlstate ${code}` },
  status,
});
const CLEAR_STORED = {
  kind: "auth",
  name: "updateUser",
  chain: [{ method: "updateUser", args: [{ data: { join_code: null } }] }],
};
const joinCall = (code: string) => ({
  kind: "rpc",
  name: "join_group",
  chain: [{ method: "rpc", args: [{ p_join_code: code }] }],
});

let errorSpy: MockInstance<typeof console.error>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("joinPendingInvite", () => {
  it("does nothing without an invite", async () => {
    const fake = createFakeSupabase([]);
    const { cookies, jar } = cookieJar();

    expect(await joinPendingInvite(fake.client, cookies, userWith(), LOG)).toBeNull();
    expect(fake.calls).toEqual([]);
    expect(jar.set).not.toHaveBeenCalled();
    expect(jar.delete).not.toHaveBeenCalled();
  });

  it("joins with the cookie's code, spends the cookie and ends on the group_joined notice", async () => {
    const fake = createFakeSupabase([{ data: "group-1" }]);
    const { cookies, value } = cookieJar(CODE);

    expect(await joinPendingInvite(fake.client, cookies, userWith(), LOG)).toBe("/dashboard?notice=group_joined");
    expect(fake.calls).toEqual([joinCall(CODE)]);
    expect(value()).toBeUndefined();
    expect(fake.remaining()).toBe(0);
  });

  it("joins with the code stored at sign-up when the cookie is gone, then removes the stored copy", async () => {
    const fake = createFakeSupabase([{ data: "group-1" }, {}]);
    const { cookies } = cookieJar();

    const target = await joinPendingInvite(fake.client, cookies, userWith({ [INVITE_METADATA_KEY]: STORED }), LOG);
    expect(target).toBe("/dashboard?notice=group_joined");
    expect(fake.calls).toEqual([joinCall(STORED), CLEAR_STORED]);
  });

  it("prefers the cookie (the invite just opened) over the stored copy, and still removes the copy", async () => {
    const fake = createFakeSupabase([{ data: "group-1" }, {}]);
    const { cookies } = cookieJar(CODE);

    await joinPendingInvite(fake.client, cookies, userWith({ [INVITE_METADATA_KEY]: STORED }), LOG);
    expect(fake.calls).toEqual([joinCall(CODE), CLEAR_STORED]);
  });

  it("ignores a stored value that is not a join code", async () => {
    const fake = createFakeSupabase([]);
    const { cookies } = cookieJar();

    expect(
      await joinPendingInvite(fake.client, cookies, userWith({ [INVITE_METADATA_KEY]: "not a code!" }), LOG),
    ).toBeNull();
    expect(fake.calls).toEqual([]);
  });

  it("names an unknown code invalid_code and spends the invite in both places", async () => {
    const fake = createFakeSupabase([sqlError("P0002"), {}]);
    const { cookies, value } = cookieJar(CODE);

    const target = await joinPendingInvite(fake.client, cookies, userWith({ [INVITE_METADATA_KEY]: CODE }), LOG);
    expect(target).toBe("/dashboard?error=invalid_code");
    expect(value()).toBeUndefined();
    expect(fake.calls.at(-1)).toEqual(CLEAR_STORED);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("names an opened invite already_in_group for a user who has a group", async () => {
    const fake = createFakeSupabase([sqlError("23505", 409)]);
    const { cookies, value } = cookieJar(CODE);

    expect(await joinPendingInvite(fake.client, cookies, userWith(), LOG)).toBe("/dashboard?error=already_in_group");
    expect(value()).toBeUndefined();
  });

  it("spends a stored copy quietly for a user who already has a group", async () => {
    const fake = createFakeSupabase([sqlError("23505", 409), {}]);
    const { cookies } = cookieJar();

    expect(await joinPendingInvite(fake.client, cookies, userWith({ [INVITE_METADATA_KEY]: STORED }), LOG)).toBeNull();
    expect(fake.calls).toEqual([joinCall(STORED), CLEAR_STORED]);
  });

  it("keeps the invite in the cookie on a transient failure, reports it and lets the dashboard render", async () => {
    const fake = createFakeSupabase([sqlError("XX000", 500)]);
    const { cookies, value } = cookieJar();

    expect(await joinPendingInvite(fake.client, cookies, userWith({ [INVITE_METADATA_KEY]: STORED }), LOG)).toBeNull();
    // The stored copy is moved into the cookie, where the "Join <group>?" card reads it; the copy itself stays.
    expect(value()).toBe(STORED);
    expect(fake.calls).toEqual([joinCall(STORED)]);
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(STORED);
  });

  it("still ends on the notice when removing the stored copy fails, and reports that", async () => {
    const fake = createFakeSupabase([{ data: "group-1" }, { error: { code: "unexpected_failure", message: "boom" } }]);
    const { cookies } = cookieJar();

    const target = await joinPendingInvite(fake.client, cookies, userWith({ [INVITE_METADATA_KEY]: STORED }), LOG);
    expect(target).toBe("/dashboard?notice=group_joined");
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});

describe("inviteForSignUp", () => {
  it("stores the pending cookie's code with the new account", () => {
    expect(inviteForSignUp(cookieJar(CODE).cookies)).toEqual({ join_code: CODE });
  });

  it("stores nothing without a pending invite", () => {
    expect(inviteForSignUp(cookieJar().cookies)).toBeNull();
  });
});
