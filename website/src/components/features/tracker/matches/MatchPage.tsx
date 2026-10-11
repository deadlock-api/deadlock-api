import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Eye, FolderUp, SearchX, UserSearch } from "lucide-react";

import { InstallButton } from "~/components/domain/ingest/InstallButton";
import { INGEST_INSTALL_PATH } from "~/components/domain/ingest/links";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { Inline } from "~/components/ui/stack";
import type { GameMode } from "~/lib/game-mode";
import { historyEntryOf } from "~/lib/tracker/match-entry";
import { heroesQueryOptions } from "~/queries/asset-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";
import { matchSummaryQueryOptions, type MatchSummary } from "~/queries/tracker-queries";

import { MatchDetails, NeutralMatchDetails } from "./MatchDetails";

const STREET_BRAWL = "StreetBrawl";

const MODE_LABELS: Record<string, string> = {
  PrivateLobby: "Private Lobby",
  CoopBot: "Co-op Bot",
  ServerTest: "Server Test",
  HeroLabs: "Hero Labs",
  NewPlayerPlacement: "New Player Placement",
};

function gameModeOf(summary: MatchSummary): GameMode {
  return summary.game_mode === STREET_BRAWL ? "street_brawl" : "normal";
}

function modeLabel(summary: MatchSummary): string {
  if (summary.game_mode === STREET_BRAWL) return "Street Brawl";
  return MODE_LABELS[summary.match_mode] ?? (summary.match_mode || "Unknown");
}

/** The page as shown, which is the match as seen: through its player, or on its own. */
const pageLink = () => window.location.href;

/** A match we do not have: it shows up once someone who played sends it in, which the ingest tool does by itself. */
function MatchNotStored({ matchId }: { matchId: number }) {
  return (
    <EmptyState
      icon={SearchX}
      title={`We don't have match ${matchId} yet`}
      description="A match shows up here once someone who played it sends it in. Install the ingest tool and every match you play is sent by itself, or upload the matches in your Steam cache once."
      action={
        <Inline justify="center" gap={2}>
          <InstallButton size="default" installHref={INGEST_INSTALL_PATH} />
          <Button variant="outline" asChild>
            <Link to="/ingest-cache" hash="upload">
              <FolderUp aria-hidden="true" />
              Upload once instead
            </Link>
          </Button>
        </Inline>
      }
    />
  );
}

/**
 * One stored match on its own page, in the tracker's layout. With `accountId` it is the tracker's own match view of
 * that player (header, timeline, scoreboard, lanes); without, the same match seen neutrally from the Hidden King's
 * side. Only stored matches are read, never fetched from Steam; a match we do not have advertises the ingest tool.
 */
export function MatchPage({ matchId, accountId }: { matchId: number; accountId?: number }) {
  const summaryQuery = useQuery(matchSummaryQueryOptions(matchId));
  const { data: ranks = [] } = useQuery(ranksQueryOptions);
  const { data: heroes } = useQuery(heroesQueryOptions);
  const summary = summaryQuery.data;
  const entry = summary && accountId !== undefined ? historyEntryOf(summary, accountId) : undefined;
  const notStored = <MatchNotStored matchId={matchId} />;

  let body: React.ReactNode;
  if (summaryQuery.isPending) body = <LoadingState label="match" />;
  else if (summaryQuery.isError) {
    body = (
      <ErrorState
        title="Could not load the match"
        description="Try again in a moment."
        onRetry={() => void summaryQuery.refetch()}
        retrying={summaryQuery.isFetching}
      />
    );
  } else if (!summary) body = notStored;
  else if (entry && accountId !== undefined) {
    body = (
      <MatchDetails
        entry={entry}
        accountId={accountId}
        ranks={ranks}
        heroName={heroes?.find((hero) => hero.id === entry.hero_id)?.name ?? "Unknown hero"}
        records={undefined}
        matchLink={pageLink}
        source="graphql"
        unavailable={notStored}
      />
    );
  } else {
    const rounds = summary.round_durations_s;
    body = (
      <NeutralMatchDetails
        matchId={matchId}
        ranks={ranks}
        durationS={summary.duration_s}
        gameMode={gameModeOf(summary)}
        laned={summary.game_mode === "Normal"}
        modeLabel={modeLabel(summary)}
        startTime={summary.start_time}
        winningTeam={summary.winning_team}
        averageBadges={[summary.average_badge_team0, summary.average_badge_team1]}
        teamScore={summary.game_mode === STREET_BRAWL ? summary.team_score : null}
        brawlAvgRoundS={
          rounds.length > 0 ? Math.round(rounds.reduce((sum, round) => sum + round, 0) / rounds.length) : null
        }
        matchLink={pageLink}
        unavailable={notStored}
      />
    );
  }

  return (
    <PageShell>
      {/* The breadcrumb and the match header name the match on screen; the heading names the page for the outline. */}
      <PageHeader title={`Match ${matchId}`} className="sr-only" />
      {entry && accountId !== undefined && (
        <nav aria-label="Match navigation" className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/tracker/players/$accountId" params={{ accountId: String(accountId) }}>
              <UserSearch data-icon="inline-start" />
              Player tracker
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/matches/$matchId" params={{ matchId: String(matchId) }}>
              <Eye data-icon="inline-start" />
              Neutral view
            </Link>
          </Button>
        </nav>
      )}
      {body}
    </PageShell>
  );
}
