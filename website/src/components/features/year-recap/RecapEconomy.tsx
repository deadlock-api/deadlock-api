import { GameIcon, type GameIconName } from "~/components/domain/assets/GameIcon";
import { ITEM_SLOT_COLOR } from "~/components/domain/assets/item-slot-color";
import { ItemCell } from "~/components/domain/assets/ItemCell";
import { ItemImage } from "~/components/domain/assets/ItemImage";
import { ItemName } from "~/components/domain/assets/ItemName";
import { ChartSwatch } from "~/components/patterns/charts/ChartLegend";
import { SERIES_COLORS } from "~/components/patterns/charts/theme";
import { StoryChapter, StoryFigure } from "~/components/patterns/story/Story";
import { Card, CardContent } from "~/components/ui/card";
import { Grid } from "~/components/ui/grid";
import { Heading, useNextHeadingLevel } from "~/components/ui/heading";
import { ProgressBar, ProgressBarSegment } from "~/components/ui/progress-bar";
import { Inline, Stack } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import { Text } from "~/components/ui/text";
import { useItemById } from "~/hooks/useAssetById";
import { formatPercent } from "~/lib/format";
import { toneOf } from "~/lib/tone";
import { hasDetails, MIN_SAMPLE, type SoulSource, soulSources } from "~/lib/year-recap/recap";
import type { ModeRecap, RecapItem } from "~/lib/year-recap/types";

import { compact, Coverage, count, FigureArt, plural } from "./shared";

/** The game's art for each place souls come from. */
const SOURCE_ICON: Record<SoulSource["key"], GameIconName> = {
  gold_lane_creeps: "lanes",
  gold_players: "kill",
  gold_neutrals: "neutrals",
  gold_bosses: "guardian",
  gold_breakables: "crate",
  gold_treasure: "urn",
};

/** Souls earned over the year, where they came from (detailed matches) and what was left unspent. */
export function SoulsChapter({ id, main }: { id: string; main: ModeRecap }) {
  const headingLevel = useNextHeadingLevel();
  const { totals } = main;
  const perMinute = totals.souls / Math.max(1, totals.seconds_played / 60);
  const detailed = hasDetails(totals);
  const sources = detailed ? soulSources(totals) : [];
  const sourceTotal = sources.reduce((sum, source) => sum + source.souls, 0);
  const [topSource] = sources;
  const perBuffMatch = totals.permanent_buff_matches > 0 ? totals.permanent_buffs / totals.permanent_buff_matches : 0;
  return (
    <StoryChapter
      id={id}
      eyebrow="Souls"
      title={perMinute >= 1000 ? "Farming machine" : "Show me the souls"}
      description={`${count(perMinute)} souls a minute, about ${compact(totals.souls / Math.max(1, totals.matches))} by the end of an average match.`}
    >
      <FigureArt art={<GameIcon name="soul" size="xl" className="text-foreground" />}>
        <StoryFigure
          size="lg"
          value={compact(totals.souls)}
          unit="souls"
          caption="Earned across every match of the year."
        />
      </FigureArt>
      {topSource && (
        <Stack gap={2}>
          <Heading as={headingLevel} size="sm">
            Where your souls came from
          </Heading>
          <ProgressBar aria-label="Souls by source">
            {sources.map((source, index) => (
              <ProgressBarSegment
                key={source.key}
                value={source.souls}
                color={SERIES_COLORS[index] ?? SERIES_COLORS[0]}
              />
            ))}
          </ProgressBar>
          <Inline gap={4} justify="center">
            {sources.map((source, index) => (
              <Inline key={source.key} gap={1.5} wrap="nowrap">
                <ChartSwatch color={SERIES_COLORS[index] ?? SERIES_COLORS[0]} />
                <GameIcon name={SOURCE_ICON[source.key]} size="sm" className="text-foreground" />
                <Text variant="caption" tone="muted">
                  <Text tone="default" className="font-semibold">
                    {source.label}
                  </Text>{" "}
                  {formatPercent(source.souls / sourceTotal, 0)}
                </Text>
              </Inline>
            ))}
          </Inline>
        </Stack>
      )}
      <StatGroup size="sm" overflow="wrap" className="grid-cols-2 @2xl/story:grid-cols-4">
        <Stat
          icon={<GameIcon name="lanes" size="sm" />}
          label="Last hits"
          value={count(totals.last_hits)}
          sub={`${count(totals.denies)} denies`}
        />
        {detailed && totals.breakables_broken > 0 && (
          <Stat
            icon={<GameIcon name="crate" size="sm" />}
            label="Breakables"
            value={count(totals.breakables_broken)}
            sub="crates and urns"
          />
        )}
        {totals.permanent_buff_matches > 0 && (
          <Stat
            icon={<GameIcon name="idol" size="sm" />}
            label="Statue buffs"
            value={count(totals.permanent_buffs)}
            sub={`about ${perBuffMatch.toFixed(1)} a match`}
          />
        )}
        {detailed && totals.unspent_gold_minutes > 0 && (
          <Stat
            icon={<GameIcon name="soul" size="sm" />}
            label="Unspent souls"
            value={compact(totals.unspent_gold_minutes)}
            sub={
              totals.unspent_gold_minutes / Math.max(1, totals.detailed_matches) > 60_000
                ? "soul-minutes held. Hoarder alert!"
                : "soul-minutes held unspent"
            }
          />
        )}
        {detailed && totals.comeback_gold > 0 && (
          <Stat
            icon={<GameIcon name="souls" size="sm" />}
            label="Comeback souls"
            value={compact(totals.comeback_gold)}
            sub="bonus from behind"
          />
        )}
      </StatGroup>
      {detailed && (
        <Coverage covered={totals.detailed_matches} total={totals.matches} what="souls by source recorded" />
      )}
    </StoryChapter>
  );
}

const SHOWN = 8;

/** One of the most bought items: its shop art framed in its shop category's color, how often and how well. */
function ShopItemCard({ row }: { row: RecapItem }) {
  const { item, isLoading } = useItemById(row.item_id);
  const slot = item?.item_slot_type;
  const winRate = row.wins / Math.max(1, row.matches);
  return (
    // The category color is data: the prop built for it takes it.
    <Card tone="inset" size="sm" accent={slot && slot in ITEM_SLOT_COLOR ? ITEM_SLOT_COLOR[slot] : undefined}>
      {/* The art above the name in a phone's two narrow columns, beside it from a wider chapter. */}
      <CardContent className="flex flex-col items-start gap-2 text-start @md/story:flex-row @md/story:items-center @md/story:gap-3">
        <ItemImage item={item} loading={isLoading} alt="" title="" className="size-10 shrink-0 @2xl/story:size-12" />
        <Stack gap={0.5} className="min-w-0">
          <Text variant="label" wrap="clamp-2">
            <ItemName item={item} loading={isLoading} className="whitespace-normal" />
          </Text>
          <Text variant="caption" tone="muted" numeric="tabular">
            {count(row.matches)} {plural(row.matches, "match", "matches")}
          </Text>
          {row.matches >= MIN_SAMPLE ? (
            <Text variant="caption" numeric="tabular" tone={toneOf(winRate, 0.5)}>
              {formatPercent(winRate)} won
            </Text>
          ) : (
            <Text variant="caption" tone="muted">
              Too few for a win rate
            </Text>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

/** The shop: the go-to buy, the most bought items and their win rates once an item has enough matches. */
export function ShopChapter({ id, main }: { id: string; main: ModeRecap }) {
  const { totals, items } = main;
  const [top] = items;
  if (!top) return null;
  const best = items
    .filter((item) => item.matches >= MIN_SAMPLE)
    .reduce<(typeof items)[number] | undefined>(
      (winner, item) => (!winner || item.wins / item.matches > winner.wins / winner.matches ? item : winner),
      undefined,
    );
  return (
    <StoryChapter
      id={id}
      eyebrow="Shop"
      title={
        <>
          Your go-to buy: <ItemName itemId={top.item_id} />
        </>
      }
      description={`Bought in ${formatPercent(top.matches / Math.max(1, totals.detailed_matches), 0)} of your matches with a recorded build.`}
    >
      <FigureArt
        art={<ItemImage itemId={top.item_id} alt="" title="" className="size-16 shrink-0 @2xl/story:size-20" />}
      >
        <StoryFigure value={count(top.matches)} unit={plural(top.matches, "match", "matches")} />
      </FigureArt>
      <Grid columns={{ base: 2, lg: 4 }} gap={2}>
        {items.slice(0, SHOWN).map((item) => (
          <ShopItemCard key={item.item_id} row={item} />
        ))}
      </Grid>
      {best && (
        <StatGroup size="sm" overflow="wrap" className="grid-cols-1">
          <Stat
            label="Best item by win rate"
            value={<ItemCell itemId={best.item_id} className="inline-flex max-w-full" />}
            sub={`${formatPercent(best.wins / best.matches)} won in ${count(best.matches)} matches`}
          />
        </StatGroup>
      )}
      <Coverage covered={totals.detailed_matches} total={totals.matches} what="their builds recorded" />
    </StoryChapter>
  );
}
