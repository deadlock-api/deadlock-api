import { Link, useNavigate } from "@tanstack/react-router";
import { Download, FlaskConical, Heart } from "lucide-react";

import { InstallButton } from "~/components/domain/ingest/InstallButton";
import { INGEST_INSTALL_PATH, INGEST_TRACKER_WINDOW_DAYS } from "~/components/domain/ingest/links";
import { PlayerSearch } from "~/components/domain/player/PlayerSearch";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { IconTile } from "~/components/ui/icon-tile";
import { Inline, Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { usePatronAuth } from "~/hooks/usePatronAuth";

function Way({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Inline asChild align="start" gap={3} wrap="nowrap">
      <li>
        <IconTile tone="primary" size="sm">
          {icon}
        </IconTile>
        <Stack gap={0.5}>
          <Text variant="label">{title}</Text>
          <Text as="p" variant="caption" tone="muted">
            {children}
          </Text>
        </Stack>
      </li>
    </Inline>
  );
}

/** Says, before anything else on the page, that the profile below is generated and how to get a real one. */
export function DemoNotice() {
  const { isAuthenticated, login } = usePatronAuth();
  const navigate = useNavigate();
  return (
    // A standing label, not an event: `alert` would interrupt a screen reader on every visit.
    <Card tone="primary" role="note" aria-label="Demo profile">
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <FlaskConical aria-hidden="true" />
          This is a demo profile
          <Badge size="sm">Demo</Badge>
        </CardTitle>
        <CardDescription>
          The player, their teammates and every match below are made-up sample data, so you can try the tracker before
          you have your own. Your own tracker shows your real match history with every build and timeline, how your rank
          moved, your stats on each hero, and the teammates and opponents you play with and against the most.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Stack gap={4}>
          <Stack gap={3} asChild>
            <ul aria-label="Ways to get your own tracker">
              <Way icon={<Download />} title="Run the ingest tool, free">
                Every Steam account the tool sent matches for in the last {INGEST_TRACKER_WINDOW_DAYS} days has its
                tracker unlocked, no sign-in needed. It also gets your matches onto every Deadlock tracker site.
              </Way>
              <Way icon={<Heart />} title="Or support us on Patreon">
                From $1.50 a month: the tracker for the Steam accounts you link, and their matches fetched first.
              </Way>
            </ul>
          </Stack>
          <Inline gap={2}>
            <InstallButton size="default" installHref={INGEST_INSTALL_PATH} />
            {isAuthenticated ? (
              <Button variant="secondary" asChild>
                <Link to="/tracker">Your accounts</Link>
              </Button>
            ) : (
              <Button variant="secondary" asChild>
                <Link to="/patron">Get Patreon</Link>
              </Button>
            )}
            <PlayerSearch
              label="Open your profile…"
              variant="outline"
              size="default"
              onValueChange={(player) =>
                void navigate({ to: "/tracker/players/$accountId", params: { accountId: String(player.accountId) } })
              }
            />
          </Inline>
          {!isAuthenticated && (
            <Text as="p" variant="caption" tone="muted">
              Already a patron?{" "}
              <Button variant="link" size="inline" onClick={login}>
                Sign in with Patreon
              </Button>
            </Text>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
