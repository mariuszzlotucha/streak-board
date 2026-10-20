// The closed list of codes the browser may send to `POST /api/client-errors` as a bare `text/plain` body, with the path
// and the event each one is reported as. Keep this file free of server-only imports so it is safe to bundle for the
// browser (the service worker page script, the reminders switch and the check-off island all import it).

/** The codes `POST /api/client-errors` accepts. */
export const CLIENT_ERROR_CODES = [
  "sw_register_failed",
  "sw_update_failed",
  // Reminders on this device (src/lib/pwa/push.ts).
  "push_permission_failed",
  "push_subscribe_failed",
  "push_save_failed",
  "push_unsubscribe_failed",
  "push_unsubscribe_all_failed",
  // A check-off or an undo the browser could not get an answer for (src/lib/checkoff-client.ts).
  "checkoff_failed",
  "checkoff_timeout",
  "uncheck_failed",
  "uncheck_timeout",
] as const;
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];

export const CLIENT_ERRORS_PATH = "/api/client-errors";

/**
 * The event a code is reported as. The service worker and reminder codes keep `client.sw.<code>` and the check-off codes
 * report as `client.checkoff.<code>`: the event names are what Sentry groups on, so an existing one never changes.
 */
export function clientErrorEvent(code: ClientErrorCode): string {
  return code.startsWith("sw_") || code.startsWith("push_") ? `client.sw.${code}` : `client.checkoff.${code}`;
}
