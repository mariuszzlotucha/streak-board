import { describe, expect, it } from "vitest";
import { resolveTaskError, toTaskErrorCode } from "@/lib/task-errors";

// 23514 is the CHECK on the title length or the recurrence list (src/lib/task-errors.ts), a 23505 that names
// tasks_group_title_key the unique title within a group (migration unique_names); everything else goes through the
// group mapper.

describe("toTaskErrorCode", () => {
  it("maps 23514 to invalid_title", () => {
    expect(toTaskErrorCode({ code: "23514" })).toBe("invalid_title");
  });

  it("maps a 23505 that names tasks_group_title_key to title_taken", () => {
    const message = 'duplicate key value violates unique constraint "tasks_group_title_key"';
    expect(toTaskErrorCode({ code: "23505", message })).toBe("title_taken");
    expect(toTaskErrorCode({ code: "23503", message })).toBe("unknown");
  });

  it.each([
    ["23505", "already_in_group"],
    ["P0002", "invalid_code"],
    ["42501", "forbidden"],
    ["XX000", "unknown"],
    ["23503", "unknown"],
  ])("delegates SQLSTATE %s to the group mapper (%s)", (sqlstate, code) => {
    expect(toTaskErrorCode({ code: sqlstate })).toBe(code);
  });

  it("maps a missing code to unknown", () => {
    expect(toTaskErrorCode({})).toBe("unknown");
  });
});

describe("resolveTaskError", () => {
  it("returns the message of the three task codes", () => {
    expect(resolveTaskError("invalid_title")).toBe("Enter a task title between 1 and 80 characters.");
    expect(resolveTaskError("title_taken")).toBe("Your group already has a task with this name. Pick another one.");
    expect(resolveTaskError("invalid_recurrence")).toBe("Choose once, daily or weekly.");
  });

  it("does not answer group codes: the dashboard resolves those separately", () => {
    for (const param of ["forbidden", "unknown", "invalid_name", "not_configured"]) {
      expect(resolveTaskError(param)).toBeNull();
    }
  });

  it("never reflects a foreign or inherited key", () => {
    for (const param of ["__proto__", "toString", "constructor", "valueOf", "nope", "INVALID_TITLE", "", null]) {
      expect(resolveTaskError(param)).toBeNull();
    }
  });
});
