import { MIN_PASSWORD_LENGTH } from "@/lib/auth-rules";

export type SignInErrorCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "link_expired"
  | "oauth_cancelled"
  | "oauth_failed"
  | "rate_limited"
  | "not_configured"
  | "unknown";

const SIGN_IN_ERROR_MESSAGES: Record<SignInErrorCode, string> = {
  invalid_credentials: "Invalid email or password. If you signed up with Google, use Continue with Google.",
  email_not_confirmed: "Please confirm your email address before signing in.",
  link_expired: "This confirmation link has expired or was already used. If your email is confirmed, sign in.",
  oauth_cancelled: "Google sign-in was cancelled. Try again or sign in with your email.",
  oauth_failed: "Google sign-in could not be completed. Please try again.",
  rate_limited: "Too many attempts. Please try again later.",
  not_configured: "Sign-in is not available right now.",
  unknown: "Something went wrong. Please try again.",
};

export function toSignInErrorCode(error: { code?: string }): SignInErrorCode {
  switch (error.code) {
    case "invalid_credentials":
    case "email_not_confirmed":
      return error.code;
    case "over_request_rate_limit":
      return "rate_limited";
    default:
      return "unknown";
  }
}

export function resolveSignInError(param: string | null): string | null {
  if (param !== null && Object.hasOwn(SIGN_IN_ERROR_MESSAGES, param)) {
    return SIGN_IN_ERROR_MESSAGES[param as SignInErrorCode];
  }
  return null;
}

// A code exchange that fails with one of these is an expected outcome, not a fault: the attempt is older than the
// five-minute flow state, the code was already used, or the browser that returns is not the one that started.
const STALE_EXCHANGE_CODES = [
  "flow_state_not_found",
  "flow_state_expired",
  "bad_code_verifier",
  "pkce_code_verifier_not_found",
];

export function isStaleExchangeError(error: { code?: string }): boolean {
  return error.code !== undefined && STALE_EXCHANGE_CODES.includes(error.code);
}

// What the Google return route does with its query before any exchange: a code for the failure, or null when the
// request is a plain `?code=` return that has to be exchanged. A provider denial carries `error=access_denied` and no
// `error_code`; every other `error` or `error_code` (a refusal after the state was loaded, a server error) is unexpected.
export function toGoogleReturnErrorCode(params: URLSearchParams): SignInErrorCode | null {
  if (params.get("error") === "access_denied" && !params.has("error_code")) return "oauth_cancelled";
  if (params.has("error") || params.has("error_code")) return "unknown";
  if (!params.get("code")) return "oauth_failed";
  return null;
}

export function toGoogleExchangeErrorCode(error: { code?: string }): SignInErrorCode {
  if (isStaleExchangeError(error)) return "oauth_failed";
  return error.code === "over_request_rate_limit" ? "rate_limited" : "unknown";
}

export type SignUpErrorCode =
  "email_taken" | "weak_password" | "invalid_input" | "rate_limited" | "not_configured" | "unknown";

export interface SignUpErrorResolution {
  message: string;
  field?: "email" | "password";
}

const SIGN_UP_ERRORS: Record<SignUpErrorCode, SignUpErrorResolution> = {
  email_taken: {
    message:
      "An account with this email already exists. Sign in instead, or use Continue with Google if you signed up with it.",
    field: "email",
  },
  weak_password: { message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, field: "password" },
  invalid_input: { message: "Check your email and password and try again." },
  rate_limited: { message: "Too many attempts. Please try again later." },
  not_configured: { message: "Sign-up is not available right now." },
  unknown: { message: "Something went wrong. Please try again." },
};

export function toSignUpErrorCode(error: { code?: string }): SignUpErrorCode {
  switch (error.code) {
    case "user_already_exists":
    case "email_exists":
      return "email_taken";
    case "weak_password":
      return "weak_password";
    case "validation_failed":
    case "anonymous_provider_disabled":
    case "email_address_invalid":
      return "invalid_input";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "rate_limited";
    default:
      return "unknown";
  }
}

export function resolveSignUpError(param: string | null): SignUpErrorResolution | null {
  if (param !== null && Object.hasOwn(SIGN_UP_ERRORS, param)) {
    return SIGN_UP_ERRORS[param as SignUpErrorCode];
  }
  return null;
}
