import { Link } from "react-router";

import { Button } from "~/components/ui/button";
import { useAnalyticsConsent } from "~/hooks/useAnalyticsConsent";

export function CookieConsentBanner() {
  const { consent, accept, decline } = useAnalyticsConsent();

  if (consent !== null) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 rounded-xl border border-white/10 bg-background/90 p-4 shadow-2xl backdrop-blur-md sm:flex-row sm:p-6">
        <p className="text-sm text-muted-foreground">
          We use analytics (PostHog, hosted in the EU) to improve this site. This requires cookies.{" "}
          <Link to="/data-privacy" className="text-primary underline underline-offset-4 hover:text-primary/80">
            Learn more
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={decline}>
            Decline
          </Button>
          <Button onClick={accept}>Accept</Button>
        </div>
      </div>
    </div>
  );
}
