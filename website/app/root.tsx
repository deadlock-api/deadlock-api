import interWoff2 from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import { usePostHog } from "@posthog/react";

import "./tailwind.css";
import "./dayjs.ts";
import { QueryClient, QueryClientProvider, QueryErrorResetBoundary } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import { Component, Suspense, lazy } from "react";
import type { ErrorInfo, ReactNode } from "react";
import type { LinksFunction } from "react-router";
import {
  Navigate,
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";

import { ApiErrorFallback } from "~/components/ApiErrorFallback";
import { AppSidebar, MobileMenuButton } from "~/components/AppSidebar";
import { Breadcrumbs } from "~/components/Breadcrumbs";
import { CookieConsentBanner } from "~/components/CookieConsentBanner";
import { LoadingLogo } from "~/components/LoadingLogo";
import { Toaster } from "~/components/ui/sonner";
import { TooltipProvider } from "~/components/ui/tooltip";
import { PatronAuthProvider } from "~/contexts/PatronAuthContext";
import { MobileMotionConfig } from "~/lib/motion";

const ReactQueryDevtools = lazy(() =>
  import("@tanstack/react-query-devtools").then((m) => ({ default: m.ReactQueryDevtools })),
);

import "@fontsource-variable/inter";
import "@fontsource/new-rocker";
import newRockerWoff2 from "@fontsource/new-rocker/files/new-rocker-latin-400-normal.woff2?url";

import type { Route } from "./+types/root";

export const links: LinksFunction = () => [
  {
    rel: "preload",
    href: interWoff2,
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  },
  {
    rel: "preload",
    href: newRockerWoff2,
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />

        <link rel="icon" type="image/ico" href="favicon.ico" />
        <link rel="icon" type="image/webp" href="https://deadlock-api.com/favicon.webp" />
        <link rel="icon" type="image/png" href="https://deadlock-api.com/favicon.png" />

        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="keywords"
          content="Deadlock, API, Game, Data, Images, Stats, Heroes, Items, Weapons, Abilities, Leaderboard, Analytics"
        />
        <meta name="robots" content="index, follow" />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Deadlock API" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta property="twitter:domain" content="deadlock-api.com" />

        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#fa4454" />

        <link rel="preconnect" href="https://api.deadlock-api.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://assets.deadlock-api.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.deadlock-api.com" />
        <link rel="dns-prefetch" href="https://assets.deadlock-api.com" />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  "@id": "https://deadlock-api.com/#website",
                  name: "Deadlock API",
                  url: "https://deadlock-api.com",
                  description: "Game statistics, hero analytics, item data, and leaderboards for Deadlock by Valve.",
                  publisher: { "@id": "https://deadlock-api.com/#organization" },
                  potentialAction: {
                    "@type": "SearchAction",
                    target: {
                      "@type": "EntryPoint",
                      urlTemplate: "https://deadlock-api.com/leaderboard?search={search_term_string}",
                    },
                    "query-input": "required name=search_term_string",
                  },
                },
                {
                  "@type": "Organization",
                  "@id": "https://deadlock-api.com/#organization",
                  name: "Deadlock API",
                  url: "https://deadlock-api.com",
                  logo: {
                    "@type": "ImageObject",
                    url: "https://deadlock-api.com/favicon.png",
                    width: 512,
                    height: 512,
                  },
                  sameAs: ["https://github.com/deadlock-api/", "https://discord.gg/deadlock-api"],
                  description:
                    "Open source game statistics, hero analytics, item data, and leaderboards for Deadlock by Valve.",
                },
                {
                  "@type": "WebApplication",
                  "@id": "https://deadlock-api.com/#webapp",
                  name: "Deadlock API",
                  url: "https://deadlock-api.com",
                  description:
                    "Open source game statistics, hero analytics, item data, and leaderboards for Deadlock by Valve.",
                  applicationCategory: "GameApplication",
                  operatingSystem: "Any",
                  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
                  isAccessibleForFree: true,
                  creator: { "@id": "https://deadlock-api.com/#organization" },
                },
                {
                  "@type": "VideoGame",
                  "@id": "https://deadlock-api.com/#game",
                  name: "Deadlock",
                  description:
                    "Deadlock is a team-based multiplayer shooter and MOBA hybrid game developed and published by Valve.",
                  url: "https://store.steampowered.com/app/1422450/Deadlock/",
                  gamePlatform: "PC",
                  applicationCategory: "Game",
                  operatingSystem: "Windows",
                  genre: ["MOBA", "Third-Person Shooter"],
                  author: {
                    "@type": "Organization",
                    name: "Valve",
                    url: "https://www.valvesoftware.com",
                  },
                  publisher: {
                    "@type": "Organization",
                    name: "Valve",
                    url: "https://www.valvesoftware.com",
                  },
                  image: "https://deadlock-api.com/og/default.png",
                },
              ],
            }),
          }}
        />

        <Meta />
        <Links />
      </head>
      <body
        className="overflow-x-hidden bg-cover bg-fixed bg-center bg-no-repeat bg-blend-difference"
        style={{ backgroundImage: "url('/background.svg')" }}
      >
        <noscript>
          <div style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto", color: "#fff" }}>
            <h1 style={{ textAlign: "center", marginBottom: "1rem" }}>Deadlock API</h1>
            <p style={{ textAlign: "center", marginBottom: "1.5rem" }}>
              Deadlock API provides game statistics, hero analytics, item data, and leaderboards for Deadlock by Valve.
              JavaScript is required for interactive features like filtering and live data.
            </p>
            <ul style={{ lineHeight: "1.8" }}>
              <li>
                <a href="/heroes" style={{ color: "#fa4454" }}>
                  Hero Stats
                </a>{" "}
                - Win rates, pick rates, matchups, and performance analytics for all Deadlock heroes
              </li>
              <li>
                <a href="/items" style={{ color: "#fa4454" }}>
                  Item Stats
                </a>{" "}
                - Item win rates, purchase timing, confidence intervals, and combo analytics
              </li>
              <li>
                <a href="/abilities" style={{ color: "#fa4454" }}>
                  Ability Stats
                </a>{" "}
                - Ability upgrade paths and win rates per hero
              </li>
              <li>
                <a href="/leaderboard" style={{ color: "#fa4454" }}>
                  Leaderboard
                </a>{" "}
                - Ranked player standings across all regions
              </li>
              <li>
                <a href="/data-privacy" style={{ color: "#fa4454" }}>
                  Data Privacy
                </a>{" "}
                - Manage your data privacy settings and GDPR requests
              </li>
            </ul>
            <p style={{ textAlign: "center", marginTop: "1.5rem", fontSize: "0.875rem", opacity: 0.7 }}>
              APIs:{" "}
              <a href="https://api.deadlock-api.com" style={{ color: "#fa4454" }}>
                Game Data API
              </a>{" "}
              |{" "}
              <a href="https://assets.deadlock-api.com" style={{ color: "#fa4454" }}>
                Assets API
              </a>
            </p>
          </div>
        </noscript>
        <div className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-br from-black/35 to-transparent" />
        <div className="relative z-10">{children}</div>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      throwOnError: (error) => {
        if (error instanceof AxiosError && error.response?.status) {
          return error.response.status >= 500;
        }
        return false;
      },
    },
  },
});
interface QueryErrorBoundaryProps {
  onReset: () => void;
  fallbackRender: (props: { resetErrorBoundary: () => void }) => ReactNode;
  children: ReactNode;
}

interface QueryErrorBoundaryState {
  hasError: boolean;
}

class QueryErrorBoundary extends Component<QueryErrorBoundaryProps, QueryErrorBoundaryState> {
  state: QueryErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): QueryErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("QueryErrorBoundary caught:", error, info);
  }

  resetErrorBoundary = () => {
    this.props.onReset();
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallbackRender({ resetErrorBoundary: this.resetErrorBoundary });
    }
    return this.props.children;
  }
}

export default function App() {
  const { pathname, search, hash } = useLocation();

  if (pathname !== "/" && pathname.endsWith("/")) {
    return <Navigate to={pathname.slice(0, -1) + search + hash} replace />;
  }

  const isWidgetEmbed = pathname.startsWith("/streamkit/widgets/");

  if (isWidgetEmbed) {
    return (
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <MobileMotionConfig>
        <PatronAuthProvider>
          <NuqsAdapter>
            <TooltipProvider>
              <div className="flex min-h-screen">
                <AppSidebar />
                <main className="min-w-0 flex-1 md:ml-64">
                  <MobileMenuButton />
                  <div className="relative flex min-h-full items-start justify-center">
                    <img
                      src="/logo/hexe.svg"
                      alt=""
                      aria-hidden="true"
                      className="pointer-events-none fixed right-0 bottom-0 h-[36rem] w-[36rem] opacity-[0.10] select-none"
                      style={{
                        transform: "perspective(900px) rotateX(12deg) rotateY(-8deg) rotateZ(-14deg)",
                        maskImage: "linear-gradient(to top left, rgba(0,0,0,1) 10%, rgba(0,0,0,0.15) 80%)",
                        WebkitMaskImage: "linear-gradient(to top left, rgba(0,0,0,1) 10%, rgba(0,0,0,0.15) 80%)",
                      }}
                    />
                    <div className="relative m-2 w-full rounded-xl border border-white/10 bg-background/60 p-4 shadow-xl backdrop-blur-md sm:p-6 xl:w-[92%]">
                      <Breadcrumbs />
                      <QueryErrorResetBoundary>
                        {({ reset }) => (
                          <QueryErrorBoundary
                            onReset={reset}
                            fallbackRender={({ resetErrorBoundary }) => (
                              <ApiErrorFallback resetErrorBoundary={resetErrorBoundary} />
                            )}
                          >
                            <div key={pathname} className="page-fade-in">
                              <Outlet />
                            </div>
                          </QueryErrorBoundary>
                        )}
                      </QueryErrorResetBoundary>
                    </div>
                  </div>
                </main>
              </div>

              {import.meta.env.DEV && (
                <Suspense fallback={null}>
                  <ReactQueryDevtools initialIsOpen={false} />
                </Suspense>
              )}
              <Toaster />
              <CookieConsentBanner />
            </TooltipProvider>
          </NuqsAdapter>
        </PatronAuthProvider>
      </MobileMotionConfig>
    </QueryClientProvider>
  );
}

export function HydrateFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background" role="status" aria-live="polite">
      <LoadingLogo />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const posthog = usePostHog();
  posthog?.captureException(error);

  let message = "Oops!";
  let details = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details = error.status === 404 ? "The requested page could not be found." : error.statusText || details;
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center">
        <h1 className="mb-2 text-4xl font-bold">{message}</h1>
        <p className="text-muted-foreground">{details}</p>
      </div>
    </div>
  );
}
