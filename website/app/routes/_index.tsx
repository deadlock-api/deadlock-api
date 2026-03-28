import {
  ArrowRight,
  BarChart3,
  Bot,
  Code,
  Database,
  ExternalLink,
  HardDrive,
  Heart,
  ImageIcon,
  ListOrdered,
  Map,
  Medal,
  MessageCircle,
  Radio,
  ShoppingBag,
  Swords,
  Trophy,
  Tv,
  Users,
  Zap,
} from "lucide-react";
import type { MetaFunction } from "react-router";
import { Link } from "react-router";

import { ElectricBorder } from "~/components/ElectricBorder";
import { Button } from "~/components/ui/button";
import { API_ORIGIN, ASSETS_ORIGIN } from "~/lib/constants";
import { createPageMeta } from "~/lib/meta";
import { cn } from "~/lib/utils";

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "Deadlock API - Game Stats, Hero Analytics & Leaderboards",
    description:
      "Game statistics, hero analytics, item data, and leaderboards for Deadlock by Valve. Open source and open data.",
    path: "/",
  });
};

const valueProps = [
  {
    label: "Open Source",
    href: "https://github.com/deadlock-api/",
    icon: Code,
    title: "Visit our GitHub Organization",
  },
  {
    label: "Open Data",
    href: "https://files.deadlock-api.com/Default/buckets/db-snapshot/public/",
    icon: Database,
    title: "Daily Data Dumps provided",
  },
  {
    label: "Free to Use",
    href: "https://www.patreon.com/c/manuelhexe",
    icon: Heart,
    title: "Based on Sponsoring",
  },
];

const patronFeatures = [
  "Priority queue updates",
  "Up to 10 Steam accounts",
  "Full match history from first to last game",
  "100% funds infrastructure",
  "Accurate rank data from Steam",
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
    title: "Assets API",
    description: "Provides static game assets such as heroes/item data, images, icons, sounds.",
    href: ASSETS_ORIGIN,
    icon: ImageIcon,
    external: true,
    cta: "Visit Assets API",
  },
  {
    title: "Live Events API",
    description: "Real-time game events via Server-Sent Events for live match tracking.",
    href: "https://github.com/deadlock-api/deadlock-live-events",
    icon: Radio,
    external: true,
    cta: "View Live Events API",
  },
  {
    title: "Database Dumps",
    description: "Download up-to-date database snapshots for offline analysis or research.",
    href: "https://files.deadlock-api.com/Default/buckets/db-snapshot/public/",
    icon: HardDrive,
    external: true,
    cta: "Access Database Dumps",
  },
];

const analyticsLinks = [
  {
    title: "Hero Analytics",
    description: "Win rates, matchups, synergies, and performance trends across patches for every hero.",
    href: "/heroes",
    icon: Swords,
  },
  {
    title: "Item Analytics",
    description: "Item win rates with confidence intervals, purchase timing analysis, and item combos.",
    href: "/items",
    icon: ShoppingBag,
  },
  {
    title: "Game Analytics",
    description: "Match duration, game mode stats, and overall gameplay trends over time.",
    href: "/games",
    icon: BarChart3,
  },
  {
    title: "Ability Analytics",
    description: "Ability upgrade paths, skill build popularity, and win rate by leveling order.",
    href: "/abilities",
    icon: ListOrdered,
  },
  {
    title: "Leaderboard",
    description: "Top ranked players across all regions with hero filters and rank search.",
    href: "/leaderboard",
    icon: Trophy,
  },
  {
    title: "Player Scoreboard",
    description: "Compare player performance across matches with detailed stat breakdowns.",
    href: "/player-scoreboard",
    icon: Users,
  },
  {
    title: "Rank Distribution",
    description: "See how the player base is distributed across ranks over time.",
    href: "/badge-distribution",
    icon: Medal,
  },
  {
    title: "Kill Heatmap",
    description: "Visualize where kills happen on the map to understand positioning and hotspots.",
    href: "/heatmap",
    icon: Map,
  },
  {
    title: "AI Chat",
    description: "Ask questions about Deadlock heroes, items, abilities, and strategies powered by AI.",
    href: "/chat",
    icon: Bot,
  },
  {
    title: "Stream Kit",
    description: "Enhance your livestreams with real-time game data overlays and widgets.",
    href: "/streamkit",
    icon: Tv,
  },
  {
    title: "Missing a Feature?",
    description: "Have an idea or want to request something new? Let us know on Discord!",
    href: "https://discord.gg/pqWQfTPQJu",
    icon: MessageCircle,
    external: true,
    highlight: true,
  },
];

const sponsors = [
  {
    href: "https://statlocker.gg/",
    title: "Statlocker.GG",
    logo: "/logo/statlocker.png",
  },
  {
    href: "https://www.youtube.com/@mattiadl",
    title: "Mattia DL",
    logo: "/logo/mattia.png",
  },
  { href: "https://blast.tv/", title: "Blast.TV", logo: "/logo/blast.svg" },
];

export default function Index() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="relative pt-4 pb-2 text-center">
        <div className="pointer-events-none absolute top-0 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/8 blur-[100px]" />

        <div className="relative">
          <h1 className="mb-5 bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-5xl font-bold tracking-tight text-transparent lg:text-6xl">
            Deadlock API
          </h1>
        </div>

        <div className="mb-6 flex flex-wrap justify-center gap-3">
          {valueProps.map((prop) => (
            <a
              key={prop.label}
              href={prop.href}
              target="_blank"
              rel="noopener noreferrer"
              title={prop.title}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-4 py-2 text-sm font-medium text-foreground/80 transition-colors hover:border-primary/40 hover:text-primary"
            >
              <prop.icon className="size-3.5" />
              {prop.label}
            </a>
          ))}
        </div>

        <p className="mx-auto max-w-2xl text-base leading-relaxed text-muted-foreground">
          A comprehensive set of endpoints to access Deadlock game data, match history, player statistics, hero
          analytics, and more. Whether you're a developer integrating game data or a player analyzing performance, the
          Deadlock API has you covered.
        </p>
      </section>

      {/* Patron CTA */}
      <section>
        <ElectricBorder color="#fa4454" speed={0.5} chaos={0.1} borderRadius={12}>
          <div className="rounded-xl bg-card/80 px-6 py-7 backdrop-blur-sm sm:px-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                    <Zap className="electric-bolt size-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">Prioritized Fetching</h2>
                    <p className="text-sm text-muted-foreground">Starting at just $3/month</p>
                  </div>
                </div>
                <p className="max-w-xl text-sm text-muted-foreground">
                  We fetch match data for millions of players. With prioritized fetching, your Steam accounts jump to
                  the front of the queue — your matches and stats are updated more frequently so you always have the
                  latest data for analysis.
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {patronFeatures.map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                      {feature}
                    </div>
                  ))}
                </div>
              </div>
              <Link to="/patron" prefetch="intent" className="shrink-0">
                <Button className="h-11 w-full bg-gradient-to-r from-[#fa4454] to-[#ff6b7a] px-8 font-semibold text-white hover:from-[#e83d4c] hover:to-[#f05a68] lg:w-auto">
                  Enable Prioritized Fetching
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              </Link>
            </div>
          </div>
        </ElectricBorder>
      </section>

      {/* Analytics Links */}
      <section>
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">Explore the Data</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Dive into analytics, leaderboards, and visualizations powered by millions of tracked matches
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {analyticsLinks.map((item) => {
            const Icon = item.icon;
            const isHighlight = "highlight" in item && item.highlight;
            const isExternal = "external" in item && item.external;
            const card = (
              <div
                className={cn(
                  "group flex h-full flex-col rounded-xl border p-4 transition-colors",
                  isHighlight
                    ? "border-dashed border-primary/40 bg-primary/5 hover:border-primary/60 hover:bg-primary/10"
                    : "border-border bg-card hover:border-primary/30 hover:bg-muted/30",
                )}
              >
                <div className="mb-2 flex items-center gap-3">
                  <div
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
                      isHighlight
                        ? "border-primary/20 bg-primary/10 group-hover:bg-primary/15"
                        : "border-border bg-muted group-hover:border-primary/20 group-hover:bg-primary/5",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4 transition-colors",
                        isHighlight ? "text-primary" : "text-muted-foreground group-hover:text-primary",
                      )}
                    />
                  </div>
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    {item.title}
                    {isExternal && (
                      <ExternalLink className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    )}
                  </h3>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                <div className="mt-auto pt-2">
                  <span className="flex items-center gap-1 text-xs font-medium text-primary/80 transition-colors group-hover:text-primary">
                    {isExternal ? "Join" : "View"}
                    <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            );

            if (isExternal) {
              return (
                <a key={item.title} href={item.href} target="_blank" rel="noopener noreferrer">
                  {card}
                </a>
              );
            }

            return (
              <Link key={item.title} to={item.href} prefetch="intent">
                {card}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Services */}
      <section>
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">Developer Services</h2>
          <p className="mt-1 text-sm text-muted-foreground">APIs, tools, and data for the Deadlock community</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service) => {
            const Icon = service.icon;
            const card = (
              <div className="group relative flex h-full flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30 hover:bg-muted/30">
                <div className="mb-3 flex items-start gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted transition-colors group-hover:border-primary/20 group-hover:bg-primary/5">
                    <Icon className="size-5 text-muted-foreground transition-colors group-hover:text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-1.5 font-semibold text-foreground">
                      {service.title}
                      {service.external && (
                        <ExternalLink className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      )}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{service.description}</p>
                  </div>
                </div>
                <div className="mt-auto pt-3">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-primary/80 transition-colors group-hover:text-primary">
                    {service.cta}
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            );

            if (service.external) {
              return (
                <a key={service.title} href={service.href} target="_blank" rel="noopener noreferrer">
                  {card}
                </a>
              );
            }

            return (
              <Link key={service.title} to={service.href} prefetch="intent">
                {card}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Sponsors */}
      <section className="text-center">
        <h2 className="mb-1 text-lg font-semibold tracking-tight">Our Sponsors</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Grateful to our sponsors for their support.{" "}
          <a
            href="https://www.patreon.com/c/manuelhexe"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline underline-offset-4"
            title="Support on Patreon"
          >
            Become a sponsor
          </a>
        </p>
        <div className="flex flex-wrap items-center justify-center gap-10">
          {sponsors.map((sponsor) => (
            <a
              key={sponsor.href}
              href={sponsor.href}
              title={sponsor.title}
              target="_blank"
              rel="noreferrer"
              className="opacity-60 transition-opacity hover:opacity-100"
            >
              <img src={sponsor.logo} alt={`${sponsor.title} Logo`} loading="lazy" className="max-h-14 max-w-[160px]" />
            </a>
          ))}
        </div>
      </section>

      {/* About Deadlock */}
      <section>
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">What is Deadlock?</h2>
        </div>
        <div className="mx-auto max-w-3xl space-y-4 text-sm leading-relaxed text-muted-foreground">
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
        </div>
      </section>

      {/* How It Works */}
      <section>
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">How Our Data Works</h2>
        </div>
        <div className="mx-auto max-w-3xl space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            Deadlock API collects publicly available match data through Valve's game client APIs. Every tracked match is
            processed to extract hero performance, item purchases, ability upgrade paths, and average match rankings.
            Statistics like win rates and pick rates are computed with statistical confidence intervals to ensure
            reliability.
          </p>
          <p>
            The platform is fully open source and provides free access to all data, including daily database dumps for
            researchers and developers. A $3/month patron tier offers prioritized data fetching for personal Steam
            accounts, ensuring your matches and stats are always up to date.
          </p>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="border-t border-border pt-6">
        <p className="text-center text-xs text-muted-foreground">
          <a
            href="https://deadlock-api.com"
            title="Deadlock API"
            className="font-medium text-primary underline underline-offset-4"
          >
            deadlock-api.com
          </a>{" "}
          is not endorsed by Valve and does not reflect the views or opinions of Valve or anyone officially involved in
          producing or managing Valve properties.
        </p>
      </section>
    </div>
  );
}
