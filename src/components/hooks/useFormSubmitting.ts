import { useEffect, useState } from "react";

const PENDING_TIMEOUT_MS = 15_000;

/**
 * Tracks the pending state of a native (non-fetch) form POST.
 * Restored pages (bfcache, "Back" button) keep React state in memory, so the flag is reset on `pageshow`.
 * An aborted request (offline, Stop) never navigates, so the flag also expires after a timeout.
 */
export function useFormSubmitting() {
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!submitting) return;
    const timer = window.setTimeout(() => {
      setSubmitting(false);
    }, PENDING_TIMEOUT_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [submitting]);

  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) setSubmitting(false);
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  return [submitting, setSubmitting] as const;
}
