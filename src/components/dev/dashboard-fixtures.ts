// Fixture data for the dev-only dashboard kitchen sink (`src/pages/dev/dashboard-kitchen-sink.astro`): every page state
// of `DashboardView`, `SettingsView` and `NicknameView`, built from plain objects and the real board rules, with no
// Supabase call. Members are named by nickname; the smoke test pins the nickname `Olivia` on a state page in dev (and its
// absence in a production build). The e-mail addresses, shown only on the settings page's Account card, use the reserved
// `.test` domain.
import type { DashboardData } from "@/lib/dashboard-data";
import type { PushState } from "@/lib/pwa/push";
import type { RemindersData } from "@/lib/settings-data";
import { groupErrorMessage } from "@/lib/group-errors";
import { noticeMessage } from "@/lib/notices";
import { nicknameErrorMessage } from "@/lib/nickname-errors";
import type { GroupMember, MyGroup } from "@/lib/groups";
import { buildBoard, groupPeriodsByEnrolment, rankStandings, type EnrolmentPeriods } from "@/lib/leaderboard-rules";
import { buildGrids } from "@/lib/grid-rules";
import { groupParticipantsByTask, groupParticipationsByTask } from "@/lib/task-rules";
import type { GroupTask } from "@/lib/tasks";

/** What a state page renders: `DashboardView`'s props (the loaded data plus the viewer) and the nickname `AppLayout` shows. */
export interface DashboardViewProps extends DashboardData {
  viewerId: string | undefined;
  inviteLink: string | null;
  nickname: string | null;
  /** The resolved `?notice=` message of a completed action. */
  notice: string | null;
  /** Keeps the success toast on screen (no auto-hide), so the state page and its screenshot show it. */
  pinToast?: boolean;
}

export const DASHBOARD_STATES = [
  { id: "owner", label: "Owner", description: "Owner of a group with members and tasks of every kind" },
  {
    id: "new-owner",
    label: "New owner",
    description: "The owner right after an ownership transfer: the one-time notice with Got it",
  },
  { id: "member", label: "Member", description: "The same group seen by a member who is not the owner" },
  { id: "sole-member", label: "Sole member", description: "Alone in a new group, no tasks yet" },
  { id: "no-group", label: "No group", description: "Signed in, not in a group" },
  { id: "pending-invite", label: "Pending invite", description: "Not in a group, arrived through an invite link" },
  {
    id: "action-error",
    label: "Action error",
    description: "Owner after a rejected action (`?error=forbidden`): the error toast, which stays until closed",
  },
  {
    id: "notice-success",
    label: "Success notice",
    description: "Owner after a completed action (`?notice=task_created`): the success toast, kept on screen",
  },
  { id: "load-failed", label: "Load failed", description: "The first read failed" },
  { id: "tasks-failed", label: "Tasks failed", description: "Owner; the tasks could not be loaded" },
  {
    id: "participants-failed",
    label: "Participants failed",
    description: "Owner; the participants could not be loaded",
  },
  { id: "checkoffs-failed", label: "Check-offs failed", description: "Owner; the check-offs could not be loaded" },
  {
    id: "long-text",
    label: "Long text",
    description: "80-character group name and task title, a 24-character nickname",
  },
  {
    id: "update-notice",
    label: "Update notice",
    description: "Owner after a release took over: the new-version message with Refresh",
  },
] as const;

export type DashboardStateId = (typeof DASHBOARD_STATES)[number]["id"];

export function isDashboardStateId(value: string | null): value is DashboardStateId {
  return DASHBOARD_STATES.some((state) => state.id === value);
}

// The states of `/settings` (`SettingsView`); ids start with `settings-` so one `?state=` names either page. Every state
// that renders the Account card offers "Delete account", whose dialog `SettingsView` words from the group, the viewer and
// the members of the fixture (the four variants: owner with members, owner alone, member, no group).
export const SETTINGS_STATES = [
  {
    id: "settings-owner",
    label: "Owner",
    description:
      "Rename the group, transfer ownership to another member, then delete it last; deleting the account asks for a successor",
  },
  {
    id: "settings-owner-alone",
    label: "Owner, alone",
    description: "The only member: rename and delete, no transfer; deleting the account deletes the group",
  },
  {
    id: "settings-member",
    label: "Member",
    description: "Leave the group; deleting the account passes the member's tasks to the owner",
  },
  {
    id: "settings-no-group",
    label: "No group",
    description: "Not in a group: a link to the dashboard; deleting the account has no group to mention",
  },
  { id: "settings-load-failed", label: "Load failed", description: "The group could not be read" },
  {
    id: "settings-reminders-off",
    label: "Reminders off",
    description: "Owner; push works here, reminders are off on this device and on every other",
  },
  {
    id: "settings-reminders-on",
    label: "Reminders on",
    description: "Owner; reminders are on for this device: Turn off, and Turn off on all devices",
  },
  {
    id: "settings-reminders-unsupported",
    label: "Reminders unsupported",
    description: "Owner; no push in this browser (iOS outside the home screen): install the app first",
  },
  {
    id: "settings-reminders-denied",
    label: "Reminders denied",
    description: "Owner; notifications are blocked, with a subscription on another device",
  },
] as const;

export type SettingsStateId = (typeof SETTINGS_STATES)[number]["id"];

export function isSettingsStateId(value: string | null): value is SettingsStateId {
  return SETTINGS_STATES.some((state) => state.id === value);
}

/** What a settings state page renders: `SettingsView`'s props (the Account card shows the e-mail) and the nickname `AppLayout` shows. */
export interface SettingsViewProps {
  group: MyGroup | null;
  members: GroupMember[];
  viewerId: string | undefined;
  loadFailed: boolean;
  error: string | null;
  notice: string | null;
  email: string | undefined;
  nickname: string | null;
  reminders: RemindersData;
  /** The device's reminders state, pinned so the island does not read the browser. */
  remindersState: PushState;
}

// The states of `/account/nickname` (`NicknameView`); ids start with `nickname-`, like the settings states.
export const NICKNAME_STATES = [
  { id: "nickname-choose", label: "Choose", description: "First choice, empty field" },
  {
    id: "nickname-suggested",
    label: "Suggested",
    description: "First choice, the field prefilled with the name from Google",
  },
  { id: "nickname-change", label: "Change", description: "Changing an existing nickname, reached from settings" },
  { id: "nickname-error", label: "Error", description: "First choice after a rejected save (`?error=nickname_taken`)" },
] as const;

export type NicknameStateId = (typeof NICKNAME_STATES)[number]["id"];

export function isNicknameStateId(value: string | null): value is NicknameStateId {
  return NICKNAME_STATES.some((state) => state.id === value);
}

/** What a nickname state page renders: `NicknameView`'s props and the nickname `AppLayout` shows (null on a first choice). */
export interface NicknameViewProps {
  mode: "choose" | "change";
  suggestion: string;
  error: string | null;
  nickname: string | null;
}

// A fixed instant (a Sunday in Warsaw), so the current day and week, and with them every streak, never change.
const NOW = new Date("2026-10-11T10:00:00Z");

const OWNER_ID = "00000000-0000-4000-8000-00000000000a";
const MEMBER_ID = "00000000-0000-4000-8000-00000000000b";
const THIRD_ID = "00000000-0000-4000-8000-00000000000c";
const OUTSIDER_ID = "00000000-0000-4000-8000-00000000000d";

const OWNER_NICKNAME = "Olivia";
const MEMBER_NICKNAME = "Max";
const OUTSIDER_NICKNAME = "Nora";
// Exactly 24 characters, the longest a nickname may be, with no space to break at.
const LONG_NICKNAME = "Bartholomew_Featherstone";
const OWNER_EMAIL = "olivia@example.test";
const MEMBER_EMAIL = "max@example.test";
const OUTSIDER_EMAIL = "nora@example.test";
// Both exactly 80 characters, the longest a group name and a task title may be.
const LONG_GROUP_NAME = "The Saturday Morning Long Run, Book Swap and Very Ambitious Sourdough Society 26";
const LONG_TASK_TITLE = "Run five kilometres before breakfast and post the route in the group chat, daily";

const JOIN_CODE = "5f3a9c1e7b2d";

function member(user_id: string, nickname: string, is_owner = false): GroupMember {
  return { user_id, nickname, joined_at: "2026-09-28T08:00:00Z", is_owner };
}

function task(id: string, title: string, recurrence: GroupTask["recurrence"], created_by: string): GroupTask {
  return { id: `00000000-0000-4000-9000-0000000000${id}`, title, recurrence, created_by };
}

const MORNING_CREW: MyGroup = {
  id: "00000000-0000-4000-a000-000000000001",
  name: "Morning crew",
  join_code: JOIN_CODE,
  owner_id: OWNER_ID,
  owner_notice_pending: false,
};

const MEMBERS = [member(OWNER_ID, OWNER_NICKNAME, true), member(MEMBER_ID, MEMBER_NICKNAME), member(THIRD_ID, "Sam")];

// Seen by the owner: daily, weekly and once, each ticked and not ticked in the current period; a task the owner does not
// take part in; tasks created by someone else; and a task with no participants.
const TASKS = [
  task("01", "Water the plants", "daily", OWNER_ID),
  task("02", "Read 20 pages", "daily", MEMBER_ID),
  task("03", "Long run", "weekly", OWNER_ID),
  task("04", "Clean the fridge", "weekly", THIRD_ID),
  task("05", "Book the summer trip", "once", OWNER_ID),
  task("06", "Fix the bike", "once", MEMBER_ID),
  task("07", "Stretch for ten minutes", "daily", THIRD_ID),
  task("08", "Plan the picnic", "once", MEMBER_ID),
];

const PARTICIPATION = [
  [TASKS[0], [OWNER_ID, MEMBER_ID]],
  [TASKS[1], [OWNER_ID, MEMBER_ID, THIRD_ID]],
  [TASKS[2], [OWNER_ID, THIRD_ID]],
  [TASKS[3], [OWNER_ID]],
  [TASKS[4], [OWNER_ID, MEMBER_ID]],
  [TASKS[5], [OWNER_ID]],
  [TASKS[6], [THIRD_ID]],
] as const;

// Check-off periods as the `task_checkoff_periods` view returns them: ascending, daily keys are days and weekly keys are
// Mondays. 2026-10-11 is the current day and 2026-10-05 the current week.
const CHECKOFFS: EnrolmentPeriods[] = [
  { task_id: TASKS[0].id, user_id: OWNER_ID, periods: ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"] },
  { task_id: TASKS[0].id, user_id: MEMBER_ID, periods: ["2026-10-09", "2026-10-10"] },
  { task_id: TASKS[1].id, user_id: OWNER_ID, periods: ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-10"] },
  { task_id: TASKS[1].id, user_id: MEMBER_ID, periods: ["2026-10-10", "2026-10-11"] },
  { task_id: TASKS[1].id, user_id: THIRD_ID, periods: ["2026-10-11"] },
  { task_id: TASKS[2].id, user_id: OWNER_ID, periods: ["2026-09-21", "2026-09-28", "2026-10-05"] },
  { task_id: TASKS[2].id, user_id: THIRD_ID, periods: ["2026-09-28"] },
  { task_id: TASKS[3].id, user_id: OWNER_ID, periods: ["2026-09-28"] },
  { task_id: TASKS[4].id, user_id: OWNER_ID, periods: ["2026-10-02"] },
  { task_id: TASKS[6].id, user_id: THIRD_ID, periods: ["2026-10-10", "2026-10-11"] },
];

// Every participation started with the group, except Sam's on "Read 20 pages": joined on Friday 9 Oct, so the grid shows
// Sam's days before it as "not joined" beside Max's missed days, done days and today's open cell.
const JOINED_AT = "2026-09-28T08:00:00Z";
const LATE_JOIN = { task_id: TASKS[1].id, user_id: THIRD_ID, joined_at: "2026-10-09T07:00:00Z" };

function participationRows(tasks: readonly GroupTask[]) {
  return PARTICIPATION.flatMap(([participated, userIds]) =>
    tasks.some((t) => t.id === participated.id)
      ? userIds.map((user_id) => ({
          task_id: participated.id,
          user_id,
          joined_at:
            participated.id === LATE_JOIN.task_id && user_id === LATE_JOIN.user_id ? LATE_JOIN.joined_at : JOINED_AT,
        }))
      : [],
  );
}

function participantsOf(tasks: readonly GroupTask[]): Map<string, string[]> {
  return groupParticipantsByTask(participationRows(tasks));
}

/** The grids as `loadDashboard` computes them: the real rules, at the same fixed instant as the board. */
function grids(members: GroupMember[], tasks: GroupTask[], viewerId: string) {
  return buildGrids({
    members,
    tasks,
    participations: groupParticipationsByTask(participationRows(tasks)),
    periodsByEnrolment: groupPeriodsByEnrolment(CHECKOFFS),
    viewerId,
    now: NOW,
  });
}

/** The board as `loadDashboard` computes it: the real rules, at the fixed instant. */
function board(
  members: GroupMember[],
  tasks: GroupTask[],
  participantsByTask: Map<string, string[]>,
  viewerId: string,
) {
  const computed = buildBoard({
    members,
    tasks,
    participantsByTask,
    periodsByEnrolment: groupPeriodsByEnrolment(CHECKOFFS),
    viewerId,
    now: NOW,
  });
  // As in `loadDashboard`: ranking once here surfaces a throw before the Leaderboard island ranks again.
  rankStandings(computed.totals, viewerId);
  return computed;
}

function emptyData(): DashboardData {
  return {
    error: null,
    group: null,
    members: [],
    tasks: [],
    participantsByTask: new Map(),
    pendingCode: null,
    pendingGroupName: null,
    loadFailed: false,
    tasksFailed: false,
    participantsFailed: false,
    checkoffsFailed: false,
    board: null,
    grids: null,
  };
}

/** A viewer in a group, with every read succeeded unless `failed` says otherwise. */
function inGroup(
  origin: string,
  viewer: { id: string; nickname: string },
  {
    group = MORNING_CREW,
    members = MEMBERS,
    tasks = TASKS,
    failed,
  }: {
    group?: MyGroup;
    members?: GroupMember[];
    tasks?: GroupTask[];
    failed?: "tasks" | "participants" | "checkoffs";
  } = {},
): DashboardViewProps {
  const data = emptyData();
  data.group = group;
  data.members = members;
  if (failed === "tasks") {
    data.tasksFailed = true;
    // `loadDashboard` sets the generic message when nothing else did.
    data.error = groupErrorMessage("unknown");
  } else {
    data.tasks = tasks;
  }
  if (failed === "participants") data.participantsFailed = true;
  else data.participantsByTask = participantsOf(tasks);
  if (failed === "checkoffs") data.checkoffsFailed = true;
  // The board needs all three reads, as in `loadDashboard`.
  if (!failed) {
    data.board = board(members, data.tasks, data.participantsByTask, viewer.id);
    data.grids = grids(members, data.tasks, viewer.id);
  }
  return {
    ...data,
    viewerId: viewer.id,
    nickname: viewer.nickname,
    inviteLink: `${origin}/join/${group.join_code}`,
    notice: null,
  };
}

function withoutGroup(data: Partial<DashboardData> = {}): DashboardViewProps {
  return {
    ...emptyData(),
    ...data,
    viewerId: OUTSIDER_ID,
    nickname: OUTSIDER_NICKNAME,
    inviteLink: null,
    notice: null,
  };
}

/** The props `DashboardView` gets in one state. Builds fresh objects on every call; `origin` makes the invite link. */
export function dashboardFixture(id: DashboardStateId, origin: string): DashboardViewProps {
  const owner = { id: OWNER_ID, nickname: OWNER_NICKNAME };
  switch (id) {
    case "owner":
    case "update-notice":
      return inGroup(origin, owner);
    case "member":
      return inGroup(origin, { id: MEMBER_ID, nickname: MEMBER_NICKNAME });
    case "new-owner":
      return inGroup(origin, owner, { group: { ...MORNING_CREW, owner_notice_pending: true } });
    case "sole-member":
      return inGroup(origin, owner, { members: [member(OWNER_ID, OWNER_NICKNAME, true)], tasks: [] });
    case "no-group":
      return withoutGroup();
    case "pending-invite":
      return withoutGroup({ pendingCode: JOIN_CODE, pendingGroupName: MORNING_CREW.name });
    case "action-error":
      return { ...inGroup(origin, owner), error: groupErrorMessage("forbidden") };
    case "notice-success":
      return { ...inGroup(origin, owner), notice: noticeMessage("task_created"), pinToast: true };
    case "load-failed":
      return withoutGroup({ loadFailed: true, error: groupErrorMessage("unknown") });
    case "tasks-failed":
      return inGroup(origin, owner, { failed: "tasks" });
    case "participants-failed":
      return inGroup(origin, owner, { failed: "participants" });
    case "checkoffs-failed":
      return inGroup(origin, owner, { failed: "checkoffs" });
    case "long-text":
      return inGroup(
        origin,
        { id: OWNER_ID, nickname: LONG_NICKNAME },
        {
          group: { ...MORNING_CREW, name: LONG_GROUP_NAME },
          members: [member(OWNER_ID, LONG_NICKNAME, true), ...MEMBERS.slice(1)],
          tasks: [{ ...TASKS[0], title: LONG_TASK_TITLE }, ...TASKS.slice(1)],
        },
      );
  }
}

/** The props `SettingsView` gets in one state. Builds fresh objects on every call. */
// A well-formed VAPID public key shape (65 bytes, base64url); the kitchen sink never subscribes with it.
const VAPID_PUBLIC_KEY = `B${"A".repeat(86)}`;

export function settingsFixture(id: SettingsStateId): SettingsViewProps {
  const reminders = (state: PushState, hasSubscriptions: boolean) => ({
    reminders: { vapidPublicKey: state === "unsupported" ? null : VAPID_PUBLIC_KEY, hasSubscriptions },
    remindersState: state,
  });
  const healthy = { loadFailed: false, error: null, notice: null, ...reminders("off", false) };
  const owner = { viewerId: OWNER_ID, email: OWNER_EMAIL, nickname: OWNER_NICKNAME };
  switch (id) {
    case "settings-owner":
      return { ...healthy, ...owner, group: { ...MORNING_CREW }, members: [...MEMBERS] };
    case "settings-owner-alone":
      return { ...healthy, ...owner, group: { ...MORNING_CREW }, members: [member(OWNER_ID, OWNER_NICKNAME, true)] };
    case "settings-member":
      return {
        ...healthy,
        group: { ...MORNING_CREW },
        members: [...MEMBERS],
        viewerId: MEMBER_ID,
        email: MEMBER_EMAIL,
        nickname: MEMBER_NICKNAME,
      };
    case "settings-no-group":
      return {
        ...healthy,
        group: null,
        members: [],
        viewerId: OUTSIDER_ID,
        email: OUTSIDER_EMAIL,
        nickname: OUTSIDER_NICKNAME,
      };
    case "settings-load-failed":
      return {
        ...owner,
        ...reminders("off", false),
        group: null,
        members: [],
        loadFailed: true,
        error: groupErrorMessage("unknown"),
        notice: null,
      };
    case "settings-reminders-off":
      return { ...healthy, ...owner, group: { ...MORNING_CREW }, members: [...MEMBERS] };
    case "settings-reminders-on":
      return { ...healthy, ...owner, ...reminders("on", true), group: { ...MORNING_CREW }, members: [...MEMBERS] };
    case "settings-reminders-unsupported":
      return {
        ...healthy,
        ...owner,
        ...reminders("unsupported", false),
        group: { ...MORNING_CREW },
        members: [...MEMBERS],
      };
    case "settings-reminders-denied":
      return { ...healthy, ...owner, ...reminders("denied", true), group: { ...MORNING_CREW }, members: [...MEMBERS] };
  }
}

/** The props `NicknameView` (and `AppLayout`) get in one state. Builds fresh objects on every call. */
export function nicknameFixture(id: NicknameStateId): NicknameViewProps {
  const choosing = { mode: "choose", nickname: null } as const;
  switch (id) {
    case "nickname-choose":
      return { ...choosing, suggestion: "", error: null };
    case "nickname-suggested":
      // `suggestNickname` takes the name Google puts into the account's metadata, when it passes the nickname rules.
      return { ...choosing, suggestion: "Nora Lindqvist", error: null };
    case "nickname-change":
      return { mode: "change", nickname: OWNER_NICKNAME, suggestion: OWNER_NICKNAME, error: null };
    case "nickname-error":
      return { ...choosing, suggestion: "", error: nicknameErrorMessage("nickname_taken") };
  }
}
