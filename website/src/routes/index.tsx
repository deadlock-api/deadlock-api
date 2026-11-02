import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpen,
  Database,
  Download,
  HardDrive,
  Heart,
  type LucideIcon,
  Package,
  Swords,
} from "lucide-react";

import { HeroLinkTile } from "~/components/domain/assets/HeroLinkTile";
import { OptimizedImage } from "~/components/domain/assets/OptimizedImage";
import { useInstallCtaTracking } from "~/components/domain/ingest/analytics";
import { InstallButton } from "~/components/domain/ingest/InstallButton";
import { INGEST_INSTALL_PATH, WINDOWS_SETUP_URL } from "~/components/domain/ingest/links";
import { SmartLink } from "~/components/domain/navigation/SmartLink";
import { useHeroRoster } from "~/components/domain/selectors/useHeroPicker";
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
import { formatBlogDate } from "~/lib/blog-date";
import { fetchBlogPosts } from "~/lib/blog-fns";
import { API_ORIGIN } from "~/lib/constants";
import { prefetchCached } from "~/lib/prefetch-safe";
import { ORGANIZATION, pageTitle, seo, SITE_URL } from "~/lib/seo";
import { navGroups } from "~/lib/site-nav";
import { TRACKER_SITES } from "~/lib/tracker-sites";
import { patchListQueryOptions } from "~/queries/patch-list-query";

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
  // The newest posts only, as titles and dates: the markdown stays on the server.
  loader: async ({ context: { queryClient } }) => {
    // The latest patch for the line under the search; the heroes come from the root's prefetch.
    await prefetchCached(queryClient, patchListQueryOptions);
    return (await fetchBlogPosts()).slice(0, 3);
  },
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
  links: { to: string; label: string; icon: LucideIcon; external?: boolean }[];
}

const groupLinks = (label: string) => navGroups.find((group) => group.label === label)?.links ?? [];

/**
 * The directory, one column per section like a site map: the sidebar's sections (without the patron and tracker
 * entries, not this page's subject) and the developer services.
 */
const DIRECTORY: DirectoryEntry[] = [
  { label: "Analytics", links: groupLinks("Analytics") },
  { label: "Community", links: groupLinks("Community") },
  { label: "Games", links: groupLinks("Games") },
  { label: "Tools", links: groupLinks("Tools") },
  {
    label: "Developer Services",
    links: services.map((service) => ({
      to: service.href,
      label: service.title,
      icon: service.icon,
      external: service.external,
    })),
  },
];

function IndexRoute() {
  const posts = Route.useLoaderData();
  const { heroes } = useHeroRoster();
  const { data: patches = [] } = useQuery(patchListQueryOptions);
  const latestPatch = patches.reduce<(typeof patches)[number] | undefined>(
    (latest, patch) => (!latest || patch.startUnix > latest.startUnix ? patch : latest),
    undefined,
  );
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
          {latestPatch && (
            <Text as="p" variant="caption" tone="muted">
              Latest patch:{" "}
              <TextLink asChild tone="inherit" underline="always" className="font-medium text-foreground">
                <SmartLink href={`/patches/${latestPatch.id}`}>{latestPatch.name}</SmartLink>
              </TextLink>
            </Text>
          )}
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

      {/* Every hero, each a way into their page: the game's faces on its front page, and a link to every hero. */}
      <Panel>
        <PanelHeader title="Heroes" icon={Swords} size="sm" as="h2">
          <TextLink asChild underline="always" className="text-xs font-medium">
            <SmartLink href="/analytics/heroes">All hero stats</SmartLink>
          </TextLink>
        </PanelHeader>
        <PanelBody size="sm">
          <ul aria-label="Heroes" className="grid grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] gap-1">
            {heroes.map((hero) => (
              <li key={hero.id}>
                <HeroLinkTile hero={hero} />
              </li>
            ))}
          </ul>
        </PanelBody>
      </Panel>

      {/* The site's sections as the sidebar groups them, with the developer services: one panel, a column each. The
          patron and tracker entries stay in the sidebar: this page does not target the tracker. */}
      <Section title="Deadlock Stats, Hero Win Rates & Leaderboards">
        <Panel>
          <PanelBody>
            <SideNav
              aria-label="Site directory"
              className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5"
            >
              {DIRECTORY.map((entry) => (
                <SideNavGroup key={entry.label} label={entry.label}>
                  {entry.links.map((link) => (
                    <SideNavItem key={link.to} asChild>
                      <SmartLink href={link.to} external={link.external}>
                        <link.icon />
                        <span className="truncate">{link.label}</span>
                      </SmartLink>
                    </SideNavItem>
                  ))}
                </SideNavGroup>
              ))}
            </SideNav>
          </PanelBody>
        </Panel>
      </Section>

      <Grid columns={{ base: 1, lg: 3 }} gap={4} className="items-stretch">
        {/* Every site that shows the tool's matches, as an even grid of their icons under what the tool does. */}
        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Track all your matches on all tracker sites"
            icon={Download}
            size="sm"
            as="h2"
            description={`${TRACKER_SITES.length} sites`}
          />
          <PanelBody className="flex flex-col gap-4">
            <Inline gap={4} justify="between">
              <Text as="p" className="type-prose">
                Install the ingest tool once and every match you play gets sent.
              </Text>
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
            <ul
              aria-label="Sites that show matches from Deadlock API"
              className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-2"
            >
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
                  <li key={site.name} className="flex justify-center">
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
          </PanelBody>
        </Panel>

        {/* The newest posts: what changed in the game and in the data, by title and date. */}
        <Panel>
          <PanelHeader title="From the blog" icon={BookOpen} size="sm" as="h2">
            <TextLink asChild underline="always" className="text-xs font-medium">
              <SmartLink href="/blog">All posts</SmartLink>
            </TextLink>
          </PanelHeader>
          <PanelBody className="flex flex-col gap-4">
            {posts.map((post) => (
              <Stack key={post.slug} gap={1}>
                <TextLink asChild tone="inherit" underline="hover" className="font-medium">
                  <SmartLink href={`/blog/${post.slug}`}>{post.title}</SmartLink>
                </TextLink>
                <Text variant="caption" tone="muted">
                  {formatBlogDate(post.date)} · {post.readingMinutes} min read
                </Text>
              </Stack>
            ))}
          </PanelBody>
        </Panel>
      </Grid>

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
