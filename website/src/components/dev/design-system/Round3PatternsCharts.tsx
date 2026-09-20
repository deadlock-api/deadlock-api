import { Flag } from "lucide-react";
import { useState } from "react";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import {
  ChartGradientLegend,
  ChartLegend,
  ChartLegendItem,
  ChartSwatch,
} from "~/components/patterns/charts/ChartLegend";
import { ChartOverlay, ChartOverlayItem, ChartStage } from "~/components/patterns/charts/ChartOverlay";
import { ChartReading, ChartReadings } from "~/components/patterns/charts/ChartReadings";
import { ChartEmpty, ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { SERIES_COLORS } from "~/components/patterns/charts/theme";
import { WinRateBarChart } from "~/components/patterns/charts/WinRateBarChart";
import { Field } from "~/components/ui/field";
import { PanelTooltipCard, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/panel-tooltip";
import { Slider } from "~/components/ui/slider";

interface Bin {
  tick: string;
  label: string;
  winRate: number;
  matches: number;
  color: string;
}

const BINS: Bin[] = [
  { tick: "0m", label: "0–5m", winRate: 0.548, matches: 18240, color: SERIES_COLORS[0] },
  { tick: "5m", label: "5–10m", winRate: 0.521, matches: 40110, color: SERIES_COLORS[1] },
  { tick: "10m", label: "10–15m", winRate: 0.497, matches: 22050, color: SERIES_COLORS[2] },
  { tick: "15m", label: "15–20m", winRate: 0.468, matches: 9120, color: SERIES_COLORS[3] },
];

function BinTooltip({ entry }: { entry?: Bin }) {
  if (!entry) return null;
  return (
    <PanelTooltipCard>
      <TooltipHeader title={`Bought at ${entry.label}`} />
      <TooltipStats>
        <TooltipStat label="Win rate" value={`${(entry.winRate * 100).toFixed(1)}%`} />
        <TooltipStat label="Matches" value={entry.matches.toLocaleString("en-US")} />
      </TooltipStats>
    </PanelTooltipCard>
  );
}

const SHAPES = ["line", "square", "dot", "ring"] as const;
const LAYERS = [
  { id: "kill", label: "Kill", color: "var(--positive)" },
  { id: "death", label: "Death", color: "var(--negative)" },
] as const;

export function Round3PatternsCharts() {
  const [hidden, setHidden] = useState<string[]>(["death"]);
  const [opacity, setOpacity] = useState(60);
  const toggle = (id: string) => setHidden(hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id]);
  return (
    <>
      <Specimen
        name="WinRateBarChart"
        source="patterns/charts/WinRateBarChart"
        note="Win rate per category, each bar drawn from the 50% line: up is better than even, down is worse. Bars take the positive or negative tone, or a color from the data with colorKey. The tooltip is a slot element that receives the hovered entry."
      >
        <Variants label="tone by baseline (default)" className="block">
          <WinRateBarChart
            label="Win rate by purchase time"
            size="md"
            data={BINS}
            xKey="tick"
            valueKey="winRate"
            tooltip={<BinTooltip />}
          />
        </Variants>
        <Variants label='colorKey="color", variant="flush", size="sm"' className="block">
          <WinRateBarChart
            label="Win rate by rank"
            size="sm"
            variant="flush"
            data={BINS}
            xKey="tick"
            valueKey="winRate"
            colorKey="color"
            tooltip={<BinTooltip />}
          />
        </Variants>
      </Specimen>

      <Specimen
        name="ChartLegend items and toggles"
        source="patterns/charts/ChartLegend"
        note="Compose ChartLegendItem children. With onToggle an entry is a button: a hidden series is struck through and aria-pressed is false, never removed. ChartSwatch is the mark on its own, for a tooltip row or a table cell."
      >
        <Variants label='size="default" | "sm"' className="block">
          <ChartLegend>
            <ChartLegendItem color={SERIES_COLORS[0]} shape="line">
              Win rate
            </ChartLegendItem>
            <ChartLegendItem color={SERIES_COLORS[1]}>Pick rate</ChartLegendItem>
            <ChartLegendItem color={SERIES_COLORS[2]} shape="ring">
              Projected
            </ChartLegendItem>
          </ChartLegend>
          <ChartLegend size="sm">
            <ChartLegendItem color={SERIES_COLORS[0]} shape="line">
              Win rate
            </ChartLegendItem>
            <ChartLegendItem color={SERIES_COLORS[1]}>Pick rate</ChartLegendItem>
          </ChartLegend>
        </Variants>
        <Variants label="interactive: on, off (hidden), with an icon instead of a swatch" className="block">
          <ChartLegend label="Timeline layers">
            {LAYERS.map((layer) => (
              <ChartLegendItem
                key={layer.id}
                color={layer.color}
                shape="dot"
                hidden={hidden.includes(layer.id)}
                onToggle={() => toggle(layer.id)}
              >
                {layer.label}
              </ChartLegendItem>
            ))}
            <ChartLegendItem
              color="var(--foreground)"
              icon={<Flag />}
              hidden={hidden.includes("objective")}
              onToggle={() => toggle("objective")}
            >
              Objectives
            </ChartLegendItem>
          </ChartLegend>
        </Variants>
        <Variants label="ChartSwatch: shape × size">
          {SHAPES.map((shape) => (
            <span key={shape} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ChartSwatch shape={shape} color={SERIES_COLORS[3]} />
              <ChartSwatch shape={shape} color={SERIES_COLORS[3]} size="sm" />
              {shape}
            </span>
          ))}
        </Variants>
      </Specimen>

      <Specimen
        name="ChartReadings rows"
        source="patterns/charts/ChartReadings"
        note="The tooltip of a multi-series chart, composed from ChartReading children: a color dot, the value, an optional extra column (extraLabel adds it), and a highlighted reading. It scrolls from eight readings on."
      >
        <Variants label='size="lg" with summary, column labels, extra, highlighted' className="items-start">
          <ChartReadings
            title="May 4, 2026 [UTC]"
            size="lg"
            summary="3 heroes"
            valueLabel="Win rate"
            extraLabel="Matches"
          >
            <ChartReading label="Abrams" color={SERIES_COLORS[0]} extra="12,480" highlighted>
              52.1%
            </ChartReading>
            <ChartReading label="A hero with a very long name that truncates" color={SERIES_COLORS[1]} extra="9,210">
              49.8%
            </ChartReading>
            <ChartReading label="Haze" color={SERIES_COLORS[2]}>
              48.0%
            </ChartReading>
          </ChartReadings>
          <ChartReadings title="Week of Apr 27" scrollHint="Scroll for all heroes">
            {Array.from({ length: 9 }, (_, i) => (
              <ChartReading key={i} label={`Hero ${i + 1}`} color={SERIES_COLORS[i % SERIES_COLORS.length]}>
                {50 - i}.0%
              </ChartReading>
            ))}
          </ChartReadings>
        </Variants>
      </Specimen>

      <Specimen
        name="ChartEmpty and ChartError size"
        source="patterns/charts/ChartStates"
        note="Pass the plot's size, as ChartLoading already takes it, so a state is as tall as the plot it stands in for. Strips (xs, sm) get the one-line state."
      >
        <Variants label='size="md": loading | empty | error' className="grid items-start lg:grid-cols-3">
          <ChartLoading label="win rate" size="md" />
          <ChartEmpty label="win rate data" size="md" />
          <ChartError label="win rate" size="md" onRetry={() => {}} retrying={false} />
        </Variants>
        <Variants label='size="sm": one line' className="grid items-start lg:grid-cols-3">
          <ChartLoading label="sparkline" size="sm" />
          <ChartEmpty label="trend" size="sm" />
          <ChartError label="trend" size="sm" onRetry={() => {}} retrying />
        </Variants>
      </Specimen>

      <Specimen
        name="ChartOverlay"
        source="patterns/charts/ChartOverlay"
        note="Glass pills floating in a corner of a canvas, a map or a WebGL scene: ChartStage is the rounded, clipped box, ChartOverlay names the corner, ChartOverlayItem is one pill. ChartGradientLegend is the key to a continuous scale."
      >
        <ChartStage className="h-56 bg-muted">
          <ChartOverlay position="top-start">Drag to rotate · Scroll to zoom</ChartOverlay>
          <ChartOverlay position="top-end">
            <ChartOverlayItem>top-end</ChartOverlayItem>
          </ChartOverlay>
          <ChartOverlay position="bottom-start">
            <ChartOverlayItem>
              <Field orientation="horizontal" label={<span className="text-3xs">Opacity</span>}>
                <Slider
                  aria-label="Opacity"
                  min={10}
                  max={100}
                  value={[opacity]}
                  onValueChange={([next]) => setOpacity(next)}
                  className="w-20"
                />
                <span className="w-7 tabular-nums">{opacity}%</span>
              </Field>
            </ChartOverlayItem>
            <ChartOverlayItem>A second pill stacks under it</ChartOverlayItem>
          </ChartOverlay>
          <ChartOverlay>
            <ChartOverlayItem>
              <ChartGradientLegend
                label="Kills per cell"
                min="0"
                max="1,240"
                stops={["var(--chart-1)", "var(--chart-4)", "var(--chart-6)"]}
              />
            </ChartOverlayItem>
          </ChartOverlay>
        </ChartStage>
        <Variants label='ChartGradientLegend size="sm"'>
          <ChartGradientLegend
            size="sm"
            min="0.4"
            max="2.1"
            stops={["var(--negative)", "var(--muted)", "var(--positive)"]}
          />
        </Variants>
      </Specimen>
    </>
  );
}
