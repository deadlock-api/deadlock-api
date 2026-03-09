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
  Radio,
  Tv,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import { API_ORIGIN, ASSETS_ORIGIN } from "~/lib/constants";
import { ElectricBorder } from "~/components/ElectricBorder";

export const meta: MetaFunction = () => {
  return [
    { title: "Deadlock API - Game Stats, Hero Analytics & Leaderboards" },
    {
      name: "description",
      content:
        "Game statistics, hero analytics, item data, and leaderboards for Deadlock by Valve. Open source and open data.",
    },
  ];
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
  {
    title: "Stream Kit",
    description: "Enhance your livestreams with real-time game data overlays and widgets.",
    href: "/streamkit",
    icon: Tv,
    external: false,
    cta: "Explore Stream Kit",
  },
  {
    title: "AI Chat",
    description: "Ask questions about Deadlock heroes, items, abilities, and strategies powered by AI.",
    href: "/chat",
    icon: Bot,
    external: false,
    cta: "Try AI Chat",
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

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" as const },
  },
};

export default function Index() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="relative text-center pt-4 pb-2">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-72 bg-primary/8 rounded-full blur-[100px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative"
        >
          <h1 className="text-5xl font-bold tracking-tight lg:text-6xl mb-5 bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent">
            Deadlock API
          </h1>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="flex flex-wrap justify-center gap-3 mb-6"
        >
          {valueProps.map((prop) => (
            <a
              key={prop.label}
              href={prop.href}
              target="_blank"
              rel="noopener noreferrer"
              title={prop.title}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-muted/50 text-sm font-medium text-foreground/80 hover:border-primary/40 hover:text-primary transition-colors"
            >
              <prop.icon className="size-3.5" />
              {prop.label}
            </a>
          ))}
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="mx-auto max-w-2xl text-base text-muted-foreground leading-relaxed"
        >
          A comprehensive set of endpoints to access Deadlock game data — match history, player statistics, hero
          analytics, and more. Whether you're a developer integrating game data or a player analyzing performance, the
          Deadlock API has you covered.
        </motion.p>
      </section>

      {/* Patron CTA */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.5 }}
      >
        <ElectricBorder color="#fa4454" speed={0.5} chaos={0.1} borderRadius={12}>
          <div className="rounded-xl bg-card/80 backdrop-blur-sm px-6 py-7 sm:px-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="space-y-4 min-w-0">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center size-10 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
                    <Zap className="electric-bolt size-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">Prioritized Fetching</h2>
                    <p className="text-sm text-muted-foreground">Starting at just $3/month</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground max-w-xl">
                  We fetch match data for millions of players. With prioritized fetching, your Steam accounts jump to
                  the front of the queue — your matches and stats are updated more frequently so you always have the
                  latest data for analysis.
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {patronFeatures.map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="size-1.5 rounded-full bg-primary shrink-0" />
                      {feature}
                    </div>
                  ))}
                </div>
              </div>
              <Link to="/patron" prefetch="intent" className="shrink-0">
                <Button className="bg-gradient-to-r from-[#fa4454] to-[#ff6b7a] hover:from-[#e83d4c] hover:to-[#f05a68] text-white font-semibold px-8 h-11 w-full lg:w-auto">
                  Enable Prioritized Fetching
                  <ArrowRight className="size-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </ElectricBorder>
      </motion.section>

      {/* Services */}
      <section>
        <div className="text-center mb-8">
          <h2 className="text-2xl font-semibold tracking-tight">Developer Services</h2>
          <p className="text-sm text-muted-foreground mt-1">APIs, tools, and data for the Deadlock community</p>
        </div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {services.map((service) => {
            const Icon = service.icon;
            const card = (
              <motion.div
                variants={fadeUp}
                className="group relative flex flex-col h-full rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30 hover:bg-muted/30"
              >
                <div className="flex items-start gap-4 mb-3">
                  <div className="flex items-center justify-center size-10 rounded-lg bg-muted border border-border shrink-0 group-hover:border-primary/20 group-hover:bg-primary/5 transition-colors">
                    <Icon className="size-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground flex items-center gap-1.5">
                      {service.title}
                      {service.external && (
                        <ExternalLink className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{service.description}</p>
                  </div>
                </div>
                <div className="mt-auto pt-3">
                  <span className="text-sm font-medium text-primary/80 group-hover:text-primary transition-colors flex items-center gap-1.5">
                    {service.cta}
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </motion.div>
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
        </motion.div>
      </section>

      {/* Sponsors */}
      <section className="text-center">
        <h2 className="text-lg font-semibold tracking-tight mb-1">Our Sponsors</h2>
        <p className="text-sm text-muted-foreground mb-6">
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
        <div className="flex justify-center items-center gap-10 flex-wrap">
          {sponsors.map((sponsor) => (
            <a
              key={sponsor.href}
              href={sponsor.href}
              title={sponsor.title}
              target="_blank"
              rel="noreferrer"
              className="opacity-60 hover:opacity-100 transition-opacity"
            >
              <img src={sponsor.logo} alt={`${sponsor.title} Logo`} loading="lazy" className="max-w-[160px] max-h-14" />
            </a>
          ))}
        </div>
      </section>

      {/* Disclaimer */}
      <section className="border-t border-border pt-6">
        <p className="text-center text-xs text-muted-foreground">
          <a
            href="https://deadlock-api.com/"
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
