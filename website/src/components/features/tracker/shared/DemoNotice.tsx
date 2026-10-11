import { Link, useNavigate } from "@tanstack/react-router";
import { FlaskConical } from "lucide-react";

import { InstallButton } from "~/components/domain/ingest/InstallButton";
import { INGEST_INSTALL_PATH, INGEST_TRACKER_WINDOW_DAYS } from "~/components/domain/ingest/links";
import { PlayerSearch } from "~/components/domain/player/PlayerSearch";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { usePatronAuth } from "~/hooks/usePatronAuth";

/** Says, before anything else on the page, that the profile below is generated and how to get a real one. */
export function DemoNotice() {
  const { isAuthenticated, login } = usePatronAuth();
  const navigate = useNavigate();
  return (
    // A standing label, not an event: `alert` would interrupt a screen reader on every visit.
    <Alert variant="primary" role="note" aria-label="Demo profile">
      <FlaskConical aria-hidden="true" />
      <AlertTitle className="flex items-center gap-2">
        <Badge size="sm">Demo</Badge>
        This is a demo profile
      </AlertTitle>
      <AlertDescription className="gap-2">
        <p>
          The player, their teammates and every match on this page are made-up sample data, so you can try the tracker
          first. Your own profile shows your real match history, rank progression and teammates.
        </p>
        <p>
          Run the free ingest tool and your own tracker unlocks automatically: every account that sent its matches in
          the last {INGEST_TRACKER_WINDOW_DAYS} days is open, no sign-in needed. Patrons get it for their prioritized
          accounts too.
        </p>
        <div className="flex flex-wrap gap-2">
          <InstallButton size="sm" installHref={INGEST_INSTALL_PATH} />
          <PlayerSearch
            label="Open your profile…"
            variant="outline"
            onValueChange={(player) =>
              void navigate({ to: "/tracker/players/$accountId", params: { accountId: String(player.accountId) } })
            }
          />
          {isAuthenticated ? (
            <Button size="sm" variant="outline" asChild>
              <Link to="/tracker">Your accounts</Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={login}>
              Sign in with Patreon
            </Button>
          )}
          <Button size="sm" variant="ghost" asChild>
            <Link to="/ingest-cache">How it works</Link>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
