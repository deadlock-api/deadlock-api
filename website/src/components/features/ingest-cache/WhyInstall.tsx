import { ChartLine, CloudDownload, Gamepad2, History, Power, ShieldCheck } from "lucide-react";

import { INGEST_TRACKER_WINDOW_DAYS } from "~/components/domain/ingest/links";
import { SmartLink } from "~/components/domain/navigation/SmartLink";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Code } from "~/components/ui/code";
import { IconTile } from "~/components/ui/icon-tile";
import { Inline, Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { TextLink } from "~/components/ui/text-link";

function Reason({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
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

/** What the background tool does for the player, beside its install steps. */
export function WhyInstall() {
  return (
    <Card tone="primary" className="h-full">
      <CardHeader>
        <CardTitle as="h3">Why install it</CardTitle>
      </CardHeader>
      <CardContent>
        <Stack asChild gap={4}>
          <ul>
            <Reason icon={<Gamepad2 />} title="Every match you play, on every tracker">
              It sends each match as soon as Deadlock loads it, and everything already in your Steam cache.
            </Reason>
            <Reason icon={<History />} title="Your whole match history, not just new games">
              With Deadlock closed, run <Code>deadlock-api-ingest --own-matches</Code> once and it also sends your past
              matches that are still missing.
            </Reason>
            <Reason icon={<CloudDownload />} title="Finds matches nobody has yet">
              While Deadlock is closed, it uses your Steam session to fetch up to 40 missing matches a day: new matches
              of your Steam friends first, then matches nobody has sent yet.
            </Reason>
            <Reason icon={<ChartLine />} title="Unlocks your player tracker">
              Every account it sent matches for in the last {INGEST_TRACKER_WINDOW_DAYS} days gets its{" "}
              <TextLink asChild underline="always">
                <SmartLink href="/tracker/demo">player tracker</SmartLink>
              </TextLink>{" "}
              for free once we have checked one of those matches, no sign-in needed.
            </Reason>
            <Reason icon={<Power />} title="Set up once">
              It starts with your PC and stays out of the way. Nothing to click after the install.
            </Reason>
            <Reason icon={<ShieldCheck />} title="Open source and private">
              It sends match IDs and your public Steam ID, nothing else. Your Steam login is never sent to us.
            </Reason>
          </ul>
        </Stack>
      </CardContent>
    </Card>
  );
}
