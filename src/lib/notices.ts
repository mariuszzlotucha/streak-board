// The success notices of the signed-in app: a route that completed an action redirects with `?notice=<code>`, and the
// landing page (`/dashboard` or `/settings`) resolves the code to a fixed message for its toast, as `?error=` codes
// resolve through `resolveGroupError` and `resolveTaskError`.

export type NoticeCode =
  | "group_created"
  | "group_joined"
  | "group_renamed"
  | "group_left"
  | "member_removed"
  | "group_deleted"
  | "ownership_transferred"
  | "task_created"
  | "task_updated"
  | "task_deleted"
  | "task_joined"
  | "task_left"
  | "nickname_saved";

const NOTICE_MESSAGES: Record<NoticeCode, string> = {
  group_created: "Group created.",
  group_joined: "You joined the group.",
  group_renamed: "Group renamed.",
  group_left: "You left the group.",
  member_removed: "Member removed.",
  group_deleted: "Group deleted.",
  ownership_transferred: "Ownership transferred.",
  task_created: "Task created.",
  task_updated: "Task updated.",
  task_deleted: "Task deleted.",
  task_joined: "You joined the task.",
  task_left: "You left the task.",
  nickname_saved: "Nickname saved.",
};

/** Resolves a `?notice=` query value to a message; a foreign value is never reflected. */
export function resolveNotice(param: string | null): string | null {
  if (param !== null && Object.hasOwn(NOTICE_MESSAGES, param)) {
    return NOTICE_MESSAGES[param as NoticeCode];
  }
  return null;
}

export function noticeMessage(code: NoticeCode): string {
  return NOTICE_MESSAGES[code];
}

/** The page a successful action redirects to, carrying its notice code (`/dashboard?notice=task_created`). */
export function noticePath(path: string, code: NoticeCode): string {
  return `${path}${path.includes("?") ? "&" : "?"}notice=${code}`;
}
