/// <reference types="vite/client" />
import interWoff2 from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import newRockerWoff2 from "@fontsource/new-rocker/files/new-rocker-latin-400-normal.woff2?url";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext, useRouterState } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Agentation } from "agentation";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
import * as React from "react";
import { Component, type ErrorInfo, type ReactNode } from "react";

import { ApiErrorFallback } from "~/components/ApiErrorFallback";
import { AppSidebar, MobileMenuButton } from "~/components/AppSidebar";
import { Breadcrumbs } from "~/components/Breadcrumbs";
import { ThemeProvider } from "~/components/ThemeProvider";
import { Toaster } from "~/components/ui/sonner";
import { TooltipProvider } from "~/components/ui/tooltip";
import { PatronAuthProvider } from "~/contexts/PatronAuthContext";
import { installChunkReloadHandlers, isChunkLoadError, reloadOnceForStaleChunk } from "~/lib/chunk-reload";
import { seo } from "~/lib/seo";
import { heroesQueryOptions, itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";
import type { RouterContext } from "~/router";

import appCss from "~/styles/tailwind.css?url";

const defaultSeo = seo({
  title: "Deadlock API",
  description: "Deadlock analytics, builds, and developer APIs powered by live match data.",
  path: "/",
});

export const Route = createRootRouteWithContext<RouterContext>()({
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData(heroesQueryOptions),
      queryClient.ensureQueryData(ranksQueryOptions),
      queryClient.ensureQueryData(itemUpgradesQueryOptions),
    ]);
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        name: "keywords",
        content: "Deadlock, API, Game, Data, Images, Stats, Heroes, Items, Weapons, Abilities, Leaderboard, Analytics",
      },
      { name: "robots", content: "index, follow" },
      { name: "theme-color", content: "#fa4454" },
      { property: "og:site_name", content: "Deadlock API" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "twitter:domain", content: "deadlock-api.com" },
      ...defaultSeo.meta,
    ],
    links: [
      { rel: "stylesheet", href: appCss },
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
      {
        rel: "preload",
        href: newRockerWoff2,
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
    ],
  }),
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
                            <Outlet />
                          </QueryErrorBoundary>
                        )}
                      </QueryErrorResetBoundary>
                    </div>
                  </div>
                </main>
              </div>
              <Toaster />
            </TooltipProvider>
          </NuqsAdapter>
        </PatronAuthProvider>
      </ThemeProvider>
    </RootDocument>
  );
}

function RootDocument({ children, bare = false }: { children: React.ReactNode; bare?: boolean }) {
  if (bare) {
    return (
      <html lang="en" suppressHydrationWarning>
        <head>
          <HeadContent />
        </head>
        <body style={{ background: "transparent" }}>
          {children}
          <Scripts />
        </body>
      </html>
    );
  }
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body
        className="overflow-x-hidden bg-cover bg-fixed bg-center bg-no-repeat bg-blend-difference"
        style={{ backgroundImage: "url('/background.svg')" }}
      >
        <div className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-br from-black/35 to-transparent" />
        <div className="relative z-10">{children}</div>
        <TanStackRouterDevtools position="bottom-right" />
        {import.meta.env.DEV && <Agentation />}
        <Scripts />
      </body>
    </html>
  );
}
