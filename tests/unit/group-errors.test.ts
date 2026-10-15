import { describe, expect, it } from "vitest";
import { groupErrorMessage, resolveGroupError, toGroupErrorCode, type GroupErrorCode } from "@/lib/group-errors";

// Oracle values come from the SQLSTATE comments in src/lib/group-errors.ts and the README (Observability), not from
// running the mapper: 23514 is the CHECK on the name, 23505 the one-group-per-user unique index, P0002 the
// join_group "no such code" raise, 42501 an RLS refusal.

const ALL_CODES: GroupErrorCode[] = [
  "not_configured",
  "invalid_name",
  "invalid_code",
  "already_in_group",
  "forbidden",
  "unknown",
];

describe("toGroupErrorCode", () => {
  it.each([
    ["23514", "invalid_name"],
    ["23505", "already_in_group"],
    ["P0002", "invalid_code"],
    ["42501", "forbidden"],
  ])("maps SQLSTATE %s to %s", (sqlstate, code) => {
    expect(toGroupErrorCode({ code: sqlstate })).toBe(code);
  });

  it("maps every other SQLSTATE to unknown", () => {
    for (const sqlstate of ["XX000", "22P02", "23503", "PGRST116", "", "23514 "]) {
      expect(toGroupErrorCode({ code: sqlstate })).toBe("unknown");
    }
  });

  it("maps a missing code to unknown", () => {
    expect(toGroupErrorCode({})).toBe("unknown");
    expect(toGroupErrorCode({ code: undefined })).toBe("unknown");
  });
});

describe("resolveGroupError", () => {
  it("returns the message of every known code", () => {
    for (const code of ALL_CODES) {
      expect(resolveGroupError(code)).toBe(groupErrorMessage(code));
    }
  });

  it("never reflects a foreign or inherited key", () => {
    for (const param of ["__proto__", "toString", "constructor", "hasOwnProperty", "nope", "Forbidden", "", null]) {
      expect(resolveGroupError(param)).toBeNull();
    }
  });
});

describe("groupErrorMessage", () => {
  it("has a non-empty, distinct message for every code", () => {
    const messages = ALL_CODES.map((code) => groupErrorMessage(code));
    for (const message of messages) {
      expect(message.length).toBeGreaterThan(0);
    }
    expect(new Set(messages).size).toBe(ALL_CODES.length);
  });

  it("pins the user-facing wording", () => {
    expect(groupErrorMessage("not_configured")).toBe("Groups are not available right now.");
    expect(groupErrorMessage("invalid_name")).toBe("Enter a group name between 1 and 80 characters.");
    expect(groupErrorMessage("invalid_code")).toBe("This invite link or code is not valid.");
    expect(groupErrorMessage("already_in_group")).toBe("You are already in a group.");
    expect(groupErrorMessage("forbidden")).toBe("You are not allowed to do that.");
    expect(groupErrorMessage("unknown")).toBe("Something went wrong. Please try again.");
  });
});
