import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IN_APP_BROWSER_PATTERNS,
  INSTALL_DISMISSED_KEY,
  classifyInstall,
  dismissInstall,
  getInstallPrompt,
  installStorage,
  isInstallDismissed,
  isIosUserAgent,
  listenForInstallPrompt,
  onInstallPromptChange,
  promptInstall,
  readInstallEnvironment,
  type InstallEnvironment,
  type InstallStorage,
  type InstallWindow,
} from "@/lib/pwa/install";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  // iPadOS 13+ Safari asks for the desktop site, so it reads like macOS Safari; only the touch points differ.
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  macSafari16:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
  iphoneEdge:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/126.0.2592.56 Version/17.0 Mobile/15E148 Safari/604.1",
  iphoneFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15",
  iphoneMessenger:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/466.0.0.47.109;FBBV/608052540;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBCR/;FBID/phone;FBLC/pl_PL;FBOP/5;FBRV/0]",
  androidInstagram:
    "Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 Instagram 334.0.0.42.95 Android (34/14; 480dpi; 1080x2340; samsung; SM-S911B; dm3q; qcom; pl_PL; 609288488)",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0",
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  desktopEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
  desktopFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
};

function env(userAgent: string, overrides: Partial<InstallEnvironment> = {}): InstallEnvironment {
  return { userAgent, maxTouchPoints: 0, standalone: false, hasPrompt: false, ...overrides };
}

describe("classifyInstall", () => {
  it("offers Add to Home Screen in Safari on iPhone and on iPad (a Mac user agent with touch points)", () => {
    expect(classifyInstall(env(UA.iphoneSafari, { maxTouchPoints: 5 }))).toBe("ios-safari");
    expect(classifyInstall(env(UA.macSafari, { maxTouchPoints: 5 }))).toBe("ios-safari");
  });

  it("tells Chrome, Edge and Firefox on iPhone apart from Safari", () => {
    expect(classifyInstall(env(UA.iphoneChrome, { maxTouchPoints: 5 }))).toBe("ios-other");
    expect(classifyInstall(env(UA.iphoneEdge, { maxTouchPoints: 5 }))).toBe("ios-other");
    expect(classifyInstall(env(UA.iphoneFirefox, { maxTouchPoints: 5 }))).toBe("ios-other");
  });

  it("sends in-app browsers out before the iOS check, and never offers them the prompt", () => {
    expect(classifyInstall(env(UA.iphoneMessenger, { maxTouchPoints: 5 }))).toBe("in-app");
    expect(classifyInstall(env(UA.androidInstagram, { maxTouchPoints: 5, hasPrompt: true }))).toBe("in-app");
    expect(classifyInstall(env(UA.androidWebView, { maxTouchPoints: 5 }))).toBe("in-app");
  });

  it("matches every in-app token on its own", () => {
    for (const token of IN_APP_BROWSER_PATTERNS) {
      expect(classifyInstall(env(`${UA.androidChrome} ${token}`)), token).toBe("in-app");
    }
  });

  it("offers the install button when Chromium handed over its event, and the menu without it", () => {
    expect(classifyInstall(env(UA.androidChrome, { maxTouchPoints: 5, hasPrompt: true }))).toBe("prompt");
    expect(classifyInstall(env(UA.androidChrome, { maxTouchPoints: 5 }))).toBe("chromium-menu");
    expect(classifyInstall(env(UA.desktopChrome))).toBe("chromium-menu");
    expect(classifyInstall(env(UA.macChrome))).toBe("chromium-menu");
    expect(classifyInstall(env(UA.desktopEdge))).toBe("chromium-menu");
    expect(classifyInstall(env(UA.desktopEdge, { hasPrompt: true }))).toBe("prompt");
  });

  it("offers Add to Dock in Safari 17 or later on a Mac", () => {
    expect(classifyInstall(env(UA.macSafari))).toBe("macos-safari");
    expect(classifyInstall(env(UA.macSafari, { maxTouchPoints: 1 }))).toBe("macos-safari");
    expect(classifyInstall(env(UA.macSafari16))).toBe("none");
  });

  it("offers nothing where no install path is known", () => {
    expect(classifyInstall(env(UA.desktopFirefox))).toBe("none");
    expect(classifyInstall(env(UA.androidFirefox, { maxTouchPoints: 5 }))).toBe("none");
    // Other Chromium browsers have their own menus; their own event still gives the button.
    expect(classifyInstall(env(UA.androidSamsung, { maxTouchPoints: 5 }))).toBe("none");
    expect(classifyInstall(env(UA.androidSamsung, { maxTouchPoints: 5, hasPrompt: true }))).toBe("prompt");
  });

  it("is installed in standalone mode whatever the user agent", () => {
    for (const userAgent of Object.values(UA)) {
      expect(classifyInstall(env(userAgent, { standalone: true, hasPrompt: true })), userAgent).toBe("installed");
    }
  });
});

describe("isIosUserAgent", () => {
  it("is true for iPhone and for a Mac user agent with touch points only", () => {
    expect(isIosUserAgent(UA.iphoneMessenger, 5)).toBe(true);
    expect(isIosUserAgent(UA.macSafari, 5)).toBe(true);
    expect(isIosUserAgent(UA.macSafari, 0)).toBe(false);
    expect(isIosUserAgent(UA.androidInstagram, 5)).toBe(false);
  });
});

/** A `beforeinstallprompt` event whose dialog the test answers. */
function installEvent({ outcome = "accepted" as "accepted" | "dismissed", prompt = vi.fn(() => Promise.resolve()) }) {
  return Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome, platform: "web" }),
  });
}

describe("install prompt", () => {
  let stop: () => void = () => undefined;
  afterEach(() => {
    stop();
  });

  function listen() {
    const target = new EventTarget();
    stop = listenForInstallPrompt(target);
    return target;
  }

  it("is unavailable before the browser sends the event", async () => {
    listen();
    expect(getInstallPrompt()).toBeNull();
    expect(await promptInstall()).toBe("unavailable");
  });

  it("keeps the event, stops the browser's own banner and tells subscribers", () => {
    const target = listen();
    const changed = vi.fn();
    const unsubscribe = onInstallPromptChange(changed);
    const event = installEvent({});
    target.dispatchEvent(event);
    unsubscribe();
    target.dispatchEvent(new Event("appinstalled"));

    expect(event.defaultPrevented).toBe(true);
    expect(changed).toHaveBeenCalledOnce();
  });

  it("opens the dialog once, resolves to the user's choice and forgets the event", async () => {
    const target = listen();
    const accepted = installEvent({ outcome: "accepted" });
    target.dispatchEvent(accepted);
    const changed = vi.fn();
    const unsubscribe = onInstallPromptChange(changed);

    const first = promptInstall();
    const second = promptInstall();
    expect(await first).toBe("accepted");
    expect(await second).toBe("accepted");
    expect(accepted.prompt).toHaveBeenCalledOnce();
    expect(getInstallPrompt()).toBeNull();
    expect(changed).toHaveBeenCalledOnce();
    expect(await promptInstall()).toBe("unavailable");
    unsubscribe();

    target.dispatchEvent(installEvent({ outcome: "dismissed" }));
    expect(await promptInstall()).toBe("dismissed");
    expect(getInstallPrompt()).toBeNull();
  });

  it("is unavailable, and forgets the event, when the browser refuses the dialog", async () => {
    const target = listen();
    target.dispatchEvent(installEvent({ prompt: vi.fn(() => Promise.reject(new Error("InvalidStateError"))) }));

    expect(await promptInstall()).toBe("unavailable");
    expect(getInstallPrompt()).toBeNull();
  });

  it("forgets the event and reports the app installed after appinstalled", () => {
    const target = listen();
    const page = fakeWindow(UA.androidChrome);
    target.dispatchEvent(installEvent({}));
    expect(classifyInstall(readInstallEnvironment(page))).toBe("prompt");

    const changed = vi.fn();
    const unsubscribe = onInstallPromptChange(changed);
    target.dispatchEvent(new Event("appinstalled"));
    unsubscribe();

    expect(getInstallPrompt()).toBeNull();
    expect(changed).toHaveBeenCalledOnce();
    expect(readInstallEnvironment(page)).toMatchObject({ standalone: true, hasPrompt: false });
  });

  it("stops listening after the cleanup", () => {
    const target = listen();
    stop();
    target.dispatchEvent(installEvent({}));
    expect(getInstallPrompt()).toBeNull();
  });
});

function fakeWindow(
  userAgent: string,
  { matching = [] as string[], standalone = undefined as boolean | undefined } = {},
) {
  const page: InstallWindow = {
    navigator: { userAgent, maxTouchPoints: 5, standalone },
    matchMedia: (query) => ({ matches: matching.includes(query) }),
  };
  return page;
}

describe("readInstallEnvironment", () => {
  it("reads the user agent and touch points, and is not standalone in a browser tab", () => {
    expect(readInstallEnvironment(fakeWindow(UA.iphoneSafari))).toEqual({
      userAgent: UA.iphoneSafari,
      maxTouchPoints: 5,
      standalone: false,
      hasPrompt: false,
    });
  });

  it("is standalone in any installed display mode or with navigator.standalone", () => {
    for (const mode of ["standalone", "fullscreen", "minimal-ui"]) {
      const page = fakeWindow(UA.androidChrome, { matching: [`(display-mode: ${mode})`] });
      expect(readInstallEnvironment(page).standalone, mode).toBe(true);
    }
    expect(readInstallEnvironment(fakeWindow(UA.iphoneSafari, { standalone: true })).standalone).toBe(true);
    expect(readInstallEnvironment(fakeWindow(UA.iphoneSafari, { standalone: false })).standalone).toBe(false);
  });
});

function memoryStorage(): InstallStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

const throwingStorage: InstallStorage = {
  getItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("quota", "QuotaExceededError");
  },
};

describe("install dismissal", () => {
  it("remembers Not now under its one key", () => {
    const storage = memoryStorage();
    expect(isInstallDismissed(storage)).toBe(false);
    expect(dismissInstall(storage)).toBe(true);
    expect(isInstallDismissed(storage)).toBe(true);
    expect(storage.getItem(INSTALL_DISMISSED_KEY)).not.toBeNull();
  });

  it("neither throws nor reports dismissed when the storage throws or is missing", () => {
    expect(isInstallDismissed(throwingStorage)).toBe(false);
    expect(dismissInstall(throwingStorage)).toBe(false);
    expect(isInstallDismissed(null)).toBe(false);
    expect(dismissInstall(null)).toBe(false);
  });

  it("gives no storage when reading localStorage throws", () => {
    const blocked = {
      get localStorage(): InstallStorage {
        throw new DOMException("blocked", "SecurityError");
      },
    };
    const storage = memoryStorage();
    expect(installStorage(blocked)).toBeNull();
    expect(installStorage({ localStorage: storage })).toBe(storage);
  });
});
