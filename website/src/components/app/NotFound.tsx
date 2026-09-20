import { Link } from "@tanstack/react-router";
import { ArrowLeft, Home } from "lucide-react";
import type { ReactNode } from "react";

import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Button } from "~/components/ui/button";
import { Inline, Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { TextLink } from "~/components/ui/text-link";

const suggestions = [
  { to: "/analytics/heroes", label: "Hero Stats" },
  { to: "/analytics/items", label: "Item Stats" },
  { to: "/community/leaderboard", label: "Leaderboard" },
  { to: "/analytics/games", label: "Games" },
];

/** `didYouMean` is a link to the page the visitor most likely meant, e.g. the hero a mistyped URL was closest to. */
export function NotFound({ didYouMean }: { didYouMean?: ReactNode } = {}) {
  return (
    <>
      <title>Page Not Found | Deadlock API</title>
      <meta name="robots" content="noindex, nofollow" />
      <PageShell align="center" height="fill" density="content">
        <Stack gap={4} align="center">
          <PageHeader
            size="lg"
            figure="404"
            title="Page Not Found"
            description="The page you're looking for doesn't exist or may have been moved."
          />
          {didYouMean && (
            <Text as="p" className="text-lg">
              Did you mean{" "}
              <TextLink asChild className="font-semibold">
                {didYouMean}
              </TextLink>
              ?
            </Text>
          )}
        </Stack>

        <Inline gap={3} justify="center">
          <Button asChild>
            <Link to="/">
              <Home />
              Go Home
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (typeof window !== "undefined") window.history.back();
            }}
          >
            <ArrowLeft />
            Go Back
          </Button>
        </Inline>

        <Stack gap={3} align="center">
          <Text as="p" tone="muted">
            Or try one of these:
          </Text>
          <Inline justify="center">
            {suggestions.map((s) => (
              <Button key={s.to} asChild variant="outline" size="sm">
                <Link to={s.to}>{s.label}</Link>
              </Button>
            ))}
          </Inline>
        </Stack>
      </PageShell>
    </>
  );
}
