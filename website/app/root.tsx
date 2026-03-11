import interWoff2 from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import { usePostHog } from "@posthog/react";

import "./tailwind.css";
import "./dayjs.ts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import type { LinksFunction } from "react-router";
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration, useLocation } from "react-router";

import { AppSidebar, MobileMenuButton } from "~/components/AppSidebar";
import { Breadcrumbs } from "~/components/Breadcrumbs";
import { CookieConsentBanner } from "~/components/CookieConsentBanner";
import { LoadingLogo } from "~/components/LoadingLogo";
import { Toaster } from "~/components/ui/sonner";
import { TooltipProvider } from "~/components/ui/tooltip";
import { PatronAuthProvider } from "~/contexts/PatronAuthContext";

import "@fontsource-variable/inter";
import type { Route } from "./+types/root";

export const links: LinksFunction = () => [
  {
    rel: "preload",
    href: interWoff2,
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
            __html: JSON.stringify([
              {
                "@context": "https://schema.org",
                "@type": "WebSite",
                name: "Deadlock API",
                url: "https://deadlock-api.com",
                description: "Game statistics, hero analytics, item data, and leaderboards for Deadlock by Valve.",
                potentialAction: {
                  "@type": "SearchAction",
                  target: "https://deadlock-api.com/leaderboard?search={search_term_string}",
                  "query-input": "required name=search_term_string",
                },
              },
              {
                "@context": "https://schema.org",
                "@type": "Organization",
                name: "Deadlock API",
                url: "https://deadlock-api.com",
                logo: "https://deadlock-api.com/favicon.png",
                sameAs: ["https://github.com/deadlock-api/", "https://discord.gg/deadlock-api"],
              },
            ]),
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
          <p style={{ padding: "2rem", textAlign: "center", color: "#fff" }}>
            Deadlock API requires JavaScript to display hero stats, item analytics, and leaderboard data. Please enable
            JavaScript to continue.
          </p>
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
      retryDelay: 100,
    },
  },
});
export default function App() {
  const { pathname } = useLocation();
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
                    <div key={pathname} className="page-fade-in">
                      <Outlet />
                    </div>
                  </div>
                </div>
              </main>
            </div>

            <ReactQueryDevtools initialIsOpen={false} />
            <Toaster />
            <CookieConsentBanner />
          </TooltipProvider>
        </NuqsAdapter>
      </PatronAuthProvider>
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
