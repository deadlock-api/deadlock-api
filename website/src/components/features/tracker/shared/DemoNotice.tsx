import { Link } from "@tanstack/react-router";
import { FlaskConical } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { usePatronAuth } from "~/hooks/usePatronAuth";

/** Says, before anything else on the page, that the profile below is generated and how to get a real one. */
export function DemoNotice() {
  const { isAuthenticated, login } = usePatronAuth();
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
          before signing in. Your own profile shows your real match history, rank progression and teammates.
        </p>
        <div className="flex flex-wrap gap-2">
          {isAuthenticated ? (
            <Button size="sm" asChild>
              <Link to="/tracker">Your accounts</Link>
            </Button>
          ) : (
            <Button size="sm" onClick={login}>
              Sign in with Patreon
            </Button>
          )}
          <Button size="sm" variant="outline" asChild>
            <Link to="/patron">Learn more</Link>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
