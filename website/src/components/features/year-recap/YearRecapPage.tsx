import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarX2 } from "lucide-react";

import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { yearRecapQueryOptions } from "~/queries/year-recap-queries";

import { RecapClosed } from "./RecapClosed";
import { RecapStory } from "./RecapStory";

/**
 * One player's recap of `year`, or why there is none: closed outside the window (`open` comes from the loader, so the
 * server and the client agree), still loading, failed, or a year without matches.
 */
export function YearRecapPage({ accountId, year, open }: { accountId: number; year: number; open: boolean }) {
  const query = useQuery({ ...yearRecapQueryOptions(accountId, year), enabled: open });
  if (!open) return <RecapClosed year={year} />;

  if (query.isPending) {
    return (
      <PageShell>
        <PageHeader title={`Year in Deadlock ${year}`} className="sr-only" />
        <LoadingState label="your year in Deadlock" text={`Adding up your ${year}…`} align="center" />
      </PageShell>
    );
  }
  if (query.isError) {
    return (
      <PageShell width="narrow">
        <PageHeader title={`Year in Deadlock ${year}`} />
        <ErrorState
          title="Could not load your year"
          description="The recap is a big one to add up. Try again in a moment."
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </PageShell>
    );
  }
  if (query.data.matches.length === 0) {
    return (
      <PageShell width="narrow">
        <PageHeader title={`Year in Deadlock ${year}`} />
        <EmptyState
          icon={CalendarX2}
          title={`No matches in ${year} yet`}
          description="We have no Ranked or Unranked matches of this account this year. Matches the ingest tool sends show up here too."
          action={
            <Button variant="secondary" asChild>
              <Link to="/ingest-cache">Send your matches</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }
  return (
    <PageShell>
      <RecapStory recap={query.data} />
    </PageShell>
  );
}
