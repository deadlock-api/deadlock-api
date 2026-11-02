import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, BookOpen, Download, HardDrive, Heart, type LucideIcon, Package } from "lucide-react";

import { OptimizedImage } from "~/components/domain/assets/OptimizedImage";
import { useInstallCtaTracking } from "~/components/domain/ingest/analytics";
import { WINDOWS_SETUP_URL } from "~/components/domain/ingest/links";
import { SmartLink } from "~/components/domain/navigation/SmartLink";
import { AiSearch } from "~/components/features/ai-search/AiSearch";
import { LogoWallItem } from "~/components/patterns/content/LogoWall";
import { Prose } from "~/components/patterns/content/Prose";
import { SideNav, SideNavGroup, SideNavItem } from "~/components/patterns/navigation/SideNav";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Panel, PanelBody, PanelFooter, PanelHeader } from "~/components/patterns/panel/Panel";
import { Button } from "~/components/ui/button";
import { Grid } from "~/components/ui/grid";
import { Inline, Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { TextLink } from "~/components/ui/text-link";
import { useIsWindows } from "~/hooks/useIsWindows";
import { formatBlogDate } from "~/lib/blog-date";
import { fetchBlogPosts } from "~/lib/blog-fns";
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
  // The newest posts only, as titles and dates: the markdown stays on the server.
  loader: async () => (await fetchBlogPosts()).slice(0, 4),
  component: IndexRoute,
});

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
  links: { to: string; label: string; icon: LucideIcon }[];
}

const groupLinks = (label: string) => navGroups.find((group) => group.label === label)?.links ?? [];

/**
 * The directory, one column per section like a site map: the sidebar's sections, without the patron and tracker
 * entries (not this page's subject). The developer services follow under a rule of their own.
 */
const DIRECTORY: DirectoryEntry[] = [
  { label: "Analytics", links: groupLinks("Analytics") },
  { label: "Community", links: groupLinks("Community") },
  { label: "Games", links: groupLinks("Games") },
  { label: "Tools", links: groupLinks("Tools") },
];

function IndexRoute() {
  const posts = Route.useLoaderData();

  const isWindows = useIsWindows();
  const installTracking = useInstallCtaTracking("home", isWindows ? "download" : "install_steps");
  return (
    <PageShell density="content">
      {/* Two columns: the search and the site map, the page's work, beside a rail of small panels that go with it. */}
      <Grid columns={{ base: 1, lg: 3 }} gap={6}>
        <Stack gap={6} className="lg:col-span-2">
          {/* What the site is, then the search, its main action: a phone reaches it without scrolling. Centred in the
              column, the site's front door. */}
          <Stack gap={4} align="center" className="text-center">
            <Stack gap={2} align="center">
              <PageHeader size="display" title="Deadlock API" align="center" />
              <Text as="p" tone="muted" align="center" className="max-w-3xl type-prose">
                Track Deadlock stats: hero win rates, pick rates, item analytics, rank distribution, and leaderboards,
                updated live from Valve's servers. A comprehensive set of endpoints also gives developers access to
                Deadlock game data, match history, player statistics, hero analytics, and more.
              </Text>
            </Stack>
            <AiSearch align="center" className="max-w-3xl" />
          </Stack>

          {/* The site's sections as the sidebar groups them, a column each. The patron and tracker entries stay in the
              sidebar: this page does not target the tracker. */}
          {/* Its columns follow the panel's own width, never cutting a name short: flowing groups while narrow, a column
              per section once there is room for all five. */}
          <Panel>
            <PanelHeader title="Deadlock Stats, Hero Win Rates & Leaderboards" size="sm" as="h2" />
            <PanelBody size="sm" className="@container">
              <SideNav
                aria-label="Site directory"
                className="block columns-1 gap-x-6 *:break-inside-avoid *:pb-3 @md:columns-2 @2xl:columns-3 @5xl:grid @5xl:columns-auto @5xl:grid-cols-4"
              >
                {DIRECTORY.map((entry) => (
                  <SideNavGroup key={entry.label} label={entry.label}>
                    {entry.links.map((link) => (
                      <SideNavItem key={link.to} asChild className="py-1">
                        <SmartLink href={link.to}>
                          <link.icon />
                          <span className="truncate">{link.label}</span>
                        </SmartLink>
                      </SideNavItem>
                    ))}
                  </SideNavGroup>
                ))}
              </SideNav>
            </PanelBody>
            {/* The services for developers: another audience, so apart from the player pages, under a rule. */}
            <PanelFooter className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
              <Text variant="eyebrow">Developer Services</Text>
              <SideNav aria-label="Developer Services" className="flex-row flex-wrap gap-x-2 gap-y-1">
                {services.map((service) => (
                  <SideNavItem key={service.title} asChild>
                    <SmartLink href={service.href} external={service.external} title={service.description}>
                      <service.icon />
                      <span>{service.title}</span>
                    </SmartLink>
                  </SideNavItem>
                ))}
              </SideNav>
            </PanelFooter>
          </Panel>
          {/* What Deadlock is and where the numbers come from, under the site map: the main column runs as long as the
              rail, and whichever is shorter lets its last block take the rest. */}
          <Grid columns={{ base: 1, xl: 2 }} gap={4} className="flex-1 items-stretch">
            <Panel>
              <PanelHeader title="What is Deadlock?" size="sm" as="h2" />
              <PanelBody>
                <Prose>
                  <p>
                    Deadlock is a team-based multiplayer game developed and published by Valve that combines elements of
                    third-person shooters and MOBAs. Players choose from a roster of heroes, each with unique abilities,
                    and compete in objective-based matches. The game features a deep item system, competitive ranked
                    play, and a rapidly evolving meta shaped by frequent balance patches.
                  </p>
                  <p>
                    Deadlock API tracks match data for millions of players, providing the community with detailed hero
                    win rates, item statistics with confidence intervals, ability upgrade path analysis, and competitive
                    leaderboards across all regions. New matches are added continuously, the statistics update daily,
                    and all data can be filtered by rank, patch, game mode, and date range.
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
                    match is processed to extract hero performance, item purchases, ability upgrade paths, and average
                    match rankings. Statistics like win rates and pick rates are computed with statistical confidence
                    intervals to ensure reliability.
                  </p>
                  <p>
                    The platform is fully open source and provides free access to all data, including hourly database
                    dumps for researchers and developers. Players can help fill in the gaps with the open source ingest
                    tool, which sends the matches in their Steam cache. A $1.50/month patron tier offers prioritized
                    data fetching for personal Steam accounts, ensuring your matches and stats are always up to date.
                  </p>
                </Prose>
              </PanelBody>
            </Panel>
          </Grid>
        </Stack>

        {/* The rail: who sponsors the site, the ingest tool, what is new, and the services for developers. */}
        <Stack gap={4}>
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
            <PanelBody className="flex flex-col items-center gap-4">
              <LogoWallItem
                href={mainSponsor.href}
                title={mainSponsor.title}
                target="_blank"
                rel="sponsored noreferrer"
              >
                <OptimizedImage
                  src={mainSponsor.logo}
                  widths={[192, 240, 384, 480, 576, 720]}
                  sizes="288px"
                  alt={mainSponsor.title}
                  width={600}
                  height={127}
                  className="h-auto w-72 object-contain"
                />
              </LogoWallItem>
              <Inline gap={5} justify="center">
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
                      sizes="144px"
                      alt={sponsor.title}
                      width={sponsor.width}
                      height={sponsor.height}
                      loading="lazy"
                      fetchPriority="low"
                      className="max-h-9 max-w-36 object-contain"
                    />
                  </LogoWallItem>
                ))}
              </Inline>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Track all your matches"
              icon={Download}
              size="sm"
              as="h2"
              description={`${TRACKER_SITES.length} sites`}
            />
            <PanelBody className="flex flex-col gap-3">
              <Text as="p" tone="muted">
                Install the ingest tool once and every match you play gets sent to every tracker site.
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
              <ul
                aria-label="Sites that show matches from Deadlock API"
                className="grid grid-cols-[repeat(auto-fill,minmax(2rem,1fr))] gap-1.5"
              >
                {TRACKER_SITES.map((site) => {
                  const icon = (
                    <img
                      src={site.icon}
                      alt={site.name}
                      title={site.name}
                      width={24}
                      height={24}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="size-6 object-contain"
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

          {/* The last of the rail: it reaches down to the site map's last line, so the two columns end together. */}
          <Panel className="flex-1">
            <PanelHeader title="From the blog" icon={BookOpen} size="sm" as="h2">
              <TextLink asChild underline="always" className="text-xs font-medium">
                <SmartLink href="/blog">All posts</SmartLink>
              </TextLink>
            </PanelHeader>
            <PanelBody className="flex flex-col gap-4">
              {posts.map((post) => (
                <Stack key={post.slug} gap={0.5}>
                  <TextLink asChild tone="inherit" underline="hover" className="font-medium">
                    <SmartLink href={`/blog/${post.slug}`}>{post.title}</SmartLink>
                  </TextLink>
                  <Text as="p" tone="muted" wrap="clamp-2">
                    {post.description}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {formatBlogDate(post.date)} · {post.readingMinutes} min read
                  </Text>
                </Stack>
              ))}
            </PanelBody>
          </Panel>
        </Stack>
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
