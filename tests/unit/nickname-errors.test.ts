import { describe, expect, it } from "vitest";
import {
  nicknameErrorMessage,
  resolveNicknameError,
  toNicknameErrorCode,
  type NicknameErrorCode,
} from "@/lib/nickname-errors";

// Oracle values come from the S-14 plan and the migration add_nicknames, not from running the mapper: 23505 is the
// unique constraint nicknames_nickname_key, 23514 the length or trim CHECK, 42501 a call without EXECUTE (anon).

const MESSAGES: Record<NicknameErrorCode, string> = {
  not_configured: "Nicknames are not available right now.",
  invalid_nickname: "Enter a nickname between 2 and 24 characters.",
  nickname_taken: "This nickname is already taken. Pick another one.",
  forbidden: "You are not allowed to do that.",
  unknown: "Something went wrong. Please try again.",
};
const ALL_CODES = Object.keys(MESSAGES) as NicknameErrorCode[];

describe("toNicknameErrorCode", () => {
  it.each([
    ["23505", "nickname_taken"],
    ["23514", "invalid_nickname"],
    ["42501", "forbidden"],
  ])("maps SQLSTATE %s to %s", (sqlstate, code) => {
    expect(toNicknameErrorCode({ code: sqlstate })).toBe(code);
  });

  it("maps every other SQLSTATE to unknown", () => {
    for (const sqlstate of ["XX000", "22P02", "23503", "P0002", "PGRST116", "", "23505 "]) {
      expect(toNicknameErrorCode({ code: sqlstate })).toBe("unknown");
    }
  });

  it("maps a missing code to unknown", () => {
    expect(toNicknameErrorCode({})).toBe("unknown");
    expect(toNicknameErrorCode({ code: undefined })).toBe("unknown");
  });
});

describe("resolveNicknameError", () => {
  it("returns the message of every known code", () => {
    for (const code of ALL_CODES) {
      expect(resolveNicknameError(code)).toBe(MESSAGES[code]);
    }
  });

  it("never reflects a foreign or inherited key", () => {
    for (const param of [
      "__proto__",
      "toString",
      "constructor",
      "hasOwnProperty",
      "nope",
      "Nickname_taken",
      "",
      null,
    ]) {
      expect(resolveNicknameError(param)).toBeNull();
    }
  });
});

describe("nicknameErrorMessage", () => {
  it("has the fixed message of every code", () => {
    for (const code of ALL_CODES) {
      expect(nicknameErrorMessage(code)).toBe(MESSAGES[code]);
    }
  });
});
