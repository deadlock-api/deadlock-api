import { Link, useRouter } from "@tanstack/react-router";
import { Home, RotateCcw } from "lucide-react";

import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Inline } from "~/components/ui/stack";
import { isChunkLoadError } from "~/lib/chunk-reload";

export function RouteError({ error, reset }: { error: unknown; reset: () => void }) {
  const router = useRouter();
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  // A chunk that failed to load says nothing about the page: Googlebot renders against chunks of builds no longer
  // served, and a noindex in its rendered DOM dropped /analytics/games/combat from the index. Only the browser loads
  // chunks, so the server never renders this branch and hydration is unaffected.
  const chunkFailed = isChunkLoadError(error);

  return (
    <>
      {!chunkFailed && <title>Something went wrong | Deadlock API</title>}
      {!chunkFailed && <meta name="robots" content="noindex, nofollow" />}
      <PageShell align="center" height="fill" density="content">
        <PageHeader
          size="lg"
          title="Something went wrong"
          description="This page failed to load. The API may be temporarily unavailable, please try again in a moment."
        />

        <Inline gap={3} justify="center">
          <Button
            onClick={() => {
              void router.invalidate();
              reset();
            }}
          >
            <RotateCcw />
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link to="/">
              <Home />
              Go Home
            </Link>
          </Button>
        </Inline>

        {import.meta.env.DEV && (
          <Card tone="muted" size="sm" className="max-w-full">
            <CardContent>
              <pre className="overflow-x-auto text-start font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                {stack ?? message}
              </pre>
            </CardContent>
          </Card>
        )}
      </PageShell>
    </>
  );
}
