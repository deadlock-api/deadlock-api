import { Swords } from "lucide-react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { PanelSection } from "~/components/patterns/panel/Panel";
import { PanelWithDetails } from "~/components/patterns/panel/PanelWithDetails";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { Delta } from "~/components/ui/delta";
import { KeyValue, KeyValueCell, KeyValueList } from "~/components/ui/key-value";
import { NoValue } from "~/components/ui/no-value";
import { Skeleton } from "~/components/ui/skeleton";
import { Stat, StatGroup } from "~/components/ui/stat";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { formatPercent } from "~/lib/format";
import { toneOf } from "~/lib/tone";
import { type LaneRecord, type LaneSummary, type StatMatch, TREND_METRICS } from "~/lib/tracker/match-stats";

const integer = (value: number) => Math.round(value).toLocaleString("en-US");
const signed = (value: number) => `${value > 0 ? "+" : ""}${integer(value)}`;
/** Lane opponents shown in the panel; the dialog lists every one. */
const TOP_OPPONENTS = 5;
const AT_LANE_END = ["lane_souls", "lane_last_hits", "lane_denies", "lane_kills", "lane_deaths", "lane_damage"];

const laneWinRate = (record: LaneRecord) => (record.lanes ? record.won / record.lanes : null);
// Whole souls, so a lead that rounds to nothing reads as even rather than "-0" in the loss color.
const averageLead = (record: LaneRecord) => (record.lanes ? Math.round(record.diffSum / record.lanes) || 0 : null);

/** How the selected matches' lanes went: who was ahead at 9:00, by lane and by opponent, and what it led to. */
export function LaningPanel({
  matches,
  summary,
  state,
  onRetry,
  className,
}: {
  matches: StatMatch[];
  summary: LaneSummary;
  state: "ready" | "loading" | "error";
  onRetry: () => void;
  className?: string;
}) {
  const { all, afterWon, afterLost } = summary;
  const loading = state === "loading";
  const value = (text: string | null) => (loading ? <Skeleton className="h-5 w-12" /> : text);
  const rate = (part: { matches: number; wins: number }) =>
    part.matches ? formatPercent(part.wins / part.matches) : null;
  const atLaneEnd = AT_LANE_END.flatMap((key) => TREND_METRICS.filter((metric) => metric.key === key));
  const opponents = summary.byOpponent.slice(0, TOP_OPPONENTS);

  return (
    <PanelWithDetails
      title="Laning"
      icon={Swords}
      description={loading ? "Loading lanes" : `${integer(all.lanes)} lanes · souls at 9:00`}
      details={<LaneOpponentsTable summary={summary} />}
      className={className}
    >
      {state === "error" ? (
        <ErrorState variant="inline" title="Lane stats couldn’t be loaded" onRetry={onRetry} />
      ) : !loading && all.lanes === 0 ? (
        <EmptyState variant="inline" size="compact" title="No recorded lanes in these matches" />
      ) : (
        <div className="grid gap-x-4 gap-y-2 @2xl/overview:grid-cols-2 @5xl/overview:grid-cols-4">
          <StatGroup variant="joined" size="sm" className="grid-cols-2 self-start">
            <Stat
              label="Lanes won"
              value={value(laneWinRate(all) == null ? null : formatPercent(laneWinRate(all) ?? 0))}
              sub={loading ? <Skeleton className="h-4 w-14" /> : `${integer(all.won)}W / ${integer(all.lost)}L`}
              tone={toneOf(laneWinRate(all), 0.5)}
            />
            <Stat
              label="Souls lead"
              value={value(averageLead(all) == null ? null : signed(averageLead(all) ?? 0))}
              sub="vs. lane opponents"
              tone={toneOf(averageLead(all), 0)}
            />
            <Stat
              label="Win rate · lane won"
              value={value(rate(afterWon))}
              sub={loading ? <Skeleton className="h-4 w-14" /> : `${integer(afterWon.matches)} matches`}
            />
            <Stat
              label="Win rate · lane lost"
              value={value(rate(afterLost))}
              sub={loading ? <Skeleton className="h-4 w-14" /> : `${integer(afterLost.matches)} matches`}
            />
          </StatGroup>
          <section className="min-w-0">
            <PanelSection variant="label" title="At 9:00" className="px-0 pt-0">
              <span>Per match</span>
            </PanelSection>
            <KeyValueList>
              {atLaneEnd.map((metric) => {
                let sum = 0;
                let count = 0;
                for (const match of matches) {
                  const reading = metric.value(match);
                  if (reading == null) continue;
                  sum += reading;
                  count++;
                }
                return (
                  <KeyValue
                    key={metric.key}
                    label={metric.label.replace(/ (at|by) 9:00$/, "")}
                    value={
                      loading ? <Skeleton className="ms-auto h-4 w-10" /> : count ? metric.format(sum / count) : null
                    }
                  />
                );
              })}
            </KeyValueList>
          </section>
          <section className="min-w-0">
            <PanelSection variant="label" title="By lane" className="px-0 pt-0">
              <span className="min-w-0 grow basis-0 text-end">Lanes · won · lead</span>
            </PanelSection>
            <KeyValueList>
              {summary.byLane.map(({ lane, record }) => (
                <KeyValue
                  key={lane.id}
                  label={<span className={lane.textClass}>{lane.name}</span>}
                  value={loading ? <Skeleton className="ms-auto h-4 w-24" /> : <RecordCells record={record} />}
                />
              ))}
            </KeyValueList>
          </section>
          <section className="min-w-0">
            <PanelSection variant="label" title="Lane opponents" className="px-0 pt-0">
              <span className="min-w-0 grow basis-0 text-end">Lanes · won · lead</span>
            </PanelSection>
            <KeyValueList>
              {loading
                ? Array.from({ length: TOP_OPPONENTS }, (_, index) => (
                    <KeyValue
                      key={index}
                      label={<Skeleton className="h-4 w-20" />}
                      value={<Skeleton className="ms-auto h-4 w-24" />}
                    />
                  ))
                : opponents.map(({ heroId, record }) => (
                    <KeyValue
                      key={heroId}
                      label={
                        <span className="flex min-w-0 items-center gap-1">
                          <span aria-hidden="true">
                            <HeroImage heroId={heroId} className="size-4" title="" />
                          </span>
                          <HeroName heroId={heroId} className="truncate" />
                        </span>
                      }
                      value={<RecordCells record={record} />}
                    />
                  ))}
            </KeyValueList>
          </section>
        </div>
      )}
    </PanelWithDetails>
  );
}

function RecordCells({ record }: { record: LaneRecord }) {
  const winRate = laneWinRate(record);
  const lead = averageLead(record);
  return (
    <span className="inline-flex items-baseline gap-2">
      <KeyValueCell label="Lanes" className="font-normal text-muted-foreground">
        {integer(record.lanes)}
      </KeyValueCell>
      <KeyValueCell label="Lanes won" className="w-11 text-end">
        {winRate == null ? <NoValue label="No lanes" /> : formatPercent(winRate, 0)}
      </KeyValueCell>
      <KeyValueCell label="Average souls lead" className="w-14 text-end">
        {lead == null ? (
          <NoValue label="No lanes" />
        ) : (
          <Delta value={lead} format="number" digits={0} fraction="trim" zero="visible" />
        )}
      </KeyValueCell>
    </span>
  );
}

function LaneOpponentsTable({ summary }: { summary: LaneSummary }) {
  if (summary.byOpponent.length === 0) return <EmptyState title="No recorded lanes" />;
  return (
    <Table density="dense">
      <TableCaption>Every hero laned against, most often faced first</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Opponent</TableHead>
          <TableHead className="text-end">Lanes</TableHead>
          <TableHead className="text-end">Lanes won</TableHead>
          <TableHead className="text-end">Avg. souls lead</TableHead>
          <TableHead className="text-end">Match win rate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {summary.byOpponent.map(({ heroId, record }) => (
          <TableRow key={heroId}>
            <TableHead scope="row">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true">
                  <HeroImage heroId={heroId} className="size-5" title="" />
                </span>
                <HeroName heroId={heroId} />
              </span>
            </TableHead>
            <TableCell className="text-end tabular-nums">{integer(record.lanes)}</TableCell>
            <TableCell className="text-end tabular-nums">{formatPercent(laneWinRate(record) ?? 0)}</TableCell>
            <TableCell className="text-end tabular-nums">
              <Delta value={averageLead(record)} format="number" digits={0} fraction="trim" zero="visible" />
            </TableCell>
            <TableCell className="text-end tabular-nums">
              {formatPercent(record.lanes ? record.matchWins / record.lanes : 0)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
