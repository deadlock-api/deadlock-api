/// <reference types="vite/client" />
import interWoff2 from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext, useRouterState } from "@tanstack/react-router";
import { Agentation } from "agentation";
import { debounce } from "nuqs";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import * as React from "react";
import { Component, type ErrorInfo, type ReactNode } from "react";

import { ApiErrorFallback } from "~/components/app/ApiErrorFallback";
import { AppSidebar, MobileMenuButton } from "~/components/app/AppSidebar";
import { Breadcrumbs } from "~/components/app/Breadcrumbs";
import { ThemeProvider } from "~/components/app/ThemeProvider";
import { FeedbackWidget } from "~/components/features/annotate/FeedbackWidget";
import { AppBody, AppFrame, PageBackdrop } from "~/components/patterns/page/AppFrame";
import { SkipLink } from "~/components/ui/skip-link";
import { Toaster } from "~/components/ui/sonner";
import { Stack } from "~/components/ui/stack";
import { TooltipProvider } from "~/components/ui/tooltip";
import { getAnalytics } from "~/lib/analytics";
import { installChunkReloadHandlers, isChunkLoadError, reloadOnceForStaleChunk } from "~/lib/chunk-reload";
import { readPreferences } from "~/lib/preferences.isomorphic";
import { seo } from "~/lib/seo";
import type { RouterContext } from "~/router";

import appCss from "~/styles/tailwind.css?url";

const defaultSeo = seo({
  title: "Deadlock API",
  description: "Deadlock analytics, builds, and developer APIs powered by live match data.",
  path: "/",
});

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: () => ({ preferences: readPreferences() }),
  loader: async ({ context: { queryClient }, location }) => {
    // Only serialize catalogs used by the current page. In particular, game
    // hubs need none and Deadlockdle uses separate, full-detail queries.
    const pathname = location.pathname.replace(/\/$/, "") || "/";
    const isAnalytics = pathname.startsWith("/analytics/");
    const isGameAnalytics = /^\/analytics\/games(?:\/|$)/.test(pathname);
    const isPlayerTracker = pathname.startsWith("/tracker/players/");
    const preloads: Promise<unknown>[] = [];

    if (
      (isAnalytics && !isGameAnalytics) ||
      isPlayerTracker ||
      pathname === "/community/heatmap" ||
      pathname === "/community/leaderboard" ||
      pathname === "/games/flashcards/heroes" ||
      pathname.startsWith("/streamkit/widgets/")
    ) {
      preloads.push(
        import("~/queries/asset-queries").then(({ heroesQueryOptions }) =>
          queryClient.ensureQueryData(heroesQueryOptions),
        ),
      );
    }
    // The heatmap's rank filter renders nothing until the ranks arrive, so without them its filter bar reflows.
    if (
      isAnalytics ||
      isPlayerTracker ||
      pathname === "/community/badge-distribution" ||
      pathname === "/community/heatmap"
    ) {
      preloads.push(
        import("~/queries/ranks-query").then(({ ranksQueryOptions }) => queryClient.ensureQueryData(ranksQueryOptions)),
      );
    }
    if (
      /^\/analytics\/(heroes|items|abilities)(?:\/|$)/.test(pathname) ||
      pathname === "/games/flashcards/items" ||
      pathname === "/games/flashcards/item-upgrades"
    ) {
      preloads.push(
        import("~/queries/asset-queries").then(({ itemUpgradesQueryOptions }) =>
          queryClient.ensureQueryData(itemUpgradesQueryOptions),
        ),
      );
    }
    await Promise.all(preloads);
  },
  head: () => {
    // No site-wide title or robots tag: every page's head names itself, and a 404 or error page renders its own title
    // and "noindex". A default here came first in the server HTML and contradicted them ("index, follow" is what no
    // robots tag means anyway).
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        {
          name: "keywords",
          content:
            "Deadlock, API, Game, Data, Images, Stats, Heroes, Items, Weapons, Abilities, Leaderboard, Analytics",
        },
        // ds-allow color-literal: a meta tag cannot read CSS variables; mirrors --primary
        { name: "theme-color", content: "#fa4454" },
        { property: "og:site_name", content: "Deadlock API" },
        { name: "twitter:card", content: "summary_large_image" },
        { property: "twitter:domain", content: "deadlock-api.com" },
        ...defaultSeo.meta.filter((tag) => !("title" in tag)),
      ],
      links: [
        { rel: "stylesheet", href: appCss, fetchPriority: "high" },
        { rel: "icon", type: "image/ico", href: "/favicon.ico" },
        { rel: "icon", type: "image/webp", href: "https://deadlock-api.com/favicon.webp" },
        { rel: "icon", type: "image/png", href: "https://deadlock-api.com/favicon.png" },
        { rel: "manifest", href: "/manifest.webmanifest" },
        {
          rel: "preload",
          href: interWoff2,
          as: "font",
          type: "font/woff2",
          crossOrigin: "anonymous",
        },
      ],
    };
  },
  component: RootComponent,
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
    if (isChunkLoadError(error)) {
      reloadOnceForStaleChunk();
      return;
    }
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

if (typeof window !== "undefined") {
  installChunkReloadHandlers();
}

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isWidgetEmbed = pathname.startsWith("/streamkit/widgets/");

  React.useEffect(() => {
    if (!isWidgetEmbed) void getAnalytics();
  }, [isWidgetEmbed]);

  if (isWidgetEmbed) {
    return (
      <RootDocument bare>
        <Outlet />
      </RootDocument>
    );
  }

  return (
    <RootDocument>
      <ThemeProvider>
        <NuqsAdapter defaultOptions={{ history: "push", limitUrlUpdates: debounce(300) }}>
          <TooltipProvider>
            <SkipLink />
            <div className="flex min-h-screen">
              <AppSidebar />
              <main id="main-content" className="min-w-0 flex-1 overflow-x-clip md:ps-64">
                <MobileMenuButton />
                <PageBackdrop src="/logo/hexe.svg" fetchPriority="high" />
                <AppFrame>
                  <Stack gap={4} className="flex-1">
                    <Breadcrumbs />
                    <Stack gap={0} className="flex-1">
                      <QueryErrorResetBoundary>
                        {({ reset }) => (
                          <QueryErrorBoundary
                            onReset={reset}
                            fallbackRender={({ resetErrorBoundary }) => (
                              <ApiErrorFallback resetErrorBoundary={resetErrorBoundary} />
                            )}
                          >
                            <Outlet />
                          </QueryErrorBoundary>
                        )}
                      </QueryErrorResetBoundary>
                    </Stack>
                  </Stack>
                </AppFrame>
              </main>
            </div>
            {/* Keep notification actions clear of the fixed feedback launcher. */}
            <Toaster offset={{ bottom: 80 }} mobileOffset={{ bottom: 80 }} />
            {import.meta.env.DEV ? <Agentation /> : <FeedbackWidget />}
          </TooltipProvider>
        </NuqsAdapter>
      </ThemeProvider>
    </RootDocument>
  );
}

function RootDocument({ children, bare = false }: { children: React.ReactNode; bare?: boolean }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <AppBody variant={bare ? "bare" : "page"} backgroundSrc="/background.svg">
        {children}
        <Scripts />
      </AppBody>
    </html>
  );
}
