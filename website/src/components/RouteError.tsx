import { Link, useRouter } from "@tanstack/react-router";
import { Home, RotateCcw } from "lucide-react";

import { Button } from "~/components/ui/button";

export function RouteError({ error, reset }: { error: unknown; reset: () => void }) {
  const router = useRouter();
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  return (
    <>
      <title>Something went wrong | Deadlock API</title>
      <meta name="robots" content="noindex, nofollow" />
      <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-primary">Something went wrong</h1>
          <p className="max-w-md text-muted-foreground">
            This page failed to load. The API may be temporarily unavailable, please try again in a moment.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Button
            variant="default"
            className="gap-2"
            onClick={() => {
              void router.invalidate();
              reset();
            }}
          >
            <RotateCcw className="size-4" />
            Try again
          </Button>
          <Link to="/">
            <Button variant="outline" className="gap-2">
              <Home className="size-4" />
              Go Home
            </Button>
          </Link>
        </div>

        {import.meta.env.DEV && (
          <pre className="max-w-full overflow-x-auto rounded-md border border-border bg-muted/40 p-4 text-left font-mono text-xs whitespace-pre-wrap text-muted-foreground">
            {stack ?? message}
          </pre>
        )}
      </div>
    </>
  );
}
