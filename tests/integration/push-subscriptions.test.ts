import { createHash, randomBytes, randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  createGroupAs,
  createTaskAs,
  createTestUser,
  deleteTestUser,
  joinGroupAs,
  joinTaskAs,
  type TestUser,
  uniqueName,
} from "../helpers/supabase";

// Expectations come from the S-16 plan (context/changes/task-reminders/plan.md, Phase 2): a subscription per device,
// written only through subscribe_push / unsubscribe_push / unsubscribe_all_push on auth.uid(); the cron reads due rows
// through due_reminders and deletes dead endpoints through prune_push_subscriptions, both guarded by a secret whose
// sha256 lives in reminder_secret; the periods come in from the caller (p_today, and p_week only on Sunday).

const INSUFFICIENT_PRIVILEGE = "42501";
const SECRET = randomBytes(32).toString("base64");
const TODAY = "2030-01-06"; // a Sunday
const WEEK = "2029-12-31"; // its Monday

const endpoint = (): string => `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;

/** Well-formed keys unique to the user: "B" plus 86 base64url characters (65 bytes) and 22 characters (16 bytes). */
function keysFor(user: TestUser): { p256dh: string; auth: string } {
  const digest = createHash("sha512").update(user.id).digest("base64url");
  return { p256dh: `B${digest.slice(0, 86)}`, auth: digest.slice(0, 22) };
}

async function subscribe(user: TestUser, url: string) {
  const keys = keysFor(user);
  return user.client.rpc("subscribe_push", { p_endpoint: url, p_p256dh: keys.p256dh, p_auth: keys.auth });
}

async function adminOwnerOf(url: string): Promise<string | null> {
  const { data, error } = await adminClient()
    .from("push_subscriptions")
    .select("user_id")
    .eq("endpoint", url)
    .maybeSingle();
  if (error) throw new Error(`adminOwnerOf failed: ${error.message}`);
  return data?.user_id ?? null;
}

async function adminCheckOff(taskId: string, userId: string, period: string): Promise<void> {
  const { error } = await adminClient().from("task_checkoffs").insert({ task_id: taskId, user_id: userId, period });
  if (error) throw new Error(`adminCheckOff failed: ${error.message}`);
}

async function due(today: string, week: string | null, secret = SECRET) {
  // The generated Args type has no null for p_week; the function takes one (every day but Sunday).
  return anonClient().rpc("due_reminders", { p_secret: secret, p_today: today, p_week: week as unknown as string });
}

describe("push subscriptions", () => {
  beforeAll(async () => {
    const hash = `\\x${createHash("sha256").update(SECRET, "utf8").digest("hex")}`;
    const { error } = await adminClient().from("reminder_secret").upsert({ id: true, hash });
    if (error) throw new Error(`seeding reminder_secret failed: ${error.message}`);
  });

  describe("client functions", () => {
    let a: TestUser;
    let b: TestUser;

    beforeAll(async () => {
      a = await createTestUser();
      b = await createTestUser();
    });

    it("refuses an endpoint off the browsers' push services", async () => {
      for (const url of [
        "https://push.example/x",
        "https://fcm.googleapis.com.evil.example/x",
        "http://fcm.googleapis.com/x",
      ]) {
        const { error } = await subscribe(a, url);
        expect(error?.code).toBe("22023");
        expect(await adminOwnerOf(url)).toBeNull();
      }
      for (const url of [
        `https://updates.push.services.mozilla.com/wpush/v2/${randomUUID()}`,
        `https://web.push.apple.com/${randomUUID()}`,
        `https://wns2-db5p.notify.windows.com/w/?token=${randomUUID()}`,
      ]) {
        expect((await subscribe(a, url)).error).toBeNull();
        expect(await adminOwnerOf(url)).toBe(a.id);
      }
    });

    it("refuses malformed keys and accepts a mixed-case push host", async () => {
      const keys = keysFor(a);
      for (const [p256dh, auth] of [
        ["k", keys.auth],
        [`A${keys.p256dh.slice(1)}`, keys.auth],
        [keys.p256dh, keys.auth.slice(1)],
      ]) {
        const url = endpoint();
        const { error } = await a.client.rpc("subscribe_push", { p_endpoint: url, p_p256dh: p256dh, p_auth: auth });
        expect(error?.code).toBe("22023");
        expect(await adminOwnerOf(url)).toBeNull();
      }
      const mixed = `https://FCM.googleapis.com/fcm/send/${randomUUID()}`;
      expect((await subscribe(a, mixed)).error).toBeNull();
    });

    it("caps an account at 10 devices, while a re-subscribe of an existing one still works", async () => {
      const c = await createTestUser();
      const urls = Array.from({ length: 10 }, endpoint);
      for (const url of urls) expect((await subscribe(c, url)).error).toBeNull();
      expect((await subscribe(c, endpoint())).error?.code).toBe("54000");
      expect((await subscribe(c, urls[0])).error).toBeNull();
    });

    it("subscribe stores the caller's row, which only the caller reads", async () => {
      const url = endpoint();
      expect((await subscribe(a, url)).error).toBeNull();
      expect(await adminOwnerOf(url)).toBe(a.id);

      const own = await a.client.from("push_subscriptions").select("endpoint").eq("endpoint", url);
      expect(own.data).toEqual([{ endpoint: url }]);
      const other = await b.client.from("push_subscriptions").select("endpoint").eq("endpoint", url);
      expect(other.data).toEqual([]);
    });

    it("re-subscribing an endpoint moves it to the caller", async () => {
      const url = endpoint();
      await subscribe(a, url);
      expect((await subscribe(b, url)).error).toBeNull();
      expect(await adminOwnerOf(url)).toBe(b.id);
    });

    it("unsubscribe removes only the caller's endpoint", async () => {
      const url = endpoint();
      await subscribe(a, url);
      expect((await b.client.rpc("unsubscribe_push", { p_endpoint: url })).error).toBeNull();
      expect(await adminOwnerOf(url)).toBe(a.id);
      expect((await a.client.rpc("unsubscribe_push", { p_endpoint: url })).error).toBeNull();
      expect(await adminOwnerOf(url)).toBeNull();
    });

    it("unsubscribe-all removes every endpoint of the caller and none of another user", async () => {
      const mine = [endpoint(), endpoint()];
      const theirs = endpoint();
      for (const url of mine) await subscribe(a, url);
      await subscribe(b, theirs);
      expect((await a.client.rpc("unsubscribe_all_push")).error).toBeNull();
      for (const url of mine) expect(await adminOwnerOf(url)).toBeNull();
      expect(await adminOwnerOf(theirs)).toBe(b.id);
    });

    it("anon cannot subscribe", async () => {
      const { error } = await anonClient().rpc("subscribe_push", {
        p_endpoint: endpoint(),
        p_p256dh: "k",
        p_auth: "a",
      });
      expect(error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  describe("cron functions", () => {
    let owner: TestUser;
    let member: TestUser;
    let silent: TestUser;
    let ownerUrl: string;
    let memberUrl: string;
    let daily: string;
    let weekly: string;

    // Fresh every test: the helpers delete the test's groups (and with them the tasks) after each one.
    beforeEach(async () => {
      owner = await createTestUser();
      member = await createTestUser();
      silent = await createTestUser();
      const group = await createGroupAs(owner, uniqueName("Reminders group"));
      await joinGroupAs(member, group.joinCode);
      await joinGroupAs(silent, group.joinCode);

      daily = await createTaskAs(owner, group.id, "Walk the dog", "daily");
      await createTaskAs(owner, group.id, "Brush teeth", "daily");
      weekly = await createTaskAs(owner, group.id, "Clean the kitchen", "weekly");
      const once = await createTaskAs(owner, group.id, "Fix the shelf", "once");
      const left = await createTaskAs(owner, group.id, "Water plants", "daily");

      // The creator joins every task they create; the owner leaves "Water plants" below.
      for (const task of [daily, once, left]) {
        expect((await joinTaskAs(member, task)).error).toBeNull();
      }
      for (const user of [owner, member]) {
        const leave = await user.client.from("task_participants").delete().eq("task_id", left).eq("user_id", user.id);
        expect(leave.error).toBeNull();
      }
      // Both left "Water plants", and "silent" joins a task but has no subscription.
      expect((await joinTaskAs(silent, daily)).error).toBeNull();

      ownerUrl = endpoint();
      memberUrl = endpoint();
      await subscribe(owner, ownerUrl);
      await subscribe(member, memberUrl);
    });

    const rowFor = (rows: { endpoint: string; task_names: string[] }[] | null, url: string) =>
      rows?.find((row) => row.endpoint === url);

    it("returns unticked daily and weekly tasks, sorted by name, only when p_week is given", async () => {
      const sunday = await due(TODAY, WEEK);
      expect(sunday.error).toBeNull();
      expect(rowFor(sunday.data, ownerUrl)?.task_names).toEqual(["Brush teeth", "Clean the kitchen", "Walk the dog"]);
      expect(rowFor(sunday.data, ownerUrl)).toMatchObject(keysFor(owner));
      // once and the left task never remind.
      expect(rowFor(sunday.data, memberUrl)?.task_names).toEqual(["Walk the dog"]);
      // A participant without a subscription gets no row.
      expect(sunday.data?.some((row) => row.p256dh === keysFor(silent).p256dh)).toBe(false);

      const weekday = await due(TODAY, null);
      expect(weekday.error).toBeNull();
      expect(rowFor(weekday.data, ownerUrl)?.task_names).toEqual(["Brush teeth", "Walk the dog"]);
    });

    it("drops ticked tasks and users with nothing left", async () => {
      await adminCheckOff(daily, member.id, TODAY);
      await adminCheckOff(weekly, owner.id, WEEK);
      await adminCheckOff(daily, owner.id, "2030-01-05"); // yesterday's tick does not count today

      const { data, error } = await due(TODAY, WEEK);
      expect(error).toBeNull();
      expect(rowFor(data, ownerUrl)?.task_names).toEqual(["Brush teeth", "Walk the dog"]);
      expect(rowFor(data, memberUrl)).toBeUndefined();
    });

    it("rejects a wrong or short secret, and authenticated cannot call it", async () => {
      expect((await due(TODAY, WEEK, randomBytes(32).toString("base64"))).error?.code).toBe(INSUFFICIENT_PRIVILEGE);
      expect((await due(TODAY, WEEK, SECRET.slice(0, 31))).error?.code).toBe(INSUFFICIENT_PRIVILEGE);
      const prune = await anonClient().rpc("prune_push_subscriptions", { p_secret: "short", p_endpoints: [ownerUrl] });
      expect(prune.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await adminOwnerOf(ownerUrl)).toBe(owner.id);

      const asUser = await owner.client.rpc("due_reminders", { p_secret: SECRET, p_today: TODAY, p_week: WEEK });
      expect(asUser.error).not.toBeNull();
    });

    it("prune deletes exactly the given endpoints", async () => {
      const gone = endpoint();
      await subscribe(owner, gone);
      const { error } = await anonClient().rpc("prune_push_subscriptions", { p_secret: SECRET, p_endpoints: [gone] });
      expect(error).toBeNull();
      expect(await adminOwnerOf(gone)).toBeNull();
      expect(await adminOwnerOf(ownerUrl)).toBe(owner.id);
    });
  });

  it("deleting the account deletes its subscriptions", async () => {
    const user = await createTestUser();
    const url = endpoint();
    await subscribe(user, url);
    expect(await adminOwnerOf(url)).toBe(user.id);
    await deleteTestUser(user);
    expect(await adminOwnerOf(url)).toBeNull();
  });
});
