import { ListOrdered } from "lucide-react";
import { Area, AreaChart, XAxis, YAxis } from "recharts";

import { ChartSwatch } from "~/components/patterns/charts/ChartLegend";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import { CHART_COLOR, CHART_MARGIN_SM, CHART_Y_AXIS_SM } from "~/components/patterns/charts/theme";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { Inline, Stack } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import type { LiveQueuePoint } from "~/lib/live-requests/useLiveRequests";

interface LiveQueuePanelProps extends React.ComponentProps<typeof Panel> {
  /** The queue at every batch of the last minute, oldest first. Empty before the first batch. */
  history?: LiveQueuePoint[];
}

const NO_HISTORY: LiveQueuePoint[] = [];
const REQUESTS_COLOR = CHART_COLOR.primary;
const DB_COLOR = CHART_COLOR.comparison;
const WAITING_COLOR = CHART_COLOR.caution;

/** A stat's label with the swatch of its line in the chart below: the stats are the chart's key. */
function Keyed({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <Inline gap={1.5} align="center">
      <ChartSwatch color={color} shape="line" />
      {children}
    </Inline>
  );
}

/** What the server is working on right now: API requests in progress and the database queries behind them. */
export function LiveQueuePanel({ history = NO_HISTORY, ...props }: LiveQueuePanelProps) {
  const now = history.at(-1);
  const peak = history.reduce((most, point) => Math.max(most, point.peak), 0);
  return (
    <Panel {...props}>
      <PanelHeader title="Server queue" icon={ListOrdered} description="Last minute" size="sm" />
      <PanelBody size="sm" className="flex min-h-0 flex-1 flex-col">
        <Stack gap={2} className="min-h-0 flex-1">
          <StatGroup size="xs" variant="plain" className="grid-cols-3">
            <Stat
              label={<Keyed color={REQUESTS_COLOR}>In progress</Keyed>}
              value={now?.inFlight.toLocaleString("en-US")}
              sub={now && `Peak ${peak.toLocaleString("en-US")}`}
            />
            <Stat
              label={<Keyed color={DB_COLOR}>DB running</Keyed>}
              value={now?.dbRunning.toLocaleString("en-US")}
              sub={now && now.dbSlots > 0 && `of ${now.dbSlots.toLocaleString("en-US")} slots`}
            />
            <Stat
              label={<Keyed color={WAITING_COLOR}>DB waiting</Keyed>}
              value={now?.dbWaiting.toLocaleString("en-US")}
              tone={now && now.dbWaiting > 0 ? "negative" : undefined}
            />
          </StatGroup>
          <ChartSurface
            label={
              now
                ? `Over the last minute, at most ${peak} requests were in progress at once; now ${now.inFlight}, with ${now.dbRunning} database queries running and ${now.dbWaiting} waiting`
                : "The server queue, once the feed connects"
            }
            announce="label"
            size="grow"
            variant="bare"
            className="min-h-12"
          >
            <AreaChart data={history} margin={CHART_MARGIN_SM}>
              <XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} hide />
              <YAxis {...CHART_Y_AXIS_SM} allowDecimals={false} domain={[0, "auto"]} />
              <Area
                type="stepAfter"
                dataKey="peak"
                isAnimationActive={false}
                stroke={REQUESTS_COLOR}
                fill={REQUESTS_COLOR}
                fillOpacity={0.15}
                strokeWidth={1.5}
                dot={false}
              />
              <Area
                type="stepAfter"
                dataKey="dbRunning"
                isAnimationActive={false}
                stroke={DB_COLOR}
                fill="none"
                strokeWidth={1.5}
                dot={false}
              />
              <Area
                type="stepAfter"
                dataKey="dbWaiting"
                isAnimationActive={false}
                stroke={WAITING_COLOR}
                fill="none"
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ChartSurface>
        </Stack>
      </PanelBody>
    </Panel>
  );
}
