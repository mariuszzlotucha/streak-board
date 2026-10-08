import { describe, expect, it } from "vitest";
import { landingRedirect } from "@/lib/landing";

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
