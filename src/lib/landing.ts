// Supabase sends the browser to the Site URL root when a Google sign-in's flow state is unknown or older than five
// minutes (bad_oauth_state), missing (bad_oauth_callback) or already used (flow_state_already_used).
const FLOW_STATE_ERRORS = ["bad_oauth_state", "bad_oauth_callback", "flow_state_already_used"];

/**
 * Where `/` sends a visitor, or `null` to render the landing page.
 *
 * A signed-in visitor goes straight to their dashboard, also with a flow-state code (a second click on "Continue with
 * Google" comes back with flow_state_already_used), so this check stays first. During an Auth outage the user is null
 * and the landing page renders. An anonymous visitor with a flow-state code gets the failure message on the sign-in
 * page instead; any other query renders the landing page as usual.
 */
export function landingRedirect(signedIn: boolean, url: URL): string | null {
  if (signedIn) return "/dashboard";
  const errorCode = url.searchParams.get("error_code");
  if (errorCode !== null && FLOW_STATE_ERRORS.includes(errorCode)) return "/auth/signin?error=oauth_failed";
  return null;
}

/**
 * Whether the landing page confirms a deleted account: `/api/account/delete` ends there with `?account=deleted` after
 * signing the visitor out. Only this exact value counts; `landingRedirect` still runs first, so a signed-in visitor never
 * sees the line.
 */
export function accountDeletedNotice(url: URL): boolean {
  return url.searchParams.get("account") === "deleted";
}
