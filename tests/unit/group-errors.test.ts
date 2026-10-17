import { describe, expect, it } from "vitest";
import { groupErrorMessage, resolveGroupError, toGroupErrorCode, type GroupErrorCode } from "@/lib/group-errors";

// Oracle values come from the SQLSTATE comments in src/lib/group-errors.ts and the README (Observability), not from
// running the mapper: 23514 is the CHECK on the name, 23505 the one-group-per-user unique index (or, when the message
// names groups_name_key, the unique group name of the migration unique_names), P0002 the
// join_group "no such code" raise, P0003 the transfer_group_ownership "invalid successor" raise, 42501 an RLS refusal.

const ALL_CODES: GroupErrorCode[] = [
  "not_configured",
  "invalid_name",
  "name_taken",
  "invalid_code",
  "already_in_group",
  "invalid_successor",
  "forbidden",
  "unknown",
];

describe("toGroupErrorCode", () => {
  it.each([
    ["23514", "invalid_name"],
    ["23505", "already_in_group"],
    ["P0002", "invalid_code"],
    ["P0003", "invalid_successor"],
    ["42501", "forbidden"],
  ])("maps SQLSTATE %s to %s", (sqlstate, code) => {
    expect(toGroupErrorCode({ code: sqlstate })).toBe(code);
  });

  it("maps a 23505 that names groups_name_key to name_taken, any other 23505 to already_in_group", () => {
    const duplicate = (index: string) => `duplicate key value violates unique constraint "${index}"`;
    expect(toGroupErrorCode({ code: "23505", message: duplicate("groups_name_key") })).toBe("name_taken");
    expect(toGroupErrorCode({ code: "23505", message: duplicate("group_members_user_id_key") })).toBe(
      "already_in_group",
    );
    // A longer index name that merely starts with it is another index.
    expect(toGroupErrorCode({ code: "23505", message: duplicate("groups_name_key_old") })).toBe("already_in_group");
    expect(toGroupErrorCode({ code: "23514", message: duplicate("groups_name_key") })).toBe("invalid_name");
  });

  it("maps every other SQLSTATE to unknown", () => {
    for (const sqlstate of ["XX000", "22P02", "23503", "PGRST116", "P0001", "P0004", "", "23514 "]) {
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
    expect(groupErrorMessage("name_taken")).toBe("Another group already has this name. Pick another one.");
    expect(groupErrorMessage("invalid_code")).toBe("This invite link or code is not valid.");
    expect(groupErrorMessage("already_in_group")).toBe("You are already in a group.");
    expect(groupErrorMessage("invalid_successor")).toBe("Choose a member of your group to take over.");
    expect(groupErrorMessage("forbidden")).toBe("You are not allowed to do that.");
    expect(groupErrorMessage("unknown")).toBe("Something went wrong. Please try again.");
  });
});
