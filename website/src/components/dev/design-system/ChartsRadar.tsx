import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { ChartLegend, ChartLegendToggle } from "~/components/patterns/charts/ChartLegend";
import { ChartReading, ChartReadings } from "~/components/patterns/charts/ChartReadings";
import { RadarChart, RadarSeries } from "~/components/patterns/charts/RadarChart";
import { SERIES_COLORS } from "~/components/patterns/charts/theme";
import { useSeriesHighlight } from "~/components/patterns/charts/useSeriesHighlight";
import { Grid } from "~/components/ui/grid";
import { Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { rankShareLabel } from "~/lib/player-compare";

const PLAYERS = [
  { key: "a", name: "Wraithbane", style: "Farmer · Top 6% in Farming" },
  { key: "b", name: "Lilac", style: "Brawler · Top 9% in Kills" },
  { key: "c", name: "a-very-long-player-name-that-truncates", style: "Support · Top 12% in Healing" },
  { key: "d", name: "Kestrel", style: "All-rounder" },
  { key: "e", name: "Mo", style: "Objective focused · Top 4% in Objectives" },
] as const;

type Row = { axis: string } & Record<(typeof PLAYERS)[number]["key"], number>;

const ROWS: Row[] = [
  { axis: "Damage", a: 62, b: 88, c: 35, d: 58, e: 70 },
  { axis: "Kills", a: 55, b: 91, c: 28, d: 60, e: 64 },
  { axis: "Accuracy", a: 71, b: 48, c: 52, d: 57, e: 45 },
  { axis: "Farming", a: 94, b: 60, c: 30, d: 55, e: 82 },
  { axis: "Objectives", a: 80, b: 42, c: 25, d: 50, e: 96 },
  { axis: "Survival", a: 66, b: 22, c: 74, d: 61, e: 40 },
  { axis: "Healing", a: 20, b: 35, c: 88, d: 52, e: 30 },
  { axis: "Teamplay", a: 38, b: 70, c: 85, d: 59, e: 48 },
];

function AxisReadings({ entry }: { entry?: Row }) {
  if (!entry) return null;
  return (
    <ChartReadings title={entry.axis} size="sm">
      {PLAYERS.map((player, i) => (
        <ChartReading key={player.key} label={player.name} color={SERIES_COLORS[i]}>
          {rankShareLabel(entry[player.key])}
        </ChartReading>
      ))}
    </ChartReadings>
  );
}

function RadarDemo({ count }: { count: number }) {
  const { highlighted, toggleProps } = useSeriesHighlight();
  const players = PLAYERS.slice(0, count);
  return (
    <Grid columns={{ base: 1, lg: 2 }} gap={3} className="items-center">
      <RadarChart
        label={`Playstyle percentiles of ${count} players`}
        size="square"
        variant="bare"
        data={ROWS}
        axisKey="axis"
        baseline={50}
        highlighted={highlighted}
        tooltip={<AxisReadings />}
      >
        {players.map((player, i) => (
          <RadarSeries key={player.key} dataKey={player.key} name={player.name} color={SERIES_COLORS[i]} />
        ))}
      </RadarChart>
      <ChartLegend label="Players" orientation="vertical">
        {players.map((player, i) => (
          <ChartLegendToggle key={player.key} color={SERIES_COLORS[i]} shape="line" {...toggleProps(player.key)}>
            <Stack gap={0} className="min-w-0 py-1">
              <Text variant="label" tone="default" wrap="truncate">
                {player.name}
              </Text>
              <Text variant="caption" tone="muted" wrap="truncate">
                {player.style}
              </Text>
            </Stack>
          </ChartLegendToggle>
        ))}
      </ChartLegend>
    </Grid>
  );
}

export function ChartsRadar() {
  return (
    <>
      <Specimen
        name="RadarChart"
        source="patterns/charts/RadarChart"
        note="Several measures on one shared scale (percentiles, scores), a shape per series; RadarSeries children carry the color. baseline draws a dashed reference ring (the median). A faint fill and strong outlines keep overlaps readable; highlighted brings one series forward and dims the rest, driven by ChartLegendToggle + useSeriesHighlight. The tooltip is a slot element that receives the hovered axis' row."
      >
        <Variants label="2 series" className="block">
          <RadarDemo count={2} />
        </Variants>
        <Variants label="5 series: hover, focus or press a legend item" className="block">
          <RadarDemo count={5} />
        </Variants>
      </Specimen>

      <Specimen
        name="ChartLegendToggle"
        source="patterns/charts/ChartLegend"
        note="A legend item that singles out its series: hover or focus highlights it for as long as it lasts, pressing pins it (aria-pressed). Drive a set of them with useSeriesHighlight(): spread toggleProps(id) and pass highlighted to the chart."
      >
        <Variants label="size default, one pinned">
          <ChartLegend label="Players">
            <ChartLegendToggle color={SERIES_COLORS[0]} shape="line" pressed>
              Wraithbane
            </ChartLegendToggle>
            <ChartLegendToggle color={SERIES_COLORS[1]} shape="line">
              Lilac
            </ChartLegendToggle>
          </ChartLegend>
        </Variants>
        <Variants label='size="sm"'>
          <ChartLegend size="sm" label="Players">
            <ChartLegendToggle color={SERIES_COLORS[2]} shape="square">
              Kestrel
            </ChartLegendToggle>
            <ChartLegendToggle color={SERIES_COLORS[3]} shape="square">
              Mo
            </ChartLegendToggle>
          </ChartLegend>
        </Variants>
      </Specimen>
    </>
  );
}
