import { useEffect } from "react";
import type { LinksFunction } from "react-router";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLocation } from "react-router";

import "./tailwind.css";
import "./dayjs.ts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import AppSidebar, { MobileMenuButton } from "~/components/AppSidebar";
import { LoadingLogo } from "~/components/LoadingLogo";
import { Toaster } from "~/components/ui/sonner";
import { TooltipProvider } from "~/components/ui/tooltip";
import { PatronAuthProvider } from "~/contexts/PatronAuthContext";
import "@fontsource-variable/inter";
import interWoff2 from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";

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
        <meta name="description" content="Game statistics, hero analytics, item data, and leaderboards for Deadlock by Valve." />
        <meta name="keywords" content="Deadlock, API, Game, Data, Images, Stats, Heroes, Items, Weapons, Abilities, Leaderboard, Analytics" />
        <meta name="robots" content="index, follow" />

        <meta property="og:title" content="Deadlock API - Game Stats, Hero Analytics & Leaderboards" />
        <meta property="og:description" content="Game statistics, hero analytics, item data, and leaderboards for Deadlock by Valve." />
        <meta property="og:image" content="https://deadlock-api.com/favicon.webp" />
        <meta property="og:url" content="https://deadlock-api.com" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Deadlock API" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta property="twitter:domain" content="deadlock-api.com" />
        <meta property="twitter:url" content="https://deadlock-api.com" />
        <meta name="twitter:title" content="Deadlock API - Game Stats, Hero Analytics & Leaderboards" />
        <meta name="twitter:description" content="Game statistics, hero analytics, item data, and leaderboards for Deadlock by Valve." />
        <meta name="twitter:image" content="https://deadlock-api.com/favicon.webp" />

        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#fa4454" />

        <link rel="dns-prefetch" href="https://api.deadlock-api.com" />
        <link rel="dns-prefetch" href="https://assets.deadlock-api.com" />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Deadlock API",
              url: "https://deadlock-api.com",
              description: "Game statistics, hero analytics, item data, and leaderboards for Deadlock by Valve.",
            }),
          }}
        />

        <Meta />
        <Links />
      </head>
      <body
        className="overflow-x-hidden bg-fixed bg-cover bg-center bg-no-repeat bg-blend-difference"
        style={{ backgroundImage: "url('/background.svg')" }}
      >
        <noscript>
          <p style={{ padding: "2rem", textAlign: "center", color: "#fff" }}>
            Deadlock API requires JavaScript to display hero stats, item analytics, and leaderboard data. Please enable JavaScript to continue.
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

function CanonicalLink() {
  const { pathname } = useLocation();
  useEffect(() => {
    const href = `https://deadlock-api.com${pathname}`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = href;
  }, [pathname]);
  return null;
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
      <CanonicalLink />
      <PatronAuthProvider>
        <NuqsAdapter>
          <TooltipProvider>
            <div className="flex min-h-screen">
              <AppSidebar />
              <main className="min-w-0 flex-1 md:ml-64">
                <MobileMenuButton />
                <div className="flex justify-center items-start relative min-h-full">
                  <img
                    src="/logo/hexe.svg"
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none fixed bottom-0 right-0 w-[36rem] h-[36rem] opacity-[0.10] select-none"
                    style={{
                      transform: "perspective(900px) rotateX(12deg) rotateY(-8deg) rotateZ(-14deg)",
                      maskImage: "linear-gradient(to top left, rgba(0,0,0,1) 10%, rgba(0,0,0,0.15) 80%)",
                      WebkitMaskImage: "linear-gradient(to top left, rgba(0,0,0,1) 10%, rgba(0,0,0,0.15) 80%)",
                    }}
                  />
                  <div className="m-2 w-full xl:w-[92%] bg-background/60 backdrop-blur-md rounded-xl shadow-xl border border-white/10 p-4 sm:p-6 relative">
                    <div key={pathname} className="page-fade-in">
                      <Outlet />
                    </div>
                  </div>
                </div>
              </main>
            </div>

            <ReactQueryDevtools initialIsOpen={false} />
            <Toaster />
          </TooltipProvider>
        </NuqsAdapter>
      </PatronAuthProvider>
    </QueryClientProvider>
  );
}

export function HydrateFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background z-50" role="status" aria-live="polite">
      <LoadingLogo />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
