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

// Oracle tables for the two password mappers, written from the comments of `src/lib/auth-errors.ts` and the README's
// auth notes (which name the messages, not the GoTrue codes), not by running the code: GoTrue's error code on the
// left, the app's `?error=` code on the right. The
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

  // The wording the sign-in page shows for each code (src/lib/auth-errors.ts, SIGN_IN_ERROR_MESSAGES): a blank or
  // missing message would leave the user with an alert that says nothing.
  it.each<[string, string]>([
    ["invalid_credentials", "Invalid email or password. If you signed up with Google, use Continue with Google."],
    ["email_not_confirmed", "Please confirm your email address before signing in."],
    ["link_expired", "This confirmation link has expired or was already used. If your email is confirmed, sign in."],
    ["oauth_cancelled", "Google sign-in was cancelled. Try again or sign in with your email."],
    ["oauth_failed", "Google sign-in could not be completed. Please try again."],
    ["rate_limited", "Too many attempts. Please try again later."],
    ["not_configured", "Sign-in is not available right now."],
    ["unknown", "Something went wrong. Please try again."],
  ])("pins the user-facing wording of %s", (code, message) => {
    expect(resolveSignInError(code)).toBe(message);
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

  // The message and the field each sign-up code resolves to (src/lib/auth-errors.ts, SIGN_UP_ERRORS). The password
  // minimum is `minimum_password_length = 6` in supabase/config.toml, mirrored by MIN_PASSWORD_LENGTH; the two codes
  // with a field highlight that input, the other four only show the message.
  it.each<[string, string, "email" | "password" | undefined]>([
    [
      "email_taken",
      "An account with this email already exists. Sign in instead, or use Continue with Google if you signed up with it.",
      "email",
    ],
    ["weak_password", "Password must be at least 6 characters.", "password"],
    ["invalid_input", "Check your email and password and try again.", undefined],
    ["rate_limited", "Too many attempts. Please try again later.", undefined],
    ["not_configured", "Sign-up is not available right now.", undefined],
    ["unknown", "Something went wrong. Please try again.", undefined],
  ])("pins the message and field of %s", (code, message, field) => {
    expect(resolveSignUpError(code)).toEqual(field === undefined ? { message } : { message, field });
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
