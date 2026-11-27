import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { CalendarDays, Crosshair, Medal, Sparkles, Swords, Users } from "lucide-react";

import { PlayerCell } from "~/components/domain/player/PlayerCell";
import { PlayerSearch } from "~/components/domain/player/PlayerSearch";
import { Hero, HeroLead } from "~/components/patterns/page/Hero";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Section } from "~/components/patterns/page/Section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Grid } from "~/components/ui/grid";
import { IconTile } from "~/components/ui/icon-tile";
import { Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { TextLink } from "~/components/ui/text-link";
import { useSteamProfiles } from "~/hooks/useSteamProfiles";
import { recapWindowLabel } from "~/lib/year-recap/availability";
import { steamAccountsQueryOptions, usePatronStatus } from "~/queries/patron-queries";

import { RecapClosed } from "./RecapClosed";

const INSIDE = [
  {
    icon: CalendarDays,
    title: "When you played",
    text: "Every day of your year on one calendar, your peak hour and your longest streak.",
  },
  {
    icon: Medal,
    title: "Your ranked journey",
    text: "From your first rank of the year to your peak and where you ended.",
  },
  {
    icon: Swords,
    title: "Heroes and rivals",
    text: "Your main, your pool, your favourite victim and the hero that hunted you.",
  },
  {
    icon: Crosshair,
    title: "Your play style",
    text: "Gunslinger, spirit caster or brawler, read from where your damage came from.",
  },
  {
    icon: Sparkles,
    title: "Best games",
    text: "Your record kills, damage, souls and fastest win, each a link to its match.",
  },
  { icon: Users, title: "Friends", text: "The teammates you queued with most and the opponent you met most." },
] as const;

/** The prioritized accounts of a signed-in patron, each opening its recap; nothing for anyone else. */
function PatronAccounts() {
  const { data: status } = usePatronStatus();
  const hasAccounts =
    !!status && (status.is_active || status.total_slots > 0) && status.steam_accounts_summary.active_count > 0;
  const { data: accountIds = [] } = useQuery({
    ...steamAccountsQueryOptions(),
    enabled: hasAccounts,
    select: (data) =>
      data.accounts
        .filter((account) => account.deleted_at === null)
        .toSorted((a, b) => a.created_at.localeCompare(b.created_at))
        .map((account) => account.steam_id3),
  });
  const { profiles, isLoading } = useSteamProfiles(accountIds);
  if (!hasAccounts || accountIds.length === 0) return null;
  return (
    <Stack gap={2}>
      <Text variant="eyebrow">Your prioritized accounts</Text>
      <Grid columns={{ base: 1, sm: 2 }} gap={2}>
        {accountIds.map((accountId) => (
          <Card key={accountId} asChild size="sm" interaction="pressable">
            <Link to="/year-in-deadlock/$accountId" params={{ accountId: String(accountId) }}>
              <CardContent>
                <PlayerCell
                  accountId={accountId}
                  name={profiles[accountId]?.personaname}
                  avatar={profiles[accountId]?.avatar}
                  loading={isLoading}
                />
              </CardContent>
            </Link>
          </Card>
        ))}
      </Grid>
    </Stack>
  );
}

/** What the recap is and how a player opens theirs: a Steam search, or a patron's own accounts. */
export function YearRecapIndex({ year, open }: { year: number; open: boolean }) {
  const navigate = useNavigate();
  if (!open) return <RecapClosed year={year} />;
  const { opens, closes } = recapWindowLabel(year);
  return (
    <PageShell density="content" width="wide">
      <Hero>
        <PageHeader
          align="center"
          size="display"
          eyebrow="Your year, told in chapters"
          title={`Year in Deadlock ${year}`}
        />
        <HeroLead>
          Every match you played in {year}, added up: the hours, the heroes, the ranks, the rivals and the games you
          will tell your friends about. Open from {opens} until {closes}.
        </HeroLead>
      </Hero>

      <Card tone="primary" className="mx-auto w-full max-w-2xl">
        <CardHeader>
          <CardTitle as="h2">Open your recap</CardTitle>
          <CardDescription>Search your Steam name, or paste your Steam ID or profile link.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <PlayerSearch
            variant="default"
            size="lg"
            label="Find your Steam account"
            onValueChange={(player) =>
              void navigate({ to: "/year-in-deadlock/$accountId", params: { accountId: String(player.accountId) } })
            }
          />
          <PatronAccounts />
          <Text variant="caption" tone="muted">
            Recaps open for the same players as the player tracker: accounts that send their matches with the{" "}
            <TextLink asChild>
              <Link to="/ingest-cache">ingest tool</Link>
            </TextLink>
            , their Steam friends, and every account a{" "}
            <TextLink asChild>
              <Link to="/patron">patron</Link>
            </TextLink>{" "}
            prioritizes.
          </Text>
        </CardContent>
      </Card>

      <Section title="What is inside" align="center">
        <Grid columns={{ base: 1, sm: 2, xl: 3 }} gap={3}>
          {INSIDE.map(({ icon: Icon, title, text }) => (
            <Card key={title} size="sm">
              <CardContent className="flex items-start gap-3">
                <IconTile tone="primary" size="sm">
                  <Icon />
                </IconTile>
                <Stack gap={1}>
                  <CardTitle as="h3">{title}</CardTitle>
                  <Text variant="body" tone="muted">
                    {text}
                  </Text>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Grid>
      </Section>
    </PageShell>
  );
}
