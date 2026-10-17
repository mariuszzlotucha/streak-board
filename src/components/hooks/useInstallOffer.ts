import { useState, useSyncExternalStore } from "react";
import {
  classifyInstall,
  dismissInstall,
  installStorage,
  isInstallDismissed,
  isIosUserAgent,
  onInstallPromptChange,
  promptInstall,
  readInstallEnvironment,
  type InstallOffer,
} from "@/lib/pwa/install";

// The browser facts are external stores: the server has none (so it renders nothing), and the browser reads them right
// after hydration. Only the offer changes on its own, when an install event is captured or used, or the app installed.
const noSubscription = () => () => undefined;
const liveOffer = (): InstallOffer => classifyInstall(readInstallEnvironment(window));
const storedDismissal = () => isInstallDismissed(installStorage(window));
const iosDevice = () => isIosUserAgent(window.navigator.userAgent, window.navigator.maxTouchPoints);
const onServer = () => null;
const notOnServer = () => false;

/**
 * The install offer of this browser: null until it has been read in the browser, then following the captured install
 * event. `fixedOffer` pins it (the dev kitchen sink), so the server renders it too, and skips detection and storage.
 * "Not now" is kept in local state as well, so it holds on this page even when storing it fails.
 */
export function useInstallOffer(fixedOffer?: InstallOffer) {
  const detected = useSyncExternalStore(
    fixedOffer ? noSubscription : onInstallPromptChange,
    fixedOffer ? () => fixedOffer : liveOffer,
    fixedOffer ? () => fixedOffer : onServer,
  );
  const stored = useSyncExternalStore(noSubscription, fixedOffer ? notOnServer : storedDismissal, notOnServer);
  const ios = useSyncExternalStore(noSubscription, iosDevice, notOnServer);
  const [dismissedHere, setDismissedHere] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  // A failed `prompt()` (no event left, or the browser refused) falls back to the menu instruction until the offer
  // changes, for example when Chromium hands over a fresh event.
  const [promptFailed, setPromptFailed] = useState(false);
  const [seenOffer, setSeenOffer] = useState(detected);
  if (detected !== seenOffer) {
    setSeenOffer(detected);
    setPromptFailed(false);
  }

  async function install() {
    if (pending) return;
    setPending(true);
    const choice = await promptInstall();
    setPending(false);
    if (choice === "accepted") setAccepted(true);
    if (choice === "unavailable") setPromptFailed(true);
  }

  function dismiss() {
    setDismissedHere(true);
    if (!fixedOffer) dismissInstall(installStorage(window));
  }

  const offer: InstallOffer | null = accepted
    ? "installed"
    : detected === "prompt" && promptFailed
      ? "chromium-menu"
      : detected;

  return { offer, ios, dismissed: stored || dismissedHere, pending, install, dismiss };
}
