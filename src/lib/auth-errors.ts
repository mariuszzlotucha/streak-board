export type SignInErrorCode =
  "invalid_credentials" | "email_not_confirmed" | "rate_limited" | "not_configured" | "unknown";

const SIGN_IN_ERROR_MESSAGES: Record<SignInErrorCode, string> = {
  invalid_credentials: "Invalid email or password.",
  email_not_confirmed: "Please confirm your email address before signing in.",
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
