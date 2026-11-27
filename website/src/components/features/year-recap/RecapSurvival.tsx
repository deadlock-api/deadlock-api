import { GameIcon } from "~/components/domain/assets/GameIcon";
import { NpcImage } from "~/components/domain/assets/NpcImage";
import { StoryChapter, StoryFigure } from "~/components/patterns/story/Story";
import { Card, CardContent } from "~/components/ui/card";
import { Inline, Stack } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import { Text } from "~/components/ui/text";
import { formatPercent } from "~/lib/format";
import { hasDamageMatrix, hasDetails, ratio, roughCount, timeComparison } from "~/lib/year-recap/recap";
import type { ModeRecap } from "~/lib/year-recap/types";

import { compact, Coverage, count, FigureArt, plural } from "./shared";

const asDuration = (seconds: number) =>
  seconds >= 3600
    ? { value: (seconds / 3600).toFixed(seconds >= 36_000 ? 0 : 1), unit: "hours" }
    : { value: count(seconds / 60), unit: "minutes" };

/** Time spent waiting to respawn (detailed matches), deaths not credited to a hero, parries, damage soaked. */
export function SurvivalChapter({ id, main }: { id: string; main: ModeRecap }) {
  const { totals } = main;
  const dead = asDuration(totals.time_dead_s);
  const comparison = timeComparison(totals.time_dead_s);
  const parryRate = ratio(totals.parries, totals.parries + totals.parry_misses);
  return (
    <StoryChapter
      id={id}
      eyebrow="Survival"
      title="The respawn timer knows you"
      description={`On average ${count(totals.time_dead_s / Math.max(1, totals.detailed_matches) / 60)} minutes of every match were spent dead.`}
    >
      <FigureArt art={<GameIcon name="death" size="xl" className="text-foreground" />}>
        <StoryFigure
          value={dead.value}
          unit={`${dead.unit} dead`}
          caption={
            comparison.unit === "minutes"
              ? "Barely enough time to grab a snack."
              : `Enough for ${roughCount(comparison.count)} ${comparison.unit}.`
          }
        />
      </FigureArt>
      <StatGroup size="sm" overflow="wrap" className="grid-cols-2 @2xl/story:grid-cols-3">
        <Stat icon={<GameIcon name="damage" size="sm" />} label="Damage taken" value={compact(totals.damage_taken)} />
        <Stat
          icon={<GameIcon name="armor" size="sm" />}
          label="Damage mitigated"
          value={compact(totals.damage_mitigated)}
          sub="blocked or reduced"
        />
        {parryRate != null && (
          <Stat
            icon={<GameIcon name="parry" size="sm" />}
            label="Parries landed"
            value={count(totals.parries)}
            sub={totals.parries === 0 ? "Parry? Never heard of her." : `${formatPercent(parryRate, 0)} of attempts`}
          />
        )}
      </StatGroup>
      {totals.non_hero_deaths > 0 && (
        <Card tone="inset" size="sm">
          <CardContent className="flex flex-wrap items-center justify-center gap-4">
            {/* The text names them all, so the portraits are decoration. */}
            <Inline gap={2} wrap="nowrap">
              <NpcImage unit="guardian" decorative />
              <NpcImage unit="walker" decorative />
              <NpcImage unit="patron" decorative />
            </Inline>
            <Stack gap={0.5} className="min-w-0">
              <Text className="type-value" numeric="tabular">
                {count(totals.non_hero_deaths)} {plural(totals.non_hero_deaths, "death")} to the map
              </Text>
              <Text variant="caption" tone="muted">
                Troopers, Guardians, Walkers and the Patron got their share too.
              </Text>
            </Stack>
          </CardContent>
        </Card>
      )}
      <Coverage covered={totals.detailed_matches} total={totals.matches} what="death timers and parries recorded" />
    </StoryChapter>
  );
}

const MVP_PLACES = ["MVP", "Second best", "Third best"] as const;
const MVP_MEDALS = ["medalGold", "medalSilver", "medalBronze"] as const;

/** Healing, crowd control and the MVP podiums: the parts of a win that are not kills. */
export function TeamworkChapter({ id, main }: { id: string; main: ModeRecap }) {
  const { totals } = main;
  const detailed = hasDetails(totals);
  const damageMatrix = hasDamageMatrix(totals);
  const podiums = totals.mvp_rank_counts.reduce((sum, value) => sum + value, 0);
  const mvpShare = ratio(totals.mvp_rank_counts[0] ?? 0, totals.mvp_rated_matches);
  const healing = detailed ? totals.teammate_healing || totals.player_healing : 0;
  return (
    <StoryChapter
      id={id}
      eyebrow="Teamwork"
      title={(mvpShare ?? 0) >= 0.15 ? "Carry duties" : healing > 0 ? "The team's lifeline" : "Team player"}
      description={
        totals.mvp_rated_matches > 0
          ? `You finished on the podium (top 3 of your lobby) in ${count(podiums)} of ${count(totals.mvp_rated_matches)} rated matches.`
          : undefined
      }
    >
      {totals.mvp_rated_matches > 0 ? (
        <FigureArt art={<GameIcon name="mvp" size="xl" />}>
          <StoryFigure
            value={count(totals.mvp_rank_counts[0] ?? 0)}
            unit="times MVP"
            caption={
              (totals.mvp_rank_counts[0] ?? 0) === 0
                ? "No MVP yet. The lobby just was not ready for you."
                : `That is ${formatPercent(mvpShare ?? 0)} of the matches Valve rated, one in ${Math.round(1 / Math.max(mvpShare ?? 1, 0.0001))}.`
            }
          />
        </FigureArt>
      ) : (
        <FigureArt art={<GameIcon name="heal" size="xl" className="text-item-vitality" />}>
          <StoryFigure value={compact(healing)} unit="healing" />
        </FigureArt>
      )}
      <StatGroup size="sm" overflow="wrap" className="grid-cols-2 @2xl/story:grid-cols-4">
        {totals.mvp_rated_matches > 0 &&
          MVP_PLACES.map((place, index) => (
            <Stat
              key={place}
              icon={<GameIcon name={MVP_MEDALS[index] ?? "medalBronze"} size="sm" />}
              label={place}
              value={count(totals.mvp_rank_counts[index] ?? 0)}
              sub={formatPercent((totals.mvp_rank_counts[index] ?? 0) / totals.mvp_rated_matches)}
            />
          ))}
        {detailed && totals.player_healing > 0 && (
          <Stat icon={<GameIcon name="heal" size="sm" />} label="Healing" value={compact(totals.player_healing)} />
        )}
        {detailed && totals.teammate_healing > 0 && (
          <Stat
            icon={<GameIcon name="heal" size="sm" />}
            label="Teammate healing"
            value={compact(totals.teammate_healing)}
          />
        )}
        {detailed && totals.teammate_barriering > 0 && (
          <Stat
            icon={<GameIcon name="armor" size="sm" />}
            label="Teammate barriers"
            value={compact(totals.teammate_barriering)}
          />
        )}
        {damageMatrix && totals.cc_ms > 0 && (
          <Stat
            icon={<GameIcon name="stun" size="sm" />}
            label="Crowd control"
            value={`${count(totals.cc_ms / 1000 / 60)} min`}
            sub={`${count(totals.cc_stun_ms / 1000)}s of it stuns`}
          />
        )}
        {damageMatrix && totals.heal_prevented > 0 && (
          <Stat
            icon={<GameIcon name="healReduction" size="sm" />}
            label="Healing prevented"
            value={compact(totals.heal_prevented)}
            sub="anti-heal at work"
          />
        )}
      </StatGroup>
      {totals.mvp_rated_matches < totals.matches && (
        <Coverage
          covered={totals.mvp_rated_matches}
          total={totals.matches}
          what="MVP ranks, which Valve started handing out in January"
          backfill={false}
        />
      )}
      {detailed && healing > 0 && (
        <Coverage covered={totals.detailed_matches} total={totals.matches} what="healing recorded" />
      )}
      {damageMatrix && totals.cc_ms > 0 && (
        <Coverage covered={totals.damage_matrix_matches} total={totals.matches} what="crowd control recorded" />
      )}
    </StoryChapter>
  );
}
