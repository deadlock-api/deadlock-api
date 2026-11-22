import { useEffect, useRef } from "react";

import { mergeChartTargetProps } from "~/components/patterns/charts/chart-target";
import { ChartLegend, ChartLegendToggle } from "~/components/patterns/charts/ChartLegend";
import { ChartOverlay, ChartOverlayItem, ChartStage } from "~/components/patterns/charts/ChartOverlay";
import { ChartProbeCard, type ChartProbePoint, useChartProbe } from "~/components/patterns/charts/ChartProbe";
import { ChartZoomControls, useChartZoom } from "~/components/patterns/charts/ChartZoom";
import { LIVE_MAP_COLOR, resolveChartColors } from "~/components/patterns/charts/theme";
import { useSeriesFilter } from "~/components/patterns/charts/useSeriesFilter";
import { useElementSize } from "~/components/ui/hooks/use-element-size";
import { TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { type EdgeMinute, placeAt } from "~/lib/live-requests/feed";
import { type LiveMapLayer, LiveMapRenderer } from "~/lib/live-requests/renderer";
import type { LiveListener, LiveStats } from "~/lib/live-requests/useLiveRequests";
import { cn } from "~/lib/utils";

import { markReading } from "./map-readings";

interface LiveRequestMapProps extends React.ComponentProps<"div"> {
  /** Hands the feed to the map; returns the unsubscribe. From `useLiveRequests`. */
  subscribe?: (listener: LiveListener) => () => void;
  /** The last minute's traffic, for the card of a probed mark. From `useLiveRequests`. */
  stats?: LiveStats | null;
  /** The newest minute Cloudflare answered itself, for the card of a probed data center. From `useLiveRequests`. */
  edge?: EdgeMinute | null;
}

/** The map's key, in drawing order; pressing entries shows only those (`useSeriesFilter`). */
const LAYERS: readonly [LiveMapLayer, string][] = [
  ["request", "Request to our server"],
  ["ok", "Response"],
  ["clientError", "4xx"],
  ["serverError", "5xx"],
  ["apiCache", "API cache hit"],
  ["website", "Website"],
  ["assets", "Assets"],
  ["lake", "Data lake"],
  ["other", "Other"],
  ["origin", "Our server"],
];

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * How far from a mark, in CSS pixels, the probe still names it: the marks are a few pixels wide, so the reach is their
 * hit area (24px across for a mouse, more for a finger), and a keyboard probe, which steps a 32nd of the map, reaches
 * about half a step.
 */
const REACH: Record<ChartProbePoint["source"], number> = { mouse: 12, touch: 24, keyboard: 32 };

/**
 * The world, Cloudflare's data centers and our server, with every request drawn as it happens. One for our server
 * travels from the client to its Cloudflare edge, on to the data center that hands it to us and to our server, and its
 * response back the same way, colored by its status. One Cloudflare answers itself (an API cache hit, the website, an
 * asset) bounces off the client's edge. With reduced motion nothing travels: a dot where each request came from fades.
 * The wheel, a pinch, a double click or the buttons zoom in on a region, and a drag pans it. Hovering, tapping or
 * stepping the probe onto a data center or our server names it, with its traffic of the last minute. Pressing entries
 * of the key draws only those kinds.
 */
export function LiveRequestMap({ subscribe, stats = null, edge = null, className, ...props }: LiveRequestMapProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const landRef = useRef<HTMLCanvasElement>(null);
  const trafficRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LiveMapRenderer | null>(null);
  const { width, height } = useElementSize(boxRef, { round: true });
  // The land is a 1° grid of dots: past 4× it falls apart into blocks.
  const zoom = useChartZoom(trafficRef, { max: 4 });
  const { view } = zoom;
  const probe = useChartProbe(boxRef);
  const filter = useSeriesFilter<LiveMapLayer>();
  const { shown } = filter;
  const place = probe.point
    ? placeAt(
        { width, height },
        view,
        { x: probe.point.rel.x * width, y: probe.point.rel.y * height },
        REACH[probe.point.source],
      )
    : null;
  const reading = place && markReading(place, stats, edge);
  const targetProps = mergeChartTargetProps(zoom.targetProps, probe.targetProps);

  useEffect(() => {
    const land = landRef.current;
    const traffic = trafficRef.current;
    if (!land || !traffic) return;
    const motion = window.matchMedia(REDUCED_MOTION);
    const renderer = new LiveMapRenderer(land, traffic, resolveChartColors(traffic, LIVE_MAP_COLOR), motion.matches);
    rendererRef.current = renderer;
    const onMotion = () => renderer.setStill(motion.matches);
    motion.addEventListener("change", onMotion);
    return () => {
      motion.removeEventListener("change", onMotion);
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (width > 0 && height > 0) rendererRef.current?.resize(width, height);
  }, [width, height]);

  useEffect(() => {
    rendererRef.current?.setView(view);
  }, [view]);

  useEffect(() => {
    rendererRef.current?.setShown(shown);
  }, [shown]);

  useEffect(
    () =>
      subscribe?.({
        onBatch: (batch) => rendererRef.current?.push(batch),
        onEdgeMinute: (minute) => rendererRef.current?.setEdgeMinute(minute),
      }),
    [subscribe],
  );

  return (
    <ChartStage className={cn("min-h-64", className)} {...props}>
      <div ref={boxRef} className="absolute inset-0">
        <canvas ref={landRef} aria-hidden="true" className="absolute inset-0 size-full" />
        {/* Browsers expose a named canvas as an image, so it takes no role of its own. */}
        <canvas
          ref={trafficRef}
          {...targetProps}
          aria-label="World map of the live requests to deadlock-api.com: requests to the API travel from the player to a Cloudflare data center, on to our server in Helsinki and back; requests Cloudflare answers itself bounce off the player's data center"
          className={cn("absolute inset-0 size-full", targetProps.className)}
        />
        <ChartProbeCard
          point={probe.point}
          announce={
            reading
              ? [reading.title, reading.subtitle, ...reading.rows.map((row) => `${row.label} ${row.value}`)]
                  .filter(Boolean)
                  .join(", ")
              : "Nothing here"
          }
        >
          {reading && (
            <>
              <TooltipHeader title={reading.title} subtitle={reading.subtitle} />
              {reading.rows.length > 0 && (
                <TooltipStats>
                  {reading.rows.map((row) => (
                    <TooltipStat key={row.label} label={row.label} value={row.value} />
                  ))}
                </TooltipStats>
              )}
            </>
          )}
        </ChartProbeCard>
      </div>
      <ChartOverlay position="top-end">
        <ChartZoomControls zoom={zoom} />
      </ChartOverlay>
      <ChartOverlay position="bottom-start">
        <ChartOverlayItem>
          <ChartLegend label="Show on the map" size="sm">
            {LAYERS.map(([layer, label]) => (
              <ChartLegendToggle key={layer} color={LIVE_MAP_COLOR[layer]} shape="dot" {...filter.toggleProps(layer)}>
                {label}
              </ChartLegendToggle>
            ))}
          </ChartLegend>
        </ChartOverlayItem>
      </ChartOverlay>
    </ChartStage>
  );
}
