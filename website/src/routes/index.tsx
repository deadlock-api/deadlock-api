import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  Code,
  Database,
  HardDrive,
  Heart,
  ListOrdered,
  Map,
  Medal,
  Package,
  ShoppingBag,
  Swords,
  Trophy,
  Tv,
  Users,
  UsersRound,
} from "lucide-react";

import { OptimizedImage } from "~/components/domain/assets/OptimizedImage";
import { SmartLink } from "~/components/domain/navigation/SmartLink";
import { LinkCard } from "~/components/patterns/content/LinkCard";
import { LogoWallItem } from "~/components/patterns/content/LogoWall";
import { Prose } from "~/components/patterns/content/Prose";
import { Hero, HeroActions, HeroLead } from "~/components/patterns/page/Hero";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Section } from "~/components/patterns/page/Section";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Grid } from "~/components/ui/grid";
import { IconTile } from "~/components/ui/icon-tile";
import { Separator } from "~/components/ui/separator";
import { Inline, Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { TextLink } from "~/components/ui/text-link";
import { API_ORIGIN } from "~/lib/constants";
import { seo } from "~/lib/seo";

export const Route = createFileRoute("/")({
  head: () =>
    seo({
      title: "Deadlock Stats Tracker: Win Rates, Ranks & Leaderboards",
      description:
        "Deadlock stats tracker with hero win rates, pick rates, item analytics, rank distribution, and leaderboards. Free community tool with live data from Valve's servers.",
      path: "/",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Deadlock API",
          alternateName: "deadlock-api.com",
          url: "https://deadlock-api.com",
        },
        {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Deadlock API",
          url: "https://deadlock-api.com",
          logo: "https://deadlock-api.com/favicon.png",
          sameAs: [
            "https://github.com/deadlock-api",
            "https://discord.gg/pqWQfTPQJu",
            "https://www.patreon.com/c/manuelhexe",
          ],
        },
      ],
    }),
  component: IndexRoute,
});

const valueProps = [
  {
    label: "Open Source",
    href: "https://github.com/deadlock-api/",
    icon: Code,
    title: "Visit our GitHub Organization",
    external: true,
  },
  {
    label: "Open Data",
    href: "/data-dumps",
    icon: Database,
    title: "Hourly-updated public data lake",
    external: false,
  },
  {
    label: "Free to Use",
    href: "https://www.patreon.com/c/manuelhexe",
    icon: Heart,
    title: "Based on Sponsoring",
    external: true,
  },
];

const services = [
  {
    title: "Game Data API",
    description: "Offers game data including matches, players, and statistics.",
    href: API_ORIGIN,
    icon: BarChart3,
    external: true,
    cta: "Visit Game Data API",
  },
  {
    title: "UI Components",
    description: "Drop-in Web Components (React/Vue/HTML) to visualize items, tooltips, and the full in-game shop.",
    href: "https://ui.deadlock-api.com/",
    icon: Package,
    external: true,
    cta: "Explore UI Components",
  },
  {
    title: "Data Lake",
    description: "Query or download the hourly-updated public data lake for offline analysis or research.",
    href: "/data-dumps",
    icon: HardDrive,
    external: false,
    cta: "Access Database Dumps",
  },
];

const analyticsLinks = [
  {
    title: "Hero Analytics",
    description: "Win rates, matchups, synergies, and performance trends across patches for every hero.",
    href: "/analytics/heroes",
    icon: Swords,
  },
  {
    title: "Item Analytics",
    description: "Item win rates with confidence intervals, purchase timing analysis, and item combos.",
    href: "/analytics/items",
    icon: ShoppingBag,
  },
  {
    title: "Game Analytics",
    description: "Match duration, game mode stats, and overall gameplay trends over time.",
    href: "/analytics/games",
    icon: BarChart3,
  },
  {
    title: "Ability Analytics",
    description: "Ability upgrade paths, skill build popularity, and win rate by leveling order.",
    href: "/analytics/abilities",
    icon: ListOrdered,
  },
  {
    title: "Team Builder",
    description: "Draft a full 6v6, set the lanes, and read the predicted win rate from live matchup data.",
    href: "/analytics/team-builder",
    icon: UsersRound,
  },
  {
    title: "Leaderboard",
    description: "Top ranked players across all regions with hero filters and rank search.",
    href: "/community/leaderboard",
    icon: Trophy,
  },
  {
    title: "Player Analytics",
    description: "Compare player performance across matches and view stat distributions.",
    href: "/analytics/players",
    icon: Users,
  },
  {
    title: "Rank Distribution",
    description: "See how the player base is distributed across ranks over time.",
    href: "/community/badge-distribution",
    icon: Medal,
  },
  {
    title: "Kill Heatmap",
    description: "Visualize where kills happen on the map to understand positioning and hotspots.",
    href: "/community/heatmap",
    icon: Map,
  },
  {
    title: "Stream Kit",
    description: "Enhance your livestreams with real-time game data overlays and widgets.",
    href: "/streamkit",
    icon: Tv,
  },
];

const mainSponsor = {
  href: "https://www.deadchaps.gg/?ref=deadlock-api.com",
  title: "DeadChaps",
  logo: "/logo/deadchaps@2x.png" as const,
  width: 600,
  height: 127,
};

const sponsors = [
  {
    href: "https://statlocker.gg/?ref=deadlock-api.com",
    title: "Statlocker.GG",
    logo: "/logo/statlocker.png" as const,
    width: 414,
    height: 114,
  },
  {
    href: "https://blast.tv/?ref=deadlock-api.com",
    title: "Blast.TV",
    logo: "/logo/blast.svg" as const,
    width: 996,
    height: 188,
  },
  {
    href: "https://edl.gg",
    title: "EDL",
    logo: "/logo/edl.webp" as const,
    width: 578,
    height: 177,
  },
];

function IndexRoute() {
  return (
    <PageShell density="marketing">
      <Hero size="sm">
        <Stack gap={2} align="center">
          <PageHeader size="display" title="Deadlock API" />
          <Text variant="eyebrow">sponsored by</Text>
          <Card asChild tone="primary" size="sm" interaction="pressable" className="px-4">
            <a href={mainSponsor.href} title={mainSponsor.title} target="_blank" rel="noreferrer">
              <OptimizedImage
                src={mainSponsor.logo}
                widths={[192, 240, 384, 480, 576, 720]}
                sizes="(min-width: 1024px) 227px, 189px"
                alt={`${mainSponsor.title} Logo`}
                width={600}
                height={127}
                className="h-auto w-47 object-contain lg:w-57"
              />
            </a>
          </Card>
        </Stack>

        <HeroActions>
          {valueProps.map((prop) => (
            <Button key={prop.label} asChild variant="outline" shape="pill">
              <SmartLink href={prop.href} external={prop.external} title={prop.title}>
                <prop.icon className="size-3.5" />
                {prop.label}
              </SmartLink>
            </Button>
          ))}
        </HeroActions>

        <HeroLead>
          Track Deadlock stats: hero win rates, pick rates, item analytics, rank distribution, and leaderboards, updated
          live from Valve's servers. A comprehensive set of endpoints also gives developers access to Deadlock game
          data, match history, player statistics, hero analytics, and more.
        </HeroLead>
      </Hero>

      <Section
        size="lg"
        align="center"
        title="Deadlock Stats, Hero Win Rates & Leaderboards"
        description="Dive into analytics, leaderboards, and visualizations powered by millions of tracked matches"
      >
        <Grid columns={{ base: 1, sm: 2, xl: 5 }}>
          {analyticsLinks.map((item) => {
            const Icon = item.icon;
            return (
              <LinkCard
                key={item.title}
                asChild
                size="sm"
                title={item.title}
                description={item.description}
                cta="View"
                media={
                  <IconTile size="sm" hover="card">
                    <Icon />
                  </IconTile>
                }
              >
                <SmartLink href={item.href}>{null}</SmartLink>
              </LinkCard>
            );
          })}
        </Grid>
      </Section>

      <Section
        size="lg"
        align="center"
        title="Developer Services"
        description="APIs, tools, and data for the Deadlock community"
      >
        <Grid columns={{ base: 1, sm: 2, lg: 3 }} gap={4}>
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <LinkCard
                key={service.title}
                asChild
                title={service.title}
                description={service.description}
                cta={service.cta}
                external={service.external}
                media={
                  <IconTile hover="card">
                    <Icon />
                  </IconTile>
                }
              >
                <SmartLink href={service.href} external={service.external}>
                  {null}
                </SmartLink>
              </LinkCard>
            );
          })}
        </Grid>
      </Section>

      <Section
        size="lg"
        align="center"
        title="Our Sponsors"
        description="Supporting the Deadlock API and the community"
      >
        <Inline justify="center" gap={8}>
          {[mainSponsor, ...sponsors].map((sponsor) => (
            <LogoWallItem key={sponsor.href} href={sponsor.href} title={sponsor.title} target="_blank" rel="noreferrer">
              <OptimizedImage
                src={sponsor.logo}
                widths={[140, 280, 420]}
                sizes="140px"
                alt={`${sponsor.title} Logo`}
                width={sponsor.width}
                height={sponsor.height}
                loading="lazy"
                fetchPriority="low"
                className="max-h-10 max-w-35 object-contain"
              />
            </LogoWallItem>
          ))}
        </Inline>
        <Inline justify="center">
          <TextLink
            href="https://www.patreon.com/c/manuelhexe"
            target="_blank"
            rel="noopener noreferrer"
            underline="always"
            className="text-xs font-medium"
            title="Support on Patreon"
          >
            Become a sponsor
          </TextLink>
        </Inline>
      </Section>

      <Section size="lg" align="center" title="What is Deadlock?">
        <Prose className="mx-auto w-full max-w-3xl">
          <p>
            Deadlock is a team-based multiplayer game developed and published by Valve that combines elements of
            third-person shooters and MOBAs. Players choose from a roster of heroes, each with unique abilities, and
            compete in objective-based matches. The game features a deep item system, competitive ranked play, and a
            rapidly evolving meta shaped by frequent balance patches.
          </p>
          <p>
            Deadlock API tracks match data for millions of players, providing the community with detailed hero win
            rates, item statistics with confidence intervals, ability upgrade path analysis, and competitive
            leaderboards across all regions. All data is updated in real time and can be filtered by rank, patch, game
            mode, and date range.
          </p>
        </Prose>
      </Section>

      <Section size="lg" align="center" title="How Our Data Works">
        <Prose className="mx-auto w-full max-w-3xl">
          <p>
            Deadlock API collects publicly available match data through Valve's game client APIs. Every tracked match is
            processed to extract hero performance, item purchases, ability upgrade paths, and average match rankings.
            Statistics like win rates and pick rates are computed with statistical confidence intervals to ensure
            reliability.
          </p>
          <p>
            The platform is fully open source and provides free access to all data, including hourly database dumps for
            researchers and developers. A $1.50/month patron tier offers prioritized data fetching for personal Steam
            accounts, ensuring your matches and stats are always up to date.
          </p>
        </Prose>
      </Section>

      <Stack gap={6}>
        <Separator />
        <Text as="p" variant="caption" tone="muted" align="center">
          <TextLink href="https://deadlock-api.com" title="Deadlock API" underline="always" className="font-medium">
            deadlock-api.com
          </TextLink>{" "}
          is not endorsed by Valve and does not reflect the views or opinions of Valve or anyone officially involved in
          producing or managing Valve properties.
        </Text>
      </Stack>
    </PageShell>
  );
}
