import { describe, expect, it } from "vitest";
import { noticeMessage, noticePath, resolveNotice, type NoticeCode } from "@/lib/notices";

// Oracle values are the wording the toast shows (plan: frontend-notifications, Phase 1), not the output of the resolver.

const ALL_CODES: NoticeCode[] = [
  "group_created",
  "group_joined",
  "group_renamed",
  "group_left",
  "member_removed",
  "group_deleted",
  "ownership_transferred",
  "task_created",
  "task_updated",
  "task_deleted",
  "task_joined",
  "task_left",
  "nickname_saved",
];

describe("resolveNotice", () => {
  it("returns the message of every known code", () => {
    for (const code of ALL_CODES) {
      expect(resolveNotice(code)).toBe(noticeMessage(code));
    }
  });

  it("returns null for a missing value", () => {
    expect(resolveNotice(null)).toBeNull();
  });

  it("never reflects a foreign, inherited or padded key", () => {
    for (const param of [
      "__proto__",
      "toString",
      "constructor",
      "hasOwnProperty",
      "bogus",
      "Task_created",
      "task_created ",
      " task_created",
      "task_created&x=1",
      "task_created<script>",
      "",
    ]) {
      expect(resolveNotice(param)).toBeNull();
    }
  });
});

describe("noticeMessage", () => {
  it("has a non-empty, distinct message for every code", () => {
    const messages = ALL_CODES.map((code) => noticeMessage(code));
    for (const message of messages) {
      expect(message.length).toBeGreaterThan(0);
    }
    expect(new Set(messages).size).toBe(ALL_CODES.length);
  });

  it("pins the user-facing wording", () => {
    expect(noticeMessage("group_created")).toBe("Group created.");
    expect(noticeMessage("group_joined")).toBe("You joined the group.");
    expect(noticeMessage("group_renamed")).toBe("Group renamed.");
    expect(noticeMessage("group_left")).toBe("You left the group.");
    expect(noticeMessage("member_removed")).toBe("Member removed.");
    expect(noticeMessage("group_deleted")).toBe("Group deleted.");
    expect(noticeMessage("ownership_transferred")).toBe("Ownership transferred.");
    expect(noticeMessage("task_created")).toBe("Task created.");
    expect(noticeMessage("task_updated")).toBe("Task updated.");
    expect(noticeMessage("task_deleted")).toBe("Task deleted.");
    expect(noticeMessage("task_joined")).toBe("You joined the task.");
    expect(noticeMessage("task_left")).toBe("You left the task.");
    expect(noticeMessage("nickname_saved")).toBe("Nickname saved.");
  });
});

describe("noticePath", () => {
  it("appends the code to a path without a query", () => {
    expect(noticePath("/dashboard", "task_created")).toBe("/dashboard?notice=task_created");
    expect(noticePath("/settings", "nickname_saved")).toBe("/settings?notice=nickname_saved");
  });

  it("appends the code to a path that already has a query", () => {
    expect(noticePath("/dashboard?tab=x", "group_renamed")).toBe("/dashboard?tab=x&notice=group_renamed");
  });

  it("builds a value the resolver accepts back", () => {
    for (const code of ALL_CODES) {
      const value = new URL(noticePath("/dashboard", code), "http://localhost").searchParams.get("notice");
      expect(resolveNotice(value)).toBe(noticeMessage(code));
    }
  });
});
