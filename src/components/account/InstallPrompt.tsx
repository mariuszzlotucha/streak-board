import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useInstallOffer } from "@/components/hooks/useInstallOffer";
import type { InstallOffer } from "@/lib/pwa/install";

interface InstallPromptProps {
  /** `card`: the dashboard's card, with "Not now"; `inline`: the block in the Settings Reminders card, always there. */
  variant: "card" | "inline";
  /** The dev kitchen sink pins an offer; the real page reads it from the browser. */
  fixedOffer?: InstallOffer;
}

const TITLE = "Install StreakBoard";

// Push needs the installed app only on iPhone and iPad; on Android and desktop Chromium it works in the browser.
const IOS_REASON = "Reminders on iPhone work only from the installed app.";
const APP_REASON = "Open it from your home screen or dock like an app.";

const IOS_STEPS =
  "Tap Share, then Add to Home Screen. Open StreakBoard from the icon, sign in again, and turn on reminders in Settings.";

// What to do, per offer; `prompt` is the "Install app" button instead.
const STEPS: Record<Exclude<InstallOffer, "installed" | "prompt">, string[]> = {
  "ios-safari": [IOS_STEPS],
  // Chrome, Edge and Firefox on iOS can add the icon too, but it reopens in that browser.
  "ios-other": [IOS_STEPS, "For reminders, add it from Safari."],
  "chromium-menu": ["Open the browser menu ⋮ and choose Install app."],
  "macos-safari": ["In Safari, choose File → Add to Dock."],
  "in-app": ["Open this page in Safari or Chrome to install StreakBoard."],
  none: ["Your browser can't install StreakBoard; try Chrome, Edge or Safari."],
};

// How to install StreakBoard in this browser, and why. Renders nothing on the server (the offer is read in the browser)
// and nothing in the installed app; the dashboard card also hides where no install path is known, and after "Not now"
// on this device. A status, never an alert; buttons hold only their text.
export default function InstallPrompt({ variant, fixedOffer }: InstallPromptProps) {
  const { offer, ios, dismissed, pending, install, dismiss } = useInstallOffer(fixedOffer);
  if (offer === null || offer === "installed") return null;
  if (variant === "card" && (offer === "none" || dismissed)) return null;

  const reason =
    offer === "ios-safari" || offer === "ios-other" || (offer === "in-app" && ios) ? IOS_REASON : APP_REASON;
  const steps =
    offer === "prompt" ? null : (
      <div className="space-y-1">
        {STEPS[offer].map((step) => (
          <p key={step}>{step}</p>
        ))}
      </div>
    );
  const installButton =
    offer === "prompt" ? (
      <Button type="button" size="sm" disabled={pending} onClick={() => void install()}>
        Install app
      </Button>
    ) : null;

  if (variant === "inline") {
    return (
      <div className="flex flex-col items-start gap-2 border-t pt-4 text-sm" data-install-offer={offer}>
        <h3 className="font-medium">{TITLE}</h3>
        <p className="text-muted-foreground">{reason}</p>
        {steps}
        {installButton}
      </div>
    );
  }

  return (
    <Card data-install-offer={offer}>
      <CardHeader>
        <CardTitle as="h2">{TITLE}</CardTitle>
        <CardDescription>{reason}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        {steps}
        <div className="flex flex-wrap gap-3">
          {installButton}
          <Button type="button" size="sm" variant="outline" onClick={dismiss}>
            Not now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
