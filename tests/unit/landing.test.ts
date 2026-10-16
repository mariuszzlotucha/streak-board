import { describe, expect, it } from "vitest";
import { accountDeletedNotice, landingRedirect } from "@/lib/landing";

const url = (query = "") => new URL(`https://streakboard.app/${query}`);

describe("landingRedirect", () => {
  it("renders the landing page for an anonymous visitor", () => {
    expect(landingRedirect(false, url())).toBeNull();
    expect(landingRedirect(false, url("?error_code=other&foo=bar"))).toBeNull();
  });

  it.each(["bad_oauth_state", "bad_oauth_callback", "flow_state_already_used"])(
    "sends an anonymous visitor with %s to the sign-in failure message",
    (code) => {
      expect(landingRedirect(false, url(`?error_code=${code}`))).toBe("/auth/signin?error=oauth_failed");
    },
  );

  it("sends a signed-in visitor to the dashboard, before the flow-state check", () => {
    expect(landingRedirect(true, url())).toBe("/dashboard");
    expect(landingRedirect(true, url("?error_code=flow_state_already_used"))).toBe("/dashboard");
  });
});

describe("accountDeletedNotice", () => {
  it("confirms a deleted account only for account=deleted", () => {
    expect(accountDeletedNotice(url("?account=deleted"))).toBe(true);
    expect(accountDeletedNotice(url("?foo=bar&account=deleted"))).toBe(true);
  });

  it.each([
    "",
    "?account=Deleted",
    "?account=deleted-not",
    "?account=",
    "?deleted=account",
    "?error_code=bad_oauth_state",
  ])("shows nothing for %j", (query) => {
    expect(accountDeletedNotice(url(query))).toBe(false);
  });

  it("does not stop a signed-in visitor from going to the dashboard first", () => {
    expect(landingRedirect(true, url("?account=deleted"))).toBe("/dashboard");
    expect(landingRedirect(false, url("?account=deleted"))).toBeNull();
  });
});
