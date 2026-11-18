import { useEffect, useRef } from "react";

import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { ChartOverlay, ChartOverlayItem, ChartStage } from "~/components/patterns/charts/ChartOverlay";
import { ChartZoomControls, useChartZoom } from "~/components/patterns/charts/ChartZoom";
import { LIVE_MAP_COLOR, resolveChartColors } from "~/components/patterns/charts/theme";
import { useElementSize } from "~/components/ui/hooks/use-element-size";
import { LiveMapRenderer } from "~/lib/live-requests/renderer";
import type { LiveListener } from "~/lib/live-requests/useLiveRequests";
import { cn } from "~/lib/utils";

interface LiveRequestMapProps extends React.ComponentProps<"div"> {
  /** Hands the feed to the map; returns the unsubscribe. From `useLiveRequests`. */
  subscribe?: (listener: LiveListener) => () => void;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * The world, Cloudflare's data centers and our server, with every request drawn as it happens. One for our server
 * travels from the client to its Cloudflare edge, on to the data center that hands it to us and to our server, and its
 * response back the same way, colored by its status. One Cloudflare answers itself (an API cache hit, the website, an
 * asset) bounces off the client's edge. With reduced motion nothing travels: a dot where each request came from fades.
 * The wheel, a pinch, a double click or the buttons zoom in on a region, and a drag pans it.
 */
export function LiveRequestMap({ subscribe, className, ...props }: LiveRequestMapProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const landRef = useRef<HTMLCanvasElement>(null);
  const trafficRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LiveMapRenderer | null>(null);
  const { width, height } = useElementSize(boxRef, { round: true });
  // The land is a 1° grid of dots: past 4× it falls apart into blocks.
  const zoom = useChartZoom(trafficRef, { max: 4 });
  const { view } = zoom;

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
          {...zoom.targetProps}
          aria-label="World map of the live requests to deadlock-api.com: requests to the API travel from the player to a Cloudflare data center, on to our server in Helsinki and back; requests Cloudflare answers itself bounce off the player's data center"
          className={cn("absolute inset-0 size-full", zoom.targetProps.className)}
        />
      </div>
      <ChartOverlay position="top-end">
        <ChartZoomControls zoom={zoom} />
      </ChartOverlay>
      <ChartOverlay position="bottom-start">
        <ChartOverlayItem>
          <ChartLegend label="Map key" size="sm">
            <ChartLegendItem color={LIVE_MAP_COLOR.request} shape="dot">
              Request to our server
            </ChartLegendItem>
            <ChartLegendItem color={LIVE_MAP_COLOR.ok} shape="dot">
              Response
            </ChartLegendItem>
            <ChartLegendItem color={LIVE_MAP_COLOR.clientError} shape="dot">
              4xx
            </ChartLegendItem>
            <ChartLegendItem color={LIVE_MAP_COLOR.serverError} shape="dot">
              5xx
            </ChartLegendItem>
            <ChartLegendItem color={LIVE_MAP_COLOR.apiCache} shape="dot">
              API cache hit
            </ChartLegendItem>
            <ChartLegendItem color={LIVE_MAP_COLOR.website} shape="dot">
              Website
            </ChartLegendItem>
            <ChartLegendItem color={LIVE_MAP_COLOR.assets} shape="dot">
              Assets
            </ChartLegendItem>
            <ChartLegendItem color={LIVE_MAP_COLOR.lake} shape="dot">
              Data lake
            </ChartLegendItem>
            <ChartLegendItem color={LIVE_MAP_COLOR.other} shape="dot">
              Other
            </ChartLegendItem>
            <ChartLegendItem color={LIVE_MAP_COLOR.origin} shape="dot">
              Our server
            </ChartLegendItem>
          </ChartLegend>
        </ChartOverlayItem>
      </ChartOverlay>
    </ChartStage>
  );
}
