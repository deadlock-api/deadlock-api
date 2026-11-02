import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpen,
  Database,
  Download,
  Gamepad2,
  HardDrive,
  Heart,
  Map as MapIcon,
  Package,
} from "lucide-react";
import { useId } from "react";

import { OptimizedImage } from "~/components/domain/assets/OptimizedImage";
import { useInstallCtaTracking } from "~/components/domain/ingest/analytics";
import { WINDOWS_SETUP_URL } from "~/components/domain/ingest/links";
import { SmartLink } from "~/components/domain/navigation/SmartLink";
import { AiSearch } from "~/components/features/ai-search/AiSearch";
import { HeroWinRateLeaders, heroWinRateLeadersQueries } from "~/components/features/heroes/HeroWinRateLeaders";
import { LogoWall, LogoWallItem } from "~/components/patterns/content/LogoWall";
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
import { prefetchCached } from "~/lib/prefetch-safe";
import { defaultPeriodLabel, defaultPrevUnixRange, defaultUnixRange } from "~/lib/seasons";
import { ORGANIZATION, pageTitle, seo, SITE_URL } from "~/lib/seo";
import { navGroups } from "~/lib/site-nav";
import { TRACKER_SITES } from "~/lib/tracker-sites";
import { loadSeasons } from "~/queries/asset-queries";

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
  loader: async ({ context: { queryClient, preferences } }) => {
    // The hero win rates in the hero table's default period, current and previous, so the panel renders with the page.
    const seasons = await loadSeasons(queryClient);
    const range = defaultUnixRange(seasons, preferences.dateFilter);
    const prevRange = defaultPrevUnixRange(seasons, preferences.dateFilter);
    const leaders = heroWinRateLeadersQueries(range, prevRange);
    // The newest posts as metadata (title, summary, date, reading time): the markdown stays on the server.
    const [posts] = await Promise.all([
      fetchBlogPosts(),
      prefetchCached(queryClient, leaders.current),
      prefetchCached(queryClient, leaders.previous),
    ]);
    return {
      posts: posts.slice(0, 4),
      range,
      prevRange,
      period: defaultPeriodLabel(seasons, preferences.dateFilter),
    };
  },
  component: IndexRoute,
});

const services = [
  { title: "Game Data API", href: API_ORIGIN, icon: BarChart3, external: true },
  { title: "UI Components", href: "https://ui.deadlock-api.com/", icon: Package, external: true },
  { title: "Data Lake", href: "/data-dumps", icon: HardDrive, external: false },
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

/** The site map: the sidebar's sections in its order, without the patron and tracker entries (not this page's subject). */
const DIRECTORY = navGroups.filter((group) => group.label !== "Patron" && group.label !== "Dev");

function IndexRoute() {
  const { posts, range, prevRange, period } = Route.useLoaderData();
  const developerServicesId = useId();
  const isWindows = useIsWindows();
  const installTracking = useInstallCtaTracking("home", isWindows ? "download" : "install_steps");
  return (
    <PageShell density="content">
      {/* Two columns once the page is wide enough: the search and the site map, the page's work, beside a rail of small
          panels. Narrower, both columns dissolve into one sequence (`contents`) ordered so the sponsor stays near the
          top. The breakpoints are the Grid's own container query, so the order and the columns switch together. */}
      <Grid columns={{ base: 1, lg: 3 }} gap={4}>
        <Stack gap={4} className="@max-2xl:contents @2xl:col-span-2">
          {/* What the site is, then the search, its main action: a phone reaches it without scrolling. */}
          <Stack gap={4} align="center" className="@max-2xl:order-1">
            <Stack gap={2} align="center">
              <PageHeader size="display" title="Deadlock API" align="center" />
              <Text as="p" variant="prose" tone="muted" align="center" className="max-w-3xl">
                Track Deadlock stats: hero win rates, pick rates, item analytics, rank distribution, and leaderboards,
                updated live from Valve's servers. A comprehensive set of endpoints also gives developers access to
                Deadlock game data, match history, player statistics, hero analytics, and more.
              </Text>
            </Stack>
            <AiSearch align="center" className="max-w-3xl" />
          </Stack>

          <HeroWinRateLeaders range={range} prevRange={prevRange} period={period} className="@max-2xl:order-3" />

          {/* The site map. Wide, a column per section, Analytics' eight pages in two of their own so its column is
              no taller than the others. */}
          <Panel className="@max-2xl:order-4">
            <PanelHeader title="Deadlock Stats, Hero Win Rates & Leaderboards" icon={MapIcon} size="sm" />
            <PanelBody size="sm" className="@container">
              <SideNav
                layout="columns"
                aria-label="Site directory"
                className="@5xl:grid @5xl:columns-auto @5xl:grid-cols-[2fr_1fr_1fr_1fr]"
              >
                {DIRECTORY.map((group) => (
                  <SideNavGroup key={group.label} label={group.label}>
                    <div className={group.links.length > 5 ? "@5xl:columns-2 @5xl:gap-x-6" : undefined}>
                      {group.links.map((link) => (
                        <SideNavItem key={link.to} asChild className="py-1">
                          <SmartLink href={link.to}>
                            <link.icon />
                            <span className="truncate">{link.label}</span>
                          </SmartLink>
                        </SideNavItem>
                      ))}
                    </div>
                  </SideNavGroup>
                ))}
              </SideNav>
            </PanelBody>
            {/* The services for developers: another audience, so apart from the player pages, under a rule. */}
            <PanelFooter className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
              <Text id={developerServicesId} variant="eyebrow">
                Developer Services
              </Text>
              <SideNav layout="inline" aria-labelledby={developerServicesId}>
                {services.map((service) => (
                  <SideNavItem key={service.title} asChild>
                    <SmartLink href={service.href} external={service.external}>
                      <service.icon />
                      <span>{service.title}</span>
                    </SmartLink>
                  </SideNavItem>
                ))}
              </SideNav>
            </PanelFooter>
          </Panel>
        </Stack>

        {/* The rail: who sponsors the site, the ingest tool, and what is new. */}
        <Stack gap={4} className="@max-2xl:contents">
          <Panel className="@max-2xl:order-2">
            <PanelHeader title="Sponsored by" icon={Heart} size="sm">
              <TextLink href="https://www.patreon.com/c/manuelhexe" external underline="always" size="sm">
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
                  widths={[288, 384, 576]}
                  sizes="288px"
                  alt={mainSponsor.title}
                  width={mainSponsor.width}
                  height={mainSponsor.height}
                  className="h-auto w-72 object-contain"
                />
              </LogoWallItem>
              <LogoWall layout="row" aria-label="Other sponsors" className="w-full">
                {sponsors.map((sponsor) => (
                  <li key={sponsor.href}>
                    <LogoWallItem href={sponsor.href} title={sponsor.title} target="_blank" rel="sponsored noreferrer">
                      <OptimizedImage
                        src={sponsor.logo}
                        widths={[140, 280, 420]}
                        sizes="144px"
                        alt={sponsor.title}
                        width={sponsor.width}
                        height={sponsor.height}
                        loading="lazy"
                        fetchPriority="low"
                        className="max-h-9 w-full max-w-36 object-contain"
                      />
                    </LogoWallItem>
                  </li>
                ))}
              </LogoWall>
            </PanelBody>
          </Panel>

          <Panel className="@max-2xl:order-5">
            <PanelHeader title="Track all your matches" icon={Download} size="sm" />
            <PanelBody className="flex flex-col gap-3">
              <Text as="p" tone="muted" wrap="pretty">
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
              <LogoWall layout="icons" aria-label="Sites that show matches from Deadlock API">
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
                    <li key={site.name} className="flex">
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
              </LogoWall>
            </PanelBody>
          </Panel>

          {/* The last of the rail: it reaches down to the main column's last line, so the two columns end together. */}
          <Panel className="flex-1 @max-2xl:order-6">
            <PanelHeader title="From the blog" icon={BookOpen} size="sm">
              <TextLink asChild underline="always" size="sm">
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

      {/* What Deadlock is and where the numbers come from, a row of their own under both columns. */}
      <Grid columns={{ base: 1, lg: 2 }} gap={4} className="items-stretch">
        <Panel>
          <PanelHeader title="What is Deadlock?" icon={Gamepad2} size="sm" />
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
          <PanelHeader title="How Our Data Works" icon={Database} size="sm" />
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
        deadlock-api.com is not endorsed by Valve and does not reflect the views or opinions of Valve or anyone
        officially involved in producing or managing Valve properties.
      </Text>
    </PageShell>
  );
}
