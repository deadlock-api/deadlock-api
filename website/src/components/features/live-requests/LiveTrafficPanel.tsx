import { Activity } from "lucide-react";

import { CHART_COLOR, LIVE_MAP_COLOR, SERIES_COLORS } from "~/components/patterns/charts/theme";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { Stack } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import { Text } from "~/components/ui/text";
import { formatPercent } from "~/lib/format";
import { EDGE_KINDS, type EdgeKind, type EdgeMinute } from "~/lib/live-requests/feed";
import type { LiveShare, LiveStats } from "~/lib/live-requests/useLiveRequests";
import { cn } from "~/lib/utils";

import { formatBytes, formatCompact, formatLatency } from "./format";
import { LiveRing, type LiveRingSlice } from "./LiveRing";

const TOP_SLICES = 6;

/** Where a request is answered, by Cloudflare kind, in the order of the map's key, with the map's colors. */
const EDGE_SLICE: Record<EdgeKind, { label: string; color: string }> = {
  apiCache: { label: "API, from Cloudflare's cache", color: LIVE_MAP_COLOR.apiCache },
  website: { label: "Website", color: LIVE_MAP_COLOR.website },
  assets: { label: "Assets (images, sounds)", color: LIVE_MAP_COLOR.assets },
  other: { label: "Other subdomains", color: LIVE_MAP_COLOR.other },
  lake: { label: "Data lake (Parquet)", color: LIVE_MAP_COLOR.lake },
};

function answeredBy(serverPerSecond: number, edge: EdgeMinute): LiveRingSlice[] {
  return [
    { key: "server", label: "Our server", color: LIVE_MAP_COLOR.origin, value: serverPerSecond },
    ...EDGE_KINDS.map((kind) => ({
      key: kind,
      label: EDGE_SLICE[kind].label,
      color: EDGE_SLICE[kind].color,
      value: edge.perSecond[kind],
    })),
  ];
}

/**
 * The top shares as slices in the series colors, in order (never cycled), and the rest folded into "Other", each as
 * requests per second of `perSecond`.
 */
function topSlices(shares: LiveShare[], perSecond: number): LiveRingSlice[] {
  const top = shares.slice(0, TOP_SLICES);
  const slices: LiveRingSlice[] = top.map((share, i) => ({
    key: share.key,
    label: share.label,
    color: SERIES_COLORS[i],
    value: share.share * perSecond,
  }));
  const rest = 1 - top.reduce((sum, share) => sum + share.share, 0);
  if (rest > 0.0005) slices.push({ key: "other", label: "Other", color: CHART_COLOR.neutral, value: rest * perSecond });
  return slices;
}

/** One block of the panel under its small heading. */
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack gap={1}>
      <Text variant="eyebrow" tone="muted">
        {title}
      </Text>
      {children}
    </Stack>
  );
}

function Empty() {
  return (
    <Text variant="caption" tone="muted">
      No requests yet
    </Text>
  );
}

interface LiveTrafficPanelProps extends React.ComponentProps<typeof Panel> {
  stats?: LiveStats;
  /** The newest minute of the requests Cloudflare answered itself; null when there is none. */
  edge?: EdgeMinute | null;
}

/**
 * The traffic of the last minute: its rate, the database rows and data it read, latency percentiles and failures, where
 * requests are answered, Cloudflare's cache, and the busiest endpoints and data centers. A 4xx is the client's doing, so only a 5xx counts as an error.
 */
export function LiveTrafficPanel({ stats, edge = null, ...props }: LiveTrafficPanelProps) {
  const edges: LiveShare[] = stats?.edges ?? [];
  // Before the first batch there is nothing to rate: every value shows as missing.
  const live = stats && stats.queue !== null ? stats : null;
  const edgePerSecond = edge ? EDGE_KINDS.reduce((sum, kind) => sum + edge.perSecond[kind], 0) : 0;
  const allPerSecond = live ? live.perSecond + edgePerSecond : 0;
  return (
    <Panel {...props} className={cn("@container", props.className)}>
      <PanelHeader title="Traffic" icon={Activity} description="Last minute" size="sm" />
      <PanelBody size="sm">
        <Stack gap={2}>
          <StatGroup size="xs" variant="plain" className="grid-cols-3">
            <Stat label="All requests/s" value={live ? formatCompact(allPerSecond) : undefined} />
            <Stat
              label="Latency p50 / p90 / p99"
              value={stats?.latency ? formatLatency(stats.latency) : undefined}
              className="col-span-2"
            />
            <Stat
              label="Errors (5xx)"
              value={stats?.errorShare != null ? formatPercent(stats.errorShare) : undefined}
              tone={stats?.errorShare ? "negative" : undefined}
            />
            <Stat label="DB rows read/s" value={live ? formatCompact(live.rowsPerSecond) : undefined} />
            <Stat label="DB data read/s" value={live ? formatBytes(live.bytesPerSecond) : undefined} />
          </StatGroup>
          {live && edge && (
            <Block title="Answered by">
              <LiveRing label="Requests by where they are answered" slices={answeredBy(live.perSecond, edge)} />
            </Block>
          )}
          {edge?.cache && (
            <Block title="Cloudflare">
              <StatGroup size="xs" variant="plain" className="grid-cols-4">
                <Stat
                  label="API cache hits"
                  value={formatPercent(edge.cache.apiCachedRequests / (edge.cache.apiRequests || 1), 0)}
                />
                <Stat
                  label="API uncached/s"
                  value={formatCompact(Math.max(0, edge.cache.apiRequests - edge.cache.apiCachedRequests) / 60)}
                />
                <Stat
                  label="All cache hits"
                  value={formatPercent(edge.cache.cachedRequests / (edge.cache.requests || 1), 0)}
                />
                <Stat label="Served/s" value={formatBytes(edge.cache.bytes / 60)} />
                <Stat label="From cache" value={formatPercent(edge.cache.cachedBytes / (edge.cache.bytes || 1), 0)} />
                <Stat label="Lake today" value={edge.lakeToday ? formatBytes(edge.lakeToday.bytes) : undefined} />
                <Stat
                  label="Lake files today"
                  value={edge.lakeToday ? formatCompact(edge.lakeToday.requests) : undefined}
                />
                <Stat label="Lake now/s" value={formatBytes(edge.cache.lakeBytes / 60)} />
              </StatGroup>
            </Block>
          )}
          <Block title="Busiest endpoints on our server">
            {live && live.routes.length ? (
              <LiveRing label="Requests to our server by endpoint" slices={topSlices(live.routes, live.perSecond)} />
            ) : (
              <Empty />
            )}
          </Block>
          <Block title="Busiest Cloudflare data centers">
            {live && edges.length ? (
              <LiveRing
                label="Requests to our server by the players' Cloudflare data center"
                slices={topSlices(edges, live.perSecond)}
              />
            ) : (
              <Empty />
            )}
          </Block>
        </Stack>
      </PanelBody>
    </Panel>
  );
}
