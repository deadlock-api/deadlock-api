import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { API_ORIGIN } from "~/lib/constants";

import { coloCity, type EdgeMinute, type LiveBatch, type LiveQueue, parseMessage } from "./feed";

export const LIVE_REQUESTS_URL = `${API_ORIGIN}/v1/info/live-requests`;

/**
 * - `connecting`: opening the stream, or reconnecting after it dropped.
 * - `live`: batches are arriving.
 * - `paused`: the tab is hidden, so the stream is closed until it is shown again.
 * - `error`: the API refused the stream (too many viewers, rate limited); `retry` opens it again.
 */
export type LiveFeedStatus = "connecting" | "live" | "paused" | "error";

export interface LiveShare {
  key: string;
  label: string;
  /** Share of the sampled requests, 0 to 1. */
  share: number;
}

export interface LiveQueuePoint extends LiveQueue {
  /** Unix time of the batch, in milliseconds. */
  time: number;
}

export interface LiveLatency {
  p50: number;
  p90: number;
  p99: number;
}

/** How a set of requests went: rate, speed, failures and what they asked for. */
export interface LiveSummary {
  /** Requests per second, sampled or not. */
  perSecond: number;
  /** Database rows read per second. */
  rowsPerSecond: number;
  /** Durations of the sampled requests at the 50th, 90th and 99th percentile, in milliseconds. */
  latency: LiveLatency | null;
  /** Share of the sampled requests the server failed (5xx). A 4xx is the client's, not an error. */
  errorShare: number | null;
  routes: LiveShare[];
}

export interface LiveStats extends LiveSummary {
  /** Database bytes read per second. */
  bytesPerSecond: number;
  /** Every data center that served a sampled request, busiest first. */
  edges: LiveShare[];
  /** What the server is working on now; null before the first batch. */
  queue: LiveQueue | null;
  /** The queue at every batch of the last minute, oldest first. */
  queueHistory: LiveQueuePoint[];
}

/** The stats and the queue history cover a minute: 120 batches of half a second. */
const WINDOW_BATCHES = 120;
const HISTORY_BATCHES = 120;
const TOP_ROUTES = 6;

interface Feed {
  batches: LiveBatch[];
}

const EMPTY_FEED: Feed = { batches: [] };

/** What a renderer gets: each batch of our server's requests, and each new minute of Cloudflare's (null: none). */
export interface LiveListener {
  onBatch: (batch: LiveBatch) => void;
  onEdgeMinute: (minute: EdgeMinute | null) => void;
}

function topShares(counts: Map<string, number>, total: number, label: (key: string) => string, top = Infinity) {
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([key, count]): LiveShare => ({ key, label: label(key), share: count / total }));
}

/** Summarizes the sampled requests of `batches`. Each sampled request stands for `total / sampled` of its batch. */
function summarize(batches: LiveBatch[]): LiveSummary {
  let perBatch = 0;
  let rows = 0;
  let failed = 0;
  let sampled = 0;
  // A typed array sorts numerically and fast: a minute of requests is ~15,000 durations, sorted twice a second.
  const durations = new Float64Array(batches.reduce((sum, b) => sum + b.requests.length, 0));
  const routes = new Map<string, number>();
  for (const batch of batches) {
    const weight = batch.requests.length ? batch.total / batch.requests.length : 0;
    for (const r of batch.requests) {
      perBatch += weight;
      rows += r.rowsRead * weight;
      durations[sampled++] = r.durationMs;
      if (r.status >= 500) failed++;
      routes.set(r.route, (routes.get(r.route) ?? 0) + 1);
    }
  }
  const seconds = batches.length / 2 || 1;
  durations.sort();
  return {
    perSecond: perBatch / seconds,
    rowsPerSecond: rows / seconds,
    // Nearest rank on the sorted durations.
    latency: sampled
      ? {
          p50: durations[Math.ceil(sampled * 0.5) - 1],
          p90: durations[Math.ceil(sampled * 0.9) - 1],
          p99: durations[Math.ceil(sampled * 0.99) - 1],
        }
      : null,
    errorShare: sampled ? failed / sampled : null,
    routes: sampled ? topShares(routes, sampled, (route) => route, TOP_ROUTES) : [],
  };
}

function liveStats({ batches }: Feed): LiveStats {
  const window = batches.slice(-WINDOW_BATCHES);
  const seconds = window.length / 2 || 1;
  const edges = new Map<string, number>();
  let sampled = 0;
  for (const batch of window) {
    for (const r of batch.requests) {
      sampled++;
      if (r.edge) edges.set(r.edge, (edges.get(r.edge) ?? 0) + 1);
    }
  }
  const summary = summarize(window);
  return {
    latency: summary.latency,
    errorShare: summary.errorShare,
    routes: summary.routes,
    // The totals cover every request, not only the sample.
    perSecond: window.reduce((sum, b) => sum + b.total, 0) / seconds,
    rowsPerSecond: window.reduce((sum, b) => sum + b.db.rowsRead, 0) / seconds,
    bytesPerSecond: window.reduce((sum, b) => sum + b.db.bytesRead, 0) / seconds,
    edges: sampled ? topShares(edges, sampled, coloCity) : [],
    queue: batches.at(-1)?.queue ?? null,
    queueHistory: batches.map((b) => Object.assign({ time: b.start }, b.queue)),
  };
}

/**
 * The API's live request feed. Holds the stream open only while the tab is visible. `stats` updates with every batch
 * (twice a second), `edge` is the newest minute of the requests Cloudflare answered itself, and `subscribe` hands
 * both to a renderer (the map) without rendering React.
 */
export function useLiveRequests() {
  const [status, setStatus] = useState<LiveFeedStatus>("connecting");
  const [feed, setFeed] = useState<Feed>(EMPTY_FEED);
  const listeners = useRef(new Set<LiveListener>());
  const [edge, setEdge] = useState<EdgeMinute | null>(null);
  const edgeRef = useRef<EdgeMinute | null>(null);
  const reopen = useRef<() => void>(() => {});

  useEffect(() => {
    let source: EventSource | null = null;

    const publishEdge = (minute: EdgeMinute | null) => {
      edgeRef.current = minute;
      setEdge(minute);
      for (const listener of listeners.current) listener.onEdgeMinute(minute);
    };
    const close = () => {
      source?.close();
      source = null;
      // Without the stream there is nothing current to play out.
      publishEdge(null);
    };
    const open = () => {
      if (source) return;
      setStatus("connecting");
      source = new EventSource(LIVE_REQUESTS_URL);
      source.onmessage = (event: MessageEvent<string>) => {
        const message = parseMessage(event.data);
        if (message.edge) publishEdge(message.edge);
        const batch = message.batch;
        if (!batch) return;
        setStatus("live");
        setFeed((prev) => ({ batches: [...prev.batches.slice(1 - HISTORY_BATCHES), batch] }));
        for (const listener of listeners.current) listener.onBatch(batch);
      };
      source.onerror = () => {
        // A dropped stream reconnects by itself (CONNECTING); a refused one (an error status) stays CLOSED.
        if (source?.readyState === EventSource.CLOSED) {
          close();
          setStatus("error");
        } else {
          setStatus("connecting");
        }
      };
    };
    const onVisibility = () => {
      if (document.hidden) {
        close();
        setStatus("paused");
      } else {
        open();
      }
    };

    reopen.current = () => {
      close();
      open();
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      close();
    };
  }, []);

  const stats = useMemo(() => liveStats(feed), [feed]);

  const subscribe = useCallback((listener: LiveListener) => {
    listeners.current.add(listener);
    listener.onEdgeMinute(edgeRef.current);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const retry = useCallback(() => reopen.current(), []);

  return { status, stats, edge, subscribe, retry };
}
