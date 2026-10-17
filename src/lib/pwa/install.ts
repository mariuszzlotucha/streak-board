// Install promotion (S-19): decides from the browser which install offer applies (an instruction or the browser's own
// install dialog), keeps the `beforeinstallprompt` event that Chromium hands the page, and remembers "Not now" on this
// device. Nothing here touches the DOM at import time: the layout script starts the listener on every page
// (src/layouts/Layout.astro), and the island reads the environment once it runs in the browser.

/**
 * What the page can offer:
 * - `installed`: the app already runs installed (or was just installed from this page), so nothing;
 * - `in-app`: a messenger's or another app's browser (a listed token, or an iOS WebView without `Safari/`), which
 *   cannot install, so "open this page in Safari or Chrome";
 * - `ios-safari`, `ios-other`: Share → Add to Home Screen, from Safari or from another iOS browser;
 * - `prompt`: Chromium handed over its install dialog (`beforeinstallprompt`), so an "Install app" button;
 * - `chromium-menu`: Chrome or Edge without that event, or a browser that sent one earlier on this page, so the
 *   browser menu's Install;
 * - `macos-safari`: File → Add to Dock (Safari 17 or later);
 * - `none`: no known install path in this browser.
 */
export type InstallOffer =
  "installed" | "in-app" | "ios-safari" | "ios-other" | "prompt" | "chromium-menu" | "macos-safari" | "none";

/** The browser facts the classification reads, so a unit test can pass them in. */
export interface InstallEnvironment {
  userAgent: string;
  /** `navigator.maxTouchPoints`: iPadOS reports a Mac user agent, but with touch points. */
  maxTouchPoints: number;
  /** The app runs installed: `display-mode` standalone, fullscreen or minimal-ui, or `navigator.standalone` (iOS). */
  standalone: boolean;
  /** A `beforeinstallprompt` event has been captured and not used yet. */
  hasPrompt: boolean;
  /** The browser sent such an event earlier on this page, so it can install from its menu once the event is used. */
  promptSeen: boolean;
}

/**
 * User-agent tokens of in-app browsers, which cannot install a web app. Matched case-sensitively as substrings; the
 * tokens are not standardised, so each names where it comes from.
 */
export const IN_APP_BROWSER_PATTERNS: readonly string[] = [
  // Facebook and Messenger on iOS: "[FBAN/FBIOS;…]", "[FBAN/MessengerForiOS;…]".
  "FBAN/",
  // Facebook and Messenger app version, on iOS and Android: "FBAV/466.0.0.47.109".
  "FBAV/",
  // Facebook and Messenger in-app browser on Android: "[FB_IAB/FB4A;…]", "[FB_IAB/MESSENGER;…]".
  "FB_IAB/",
  // Instagram on iOS and Android: "Instagram 334.0.0.42.95 …".
  "Instagram",
  // LINE on iOS and Android: "Line/13.20.0".
  "Line/",
  // WeChat: "MicroMessenger/8.0.49".
  "MicroMessenger/",
  // LinkedIn on iOS and Android: "LinkedInApp".
  "LinkedInApp",
  // Snapchat: "Snapchat/12.80.0.40".
  "Snapchat",
  // TikTok's in-app browser: "BytedanceWebview/d8a21c6".
  "BytedanceWebview",
  // TikTok's app name in its user agent: "musical_ly_34.1.4".
  "musical_ly",
  // The Google app on iOS (Google Search App): "GSA/322.0.648915268".
  "GSA/",
  // Any Android WebView inside an app: "(Linux; Android 14; Pixel 8 Build/…; wv)".
  "; wv)",
];

/** iOS browsers other than Safari: Chrome, Edge and Firefox. Their Home Screen icons reopen in that browser. */
const IOS_OTHER_BROWSERS = /CriOS\/|EdgiOS\/|FxiOS\//;

/** Chrome (desktop, Android, ChromeOS) and Edge (desktop `Edg/`, Android `EdgA/`). */
const CHROME_OR_EDGE = /Chrome\/|Edg\/|EdgA\//;

/** Chromium-based browsers whose menus differ from Chrome's and Edge's; they get `prompt` when it fires, then the menu. */
const OTHER_CHROMIUM = /SamsungBrowser\/|OPR\/|YaBrowser\/|UCBrowser\//;

/** Safari's own version token; Chrome, Edge and Firefox on a Mac do not send `Version/`. */
const SAFARI_VERSION = /Version\/(\d+)[\d.]* .*Safari\//;

/** Add to Dock arrived with Safari 17 on macOS Sonoma; Safari 17 on older macOS reports the same user agent. */
const MIN_SAFARI_ADD_TO_DOCK = 17;

/** iPhone, iPod, or an iPad, which reports "Macintosh" (iPadOS 13 and later) but has touch points, unlike a Mac. */
export function isIosUserAgent(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (userAgent.includes("Macintosh") && maxTouchPoints > 1);
}

function isInAppBrowser(userAgent: string): boolean {
  return IN_APP_BROWSER_PATTERNS.some((token) => userAgent.includes(token));
}

function isMacSafari(userAgent: string): boolean {
  if (!userAgent.includes("Macintosh") || /Chrome\/|Chromium\/|Edg\/|Firefox\/|OPR\//.test(userAgent)) return false;
  const version = SAFARI_VERSION.exec(userAgent);
  return version !== null && Number(version[1]) >= MIN_SAFARI_ADD_TO_DOCK;
}

/**
 * The offer for this browser. The order matters: an in-app browser on iPhone also matches the iOS tokens, and iOS has
 * no install dialog, so neither can reach `prompt`.
 */
export function classifyInstall(env: InstallEnvironment): InstallOffer {
  const { userAgent, maxTouchPoints } = env;
  if (env.standalone) return "installed";
  if (isInAppBrowser(userAgent)) return "in-app";
  if (isIosUserAgent(userAgent, maxTouchPoints)) {
    // Safari, Chrome, Edge and Firefox on iOS all send `Safari/`; an app's WebView without a listed token does not, and
    // it has no Add to Home Screen either.
    if (!userAgent.includes("Safari/")) return "in-app";
    return IOS_OTHER_BROWSERS.test(userAgent) ? "ios-other" : "ios-safari";
  }
  if (env.hasPrompt) return "prompt";
  if (env.promptSeen || (CHROME_OR_EDGE.test(userAgent) && !OTHER_CHROMIUM.test(userAgent))) return "chromium-menu";
  if (maxTouchPoints <= 1 && isMacSafari(userAgent)) return "macos-safari";
  return "none";
}

/** Chromium's install event; `lib.dom` has no type for it. */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  /** Shows the install dialog; an event can show it once. */
  prompt: () => Promise<void>;
}

export type InstallChoice = "accepted" | "dismissed" | "unavailable";

export type InstallPromptTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;

// One captured event per page; the layout script and the island import this same module (one shared chunk in the
// build, one module URL in `astro dev`), so both see it.
let captured: BeforeInstallPromptEvent | null = null;
let promptSeen = false;
let installedHere = false;
/** The dialog in progress, so a second click while it is open gets the same answer. */
let pending: { event: BeforeInstallPromptEvent; choice: Promise<InstallChoice> } | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => {
    listener();
  });
}

/**
 * Keeps Chromium's install event instead of letting it show the mini-infobar, so a click can open the dialog later,
 * and forgets it once the app is installed. Returns the cleanup, which also forgets the event.
 */
export function listenForInstallPrompt(target: InstallPromptTarget): () => void {
  const onPrompt = (event: Event) => {
    event.preventDefault();
    captured = event as BeforeInstallPromptEvent;
    promptSeen = true;
    notify();
  };
  const onInstalled = () => {
    captured = null;
    installedHere = true;
    notify();
  };
  target.addEventListener("beforeinstallprompt", onPrompt);
  target.addEventListener("appinstalled", onInstalled);
  return () => {
    target.removeEventListener("beforeinstallprompt", onPrompt);
    target.removeEventListener("appinstalled", onInstalled);
    captured = null;
    promptSeen = false;
    installedHere = false;
    pending = null;
  };
}

/** The captured install event, or null when none has arrived or it has been used. */
export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return captured;
}

/** Calls `listener` when an install event is captured or used, or the app is installed. Returns the unsubscribe. */
export function onInstallPromptChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Opens the browser's install dialog with the captured event and resolves to the user's choice; `unavailable` when no
 * event is held or the browser refuses to show it. A second click while the dialog is open gets the same answer.
 */
export function promptInstall(): Promise<InstallChoice> {
  const event = captured;
  if (!event) return Promise.resolve("unavailable");
  if (pending?.event === event) return pending.choice;
  const choice = (async (): Promise<InstallChoice> => {
    try {
      await event.prompt();
      return (await event.userChoice).outcome;
    } catch {
      return "unavailable";
    } finally {
      // An event shows its dialog once; Chromium may send a fresh one later.
      if (captured === event) captured = null;
      notify();
    }
  })();
  pending = { event, choice };
  return choice;
}

/** The parts of `window` the environment is read from. */
export interface InstallWindow {
  navigator: Pick<Navigator, "userAgent" | "maxTouchPoints"> & { standalone?: boolean };
  matchMedia: (query: string) => Pick<MediaQueryList, "matches">;
}

const INSTALLED_DISPLAY_MODES = ["standalone", "fullscreen", "minimal-ui"] as const;

/**
 * The environment of this browser now. After `appinstalled` the page still runs in the browser tab, but it reports
 * itself installed, so the offer disappears.
 */
export function readInstallEnvironment(win: InstallWindow): InstallEnvironment {
  const standalone =
    installedHere ||
    win.navigator.standalone === true ||
    INSTALLED_DISPLAY_MODES.some((mode) => win.matchMedia(`(display-mode: ${mode})`).matches);
  return {
    userAgent: win.navigator.userAgent,
    maxTouchPoints: win.navigator.maxTouchPoints,
    standalone,
    hasPrompt: captured !== null,
    promptSeen,
  };
}

/** The local-storage key of "Not now" on this device (named in the privacy policy). */
export const INSTALL_DISMISSED_KEY = "streakboard.install-dismissed";

export type InstallStorage = Pick<Storage, "getItem" | "setItem">;

/** `localStorage`, or null where reading it throws (blocked site data, some private modes). */
export function installStorage(win: { localStorage: InstallStorage }): InstallStorage | null {
  try {
    return win.localStorage;
  } catch {
    return null;
  }
}

/** Whether "Not now" was chosen on this device; false when the storage is missing or throws. */
export function isInstallDismissed(storage: InstallStorage | null): boolean {
  try {
    return storage?.getItem(INSTALL_DISMISSED_KEY) != null;
  } catch {
    return false;
  }
}

/** Remembers "Not now" on this device. Returns false when it could not be stored: it then lasts for this page only. */
export function dismissInstall(storage: InstallStorage | null): boolean {
  if (!storage) return false;
  try {
    storage.setItem(INSTALL_DISMISSED_KEY, "1");
    return true;
  } catch {
    return false;
  }
}
