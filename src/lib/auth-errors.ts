import { MIN_PASSWORD_LENGTH } from "@/lib/auth-rules";

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

export type SignUpErrorCode =
  "email_taken" | "weak_password" | "invalid_input" | "rate_limited" | "not_configured" | "unknown";

export interface SignUpErrorResolution {
  message: string;
  field?: "email" | "password";
}

const SIGN_UP_ERRORS: Record<SignUpErrorCode, SignUpErrorResolution> = {
  email_taken: { message: "An account with this email already exists. Sign in instead.", field: "email" },
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
