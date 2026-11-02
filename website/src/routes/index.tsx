import { createFileRoute } from "@tanstack/react-router";
import {
  Code,
  Gamepad2,
  type LucideIcon,
  Trophy,
  Wrench,
  BarChart3,
  Database,
  Download,
  HardDrive,
  Heart,
  Package,
} from "lucide-react";

import { OptimizedImage } from "~/components/domain/assets/OptimizedImage";
import { useInstallCtaTracking } from "~/components/domain/ingest/analytics";
import { InstallButton } from "~/components/domain/ingest/InstallButton";
import { INGEST_INSTALL_PATH, WINDOWS_SETUP_URL } from "~/components/domain/ingest/links";
import { SmartLink } from "~/components/domain/navigation/SmartLink";
import { AiSearch } from "~/components/features/ai-search/AiSearch";
import { LogoWallItem } from "~/components/patterns/content/LogoWall";
import { Prose } from "~/components/patterns/content/Prose";
import { SideNav, SideNavGroup, SideNavItem } from "~/components/patterns/navigation/SideNav";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Section } from "~/components/patterns/page/Section";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { Button } from "~/components/ui/button";
import { Grid } from "~/components/ui/grid";
import { Inline, Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { TextLink } from "~/components/ui/text-link";
import { useIsWindows } from "~/hooks/useIsWindows";
import { API_ORIGIN } from "~/lib/constants";
import { ORGANIZATION, pageTitle, seo, SITE_URL } from "~/lib/seo";
import { navGroups } from "~/lib/site-nav";
import { TRACKER_SITES } from "~/lib/tracker-sites";

export const Route = createFileRoute("/")({
  head: () =>
    seo({
      title: pageTitle("Deadlock Stats Tracker: Win Rates & Ranks"),
      description:
        "Deadlock stats tracker with hero win rates, pick rates, item analytics, rank distribution, and leaderboards. Free community tool with live data from Valve's servers.",
      path: "/",
      jsonLd: {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebSite",
            "@id": `${SITE_URL}/#website`,
            name: "Deadlock API",
            alternateName: "deadlock-api.com",
            url: SITE_URL,
            inLanguage: "en",
            publisher: { "@id": ORGANIZATION["@id"] },
          },
          {
            ...ORGANIZATION,
            description: "Free, open-source game statistics, analytics and REST API for Valve's Deadlock.",
            sameAs: [
              "https://github.com/deadlock-api",
              "https://discord.gg/pqWQfTPQJu",
              "https://www.patreon.com/c/manuelhexe",
            ],
          },
          {
            "@type": "WebAPI",
            "@id": "https://api.deadlock-api.com/#api",
            name: "Deadlock API",
            description: "Public REST API for Deadlock matches, players, heroes, items and leaderboards.",
            url: "https://api.deadlock-api.com/",
            documentation: "https://api.deadlock-api.com/docs",
            provider: { "@id": ORGANIZATION["@id"] },
            isAccessibleForFree: true,
          },
        ],
      },
    }),
  component: IndexRoute,
});

const valueProps = [
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

interface DirectoryEntry {
  label: string;
  icon: LucideIcon;
  links: { to: string; label: string; icon: LucideIcon; external?: boolean }[];
}

const groupLinks = (label: string) => navGroups.find((group) => group.label === label)?.links ?? [];

/**
 * The directory: the sidebar's sections (without the patron and tracker entries, not this page's subject) and the
 * developer services, in three columns of about one height: Analytics, Community over Games, Tools over services.
 */
const DIRECTORY_COLUMNS: DirectoryEntry[][] = [
  [{ label: "Analytics", icon: BarChart3, links: groupLinks("Analytics") }],
  [
    { label: "Community", icon: Trophy, links: groupLinks("Community") },
    { label: "Games", icon: Gamepad2, links: groupLinks("Games") },
  ],
  [
    { label: "Tools", icon: Wrench, links: groupLinks("Tools") },
    {
      label: "Developer Services",
      icon: Code,
      links: services.map((service) => ({
        to: service.href,
        label: service.title,
        icon: service.icon,
        external: service.external,
      })),
    },
  ],
];

function IndexRoute() {
  const isWindows = useIsWindows();
  const installTracking = useInstallCtaTracking("home", isWindows ? "download" : "install_steps");
  return (
    <PageShell density="content">
      {/* One grid down the page: every row spans the content width, panels beside each other share their height. */}
      <Grid columns={{ base: 1, lg: 3 }} gap={4} className="items-stretch">
        {/* What the site is, then the search, its main action: a phone reaches it without scrolling. */}
        <Stack gap={4} className="justify-center lg:col-span-2">
          <Stack gap={2}>
            <PageHeader size="display" title="Deadlock API" />
            <Text as="p" tone="muted" className="max-w-3xl type-prose">
              Track Deadlock stats: hero win rates, pick rates, item analytics, rank distribution, and leaderboards,
              updated live from Valve's servers. A comprehensive set of endpoints also gives developers access to
              Deadlock game data, match history, player statistics, hero analytics, and more.
            </Text>
          </Stack>
          <AiSearch className="max-w-3xl" />
          <Inline gap={2}>
            <InstallButton size="default" installHref={INGEST_INSTALL_PATH} placement="home_hero" />
            {valueProps.map((prop) => (
              <Button key={prop.label} asChild variant="outline">
                <SmartLink href={prop.href} external={prop.external} title={prop.title}>
                  <prop.icon className="size-3.5" />
                  {prop.label}
                </SmartLink>
              </Button>
            ))}
          </Inline>
        </Stack>

        {/* The sponsors at the top of the page: the main one first and largest, the others under it. */}
        <Panel>
          <PanelHeader title="Sponsored by" icon={Heart} size="sm" as="h2">
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
          </PanelHeader>
          <PanelBody className="flex flex-1 flex-col items-center justify-center gap-5">
            <LogoWallItem href={mainSponsor.href} title={mainSponsor.title} target="_blank" rel="sponsored noreferrer">
              <OptimizedImage
                src={mainSponsor.logo}
                widths={[192, 240, 384, 480, 576, 720]}
                sizes="(min-width: 1024px) 256px, 208px"
                alt={mainSponsor.title}
                width={600}
                height={127}
                className="h-auto w-52 object-contain lg:w-64"
              />
            </LogoWallItem>
            <Inline gap={6} justify="center">
              {sponsors.map((sponsor) => (
                <LogoWallItem
                  key={sponsor.href}
                  href={sponsor.href}
                  title={sponsor.title}
                  target="_blank"
                  rel="sponsored noreferrer"
                >
                  <OptimizedImage
                    src={sponsor.logo}
                    widths={[140, 280, 420]}
                    sizes="140px"
                    alt={sponsor.title}
                    width={sponsor.width}
                    height={sponsor.height}
                    loading="lazy"
                    fetchPriority="low"
                    className="max-h-8 max-w-28 object-contain"
                  />
                </LogoWallItem>
              ))}
            </Inline>
          </PanelBody>
        </Panel>
      </Grid>

      {/* The site's sections as the sidebar groups them, with the developer services. Three columns of one height: the
          long Analytics list beside two stacks of shorter ones. The patron and tracker entries stay in the sidebar:
          this page does not target the tracker. */}
      <Section title="Deadlock Stats, Hero Win Rates & Leaderboards">
        <Grid columns={{ base: 1, md: 3 }} gap={4} className="items-stretch">
          {DIRECTORY_COLUMNS.map((column) => (
            <Stack key={column.map((entry) => entry.label).join()} gap={4}>
              {column.map((entry, i) => (
                <Panel key={entry.label} className={i === column.length - 1 ? "flex-1" : undefined}>
                  <PanelHeader title={entry.label} icon={entry.icon} size="sm" />
                  <PanelBody size="sm">
                    <SideNav aria-label={entry.label}>
                      <SideNavGroup>
                        {entry.links.map((link) => (
                          <SideNavItem key={link.to} asChild>
                            <SmartLink href={link.to} external={link.external}>
                              <link.icon />
                              <span className="truncate">{link.label}</span>
                            </SmartLink>
                          </SideNavItem>
                        ))}
                      </SideNavGroup>
                    </SideNav>
                  </PanelBody>
                </Panel>
              ))}
            </Stack>
          ))}
        </Grid>
      </Section>

      <Panel tone="primary">
        <PanelHeader title="Track all your matches on all tracker sites" icon={Download} size="sm" as="h2" />
        <PanelBody>
          <Grid columns={{ base: 1, lg: 3 }} gap={6} className="items-center">
            <Stack gap={3}>
              <Text as="p" tone="muted">
                Install the ingest tool once and every match you play gets sent.
              </Text>
              <Inline>
                <Button asChild>
                  {isWindows ? (
                    <a href={WINDOWS_SETUP_URL} download {...installTracking}>
                      <Download aria-hidden="true" />
                      Download for Windows
                    </a>
                  ) : (
                    <SmartLink href="/ingest-cache" {...installTracking}>
                      <Download aria-hidden="true" />
                      Install the tool
                    </SmartLink>
                  )}
                </Button>
              </Inline>
            </Stack>
            {/* The sites as one dense wall of their icons. */}
            <Inline asChild gap={2} className="lg:col-span-2">
              <ul aria-label="Sites that show matches from Deadlock API">
                {TRACKER_SITES.map((site) => {
                  const icon = (
                    <img
                      src={site.icon}
                      alt={site.name}
                      title={site.name}
                      width={28}
                      height={28}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="size-7 object-contain"
                    />
                  );
                  return (
                    <li key={site.name}>
                      {site.href ? (
                        <LogoWallItem size="icon" href={site.href} target="_blank" rel="sponsored noreferrer">
                          {icon}
                        </LogoWallItem>
                      ) : (
                        icon
                      )}
                    </li>
                  );
                })}
              </ul>
            </Inline>
          </Grid>
        </PanelBody>
      </Panel>

      <Grid columns={{ base: 1, lg: 2 }} gap={4} className="items-stretch">
        <Panel>
          <PanelHeader title="What is Deadlock?" size="sm" as="h2" />
          <PanelBody>
            <Prose>
              <p>
                Deadlock is a team-based multiplayer game developed and published by Valve that combines elements of
                third-person shooters and MOBAs. Players choose from a roster of heroes, each with unique abilities, and
                compete in objective-based matches. The game features a deep item system, competitive ranked play, and a
                rapidly evolving meta shaped by frequent balance patches.
              </p>
              <p>
                Deadlock API tracks match data for millions of players, providing the community with detailed hero win
                rates, item statistics with confidence intervals, ability upgrade path analysis, and competitive
                leaderboards across all regions. New matches are added continuously, the statistics update daily, and
                all data can be filtered by rank, patch, game mode, and date range.
              </p>
            </Prose>
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="How Our Data Works" size="sm" as="h2" />
          <PanelBody>
            <Prose>
              <p>
                Deadlock API collects publicly available match data through Valve's game client APIs. Every tracked
                match is processed to extract hero performance, item purchases, ability upgrade paths, and average match
                rankings. Statistics like win rates and pick rates are computed with statistical confidence intervals to
                ensure reliability.
              </p>
              <p>
                The platform is fully open source and provides free access to all data, including hourly database dumps
                for researchers and developers. Players can help fill in the gaps with the open source ingest tool,
                which sends the matches in their Steam cache. A $1.50/month patron tier offers prioritized data fetching
                for personal Steam accounts, ensuring your matches and stats are always up to date.
              </p>
            </Prose>
          </PanelBody>
        </Panel>
      </Grid>

      <Text as="p" variant="caption" tone="muted">
        <TextLink href="https://deadlock-api.com" title="Deadlock API" underline="always" className="font-medium">
          deadlock-api.com
        </TextLink>{" "}
        is not endorsed by Valve and does not reflect the views or opinions of Valve or anyone officially involved in
        producing or managing Valve properties.
      </Text>
    </PageShell>
  );
}
