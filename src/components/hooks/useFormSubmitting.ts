import { useEffect, useState } from "react";

/**
 * Tracks the pending state of a native (non-fetch) form POST.
 * Restored pages (bfcache, "Back" button) keep React state in memory, so the flag is reset on `pageshow`.
 */
export function useFormSubmitting() {
  const [submitting, setSubmitting] = useState(false);

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
