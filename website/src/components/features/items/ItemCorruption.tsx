import { useQuery } from "@tanstack/react-query";
import type { AnalyticsApiItemStatsRequest, ItemStats, Upgrade } from "deadlock_api_client";
import { ShieldAlert, Sparkles } from "lucide-react";

import { CorruptedItemImage } from "~/components/domain/assets/CorruptedItemImage";
import { Section } from "~/components/patterns/page/Section";
import { Panel, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Card } from "~/components/ui/card";
import { Delta } from "~/components/ui/delta";
import { Grid } from "~/components/ui/grid";
import { NoValue } from "~/components/ui/no-value";
import { Stack } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Text } from "~/components/ui/text";
import {
  CORRUPTED_ITEMS_SINCE_UNIX,
  corruptedStats,
  penaltiesForTier,
  type CorruptionData,
} from "~/lib/corrupted-items";
import { formatPercent } from "~/lib/format";
import { wilsonScoreInterval } from "~/lib/wilson";
import { corruptionQueryOptions } from "~/queries/asset-queries";
import { itemStatsQueryOptions } from "~/queries/item-stats-query";

/** Below this many matches a win rate is marked as a small sample and not compared (as in the hero matchups). */
const SMALL_SAMPLE = 100;

/**
 * What the Broker's corrupted version of an item does: its stronger stats beside the normal ones, the penalties it can
 * roll at its tier (and those it never rolls), and how the two versions fare. Renders nothing for an item the Broker
 * does not trade.
 */
export function ItemCorruption({
  item,
  request,
  rankRange,
}: {
  /** The item with its properties (`itemQueryOptions`), which the list queries strip. */
  item: Upgrade;
  /** The page's item stats request; the comparison narrows it to the matches since the update. */
  request: AnalyticsApiItemStatsRequest;
  /** The request's rank range in words, such as "Phantom 1+". */
  rankRange: string;
}) {
  const { data: corruption } = useQuery(corruptionQueryOptions);
  const info = item.corrupted_info;
  if (!info) return null;
  const itemName = item.name;
  const stats = corruptedStats(item.properties, info.property_upgrades);

  return (
    <Section
      title={`Corrupted ${itemName}`}
      description={`The Broker trades ${itemName} for a corrupted version: stronger stats, plus penalties rolled once per match.`}
    >
      <Card size="sm" className="max-w-3xl flex-row items-start gap-4 p-4">
        <CorruptedItemImage item={item} frame="active" className="size-16" />
        <Stack gap={2}>
          <Text as="p" variant="caption" tone="muted">
            The Broker is a merchant who shows up around minute 30 of a normal match and again roughly every 15 minutes
            after. He swaps a tier 3 or 4 item for its corrupted version. In Street Brawl, every player gets to corrupt
            an item after the round {corruption?.streetBrawlRound ?? 5} item draft.
          </Text>
          <Text as="p" variant="caption" tone="muted">
            A corrupted item keeps its effect with stronger stats, and takes on penalties from a fixed set. They are
            rolled once per match, so every corrupted item in that match carries the same ones.
            <CorruptionPrice corruption={corruption} tier={item.item_tier} />
          </Text>
        </Stack>
      </Card>

      <Grid columns={{ base: 1, lg: 2 }} gap={4} className="items-start">
        {stats.length > 0 && (
          <Panel>
            <PanelHeader title="Stat bonuses" icon={Sparkles} description={`${stats.length} stronger`} />
            <Table density="compact" aria-label={`${itemName} stats, normal and corrupted`} className="tabular-nums">
              <TableHeader>
                <TableRow>
                  <TableHead>Stat</TableHead>
                  <TableHead className="text-end">Normal</TableHead>
                  <TableHead className="text-end">Corrupted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.map((stat) => (
                  <TableRow key={stat.name}>
                    <TableCell className="whitespace-normal">{stat.label}</TableCell>
                    <TableCell className="text-end text-muted-foreground">{stat.normal ?? <NoValue />}</TableCell>
                    <TableCell className="text-end font-semibold">{stat.corrupted}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        )}
        <PenaltyPanel
          corruption={corruption}
          tier={item.item_tier}
          excluded={info.excluded_penalties}
          itemName={itemName}
        />
      </Grid>

      <CorruptionPerformance itemId={item.id} itemName={itemName} request={request} rankRange={rankRange} />
    </Section>
  );
}

function CorruptionPrice({ corruption, tier }: { corruption: CorruptionData | undefined; tier: number }) {
  const price = corruption?.pricePerTier[tier] ?? 0;
  if (price <= 0) return null;
  return <> Corrupting it costs {price.toLocaleString("en-US")} souls.</>;
}

function PenaltyPanel({
  corruption,
  tier,
  excluded,
  itemName,
}: {
  corruption: CorruptionData | undefined;
  tier: number;
  excluded: readonly string[];
  itemName: string;
}) {
  if (!corruption) {
    return (
      <Panel>
        <PanelHeader title="Possible penalties" icon={ShieldAlert} />
        <LoadingState label="penalties" size="sm" align="center" />
      </Panel>
    );
  }
  const rows = penaltiesForTier(corruption.penalties, tier, excluded);
  // No penalty data for this tier (or at all): the section says enough without an empty table.
  if (rows.length === 0) return null;
  const rollable = rows.filter((row) => !row.excluded).length;
  const never = rows.length - rollable;

  return (
    <Panel>
      <PanelHeader
        title="Possible penalties"
        icon={ShieldAlert}
        description={`Tier ${tier} values · ${rollable} can roll${never > 0 ? ` · ${never} never on ${itemName}` : ""}`}
      />
      <Table density="compact" aria-label={`Penalties a corrupted ${itemName} can roll`} className="tabular-nums">
        <TableHeader>
          <TableRow>
            <TableHead>Penalty</TableHead>
            <TableHead className="text-end">At tier {tier}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.name}>
              <TableCell className="whitespace-normal">
                <Stack gap={0.5}>
                  {row.effects.map((effect) => (
                    <Text key={effect.label} tone={row.excluded ? "muted" : "inherit"}>
                      {effect.label}
                    </Text>
                  ))}
                </Stack>
              </TableCell>
              <TableCell className="text-end">
                {row.excluded ? (
                  <Text tone="muted">Never rolls here</Text>
                ) : (
                  <Stack gap={0.5} className="items-end">
                    {row.effects.map((effect) => (
                      <Text key={effect.label} tone="negative">
                        {effect.value}
                      </Text>
                    ))}
                  </Stack>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

function rowFor(rows: readonly ItemStats[] | undefined, itemId: number) {
  const row = rows?.find((candidate) => candidate.item_id === itemId);
  return row && row.matches > 0 ? row : undefined;
}

function CorruptionPerformance({
  itemId,
  itemName,
  request,
  rankRange,
}: {
  itemId: number;
  itemName: string;
  request: AnalyticsApiItemStatsRequest;
  rankRange: string;
}) {
  // Both versions over the same matches: the normal item since the update too, or a season of normal purchases would
  // stand against a few days of corrupted ones. `only` itself ignores bounds before the update.
  const since = Math.max(request.minUnixTimestamp ?? 0, CORRUPTED_ITEMS_SINCE_UNIX);
  const normalQuery = useQuery(itemStatsQueryOptions({ ...request, minUnixTimestamp: since }));
  const corruptedQuery = useQuery(itemStatsQueryOptions({ ...request, corruptedItems: "only" }));
  const minMatches = request.minMatches ?? 0;

  const heading = (
    <Text as="p" variant="caption" tone="muted" className="max-w-3xl">
      Win rates of players who bought each version, in {rankRange} matches since the City Never Sleeps update (September
      29, 2026). The Broker only trades from about minute 30, so corrupted items only show up in longer matches; read
      the difference with that in mind.
    </Text>
  );

  if (normalQuery.isPending || corruptedQuery.isPending) {
    return (
      <Stack gap={3}>
        {heading}
        <LoadingState label={`corrupted ${itemName} stats`} size="sm" />
      </Stack>
    );
  }
  if (normalQuery.isError || corruptedQuery.isError) {
    return (
      <Stack gap={3}>
        {heading}
        <ErrorState
          variant="inline"
          title={`Corrupted ${itemName} stats did not load`}
          onRetry={() => void Promise.all([normalQuery.refetch(), corruptedQuery.refetch()])}
        />
      </Stack>
    );
  }

  const normal = rowFor(normalQuery.data, itemId);
  const corrupted = rowFor(corruptedQuery.data, itemId);
  if (!corrupted) {
    return (
      <Stack gap={3}>
        {heading}
        <EmptyState
          variant="inline"
          title={
            minMatches > 1
              ? `Fewer than ${minMatches} tracked matches with a corrupted ${itemName} so far`
              : `No tracked matches with a corrupted ${itemName} yet`
          }
        />
      </Stack>
    );
  }

  const corruptedRate = corrupted.wins / corrupted.matches;
  const normalRate = normal ? normal.wins / normal.matches : undefined;
  const small = corrupted.matches < SMALL_SAMPLE;
  const [low, high] = wilsonScoreInterval(corrupted.wins, corrupted.matches);
  const matches = (count: number) => `${count.toLocaleString("en-US")} matches`;

  return (
    <Stack gap={3}>
      {heading}
      <StatGroup variant="tiles" className="grid-cols-1 sm:grid-cols-3">
        <Stat
          label="Normal win rate"
          value={normalRate !== undefined ? formatPercent(normalRate) : undefined}
          sub={normal ? matches(normal.matches) : "Not enough matches"}
        />
        <Stat
          label="Corrupted win rate"
          value={formatPercent(corruptedRate)}
          sub={`${matches(corrupted.matches)}${small ? " · Small sample" : ""} · 95% range ${formatPercent(low)} to ${formatPercent(high)}`}
        />
        <Stat
          label="Difference"
          value={
            normalRate !== undefined && !small ? <Delta value={corruptedRate - normalRate} unit=" pp" /> : undefined
          }
          sub={small ? `Shown from ${SMALL_SAMPLE} corrupted matches` : "Corrupted minus normal"}
        />
      </StatGroup>
    </Stack>
  );
}
