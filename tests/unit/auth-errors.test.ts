import { describe, expect, it } from "vitest";
import {
  isStaleExchangeError,
  resolveSignInError,
  resolveSignUpError,
  toGoogleExchangeErrorCode,
  toGoogleReturnErrorCode,
  toSignInErrorCode,
  toSignUpErrorCode,
} from "@/lib/auth-errors";

const STALE_CODES = ["flow_state_not_found", "flow_state_expired", "bad_code_verifier", "pkce_code_verifier_not_found"];

// Oracle tables for the two password mappers, written from the README's auth-error documentation and the module's
// comments (not by running the code): GoTrue's error code on the left, the app's `?error=` code on the right. The
// local stack auto-confirms e-mail addresses, so `email_not_confirmed` cannot be produced there: this row and the
// message test are its only automated coverage.
const SIGN_IN_ORACLE: [string, string][] = [
  ["invalid_credentials", "invalid_credentials"],
  ["email_not_confirmed", "email_not_confirmed"],
  ["over_request_rate_limit", "rate_limited"],
];
const SIGN_UP_ORACLE: [string, string][] = [
  ["user_already_exists", "email_taken"],
  ["email_exists", "email_taken"],
  ["weak_password", "weak_password"],
  ["validation_failed", "invalid_input"],
  ["anonymous_provider_disabled", "invalid_input"],
  ["email_address_invalid", "invalid_input"],
  ["over_request_rate_limit", "rate_limited"],
  ["over_email_send_rate_limit", "rate_limited"],
];
// Codes a mapper does not know must end as `unknown`, never pass through to the address bar: the other mapper's
// codes, a GoTrue code the app does not map, a made-up one and an empty one.
const UNMAPPED_SIGN_IN_CODES = ["user_already_exists", "weak_password", "signup_disabled", "something_new", ""];
const UNMAPPED_SIGN_UP_CODES = ["invalid_credentials", "email_not_confirmed", "signup_disabled", "something_new", ""];

describe("toSignInErrorCode", () => {
  it.each(SIGN_IN_ORACLE)("maps %s to %s", (code, expected) => {
    expect(toSignInErrorCode({ code })).toBe(expected);
  });

  it.each(UNMAPPED_SIGN_IN_CODES)("is unknown for the unmapped code %j", (code) => {
    expect(toSignInErrorCode({ code })).toBe("unknown");
  });

  it("is unknown without a code", () => {
    expect(toSignInErrorCode({})).toBe("unknown");
  });
});

describe("toSignUpErrorCode", () => {
  it.each(SIGN_UP_ORACLE)("maps %s to %s", (code, expected) => {
    expect(toSignUpErrorCode({ code })).toBe(expected);
  });

  it.each(UNMAPPED_SIGN_UP_CODES)("is unknown for the unmapped code %j", (code) => {
    expect(toSignUpErrorCode({ code })).toBe("unknown");
  });

  it("is unknown without a code", () => {
    expect(toSignUpErrorCode({})).toBe("unknown");
  });
});

describe("resolveSignInError", () => {
  it("resolves the Google outcomes to their fixed messages", () => {
    expect(resolveSignInError("oauth_cancelled")).toBe(
      "Google sign-in was cancelled. Try again or sign in with your email.",
    );
    expect(resolveSignInError("oauth_failed")).toBe("Google sign-in could not be completed. Please try again.");
  });

  it("points a failed password sign-in at Google", () => {
    expect(resolveSignInError("invalid_credentials")).toBe(
      "Invalid email or password. If you signed up with Google, use Continue with Google.",
    );
  });

  it.each(["Injected message", "access_denied", "server_error", "", "constructor", "__proto__", "toString"])(
    "resolves nothing for the foreign value %j",
    (param) => {
      expect(resolveSignInError(param)).toBeNull();
    },
  );

  it("resolves nothing without a parameter", () => {
    expect(resolveSignInError(null)).toBeNull();
  });
});

describe("resolveSignUpError", () => {
  it("keeps the duplicate-email field error and adds the Google hint", () => {
    const resolution = resolveSignUpError("email_taken");

    expect(resolution?.field).toBe("email");
    expect(resolution?.message).toContain("already exists");
    expect(resolution?.message).toContain("Continue with Google");
  });

  it("resolves nothing for a foreign value", () => {
    expect(resolveSignUpError("oauth_cancelled")).toBeNull();
    expect(resolveSignUpError("Injected message")).toBeNull();
    expect(resolveSignUpError(null)).toBeNull();
  });
});

describe("toGoogleReturnErrorCode", () => {
  const outcome = (query: string) => toGoogleReturnErrorCode(new URLSearchParams(query));

  it("is oauth_failed when nothing comes back", () => {
    expect(outcome("")).toBe("oauth_failed");
  });

  it("is oauth_failed for an empty code", () => {
    expect(outcome("code=")).toBe("oauth_failed");
  });

  it("is oauth_cancelled when the user denies consent", () => {
    expect(outcome("error=access_denied")).toBe("oauth_cancelled");
    expect(outcome("error=access_denied&error_description=")).toBe("oauth_cancelled");
  });

  it("is unknown when Supabase refuses after loading the state", () => {
    expect(outcome("error=access_denied&error_code=signup_disabled")).toBe("unknown");
  });

  it("is unknown for any other error", () => {
    expect(outcome("error=server_error")).toBe("unknown");
    expect(outcome("error=")).toBe("unknown");
    expect(outcome("error_code=bad_oauth_state")).toBe("unknown");
  });

  it("does not exchange a code that arrives together with an error", () => {
    expect(outcome("code=abc&error=server_error")).toBe("unknown");
    expect(outcome("code=abc&error=access_denied&error_code=signup_disabled")).toBe("unknown");
  });

  it("is null, meaning exchange, for a bare code", () => {
    expect(outcome("code=abc")).toBeNull();
  });
});

describe("toGoogleExchangeErrorCode", () => {
  it.each(STALE_CODES)("is oauth_failed for the stale code %s", (code) => {
    expect(toGoogleExchangeErrorCode({ code })).toBe("oauth_failed");
  });

  it("is rate_limited for over_request_rate_limit", () => {
    expect(toGoogleExchangeErrorCode({ code: "over_request_rate_limit" })).toBe("rate_limited");
  });

  it.each(["validation_failed", "unexpected_failure", "something_new"])("is unknown for %s", (code) => {
    expect(toGoogleExchangeErrorCode({ code })).toBe("unknown");
  });

  it("is unknown without a code", () => {
    expect(toGoogleExchangeErrorCode({})).toBe("unknown");
  });
});

describe("isStaleExchangeError", () => {
  it.each(STALE_CODES)("is true for %s", (code) => {
    expect(isStaleExchangeError({ code })).toBe(true);
  });

  it.each(["over_request_rate_limit", "validation_failed", "unexpected_failure"])("is false for %s", (code) => {
    expect(isStaleExchangeError({ code })).toBe(false);
  });

  it("is false without a code", () => {
    expect(isStaleExchangeError({})).toBe(false);
  });
});
