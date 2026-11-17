import { useEffect, useState } from "react";

import type { IngestedMatch, IngestEntry, IngestFlush } from "./feed";
import { regionArea, WORLD_AREAS, type WorldArea } from "./server-regions";
import type { LiveListener } from "./useLiveRequests";

/**
 * The worker writes about once a minute, so a flush's sample plays out until a minute after it was written, when the
 * next one lands: a steady stream about a minute behind instead of a burst a minute.
 */
const PLAYOUT_MS = 60_000;
/** A flush that arrives late (the newest one, on connect) still plays out over at least this long. */
const MIN_PLAYOUT_MS = 10_000;
/** How often due matches are released and the clock moves. */
const STEP_MS = 200;
/** Matches the list keeps; the oldest leave at the bottom. */
const MAX_ROWS = 40;
/** Flushes the rate and the chart cover: about half an hour. */
const MAX_FLUSHES = 30;
/** A match that ended within this long is "fresh"; older ones come from uploaded history. */
const FRESH_MS = 24 * 60 * 60 * 1000;

/** A match as the list shows it. */
export interface ShownMatch extends IngestedMatch {
  /** Unique across flushes, for React keys. */
  key: string;
  /** When it ended, unix ms. */
  endedAt: number;
}

export interface IngestFeed {
  /** The newest matches first. */
  matches: ShownMatch[];
  /** The flushes seen, oldest first, at most half an hour of them. */
  flushes: IngestFlush[];
  /** Matches written per minute over `flushes`; null before there are two of them. */
  perMinute: number | null;
  /** Matches written since the page opened, counting up as their sample plays out. */
  counted: number;
  /** Matches shown so far, by the part of the world their server is in (plus unknown). */
  areas: Record<WorldArea | "unknown", number>;
  /** Share of the matches shown so far that ended within a day; null before the first. */
  freshShare: number | null;
  /** The clock the ages are measured against, unix ms; null before the first flush (and on the server). */
  now: number | null;
}

const NO_AREAS = Object.fromEntries([...WORLD_AREAS, "unknown"].map((area) => [area, 0])) as IngestFeed["areas"];

const EMPTY: IngestFeed = {
  matches: [],
  flushes: [],
  perMinute: null,
  counted: 0,
  areas: NO_AREAS,
  freshShare: null,
  now: null,
};

interface Due {
  match: ShownMatch;
  at: number;
  /** Written matches this one stands for: the flush's total over its sample. */
  weight: number;
}

/** Matches per minute over the flushes: everything after the first, over the time since it. */
function perMinute(flushes: IngestFlush[]): number | null {
  if (flushes.length < 2) return null;
  const minutes = (flushes[flushes.length - 1].at - flushes[0].at) / 60_000;
  if (minutes <= 0) return null;
  return flushes.slice(1).reduce((sum, flush) => sum + flush.total, 0) / minutes;
}

function withFlush(flushes: IngestFlush[], flush: IngestFlush): IngestFlush[] {
  if (flushes.some((f) => f.at === flush.at)) return flushes;
  return [...flushes, flush].sort((a, b) => a.at - b.at).slice(-MAX_FLUSHES);
}

/**
 * The matches the ingest worker writes, played out as a stream: each flush's sample is spread over the minute until
 * the next one. Hand it the live feed's `subscribe`.
 */
export function useIngestFeed(subscribe: (listener: LiveListener) => () => void): IngestFeed {
  const [feed, setFeed] = useState<IngestFeed>(EMPTY);

  useEffect(() => {
    // The feed lives here and React gets each new version: the counters below are not React state.
    let state = EMPTY;
    const publish = (next: IngestFeed) => {
      state = next;
      setFeed(next);
    };
    const queue: Due[] = [];
    const seen = new Set<number>();
    let shown = 0;
    let fresh = 0;

    const release = (now: number, all = false) => {
      queue.sort((a, b) => a.at - b.at);
      const firstLater = all ? -1 : queue.findIndex((d) => d.at > now);
      const count = firstLater === -1 ? queue.length : firstLater;
      if (!count) {
        if (state.now !== null) publish({ ...state, now });
        return;
      }
      const due = queue.splice(0, count);
      const areas = { ...state.areas };
      let counted = state.counted;
      for (const { match, weight } of due) {
        const area = match.region ? regionArea(match.region) : null;
        areas[area ?? "unknown"]++;
        counted += weight;
        shown++;
        if (now - match.endedAt < FRESH_MS) fresh++;
      }
      const newest = due.map((d) => d.match).reverse();
      publish({
        ...state,
        matches: [...newest, ...state.matches].slice(0, MAX_ROWS),
        counted,
        areas,
        freshShare: shown ? fresh / shown : null,
        now,
      });
    };

    const onIngest = (entry: IngestEntry) => {
      if (seen.has(entry.at)) return;
      seen.add(entry.at);
      const now = Date.now();
      // What is left of the last flush shows at once: the new one takes the stage.
      if (queue.length) release(now, true);
      const until = Math.max(entry.at + PLAYOUT_MS, now + MIN_PLAYOUT_MS);
      const step = entry.matches.length ? (until - now) / entry.matches.length : 0;
      const weight = entry.matches.length ? entry.total / entry.matches.length : 0;
      entry.matches.forEach((match, i) => {
        queue.push({
          match: {
            ...match,
            key: `${entry.at}-${match.matchId}`,
            endedAt: (match.startTime + match.durationS) * 1000,
          },
          at: now + i * step,
          weight,
        });
      });
      const flushes = withFlush(state.flushes, { at: entry.at, total: entry.total });
      publish({ ...state, flushes, perMinute: perMinute(flushes), now: state.now ?? now });
    };

    const onIngestHistory = (history: IngestFlush[]) => {
      const flushes = history.reduce(withFlush, state.flushes);
      publish({ ...state, flushes, perMinute: perMinute(flushes) });
    };

    const unsubscribe = subscribe({ onIngest, onIngestHistory });
    const timer = window.setInterval(() => release(Date.now()), STEP_MS);
    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [subscribe]);

  return feed;
}
