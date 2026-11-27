import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { PlayerCell } from "~/components/domain/player/PlayerCell";
import { StoryChapter, StoryFigure } from "~/components/patterns/story/Story";
import { Card, CardContent } from "~/components/ui/card";
import { Grid } from "~/components/ui/grid";
import { Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { TextLink } from "~/components/ui/text-link";
import { useSteamProfiles } from "~/hooks/useSteamProfiles";
import { formatPercent } from "~/lib/format";
import { toneOf } from "~/lib/tone";
import type { YearRecap } from "~/lib/year-recap/types";
import { trackerEnemyStatsQueryOptions, trackerMateStatsQueryOptions } from "~/queries/tracker-queries";

import { count } from "./shared";

/** Players met at least this often count as regulars; fewer is chance. */
const MIN_TOGETHER = 3;
const SHOWN = 5;

function companionParams(recap: YearRecap) {
  return {
    accountId: recap.account_id,
    minUnixTimestamp: recap.start_unix,
    maxUnixTimestamp: recap.end_unix - 1,
    minMatchesPlayed: MIN_TOGETHER,
  };
}

/**
 * The teammates played with most and the opponent met most, from the tracker's mate and enemy endpoints over the
 * recap's year. The API leaves protected accounts out.
 */
export function useRecapFriends(recap: YearRecap) {
  const mates = useQuery(trackerMateStatsQueryOptions(companionParams(recap)));
  const enemies = useQuery(trackerEnemyStatsQueryOptions(companionParams(recap)));
  const topMates = (mates.data ?? [])
    .filter((mate) => mate.mate_id !== recap.account_id)
    .toSorted((a, b) => b.matches_played - a.matches_played)
    .slice(0, SHOWN);
  const rival = (enemies.data ?? []).toSorted((a, b) => b.matches_played - a.matches_played)[0];
  return { topMates, rival, settled: !mates.isPending && !enemies.isPending };
}

export function FriendsChapter({ id, recap }: { id: string; recap: YearRecap }) {
  const { topMates, rival } = useRecapFriends(recap);
  const ids = [...topMates.map((mate) => mate.mate_id), ...(rival ? [rival.enemy_id] : [])];
  const { profiles, isLoading } = useSteamProfiles(ids);
  const [best] = topMates;
  const name = (accountId: number) => profiles[accountId]?.personaname ?? `Player ${accountId}`;
  return (
    <StoryChapter
      id={id}
      eyebrow="Friends"
      title={best ? "Your squad" : "Lone wolf"}
      description={
        best
          ? `${isLoading ? "Your top teammate" : name(best.mate_id)} was on your side ${count(best.matches_played)} times this year.`
          : undefined
      }
    >
      {best && (
        <StoryFigure
          value={count(best.matches_played)}
          unit="matches together"
          caption={`${formatPercent(best.wins / Math.max(1, best.matches_played))} of them won.`}
        />
      )}
      <Grid columns={{ base: 1, md: 2 }} gap={3}>
        {topMates.map((mate) => (
          <Card key={mate.mate_id} tone="inset" size="sm">
            <CardContent className="flex items-center justify-between gap-3">
              <PlayerCell
                accountId={mate.mate_id}
                name={profiles[mate.mate_id]?.personaname}
                avatar={profiles[mate.mate_id]?.avatar}
                loading={isLoading}
                linkToDetail
              />
              <Stack gap={0.5} align="end" className="shrink-0 text-end">
                <Text variant="label" numeric="tabular">
                  {count(mate.matches_played)} together
                </Text>
                <Text variant="caption" tone={toneOf(mate.wins / Math.max(1, mate.matches_played), 0.5)}>
                  {formatPercent(mate.wins / Math.max(1, mate.matches_played))} won
                </Text>
              </Stack>
            </CardContent>
          </Card>
        ))}
        {rival && (
          <Card tone="inset" size="sm">
            <CardContent className="flex items-center justify-between gap-3">
              <Stack gap={1} className="min-w-0">
                <Text variant="eyebrow">Most met opponent</Text>
                <PlayerCell
                  accountId={rival.enemy_id}
                  name={profiles[rival.enemy_id]?.personaname}
                  avatar={profiles[rival.enemy_id]?.avatar}
                  loading={isLoading}
                  linkToDetail
                />
              </Stack>
              <Stack gap={0.5} align="end" className="shrink-0 text-end">
                <Text variant="label" numeric="tabular">
                  {count(rival.matches_played)} against
                </Text>
                <Text variant="caption" tone={toneOf(rival.wins / Math.max(1, rival.matches_played), 0.5)}>
                  you won {formatPercent(rival.wins / Math.max(1, rival.matches_played))}
                </Text>
              </Stack>
            </CardContent>
          </Card>
        )}
      </Grid>
      <Text variant="caption" tone="muted">
        Players who opted out of tracking are left out.{" "}
        <TextLink asChild>
          <Link to="/tracker/players/$accountId" params={{ accountId: String(recap.account_id) }}>
            See every teammate in the tracker
          </Link>
        </TextLink>
      </Text>
    </StoryChapter>
  );
}
